import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import type { Ref } from 'vue';
import config from '@/config.ts';
import type { ServerSettingsEntry } from '@/stores/server-settings.ts';

// ─── User profile types ──────────────────────────────────────────────────────

interface UserProfile {
  nickname: string;
  username: string;
  realname: string;
  avatarColor: string;
  /** User-provided API keys for private upload providers. */
  uploadProviderKeys?: Record<string, string>;
  /** Global application preferences. */
  globalPrefs?: GlobalPrefs;
}

interface GlobalPrefs {
  /** Clear messages, users and topics when closing a channel or DM. Default: true. */
  clearOnClose?: boolean;
}

const STORAGE_KEY: string = config.storageKeys.userSettings;

const DEFAULTS: UserProfile = {
  nickname: '',
  username: '',
  realname: '',
  avatarColor: '',
};

/**
 * Load user settings from localStorage.
 */
function loadFromStorage(): Partial<UserProfile> {
  try {
    const raw: string | null = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<UserProfile>) : {};
  } catch {
    return {};
  }
}

/**
 * Save user settings to localStorage.
 */
function saveToStorage(data: UserProfile): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

interface ServerSettingsApi {
  getSettings(serverId: string): ServerSettingsEntry;
}

const useUserSettingsStore = defineStore('user-settings', () => {
  const settings: Ref<UserProfile> = ref({ ...DEFAULTS, ...loadFromStorage() });

  // Persist on change
  watch(settings, (val: UserProfile) => saveToStorage(val), { deep: true });

  /**
   * Get the full user profile with defaults applied.
   */
  function getProfile(): UserProfile {
    return { ...DEFAULTS, ...settings.value };
  }

  /**
   * Update one or more profile fields.
   */
  function updateProfile(partial: Partial<UserProfile>): void {
    settings.value = { ...settings.value, ...partial };
  }

  /**
   * Resolve the nickname to use for a server.
   * Priority: per-server override > global setting > random.
   */
  function resolveNick(serverId: string | null, serverSettings?: ServerSettingsApi): string {
    // Per-server override
    if (serverId && serverSettings) {
      const serverNick: string = serverSettings.getSettings(serverId).nickname;
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
   */
  function resolveUsername(serverId: string | null, serverSettings?: ServerSettingsApi): string {
    if (serverId && serverSettings) {
      const serverUsername: string = serverSettings.getSettings(serverId).username;
      if (serverUsername) return serverUsername;
    }
    if (settings.value.username) return settings.value.username;
    return config.irc.username;
  }

  /**
   * Resolve the realname for a server.
   * Priority: per-server override > global setting > config default.
   */
  function resolveRealname(serverId: string | null, serverSettings?: ServerSettingsApi): string {
    if (serverId && serverSettings) {
      const serverRealname: string = serverSettings.getSettings(serverId).realname;
      if (serverRealname) return serverRealname;
    }
    if (settings.value.realname) return settings.value.realname;
    return config.irc.realname;
  }

  /**
   * Clear all user data from localStorage (user settings + server settings).
   * Resets in-memory state to defaults.
   */
  /** Clear user settings from memory and localStorage. */
  function clearAll(): void {
    settings.value = { ...DEFAULTS };
    localStorage.removeItem(config.storageKeys.userSettings);
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

export type { UserProfile, GlobalPrefs };
export { useUserSettingsStore };
