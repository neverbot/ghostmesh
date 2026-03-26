import type { AppConfig } from '@/types/index.ts';

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
  },

  /** Channel LIST defaults. */
  list: {
    /** Maximum channels to render in the browse list. */
    browseLimit: 200,
  },

  /** Image preview settings. */
  images: {
    /** Show a caption on images served through the proxy. Temporary for testing. */
    showProxyCaption: true,
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

export default config;
