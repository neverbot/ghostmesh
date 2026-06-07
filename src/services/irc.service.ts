import EventEmitter from '@/utils/event-emitter.ts';
import { hasFormatting } from '@/utils/mirc-format.ts';
import config from '@/config.ts';
import type {
  IrcStoreApi,
  AvailableChannel,
  ServerConfig,
  ChannelUser,
  UserMode,
  MessageType,
} from '@/types.ts';
import type { ServerSettingsEntry } from '@/stores/server-settings.ts';

// ─── IRC protocol types ──────────────────────────────────────────────────────

interface ParsedMessage {
  serverId: string;
  prefix: string | undefined;
  command: string;
  params: string[];
  trailing: string | undefined;
  raw: string;
}

interface IRCConnectionConfig {
  nickname: string;
  username: string;
  realname: string;
}

interface IRCConnection {
  socket: WebSocket;
  config: IRCConnectionConfig;
}

/** Channel prefixes per IRC spec. Names without these are DMs or special. */
const CHANNEL_PREFIXES: string[] = ['#', '&', '!', '+'];

/** Store API for per-server settings (list delay, keepalive, mIRC formatting, etc.). */
interface ServerSettingsApi {
  settings: Record<string, ServerSettingsEntry | undefined>;
  getSettings(serverId: string): ServerSettingsEntry;
  getListDelay(serverId: string, detected: number | null): number;
  markMircDetected(serverId: string): void;
  updateSettings(serverId: string, partial: Partial<ServerSettingsEntry>): void;
  isMessageFiltered(serverId: string, text: string): boolean;
}

/** Store API for global user profile (nickname, username, realname). */
interface UserSettingsApi {
  resolveNick(serverId: string, serverSettings: ServerSettingsApi): string;
  resolveUsername(serverId: string, serverSettings: ServerSettingsApi): string;
  resolveRealname(serverId: string, serverSettings: ServerSettingsApi): string;
}

/** Store API for per-user preferences (blocked users, hidden previews, etc.). */
interface UserPrefsApi {
  isUserBlocked(serverId: string, nick: string): boolean;
}

/** Max number of reconnect attempts before giving up. */
const MAX_RECONNECT_ATTEMPTS = 7;
/** Base delay before the first reconnect attempt (milliseconds). */
const RECONNECT_BASE_DELAY_MS = 2000;
/** Cap on the exponential backoff delay (milliseconds). */
const RECONNECT_DELAY_CAP_MS = 60000;
/** Drops shorter than this are considered fatal (DNS/TLS/auth) and not retried unless registered. */
const MIN_LASTED_FOR_RETRY_MS = 1000;

/**
 * IRC protocol service. Manages WebSocket connections, parses IRC messages,
 * handles protocol commands, and periodically refreshes channel lists.
 */
class IRCService extends EventEmitter {
  store: IrcStoreApi;
  serverSettings: ServerSettingsApi;
  userSettings: UserSettingsApi;
  userPrefs: UserPrefsApi;
  connections: Map<string, IRCConnection>;
  listTimers: Map<string, ReturnType<typeof setInterval>>;
  initialListTimers: Map<string, ReturnType<typeof setTimeout>>;
  /** Detected LIST wait per server (seconds). */
  listWaitOverrides: Record<string, number>;
  /** Connection timestamp per server (epoch ms). */
  connectedAt: Record<string, number>;
  /** Servers currently loading LIST. */
  listLoading: Set<string>;
  listTimeouts: Map<string, ReturnType<typeof setTimeout>>;
  /** Servers where mIRC formatting was detected. */
  mircDetected: Set<string>;
  /** Servers that completed registration (received 376/422). */
  registered: Set<string>;
  /** Keepalive ping interval per server. */
  keepaliveTimers: Map<string, ReturnType<typeof setInterval>>;
  /** Last message received timestamp per server. */
  lastActivity: Map<string, number>;
  /** Server config for reconnection. */
  serverConfigs: Map<string, ServerConfig>;
  /** Reconnection attempt count per server. */
  reconnectAttempts: Map<string, number>;
  /** Reconnection timeout per server. */
  reconnectTimers: Map<string, ReturnType<typeof setTimeout>>;
  /** Servers where auto-reconnect should be skipped due to fatal errors (auth, ban). */
  skipReconnect: Set<string>;
  /** Connect-start timestamp per server (epoch ms), used to gate retries on too-short drops. */
  connectStartedAt: Map<string, number>;
  /** Queue of parsed messages waiting to be processed. */
  messageQueue: ParsedMessage[];
  /** rAF id for queue drain. */
  drainFrame: number | null;
  /** Servers currently in CAP negotiation. */
  capNegotiating: Set<string>;
  /** Servers where SASL completed successfully. */
  saslCompleted: Set<string>;

