# GhostMesh

A multi-server IRC client for the web. Connect to multiple IRC networks simultaneously, chat across channels and private messages, and manage everything from a single interface.

## Features

- **Multi-server connections** — Connect to several IRC networks at the same time and switch between them seamlessly.
- **Unified channel list** — Browse channels from all connected servers in one place, with filtering by name, server, and minimum users.
- **Private messages** — Open direct conversations with other users, with online/offline status tracking.
- **Image previews** — Automatic link detection and inline image previews via a pluggable image-provider system.
- **mIRC formatting** — Renders bold, italic, underline, colors, and other mIRC formatting codes with auto-detection.
- **Per-server settings** — Configure nickname, username, connection timing, and display preferences independently for each server.
- **User management** — Block users or hide their image previews on a per-server basis.
- **Session persistence** — Reconnects to your servers and channels automatically when you reload the page.
- **Plugin system** — Servers, image providers, upload providers, and CORS/image proxies are all extensible via TypeScript plugins discovered at build time.
- **Responsive UI** — Collapsible sidebars, keyboard-friendly input, and a clean three-panel layout.

## Plugins

GhostMesh ships with **empty** plugin directories. To use it you need to add at least one server plugin (or add servers manually through the UI). See [`src/plugins/readme.md`](src/plugins/readme.md) for the plugin shapes and how to add your own.

To connect to IRC servers that don't expose a native WebSocket gateway you also need a separate WebSocket-to-TCP proxy and a `proxies/` plugin pointing at it. The proxy itself is not part of this repo.

## Tech stack

- Vue 3 (Composition API) with Vite 8
- Pinia for state, Vue Router 4
- TypeScript (strict mode)
- Tailwind CSS 4
- vue-i18n v9 (English + Spanish bundled)
- Native WebSocket for IRC transport

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 22 or later
- npm

### Running locally

```bash
npm install
npm run dev
```

The client will be available at `http://localhost:5174/`.

### Building for production

```bash
npm run build
```

The output will be in `dist/`.

### Other scripts

```bash
npm run preview      # serve the production build locally
npm run type-check   # vue-tsc strict type-check
npm run lint         # ESLint
npm run lint:fix     # ESLint with auto-fix
```

## License

[MIT](LICENSE)
