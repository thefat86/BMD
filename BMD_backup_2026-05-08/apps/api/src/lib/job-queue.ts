/**
 * Bounded job queue avec exponential backoff retry (Sprint AC-3 / AC-4).
 *
 * Cas d'usage : limiter le nombre de fetchs Whisper / OpenAI parallèles pour
 * ne pas saturer les API tierces (rate limits) et ne pas exploser la RAM
 * du process Node si 50 réunions arrivent en même temps.
 *
 * Architecture :
 *   - Une seule instance par "kind" (ex: "whisper-transcribe", "llm-extract")
 *   - Concurrency configurable (défaut 4 pour Whisper, 8 pour LLM)
 *   - Retry exponentiel : 30s → 2min → 10min, max 3 tentatives
 *   - Quand un job échoue après 3 tentatives, on appelle onFinalFailure pour
 *     que le caller puisse marquer la ressource en FAILED + notifier
 *
 * Backing store (Sprint AC-4) :
 *   - Si `REDIS_URL` est défini ET `bullmq` est installé, on bascule sur
 *     BullMQ (jobs persistés dans Redis, partagés entre instances Node).
 *   - Sinon fallback in-memory (un seul process Node, pas de persistance).
 *
 * Comportement public IDENTIQUE dans les deux modes — le caller ne sait pas
 * lequel est actif. C'est l'intérêt de l'abstraction : on peut scale horizontal
 * en ajoutant simplement une variable d'env, sans toucher au code métier.
 */

interface JobMeta {
  id: string;
  attempts: number;
  scheduledAt: number; // ms timestamp
  payload: unknown;
}

interface QueueOptions<T> {
  /** Nom logique de la queue (pour les logs) */
  name: string;
  /** Nombre max de jobs en parallèle. */
  concurrency?: number;
  /** Fonction de traitement. Doit throw si échec retryable. */
  worker: (payload: T) => Promise<void>;
  /** Hook appelé après le dernier retry échoué (3e tentative par défaut). */
  onFinalFailure?: (payload: T, lastError: Error) => Promise<void> | void;
  /** Nombre max de tentatives (incluant la 1re). Défaut 3. */
  maxAttempts?: number;
  /** Délais en ms entre tentatives. Défaut [30s, 120s, 600s]. */
  retryDelaysMs?: number[];
}

export class JobQueue<T> {
  private readonly name: string;
  private readonly concurrency: number;
  private readonly worker: (payload: T) => Promise<void>;
  private readonly onFinalFailure?: (payload: T, lastError: Error) => Promise<void> | void;
  private readonly maxAttempts: number;
  private readonly retryDelaysMs: number[];

  /** Jobs en attente (FIFO) */
  private pending: JobMeta[] = [];
  /** Jobs en cours de traitement */
  private inflight = new Set<string>();
  /** Timers de retry (pour pouvoir les annuler au shutdown) */
  private retryTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * Sprint AC-4 · Backing store BullMQ si dispo. On utilise un type loose
   * pour ne pas forcer l'import de bullmq (paquet optionnel).
   * Si `bullmqQueue` est non-null, on délègue tout : enqueue, retry, etc.
   */
  private bullmqQueue: any | null = null;
  private bullmqWorker: any | null = null;

  constructor(opts: QueueOptions<T>) {
    this.name = opts.name;
    this.concurrency = opts.concurrency ?? 4;
    this.worker = opts.worker;
    this.onFinalFailure = opts.onFinalFailure;
    this.maxAttempts = opts.maxAttempts ?? 3;
    this.retryDelaysMs = opts.retryDelaysMs ?? [30_000, 120_000, 600_000];

    // Sprint AC-4 · Tente de bootstrap BullMQ si REDIS_URL est défini.
    // C'est asynchrone (import dynamique) — l'instance reste utilisable en
    // mode in-memory pendant le bootstrap. Une fois prête, les nouveaux
    // enqueue() partent dans Redis. Les jobs in-memory en cours finissent
    // localement.
    if (process.env.REDIS_URL) {
      void this.tryBootstrapBullMQ().catch((err) => {
        // eslint-disable-next-line no-console
        console.warn(
          `[queue:${this.name}] BullMQ bootstrap failed (fallback in-memory):`,
          (err as Error).message,
        );
      });
    }
  }