  /**
   * @param store — store API with mutation methods
   * @param serverSettings — server settings store API
   * @param userSettings — user settings store API
   * @param userPrefs — user prefs store API (blocked users, etc.)
   */
  constructor(
    store: IrcStoreApi,
    serverSettings: ServerSettingsApi,
    userSettings: UserSettingsApi,
    userPrefs: UserPrefsApi,
  ) {
    super();
    this.store = store;
    this.serverSettings = serverSettings;
    this.userSettings = userSettings;
    this.userPrefs = userPrefs;
    this.connections = new Map();
    this.listTimers = new Map();
    this.initialListTimers = new Map();
    this.listWaitOverrides = {};
    this.connectedAt = {};
    this.listLoading = new Set();
    this.listTimeouts = new Map();
    this.mircDetected = new Set();
    this.registered = new Set();
    this.keepaliveTimers = new Map();
    this.lastActivity = new Map();
    this.serverConfigs = new Map();
    this.reconnectAttempts = new Map();
    this.reconnectTimers = new Map();
    this.skipReconnect = new Set();
    this.connectStartedAt = new Map();
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
    }
    this.messageQueue = [];
    this.drainFrame = null;
    this.capNegotiating = new Set();
    this.saslCompleted = new Set();
  }

  /**
   * Connect to an IRC server via WebSocket.
   * @param server — server config with id, name, and host
   */
  connect(server: ServerConfig): void {
    const serverId: string = server.id;
    if (this.connections.has(serverId)) return;

    const ircConfig: IRCConnectionConfig = {
      nickname: this.userSettings.resolveNick(serverId, this.serverSettings),
      username: this.userSettings.resolveUsername(serverId, this.serverSettings),
      realname: this.userSettings.resolveRealname(serverId, this.serverSettings),
    };

    // Route through proxy for TCP-only servers, direct WebSocket otherwise
    let wsUrl: string;
    if (server.tcpHost) {
      const params = new URLSearchParams({
        host: server.tcpHost,
        port: String(server.tcpPort || 6667),
        tls: String(server.tcpTls ?? false),
        token: config.proxy.secret,
      });
      wsUrl = `${config.proxy.url}/?${params}`;
    } else {
      wsUrl = server.host;
    }

    const socket: WebSocket = new WebSocket(wsUrl);
    const connection: IRCConnection = { socket, config: ircConfig };

    // Store server config for potential reconnection
    this.serverConfigs.set(serverId, server);
    // Defensive: clear any pending timer so we don't end up with two sockets.
    // (Timer-driven retries have already self-cleared; this catches manual calls during backoff.)
    const existingTimer = this.reconnectTimers.get(serverId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.reconnectTimers.delete(serverId);
    }
    this.skipReconnect.delete(serverId);
    this.connectStartedAt.set(serverId, Date.now());

    socket.onopen = (): void => {
      this.connectedAt[serverId] = Date.now();
      this.reconnectAttempts.delete(serverId);
      this.store.addConnection(serverId);
      // Initialize server runtime info
      this.store.setServerInfo(serverId, {
        host: server.tcpHost || server.host.replace(/^wss?:\/\//, '').replace(/\/.*$/, ''),
        port:
          server.tcpPort ||
          (server.host.includes(':') ? parseInt(server.host.split(':').pop() || '0', 10) : 0),
        tls: server.tcpTls || server.host.startsWith('wss://'),
        capabilities: [],
        saslAvailable: false,
        saslAuthenticated: false,
        mircDetected: false,
      });
      // Start CAP negotiation before NICK/USER (IRCv3 detection)
      this.capNegotiating.add(serverId);
      this.send(serverId, 'CAP LS 302');
      this.send(serverId, `NICK ${ircConfig.nickname}`);
      this.send(serverId, `USER ${ircConfig.username} 0 * :${ircConfig.realname}`);
      this.startKeepalive(serverId);
    };

    socket.onmessage = (event: MessageEvent): void => {
      const raw: string = event.data;
      this.lastActivity.set(serverId, Date.now());
      // PING must be answered immediately
      if (raw.startsWith('PING')) {
        this.send(serverId, `PONG ${raw.split(' ')[1]}`);
        return;
      }
      const parsed: ParsedMessage | null = this.parseMessage(raw, serverId);
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

    socket.onerror = (): void => {
      // onerror is always followed by onclose; let onclose do the reconnect.
      const msg = server.tcpHost
        ? `Error connecting to ${server.name} — proxy service may be unavailable`
        : `Error connecting to ${server.name}`;
      this.store.addSystemMessage(serverId, msg);
    };

    socket.onclose = (): void => {
      this.store.addSystemMessage(serverId, `Disconnected from ${server.name}`);
      const wasRegistered: boolean = this.registered.has(serverId);
      const startedAt: number = this.connectStartedAt.get(serverId) || Date.now();
      const lasted: number = Date.now() - startedAt;
      this.connectStartedAt.delete(serverId);
      this.store.removeConnection(serverId);
      this.cleanupConnection(serverId);
      if (this.skipReconnect.has(serverId)) {
        this.store.addSystemMessage(
          serverId,
          'Auto-reconnect disabled (authentication failure or ban).',
        );
        this.skipReconnect.delete(serverId);
        this.reconnectAttempts.delete(serverId);
        return;
      }
      // Reconnect on: a clean drop after registration, or any drop that lasted long enough
      // to suggest a transient network blip (filters out instant fatal failures: DNS, TLS).
      const shouldReconnect: boolean = wasRegistered || lasted >= MIN_LASTED_FOR_RETRY_MS;
      if (shouldReconnect) {
        this.scheduleReconnect(serverId);
      }
    };

    this.connections.set(serverId, connection);
  }

  /**
   * Send a raw IRC message to a server.
   * @param serverId
   * @param message — raw IRC line (without trailing CRLF)
   */
  send(serverId: string, message: string): void {
    const connection: IRCConnection | undefined = this.connections.get(serverId);
    if (!connection) return;
    connection.socket.send(message + '\r\n');
  }

  /**
   * Send JOIN command for a channel.
   * @param serverId
   * @param channel — with or without # prefix
   */
  joinChannel(serverId: string, channel: string): void {
    if (!channel.startsWith('#')) channel = '#' + channel;
    this.send(serverId, `JOIN ${channel}`);
  }

  /**
   * Send PART command to leave a channel.
   * @param serverId
   * @param channel
   */
  partChannel(serverId: string, channel: string): void {
    this.send(serverId, `PART ${channel}`);
  }

  /**
   * Send a PRIVMSG to a channel.
   * @param serverId
   * @param channel
   * @param message
   */
  sendMessage(serverId: string, channel: string, message: string): void {
    const transformed = this.transformUrls(serverId, message);
    this.send(serverId, `PRIVMSG ${channel} :${transformed}`);
  }

  /** Apply server-specific URL transforms to any URLs found in the message text. */
  private transformUrls(serverId: string, text: string): string {
    const server: ServerConfig | undefined = this.serverConfigs.get(serverId);
    if (!server?.urlTransform) return text;
    return text.replace(/https?:\/\/[^\s]+/g, (url: string) => server.urlTransform!(url));
  }

  /**
   * Check if a LIST refresh is allowed for a server.
   * Blocked if already loading or if minimum wait since connection hasn't elapsed.
   * @param serverId
   * @returns whether a LIST refresh is allowed
   */
  canRefreshList(serverId: string): boolean {
    if (this.listLoading.has(serverId)) return false;
    const connTime: number | undefined = this.connectedAt[serverId];
    if (!connTime) return false;
    const elapsed: number = (Date.now() - connTime) / 1000;
    const minWait: number = this.serverSettings.getListDelay(
      serverId,
      this.listWaitOverrides[serverId] || null,
    );
    return elapsed >= minWait;
  }

  /**
   * Send a NICK command to change nickname on a server.
   * @param serverId
   * @param newNick
   */
  changeNick(serverId: string, newNick: string): void {
    if (!this.connections.has(serverId)) return;
    this.send(serverId, `NICK ${newNick}`);
  }

  /**
   * Check if a server has completed IRC registration (received 376/422).
   * @param serverId
   * @returns whether the server has completed registration
   */
  isRegistered(serverId: string): boolean {
    return this.registered.has(serverId);
  }

  /**
   * Request a channel list from a server.
   * Skips if already loading or wait time not elapsed.
   * @param serverId
   * @param force — bypass wait time check (used by internal timer)
   */
  requestList(serverId: string, force: boolean = false): void {
    if (this.listLoading.has(serverId)) return;
    if (!force && !this.canRefreshList(serverId)) return;
    this.listLoading.add(serverId);
    this.store.setListLoading(serverId);
    this.store.clearAvailableChannels(serverId);
    this.send(serverId, 'LIST');
    // Safety timeout: clear loading state if LIST never completes
    const existingTimeout = this.listTimeouts.get(serverId);
    if (existingTimeout) clearTimeout(existingTimeout);
    const lt: ReturnType<typeof setTimeout> = setTimeout(() => {
      this.listTimeouts.delete(serverId);
      if (this.listLoading.has(serverId)) {
        this.listLoading.delete(serverId);
        this.store.clearListLoading(serverId);
        this.store.flushChannelBuffer(serverId, true);
      }
    }, config.list.listTimeout * 1000);
    this.listTimeouts.set(serverId, lt);
  }

  /**
   * Start periodic LIST refresh for a server.
   * @param serverId
   */
  startListRefresh(serverId: string): void {
    this.stopListRefresh(serverId);
    const settings: ServerSettingsEntry = this.serverSettings.getSettings(serverId);
    const interval: number =
      (settings.listRefreshInterval || config.serverDefaults.listRefreshInterval) * 1000;
    if (interval <= 0) return; // Disabled
    const timer: ReturnType<typeof setInterval> = setInterval(() => {
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
   * @param serverId
   */
  stopListRefresh(serverId: string): void {
    const timer: ReturnType<typeof setInterval> | undefined = this.listTimers.get(serverId);
    if (timer) {
      clearInterval(timer);
      this.listTimers.delete(serverId);
    }
  }

  /** Schedule a drain of the message queue on the next animation frame. */
  scheduleDrain(): void {
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
  drainQueue(): void {
    const start: number = performance.now();
    while (this.messageQueue.length > 0) {
      const msg: ParsedMessage | undefined = this.messageQueue.shift();
      if (!msg) break;
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
   * @param serverId
   */
  disconnect(serverId: string): void {
    const connection: IRCConnection | undefined = this.connections.get(serverId);
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
  disconnectAll(): void {
    for (const [serverId] of this.connections) {
      this.disconnect(serverId);
    }
  }

  /**
   * Start keepalive PING timer for a server.
   * Sends a client PING if no activity is received within the configured interval.
   * @param serverId
   */
  startKeepalive(serverId: string): void {
    this.stopKeepalive(serverId);
    const settings: ServerSettingsEntry = this.serverSettings.getSettings(serverId);
    if (!settings.keepalive) return;

    const intervalMs: number =
      (settings.keepaliveInterval || config.serverDefaults.keepaliveInterval) * 1000;
    const timeoutMs: number =
      (settings.keepaliveTimeout || config.serverDefaults.keepaliveTimeout) * 1000;

    const timer: ReturnType<typeof setInterval> = setInterval(() => {
      const last: number = this.lastActivity.get(serverId) || 0;
      const elapsed: number = Date.now() - last;

      if (elapsed > timeoutMs) {
        // No activity for too long — connection is dead
        this.store.addSystemMessage(serverId, 'Connection timed out — reconnecting...');
        const connection: IRCConnection | undefined = this.connections.get(serverId);
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
   * @param serverId
   */
  stopKeepalive(serverId: string): void {
    const timer: ReturnType<typeof setInterval> | undefined = this.keepaliveTimers.get(serverId);
    if (timer) {
      clearInterval(timer);
      this.keepaliveTimers.delete(serverId);
    }
  }

  /**
   * Schedule an automatic reconnection with exponential backoff.
   * @param serverId
   */
  scheduleReconnect(serverId: string): void {
    const server: ServerConfig | undefined = this.serverConfigs.get(serverId);
    if (!server) return;
    if (this.skipReconnect.has(serverId)) return;

    const settings: ServerSettingsEntry = this.serverSettings.getSettings(serverId);
    if (!settings.autoReconnect) return;

    // Cancel any existing reconnect timer (idempotent).
    const existing: ReturnType<typeof setTimeout> | undefined = this.reconnectTimers.get(serverId);
    if (existing) clearTimeout(existing);

    const attempts: number = this.reconnectAttempts.get(serverId) || 0;
    if (attempts >= MAX_RECONNECT_ATTEMPTS) {
      this.store.addSystemMessage(
        serverId,
        `Reconnection failed after ${MAX_RECONNECT_ATTEMPTS} attempts.`,
      );
      this.reconnectAttempts.delete(serverId);
      return;
    }

    // Exponential backoff capped at RECONNECT_DELAY_CAP_MS, with ±20% jitter
    // to avoid thundering herd when many clients drop together.
    const raw: number = Math.min(
      RECONNECT_DELAY_CAP_MS,
      RECONNECT_BASE_DELAY_MS * Math.pow(2, attempts),
    );
    const jitter: number = 0.8 + Math.random() * 0.4;
    const delay: number = Math.round(raw * jitter);

    this.store.addSystemMessage(
      serverId,
      `Reconnecting in ${(delay / 1000).toFixed(1)}s (attempt ${attempts + 1}/${MAX_RECONNECT_ATTEMPTS})...`,
    );

    const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
      this.reconnectTimers.delete(serverId);
      this.reconnectAttempts.set(serverId, attempts + 1);
      this.connect(server);
    }, delay);

    this.reconnectTimers.set(serverId, timer);
  }

  /**
   * Triggered when the browser regains network connectivity.
   * Fires any pending reconnect timers immediately instead of waiting out the backoff.
   */
  handleOnline = (): void => {
    if (this.reconnectTimers.size === 0) return;
    for (const [serverId, timer] of this.reconnectTimers) {
      clearTimeout(timer);
      this.reconnectTimers.delete(serverId);
      const server = this.serverConfigs.get(serverId);
      if (!server) continue;
      this.store.addSystemMessage(serverId, 'Network back online — reconnecting now...');
      const attempts: number = this.reconnectAttempts.get(serverId) || 0;
      this.reconnectAttempts.set(serverId, attempts + 1);
      this.connect(server);
    }
  };

  /**
   * Cancel any pending reconnection for a server.
   * @param serverId
   */
  cancelReconnect(serverId: string): void {
    const timer: ReturnType<typeof setTimeout> | undefined = this.reconnectTimers.get(serverId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(serverId);
    }
    this.reconnectAttempts.delete(serverId);
  }

  /**
   * Clean up all state for a disconnected server.
   * @param serverId
   */
  cleanupConnection(serverId: string): void {
    this.connections.delete(serverId);
    this.stopListRefresh(serverId);
    this.stopKeepalive(serverId);
    this.lastActivity.delete(serverId);
    this.mircDetected.delete(serverId);
    this.registered.delete(serverId);
    this.capNegotiating.delete(serverId);
    this.saslCompleted.delete(serverId);
    this.listLoading.delete(serverId);
    this.store.clearListLoading(serverId);
    this.store.clearListWaiting(serverId);
    delete this.listWaitOverrides[serverId];
    delete this.connectedAt[serverId];
    const initTimer: ReturnType<typeof setTimeout> | undefined =
      this.initialListTimers.get(serverId);
    if (initTimer) {
      clearTimeout(initTimer);
      this.initialListTimers.delete(serverId);
    }
  }

  // --- IRC protocol handling ---

  /**
   * Parse a raw IRC message into its components.
   * @param raw — raw IRC line
   * @param serverId
   * @returns parsed message or null if the line could not be parsed
   */
  parseMessage(raw: string, serverId: string): ParsedMessage | null {
    const match: RegExpMatchArray | null = raw.match(
      /^(?::([^ ]+) )?([^ ]+)(?: ([^:][^ ]*(?: [^:][^ ]*)*))?(?: :(.*))?$/,
    );
    if (!match) return null;

    const [, prefix, command, params = '', trailing] = match;
    return {
      serverId,
      prefix,
      command,
      params: params.split(' ').filter((p: string) => p),
      trailing,
      raw,
    };
  }

  /**
   * Route a parsed IRC message to the appropriate store mutation.
   * @param parsed — output of parseMessage
   */
  handleMessage(parsed: ParsedMessage): void {
    const { serverId, prefix, command, params, trailing } = parsed;
    const nick: string = prefix ? prefix.split('!')[0] : '';
    const s: IrcStoreApi = this.store;

    // Detect mIRC formatting in any message
    if (trailing && !this.mircDetected.has(serverId) && hasFormatting(trailing)) {
      this.mircDetected.add(serverId);
      this.serverSettings.markMircDetected(serverId);
    }

    switch (command) {
      // ─── IRCv3 CAP negotiation ──────────────────────────────────────────────
      case 'CAP': {
        const subcommand = params[1]?.toUpperCase();
        const capList = (trailing || params[2] || '').trim();

        if (subcommand === 'LS') {
          // Server advertised capabilities
          const caps = capList.split(/\s+/).filter(Boolean);
          this.store.setServerInfo(serverId, { capabilities: caps });

          const hasSasl = caps.some((c) => c === 'sasl' || c.startsWith('sasl='));
          this.store.setServerInfo(serverId, { saslAvailable: hasSasl });

          // If SASL is available and credentials are configured, request it
          const settings = this.serverSettings.getSettings(serverId);
          if (hasSasl && settings.saslAccount && settings.saslPassword) {
            this.send(serverId, 'CAP REQ :sasl');
          } else {
            // No SASL needed — end CAP negotiation
            this.send(serverId, 'CAP END');
            this.capNegotiating.delete(serverId);
          }
        } else if (subcommand === 'ACK') {
          if (capList.includes('sasl')) {
            this.send(serverId, 'AUTHENTICATE PLAIN');
          }
        } else if (subcommand === 'NAK') {
          // Server rejected our CAP request
          this.send(serverId, 'CAP END');
          this.capNegotiating.delete(serverId);
        }
        break;
      }

      case 'AUTHENTICATE': {
        if (trailing === '+' || params[0] === '+') {
          // Server is ready for SASL credentials
          const settings = this.serverSettings.getSettings(serverId);
          const account = settings.saslAccount || '';
          const password = settings.saslPassword || '';
          const payload = btoa(`${account}\0${account}\0${password}`);
          this.send(serverId, `AUTHENTICATE ${payload}`);
        }
        break;
      }

      case 'PRIVMSG': {
        const target: string = params[0];
        const msgText: string = trailing || '';
        const connection: IRCConnection | undefined = this.connections.get(serverId);
        const ourNick: string = connection?.config?.nickname || '';

        // CTCP ACTION: \x01ACTION text\x01 → render as "* nick text"
        const actionMatch: RegExpMatchArray | null = msgText.match(/^\x01ACTION (.*)\x01?$/);
        const isAction: boolean = !!actionMatch;
        const content: string = isAction ? `* ${nick} ${actionMatch![1]}` : msgText;
        const msgType: MessageType = isAction ? 'system' : 'message';

        // Filter messages matching server-specific patterns
        if (this.serverSettings.isMessageFiltered(serverId, content)) break;

        // Direct message: target is our nick, not a channel
        if (target.toLowerCase() === ourNick.toLowerCase()) {
          // Self-DM echo: we already added the message locally in sendMessage
          if (nick.toLowerCase() === ourNick.toLowerCase()) break;
          // Shadow ban: ignore DMs from blocked users
          if (this.userPrefs?.isUserBlocked(serverId, nick)) break;
          // Create DM channel if it doesn't exist
          const serverChannels: string[] = s.channels[serverId] || [];
          if (!serverChannels.includes(nick)) {
            s.addJoinedChannel(serverId, nick);
          }
          s.addMessage(serverId, nick, nick, content, msgType, command);
          s.setDMOnline(serverId, nick, true);
        } else {
          s.addMessage(serverId, target, nick, content, msgType, command);
        }
        break;
      }

      case 'JOIN': {
        const channel: string = trailing || params[0];
        const conn: IRCConnection | undefined = this.connections.get(serverId);
        const ourNick: string = conn?.config?.nickname || s.nickname;
        if (nick === ourNick) {
          s.addJoinedChannel(serverId, channel);
          s.selectChannel(serverId, channel);
        } else {
          s.addUser(serverId, channel, nick);
          // If we have a DM with this user, mark them back online
          const serverChannels: string[] = s.channels[serverId] || [];
          if (serverChannels.includes(nick)) {
            s.setDMOnline(serverId, nick, true);
            s.addMessage(serverId, nick, '', `${nick} is back online`, 'join', command);
          }
        }
        s.addMessage(serverId, channel, nick, `${nick} has joined ${channel}`, 'join', command);
        break;
      }

      case 'KICK': {
        // KICK #channel target :reason
        const channel: string = params[0];
        const target: string = params[1];
        const reason: string = trailing || '';
        const connection: IRCConnection | undefined = this.connections.get(serverId);
        const ourNick: string = connection?.config?.nickname || '';
        if (target.toLowerCase() === ourNick.toLowerCase()) {
          // We were kicked
          s.removeJoinedChannel(serverId, channel);
          s.addMessage(
            serverId,
            '*status',
            nick,
            `You were kicked from ${channel} by ${nick} (${reason})`,
            'system',
            command,
          );
        } else {
          s.removeUser(serverId, channel, target);
          s.addMessage(
            serverId,
            channel,
            nick,
            `${target} was kicked by ${nick} (${reason})`,
            'part',
            command,
          );
        }
        break;
      }

      case 'PART': {
        const channel: string = params[0];
        const connPart: IRCConnection | undefined = this.connections.get(serverId);
        const ourNickPart: string = connPart?.config?.nickname || s.nickname;
        if (nick === ourNickPart) {
          s.removeJoinedChannel(serverId, channel);
        } else {
          s.removeUser(serverId, channel, nick);
        }
        s.addMessage(serverId, channel, nick, `${nick} has left ${channel}`, 'part', command);
        break;
      }

      case 'QUIT': {
        const serverChannels: string[] = s.channels[serverId] || [];
        for (const channel of serverChannels) {
          s.removeUser(serverId, channel, nick);
          if (
            CHANNEL_PREFIXES.some((p: string) => channel.startsWith(p)) ||
            channel === '*status'
          ) {
            s.addMessage(
              serverId,
              channel,
              nick,
              `${nick} has quit (${trailing || ''})`,
              'quit',
              command,
            );
          }
        }
        // If we have a DM open with this user, notify and mark offline
        if (serverChannels.includes(nick)) {
          s.addMessage(serverId, nick, '', `${nick} has disconnected`, 'quit', command);
          s.setDMOnline(serverId, nick, false);
        }
        break;
      }

      case 'NICK': {
        const newNick: string = trailing || params[0];
        const connection: IRCConnection | undefined = this.connections.get(serverId);
        // Our own nick changed
        if (connection && nick === connection.config.nickname) {
          connection.config.nickname = newNick;
          s.setNickname(serverId, newNick);
          // Persist the nick change in server settings
          this.serverSettings.updateSettings(serverId, { nickname: newNick });
        }
        // Update user lists and show message in all channels
        const nickChannels: string[] = s.channels[serverId] || [];
        s.renameUser(serverId, nick, newNick);
        for (const channel of nickChannels) {
          if (
            CHANNEL_PREFIXES.some((p: string) => channel.startsWith(p)) ||
            channel === '*status'
          ) {
            s.addMessage(
              serverId,
              channel,
              nick,
              `${nick} is now known as ${newNick}`,
              'nick',
              command,
            );
          }
        }
        break;
      }

      case '442': {
        // ERR_NOTONCHANNEL — we tried to PART a channel we're not on
        const channel: string = params[1];
        if (channel) {
          s.removeJoinedChannel(serverId, channel);
        }
        break;
      }

      case '404': {
        // ERR_CANNOTSENDTOCHAN — message blocked by server
        const target: string = params[1] || '';
        s.addMessage(
          serverId,
          target || '*status',
          '',
          trailing || 'Cannot send to channel',
          'system',
          command,
        );
        s.warnLastOwnMessage(serverId, trailing || 'Message blocked');
        break;
      }

      case '401': {
        // ERR_NOSUCHNICK — target nick/channel doesn't exist
        const target: string = params[1];
        if (target && s.isDM(target)) {
          s.addMessage(serverId, target, '', `${target} is not connected`, 'system', command);
          s.setDMOnline(serverId, target, false);
        } else {
          s.addSystemMessage(serverId, trailing || `${target}: No such nick/channel`, command);
        }
        s.warnLastOwnMessage(serverId, trailing || 'No such nick/channel');
        break;
      }

      case '432': // ERR_ERRONEUSNICKNAME
      case '433': // ERR_NICKNAMEINUSE
      case '436': {
        // ERR_NICKCOLLISION
        const failedNick: string = params[1];
        const connection: IRCConnection | undefined = this.connections.get(serverId);
        s.addSystemMessage(serverId, trailing || 'Nickname error', command);
        // During registration (not yet received 376/422), try fallback nicks
        if (connection && !this.registered.has(serverId)) {
          const base: string = failedNick.replace(/_+$/, '').replace(/\d+$/, '');
          const fallback: string = base + '_' + Math.floor(Math.random() * 1000);
          connection.config.nickname = fallback;
          this.send(serverId, `NICK ${fallback}`);
          s.addSystemMessage(serverId, `Trying fallback nick: ${fallback}`, command);
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

      case '333': {
        // RPL_TOPICWHOTIME — who set the topic and when
        const channel: string = params[1];
        const setter: string = (params[2] || '').split('!')[0];
        const timestamp: number = parseInt(params[3] || trailing || '0', 10);
        if (setter && timestamp) {
          const date: Date = new Date(timestamp * 1000);
          const dateStr: string = date.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          });
          s.addMessage(
            serverId,
            channel,
            '',
            `Topic set by ${setter} on ${dateStr}`,
            'system',
            command,
          );
        }
        break;
      }

      case '353': {
        // RPL_NAMREPLY — parse user mode prefixes
        const channel: string = params[2];
        const users: ChannelUser[] = (trailing || '')
          .split(' ')
          .filter(Boolean)
          .map((n: string): ChannelUser => {
            const prefixMap: Record<string, UserMode> = {
              '~': 'owner',
              '&': 'admin',
              '@': 'op',
              '%': 'halfop',
              '+': 'voice',
            };
            const first = n[0];
            if (prefixMap[first]) {
              return { nick: n.slice(1), mode: prefixMap[first] };
            }
            return { nick: n, mode: '' };
          });
        s.addUsers(serverId, channel, users);
        break;
      }

      case '366': // RPL_ENDOFNAMES
        s.finalizeUsers();
        break;

      case '321': // RPL_LISTSTART
        break;

      case '323': // RPL_LISTEND
      case '263': {
        // RPL_TRYAGAIN — LIST was rate-limited
        const lt2 = this.listTimeouts.get(serverId);
        if (lt2) {
          clearTimeout(lt2);
          this.listTimeouts.delete(serverId);
        }
        this.store.flushChannelBuffer(serverId, true);
        this.listLoading.delete(serverId);
        this.store.clearListLoading(serverId);
        if (command === '263' && trailing) {
          s.addSystemMessage(serverId, trailing, command);
        }
        break;
      }

      case 'NOTICE': {
        const text: string = trailing || '';
        s.addSystemMessage(serverId, text, command);
        // Generic LIST delay detection: look for seconds + LIST in any NOTICE
        // Matches patterns like "wait 15s", "15 seconds", "wait 15 sec" near "LIST"
        if (/list/i.test(text)) {
          const waitMatch: RegExpMatchArray | null = text.match(
            /(\d+)\s*(?:s(?:ec(?:ond)?s?)?)\b/i,
          );
          if (waitMatch) {
            const detected: number = parseInt(waitMatch[1], 10) + 2;
            const current: number = this.listWaitOverrides[serverId] || 0;
            if (detected > current) {
              this.listWaitOverrides[serverId] = detected;
              // Update stored setting unless user has manually set a value
              if (!this.serverSettings.settings[serverId]?.listDelayManual) {
                this.serverSettings.updateSettings(serverId, { listDelay: detected });
              }
            }
            // Reschedule pending LIST if timer is active (server told us to wait longer)
            const pendingTimer: ReturnType<typeof setTimeout> | undefined =
              this.initialListTimers.get(serverId);
            if (pendingTimer) {
              clearTimeout(pendingTimer);
              this.initialListTimers.delete(serverId);
              const newTimer: ReturnType<typeof setTimeout> = setTimeout(() => {
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
        // Detect VERIFY challenge from anti-bot systems
        if (/QUOTE\s+VERIFY/i.test(text)) {
          const codeMatch: RegExpMatchArray | null = text.match(/QUOTE\s+VERIFY\s+(\S+)/i);
          const code: string = codeMatch ? codeMatch[1] : '';
          const serverName: string = this.serverConfigs.get(serverId)?.name || serverId;
          s.addMessage(
            serverId,
            '*status',
            '',
            `${serverName} requires verification. Send: VERIFY ${code}`,
            'system',
            command,
          );
          s.selectChannel(serverId, '*status');
          // Delay focus to ensure Vue has flushed the channel switch
          setTimeout(() => {
            const input = document.querySelector<HTMLInputElement>(
              'input[placeholder="Send raw IRC command..."]',
            );
            input?.focus();
          }, 100);
        }
        break;
      }

      case '372':
      case '375': {
        // MOTD lines — strip the leading "- " prefix to preserve ASCII art
        const motdText: string = (trailing || '').replace(/^- ?/, '');
        s.addSystemMessage(serverId, motdText, command);
        break;
      }

      case '322': {
        // RPL_LIST — one channel per message, arrives async
        const channelEntry: AvailableChannel = {
          name: params[1],
          users: parseInt(params[2], 10) || 0,
          topic: trailing || '',
        };
        s.addAvailableChannel(serverId, channelEntry);
        break;
      }

      // ─── Registration & server info (shown without numeric code) ─────────
      case '001': // RPL_WELCOME
      case '004': {
        // RPL_MYINFO
        if (trailing) s.addSystemMessage(serverId, trailing, command);
        break;
      }

      case '002': {
        // RPL_YOURHOST — contains server version
        if (trailing) {
          s.addSystemMessage(serverId, trailing, command);
          this.store.setServerInfo(serverId, { version: trailing });
        }
        break;
      }
      case '003': {
        // RPL_CREATED — server creation date
        if (trailing) {
          s.addSystemMessage(serverId, trailing, command);
          this.store.setServerInfo(serverId, { created: trailing });
        }
        break;
      }

      case '005': {
        // RPL_ISUPPORT — extract NETWORK= and other tokens
        const tokens = params.slice(1);
        for (const token of tokens) {
          const [key, value] = token.split('=');
          if (key === 'NETWORK' && value) {
            this.store.setServerInfo(serverId, { network: value });
          }
        }
        break;
      }

      case '250': // RPL_STATSCONN (highest connection count)
      case '251': // RPL_LUSERCLIENT
      case '255': // RPL_LUSERME
      case '265': // RPL_LOCALUSERS
      case '266': {
        // RPL_GLOBALUSERS
        // These have the full text in trailing
        if (trailing) s.addSystemMessage(serverId, trailing, command);
        break;
      }

      case '252': // RPL_LUSEROP
      case '253': // RPL_LUSERUNKNOWN
      case '254': {
        // RPL_LUSERCHANNELS
        // These have the count in params[1] and label in trailing
        const count: string = params[1] || '';
        const label: string = trailing || '';
        s.addSystemMessage(serverId, `${count} ${label}`, command);
        break;
      }

      case '396': {
        // RPL_HOSTHIDDEN — displayed host changed
        if (trailing) s.addSystemMessage(serverId, trailing, command);
        break;
      }

      case '376':
      case '422': {
        // Registration complete — confirm the nick
        this.registered.add(serverId);
        const conn: IRCConnection | undefined = this.connections.get(serverId);
        if (conn) {
          s.setNickname(serverId, conn.config.nickname);
        }
        // Use settings > detected > default for LIST delay
        const detected: number | null = this.listWaitOverrides[serverId] || null;
        const waitSec: number = this.serverSettings.getListDelay(serverId, detected);
        const delay: number = waitSec * 1000;
        s.setListWaiting(serverId);
        const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
          this.initialListTimers.delete(serverId);
          if (this.connections.has(serverId)) {
            this.requestList(serverId, true);
            this.startListRefresh(serverId);
          }
        }, delay);
        this.initialListTimers.set(serverId, timer);
        // Apply default filtered messages if user hasn't configured any yet
        const serverConfig: ServerConfig | undefined = this.serverConfigs.get(serverId);
        if (serverConfig?.defaultFilteredMessages?.length) {
          const existing: string[] | undefined =
            this.serverSettings.settings[serverId]?.filteredMessages;
          if (!existing || existing.length === 0) {
            this.serverSettings.updateSettings(serverId, {
              filteredMessages: [...serverConfig.defaultFilteredMessages],
            });
          }
        }
        if (trailing) s.addSystemMessage(serverId, trailing, command);

        // NickServ IDENTIFY fallback: if credentials configured but SASL was not used
        if (!this.saslCompleted.has(serverId)) {
          const settings = this.serverSettings.getSettings(serverId);
          if (settings.saslAccount && settings.saslPassword) {
            this.send(
              serverId,
              `PRIVMSG NickServ :IDENTIFY ${settings.saslAccount} ${settings.saslPassword}`,
            );
          }
        }
        break;
      }

      case '421': {
        // ERR_UNKNOWNCOMMAND — command not recognized or rate-limited
        if (trailing) s.addSystemMessage(serverId, trailing, command);
        break;
      }

      case '439': {
        // ERR_TARGETTOOFAST — message target change rate limit
        if (trailing) s.addSystemMessage(serverId, trailing, command);
        break;
      }

      case '463': {
        // ERR_NOPERMFORHOST — connection not allowed (e.g. TLS required)
        if (trailing) {
          s.addSystemMessage(serverId, trailing, command);
        }
        break;
      }

      case '477': {
        // ERR_NEEDREGGEDNICK — channel requires NickServ login (+r mode)
        if (trailing) s.addSystemMessage(serverId, trailing, command);
        break;
      }

      case '484': {
        // ERR_RESTRICTED — action requires account login (e.g. channel creation)
        if (trailing) {
          s.addSystemMessage(serverId, trailing, command);
        }
        break;
      }

      case '464': {
        // ERR_PASSWDMISMATCH — bad server password. Fatal: skip auto-reconnect.
        if (trailing) s.addSystemMessage(serverId, trailing, command);
        this.skipReconnect.add(serverId);
        break;
      }

      case '465': {
        // ERR_YOUREBANNEDCREEP — banned from server. Fatal: skip auto-reconnect.
        if (trailing) {
          s.addSystemMessage(serverId, trailing, command);
        }
        this.skipReconnect.add(serverId);
        break;
      }

      // ─── SASL authentication numerics ───────────────────────────────────────
      case '900': {
        // RPL_LOGGEDIN — successfully logged in
        if (trailing) s.addSystemMessage(serverId, trailing, command);
        break;
      }
      case '903': {
        // RPL_SASLSUCCESS — SASL authentication successful
        if (trailing) s.addSystemMessage(serverId, trailing, command);
        this.saslCompleted.add(serverId);
        this.store.setServerInfo(serverId, { saslAuthenticated: true });
        this.send(serverId, 'CAP END');
        this.capNegotiating.delete(serverId);
        break;
      }
      case '904': {
        // ERR_SASLFAIL — SASL authentication failed
        if (trailing)
          s.addSystemMessage(serverId, `SASL authentication failed: ${trailing}`, command);
        this.send(serverId, 'CAP END');
        this.capNegotiating.delete(serverId);
        break;
      }
      case '905':
      case '906':
      case '907': {
        // ERR_SASLTOOLONG / ERR_SASLABORTED / ERR_SASLALREADY
        if (trailing) s.addSystemMessage(serverId, trailing, command);
        if (this.capNegotiating.has(serverId)) {
          this.send(serverId, 'CAP END');
          this.capNegotiating.delete(serverId);
        }
        break;
      }

      default: {
        const code: number = parseInt(command, 10);
        const isError: boolean = code >= 400 && code < 600;
        if (trailing) {
          s.addSystemMessage(serverId, `[${command}] ${trailing}`, command);
          // Errors also appear in DMs (addSystemMessage skips DMs by default)
          if (
            isError &&
            s.selectedServerId === serverId &&
            s.selectedChannel &&
            s.selectedChannel !== '*status' &&
            s.isDM(s.selectedChannel)
          ) {
            s.addMessage(
              serverId,
              s.selectedChannel,
              '',
              `[${command}] ${trailing}`,
              'system',
              command,
            );
          }
        }
        if (isError && trailing) {
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

export type {
  ServerSettingsApi,
  UserSettingsApi,
  UserPrefsApi,
  IRCConnection,
  IRCConnectionConfig,
  ParsedMessage,
};
export default IRCService;
