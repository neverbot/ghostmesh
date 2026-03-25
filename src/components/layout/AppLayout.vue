<script setup>
  import { ref, onBeforeUnmount } from 'vue';
  import { useIrcStore } from '@/stores/irc.js';
  import SidebarLeft from '@/components/sidebar/SidebarLeft.vue';
  import ChatPanel from '@/components/chat/ChatPanel.vue';
  import SidebarRight from '@/components/panel/SidebarRight.vue';

  const store = useIrcStore();
  const leftCollapsed = ref(false);
  const rightCollapsed = ref(false);

  onBeforeUnmount(() => {
    store.cleanup();
  });
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-slate-100">
    <!-- Left sidebar -->
    <SidebarLeft
      v-show="!leftCollapsed"
      class="shrink-0"
    />

    <!-- Main area -->
    <div class="relative flex min-w-0 flex-1 flex-col">
      <!-- Left collapse toggle -->
      <button
        class="absolute top-2.5 z-10 rounded border border-slate-700 bg-slate-800 px-1 py-2.5 text-slate-500 transition-colors hover:text-slate-300"
        :class="leftCollapsed ? 'left-1' : '-left-2'"
        @click="leftCollapsed = !leftCollapsed"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 16"
          fill="currentColor"
          class="h-3 w-3 transition-transform"
          :class="leftCollapsed ? 'rotate-180' : ''"
        >
          <path
            fill-rule="evenodd"
            d="M9.78 4.22a.75.75 0 0 1 0 1.06L7.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L5.47 8.53a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0Z"
            clip-rule="evenodd"
          />
        </svg>
      </button>

      <!-- Right collapse toggle -->
      <button
        v-if="store.selectedChannel && store.selectedChannel !== '*status'"
        class="absolute top-2.5 z-10 rounded border border-slate-200 bg-slate-50 px-1 py-2.5 text-slate-400 transition-colors hover:text-slate-600"
        :class="rightCollapsed ? 'right-1' : '-right-2'"
        @click="rightCollapsed = !rightCollapsed"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 16"
          fill="currentColor"
          class="h-3 w-3 transition-transform"
          :class="rightCollapsed ? 'rotate-180' : ''"
        >
          <path
            fill-rule="evenodd"
            d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z"
            clip-rule="evenodd"
          />
        </svg>
      </button>

      <ChatPanel />
    </div>

    <!-- Right sidebar -->
    <SidebarRight
      v-if="store.selectedChannel && store.selectedChannel !== '*status'"
      v-show="!rightCollapsed"
      class="shrink-0"
    />
  </div>
</template>
