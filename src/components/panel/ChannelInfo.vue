<script setup lang="ts">
  import { ref, computed } from 'vue';
  import { useIrcStore } from '@/stores/irc.ts';
  import UserContextMenu from '@/components/ui/UserContextMenu.vue';
  import { i18n } from '@/i18n/index.ts';

  const t = i18n.global.t;
  const store = useIrcStore();

  const isPrivate = computed(() =>
    store.selectedChannel ? store.isDM(store.selectedChannel) : false,
  );

  const isSelfDM = computed(() => {
    if (!isPrivate.value || !store.selectedChannel) return false;
    const myNick = store.nicknamePerServer[store.selectedServerId!] || store.nickname;
    return store.selectedChannel.toLowerCase() === myNick?.toLowerCase();
  });

  const channelName = computed(() => {
    if (!store.selectedChannel) return '';
    if (store.selectedChannel === '*status') return t('common.status');
    return store.selectedChannel;
  });

  const serverName = computed(() => {
    if (!store.selectedServerId) return '';
    const server = store.servers.find((s) => s.id === store.selectedServerId);
    return server?.name || '';
  });

  const memberCount = computed(() => {
    if (isPrivate.value) {
      if (isSelfDM.value) return 1;
      return store.isDMOnline(store.selectedServerId!, store.selectedChannel!) ? 2 : 1;
    }
    return store.currentUsers.length;
  });

  const isOnline = computed(() => {
    if (!isPrivate.value) return true;
    if (isSelfDM.value) return true;
    return store.isDMOnline(store.selectedServerId!, store.selectedChannel!);
  });

  // Context menu
  const menuOpen = ref(false);
  const menuX = ref(0);
  const menuY = ref(0);

  /**
   * Open context menu on the DM user.
   * @param {MouseEvent} e
   */
  function onUserClick(e: MouseEvent) {
    menuX.value = e.clientX;
    menuY.value = e.clientY;
    menuOpen.value = true;
  }
</script>

<template>
  <div
    v-if="store.selectedChannel && store.selectedChannel !== '*status'"
    class="border-b border-slate-200 pb-4"
  >
    <h3 class="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
      {{ isPrivate ? $t('panel.conversation') : $t('panel.channelInfo') }}
    </h3>

    <div class="flex flex-col gap-2">
      <!-- DM: avatar + name clickable -->
      <div
        v-if="isPrivate"
        class="flex items-center gap-3"
        :class="!isSelfDM ? 'cursor-pointer' : ''"
        @click="!isSelfDM && onUserClick($event)"
      >
        <div
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold"
          :class="isOnline ? 'bg-emerald-500 text-white' : 'bg-slate-300 text-slate-500'"
        >
          {{ (store.selectedChannel || '?')[0].toUpperCase() }}
        </div>
        <div class="flex flex-col">
          <span class="text-lg font-bold text-slate-700">{{ channelName }}</span>
          <span class="text-[10px] text-slate-400">{{ serverName }}</span>
          <span
            class="text-[10px]"
            :class="isOnline ? 'text-emerald-500' : 'text-slate-400'"
          >
            {{ isSelfDM ? $t('user.you') : isOnline ? $t('user.online') : $t('user.offline') }}
          </span>
        </div>
      </div>

      <!-- Channel: name + server -->
      <div
        v-else
        class="flex flex-col"
      >
        <span class="text-lg font-bold text-slate-700">{{ channelName }}</span>
        <span class="text-[10px] text-slate-400">{{ serverName }}</span>
      </div>

      <p
        v-if="!isPrivate && store.currentTopic"
        class="text-xs leading-relaxed text-slate-500"
      >
        {{ store.currentTopic }}
      </p>
      <p
        v-else-if="!isPrivate"
        class="text-xs italic text-slate-400"
      >
        {{ $t('panel.noTopicSet') }}
      </p>
      <p
        v-else-if="isSelfDM"
        class="text-xs italic text-slate-400"
      >
        {{ $t('panel.selfDMDescription') }}
      </p>
      <p
        v-else
        class="text-xs italic text-slate-400"
      >
        {{ $t('panel.privateMessage') }}
      </p>

      <div class="mt-1 flex gap-4">
        <div class="flex flex-col items-center rounded-lg bg-slate-100 px-4 py-2">
          <span class="text-lg font-bold text-emerald-600">{{ memberCount }}</span>
          <span class="text-[10px] text-slate-400">{{ $t('panel.members') }}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Context menu for DM user -->
  <UserContextMenu
    v-if="isPrivate && !isSelfDM"
    :nick="store.selectedChannel || ''"
    :server-id="store.selectedServerId || ''"
    :x="menuX"
    :y="menuY"
    :open="menuOpen"
    @close="menuOpen = false"
    @open-dm="menuOpen = false"
  />
</template>
