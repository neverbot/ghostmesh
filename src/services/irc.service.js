import EventEmitter from '@/utils/event-emitter.js';

/** Default interval between automatic LIST refreshes (5 minutes). */
const LIST_REFRESH_INTERVAL = 5 * 60 * 1000;

/**
 * IRC protocol service. Manages WebSocket connections, parses IRC messages,
 * handles protocol commands, and periodically refreshes channel lists.
 */
class IRCService extends EventEmitter {
  /**
   * @param {object} store — store API with mutation methods
   */
  constructor(store) {
    super();
    this.store = store;
    this.connections = new Map();
    this.listTimers = new Map();
  }

  /**
   * Connect to an IRC server via WebSocket.
   * @param {{ id: string, name: string, host: string }} server
   */
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
      this.cleanupConnection(serverId);
    };

    socket.onclose = () => {
      this.store.removeConnection(serverId);
      this.store.addSystemMessage(serverId, `Disconnected from ${server.name}`);
      this.cleanupConnection(serverId);
    };

    this.connections.set(serverId, connection);
  }

  /**
   * Send a raw IRC message to a server.
   * @param {string} serverId
   * @param {string} message — raw IRC line (without trailing CRLF)
   */
  send(serverId, message) {
    const connection = this.connections.get(serverId);
    if (!connection) return;
    connection.socket.send(message + '\r\n');
  }

  /**
   * Send JOIN command for a channel.
   * @param {string} serverId
   * @param {string} channel — with or without # prefix
   */
  joinChannel(serverId, channel) {
    if (!channel.startsWith('#')) channel = '#' + channel;
    this.send(serverId, `JOIN ${channel}`);
  }

  /**
   * Send a PRIVMSG to a channel.
   * @param {string} serverId
   * @param {string} channel
   * @param {string} message
   */
  sendMessage(serverId, channel, message) {
    this.send(serverId, `PRIVMSG ${channel} :${message}`);
  }

  /**
   * Request the channel list from a server. Clears previous results first.
   * @param {string} serverId
   */
  requestList(serverId) {
    this.store.clearAvailableChannels(serverId);
    this.send(serverId, 'LIST');
  }

  /**
   * Start periodic LIST refresh for a server.
   * @param {string} serverId
   */
  startListRefresh(serverId) {
    this.stopListRefresh(serverId);
    const timer = setInterval(() => {
      if (this.connections.has(serverId)) {
        this.requestList(serverId);
      } else {
        this.stopListRefresh(serverId);
      }
    }, LIST_REFRESH_INTERVAL);
    this.listTimers.set(serverId, timer);
  }

  /**
   * Stop periodic LIST refresh for a server.
   * @param {string} serverId
   */
  stopListRefresh(serverId) {
    const timer = this.listTimers.get(serverId);
    if (timer) {
      clearInterval(timer);
      this.listTimers.delete(serverId);
    }
  }

  /**
   * Disconnect from a server, sending QUIT and closing the socket.
   * @param {string} serverId
   */
  disconnect(serverId) {
    const connection = this.connections.get(serverId);
    if (!connection) return;
    this.send(serverId, 'QUIT :Goodbye');
    connection.socket.close();
    this.cleanupConnection(serverId);
  }

  /** Disconnect from all servers. */
  disconnectAll() {
    for (const [serverId] of this.connections) {
      this.disconnect(serverId);
    }
  }

  /**
   * Remove connection and stop its LIST timer.
   * @param {string} serverId
   */
  cleanupConnection(serverId) {
    this.connections.delete(serverId);
    this.stopListRefresh(serverId);
  }

  // --- IRC protocol handling ---

  /**
   * Parse a raw IRC message into its components.
   * @param {string} raw — raw IRC line
   * @param {string} serverId
   * @returns {{ serverId, prefix, command, params: string[], trailing, raw } | null}
   */
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

  /**
   * Route a parsed IRC message to the appropriate store mutation.
   * @param {object} parsed — output of parseMessage
   */
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

      case '366': // RPL_ENDOFNAMES
      case '321': // RPL_LISTSTART
      case '323': // RPL_LISTEND
        break;

      case '322': {
        // RPL_LIST — one channel per message, arrives async
        s.addAvailableChannel(serverId, {
          name: params[1],
          users: parseInt(params[2], 10) || 0,
          topic: trailing || '',
        });
        break;
      }

      case '376':
      case '422': {
        // Registration complete — initial LIST + start periodic refresh
        this.requestList(serverId);
        this.startListRefresh(serverId);
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

export default IRCService;
