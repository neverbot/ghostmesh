<script setup lang="ts">
  import { computed, ref, onMounted, onUnmounted } from 'vue';
  import { useIrcStore } from '@/stores/irc.ts';

  const props = defineProps<{
    /** Message content to forward. */
    content: string;
    /** Menu position X. */
    x: number;
    /** Menu position Y. */
    y: number;
    /** Whether the menu is open. */
    open: boolean;
  }>();

  const emit = defineEmits<{
    close: [];
  }>();

  const store = useIrcStore();
  const menuEl = ref<HTMLElement | null>(null);

  /** All joined channels across all servers, excluding current. */
  const destinations = computed(() => {
    const result: { serverId: string; serverName: string; channel: string; label: string; isDM: boolean }[] = [];
    const multiServer = store.connectedServers.length > 1;
    for (const entry of store.allJoinedChannels) {
      // Skip status channels
      if (entry.channel === '*status') continue;
      // Skip current channel
      if (entry.serverId === store.selectedServerId && entry.channel === store.selectedChannel) continue;
      result.push({
        serverId: entry.serverId,
        serverName: entry.serverName,
        channel: entry.channel,
        label: entry.isDM ? `@ ${entry.channel}` : entry.channel,
        isDM: entry.isDM,
      });
    }
    // Sort: channels first, then DMs
    result.sort((a, b) => {
      if (a.isDM !== b.isDM) return a.isDM ? 1 : -1;
      return a.channel.localeCompare(b.channel);
    });
    return result;
  });

  const multiServer = computed(() => store.connectedServers.length > 1);

  /** Forward to a destination: navigate and prefill input. */
  function forward(dest: { serverId: string; channel: string }) {
    store.selectChannel(dest.serverId, dest.channel);
    store.prefillMessage = props.content;
    emit('close');
  }

  /** Close on click outside. */
  function onClickOutside(e: MouseEvent) {
    if (menuEl.value && !menuEl.value.contains(e.target as Node)) {
      emit('close');
    }
  }

  onMounted(() => {
    document.addEventListener('mousedown', onClickOutside);
  });
  onUnmounted(() => {
    document.removeEventListener('mousedown', onClickOutside);
  });
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && destinations.length > 0"
      ref="menuEl"
      class="fixed z-[200] w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
      :style="{ left: `${x}px`, top: `${y}px` }"
    >
      <div class="border-b border-slate-100 px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-slate-400">
        Forward to
      </div>
      <div class="max-h-48 overflow-y-auto py-1">
        <button
          v-for="dest in destinations"
          :key="`${dest.serverId}:${dest.channel}`"
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-600 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
          @click="forward(dest)"
        >
          <span class="truncate">{{ dest.label }}</span>
          <span
            v-if="multiServer"
            class="ml-auto shrink-0 rounded bg-slate-100 px-1 py-0.5 text-[8px] text-slate-400"
          >
            {{ dest.serverName.slice(0, 2).toUpperCase() }}
          </span>
        </button>
      </div>
    </div>
  </Teleport>
</template>
