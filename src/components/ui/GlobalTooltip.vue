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

  function hide() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    visible.value = false;
    currentTarget = null;
  }

  /**
   * Handle pointer movement over the document.
   * Uses a single `pointermove` listener instead of mouseenter/mouseleave pairs,
   * which avoids missed events on fast mouse movement.
   */
  function onPointerMove(e: PointerEvent) {
    const target = (e.target as HTMLElement)?.closest?.('[data-tooltip]') as HTMLElement | null;

    if (target) {
      // Over a tooltip element
      if (target !== currentTarget) {
        // Entered a new tooltip element
        hide();
        currentTarget = target;
        const tipText = target.getAttribute('data-tooltip');
        if (!tipText) return;

        x.value = e.clientX;
        y.value = e.clientY;
        text.value = tipText;

        const delay = parseInt(target.getAttribute('data-tooltip-delay') || '0', 10);
        if (delay > 0) {
          timer = setTimeout(() => {
            visible.value = true;
          }, delay);
        } else {
          visible.value = true;
        }
      }
      // Still over the same target — do nothing (position stays at entry point)
    } else if (currentTarget) {
      // Moved away from a tooltip element
      hide();
    }
  }

  let lastCheck = 0;

  /** Throttled wrapper — checks at most every 30ms. */
  function onPointerMoveThrottled(e: PointerEvent) {
    const now = e.timeStamp;
    if (now - lastCheck < 30) return;
    lastCheck = now;
    onPointerMove(e);
  }

  onMounted(() => {
    document.addEventListener('pointermove', onPointerMoveThrottled, { passive: true });
  });

  onUnmounted(() => {
    document.removeEventListener('pointermove', onPointerMoveThrottled);
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
        class="pointer-events-none fixed z-[200] rounded-md bg-surface-tooltip px-2.5 py-1.5 text-xs leading-relaxed text-text-tooltip shadow-lg [text-wrap:balance]"
        :style="getStyle()"
      >
        {{ text }}
      </div>
    </Transition>
  </Teleport>
</template>
