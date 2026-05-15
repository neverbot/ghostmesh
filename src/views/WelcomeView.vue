<script setup lang="ts">
  import { ref, computed, onMounted, nextTick, watch } from 'vue';
  import { useRouter } from 'vue-router';
  import { i18n, setLocale, AVAILABLE_LOCALES } from '@/i18n/index.ts';
  import { useIrcStore } from '@/stores/irc.ts';
  import { useUserSettingsStore } from '@/stores/user-settings.ts';
  import type { ServerConfig } from '@/types.ts';

  const router = useRouter();
  const ircStore = useIrcStore();
  const userSettings = useUserSettingsStore();

  type Tab = 'available' | 'custom';

  const currentLocale = computed<string>(() => i18n.global.locale.value);

  /** Servers matching the current UI locale (or with no locale set). */
  const localServers = computed<ServerConfig[]>(() =>
    ircStore.servers.filter((s) => !s.locale || s.locale === currentLocale.value),
  );

  /** True if at least one server is tagged with a locale different from the current one. */
  const hasOtherLocales = computed<boolean>(() =>
    ircStore.servers.some((s) => s.locale && s.locale !== currentLocale.value),
  );

  const showAllServers = ref<boolean>(false);

  const visibleServers = computed<ServerConfig[]>(() =>
    showAllServers.value ? ircStore.servers : localServers.value,
  );

  const nickname = ref<string>(userSettings.getProfile().nickname || '');
  const activeTab = ref<Tab>(visibleServers.value.length > 0 ? 'available' : 'custom');
  const selectedServerId = ref<string | null>(visibleServers.value[0]?.id ?? null);
  const customUrl = ref<string>('');
  const error = ref<string>('');
  const submitting = ref<boolean>(false);

  /** Keep the selection valid when the visible list changes (locale switch, toggle). */
  watch(visibleServers, (list) => {
    if (!list.some((s) => s.id === selectedServerId.value)) {
      selectedServerId.value = list[0]?.id ?? null;
    }
  });

  function cycleLocale(): void {
    const idx = AVAILABLE_LOCALES.indexOf(currentLocale.value);
    const next = AVAILABLE_LOCALES[(idx + 1) % AVAILABLE_LOCALES.length];
    setLocale(next);
  }

  const nicknameInput = ref<HTMLInputElement | null>(null);

  onMounted(() => {
    nextTick(() => nicknameInput.value?.focus());
  });

  const nickValid = computed<boolean>(() =>
    /^[A-Za-z_][A-Za-z0-9_\-[\]\\`^{}|]{0,15}$/.test(nickname.value.trim()),
  );
  const customValid = computed<boolean>(() => /^wss?:\/\/[^\s]+$/i.test(customUrl.value.trim()));

  const canConnect = computed<boolean>(() => {
    if (!nickValid.value) return false;
    if (activeTab.value === 'available') return !!selectedServerId.value;
    return customValid.value;
  });

  function setTab(tab: Tab): void {
    activeTab.value = tab;
    error.value = '';
  }

  function selectServer(id: string): void {
    selectedServerId.value = id;
    error.value = '';
  }

  function buildCustomServer(): ServerConfig {
    const url = customUrl.value.trim();
    let label = url;
    try {
      const u = new URL(url);
      label = u.host;
    } catch {
      // keep raw url
    }
    return {
      id: `custom-${Date.now().toString(36)}`,
      name: label,
      host: url,
    };
  }

  function onSubmit(): void {
    if (!canConnect.value || submitting.value) return;
    error.value = '';
    submitting.value = true;

    userSettings.updateProfile({ nickname: nickname.value.trim() });

    let server: ServerConfig | undefined;
    if (activeTab.value === 'available') {
      server = ircStore.servers.find((s) => s.id === selectedServerId.value) ?? undefined;
    } else {
      const custom = buildCustomServer();
      ircStore.servers.push(custom);
      server = custom;
    }

    if (!server) {
      submitting.value = false;
      error.value = i18n.global.t('welcome.errors.noServer') as string;
      return;
    }

    ircStore.connectToServer(server);
    router.replace({ name: 'chat' });
  }
</script>

<template>
  <div
    class="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-900 px-6 py-12"
  >
    <!-- Ambient halo (very subtle emerald, never bright) -->
    <div
      aria-hidden="true"
      class="pointer-events-none absolute inset-x-0 top-0 h-[60vh]"
      style="
        background: radial-gradient(
          60% 60% at 50% 0%,
          color-mix(in srgb, var(--color-emerald-500) 14%, transparent) 0%,
          transparent 70%
        );
      "
    />

    <main class="relative z-10 flex w-full max-w-md flex-col items-center">
      <!-- Logo -->
      <img
        src="/logo.svg"
        alt=""
        class="h-20 w-20 drop-shadow-[0_8px_32px_color-mix(in_srgb,var(--color-emerald-500)_30%,transparent)]"
      />

      <!-- Wordmark + tagline -->
      <h1 class="mt-6 text-2xl font-semibold tracking-tight text-white">GhostMesh</h1>
      <p class="mt-1.5 text-sm text-slate-400">{{ $t('welcome.tagline') }}</p>

      <!-- Form -->
      <form
        class="mt-10 w-full"
        @submit.prevent="onSubmit"
      >
        <!-- Nickname -->
        <label class="block">
          <span class="text-[10px] font-medium tracking-[0.12em] text-slate-500 uppercase">{{
            $t('welcome.nickname')
          }}</span>
          <input
            ref="nicknameInput"
            v-model="nickname"
            type="text"
            autocomplete="username"
            spellcheck="false"
            maxlength="16"
            :placeholder="$t('welcome.nicknamePlaceholder')"
            class="mt-2 w-full rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-emerald-500"
          />
        </label>

        <!-- Tabs -->
        <div class="mt-8">
          <div
            role="tablist"
            class="relative flex border-b border-slate-700"
          >
            <button
              type="button"
              role="tab"
              :aria-selected="activeTab === 'available'"
              class="flex-1 px-1 py-2.5 text-xs font-medium tracking-wide transition-colors"
              :class="
                activeTab === 'available' ? 'text-white' : 'text-slate-500 hover:text-slate-300'
              "
              @click="setTab('available')"
            >
              {{ $t('welcome.tabs.available') }}
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="activeTab === 'custom'"
              class="flex-1 px-1 py-2.5 text-xs font-medium tracking-wide transition-colors"
              :class="activeTab === 'custom' ? 'text-white' : 'text-slate-500 hover:text-slate-300'"
              @click="setTab('custom')"
            >
              {{ $t('welcome.tabs.custom') }}
            </button>
            <!-- Sliding underline -->
            <span
              aria-hidden="true"
              class="absolute bottom-[-1px] h-px w-1/2 bg-emerald-500 transition-transform duration-200 ease-out"
              :class="activeTab === 'custom' ? 'translate-x-full' : 'translate-x-0'"
              style="left: 0"
            />
          </div>

          <!-- Tab content -->
          <div class="mt-5 min-h-[10rem]">
            <!-- Available -->
            <div
              v-show="activeTab === 'available'"
              role="tabpanel"
            >
              <div
                v-if="visibleServers.length === 0"
                class="rounded-md border border-dashed border-slate-700 px-4 py-8 text-center text-xs text-slate-500"
              >
                <p>
                  {{
                    ircStore.servers.length === 0
                      ? $t('welcome.serversEmpty')
                      : $t('welcome.serversEmptyForLocale')
                  }}
                </p>
                <button
                  type="button"
                  class="mt-3 text-emerald-400 transition-colors hover:text-emerald-300"
                  @click="
                    ircStore.servers.length === 0 ? setTab('custom') : (showAllServers = true)
                  "
                >
                  {{
                    ircStore.servers.length === 0
                      ? $t('welcome.serversEmptyAction')
                      : $t('sidebar.showAllServers')
                  }}
                  →
                </button>
              </div>
              <ul
                v-else
                class="flex flex-col gap-1"
              >
                <li
                  v-for="server in visibleServers"
                  :key="server.id"
                >
                  <button
                    type="button"
                    class="group flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left transition-colors"
                    :class="
                      selectedServerId === server.id
                        ? 'border-emerald-500/50 bg-emerald-500/10'
                        : 'border-slate-800 bg-slate-800/40 hover:border-slate-700 hover:bg-slate-800/70'
                    "
                    @click="selectServer(server.id)"
                  >
                    <span class="flex min-w-0 flex-col">
                      <span class="truncate text-sm text-white">{{ server.name }}</span>
                      <span class="truncate font-mono text-[10px] text-slate-500">{{
                        server.tcpHost ? `${server.tcpHost}:${server.tcpPort ?? 6667}` : server.host
                      }}</span>
                    </span>
                    <span
                      class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors"
                      :class="
                        selectedServerId === server.id
                          ? 'border-emerald-500 bg-emerald-500'
                          : 'border-slate-600 group-hover:border-slate-500'
                      "
                    >
                      <svg
                        v-if="selectedServerId === server.id"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                        class="h-3 w-3 text-slate-900"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M12.78 5.22a.75.75 0 0 1 0 1.06l-5.25 5.25a.75.75 0 0 1-1.06 0L3.22 8.28a.75.75 0 1 1 1.06-1.06L7 9.94l4.72-4.72a.75.75 0 0 1 1.06 0Z"
                          clip-rule="evenodd"
                        />
                      </svg>
                    </span>
                  </button>
                </li>
              </ul>
              <!-- Show-all toggle: only when there are servers in other locales. -->
              <button
                v-if="hasOtherLocales && visibleServers.length > 0"
                type="button"
                class="mt-2 block w-full text-center text-[11px] text-slate-600 transition-colors hover:text-slate-400"
                @click="showAllServers = !showAllServers"
              >
                {{ showAllServers ? $t('sidebar.showLocalServers') : $t('sidebar.showAllServers') }}
              </button>
            </div>

            <!-- Custom -->
            <div
              v-show="activeTab === 'custom'"
              role="tabpanel"
            >
              <label class="block">
                <span class="text-[10px] font-medium tracking-[0.12em] text-slate-500 uppercase">{{
                  $t('welcome.customUrl')
                }}</span>
                <input
                  v-model="customUrl"
                  type="text"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="wss://irc.example.com:443/webirc"
                  class="mt-2 w-full rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2 font-mono text-sm text-white outline-none placeholder:text-slate-600 focus:border-emerald-500"
                />
              </label>
              <p class="mt-2 text-[11px] leading-relaxed text-slate-500">
                {{ $t('welcome.customHelper') }}
              </p>
            </div>
          </div>
        </div>

        <!-- Error -->
        <p
          v-if="error"
          class="mt-4 text-xs text-red-400"
        >
          {{ error }}
        </p>

        <!-- Connect -->
        <button
          type="submit"
          :disabled="!canConnect || submitting"
          class="mt-8 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-emerald-500 text-sm font-medium text-slate-900 transition-colors hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
        >
          <span v-if="!submitting">{{ $t('welcome.connect') }}</span>
          <span
            v-else
            class="flex items-center gap-2"
          >
            <svg
              class="h-4 w-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                stroke-opacity="0.25"
                stroke-width="3"
              />
              <path
                d="M21 12a9 9 0 0 0-9-9"
                stroke="currentColor"
                stroke-width="3"
                stroke-linecap="round"
              />
            </svg>
            {{ $t('welcome.connecting') }}
          </span>
        </button>
      </form>
    </main>

    <!-- Footer: UI language switcher. Same vocabulary as the sidebar control. -->
    <footer class="absolute inset-x-0 bottom-0 flex items-center justify-center px-6 py-5">
      <button
        type="button"
        class="text-[10px] uppercase tracking-[0.2em] text-slate-600 transition-colors hover:text-slate-400"
        :title="$t('settings.global.language')"
        @click="cycleLocale"
      >
        {{ currentLocale }}
      </button>
    </footer>
  </div>
</template>
