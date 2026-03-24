<script setup>
  import { ref } from 'vue';
  import { useIrcStore } from '@/stores/irc.js';

  const store = useIrcStore();
  const serversCollapsed = ref(false);
  const channelsCollapsed = ref(false);
  const browseCollapsed = ref(true);
  const browseFilter = ref('');
  const joinInput = ref('');

  function handleJoin() {
    const channel = joinInput.value.trim();
    if (!channel || !store.selectedServerId) return;
    store.joinChannel(store.selectedServerId, channel);
    joinInput.value = '';
  }

  function filteredAvailable() {
    const filter = browseFilter.value.toLowerCase();
    if (!filter) return store.allAvailableChannels.slice(0, 200);
    return store.allAvailableChannels
      .filter((ch) => ch.name.toLowerCase().includes(filter))
      .slice(0, 200);
  }

  function isSelected(serverId, channel) {
    return store.selectedServerId === serverId && store.selectedChannel === channel;
  }

  function serverAbbr(name) {
    // First two letters of first word
    return name.slice(0, 2).toUpperCase();
  }
</script>

<template>
  <div class="flex flex-1 flex-col overflow-y-auto">
    <!-- SERVERS section -->
    <div class="mb-2">
      <button
        class="mb-1 flex w-full items-center gap-1.5 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 transition-colors hover:text-slate-400"
        @click="serversCollapsed = !serversCollapsed"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 16"
          fill="currentColor"
          class="h-2.5 w-2.5 transition-transform"
          :class="serversCollapsed ? '-rotate-90' : ''"
        >
          <path
            fill-rule="evenodd"
            d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z"
            clip-rule="evenodd"
          />
        </svg>
        Servers
      </button>

      <div
        v-show="!serversCollapsed"
        class="flex flex-col gap-0.5"
      >
        <div
          v-for="server in store.servers"
          :key="server.id"
          class="group flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors"
          :class="
            store.isConnected(server.id)
              ? 'text-slate-300 hover:bg-slate-700/40'
              : 'text-slate-500 hover:bg-slate-700/30 hover:text-slate-400'
          "
          @click="
            store.isConnected(server.id)
              ? store.selectServer(server.id)
              : store.connectToServer(server)
          "
        >
          <div
            class="h-2 w-2 shrink-0 rounded-full"
            :class="store.isConnected(server.id) ? 'bg-emerald-400' : 'bg-slate-600'"
          />
          <div class="flex min-w-0 flex-1 flex-col">
            <span class="truncate text-sm">{{ server.name }}</span>
            <span class="truncate text-[10px] text-slate-600">{{ server.host }}</span>
          </div>
          <button
            v-if="store.isConnected(server.id)"
            class="hidden rounded p-1 text-slate-500 transition-colors hover:bg-slate-600 hover:text-red-400 group-hover:block"
            title="Disconnect"
            @click.stop="store.disconnectFromServer(server.id)"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              class="h-3 w-3"
            >
              <path
                d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Divider -->
    <div class="mx-3 mb-2 border-t border-slate-700" />

    <!-- CHANNELS section — all channels from all servers mixed -->
    <div class="flex flex-1 flex-col overflow-hidden">
      <button
        class="mb-1 flex w-full items-center gap-1.5 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 transition-colors hover:text-slate-400"
        @click="channelsCollapsed = !channelsCollapsed"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 16"
          fill="currentColor"
          class="h-2.5 w-2.5 transition-transform"
          :class="channelsCollapsed ? '-rotate-90' : ''"
        >
          <path
            fill-rule="evenodd"
            d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z"
            clip-rule="evenodd"
          />
        </svg>
        Channels
      </button>

      <div
        v-show="!channelsCollapsed"
        class="flex flex-1 flex-col overflow-hidden"
      >
        <!-- Joined channels -->
        <div class="flex-1 overflow-y-auto">
          <div
            v-for="entry in store.allJoinedChannels"
            :key="`${entry.serverId}:${entry.channel}`"
            class="flex cursor-pointer items-center gap-2 rounded-lg py-1.5 pl-5 pr-3 transition-colors"
            :class="
              isSelected(entry.serverId, entry.channel)
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'text-slate-400 hover:bg-slate-700/40 hover:text-slate-300'
            "
            @click="store.selectChannel(entry.serverId, entry.channel)"
          >
            <span class="w-3 shrink-0 text-center text-[11px] opacity-60">
              {{ entry.channel === '*status' ? '~' : '#' }}
            </span>
            <span class="min-w-0 flex-1 truncate text-sm">
              {{ entry.channel === '*status' ? 'status' : entry.channel.replace(/^#/, '') }}
            </span>
            <!-- Server badge -->
            <span
              v-if="store.connectedServers.length > 1"
              class="shrink-0 rounded bg-slate-700/60 px-1.5 py-0.5 text-[9px] text-slate-500"
              :title="entry.serverName"
            >
              {{ serverAbbr(entry.serverName) }}
            </span>
          </div>

          <div
            v-if="store.allJoinedChannels.length === 0"
            class="px-3 py-4 text-center text-xs text-slate-500"
          >
            No channels yet
          </div>
        </div>

        <!-- Join channel input -->
        <div
          v-if="store.connectedServers.length > 0"
          class="mt-1 flex items-center gap-1 px-3 pb-1"
        >
          <input
            v-model="joinInput"
            type="text"
            placeholder="Join #channel"
            class="flex-1 rounded-md border border-slate-600/50 bg-slate-700/30 px-2 py-1 text-[11px] text-slate-400 outline-none placeholder:text-slate-600 focus:border-emerald-500/50"
            @keyup.enter="handleJoin"
          />
          <button
            class="rounded-md bg-emerald-500/10 p-1 text-emerald-500 transition-colors hover:bg-emerald-500/20"
            @click="handleJoin"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              class="h-3 w-3"
            >
              <path
                d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z"
              />
            </svg>
          </button>
        </div>

        <!-- Browse available channels -->
        <div
          v-if="store.allAvailableChannels.length > 0"
          class="mt-1 border-t border-slate-700/50 pt-1"
        >
          <button
            class="flex w-full items-center gap-1.5 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-slate-600 transition-colors hover:text-slate-500"
            @click="browseCollapsed = !browseCollapsed"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              class="h-2 w-2 transition-transform"
              :class="browseCollapsed ? '-rotate-90' : ''"
            >
              <path
                fill-rule="evenodd"
                d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z"
                clip-rule="evenodd"
              />
            </svg>
            Browse ({{ store.allAvailableChannels.length }})
          </button>

          <div v-show="!browseCollapsed">
            <div class="px-3 pb-1">
              <input
                v-model="browseFilter"
                type="text"
                placeholder="Filter channels..."
                class="w-full rounded-md border border-slate-700/50 bg-slate-700/20 px-2 py-0.5 text-[10px] text-slate-400 outline-none placeholder:text-slate-600 focus:border-slate-600"
              />
            </div>

            <div class="max-h-48 overflow-y-auto">
              <div
                v-for="ch in filteredAvailable()"
                :key="`browse:${ch.serverId}:${ch.name}`"
                class="group flex cursor-pointer items-center gap-2 rounded-md py-1 pl-5 pr-3 text-slate-500 transition-colors hover:bg-slate-700/30 hover:text-slate-400"
                @click="store.joinChannel(ch.serverId, ch.name)"
              >
                <span class="w-3 shrink-0 text-center text-[10px] opacity-50">#</span>
                <span class="min-w-0 flex-1 truncate text-xs">
                  {{ ch.name.replace(/^#/, '') }}
                </span>
                <span
                  v-if="store.connectedServers.length > 1"
                  class="shrink-0 rounded bg-slate-700/40 px-1 py-0.5 text-[8px] text-slate-600"
                >
                  {{ serverAbbr(ch.serverName) }}
                </span>
                <span class="shrink-0 text-[10px] text-slate-600">
                  {{ ch.users }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
