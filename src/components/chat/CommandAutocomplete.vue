<script setup lang="ts">
  import { computed, ref, watch, nextTick } from 'vue';
  import type { CommandDefinition } from '@/services/command-registry.ts';
  import { getMatchingCommands } from '@/services/command-registry.ts';

  const listEl = ref<HTMLElement | null>(null);

  const props = defineProps<{
    /** Current input text from the message field. */
    input: string;
    /** Whether the input is focused. */
    focused: boolean;
  }>();

  const emit = defineEmits<{
    /** User selected a command from the list. */
    select: [command: string];
  }>();

  const selectedIndex = ref(0);

  /** Whether the autocomplete should be visible. */
  const visible = computed(() => {
    if (!props.focused) return false;
    if (!props.input.startsWith('/')) return false;
    return matches.value.length > 0;
  });

  /** Extract the command prefix being typed (without the slash). */
  const typedPrefix = computed(() => {
    if (!props.input.startsWith('/')) return null;
    const spaceIdx = props.input.indexOf(' ');
    // If there's a space, the command name is complete — hide autocomplete
    if (spaceIdx !== -1) return null;
    return props.input.slice(1);
  });

  /** Matching commands for the current prefix. */
  const matches = computed((): CommandDefinition[] => {
    if (typedPrefix.value === null) return [];
    return getMatchingCommands(typedPrefix.value);
  });

  // Reset selection when matches change
  watch(matches, () => {
    selectedIndex.value = 0;
  });

  /** Scroll the selected item into view. */
  function scrollToSelected(): void {
    nextTick(() => {
      const el = listEl.value;
      if (!el) return;
      const item = el.children[selectedIndex.value] as HTMLElement | undefined;
      item?.scrollIntoView({ block: 'nearest' });
    });
  }

  /** Move selection up. */
  function moveUp(): void {
    if (!visible.value) return;
    selectedIndex.value =
      selectedIndex.value <= 0 ? matches.value.length - 1 : selectedIndex.value - 1;
    scrollToSelected();
  }

  /** Move selection down. */
  function moveDown(): void {
    if (!visible.value) return;
    selectedIndex.value =
      selectedIndex.value >= matches.value.length - 1 ? 0 : selectedIndex.value + 1;
    scrollToSelected();
  }

  /** Confirm the current selection. */
  function confirmSelection(): boolean {
    if (!visible.value) return false;
    const cmd = matches.value[selectedIndex.value];
    if (cmd) {
      emit('select', `/${cmd.name} `);
      return true;
    }
    return false;
  }

  /** Select a command by clicking. */
  function selectItem(index: number): void {
    const cmd = matches.value[index];
    if (cmd) {
      emit('select', `/${cmd.name} `);
    }
  }

  defineExpose({ moveUp, moveDown, confirmSelection, visible });
</script>

<template>
  <div
    v-if="visible"
    class="absolute bottom-full left-4 mb-1 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
  >
    <div ref="listEl" class="max-h-56 overflow-y-auto py-1">
      <button
        v-for="(cmd, i) in matches"
        :key="cmd.name"
        class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors"
        :class="i === selectedIndex ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'"
        @mousedown.prevent="selectItem(i)"
      >
        <span class="w-14 shrink-0 font-mono font-semibold">/{{ cmd.name }}</span>
        <span class="truncate text-slate-400">{{ cmd.description }}</span>
      </button>
    </div>
  </div>
</template>
