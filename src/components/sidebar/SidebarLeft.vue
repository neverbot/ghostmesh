<script setup lang="ts">
  import { ref, computed } from 'vue';
  import ServerTree from './ServerTree.vue';
  import UserProfile from './UserProfile.vue';
  import UserSettingsModal from '@/components/ui/UserSettingsModal.vue';
  import { i18n, setLocale, AVAILABLE_LOCALES } from '@/i18n/index.ts';

  const userSettingsOpen = ref(false);

  const currentLocale = computed(() => i18n.global.locale.value);

  /** Cycle to the next available locale. */
  function toggleLocale() {
    const idx = AVAILABLE_LOCALES.indexOf(currentLocale.value);
    const next = AVAILABLE_LOCALES[(idx + 1) % AVAILABLE_LOCALES.length];
    setLocale(next);
  }
</script>

<template>
  <div class="flex w-72 flex-col bg-slate-800">
    <!-- Logo -->
    <div class="flex items-center gap-3 px-5 py-5">
      <img
        :src="'/logo.svg'"
        alt="GhostMesh"
        class="h-9 w-9 rounded-lg"
      />
      <div class="flex flex-col">
        <span class="text-sm font-bold text-white">GhostMesh</span>
        <span class="text-[10px] text-slate-500">{{ $t('sidebar.ircClient') }}</span>
      </div>
    </div>

    <!-- User profile -->
    <UserProfile @open-settings="userSettingsOpen = true" />
    <div class="mx-3 my-2 border-t border-slate-700" />

    <!-- Server tree: servers + channels unified -->
    <div class="flex flex-1 flex-col overflow-hidden px-2 pt-1">
      <ServerTree />
    </div>

    <!-- Language toggle -->
    <div class="flex justify-end px-4 pb-2">
      <button
        class="text-[10px] uppercase tracking-wider text-slate-600 transition-colors hover:text-slate-400"
        :title="$t('settings.global.language')"
        @click="toggleLocale"
      >
        {{ currentLocale }}
      </button>
    </div>

    <!-- User settings modal (teleports to body) -->
    <UserSettingsModal
      :open="userSettingsOpen"
      @close="userSettingsOpen = false"
    />
  </div>
</template>
