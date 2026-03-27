/**
 * Shared type definitions for GhostMesh frontend.
 * Only types used across multiple layers (stores, services, components) live here.
 * Domain-specific types live in their primary files.
 */

// ─── Channels ────────────────────────────────────────────────────────────────

/** A channel discovered via the IRC LIST command. */
interface AvailableChannel {
  /** Channel name (e.g. "#linux"). */
  name: string;
  /** Number of users currently in the channel. */
  users: number;
  /** Channel topic, may be empty. */
  topic: string;
}

// ─── Server ──────────────────────────────────────────────────────────────────

/** Static server definition from the default server list. */
interface ServerConfig {
  /** Unique identifier (e.g. "example-1", "example-2"). */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** WebSocket URL for direct connection, or display label for proxy-routed servers. */
  host: string;
  /** TCP hostname for proxy-based connections (e.g. "irc.example.com"). If set, connect via proxy. */
  tcpHost?: string;
  /** TCP port for proxy-based connections (default 6667). */
  tcpPort?: number;
  /** Whether to use TLS for the TCP connection to the IRC server. */
  tcpTls?: boolean;
  /** Default filtered message patterns for this server. Applied on first connect if no user overrides exist. */
  defaultFilteredMessages?: string[];
  /** Transform URLs before sending. Receives a URL string, returns the transformed URL. */
  urlTransform?: (url: string) => string;
  /** Upload provider names blocked on this server. Uploads will skip these providers. */
  blockedUploadProviders?: string[];
}

// ─── Chat messages ───────────────────────────────────────────────────────────

/** Discriminator for chat message rendering. */
type MessageType = 'message' | 'system' | 'join' | 'part' | 'quit' | 'nick' | 'kick';

/** A single message stored in the chat history. */
interface ChatMessage {
  /** Unique message identifier. */
  id: string;
  /** Server this message belongs to. */
  serverId: string;
  /** Channel or DM target (e.g. "#linux" or "someuser"). */
  channel: string;
  /** Nickname of the sender ("*" for system messages). */
  nick: string;
  /** Raw or formatted message content. */
  content: string;
  /** When the message was received. */
  timestamp: Date;
  /** How this message should be rendered. */
  type: MessageType;
  /** Optional warning text shown as a badge on the message bubble. */
  warning?: string;
  /** Whether this message was sent by the local user. Persists across nick changes. */
  own?: boolean;
}

// ─── UI events ───────────────────────────────────────────────────────────────

/** Payload emitted when clicking a username in the chat or user list. */
interface UserClickPayload {
  /** The clicked user's nickname. */
  nick: string;
  /** Server where this user exists. */
  serverId: string;
  /** Mouse X coordinate for positioning the context menu. */
  x: number;
  /** Mouse Y coordinate for positioning the context menu. */
  y: number;
}

// ─── Store API (shared to break circular deps between store and service) ─────

/**
 * Subset of the IRC store exposed to IRCService.
 * Defined here instead of in the store to avoid a circular import
 * between `stores/irc.ts` and `services/irc.service.ts`.
 */
interface IrcStoreApi {
  /** Current confirmed nickname on any connected server. */
  readonly nickname: string;
  /** Joined channels per server (serverId → channel names). */
  readonly channels: Record<string, string[]>;
  /** Currently selected server, or null. */
  readonly selectedServerId: string | null;
  /** Currently selected channel/DM, or null. */
  readonly selectedChannel: string | null;

  /** Mark a server as connected. */
  addConnection(serverId: string): void;
  /** Mark a server as disconnected and clean up its state. */
  removeConnection(serverId: string): void;
  /** Mark a server as currently loading a channel LIST. */
  setListLoading(serverId: string): void;
  /** Mark a server as done loading a channel LIST. */
  clearListLoading(serverId: string): void;
  /** Add a channel to the joined list for a server. */
  addJoinedChannel(serverId: string, channel: string): void;
  /** Remove a channel from the joined list for a server. */
  removeJoinedChannel(serverId: string, channel: string): void;
  /** Add a chat message to a channel's history. */
  addMessage(
    serverId: string,
    channel: string,
    nick: string,
    content: string,
    type?: MessageType,
  ): void;
  /** Attach a warning badge to the last message sent by the local user. */
  warnLastOwnMessage(serverId: string, warningText: string): void;
  /** Add a system-level message to the active server's status channel. */
  addSystemMessage(serverId: string, content: string): void;
  /** Set the topic for a channel. */
  setTopic(serverId: string, channel: string, topic: string): void;
  /** Add a single user to a channel's member list. */
  addUser(serverId: string, channel: string, nick: string): void;
  /** Add multiple users to a channel's member list (batch from NAMES). */
  addUsers(serverId: string, channel: string, names: string[]): void;
  /** Sort all user lists alphabetically after a NAMES batch completes. */
  finalizeUsers(): void;
  /** Remove a user from a channel's member list. */
  removeUser(serverId: string, channel: string, nick: string): void;
  /** Clear all available (browseable) channels for a server before a new LIST. */
  clearAvailableChannels(serverId: string): void;
  /** Buffer an available channel from a LIST reply. */
  addAvailableChannel(serverId: string, channel: AvailableChannel): void;
  /** Flush the channel buffer to the reactive store, optionally sorting on final. */
  flushChannelBuffer(serverId: string, final?: boolean): void;
  /** Switch the UI to a specific server and channel. */
  selectChannel(serverId: string, channel: string): void;
  /** Update the confirmed nickname for a server. */
  setNickname(serverId: string, nick: string): void;
  /** Mark a DM partner as online or offline. */
  setDMOnline(serverId: string, nick: string, online: boolean): void;
  /** Check whether a channel name represents a private message (no # prefix). */
  isDM(name: string): boolean;
  /** Rename a user across all channels (triggered by NICK messages). */
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
