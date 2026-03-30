<script setup lang="ts">
  import { ref, computed } from 'vue';

  const props = withDefaults(
    defineProps<{
      text: string;
      delay?: number;
      maxWidth?: number;
    }>(),
    {
      delay: 0,
      maxWidth: 220,
    },
  );

  const visible = ref(false);
  const x = ref(0);
  const y = ref(0);
  let timer: ReturnType<typeof setTimeout> | null = null;

  /** Tooltip position clamped to viewport. */
  const tooltipStyle = computed(() => {
    const margin = 8;
    const tooltipW = props.maxWidth;
    const tooltipH = 60; // estimated max height

    let left = x.value + 12;
    let top = y.value - 8;

    // Clamp right edge
    if (left + tooltipW > window.innerWidth - margin) {
      left = x.value - tooltipW - 12;
      if (left < margin) left = margin;
    }

    // Clamp bottom edge
    if (top + tooltipH > window.innerHeight - margin) {
      top = y.value - tooltipH - 8;
    }

    // Clamp top edge
    if (top < margin) top = margin;

    return {
      left: left + 'px',
      top: top + 'px',
      maxWidth: tooltipW + 'px',
      width: 'fit-content',
    };
  });

  function onEnter(e: MouseEvent) {
    x.value = e.clientX;
    y.value = e.clientY;
    if (props.delay > 0) {
      timer = setTimeout(() => {
        visible.value = true;
      }, props.delay);
    } else {
      visible.value = true;
    }
  }

  function onMove(e: MouseEvent) {
    x.value = e.clientX;
    y.value = e.clientY;
  }

  function onLeave() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    visible.value = false;
  }
</script>

<template>
  <div
    class="flex self-stretch"
    @mouseenter="onEnter"
    @mousemove="onMove"
    @mouseleave="onLeave"
  >
    <slot />
    <Teleport to="body">
      <Transition
        enter-active-class="transition-opacity duration-150"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition-opacity duration-100"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="visible"
          class="pointer-events-none fixed z-[100] rounded-md bg-surface-tooltip px-2.5 py-1.5 text-xs leading-relaxed text-text-tooltip shadow-lg [text-wrap:balance]"
          :style="tooltipStyle"
        >
          {{ text }}
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
