import EventEmitter from '@/utils/event-emitter.js';
import { hasFormatting } from '@/utils/mirc-format.js';
import config from '@/config.js';

/** Channel prefixes per IRC spec. Names without these are DMs or special. */
const CHANNEL_PREFIXES = ['#', '&', '!', '+'];

/**
 * IRC protocol service. Manages WebSocket connections, parses IRC messages,
 * handles protocol commands, and periodically refreshes channel lists.
 */
class IRCService extends EventEmitter {
  /**
   * @param {object} store — store API with mutation methods
   * @param {object} serverSettings — server settings store API
   * @param {object} userSettings — user settings store API
   * @param {object} userPrefs — user prefs store API (hidden users, etc.)
   */
  constructor(store, serverSettings, userSettings, userPrefs) {
    super();
    this.store = store;
    this.serverSettings = serverSettings;
    this.userSettings = userSettings;
    this.userPrefs = userPrefs;
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
    /** @type {Set<string>} servers that completed registration (received 376/422) */
    this.registered = new Set();
    /** @type {Map<string, number>} keepalive ping interval per server */
    this.keepaliveTimers = new Map();
    /** @type {Map<string, number>} last message received timestamp per server */
    this.lastActivity = new Map();
    /** @type {Map<string, object>} server config for reconnection */
    this.serverConfigs = new Map();
    /** @type {Map<string, number>} reconnection attempt count per server */
    this.reconnectAttempts = new Map();
    /** @type {Map<string, number>} reconnection timeout per server */
    this.reconnectTimers = new Map();
    /** @type {object[]} queue of parsed messages waiting to be processed */
    this.messageQueue = [];
    /** @type {number|null} rAF id for queue drain */
    this.drainFrame = null;
  }

