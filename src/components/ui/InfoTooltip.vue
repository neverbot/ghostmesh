<script setup>
  defineProps({
    text: { type: String, required: true },
    position: { type: String, default: 'top' },
  });
</script>

<template>
  <div class="group relative inline-flex">
    <slot />
    <div
      class="pointer-events-none absolute z-50 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[10px] text-slate-300 opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
      :class="{
        'bottom-full left-1/2 mb-1.5 -translate-x-1/2': position === 'top',
        'top-full left-1/2 mt-1.5 -translate-x-1/2': position === 'bottom',
        'right-full top-1/2 mr-1.5 -translate-y-1/2': position === 'left',
        'left-full top-1/2 ml-1.5 -translate-y-1/2': position === 'right',
      }"
    >
      {{ text }}
    </div>
  </div>
</template>
