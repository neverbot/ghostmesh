<script setup>
  import { computed } from 'vue';
  import { useIrcStore } from '@/stores/irc.js';

  const store = useIrcStore();

  const title = computed(() => {
    if (!store.selectedChannel) return 'GhostMesh';
    if (store.selectedChannel === '*status') return 'Server Status';
    return store.selectedChannel;
  });

  const subtitle = computed(() => {
    if (!store.selectedServer) return 'Select a server to connect';
    return store.selectedServer.name;
  });

  const userCount = computed(() => store.currentUsers.length);
</script>

<template>
  <div class="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
    <div class="flex flex-col">
      <h2 class="text-lg font-bold text-slate-800">{{ title }}</h2>
      <span class="text-xs text-slate-400">{{ subtitle }}</span>
      <span
        v-if="store.currentTopic"
        class="mt-1 text-xs text-slate-500"
      >
        {{ store.currentTopic }}
      </span>
    </div>
    <div
      v-if="userCount > 0 && store.selectedChannel !== '*status'"
      class="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        class="h-4 w-4 text-slate-400"
      >
        <path
          d="M7 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM14.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1.615 16.428a1.224 1.224 0 0 1-.569-1.175 6.002 6.002 0 0 1 11.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 0 1 7 18a9.953 9.953 0 0 1-5.385-1.572ZM14.5 16h-.106c.07-.297.088-.611.048-.933a7.47 7.47 0 0 0-1.588-3.755 4.502 4.502 0 0 1 5.874 2.636.818.818 0 0 1-.36.98A7.465 7.465 0 0 1 14.5 16Z"
        />
      </svg>
      <span class="text-xs font-medium text-slate-500">{{ userCount }}</span>
    </div>
  </div>
</template>
