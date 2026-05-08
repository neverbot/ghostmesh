# Frontend Architecture

## Overview

Vue 3 + Pinia IRC client with full TypeScript, Tailwind CSS v4, vue-i18n, and WebSocket-based IRC protocol handling. The architecture follows a clean **service-store-component** separation:

- **Services**: Protocol logic, API calls, formatting — no UI rendering
- **Stores** (Pinia): Pure state, getters, mutations — no business logic
- **Components**: Vue SFCs with `<script setup lang="ts">`, read from stores, call store actions

**22 Vue components, 4 Pinia stores, 6+ services.**

---

## Component Tree

```
App.vue
├── GlobalTooltip.vue (singleton, event delegation on document)
└── AppLayout.vue
    ├── SidebarLeft.vue
    │   ├── UserProfile.vue
    │   ├── ServerTree.vue (wrapper)
    │   │   ├── ServerList.vue
    │   │   ├── ChannelList.vue
    │   │   └── ServerSettingsModal.vue
    │   └── UserSettingsModal.vue
    ├── ChatPanel.vue
    │   ├── ChatHeader.vue
    │   ├── MessageList.vue
    │   │   ├── MessageItem.vue (v-for, per message)
    │   │   ├── UserContextMenu.vue
    │   │   └── ForwardMenu.vue
    │   └── MessageInput.vue
    │       ├── CommandAutocomplete.vue
    │       └── EmojiPicker.vue
    └── SidebarRight.vue
        ├── ChannelInfo.vue
        │   └── UserContextMenu.vue
        └── UserList.vue
            └── UserContextMenu.vue
```

---

## Components

### App.vue

|                     |                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| **Path**            | `src/App.vue` (31 lines)                                                                        |
| **Purpose**         | Root component, session restore, beforeunload guard, global tooltip host                        |
| **Stores**          | `useIrcStore()`                                                                                 |
| **Refs**            | —                                                                                               |
| **Computed**        | —                                                                                               |
| **Watchers**        | —                                                                                               |
| **Timers**          | —                                                                                               |
| **Observers**       | —                                                                                               |
| **Event listeners** | `window.addEventListener('beforeunload')` — cleaned in `onUnmounted`                            |
| **Lifecycle**       | `onMounted`: adds beforeunload, calls `store.restoreSession()`. `onUnmounted`: removes listener |
| **Template**        | `<router-view />`, `<GlobalTooltip />`                                                          |

---

### AppLayout.vue

|                     |                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| **Path**            | `src/components/layout/AppLayout.vue` (81 lines)                                                        |
| **Purpose**         | Three-panel layout with collapsible sidebars                                                            |
| **Stores**          | `useIrcStore()`                                                                                         |
| **Refs**            | `leftCollapsed`, `rightCollapsed`                                                                       |
| **Computed**        | —                                                                                                       |
| **Watchers**        | —                                                                                                       |
| **Timers**          | —                                                                                                       |
| **Observers**       | —                                                                                                       |
| **Event listeners** | —                                                                                                       |
| **Lifecycle**       | `onBeforeUnmount`: calls `store.cleanup()`                                                              |
| **Template**        | SidebarLeft `v-show`, ChatPanel `flex-1`, SidebarRight `v-if && v-show`. Collapse toggles absolute z-10 |

---

### SidebarLeft.vue

|               |                                                                  |
| ------------- | ---------------------------------------------------------------- |
| **Path**      | `src/components/sidebar/SidebarLeft.vue` (62 lines)              |
| **Purpose**   | Left sidebar: logo, user profile, server tree, language toggle   |
| **Stores**    | —                                                                |
| **Refs**      | `userSettingsOpen`                                               |
| **Computed**  | `currentLocale`                                                  |
| **Watchers**  | —                                                                |
| **Timers**    | —                                                                |
| **Observers** | —                                                                |
| **Template**  | UserProfile, ServerTree, locale toggle button, UserSettingsModal |

---

### UserProfile.vue

|              |                                                           |
| ------------ | --------------------------------------------------------- |
| **Path**     | `src/components/sidebar/UserProfile.vue` (91 lines)       |
| **Purpose**  | User avatar, nickname, connection status                  |
| **Stores**   | `useIrcStore()`, `useUserSettingsStore()`                 |
| **Refs**     | —                                                         |
| **Computed** | `displayNick`, `initial`, `avatarColor`, `statusText`     |
| **Emits**    | `open-settings`                                           |
| **Template** | Clickable card with avatar (HSL hash color), nick, status |

---

### ServerTree.vue (wrapper)

| | |
|---|---|
| **Path** | `src/components/sidebar/ServerTree.vue` (~70 lines) |
| **Purpose** | Thin wrapper composing ServerList + ChannelList + settings modal + error popup |
| **Stores** | `useIrcStore()` |
| **Refs** | `settingsModalOpen`, `settingsServerId`, `settingsServerName`, `settingsInitialTab` |
| **Watchers** | `openSettingsRequest` (external settings open) |
| **Key functions** | `openSettings()` |
| **Template** | ServerList, divider, ChannelList, ServerSettingsModal, connection error Teleport |

