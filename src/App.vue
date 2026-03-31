<script setup lang="ts">
  import { onMounted, onUnmounted } from 'vue';
  import { useIrcStore } from '@/stores/irc.ts';
  import GlobalTooltip from '@/components/ui/GlobalTooltip.vue';

  const store = useIrcStore();

  /**
   * Warn the user before leaving if connected to any server.
   * @param {BeforeUnloadEvent} e
   */
  function onBeforeUnload(e: BeforeUnloadEvent) {
    // Lock session to prevent socket-close from clearing it during page unload
    store.markUnloading();
    if (store.activeConnections.length > 0) {
      e.preventDefault();
    }
  }

  onMounted(() => {
    window.addEventListener('beforeunload', onBeforeUnload);
    store.restoreSession();
  });
  onUnmounted(() => window.removeEventListener('beforeunload', onBeforeUnload));
</script>

<template>
  <router-view />
  <GlobalTooltip />
</template>
