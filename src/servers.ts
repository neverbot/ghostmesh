// Server list — loaded as plugins from src/plugins/servers/.

import type { ServerConfig } from '@/types';

const modules = import.meta.glob<{ default: ServerConfig | ServerConfig[] }>(
  './plugins/servers/*.ts',
  { eager: true },
);

const SERVERS: ServerConfig[] = Object.values(modules)
  .flatMap((m) => (Array.isArray(m.default) ? m.default : [m.default]))
  .filter((s): s is ServerConfig => !!(s && s.id && s.name && s.host));

export default SERVERS;
