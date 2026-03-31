<script setup lang="ts">
  import { ref, computed, watch, nextTick } from 'vue';
  import { useIrcStore } from '@/stores/irc.ts';
  import CommandAutocomplete from './CommandAutocomplete.vue';
  import EmojiPicker from './EmojiPicker.vue';
  import { i18n } from '@/i18n/index.ts';

  const t = i18n.global.t;

  const store = useIrcStore();
  const text = ref('');
  const inputEl = ref<HTMLInputElement | null>(null);
  const fileInputEl = ref<HTMLInputElement | null>(null);
  const autocompleteRef = ref<InstanceType<typeof CommandAutocomplete> | null>(null);
  const inputFocused = ref(false);
  const emojiPickerOpen = ref(false);

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  // Auto-focus input when switching channels
  watch(
    () => store.selectedChannel,
    (ch) => {
      if (ch) {
        nextTick(() => inputEl.value?.focus());
      }
    },
  );

  // Prefill input when forwarding a message
  watch(
    () => store.prefillMessage,
    (content) => {
      if (content) {
        text.value = content;
        store.prefillMessage = '';
        nextTick(() => inputEl.value?.focus());
      }
    },
  );

  const emit = defineEmits<{
    send: [content: string];
    upload: [file: File];
  }>();

  function handleSend() {
    const content = text.value.trim();
    if (!content) return;
    emit('send', content);
    text.value = '';
  }

  /** Open the file picker. */
  function openFilePicker() {
    fileInputEl.value?.click();
  }

  /** Handle file selection from the picker. */
  function onFileSelected(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    // Reset input so the same file can be selected again
    input.value = '';
    validateAndUpload(file);
  }

  /** Validate and emit the file for upload. */
  function validateAndUpload(file: File) {
    if (!file.type.startsWith('image/')) {
      store.addMessage(
        store.selectedServerId!,
        store.selectedChannel!,
        '',
        t('errors.onlyImages'),
        'system',
      );
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      store.addMessage(
        store.selectedServerId!,
        store.selectedChannel!,
        '',
        t('errors.fileTooLarge', { size: MAX_FILE_SIZE / 1024 / 1024 }),
        'system',
      );
      return;
    }
    emit('upload', file);
  }

  /** Handle keyboard events for autocomplete navigation. */
  function onKeydown(e: KeyboardEvent) {
    if (!autocompleteRef.value?.visible) return;

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      autocompleteRef.value.moveUp();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      autocompleteRef.value.moveDown();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (autocompleteRef.value.confirmSelection()) {
        // Selection was made — input updated via @select
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      text.value = '';
    }
  }

  /** Handle Enter — confirm autocomplete or send message. */
  function onEnter(e: KeyboardEvent) {
    if (autocompleteRef.value?.visible) {
      e.preventDefault();
      if (autocompleteRef.value.confirmSelection()) return;
    }
    handleSend();
  }

  /** When a command is selected from autocomplete. */
  function onCommandSelect(command: string) {
    text.value = command;
    nextTick(() => inputEl.value?.focus());
  }

  /** Insert an emoji at the current cursor position. */
  function onEmojiSelect(emoji: string) {
    const input = inputEl.value;
    if (input) {
      const start = input.selectionStart ?? text.value.length;
      const end = input.selectionEnd ?? start;
      text.value = text.value.slice(0, start) + emoji + text.value.slice(end);
      nextTick(() => {
        const pos = start + emoji.length;
        input.setSelectionRange(pos, pos);
        input.focus();
      });
    } else {
      text.value += emoji;
    }
    emojiPickerOpen.value = false;
  }

  const isDisabled = computed(() => !store.selectedChannel);
  const isStatusChannel = computed(() => store.selectedChannel === '*status');

  defineExpose({ validateAndUpload });
</script>

<template>
  <div class="relative border-t border-slate-200 bg-white px-5 py-4">
    <CommandAutocomplete
      ref="autocompleteRef"
      :input="text"
      :focused="inputFocused"
      @select="onCommandSelect"
    />
    <div class="flex items-center gap-3">
      <input
        ref="inputEl"
        v-model="text"
        type="text"
        :placeholder="
          isDisabled
            ? $t('chat.selectChannelToChat')
            : isStatusChannel
              ? $t('chat.sendRawCommand')
              : $t('chat.writeMessage')
        "
        :disabled="isDisabled"
        class="flex-1 rounded-full border border-slate-200 bg-slate-50 px-5 py-3 text-sm text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white disabled:cursor-not-allowed disabled:opacity-50"
        @keydown="onKeydown"
        @keydown.enter="onEnter"
        @focus="inputFocused = true"
        @blur="inputFocused = false"
      />
      <!-- Emoji picker -->
      <div
        v-if="!isStatusChannel"
        class="relative"
      >
        <EmojiPicker
          :open="emojiPickerOpen"
          @select="onEmojiSelect"
          @close="emojiPickerOpen = false"
        />
        <button
          :disabled="isDisabled"
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-600 active:scale-95 disabled:opacity-40"
          :data-tooltip="$t('tooltips.emoji')"
          @click="emojiPickerOpen = !emojiPickerOpen"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            class="h-5 w-5"
          >
            <path
              fill-rule="evenodd"
              d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.536-4.464a.75.75 0 1 0-1.06-1.06 3.5 3.5 0 0 1-4.95 0 .75.75 0 0 0-1.06 1.06 5 5 0 0 0 7.07 0ZM9 8.5c0 .828-.448 1.5-1 1.5s-1-.672-1-1.5S7.448 7 8 7s1 .672 1 1.5Zm3 1.5c.552 0 1-.672 1-1.5S12.552 7 12 7s-1 .672-1 1.5.448 1.5 1 1.5Z"
              clip-rule="evenodd"
            />
          </svg>
        </button>
      </div>
      <!-- Attach image button -->
      <input
        ref="fileInputEl"
        type="file"
        accept="image/*"
        class="hidden"
        @change="onFileSelected"
      />
      <button
        v-if="!isStatusChannel"
        :disabled="isDisabled || store.isUploading || !store.canUpload"
        class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white transition-all active:scale-95 disabled:opacity-40"
        :class="store.canUpload ? 'bg-slate-400 hover:bg-slate-500' : 'bg-slate-300'"
        :data-tooltip="
          store.isUploading
            ? $t('tooltips.uploading')
            : store.canUpload
              ? $t('tooltips.attachImage')
              : $t('tooltips.uploadUnavailable')
        "
        @click="openFilePicker"
      >
        <svg
          v-if="!store.isUploading"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          class="h-5 w-5"
        >
          <path
            fill-rule="evenodd"
            d="M15.621 4.379a3 3 0 0 0-4.242 0l-7 7a3 3 0 0 0 4.241 4.243l.828-.829a.75.75 0 0 1 1.06 1.06l-.828.829a4.5 4.5 0 0 1-6.364-6.364l7-7a4.5 4.5 0 0 1 6.368 6.36l-3.455 3.553A2.625 2.625 0 1 1 9.52 9.52l3.45-3.451a.75.75 0 1 1 1.061 1.06l-3.45 3.451a1.125 1.125 0 0 0 1.587 1.595l3.454-3.553a3 3 0 0 0 0-4.242Z"
            clip-rule="evenodd"
          />
        </svg>
        <!-- Spinner during upload -->
        <svg
          v-else
          class="h-5 w-5 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="3"
            class="opacity-25"
          />
          <path
            fill="currentColor"
            class="opacity-75"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      </button>
      <!-- Send button -->
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
