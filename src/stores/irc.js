import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import IRCService from '@/services/irc.service.js';

export const useIrcStore = defineStore('irc', () => {
  const ircService = new IRCService();

  // State
  const servers = ref([
    {
      id: 'example-1',
      name: 'Example Network',
      host: 'wss://example.invalid',
      port: 443,
      secure: true,
    },
    {
      id: 'local',
      name: 'Local',
      host: 'ws://localhost:6667',
      port: 6667,
      secure: false,
    },
  ]);

  const activeConnections = ref([]);
  const selectedServerId = ref(null);
  const selectedChannel = ref(null);
  const nickname = ref('ghostmesh_' + Math.floor(Math.random() * 1000));

  // { [serverId]: string[] } — joined channels
  const channels = ref({});
  // { [serverId]: { name, users, topic }[] } — available channels from LIST
  const availableChannels = ref({});
  // { [`${serverId}:${channel}`]: MessageObject[] }
  const messages = ref({});
  // { [`${serverId}:${channel}`]: string[] }
  const users = ref({});
  // { [`${serverId}:${channel}`]: string }
  const topics = ref({});

  // Getters
  const currentMessages = computed(() => {
    if (!selectedServerId.value || !selectedChannel.value) return [];
    const key = `${selectedServerId.value}:${selectedChannel.value}`;
    return messages.value[key] || [];
  });

  const currentUsers = computed(() => {
    if (!selectedServerId.value || !selectedChannel.value) return [];
    const key = `${selectedServerId.value}:${selectedChannel.value}`;
    return users.value[key] || [];
  });

  const currentChannels = computed(() => {
    if (!selectedServerId.value) return [];
    return channels.value[selectedServerId.value] || [];
  });

  const currentTopic = computed(() => {
    if (!selectedServerId.value || !selectedChannel.value) return '';
    const key = `${selectedServerId.value}:${selectedChannel.value}`;
    return topics.value[key] || '';
  });

  const currentAvailableChannels = computed(() => {
    if (!selectedServerId.value) return [];
    return availableChannels.value[selectedServerId.value] || [];
  });

  const selectedServer = computed(() => {
    return servers.value.find((s) => s.id === selectedServerId.value) || null;
  });

  // Helpers
  function messageKey(serverId, channel) {
    return `${serverId}:${channel}`;
  }

  function addMessage(serverId, channel, nick, content, type = 'message') {
    const key = messageKey(serverId, channel);
    if (!messages.value[key]) {
      messages.value[key] = [];
    }
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
    // System messages go to the server's "status" channel
    const channel = '*status';
    addMessage(serverId, channel, '', content, 'system');

    // Also add to selected channel if on this server
    if (
      selectedServerId.value === serverId &&
      selectedChannel.value &&
      selectedChannel.value !== '*status'
    ) {
      addMessage(serverId, selectedChannel.value, '', content, 'system');
    }
  }

  // Actions
  function isConnected(serverId) {
    return activeConnections.value.includes(serverId);
  }

  function connectToServer(server) {
    if (isConnected(server.id)) return;

    const config = {
      nickname: nickname.value,
    };

    const onConnected = ({ serverId }) => {
      if (serverId !== server.id) return;
      if (!activeConnections.value.includes(serverId)) {
        activeConnections.value.push(serverId);
      }
      // Initialize channels for this server with a status channel
      if (!channels.value[serverId]) {
        channels.value[serverId] = ['*status'];
      }
      // Auto-select this server if nothing selected
      if (!selectedServerId.value) {
        selectedServerId.value = serverId;
        selectedChannel.value = '*status';
      }
      addSystemMessage(serverId, `Connected to ${server.name}`);
      // Auto-request channel list
      listChannels(serverId);
    };

    const onDisconnected = ({ serverId }) => {
      if (serverId !== server.id) return;
      activeConnections.value = activeConnections.value.filter((id) => id !== serverId);
      addSystemMessage(serverId, `Disconnected from ${server.name}`);
      cleanup();
    };

    const onError = ({ serverId }) => {
      if (serverId !== server.id) return;
      activeConnections.value = activeConnections.value.filter((id) => id !== serverId);
      addSystemMessage(serverId, `Error connecting to ${server.name}`);
      cleanup();
    };

    const onMessage = (parsed) => {
      if (parsed.serverId !== server.id) return;
      handleIRCMessage(parsed);
    };

    function cleanup() {
      ircService.off('connected', onConnected);
      ircService.off('disconnected', onDisconnected);
      ircService.off('error', onError);
      ircService.off('message', onMessage);
    }

    ircService.on('connected', onConnected);
    ircService.on('disconnected', onDisconnected);
    ircService.on('error', onError);
    ircService.on('message', onMessage);

    try {
      ircService.connect(server.host, server.id, config);
    } catch (error) {
      console.error(`Failed to connect to ${server.name}:`, error);
      addSystemMessage(server.id, `Failed to connect to ${server.name}`);
    }
  }

  function disconnectFromServer(serverId) {
    ircService.disconnect(serverId);
  }

  function joinChannel(serverId, channel) {
    if (!isConnected(serverId)) return;

    if (!channel.startsWith('#')) {
      channel = '#' + channel;
    }

    ircService.joinChannel(serverId, channel);
  }

  function sendMessage(content) {
    if (!selectedServerId.value || !selectedChannel.value) return;
    if (selectedChannel.value === '*status') return;

    ircService.sendMessage(selectedServerId.value, selectedChannel.value, content);

    // IRC doesn't echo back our own messages
    addMessage(selectedServerId.value, selectedChannel.value, nickname.value, content, 'message');
  }

  function listChannels(serverId) {
    if (!isConnected(serverId)) return;
    // Clear previous list before requesting a new one
    availableChannels.value[serverId] = [];
    ircService.send(serverId, 'LIST');
  }

  function selectServer(serverId) {
    selectedServerId.value = serverId;
    const serverChannels = channels.value[serverId] || [];
    selectedChannel.value = serverChannels[0] || null;
  }

  function selectChannel(channel) {
    selectedChannel.value = channel;
  }

  // IRC message handler
  function handleIRCMessage(parsed) {
    const { serverId, prefix, command, params, trailing } = parsed;
    const nick = prefix ? prefix.split('!')[0] : '';

    switch (command) {
      case 'PRIVMSG': {
        const channel = params[0];
        addMessage(serverId, channel, nick, trailing, 'message');
        break;
      }

      case 'JOIN': {
        const channel = trailing || params[0];
        if (nick === nickname.value) {
          // We joined a channel
          if (!channels.value[serverId]) {
            channels.value[serverId] = [];
          }
          if (!channels.value[serverId].includes(channel)) {
            channels.value[serverId].push(channel);
          }
          // Initialize message and user arrays
          const key = messageKey(serverId, channel);
          if (!messages.value[key]) {
            messages.value[key] = [];
          }
          if (!users.value[key]) {
            users.value[key] = [];
          }
          // Auto-select the newly joined channel
          selectedChannel.value = channel;
        } else {
          // Someone else joined
          const key = messageKey(serverId, channel);
          if (users.value[key] && !users.value[key].includes(nick)) {
            users.value[key].push(nick);
          }
        }
        addMessage(serverId, channel, nick, `${nick} has joined ${channel}`, 'join');
        break;
      }

      case 'PART': {
        const channel = params[0];
        if (nick === nickname.value) {
          // We left a channel
          if (channels.value[serverId]) {
            channels.value[serverId] = channels.value[serverId].filter((c) => c !== channel);
          }
          if (selectedChannel.value === channel) {
            const remaining = channels.value[serverId] || [];
            selectedChannel.value = remaining[0] || null;
          }
        } else {
          const key = messageKey(serverId, channel);
          if (users.value[key]) {
            users.value[key] = users.value[key].filter((u) => u !== nick);
          }
        }
        addMessage(serverId, channel, nick, `${nick} has left ${channel}`, 'part');
        break;
      }

      case 'QUIT': {
        // Remove user from all channels on this server
        const serverChannels = channels.value[serverId] || [];
        for (const channel of serverChannels) {
          const key = messageKey(serverId, channel);
          if (users.value[key]) {
            users.value[key] = users.value[key].filter((u) => u !== nick);
          }
          addMessage(serverId, channel, nick, `${nick} has quit (${trailing || ''})`, 'quit');
        }
        break;
      }

      case '332': {
        // RPL_TOPIC: <channel> :<topic>
        const channel = params[1];
        const key = messageKey(serverId, channel);
        topics.value[key] = trailing || '';
        break;
      }

      case '353': {
        // RPL_NAMREPLY: <nick> = <channel> :<names>
        const channel = params[2];
        const key = messageKey(serverId, channel);
        const names = (trailing || '')
          .split(' ')
          .map((n) => n.replace(/^[@+%~&]/, ''))
          .filter(Boolean);
        if (!users.value[key]) {
          users.value[key] = [];
        }
        // Append (366 signals end, but we just accumulate)
        for (const name of names) {
          if (!users.value[key].includes(name)) {
            users.value[key].push(name);
          }
        }
        break;
      }

      case '366': {
        // RPL_ENDOFNAMES - nothing to do, users already populated
        break;
      }

      case '321': {
        // RPL_LISTSTART — clear the list for a fresh request
        if (!availableChannels.value[serverId]) {
          availableChannels.value[serverId] = [];
        }
        break;
      }

      case '322': {
        // RPL_LIST: <channel> <visible> :<topic>
        const channelName = params[1];
        const userCount = parseInt(params[2], 10) || 0;
        if (!availableChannels.value[serverId]) {
          availableChannels.value[serverId] = [];
        }
        availableChannels.value[serverId].push({
          name: channelName,
          users: userCount,
          topic: trailing || '',
        });
        break;
      }

      case '323': {
        // RPL_LISTEND — list complete, nothing extra to do
        break;
      }

      default: {
        // Numeric replies and other commands go to status
        if (trailing) {
          addSystemMessage(serverId, `[${command}] ${trailing}`);
        }
        break;
      }
    }
  }

  function cleanup() {
    ircService.removeAllListeners();
    ircService.disconnectAll();
  }

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
    currentMessages,
    currentUsers,
    currentChannels,
    currentTopic,
    currentAvailableChannels,
    selectedServer,

    // Actions
    isConnected,
    connectToServer,
    disconnectFromServer,
    joinChannel,
    listChannels,
    sendMessage,
    selectServer,
    selectChannel,
    cleanup,
  };
});