---

### ServerList.vue

| | |
|---|---|
| **Path** | `src/components/sidebar/ServerList.vue` (~170 lines) |
| **Purpose** | Collapsible server list with connect/disconnect, settings gear |
| **Stores** | `useIrcStore()` |
| **Refs** | `collapsed` |
| **Computed** | `sortedServers` (connected first) |
| **Watchers** | `connectedServers.length` (auto-collapse on connect, expand when all disconnect) |
| **Emits** | `open-settings` |
| **Template** | Collapsible list with status dot/spinner, server name + host, settings gear, disconnect/clear button. CSS transition `max-h-0`/`max-h-12` for collapse animation |

---

### ChannelList.vue

| | |
|---|---|
| **Path** | `src/components/sidebar/ChannelList.vue` (~350 lines) |
| **Purpose** | Joined channels, available channel browser, filters, join input |
| **Stores** | `useIrcStore()` |
| **Refs** | `collapsed`, `showFilters`, `channelFilterInput`, `joinInput`, `badgeCache` |
| **Computed** | `isWaitingForList` |
| **Timers** | `setInterval(updateBadgeCache, 3000)` — throttled badge snapshot, cleared `onUnmounted` |
| **i18n**          | Pre-computed i18n strings (`I18N_STATUS`, `I18N_CLOSE`, `I18N_LEAVE`) for v-for usage |
| **Key functions** | `updateBadgeCache()`, `getBadge()`, `handleJoin()`, `serverAbbr()`, `resetFilters()`, `limitedAvailable()` |
| **Template** | Collapsible with spinner/filter buttons. Filter panel (text, server, min users, sort). Joined channels (badges, user count, server badge, leave). Separator. Available channels (capped at `browseLimit`). Join input at bottom |

---

### ChatPanel.vue

|                   |                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------- |
| **Path**          | `src/components/chat/ChatPanel.vue` (75 lines)                                     |
| **Purpose**       | Chat container with drag-and-drop image upload                                     |
| **Stores**        | `useIrcStore()`                                                                    |
| **Refs**          | `messageInputRef`, `isDragging`                                                    |
| **Key functions** | `onDragOver()`, `onDragLeave()` (boundary math), `onDrop()`                        |
| **Emits**         | — (delegates to store)                                                             |
| **Template**      | ChatHeader, MessageList (`flex-1`), MessageInput. Drop overlay `v-if="isDragging"` |

---

### ChatHeader.vue

|              |                                                                                |
| ------------ | ------------------------------------------------------------------------------ |
| **Path**     | `src/components/chat/ChatHeader.vue` (54 lines)                                |
| **Purpose**  | Channel name, server name, user count, topic display                           |
| **Stores**   | `useIrcStore()`                                                                |
| **Computed** | `title`, `subtitle`, `userCount`                                               |
| **Template** | Channel name + server name. User count badge `v-if > 0 && !status`. Topic text |

---

### MessageList.vue

|                        |                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Path**               | `src/components/chat/MessageList.vue` (594 lines)                                                                                                                                                                                                                                                                                                                                                                |
| **Purpose**            | Message display with grouping, auto-scroll, context menus, forward                                                                                                                                                                                                                                                                                                                                               |
| **Stores**             | `useIrcStore()`, `useUserPrefsStore()`                                                                                                                                                                                                                                                                                                                                                                           |
| **Refs**               | `scrollContainer`, `showScrollBtn`, `menuOpen/Nick/Mode/ServerId/X/Y`, `forwardOpen/Content/X/Y`                                                                                                                                                                                                                                                                                                                 |
| **Computed**           | `selectedKey` (`serverId:channel`), `messageKeys`                                                                                                                                                                                                                                                                                                                                                                |
| **Non-reactive state** | `autoScroll`, `suppressMarkRead`, `lastScrollHeight`, `scrollCheckTimer`, `groupCache` (manual)                                                                                                                                                                                                                                                                                                                  |
| **Watchers**           | `currentMessages.length` (auto-scroll), `selectedKey` (save/restore scroll position)                                                                                                                                                                                                                                                                                                                             |
| **Timers**             | `setTimeout` 50ms (debounced scroll height check), `setTimeout` 200ms (suppress mark-read on channel switch)                                                                                                                                                                                                                                                                                                     |
| **i18n**               | All `$t()` calls pre-computed as constants (`I18N` object) to avoid reactive calls inside v-for                                                                                                                                                                                                                                                                                                                  |
| **Observers**          | **MutationObserver** scoped to active channel div only `{ childList: true }` (no subtree, no characterData) — cleaned `onUnmounted`                                                                                                                                                                                                                                                                              |
| **Event listeners**    | `load` (capture, images), `scroll` (passive), `wheel` (passive), `touchstart` (passive), `animationend` (capture, preview-appear), `click` (delegated `[data-action]`) — all cleaned `onUnmounted`                                                                                                                                                                                                               |
| **Key functions**      | `buildGroups()` groups consecutive same-user messages within `groupingInterval`. `getGroups(key)` uses manual cache (invalidates on length change). `isNearBottom()`, `doScroll()`, `onUserScroll()` (rAF), `checkScrollHeightChange()` (debounced), `onAnimationEnd()` (debounced with 100ms timer to avoid repeated smooth scrolls)                                                                             |
| **Cleanup**            | Watch on `messageKeys` cleans up `groupCache`, `scrollPositions`, `channelDivs` when channels are removed                                                                                                                                                                                                                                                                                                        |
| **Template**           | Empty state `v-if`. `v-for key in messageKeys` with **`v-show="key === selectedKey"`** (keeps all channels in DOM). Forward hover group on full-width row div. Nested `v-for group in getGroups(key)` → `v-for msg in group.messages`. System messages standalone, user messages in grouped bubble. Avatar + nick (clickable). Timestamp + forward button on hover (`data-tooltip`). Scroll-to-bottom button. UserContextMenu + ForwardMenu |

