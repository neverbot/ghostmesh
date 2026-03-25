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
 * Normalize a nick to lowercase for case-insensitive comparison.
 * @param {string} nick
 * @returns {string}
 */
function normalize(nick) {
  return (nick || '').toLowerCase();
}

/**
 * Migrate old format (string[]) to new format ({ nick, addedAt }[]).
 * @param {any[]} arr
 * @returns {{ nick: string, addedAt: number }[]}
 */
function migrateEntries(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((entry) => {
    if (typeof entry === 'string') {
      return { nick: entry, addedAt: Date.now() };
    }
    return entry;
  });
}

/**
 * Remove entries older than EXPIRY_MS.
 * @param {{ nick: string, addedAt: number }[]} arr
 * @returns {{ nick: string, addedAt: number }[]}
 */
function purgeExpired(arr) {
  const cutoff = Date.now() - EXPIRY_MS;
  return arr.filter((e) => e.addedAt > cutoff);
}

const useUserPrefsStore = defineStore('user-prefs', () => {
  const stored = loadFromStorage();

  /** @type {import('vue').Ref<{ nick: string, addedAt: number }[]>} */
  const hiddenPreviews = ref(migrateEntries(stored.hiddenPreviews));
  /** @type {import('vue').Ref<{ nick: string, addedAt: number }[]>} */
  const hiddenUsers = ref(migrateEntries(stored.hiddenUsers));

  // Persist on change
  watch(
    [hiddenPreviews, hiddenUsers],
    () => saveToStorage({ hiddenPreviews: hiddenPreviews.value, hiddenUsers: hiddenUsers.value }),
    { deep: true },
  );

  /**
   * Check if previews are hidden for a nick.
   * @param {string} nick
   * @returns {boolean}
   */
  function isPreviewHidden(nick) {
    const n = normalize(nick);
    return hiddenPreviews.value.some((e) => e.nick === n);
  }

  /**
   * Toggle preview visibility for a nick. Purges expired entries on add.
   * @param {string} nick
   */
  function togglePreviewHidden(nick) {
    const n = normalize(nick);
    const idx = hiddenPreviews.value.findIndex((e) => e.nick === n);
    if (idx === -1) {
      hiddenPreviews.value = purgeExpired(hiddenPreviews.value);
      hiddenPreviews.value.push({ nick: n, addedAt: Date.now() });
    } else {
      hiddenPreviews.value.splice(idx, 1);
    }
  }

  /**
   * Check if a user is shadow-banned (messages hidden).
   * @param {string} nick
   * @returns {boolean}
   */
  function isUserHidden(nick) {
    const n = normalize(nick);
    return hiddenUsers.value.some((e) => e.nick === n);
  }

  /**
   * Toggle shadow ban for a nick. Purges expired entries on add.
   * @param {string} nick
   */
  function toggleUserHidden(nick) {
    const n = normalize(nick);
    const idx = hiddenUsers.value.findIndex((e) => e.nick === n);
    if (idx === -1) {
      hiddenUsers.value = purgeExpired(hiddenUsers.value);
      hiddenUsers.value.push({ nick: n, addedAt: Date.now() });
    } else {
      hiddenUsers.value.splice(idx, 1);
    }
  }

  /** Remove all hidden users. */
  function clearHiddenUsers() {
    hiddenUsers.value = [];
  }

  /** Remove all hidden previews. */
  function clearHiddenPreviews() {
    hiddenPreviews.value = [];
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
    clearHiddenUsers,
    clearHiddenPreviews,
    clearAll,
  };
});

export { useUserPrefsStore };
