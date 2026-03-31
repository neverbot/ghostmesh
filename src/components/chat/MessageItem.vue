<script setup lang="ts">
  import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
  import { useIrcStore } from '@/stores/irc.ts';
  import { useServerSettingsStore } from '@/stores/server-settings.ts';
  import { useUserPrefsStore } from '@/stores/user-prefs.ts';
  import { parseFormatting, stripFormatting, hasFormatting } from '@/utils/mirc-format.ts';
  import { formatPlainContent, formatHtmlContent } from '@/services/message.service.ts';
  import { resolveImageProvider } from '@/services/image-providers.ts';
  import * as imageCache from '@/services/image-cache.ts';
  import type { ChatMessage } from '@/types.ts';

  const props = defineProps<{
    message: ChatMessage;
    /** Whether this message's channel is currently visible. Observer only runs when true. */
    active?: boolean;
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

  /** Start observing this message for viewport intersection (lazy image loading + mark-read). */
  function startObserver() {
    if (observer || previewReady.value || !messageEl.value) return;
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
  }

  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  onMounted(() => {
    if (props.active !== false) startObserver();
  });

  // Start/stop observer when channel becomes active/inactive
  watch(
    () => props.active,
    (val) => {
      if (val !== false) startObserver();
      else stopObserver();
    },
  );

  onUnmounted(stopObserver);

  const isOwn = computed(() => !!props.message.own);
  const isSystem = computed(() =>
    ['system', 'join', 'part', 'quit', 'nick'].includes(props.message.type),
  );

  const timeString = computed(() => {
    const d = new Date(props.message.timestamp);
    const time = d.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
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
    <div
      class="w-6 shrink-0 cursor-default self-stretch"
      :data-tooltip="timeString"
    />
    <div
      class="min-w-0 whitespace-pre-wrap font-mono text-xs leading-tight text-slate-400"
      v-html="renderedHtml || plainHtml"
    />
  </div>

  <!-- User message content (rendered inside a group bubble by MessageList) -->
  <div
    v-else
    ref="messageEl"
    class="px-3 py-1 text-sm leading-relaxed"
  >
    <span
      :class="isOwn ? '[&_img]:ml-auto' : ''"
      v-html="renderedHtml || plainHtml"
    />
  </div>
</template>
