import { defineStore } from 'pinia';
import { ref, shallowRef, computed, triggerRef, watch } from 'vue';
import type { Ref, ShallowRef, ComputedRef } from 'vue';
import { i18n } from '@/i18n/index.ts';
import config from '@/config.ts';
import IRCService from '@/services/irc.service.ts';
import type { ServerSettingsApi } from '@/services/irc.service.ts';
import { parseCommand, executeCommand, findCommand } from '@/services/command-registry.ts';
import type { CommandContext, CommandStore } from '@/services/command-registry.ts';
import { useServerSettingsStore } from '@/stores/server-settings.ts';
import type { ServerRuntimeInfo } from '@/stores/server-settings.ts';
import { useUserSettingsStore } from '@/stores/user-settings.ts';
import { useUserPrefsStore } from '@/stores/user-prefs.ts';
import defaultServers from '@/servers.ts';
import { uploadImage, hasAvailableProvider } from '@/services/upload-providers.ts';
import type {
  AvailableChannel,
  ChannelUser,
  ChatMessage,
  IrcStoreApi,
  MessageType,
  ServerConfig,
  UserMode,
} from '@/types.ts';

// ─── IRC store types ──────────────────────────────────────────────────────────

/** Extended channel info for display in the unified channel list. */
interface DisplayChannel extends AvailableChannel {
  _sid: string;
  _sname: string;
}

interface JoinedChannelEntry {
  serverId: string;
  serverName: string;
  channel: string;
  userCount: number;
  isDM: boolean;
}

interface SessionData {
  serverIds: string[];
  channels: Record<string, string[]>;
  selected: { serverId: string; channel: string } | null;
}

interface OpenSettingsRequest {
  serverId: string;
  tab: string;
}

const SESSION_KEY: string = config.storageKeys.session;

/**
 * Load saved session state from localStorage.
 */
