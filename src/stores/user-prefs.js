import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

const STORAGE_KEY = 'ghostmesh:user-prefs';

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

const useUserPrefsStore = defineStore('user-prefs', () => {
  const stored = loadFromStorage();

  /** @type {import('vue').Ref<string[]>} nicks with previews disabled */
  const hiddenPreviews = ref(stored.hiddenPreviews || []);
  /** @type {import('vue').Ref<string[]>} nicks shadow-banned */
  const hiddenUsers = ref(stored.hiddenUsers || []);

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
    return hiddenPreviews.value.includes(normalize(nick));
  }

  /**
   * Toggle preview visibility for a nick.
   * @param {string} nick
   */
  function togglePreviewHidden(nick) {
    const n = normalize(nick);
    const idx = hiddenPreviews.value.indexOf(n);
    if (idx === -1) {
      hiddenPreviews.value.push(n);
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
    return hiddenUsers.value.includes(normalize(nick));
  }

  /**
   * Toggle shadow ban for a nick.
   * @param {string} nick
   */
  function toggleUserHidden(nick) {
    const n = normalize(nick);
    const idx = hiddenUsers.value.indexOf(n);
    if (idx === -1) {
      hiddenUsers.value.push(n);
    } else {
      hiddenUsers.value.splice(idx, 1);
    }
  }

  /**
   * Clear all user prefs (for "Forget Me").
   */
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
    clearAll,
  };
});

export { useUserPrefsStore };
