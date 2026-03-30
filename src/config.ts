// ─── Config types ─────────────────────────────────────────────────────────────

interface StorageKeys {
  userSettings: string;
  serverSettings: string;
  userPrefs: string;
  session: string;
}

interface IrcDefaults {
  nickname: string;
  username: string;
  realname: string;
}

interface ChatConfig {
  maxMessages: number;
  /** Max ms between consecutive messages to group them visually. */
  groupingInterval: number;
}

interface ListConfig {
  browseLimit: number;
  /** Max seconds to wait for LIST to complete before clearing loading state. */
  listTimeout: number;
}

interface ImagesConfig {
  showProxyCaption: boolean;
  cacheTtl: number;
  cacheCleanupInterval: number;
  cacheDebug: boolean;
}

interface ServerDefaults {
  listDelay: number;
  listRefreshInterval: number;
  mircFormatting: boolean | null;
  keepalive: boolean;
  keepaliveInterval: number;
  keepaliveTimeout: number;
  autoReconnect: boolean;
  nickname: string;
  username: string;
  realname: string;
}

interface ProxyConfig {
  /** Base WebSocket URL for the proxy-wss service. */
  url: string;
  /** Shared secret for authenticating with the proxy. */
  secret: string;
}

interface AppConfig {
  storageKeys: StorageKeys;
  irc: IrcDefaults;
  chat: ChatConfig;
  list: ListConfig;
  images: ImagesConfig;
  proxy: ProxyConfig;
  serverDefaults: ServerDefaults;
}

/**
 * Global application defaults.
 * All configurable values should live here so they are easy to find and change.
 */
const config: AppConfig = {
  /** localStorage keys — single source of truth. */
  storageKeys: {
    userSettings: 'ghostmesh:user-settings',
    serverSettings: 'ghostmesh:server-settings',
    userPrefs: 'ghostmesh:user-prefs',
    session: 'ghostmesh:session',
  },

  /** IRC connection defaults. */
  irc: {
    nickname: 'ghostmesh',
    username: 'ghostmesh',
    realname: 'GhostMesh IRC Client',
  },

  /** Chat settings. */
  chat: {
    /** Maximum messages to keep per channel. Older messages are discarded. */
    maxMessages: 1000,
    /** Max ms between consecutive messages to group them visually (default: 10 min). */
    groupingInterval: 10 * 60 * 1000,
  },

  /** Channel LIST defaults. */
  list: {
    /** Maximum channels to render in the browse list. */
    browseLimit: 200,
    /** Max seconds to wait for LIST to complete before clearing loading state. */
    listTimeout: 30,
  },

  /** Image preview settings. */
  images: {
    /** Show a caption on images served through the proxy. Temporary for testing. */
    showProxyCaption: true,
    /** Image cache TTL in milliseconds. Entries older than this are cleaned up. */
    cacheTtl: 10 * 60 * 1000,
    /** Image cache cleanup interval in milliseconds. */
    cacheCleanupInterval: 5 * 60 * 1000,
    /** Log cache cleanup stats to console. */
    cacheDebug: true,
  },

  /** WebSocket-to-TCP proxy for servers without native WebSocket support. */
  proxy: {
    url: import.meta.env.VITE_PROXY_URL || 'ws://localhost:8080',
    secret: import.meta.env.VITE_PROXY_SECRET || 'dev-secret',
  },

  /** Per-server settings defaults (overridden by localStorage). */
  serverDefaults: {
    /** Seconds to wait after connecting before requesting LIST. */
    listDelay: 5,
    /** Seconds between automatic LIST refreshes (0 = disabled). */
    listRefreshInterval: 300,
    /** mIRC formatting: null = auto-detect, true = always, false = never. */
    mircFormatting: null,
    /** Send client PING to detect dead connections (true/false). */
    keepalive: true,
    /** Seconds of inactivity before sending a client PING. */
    keepaliveInterval: 60,
    /** Seconds to wait for PONG before considering connection dead. */
    keepaliveTimeout: 120,
    /** Auto-reconnect on disconnect (true/false). */
    autoReconnect: true,
    /** Per-server nickname override (empty = use global). */
    nickname: '',
    /** Per-server username override (empty = use global). */
    username: '',
    /** Per-server realname override (empty = use global). */
    realname: '',
  },
};

export type {
  AppConfig,
  StorageKeys,
  IrcDefaults,
  ChatConfig,
  ListConfig,
  ImagesConfig,
  ProxyConfig,
  ServerDefaults,
};
export default config;