---

### MessageItem.vue

|               |                                                                                                                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Path**      | `src/components/chat/MessageItem.vue` (141 lines)                                                                                                                                            |
| **Purpose**   | Single message rendering with mIRC formatting and lazy image preview                                                                                                                         |
| **Stores**    | None (ZERO store subscriptions — removed useIrcStore, useServerSettingsStore, useUserPrefsStore)                                                                                              |
| **Props**     | `message: ChatMessage`, `active: boolean`, `mircEnabled: boolean`, `previewHidden: boolean`                                                                                                  |
| **Emits**     | `message-seen`                                                                                                                                                                               |
| **Refs**      | `messageEl`, `previewReady`                                                                                                                                                                  |
| **Computed**  | `isOwn`, `isSystem`, `timeString`, `useMirc` (uses `mircEnabled` prop), `canResolveImages` (uses `previewHidden` prop), `renderedHtml`, `plainHtml`                                          |
| **Observers** | **IntersectionObserver** (rootMargin 200px) — only created when `active` prop is true; stopped when channel becomes inactive. On enter: extracts URLs, resolves image providers, checks cache, sets `previewReady`, emits `message-seen`, disconnects. Cleaned `onUnmounted` |
| **Template**  | System: monospace with time tooltip, `v-html`. User: content spans with `v-html` for formatted/plain                                                                                         |

---

### MessageInput.vue

|                   |                                                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Path**          | `src/components/chat/MessageInput.vue` (242 lines)                                                                |
| **Purpose**       | Text input, file upload, command autocomplete                                                                     |
| **Stores**        | `useIrcStore()`                                                                                                   |
| **Children**      | CommandAutocomplete, EmojiPicker                                                                                  |
| **Refs**          | `text`, `inputEl`, `fileInputEl`, `autocompleteRef`, `inputFocused`, `emojiPickerOpen`                            |
| **Computed**      | `isDisabled`, `isStatusChannel`                                                                                   |
| **Watchers**      | `selectedChannel` (auto-focus), `prefillMessage` (prefill from forward)                                           |
| **Emits**         | `send`, `upload`                                                                                                  |
| **Key functions** | `handleSend()`, `openFilePicker()`, `validateAndUpload()` (MIME + size check), `onEmojiSelect()`, keyboard handlers |
| **Exposed**       | `validateAndUpload` (for parent drag-drop)                                                                        |
| **Template**      | CommandAutocomplete, EmojiPicker, input with dynamic placeholder, hidden file input, emoji button (`data-emoji-trigger`, `data-tooltip`), attach button (`data-tooltip`), send button |

---

### CommandAutocomplete.vue

|              |                                                                    |
| ------------ | ------------------------------------------------------------------ |
| **Path**     | `src/components/chat/CommandAutocomplete.vue` (126 lines)          |
| **Purpose**  | Dropdown matching IRC commands as user types `/`                   |
| **Props**    | `input`, `focused`                                                 |
| **Emits**    | `select`                                                           |
| **Refs**     | `listEl`, `selectedIndex`                                          |
| **Computed** | `visible`, `typedPrefix`, `matches`                                |
| **Watchers** | `matches` (reset selection)                                        |
| **Exposed**  | `moveUp`, `moveDown`, `confirmSelection`, `visible`                |
| **Template** | `v-if visible`: dropdown with `v-for` commands, selected highlight |

---

### EmojiPicker.vue

