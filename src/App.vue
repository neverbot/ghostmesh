<script setup lang="ts">
  import { onMounted, onUnmounted } from 'vue';
  import { useIrcStore } from '@/stores/irc.ts';

  const store = useIrcStore();

  /**
   * Warn the user before leaving if connected to any server.
   * @param {BeforeUnloadEvent} e
   */
  function onBeforeUnload(e: BeforeUnloadEvent) {
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
</template>
