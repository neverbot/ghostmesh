import EventEmitter from '@/utils/event-emitter.js';

export default class IRCService extends EventEmitter {
  constructor() {
    super();
    this.connections = new Map();
    this.defaultConfig = {
      nickname: 'ghostmesh_' + Math.floor(Math.random() * 1000),
      username: 'ghostmesh',
      realname: 'Ghost Mesh IRC Client',
    };
  }

  connect(serverUrl, serverId = 'default', config = {}) {
    if (this.connections.has(serverId)) {
      console.warn(`Already connected to server ${serverId}`);
      return;
    }

    const ircConfig = {
      ...this.defaultConfig,
      ...config,
    };

    // Create WebSocket connection
    const socket = new WebSocket(serverUrl);

    // Create connection object
    const connection = {
      socket,
      channels: new Set(),
      config: ircConfig,
    };

    socket.onopen = () => {
      console.log(`Connected to IRC server ${serverId}`);
      this.emit('connected', { serverId });
      // Send IRC registration commands
      this.send(serverId, `NICK ${ircConfig.nickname}`);
      this.send(serverId, `USER ${ircConfig.username} 0 * :${ircConfig.realname}`);
    };

    socket.onmessage = (event) => {
      const message = event.data;
      console.log(`Raw message from ${serverId}:`, message);

      // Handle PING to prevent disconnection
      if (message.startsWith('PING')) {
        this.send(serverId, `PONG ${message.split(' ')[1]}`);
      }

      // Emit parsed message event
      this.parseIRCMessage(message, serverId);
    };

    socket.onerror = (error) => {
      console.error(`Connection error for server ${serverId}:`, error);
      this.emit('error', { serverId, error });
    };

    socket.onclose = () => {
      console.log(`Disconnected from server ${serverId}`);
      this.connections.delete(serverId);
      this.emit('disconnected', { serverId });
    };

    this.connections.set(serverId, connection);

    return connection;
  }

  send(serverId, message) {
    const connection = this.connections.get(serverId);
    if (!connection) {
      console.error(`No connection found for server ${serverId}`);
      return;
    }

    connection.socket.send(message + '\r\n');
  }

  joinChannel(serverId, channel) {
    const connection = this.connections.get(serverId);
    if (!connection) {
      console.error(`No connection found for server ${serverId}`);
      return;
    }

    if (!channel.startsWith('#')) {
      channel = '#' + channel;
    }

    this.send(serverId, `JOIN ${channel}`);
    connection.channels.add(channel);
  }

  sendMessage(serverId, channel, message) {
    if (!channel.startsWith('#')) {
      channel = '#' + channel;
    }

    this.send(serverId, `PRIVMSG ${channel} :${message}`);
  }

  parseIRCMessage(raw, serverId) {
    // Basic IRC message parser
    const match = raw.match(/^(?::([^ ]+) )?([^ ]+)(?: ([^:][^ ]*(?: [^:][^ ]*)*))?(?: :(.*))?$/);
    if (!match) return;

    const [, prefix, command, params = '', trailing] = match;
    const parsed = {
      serverId,
      prefix,
      command,
      params: params.split(' ').filter((p) => p),
      trailing,
      raw,
    };

    this.emit('message', parsed);
  }

  disconnect(serverId) {
    const connection = this.connections.get(serverId);
    if (connection) {
      this.send(serverId, 'QUIT :Goodbye');
      connection.socket.close();
      this.connections.delete(serverId);
    }
  }

  disconnectAll() {
    for (const [serverId] of this.connections) {
      this.disconnect(serverId);
    }
  }
}
