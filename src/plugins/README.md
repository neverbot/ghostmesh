# Plugins

GhostMesh discovers servers, image hosting providers, upload providers, and CORS/image proxies as TypeScript plugins at build time. The public repo ships with **empty** plugin directories — concrete data lives outside the repo and is overlaid before build.

## Directory layout

```
src/plugins/
├── servers/             # ServerConfig entries
├── image-providers/     # ImageProvider entries (preview resolution)
├── upload-providers/    # UploadProvider entries (image uploads)
└── proxies/             # CorsProxy / ImageProxy entries
```

Each subdirectory is auto-discovered via Vite's `import.meta.glob('./*.ts')`. Drop a `.ts` file with a `default` export of the matching shape and it's picked up.

## Plugin shapes

See:

- `src/types.ts` — `ServerConfig`
- `src/services/image-providers.ts` — `ImageProvider`
- `src/services/upload-providers.ts` — `UploadProviderPlugin`, `PrivateUploadProvider`
- `src/services/proxy-services.ts` — `CorsProxy`, `ImageProxy`

## Adding plugins

Create a `.ts` file under the relevant subdirectory:

```ts
// src/plugins/servers/my-network.ts
import type { ServerConfig } from '@/types';

const server: ServerConfig = {
  id: 'my-network',
  name: 'My Network',
  host: 'wss://irc.example.com/webirc',
};

export default server;
```

Plugin files are git-ignored by default (see `.gitignore`). To track yours in this repo, either commit them explicitly with `git add -f` or maintain them in a separate overlay directory and copy them in before build.

## Empty-plugins behavior

With no plugins installed:

- **No servers** — the server list is empty; users must add a connection manually via the UI.
- **No image providers** — URLs are linkified but image previews are skipped.
- **No upload providers** — the upload button is disabled.
- **No proxies** — image fetches go direct; CORS-blocked sources fail gracefully.
