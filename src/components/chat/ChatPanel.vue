<script setup lang="ts">
  import { useIrcStore } from '@/stores/irc.ts';
  import ChatHeader from './ChatHeader.vue';
  import MessageList from './MessageList.vue';
  import MessageInput from './MessageInput.vue';

  const store = useIrcStore();

  function handleSend(content: string) {
    store.sendMessage(content);
  }
</script>

<template>
  <div class="relative flex flex-1 flex-col overflow-hidden">
    <ChatHeader />
    <MessageList />
    <MessageInput @send="handleSend" />
  </div>
</template>
