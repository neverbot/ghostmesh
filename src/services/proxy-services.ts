// CORS and image proxy services — loaded as plugins from src/plugins/proxies/.

interface CorsProxy {
  type: 'cors';
  name: string;
  buildUrl: (url: string) => string;
}

interface ImageProxy {
  type: 'image';
  name: string;
  buildUrl: (url: string) => string;
}

type ProxyPlugin = CorsProxy | ImageProxy;

const modules = import.meta.glob<{ default: ProxyPlugin }>(
  '../plugins/proxies/*.ts',
  { eager: true },
);

const proxies: ProxyPlugin[] = Object.values(modules)
  .map((m) => m.default)
  .filter((p): p is ProxyPlugin => !!p?.name && !!p.buildUrl);

const corsProxies = proxies.filter((p): p is CorsProxy => p.type === 'cors');
const imageProxy: ImageProxy | null =
  (proxies.find((p): p is ImageProxy => p.type === 'image') as ImageProxy) || null;

const disabled = new Set<string>();

async function fetchWithProxy(url: string): Promise<Response> {
  if (corsProxies.length === 0) return fetch(url);
  let lastError: Error | undefined;
  for (const p of corsProxies) {
    if (disabled.has(p.name)) continue;
    try {
      const resp: Response = await fetch(p.buildUrl(url));
      // fetch() only throws on network-level errors. HTTP non-2xx (500, 502, 522,
      // rate limits, etc.) come back as a Response with ok=false. Treat those as
      // a proxy failure so we try the next one. Don't permanently disable on
      // HTTP errors — they tend to recover quickly.
      if (resp.ok) return resp;
      lastError = new Error(`${p.name}: HTTP ${resp.status}`);
    } catch (e) {
      // Network-level failure (DNS, connection refused). Likely persistent for
      // this session — skip this proxy on subsequent calls.
      lastError = e as Error;
      disabled.add(p.name);
    }
  }
  throw lastError || new Error('All CORS proxies failed');
}

function corsProxyUrl(url: string): string {
  const p = corsProxies.find((p) => !disabled.has(p.name));
  return p ? p.buildUrl(url) : url;
}

function imageProxyUrl(url: string): string {
  return imageProxy ? imageProxy.buildUrl(url) : url;
}

function hasImageProxy(): boolean {
  return imageProxy !== null;
}

export type { CorsProxy, ImageProxy, ProxyPlugin };
export {
  fetchWithProxy,
  corsProxyUrl,
  imageProxyUrl,
  hasImageProxy,
  corsProxies,
  imageProxy,
};