|                     |                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| **Path**            | `src/components/chat/EmojiPicker.vue`                                                              |
| **Purpose**         | Categorized native system emoji picker                                                             |
| **Props**           | `open` (boolean)                                                                                   |
| **Emits**           | `select`, `close`                                                                                  |
| **Refs**            | `pickerEl`, `activeCategory`, `posX`, `posY`                                                       |
| **Categories**      | 9: Smileys, People, Animals, Food, Activities, Travel, Objects, Symbols, Flags                     |
| **Event listeners** | `document.mousedown` for click-outside close — cleaned `onUnmounted`                               |
| **Position**        | Calculated from trigger button via `data-emoji-trigger` attribute                                  |
| **Template**        | Teleport to body, fixed position `z-[100]`, category tabs, scrollable 8-column grid of native emoji |

---

### ForwardMenu.vue

|                     |                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------- |
| **Path**            | `src/components/chat/ForwardMenu.vue` (111 lines)                                     |
| **Purpose**         | Context menu to forward a message to another channel/DM                               |
| **Stores**          | `useIrcStore()`                                                                       |
| **Props**           | `content`, `x`, `y`, `open`                                                           |
| **Emits**           | `close`                                                                               |
| **Refs**            | `menuEl`                                                                              |
| **Computed**        | `destinations` (filtered joined channels, excluding current)                          |
| **Event listeners** | `document.mousedown` for click-outside — cleaned `onUnmounted`                        |
| **Template**        | Teleport to body. `v-if open`. `v-for` destinations with server badge if multi-server |

---

### SidebarRight.vue

|              |                                                           |
| ------------ | --------------------------------------------------------- |
| **Path**     | `src/components/panel/SidebarRight.vue` (14 lines)        |
| **Purpose**  | Right sidebar wrapper                                     |
| **Stores**   | `useIrcStore()`                                           |
| **Template** | ChannelInfo always. UserList `v-if` not DM and not status |

---

### ChannelInfo.vue

|              |                                                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **Path**     | `src/components/panel/ChannelInfo.vue` (152 lines)                                                                           |
| **Purpose**  | Channel/DM info: topic, member count, context menu                                                                           |
| **Stores**   | `useIrcStore()`                                                                                                              |
| **Refs**     | `menuOpen`, `menuX`, `menuY`                                                                                                 |
| **Computed** | `isPrivate`, `isSelfDM`, `channelName`, `serverName`, `memberCount`, `isOnline`                                              |
| **Template** | `v-if selectedChannel && !status`. DM: clickable avatar + online badge. Channel: name + topic. Member count. UserContextMenu |

---

### UserList.vue

|               |                                                                                                                            |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Path**      | `src/components/panel/UserList.vue` (198 lines)                                                                            |
| **Purpose**   | Channel member list with mode display, filtering, context menu                                                             |
| **Stores**    | `useIrcStore()`                                                                                                            |
| **Refs**      | `menuOpen/Nick/Mode/X/Y`, `showFilter`, `filterText`, `userFilterInput`                                                    |
| **Computed**  | `filteredUsers` (case-insensitive substring match)                                                                         |
| **Constants** | `MODE_PREFIX` (mode → IRC symbol), `MODE_DOT_COLOR` (mode → Tailwind color)                                                |
| **Template**  | Header with count + filter toggle. Filter input `v-if`. `v-for filteredUsers` with avatar, mode dot, nick. UserContextMenu |

---

### GlobalTooltip.vue

|                     |                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| **Path**            | `src/components/ui/GlobalTooltip.vue` (113 lines)                                                |
| **Purpose**         | Singleton tooltip — one instance for the entire app, uses event delegation on `document`         |
| **Refs**            | `visible`, `text`, `x`, `y`                                                                     |
| **Non-reactive**    | `timer` (setTimeout handle), `currentTarget` (HTMLElement)                                       |
| **Timers**          | `setTimeout(delay)` on pointer enter — cleared on pointer leave                                  |
| **Event listeners** | Single `pointermove` on `document` (throttled to 30ms), uses `closest('[data-tooltip]')` on pointer target — cleaned `onUnmounted` |
| **Template**        | Teleport to body → Transition → fixed tooltip div                                                |
| **Mounted in**      | `App.vue` — single instance                                                                     |

**Usage:** Any element with `data-tooltip="text"` gets a tooltip. Optional `data-tooltip-delay="ms"` for delayed show. No wrapper component needed.

**Performance:** Replaced the old per-instance `InfoTooltip.vue` wrapper. Previously up to 1000+ instances at runtime (inside `v-for` loops), each with 3 event listeners, a computed, and a Teleport. Now: exactly 3 event listeners total for the entire app.

---

### UserContextMenu.vue

|               |                                                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Path**      | `src/components/ui/UserContextMenu.vue` (213 lines)                                                                                        |
| **Purpose**   | User context menu: open DM, hide previews, block user, role badge                                                                          |
| **Stores**    | `useUserPrefsStore()`, `useIrcStore()`                                                                                                     |
| **Props**     | `nick`, `mode`, `serverId`, `x`, `y`, `open`                                                                                               |
| **Emits**     | `close`, `open-dm`                                                                                                                         |
| **Refs**      | `menuEl`, `posX`, `posY`                                                                                                                   |
| **Computed**  | `isSelf`                                                                                                                                   |
| **Constants** | `MODE_LABEL`, `MODE_BADGE_COLOR`                                                                                                           |
| **Watchers**  | `open` (clamp menu to viewport on open)                                                                                                    |
| **Template**  | Teleport to body. `v-if open`: backdrop + fixed menu. Header with nick + mode badge. Actions: open conversation, hide previews, block user |

