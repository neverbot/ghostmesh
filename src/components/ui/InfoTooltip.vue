<script setup>
  import { ref } from 'vue';

  const props = defineProps({
    text: { type: String, required: true },
    delay: { type: Number, default: 0 },
  });

  const visible = ref(false);
  const x = ref(0);
  const y = ref(0);
  let timer = null;

  /** @param {MouseEvent} e */
  function onEnter(e) {
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

  /** @param {MouseEvent} e */
  function onMove(e) {
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
          class="pointer-events-none fixed z-[100] whitespace-nowrap rounded-md bg-surface-tooltip px-2.5 py-1 text-xs text-text-tooltip shadow-lg"
          :style="{ left: x + 12 + 'px', top: y - 8 + 'px' }"
        >
          {{ text }}
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
