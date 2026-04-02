<script setup lang="ts">
  import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
  import { useIrcStore } from '@/stores/irc.ts';
  import { useServerSettingsStore } from '@/stores/server-settings.ts';
  import { useUserPrefsStore } from '@/stores/user-prefs.ts';
  import { hasFormatting } from '@/utils/mirc-format.ts';
  import MessageItem from './MessageItem.vue';
  import UserContextMenu from '@/components/ui/UserContextMenu.vue';
  import ForwardMenu from './ForwardMenu.vue';
  import config from '@/config.ts';
  import { i18n } from '@/i18n/index.ts';
  import type { ChatMessage, UserClickPayload, UserMode } from '@/types.ts';

  const t = i18n.global.t;

  /** Pre-computed i18n strings — avoids reactive $t() calls inside v-for loops. */
  const I18N = {
    noMessages: t('chat.noMessages'),
    messagesWillAppear: t('chat.messagesWillAppear'),
    selectChannelToStart: t('chat.selectChannelToStart'),
    forwardMessage: t('tooltips.forwardMessage'),
    scrollToBottom: t('chat.scrollToBottom'),
  };

  /** A group of consecutive messages from the same user, or a single system message. */
  interface MessageGroup {
    id: string;
    type: 'user' | 'system';
    nick: string;
    own: boolean;
    messages: ChatMessage[];
  }

  /** Group consecutive user messages from the same nick within the time interval. */
  function buildGroups(messages: ChatMessage[]): MessageGroup[] {
    const groups: MessageGroup[] = [];
    for (const msg of messages) {
      const isUserMsg = msg.type === 'message';
      const last = groups[groups.length - 1];
      if (
        isUserMsg &&
        last &&
        last.type === 'user' &&
        last.nick === msg.nick &&
        last.own === !!msg.own
      ) {
        const prevTs = last.messages[last.messages.length - 1].timestamp.getTime();
        const gap = msg.timestamp.getTime() - prevTs;
        if (gap < config.chat.groupingInterval) {
          last.messages.push(msg);
          continue;
        }
      }
      groups.push({
        id: msg.id,
        type: isUserMsg ? 'user' : 'system',
        nick: msg.nick,
        own: !!msg.own,
        messages: [msg],
      });
    }
    return groups;
  }

  const store = useIrcStore();
  const settingsStore = useServerSettingsStore();
  const userPrefs = useUserPrefsStore();
  const scrollContainer = ref<HTMLElement | null>(null);
  /** Refs for each channel's content div, keyed by channel key. */
  const channelDivs: Record<string, HTMLElement> = {};

  /** Whether mIRC formatting is enabled for a channel's server. Checks if any message has formatting. */
  function isMircEnabled(key: string): boolean {
    const serverId = key.split(':')[0];
    const msgs = store.messages[key] || [];
    const detected = msgs.some((m) => hasFormatting(m.content));
    return settingsStore.isMircEnabled(serverId, detected);
  }

  /** Whether image previews are hidden for a given nick on a server. */
  function isPreviewHidden(serverId: string, nick: string): boolean {
    return userPrefs.isPreviewHidden(serverId, nick);
  }

  // Context menu state
  const menuOpen = ref(false);
  const menuNick = ref('');
  const menuMode = ref<UserMode>('');
  const menuServerId = ref('');
  const menuX = ref(0);
  const menuY = ref(0);

  // Forward menu state
  const forwardOpen = ref(false);
  const forwardContent = ref('');
  const forwardX = ref(0);
  const forwardY = ref(0);

  function onForward(payload: { content: string; x: number; y: number }) {
    forwardContent.value = payload.content;
    forwardX.value = payload.x;
    forwardY.value = payload.y;
    forwardOpen.value = true;
  }

  /** Whether to show the "scroll to bottom" button. */
  const showScrollBtn = ref(false);

  /**
   * Auto-scroll mode: when true, any new content (message, image load) scrolls to bottom.
   * Activates when user is near bottom. Deactivates when user scrolls up.
   */
  let autoScroll = true;

  /** Saved scroll positions per channel key. */
  const scrollPositions: Record<string, number> = {};

  /** Suppress onScroll mark-as-read during channel switch. */
  let suppressMarkRead = false;

  /**
   * Handle user-click from a MessageItem.
   * @param {{ nick: string, serverId: string, x: number, y: number }} payload
   */
  function onUserClick(payload: UserClickPayload) {
    menuNick.value = payload.nick;
    menuMode.value = payload.mode || '';
    menuServerId.value = payload.serverId;
    menuX.value = payload.x;
    menuY.value = payload.y;
    menuOpen.value = true;
  }

  /**
   * Handle "Open conversation" from context menu.
   * @param {{ nick: string, serverId: string }} payload
   */
  function onOpenDM({ nick, serverId }: { nick: string; serverId: string }) {
    store.openDM(serverId, nick);
  }

  /** Current channel key. */
  const selectedKey = computed(() => {
    if (!store.selectedServerId || !store.selectedChannel) return null;
    return `${store.selectedServerId}:${store.selectedChannel}`;
  });

  /** All channel keys that have messages. */
  const messageKeys = computed(() => Object.keys(store.messages));

  /**
   * Grouped messages per channel key.
   * Uses a manual cache to avoid recomputing all channels when one channel changes.
   */
  const groupCache: Record<string, { length: number; groups: MessageGroup[] }> = {};

  // Clean up stale entries when channels are removed
  watch(messageKeys, (keys) => {
    const keySet = new Set(keys);
    for (const k of Object.keys(groupCache)) {
      if (!keySet.has(k)) delete groupCache[k];
    }
    for (const k of Object.keys(scrollPositions)) {
      if (!keySet.has(k)) delete scrollPositions[k];
    }
    for (const k of Object.keys(channelDivs)) {
      if (!keySet.has(k)) delete channelDivs[k];
    }
  });

  function getGroups(key: string): MessageGroup[] {
    const msgs = store.messages[key];
    if (!msgs) return [];
    const cached = groupCache[key];
    if (cached && cached.length === msgs.length) return cached.groups;
    const groups = buildGroups(msgs);
    groupCache[key] = { length: msgs.length, groups };
    return groups;
  }

  /**
   * Check if the user is scrolled near the bottom (within 150px).
   * @returns {boolean}
   */
  function isNearBottom() {
    const el = scrollContainer.value;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 150;
  }

  /** Scroll to bottom. */
  function doScroll(behavior: 'auto' | 'smooth' = 'smooth') {
    nextTick(() => {
      const el = scrollContainer.value;
      if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior });
      }
    });
  }

  /**
   * Called when a MessageItem's IntersectionObserver fires (message becomes visible).
   * Updates the last-read timestamp for the channel.
   * @param {{ serverId: string, channel: string, timestamp: Date }} payload
   */
  function onMessageSeen(payload: { serverId: string; channel: string; timestamp: Date }) {
    if (suppressMarkRead) return;
    const ts =
      payload.timestamp instanceof Date
        ? payload.timestamp.getTime()
        : (payload.timestamp as unknown as number);
    store.markReadUpTo(payload.serverId, payload.channel, ts);
  }

  /** Mark all messages in current channel as read (used when scrolling to bottom). */
  function markAllCurrentAsRead() {
    if (!store.selectedServerId || !store.selectedChannel) return;
    store.markReadUpTo(store.selectedServerId, store.selectedChannel, Date.now());
  }

  /** Re-scroll when images load (if auto-scroll is active). */
  function onImageLoad() {
    if (autoScroll && !suppressMarkRead) {
      doScroll('smooth');
    }
  }

  /** On scroll (any source), update button visibility. */
  function onScroll() {
    const near = isNearBottom();
    showScrollBtn.value = !near;
    // When at bottom, mark everything as read
    if (near && !suppressMarkRead) {
      markAllCurrentAsRead();
    }
  }

  /**
   * User actively scrolled (wheel/touch). If they scroll away from bottom,
   * disable auto-scroll. If they scroll back to bottom, re-enable it.
   */
  function onUserScroll() {
    requestAnimationFrame(() => {
      autoScroll = isNearBottom();
    });
  }

  /** Scroll to bottom, re-enable auto-scroll, and mark as read. */
  function scrollToBottom() {
    autoScroll = true;
    doScroll('smooth');
    markAllCurrentAsRead();
    showScrollBtn.value = false;
  }

  /**
   * MutationObserver to detect DOM changes that affect scrollHeight.
   */
  let mutationObserver: MutationObserver | null = null;
  let lastScrollHeight = 0;

  /** Reconnect the MutationObserver to the active channel's div only. */
  function reconnectObserver() {
    if (mutationObserver) mutationObserver.disconnect();
    const key = selectedKey.value;
    const target = key ? channelDivs[key] : null;
    if (target && mutationObserver) {
      lastScrollHeight = scrollContainer.value?.scrollHeight || 0;
      mutationObserver.observe(target, { childList: true });
    }
  }

  /** Check if scrollHeight changed and re-scroll if in auto mode. Debounced to avoid layout thrashing. */
  let scrollCheckTimer: ReturnType<typeof setTimeout> | null = null;
  function checkScrollHeightChange() {
    if (scrollCheckTimer) return;
    scrollCheckTimer = setTimeout(() => {
      scrollCheckTimer = null;
      const el = scrollContainer.value;
      if (!el || !autoScroll || suppressMarkRead) return;
      if (el.scrollHeight !== lastScrollHeight) {
        lastScrollHeight = el.scrollHeight;
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      }
    }, 50);
  }

  /** Re-scroll after CSS animation completes + remove animation class to prevent replay. */
  let animationScrollTimer: ReturnType<typeof setTimeout> | null = null;
  function onAnimationEnd(e: AnimationEvent) {
    if (e.animationName === 'preview-appear') {
      (e.target as HTMLElement).classList.remove('animate-preview');
      // Debounce: multiple images may animate simultaneously, scroll once at the end
      if (autoScroll && !suppressMarkRead && !animationScrollTimer) {
        animationScrollTimer = setTimeout(() => {
          animationScrollTimer = null;
          doScroll('smooth');
        }, 100);
      }
    }
  }

  /** Handle delegated clicks on data-action links inside v-html content. */
  function onActionClick(e: Event) {
    const link = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!link) return;
    e.preventDefault();
    if (link.dataset.action === 'open-blocked-settings' && store.selectedServerId) {
      store.requestOpenSettings(store.selectedServerId, 'blocked');
    }
  }

  onMounted(() => {
    const el = scrollContainer.value;
    if (el) {
      el.addEventListener('load', onImageLoad, true);
      el.addEventListener('scroll', onScroll, { passive: true });
      el.addEventListener('wheel', onUserScroll, { passive: true });
      el.addEventListener('touchstart', onUserScroll, { passive: true });
      el.addEventListener('animationend', onAnimationEnd, true);
      el.addEventListener('click', onActionClick);
      lastScrollHeight = el.scrollHeight;
      mutationObserver = new MutationObserver(() => checkScrollHeightChange());
      // Observer is connected per-channel via reconnectObserver(), not on the entire container
      reconnectObserver();
    }
  });

  onUnmounted(() => {
    const el = scrollContainer.value;
    if (el) {
      el.removeEventListener('load', onImageLoad, true);
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('wheel', onUserScroll);
      el.removeEventListener('touchstart', onUserScroll);
      el.removeEventListener('animationend', onAnimationEnd, true);
      el.removeEventListener('click', onActionClick);
    }
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }
  });

  // When new messages arrive in the current channel
  watch(
    () => store.currentMessages.length,
    () => {
      if (autoScroll) {
        doScroll('smooth');
      }
    },
  );

  // When switching channels: save scroll, restore new channel's scroll, reconnect observer
  watch(selectedKey, (newKey, oldKey) => {
    const el = scrollContainer.value;

    // Save scroll position of the channel we're leaving
    if (oldKey && el) {
      scrollPositions[oldKey] = el.scrollTop;
    }

    if (!newKey) return;

    // Reconnect MutationObserver to the new active channel's div
    reconnectObserver();

    nextTick(() => {
      if (!el) return;
      suppressMarkRead = true;
      // Allow marking as read again after DOM settles
      setTimeout(() => {
        suppressMarkRead = false;
      }, 200);
      const saved = scrollPositions[newKey];
      if (saved !== undefined) {
        // Restore saved position and auto-scroll state
        el.scrollTo({ top: saved, behavior: 'instant' });
        autoScroll = isNearBottom();
        showScrollBtn.value = !autoScroll;
      } else {
        // New channel — scroll to bottom, enable auto-scroll
        autoScroll = true;
        showScrollBtn.value = false;
        el.scrollTo({ top: el.scrollHeight, behavior: 'instant' });
      }
      // If content doesn't overflow (few messages), mark all as read
      if (el.scrollHeight <= el.clientHeight) {
        markAllCurrentAsRead();
      } else if (!saved) {
        markAllCurrentAsRead();
      }
    });
  });
