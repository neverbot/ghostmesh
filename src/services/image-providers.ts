// Image hosting providers — loaded as plugins from src/plugins/image-providers/.

interface ProxyHelpers {
  fetchWithProxy: (url: string) => Promise<Response>;
}

interface ImageProvider {
  name: string;
  match: (url: string) => boolean;
  transform: (url: string) => string | null;
  resolve?: (id: string, helpers: ProxyHelpers) => Promise<string | null>;
}

interface ImageProviderResult {
  provider: string;
  imageUrl: string;
}

const modules = import.meta.glob<{ default: ImageProvider }>(
  '../plugins/image-providers/*.ts',
  { eager: true },
);

const providers: ImageProvider[] = Object.values(modules)
  .map((m) => m.default)
  .filter((p): p is ImageProvider => !!p?.name && !!p.match && !!p.transform);

function resolveImageProvider(url: string): ImageProviderResult | null {
  for (const p of providers) {
    if (p.match(url)) {
      const out = p.transform(url);
      if (out) return { provider: p.name, imageUrl: out };
      return null;
    }
  }
  return null;
}

function isImageHostingUrl(url: string): boolean {
  return providers.some((p) => p.match(url));
}

export type { ImageProvider, ImageProviderResult, ProxyHelpers };
export { resolveImageProvider, isImageHostingUrl, providers };
