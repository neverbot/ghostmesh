import type IRCService from '@/services/irc.service.ts';

/** Context passed to command executors. */
interface CommandContext {
  serverId: string;
  channel: string | null;
  service: IRCService;
  store: CommandStore;
}

/** Minimal store API needed by commands. */
interface CommandStore {
  openDM(serverId: string, nick: string): void;
  addMessage(
    serverId: string,
    channel: string,
    nick: string,
    content: string,
    type?: string,
  ): void;
  clearMessages(serverId: string, channel: string): void;
  leaveChannel(serverId: string, channel: string): void;
  selectServer(serverId: string): void;
  isDM(name: string): boolean;
  nickname: string;
}

/** Definition of a slash command. */
interface CommandDefinition {
  /** Primary command name (without slash). */
  name: string;
  /** Alternative names (without slash). */
  aliases: string[];
  /** Short description shown in autocomplete. */
  description: string;
  /** Usage syntax shown in autocomplete detail. */
  usage: string;
  /** Execute the command. Return true if handled. */
  execute: (args: string[], ctx: CommandContext) => boolean;
}

/** Parsed command result. */
interface ParsedCommand {
  name: string;
  args: string[];
}

// ─── Command definitions ─────────────────────────────────────────────────────

const commands: CommandDefinition[] = [
  // --- IRC commands ---
  {
    name: 'nick',
    aliases: [],
    description: 'Change your nickname',
    usage: '/nick <newname>',
    execute: (args, ctx) => {
      if (!args[0]) return false;
      ctx.service.changeNick(ctx.serverId, args[0]);
      return true;
    },
  },
  {
    name: 'join',
    aliases: ['j'],
    description: 'Join a channel',
    usage: '/join <channel>',
    execute: (args, ctx) => {
      if (!args[0]) return false;
      const channel = args[0].startsWith('#') ? args[0] : `#${args[0]}`;
      ctx.service.joinChannel(ctx.serverId, channel);
      return true;
    },
  },
  {
    name: 'part',
    aliases: ['leave'],
    description: 'Leave a channel',
    usage: '/part [channel]',
    execute: (args, ctx) => {
      const channel = args[0] || ctx.channel;
      if (!channel || channel === '*status') return false;
      ctx.store.leaveChannel(ctx.serverId, channel);
      return true;
    },
  },
  {
    name: 'msg',
    aliases: ['privmsg', 'pm'],
    description: 'Send a private message',
    usage: '/msg <nick> <message>',
    execute: (args, ctx) => {
      if (args.length < 2) return false;
      const nick = args[0];
      const text = args.slice(1).join(' ');
      ctx.store.openDM(ctx.serverId, nick);
      ctx.service.sendMessage(ctx.serverId, nick, text);
      ctx.store.addMessage(ctx.serverId, nick, ctx.store.nickname, text, 'message');
      return true;
    },
  },
  {
    name: 'query',
    aliases: ['q'],
    description: 'Open a private conversation',
    usage: '/query <nick>',
    execute: (args, ctx) => {
      if (!args[0]) return false;
      ctx.store.openDM(ctx.serverId, args[0]);
      return true;
    },
  },
  {
    name: 'quit',
    aliases: ['disconnect'],
    description: 'Disconnect from server',
    usage: '/quit [reason]',
    execute: (args, ctx) => {
      const reason = args.join(' ') || 'Leaving';
      ctx.service.send(ctx.serverId, `QUIT :${reason}`);
      return true;
    },
  },
  {
    name: 'topic',
    aliases: [],
    description: 'View or set channel topic',
    usage: '/topic [new topic]',
    execute: (args, ctx) => {
      if (!ctx.channel || ctx.channel === '*status') return false;
      if (args.length === 0) {
        ctx.service.send(ctx.serverId, `TOPIC ${ctx.channel}`);
      } else {
        ctx.service.send(ctx.serverId, `TOPIC ${ctx.channel} :${args.join(' ')}`);
      }
      return true;
    },
  },
  {
    name: 'mode',
    aliases: [],
    description: 'Set channel or user modes',
    usage: '/mode <target> <flags>',
    execute: (args, ctx) => {
      if (!args[0]) return false;
      ctx.service.send(ctx.serverId, `MODE ${args.join(' ')}`);
      return true;
    },
  },
  {
    name: 'list',
    aliases: [],
    description: 'Refresh channel list',
    usage: '/list',
    execute: (_args, ctx) => {
      ctx.service.requestList(ctx.serverId);
      return true;
    },
  },
  {
    name: 'whois',
    aliases: [],
    description: 'Query user information',
    usage: '/whois <nick>',
    execute: (args, ctx) => {
      if (!args[0]) return false;
      ctx.service.send(ctx.serverId, `WHOIS ${args[0]}`);
      return true;
    },
  },
  {
    name: 'login',
    aliases: ['identify', 'id'],
    description: 'Authenticate with NickServ',
    usage: '/login <nick> <password>',
    execute: (args, ctx) => {
      if (args.length < 2) return false;
      ctx.service.send(ctx.serverId, `NICKSERV IDENTIFY ${args[0]} ${args[1]}`);
      return true;
    },
  },
  {
    name: 'raw',
    aliases: ['quote'],
    description: 'Send a raw IRC command',
    usage: '/raw <command>',
    execute: (args, ctx) => {
      if (!args[0]) return false;
      ctx.service.send(ctx.serverId, args.join(' '));
      return true;
    },
  },
  {
    name: 'me',
    aliases: ['action'],
    description: 'Send an action message',
    usage: '/me <action>',
    execute: (args, ctx) => {
      if (!args[0] || !ctx.channel || ctx.channel === '*status') return false;
      const text = args.join(' ');
      ctx.service.send(ctx.serverId, `PRIVMSG ${ctx.channel} :\x01ACTION ${text}\x01`);
      ctx.store.addMessage(ctx.serverId, ctx.channel, ctx.store.nickname, `* ${ctx.store.nickname} ${text}`, 'system');
      return true;
    },
  },

  // --- Client commands ---
  {
    name: 'clear',
    aliases: [],
    description: 'Clear current channel messages',
    usage: '/clear',
    execute: (_args, ctx) => {
      if (!ctx.channel) return false;
      ctx.store.clearMessages(ctx.serverId, ctx.channel);
      return true;
    },
  },
  {
    name: 'close',
    aliases: [],
    description: 'Close current channel or conversation',
    usage: '/close',
    execute: (_args, ctx) => {
      if (!ctx.channel || ctx.channel === '*status') return false;
      ctx.store.leaveChannel(ctx.serverId, ctx.channel);
      return true;
    },
  },
];

