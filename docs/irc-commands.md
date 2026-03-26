# IRC Protocol Commands — Implementation Status

Reference: [RFC 1459](https://datatracker.ietf.org/doc/html/rfc1459), [RFC 2812](https://datatracker.ietf.org/doc/html/rfc2812)

## Legend

| Symbol  | Meaning                       |
| ------- | ----------------------------- |
| Done    | Fully implemented             |
| Partial | Parsed/handled but incomplete |
| —       | Not implemented               |

---

## Connection & Registration

| Command          | Replies           | Description                    | Status | Notes                                                                                           |
| ---------------- | ----------------- | ------------------------------ | ------ | ----------------------------------------------------------------------------------------------- |
| `PASS`           | 461, 462          | Set connection password        | —      |                                                                                                 |
| `NICK`           | 432, 433, 436     | Set/change nickname            | Done   | Sent on connect; live change via user/server settings; handles 432/433/436 errors with fallback |
| `USER`           | 001-005, 461, 462 | Register username and realname | Done   | Sent on connect from `config.ts`                                                                |
| `QUIT`           |                   | Disconnect from server         | Done   | Sent on disconnect; socket handlers detached before close                                       |
| `PING` / `PONG`  |                   | Keep-alive                     | Done   | Auto PONG response, processed immediately (never queued)                                        |

## Channel Operations

| Command  | Replies                 | Description              | Status  | Notes                                                                   |
| -------- | ----------------------- | ------------------------ | ------- | ----------------------------------------------------------------------- |
| `JOIN`   | 332, 333, 353, 366      | Join a channel           | Done    | Via sidebar input or channel list click; auto-selects joined channel    |
| `PART`   | 442                     | Leave a channel          | Done    | Via leave button on joined channels; `*status` cannot be left           |
| `LIST`   | 321, 322, 323           | List available channels  | Done    | Auto-requested after registration; periodic refresh; batched processing |
| `TOPIC`  | 332, 333                | Get/set channel topic    | Partial | Receives topic (332/333); displayed in channel info panel; no UI to set |
| `NAMES`  | 353, 366                | List users in a channel  | Done    | Handled via 353/366 replies; populates user list panel                  |
| `INVITE` | 341, 443                | Invite user to a channel | —       |                                                                         |
| `KICK`   |                         | Kick user from a channel | Done    | Shows who was kicked, by whom, and reason; removes user from channel    |

## Sending Messages

| Command   | Replies  | Description                          | Status  | Notes                                                                                                  |
| --------- | -------- | ------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------ |
| `PRIVMSG` | 401, 404 | Send message to channel or user      | Done    | Channel + DM support; DM creates private channel with sender nick; CTCP ACTION parsed                  |
| `NOTICE`  |          | Send notice (no auto-reply expected) | Partial | Received and displayed as system message; LIST delay detection; VERIFY challenge detection; cannot send |

## Server Queries

| Command   | Replies          | Description                       | Status  | Notes                                                |
| --------- | ---------------- | --------------------------------- | ------- | ---------------------------------------------------- |
| `MOTD`    | 372, 375, 376    | Request Message of the Day        | Done    | 372/375 stripped of `- ` prefix; preserves ASCII art |
| `LUSERS`  | 251-255, 265-266 | Request server/network user stats | Partial | Numeric replies shown in status                      |
| `VERSION` | 002              | Request server version            | Partial | 002 reply shown in status                            |
| `STATS`   | 211-219, 242-243 | Request server statistics         | —       |                                                      |
| `LINKS`   | 364, 365         | List servers in network           | —       |                                                      |
| `TIME`    | 391              | Request server time               | —       |                                                      |
| `INFO`    | 371, 374         | Request server info               | —       |                                                      |
| `ADMIN`   | 256-259          | Request admin info                | —       |                                                      |

## User Queries

| Command    | Replies          | Description                        | Status | Notes |
| ---------- | ---------------- | ---------------------------------- | ------ | ----- |
| `WHO`      | 352, 315         | Query user information             | —      |       |
| `WHOIS`    | 311-313, 317-319 | Query detailed user info           | —      |       |
| `WHOWAS`   | 314, 369         | Query info about disconnected user | —      |       |
| `USERHOST` | 302              | Quick user host lookup             | —      |       |
| `ISON`     | 303              | Check if users are online          | —      |       |

## Channel Modes & Operator

| Command | Replies     | Description                  | Status | Notes |
| ------- | ----------- | ---------------------------- | ------ | ----- |
| `MODE`  | 221, 324    | Set channel/user modes       | —      |       |
| `OPER`  | 381, 464    | Authenticate as IRC operator | —      |       |

## Miscellaneous

| Command   | Replies | Description                         | Status | Notes |
| --------- | ------- | ----------------------------------- | ------ | ----- |
| `AWAY`    | 301, 305, 306 | Set/unset away status          | —      |       |
| `WALLOPS` |         | Send message to all operators       | —      |       |
| `KILL`    |         | Forcefully disconnect a user (oper) | —      |       |
| `REHASH`  | 382     | Reload server config (oper)         | —      |       |
| `RESTART` |         | Restart server (oper)               | —      |       |

## Numeric Replies Handled

| Code  | Name                 | Status                               | Notes                                             |
| ----- | -------------------- | ------------------------------------ | ------------------------------------------------- |
| `001` | RPL_WELCOME          | Done                                 | Shown in status                                   |
| `002` | RPL_YOURHOST         | Done                                 | Shown in status                                   |
| `003` | RPL_CREATED          | Done                                 | Shown in status                                   |
| `005` | RPL_ISUPPORT         | Partial                              | Shown in status; not parsed for capabilities      |
| `251` | RPL_LUSERCLIENT      | Done                                 | Shown in status                                   |
| `252` | RPL_LUSEROP          | Done                                 | Shown in status                                   |
| `253` | RPL_LUSERUNKNOWN     | Done                                 | Shown in status                                   |
| `254` | RPL_LUSERCHANNELS    | Done                                 | Shown in status                                   |
| `255` | RPL_LUSERME          | Done                                 | Shown in status                                   |
| `265` | RPL_LOCALUSERS       | Done                                 | Shown in status                                   |
| `266` | RPL_GLOBALUSERS      | Done                                 | Shown in status                                   |
| `321` | RPL_LISTSTART        | Done                                 | No-op                                             |
| `322` | RPL_LIST             | Done                                 | Queued + batched to prevent UI blocking            |
| `323` | RPL_LISTEND          | Done                                 | Flushes buffer, clears loading state               |
| `332` | RPL_TOPIC            | Done                                 | Sets channel topic in store                        |
| `333` | RPL_TOPICWHOTIME     | Done                                 | Shows who set the topic and when                   |
| `353` | RPL_NAMREPLY         | Done                                 | Populates channel user list                        |
| `366` | RPL_ENDOFNAMES       | Done                                 | No-op (users already accumulated)                  |
| `372` | RPL_MOTD             | Done                                 | Stripped `- ` prefix, preserves ASCII art           |
| `375` | RPL_MOTDSTART        | Done                                 | Stripped `- ` prefix                               |
| `376` | RPL_ENDOFMOTD        | Done                                 | Triggers delayed LIST request + periodic refresh   |
| `401` | ERR_NOSUCHNICK       | Done                                 | Marks DM user as offline; warning on last message  |
| `422` | ERR_NOMOTD           | Done                                 | Same as 376 (triggers LIST)                        |
| `432` | ERR_ERRONEUSNICKNAME | Done                                 | During registration: fallback nick; post: revert   |
| `433` | ERR_NICKNAMEINUSE    | Done                                 | During registration: fallback nick; post: revert   |
| `436` | ERR_NICKCOLLISION    | Done                                 | During registration: fallback nick; post: revert   |
| `442` | ERR_NOTONCHANNEL     | Done                                 | Silently closes the channel in the UI              |
| Other | Unhandled numerics   | Shown as `[code] trailing` in status |                                                    |

## Implementation Notes

### LIST Performance

Large servers like Example Network return 6000+ channels. To prevent UI blocking:

- **Message queuing**: Only RPL_LIST (322) messages are queued; all other commands are processed immediately.
- **Time-boxed drain**: Queued messages are processed in batches of ~8ms per animation frame.
- **Store batching**: Channels are buffered (500 per batch or 500ms timer) before flushing to reactive state.
- **Deferred computed**: The `allAvailableChannels` computed returns `[]` during loading and only recomputes once loading finishes.
- **Render limit**: Only 200 channels are rendered in the sidebar (configurable in `config.ts`).

### LIST Timing

- Default delay after connecting: 5 seconds (configurable per server in settings).
- Auto-detection: If the server sends a NOTICE about LIST wait time (e.g., Example's "wait 15s"), the delay is updated automatically.
- Periodic refresh: Every 300 seconds by default (configurable per server).
- Guards: Refresh is blocked if LIST is already loading or minimum wait time hasn't elapsed.

### Reconnection

- Socket `onclose`/`onerror` handlers are detached before `socket.close()` to prevent the old socket's close event from interfering with a new connection.
- mIRC detection, LIST wait overrides, connection timestamps, and loading state are all cleaned up on disconnect.
