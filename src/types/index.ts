/**
 * Central type definitions for GhostMesh frontend.
 * All shared interfaces live here so every module imports from one place.
 */

// ─── Config ──────────────────────────────────────────────────────────────────

interface StorageKeys {
  userSettings: string;
  serverSettings: string;
  userPrefs: string;
  session: string;
}

interface IrcDefaults {
  nickname: string;
  username: string;
  realname: string;
}

interface ChatConfig {
  maxMessages: number;
}

interface ListConfig {
  browseLimit: number;
}

interface ImagesConfig {
  showProxyCaption: boolean;
}

interface ServerDefaults {
  listDelay: number;
  listRefreshInterval: number;
  mircFormatting: boolean | null;
  keepalive: boolean;
  keepaliveInterval: number;
  keepaliveTimeout: number;
  autoReconnect: boolean;
  nickname: string;
  username: string;
  realname: string;
}

interface AppConfig {
  storageKeys: StorageKeys;
  irc: IrcDefaults;
  chat: ChatConfig;
  list: ListConfig;
  images: ImagesConfig;
  serverDefaults: ServerDefaults;
}

// ─── Server ──────────────────────────────────────────────────────────────────

interface ServerConfig {
  id: string;
  name: string;
  host: string;
}

// ─── IRC protocol ────────────────────────────────────────────────────────────

interface ParsedMessage {
  serverId: string;
  prefix: string | undefined;
  command: string;
  params: string[];
  trailing: string | undefined;
  raw: string;
}

interface IRCConnectionConfig {
  nickname: string;
  username: string;
  realname: string;
}

interface IRCConnection {
  socket: WebSocket;
  config: IRCConnectionConfig;
}

// ─── Chat messages ───────────────────────────────────────────────────────────

type MessageType = 'message' | 'system' | 'join' | 'part' | 'quit' | 'nick' | 'kick';

interface ChatMessage {
  id: string;
  serverId: string;
  channel: string;
  nick: string;
  content: string;
  timestamp: Date;
  type: MessageType;
  warning?: string;
}

// ─── Channels ────────────────────────────────────────────────────────────────

interface AvailableChannel {
  name: string;
  users: number;
  topic: string;
}

/** Extended channel info for display in the unified channel list. */
interface DisplayChannel extends AvailableChannel {
  _sid: string;
  _sname: string;
}

interface JoinedChannelEntry {
  serverId: string;
  serverName: string;
  channel: string;
  userCount: number;
  isDM: boolean;
}

// ─── Session persistence ─────────────────────────────────────────────────────

interface SessionData {
  serverIds: string[];
  channels: Record<string, string[]>;
  selected: { serverId: string; channel: string } | null;
}

// ─── User preferences ───────────────────────────────────────────────────────

interface UserPrefEntry {
  serverId: string;
  nick: string;
  addedAt: number;
}

interface UserProfile {
  nickname: string;
  username: string;
  realname: string;
  avatarColor: string;
}

// ─── Server settings (extended) ──────────────────────────────────────────────

interface ServerSettingsEntry extends ServerDefaults {
  listDelayManual?: boolean;
  mircDetected?: boolean;
}

// ─── Store API (passed to IRCService to break circular deps) ─────────────────

interface IrcStoreApi {
  readonly nickname: string;
  readonly channels: Record<string, string[]>;
  readonly selectedServerId: string | null;
  readonly selectedChannel: string | null;
  addConnection(serverId: string): void;
  removeConnection(serverId: string): void;
  setListLoading(serverId: string): void;
  clearListLoading(serverId: string): void;
  addJoinedChannel(serverId: string, channel: string): void;
  removeJoinedChannel(serverId: string, channel: string): void;
  addMessage(
    serverId: string,
    channel: string,
    nick: string,
    content: string,
    type?: MessageType,
  ): void;
  warnLastOwnMessage(serverId: string, warningText: string): void;
  addSystemMessage(serverId: string, content: string): void;
  setTopic(serverId: string, channel: string, topic: string): void;
  addUser(serverId: string, channel: string, nick: string): void;
  addUsers(serverId: string, channel: string, names: string[]): void;
  finalizeUsers(): void;
  removeUser(serverId: string, channel: string, nick: string): void;
  clearAvailableChannels(serverId: string): void;
  addAvailableChannel(serverId: string, channel: AvailableChannel): void;
  flushChannelBuffer(serverId: string, final?: boolean): void;
  selectChannel(serverId: string, channel: string): void;
  setNickname(serverId: string, nick: string): void;
  setDMOnline(serverId: string, nick: string, online: boolean): void;
  isDM(name: string): boolean;
  renameUser(serverId: string, oldNick: string, newNick: string): void;
}

// ─── Image providers ─────────────────────────────────────────────────────────

interface ProxyHelpers {
  fetchWithProxy: (url: string) => Promise<Response>;
}

interface ImageProvider {
  name: string;
  match: (url: string) => boolean;
  transform: (url: string) => string | null;
  resolve?: (id: string, helpers: ProxyHelpers) => Promise<string | null>;
}

interface ImageProviderResult {
  provider: string;
  imageUrl: string;
}

// ─── CORS proxy ──────────────────────────────────────────────────────────────

interface CorsProxy {
  name: string;
  buildUrl: (targetUrl: string) => string;
}

// ─── UI events ───────────────────────────────────────────────────────────────

interface OpenSettingsRequest {
  serverId: string;
  tab: string;
}

interface UserClickPayload {
  nick: string;
  serverId: string;
  x: number;
  y: number;
}

export type {
  AppConfig,
  AvailableChannel,
  ChatConfig,
  ChatMessage,
  CorsProxy,
  DisplayChannel,
  IRCConnection,
  IRCConnectionConfig,
  ImageProvider,
  ImageProviderResult,
  ImagesConfig,
  IrcDefaults,
  IrcStoreApi,
  JoinedChannelEntry,
  ListConfig,
  MessageType,
  OpenSettingsRequest,
  ParsedMessage,
  ProxyHelpers,
  ServerConfig,
  ServerDefaults,
  ServerSettingsEntry,
  SessionData,
  StorageKeys,
  UserClickPayload,
  UserPrefEntry,
  UserProfile,
};
