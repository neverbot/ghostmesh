import EventEmitter from '@/utils/event-emitter.js';

export default class IRCService extends EventEmitter {
  constructor(store) {
    super();
    this.store = store;
    this.connections = new Map();
  }

  connect(server) {
    const serverId = server.id;
    if (this.connections.has(serverId)) return;

    const config = {
      nickname: this.store.nickname,
      username: 'ghostmesh',
      realname: 'GhostMesh IRC Client',
    };

    const socket = new WebSocket(server.host);

    const connection = { socket, config };

    socket.onopen = () => {
      this.store.addConnection(serverId);
      this.send(serverId, `NICK ${config.nickname}`);
      this.send(serverId, `USER ${config.username} 0 * :${config.realname}`);
    };

    socket.onmessage = (event) => {
      const raw = event.data;

      // Keep-alive
      if (raw.startsWith('PING')) {
        this.send(serverId, `PONG ${raw.split(' ')[1]}`);
        return;
      }

      const parsed = this.parseMessage(raw, serverId);
      if (parsed) this.handleMessage(parsed);
    };

    socket.onerror = () => {
      this.store.removeConnection(serverId);
      this.store.addSystemMessage(serverId, `Error connecting to ${server.name}`);
      this.cleanup(serverId);
    };

    socket.onclose = () => {
      this.store.removeConnection(serverId);
      this.store.addSystemMessage(serverId, `Disconnected from ${server.name}`);
      this.cleanup(serverId);
    };

    this.connections.set(serverId, connection);
  }

  send(serverId, message) {
    const connection = this.connections.get(serverId);
    if (!connection) return;
    connection.socket.send(message + '\r\n');
  }

  joinChannel(serverId, channel) {
    if (!channel.startsWith('#')) channel = '#' + channel;
    this.send(serverId, `JOIN ${channel}`);
  }

  sendMessage(serverId, channel, message) {
    this.send(serverId, `PRIVMSG ${channel} :${message}`);
  }

  requestList(serverId) {
    this.store.clearAvailableChannels(serverId);
    this.send(serverId, 'LIST');
  }

  disconnect(serverId) {
    const connection = this.connections.get(serverId);
    if (!connection) return;
    this.send(serverId, 'QUIT :Goodbye');
    connection.socket.close();
    this.cleanup(serverId);
  }

  disconnectAll() {
    for (const [serverId] of this.connections) {
      this.disconnect(serverId);
    }
  }

  cleanup(serverId) {
    this.connections.delete(serverId);
  }

  // --- IRC protocol handling ---

  parseMessage(raw, serverId) {
    const match = raw.match(/^(?::([^ ]+) )?([^ ]+)(?: ([^:][^ ]*(?: [^:][^ ]*)*))?(?: :(.*))?$/);
    if (!match) return null;

    const [, prefix, command, params = '', trailing] = match;
    return {
      serverId,
      prefix,
      command,
      params: params.split(' ').filter((p) => p),
      trailing,
      raw,
    };
  }

  handleMessage(parsed) {
    const { serverId, prefix, command, params, trailing } = parsed;
    const nick = prefix ? prefix.split('!')[0] : '';
    const s = this.store;

    switch (command) {
      case 'PRIVMSG': {
        s.addMessage(serverId, params[0], nick, trailing, 'message');
        break;
      }

      case 'JOIN': {
        const channel = trailing || params[0];
        if (nick === s.nickname) {
          s.addJoinedChannel(serverId, channel);
          s.selectChannel(serverId, channel);
        } else {
          s.addUser(serverId, channel, nick);
        }
        s.addMessage(serverId, channel, nick, `${nick} has joined ${channel}`, 'join');
        break;
      }

      case 'PART': {
        const channel = params[0];
        if (nick === s.nickname) {
          s.removeJoinedChannel(serverId, channel);
        } else {
          s.removeUser(serverId, channel, nick);
        }
        s.addMessage(serverId, channel, nick, `${nick} has left ${channel}`, 'part');
        break;
      }

      case 'QUIT': {
        const serverChannels = s.channels[serverId] || [];
        for (const channel of serverChannels) {
          s.removeUser(serverId, channel, nick);
          s.addMessage(serverId, channel, nick, `${nick} has quit (${trailing || ''})`, 'quit');
        }
        break;
      }

      case '332': {
        // RPL_TOPIC
        s.setTopic(serverId, params[1], trailing || '');
        break;
      }

      case '353': {
        // RPL_NAMREPLY
        const channel = params[2];
        const names = (trailing || '')
          .split(' ')
          .map((n) => n.replace(/^[@+%~&]/, ''))
          .filter(Boolean);
        s.addUsers(serverId, channel, names);
        break;
      }

      case '366':
        // RPL_ENDOFNAMES — no-op
        break;

      case '321':
        // RPL_LISTSTART — no-op, already cleared on request
        break;

      case '322': {
        // RPL_LIST — arrives one per channel, async
        s.addAvailableChannel(serverId, {
          name: params[1],
          users: parseInt(params[2], 10) || 0,
          topic: trailing || '',
        });
        break;
      }

      case '323':
        // RPL_LISTEND — no-op
        break;

      case '376':
      case '422': {
        // Registration complete — request channel list
        this.requestList(serverId);
        if (trailing) s.addSystemMessage(serverId, `[${command}] ${trailing}`);
        break;
      }

      default: {
        if (trailing) {
          s.addSystemMessage(serverId, `[${command}] ${trailing}`);
        }
        break;
      }
    }
  }
}
