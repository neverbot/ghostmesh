<script setup lang="ts">
  import { computed } from 'vue';
  import { useIrcStore } from '@/stores/irc.ts';
  import { i18n } from '@/i18n/index.ts';

  const store = useIrcStore();

  /** Channel name or fallback app name. */
  const title = computed(() => {
    if (!store.selectedChannel) return 'GhostMesh';
    if (store.selectedChannel === '*status') return i18n.global.t('panel.serverStatus');
    return store.selectedChannel;
  });

  /** Number of users in the current channel. */
  const userCount = computed(() => store.currentUsers.length);
</script>

<template>
  <div class="flex items-center border-b border-slate-200 bg-white px-6 py-4">
    <h2 class="text-lg font-bold text-slate-800">{{ title }}</h2>
    <div
      v-if="userCount > 0 && store.selectedChannel !== '*status'"
      class="ml-2 flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        class="h-3.5 w-3.5 text-slate-400"
      >
        <path
          d="M7 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM14.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1.615 16.428a1.224 1.224 0 0 1-.569-1.175 6.002 6.002 0 0 1 11.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 0 1 7 18a9.953 9.953 0 0 1-5.385-1.572ZM14.5 16h-.106c.07-.297.088-.611.048-.933a7.47 7.47 0 0 0-1.588-3.755 4.502 4.502 0 0 1 5.874 2.636.818.818 0 0 1-.36.98A7.465 7.465 0 0 1 14.5 16Z"
        />
      </svg>
      <span class="text-[10px] font-medium text-slate-500">{{ userCount }}</span>
    </div>
  </div>
</template>
