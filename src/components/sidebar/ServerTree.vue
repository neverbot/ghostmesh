<script setup>
  import { ref } from 'vue';
  import config from '@/config.js';
  import { useIrcStore } from '@/stores/irc.js';
  import InfoTooltip from '@/components/ui/InfoTooltip.vue';
  import ServerSettingsModal from '@/components/ui/ServerSettingsModal.vue';

  const store = useIrcStore();
  const serversCollapsed = ref(false);
  const channelsCollapsed = ref(false);
  const showFilters = ref(false);
  const joinInput = ref('');
  const settingsModalOpen = ref(false);
  const settingsServerId = ref(null);
  const settingsServerName = ref('');

  function openSettings(server) {
    settingsServerId.value = server.id;
    settingsServerName.value = server.name;
    settingsModalOpen.value = true;
  }

  function handleJoin() {
    const channel = joinInput.value.trim();
    if (!channel || !store.selectedServerId) return;
    store.joinChannel(store.selectedServerId, channel);
    joinInput.value = '';
  }

  function isSelected(serverId, channel) {
    return store.selectedServerId === serverId && store.selectedChannel === channel;
  }

  function serverAbbr(name) {
    return name.slice(0, 2).toUpperCase();
  }

  function resetFilters() {
    store.filterServer = null;
    store.filterMinUsers = 0;
    store.filterText = '';
    store.sortBy = 'users';
  }

  function limitedAvailable() {
    return store.allAvailableChannels.slice(0, config.list.browseLimit);
  }
</script>

