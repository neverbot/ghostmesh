// Server list — loaded as plugins from src/plugins/servers/.

const modules = import.meta.glob('../plugins/servers/*.js', { eager: true });

const SERVERS = Object.values(modules)
  .map((m) => m.default)
  .filter((s) => s && s.id && s.name && s.host);

export default SERVERS;
