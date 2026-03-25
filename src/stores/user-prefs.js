import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import config from '@/config.js';

const STORAGE_KEY = config.storageKeys.userPrefs;

/** Entries older than this (ms) are purged when a new entry is added. */
const EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Load user prefs from localStorage.
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
 * Save user prefs to localStorage.
 * @param {object} data
 */
function saveToStorage(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/**
 * Build a key from serverId + nick for lookups.
 * @param {string} serverId
 * @param {string} nick
 * @returns {string}
 */
function makeKey(serverId, nick) {
  return `${serverId}:${(nick || '').toLowerCase()}`;
}

/**
 * Migrate old format entries (without serverId) to new format.
 * Old: { nick, addedAt } or string → New: { serverId, nick, addedAt }
 * Old entries without serverId are dropped (no way to know which server).
 * @param {any[]} arr
 * @returns {{ serverId: string, nick: string, addedAt: number }[]}
 */
function migrateEntries(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((entry) => {
      if (typeof entry === 'string') return null; // old format, drop
      if (!entry.serverId) return null; // old format without server, drop
      return entry;
    })
    .filter(Boolean);
}

/**
 * Remove entries older than EXPIRY_MS.
 * @param {{ serverId: string, nick: string, addedAt: number }[]} arr
 * @returns {{ serverId: string, nick: string, addedAt: number }[]}
 */
function purgeExpired(arr) {
  const cutoff = Date.now() - EXPIRY_MS;
  return arr.filter((e) => e.addedAt > cutoff);
}

const useUserPrefsStore = defineStore('user-prefs', () => {
  const stored = loadFromStorage();

  /** @type {import('vue').Ref<{ serverId: string, nick: string, addedAt: number }[]>} */
  const hiddenPreviews = ref(migrateEntries(stored.hiddenPreviews));
  /** @type {import('vue').Ref<{ serverId: string, nick: string, addedAt: number }[]>} */
  const hiddenUsers = ref(migrateEntries(stored.hiddenUsers));

  // Persist on change
  watch(
    [hiddenPreviews, hiddenUsers],
    () => saveToStorage({ hiddenPreviews: hiddenPreviews.value, hiddenUsers: hiddenUsers.value }),
    { deep: true },
  );

  /**
   * Check if previews are hidden for a nick on a server.
   * @param {string} serverId
   * @param {string} nick
   * @returns {boolean}
   */
  function isPreviewHidden(serverId, nick) {
    const key = makeKey(serverId, nick);
    return hiddenPreviews.value.some((e) => `${e.serverId}:${e.nick}` === key);
  }

  /**
   * Toggle preview visibility for a nick on a server.
   * @param {string} serverId
   * @param {string} nick
   */
  function togglePreviewHidden(serverId, nick) {
    const key = makeKey(serverId, nick);
    const idx = hiddenPreviews.value.findIndex((e) => `${e.serverId}:${e.nick}` === key);
    if (idx === -1) {
      hiddenPreviews.value = purgeExpired(hiddenPreviews.value);
      hiddenPreviews.value.push({
        serverId,
        nick: (nick || '').toLowerCase(),
        addedAt: Date.now(),
      });
    } else {
      hiddenPreviews.value.splice(idx, 1);
    }
  }

  /**
   * Check if a user is shadow-banned on a server.
   * @param {string} serverId
   * @param {string} nick
   * @returns {boolean}
   */
  function isUserHidden(serverId, nick) {
    const key = makeKey(serverId, nick);
    return hiddenUsers.value.some((e) => `${e.serverId}:${e.nick}` === key);
  }

  /**
   * Toggle shadow ban for a nick on a server.
   * @param {string} serverId
   * @param {string} nick
   */
  function toggleUserHidden(serverId, nick) {
    const key = makeKey(serverId, nick);
    const idx = hiddenUsers.value.findIndex((e) => `${e.serverId}:${e.nick}` === key);
    if (idx === -1) {
      hiddenUsers.value = purgeExpired(hiddenUsers.value);
      hiddenUsers.value.push({
        serverId,
        nick: (nick || '').toLowerCase(),
        addedAt: Date.now(),
      });
    } else {
      hiddenUsers.value.splice(idx, 1);
    }
  }

  /**
   * Get hidden users for a specific server.
   * @param {string} serverId
   * @returns {{ serverId: string, nick: string, addedAt: number }[]}
   */
  function hiddenUsersForServer(serverId) {
    return hiddenUsers.value.filter((e) => e.serverId === serverId);
  }

  /**
   * Get hidden previews for a specific server.
   * @param {string} serverId
   * @returns {{ serverId: string, nick: string, addedAt: number }[]}
   */
  function hiddenPreviewsForServer(serverId) {
    return hiddenPreviews.value.filter((e) => e.serverId === serverId);
  }

  /**
   * Remove all hidden users for a server.
   * @param {string} serverId
   */
  function clearHiddenUsers(serverId) {
    hiddenUsers.value = hiddenUsers.value.filter((e) => e.serverId !== serverId);
  }

  /**
   * Remove all hidden previews for a server.
   * @param {string} serverId
   */
  function clearHiddenPreviews(serverId) {
    hiddenPreviews.value = hiddenPreviews.value.filter((e) => e.serverId !== serverId);
  }

  /** Clear all user prefs (for "Forget Me"). */
  function clearAll() {
    hiddenPreviews.value = [];
    hiddenUsers.value = [];
    localStorage.removeItem(STORAGE_KEY);
  }

  return {
    hiddenPreviews,
    hiddenUsers,
    isPreviewHidden,
    togglePreviewHidden,
    isUserHidden,
    toggleUserHidden,
    hiddenUsersForServer,
    hiddenPreviewsForServer,
    clearHiddenUsers,
    clearHiddenPreviews,
    clearAll,
  };
});

export { useUserPrefsStore };
