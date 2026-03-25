<script setup>
  import { computed } from 'vue';
  import { useIrcStore } from '@/stores/irc.js';
  import { useServerSettingsStore } from '@/stores/server-settings.js';
  import { parseFormatting, stripFormatting, hasFormatting } from '@/utils/mirc-format.js';
  import { formatPlainContent, formatHtmlContent } from '@/utils/message-format.js';
  import InfoTooltip from '@/components/ui/InfoTooltip.vue';

  const props = defineProps({
    message: { type: Object, required: true },
  });

  const store = useIrcStore();
  const settingsStore = useServerSettingsStore();

  const isOwn = computed(() => props.message.nick === store.nickname);
  const isSystem = computed(() => ['system', 'join', 'part', 'quit'].includes(props.message.type));

  const timeString = computed(() => {
    const d = new Date(props.message.timestamp);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  });

  const avatarLetter = computed(() => (props.message.nick || '?')[0].toUpperCase());

  /** Whether mIRC rendering is active for this message's server. */
  const mircEnabled = computed(() => {
    const serverId = props.message.serverId;
    const detected = hasFormatting(props.message.content);
    return settingsStore.isMircEnabled(serverId, detected);
  });

  /** Rendered HTML content with mIRC formatting + URL linkification. */
  const renderedHtml = computed(() => {
    if (mircEnabled.value) {
      return formatHtmlContent(parseFormatting(props.message.content));
    }
    return null;
  });

  /** Plain text content with URLs linkified (no mIRC). */
  const plainHtml = computed(() => {
    return formatPlainContent(stripFormatting(props.message.content));
  });
</script>

<template>
  <!-- System messages -->
  <div
    v-if="isSystem"
    class="flex items-stretch"
  >
    <!-- Timestamp gutter -->
    <InfoTooltip :text="timeString">
      <div class="w-6 shrink-0 cursor-default self-stretch" />
    </InfoTooltip>
    <!-- Content -->
    <div
      class="min-w-0 whitespace-pre-wrap font-mono text-xs leading-tight text-slate-400"
      v-html="renderedHtml || plainHtml"
    />
  </div>

  <!-- User messages -->
  <div
    v-else
    class="flex gap-3 py-1.5 pl-6"
    :class="isOwn ? 'flex-row-reverse pr-6' : 'flex-row'"
  >
    <div
      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
      :class="isOwn ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600'"
    >
      {{ avatarLetter }}
    </div>

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
        <span v-html="renderedHtml || plainHtml" />
      </div>
      <span class="text-[10px] text-slate-400">{{ timeString }}</span>
    </div>
  </div>
</template>