---

### UserSettingsModal.vue

|              |                                                                                                                                                                                                                                   |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Path**     | `src/components/ui/UserSettingsModal.vue` (429 lines)                                                                                                                                                                             |
| **Purpose**  | Global settings: profile, language, identity, upload providers                                                                                                                                                                    |
| **Stores**   | `useUserSettingsStore()`, `useServerSettingsStore()`, `useUserPrefsStore()`, `useIrcStore()`                                                                                                                                      |
| **Refs**     | `backdrop`, `activeTab`, `form`, `confirmForget`                                                                                                                                                                                  |
| **Computed** | `globalTabs`                                                                                                                                                                                                                      |
| **Watchers** | `open` (load form, focus backdrop)                                                                                                                                                                                                |
| **Template** | Teleport to body. `v-if open`. Tabs: profile (language, nick, username, realname, avatar color), general (clearOnClose), identity (NickServ, disabled), image uploads (`v-for` privateProviders). Footer: forget me + save/cancel |

---

### ServerSettingsModal.vue

|              |                                                                                                                                                                                                                                                                        |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Path**     | `src/components/ui/ServerSettingsModal.vue` (566 lines)                                                                                                                                                                                                                |
| **Purpose**  | Per-server settings: LIST delay, keepalive, mIRC, identity, filters, blocked                                                                                                                                                                                           |
| **Stores**   | `useServerSettingsStore()`, `useIrcStore()`, `useUserPrefsStore()`                                                                                                                                                                                                     |
| **Props**    | `serverId`, `serverName`, `open`, `initialTab`                                                                                                                                                                                                                         |
| **Emits**    | `close`                                                                                                                                                                                                                                                                |
| **Refs**     | `backdrop`, `activeTab`, `form`, `newFilter`, `confirmServerForget`                                                                                                                                                                                                    |
| **Computed** | `serverTabs`, `mircStatus`                                                                                                                                                                                                                                             |
| **Watchers** | `open` (load form), `listDelay` setting (live update)                                                                                                                                                                                                                  |
| **Template** | Teleport to body. `v-if open`. Tabs: user (nick/username/realname overrides), general (LIST, keepalive, reconnect), formatting (mIRC), filtered (message patterns), blocked (hidden previews, blocked users with restore/unblock). Footer: forget server + save/cancel |

---

## Stores

### irc.ts (main store)

|             |                                                                          |
| ----------- | ------------------------------------------------------------------------ |
| **Path**    | `src/stores/irc.ts` (~600 lines)                                         |
| **Purpose** | All IRC state: connections, channels, messages, users, topics, DM status |

**Reactive state:**

| Variable                | Type                                                     | Notes                             |
| ----------------------- | -------------------------------------------------------- | --------------------------------- |
| `servers`               | `Ref<ServerConfig[]>`                                    | Loaded from `defaultServers`      |
| `activeConnections`     | `Ref<string[]>`                                          | Connected server IDs              |
| `statusRetainedServers` | `Ref<string[]>`                                          | Disconnected servers with *status |
| `connectingServers`     | `Ref<string[]>`                                          | Servers mid-connect               |
| `selectedServerId`      | `Ref<string \| null>`                                    |                                   |
| `selectedChannel`       | `Ref<string \| null>`                                    |                                   |
| `nickname`              | `Ref<string>`                                            | Global confirmed nick             |
| `nicknamePerServer`     | `Ref<Record<string, string>>`                            | Per-server nicks                  |
| `dmOnline`              | `Ref<Record<string, boolean>>`                           | DM user online status             |
| `lastReadTimestamp`     | `Ref<Record<string, number>>`                            | Per-channel read watermark        |
| `channels`              | `Ref<Record<string, string[]>>`                          | Joined channels per server        |
| `messages`              | **`ShallowRef`**`<Record<string, ChatMessage[]>>`        | Per-channel history (perf, requires `triggerRef`) |
| `unreadCounts`          | `Ref<Record<string, number>>`                            | Incremental counter, updated in addMessage, reset in markReadUpTo |
| `topics`                | `Ref<Record<string, string>>`                            | Per-channel topics                |
| `listLoadingServers`    | `Ref<string[]>`                                          | Servers loading LIST              |
| `listWaitingServers`    | `Ref<string[]>`                                          | Servers waiting for initial LIST delay |
| `availableChannels`     | **`ShallowRef`**`<Record<string, AvailableChannel[]>>`   | LIST results (perf)               |
| `users`                 | **`ShallowRef`**`<Record<string, ChannelUser[]>>`        | Per-channel users (perf)          |
| `prefillMessage`        | `Ref<string>`                                            | Forward prefill                   |
| `openSettingsRequest`   | `Ref<OpenSettingsRequest \| null>`                       | External settings open            |
| `connectionError`       | `Ref<string>`                                            | Error banner                      |
| Filter state            | `filterServer`, `filterMinUsers`, `filterText`, `sortBy` | Channel browser filters           |