function loadSession(): SessionData | null {
  try {
    const raw: string | null = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Save current session state to localStorage.
 */
function saveSession(data: SessionData): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

/** Clear saved session from localStorage. */
function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

const useIrcStore = defineStore('irc', () => {
  // --- State ---

  const servers: Ref<ServerConfig[]> = ref([...defaultServers]);

  const activeConnections: Ref<string[]> = ref([]);
  /** Servers that disconnected but still have a *status channel with messages to show. */
  const statusRetainedServers: Ref<string[]> = ref([]);
  const connectingServers: Ref<string[]> = ref([]);
  const selectedServerId: Ref<string | null> = ref(null);
  const selectedChannel: Ref<string | null> = ref(null);
  const nickname: Ref<string> = ref('');
  const nicknamePerServer: Ref<Record<string, string>> = ref({});

  /**
   * Online status of DM users. Key = "serverId:nick", value = boolean.
   */
  const dmOnline: Ref<Record<string, boolean>> = ref({});

  /**
   * Timestamp of the last message the user has seen per channel key.
   * Messages with timestamp > this value are considered unread.
   */
  const lastReadTimestamp: Ref<Record<string, number>> = ref({});
  /** Cached unread message counts per channel key. Incremented on message arrival, reset on markRead. */
  const unreadCounts: Ref<Record<string, number>> = ref({});

  const channels: Ref<Record<string, string[]>> = ref({});
  /**
   * Available channels per server. Uses shallowRef — Vue only tracks the ref itself,
   * not the thousands of channel objects inside. Trigger reactivity with triggerRef()
   * after mutations, or by replacing the whole value.
   */
  const availableChannels: ShallowRef<Record<string, AvailableChannel[]>> = shallowRef({});
  /** Message history per channel. shallowRef — avoids deep reactivity on thousands of messages. */
  const messages: ShallowRef<Record<string, ChatMessage[]>> = shallowRef({});
  /**
   * User lists per channel. shallowRef — channels like #linux have 2000+ users.
   */
  const users: ShallowRef<Record<string, ChannelUser[]>> = shallowRef({});
  const topics: Ref<Record<string, string>> = ref({});

  /** Runtime info about connected servers (not persisted). */
  const serverInfo: Ref<Record<string, ServerRuntimeInfo>> = ref({});

  const listLoadingServers: Ref<string[]> = ref([]);
  /** Servers waiting for their initial LIST delay (between registration and first LIST request). */
  const listWaitingServers: Ref<string[]> = ref([]);

  // Channel list filters
  const filterServer: Ref<string | null> = ref(null);
  const filterMinUsers: Ref<number> = ref(0);
  const filterText: Ref<string> = ref('');
  const sortBy: Ref<'users' | 'name'> = ref('users');

  // Service (lazy init)
  let ircService: IRCService | null = null;

  function getService(): IRCService {
    if (!ircService) {
      const serverSettings = useServerSettingsStore();
      const userSettings = useUserSettingsStore();
      const userPrefs = useUserPrefsStore();
      ircService = new IRCService(
        storeApi,
        serverSettings as ServerSettingsApi,
        userSettings,
        userPrefs,
      );
    }
    return ircService;
  }

  // --- Getters ---

  const connectedServers: ComputedRef<ServerConfig[]> = computed(() =>
    servers.value.filter((s) => activeConnections.value.includes(s.id)),
  );

  const disconnectedServers: ComputedRef<ServerConfig[]> = computed(() =>
    servers.value.filter((s) => !activeConnections.value.includes(s.id)),
  );

  const selectedServer: ComputedRef<ServerConfig | null> = computed(
    () => servers.value.find((s) => s.id === selectedServerId.value) || null,
  );

  const currentMessages: ComputedRef<ChatMessage[]> = computed(() => {
    if (!selectedServerId.value || !selectedChannel.value) return [];
    return messages.value[`${selectedServerId.value}:${selectedChannel.value}`] || [];
  });

  /** Mode sort priority — lower number = higher rank. */
  const MODE_PRIORITY: Record<UserMode, number> = {
    owner: 0,
    admin: 1,
    op: 2,
    halfop: 3,
    voice: 4,
    '': 5,
  };

  const currentUsers: ComputedRef<ChannelUser[]> = computed(() => {
    if (!selectedServerId.value || !selectedChannel.value) return [];
    const list: ChannelUser[] | undefined =
      users.value[`${selectedServerId.value}:${selectedChannel.value}`];
    if (!list) return [];
    const myNick: string = nicknamePerServer.value[selectedServerId.value] || nickname.value;
    const sorted: ChannelUser[] = [...list].sort((a, b) => {
      const mp: number = MODE_PRIORITY[a.mode] - MODE_PRIORITY[b.mode];
      if (mp !== 0) return mp;
      return a.nick.localeCompare(b.nick, undefined, { sensitivity: 'base' });
    });
    // Move own nick to the top
    const myIdx: number = sorted.findIndex((u) => u.nick.toLowerCase() === myNick?.toLowerCase());
    if (myIdx > 0) {
      sorted.unshift(sorted.splice(myIdx, 1)[0]);
    }
    return sorted;
  });

  const currentTopic: ComputedRef<string> = computed(() => {
    if (!selectedServerId.value || !selectedChannel.value) return '';
    return topics.value[`${selectedServerId.value}:${selectedChannel.value}`] || '';
  });

  /**
   * Check if a channel name is a DM (not a channel prefix and not *status).
   */
  function isDM(name: string): boolean {
    return (
      !!name &&
      !name.startsWith('#') &&
      !name.startsWith('&') &&
      !name.startsWith('!') &&
      !name.startsWith('+') &&
      name !== '*status'
    );
  }

  /** All joined channels across connected servers, with server metadata. */
  const allJoinedChannels: ComputedRef<JoinedChannelEntry[]> = computed(() => {
    const chans: JoinedChannelEntry[] = [];
    const dms: JoinedChannelEntry[] = [];
    // Include both active and disconnected servers that still have channels
    const visibleServers: string[] = [...activeConnections.value, ...statusRetainedServers.value];
    for (const serverId of visibleServers) {
      const server: ServerConfig | undefined = servers.value.find((s) => s.id === serverId);
      const serverName: string = server?.name || serverId;
      for (const channel of channels.value[serverId] || []) {
        const key: string = `${serverId}:${channel}`;
        const userList: ChannelUser[] | undefined = users.value[key];
        const userCount: number = userList ? userList.length : 0;
        const dm: boolean = isDM(channel);
        const entry: JoinedChannelEntry = { serverId, serverName, channel, userCount, isDM: dm };
        if (dm) {
          dms.push(entry);
        } else {
          chans.push(entry);
        }
      }
    }
    // Channels first, then DMs
    return [...chans, ...dms];
  });

  /** Set of "serverId:channelName" keys for quick joined lookup. */
  const joinedSet: ComputedRef<Set<string>> = computed(() => {
    const set: Set<string> = new Set();
    for (const serverId of activeConnections.value) {
      for (const ch of channels.value[serverId] || []) {
        set.add(`${serverId}:${ch}`);
      }
    }
    return set;
  });

  /** Build a case-insensitive substring matcher from filter input. */
  function buildMatcher(filter: string): (text: string) => boolean {
    if (!filter) return () => true;
    const lower: string = filter.toLowerCase();
    return (text: string) => text.toLowerCase().includes(lower);
  }

  /** Whether any server is currently loading a channel list. */
  const isListLoading: ComputedRef<boolean> = computed(() => listLoadingServers.value.length > 0);
  /** Whether any server is waiting for its initial LIST delay. */
  const isListWaiting: ComputedRef<boolean> = computed(() => listWaitingServers.value.length > 0);

  /**
   * All available channels (not joined) across all servers, with filters applied.
   * Returns empty during LIST loading. Data is pre-sorted in the store, so no
   * sort is needed here — only filtering and early exit at the render limit.
   */
  const allAvailableChannels: ComputedRef<DisplayChannel[]> = computed(() => {
    const result: DisplayChannel[] = [];
    const matcher: (text: string) => boolean = buildMatcher(filterText.value);
    const minUsers: number = filterMinUsers.value || 0;
    const serverFilter: string | null = filterServer.value;
    const byName: boolean = sortBy.value === 'name';
    const joined: Set<string> = joinedSet.value;
    const loading: string[] = listLoadingServers.value;

    // Collect from all servers (pre-sorted per server), skip servers currently loading LIST
    const sources: { serverId: string; serverName: string; list: AvailableChannel[] }[] = [];
    for (const serverId of activeConnections.value) {
      if (loading.includes(serverId)) continue;
      if (serverFilter && serverId !== serverFilter) continue;
      const server: ServerConfig | undefined = servers.value.find((s) => s.id === serverId);
      const serverName: string = server?.name || serverId;
      const list: AvailableChannel[] | undefined = availableChannels.value[serverId];
      if (list) sources.push({ serverId, serverName, list });
    }

    // Merge-scan: for single server, just filter in order (already sorted)
    // For multiple servers, simple concat + filter (sort was done per-server)
    for (const src of sources) {
      for (const ch of src.list) {
        if (joined.has(`${src.serverId}:${ch.name}`)) continue;
        if (ch.users < minUsers) continue;
        if (!matcher(ch.name) && !matcher(ch.topic)) continue;
        // Attach metadata without spread — reuse the channel object
        (ch as DisplayChannel)._sid = src.serverId;
        (ch as DisplayChannel)._sname = src.serverName;
        result.push(ch as DisplayChannel);
      }
    }

    if (byName) {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      result.sort((a, b) => b.users - a.users);
    }
    return result;
  });

  /** Total raw channel count across servers (unfiltered, excluding joined, skipping loading). */
  const totalAvailableCount: ComputedRef<number> = computed(() => {
    const joined: Set<string> = joinedSet.value;
    const loading: string[] = listLoadingServers.value;
    let count: number = 0;
    for (const serverId of activeConnections.value) {
      if (loading.includes(serverId)) continue;
      const list: AvailableChannel[] = availableChannels.value[serverId] || [];
      for (const ch of list) {
        if (!joined.has(`${serverId}:${ch.name}`)) count++;
      }
    }
    return count;
  });

  // --- Mutations ---

  /**
   * Mark a server as connected and initialize its status channel.
   */
  function addConnection(serverId: string): void {
    connectingServers.value = connectingServers.value.filter((id) => id !== serverId);
    statusRetainedServers.value = statusRetainedServers.value.filter((id) => id !== serverId);
    if (connectTimers[serverId]) {
      clearTimeout(connectTimers[serverId]);
      delete connectTimers[serverId];
    }
    if (!activeConnections.value.includes(serverId)) {
      activeConnections.value.push(serverId);
    }
    if (!channels.value[serverId]) {
      channels.value[serverId] = ['*status'];
    }
    if (!selectedServerId.value) {
      selectedServerId.value = serverId;
      selectedChannel.value = '*status';
    }
  }

  /**
   * Mark a server as disconnected.
   */
  function removeConnection(serverId: string): void {
    activeConnections.value = activeConnections.value.filter((id) => id !== serverId);
    connectingServers.value = connectingServers.value.filter((id) => id !== serverId);
    if (connectTimers[serverId]) {
      clearTimeout(connectTimers[serverId]);
      delete connectTimers[serverId];
    }

    // Clean up all data for this server, but preserve *status channel and its messages
    const serverChannels: string[] = channels.value[serverId] || [];
    for (const ch of serverChannels) {
      if (ch === '*status') continue;
      const key: string = `${serverId}:${ch}`;
      delete messages.value[key];
      delete users.value[key];
      delete topics.value[key];
    }
    // Keep only *status in the channel list
    channels.value[serverId] = ['*status'];
    triggerRef(messages);
    users.value = { ...users.value };
    delete availableChannels.value[serverId];
    triggerRef(availableChannels);

    // Track as disconnected so the status channel remains visible
    if (!statusRetainedServers.value.includes(serverId)) {
      statusRetainedServers.value.push(serverId);
    }

    // Select the status channel so the user can see disconnect messages
    if (selectedServerId.value === serverId) {
      selectedChannel.value = '*status';
    } else if (!selectedServerId.value) {
      selectedServerId.value = serverId;
      selectedChannel.value = '*status';
    }
  }

  /**
   * Remove a disconnected server's status channel and all its data.
   */
  function clearDisconnectedServer(serverId: string): void {
    getService().cancelReconnect(serverId);
    statusRetainedServers.value = statusRetainedServers.value.filter((id) => id !== serverId);
    const key: string = `${serverId}:*status`;
    delete messages.value[key];
    triggerRef(messages);
    delete channels.value[serverId];
    if (selectedServerId.value === serverId) {
      const remaining: string[] = [...activeConnections.value, ...statusRetainedServers.value];
      if (remaining.length > 0) {
        selectedServerId.value = remaining[0];
        selectedChannel.value = (channels.value[remaining[0]] || [])[0] || null;
      } else {
        selectedServerId.value = null;
        selectedChannel.value = null;
      }
    }
  }

  /**
   * Select a server and its first channel.
   */
  function selectServer(serverId: string): void {
    selectedServerId.value = serverId;
    const serverChannels: string[] = channels.value[serverId] || [];
    selectedChannel.value = serverChannels[0] || null;
  }

  /**
   * Select a specific channel on a specific server.
   */
  function selectChannel(serverId: string, channel: string): void {
    selectedServerId.value = serverId;
    selectedChannel.value = channel;
  }

  /**
   * Check if a server is currently connected.
   */
  function isConnected(serverId: string): boolean {
    return activeConnections.value.includes(serverId);
  }

  /**
   * Add a channel to a server's joined list and initialize its data.
   */
  function addJoinedChannel(serverId: string, channel: string): void {
    if (!channels.value[serverId]) channels.value[serverId] = [];
    if (!channels.value[serverId].includes(channel)) {
      channels.value[serverId].push(channel);
    }
    const key: string = `${serverId}:${channel}`;
    if (!messages.value[key]) {
      messages.value[key] = [];
      triggerRef(messages);
    }
    if (!users.value[key]) users.value[key] = [];
  }

  /**
   * Remove a channel from a server's joined list.
   */
  function removeJoinedChannel(serverId: string, channel: string): void {
    if (channels.value[serverId]) {
      channels.value[serverId] = channels.value[serverId].filter((c) => c !== channel);
    }
    // Clean up channel data if global pref is enabled (default: true)
    const prefs = useUserSettingsStore().getProfile().globalPrefs;
    const shouldClear = prefs?.clearOnClose !== false;
    if (shouldClear) {
      const key = `${serverId}:${channel}`;
      delete messages.value[key];
      triggerRef(messages);
      const usersData = users.value;
      if (usersData[key]) {
        delete usersData[key];
        triggerRef(users);
      }
      delete topics.value[key];
      delete lastReadTimestamp.value[key];
      delete unreadCounts.value[key];
    }
    if (selectedServerId.value === serverId && selectedChannel.value === channel) {
      const remaining: string[] = channels.value[serverId] || [];
      selectedChannel.value = remaining[0] || null;
    }
  }

  /**
   * Add a chat message to a channel.
   */
  function addMessage(
    serverId: string,
    channel: string,
    nick: string,
    content: string,
    type: MessageType = 'message',
    numericCode?: string,
  ): void {
    const key: string = `${serverId}:${channel}`;
    if (!messages.value[key]) messages.value[key] = [];
    const arr: ChatMessage[] = messages.value[key];
    const currentNick: string = nicknamePerServer.value[serverId] || nickname.value;
    arr.push({
      id: crypto.randomUUID(),
      serverId,
      channel,
      nick,
      content,
      timestamp: new Date(),
      type,
      own: nick.toLowerCase() === currentNick.toLowerCase(),
      numericCode,
    });
    // Trim old messages to stay within limit
    const max: number = config.chat.maxMessages;
    if (arr.length > max) {
      arr.splice(0, arr.length - max);
    }
    triggerRef(messages);
    // Increment unread counter for non-active channels
    if (type === 'message') {
      const lastRead: number = lastReadTimestamp.value[key] || 0;
      if (Date.now() > lastRead) {
        unreadCounts.value[key] = (unreadCounts.value[key] || 0) + 1;
      }
    }
  }

  /** Get the cached unread message count for a channel. O(1) lookup. */
  function unreadCount(serverId: string, channel: string): number {
    return unreadCounts.value[`${serverId}:${channel}`] || 0;
  }

  /**
   * Mark a channel as read up to a given timestamp.
   * Only advances forward (high-water mark).
   */
  function markReadUpTo(serverId: string, channel: string, timestamp: number): void {
    const key: string = `${serverId}:${channel}`;
    const current: number = lastReadTimestamp.value[key] || 0;
    if (timestamp > current) {
      lastReadTimestamp.value[key] = timestamp;
      unreadCounts.value[key] = 0;
    }
  }

  /**
   * Set the online status of a DM user.
   */
  function setDMOnline(serverId: string, nick: string, online: boolean): void {
    dmOnline.value[`${serverId}:${nick}`] = online;
  }

  /**
   * Check if a DM user is online.
   */
  function isDMOnline(serverId: string, nick: string): boolean {
    const key: string = `${serverId}:${nick}`;
    // Default to true (assume online until we see QUIT)
    return dmOnline.value[key] !== false;
  }

  /**
   * Mark the last own message in the current channel with a warning.
   * Used when the server reports an error that may be related to a recent message.
   */
  function warnLastOwnMessage(serverId: string, warningText: string): void {
    const channel: string | null = selectedChannel.value;
    if (!channel || selectedServerId.value !== serverId) return;
    const key: string = `${serverId}:${channel}`;
    const list: ChatMessage[] | undefined = messages.value[key];
    if (!list) return;
    // Find the last own message (searching from the end)
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].nick === nickname.value && list[i].type === 'message') {
        list[i].warning = warningText;
        triggerRef(messages);
        break;
      }
    }
  }

  /**
   * Add a system message to the server's status channel (and current channel if same server).
   */
  function addSystemMessage(serverId: string, content: string, numericCode?: string): void {
    addMessage(serverId, '*status', '', content, 'system', numericCode);
    // Mirror to the active channel if it's on the same server (but not during reconnection,
    // and not to *status or DMs)
    if (
      selectedServerId.value === serverId &&
      selectedChannel.value &&
      selectedChannel.value !== '*status' &&
      !isDM(selectedChannel.value) &&
      !connectingServers.value.includes(serverId)
    ) {
      addMessage(serverId, selectedChannel.value, '', content, 'system');
    }
  }

  /**
   * Set the topic for a channel.
   */
  function setTopic(serverId: string, channel: string, topic: string): void {
    topics.value[`${serverId}:${channel}`] = topic;
  }

  /**
   * Add a single user to a channel's user list.
   */
  function addUser(serverId: string, channel: string, nick: string, mode: UserMode = ''): void {
    const key: string = `${serverId}:${channel}`;
    if (!users.value[key]) users.value[key] = [];
    if (!users.value[key].some((u) => u.nick === nick)) {
      users.value[key].push({ nick, mode });
      users.value = { ...users.value };
    }
  }

  /**
   * Add multiple users to a channel's user list (from NAMREPLY).
   * Does NOT trigger reactivity — call finalizeUsers() after all NAMREPLY are processed.
   */
  function addUsers(serverId: string, channel: string, newUsers: ChannelUser[]): void {
    const key: string = `${serverId}:${channel}`;
    if (!users.value[key]) users.value[key] = [];
    const existing: Set<string> = new Set(users.value[key].map((u) => u.nick));
    for (const cu of newUsers) {
      if (!existing.has(cu.nick)) {
        existing.add(cu.nick);
        users.value[key].push(cu);
      }
    }
    // No triggerRef — wait for finalizeUsers (366 ENDOFNAMES)
  }

  /**
   * Signal that all NAMREPLY for a channel have been received.
   * Replaces the users object to force Vue to see the change with shallowRef.
   */
  function finalizeUsers(): void {
    users.value = { ...users.value };
  }

  /**
   * Remove a user from a channel's user list.
   */
  function removeUser(serverId: string, channel: string, nick: string): void {
    const key: string = `${serverId}:${channel}`;
    if (users.value[key]) {
      users.value[key] = users.value[key].filter((u) => u.nick !== nick);
      users.value = { ...users.value };
    }
  }

  /**
   * Set the confirmed nickname for a server.
   */
  function setNickname(serverId: string, nick: string): void {
    nicknamePerServer.value = { ...nicknamePerServer.value, [serverId]: nick };
    // Update global display nick to the selected server's nick
    if (serverId === selectedServerId.value || !nickname.value) {
      nickname.value = nick;
    }
  }

  /**
   * Rename a user across all channels on a server.
   */
  function renameUser(serverId: string, oldNick: string, newNick: string): void {
    let changed: boolean = false;
    const serverChannels: string[] = channels.value[serverId] || [];
    for (const channel of serverChannels) {
      const key: string = `${serverId}:${channel}`;
      const userList: ChannelUser[] | undefined = users.value[key];
      if (userList) {
        const user: ChannelUser | undefined = userList.find((u) => u.nick === oldNick);
        if (user) {
          user.nick = newNick;
          changed = true;
        }
      }
    }
    if (changed) {
      users.value = { ...users.value };
    }
  }

  /**
   * Send a NICK command to change nick on a server.
   */
  function changeNick(serverId: string, newNick: string): void {
    getService().changeNick(serverId, newNick);
  }

  /**
   * Send NICK to all connected servers using global settings.
   * Skips servers with per-server nick overrides.
   */
  function changeNickGlobal(newNick: string): void {
    const serverSettings = useServerSettingsStore();
    for (const serverId of activeConnections.value) {
      const serverNick: string = serverSettings.getSettings(serverId).nickname;
      if (!serverNick) {
        getService().changeNick(serverId, newNick);
      }
    }
  }

  /**
   * Clear available channels for a server (before LIST refresh).
   */
  function clearAvailableChannels(serverId: string): void {
    availableChannels.value[serverId] = [];
    delete channelBuffer[serverId];
    // No triggerRef here — during loading the computed returns [] anyway
  }

  /** Buffer per server, flushed periodically. */
  const channelBuffer: Record<string, AvailableChannel[]> = {};
  /** Flush timer per server. */
  const channelFlushTimers: Record<string, ReturnType<typeof setTimeout>> = {};

  /**
   * Flush buffered channels into the reactive state.
   */
  function flushChannelBuffer(serverId: string, final: boolean = false): void {
    const buf: AvailableChannel[] | undefined = channelBuffer[serverId];
    if (!buf || buf.length === 0) {
      if (final && availableChannels.value[serverId]) {
        availableChannels.value[serverId].sort((a, b) => b.users - a.users);
        triggerRef(availableChannels);
      }
      return;
    }
    if (!availableChannels.value[serverId]) availableChannels.value[serverId] = [];
    availableChannels.value[serverId].push(...buf);
    channelBuffer[serverId] = [];
    if (final) {
      availableChannels.value[serverId].sort((a, b) => b.users - a.users);
    }
    triggerRef(availableChannels);
  }

  /**
   * Add a single available channel entry (called per RPL_LIST).
   * Batches updates to avoid blocking the UI with thousands of reactive pushes.
   */
  function addAvailableChannel(serverId: string, channel: AvailableChannel): void {
    if (!channelBuffer[serverId]) channelBuffer[serverId] = [];
    channelBuffer[serverId].push(channel);
    // Flush every 500 channels or schedule a timer flush
    if (channelBuffer[serverId].length >= 500) {
      flushChannelBuffer(serverId);
    } else if (!channelFlushTimers[serverId]) {
      channelFlushTimers[serverId] = setTimeout(() => {
        flushChannelBuffer(serverId);
        delete channelFlushTimers[serverId];
      }, 500);
    }
  }

  // --- Actions (delegate to service) ---

  /** Connection timeout timers. */
  const connectTimers: Record<string, ReturnType<typeof setTimeout>> = {};

  /**
   * Connect to a server with connecting state and timeout.
   */
  function connectToServer(server: ServerConfig): void {
    if (isConnected(server.id)) return;
    if (connectingServers.value.includes(server.id)) return;

    // Check if another active connection points to the same IRC server
    const targetKey = server.tcpHost ? `${server.tcpHost}:${server.tcpPort || 6667}` : server.host;
    const duplicate = servers.value.find((s) => {
      if (s.id === server.id) return false;
      if (!isConnected(s.id)) return false;
      const otherKey = s.tcpHost ? `${s.tcpHost}:${s.tcpPort || 6667}` : s.host;
      return otherKey === targetKey;
    });
    if (duplicate) {
      connectionError.value = i18n.global.t('errors.duplicateNetwork', {
        server: server.name,
        duplicate: duplicate.name,
      }) as string;
      return;
    }

    connectingServers.value.push(server.id);
    // Manual click — clear any pending backoff/attempts so this is a fresh try.
    getService().cancelReconnect(server.id);
    getService().connect(server);
    // Timeout: if not connected after 15s, show error
    connectTimers[server.id] = setTimeout(() => {
      if (!isConnected(server.id)) {
        connectingServers.value = connectingServers.value.filter((id) => id !== server.id);
        connectionError.value = i18n.global.t('errors.connectionTimeout', {
          server: server.name,
        }) as string;
        getService().cleanupConnection(server.id);
      }
    }, 15000);
  }

  const connectionError: Ref<string | null> = ref(null);
  const isUploading: Ref<boolean> = ref(false);

  /** Text to prefill in the message input (set by forward). */
  const prefillMessage: Ref<string> = ref('');

  /** Whether the current server has any upload providers available. */
  const canUpload: ComputedRef<boolean> = computed(() => {
    if (!selectedServerId.value) return false;
    const server = servers.value.find((s) => s.id === selectedServerId.value);
    const blocked = server?.blockedUploadProviders || [];
    const proxyAllowed = server?.proxyUploadProviders || [];
    const userKeys = useUserSettingsStore().getProfile().uploadProviderKeys || {};
    return hasAvailableProvider(blocked, userKeys, proxyAllowed);
  });

  /**
   * Signal to open server settings on a specific tab.
   * Set to { serverId, tab } to open, null to close.
   */
  const openSettingsRequest: Ref<OpenSettingsRequest | null> = ref(null);

  /**
   * Request opening server settings on a specific tab.
   */
  function requestOpenSettings(serverId: string, tab: string): void {
    openSettingsRequest.value = { serverId, tab };
  }

  /** Dismiss the connection error popup. */
  function dismissConnectionError(): void {
    connectionError.value = null;
  }

  /**
   * Disconnect from a server.
   */
  function disconnectFromServer(serverId: string): void {
    getService().disconnect(serverId);
    // User initiated disconnect — clear the retained status channel immediately
    clearDisconnectedServer(serverId);
  }

  /**
   * Join a channel on a server.
   */
  function joinChannel(serverId: string, channel: string): void {
    if (!isConnected(serverId)) return;
    getService().joinChannel(serverId, channel);
  }

  /**
   * Leave a channel on a server.
   */
  function partChannel(serverId: string, channel: string): void {
    if (!isConnected(serverId)) return;
    if (channel === '*status') return;
    if (isDM(channel)) {
      // DMs are local only — just remove the channel, don't send PART
      removeJoinedChannel(serverId, channel);
      return;
    }
    getService().partChannel(serverId, channel);
  }

  /**
   * Open a direct message channel with a user.
   * Creates the DM channel if it doesn't exist and selects it.
   */
  function openDM(serverId: string, nick: string): void {
    if (!isConnected(serverId)) return;
    const serverChannels: string[] = channels.value[serverId] || [];
    if (!serverChannels.includes(nick)) {
      addJoinedChannel(serverId, nick);
    }
    selectChannel(serverId, nick);
  }

  /**
   * Close the DM channel with a user on a specific server.
   * If the active channel is this DM, switch to the first available channel.
   */
  function closeDMsWithUser(serverId: string, nick: string): void {
    const serverChannels: string[] = channels.value[serverId] || [];
    const dmChannel: string | undefined = serverChannels.find(
      (ch) => ch.toLowerCase() === nick.toLowerCase(),
    );
    if (!dmChannel) return;
    if (selectedServerId.value === serverId && selectedChannel.value === dmChannel) {
      const firstChannel: string = serverChannels.find((ch) => ch !== dmChannel) || '*status';
      selectChannel(serverId, firstChannel);
    }
    removeJoinedChannel(serverId, dmChannel);
  }

  /**
   * Send a message or execute a slash command in the currently selected channel.
   */
  function sendMessage(content: string): void {
    if (!selectedServerId.value || !selectedChannel.value) return;

    // Slash command handling
    if (content.startsWith('/')) {
      const parsed = parseCommand(content);
      if (parsed) {
        const ctx: CommandContext = {
          serverId: selectedServerId.value,
          channel: selectedChannel.value,
          service: getService(),
          store: commandStoreApi,
        };
        const handled = executeCommand(parsed, ctx);
        if (!handled) {
          const cmd = findCommand(parsed.name);
          const msg = cmd
            ? (i18n.global.t('errors.commandUsage', { usage: cmd.usage }) as string)
            : (i18n.global.t('errors.unknownCommand', { name: parsed.name }) as string);
          addMessage(selectedServerId.value, selectedChannel.value, '', msg, 'system');
        }
      }
      return;
    }

    if (selectedChannel.value === '*status') {
      // Status channel: send as raw IRC command
      getService().send(selectedServerId.value, content);
      addMessage(selectedServerId.value, '*status', nickname.value, content, 'message');
      markReadUpTo(selectedServerId.value, '*status', Date.now());
      return;
    }
    getService().sendMessage(selectedServerId.value, selectedChannel.value, content);
    addMessage(selectedServerId.value, selectedChannel.value, nickname.value, content, 'message');
    // Own messages should not increase unread count
    markReadUpTo(selectedServerId.value, selectedChannel.value, Date.now());
  }

  /** Upload an image and send the URL as a message. */
  async function uploadAndSend(file: File): Promise<void> {
    if (!selectedServerId.value || !selectedChannel.value) return;
    const serverId = selectedServerId.value;
    const channel = selectedChannel.value;

    isUploading.value = true;
    addMessage(
      serverId,
      channel,
      '',
      i18n.global.t('errors.uploadingFile', { name: file.name }) as string,
      'system',
    );

    try {
      const server = servers.value.find((s) => s.id === serverId);
      const userKeys = useUserSettingsStore().getProfile().uploadProviderKeys || {};
      const serverNick = nicknamePerServer.value[serverId] || nickname.value;
      const url = await uploadImage(file, {
        userKeys,
        blocked: server?.blockedUploadProviders,
        proxyAllowed: server?.proxyUploadProviders,
        nick: serverNick,
      });
      // Send the URL directly — bypass URL transforms (upload URLs must not be modified)
      getService().send(serverId, `PRIVMSG ${channel} :${url}`);
      addMessage(serverId, channel, nickname.value, url, 'message');
      markReadUpTo(serverId, channel, Date.now());
    } catch (err: unknown) {
      addMessage(
        serverId,
        channel,
        '',
        i18n.global.t('errors.uploadFailed', { message: (err as Error).message }) as string,
        'system',
      );
    } finally {
      isUploading.value = false;
    }
  }

  /** Initialize or update runtime info for a server. */
  function setServerInfo(serverId: string, info: Partial<ServerRuntimeInfo>): void {
    const current = serverInfo.value[serverId] || {
      capabilities: [],
      saslAvailable: false,
      saslAuthenticated: false,
      mircDetected: false,
      tls: false,
      host: '',
      port: 0,
    };
    serverInfo.value[serverId] = { ...current, ...info };
  }

  /** Get runtime info for a server. */
  function getServerInfo(serverId: string): ServerRuntimeInfo | undefined {
    return serverInfo.value[serverId];
  }

  /** Clear all messages in a channel. */
  function clearMessages(serverId: string, channel: string): void {
    const key: string = `${serverId}:${channel}`;
    if (messages.value[key]) {
      messages.value[key] = [];
      triggerRef(messages);
    }
  }

  /** Leave a channel or close a DM. */
  function leaveChannel(serverId: string, channel: string): void {
    if (isDM(channel)) {
      removeJoinedChannel(serverId, channel);
    } else {
      getService().partChannel(serverId, channel);
    }
  }

  /** Store API exposed to the command registry. */
  const commandStoreApi: CommandStore = {
    openDM,
    addMessage,
    clearMessages,
    leaveChannel,
    selectServer: (serverId: string) => {
      const ch = channels.value[serverId];
      if (ch?.length) selectChannel(serverId, ch[0]);
    },
    isDM,
    get nickname() {
      return nickname.value;
    },
  };

  /**
   * Mark a server as loading LIST.
   */
  function setListLoading(serverId: string): void {
    if (!listLoadingServers.value.includes(serverId)) {
      listLoadingServers.value.push(serverId);
    }
    // No longer waiting — now actively loading
    listWaitingServers.value = listWaitingServers.value.filter((id) => id !== serverId);
  }

  /**
   * Mark a server as done loading LIST.
   */
  function clearListLoading(serverId: string): void {
    listLoadingServers.value = listLoadingServers.value.filter((id) => id !== serverId);
  }

  /** Mark a server as waiting for its initial LIST delay. */
  function setListWaiting(serverId: string): void {
    if (!listWaitingServers.value.includes(serverId)) {
      listWaitingServers.value.push(serverId);
    }
  }

  /** Clear the waiting state for a server. */
  function clearListWaiting(serverId: string): void {
    listWaitingServers.value = listWaitingServers.value.filter((id) => id !== serverId);
  }

  /** Request a fresh LIST from all connected servers. */
  function refreshChannelList(): void {
    const service: IRCService = getService();
    for (const serverId of activeConnections.value) {
      service.requestList(serverId);
    }
  }

  /** When true, the watch won't clear the session (page is unloading). */
  let unloading = false;

  /** Mark the session as unloading so the watch doesn't clear it. */
  function markUnloading(): void {
    unloading = true;
  }

  /** Save current session to localStorage. */
  function persistSession(): void {
    // During page unload, don't touch the session — keep the last good save
    if (unloading) return;
    if (activeConnections.value.length === 0) {
      clearSession();
      return;
    }
    saveSession({
      serverIds: [...activeConnections.value],
      channels: { ...channels.value },
      selected: selectedServerId.value
        ? { serverId: selectedServerId.value, channel: selectedChannel.value }
        : null,
    } as SessionData);
  }

  /**
   * Restore a saved session — reconnect to servers and rejoin channels.
   * Called once on app startup.
   */
  function restoreSession(): void {
    const session: SessionData | null = loadSession();
    if (!session || !session.serverIds?.length) return;

    for (const serverId of session.serverIds) {
      const server: ServerConfig | undefined = servers.value.find((s) => s.id === serverId);
      if (!server) continue;
      if (isConnected(serverId) || connectingServers.value.includes(serverId)) continue;
      // Skip duplicate networks during restore
      const targetKey: string = server.tcpHost
        ? `${server.tcpHost}:${server.tcpPort || 6667}`
        : server.host;
      const isDuplicate: boolean = connectingServers.value.some((cid) => {
        const other = servers.value.find((s) => s.id === cid);
        if (!other) return false;
        const otherKey = other.tcpHost ? `${other.tcpHost}:${other.tcpPort || 6667}` : other.host;
        return otherKey === targetKey;
      });
      if (isDuplicate) continue;
      // Store the channels to rejoin after connection
      const channelsToJoin: string[] = (session.channels[serverId] || []).filter(
        (ch) => ch !== '*status',
      );
      connectingServers.value.push(server.id);
      getService().connect(server);
      connectTimers[server.id] = setTimeout(() => {
        if (!isConnected(server.id)) {
          connectingServers.value = connectingServers.value.filter((id) => id !== server.id);
          getService().cleanupConnection(server.id);
        }
      }, 15000);
      // Rejoin channels after registration completes (376/422)
      if (channelsToJoin.length > 0) {
        const service: IRCService = getService();
        const check: ReturnType<typeof setInterval> = setInterval(() => {
          if (service.isRegistered(serverId)) {
            clearInterval(check);
            for (const ch of channelsToJoin) {
              if (isDM(ch)) {
                addJoinedChannel(serverId, ch);
              } else {
                service.joinChannel(serverId, ch);
              }
            }
          }
        }, 500);
        // Safety: stop checking after 30s
        setTimeout(() => clearInterval(check), 30000);
      }
    }

    // Restore selection
    if (session.selected) {
      selectedServerId.value = session.selected.serverId;
      selectedChannel.value = session.selected.channel;
    }
  }

  /** Disconnect from all servers and clean up. */
  function cleanup(): void {
    getService().disconnectAll();
    if (!unloading) clearSession();
  }

  // Persist session on changes
  watch(
    [activeConnections, channels, () => selectedServerId.value, () => selectedChannel.value],
    () => persistSession(),
    { deep: true },
  );

  // Store API for the service (avoids circular reactive deps)
  const storeApi: IrcStoreApi = {
    get nickname() {
      return nickname.value;
    },
    get channels() {
      return channels.value;
    },
    get selectedServerId() {
      return selectedServerId.value;
    },
    get selectedChannel() {
      return selectedChannel.value;
    },
    addConnection,
    removeConnection,
    setListLoading,
    clearListLoading,
    setListWaiting,
    clearListWaiting,
    addJoinedChannel,
    removeJoinedChannel,
    addMessage,
    warnLastOwnMessage,
    addSystemMessage,
    setTopic,
    addUser,
    addUsers,
    finalizeUsers,
    removeUser,
    clearAvailableChannels,
    addAvailableChannel,
    flushChannelBuffer,
    selectChannel,
    setNickname,
    setDMOnline,
    isDM,
    renameUser,
    setServerInfo,
  };

  return {
    // State
    servers,
    activeConnections,
    statusRetainedServers,
    connectingServers,
    connectionError,
    openSettingsRequest,
    requestOpenSettings,
    selectedServerId,
    selectedChannel,
    channels,
    availableChannels,
    messages,
    users,
    topics,
    nickname,
    nicknamePerServer,
    filterServer,
    filterMinUsers,
    filterText,
    sortBy,

    // Getters
    connectedServers,
    disconnectedServers,
    selectedServer,
    currentMessages,
    currentUsers,
    currentTopic,
    isDM,
    isDMOnline,
    allJoinedChannels,
    allAvailableChannels,
    isListLoading,
    isListWaiting,
    totalAvailableCount,

    // Mutations
    isConnected,
    clearDisconnectedServer,
    selectServer,
    selectChannel,

    // Actions
    connectToServer,
    disconnectFromServer,
    joinChannel,
    partChannel,
    openDM,
    closeDMsWithUser,
    sendMessage,
    addMessage,
    uploadAndSend,
    isUploading,
    prefillMessage,
    canUpload,
    clearMessages,
    leaveChannel,
    refreshChannelList,
    changeNick,
    changeNickGlobal,
    unreadCount,
    markReadUpTo,
    dismissConnectionError,
    persistSession,
    markUnloading,
    restoreSession,
    cleanup,
    serverInfo,
    getServerInfo,
    setServerInfo,
  };
});

export type { DisplayChannel, JoinedChannelEntry, SessionData, OpenSettingsRequest };
export { useIrcStore };
