<script setup lang="ts">
  import { ref } from 'vue';
  import { useIrcStore } from '@/stores/irc.ts';
  import ChatHeader from './ChatHeader.vue';
  import MessageList from './MessageList.vue';
  import MessageInput from './MessageInput.vue';

  const store = useIrcStore();
  const messageInputRef = ref<InstanceType<typeof MessageInput> | null>(null);
  const isDragging = ref(false);

  function handleSend(content: string) {
    store.sendMessage(content);
  }

  function handleUpload(file: File) {
    store.uploadAndSend(file);
  }

  // ─── Drag and drop ───────────────────────────────────────────────────────

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer?.types.includes('Files')) {
      isDragging.value = true;
    }
  }

  function onDragLeave(e: DragEvent) {
    // Only hide overlay when leaving the panel (not entering a child)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (
      e.clientX <= rect.left ||
      e.clientX >= rect.right ||
      e.clientY <= rect.top ||
      e.clientY >= rect.bottom
    ) {
      isDragging.value = false;
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    isDragging.value = false;
    const file = e.dataTransfer?.files[0];
    if (!file) return;
    messageInputRef.value?.validateAndUpload(file);
  }
</script>

<template>
  <div
    class="relative flex flex-1 flex-col overflow-hidden"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <ChatHeader />
    <MessageList />
    <MessageInput
      ref="messageInputRef"
      @send="handleSend"
      @upload="handleUpload"
    />

    <!-- Drop overlay -->
    <div
      v-if="isDragging"
      class="pointer-events-none absolute inset-0 z-40 flex items-center justify-center rounded-lg border-2 border-dashed border-emerald-400 bg-emerald-50/80"
    >
      <span class="text-lg font-medium text-emerald-600">Drop image here</span>
    </div>
  </div>
</template>
