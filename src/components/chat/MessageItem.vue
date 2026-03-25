<script setup>
  import { computed, ref, onMounted, onUnmounted } from 'vue';
  import { useIrcStore } from '@/stores/irc.js';
  import { useServerSettingsStore } from '@/stores/server-settings.js';
  import { useUserPrefsStore } from '@/stores/user-prefs.js';
  import { parseFormatting, stripFormatting, hasFormatting } from '@/utils/mirc-format.js';
  import { formatPlainContent, formatHtmlContent, isImageUrl } from '@/services/message.service.js';
  import { resolveImageProvider } from '@/services/image-providers.js';
  import InfoTooltip from '@/components/ui/InfoTooltip.vue';

  const props = defineProps({
    message: { type: Object, required: true },
  });

  const emit = defineEmits(['user-click', 'message-seen']);

  const store = useIrcStore();
  const settingsStore = useServerSettingsStore();
  const userPrefs = useUserPrefsStore();

  /** Root element ref for IntersectionObserver. */
  const messageEl = ref(null);
  /** True once the message has been visible in the viewport. */
  const previewReady = ref(false);

  let observer = null;

  onMounted(() => {
    if (!messageEl.value) return;
    observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !previewReady.value) {
          previewReady.value = true;
          // Notify parent that this message has been seen (for unread tracking)
          if (props.message.type === 'message') {
            emit('message-seen', {
              serverId: props.message.serverId,
              channel: props.message.channel,
              timestamp: props.message.timestamp,
            });
          }
          observer.disconnect();
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

  const isOwn = computed(() => props.message.nick === store.nickname);
  const isSystem = computed(() =>
    ['system', 'join', 'part', 'quit', 'nick'].includes(props.message.type),
  );

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
  function onUserClick(e) {
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
    class="flex gap-3 py-1.5 pl-6"
    :class="isOwn ? 'flex-row-reverse pr-6' : 'flex-row'"
  >
    <div
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
      :class="[isOwn ? 'items-end' : 'items-start', hasImage ? 'max-w-[75%]' : 'max-w-[70%]']"
      class="flex flex-col gap-1"
    >
      <span
        v-if="!isOwn"
        class="cursor-pointer text-xs font-semibold text-slate-500 hover:text-slate-700"
        @click="onUserClick($event)"
      >
        {{ message.nick }}
      </span>
      <div
        class="rounded-2xl p-3 text-sm leading-relaxed transition-colors duration-500"
        :class="bubbleClass"
      >
        <span
          :class="isOwn ? '[&_img]:ml-auto' : ''"
          v-html="renderedHtml || plainHtml"
        />
      </div>
      <div class="flex items-center gap-1.5">
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
