<script setup>
  import { ref } from 'vue';
  import { useIrcStore } from '@/stores/irc.js';

  const store = useIrcStore();
  const collapsedServers = ref({});
  const joinInputs = ref({});

  function toggleServer(serverId) {
    collapsedServers.value[serverId] = !collapsedServers.value[serverId];
  }

  function isCollapsed(serverId) {
    return !!collapsedServers.value[serverId];
  }

  function handleConnect(server) {
    store.connectToServer(server);
  }

  function handleJoin(serverId) {
    const channel = (joinInputs.value[serverId] || '').trim();
    if (!channel) return;
    store.joinChannel(serverId, channel);
    joinInputs.value[serverId] = '';
  }

  function isSelected(serverId, channel) {
    return store.selectedServerId === serverId && store.selectedChannel === channel;
  }

  function getServerChannels(serverId) {
    return store.channels[serverId] || [];
  }
</script>

<template>
  <div class="flex flex-1 flex-col overflow-y-auto">
    <!-- Connected servers with their channels -->
    <div
      v-for="server in store.connectedServers"
      :key="server.id"
      class="mb-1"
    >
      <!-- Server header -->
      <div class="group flex items-center gap-1 px-2 py-1">
        <button
          class="flex flex-1 items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 transition-colors hover:text-slate-400"
          @click="toggleServer(server.id)"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            class="h-2.5 w-2.5 transition-transform"
            :class="isCollapsed(server.id) ? '-rotate-90' : ''"
          >
            <path
              fill-rule="evenodd"
              d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z"
              clip-rule="evenodd"
            />
          </svg>
          <div
            class="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400"
          />
          {{ server.name }}
        </button>
        <!-- Disconnect button -->
        <button
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

      <!-- Channels under this server -->
      <div
        v-show="!isCollapsed(server.id)"
        class="flex flex-col gap-0.5 pb-1"
      >
        <div
          v-for="channel in getServerChannels(server.id)"
          :key="`${server.id}:${channel}`"
          class="flex cursor-pointer items-center gap-2 rounded-lg py-1.5 pl-7 pr-3 transition-colors"
          :class="
            isSelected(server.id, channel)
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'text-slate-400 hover:bg-slate-700/40 hover:text-slate-300'
          "
          @click="store.selectChannel(server.id, channel)"
        >
          <span class="w-3 text-center text-[11px] opacity-60">
            {{ channel === '*status' ? '~' : '#' }}
          </span>
          <span class="truncate text-sm">
            {{ channel === '*status' ? 'status' : channel.replace(/^#/, '') }}
          </span>
        </div>

        <!-- Join channel input -->
        <div class="mt-0.5 flex items-center gap-1 pl-6 pr-2">
          <input
            v-model="joinInputs[server.id]"
            type="text"
            placeholder="Join #channel"
            class="flex-1 rounded-md border border-slate-600/50 bg-slate-700/30 px-2 py-1 text-[11px] text-slate-400 outline-none placeholder:text-slate-600 focus:border-emerald-500/50"
            @keyup.enter="handleJoin(server.id)"
          />
          <button
            class="rounded-md bg-emerald-500/10 p-1 text-emerald-500 transition-colors hover:bg-emerald-500/20"
            @click="handleJoin(server.id)"
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
      </div>
    </div>

    <!-- Disconnected servers -->
    <div
      v-if="store.disconnectedServers.length > 0"
      class="mt-2"
    >
      <div
        v-if="store.connectedServers.length > 0"
        class="mx-3 mb-2 border-t border-slate-700"
      />
      <span class="mb-1 block px-3 text-[10px] font-bold uppercase tracking-widest text-slate-600">
        Offline
      </span>
      <div
        v-for="server in store.disconnectedServers"
        :key="server.id"
        class="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-slate-500 transition-colors hover:bg-slate-700/40 hover:text-slate-400"
        @click="handleConnect(server)"
      >
        <div class="h-2 w-2 shrink-0 rounded-full bg-slate-600" />
        <div class="flex min-w-0 flex-1 flex-col">
          <span class="truncate text-sm">{{ server.name }}</span>
          <span class="truncate text-[10px] text-slate-600">{{ server.host }}</span>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-if="store.connectedServers.length === 0 && store.disconnectedServers.length === 0"
      class="px-3 py-4 text-center text-xs text-slate-500"
    >
      No servers configured
    </div>
  </div>
</template>
