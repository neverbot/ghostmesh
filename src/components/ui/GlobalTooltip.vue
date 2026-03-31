<script setup lang="ts">
  import { ref, onMounted, onUnmounted } from 'vue';

  const visible = ref(false);
  const text = ref('');
  const x = ref(0);
  const y = ref(0);
  const maxWidth = 220;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let currentTarget: HTMLElement | null = null;

  /** Clamp tooltip position to viewport. */
  function getStyle() {
    const margin = 8;
    const tooltipW = maxWidth;
    const tooltipH = 60;

    let left = x.value + 12;
    let top = y.value - 8;

    if (left + tooltipW > window.innerWidth - margin) {
      left = x.value - tooltipW - 12;
      if (left < margin) left = margin;
    }
    if (top + tooltipH > window.innerHeight - margin) {
      top = y.value - tooltipH - 8;
    }
    if (top < margin) top = margin;

    return {
      left: left + 'px',
      top: top + 'px',
      maxWidth: tooltipW + 'px',
      width: 'max-content',
    };
  }

  /** Find the closest element with data-tooltip from the event target. */
  function findTooltipEl(e: Event): HTMLElement | null {
    const target = e.target as HTMLElement;
    return target?.closest?.('[data-tooltip]') as HTMLElement | null;
  }

  function onEnter(e: Event) {
    const el = findTooltipEl(e);
    if (!el) return;

    const tipText = el.getAttribute('data-tooltip');
    if (!tipText) return;

    currentTarget = el;
    const mouseEvent = e as MouseEvent;
    x.value = mouseEvent.clientX;
    y.value = mouseEvent.clientY;
    text.value = tipText;

    const delay = parseInt(el.getAttribute('data-tooltip-delay') || '0', 10);
    if (delay > 0) {
      timer = setTimeout(() => {
        visible.value = true;
      }, delay);
    } else {
      visible.value = true;
    }
  }

  function onMove(e: MouseEvent) {
    if (!currentTarget) return;
    x.value = e.clientX;
    y.value = e.clientY;
  }

  function onLeave(e: Event) {
    const el = findTooltipEl(e);
    if (el && el === currentTarget) {
      hide();
    }
  }

  function hide() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    visible.value = false;
    currentTarget = null;
  }

  onMounted(() => {
    document.addEventListener('mouseenter', onEnter, true);
    document.addEventListener('mouseleave', onLeave, true);
    document.addEventListener('mousemove', onMove, { passive: true });
  });

  onUnmounted(() => {
    document.removeEventListener('mouseenter', onEnter, true);
    document.removeEventListener('mouseleave', onLeave, true);
    document.removeEventListener('mousemove', onMove);
    hide();
  });
</script>

<template>
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
        :style="getStyle()"
      >
        {{ text }}
      </div>
    </Transition>
  </Teleport>
</template>
