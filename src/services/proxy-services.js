// CORS and image proxy services — loaded as plugins from src/plugins/proxies/.

const modules = import.meta.glob('../plugins/proxies/*.js', { eager: true });

const proxies = Object.values(modules)
  .map((m) => m.default)
  .filter((p) => p && p.name && p.buildUrl);

const corsProxies = proxies.filter((p) => p.type === 'cors');
const imageProxy = proxies.find((p) => p.type === 'image') || null;

const disabled = new Set();

async function fetchWithProxy(url) {
  if (corsProxies.length === 0) return fetch(url);
  for (const p of corsProxies) {
    if (disabled.has(p.name)) continue;
    try {
      return await fetch(p.buildUrl(url));
    } catch (e) {
      disabled.add(p.name);
    }
  }
  throw new Error('All CORS proxies failed');
}

function corsProxyUrl(url) {
  const p = corsProxies.find((p) => !disabled.has(p.name));
  return p ? p.buildUrl(url) : url;
}

function imageProxyUrl(url) {
  return imageProxy ? imageProxy.buildUrl(url) : url;
}

export { fetchWithProxy, corsProxyUrl, imageProxyUrl, corsProxies, imageProxy };
