# GhostMesh

A multi-server IRC client for the web. Connect to multiple IRC networks simultaneously, chat across channels and private messages, and manage everything from a single interface.

## Features

- **Multi-server connections** — Connect to several IRC networks at the same time and switch between them seamlessly.
- **Unified channel list** — Browse channels from all connected servers in one place, with filtering by name, server, and minimum users.
- **Private messages** — Open direct conversations with other users, with online/offline status tracking.
- **Image previews** — Automatic link detection and image previews for common hosting services (ExampleImg, ExampleImg, ExampleUp, and more).
- **mIRC formatting** — Renders bold, italic, underline, colors, and other mIRC formatting codes with auto-detection.
- **Per-server settings** — Configure nickname, username, connection timing, and display preferences independently for each server.
- **User management** — Block users or hide their image previews on a per-server basis.
- **Session persistence** — Reconnects to your servers and channels automatically when you reload the page.
- **WebSocket proxy** — Built-in proxy service to connect to IRC servers that only support traditional TCP connections.
- **Responsive UI** — Collapsible sidebars, keyboard-friendly input, and a clean three-panel layout.

## Architecture

GhostMesh is organized as a monorepo:

```
ghostmesh/
├── frontend/       Vue 3 single-page application (the IRC client UI)
├── proxy-wss/      WebSocket-to-TCP proxy for legacy IRC servers
├── docs/           Project documentation
└── docker-compose.yml
```

### Frontend

The web client is built with Vue 3, Pinia, Vue Router, TypeScript, and Tailwind CSS. It connects to IRC servers via WebSocket — either directly (for servers that support it) or through the proxy service.

### Proxy

A lightweight Node.js service that bridges WebSocket connections from the browser to traditional TCP IRC servers. Includes token-based authentication, connection limits, Prometheus metrics, and structured logging.

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 22 or later
- npm

### Running locally

**Frontend:**

```bash
cd frontend
npm install
npm run dev
```

The client will be available at `http://localhost:5173/`.

**Proxy (only needed for TCP-only IRC servers):**

```bash
cd proxy-wss
npm install
PROXY_SECRET=your-secret-here npm run dev
```

The proxy will listen on `http://localhost:8080/`.

### Running with Docker Compose

```bash
docker compose up
```

This starts both the frontend and the proxy service together.

### Building for production

```bash
cd frontend
npm run build
```

The output will be in `frontend/dist/`.

```bash
cd proxy-wss
npm run build
npm start
```

## Tested IRC networks

| Network | Connection |
|---------|-----------|
| [Example Network](https://example.invalid/) | Direct WebSocket |
| [Example Network](https://example.invalid/) | Direct WebSocket |
| [Example Network](https://www.example.invalid/) | Direct WebSocket |
| [example](https://www.example.es/) | Via proxy (TCP) |
| [Example Network](https://www.example.org/) | Via proxy (TCP) |

## License

[MIT](LICENSE)
