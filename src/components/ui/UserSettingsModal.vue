<script setup lang="ts">
  import { ref, watch, nextTick } from 'vue';
  import { useUserSettingsStore } from '@/stores/user-settings.ts';
  import { useServerSettingsStore } from '@/stores/server-settings.ts';
  import { useUserPrefsStore } from '@/stores/user-prefs.ts';
  import { useIrcStore } from '@/stores/irc.ts';
  import InfoTooltip from '@/components/ui/InfoTooltip.vue';
  import type { UserProfile } from '@/stores/user-settings.ts';
  import { privateProviders as privateUploadProviders } from '@/services/upload-providers.ts';

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
  const activeTab = ref('general');
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
            <h3 class="text-sm font-bold text-white">Global Settings</h3>
            <p class="text-xs text-slate-500">Your IRC identity</p>
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
            v-for="tab in ['general', 'profile', 'identity', 'image uploads']"
            :key="tab"
            class="border-b-2 px-3 py-2.5 text-xs font-medium capitalize transition-colors"
            :class="
              activeTab === tab
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-300'
            "
            @click="activeTab = tab"
          >
            {{ tab }}
          </button>
        </div>

        <!-- Tab content -->
        <div class="px-5 py-4">
          <!-- General tab -->
          <div
            v-if="activeTab === 'general'"
            class="flex flex-col gap-4"
          >
            <p class="text-[10px] text-slate-500">General application behavior.</p>

            <label class="flex items-center gap-2">
              <input
                type="checkbox"
                :checked="form.globalPrefs?.clearOnClose !== false"
                class="rounded border-slate-600"
                @change="onClearOnCloseChange(($event.target as HTMLInputElement).checked)"
              />
              <span class="text-xs text-slate-300">Clear channel data when closing</span>
            </label>
            <p class="text-[10px] text-slate-500">
              When enabled, messages, user lists and topics are removed from memory when you close a
              channel or conversation. Disable to keep history until the page is reloaded.
            </p>
          </div>

          <!-- Profile tab -->
          <div
            v-if="activeTab === 'profile'"
            class="flex flex-col gap-4"
          >
            <!-- Nickname -->
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium text-slate-300">Nickname</label>
              <p class="text-[10px] text-slate-500">
                Your display name on IRC servers. Leave empty for a random name.
              </p>
              <input
                v-model="form.nickname"
                type="text"
                placeholder="ghostmesh_xxx (random)"
                class="w-56 rounded-md border border-slate-600 bg-slate-700/50 px-3 py-1.5 text-sm text-slate-300 outline-none placeholder:text-slate-500 focus:border-emerald-500"
              />
            </div>

            <!-- Username -->
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium text-slate-300">Username</label>
              <p class="text-[10px] text-slate-500">
                Sent during registration. Only takes effect on next connection.
              </p>
              <input
                v-model="form.username"
                type="text"
                placeholder="ghostmesh"
                class="w-56 rounded-md border border-slate-600 bg-slate-700/50 px-3 py-1.5 text-sm text-slate-300 outline-none placeholder:text-slate-500 focus:border-emerald-500"
              />
            </div>

            <!-- Real Name -->
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium text-slate-300">Real Name</label>
              <p class="text-[10px] text-slate-500">
                Visible in WHOIS. Only takes effect on next connection.
              </p>
              <input
                v-model="form.realname"
                type="text"
                placeholder="GhostMesh IRC Client"
                class="w-full rounded-md border border-slate-600 bg-slate-700/50 px-3 py-1.5 text-sm text-slate-300 outline-none placeholder:text-slate-500 focus:border-emerald-500"
              />
            </div>

            <!-- Avatar color -->
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium text-slate-300">Avatar color</label>
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
                  text="Auto (from nickname)"
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
              <p class="text-xs font-medium text-slate-400">NickServ Integration</p>
              <p class="mt-1 text-[10px] text-slate-500">
                Automatic identification with NickServ will be available in a future update.
              </p>
            </div>

            <div class="flex flex-col gap-1 opacity-50">
              <label class="text-xs font-medium text-slate-300">NickServ password</label>
              <input
                type="password"
                disabled
                placeholder="Coming soon"
                class="w-56 rounded-md border border-slate-600 bg-slate-700/50 px-3 py-1.5 text-sm text-slate-500 outline-none"
              />
            </div>

            <label class="flex items-center gap-2 opacity-50">
              <input
                type="checkbox"
                disabled
                class="rounded border-slate-600"
              />
              <span class="text-xs text-slate-500">Auto-identify on connect</span>
            </label>
          </div>

          <!-- Uploads tab -->
          <div
            v-if="activeTab === 'image uploads'"
            class="flex flex-col gap-4 overflow-y-auto"
          >
            <p class="text-[10px] text-slate-500">
              Configure your own API keys for image hosting services. Your keys are stored locally
              in your browser and never sent to our servers.
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
                    Create account
                  </a>
                  <a
                    :href="provider.configUrl"
                    target="_blank"
                    rel="noopener"
                    class="text-[10px] text-emerald-400 hover:text-emerald-300"
                  >
                    Get API key
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
                :placeholder="`Enter your ${provider.configLabel} API key`"
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
                ? 'Click again to confirm — this will erase all your settings'
                : 'Erase all user data and server settings from this browser'
            "
            @click="handleForgetMe"
          >
            {{ confirmForget ? 'Confirm erase' : 'Forget me' }}
          </button>
          <div class="flex gap-2">
            <button
              class="rounded-lg px-4 py-1.5 text-xs text-slate-400 transition-colors hover:bg-slate-700 hover:text-slate-300"
              @click="close"
            >
              Cancel
            </button>
            <button
              class="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-500"
              @click="save"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
