import EventEmitter from '@/utils/event-emitter.js';
import { hasFormatting } from '@/utils/mirc-format.js';
import config from '@/config.js';

/**
 * IRC protocol service. Manages WebSocket connections, parses IRC messages,
 * handles protocol commands, and periodically refreshes channel lists.
 */
class IRCService extends EventEmitter {
  /**
   * @param {object} store — store API with mutation methods
   * @param {object} serverSettings — server settings store API
   */
  constructor(store, serverSettings) {
    super();
    this.store = store;
    this.serverSettings = serverSettings;
    this.connections = new Map();
    this.listTimers = new Map();
    this.initialListTimers = new Map();
    /** @type {Record<string, number>} detected LIST wait per server (seconds) */
    this.listWaitOverrides = {};
    /** @type {Record<string, number>} connection timestamp per server (epoch ms) */
    this.connectedAt = {};
    /** @type {Set<string>} servers currently loading LIST */
    this.listLoading = new Set();
    /** @type {Set<string>} servers where mIRC formatting was detected */
    this.mircDetected = new Set();
  }

  /**
   * Connect to an IRC server via WebSocket.
   * @param {{ id: string, name: string, host: string }} server
   */
  connect(server) {
    const serverId = server.id;
    if (this.connections.has(serverId)) return;

    const ircConfig = {
      nickname: this.store.nickname || config.irc.nickname + '_' + Math.floor(Math.random() * 1000),
      username: config.irc.username,
      realname: config.irc.realname,
    };

    const socket = new WebSocket(server.host);
    const connection = { socket, config: ircConfig };

    socket.onopen = () => {
      this.connectedAt[serverId] = Date.now();
      this.store.addConnection(serverId);
      this.send(serverId, `NICK ${ircConfig.nickname}`);
      this.send(serverId, `USER ${ircConfig.username} 0 * :${ircConfig.realname}`);
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
   * Check if a LIST refresh is allowed for a server.
   * Blocked if already loading or if minimum wait since connection hasn't elapsed.
   * @param {string} serverId
   * @returns {boolean}
   */
  canRefreshList(serverId) {
    if (this.listLoading.has(serverId)) return false;
    const connTime = this.connectedAt[serverId];
    if (!connTime) return false;
    const elapsed = (Date.now() - connTime) / 1000;
    const minWait = this.serverSettings.getListDelay(
      serverId,
      this.listWaitOverrides[serverId] || null,
    );
    return elapsed >= minWait;
  }

  /**
   * Request the channel list from a server. Clears previous results first.
   * Skips if already loading or wait time not elapsed.
   * @param {string} serverId
   * @param {boolean} [force=false] — bypass wait time check (used by internal timer)
   */
  requestList(serverId, force = false) {
    if (this.listLoading.has(serverId)) return;
    if (!force && !this.canRefreshList(serverId)) return;
    this.listLoading.add(serverId);
    this.store.setListLoading(serverId);
    this.store.clearAvailableChannels(serverId);
    this.send(serverId, 'LIST');
  }

  /**
   * Start periodic LIST refresh for a server.
   * @param {string} serverId
   */
  startListRefresh(serverId) {
    this.stopListRefresh(serverId);
    const settings = this.serverSettings.getSettings(serverId);
    const interval =
      (settings.listRefreshInterval || config.serverDefaults.listRefreshInterval) * 1000;
    if (interval <= 0) return; // Disabled
    const timer = setInterval(() => {
      if (this.connections.has(serverId)) {
        this.requestList(serverId, true);
      } else {
        this.stopListRefresh(serverId);
      }
    }, interval);
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
    // Detach handlers before closing to prevent onclose from interfering with reconnection
    connection.socket.onclose = null;
    connection.socket.onerror = null;
    connection.socket.onmessage = null;
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
    this.mircDetected.delete(serverId);
    this.listLoading.delete(serverId);
    this.store.clearListLoading(serverId);
    delete this.listWaitOverrides[serverId];
    delete this.connectedAt[serverId];
    const initTimer = this.initialListTimers.get(serverId);
    if (initTimer) {
      clearTimeout(initTimer);
      this.initialListTimers.delete(serverId);
    }
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

    // Detect mIRC formatting in any message
    if (trailing && !this.mircDetected.has(serverId) && hasFormatting(trailing)) {
      this.mircDetected.add(serverId);
      this.serverSettings.markMircDetected(serverId);
    }

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
        break;

      case '323': // RPL_LISTEND
        this.store.flushChannelBuffer(serverId);
        this.listLoading.delete(serverId);
        this.store.clearListLoading(serverId);
        break;

      case 'NOTICE': {
        const text = trailing || '';
        s.addSystemMessage(serverId, text);
        // Generic LIST delay detection: look for seconds + LIST in any NOTICE
        // Matches patterns like "wait 15s", "15 seconds", "wait 15 sec" near "LIST"
        if (/list/i.test(text)) {
          const waitMatch = text.match(/(\d+)\s*(?:s(?:ec(?:ond)?s?)?)\b/i);
          if (waitMatch) {
            const detected = parseInt(waitMatch[1], 10) + 2;
            const current = this.listWaitOverrides[serverId] || 0;
            if (detected > current) {
              this.listWaitOverrides[serverId] = detected;
              // Update stored setting unless user has manually set a value
              if (!this.serverSettings.settings[serverId]?.listDelayManual) {
                this.serverSettings.updateSettings(serverId, { listDelay: detected });
              }
            }
            // Reschedule pending LIST if timer is active (server told us to wait longer)
            const pendingTimer = this.initialListTimers.get(serverId);
            if (pendingTimer) {
              clearTimeout(pendingTimer);
              this.initialListTimers.delete(serverId);
              const newTimer = setTimeout(() => {
                this.initialListTimers.delete(serverId);
                if (this.connections.has(serverId)) {
                  this.requestList(serverId, true);
                  this.startListRefresh(serverId);
                }
              }, detected * 1000);
              this.initialListTimers.set(serverId, newTimer);
            }
          }
        }
        break;
      }

      case '372':
      case '375': {
        // MOTD lines — strip the leading "- " prefix to preserve ASCII art
        const motdText = (trailing || '').replace(/^- ?/, '');
        s.addSystemMessage(serverId, motdText);
        break;
      }

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
        // Registration complete — use settings > detected > default
        const detected = this.listWaitOverrides[serverId] || null;
        const waitSec = this.serverSettings.getListDelay(serverId, detected);
        const delay = waitSec * 1000;
        const timer = setTimeout(() => {
          this.initialListTimers.delete(serverId);
          if (this.connections.has(serverId)) {
            this.requestList(serverId, true);
            this.startListRefresh(serverId);
          }
        }, delay);
        this.initialListTimers.set(serverId, timer);
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
