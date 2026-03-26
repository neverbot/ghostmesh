<script setup lang="ts">
  import { ref, computed, nextTick } from 'vue';
  import { useIrcStore } from '@/stores/irc.ts';
  import UserContextMenu from '@/components/ui/UserContextMenu.vue';
  import InfoTooltip from '@/components/ui/InfoTooltip.vue';

  const store = useIrcStore();

  /** Check if a nick is the current user. */
  function isOwnNick(nick: string) {
    const myNick = store.nicknamePerServer[store.selectedServerId!] || store.nickname;
    return nick?.toLowerCase() === myNick?.toLowerCase();
  }

  const menuOpen = ref(false);
  const menuNick = ref('');
  const menuX = ref(0);
  const menuY = ref(0);

  const showFilter = ref(false);
  const filterText = ref('');
  const userFilterInput = ref<HTMLInputElement | null>(null);

  /** Filtered user list (case-insensitive substring match). */
  const filteredUsers = computed(() => {
    const query = filterText.value.trim().toLowerCase();
    if (!query) return store.currentUsers;
    return store.currentUsers.filter((u) => u.toLowerCase().includes(query));
  });

  /**
   * Open context menu on a user.
   * @param {string} nick
   * @param {MouseEvent} e
   */
  function onUserClick(nick: string, e: MouseEvent) {
    menuNick.value = nick;
    menuX.value = e.clientX;
    menuY.value = e.clientY;
    menuOpen.value = true;
  }

  /**
   * Handle "Open conversation" from context menu.
   * @param {{ nick: string, serverId: string }} payload
   */
  function onOpenDM({ nick, serverId }: { nick: string; serverId: string }) {
    store.openDM(serverId, nick);
  }
</script>

<template>
  <div class="flex flex-1 flex-col overflow-hidden pt-4">
    <div class="mb-3 flex items-center justify-between">
      <h3 class="text-xs font-bold uppercase tracking-widest text-slate-400">
        Members
        <span
          v-if="store.currentUsers.length"
          class="ml-1 text-slate-500"
        >
          {{ store.currentUsers.length }}
        </span>
      </h3>
      <InfoTooltip
        text="Filter members"
        :delay="500"
      >
        <button
          class="rounded p-1 transition-colors"
          :class="
            showFilter
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
          "
          @click="
            showFilter = !showFilter;
            if (showFilter) nextTick(() => userFilterInput?.focus());
          "
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 12"
            fill="currentColor"
            class="h-3 w-3"
          >
            <path d="M14 2H2l5 5.6V12l2 1V7.6L14 2Z" />
          </svg>
        </button>
      </InfoTooltip>
    </div>

    <!-- Filter input -->
    <div
      v-if="showFilter"
      class="mb-2 rounded-lg bg-slate-100 px-2 py-1.5"
    >
      <input
        ref="userFilterInput"
        v-model="filterText"
        type="text"
        placeholder="Search by name..."
        class="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 outline-none placeholder:text-slate-400 focus:border-emerald-500/50"
      />
    </div>

    <div
      class="flex-1 overflow-y-auto pb-8 [mask-image:linear-gradient(to_bottom,black_calc(100%-2rem),transparent)]"
    >
      <div
        v-for="user in filteredUsers"
        :key="user"
        class="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors"
        :class="isOwnNick(user) ? 'bg-emerald-50 hover:bg-emerald-100' : 'hover:bg-slate-100'"
        @click="onUserClick(user, $event)"
      >
        <div
          class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
          :class="isOwnNick(user) ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'"
        >
          {{ user[0].toUpperCase() }}
        </div>
        <span
          class="truncate text-sm"
          :class="isOwnNick(user) ? 'font-medium text-emerald-700' : 'text-slate-600'"
        >
          {{ user }}
        </span>
      </div>

      <!-- Filtered count -->
      <div
        v-if="filterText && filteredUsers.length !== store.currentUsers.length"
        class="px-2 py-2 text-center text-[10px] text-slate-400"
      >
        {{ filteredUsers.length }} of {{ store.currentUsers.length }} members
      </div>
    </div>

    <div
      v-if="store.currentUsers.length === 0"
      class="py-6 text-center text-xs text-slate-400"
    >
      No users
    </div>
  </div>

  <UserContextMenu
    :nick="menuNick"
    :server-id="store.selectedServerId || ''"
    :x="menuX"
    :y="menuY"
    :open="menuOpen"
    @close="menuOpen = false"
    @open-dm="onOpenDM"
  />
</template>
