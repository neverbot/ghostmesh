<script setup lang="ts">
  import { ref, computed, watch, nextTick } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useUserSettingsStore } from '@/stores/user-settings.ts';
  import { useServerSettingsStore } from '@/stores/server-settings.ts';
  import { useUserPrefsStore } from '@/stores/user-prefs.ts';
  import { useIrcStore } from '@/stores/irc.ts';
  import InfoTooltip from '@/components/ui/InfoTooltip.vue';
  import type { UserProfile } from '@/stores/user-settings.ts';
  import { privateProviders as privateUploadProviders } from '@/services/upload-providers.ts';
  import { setLocale } from '@/i18n/index.ts';

  const backdrop = ref<HTMLElement | null>(null);

  const props = withDefaults(
    defineProps<{
      open?: boolean;
    }>(),
    {
      open: false,
    },
  );

  const emit = defineEmits<{
    close: [];
  }>();

  const userSettings = useUserSettingsStore();
  const serverSettings = useServerSettingsStore();
  const userPrefs = useUserPrefsStore();
  const ircStore = useIrcStore();
  const { t } = useI18n();
  const activeTab = ref('profile');

  const globalTabs = computed(() => [
    { key: 'profile', label: t('tabs.profile') },
    { key: 'general', label: t('tabs.general') },
    { key: 'identity', label: t('tabs.identity') },
    { key: 'image uploads', label: t('tabs.imageUploads') },
  ]);
  const confirmForget = ref(false);

  const presetColors = [
    '#10b981',
    '#3b82f6',
    '#8b5cf6',
    '#ec4899',
    '#f59e0b',
    '#ef4444',
    '#06b6d4',
    '#84cc16',
    '#f97316',
    '#6366f1',
  ];

  const form = ref<Partial<UserProfile>>({});

  // Load form values when opening
  watch(
    () => props.open,
    (val) => {
      if (val) {
        const profile = userSettings.getProfile();
        form.value = { ...profile };
        confirmForget.value = false;
        nextTick(() => backdrop.value?.focus());
      }
    },
    { immediate: true },
  );

  function save() {
    const oldNick = userSettings.settings.nickname;
    const newNick = form.value.nickname;

    userSettings.updateProfile(form.value);

    // If nickname changed and we're connected, update on servers using global nick
    if (newNick && newNick !== oldNick && ircStore.activeConnections.length > 0) {
      ircStore.changeNickGlobal(newNick);
    }

    // Apply locale change immediately
    if (form.value.locale) {
      setLocale(form.value.locale);
    }

    emit('close');
  }

  function close() {
    emit('close');
  }

  /** Update the clearOnClose preference. */
  function onClearOnCloseChange(checked: boolean) {
    if (!form.value.globalPrefs) form.value.globalPrefs = {};
    form.value.globalPrefs.clearOnClose = checked;
  }

  /** Update a provider key in the form. */
  function onProviderKeyInput(configKey: string, value: string) {
    if (!form.value.uploadProviderKeys) {
      form.value.uploadProviderKeys = {};
    }
    form.value.uploadProviderKeys[configKey] = value;
  }

  function handleForgetMe() {
    if (!confirmForget.value) {
      confirmForget.value = true;
      return;
    }
    confirmForget.value = false;
    // Clear all user data from all stores and localStorage
    userSettings.clearAll();
    serverSettings.clearAll();
    userPrefs.clearAll();
    // Clear session
    localStorage.removeItem('ghostmesh:session');
    // Reset display nickname if not connected to any server
    if (ircStore.activeConnections.length === 0) {
      ircStore.nickname = '';
    }
    // Reset form to defaults
    form.value = { ...userSettings.getProfile() };
    emit('close');
  }
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      ref="backdrop"
      class="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[15vh]"
      tabindex="0"
      @keydown.escape="close"
      @click.self="close"
    >
      <div class="w-full max-w-md rounded-xl bg-slate-800 shadow-2xl">
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-slate-700 px-5 py-4">
          <div>
            <h3 class="text-sm font-bold text-white">{{ $t('settings.global.title') }}</h3>
            <p class="text-xs text-slate-500">{{ $t('settings.global.subtitle') }}</p>
          </div>
          <button
            class="rounded p-1 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
            @click="close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              class="h-4 w-4"
            >
              <path
                d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z"
              />
            </svg>
          </button>
        </div>

        <!-- Tabs -->
        <div class="flex border-b border-slate-700 px-5">
          <button
            v-for="tab in globalTabs"
            :key="tab.key"
            class="border-b-2 px-3 py-2.5 text-xs font-medium transition-colors"
            :class="
              activeTab === tab.key
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-300'
            "
            @click="activeTab = tab.key"
          >
            {{ tab.label }}
          </button>
        </div>

        <!-- Tab content -->
        <div class="px-5 py-4">
          <!-- General tab -->
          <div
            v-if="activeTab === 'general'"
            class="flex flex-col gap-4"
          >
            <p class="text-[10px] text-slate-500">{{ $t('settings.global.generalBehavior') }}</p>

            <label class="flex items-center gap-2">
              <input
                type="checkbox"
                :checked="form.globalPrefs?.clearOnClose !== false"
                class="rounded border-slate-600"
                @change="onClearOnCloseChange(($event.target as HTMLInputElement).checked)"
              />
              <span class="text-xs text-slate-300">{{ $t('settings.global.clearOnClose') }}</span>
            </label>
            <p class="text-[10px] text-slate-500">
              {{ $t('settings.global.clearOnCloseDescription') }}
            </p>
          </div>

          <!-- Profile tab -->
          <div
            v-if="activeTab === 'profile'"
            class="flex flex-col gap-4"
          >
            <!-- Language -->
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium text-slate-300">{{ $t('settings.global.language') }}</label>
              <select
                v-model="form.locale"
                class="w-40 rounded-md border border-slate-600 bg-slate-700/50 px-3 py-1.5 text-sm text-slate-300 outline-none focus:border-emerald-500"
              >
                <option value="en">English</option>
                <option value="es">Español</option>
              </select>
            </div>

            <!-- Nickname -->
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium text-slate-300">{{
                $t('settings.global.nickname')
              }}</label>
              <p class="text-[10px] text-slate-500">
                {{ $t('settings.global.nicknameDescription') }}
              </p>
              <input
                v-model="form.nickname"
                type="text"
                :placeholder="$t('settings.global.nicknamePlaceholder')"
                class="w-56 rounded-md border border-slate-600 bg-slate-700/50 px-3 py-1.5 text-sm text-slate-300 outline-none placeholder:text-slate-500 focus:border-emerald-500"
              />
            </div>

            <!-- Username -->
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium text-slate-300">{{
                $t('settings.global.username')
              }}</label>
              <p class="text-[10px] text-slate-500">
                {{ $t('settings.global.usernameDescription') }}
              </p>
              <input
                v-model="form.username"
                type="text"
                :placeholder="$t('settings.global.usernamePlaceholder')"
                class="w-56 rounded-md border border-slate-600 bg-slate-700/50 px-3 py-1.5 text-sm text-slate-300 outline-none placeholder:text-slate-500 focus:border-emerald-500"
              />
            </div>

            <!-- Real Name -->
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium text-slate-300">{{
                $t('settings.global.realname')
              }}</label>
              <p class="text-[10px] text-slate-500">
                {{ $t('settings.global.realnameDescription') }}
              </p>
              <input
                v-model="form.realname"
                type="text"
                :placeholder="$t('settings.global.realnamePlaceholder')"
                class="w-full rounded-md border border-slate-600 bg-slate-700/50 px-3 py-1.5 text-sm text-slate-300 outline-none placeholder:text-slate-500 focus:border-emerald-500"
              />
            </div>

            <!-- Avatar color -->
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium text-slate-300">{{
                $t('settings.global.avatarColor')
              }}</label>
              <div class="flex gap-2">
                <button
                  v-for="color in presetColors"
                  :key="color"
                  class="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110"
                  :class="
                    form.avatarColor === color ? 'border-white scale-110' : 'border-transparent'
                  "
                  :style="{ backgroundColor: color }"
                  @click="form.avatarColor = color"
                />
                <InfoTooltip
                  :text="$t('settings.global.avatarColorAuto')"
                  :delay="0"
                >
                  <button
                    class="flex h-6 w-6 items-center justify-center rounded-full border-2 text-[8px] text-slate-400 transition-transform hover:scale-110"
                    :class="!form.avatarColor ? 'border-white scale-110' : 'border-transparent'"
                    @click="form.avatarColor = ''"
                  >
                    A
                  </button>
                </InfoTooltip>
              </div>
            </div>
          </div>

          <!-- Identity tab -->
          <div
            v-if="activeTab === 'identity'"
            class="flex flex-col gap-4"
          >
            <div class="rounded-lg bg-slate-700/30 px-4 py-3">
              <p class="text-xs font-medium text-slate-400">
                {{ $t('settings.global.nickservIntegration') }}
              </p>
              <p class="mt-1 text-[10px] text-slate-500">
                {{ $t('settings.global.nickservDescription') }}
              </p>
            </div>

            <div class="flex flex-col gap-1 opacity-50">
              <label class="text-xs font-medium text-slate-300">{{
                $t('settings.global.nickservPassword')
              }}</label>
              <input
                type="password"
                disabled
                :placeholder="$t('settings.global.nickservComingSoon')"
                class="w-56 rounded-md border border-slate-600 bg-slate-700/50 px-3 py-1.5 text-sm text-slate-500 outline-none"
              />
            </div>

            <label class="flex items-center gap-2 opacity-50">
              <input
                type="checkbox"
                disabled
                class="rounded border-slate-600"
              />
              <span class="text-xs text-slate-500">{{ $t('settings.global.autoIdentify') }}</span>
            </label>
          </div>

          <!-- Uploads tab -->
          <div
            v-if="activeTab === 'image uploads'"
            class="flex flex-col gap-4 overflow-y-auto"
          >
            <p class="text-[10px] text-slate-500">
              {{ $t('settings.global.imageUploads') }}
            </p>

            <div
              v-for="provider in privateUploadProviders"
              :key="provider.configKey"
              class="flex flex-col gap-2 rounded-lg border border-slate-700 p-3"
            >
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium text-slate-300">{{ provider.configLabel }}</span>
                <div class="flex gap-3">
                  <a
                    v-if="provider.signupUrl"
                    :href="provider.signupUrl"
                    target="_blank"
                    rel="noopener"
                    class="text-[10px] text-slate-400 hover:text-slate-300"
                  >
                    {{ $t('settings.global.createAccount') }}
                  </a>
                  <a
                    :href="provider.configUrl"
                    target="_blank"
                    rel="noopener"
                    class="text-[10px] text-emerald-400 hover:text-emerald-300"
                  >
                    {{ $t('settings.global.getApiKey') }}
                  </a>
                </div>
              </div>
              <p
                class="text-[10px] text-slate-500"
                v-html="provider.configDescription"
              />
              <input
                :value="form.uploadProviderKeys?.[provider.configKey] || ''"
                type="text"
                :placeholder="$t('settings.global.enterApiKey', { provider: provider.configLabel })"
                class="w-full rounded-md border border-slate-600 bg-slate-700/50 px-3 py-1.5 font-mono text-xs text-slate-300 outline-none placeholder:text-slate-500 focus:border-emerald-500"
                @input="
                  onProviderKeyInput(provider.configKey, ($event.target as HTMLInputElement).value)
                "
              />
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-between border-t border-slate-700 px-5 py-3">
          <button
            class="rounded-lg px-3 py-1.5 text-xs transition-colors"
            :class="
              confirmForget
                ? 'bg-red-600 text-white hover:bg-red-500'
                : 'text-red-400 hover:bg-red-500/10 hover:text-red-300'
            "
            :title="
              confirmForget
                ? $t('settings.global.forgetMeConfirmTitle')
                : $t('settings.global.forgetMeTitle')
            "
            @click="handleForgetMe"
          >
            {{ confirmForget ? $t('common.confirmErase') : $t('settings.global.forgetMe') }}
          </button>
          <div class="flex gap-2">
            <button
              class="rounded-lg px-4 py-1.5 text-xs text-slate-400 transition-colors hover:bg-slate-700 hover:text-slate-300"
              @click="close"
            >
              {{ $t('common.cancel') }}
            </button>
            <button
              class="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-500"
              @click="save"
            >
              {{ $t('common.save') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
