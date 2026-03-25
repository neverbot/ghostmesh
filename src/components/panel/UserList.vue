<script setup>
  import { useIrcStore } from '@/stores/irc.js';

  const store = useIrcStore();
</script>

<template>
  <div class="flex flex-1 flex-col overflow-hidden pt-4">
    <h3 class="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
      Members
      <span
        v-if="store.currentUsers.length"
        class="ml-1 text-slate-500"
      >
        {{ store.currentUsers.length }}
      </span>
    </h3>

    <div
      class="flex-1 overflow-y-auto pb-8 [mask-image:linear-gradient(to_bottom,black_calc(100%-2rem),transparent)]"
    >
      <div
        v-for="user in store.currentUsers"
        :key="user"
        class="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-100"
      >
        <div
          class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-500"
        >
          {{ user[0].toUpperCase() }}
        </div>
        <span class="truncate text-sm text-slate-600">{{ user }}</span>
      </div>
    </div>

    <div
      v-if="store.currentUsers.length === 0"
      class="py-6 text-center text-xs text-slate-400"
    >
      No users
    </div>
  </div>
</template>
