<script setup>
  import { ref } from 'vue';
  import { useIrcStore } from '@/stores/irc.js';

  const store = useIrcStore();
  const text = ref('');

  const emit = defineEmits(['send']);

  function handleSend() {
    const content = text.value.trim();
    if (!content) return;
    emit('send', content);
    text.value = '';
  }

  const isDisabled = !store.selectedChannel || store.selectedChannel === '*status';
</script>

<template>
  <div class="border-t border-slate-200 bg-white px-5 py-4">
    <div class="flex items-center gap-3">
      <input
        v-model="text"
        type="text"
        :placeholder="isDisabled ? 'Select a channel to chat...' : 'Write your message...'"
        :disabled="isDisabled"
        class="flex-1 rounded-full border border-slate-200 bg-slate-50 px-5 py-3 text-sm text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white disabled:cursor-not-allowed disabled:opacity-50"
        @keyup.enter="handleSend"
      />
      <button
        :disabled="isDisabled || !text.trim()"
        class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white transition-all hover:bg-emerald-600 active:scale-95 disabled:opacity-40 disabled:hover:bg-emerald-500"
        @click="handleSend"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          class="h-5 w-5"
        >
          <path
            d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.897 28.897 0 0 0 15.293-7.155.75.75 0 0 0 0-1.114A28.897 28.897 0 0 0 3.105 2.288Z"
          />
        </svg>
      </button>
    </div>
  </div>
</template>
