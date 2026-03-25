<script setup>
  import { ref, computed, watch, nextTick } from 'vue';
  import { useUserPrefsStore } from '@/stores/user-prefs.js';
  import { useIrcStore } from '@/stores/irc.js';

  const props = defineProps({
    nick: { type: String, default: '' },
    serverId: { type: String, default: '' },
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    open: { type: Boolean, default: false },
  });

  const emit = defineEmits(['close', 'open-dm']);
  const prefs = useUserPrefsStore();
  const store = useIrcStore();

  /** Whether the context menu target is the current user. */
  const isSelf = computed(() => {
    const myNick = store.nicknamePerServer[props.serverId] || store.nickname;
    return props.nick?.toLowerCase() === myNick?.toLowerCase();
  });
  const menuEl = ref(null);
  const posX = ref(0);
  const posY = ref(0);

  // Position + clamp to viewport when opening
  watch(
    () => props.open,
    async (val) => {
      if (!val) return;
      posX.value = props.x;
      posY.value = props.y;
      await nextTick();
      if (!menuEl.value) return;
      const rect = menuEl.value.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (posX.value + rect.width > vw - 8) posX.value = vw - rect.width - 8;
      if (posY.value + rect.height > vh - 8) posY.value = vh - rect.height - 8;
      if (posX.value < 8) posX.value = 8;
      if (posY.value < 8) posY.value = 8;
    },
  );

  /** Close on click outside. */
  function onBackdropClick(e) {
    if (e.target === e.currentTarget) emit('close');
  }

  function openConversation() {
    emit('open-dm', { nick: props.nick, serverId: props.serverId });
    emit('close');
  }

  function togglePreviews() {
    prefs.togglePreviewHidden(props.serverId, props.nick);
    emit('close');
  }

  function toggleBlocked() {
    const wasBlocked = prefs.isUserBlocked(props.serverId, props.nick);
    prefs.toggleUserBlocked(props.serverId, props.nick);
    // When blocking a user, close any open DM channels with them
    if (!wasBlocked) {
      store.closeDMsWithUser(props.serverId, props.nick);
    }
    emit('close');
  }
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50"
      tabindex="0"
      @click="onBackdropClick"
      @keydown.escape="emit('close')"
    >
      <div
        ref="menuEl"
        class="fixed min-w-48 overflow-hidden rounded-lg border border-slate-700 bg-slate-800 shadow-xl"
        :style="{ left: posX + 'px', top: posY + 'px' }"
      >
        <!-- Header -->
        <div class="border-b border-slate-700 px-3 py-2.5">
          <span class="text-xs font-bold text-white">{{ nick }}</span>
        </div>

        <div class="py-1">
          <!-- Open conversation -->
          <button
            class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-300 transition-colors hover:bg-slate-700/60"
            @click="openConversation"
          >
            <svg
              class="h-3.5 w-3.5 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
              />
            </svg>
            Open conversation
          </button>

          <!-- Hide previews -->
          <button
            v-if="!isSelf"
            class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-300 transition-colors hover:bg-slate-700/60"
            @click="togglePreviews"
          >
            <svg
              class="h-3.5 w-3.5 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88"
              />
            </svg>
            {{ prefs.isPreviewHidden(serverId, nick) ? '✓ Previews hidden' : 'Hide previews' }}
          </button>

          <!-- Block user (shadow ban) -->
          <button
            v-if="!isSelf"
            class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-slate-700/60"
            :class="prefs.isUserBlocked(serverId, nick) ? 'text-red-400' : 'text-slate-300'"
            @click="toggleBlocked"
          >
            <svg
              class="h-3.5 w-3.5"
              :class="prefs.isUserBlocked(serverId, nick) ? 'text-red-400' : 'text-slate-400'"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636"
              />
            </svg>
            {{ prefs.isUserBlocked(serverId, nick) ? '✓ User blocked' : 'Block user' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
