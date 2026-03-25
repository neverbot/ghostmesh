<script setup>
  import { ref } from 'vue';
  import ServerTree from './ServerTree.vue';
  import UserProfile from './UserProfile.vue';
  import UserSettingsModal from '@/components/ui/UserSettingsModal.vue';

  const userSettingsOpen = ref(false);
</script>

<template>
  <div class="flex w-72 flex-col bg-slate-800">
    <!-- Logo -->
    <div class="flex items-center gap-3 px-5 py-5">
      <img
        src="/logo.svg"
        alt="GhostMesh"
        class="h-9 w-9 rounded-lg"
      />
      <div class="flex flex-col">
        <span class="text-sm font-bold text-white">GhostMesh</span>
        <span class="text-[10px] text-slate-500">IRC Client</span>
      </div>
    </div>

    <!-- User profile -->
    <UserProfile @open-settings="userSettingsOpen = true" />
    <div class="mx-3 my-2 border-t border-slate-700" />

    <!-- Server tree: servers + channels unified -->
    <div class="flex flex-1 flex-col overflow-hidden px-2 pt-1">
      <ServerTree />
    </div>
  </div>

  <!-- User settings modal -->
  <UserSettingsModal
    :open="userSettingsOpen"
    @close="userSettingsOpen = false"
  />
</template>