<template>
  <div class="flex flex-1 flex-col overflow-y-auto">
    <!-- SERVERS section -->
    <div class="mb-2">
      <button
        class="mb-1 flex w-full items-center gap-1.5 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 transition-colors hover:text-slate-400"
        @click="serversCollapsed = !serversCollapsed"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 16"
          fill="currentColor"
          class="h-2.5 w-2.5 transition-transform"
          :class="serversCollapsed ? '-rotate-90' : ''"
        >
          <path
            fill-rule="evenodd"
            d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z"
            clip-rule="evenodd"
          />
        </svg>
        Servers
      </button>

      <div
        class="grid transition-[grid-template-rows] duration-200"
        :style="{ gridTemplateRows: serversCollapsed ? '0fr' : '1fr' }"
      >
        <div class="flex flex-col gap-0.5 overflow-hidden">
          <div
            v-for="server in store.servers"
            :key="server.id"
            class="group flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors"
            :class="
              store.isConnected(server.id)
                ? 'text-slate-300 hover:bg-slate-700/40'
                : 'text-slate-500 hover:bg-slate-700/30 hover:text-slate-400'
            "
            @click="
              store.isConnected(server.id)
                ? store.selectServer(server.id)
                : store.connectToServer(server)
            "
          >
            <div
              class="h-2 w-2 shrink-0 rounded-full"
              :class="store.isConnected(server.id) ? 'bg-emerald-400' : 'bg-slate-600'"
            />
            <div class="flex min-w-0 flex-1 flex-col">
              <span class="truncate text-sm">{{ server.name }}</span>
              <span class="truncate text-[10px] text-slate-600">{{ server.host }}</span>
            </div>
            <!-- Settings gear -->
            <InfoTooltip
              text="Server settings"
              :delay="500"
            >
              <button
                class="rounded p-1 text-transparent transition-colors hover:bg-slate-600 hover:text-slate-300 group-hover:text-slate-500"
                @click.stop="openSettings(server)"
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
            </InfoTooltip>
            <!-- Disconnect -->
            <InfoTooltip
              v-if="store.isConnected(server.id)"
              text="Disconnect from server"
              :delay="500"
            >
              <button
                class="rounded p-1 text-transparent transition-colors hover:bg-slate-600 hover:text-red-400 group-hover:text-slate-500"
                @click.stop="store.disconnectFromServer(server.id)"
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
            </InfoTooltip>
          </div>
        </div>
      </div>
    </div>

    <!-- Divider -->
    <div class="mx-3 mb-2 border-t border-slate-700" />

    <!-- CHANNELS section -->
    <div class="flex flex-1 flex-col overflow-hidden">
      <div class="mb-1 flex items-center gap-1 px-3">
        <button
          class="flex flex-1 items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 transition-colors hover:text-slate-400"
          @click="channelsCollapsed = !channelsCollapsed"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            class="h-2.5 w-2.5 transition-transform"
            :class="channelsCollapsed ? '-rotate-90' : ''"
          >
            <path
              fill-rule="evenodd"
              d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z"
              clip-rule="evenodd"
            />
          </svg>
          Channels
        </button>

        <!-- Refresh channels -->
        <InfoTooltip
          v-if="store.connectedServers.length > 0"
          :text="
            store.isListLoading
              ? 'Loading channel list...'
              : 'Refresh channel list from all servers'
          "
          :delay="500"
        >
          <button
            class="rounded p-1 transition-colors"
            :class="
              store.isListLoading
                ? 'animate-spin text-emerald-500'
                : 'text-slate-600 hover:text-slate-400'
            "
            :disabled="store.isListLoading"
            @click="store.refreshChannelList()"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              class="h-3 w-3"
            >
              <path
                fill-rule="evenodd"
                d="M13.836 2.477a.75.75 0 0 1 .75.75v3.182a.75.75 0 0 1-.75.75h-3.182a.75.75 0 0 1 0-1.5h1.37l-.84-.841a4.5 4.5 0 0 0-7.08.681.75.75 0 0 1-1.3-.75 6 6 0 0 1 9.44-.908l.84.84V3.227a.75.75 0 0 1 .75-.75Zm-.911 7.5A.75.75 0 0 1 13.199 11a6 6 0 0 1-9.44.908l-.84-.84v1.456a.75.75 0 0 1-1.5 0V9.341a.75.75 0 0 1 .75-.75h3.182a.75.75 0 0 1 0 1.5h-1.37l.84.841a4.5 4.5 0 0 0 7.08-.681.75.75 0 0 1 1.024-.274Z"
                clip-rule="evenodd"
              />
            </svg>
          </button>
        </InfoTooltip>

        <!-- Filter toggle -->
        <InfoTooltip
          v-if="store.connectedServers.length > 0"
          text="Filter and sort channels"
          :delay="500"
        >
          <button
            class="rounded p-1 transition-colors"
            :class="
              showFilters ? 'bg-slate-700 text-slate-300' : 'text-slate-600 hover:text-slate-400'
            "
            @click="showFilters = !showFilters"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              class="h-3 w-3"
            >
              <path d="M14 2H2l5 5.6V12l2 1V7.6L14 2Z" />
            </svg>
          </button>
        </InfoTooltip>
      </div>

      <div
        class="grid min-h-0 flex-1 transition-[grid-template-rows] duration-200"
        :style="{ gridTemplateRows: channelsCollapsed ? '0fr' : '1fr' }"
      >
        <div class="flex flex-1 flex-col overflow-hidden">
          <!-- Filters panel -->
          <div
            v-if="showFilters"
            class="mb-2 flex flex-col gap-1.5 rounded-lg bg-slate-700/30 px-3 py-2"
          >
            <!-- Text search -->
            <input
              v-model="store.filterText"
              type="text"
              placeholder="Search name or topic (* ? wildcards)"
              class="w-full rounded-md border border-slate-600/50 bg-slate-700/40 px-2 py-1 text-[11px] text-slate-300 outline-none placeholder:text-slate-500 focus:border-emerald-500/50"
            />

            <!-- Server filter -->
            <div class="flex items-center gap-1.5">
              <span class="text-[10px] text-slate-500">Server</span>
              <select
                v-model="store.filterServer"
                class="flex-1 rounded-md border border-slate-600/50 bg-slate-700/40 px-1.5 py-0.5 text-[11px] text-slate-300 outline-none"
              >
                <option :value="null">All</option>
                <option
                  v-for="s in store.connectedServers"
                  :key="s.id"
                  :value="s.id"
                >
                  {{ s.name }}
                </option>
              </select>
            </div>

            <!-- Min users -->
            <div class="flex items-center gap-1.5">
              <span class="text-[10px] text-slate-500">Min users</span>
              <input
                v-model.number="store.filterMinUsers"
                type="number"
                min="0"
                class="w-16 rounded-md border border-slate-600/50 bg-slate-700/40 px-1.5 py-0.5 text-[11px] text-slate-300 outline-none"
              />
            </div>

            <!-- Sort -->
            <div class="flex items-center gap-1.5">
              <span class="text-[10px] text-slate-500">Sort by</span>
              <select
                v-model="store.sortBy"
                class="flex-1 rounded-md border border-slate-600/50 bg-slate-700/40 px-1.5 py-0.5 text-[11px] text-slate-300 outline-none"
              >
                <option value="users">Users (most first)</option>
                <option value="name">Name (A-Z)</option>
              </select>
            </div>

            <!-- Reset -->
            <button
              class="self-start text-[10px] text-slate-500 transition-colors hover:text-slate-400"
              @click="resetFilters"
            >
              Reset filters
            </button>
          </div>

          <!-- Channel list (scrollable) -->
          <div class="flex-1 overflow-y-auto">
            <!-- Joined channels -->
            <div
              v-for="entry in store.allJoinedChannels"
              :key="`joined:${entry.serverId}:${entry.channel}`"
              class="group/ch flex cursor-pointer items-center gap-2 rounded-lg py-1.5 pl-5 pr-3 transition-colors"
              :class="
                isSelected(entry.serverId, entry.channel)
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'text-slate-300 hover:bg-slate-700/40'
              "
              @click="store.selectChannel(entry.serverId, entry.channel)"
            >
              <span class="w-3 shrink-0 text-center text-[10px] opacity-60">
                {{ entry.channel === '*status' ? '~' : '#' }}
              </span>
              <span class="min-w-0 flex-1 truncate text-sm">
                {{ entry.channel === '*status' ? 'status' : entry.channel.replace(/^#/, '') }}
              </span>
              <span
                v-if="store.connectedServers.length > 1"
                class="shrink-0 rounded bg-slate-700/60 px-1.5 py-0.5 text-[9px] text-slate-500"
                :title="entry.serverName"
              >
                {{ serverAbbr(entry.serverName) }}
              </span>
              <!-- Leave channel -->
              <InfoTooltip
                v-if="entry.channel !== '*status'"
                text="Leave channel"
                :delay="500"
              >
                <button
                  class="shrink-0 rounded p-0.5 text-transparent transition-colors hover:bg-slate-600 hover:text-red-400 group-hover/ch:text-slate-500"
                  @click.stop="store.partChannel(entry.serverId, entry.channel)"
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
              </InfoTooltip>
            </div>

            <!-- Separator if there are joined channels AND available channels -->
            <div
              v-if="store.allJoinedChannels.length > 0 && store.allAvailableChannels.length > 0"
              class="mx-4 my-1.5 flex items-center gap-2"
            >
              <div class="flex-1 border-t border-slate-700/50" />
              <span class="text-[9px] text-slate-600">
                {{ store.allAvailableChannels.length }} of {{ store.totalAvailableCount }} available
              </span>
              <div class="flex-1 border-t border-slate-700/50" />
            </div>

            <!-- Available channels -->
            <div
              v-for="ch in limitedAvailable()"
              :key="`avail:${ch._sid}:${ch.name}`"
              class="flex cursor-pointer items-center gap-2 rounded-lg py-1 pl-5 pr-3 text-slate-500 transition-colors hover:bg-slate-700/30 hover:text-slate-400"
              @click="store.joinChannel(ch._sid, ch.name)"
            >
              <span class="w-3 shrink-0 text-center text-[10px] opacity-40">#</span>
              <span class="min-w-0 flex-1 truncate text-xs">
                {{ ch.name.replace(/^#/, '') }}
              </span>
              <span
                v-if="store.connectedServers.length > 1"
                class="shrink-0 rounded bg-slate-700/30 px-1 py-0.5 text-[8px] text-slate-600"
              >
                {{ serverAbbr(ch._sname) }}
              </span>
              <span class="shrink-0 text-[10px] text-slate-600">
                {{ ch.users }}
              </span>
            </div>

            <!-- Truncation notice -->
            <div
              v-if="store.allAvailableChannels.length > config.list.browseLimit"
              class="px-5 py-2 text-center text-[10px] text-slate-600"
            >
              Showing {{ config.list.browseLimit }} of
              {{ store.allAvailableChannels.length }} channels. Use filters to narrow results.
            </div>

            <!-- Empty state -->
            <div
              v-if="store.allJoinedChannels.length === 0 && store.allAvailableChannels.length === 0"
              class="px-3 py-4 text-center text-xs text-slate-500"
            >
              No channels yet
            </div>
          </div>

          <!-- Join channel input -->
          <div
            v-if="store.connectedServers.length > 0"
            class="mt-1 flex items-center gap-1 px-3 pb-1"
          >
            <input
              v-model="joinInput"
              type="text"
              placeholder="Join #channel"
              class="flex-1 rounded-md border border-slate-600/50 bg-slate-700/30 px-2 py-1 text-[11px] text-slate-400 outline-none placeholder:text-slate-600 focus:border-emerald-500/50"
              @keyup.enter="handleJoin"
            />
            <button
              class="rounded-md bg-emerald-500/10 p-1 text-emerald-500 transition-colors hover:bg-emerald-500/20"
              @click="handleJoin"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 16 16"
                fill="currentColor"
                class="h-3 w-3"
              >
                <path
                  d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
    <!-- Settings modal -->
    <ServerSettingsModal
      v-if="settingsServerId"
      :server-id="settingsServerId"
      :server-name="settingsServerName"
      :open="settingsModalOpen"
      @close="settingsModalOpen = false"
    />
  </div>
</template>