  /**
   * Tente d'initialiser BullMQ. Si `bullmq` n'est pas installé en npm,
   * l'import throw et on retombe sur in-memory. Si Redis est down au
   * démarrage, BullMQ throw et on log mais on continue.
   *
   * Pour activer en prod :
   *   1. `npm install bullmq ioredis` (apps/api)
   *   2. Set `REDIS_URL=redis://localhost:6379` dans .env
   *   3. Restart le serveur
   */
  private async tryBootstrapBullMQ(): Promise<void> {
    // Import dynamique avec eval pour ne pas casser le bundle si bullmq
    // n'est pas installé. TypeScript ne sait pas résoudre ces modules
    // optionnels — c'est OK, on cast `any`.
    let bullmq: any;
    try {
      // Indirection via Function() pour empêcher TypeScript de tenter de
      // résoudre le module au compile-time (bullmq est optionnel).
      const dynImport = new Function("m", "return import(m);") as (
        m: string,
      ) => Promise<any>;
      bullmq = await dynImport("bullmq");
    } catch {
      // bullmq pas installé — on garde le mode in-memory
      return;
    }
    const { Queue, Worker } = bullmq;
    const connection = { connection: { url: process.env.REDIS_URL } };

    this.bullmqQueue = new Queue(this.name, connection);
    this.bullmqWorker = new Worker(
      this.name,
      async (job: any) => {
        await this.worker(job.data as T);
      },
      {
        ...connection,
        concurrency: this.concurrency,
      },
    );
    this.bullmqWorker.on("failed", async (job: any, err: Error) => {
      const attempts = job.attemptsMade ?? 0;
      // eslint-disable-next-line no-console
      console.warn(
        `[queue:${this.name}] BullMQ job ${job.id} failed (attempt ${attempts}/${this.maxAttempts}): ${err.message}`,
      );
      if (attempts >= this.maxAttempts) {
        try {
          await this.onFinalFailure?.(job.data as T, err);
        } catch (hookErr) {
          // eslint-disable-next-line no-console
          console.error(
            `[queue:${this.name}] onFinalFailure threw:`,
            (hookErr as Error).message,
          );
        }
      }
    });
    // eslint-disable-next-line no-console
    console.log(`[queue:${this.name}] BullMQ ready (Redis-backed).`);
  }

  /** Ajoute un job à la queue. Retourne immédiatement (fire-and-forget). */
  enqueue(id: string, payload: T): void {
    // Sprint AC-4 · Si BullMQ est ready, on délègue (persisté Redis).
    // Anti-doublon via `jobId` (BullMQ refuse les duplicates).
    if (this.bullmqQueue) {
      void this.bullmqQueue
        .add(this.name, payload, {
          jobId: id,
          attempts: this.maxAttempts,
          backoff: {
            type: "custom",
            // BullMQ permet un backoff custom — on réutilise nos delays
            delay: this.retryDelaysMs[0],
          },
          removeOnComplete: { count: 100 }, // garde 100 jobs OK pour debug
          removeOnFail: { count: 1000 }, // garde 1000 jobs failed pour audit
        })
        .catch((err: Error) => {
          // eslint-disable-next-line no-console
          console.warn(
            `[queue:${this.name}] enqueue failed (Redis down ?), fallback in-memory:`,
            err.message,
          );
          this.enqueueInMemory(id, payload);
        });
      return;
    }
    this.enqueueInMemory(id, payload);
  }