// ─── Public API ──────────────────────────────────────────────────────────────

/** Parse a slash command from user input. Returns null if not a command. */
function parseCommand(input: string): ParsedCommand | null {
  if (!input.startsWith('/')) return null;
  const parts = input.slice(1).split(/\s+/);
  const name = parts[0]?.toLowerCase();
  if (!name) return null;
  return { name, args: parts.slice(1) };
}

/** Find the command definition by name or alias. */
function findCommand(name: string): CommandDefinition | null {
  const lower = name.toLowerCase();
  return commands.find(
    (cmd) => cmd.name === lower || cmd.aliases.includes(lower),
  ) || null;
}

/** Execute a parsed command. Returns true if handled. */
function executeCommand(parsed: ParsedCommand, ctx: CommandContext): boolean {
  const cmd = findCommand(parsed.name);
  if (!cmd) return false;
  return cmd.execute(parsed.args, ctx);
}

/** Get commands matching a prefix (for autocomplete). */
function getMatchingCommands(prefix: string): CommandDefinition[] {
  const lower = prefix.toLowerCase();
  if (!lower) return commands;
  return commands.filter(
    (cmd) =>
      cmd.name.startsWith(lower) ||
      cmd.aliases.some((a) => a.startsWith(lower)),
  );
}

export type { CommandDefinition, CommandContext, CommandStore, ParsedCommand };
export { commands, parseCommand, findCommand, executeCommand, getMatchingCommands };
