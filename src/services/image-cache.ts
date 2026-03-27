import config from '@/config.ts';

/** A cached image resolution result. */
interface CacheEntry {
  /** Resolved image URL (proxy URL or data: URI). */
  imageUrl: string;
  /** Epoch ms when this entry was last accessed. */
  lastAccess: number;
}

const cache: Map<string, CacheEntry> = new Map();
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

/** Get a cached image URL. Returns null if not found or expired. */
function get(key: string): string | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.lastAccess > config.images.cacheTtl) {
    cache.delete(key);
    return null;
  }
  entry.lastAccess = Date.now();
  return entry.imageUrl;
}

/** Store a resolved image URL in cache. */
function set(key: string, imageUrl: string): void {
  cache.set(key, { imageUrl, lastAccess: Date.now() });
}

/** Check if a key exists and is not expired. */
function has(key: string): boolean {
  return get(key) !== null;
}

/** Remove expired entries from the cache. */
function cleanup(): void {
  const now = Date.now();
  const ttl = config.images.cacheTtl;
  let removed = 0;

  for (const [key, entry] of cache) {
    if (now - entry.lastAccess > ttl) {
      cache.delete(key);
      removed++;
    }
  }

  if (config.images.cacheDebug) {
    // eslint-disable-next-line no-console
    console.debug(`[GhostMesh] Image cache cleanup: ${removed} removed, ${cache.size} remaining`);
  }
}

/** Start the periodic cleanup timer. */
function startCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(cleanup, config.images.cacheCleanupInterval);
}

/** Stop the periodic cleanup timer. */
function stopCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

// Auto-start cleanup on module load
startCleanup();

export { get, set, has, cleanup, startCleanup, stopCleanup };
