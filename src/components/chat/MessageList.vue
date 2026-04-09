<script setup lang="ts">
  import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
  import { useIrcStore } from '@/stores/irc.ts';
  import { useServerSettingsStore } from '@/stores/server-settings.ts';
  import { useUserPrefsStore } from '@/stores/user-prefs.ts';
  import { hasFormatting } from '@/utils/mirc-format.ts';
  import { setMentionContext } from '@/services/message.service.ts';
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

  /** Whether the user is "pinned" to the bottom (auto-scroll active). */
  let pinnedToBottom = true;

  /** Saved scroll positions per channel key. */
  const scrollPositions: Record<string, number> = {};

  /** ResizeObserver to detect content growth (images loading, previews expanding). */
  let resizeObserver: ResizeObserver | null = null;

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
  /** Cache key: last message ID + length (handles both append and trim). */
  const groupCache: Record<string, { lastId: string; length: number; groups: MessageGroup[] }> = {};

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

  /**
   * Get grouped messages for a channel, using a cache to avoid recomputing.
   * Cache invalidates when the last message ID or array length changes.
   * @param {string} key Channel key (serverId:channel)
   * @returns {MessageGroup[]} Grouped messages
   */
  function getGroups(key: string): MessageGroup[] {
    const msgs = store.messages[key];
    if (!msgs || msgs.length === 0) return [];
    const lastId = msgs[msgs.length - 1].id;
    const cached = groupCache[key];
    if (cached && cached.lastId === lastId && cached.length === msgs.length) return cached.groups;
    const groups = buildGroups(msgs);
    groupCache[key] = { lastId, length: msgs.length, groups };
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
   */
  function onMessageSeen(payload: { serverId: string; channel: string; timestamp: Date }) {
    const ts =
      payload.timestamp instanceof Date
        ? payload.timestamp.getTime()
        : (payload.timestamp as unknown as number);
    store.markReadUpTo(payload.serverId, payload.channel, ts);
  }

  /** Mark all messages in current channel as read. */
  function markAllCurrentAsRead() {
    if (!store.selectedServerId || !store.selectedChannel) return;
    store.markReadUpTo(store.selectedServerId, store.selectedChannel, Date.now());
  }

  /** Single scroll handler: update pinned state, button visibility, and mark-as-read. */
  function onScroll() {
    const near = isNearBottom();
    pinnedToBottom = near;
    showScrollBtn.value = !near;
    if (near) markAllCurrentAsRead();
  }

  /** Scroll to bottom, re-enable pinned mode, and mark as read. */
  function scrollToBottom() {
    pinnedToBottom = true;
    doScroll('smooth');
    markAllCurrentAsRead();
    showScrollBtn.value = false;
  }

  /** Remove animate-preview class to prevent replay on v-show toggle. */
  function onAnimationEnd(e: AnimationEvent) {
    if (e.animationName === 'preview-appear') {
      (e.target as HTMLElement).classList.remove('animate-preview');
    }
  }

  // ─── ResizeObserver: re-scroll when content grows (images load, previews expand) ──

  /**
   * Connect ResizeObserver to the active channel div to detect content size changes.
   * When pinned to bottom, instantly scrolls down when content grows.
   */
  function connectResizeObserver() {
    disconnectResizeObserver();
    const key = selectedKey.value;
    const target = key ? channelDivs[key] : null;
    const el = scrollContainer.value;
    if (!target || !el) return;
    resizeObserver = new ResizeObserver(() => {
      if (pinnedToBottom) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'instant' });
      }
    });
    resizeObserver.observe(target);
  }

  function disconnectResizeObserver() {
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
  }

  /** Handle delegated clicks on data-action, data-mention, data-channel inside v-html. */
  function onActionClick(e: Event) {
    const target = e.target as HTMLElement;

    // data-action links (e.g. "open-blocked-settings")
    const link = target.closest<HTMLElement>('[data-action]');
    if (link) {
      e.preventDefault();
      if (link.dataset.action === 'open-blocked-settings' && store.selectedServerId) {
        store.requestOpenSettings(store.selectedServerId, 'blocked');
      }
      return;
    }

    // Nick mentions — open context menu
    const mention = target.closest<HTMLElement>('[data-mention]');
    if (mention && store.selectedServerId) {
      e.preventDefault();
      onUserClick({
        nick: mention.dataset.mention!,
        serverId: store.selectedServerId,
        x: (e as MouseEvent).clientX,
        y: (e as MouseEvent).clientY,
      });
      return;
    }

    // Channel references — join or switch to channel
    const channel = target.closest<HTMLElement>('[data-channel]');
    if (channel && store.selectedServerId) {
      e.preventDefault();
      const name = channel.dataset.channel!;
      const serverId = store.selectedServerId;
      const joined = store.channels[serverId] || [];
      if (joined.includes(name)) {
        store.selectChannel(serverId, name);
      } else {
        store.joinChannel(serverId, name);
      }
    }
  }

  // ─── Non-reactive mention context ──────────────────────────────────────────
  // Plain variables updated by watchers. The callbacks passed to setMentionContext
  // only read these plain vars, so they never create reactive dependencies inside
  // MessageItem computed properties. This prevents mass re-evaluation of every
  // message when users join/part or channels change.
  let _mentionNicks: Set<string> = new Set();
  let _mentionChannels: Set<string> = new Set();

  watch(
    [selectedKey, () => store.users],
    () => {
      const key = selectedKey.value;
      if (key) {
        const list = store.users[key] || [];
        _mentionNicks = new Set(list.map((u) => u.nick));
      } else {
        _mentionNicks = new Set();
      }
    },
    { immediate: true },
  );

  watch(
    () => store.channels,
    () => {
      const all = new Set<string>();
      for (const serverId of Object.keys(store.channels)) {
        for (const ch of store.channels[serverId]) {
          if (ch !== '*status') all.add(ch);
        }
      }
      _mentionChannels = all;
    },
    { immediate: true, deep: true },
  );

  setMentionContext(
    () => _mentionNicks,
    () => _mentionChannels,
  );

  onMounted(() => {
    const el = scrollContainer.value;
    if (el) {
      el.addEventListener('scroll', onScroll, { passive: true });
      el.addEventListener('animationend', onAnimationEnd, true);
      el.addEventListener('click', onActionClick);
    }
    connectResizeObserver();
  });

  onUnmounted(() => {
    const el = scrollContainer.value;
    if (el) {
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('animationend', onAnimationEnd, true);
      el.removeEventListener('click', onActionClick);
    }
    disconnectResizeObserver();
  });

  // When new messages arrive in the current channel (use last ID, not length, because
  // length stays constant at maxMessages after trimming)
  watch(
    () => {
      const msgs = store.currentMessages;
      return msgs.length > 0 ? msgs[msgs.length - 1].id : null;
    },
    () => {
      if (pinnedToBottom) {
        doScroll('smooth');
      }
    },
  );

  // When switching channels: save scroll, restore new channel's scroll
  watch(selectedKey, (newKey, oldKey) => {
    const el = scrollContainer.value;

    // Save scroll position of the channel we're leaving
    if (oldKey && el) {
      scrollPositions[oldKey] = el.scrollTop;
    }

    if (!newKey) return;

    // Reconnect ResizeObserver to new channel div
    nextTick(() => connectResizeObserver());

    nextTick(() => {
      if (!el) return;
      const saved = scrollPositions[newKey];
      if (saved !== undefined) {
        el.scrollTo({ top: saved, behavior: 'instant' });
        pinnedToBottom = isNearBottom();
        showScrollBtn.value = !pinnedToBottom;
      } else {
        pinnedToBottom = true;
        showScrollBtn.value = false;
        el.scrollTo({ top: el.scrollHeight, behavior: 'instant' });
      }
      if (el.scrollHeight <= el.clientHeight || !saved) {
        markAllCurrentAsRead();
      }
    });
  });
