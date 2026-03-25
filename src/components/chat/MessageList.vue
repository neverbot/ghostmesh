<script setup>
  import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
  import { useIrcStore } from '@/stores/irc.js';
  import { useUserPrefsStore } from '@/stores/user-prefs.js';
  import MessageItem from './MessageItem.vue';
  import UserContextMenu from '@/components/ui/UserContextMenu.vue';

  const store = useIrcStore();
  const userPrefs = useUserPrefsStore();
  const scrollContainer = ref(null);
  const scrollAnchor = ref(null);

  // Context menu state
  const menuOpen = ref(false);
  const menuNick = ref('');
  const menuServerId = ref('');
  const menuX = ref(0);
  const menuY = ref(0);

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

  /** Whether we should keep scrolling to bottom (set when a new message arrives near bottom). */
  let shouldStick = true;

  /**
   * Check if the user is scrolled near the bottom (within 150px).
   * @returns {boolean}
   */
  function isNearBottom() {
    const el = scrollContainer.value;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 150;
  }

  /** Scroll to bottom instantly. */
  function doScroll(behavior = 'smooth') {
    nextTick(() => {
      if (scrollAnchor.value) {
        scrollAnchor.value.scrollIntoView({ behavior });
      }
    });
  }

  /**
   * Re-scroll when images load (they change scrollHeight after the message was added).
   * Uses the saved `shouldStick` flag from when the message arrived.
   */
  function onImageLoad() {
    if (shouldStick) {
      doScroll('instant');
    }
  }

  onMounted(() => {
    scrollContainer.value?.addEventListener('load', onImageLoad, true);
  });

  onUnmounted(() => {
    scrollContainer.value?.removeEventListener('load', onImageLoad, true);
  });

  watch(
    () => store.currentMessages.length,
    () => {
      // Capture scroll position BEFORE Vue renders the new message
      shouldStick = isNearBottom();
      if (shouldStick) {
        doScroll('smooth');
      }
    },
  );

  watch(
    () => store.selectedChannel,
    () => {
      shouldStick = true;
      doScroll('instant');
    },
  );
</script>

<template>
  <div
    ref="scrollContainer"
    class="flex-1 overflow-y-auto bg-white py-4 pr-6"
  >
    <div
      v-if="store.currentMessages.length === 0"
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

    <div class="flex flex-col gap-0.5">
      <MessageItem
        v-for="msg in store.currentMessages"
        v-show="!userPrefs.isUserHidden(msg.nick)"
        :key="msg.id"
        :message="msg"
        @user-click="onUserClick"
      />
    </div>
    <div ref="scrollAnchor" />
  </div>

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
