/**
 * Cache abstrait avec deux backends transparents :
 *
 *   1. **Redis** (prod multi-instance) — si REDIS_URL est défini
 *   2. **In-memory Map** (dev / mono-instance) — fallback automatique
 *
 * Usage type :
 *   const list = await cacheGetOrSet(
 *     `groups:${userId}`,
 *     30, // TTL secondes
 *     () => prisma.groupMember.findMany({ where: { userId } }),
 *   );
 *
 * Architecture :
 *  - L'API publique est entièrement async (compatible Redis)
 *  - Si REDIS_URL non configuré, on utilise un Map JS avec TTL
 *  - L'utilisateur du module ne voit AUCUNE différence de comportement
 *
 * Stratégie de clé : prefixe par version pour invalidation globale facile
 * en cas de changement de structure (`bmd:v1:groups:abc`).
 *
 * Sécurité :
 *  - Ne jamais cacher des données contenant des secrets (tokens, pubkey)
 *  - Toujours scoper par userId pour les data utilisateur
 *  - JSON.stringify/parse pour le transport Redis (perte des Date → ISO strings)
 *
 * Si tu installes le client Redis (`npm install ioredis`), le module
 * détecte sa présence et l'utilise. Sinon il tourne en in-memory.
 */
import { loadEnv } from "./env.js";

const KEY_PREFIX = "bmd:v1:";

interface CacheBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec: number): Promise<void>;
  del(key: string): Promise<void>;
  delPrefix(prefix: string): Promise<number>;
}

// ============================================================
// Backend 1 : In-memory (fallback)
// ============================================================
class InMemoryCache implements CacheBackend {
  private store = new Map<string, { value: string; expiresAt: number }>();

  constructor() {
    // GC opportuniste toutes les 5 min : drop les entrées expirées
    setInterval(() => {
      const now = Date.now();
      for (const [k, v] of this.store) {
        if (v.expiresAt < now) this.store.delete(k);
      }
    }, 5 * 60 * 1000).unref();
  }

  async get(key: string): Promise<string | null> {
    const hit = this.store.get(key);
    if (!hit) return null;
    if (hit.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return hit.value;
  }

  async set(key: string, value: string, ttlSec: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async delPrefix(prefix: string): Promise<number> {
    let count = 0;
    for (const k of this.store.keys()) {
      if (k.startsWith(prefix)) {
        this.store.delete(k);
        count++;
      }
    }
    return count;
  }
}

// ============================================================
// Backend 2 : Redis (prod multi-instance)
// ============================================================
//
// Activé si REDIS_URL est défini ET ioredis installé. Si ioredis n'est
// pas installé, on log une fois au boot et on continue en in-memory.
class RedisCache implements CacheBackend {
  private client: any;

  constructor(client: any) {
    this.client = client;
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (e) {
      console.warn(`[cache] Redis GET failed: ${(e as Error).message}`);
      return null;
    }
  }

  async set(key: string, value: string, ttlSec: number): Promise<void> {
    try {
      await this.client.set(key, value, "EX", ttlSec);
    } catch (e) {
      console.warn(`[cache] Redis SET failed: ${(e as Error).message}`);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (e) {
      console.warn(`[cache] Redis DEL failed: ${(e as Error).message}`);
    }
  }

  async delPrefix(prefix: string): Promise<number> {
    try {
      // SCAN pour trouver toutes les clés matchant le pattern
      const stream = this.client.scanStream({
        match: `${prefix}*`,
        count: 100,
      });
      let count = 0;
      const pipeline = this.client.pipeline();
      for await (const keys of stream) {
        for (const k of keys as string[]) {
          pipeline.del(k);
          count++;
        }
      }
      await pipeline.exec();
      return count;
    } catch (e) {
      console.warn(`[cache] Redis SCAN/DEL failed: ${(e as Error).message}`);
      return 0;
    }
  }
}

// ============================================================
// Sélection du backend
// ============================================================
let backend: CacheBackend | null = null;

function getBackend(): CacheBackend {
  if (backend) return backend;
  const env = loadEnv();
  const redisUrl = (env as any).REDIS_URL;
  if (redisUrl) {
    try {
      // Import dynamique : si ioredis n'est pas installé, on tombe en in-memory
      // sans crasher au boot.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Redis = require("ioredis");
      const client = new Redis(redisUrl, {
        maxRetriesPerRequest: 2,
        enableReadyCheck: false,
        lazyConnect: false,
      });
      client.on("error", (err: Error) => {
        console.warn(`[cache] Redis error: ${err.message}`);
      });
      // eslint-disable-next-line no-console
      console.log(`[cache] Redis backend activé (${new URL(redisUrl).host})`);
      backend = new RedisCache(client);
      return backend;
    } catch {
      // eslint-disable-next-line no-console
      console.log(
        "[cache] REDIS_URL configuré mais `ioredis` non installé — fallback in-memory.",
      );
    }
  }
  backend = new InMemoryCache();
  return backend;
}

// ============================================================
// API publique
// ============================================================

/** Get une valeur du cache (string ou null si absent / expiré). */
export async function cacheGet<T = unknown>(key: string): Promise<T | null> {
  const raw = await getBackend().get(KEY_PREFIX + key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Set une valeur avec TTL en secondes. */
export async function cacheSet(
  key: string,
  value: unknown,
  ttlSec: number,
): Promise<void> {
  await getBackend().set(KEY_PREFIX + key, JSON.stringify(value), ttlSec);
}

/** Supprime une clé spécifique. */
export async function cacheDel(key: string): Promise<void> {
  await getBackend().del(KEY_PREFIX + key);
}

/** Supprime toutes les clés matchant un préfixe (invalidation par scope). */
export async function cacheInvalidatePrefix(prefix: string): Promise<number> {
  return getBackend().delPrefix(KEY_PREFIX + prefix);
}

/**
 * Pattern get-or-set : récupère du cache ou exécute le fetcher + cache le résultat.
 * Idéal pour wrapper des requêtes coûteuses :
 *
 *   const data = await cacheGetOrSet("groups:user:abc", 30, () => prisma.group.findMany(...));
 */
export async function cacheGetOrSet<T>(
  key: string,
  ttlSec: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return hit;
  const fresh = await fetcher();
  // Best-effort : si le set échoue (Redis down), on retourne quand même fresh
  await cacheSet(key, fresh, ttlSec).catch(() => undefined);
  return fresh;
}
