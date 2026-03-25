import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import config from '@/config.js';

const STORAGE_KEY = 'ghostmesh:user-settings';
const SERVER_STORAGE_KEY = 'ghostmesh:server-settings';

const DEFAULTS = {
  nickname: '',
  username: '',
  realname: '',
  avatarColor: '',
};

/**
 * Load user settings from localStorage.
 * @returns {object}
 */
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Save user settings to localStorage.
 * @param {object} data
 */
function saveToStorage(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

const useUserSettingsStore = defineStore('user-settings', () => {
  const settings = ref({ ...DEFAULTS, ...loadFromStorage() });

  // Persist on change
  watch(settings, (val) => saveToStorage(val), { deep: true });

  /**
   * Get the full user profile with defaults applied.
   * @returns {object}
   */
  function getProfile() {
    return { ...DEFAULTS, ...settings.value };
  }

  /**
   * Update one or more profile fields.
   * @param {object} partial — key/value pairs to merge
   */
  function updateProfile(partial) {
    settings.value = { ...settings.value, ...partial };
  }

  /**
   * Resolve the nickname to use for a server.
   * Priority: per-server override > global setting > random.
   * @param {string|null} serverId
   * @param {object} [serverSettings] — server settings store instance
   * @returns {string}
   */
  function resolveNick(serverId, serverSettings) {
    // Per-server override
    if (serverId && serverSettings) {
      const serverNick = serverSettings.getSettings(serverId).nickname;
      if (serverNick) return serverNick;
    }
    // Global user setting
    if (settings.value.nickname) return settings.value.nickname;
    // Random fallback
    return config.irc.nickname + '_' + Math.floor(Math.random() * 1000);
  }

  /**
   * Resolve the username for a server.
   * Priority: per-server override > global setting > config default.
   * @param {string|null} serverId
   * @param {object} [serverSettings] — server settings store instance
   * @returns {string}
   */
  function resolveUsername(serverId, serverSettings) {
    if (serverId && serverSettings) {
      const serverUsername = serverSettings.getSettings(serverId).username;
      if (serverUsername) return serverUsername;
    }
    if (settings.value.username) return settings.value.username;
    return config.irc.username;
  }

  /**
   * Resolve the realname for a server.
   * Priority: per-server override > global setting > config default.
   * @param {string|null} serverId
   * @param {object} [serverSettings] — server settings store instance
   * @returns {string}
   */
  function resolveRealname(serverId, serverSettings) {
    if (serverId && serverSettings) {
      const serverRealname = serverSettings.getSettings(serverId).realname;
      if (serverRealname) return serverRealname;
    }
    if (settings.value.realname) return settings.value.realname;
    return config.irc.realname;
  }

  /**
   * Clear all user data from localStorage (user settings + server settings).
   * Resets in-memory state to defaults.
   */
  function clearAll() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SERVER_STORAGE_KEY);
    settings.value = { ...DEFAULTS };
  }

  return {
    settings,
    getProfile,
    updateProfile,
    resolveNick,
    resolveUsername,
    resolveRealname,
    clearAll,
  };
});

export { useUserSettingsStore };
