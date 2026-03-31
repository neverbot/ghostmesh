<script setup lang="ts">
  import { ref, computed, watch, nextTick } from 'vue';
  import { useServerSettingsStore } from '@/stores/server-settings.ts';
  import { useIrcStore } from '@/stores/irc.ts';
  import { useUserPrefsStore } from '@/stores/user-prefs.ts';
  import type { ServerSettingsEntry } from '@/stores/server-settings.ts';
  import { i18n } from '@/i18n/index.ts';

  const t = i18n.global.t;

  const backdrop = ref<HTMLElement | null>(null);

  const props = withDefaults(
    defineProps<{
      serverId: string;
      serverName: string;
      open?: boolean;
      initialTab?: string | null;
    }>(),
    {
      open: false,
      initialTab: null,
    },
  );

  const emit = defineEmits<{
    close: [];
  }>();

  const settingsStore = useServerSettingsStore();
  const ircStore = useIrcStore();
  const userPrefs = useUserPrefsStore();
  const activeTab = ref('general');

  const serverTabs = computed(() => [
    { key: 'user', label: t('tabs.user') },
    { key: 'general', label: t('tabs.general') },
    { key: 'formatting', label: t('tabs.formatting') },
    { key: 'filtered', label: t('tabs.filtered') },
    { key: 'blocked', label: t('tabs.blocked') },
  ]);

  const form = ref<Partial<ServerSettingsEntry>>({});
  const newFilter = ref('');
  const confirmServerForget = ref(false);

  // Load form values when opening
  watch(
    () => props.open,
    (val) => {
      if (val) {
        const s = settingsStore.getSettings(props.serverId);
        form.value = { ...s };
        if (props.initialTab) activeTab.value = props.initialTab;
        else activeTab.value = 'user';
        confirmServerForget.value = false;
        nextTick(() => backdrop.value?.focus());
      }
    },
    { immediate: true },
  );

  // Live-update listDelay if auto-detected while modal is open
  watch(
    () => settingsStore.settings[props.serverId]?.listDelay,
    (newVal) => {
      if (props.open && newVal !== undefined && !form.value.listDelayManual) {
        form.value.listDelay = newVal;
      }
    },
  );

  const mircStatus = computed(() => {
    const s = settingsStore.getSettings(props.serverId);
    if (s.mircFormatting === true) return t('settings.server.mircStatusEnabled');
    if (s.mircFormatting === false) return t('settings.server.mircStatusDisabled');
    if (s.mircDetected) return t('settings.server.mircStatusAutoDetected');
    return t('settings.server.mircStatusAutoNotDetected');
  });

  function save() {
    const data = { ...form.value };
    // Mark listDelay as manually set if user changed it
    const current = settingsStore.getSettings(props.serverId);
    if (data.listDelay !== current.listDelay) {
      data.listDelayManual = true;
    }
    const oldNick = current.nickname;
    settingsStore.updateSettings(props.serverId, data);
    // If per-server nick changed and we're connected, send NICK command
    if (data.nickname && data.nickname !== oldNick && ircStore.isConnected(props.serverId)) {
      ircStore.changeNick(props.serverId, data.nickname);
    }
    emit('close');
  }

  function close() {
    emit('close');
  }

  /** Add a new filtered message pattern. */
  function addFilter() {
    const text = newFilter.value.trim();
    if (!text) return;
    const filters = form.value.filteredMessages || [];
    if (!filters.some((f) => f.toLowerCase() === text.toLowerCase())) {
      form.value.filteredMessages = [...filters, text];
    }
    newFilter.value = '';
  }

  /** Remove a filtered message pattern by index. */
  function removeFilter(idx: number) {
    const filters = form.value.filteredMessages || [];
    form.value.filteredMessages = filters.filter((_, i) => i !== idx);
  }

  /** Clear user identity overrides for this server. */
  function handleServerForgetMe() {
    if (!confirmServerForget.value) {
      confirmServerForget.value = true;
      return;
    }
    confirmServerForget.value = false;
    form.value.nickname = '';
    form.value.username = '';
    form.value.realname = '';
    settingsStore.updateSettings(props.serverId, {
      nickname: '',
      username: '',
      realname: '',
    });
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
            <h3 class="text-sm font-bold text-white">{{ $t('settings.server.title') }}</h3>
            <p class="text-xs text-slate-500">{{ serverName }}</p>
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
            v-for="tab in serverTabs"
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
            <!-- LIST delay -->
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium text-slate-300">{{
                $t('settings.server.listDelay')
              }}</label>
              <p class="text-[10px] text-slate-500">
                {{ $t('settings.server.listDelayDescription') }}
              </p>
              <input
                v-model.number="form.listDelay"
                type="number"
                min="0"
                max="120"
                class="w-24 rounded-md border border-slate-600 bg-slate-700/50 px-3 py-1.5 text-sm text-slate-300 outline-none focus:border-emerald-500"
              />
            </div>

            <!-- LIST refresh interval -->
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium text-slate-300">
                {{ $t('settings.server.listRefreshInterval') }}
              </label>
              <p class="text-[10px] text-slate-500">
                {{ $t('settings.server.listRefreshDescription') }}
              </p>
              <input
                v-model.number="form.listRefreshInterval"
                type="number"
                min="0"
                max="3600"
                step="30"
                class="w-24 rounded-md border border-slate-600 bg-slate-700/50 px-3 py-1.5 text-sm text-slate-300 outline-none focus:border-emerald-500"
              />
            </div>

            <!-- Keepalive -->
            <div class="flex flex-col gap-1">
              <label class="flex items-center gap-2 text-xs font-medium text-slate-300">
                <input
                  v-model="form.keepalive"
                  type="checkbox"
                  class="rounded border-slate-600"
                />
                {{ $t('settings.server.keepalivePing') }}
              </label>
              <p class="text-[10px] text-slate-500">
                {{ $t('settings.server.keepaliveDescription') }}
              </p>
            </div>

            <!-- Keepalive interval -->
            <div
              v-if="form.keepalive"
              class="flex flex-col gap-1"
            >
              <label class="text-xs font-medium text-slate-300">
                {{ $t('settings.server.keepaliveInterval') }}
              </label>
              <p class="text-[10px] text-slate-500">
                {{ $t('settings.server.keepaliveIntervalDescription') }}
              </p>
              <input
                v-model.number="form.keepaliveInterval"
                type="number"
                min="10"
                max="300"
                class="w-24 rounded-md border border-slate-600 bg-slate-700/50 px-3 py-1.5 text-sm text-slate-300 outline-none focus:border-emerald-500"
              />
            </div>

            <!-- Auto-reconnect -->
            <div class="flex flex-col gap-1">
              <label class="flex items-center gap-2 text-xs font-medium text-slate-300">
                <input
                  v-model="form.autoReconnect"
                  type="checkbox"
                  class="rounded border-slate-600"
                />
                {{ $t('settings.server.autoReconnect') }}
              </label>
              <p class="text-[10px] text-slate-500">
                {{ $t('settings.server.autoReconnectDescription') }}
              </p>
            </div>
          </div>

          <!-- User tab -->
          <div
            v-if="activeTab === 'user'"
            class="flex flex-col gap-4"
          >
            <p class="text-[10px] text-slate-500">
              {{ $t('settings.server.overrideIdentity') }}
            </p>

            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium text-slate-300">{{
                $t('settings.server.nickname')
              }}</label>
              <input
                v-model="form.nickname"
                type="text"
                :placeholder="$t('settings.server.useGlobal')"
                class="w-48 rounded-md border border-slate-600 bg-slate-700/50 px-3 py-1.5 text-sm text-slate-300 outline-none placeholder:text-slate-500 focus:border-emerald-500"
              />
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium text-slate-300">{{
                $t('settings.server.username')
              }}</label>
              <p class="text-[10px] text-slate-500">{{ $t('settings.server.usernameNote') }}</p>
              <input
                v-model="form.username"
                type="text"
                :placeholder="$t('settings.server.useGlobal')"
                class="w-48 rounded-md border border-slate-600 bg-slate-700/50 px-3 py-1.5 text-sm text-slate-300 outline-none placeholder:text-slate-500 focus:border-emerald-500"
              />
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium text-slate-300">{{
                $t('settings.server.realname')
              }}</label>
              <p class="text-[10px] text-slate-500">
                {{ $t('settings.server.realnameNote') }}
              </p>
              <input
                v-model="form.realname"
                type="text"
                :placeholder="$t('settings.server.useGlobal')"
                class="w-full rounded-md border border-slate-600 bg-slate-700/50 px-3 py-1.5 text-sm text-slate-300 outline-none placeholder:text-slate-500 focus:border-emerald-500"
              />
            </div>
          </div>

          <!-- Formatting tab -->
          <div
            v-if="activeTab === 'formatting'"
            class="flex flex-col gap-4"
          >
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium text-slate-300">{{
                $t('settings.server.mircFormatting')
              }}</label>
              <p class="text-[10px] text-slate-500">
                {{ $t('settings.server.mircDescription') }}
              </p>
              <p class="mt-1 text-[10px] text-emerald-500">
                {{ $t('settings.server.mircStatusLabel', { status: mircStatus }) }}
              </p>
              <select
                v-model="form.mircFormatting"
                class="mt-1 w-40 rounded-md border border-slate-600 bg-slate-700/50 px-3 py-1.5 text-sm text-slate-300 outline-none focus:border-emerald-500"
              >
                <option :value="null">{{ $t('settings.server.mircAutoDetect') }}</option>
                <option :value="true">{{ $t('settings.server.mircAlwaysEnabled') }}</option>
                <option :value="false">{{ $t('settings.server.mircAlwaysDisabled') }}</option>
              </select>
            </div>

            <div class="rounded-lg bg-slate-700/30 px-3 py-2">
              <p class="text-[10px] font-medium text-slate-400">
                {{ $t('settings.server.mircSupported') }}
              </p>
              <ul class="mt-1 list-inside list-disc text-[10px] text-slate-500">
                <li>{{ $t('settings.server.mircSupportedList1') }}</li>
                <li>{{ $t('settings.server.mircSupportedList2') }}</li>
                <li>{{ $t('settings.server.mircSupportedList3') }}</li>
                <li>{{ $t('settings.server.mircSupportedList4') }}</li>
              </ul>
              <p class="mt-2 text-[10px] font-medium text-slate-400">
                {{ $t('settings.server.mircNotSupported') }}
              </p>
              <ul class="mt-1 list-inside list-disc text-[10px] text-slate-500">
                <li>{{ $t('settings.server.mircNotSupportedList1') }}</li>
              </ul>
            </div>
          </div>
          <!-- Blocked tab -->
          <div
            v-if="activeTab === 'blocked'"
            class="flex flex-col gap-4"
          >
            <p class="text-[10px] text-slate-500">
              {{ $t('settings.server.userRestrictions') }}
            </p>

            <!-- Hidden previews (first) -->
            <div class="flex flex-col gap-1">
              <div class="flex items-center justify-between pr-3">
                <label class="text-xs font-medium text-slate-300">{{
                  $t('settings.server.hiddenPreviews')
                }}</label>
                <button
                  v-if="userPrefs.hiddenPreviewsForServer(serverId).length > 0"
                  class="text-[10px] text-slate-400 transition-colors hover:text-slate-300"
                  :data-tooltip="$t('tooltips.restorePreviews')"
                  data-tooltip-delay="300"
                  @click="userPrefs.clearHiddenPreviews(serverId)"
                >
                  {{ $t('common.removeAll') }}
                </button>
              </div>
              <p class="text-[10px] text-slate-500">
                {{ $t('settings.server.hiddenPreviewsDescription') }}
              </p>
              <div
                v-if="userPrefs.hiddenPreviewsForServer(serverId).length === 0"
                class="text-[10px] italic text-slate-500"
              >
                {{ $t('settings.server.noHiddenPreviews') }}
              </div>
              <div class="flex max-h-32 flex-col gap-1 overflow-y-auto">
                <div
                  v-for="entry in userPrefs.hiddenPreviewsForServer(serverId)"
                  :key="'preview:' + entry.nick"
                  class="flex items-center justify-between rounded-md bg-slate-700/30 px-3 py-1.5"
                >
                  <span class="text-xs text-slate-300">{{ entry.nick }}</span>
                  <button
                    class="text-[10px] text-slate-400 transition-colors hover:text-slate-300"
                    @click="userPrefs.togglePreviewHidden(serverId, entry.nick)"
                  >
                    {{ $t('common.remove') }}
                  </button>
                </div>
              </div>
            </div>

            <!-- Blocked users (second) -->
            <div class="flex flex-col gap-1">
              <div class="flex items-center justify-between pr-3">
                <label class="text-xs font-medium text-slate-300">{{
                  $t('settings.server.blockedUsers')
                }}</label>
                <button
                  v-if="userPrefs.blockedUsersForServer(serverId).length > 0"
                  class="text-[10px] text-slate-400 transition-colors hover:text-slate-300"
                  :data-tooltip="$t('tooltips.unblockAll')"
                  data-tooltip-delay="300"
                  @click="userPrefs.clearBlockedUsers(serverId)"
                >
                  {{ $t('common.removeAll') }}
                </button>
              </div>
              <p class="text-[10px] text-slate-500">
                {{ $t('settings.server.blockedUsersDescription') }}
              </p>
              <div
                v-if="userPrefs.blockedUsersForServer(serverId).length === 0"
                class="text-[10px] italic text-slate-500"
              >
                {{ $t('settings.server.noBlockedUsers') }}
              </div>
              <div class="flex max-h-32 flex-col gap-1 overflow-y-auto">
                <div
                  v-for="entry in userPrefs.blockedUsersForServer(serverId)"
                  :key="'blocked:' + entry.nick"
                  class="flex items-center justify-between rounded-md bg-slate-700/30 px-3 py-1.5"
                >
                  <span class="text-xs text-slate-300">{{ entry.nick }}</span>
                  <button
                    class="text-[10px] text-slate-400 transition-colors hover:text-slate-300"
                    @click="userPrefs.toggleUserBlocked(serverId, entry.nick)"
                  >
                    {{ $t('common.unblock') }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Filtered messages tab -->
          <div
            v-if="activeTab === 'filtered'"
            class="flex flex-col gap-4"
          >
            <p class="text-[10px] text-slate-500">
              {{ $t('settings.server.filteredMessages') }}
            </p>

            <!-- Add new filter -->
            <div class="flex gap-2">
              <input
                v-model="newFilter"
                type="text"
                :placeholder="$t('settings.server.textToFilter')"
                class="flex-1 rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-1.5 text-xs text-slate-300 outline-none placeholder:text-slate-500 focus:border-emerald-500/50"
                @keyup.enter="addFilter"
              />
              <button
                class="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white transition-colors hover:bg-emerald-500 disabled:opacity-40"
                :disabled="!newFilter.trim()"
                @click="addFilter"
              >
                {{ $t('common.add') }}
              </button>
            </div>

            <!-- Filter list -->
            <div class="max-h-48 overflow-y-auto">
              <div
                v-for="(filter, idx) in form.filteredMessages || []"
                :key="idx"
                class="flex items-center justify-between border-b border-slate-700/50 py-1.5"
              >
                <span class="text-xs text-slate-300">{{ filter }}</span>
                <button
                  class="text-[10px] text-slate-500 transition-colors hover:text-red-400"
                  @click="removeFilter(idx)"
                >
                  {{ $t('common.remove') }}
                </button>
              </div>
              <p
                v-if="!form.filteredMessages?.length"
                class="py-2 text-center text-[10px] italic text-slate-600"
              >
                {{ $t('settings.server.noFilters') }}
              </p>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-between border-t border-slate-700 px-5 py-3">
          <button
            class="rounded-lg px-3 py-1.5 text-xs transition-colors"
            :class="
              confirmServerForget
                ? 'bg-red-600 text-white hover:bg-red-500'
                : 'text-red-400 hover:bg-red-500/10 hover:text-red-300'
            "
            :title="
              confirmServerForget
                ? $t('settings.server.forgetServerConfirmTitle')
                : $t('settings.server.forgetServerTitle')
            "
            @click="handleServerForgetMe"
          >
            {{
              confirmServerForget ? $t('common.confirmErase') : $t('settings.server.forgetServer')
            }}
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
