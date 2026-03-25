<script setup>
  import { ref, computed } from 'vue';
  import { useIrcStore } from '@/stores/irc.js';
  import UserContextMenu from '@/components/ui/UserContextMenu.vue';

  const store = useIrcStore();

  const isPrivate = computed(() => store.isDM(store.selectedChannel));

  const isSelfDM = computed(() => {
    if (!isPrivate.value || !store.selectedChannel) return false;
    const myNick = store.nicknamePerServer[store.selectedServerId] || store.nickname;
    return store.selectedChannel.toLowerCase() === myNick?.toLowerCase();
  });

  const channelName = computed(() => {
    if (!store.selectedChannel) return '';
    if (store.selectedChannel === '*status') return 'Status';
    return store.selectedChannel;
  });

  const memberCount = computed(() => {
    if (isPrivate.value) {
      if (isSelfDM.value) return 1;
      return store.isDMOnline(store.selectedServerId, store.selectedChannel) ? 2 : 1;
    }
    return store.currentUsers.length;
  });

  const isOnline = computed(() => {
    if (!isPrivate.value) return true;
    if (isSelfDM.value) return true;
    return store.isDMOnline(store.selectedServerId, store.selectedChannel);
  });

  // Context menu
  const menuOpen = ref(false);
  const menuX = ref(0);
  const menuY = ref(0);

  /**
   * Open context menu on the DM user.
   * @param {MouseEvent} e
   */
  function onUserClick(e) {
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
      {{ isPrivate ? 'Conversation' : 'Channel Info' }}
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
          <span
            class="text-[10px]"
            :class="isOnline ? 'text-emerald-500' : 'text-slate-400'"
          >
            {{ isSelfDM ? 'You' : isOnline ? 'Online' : 'Offline' }}
          </span>
        </div>
      </div>

      <!-- Channel: just the name -->
      <div
        v-else
        class="flex items-center gap-2"
      >
        <span class="text-lg font-bold text-slate-700">{{ channelName }}</span>
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
        No topic set
      </p>
      <p
        v-else-if="isSelfDM"
        class="text-xs italic text-slate-400"
      >
        This is a conversation with yourself. Use it as a notepad or to test chat features.
      </p>
      <p
        v-else
        class="text-xs italic text-slate-400"
      >
        Private message
      </p>

      <div class="mt-1 flex gap-4">
        <div class="flex flex-col items-center rounded-lg bg-slate-100 px-4 py-2">
          <span class="text-lg font-bold text-emerald-600">{{ memberCount }}</span>
          <span class="text-[10px] text-slate-400">Members</span>
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
