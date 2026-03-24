<script setup>
  import { ref } from 'vue';
  import { useIrcStore } from '@/stores/irc.js';

  const store = useIrcStore();
  const collapsed = ref(false);

  function handleClick(server) {
    if (store.isConnected(server.id)) {
      store.selectServer(server.id);
    } else {
      store.connectToServer(server);
    }
  }
</script>

<template>
  <div class="flex flex-col gap-1">
    <button
      class="mb-1 flex w-full items-center gap-1.5 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 transition-colors hover:text-slate-400"
      @click="collapsed = !collapsed"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 16 16"
        fill="currentColor"
        class="h-2.5 w-2.5 transition-transform"
        :class="collapsed ? '-rotate-90' : ''"
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
      v-show="!collapsed"
      class="flex flex-col gap-1"
    >
      <div
        v-for="server in store.servers"
        :key="server.id"
        class="group flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors"
        :class="
          store.selectedServerId === server.id
            ? 'bg-slate-700/60 text-white'
            : 'text-slate-300 hover:bg-slate-700/40'
        "
        @click="handleClick(server)"
      >
        <!-- Status dot -->
        <div
          class="h-2.5 w-2.5 shrink-0 rounded-full"
          :class="store.isConnected(server.id) ? 'bg-emerald-400' : 'bg-slate-500'"
        />
        <div class="flex min-w-0 flex-1 flex-col">
          <span class="truncate text-sm font-medium">{{ server.name }}</span>
          <span class="truncate text-[10px] text-slate-500">{{ server.host }}</span>
        </div>
        <!-- Disconnect button -->
        <button
          v-if="store.isConnected(server.id)"
          class="hidden rounded p-1 text-slate-400 transition-colors hover:bg-slate-600 hover:text-red-400 group-hover:block"
          title="Disconnect"
          @click.stop="store.disconnectFromServer(server.id)"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            class="h-3.5 w-3.5"
          >
            <path
              d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z"
            />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>
