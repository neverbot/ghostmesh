<script setup lang="ts">
  import { computed, ref, onMounted, onUnmounted } from 'vue';
  import { useIrcStore } from '@/stores/irc.ts';
  import { useServerSettingsStore } from '@/stores/server-settings.ts';
  import { useUserPrefsStore } from '@/stores/user-prefs.ts';
  import { parseFormatting, stripFormatting, hasFormatting } from '@/utils/mirc-format.ts';
  import { formatPlainContent, formatHtmlContent } from '@/services/message.service.ts';
  import { resolveImageProvider } from '@/services/image-providers.ts';
  import * as imageCache from '@/services/image-cache.ts';
  import InfoTooltip from '@/components/ui/InfoTooltip.vue';
  import type { ChatMessage } from '@/types.ts';

  const props = defineProps<{
    message: ChatMessage;
  }>();

  const emit = defineEmits<{
    'message-seen': [payload: { serverId: string; channel: string; timestamp: Date }];
  }>();

  const store = useIrcStore();
  const settingsStore = useServerSettingsStore();
  const userPrefs = useUserPrefsStore();

  const messageEl = ref<HTMLElement | null>(null);
  const previewReady = ref(false);

  let observer: IntersectionObserver | null = null;

  onMounted(() => {
    if (!messageEl.value) return;
    observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !previewReady.value) {
          const text = props.message.content || '';
          const urlMatches = text.match(/(?:https?:\/\/|www\.)[^\s<>"'()]+/gi);
          if (urlMatches) {
            for (const u of urlMatches) {
              const normalized = u.startsWith('www.') ? `https://${u}` : u;
              const resolved = resolveImageProvider(normalized);
              if (resolved && resolved.imageUrl.startsWith('async:')) {
                imageCache.get(resolved.imageUrl);
              }
            }
          }
          previewReady.value = true;
          if (props.message.type === 'message') {
            emit('message-seen', {
              serverId: props.message.serverId,
              channel: props.message.channel,
              timestamp: props.message.timestamp,
            });
          }
          observer?.disconnect();
          observer = null;
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(messageEl.value);
  });

  onUnmounted(() => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  });

  const isOwn = computed(() => !!props.message.own);
  const isSystem = computed(() =>
    ['system', 'join', 'part', 'quit', 'nick'].includes(props.message.type),
  );

  const timeString = computed(() => {
    const d = new Date(props.message.timestamp);
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (props.message.numericCode) return `${time}  [${props.message.numericCode}]`;
    return time;
  });

  const mircEnabled = computed(() => {
    const serverId = props.message.serverId;
    const detected = hasFormatting(props.message.content);
    return settingsStore.isMircEnabled(serverId, detected);
  });

  const canResolveImages = computed(
    () =>
      previewReady.value && !userPrefs.isPreviewHidden(props.message.serverId, props.message.nick),
  );

  const renderedHtml = computed(() => {
    if (mircEnabled.value) {
      return formatHtmlContent(parseFormatting(props.message.content), {
        resolveImages: canResolveImages.value,
      });
    }
    return null;
  });

  const plainHtml = computed(() => {
    return formatPlainContent(stripFormatting(props.message.content), {
      resolveImages: canResolveImages.value,
    });
  });
</script>

<template>
  <!-- System messages -->
  <div
    v-if="isSystem"
    ref="messageEl"
    class="flex items-stretch"
  >
    <InfoTooltip :text="timeString">
      <div class="w-6 shrink-0 cursor-default self-stretch" />
    </InfoTooltip>
    <div
      class="min-w-0 whitespace-pre-wrap font-mono text-xs leading-tight text-slate-400"
      v-html="renderedHtml || plainHtml"
    />
  </div>

  <!-- User message content (rendered inside a group bubble by MessageList) -->
  <div
    v-else
    ref="messageEl"
    class="text-sm leading-relaxed"
  >
    <InfoTooltip :text="timeString">
      <div class="px-3 py-1">
        <span
          :class="isOwn ? '[&_img]:ml-auto' : ''"
          v-html="renderedHtml || plainHtml"
        />
      </div>
    </InfoTooltip>
  </div>
</template>
