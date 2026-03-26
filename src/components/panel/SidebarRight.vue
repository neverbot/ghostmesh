<script setup lang="ts">
  import { useIrcStore } from '@/stores/irc.ts';
  import ChannelInfo from './ChannelInfo.vue';
  import UserList from './UserList.vue';

  const store = useIrcStore();
</script>

<template>
  <div class="flex w-64 flex-col border-l border-slate-200 bg-slate-50 px-5 pt-5">
    <ChannelInfo />
    <UserList v-if="store.selectedChannel && !store.isDM(store.selectedChannel)" />
  </div>
</template>
