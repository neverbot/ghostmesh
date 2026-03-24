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
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  });

  const avatarLetter = computed(() => {
    return (props.message.nick || '?')[0].toUpperCase();
  });
</script>

<template>
  <div
    v-if="isSystem"
    class="flex justify-center py-1"
  >
    <span class="text-xs text-slate-400 italic">{{ message.content }}</span>
  </div>

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
        {{ message.content }}
      </div>
      <span class="text-[10px] text-slate-400">{{ timeString }}</span>
    </div>
  </div>
</template>
