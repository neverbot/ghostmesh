<script setup>
  import { ref } from 'vue';
  import { useIrcStore } from '@/stores/irc.js';

  const store = useIrcStore();
  const joinInput = ref('');

  function handleJoin() {
    const channel = joinInput.value.trim();
    if (!channel || !store.selectedServerId) return;
    store.joinChannel(store.selectedServerId, channel);
    joinInput.value = '';
  }
</script>

<template>
  <div class="flex flex-1 flex-col overflow-hidden">
    <span class="mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">
      Channels
    </span>

    <div class="flex-1 overflow-y-auto">
      <div
        v-for="channel in store.currentChannels"
        :key="channel"
        class="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 transition-colors"
        :class="
          store.selectedChannel === channel
            ? 'bg-emerald-500/20 text-emerald-400'
            : 'text-slate-400 hover:bg-slate-700/40 hover:text-slate-300'
        "
        @click="store.selectChannel(channel)"
      >
        <span
          v-if="channel === '*status'"
          class="text-xs"
        >
          ~
        </span>
        <span
          v-else
          class="text-xs"
        >
          #
        </span>
        <span class="truncate text-sm">
          {{ channel === '*status' ? 'status' : channel.replace(/^#/, '') }}
        </span>
      </div>

      <div
        v-if="store.currentChannels.length === 0"
        class="px-3 py-4 text-center text-xs text-slate-500"
      >
        No channels yet
      </div>
    </div>

    <!-- Join channel input -->
    <div
      v-if="store.selectedServerId && store.isConnected(store.selectedServerId)"
      class="mt-2 px-2 pb-2"
    >
      <div class="flex items-center gap-1">
        <input
          v-model="joinInput"
          type="text"
          placeholder="Join #channel"
          class="flex-1 rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-1.5 text-xs text-slate-300 outline-none placeholder:text-slate-500 focus:border-emerald-500"
          @keyup.enter="handleJoin"
        />
        <button
          class="rounded-lg bg-emerald-500/20 p-1.5 text-emerald-400 transition-colors hover:bg-emerald-500/30"
          @click="handleJoin"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            class="h-3.5 w-3.5"
          >
            <path
              d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z"
            />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>
