/**
 * Global application defaults.
 * All configurable values should live here so they are easy to find and change.
 */
const config = {
  /** IRC connection defaults. */
  irc: {
    nickname: 'ghostmesh',
    username: 'ghostmesh',
    realname: 'GhostMesh IRC Client',
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
    /** Per-server nickname override (empty = use global). */
    nickname: '',
  },
};

export default config;
