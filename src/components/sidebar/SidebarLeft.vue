<script setup>
  import ServerList from './ServerList.vue';
  import ChannelList from './ChannelList.vue';
</script>

<template>
  <div class="flex w-72 flex-col bg-slate-800">
    <!-- Logo -->
    <div class="flex items-center gap-3 px-5 py-5">
      <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          class="h-5 w-5 text-white"
        >
          <path
            fill-rule="evenodd"
            d="M3.43 2.524A41.29 41.29 0 0 1 10 2c2.236 0 4.43.18 6.57.524 1.437.231 2.43 1.49 2.43 2.902v5.148c0 1.413-.993 2.67-2.43 2.902a41.102 41.102 0 0 1-3.55.414c-.28.02-.521.18-.643.413l-1.712 3.293a.75.75 0 0 1-1.33 0l-1.713-3.293a.783.783 0 0 0-.642-.413 41.108 41.108 0 0 1-3.55-.414C1.993 13.245 1 11.986 1 10.574V5.426c0-1.413.993-2.67 2.43-2.902Z"
            clip-rule="evenodd"
          />
        </svg>
      </div>
      <div class="flex flex-col">
        <span class="text-sm font-bold text-white">GhostMesh</span>
        <span class="text-[10px] text-slate-500">IRC Client</span>
      </div>
    </div>

    <!-- Servers -->
    <div class="px-2 pb-4">
      <ServerList />
    </div>

    <!-- Divider -->
    <div class="mx-4 border-t border-slate-700" />

    <!-- Channels -->
    <div class="flex flex-1 flex-col overflow-hidden px-2 pt-4">
      <ChannelList />
    </div>
  </div>
</template>
