<script setup lang="ts">
  import { computed, ref, onMounted, onUnmounted } from 'vue';
  import { useIrcStore } from '@/stores/irc.ts';
  import { useServerSettingsStore } from '@/stores/server-settings.ts';
  import { useUserPrefsStore } from '@/stores/user-prefs.ts';
  import { parseFormatting, stripFormatting, hasFormatting } from '@/utils/mirc-format.ts';
  import { formatPlainContent, formatHtmlContent, isImageUrl } from '@/services/message.service.ts';
  import { resolveImageProvider } from '@/services/image-providers.ts';
  import * as imageCache from '@/services/image-cache.ts';
  import InfoTooltip from '@/components/ui/InfoTooltip.vue';
  import config from '@/config.ts';
  import type { ChatMessage, UserClickPayload } from '@/types.ts';

  const props = defineProps<{
    message: ChatMessage;
    prevMessage?: ChatMessage;
    nextMessage?: ChatMessage;
  }>();

  const emit = defineEmits<{
    'user-click': [payload: UserClickPayload];
    'message-seen': [payload: { serverId: string; channel: string; timestamp: Date }];
  }>();

  const store = useIrcStore();
  const settingsStore = useServerSettingsStore();
  const userPrefs = useUserPrefsStore();

  /** Root element ref for IntersectionObserver. */
  const messageEl = ref<HTMLElement | null>(null);
  /** True once the message has been visible in the viewport. */
  const previewReady = ref(false);

  let observer: IntersectionObserver | null = null;

  onMounted(() => {
    if (!messageEl.value) return;
    observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !previewReady.value) {
          // Pre-resolve cached async markers so images render immediately
          const text = props.message.content || '';
          const urlMatches = text.match(/(?:https?:\/\/|www\.)[^\s<>"'()]+/gi);
          if (urlMatches) {
            for (const u of urlMatches) {
              const normalized = u.startsWith('www.') ? `https://${u}` : u;
              const resolved = resolveImageProvider(normalized);
              if (resolved && resolved.imageUrl.startsWith('async:')) {
                // Touch the cache entry to keep it warm
                imageCache.get(resolved.imageUrl);
              }
            }
          }
          previewReady.value = true;
          // Notify parent that this message has been seen (for unread tracking)
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

  /** Whether this message continues a group from the previous message. */
  const isGroupContinuation = computed(() => {
    const prev = props.prevMessage;
    if (!prev) return false;
    if (props.message.type !== 'message' || prev.type !== 'message') return false;
    if (props.message.nick !== prev.nick) return false;
    if (props.message.own !== prev.own) return false;
    const gap = props.message.timestamp.getTime() - prev.timestamp.getTime();
    return gap < config.chat.groupingInterval;
  });

  /** Whether this is the last message in a group. */
  const isGroupEnd = computed(() => {
    const next = props.nextMessage;
    if (!next) return true;
    if (props.message.type !== 'message' || next.type !== 'message') return true;
    if (props.message.nick !== next.nick) return true;
    if (props.message.own !== next.own) return true;
    const gap = next.timestamp.getTime() - props.message.timestamp.getTime();
    return gap >= config.chat.groupingInterval;
  });

  /** Border radius: round top on first, round bottom on last, zero on all touching edges. */
  const groupBorderRadius = computed(() => {
    const standalone = !isGroupContinuation.value && isGroupEnd.value;
    if (standalone) return 'rounded-2xl';
    const start = !isGroupContinuation.value && !isGroupEnd.value;
    const end = isGroupContinuation.value && isGroupEnd.value;
    // start: round top, flat bottom
    if (start) return 'rounded-t-2xl rounded-b-none';
    // end: flat top, round bottom
    if (end) return 'rounded-t-none rounded-b-2xl';
    // middle: all flat
    return 'rounded-none';
  });

  const timeString = computed(() => {
    const d = new Date(props.message.timestamp);
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (props.message.numericCode) return `${time}  [${props.message.numericCode}]`;
    return time;
  });

  const avatarLetter = computed(() => (props.message.nick || '?')[0].toUpperCase());

  /** Whether mIRC rendering is active for this message's server. */
  const mircEnabled = computed(() => {
    const serverId = props.message.serverId;
    const detected = hasFormatting(props.message.content);
    return settingsStore.isMircEnabled(serverId, detected);
  });

  /** Whether previews are allowed for this message's author. */
  const canResolveImages = computed(
    () =>
      previewReady.value && !userPrefs.isPreviewHidden(props.message.serverId, props.message.nick),
  );

  /** Rendered HTML content with mIRC formatting + URL linkification. */
  const renderedHtml = computed(() => {
    if (mircEnabled.value) {
      return formatHtmlContent(parseFormatting(props.message.content), {
        resolveImages: canResolveImages.value,
      });
    }
    return null;
  });

  /** Plain text content with URLs linkified (no mIRC). */
  const plainHtml = computed(() => {
    return formatPlainContent(stripFormatting(props.message.content), {
      resolveImages: canResolveImages.value,
    });
  });

  /** CSS classes for the message bubble. */
  const bubbleClass = computed(() => {
    if (isOwn.value && props.message.warning) {
      return 'rounded-tr-sm bg-bubble-warning text-white';
    }
    if (isOwn.value) {
      return 'rounded-tr-sm bg-emerald-500 text-white';
    }
    return 'rounded-tl-sm bg-slate-100 text-slate-800';
  });

  /**
   * Emit a user-click event for the context menu.
   * @param {MouseEvent} e
   */
  function onUserClick(e: MouseEvent) {
    emit('user-click', {
      nick: props.message.nick,
      serverId: props.message.serverId,
      x: e.clientX,
      y: e.clientY,
    });
  }

  /** Whether the message contains an image URL (only checks when preview ready). */
  const hasImage = computed(() => {
    if (!canResolveImages.value) return false;
    const text = props.message.content || '';
    const urlMatch = text.match(/(?:https?:\/\/|www\.)[^\s<>"'()]+/gi);
    if (!urlMatch) return false;
    return urlMatch.some((u) => {
      const normalized = u.startsWith('www.') ? `https://${u}` : u;
      return isImageUrl(u) || resolveImageProvider(normalized) !== null;
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
    ref="messageEl"
    class="flex gap-3 pl-6"
    :class="[
      isOwn ? 'flex-row-reverse pr-6' : 'flex-row',
      isGroupContinuation ? 'py-0' : 'py-1.5',
    ]"
  >
    <!-- Avatar: visible on group start, invisible spacer on continuation -->
    <div
      v-if="!isGroupContinuation"
      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
      :class="[
        isOwn ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600',
        !isOwn ? 'cursor-pointer' : '',
      ]"
      @click="!isOwn && onUserClick($event)"
    >
      {{ avatarLetter }}
    </div>
    <div
      v-else
      class="w-8 shrink-0"
    />

    <div
      :class="[isOwn ? 'items-end' : 'items-start', hasImage ? 'max-w-[75%]' : 'max-w-[70%]']"
      class="flex flex-col"
      :style="{ gap: isGroupContinuation || !isGroupEnd ? '0px' : '4px' }"
    >
      <!-- Nick: only on group start for non-own messages -->
      <span
        v-if="!isOwn && !isGroupContinuation"
        class="cursor-pointer text-xs font-semibold text-slate-500 hover:text-slate-700"
        @click="onUserClick($event)"
      >
        {{ message.nick }}
      </span>
      <div
        class="text-sm leading-relaxed transition-colors duration-500"
        :class="[
          bubbleClass,
          groupBorderRadius,
          isGroupContinuation && !isGroupEnd ? 'px-3 py-1' : '',
          isGroupContinuation && isGroupEnd ? 'px-3 pb-3 pt-1' : '',
          !isGroupContinuation && !isGroupEnd ? 'px-3 pb-1 pt-3' : '',
          !isGroupContinuation && isGroupEnd ? 'p-3' : '',
        ]"
      >
        <span
          :class="isOwn ? '[&_img]:ml-auto' : ''"
          v-html="renderedHtml || plainHtml"
        />
      </div>
      <!-- Timestamp + warning: only on group end -->
      <div
        v-if="isGroupEnd"
        class="flex items-center gap-1.5"
      >
        <span class="text-[10px] text-slate-400">{{ timeString }}</span>
        <InfoTooltip
          v-if="message.warning"
          :text="message.warning"
        >
          <span class="cursor-help text-amber-500">⚠</span>
        </InfoTooltip>
      </div>
    </div>
  </div>
</template>
