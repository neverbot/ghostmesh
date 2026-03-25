// Image hosting providers — loaded as plugins from src/plugins/image-providers/.

const modules = import.meta.glob('../plugins/image-providers/*.js', { eager: true });

const providers = Object.values(modules)
  .map((m) => m.default)
  .filter((p) => p && p.name && p.match);

function resolveImageProvider(url) {
  for (const p of providers) {
    if (p.match(url)) {
      const out = p.transform ? p.transform(url) : null;
      if (out) return { provider: p.name, imageUrl: out };
      return null;
    }
  }
  return null;
}

function isImageHostingUrl(url) {
  return providers.some((p) => p.match(url));
}

export { resolveImageProvider, isImageHostingUrl, providers };
