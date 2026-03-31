<script setup lang="ts">
  import { ref, watch } from 'vue';
  import { useIrcStore } from '@/stores/irc.ts';
  import ServerList from './ServerList.vue';
  import ChannelList from './ChannelList.vue';
  import ServerSettingsModal from '@/components/ui/ServerSettingsModal.vue';
  import type { ServerConfig } from '@/types.ts';

  const store = useIrcStore();

  const settingsModalOpen = ref(false);
  const settingsServerId = ref<string | null>(null);
  const settingsServerName = ref('');
  const settingsInitialTab = ref<string | null>(null);

  // Watch for external requests to open settings (e.g. from "view settings" links)
  watch(
    () => store.openSettingsRequest,
    (req) => {
      if (!req) return;
      const server = store.servers.find((s) => s.id === req.serverId);
      if (server) {
        settingsServerId.value = server.id;
        settingsServerName.value = server.name;
        settingsInitialTab.value = req.tab || null;
        settingsModalOpen.value = true;
      }
      store.openSettingsRequest = null;
    },
  );

  function openSettings(server: ServerConfig) {
    settingsServerId.value = server.id;
    settingsServerName.value = server.name;
    settingsInitialTab.value = null;
    settingsModalOpen.value = true;
  }
</script>

<template>
  <div class="flex flex-1 flex-col overflow-y-auto">
    <ServerList @open-settings="openSettings" />

    <!-- Divider -->
    <div class="mx-3 mb-2 border-t border-slate-700" />

    <ChannelList />

    <!-- Settings modal -->
    <ServerSettingsModal
      v-if="settingsServerId"
      :server-id="settingsServerId"
      :server-name="settingsServerName"
      :open="settingsModalOpen"
      :initial-tab="settingsInitialTab"
      @close="settingsModalOpen = false"
    />

    <!-- Connection error popup -->
    <Teleport to="body">
      <div
        v-if="store.connectionError"
        class="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[15vh]"
        tabindex="0"
        @click.self="store.dismissConnectionError()"
        @keydown.escape="store.dismissConnectionError()"
      >
        <div class="w-full max-w-sm rounded-xl bg-slate-800 px-5 py-4 shadow-2xl">
          <p class="text-sm text-slate-300">{{ store.connectionError }}</p>
          <div class="mt-4 flex justify-end">
            <button
              class="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-500"
              @click="store.dismissConnectionError()"
            >
              {{ $t('common.ok') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
