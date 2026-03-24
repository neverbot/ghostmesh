<script setup>
  import { computed } from 'vue';
  import { useIrcStore } from '@/stores/irc.js';

  const props = defineProps({
    message: {
      type: Object,
      required: true,
    },
  });

  const store = useIrcStore();

  const isOwn = computed(() => props.message.nick === store.nickname);

  const isSystem = computed(() => ['system', 'join', 'part', 'quit'].includes(props.message.type));

  const timeString = computed(() => {
    const d = new Date(props.message.timestamp);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  });

  const avatarLetter = computed(() => {
    return (props.message.nick || '?')[0].toUpperCase();
  });

  /** Strip mIRC formatting codes (bold, italic, underline, color, reverse, reset). */
  function stripFormatting(text) {
    if (!text) return '';
    // \x02 = bold, \x1D = italic, \x1F = underline, \x16 = reverse, \x0F = reset
    // \x03 followed by optional fg,bg color digits
    return text.replace(/\x02|\x1D|\x1F|\x16|\x0F|\x03(\d{1,2}(,\d{1,2})?)?/g, '');
  }

  const cleanContent = computed(() => stripFormatting(props.message.content));
</script>

<template>
  <!-- System messages: left-aligned, monospace, with hover timestamp -->
  <div
    v-if="isSystem"
    class="group flex items-start gap-2 py-0.5"
  >
    <span
      class="invisible shrink-0 text-[10px] text-slate-500 group-hover:visible"
      :title="timeString"
    >
      {{ timeString }}
    </span>
    <span class="whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-400">{{
      cleanContent
    }}</span>
  </div>

  <!-- User messages -->
  <div
    v-else
    class="flex gap-3"
    :class="isOwn ? 'flex-row-reverse' : 'flex-row'"
  >
    <!-- Avatar -->
    <div
      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
      :class="isOwn ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600'"
    >
      {{ avatarLetter }}
    </div>

    <!-- Bubble -->
    <div
      :class="isOwn ? 'items-end' : 'items-start'"
      class="flex max-w-[70%] flex-col gap-1"
    >
      <span
        v-if="!isOwn"
        class="text-xs font-semibold text-slate-500"
      >
        {{ message.nick }}
      </span>
      <div
        class="rounded-2xl px-4 py-2 text-sm leading-relaxed"
        :class="
          isOwn
            ? 'rounded-tr-sm bg-emerald-500 text-white'
            : 'rounded-tl-sm bg-slate-100 text-slate-800'
        "
      >
        {{ cleanContent }}
      </div>
      <span class="text-[10px] text-slate-400">{{ timeString }}</span>
    </div>
  </div>
</template>
