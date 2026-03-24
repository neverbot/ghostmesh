import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import IRCService from '@/services/irc.service.js';

export const useIrcStore = defineStore('irc', () => {
  // --- State ---

  const servers = ref([
    {
      id: 'example-1',
      name: 'Example Network',
      host: 'wss://example.invalid',
    },
    {
      id: 'example-2',
      name: 'Example Network',
      host: 'wss://example.invalid',
    },
  ]);

  const activeConnections = ref([]);
  const selectedServerId = ref(null);
  const selectedChannel = ref(null);
  const nickname = ref('ghostmesh_' + Math.floor(Math.random() * 1000));

  // { [serverId]: string[] } — joined channels
  const channels = ref({});
  // { [serverId]: { name, users, topic }[] } — available channels from LIST (grows async)
  const availableChannels = ref({});
  // { [`${serverId}:${channel}`]: MessageObject[] }
  const messages = ref({});
  // { [`${serverId}:${channel}`]: string[] }
  const users = ref({});
  // { [`${serverId}:${channel}`]: string }
  const topics = ref({});

  // Service (initialized lazily to break circular dep)
  let ircService = null;

  function getService() {
    if (!ircService) {
      ircService = new IRCService(storeApi);
    }
    return ircService;
  }

  // --- Getters ---

  const connectedServers = computed(() => {
    return servers.value.filter((s) => activeConnections.value.includes(s.id));
  });

  const disconnectedServers = computed(() => {
    return servers.value.filter((s) => !activeConnections.value.includes(s.id));
  });

  const selectedServer = computed(() => {
    return servers.value.find((s) => s.id === selectedServerId.value) || null;
  });

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

  // All joined channels across all connected servers, with server info
  const allJoinedChannels = computed(() => {
    const result = [];
    for (const serverId of activeConnections.value) {
      const server = servers.value.find((s) => s.id === serverId);
      const serverChannels = channels.value[serverId] || [];
      for (const channel of serverChannels) {
        result.push({ serverId, serverName: server?.name || serverId, channel });
      }
    }
    return result;
  });

  // All available channels across all connected servers (grows async via addAvailableChannel)
  const allAvailableChannels = computed(() => {
    const joined = new Set();
    for (const serverId of activeConnections.value) {
      for (const ch of channels.value[serverId] || []) {
        joined.add(`${serverId}:${ch}`);
      }
    }

    const result = [];
    for (const serverId of activeConnections.value) {
      const server = servers.value.find((s) => s.id === serverId);
      const available = availableChannels.value[serverId] || [];
      for (const ch of available) {
        if (!joined.has(`${serverId}:${ch.name}`)) {
          result.push({ serverId, serverName: server?.name || serverId, ...ch });
        }
      }
    }
    return result.sort((a, b) => b.users - a.users);
  });

  // --- Mutations (pure state changes) ---

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

  function removeConnection(serverId) {
    activeConnections.value = activeConnections.value.filter((id) => id !== serverId);
  }

  function selectServer(serverId) {
    selectedServerId.value = serverId;
    const serverChannels = channels.value[serverId] || [];
    selectedChannel.value = serverChannels[0] || null;
  }

  function selectChannel(serverId, channel) {
    selectedServerId.value = serverId;
    selectedChannel.value = channel;
  }

  function isConnected(serverId) {
    return activeConnections.value.includes(serverId);
  }

  function addJoinedChannel(serverId, channel) {
    if (!channels.value[serverId]) {
      channels.value[serverId] = [];
    }
    if (!channels.value[serverId].includes(channel)) {
      channels.value[serverId].push(channel);
    }
    const key = `${serverId}:${channel}`;
    if (!messages.value[key]) messages.value[key] = [];
    if (!users.value[key]) users.value[key] = [];
  }

  function removeJoinedChannel(serverId, channel) {
    if (channels.value[serverId]) {
      channels.value[serverId] = channels.value[serverId].filter((c) => c !== channel);
    }
    if (selectedServerId.value === serverId && selectedChannel.value === channel) {
      const remaining = channels.value[serverId] || [];
      selectedChannel.value = remaining[0] || null;
    }
  }

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

  function setTopic(serverId, channel, topic) {
    topics.value[`${serverId}:${channel}`] = topic;
  }

  function addUser(serverId, channel, nick) {
    const key = `${serverId}:${channel}`;
    if (!users.value[key]) users.value[key] = [];
    if (!users.value[key].includes(nick)) {
      users.value[key].push(nick);
    }
  }

  function addUsers(serverId, channel, names) {
    const key = `${serverId}:${channel}`;
    if (!users.value[key]) users.value[key] = [];
    for (const name of names) {
      if (!users.value[key].includes(name)) {
        users.value[key].push(name);
      }
    }
  }

  function removeUser(serverId, channel, nick) {
    const key = `${serverId}:${channel}`;
    if (users.value[key]) {
      users.value[key] = users.value[key].filter((u) => u !== nick);
    }
  }

  function clearAvailableChannels(serverId) {
    availableChannels.value[serverId] = [];
  }

  function addAvailableChannel(serverId, channel) {
    if (!availableChannels.value[serverId]) {
      availableChannels.value[serverId] = [];
    }
    availableChannels.value[serverId].push(channel);
  }

  // --- Actions (delegate to service) ---

  function connectToServer(server) {
    if (isConnected(server.id)) return;
    getService().connect(server);
  }

  function disconnectFromServer(serverId) {
    getService().disconnect(serverId);
  }

  function joinChannel(serverId, channel) {
    if (!isConnected(serverId)) return;
    getService().joinChannel(serverId, channel);
  }

  function sendMessage(content) {
    if (!selectedServerId.value || !selectedChannel.value) return;
    if (selectedChannel.value === '*status') return;
    getService().sendMessage(selectedServerId.value, selectedChannel.value, content);
    addMessage(selectedServerId.value, selectedChannel.value, nickname.value, content, 'message');
  }

  function cleanup() {
    getService().disconnectAll();
  }

  // Public API reference for the service
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

    // Getters
    connectedServers,
    disconnectedServers,
    selectedServer,
    currentMessages,
    currentUsers,
    currentTopic,
    allJoinedChannels,
    allAvailableChannels,

    // Mutations
    isConnected,
    selectServer,
    selectChannel,

    // Actions (service delegation)
    connectToServer,
    disconnectFromServer,
    joinChannel,
    sendMessage,
    cleanup,
  };
});
