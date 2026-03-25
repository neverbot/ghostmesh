import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import config from '@/config.js';

const STORAGE_KEY = config.storageKeys.serverSettings;
const DEFAULTS = config.serverDefaults;

/**
 * Load all server settings from localStorage.
 * @returns {Record<string, object>}
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
 * Save all server settings to localStorage.
 * @param {Record<string, object>} data
 */
function saveToStorage(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

const useServerSettingsStore = defineStore('server-settings', () => {
  /** @type {import('vue').Ref<Record<string, object>>} settings per serverId */
  const settings = ref(loadFromStorage());

  // Persist on change
  watch(settings, (val) => saveToStorage(val), { deep: true });

  /**
   * Get settings for a server, with defaults applied.
   * @param {string} serverId
   * @returns {object}
   */
  function getSettings(serverId) {
    return { ...DEFAULTS, ...(settings.value[serverId] || {}) };
  }

  /**
   * Update one or more settings for a server.
   * @param {string} serverId
   * @param {object} partial — key/value pairs to merge
   */
  function updateSettings(serverId, partial) {
    const current = settings.value[serverId] || {};
    settings.value[serverId] = { ...current, ...partial };
  }

  /**
   * Get the LIST delay for a server (in seconds).
   * Returns user override, or detected value, or default.
   * @param {string} serverId
   * @param {number|null} detected — auto-detected value from NOTICE
   * @returns {number}
   */
  function getListDelay(serverId, detected = null) {
    const s = getSettings(serverId);
    // User has explicitly set a custom value (different from default)
    if (settings.value[serverId]?.listDelay !== undefined) {
      return s.listDelay;
    }
    // Use detected value if available
    if (detected !== null) return detected;
    // Fallback to default
    return DEFAULTS.listDelay;
  }

  /**
   * Check if mIRC formatting is enabled for a server.
   * null = auto (enabled if detected), true = forced on, false = forced off.
   * @param {string} serverId
   * @param {boolean} detected — whether mIRC codes were detected
   * @returns {boolean}
   */
  function isMircEnabled(serverId, detected = false) {
    const s = getSettings(serverId);
    if (s.mircFormatting === true) return true;
    if (s.mircFormatting === false) return false;
    // Auto: follow detection
    return detected;
  }

  /**
   * Mark mIRC as auto-detected for a server (only if user hasn't explicitly set it).
   * @param {string} serverId
   */
  function markMircDetected(serverId) {
    const current = settings.value[serverId] || {};
    if (current.mircFormatting === undefined || current.mircFormatting === null) {
      updateSettings(serverId, { mircFormatting: null, mircDetected: true });
    }
  }

  return {
    settings,
    getSettings,
    updateSettings,
    getListDelay,
    isMircEnabled,
    markMircDetected,
  };
});

export { useServerSettingsStore };
