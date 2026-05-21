/**
 * V176 — Routes admin lecture Core Web Vitals.
 *
 *   GET /admin/web-vitals/summary?days=7
 *
 * Auth : super admin requis (hook addHook onRequest).
 *
 * Calcule les percentiles p75/p95 via `percentile_cont` Postgres natif —
 * beaucoup plus efficace que de remonter tous les samples côté Node.
 *
 * Note : la route est volontairement dans un module SEPARÉ du admin/
 * principal (admin.routes.ts) pour éviter d'alourdir un fichier déjà
 * lourd et faciliter le maintenance future.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/db.js";
import { assertSuperAdmin } from "../admin/admin.service.js";

interface MetricStat {
  p75: number;
  p95: number;
  samples: number;
  goodPct: number;
  needsImprovementPct: number;
  poorPct: number;
}

interface PercentileRow {
  name: string;
  p75: number | null;
  p95: number | null;
  samples: bigint;
  good_count: bigint;
  needs_count: bigint;
  poor_count: bigint;
}

interface ByPageRow {
  page: string;
  samples: bigint;
  lcp_p75: number | null;
}

interface ByDeviceRow {
  device_type: string;
  samples: bigint;
  lcp_p75: number | null;
}

const METRIC_NAMES = ["LCP", "INP", "CLS", "FCP", "TTFB"] as const;
type MetricName = (typeof METRIC_NAMES)[number];

export async function metricsAdminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);
  app.addHook("onRequest", async (req) => {
    await assertSuperAdmin(req.user.sub);
  });

  app.get("/admin/web-vitals/summary", async (req) => {
    const { days } = z
      .object({
        days: z.coerce.number().int().refine((d) => [1, 7, 30].includes(d), {
          message: "days must be 1, 7 or 30",
        }).default(7),
      })
      .parse(req.query);

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Percentiles + distribution rating par métrique
    const rows = await prisma.$queryRaw<PercentileRow[]>`
      SELECT
        name,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY value) AS p75,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY value) AS p95,
        COUNT(*)::bigint AS samples,
        COUNT(*) FILTER (WHERE rating = 'good')::bigint AS good_count,
        COUNT(*) FILTER (WHERE rating = 'needs-improvement')::bigint AS needs_count,
        COUNT(*) FILTER (WHERE rating = 'poor')::bigint AS poor_count
      FROM "WebVitalsMetric"
      WHERE "createdAt" >= ${since}
      GROUP BY name
    `;

    const metrics: Record<string, MetricStat> = {};
    let totalSamples = 0;
    for (const name of METRIC_NAMES) {
      const r = rows.find((row) => row.name === name);
      if (!r) {
        metrics[name] = {
          p75: 0,
          p95: 0,
          samples: 0,
          goodPct: 0,
          needsImprovementPct: 0,
          poorPct: 0,
        };
        continue;
      }
      const samples = Number(r.samples);
      const good = Number(r.good_count);
      const needs = Number(r.needs_count);
      const poor = Number(r.poor_count);
      totalSamples += samples;
      metrics[name] = {
        p75: Math.round((r.p75 ?? 0) * 1000) / 1000,
        p95: Math.round((r.p95 ?? 0) * 1000) / 1000,
        samples,
        goodPct: samples ? Math.round((good * 100) / samples) : 0,
        needsImprovementPct: samples ? Math.round((needs * 100) / samples) : 0,
        poorPct: samples ? Math.round((poor * 100) / samples) : 0,
      };
    }

    // Top 10 pages par sample count, avec LCP p75
    const byPageRows = await prisma.$queryRaw<ByPageRow[]>`
      SELECT
        page,
        COUNT(*)::bigint AS samples,
        percentile_cont(0.75) WITHIN GROUP (
          ORDER BY value
        ) FILTER (WHERE name = 'LCP') AS lcp_p75
      FROM "WebVitalsMetric"
      WHERE "createdAt" >= ${since}
      GROUP BY page
      ORDER BY samples DESC
      LIMIT 10
    `;
    const byPage = byPageRows.map((r) => ({
      page: r.page,
      samples: Number(r.samples),
      lcpP75: r.lcp_p75 != null ? Math.round(r.lcp_p75) : null,
    }));

    // Breakdown par device
    const byDeviceRows = await prisma.$queryRaw<ByDeviceRow[]>`
      SELECT
        "deviceType" AS device_type,
        COUNT(*)::bigint AS samples,
        percentile_cont(0.75) WITHIN GROUP (
          ORDER BY value
        ) FILTER (WHERE name = 'LCP') AS lcp_p75
      FROM "WebVitalsMetric"
      WHERE "createdAt" >= ${since}
      GROUP BY "deviceType"
    `;
    const byDevice: Record<string, { samples: number; lcpP75: number | null }> = {};
    for (const r of byDeviceRows) {
      byDevice[r.device_type] = {
        samples: Number(r.samples),
        lcpP75: r.lcp_p75 != null ? Math.round(r.lcp_p75) : null,
      };
    }

    return {
      period: `${days}d`,
      totalSamples,
      metrics: metrics as Record<MetricName, MetricStat>,
      byPage,
      byDevice,
    };
  });
}