**Computed getters:**

| Getter                 | Notes                                                    |
| ---------------------- | -------------------------------------------------------- |
| `connectedServers`     | Servers with active connections                          |
| `disconnectedServers`  | Servers without active connections                       |
| `selectedServer`       | Found by ID                                              |
| `currentMessages`      | Messages for selected channel                            |
| `currentUsers`         | Sorted by mode priority, then alpha, own nick first      |
| `currentTopic`         | Topic for selected channel                               |
| `allJoinedChannels`    | Across all servers (channels first, DMs second)          |
| `joinedSet`            | `Set<string>` for O(1) lookup                            |
| `isListWaiting`        | True when any server is waiting for initial LIST delay   |
| `allAvailableChannels` | **Expensive**: filtered, sorted, capped at `browseLimit`. Skips only the specific loading server's channels, keeping other servers' channels visible |
| `totalAvailableCount`  | Unfiltered count. Skips only the loading server, not all servers |

**Key methods:** `connectToServer()`, `disconnectFromServer()`, `joinChannel()`, `partChannel()`, `selectChannel()`, `openDM()`, `sendMessage()`, `uploadAndSend()`, `changeNick()`, `changeNickGlobal()`, `refreshChannelList()`, `setListWaiting()`, `clearListWaiting()`, `unreadCount()` (O(1) lookup via `unreadCounts`), `addSystemMessage()` (skips mirroring to active channel during reconnection via `connectingServers` check), `cleanup()`, `restoreSession()`, `markUnloading()`

**Service interaction:** Lazy-initializes `IRCService` with store API subset. Service calls back for state mutations.

---

### server-settings.ts

|             |                                                   |
| ----------- | ------------------------------------------------- |
| **Path**    | `src/stores/server-settings.ts` (127 lines)       |
| **Purpose** | Per-server settings with localStorage persistence |

**State:** `settings: Ref<Record<string, Partial<ServerSettingsEntry>>>` — loaded from localStorage

**Watchers:** `watch(settings, { deep: true })` → auto-save to localStorage

**Methods:** `getSettings()`, `updateSettings()`, `getListDelay()`, `isMircEnabled()`, `markMircDetected()`, `isMessageFiltered()`, `clearAll()`

**Type:** `ServerSettingsEntry extends ServerDefaults { listDelayManual?, mircDetected?, filteredMessages? }`

---

### user-settings.ts

|             |                                                   |
| ----------- | ------------------------------------------------- |
| **Path**    | `src/stores/user-settings.ts` (144 lines)         |
| **Purpose** | Global user profile with localStorage persistence |

**State:** `settings: Ref<UserProfile>` — loaded from localStorage

**Watchers:** `watch(settings, { deep: true })` → auto-save

**Methods:** `getProfile()`, `updateProfile()`, `resolveNick()`, `resolveUsername()`, `resolveRealname()`, `clearAll()`

**Type:** `UserProfile { nickname, username, realname, avatarColor, locale?, uploadProviderKeys?, globalPrefs? }`

---

### user-prefs.ts

|             |                                                   |
| ----------- | ------------------------------------------------- |
| **Path**    | `src/stores/user-prefs.ts` (202 lines)            |
| **Purpose** | Hidden previews and blocked users with 24h expiry |

**State:** `hiddenPreviews: Ref<UserPrefEntry[]>`, `blockedUsers: Ref<UserPrefEntry[]>`

**Watchers:** `watch([hiddenPreviews, blockedUsers], { deep: true })` → auto-save

**Methods:** `isPreviewHidden()`, `togglePreviewHidden()`, `isUserBlocked()`, `toggleUserBlocked()`, `blockedUsersForServer()`, `hiddenPreviewsForServer()`, `clearBlockedUsers()`, `clearHiddenPreviews()`, `clearAll()`

**Auto-cleanup:** Purges entries older than 24h when adding new entries.

---

## Services

### irc.service.ts

|             |                                                                      |
| ----------- | -------------------------------------------------------------------- |
| **Path**    | `src/services/irc.service.ts` (large)                                |
| **Purpose** | IRC protocol: WebSocket management, message parsing, command routing |

