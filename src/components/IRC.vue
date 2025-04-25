<template>
  <div class="flex">
    <!-- Chat panel -->
    <div class="container flex-1">
      <h1 class="text-2xl font-bold">IRC Chat</h1>
      <div>
        <input
          v-model="message"
          placeholder="Type a message..."
          class="input"
          @keyup.enter="sendMessage"
        />
        <button
          class="btn"
          :disabled="!currentServerId"
          @click="joinChannel(currentServerId, 'test')"
        >
          Join #test
        </button>
      </div>
      <div class="messages">
        <div
          v-for="msg in messages"
          :key="msg"
        >
          {{ msg }}
        </div>
      </div>
    </div>

    <!-- Servers panel -->
    <div class="servers-panel">
      <h2 class="text-xl font-bold mb-4">Servers</h2>
      <div class="server-list">
        <div
          v-for="server in servers"
          :key="server.id"
          class="server-item"
        >
          <div class="server-info">
            <span>{{ server.name }}</span>
            <span class="text-sm text-gray-500">{{ server.host }}</span>
          </div>
          <button
            class="btn"
            :disabled="isConnected(server.id)"
            @click="connectToServer(server)"
          >
            {{ isConnected(server.id) ? 'Connected' : 'Connect' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
  import IRCService from '../services/irc.service.js';

  export default {
    data() {
      return {
        message: '',
        messages: [],
        ircService: new IRCService(),
        servers: [
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
        ],
        activeConnections: new Set(),
      };
    },
    computed: {
      currentServerId() {
        return Array.from(this.activeConnections)[0] || null;
      },
    },
    mounted() {
      // No need for initial connection as we'll connect via server buttons
    },
    beforeUnmount() {
      // Remove all event listeners when component is destroyed
      this.ircService.removeAllListeners();
      // Disconnect from all servers
      this.ircService.disconnectAll();
    },
    methods: {
      connectToServer(server) {
        try {
          const connection = this.ircService.connect(server.host, server.id, {
            secure: server.secure,
            port: server.port,
            nickname: 'ghostmesh_' + Math.floor(Math.random() * 1000),
          });

          if (connection) {
            this.setupIRCEvents(server);
          }
        } catch (error) {
          console.error(`Failed to connect to ${server.name}:`, error);
          this.messages.push(`Failed to connect to ${server.name}. Please try again later.`);
        }
      },

      setupIRCEvents(server) {
        this.ircService.on('connected', ({ serverId }) => {
          if (serverId === server.id) {
            this.activeConnections.add(serverId);
            this.messages.push(`Connected to ${server.name}`);
          }
        });

        this.ircService.on('disconnected', ({ serverId }) => {
          if (serverId === server.id) {
            this.activeConnections.delete(serverId);
            this.messages.push(`Disconnected from ${server.name}`);
          }
        });

        this.ircService.on('error', ({ serverId, error }) => {
          if (serverId === server.id) {
            this.activeConnections.delete(serverId);
            this.messages.push(`Error connecting to ${server.name}`);
          }
        });

        this.ircService.on('message', (parsed) => {
          if (parsed.serverId === server.id) {
            if (parsed.command === 'PRIVMSG') {
              const from = parsed.prefix ? parsed.prefix.split('!')[0] : 'Server';
              this.messages.push(`${from}: ${parsed.trailing}`);
            } else {
              // Optionally show other types of messages
              this.messages.push(
                `[${parsed.command}] ${parsed.trailing || parsed.params.join(' ')}`,
              );
            }
          }
        });
      },

      isConnected(serverId) {
        return this.activeConnections.has(serverId);
      },

      joinChannel(serverId, channel) {
        console.log(`Joining channel #${channel} on ${serverId}...`);
        if (!this.activeConnections.has(serverId)) {
          this.messages.push('Server not connected');
          return;
        }

        try {
          this.ircService.joinChannel(serverId, channel);
          this.messages.push(`Joining channel #${channel} on ${serverId}...`);
        } catch (error) {
          console.error(`Failed to join channel #${channel}:`, error);
          this.messages.push(`Failed to join channel #${channel}`);
        }
      },
    },
  };
</script>

<style scoped>
  .flex {
    display: flex;
    gap: 20px;
  }

  .container {
    padding: 20px;
    max-width: 600px;
    background-color: #f9f9f9;
    border-radius: 8px;
    height: calc(100vh - 40px);
    display: flex;
    flex-direction: column;
  }

  .servers-panel {
    width: 300px;
    padding: 20px;
    background-color: #f9f9f9;
    border-radius: 8px;
    height: calc(100vh - 40px);
  }

  .server-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .server-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px;
    background-color: white;
    border-radius: 4px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .server-info {
    display: flex;
    flex-direction: column;
  }

  .messages {
    flex: 1;
    overflow-y: auto;
    margin: 10px 0;
    padding: 10px;
    background-color: white;
    border-radius: 4px;
  }

  .input {
    width: 100%;
    padding: 8px;
    margin-top: 10px;
    border: 1px solid #ddd;
    border-radius: 4px;
  }

  .btn {
    padding: 8px 16px;
    background-color: #3498db;
    color: white;
    border: none;
    border-radius: 4px;
    margin-top: 10px;
    cursor: pointer;
  }

  .btn:disabled {
    background-color: #95a5a6;
    cursor: not-allowed;
  }
</style>
