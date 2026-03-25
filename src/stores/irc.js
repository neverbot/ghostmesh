import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import IRCService from '@/services/irc.service.js';
import { useServerSettingsStore } from '@/stores/server-settings.js';
import defaultServers from '@/servers.js';

const useIrcStore = defineStore('irc', () => {
  // --- State ---

  const servers = ref([...defaultServers]);

  const activeConnections = ref([]);
  const selectedServerId = ref(null);
  const selectedChannel = ref(null);
  const nickname = ref('ghostmesh_' + Math.floor(Math.random() * 1000));

  /** @type {import('vue').Ref<Record<string, string[]>>} joined channels per server */
  const channels = ref({});
  /** @type {import('vue').Ref<Record<string, {name:string,users:number,topic:string}[]>>} */
  const availableChannels = ref({});
  /** @type {import('vue').Ref<Record<string, object[]>>} messages per serverId:channel key */
  const messages = ref({});
  /** @type {import('vue').Ref<Record<string, string[]>>} user lists per serverId:channel key */
  const users = ref({});
  /** @type {import('vue').Ref<Record<string, string>>} topics per serverId:channel key */
  const topics = ref({});

  /** @type {import('vue').Ref<string[]>} servers currently loading LIST */
  const listLoadingServers = ref([]);

  // Channel list filters
  const filterServer = ref(null);
  const filterMinUsers = ref(0);
  const filterText = ref('');
  const sortBy = ref('users'); // 'users' | 'name'

  // Service (lazy init)
  let ircService = null;

  /** @returns {IRCService} */
  function getService() {
    if (!ircService) {
      const serverSettings = useServerSettingsStore();
      ircService = new IRCService(storeApi, serverSettings);
    }
    return ircService;
  }

  // --- Getters ---

  const connectedServers = computed(() =>
    servers.value.filter((s) => activeConnections.value.includes(s.id)),
  );

  const disconnectedServers = computed(() =>
    servers.value.filter((s) => !activeConnections.value.includes(s.id)),
  );

  const selectedServer = computed(
    () => servers.value.find((s) => s.id === selectedServerId.value) || null,
  );

  const currentMessages = computed(() => {
    if (!selectedServerId.value || !selectedChannel.value) return [];
    return messages.value[`${selectedServerId.value}:${selectedChannel.value}`] || [];
  });

  const currentUsers = computed(() => {
    if (!selectedServerId.value || !selectedChannel.value) return [];
    return users.value[`${selectedServerId.value}:${selectedChannel.value}`] || [];
  });

  const currentTopic = computed(() => {
    if (!selectedServerId.value || !selectedChannel.value) return '';
    return topics.value[`${selectedServerId.value}:${selectedChannel.value}`] || '';
  });

  /** All joined channels across connected servers, with server metadata. */
  const allJoinedChannels = computed(() => {
    const result = [];
    for (const serverId of activeConnections.value) {
      const server = servers.value.find((s) => s.id === serverId);
      for (const channel of channels.value[serverId] || []) {
        result.push({ serverId, serverName: server?.name || serverId, channel });
      }
    }
    return result;
  });

  /** Set of "serverId:channelName" keys for quick joined lookup. */
  const joinedSet = computed(() => {
    const set = new Set();
    for (const serverId of activeConnections.value) {
      for (const ch of channels.value[serverId] || []) {
        set.add(`${serverId}:${ch}`);
      }
    }
    return set;
  });

  /**
   * Build a text matcher from filter input. Supports * and ? wildcards.
   * Plain text without wildcards does a substring match.
   * @param {string} filter
   * @returns {(text: string) => boolean}
   */
  function buildMatcher(filter) {
    if (!filter) return () => true;
    const lower = filter.toLowerCase();
    const hasWildcard = lower.includes('*') || lower.includes('?');
    if (!hasWildcard) {
      return (text) => text.toLowerCase().includes(lower);
    }
    // Convert glob to regex: * -> .*, ? -> ., escape the rest
    const pattern = lower
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    const re = new RegExp(`^${pattern}$`);
    return (text) => re.test(text.toLowerCase());
  }

  /** Whether any server is currently loading a channel list. */
  const isListLoading = computed(() => listLoadingServers.value.length > 0);

  /**
   * All available channels (not joined) across all servers, with filters applied.
   * Returns empty during LIST loading. Data is pre-sorted in the store, so no
   * sort is needed here — only filtering and early exit at the render limit.
   */
  const allAvailableChannels = computed(() => {
    if (listLoadingServers.value.length > 0) return [];

    const result = [];
    const matcher = buildMatcher(filterText.value);
    const minUsers = filterMinUsers.value || 0;
    const serverFilter = filterServer.value;
    const byName = sortBy.value === 'name';
    const joined = joinedSet.value;

    // Collect from all servers (pre-sorted per server)
    const sources = [];
    for (const serverId of activeConnections.value) {
      if (serverFilter && serverId !== serverFilter) continue;
      const server = servers.value.find((s) => s.id === serverId);
      const serverName = server?.name || serverId;
      const list = availableChannels.value[serverId];
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
        ch._sid = src.serverId;
        ch._sname = src.serverName;
        result.push(ch);
      }
    }

    // Sort only if multiple servers (single server data is pre-sorted)
    if (sources.length > 1 || byName) {
      if (byName) {
        result.sort((a, b) => a.name.localeCompare(b.name));
      } else {
        result.sort((a, b) => b.users - a.users);
      }
    }
    return result;
  });

  /** Total count of available channels before filtering (for display). */
  const totalAvailableCount = computed(() => {
    if (listLoadingServers.value.length > 0) return 0;
    let count = 0;
    for (const serverId of activeConnections.value) {
      count += (availableChannels.value[serverId] || []).length;
    }
    return count;
  });

  // --- Mutations ---

  /**
   * Mark a server as connected and initialize its status channel.
   * @param {string} serverId
   */
  function addConnection(serverId) {
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
   * @param {string} serverId
   */
  function removeConnection(serverId) {
    activeConnections.value = activeConnections.value.filter((id) => id !== serverId);
  }

  /**
   * Select a server and its first channel.
   * @param {string} serverId
   */
  function selectServer(serverId) {
    selectedServerId.value = serverId;
    const serverChannels = channels.value[serverId] || [];
    selectedChannel.value = serverChannels[0] || null;
  }

  /**
   * Select a specific channel on a specific server.
   * @param {string} serverId
   * @param {string} channel
   */
  function selectChannel(serverId, channel) {
    selectedServerId.value = serverId;
    selectedChannel.value = channel;
  }

  /**
   * Check if a server is currently connected.
   * @param {string} serverId
   * @returns {boolean}
   */
  function isConnected(serverId) {
    return activeConnections.value.includes(serverId);
  }

  /**
   * Add a channel to a server's joined list and initialize its data.
   * @param {string} serverId
   * @param {string} channel
   */
  function addJoinedChannel(serverId, channel) {
    if (!channels.value[serverId]) channels.value[serverId] = [];
    if (!channels.value[serverId].includes(channel)) {
      channels.value[serverId].push(channel);
    }
    const key = `${serverId}:${channel}`;
    if (!messages.value[key]) messages.value[key] = [];
    if (!users.value[key]) users.value[key] = [];
  }

  /**
   * Remove a channel from a server's joined list.
   * @param {string} serverId
   * @param {string} channel
   */
  function removeJoinedChannel(serverId, channel) {
    if (channels.value[serverId]) {
      channels.value[serverId] = channels.value[serverId].filter((c) => c !== channel);
    }
    if (selectedServerId.value === serverId && selectedChannel.value === channel) {
      const remaining = channels.value[serverId] || [];
      selectedChannel.value = remaining[0] || null;
    }
  }

  /**
   * Add a chat message to a channel.
   * @param {string} serverId
   * @param {string} channel
   * @param {string} nick
   * @param {string} content
   * @param {string} [type='message']
   */
  function addMessage(serverId, channel, nick, content, type = 'message') {
    const key = `${serverId}:${channel}`;
    if (!messages.value[key]) messages.value[key] = [];
    messages.value[key].push({
      id: crypto.randomUUID(),
      serverId,
      channel,
      nick,
      content,
      timestamp: new Date(),
      type,
    });
  }

  /**
   * Add a system message to the server's status channel (and current channel if same server).
   * @param {string} serverId
   * @param {string} content
   */
  function addSystemMessage(serverId, content) {
    addMessage(serverId, '*status', '', content, 'system');
    if (
      selectedServerId.value === serverId &&
      selectedChannel.value &&
      selectedChannel.value !== '*status'
    ) {
      addMessage(serverId, selectedChannel.value, '', content, 'system');
    }
  }

  /**
   * Set the topic for a channel.
   * @param {string} serverId
   * @param {string} channel
   * @param {string} topic
   */
  function setTopic(serverId, channel, topic) {
    topics.value[`${serverId}:${channel}`] = topic;
  }

  /**
   * Add a single user to a channel's user list.
   * @param {string} serverId
   * @param {string} channel
   * @param {string} nick
   */
  function addUser(serverId, channel, nick) {
    const key = `${serverId}:${channel}`;
    if (!users.value[key]) users.value[key] = [];
    if (!users.value[key].includes(nick)) users.value[key].push(nick);
  }

  /**
   * Add multiple users to a channel's user list.
   * @param {string} serverId
   * @param {string} channel
   * @param {string[]} names
   */
  function addUsers(serverId, channel, names) {
    const key = `${serverId}:${channel}`;
    if (!users.value[key]) users.value[key] = [];
    for (const name of names) {
      if (!users.value[key].includes(name)) users.value[key].push(name);
    }
  }

  /**
   * Remove a user from a channel's user list.
   * @param {string} serverId
   * @param {string} channel
   * @param {string} nick
   */
  function removeUser(serverId, channel, nick) {
    const key = `${serverId}:${channel}`;
    if (users.value[key]) {
      users.value[key] = users.value[key].filter((u) => u !== nick);
    }
  }

  /**
   * Clear available channels for a server (before LIST refresh).
   * @param {string} serverId
   */
  function clearAvailableChannels(serverId) {
    availableChannels.value[serverId] = [];
    // Clear any pending buffer
    delete channelBuffer[serverId];
  }

  /** @type {Record<string, object[]>} buffer per server, flushed periodically */
  const channelBuffer = {};
  /** @type {Record<string, number>} flush timer per server */
  const channelFlushTimers = {};

  /**
   * Flush buffered channels into the reactive state.
   * @param {string} serverId
   */
  /**
   * Flush buffered channels into the reactive state.
   * @param {string} serverId
   * @param {boolean} [final=false] — true when LIST is complete, triggers sort
   */
  function flushChannelBuffer(serverId, final = false) {
    const buf = channelBuffer[serverId];
    if (!buf || buf.length === 0) {
      if (final && availableChannels.value[serverId]) {
        availableChannels.value[serverId].sort((a, b) => b.users - a.users);
      }
      return;
    }
    if (!availableChannels.value[serverId]) availableChannels.value[serverId] = [];
    availableChannels.value[serverId].push(...buf);
    channelBuffer[serverId] = [];
    if (final) {
      availableChannels.value[serverId].sort((a, b) => b.users - a.users);
    }
  }

  /**
   * Add a single available channel entry (called per RPL_LIST).
   * Batches updates to avoid blocking the UI with thousands of reactive pushes.
   * @param {string} serverId
   * @param {{ name: string, users: number, topic: string }} channel
   */
  function addAvailableChannel(serverId, channel) {
    if (!channelBuffer[serverId]) channelBuffer[serverId] = [];
    channelBuffer[serverId].push(channel);
    // Flush every 100 channels or schedule a timer flush
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

  /**
   * Connect to a server.
   * @param {{ id: string, name: string, host: string }} server
   */
  function connectToServer(server) {
    if (isConnected(server.id)) return;
    getService().connect(server);
  }

  /**
   * Disconnect from a server.
   * @param {string} serverId
   */
  function disconnectFromServer(serverId) {
    getService().disconnect(serverId);
  }

  /**
   * Join a channel on a server.
   * @param {string} serverId
   * @param {string} channel
   */
  function joinChannel(serverId, channel) {
    if (!isConnected(serverId)) return;
    getService().joinChannel(serverId, channel);
  }

  /**
   * Leave a channel on a server.
   * @param {string} serverId
   * @param {string} channel
   */
  function partChannel(serverId, channel) {
    if (!isConnected(serverId)) return;
    if (channel === '*status') return;
    getService().partChannel(serverId, channel);
  }

  /**
   * Send a message to the currently selected channel.
   * @param {string} content
   */
  function sendMessage(content) {
    if (!selectedServerId.value || !selectedChannel.value) return;
    if (selectedChannel.value === '*status') return;
    getService().sendMessage(selectedServerId.value, selectedChannel.value, content);
    addMessage(selectedServerId.value, selectedChannel.value, nickname.value, content, 'message');
  }

  /**
   * Mark a server as loading LIST.
   * @param {string} serverId
   */
  function setListLoading(serverId) {
    if (!listLoadingServers.value.includes(serverId)) {
      listLoadingServers.value.push(serverId);
    }
  }

  /**
   * Mark a server as done loading LIST.
   * @param {string} serverId
   */
  function clearListLoading(serverId) {
    listLoadingServers.value = listLoadingServers.value.filter((id) => id !== serverId);
  }

  /** Request a fresh LIST from all connected servers. */
  function refreshChannelList() {
    const service = getService();
    for (const serverId of activeConnections.value) {
      service.requestList(serverId);
    }
  }

  /** Disconnect from all servers and clean up. */
  function cleanup() {
    getService().disconnectAll();
  }

  // Store API for the service (avoids circular reactive deps)
  const storeApi = {
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
    addJoinedChannel,
    removeJoinedChannel,
    addMessage,
    addSystemMessage,
    setTopic,
    addUser,
    addUsers,
    removeUser,
    clearAvailableChannels,
    addAvailableChannel,
    flushChannelBuffer,
    selectChannel,
  };

  return {
    // State
    servers,
    activeConnections,
    selectedServerId,
    selectedChannel,
    channels,
    availableChannels,
    messages,
    users,
    topics,
    nickname,
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
    allJoinedChannels,
    allAvailableChannels,
    isListLoading,
    totalAvailableCount,

    // Mutations
    isConnected,
    selectServer,
    selectChannel,

    // Actions
    connectToServer,
    disconnectFromServer,
    joinChannel,
    partChannel,
    sendMessage,
    refreshChannelList,
    cleanup,
  };
});

export { useIrcStore };
