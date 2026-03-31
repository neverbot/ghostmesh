<script setup lang="ts">
  import { ref, computed, nextTick, onUnmounted } from 'vue';
  import config from '@/config.ts';
  import { useIrcStore } from '@/stores/irc.ts';

  const store = useIrcStore();

  const collapsed = ref(false);
  const showFilters = ref(false);
  const channelFilterInput = ref<HTMLInputElement | null>(null);
  const joinInput = ref('');

  /** True when any server is connecting or waiting for its initial LIST delay. */
  const isWaitingForList = computed(
    () => store.connectingServers.length > 0 || store.isListWaiting,
  );

  /**
   * Throttled snapshot of unread counts and user counts per channel key.
   * Updates at most once every 3 seconds to prevent badge flickering.
   */
  const badgeCache = ref<Record<string, { unread: number; users: number }>>({});
  let badgeTimer: ReturnType<typeof setInterval> | null = null;

  function updateBadgeCache(): void {
    const prev = badgeCache.value;
    let changed = false;
    const next: Record<string, { unread: number; users: number }> = {};
    for (const entry of store.allJoinedChannels) {
      const key = `${entry.serverId}:${entry.channel}`;
      const unread = store.unreadCount(entry.serverId, entry.channel);
      const users = entry.userCount;
      next[key] = { unread, users };
      const old = prev[key];
      if (!old || old.unread !== unread || old.users !== users) changed = true;
    }
    if (Object.keys(prev).length !== Object.keys(next).length) changed = true;
    if (changed) badgeCache.value = next;
  }

  badgeTimer = setInterval(updateBadgeCache, 3000);
  updateBadgeCache();
  onUnmounted(() => {
    if (badgeTimer) clearInterval(badgeTimer);
  });

  /** Get cached badge values for a channel. */
  function getBadge(serverId: string, channel: string): { unread: number; users: number } {
    return badgeCache.value[`${serverId}:${channel}`] || { unread: 0, users: 0 };
  }

  function isSelected(serverId: string, channel: string) {
    return store.selectedServerId === serverId && store.selectedChannel === channel;
  }

  function serverAbbr(name: string) {
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

  function handleJoin() {
    const channel = joinInput.value.trim();
    if (!channel || !store.selectedServerId) return;
    store.joinChannel(store.selectedServerId, channel);
    joinInput.value = '';
  }
</script>

<template>
  <div class="flex flex-1 flex-col overflow-hidden">
    <div class="mb-1 flex items-center gap-1 px-3">
      <button
        class="flex flex-1 items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 transition-colors hover:text-slate-400"
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
        {{ $t('sidebar.channels') }}
      </button>

      <!-- Refresh channels -->
      <button
        v-if="store.connectedServers.length > 0"
        class="rounded p-1 transition-colors"
        :class="
          store.isListLoading
            ? 'animate-spin text-emerald-500'
            : isWaitingForList
              ? 'animate-spin text-amber-400'
              : 'text-slate-600 hover:text-slate-400'
        "
        :data-tooltip="
          store.isListLoading
            ? $t('tooltips.loadingChannels')
            : isWaitingForList
              ? $t('tooltips.waitingForChannels')
              : $t('tooltips.refreshChannels')
        "
        data-tooltip-delay="500"
        :disabled="store.isListLoading || isWaitingForList"
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

      <!-- Filter toggle -->
      <button
        v-if="store.connectedServers.length > 0"
        class="rounded p-1 transition-colors"
        :class="showFilters ? 'bg-slate-700 text-slate-300' : 'text-slate-600 hover:text-slate-400'"
        :data-tooltip="$t('tooltips.filterChannels')"
        data-tooltip-delay="500"
        @click="
          showFilters = !showFilters;
          if (showFilters) nextTick(() => channelFilterInput?.focus());
        "
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
    </div>

    <div
      class="grid min-h-0 flex-1 transition-[grid-template-rows] duration-200"
      :style="{ gridTemplateRows: collapsed ? '0fr' : '1fr' }"
    >
      <div class="flex flex-1 flex-col overflow-hidden">
        <!-- Filters panel -->
        <div
          v-if="showFilters"
          class="mb-2 flex flex-col gap-1.5 rounded-lg bg-slate-700/30 px-3 py-2"
        >
          <!-- Text search -->
          <input
            ref="channelFilterInput"
            v-model="store.filterText"
            type="text"
            :placeholder="$t('sidebar.searchNameOrTopic')"
            class="w-full rounded-md border border-slate-600/50 bg-slate-700/40 px-2 py-1 text-[11px] text-slate-300 outline-none placeholder:text-slate-500 focus:border-emerald-500/50"
          />

          <!-- Server filter -->
          <div class="flex items-center gap-1.5">
            <span class="text-[10px] text-slate-500">{{ $t('sidebar.server') }}</span>
            <select
              v-model="store.filterServer"
              class="flex-1 rounded-md border border-slate-600/50 bg-slate-700/40 px-1.5 py-0.5 text-[11px] text-slate-300 outline-none"
            >
              <option :value="null">{{ $t('sidebar.all') }}</option>
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
            <span class="text-[10px] text-slate-500">{{ $t('sidebar.minUsers') }}</span>
            <input
              v-model.number="store.filterMinUsers"
              type="number"
              min="0"
              class="w-16 rounded-md border border-slate-600/50 bg-slate-700/40 px-1.5 py-0.5 text-[11px] text-slate-300 outline-none"
            />
          </div>

          <!-- Sort -->
          <div class="flex items-center gap-1.5">
            <span class="text-[10px] text-slate-500">{{ $t('sidebar.sortBy') }}</span>
            <select
              v-model="store.sortBy"
              class="flex-1 rounded-md border border-slate-600/50 bg-slate-700/40 px-1.5 py-0.5 text-[11px] text-slate-300 outline-none"
            >
              <option value="users">{{ $t('sidebar.sortUsersMost') }}</option>
              <option value="name">{{ $t('sidebar.sortNameAZ') }}</option>
            </select>
          </div>

          <!-- Reset -->
          <button
            class="self-start text-[10px] text-slate-500 transition-colors hover:text-slate-400"
            @click="resetFilters"
          >
            {{ $t('sidebar.resetFilters') }}
          </button>
        </div>

        <!-- Channel list (scrollable with fade) -->
        <div
          class="flex-1 overflow-y-auto pb-8 [mask-image:linear-gradient(to_bottom,black_calc(100%-2rem),transparent)]"
        >
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
              {{ entry.channel === '*status' ? '~' : entry.isDM ? '@' : '#' }}
            </span>
            <span
              class="min-w-0 flex-1 truncate text-sm"
              :class="
                entry.isDM && !store.isDMOnline(entry.serverId, entry.channel) ? 'opacity-40' : ''
              "
            >
              {{
                entry.channel === '*status'
                  ? $t('common.status')
                  : entry.isDM
                    ? entry.channel
                    : entry.channel.replace(/^#/, '')
              }}
            </span>
            <!-- Right-aligned group: unread badge + user count + server badge + leave -->
            <div class="ml-auto flex items-center gap-1.5">
              <span
                v-if="getBadge(entry.serverId, entry.channel).unread > 0"
                class="flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold"
                :class="
                  entry.channel === '*status'
                    ? 'bg-slate-600 text-slate-400'
                    : 'bg-emerald-500 text-white'
                "
              >
                {{
                  getBadge(entry.serverId, entry.channel).unread > 99
                    ? '99+'
                    : getBadge(entry.serverId, entry.channel).unread
                }}
              </span>
              <span
                v-else-if="entry.channel !== '*status'"
                class="text-[10px] text-slate-500"
              >
                {{ getBadge(entry.serverId, entry.channel).users || '' }}
              </span>
              <span
                v-if="store.connectedServers.length > 1"
                class="w-6 rounded bg-slate-700/60 py-0.5 text-center text-[9px] text-slate-500"
                :data-tooltip="entry.serverName"
              >
                {{ serverAbbr(entry.serverName) }}
              </span>
              <!-- Leave button — always rendered for consistent width, invisible for status -->
              <button
                v-if="entry.channel !== '*status'"
                class="rounded p-0.5 text-transparent transition-colors hover:bg-slate-600 hover:text-red-400 group-hover/ch:text-slate-500"
                :data-tooltip="
                  entry.isDM ? $t('tooltips.closeConversation') : $t('tooltips.leaveChannel')
                "
                data-tooltip-delay="500"
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
              <div
                v-else
                class="w-4"
              />
            </div>
          </div>

          <!-- Separator if there are joined channels AND available channels -->
          <div
            v-if="store.allJoinedChannels.length > 0 && store.allAvailableChannels.length > 0"
            class="mx-4 my-1.5 flex items-center gap-2"
          >
            <div class="flex-1 border-t border-slate-700/50" />
            <span class="text-[9px] text-slate-600">
              {{
                $t('sidebar.available', {
                  filtered: store.allAvailableChannels.length,
                  total: store.totalAvailableCount,
                })
              }}
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
            <div class="flex shrink-0 items-center gap-1.5">
              <span class="text-[10px] text-slate-600">
                {{ ch.users }}
              </span>
              <span
                v-if="store.connectedServers.length > 1"
                class="w-6 rounded bg-slate-700/30 py-0.5 text-center text-[8px] text-slate-600"
                :data-tooltip="ch._sname"
              >
                {{ serverAbbr(ch._sname) }}
              </span>
            </div>
          </div>

          <!-- Truncation notice -->
          <div
            v-if="store.allAvailableChannels.length > config.list.browseLimit"
            class="px-5 py-2 text-center text-[10px] text-slate-600"
          >
            {{
              $t('sidebar.showingChannels', {
                limit: config.list.browseLimit,
                total: store.allAvailableChannels.length,
              })
            }}
          </div>

          <!-- Empty state -->
          <div
            v-if="store.allJoinedChannels.length === 0 && store.allAvailableChannels.length === 0"
            class="px-3 py-4 text-center text-xs text-slate-500"
          >
            {{ $t('sidebar.noChannelsYet') }}
          </div>
        </div>

        <!-- Join channel input -->
        <div
          v-if="store.connectedServers.length > 0"
          class="mt-3 flex items-center gap-1 px-3 pb-3"
        >
          <input
            v-model="joinInput"
            type="text"
            :placeholder="$t('sidebar.joinChannel')"
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
</template>