  /**
   * Connect to an IRC server via WebSocket.
   * @param {{ id: string, name: string, host: string }} server
   */
  connect(server) {
    const serverId = server.id;
    if (this.connections.has(serverId)) return;

    const ircConfig = {
      nickname: this.userSettings.resolveNick(serverId, this.serverSettings),
      username: this.userSettings.resolveUsername(serverId, this.serverSettings),
      realname: this.userSettings.resolveRealname(serverId, this.serverSettings),
    };

    const socket = new WebSocket(server.host);
    const connection = { socket, config: ircConfig };

    // Store server config for potential reconnection
    this.serverConfigs.set(serverId, server);

    socket.onopen = () => {
      this.connectedAt[serverId] = Date.now();
      this.reconnectAttempts.delete(serverId);
      this.store.addConnection(serverId);
      this.send(serverId, `NICK ${ircConfig.nickname}`);
      this.send(serverId, `USER ${ircConfig.username} 0 * :${ircConfig.realname}`);
      this.startKeepalive(serverId);
    };

    socket.onmessage = (event) => {
      const raw = event.data;
      this.lastActivity.set(serverId, Date.now());
      // PING must be answered immediately
      if (raw.startsWith('PING')) {
        this.send(serverId, `PONG ${raw.split(' ')[1]}`);
        return;
      }
      const parsed = this.parseMessage(raw, serverId);
      if (!parsed) return;
      // Only queue RPL_LIST (322) messages — they arrive in bulk and block the UI
      // Everything else is processed immediately for responsiveness
      if (parsed.command === '322') {
        this.messageQueue.push(parsed);
        this.scheduleDrain();
      } else {
        this.handleMessage(parsed);
      }
    };

    socket.onerror = () => {
      this.store.removeConnection(serverId);
      this.store.addSystemMessage(serverId, `Error connecting to ${server.name}`);
      this.cleanupConnection(serverId);
      this.scheduleReconnect(serverId);
    };

    socket.onclose = () => {
      this.store.removeConnection(serverId);
      this.store.addSystemMessage(serverId, `Disconnected from ${server.name}`);
      this.cleanupConnection(serverId);
      this.scheduleReconnect(serverId);
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
   * Send PART command to leave a channel.
   * @param {string} serverId
   * @param {string} channel
   */
  partChannel(serverId, channel) {
    this.send(serverId, `PART ${channel}`);
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
   * Send a NICK command to change nickname on a server.
   * @param {string} serverId
   * @param {string} newNick
   */
  changeNick(serverId, newNick) {
    if (!this.connections.has(serverId)) return;
    this.send(serverId, `NICK ${newNick}`);
  }

  /**
   * Check if a server has completed IRC registration (received 376/422).
   * @param {string} serverId
   * @returns {boolean}
   */
  isRegistered(serverId) {
    return this.registered.has(serverId);
  }

  /**
   * Request a channel list from a server.
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

  /** Schedule a drain of the message queue on the next animation frame. */
  scheduleDrain() {
    if (this.drainFrame) return;
    this.drainFrame = requestAnimationFrame(() => {
      this.drainFrame = null;
      this.drainQueue();
    });
  }

  /**
   * Process queued messages in a time-boxed batch.
   * Yields to the browser after 8ms so clicks and renders can happen.
   */
  drainQueue() {
    const start = performance.now();
    while (this.messageQueue.length > 0) {
      const msg = this.messageQueue.shift();
      this.handleMessage(msg);
      // Yield after 8ms to keep UI responsive
      if (performance.now() - start > 8) {
        this.scheduleDrain();
        return;
      }
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
    this.store.removeConnection(serverId);
    this.cleanupConnection(serverId);
    this.cancelReconnect(serverId);
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
  /**
   * Start keepalive PING timer for a server.
   * Sends a client PING if no activity is received within the configured interval.
   * @param {string} serverId
   */
  startKeepalive(serverId) {
    this.stopKeepalive(serverId);
    const settings = this.serverSettings.getSettings(serverId);
    if (!settings.keepalive) return;

    const intervalMs =
      (settings.keepaliveInterval || config.serverDefaults.keepaliveInterval) * 1000;
    const timeoutMs = (settings.keepaliveTimeout || config.serverDefaults.keepaliveTimeout) * 1000;

    const timer = setInterval(() => {
      const last = this.lastActivity.get(serverId) || 0;
      const elapsed = Date.now() - last;

      if (elapsed > timeoutMs) {
        // No activity for too long — connection is dead
        this.store.addSystemMessage(serverId, 'Connection timed out — reconnecting...');
        const connection = this.connections.get(serverId);
        if (connection) {
          connection.socket.onclose = null;
          connection.socket.onerror = null;
          connection.socket.close();
        }
        this.store.removeConnection(serverId);
        this.cleanupConnection(serverId);
        this.scheduleReconnect(serverId);
      } else if (elapsed > intervalMs) {
        // Send a PING to keep the connection alive
        this.send(serverId, `PING :ghostmesh`);
      }
    }, intervalMs);

    this.keepaliveTimers.set(serverId, timer);
  }

  /**
   * Stop keepalive timer for a server.
   * @param {string} serverId
   */
  stopKeepalive(serverId) {
    const timer = this.keepaliveTimers.get(serverId);
    if (timer) {
      clearInterval(timer);
      this.keepaliveTimers.delete(serverId);
    }
  }

  /**
   * Schedule an automatic reconnection with exponential backoff.
   * @param {string} serverId
   */
  scheduleReconnect(serverId) {
    const server = this.serverConfigs.get(serverId);
    if (!server) return;

    const settings = this.serverSettings.getSettings(serverId);
    if (!settings.autoReconnect) return;

    // Cancel any existing reconnect timer
    const existing = this.reconnectTimers.get(serverId);
    if (existing) clearTimeout(existing);

    const attempts = this.reconnectAttempts.get(serverId) || 0;
    if (attempts >= 5) {
      this.store.addSystemMessage(serverId, 'Reconnection failed after 5 attempts.');
      this.reconnectAttempts.delete(serverId);
      return;
    }

    // Exponential backoff: 2s, 4s, 8s, 16s, 32s
    const delay = Math.pow(2, attempts + 1) * 1000;
    this.store.addSystemMessage(
      serverId,
      `Reconnecting in ${delay / 1000}s (attempt ${attempts + 1}/5)...`,
    );

    const timer = setTimeout(() => {
      this.reconnectTimers.delete(serverId);
      this.reconnectAttempts.set(serverId, attempts + 1);
      this.connect(server);
    }, delay);

    this.reconnectTimers.set(serverId, timer);
  }

  /**
   * Cancel any pending reconnection for a server.
   * @param {string} serverId
   */
  cancelReconnect(serverId) {
    const timer = this.reconnectTimers.get(serverId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(serverId);
    }
    this.reconnectAttempts.delete(serverId);
  }

  /**
   * Clean up all state for a disconnected server.
   * @param {string} serverId
   */
  cleanupConnection(serverId) {
    this.connections.delete(serverId);
    this.stopListRefresh(serverId);
    this.stopKeepalive(serverId);
    this.lastActivity.delete(serverId);
    this.mircDetected.delete(serverId);
    this.registered.delete(serverId);
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
        const target = params[0];
        const connection = this.connections.get(serverId);
        const ourNick = connection?.config?.nickname || '';
        // Direct message: target is our nick, not a channel
        if (target.toLowerCase() === ourNick.toLowerCase()) {
          // Shadow ban: ignore DMs from hidden users
          if (this.userPrefs?.isUserHidden(nick)) break;
          // Create DM channel if it doesn't exist
          const serverChannels = s.channels[serverId] || [];
          if (!serverChannels.includes(nick)) {
            s.addJoinedChannel(serverId, nick);
          }
          s.addMessage(serverId, nick, nick, trailing, 'message');
          s.setDMOnline(serverId, nick, true);
        } else {
          s.addMessage(serverId, target, nick, trailing, 'message');
        }
        break;
      }

      case 'JOIN': {
        const channel = trailing || params[0];
        if (nick === s.nickname) {
          s.addJoinedChannel(serverId, channel);
          s.selectChannel(serverId, channel);
        } else {
          s.addUser(serverId, channel, nick);
          // If we have a DM with this user, mark them back online
          const serverChannels = s.channels[serverId] || [];
          if (serverChannels.includes(nick)) {
            s.setDMOnline(serverId, nick, true);
            s.addMessage(serverId, nick, '', `${nick} is back online`, 'join');
          }
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
          if (CHANNEL_PREFIXES.some((p) => channel.startsWith(p)) || channel === '*status') {
            s.addMessage(serverId, channel, nick, `${nick} has quit (${trailing || ''})`, 'quit');
          }
        }
        // If we have a DM open with this user, notify and mark offline
        if (serverChannels.includes(nick)) {
          s.addMessage(serverId, nick, '', `${nick} has disconnected`, 'quit');
          s.setDMOnline(serverId, nick, false);
        }
        break;
      }

      case 'NICK': {
        const newNick = trailing || params[0];
        const connection = this.connections.get(serverId);
        // Our own nick changed
        if (connection && nick === connection.config.nickname) {
          connection.config.nickname = newNick;
          s.setNickname(serverId, newNick);
        }
        // Update user lists and show message in all channels
        const nickChannels = s.channels[serverId] || [];
        s.renameUser(serverId, nick, newNick);
        for (const channel of nickChannels) {
          if (CHANNEL_PREFIXES.some((p) => channel.startsWith(p)) || channel === '*status') {
            s.addMessage(serverId, channel, nick, `${nick} is now known as ${newNick}`, 'nick');
          }
        }
        break;
      }

      case '432': // ERR_ERRONEUSNICKNAME
      case '433': // ERR_NICKNAMEINUSE
      case '436': {
        // ERR_NICKCOLLISION
        const failedNick = params[1];
        const connection = this.connections.get(serverId);
        s.addSystemMessage(serverId, `[${command}] ${trailing}`);
        // During registration (not yet received 376/422), try fallback nicks
        if (connection && !this.registered.has(serverId)) {
          const base = failedNick.replace(/_+$/, '').replace(/\d+$/, '');
          const fallback = base + '_' + Math.floor(Math.random() * 1000);
          connection.config.nickname = fallback;
          this.send(serverId, `NICK ${fallback}`);
          s.addSystemMessage(serverId, `Trying fallback nick: ${fallback}`);
        } else {
          // Post-registration: revert to confirmed nick
          if (connection) {
            s.setNickname(serverId, connection.config.nickname);
          }
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
        s.finalizeUsers();
        break;

      case '321': // RPL_LISTSTART
        break;

      case '323': // RPL_LISTEND
      case '263': // RPL_TRYAGAIN — LIST was rate-limited
        this.store.flushChannelBuffer(serverId, true);
        this.listLoading.delete(serverId);
        this.store.clearListLoading(serverId);
        if (command === '263' && trailing) {
          s.addSystemMessage(serverId, `[${command}] ${trailing}`);
        }
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
        // Registration complete — confirm the nick
        this.registered.add(serverId);
        const conn = this.connections.get(serverId);
        if (conn) {
          s.setNickname(serverId, conn.config.nickname);
        }
        // Use settings > detected > default for LIST delay
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
        // Server error numerics (4xx) — may relate to a message we just sent
        const code = parseInt(command, 10);
        if (code >= 400 && code < 500 && trailing) {
          s.warnLastOwnMessage(
            serverId,
            `The server reported an error that may be related to this message: [${command}] ${trailing}`,
          );
        }
        break;
      }
    }
  }
}

export default IRCService;