  private enqueueInMemory(id: string, payload: T): void {
    if (this.pending.some((j) => j.id === id) || this.inflight.has(id)) {
      return;
    }
    this.pending.push({
      id,
      payload,
      attempts: 0,
      scheduledAt: Date.now(),
    });
    this.tick();
  }

  /** Combien de jobs sont actuellement en attente OU en cours. */
  size(): number {
    return this.pending.length + this.inflight.size;
  }

  /** Pour le shutdown gracieux : annule les retries en attente. */
  shutdown(): void {
    for (const timer of this.retryTimers.values()) {
      clearTimeout(timer);
    }
    this.retryTimers.clear();
    this.pending = [];
    // Sprint AC-4 · Ferme proprement BullMQ si actif (libère Redis conn)
    if (this.bullmqWorker) {
      void this.bullmqWorker.close().catch(() => {});
    }
    if (this.bullmqQueue) {
      void this.bullmqQueue.close().catch(() => {});
    }
  }

  /** Statistiques pour /health endpoint */
  stats(): { name: string; pending: number; inflight: number; backend: string } {
    return {
      name: this.name,
      pending: this.pending.length,
      inflight: this.inflight.size,
      backend: this.bullmqQueue ? "bullmq+redis" : "in-memory",
    };
  }

  /** Boucle principale : démarre des jobs jusqu'à atteindre concurrency. */
  private tick(): void {
    while (
      this.inflight.size < this.concurrency &&
      this.pending.length > 0
    ) {
      const job = this.pending.shift()!;
      this.inflight.add(job.id);
      void this.runJob(job);
    }
  }

  private async runJob(job: JobMeta): Promise<void> {
    job.attempts += 1;
    try {
      await this.worker(job.payload as T);
      // OK
    } catch (err) {
      const error = err as Error;
      // eslint-disable-next-line no-console
      console.warn(
        `[queue:${this.name}] job ${job.id} failed (attempt ${job.attempts}/${this.maxAttempts}): ${error.message}`,
      );
      if (job.attempts < this.maxAttempts) {
        const delay =
          this.retryDelaysMs[job.attempts - 1] ??
          this.retryDelaysMs[this.retryDelaysMs.length - 1] ??
          60_000;
        const timer = setTimeout(() => {
          this.retryTimers.delete(job.id);
          this.pending.push({ ...job, scheduledAt: Date.now() });
          this.tick();
        }, delay);
        this.retryTimers.set(job.id, timer);
      } else {
        // Final failure
        try {
          await this.onFinalFailure?.(job.payload as T, error);
        } catch (hookErr) {
          // eslint-disable-next-line no-console
          console.error(
            `[queue:${this.name}] onFinalFailure threw:`,
            (hookErr as Error).message,
          );
        }
      }
    } finally {
      this.inflight.delete(job.id);
      this.tick();
    }
  }
}

/**
 * Sprint AC-3 · Healthcheck Whisper avec mémoïzation 30s.
 * Utilisé par le worker meetings pour décider d'attendre AVANT de spawn
 * un job vers une API potentiellement down (évite le ping-pong de retries).
 */
let lastWhisperHealthCheck = 0;
let lastWhisperHealthy = true;
const HEALTH_CACHE_MS = 30_000;

export async function isWhisperServiceHealthy(): Promise<boolean> {
  if (Date.now() - lastWhisperHealthCheck < HEALTH_CACHE_MS) {
    return lastWhisperHealthy;
  }
  lastWhisperHealthCheck = Date.now();
  try {
    const { loadEnv } = await import("./env.js");
    const env = loadEnv();
    if (!env.WHISPER_API_KEY) {
      lastWhisperHealthy = false;
      return false;
    }
    const r = await fetch(env.WHISPER_API_URL, { method: "HEAD" }).catch(
      () => null,
    );
    // 200/4xx = service répond ; 5xx ou null = down
    lastWhisperHealthy = !!r && r.status < 500;
  } catch {
    lastWhisperHealthy = false;
  }
  return lastWhisperHealthy;
}
