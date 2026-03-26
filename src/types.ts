/**
 * Shared type definitions for GhostMesh frontend.
 * Only types used across multiple layers (stores, services, components) live here.
 * Domain-specific types live in their primary files.
 */

// ─── Channels ────────────────────────────────────────────────────────────────

interface AvailableChannel {
  name: string;
  users: number;
  topic: string;
}

// ─── Server ──────────────────────────────────────────────────────────────────

interface ServerConfig {
  id: string;
  name: string;
  host: string;
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

// ─── UI events ───────────────────────────────────────────────────────────────

interface UserClickPayload {
  nick: string;
  serverId: string;
  x: number;
  y: number;
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

export type {
  AvailableChannel,
  ChatMessage,
  IrcStoreApi,
  MessageType,
  ServerConfig,
  UserClickPayload,
};
