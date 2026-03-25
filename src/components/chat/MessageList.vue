<script setup>
  import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
  import { useIrcStore } from '@/stores/irc.js';
  import { useUserPrefsStore } from '@/stores/user-prefs.js';
  import MessageItem from './MessageItem.vue';
  import UserContextMenu from '@/components/ui/UserContextMenu.vue';

  const store = useIrcStore();
  const userPrefs = useUserPrefsStore();
  const scrollContainer = ref(null);

  // Context menu state
  const menuOpen = ref(false);
  const menuNick = ref('');
  const menuServerId = ref('');
  const menuX = ref(0);
  const menuY = ref(0);

  /** Whether to show the "scroll to bottom" button. */
  const showScrollBtn = ref(false);

  /** Saved scroll positions per channel key. */
  const scrollPositions = {};

  /** Previous channel key for saving scroll on switch. */
  let prevKey = null;

  /**
   * Handle user-click from a MessageItem.
   * @param {{ nick: string, serverId: string, x: number, y: number }} payload
   */
  function onUserClick(payload) {
    menuNick.value = payload.nick;
    menuServerId.value = payload.serverId;
    menuX.value = payload.x;
    menuY.value = payload.y;
    menuOpen.value = true;
  }

  /**
   * Handle "Open conversation" from context menu.
   * @param {{ nick: string, serverId: string }} payload
   */
  function onOpenDM({ nick, serverId }) {
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
   * Check if the user is scrolled near the bottom (within 150px).
   * @returns {boolean}
   */
  function isNearBottom() {
    const el = scrollContainer.value;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 150;
  }

  /** Scroll to bottom. */
  function doScroll(behavior = 'smooth') {
    nextTick(() => {
      const el = scrollContainer.value;
      if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior });
      }
    });
  }

  /** Mark current channel as read up to its message count. */
  function markCurrentAsRead() {
    if (!store.selectedServerId || !store.selectedChannel) return;
    const key = selectedKey.value;
    const msgs = store.messages[key];
    if (msgs) {
      store.markRead(store.selectedServerId, store.selectedChannel, msgs.length);
    }
  }

  /** Re-scroll when images load. */
  function onImageLoad() {
    if (isNearBottom()) {
      doScroll('instant');
      markCurrentAsRead();
    }
  }

  /** On user scroll, check if at bottom and mark as read. */
  function onScroll() {
    const near = isNearBottom();
    showScrollBtn.value = !near;
    if (near) {
      markCurrentAsRead();
    }
  }

  /** Scroll to bottom and mark as read. */
  function scrollToBottom() {
    doScroll('smooth');
    markCurrentAsRead();
    showScrollBtn.value = false;
  }

  onMounted(() => {
    const el = scrollContainer.value;
    if (el) {
      el.addEventListener('load', onImageLoad, true);
      el.addEventListener('scroll', onScroll, { passive: true });
    }
  });

  onUnmounted(() => {
    const el = scrollContainer.value;
    if (el) {
      el.removeEventListener('load', onImageLoad, true);
      el.removeEventListener('scroll', onScroll);
    }
  });

  // When new messages arrive in the current channel
  watch(
    () => store.currentMessages.length,
    () => {
      if (isNearBottom()) {
        doScroll('smooth');
        markCurrentAsRead();
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

    prevKey = newKey;

    if (!newKey) return;

    nextTick(() => {
      if (!el) return;
      const saved = scrollPositions[newKey];
      if (saved !== undefined) {
        // Restore saved position
        el.scrollTo({ top: saved, behavior: 'instant' });
      } else {
        // New channel — scroll to bottom and mark as read
        el.scrollTo({ top: el.scrollHeight, behavior: 'instant' });
        markCurrentAsRead();
      }
    });
  });
</script>

<template>
  <div
    ref="scrollContainer"
    class="flex-1 overflow-y-auto bg-white py-4 pr-6"
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
      <p class="text-sm">No messages yet</p>
      <p class="mt-1 text-xs text-slate-400">
        {{ store.selectedChannel ? 'Messages will appear here' : 'Select a channel to start' }}
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
      class="flex flex-col gap-0.5"
    >
      <MessageItem
        v-for="msg in store.messages[key]"
        v-show="!userPrefs.isUserHidden(msg.nick)"
        :key="msg.id"
        :message="msg"
        @user-click="onUserClick"
      />
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
      class="absolute bottom-24 right-8 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white shadow-lg transition-colors hover:bg-slate-50"
      title="Scroll to bottom"
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
    :server-id="menuServerId"
    :x="menuX"
    :y="menuY"
    :open="menuOpen"
    @close="menuOpen = false"
    @open-dm="onOpenDM"
  />
</template>
