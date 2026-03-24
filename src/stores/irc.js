import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import IRCService from '@/services/irc.service.js';

const useIrcStore = defineStore('irc', () => {
  // --- State ---

  const servers = ref([
    { id: 'example-1', name: 'Example Network', host: 'wss://example.invalid' },
    { id: 'example-2', name: 'Example Network', host: 'wss://example.invalid' },
  ]);

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

  // Channel list filters
  const filterServer = ref(null);
  const filterMinUsers = ref(0);
  const filterText = ref('');
  const sortBy = ref('users'); // 'users' | 'name'

  // Service (lazy init)
  let ircService = null;

  /** @returns {IRCService} */
  function getService() {
    if (!ircService) ircService = new IRCService(storeApi);
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

  /** All available channels (not joined) across all servers, with filters applied. */
  const allAvailableChannels = computed(() => {
    const result = [];
    const text = filterText.value.toLowerCase();
    const minUsers = filterMinUsers.value || 0;
    const serverFilter = filterServer.value;

    for (const serverId of activeConnections.value) {
      if (serverFilter && serverId !== serverFilter) continue;
      const server = servers.value.find((s) => s.id === serverId);
      const serverName = server?.name || serverId;
      for (const ch of availableChannels.value[serverId] || []) {
        if (joinedSet.value.has(`${serverId}:${ch.name}`)) continue;
        if (ch.users < minUsers) continue;
        if (text && !ch.name.toLowerCase().includes(text) && !ch.topic.toLowerCase().includes(text))
          continue;
        result.push({ serverId, serverName, ...ch });
      }
    }

    if (sortBy.value === 'name') {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      result.sort((a, b) => b.users - a.users);
    }
    return result;
  });

  /** Total count of available channels before filtering (for display). */
  const totalAvailableCount = computed(() => {
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
  }

  /**
   * Add a single available channel entry (called per RPL_LIST).
   * @param {string} serverId
   * @param {{ name: string, users: number, topic: string }} channel
   */
  function addAvailableChannel(serverId, channel) {
    if (!availableChannels.value[serverId]) availableChannels.value[serverId] = [];
    availableChannels.value[serverId].push(channel);
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
   * Send a message to the currently selected channel.
   * @param {string} content
   */
  function sendMessage(content) {
    if (!selectedServerId.value || !selectedChannel.value) return;
    if (selectedChannel.value === '*status') return;
    getService().sendMessage(selectedServerId.value, selectedChannel.value, content);
    addMessage(selectedServerId.value, selectedChannel.value, nickname.value, content, 'message');
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
    totalAvailableCount,

    // Mutations
    isConnected,
    selectServer,
    selectChannel,

    // Actions
    connectToServer,
    disconnectFromServer,
    joinChannel,
    sendMessage,
    cleanup,
  };
});

export { useIrcStore };
