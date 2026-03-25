<script setup>
  import { ref, computed, watch, nextTick } from 'vue';
  import { useServerSettingsStore } from '@/stores/server-settings.js';

  const backdrop = ref(null);

  const props = defineProps({
    serverId: { type: String, required: true },
    serverName: { type: String, required: true },
    open: { type: Boolean, default: false },
  });

  const emit = defineEmits(['close']);

  const settingsStore = useServerSettingsStore();
  const activeTab = ref('general');

  const form = ref({});

  // Load form values when opening
  watch(
    () => props.open,
    (val) => {
      if (val) {
        const s = settingsStore.getSettings(props.serverId);
        form.value = { ...s };
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
    if (s.mircFormatting === true) return 'Enabled (manual)';
    if (s.mircFormatting === false) return 'Disabled (manual)';
    if (s.mircDetected) return 'Auto-detected: active';
    return 'Auto-detect (not detected yet)';
  });

  function save() {
    const data = { ...form.value };
    // Mark listDelay as manually set if user changed it
    const current = settingsStore.getSettings(props.serverId);
    if (data.listDelay !== current.listDelay) {
      data.listDelayManual = true;
    }
    settingsStore.updateSettings(props.serverId, data);
    emit('close');
  }

  function close() {
    emit('close');
  }
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      ref="backdrop"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      tabindex="0"
      @keydown.escape="close"
      @click.self="close"
    >
      <div class="w-full max-w-md rounded-xl bg-slate-800 shadow-2xl">
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-slate-700 px-5 py-4">
          <div>
            <h3 class="text-sm font-bold text-white">Server Settings</h3>
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
            v-for="tab in ['general', 'formatting']"
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
            <!-- LIST delay -->
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium text-slate-300">LIST delay (seconds)</label>
              <p class="text-[10px] text-slate-500">
                Time to wait after connecting before requesting the channel list. Some servers
                require a minimum wait.
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
                LIST refresh interval (seconds)
              </label>
              <p class="text-[10px] text-slate-500">
                How often to re-request the channel list. Set to 0 to disable.
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

            <!-- Nickname override -->
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium text-slate-300">Nickname override</label>
              <p class="text-[10px] text-slate-500">Leave empty to use the global nickname.</p>
              <input
                v-model="form.nickname"
                type="text"
                placeholder="(use global)"
                class="w-48 rounded-md border border-slate-600 bg-slate-700/50 px-3 py-1.5 text-sm text-slate-300 outline-none placeholder:text-slate-500 focus:border-emerald-500"
              />
            </div>
          </div>

          <!-- Formatting tab -->
          <div
            v-if="activeTab === 'formatting'"
            class="flex flex-col gap-4"
          >
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium text-slate-300">mIRC formatting</label>
              <p class="text-[10px] text-slate-500">
                mIRC formatting uses control characters for bold, italic, colors, etc. When set to
                Auto, formatting will be enabled if the server sends formatted content.
              </p>
              <p class="mt-1 text-[10px] text-emerald-500">Status: {{ mircStatus }}</p>
              <select
                v-model="form.mircFormatting"
                class="mt-1 w-40 rounded-md border border-slate-600 bg-slate-700/50 px-3 py-1.5 text-sm text-slate-300 outline-none focus:border-emerald-500"
              >
                <option :value="null">Auto-detect</option>
                <option :value="true">Always enabled</option>
                <option :value="false">Always disabled</option>
              </select>
            </div>

            <div class="rounded-lg bg-slate-700/30 px-3 py-2">
              <p class="text-[10px] font-medium text-slate-400">Supported</p>
              <ul class="mt-1 list-inside list-disc text-[10px] text-slate-500">
                <li>Bold, italic, underline, strikethrough, monospace</li>
                <li>Foreground and background colors (16 standard + 83 extended)</li>
                <li>Reverse video (swap fg/bg)</li>
                <li>Reset formatting</li>
              </ul>
              <p class="mt-2 text-[10px] font-medium text-slate-400">Not yet supported</p>
              <ul class="mt-1 list-inside list-disc text-[10px] text-slate-500">
                <li>Hex color codes (\x04RRGGBB)</li>
              </ul>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="flex justify-end gap-2 border-t border-slate-700 px-5 py-3">
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
  </Teleport>
</template>