</script>

<template>
  <div
    ref="scrollContainer"
    class="flex-1 overflow-y-auto bg-white py-4 pr-6 [overflow-x:clip]"
  >
    <!-- Empty state -->
    <div
      v-if="!selectedKey || store.currentMessages.length === 0"
      v-show="!selectedKey || store.currentMessages.length === 0"
      class="flex h-full flex-col items-center justify-center text-slate-300"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="1"
        stroke="currentColor"
        class="mb-3 h-16 w-16"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
        />
      </svg>
      <p class="text-sm">{{ I18N.noMessages }}</p>
      <p class="mt-1 text-xs text-slate-400">
        {{
          store.selectedChannel ? I18N.messagesWillAppear : I18N.selectChannelToStart
        }}
      </p>
    </div>

    <!--
      All channels rendered simultaneously, only the selected one is visible.
      Keeps MessageItem components alive so previews survive channel switches.
    -->
    <div
      v-for="key in messageKeys"
      v-show="key === selectedKey"
      :key="key"
      :ref="
        (el: any) => {
          if (el) channelDivs[key] = el;
        }
      "
      class="flex flex-col"
    >
      <template
        v-for="group in getGroups(key)"
        :key="group.id"
      >
        <!-- System messages: render individually -->
        <template v-if="group.type === 'system'">
          <MessageItem
            v-for="msg in group.messages"
            :key="msg.id"
            :message="msg"
            :active="key === selectedKey"
            :mirc-enabled="isMircEnabled(key)"
            :preview-hidden="isPreviewHidden(msg.serverId, msg.nick)"
            @message-seen="onMessageSeen"
          />
        </template>

        <!-- User message group: shared bubble wrapper -->
        <div
          v-else
          class="flex gap-3 py-1.5 pl-6"
          :class="group.own ? 'flex-row-reverse pr-6' : 'flex-row'"
        >
          <!-- Avatar -->
          <div
            class="flex h-8 w-8 shrink-0 items-center justify-center self-start rounded-full text-xs font-bold"
            :class="[
              group.own ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600',
              !group.own ? 'cursor-pointer' : '',
            ]"
            @click="
              !group.own &&
              onUserClick({
                nick: group.nick,
                serverId: group.messages[0].serverId,
                x: $event.clientX,
                y: $event.clientY,
              })
            "
          >
            {{ (group.nick || '?')[0].toUpperCase() }}
          </div>

          <!-- Content column -->
          <div
            class="flex max-w-[75%] flex-col gap-1"
            :class="group.own ? 'items-end' : 'items-start'"
          >
            <!-- Nick -->
            <span
              v-if="!group.own"
              class="cursor-pointer text-xs font-semibold text-slate-500 hover:text-slate-700"
              @click="
                onUserClick({
                  nick: group.nick,
                  serverId: group.messages[0].serverId,
                  x: $event.clientX,
                  y: $event.clientY,
                })
              "
            >
              {{ group.nick }}
            </span>

            <!-- Single bubble wrapping all messages in the group -->
            <div
              class="rounded-2xl py-2 text-sm leading-relaxed"
              :class="[
                group.own
                  ? group.messages.some((m) => m.warning)
                    ? 'bg-bubble-warning text-white rounded-tr-sm'
                    : 'bg-emerald-500 text-white rounded-tr-sm'
                  : 'bg-slate-100 text-slate-800 rounded-tl-sm',
              ]"
            >
              <div
                v-for="msg in group.messages"
                v-show="!userPrefs.isUserBlocked(msg.serverId, msg.nick)"
                :key="msg.id"
                class="group/fwd fwd-row relative"
              >
                <MessageItem
                  :message="msg"
                  :active="key === selectedKey"
                  :mirc-enabled="isMircEnabled(key)"
                  :preview-hidden="isPreviewHidden(msg.serverId, msg.nick)"
                  @message-seen="onMessageSeen"
                />
                <!-- Timestamp + Forward button (appear on hover) -->
                <div
                  class="absolute top-1.5 z-10 flex items-center gap-2 opacity-0 transition-opacity group-hover/fwd:opacity-100"
                  :class="[
                    group.own ? 'right-full mr-3 flex-row' : 'left-full ml-3 flex-row-reverse',
                  ]"
                >
                  <span class="mt-px whitespace-nowrap text-[10px] text-slate-300">
                    {{
                      new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    }}
                  </span>
                  <button
                    class="flex h-5 w-5 items-center justify-center rounded-full bg-white text-slate-400 shadow transition-colors hover:text-emerald-500"
                    :data-tooltip="I18N.forwardMessage"
                    data-tooltip-delay="300"
                    @click.stop="
                      onForward({ content: msg.content, x: $event.clientX, y: $event.clientY })
                    "
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      class="h-3 w-3"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M10.21 14.77a.75.75 0 0 1 .02-1.06L14.168 10 10.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
                        clip-rule="evenodd"
                      />
                      <path
                        fill-rule="evenodd"
                        d="M4.21 14.77a.75.75 0 0 1 .02-1.06L8.168 10 4.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
                        clip-rule="evenodd"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <!-- Timestamp (last message) -->
            <div class="flex items-center gap-1.5">
              <span class="text-[10px] text-slate-400">
                {{
                  new Date(group.messages[group.messages.length - 1].timestamp).toLocaleTimeString(
                    [],
                    { hour: '2-digit', minute: '2-digit', second: '2-digit' },
                  )
                }}
              </span>
              <span
                v-if="group.messages[group.messages.length - 1].warning"
                class="cursor-help text-amber-500"
                :title="group.messages[group.messages.length - 1].warning"
                >⚠</span
              >
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>

  <!-- Scroll to bottom button -->
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="translate-y-2 opacity-0"
    enter-to-class="translate-y-0 opacity-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="translate-y-0 opacity-100"
    leave-to-class="translate-y-2 opacity-0"
  >
    <button
      v-if="showScrollBtn"
      class="absolute bottom-24 right-5 flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white shadow-lg transition-colors hover:bg-slate-50"
      :title="I18N.scrollToBottom"
      @click="scrollToBottom"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        class="h-4 w-4 text-slate-500"
      >
        <path
          fill-rule="evenodd"
          d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
          clip-rule="evenodd"
        />
      </svg>
    </button>
  </Transition>

  <UserContextMenu
    :nick="menuNick"
    :mode="menuMode"
    :server-id="menuServerId"
    :x="menuX"
    :y="menuY"
    :open="menuOpen"
    @close="menuOpen = false"
    @open-dm="onOpenDM"
  />

  <ForwardMenu
    :content="forwardContent"
    :x="forwardX"
    :y="forwardY"
    :open="forwardOpen"
    @close="forwardOpen = false"
  />
</template>

<style scoped>
  /* Extend hover zone of each message row to full chat width.
     The ::before pseudo-element stretches horizontally to catch hover events
     across the entire chat area. pointer-events: auto ensures it receives hover. */
  .fwd-row::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: -100vw;
    right: -100vw;
    z-index: -1;
  }
</style>
