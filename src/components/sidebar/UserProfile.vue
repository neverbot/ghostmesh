<template>
  <div
    class="mx-2 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-slate-700/40"
    @click="$emit('open-settings')"
  >
    <!-- Avatar -->
    <div
      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
      :style="{ backgroundColor: avatarColor }"
    >
      {{ initial }}
    </div>
    <div class="flex min-w-0 flex-1 flex-col">
      <span class="truncate text-sm text-white">{{ displayNick }}</span>
      <span class="text-[10px] text-slate-500">{{ statusText }}</span>
    </div>
    <!-- Settings gear icon -->
    <svg
      class="h-4 w-4 shrink-0 text-slate-500 transition-colors hover:text-slate-300"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      stroke-width="1.5"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.431.992a7.723 7.723 0 0 1 0 .255c-.007.378.138.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
      />
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
      />
    </svg>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useIrcStore } from '@/stores/irc.ts';
  import { useUserSettingsStore } from '@/stores/user-settings.ts';
  import { i18n } from '@/i18n/index.ts';

  const t = i18n.global.t;

  defineEmits<{
    'open-settings': [];
  }>();

  const store = useIrcStore();
  const userSettings = useUserSettingsStore();

  const displayNick = computed(() => {
    // Show confirmed nick from selected server, or global, or placeholder
    if (store.selectedServerId && store.nicknamePerServer[store.selectedServerId]) {
      return store.nicknamePerServer[store.selectedServerId];
    }
    if (store.nickname) return store.nickname;
    const profile = userSettings.getProfile();
    return profile.nickname || t('user.notConfigured');
  });

  const initial = computed(() => {
    const n = displayNick.value;
    return n ? n.charAt(0).toUpperCase() : '?';
  });

  /** Generate a color from string hash. */
  function hashColor(str: string) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 50%, 45%)`;
  }

  const avatarColor = computed(() => {
    const profile = userSettings.getProfile();
    if (profile.avatarColor) return profile.avatarColor;
    return hashColor(displayNick.value || 'ghost');
  });

  const statusText = computed(() => {
    const count = store.activeConnections.length;
    if (count === 0) return t('user.offline');
    return t('user.connectedTo', { count }, count);
  });
</script>
