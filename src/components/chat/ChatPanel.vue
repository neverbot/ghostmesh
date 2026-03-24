<script setup>
  import { useIrcStore } from '@/stores/irc.js';
  import ChatHeader from './ChatHeader.vue';
  import MessageList from './MessageList.vue';
  import MessageInput from './MessageInput.vue';

  const store = useIrcStore();

  function handleSend(content) {
    store.sendMessage(content);
  }
</script>

<template>
  <div class="flex flex-1 flex-col overflow-hidden">
    <ChatHeader />
    <MessageList />
    <MessageInput @send="handleSend" />
  </div>
</template>