**Instance state (Maps/Sets):**
- `connections: Map<string, IRCConnection>` — WebSocket per server
- `listTimers: Map<string, setInterval>` — LIST refresh per server
- `initialListTimers: Map<string, setTimeout>` — initial LIST delay
- `listWaitOverrides: Record<string, number>` — detected LIST delay
- `connectedAt: Record<string, number>` — connection timestamp
- `listLoading: Set<string>` — servers currently LIST-ing
- `listTimeouts: Map<string, setTimeout>` — LIST completion timeout
- `mircDetected: Set<string>` — servers with mIRC formatting
- `registered: Set<string>` — servers that completed registration
- `keepaliveTimers: Map<string, setInterval>` — PING timers
- `lastActivity: Map<string, number>` — last message per server
- `serverConfigs: Map<string, ServerConfig>` — for reconnection
- `reconnectAttempts: Map<string, number>`
- `reconnectTimers: Map<string, setTimeout>`
- `messageQueue: ParsedMessage[]` — queued LIST (322) messages
- `drainFrame: number | null` — rAF for queue drain

**Timers per server:**

| Timer              | Interval                     | Purpose                              |
| ------------------ | ---------------------------- | ------------------------------------ |
| keepalive          | `keepaliveInterval` (60s)    | Send PING, detect dead connections   |
| LIST refresh       | `listRefreshInterval` (300s) | Periodic channel list refresh        |
| LIST initial delay | `listDelay` (5s)             | Wait before first LIST after connect |
| LIST timeout       | `listTimeout` (30s)          | Clear loading if LIST hangs          |
| Reconnect          | Exponential backoff          | Auto-reconnect on disconnect         |

All timers tracked in Maps, cleaned on `cleanupConnection()`.

**Multi-server nickname handling:** JOIN and PART handlers use the per-server nickname (`connection.config.nickname`) instead of the global `s.nickname` to identify own messages. This is required because different servers may assign different nicknames.

**Message queue:** LIST (322) replies queued and drained via `requestAnimationFrame` to avoid UI blocking.

---

### message.service.ts

|             |                                                                 |
| ----------- | --------------------------------------------------------------- |
| **Path**    | `src/services/message.service.ts` (~250 lines)                  |
| **Purpose** | Message formatting, URL detection, linkification, image preview |

**Key functions:** `formatPlainContent()`, `formatHtmlContent()`, `handleImageError()` (fallback chain: original → image proxy plugin → hide; clears `img.onload`/`img.onerror` before reassigning to prevent closure accumulation), `resolveAsyncImage()` (uses `setTimeout(0)` instead of `requestAnimationFrame`, with DOM existence check before resolving), `isImageUrl()`, `normalizeUrl()`, `trackFailedPreview()`

**State:** `failedPreviews: Set<string>` — capped at 500 entries with FIFO eviction via `trackFailedPreview()`

**Global:** `window.__ghostmeshImageError` — exposed for inline `onerror` handlers in `v-html`

---

### image-cache.ts

|             |                                          |
| ----------- | ---------------------------------------- |
| **Path**    | `src/services/image-cache.ts` (73 lines) |
| **Purpose** | In-memory image URL cache with TTL       |

**State:** `cache: Map<string, { imageUrl, lastAccess }>`

**Timer:** `setInterval(cleanup, cacheCleanupInterval)` — **auto-started on module load, never stopped**

**Methods:** `get()`, `set()`, `has()`, `cleanup()`, `startCleanup()`, `stopCleanup()`

---

### upload-providers.ts

|             |                                                      |
| ----------- | ---------------------------------------------------- |
| **Path**    | `src/services/upload-providers.ts` (~200 lines)      |
| **Purpose** | Image upload via public/private providers with retry |

**Providers:** `publicProviders` (no API key needed) and `privateProviders` (require user-supplied API key) — both loaded from `src/plugins/upload-providers/`.

**State:** `disabledProviders: Set<string>` — failed providers disabled for session

**Key functions:** `uploadImage()`, `hasAvailableProvider()`, `randomFilename()`

---

### command-registry.ts

|             |                                                 |
| ----------- | ----------------------------------------------- |
| **Path**    | `src/services/command-registry.ts` (~200 lines) |
| **Purpose** | IRC slash command definitions and parsing       |

**Commands:** `/nick`, `/join` (`/j`), `/part` (`/leave`), `/msg` (`/privmsg`, `/pm`), `/query` (`/q`), `/quit` (`/disconnect`), `/topic`, `/mode`, `/help`, `/clear`, `/shrug`, `/tableflip`, `/unflip`

**Key functions:** `parseCommand()`, `getMatchingCommands()`, `findCommand()`, `executeCommand()`

---

## Other Files

