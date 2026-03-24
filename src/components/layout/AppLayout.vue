<script setup>
  import { onBeforeUnmount } from 'vue';
  import { useIrcStore } from '@/stores/irc.js';
  import SidebarLeft from '@/components/sidebar/SidebarLeft.vue';
  import ChatPanel from '@/components/chat/ChatPanel.vue';
  import SidebarRight from '@/components/panel/SidebarRight.vue';

  const store = useIrcStore();

  onBeforeUnmount(() => {
    store.cleanup();
  });
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-slate-100">
    <SidebarLeft />
    <ChatPanel />
    <SidebarRight v-if="store.selectedChannel && store.selectedChannel !== '*status'" />
  </div>
</template>
