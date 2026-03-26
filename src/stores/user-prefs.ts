import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import type { Ref } from 'vue';
import config from '@/config.ts';
import type { UserPrefEntry } from '@/types/index.ts';

const STORAGE_KEY: string = config.storageKeys.userPrefs;

/** Entries older than this (ms) are purged when a new entry is added. */
const EXPIRY_MS: number = 24 * 60 * 60 * 1000; // 24 hours

interface StoredPrefs {
  hiddenPreviews?: unknown[];
  blockedUsers?: unknown[];
}

/**
 * Load user prefs from localStorage.
 */
function loadFromStorage(): StoredPrefs {
  try {
    const raw: string | null = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredPrefs) : {};
  } catch {
    return {};
  }
}

/**
 * Save user prefs to localStorage.
 */
function saveToStorage(data: {
  hiddenPreviews: UserPrefEntry[];
  blockedUsers: UserPrefEntry[];
}): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/**
 * Build a key from serverId + nick for lookups.
 */
function makeKey(serverId: string, nick: string): string {
  return `${serverId}:${(nick || '').toLowerCase()}`;
}

/**
 * Migrate old format entries (without serverId) to new format.
 * Old: { nick, addedAt } or string -> New: { serverId, nick, addedAt }
 * Old entries without serverId are dropped (no way to know which server).
 */
function migrateEntries(arr: unknown[] | undefined): UserPrefEntry[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((entry: unknown): UserPrefEntry | null => {
      if (typeof entry === 'string') return null; // old format, drop
      if (typeof entry !== 'object' || entry === null) return null;
      const obj = entry as Record<string, unknown>;
      if (!obj.serverId) return null; // old format without server, drop
      return obj as unknown as UserPrefEntry;
    })
    .filter((e): e is UserPrefEntry => e !== null);
}

/**
 * Remove entries older than EXPIRY_MS.
 */
function purgeExpired(arr: UserPrefEntry[]): UserPrefEntry[] {
  const cutoff: number = Date.now() - EXPIRY_MS;
  return arr.filter((e: UserPrefEntry) => e.addedAt > cutoff);
}

const useUserPrefsStore = defineStore('user-prefs', () => {
  const stored: StoredPrefs = loadFromStorage();

  const hiddenPreviews: Ref<UserPrefEntry[]> = ref(migrateEntries(stored.hiddenPreviews));
  const blockedUsers: Ref<UserPrefEntry[]> = ref(migrateEntries(stored.blockedUsers));

  // Persist on change
  watch(
    [hiddenPreviews, blockedUsers],
    () => saveToStorage({ hiddenPreviews: hiddenPreviews.value, blockedUsers: blockedUsers.value }),
    { deep: true },
  );

  /**
   * Check if previews are hidden for a nick on a server.
   */
  function isPreviewHidden(serverId: string, nick: string): boolean {
    const key: string = makeKey(serverId, nick);
    return hiddenPreviews.value.some((e: UserPrefEntry) => `${e.serverId}:${e.nick}` === key);
  }

  /**
   * Toggle preview visibility for a nick on a server.
   */
  function togglePreviewHidden(serverId: string, nick: string): void {
    const key: string = makeKey(serverId, nick);
    const idx: number = hiddenPreviews.value.findIndex(
      (e: UserPrefEntry) => `${e.serverId}:${e.nick}` === key,
    );
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
   * Check if a user is blocked on a server.
   */
  function isUserBlocked(serverId: string, nick: string): boolean {
    const key: string = makeKey(serverId, nick);
    return blockedUsers.value.some((e: UserPrefEntry) => `${e.serverId}:${e.nick}` === key);
  }

  /**
   * Toggle shadow ban for a nick on a server.
   */
  function toggleUserBlocked(serverId: string, nick: string): void {
    const key: string = makeKey(serverId, nick);
    const idx: number = blockedUsers.value.findIndex(
      (e: UserPrefEntry) => `${e.serverId}:${e.nick}` === key,
    );
    if (idx === -1) {
      blockedUsers.value = purgeExpired(blockedUsers.value);
      blockedUsers.value.push({
        serverId,
        nick: (nick || '').toLowerCase(),
        addedAt: Date.now(),
      });
    } else {
      blockedUsers.value.splice(idx, 1);
    }
  }

  /**
   * Get blocked users for a specific server.
   */
  function blockedUsersForServer(serverId: string): UserPrefEntry[] {
    return blockedUsers.value.filter((e: UserPrefEntry) => e.serverId === serverId);
  }

  /**
   * Get hidden previews for a specific server.
   */
  function hiddenPreviewsForServer(serverId: string): UserPrefEntry[] {
    return hiddenPreviews.value.filter((e: UserPrefEntry) => e.serverId === serverId);
  }

  /**
   * Remove all blocked users for a server.
   */
  function clearBlockedUsers(serverId: string): void {
    blockedUsers.value = blockedUsers.value.filter((e: UserPrefEntry) => e.serverId !== serverId);
  }

  /**
   * Remove all hidden previews for a server.
   */
  function clearHiddenPreviews(serverId: string): void {
    hiddenPreviews.value = hiddenPreviews.value.filter(
      (e: UserPrefEntry) => e.serverId !== serverId,
    );
  }

  /** Clear all user prefs (for "Forget Me"). */
  function clearAll(): void {
    hiddenPreviews.value = [];
    blockedUsers.value = [];
    localStorage.removeItem(STORAGE_KEY);
  }

  return {
    hiddenPreviews,
    blockedUsers,
    isPreviewHidden,
    togglePreviewHidden,
    isUserBlocked,
    toggleUserBlocked,
    blockedUsersForServer,
    hiddenPreviewsForServer,
    clearBlockedUsers,
    clearHiddenPreviews,
    clearAll,
  };
});

export { useUserPrefsStore };