| File                       | Purpose                                                                                                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/types.ts`             | Shared types: `UserMode`, `ChannelUser`, `AvailableChannel`, `ServerConfig`, `MessageType`, `ChatMessage`, `UserClickPayload`, `IrcStoreApi` (includes `setListWaiting()`, `clearListWaiting()`) |
| `src/config.ts`            | Global defaults: storage keys, IRC defaults, chat limits (1000 msgs, 10min grouping), LIST limits (200, 30s timeout), image cache (10min TTL, 5min cleanup), proxy URL, server defaults |
| `src/servers.ts`           | Default server list with per-server config: `urlTransform`, `blockedUploadProviders`, `defaultFilteredMessages`, `tcpHost/tcpPort/tcpTls`                                               |
| `src/i18n/index.ts`        | vue-i18n setup: `detectLocale()` (localStorage → navigator → 'en'), `setLocale()`, `AVAILABLE_LOCALES`                                                                                  |
| `src/i18n/locales/en.json` | English translations (172+ keys)                                                                                                                                                        |
| `src/i18n/locales/es.json` | Spanish translations                                                                                                                                                                    |
| `src/main.ts`              | App entry: creates Vue app, installs Pinia + Router + i18n, mounts                                                                                                                      |
| `src/utils/mirc-format.ts` | mIRC color/formatting parser                                                                                                                                                            |

---

## Reactive Patterns Summary

| Pattern         | Where                                        | Count   |
| --------------- | -------------------------------------------- | ------- |
| `ref<T>`        | All components and stores                    | ~50     |
| `shallowRef<T>` | `irc.ts` (`messages`, `availableChannels`, `users`) | 3       |
| `computed`      | Most components                              | ~30     |
| `watch`         | Components + all stores (deep, localStorage) | ~15     |
| `triggerRef()`  | `irc.ts` (manual shallowRef updates)         | Several |

---

## Timers and Observers

| Type                     | Location                                             | Lifecycle             |
| ------------------------ | ---------------------------------------------------- | --------------------- |
| `setInterval` 3s         | ChannelList (badge cache)                            | `onUnmounted` cleanup |
| `setInterval` 5min       | image-cache.ts (cleanup)                             | **Never stopped**     |
| `setInterval` per server | irc.service.ts (keepalive, LIST refresh)             | Cleanup on disconnect |
| `setTimeout` 50ms        | MessageList (scroll debounce)                        | Self-clearing         |
| `setTimeout` per server  | irc.service.ts (LIST delay, LIST timeout, reconnect) | Cleanup on disconnect |
| MutationObserver         | MessageList (active channel div, childList only)     | `onUnmounted` cleanup |
| IntersectionObserver     | MessageItem (lazy image preview, active channel only) | `onUnmounted` cleanup |

---

## Performance Considerations

### Tooltip system (resolved)

Previously used per-instance `InfoTooltip.vue` wrappers — 17 declared, up to 1000+ at runtime inside `v-for` loops. Each created 3 event listeners, a computed, and a Teleport. In a channel with 500 messages = 1500 event listeners just for forward tooltips.

**Resolved:** Replaced with singleton `GlobalTooltip.vue` using a single `pointermove` listener on `document` (throttled to 30ms). Uses `closest('[data-tooltip]')` on the pointer target instead of event delegation via capture phase. Elements use `data-tooltip` HTML attributes. Total listeners: 1 (for the entire app, regardless of tooltip count).

### MessageList v-show keeps all channels in DOM

All channel message containers are rendered with `v-show`, not `v-if`. This preserves scroll position and message state. Mitigated by:
- MutationObserver scoped to active channel div only (`{ childList: true }`, no subtree)
- IntersectionObserver in MessageItem only created when `active` prop is true; stopped when channel becomes inactive
- Memory grows with number of joined channels

### messages ShallowRef

`messages` in irc.ts is now a `ShallowRef` instead of a deep `Ref`. Mutations require explicit `triggerRef(messages)` calls, avoiding deep reactivity overhead on large message arrays.

### unreadCount O(1) lookup

`unreadCount()` uses an incremental `unreadCounts` counter (updated in `addMessage`, reset in `markReadUpTo`) instead of the previous O(n) backward scan through messages.

### i18n pre-computed strings

Components that use `$t()` inside `v-for` loops (MessageList, ChannelList) pre-compute i18n strings as constants (`I18N` object / `I18N_STATUS`, `I18N_CLOSE`, `I18N_LEAVE`) to avoid reactive translation calls on every render iteration.

### Forward hover on full-width row

Forward hover group is on the full-width row div instead of individual elements inside the bubble. No `fwd-row::before` pseudo-element needed.

### Image preview pipeline fixes

- `handleImageError()` clears `img.onload`/`img.onerror` before reassigning to prevent closure accumulation
- Async image resolution uses `setTimeout(0)` instead of `requestAnimationFrame`, with DOM existence check before resolving
- `failedPreviews` Set capped at 500 entries with FIFO eviction via `trackFailedPreview()`

### Expensive computed getters

- `allAvailableChannels` in irc.ts: merges, filters, sorts across all servers on every reactive change
- `renderedHtml` in MessageItem: re-parses mIRC formatting on every render
- `allJoinedChannels` in irc.ts: rebuilds array from multiple sources

### image-cache.ts global timer

The `setInterval` for cache cleanup starts on module import and is never stopped, even when the app unmounts.
