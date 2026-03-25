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

| Command         | Description                    | Status | Notes                                           |
| --------------- | ------------------------------ | ------ | ----------------------------------------------- |
| `PASS`          | Set connection password        | —      |                                                 |
| `NICK`          | Set/change nickname            | Done   | Sent on connect; no runtime nick change support |
| `USER`          | Register username and realname | Done   | Sent on connect                                 |
| `QUIT`          | Disconnect from server         | Done   | Sent on disconnect with default message         |
| `PING` / `PONG` | Keep-alive                     | Done   | Auto PONG response in service layer             |

## Channel Operations

| Command  | Description              | Status  | Notes                                                  |
| -------- | ------------------------ | ------- | ------------------------------------------------------ |
| `JOIN`   | Join a channel           | Done    | Via UI input; auto-selects joined channel              |
| `PART`   | Leave a channel          | Partial | Handler exists but no UI to trigger it                 |
| `LIST`   | List available channels  | Done    | Auto-requested on connect; results stored in store     |
| `TOPIC`  | Get/set channel topic    | Partial | Receives topic (332); no UI to set topic               |
| `NAMES`  | List users in a channel  | Partial | Handled via 353/366 replies; no explicit NAMES command |
| `INVITE` | Invite user to a channel | —       |                                                        |
| `KICK`   | Kick user from a channel | —       |                                                        |

## Sending Messages

| Command   | Description                          | Status | Notes                           |
| --------- | ------------------------------------ | ------ | ------------------------------- |
| `PRIVMSG` | Send message to channel or user      | Done   | Channel messages via chat input |
| `NOTICE`  | Send notice (no auto-reply expected) | —      |                                 |

## Server Queries

| Command   | Description                       | Status  | Notes                                         |
| --------- | --------------------------------- | ------- | --------------------------------------------- |
| `MOTD`    | Request Message of the Day        | Partial | Displayed via numeric replies (375, 372, 376) |
| `LUSERS`  | Request server/network user stats | —       | Numeric replies shown in status               |
| `VERSION` | Request server version            | —       |                                               |
| `STATS`   | Request server statistics         | —       |                                               |
| `LINKS`   | List servers in network           | —       |                                               |
| `TIME`    | Request server time               | —       |                                               |
| `INFO`    | Request server info               | —       |                                               |
| `ADMIN`   | Request admin info                | —       |                                               |

## User Queries

| Command    | Description                        | Status | Notes |
| ---------- | ---------------------------------- | ------ | ----- |
| `WHO`      | Query user information             | —      |       |
| `WHOIS`    | Query detailed user info           | —      |       |
| `WHOWAS`   | Query info about disconnected user | —      |       |
| `USERHOST` | Quick user host lookup             | —      |       |
| `ISON`     | Check if users are online          | —      |       |

## Channel Modes & Operator

| Command | Description                  | Status | Notes |
| ------- | ---------------------------- | ------ | ----- |
| `MODE`  | Set channel/user modes       | —      |       |
| `OPER`  | Authenticate as IRC operator | —      |       |

## Miscellaneous

| Command   | Description                         | Status | Notes |
| --------- | ----------------------------------- | ------ | ----- |
| `AWAY`    | Set/unset away status               | —      |       |
| `WALLOPS` | Send message to all operators       | —      |       |
| `KILL`    | Forcefully disconnect a user (oper) | —      |       |
| `REHASH`  | Reload server config (oper)         | —      |       |
| `RESTART` | Restart server (oper)               | —      |       |

## Numeric Replies Handled

| Code  | Name               | Status                               |
| ----- | ------------------ | ------------------------------------ |
| `321` | RPL_LISTSTART      | Done                                 |
| `322` | RPL_LIST           | Done                                 |
| `323` | RPL_LISTEND        | Done                                 |
| `332` | RPL_TOPIC          | Done                                 |
| `353` | RPL_NAMREPLY       | Done                                 |
| `366` | RPL_ENDOFNAMES     | Done                                 |
| `372` | RPL_MOTD           | Partial (shown as system message)    |
| `375` | RPL_MOTDSTART      | Partial (shown as system message)    |
| `376` | RPL_ENDOFMOTD      | Partial (shown as system message)    |
| Other | Unhandled numerics | Shown as `[code] trailing` in status |
