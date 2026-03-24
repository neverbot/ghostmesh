<script setup>
  import { computed } from 'vue';
  import { useIrcStore } from '@/stores/irc.js';

  const store = useIrcStore();

  const channelName = computed(() => {
    if (!store.selectedChannel) return '';
    if (store.selectedChannel === '*status') return 'Status';
    return store.selectedChannel;
  });
</script>

<template>
  <div
    v-if="store.selectedChannel && store.selectedChannel !== '*status'"
    class="border-b border-slate-200 pb-4"
  >
    <h3 class="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">Channel Info</h3>

    <div class="flex flex-col gap-2">
      <div class="flex items-center gap-2">
        <span class="text-lg font-bold text-slate-700">{{ channelName }}</span>
      </div>

      <p
        v-if="store.currentTopic"
        class="text-xs leading-relaxed text-slate-500"
      >
        {{ store.currentTopic }}
      </p>
      <p
        v-else
        class="text-xs italic text-slate-400"
      >
        No topic set
      </p>

      <div class="mt-1 flex gap-4">
        <div class="flex flex-col items-center rounded-lg bg-slate-100 px-4 py-2">
          <span class="text-lg font-bold text-emerald-600">{{ store.currentUsers.length }}</span>
          <span class="text-[10px] text-slate-400">Members</span>
        </div>
      </div>
    </div>
  </div>
</template>
