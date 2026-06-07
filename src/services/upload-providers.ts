// Image upload providers — loaded as plugins from src/plugins/upload-providers/.

interface UploadProvider {
  name: string;
  upload: (file: File, disableProvider?: (name: string) => void) => Promise<string>;
}

interface PrivateUploadProvider {
  name: string;
  configKey: string;
  configLabel: string;
  configDescription?: string;
  configUrl?: string;
  signupUrl?: string;
  upload: (file: File, apiKey: string) => Promise<string>;
}

interface UploadProviderPlugin {
  name: string;
  configKey?: string;
  configLabel?: string;
  configDescription?: string;
  configUrl?: string;
  signupUrl?: string;
  upload: (
    file: File,
    ctx: { apiKey?: string; disableProvider: (name: string) => void },
  ) => Promise<string>;
}

const modules = import.meta.glob<{ default: UploadProviderPlugin }>(
  '../plugins/upload-providers/*.ts',
  { eager: true },
);

const providers: UploadProviderPlugin[] = Object.values(modules)
  .map((m) => m.default)
  .filter((p): p is UploadProviderPlugin => !!p?.name && typeof p.upload === 'function');

const publicProviders = providers.filter((p) => !p.configKey) as unknown as UploadProvider[];
const privateProviders = providers.filter(
  (p) => !!p.configKey,
) as unknown as PrivateUploadProvider[];

const disabledProviders = new Set<string>();

async function uploadImage(
  file: File,
  ctx: { apiKey?: string; userKeys?: Record<string, string> } = {},
): Promise<string> {
  for (const p of providers) {
    if (disabledProviders.has(p.name)) continue;
    try {
      const apiKey = p.configKey ? ctx.userKeys?.[p.configKey] || ctx.apiKey : undefined;
      return await p.upload(file, {
        apiKey,
        disableProvider: (n: string) => disabledProviders.add(n),
      });
    } catch (e) {
      // try next
    }
  }
  throw new Error('No upload provider available');
}

function hasAvailableProvider(
  blockedNames: string[] = [],
  userKeys: Record<string, string> = {},
  _proxyAllowed: string[] = [],
): boolean {
  const blocked = new Set([...disabledProviders, ...blockedNames]);
  const hasPrivate = privateProviders.some((p) => !blocked.has(p.name) && !!userKeys[p.configKey]);
  if (hasPrivate) return true;
  return publicProviders.some((p) => !blocked.has(p.name));
}

export type { UploadProvider, PrivateUploadProvider, UploadProviderPlugin };
export {
  uploadImage,
  hasAvailableProvider,
  providers,
  publicProviders,
  privateProviders,
  disabledProviders,
};