</script>

<template>
  <div
    ref="scrollContainer"
    class="flex-1 overflow-x-hidden overflow-y-auto bg-white py-4 pr-6"
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
        {{ store.selectedChannel ? I18N.messagesWillAppear : I18N.selectChannelToStart }}
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
      class="flex flex-col scroll-anchor-none"
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
          class="group/fwd flex gap-3 py-1.5 pl-6"
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
                class="relative"
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

      <!-- Scroll anchor sentinel — overflow-anchor keeps this visible, pinning scroll to bottom -->
      <div class="scroll-anchor-sentinel" />
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
  /* Other people's bubbles: no underline, underline on hover */
  :deep(.bg-slate-100 .mention-channel) {
    color: var(--color-emerald-600);
  }
  :deep(.bg-slate-100 .mention-nick),
  :deep(.bg-slate-100 .mention-channel) {
    text-decoration: none;
  }
  :deep(.bg-slate-100 .mention-nick:hover),
  :deep(.bg-slate-100 .mention-channel:hover) {
    text-decoration: underline;
  }

  /* Own bubbles: underline by default, remove on hover */
  :deep(.bg-emerald-500 .mention-channel) {
    color: white;
  }
  :deep(.bg-emerald-500 .mention-nick),
  :deep(.bg-emerald-500 .mention-channel) {
    text-decoration: underline;
  }
  :deep(.bg-emerald-500 .mention-nick:hover),
  :deep(.bg-emerald-500 .mention-channel:hover) {
    text-decoration: none;
  }
</style>
