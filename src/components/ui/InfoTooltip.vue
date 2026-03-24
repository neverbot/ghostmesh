<script setup>
  import { ref } from 'vue';

  defineProps({
    text: { type: String, required: true },
  });

  const visible = ref(false);
  const x = ref(0);
  const y = ref(0);

  /** @param {MouseEvent} e */
  function onEnter(e) {
    visible.value = true;
    x.value = e.clientX;
    y.value = e.clientY;
  }

  /** @param {MouseEvent} e */
  function onMove(e) {
    x.value = e.clientX;
    y.value = e.clientY;
  }

  function onLeave() {
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
      <div
        v-if="visible"
        class="pointer-events-none fixed z-[100] whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[10px] text-slate-300 shadow-lg"
        :style="{ left: x + 12 + 'px', top: y - 8 + 'px' }"
      >
        {{ text }}
      </div>
    </Teleport>
  </div>
</template>
