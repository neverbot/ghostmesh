import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import type { Ref } from 'vue';
import config from '@/config.ts';
import type { ServerDefaults } from '@/config.ts';

// ─── Server settings types ───────────────────────────────────────────────────

interface ServerSettingsEntry extends ServerDefaults {
  listDelayManual?: boolean;
  mircDetected?: boolean;
  /** Text patterns to filter out from public channel messages. */
  filteredMessages?: string[];
  /** SASL account name for IRCv3 authentication. */
  saslAccount?: string;
  /** SASL password for IRCv3 authentication. */
  saslPassword?: string;
}

/** Runtime info discovered about a connected server. Not persisted. */
interface ServerRuntimeInfo {
  /** Server software and version (from 002 RPL_YOURHOST). */
  version?: string;
  /** Server creation date (from 003 RPL_CREATED). */
  created?: string;
  /** Network name (from 005 ISUPPORT NETWORK=). */
  network?: string;
  /** IRCv3 capabilities advertised by the server. */
  capabilities: string[];
  /** Whether SASL is available. */
  saslAvailable: boolean;
  /** Whether SASL authentication completed successfully. */
  saslAuthenticated: boolean;
  /** Whether mIRC formatting was detected. */
  mircDetected: boolean;
  /** Whether the connection uses TLS. */
  tls: boolean;
  /** Server address. */
  host: string;
  /** Server port. */
  port: number;
}

const STORAGE_KEY: string = config.storageKeys.serverSettings;
const DEFAULTS: ServerDefaults = config.serverDefaults;

/**
 * Load all server settings from localStorage.
 */
function loadFromStorage(): Record<string, Partial<ServerSettingsEntry>> {
  try {
    const raw: string | null = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Partial<ServerSettingsEntry>>) : {};
  } catch {
    return {};
  }
}

/**
 * Save all server settings to localStorage.
 */
function saveToStorage(data: Record<string, Partial<ServerSettingsEntry>>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

const useServerSettingsStore = defineStore('server-settings', () => {
  const settings: Ref<Record<string, Partial<ServerSettingsEntry>>> = ref(loadFromStorage());

  // Persist on change
  watch(settings, (val: Record<string, Partial<ServerSettingsEntry>>) => saveToStorage(val), {
    deep: true,
  });

  /**
   * Get settings for a server, with defaults applied.
   */
  function getSettings(serverId: string): ServerSettingsEntry {
    return { ...DEFAULTS, ...(settings.value[serverId] || {}) };
  }

  /**
   * Update one or more settings for a server.
   */
  function updateSettings(serverId: string, partial: Partial<ServerSettingsEntry>): void {
    const current: Partial<ServerSettingsEntry> = settings.value[serverId] || {};
    settings.value[serverId] = { ...current, ...partial };
  }

  /**
   * Get the LIST delay for a server (in seconds).
   * Returns user override, or detected value, or default.
   */
  function getListDelay(serverId: string, detected: number | null = null): number {
    const s: ServerSettingsEntry = getSettings(serverId);
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
   */
  function isMircEnabled(serverId: string, detected: boolean = false): boolean {
    const s: ServerSettingsEntry = getSettings(serverId);
    if (s.mircFormatting === true) return true;
    if (s.mircFormatting === false) return false;
    // Auto: follow detection
    return detected;
  }

  /**
   * Mark mIRC as auto-detected for a server (only if user hasn't explicitly set it).
   */
  function markMircDetected(serverId: string): void {
    const current: Partial<ServerSettingsEntry> = settings.value[serverId] || {};
    if (current.mircFormatting === undefined || current.mircFormatting === null) {
      updateSettings(serverId, { mircFormatting: null, mircDetected: true });
    }
  }

  /** Check if a message text matches any filtered patterns for a server. */
  function isMessageFiltered(serverId: string, text: string): boolean {
    const filters: string[] = getSettings(serverId).filteredMessages || [];
    if (filters.length === 0) return false;
    const lower: string = text.toLowerCase();
    return filters.some((pattern: string) => lower.includes(pattern.toLowerCase()));
  }

  /** Clear all server settings from memory and localStorage. */
  function clearAll(): void {
    settings.value = {};
    localStorage.removeItem(STORAGE_KEY);
  }

  return {
    settings,
    getSettings,
    updateSettings,
    clearAll,
    getListDelay,
    isMircEnabled,
    markMircDetected,
    isMessageFiltered,
  };
});

export type { ServerSettingsEntry, ServerRuntimeInfo };
export { useServerSettingsStore };
