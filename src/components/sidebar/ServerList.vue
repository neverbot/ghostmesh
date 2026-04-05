<script setup lang="ts">
  import { ref, computed, watch } from 'vue';
  import { useIrcStore } from '@/stores/irc.ts';
  import { i18n } from '@/i18n/index.ts';
  import type { ServerConfig } from '@/types.ts';

  const store = useIrcStore();

  const emit = defineEmits<{
    'open-settings': [server: ServerConfig];
  }>();

  const collapsed = ref(false);
  const showAll = ref(false);

  /** Current user locale. */
  const userLocale = computed(() => i18n.global.locale.value);

  /** Whether there are servers in other locales (to show the toggle). */
  const hasOtherLocales = computed(() =>
    store.servers.some((s) => s.locale && s.locale !== userLocale.value),
  );

  /** Servers filtered by locale (unless showAll), sorted with connected first. */
  const visibleServers = computed(() => {
    const list = showAll.value
      ? store.servers
      : store.servers.filter(
          (s) =>
            !s.locale ||
            s.locale === userLocale.value ||
            store.isConnected(s.id) ||
            store.connectingServers.includes(s.id) ||
            store.statusRetainedServers.includes(s.id),
        );
    return [...list].sort((a, b) => {
      const aConn = store.isConnected(a.id) ? 0 : 1;
      const bConn = store.isConnected(b.id) ? 0 : 1;
      return aConn - bConn;
    });
  });

  // Auto-collapse on connect, auto-expand when all disconnected
  watch(
    () => store.connectedServers.length,
    (newLen, oldLen) => {
      if (newLen > (oldLen || 0)) {
        collapsed.value = true;
      } else if (newLen === 0) {
        collapsed.value = false;
      }
    },
  );
</script>

<template>
  <div class="mb-2">
    <button
      class="mb-1 flex w-full items-center gap-1.5 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 transition-colors hover:text-slate-400"
      @click="collapsed = !collapsed"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 16 16"
        fill="currentColor"
        class="h-2.5 w-2.5 transition-transform"
        :class="collapsed ? '-rotate-90' : ''"
      >
        <path
          fill-rule="evenodd"
          d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z"
          clip-rule="evenodd"
        />
      </svg>
      {{ $t('sidebar.servers') }}
    </button>

    <div>
      <div class="flex flex-col gap-0.5">
        <div
          v-for="server in visibleServers"
          :key="server.id"
          class="group flex items-center gap-3 rounded-lg transition-all duration-200"
          :class="[
            collapsed &&
              !store.isConnected(server.id) &&
              !store.connectingServers.includes(server.id)
              ? 'max-h-0 overflow-hidden py-0 opacity-0'
              : 'max-h-12 px-3 py-2 opacity-100',
            store.isConnected(server.id)
              ? 'text-slate-300 hover:bg-slate-700/40'
              : store.statusRetainedServers.includes(server.id)
                ? 'text-amber-400/70 hover:bg-slate-700/30 hover:text-amber-400'
                : 'text-slate-500 hover:bg-slate-700/30 hover:text-slate-400',
            store.connectingServers.includes(server.id)
              ? 'pointer-events-none opacity-60'
              : 'cursor-pointer',
          ]"
          @click="
            store.isConnected(server.id)
              ? store.selectServer(server.id)
              : store.statusRetainedServers.includes(server.id)
                ? store.selectServer(server.id)
                : store.connectToServer(server)
          "
        >
          <!-- Spinner when connecting -->
          <svg
            v-if="store.connectingServers.includes(server.id)"
            class="h-3 w-3 shrink-0 animate-spin text-amber-400"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            />
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z"
            />
          </svg>
          <!-- Status dot when not connecting -->
          <div
            v-else
            class="h-2 w-2 shrink-0 rounded-full"
            :class="
              store.isConnected(server.id)
                ? 'bg-emerald-400'
                : store.statusRetainedServers.includes(server.id)
                  ? 'bg-amber-400'
                  : 'bg-slate-600'
            "
          />
          <div class="flex min-w-0 flex-1 flex-col">
            <span class="truncate text-sm">{{ server.name }}</span>
            <span class="truncate text-[10px] text-slate-600">{{ server.host }}</span>
          </div>
          <!-- Settings gear -->
          <button
            class="rounded p-1 text-transparent transition-colors hover:bg-slate-600 hover:text-slate-300 group-hover:text-slate-500"
            :data-tooltip="$t('tooltips.serverSettings')"
            data-tooltip-delay="500"
            @click.stop="emit('open-settings', server)"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              class="h-3 w-3"
            >
              <path
                fill-rule="evenodd"
                d="M6.955 1.45A.5.5 0 0 1 7.452 1h1.096a.5.5 0 0 1 .497.45l.17 1.699c.484.12.94.312 1.356.562l1.321-.916a.5.5 0 0 1 .67.033l.774.775a.5.5 0 0 1 .034.67l-.916 1.32c.25.417.443.873.563 1.357l1.699.17a.5.5 0 0 1 .45.497v1.096a.5.5 0 0 1-.45.497l-1.699.17c-.12.484-.312.94-.562 1.356l.916 1.321a.5.5 0 0 1-.034.67l-.774.774a.5.5 0 0 1-.67.033l-1.32-.916c-.417.25-.874.443-1.357.563l-.17 1.699a.5.5 0 0 1-.497.45H7.452a.5.5 0 0 1-.497-.45l-.17-1.699a4.973 4.973 0 0 1-1.356-.562l-1.321.916a.5.5 0 0 1-.67-.034l-.774-.774a.5.5 0 0 1-.034-.67l.916-1.32a4.971 4.971 0 0 1-.562-1.357l-1.699-.17A.5.5 0 0 1 1 8.548V7.452a.5.5 0 0 1 .45-.497l1.699-.17c.12-.484.312-.94.562-1.356l-.916-1.321a.5.5 0 0 1 .034-.67l.774-.774a.5.5 0 0 1 .67-.033l1.32.916c.417-.25.874-.443 1.357-.563l.17-1.699ZM8 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
                clip-rule="evenodd"
              />
            </svg>
          </button>
          <!-- Disconnect / Clear status -->
          <button
            v-if="store.isConnected(server.id) || store.statusRetainedServers.includes(server.id)"
            class="rounded p-1 text-transparent transition-colors hover:bg-slate-600 hover:text-red-400 group-hover:text-slate-500"
            :data-tooltip="
              store.isConnected(server.id)
                ? $t('tooltips.disconnect')
                : $t('tooltips.clearStatusLog')
            "
            data-tooltip-delay="500"
            @click.stop="
              store.isConnected(server.id)
                ? store.disconnectFromServer(server.id)
                : store.clearDisconnectedServer(server.id)
            "
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              class="h-3 w-3"
            >
              <path
                d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z"
              />
            </svg>
          </button>
        </div>
      </div>
      <!-- Toggle to show servers in other languages -->
      <button
        v-if="hasOtherLocales && !collapsed"
        class="mt-1 w-full px-3 text-left text-[10px] text-slate-600 transition-colors hover:text-slate-400"
        @click="showAll = !showAll"
      >
        {{ showAll ? $t('sidebar.showLocalServers') : $t('sidebar.showAllServers') }}
      </button>
    </div>
  </div>
</template>
