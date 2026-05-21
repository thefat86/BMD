import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/db.js";
// V73.5 — Cache plan-limits.ts par user (TTL 5 min). On purge ce cache à
// chaque mutation admin qui peut changer les limites d'un user (changement
// de plan, modif limits d'un plan existant, suppression de plan) pour que
// la nouvelle config soit appliquée INSTANTANÉMENT — pas dans 5 minutes.
import { invalidatePlanCache } from "../../lib/plan-limits.js";
import {
  assertSuperAdmin,
  getCohortRetention,
  getConversionFunnel,
  getFinancialKpis,
  getStats,
  getTestUserIds,
  getTimeseries,
  getUserDetails,
  listGroupsAdmin,
  listUsers,
  recentActivity,
  suspendUser,
  unsuspendUser,
} from "./admin.service.js";
import { eventBus } from "../../lib/event-stream.js";
import { Errors } from "../../lib/errors.js";

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // Toutes les routes nécessitent à la fois auth + super admin
  app.addHook("onRequest", app.authenticate);
  app.addHook("onRequest", async (req) => {
    await assertSuperAdmin(req.user.sub);
  });

  /**
   * GET /admin/stats
   * Statistiques globales de la plateforme.
   */
  app.get("/admin/stats", async () => {
    const stats = await getStats();
    return stats;
  });

  /**
   * GET /admin/timeseries?days=14
   * Série temporelle (signups / dépenses / volumes / groupes) pour les
   * graphes du dashboard admin. Buckets quotidiens.
   * Plage étendue à 730 jours (~24 mois) pour spec §3.11 (graphiques 6/12/24 mois).
   */
  app.get("/admin/timeseries", async (req) => {
    const { days } = z
      .object({
        days: z.coerce.number().int().min(1).max(730).default(14),
      })
      .parse(req.query);
    const series = await getTimeseries({ days });
    return { points: series };
  });

  /**
   * GET /admin/event-stats
   * Snapshot des canaux SSE actifs. Utile pour le monitoring : si on voit
   * 0 listeners alors qu'on s'attend à des admins connectés, c'est suspect.
   */
  app.get("/admin/event-stats", async () => {
    return { activeSubscribers: eventBus.count() };
  });

  /**
   * GET /admin/cohorts?weeks=8
   * Grille de rétention par semaine d'inscription.
   *  - 1 ligne = 1 cohorte (semaine d'inscription).
   *  - 1 colonne = 1 semaine après la date d'inscription (W0, W1, W2…).
   *  - Cellule = % de la cohorte revenu cette semaine-là.
   */
  app.get("/admin/cohorts", async (req) => {
    const { weeks } = z
      .object({
        weeks: z.coerce.number().int().min(2).max(26).default(8),
      })
      .parse(req.query);
    const rows = await getCohortRetention({ weeks });
    return { rows };
  });

  /**
   * GET /admin/kpis
   * KPIs financiers : MRR, ARPU, churn, ARR, conversion paying.
   */
  app.get("/admin/kpis", async () => {
    return getFinancialKpis();
  });

  /**
   * V72 — GET /admin/profitability  (LIVE — basé sur UsageEvent)
   *
   * Rentabilité par client : MRR vs coût RÉEL agrégé depuis la table
   * UsageEvent (1 ligne = 1 appel à un service externe payant, avec son
   * coût calculé au moment de l'appel selon les tarifs officiels).
   *
   * Query :
   *  - sort : "margin_asc" (worst-first, default) | "margin_desc" | "revenue_desc" | "cost_desc"
   *  - limit : nombre de lignes à retourner (default 100, max 500)
   *  - search : sous-chaîne dans displayName / contact
   *  - days : période en jours (default 30 = ~1 mois glissant). Utilise
   *           la date courante moins N jours, pas le calendrier civil.
   *
   * Réponse :
   *  - rows : un par user actif avec ventilation OCR/voix/SMS/email/LLM
   *  - summary : agrégats globaux (MRR, coût, marge, ventilation)
   *  - period : début/fin de la fenêtre
   */
  app.get("/admin/profitability", async (req) => {
    const q = z
      .object({
        sort: z
          .enum(["margin_asc", "margin_desc", "revenue_desc", "cost_desc"])
          .default("margin_asc"),
        limit: z.coerce.number().int().min(1).max(500).default(100),
        search: z.string().max(80).optional(),
        days: z.coerce.number().int().min(1).max(365).default(30),
        // V95.B — par défaut on exclut les users de test (E2E + seed).
        includeTests: z.enum(["0", "1"]).optional(),
      })
      .parse(req.query);

    // Fenêtre temporelle : N derniers jours (par défaut 30 = ~1 mois glissant)
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd);
    periodStart.setDate(periodStart.getDate() - q.days);

    // 1. Charge tous les users actifs + leur plan + leur contact primaire
    const where: any = { suspendedAt: null };
    if (q.search) {
      where.OR = [
        { displayName: { contains: q.search, mode: "insensitive" } },
        {
          contacts: {
            some: {
              value: { contains: q.search, mode: "insensitive" },
            },
          },
        },
      ];
    }
    // V95.B — Exclure les users de test sauf opt-in explicite
    if (q.includeTests !== "1") {
      const testIds = await getTestUserIds();
      if (testIds.size > 0) {
        where.id = { notIn: [...testIds] };
      }
    }
    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        displayName: true,
        planCode: true,
        createdAt: true,
        contacts: {
          where: { isPrimary: true },
          select: { type: true, value: true },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // 2. Plan price map (centimes EUR — base price plein tarif)
    const plans = await prisma.plan.findMany({
      select: { code: true, name: true, priceCents: true },
    });
    const planByCode = new Map(plans.map((p) => [p.code, p]));

    // 3. V72 — Agrégation LIVE des UsageEvent par user + kind sur la
    //    fenêtre. 1 ligne UsageEvent = 1 appel à un service externe payant
    //    avec son coût calculé au moment de l'appel.
    type AggRow = {
      userId: string;
      kind: string;
      _count: { _all: number };
      _sum: { costCents: number | null; units: number | null };
    };
    let events: AggRow[] = [];
    try {
      events = (await (prisma as any).usageEvent.groupBy({
        by: ["userId", "kind"],
        where: { createdAt: { gte: periodStart, lt: periodEnd } },
        _count: { _all: true },
        _sum: { costCents: true, units: true },
      })) as AggRow[];
    } catch {
      // UsageEvent peut ne pas exister tant que la migration V72 n'a pas tourné
    }

    // Map userId → { kind → { count, costCents } }
    const usageByUser = new Map<
      string,
      Record<string, { count: number; costCents: number; units: number }>
    >();
    for (const e of events) {
      const u = usageByUser.get(e.userId) ?? {};
      u[e.kind] = {
        count: e._count._all,
        costCents: e._sum.costCents ?? 0,
        units: e._sum.units ?? 0,
      };
      usageByUser.set(e.userId, u);
    }

    function k(map: Record<string, { count: number; costCents: number; units: number }> | undefined, kind: string) {
      return map?.[kind] ?? { count: 0, costCents: 0, units: 0 };
    }

    // 4. Calcul rentabilité par user
    const rows = users.map((u) => {
      const plan = planByCode.get(u.planCode);
      const revenueCents = plan?.priceCents ?? 0;
      const usage = usageByUser.get(u.id);
      const ocr = k(usage, "OCR_SCAN");
      const voice = k(usage, "VOICE_TRANSCRIBE");
      const meeting = k(usage, "MEETING_TRANSCRIBE");
      const llm = k(usage, "LLM_PARSE");
      const sms = k(usage, "SMS_SENT");
      const verify = k(usage, "OTP_VERIFY");
      const wa = k(usage, "WHATSAPP_SENT");
      const email = k(usage, "EMAIL_SENT");
      const costCents =
        ocr.costCents +
        voice.costCents +
        meeting.costCents +
        llm.costCents +
        sms.costCents +
        verify.costCents +
        wa.costCents +
        email.costCents;
      const marginCents = revenueCents - costCents;
      const primaryContact = u.contacts[0];
      return {
        userId: u.id,
        displayName: u.displayName,
        primaryContact: primaryContact
          ? { type: primaryContact.type, value: primaryContact.value }
          : null,
        planCode: u.planCode,
        planName: plan?.name ?? u.planCode,
        createdAt: u.createdAt.toISOString(),
        revenueCents,
        // Conso par kind (count + coût réel agrégé)
        ocr: { count: ocr.count, costCents: ocr.costCents },
        voice: {
          count: voice.count,
          costCents: voice.costCents,
          seconds: voice.units,
        },
        meeting: {
          count: meeting.count,
          costCents: meeting.costCents,
          seconds: meeting.units,
        },
        llm: { count: llm.count, costCents: llm.costCents },
        sms: { count: sms.count, costCents: sms.costCents },
        verify: { count: verify.count, costCents: verify.costCents },
        whatsapp: { count: wa.count, costCents: wa.costCents },
        email: { count: email.count, costCents: email.costCents },
        costCents,
        marginCents,
        isUnprofitable: marginCents < 0,
      };
    });

    // 5. Tri
    rows.sort((a, b) => {
      switch (q.sort) {
        case "margin_asc":
          return a.marginCents - b.marginCents;
        case "margin_desc":
          return b.marginCents - a.marginCents;
        case "revenue_desc":
          return b.revenueCents - a.revenueCents;
        case "cost_desc":
          return b.costCents - a.costCents;
        default:
          return a.marginCents - b.marginCents;
      }
    });

    // 6. Agrégats globaux
    const summary = rows.reduce(
      (acc, r) => {
        acc.totalRevenueCents += r.revenueCents;
        acc.totalCostCents += r.costCents;
        acc.totalOcr += r.ocr.count;
        acc.totalVoice += r.voice.count;
        acc.totalMeetings += r.meeting.count;
        acc.totalLlm += r.llm.count;
        acc.totalSms += r.sms.count;
        acc.totalVerify += r.verify.count;
        acc.totalWhatsapp += r.whatsapp.count;
        acc.totalEmail += r.email.count;
        if (r.revenueCents > 0) acc.payingUsers++;
        if (r.isUnprofitable) acc.unprofitableUsers++;
        return acc;
      },
      {
        totalRevenueCents: 0,
        totalCostCents: 0,
        totalMarginCents: 0,
        totalOcr: 0,
        totalVoice: 0,
        totalMeetings: 0,
        totalLlm: 0,
        totalSms: 0,
        totalVerify: 0,
        totalWhatsapp: 0,
        totalEmail: 0,
        userCount: rows.length,
        payingUsers: 0,
        unprofitableUsers: 0,
      },
    );
    summary.totalMarginCents = summary.totalRevenueCents - summary.totalCostCents;

    return {
      period: {
        start: periodStart.toISOString(),
        end: periodEnd.toISOString(),
        days: q.days,
        label: `${q.days} derniers jours`,
      },
      summary,
      rows: rows.slice(0, q.limit),
      truncated: rows.length > q.limit,
      totalRows: rows.length,
    };
  });

  /**
   * V72 — GET /admin/usage/timeseries?days=30
   * Série temporelle quotidienne (coût total par jour). Sert le graphique
   * du dashboard rentabilité. Buckets par YYYY-MM-DD UTC.
   */
  app.get("/admin/usage/timeseries", async (req) => {
    const { days } = z
      .object({ days: z.coerce.number().int().min(1).max(365).default(30) })
      .parse(req.query);
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd);
    periodStart.setDate(periodStart.getDate() - days);

    // Raw SQL pour le groupBy DATE — pg-sql safe (paramètre lié).
    let rows: Array<{ day: string; cost_cents: number; count: number }> = [];
    try {
      rows = (await prisma.$queryRaw`
        SELECT
          TO_CHAR(DATE_TRUNC('day', "createdAt" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
          SUM("costCents")::float AS cost_cents,
          COUNT(*)::int AS count
        FROM "UsageEvent"
        WHERE "createdAt" >= ${periodStart} AND "createdAt" < ${periodEnd}
        GROUP BY day
        ORDER BY day ASC
      `) as Array<{ day: string; cost_cents: number; count: number }>;
    } catch {
      // Table inexistante → réponse vide (avant migration V72)
      rows = [];
    }

    // Remplit les jours sans event avec 0 pour avoir une ligne lisse
    const points: Array<{ day: string; costCents: number; count: number }> = [];
    const cursor = new Date(periodStart);
    while (cursor < periodEnd) {
      const key = cursor.toISOString().slice(0, 10);
      const hit = rows.find((r) => r.day === key);
      points.push({
        day: key,
        costCents: hit ? Number(hit.cost_cents) : 0,
        count: hit ? Number(hit.count) : 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return { days, points };
  });

  /**
   * V72 — GET /admin/usage/breakdown?days=30
   * Ventilation du coût total par (kind, provider) sur la fenêtre.
   * Utile pour comprendre où part l'argent : Whisper ? Twilio ? Mindee ?
   */
  app.get("/admin/usage/breakdown", async (req) => {
    const { days } = z
      .object({ days: z.coerce.number().int().min(1).max(365).default(30) })
      .parse(req.query);
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd);
    periodStart.setDate(periodStart.getDate() - days);

    let rows: Array<{
      kind: string;
      provider: string;
      _count: { _all: number };
      _sum: { costCents: number | null; units: number | null };
    }> = [];
    try {
      rows = (await (prisma as any).usageEvent.groupBy({
        by: ["kind", "provider"],
        where: { createdAt: { gte: periodStart, lt: periodEnd } },
        _count: { _all: true },
        _sum: { costCents: true, units: true },
      })) as typeof rows;
    } catch {
      rows = [];
    }

    const breakdown = rows
      .map((r) => ({
        kind: r.kind,
        provider: r.provider,
        count: r._count._all,
        costCents: r._sum.costCents ?? 0,
        units: r._sum.units ?? 0,
      }))
      .sort((a, b) => b.costCents - a.costCents); // plus cher en haut

    const totalCostCents = breakdown.reduce((s, r) => s + r.costCents, 0);
    return {
      period: { start: periodStart.toISOString(), end: periodEnd.toISOString(), days },
      totalCostCents,
      breakdown,
    };
  });

  /**
   * GET /admin/funnel?days=30
   * Étapes de conversion : signup → contact vérifié → 1er groupe →
   * 1ère dépense → plan payant.
   * Si days omis → all-time.
   */
  app.get("/admin/funnel", async (req) => {
    const { days } = z
      .object({
        days: z.coerce.number().int().min(1).max(365).optional(),
      })
      .parse(req.query);
    const steps = await getConversionFunnel({ days });
    return { steps, scope: days ? `${days}j` : "all-time" };
  });

  /**
   * GET /admin/users?query=&limit=50&offset=0
   */
  app.get("/admin/users", async (req) => {
    const query = z
      .object({
        query: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
        offset: z.coerce.number().int().min(0).optional(),
      })
      .parse(req.query);

    const result = await listUsers(query);
    return {
      items: result.items.map((u) => ({
        id: u.id,
        displayName: u.displayName,
        avatar: u.avatar,
        defaultCurrency: u.defaultCurrency,
        defaultLocale: u.defaultLocale,
        isSuperAdmin: u.isSuperAdmin,
        suspendedAt: u.suspendedAt?.toISOString() ?? null,
        createdAt: u.createdAt.toISOString(),
        contacts: u.contacts,
        counts: u._count,
      })),
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    };
  });

  /**
   * GET /admin/users/:id
   */
  app.get("/admin/users/:id", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const u = await getUserDetails(id);
    return {
      id: u.id,
      displayName: u.displayName,
      avatar: u.avatar,
      defaultCurrency: u.defaultCurrency,
      defaultLocale: u.defaultLocale,
      isSuperAdmin: u.isSuperAdmin,
      suspendedAt: u.suspendedAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
      contacts: u.contacts,
      activeSessions: u.sessions.map((s) => ({
        id: s.id,
        device: s.device,
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
      })),
      groups: u.groupMemberships.map((m) => ({
        id: m.group.id,
        name: m.group.name,
        type: m.group.type,
        role: m.role,
      })),
      counts: u._count,
    };
  });

  /**
   * POST /admin/users/:id/suspend
   */
  app.post("/admin/users/:id/suspend", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return suspendUser(id);
  });

  /**
   * POST /admin/users/:id/unsuspend
   */
  app.post("/admin/users/:id/unsuspend", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return unsuspendUser(id);
  });

  /**
   * V95.C — POST /admin/users
   *
   * Crée un "shadow user" en base (sans mot de passe, non vérifié) à
   * partir d'un contact (email ou téléphone). Le user pourra finaliser
   * son inscription via le flux OTP standard (saisie du même contact).
   *
   * Body : { contactType, contactValue, displayName? }
   * Retourne : { user, inviteMessage, inviteUrl, whatsappShareUrl, smsShareUrl, mailtoUrl }
   */
  app.post("/admin/users", async (req) => {
    const body = z
      .object({
        contactType: z.enum(["EMAIL", "PHONE"]),
        contactValue: z.string().min(3).max(160).trim(),
        displayName: z.string().max(80).trim().optional(),
      })
      .parse(req.body);

    // Validation basique
    if (body.contactType === "EMAIL" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.contactValue)) {
      throw Errors.badRequest("Format e-mail invalide", {
        tip: "Exemple : prenom@exemple.com",
      });
    }
    if (body.contactType === "PHONE" && !/^\+\d{7,16}$/.test(body.contactValue)) {
      throw Errors.badRequest("Format téléphone invalide", {
        tip: "Exemple : +33612345678 (avec le + et l'indicatif pays)",
      });
    }

    // 1. Vérifier que le contact n'existe pas déjà
    const existing = await prisma.userContact.findUnique({
      where: { type_value: { type: body.contactType, value: body.contactValue } },
      include: { user: { select: { id: true, displayName: true } } },
    });
    if (existing) {
      throw Errors.alreadyExists({
        what: `Ce contact est déjà rattaché à ${existing.user.displayName}`,
        tip: "Tu peux ouvrir sa fiche depuis la liste des utilisateurs.",
      });
    }

    // 2. Calculer un displayName intelligent
    const submitted = body.displayName?.trim() ?? "";
    let displayName = submitted;
    if (!displayName) {
      if (body.contactType === "EMAIL") {
        const local = body.contactValue.split("@")[0] ?? "";
        const cleaned = local.replace(/[._-]+/g, " ").trim();
        if (cleaned) {
          displayName =
            cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
        }
      } else {
        const digits = body.contactValue.replace(/\D/g, "");
        const last4 = digits.slice(-4);
        if (last4) displayName = `Membre ${last4}`;
      }
      if (!displayName) displayName = "Nouveau membre";
    }

    // 3. Création
    const created = await prisma.user.create({
      data: {
        displayName,
        contacts: {
          create: {
            type: body.contactType,
            value: body.contactValue,
            isVerified: false,
            isPrimary: true,
          },
        },
      },
      include: {
        contacts: { select: { type: true, value: true, isPrimary: true } },
      },
    });

    // 4. Génère le message d'invitation + les URLs pour partage immédiat
    const env = await import("../../lib/env.js").then((m) => m.loadEnv());
    const baseUrl = env.WEB_BASE_URL ?? "https://www.backmesdo.com";
    const inviteUrl = `${baseUrl}/login?invited=1`;
    const inviteMessage =
      `Salut ${displayName} ! ${req.user?.sub ? "L'équipe" : "On"} t'invite à rejoindre BMD — ` +
      `l'app pour gérer ensemble les dépenses partagées, tontines et règlements ` +
      `entre amis et famille, sans prise de tête.\n\n` +
      `Crée ton compte ici : ${inviteUrl}\n\n` +
      `À tout de suite 🙌`;

    // URLs prêtes-à-cliquer (le frontend les utilise pour ouvrir WhatsApp/SMS/Mail)
    const phoneForWa = body.contactValue.replace(/^\+/, "").replace(/\D/g, "");
    const encoded = encodeURIComponent(inviteMessage);
    const whatsappShareUrl =
      body.contactType === "PHONE"
        ? `https://wa.me/${phoneForWa}?text=${encoded}`
        : `https://wa.me/?text=${encoded}`;
    const smsShareUrl =
      body.contactType === "PHONE"
        ? `sms:${body.contactValue}?body=${encoded}`
        : null;
    const mailtoUrl =
      body.contactType === "EMAIL"
        ? `mailto:${body.contactValue}?subject=${encodeURIComponent("Rejoins-moi sur BMD")}&body=${encoded}`
        : null;

    return {
      user: {
        id: created.id,
        displayName: created.displayName,
        planCode: created.planCode,
        createdAt: created.createdAt.toISOString(),
        contacts: created.contacts,
      },
      inviteMessage,
      inviteUrl,
      whatsappShareUrl,
      smsShareUrl,
      mailtoUrl,
    };
  });

  /**
   * V95.C — POST /admin/users/:id/send-invite
   *
   * Envoie le message d'invitation au user via le canal demandé.
   *   - channel "EMAIL" → via Resend (si email primary)
   *   - channel "SMS"   → via Twilio (si téléphone primary)
   *
   * Body : { channel: "EMAIL" | "SMS", message?: string }
   *
   * (Le canal "WHATSAPP" n'est pas envoyé côté serveur : le frontend
   *  ouvre directement `whatsappShareUrl` retourné par /admin/users.)
   */
  app.post("/admin/users/:id/send-invite", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        channel: z.enum(["EMAIL", "SMS"]),
        message: z.string().min(10).max(2000).optional(),
      })
      .parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        contacts: {
          where: { isPrimary: true },
          select: { type: true, value: true },
          take: 1,
        },
      },
    });
    if (!user) throw Errors.notFound("Utilisateur introuvable");
    const contact = user.contacts[0];
    if (!contact) {
      throw Errors.badRequest("Pas de contact primaire pour ce user", {
        tip: "Ajoute-lui un email ou un téléphone d'abord.",
      });
    }

    // Construit le message si non fourni
    const envM = await import("../../lib/env.js").then((m) => m.loadEnv());
    const baseUrl = envM.WEB_BASE_URL ?? "https://www.backmesdo.com";
    const inviteUrl = `${baseUrl}/login?invited=1`;
    const defaultMessage =
      `Salut ${user.displayName} ! On t'invite à rejoindre BMD — ` +
      `l'app pour gérer ensemble les dépenses partagées, tontines et règlements.\n\n` +
      `Crée ton compte ici : ${inviteUrl}\n\n` +
      `À tout de suite 🙌`;
    const message = body.message?.trim() || defaultMessage;

    if (body.channel === "EMAIL") {
      if (contact.type !== "EMAIL") {
        throw Errors.badRequest("Ce user n'a pas d'e-mail comme contact primaire", {
          tip: "Choisis SMS, ou ajoute-lui un email d'abord.",
        });
      }
      const { sendEmail } = await import("../../lib/messaging.js");
      const result = await sendEmail(
        {
          to: contact.value,
          subject: "Rejoins-moi sur BMD 🙌",
          text: message,
          html: `<!doctype html><html lang="fr"><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1625;background:#faf7f0">
  <div style="text-align:center;margin-bottom:24px">
    <div style="font-family:'Cormorant Garamond',serif;font-size:28px;color:#3a2f5b;font-weight:700">BMD</div>
    <div style="font-size:11px;color:#7c6e93;letter-spacing:2px;text-transform:uppercase">Back Mes Do</div>
  </div>
  <p style="font-size:14px;line-height:1.6;white-space:pre-line;color:#574a6e">${message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")}</p>
  <hr style="border:none;border-top:1px solid #e5dccc;margin:24px 0">
  <p style="font-size:11px;color:#a89a8c;text-align:center">L'argent partagé. L'amitié protégée.</p>
</body></html>`,
        },
        user.id,
      );
      return { ok: result.ok, channel: "EMAIL", to: contact.value };
    }

    // SMS
    if (contact.type !== "PHONE") {
      throw Errors.badRequest("Ce user n'a pas de téléphone comme contact primaire", {
        tip: "Choisis Email, ou ajoute-lui un numéro d'abord.",
      });
    }
    const { sendSms } = await import("../../lib/messaging.js");
    // SMS limité à 1 segment → garde max 320 caractères
    const smsBody = message.length > 320 ? message.slice(0, 317) + "..." : message;
    const result = await sendSms({ to: contact.value, body: smsBody }, user.id);
    return {
      ok: result.ok,
      channel: "SMS",
      to: contact.value,
      ...(result.error ? { error: result.error } : {}),
    };
  });

  /**
   * GET /admin/groups?limit=50&offset=0
   */
  app.get("/admin/groups", async (req) => {
    const query = z
      .object({
        limit: z.coerce.number().int().min(1).max(100).optional(),
        offset: z.coerce.number().int().min(0).optional(),
      })
      .parse(req.query);
    const result = await listGroupsAdmin(query);
    return {
      items: result.items.map((g) => ({
        id: g.id,
        name: g.name,
        type: g.type,
        defaultCurrency: g.defaultCurrency,
        createdAt: g.createdAt.toISOString(),
        admin: g.members[0]?.user ?? null,
        counts: g._count,
      })),
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    };
  });

  /**
   * GET /admin/activity?includeTests=0|1
   *
   * V95.B — Par défaut, les users de test (E2E + seed fixture) sont
   * exclus du flux. Passer `includeTests=1` pour les voir.
   */
  app.get("/admin/activity", async (req) => {
    const { includeTests } = z
      .object({ includeTests: z.enum(["0", "1"]).optional() })
      .parse(req.query);
    const excludeTestUsers = includeTests !== "1";
    const a = await recentActivity(30, excludeTestUsers);
    // Fusionner et trier par date
    const all = [...a.users, ...a.expenses, ...a.swaps].sort(
      (x, y) => y.at.getTime() - x.at.getTime(),
    );
    return all.slice(0, 30).map((e) => ({
      kind: e.kind,
      at: e.at.toISOString(),
      label: e.label,
      id: e.id,
    }));
  });

  /**
   * GET /admin/plans
   * Liste les plans tarifaires (spec §6.3).
   * Inclut le nombre d'utilisateurs sur chaque plan.
   */
  app.get("/admin/plans", async () => {
    const plans = await prisma.plan.findMany({
      orderBy: { displayOrder: "asc" },
    });
    // Compteur d'utilisateurs par plan
    const counts = await prisma.user.groupBy({
      by: ["planCode"],
      _count: { _all: true },
    });
    const countByCode = Object.fromEntries(
      counts.map((c) => [c.planCode, c._count._all]),
    );
    return plans.map((p) => ({
      ...p,
      priceCents: p.priceCents,
      priceCentsYearly: p.priceCentsYearly,
      userCount: countByCode[p.code] ?? 0,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }));
  });

  /**
   * PATCH /admin/plans/:code
   * Met à jour un plan : prix, limites JSON, description, état actif.
   * Spec §6.3 : "Toute modification est appliquée en temps réel".
   */
  app.patch("/admin/plans/:code", async (req) => {
    const { code } = z
      .object({ code: z.string().min(1).max(40) })
      .parse(req.params);
    const body = z
      .object({
        name: z.string().min(1).max(80).optional(),
        priceCents: z.number().int().min(0).optional(),
        priceCentsYearly: z.number().int().min(0).nullable().optional(),
        description: z.string().max(500).nullable().optional(),
        limits: z.record(z.any()).optional(),
        isActive: z.boolean().optional(),
        displayOrder: z.number().int().optional(),
      })
      .parse(req.body);
    const updated = await prisma.plan.update({
      where: { code },
      data: body as any,
    });
    // V73.5 — Modification d'un plan : les limites en cache pour TOUS les
    // users sur ce plan deviennent stale. On purge tout (cache global).
    invalidatePlanCache();
    return updated;
  });

  /**
   * POST /admin/plans (spec §6.3 : "Tout est configurable")
   * Crée un nouveau plan tarifaire personnalisé. Le code est unique,
   * en MAJUSCULES, sans espaces. Les limites sont du JSON libre.
   */
  app.post("/admin/plans", async (req) => {
    const body = z
      .object({
        code: z
          .string()
          .min(2)
          .max(40)
          .regex(/^[A-Z0-9_]+$/, "Code en majuscules, chiffres ou _ uniquement"),
        name: z.string().min(1).max(80),
        priceCents: z.number().int().min(0).default(0),
        priceCentsYearly: z.number().int().min(0).nullable().optional(),
        description: z.string().max(500).optional(),
        limits: z.record(z.any()).default({}),
        displayOrder: z.number().int().default(99),
      })
      .parse(req.body);
    return prisma.plan.create({ data: body as any });
  });

  /**
   * DELETE /admin/plans/:code
   * Supprime un plan. Refusé si des utilisateurs sont encore dessus
   * (l'admin doit d'abord les migrer vers un autre plan).
   */
  app.delete("/admin/plans/:code", async (req, reply) => {
    const { code } = z
      .object({ code: z.string().min(1).max(40) })
      .parse(req.params);
    // Refuse si des users sont sur ce plan
    const usersOnPlan = await prisma.user.count({
      where: { planCode: code },
    });
    if (usersOnPlan > 0) {
      return reply.code(409).send({
        error: "plan_has_users",
        message: `Impossible : ${usersOnPlan} utilisateur(s) encore sur ce plan. Migre-les d'abord.`,
      });
    }
    // Refuse si c'est le plan FREE par défaut (ne jamais le supprimer)
    if (code === "FREE") {
      return reply.code(409).send({
        error: "default_plan",
        message: "Le plan FREE par défaut ne peut pas être supprimé.",
      });
    }
    await prisma.plan.delete({ where: { code } });
    // V73.5 — Purge le cache global au cas où des refs subsistent.
    invalidatePlanCache();
    return reply.code(204).send();
  });

  /**
   * POST /admin/users/:id/change-plan
   * Change le plan d'un utilisateur (admin only).
   */
  app.post("/admin/users/:id/change-plan", async (req) => {
    const { id } = z
      .object({ id: z.string().uuid() })
      .parse(req.params);
    const { planCode } = z
      .object({ planCode: z.string().min(1).max(40) })
      .parse(req.body);
    // Vérif plan existe
    const plan = await prisma.plan.findUnique({ where: { code: planCode } });
    if (!plan) {
      throw new Error("Plan introuvable");
    }
    const updated = await prisma.user.update({
      where: { id },
      data: { planCode },
      select: { id: true, displayName: true, planCode: true },
    });
    // V73.5 — Purge le cache plan-limits.ts pour CE user. Sans ça, le
    // serveur garde en mémoire ses anciennes limites (TTL 5 min) et
    // l'algo continue d'autoriser des actions selon l'ancien plan
    // (ex: scans illimités si l'ancien plan était full).
    invalidatePlanCache(id);
    return updated;
  });

  /* ===== Tarifs régionalisés (spec §6.3 — pricing PPA) ===== */

  /**
   * GET /admin/regions
   * Liste toutes les régions tarifaires.
   */
  app.get("/admin/regions", async () => {
    const regions = await prisma.region.findMany({
      orderBy: { displayOrder: "asc" },
      include: {
        priceTiers: {
          select: {
            planCode: true,
            currency: true,
            priceCents: true,
            priceCentsYearly: true,
            stripePriceId: true,
            stripePriceIdYearly: true,
          },
        },
      },
    });
    return regions.map((r) => ({
      code: r.code,
      name: r.name,
      defaultCurrency: r.defaultCurrency,
      countryCodes: r.countryCodes,
      description: r.description,
      ppaIndex: r.ppaIndex,
      displayOrder: r.displayOrder,
      isActive: r.isActive,
      priceTiers: r.priceTiers,
    }));
  });

  /**
   * POST /admin/regions
   * Crée une nouvelle région.
   */
  app.post("/admin/regions", async (req) => {
    const body = z
      .object({
        code: z
          .string()
          .min(2)
          .max(40)
          .regex(/^[A-Z0-9_]+$/, "Code en majuscules / chiffres / _"),
        name: z.string().min(1).max(120),
        defaultCurrency: z.string().length(3),
        countryCodes: z.array(z.string().length(2)).min(1),
        description: z.string().max(500).optional(),
        ppaIndex: z.number().int().min(1).max(200).default(100),
        displayOrder: z.number().int().default(0),
      })
      .parse(req.body);
    return prisma.region.create({ data: body as any });
  });

  /**
   * PATCH /admin/regions/:code
   * Modifie une région (countryCodes, ppaIndex, isActive...).
   */
  app.patch("/admin/regions/:code", async (req) => {
    const { code } = z
      .object({ code: z.string().min(1).max(40) })
      .parse(req.params);
    const body = z
      .object({
        name: z.string().min(1).max(120).optional(),
        defaultCurrency: z.string().length(3).optional(),
        countryCodes: z.array(z.string().length(2)).optional(),
        description: z.string().max(500).nullable().optional(),
        ppaIndex: z.number().int().min(1).max(200).optional(),
        displayOrder: z.number().int().optional(),
        isActive: z.boolean().optional(),
      })
      .parse(req.body);
    return prisma.region.update({
      where: { code },
      data: body as any,
    });
  });

  /**
   * DELETE /admin/regions/:code
   * Supprime une région (cascade sur tiers associés).
   */
  app.delete("/admin/regions/:code", async (req, reply) => {
    const { code } = z
      .object({ code: z.string().min(1).max(40) })
      .parse(req.params);
    await prisma.region.delete({ where: { code } });
    return reply.code(204).send();
  });

  /**
   * PUT /admin/plan-tiers
   * Définit / met à jour un prix régional (upsert sur planCode + regionCode).
   * Body: { planCode, regionCode, currency, priceCents, priceCentsYearly? }
   */
  app.put("/admin/plan-tiers", async (req) => {
    const body = z
      .object({
        planCode: z.string().min(1).max(40),
        regionCode: z.string().min(1).max(40),
        currency: z.string().length(3),
        priceCents: z.number().int().min(0),
        priceCentsYearly: z.number().int().min(0).optional().nullable(),
        // Stripe Price IDs — optionnels (le tier peut exister sans Stripe
        // pour les régions où on règle hors Stripe, ex: mobile money)
        stripePriceId: z.string().max(80).optional().nullable(),
        stripePriceIdYearly: z.string().max(80).optional().nullable(),
        notes: z.string().max(500).optional().nullable(),
      })
      .parse(req.body);
    return prisma.planPriceTier.upsert({
      where: {
        planCode_regionCode: {
          planCode: body.planCode,
          regionCode: body.regionCode,
        },
      },
      create: {
        planCode: body.planCode,
        regionCode: body.regionCode,
        currency: body.currency.toUpperCase(),
        priceCents: body.priceCents,
        priceCentsYearly: body.priceCentsYearly ?? null,
        stripePriceId: body.stripePriceId ?? null,
        stripePriceIdYearly: body.stripePriceIdYearly ?? null,
        notes: body.notes ?? null,
      },
      update: {
        currency: body.currency.toUpperCase(),
        priceCents: body.priceCents,
        priceCentsYearly: body.priceCentsYearly ?? null,
        stripePriceId: body.stripePriceId ?? null,
        stripePriceIdYearly: body.stripePriceIdYearly ?? null,
        notes: body.notes ?? null,
      },
    });
  });

  /**
   * DELETE /admin/plan-tiers/:planCode/:regionCode
   * Supprime un prix régional (le plan tombera sur priceCents de base).
   */
  app.delete("/admin/plan-tiers/:planCode/:regionCode", async (req, reply) => {
    const { planCode, regionCode } = z
      .object({
        planCode: z.string().min(1).max(40),
        regionCode: z.string().min(1).max(40),
      })
      .parse(req.params);
    await prisma.planPriceTier.delete({
      where: {
        planCode_regionCode: { planCode, regionCode },
      },
    });
    return reply.code(204).send();
  });

  /* ===== Rôles admin custom (spec §6.10) ===== */

  /** Liste les rôles admin custom + leurs permissions. */
  app.get("/admin/roles", async () => {
    const roles = await prisma.adminRole.findMany({
      orderBy: { code: "asc" },
    });
    return roles.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  });

  /** Crée un nouveau rôle admin custom. */
  app.post("/admin/roles", async (req) => {
    const body = z
      .object({
        code: z
          .string()
          .min(2)
          .max(40)
          .regex(/^[A-Z0-9_]+$/, "Code en majuscules / chiffres / _"),
        name: z.string().min(1).max(80),
        description: z.string().max(500).optional(),
        permissions: z.record(z.array(z.string())).default({}),
      })
      .parse(req.body);
    return prisma.adminRole.create({ data: body as any });
  });

  /** Met à jour un rôle admin (permissions, nom, description). */
  app.patch("/admin/roles/:code", async (req) => {
    const { code } = z
      .object({ code: z.string().min(1).max(40) })
      .parse(req.params);
    const body = z
      .object({
        name: z.string().min(1).max(80).optional(),
        description: z.string().max(500).nullable().optional(),
        permissions: z.record(z.array(z.string())).optional(),
      })
      .parse(req.body);
    return prisma.adminRole.update({
      where: { code },
      data: body as any,
    });
  });

  /** Supprime un rôle admin (refus si users assignés). */
  app.delete("/admin/roles/:code", async (req, reply) => {
    const { code } = z
      .object({ code: z.string().min(1).max(40) })
      .parse(req.params);
    const usersOnRole = await prisma.user.count({
      where: { adminRoleCode: code },
    });
    if (usersOnRole > 0) {
      return reply.code(409).send({
        error: "role_has_users",
        message: `Impossible : ${usersOnRole} utilisateur(s) ont ce rôle. Réassigne-les d'abord.`,
      });
    }
    await prisma.adminRole.delete({ where: { code } });
    return reply.code(204).send();
  });

  /** Assigne un rôle admin à un utilisateur. */
  app.post("/admin/users/:id/admin-role", async (req) => {
    const { id } = z
      .object({ id: z.string().uuid() })
      .parse(req.params);
    const { roleCode } = z
      .object({ roleCode: z.string().min(1).max(40).nullable() })
      .parse(req.body);
    if (roleCode !== null) {
      const role = await prisma.adminRole.findUnique({
        where: { code: roleCode },
      });
      if (!role) throw new Error("Rôle introuvable");
    }
    return prisma.user.update({
      where: { id },
      data: { adminRoleCode: roleCode },
      select: {
        id: true,
        displayName: true,
        adminRoleCode: true,
      },
    });
  });

  /* ===== Configuration site public (V23) =====
   * Singleton SiteConfig — supportEmail, privacyEmail, etc. éditables
   * depuis la console admin et exposés au site vitrine via /site-config.
   */

  /**
   * GET /admin/site-config — config singleton (créée à la volée si absente).
   *
   * `as any` : la propriété `siteConfig` est ajoutée par Prisma generate au
   * 1er run après merge — ce cast évite un échec TS quand on lit le code
   * AVANT d'avoir lancé `npm run db:generate`. À retirer si tu veux.
   */
  app.get("/admin/site-config", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = prisma as any;
    const existing = await p.siteConfig.findUnique({
      where: { id: "default" },
    });
    if (existing) return existing;
    return p.siteConfig.create({ data: { id: "default" } });
  });

  /**
   * PATCH /admin/site-config — modifie la config publique du site.
   * Tous les champs sont optionnels — on n'écrase que ce qui est fourni.
   * Invalide le cache /site-config (5 min TTL) pour que les changements
   * apparaissent immédiatement côté site vitrine.
   */
  app.patch("/admin/site-config", async (req) => {
    const body = z
      .object({
        supportEmail: z.string().email().optional(),
        privacyEmail: z.string().email().optional(),
        securityEmail: z.string().email().optional(),
        whatsappNumber: z.string().max(20).optional(),
        siteUrl: z.string().url().optional(),
        // V200 — Kill switch global du module Caisses Projet (CSSF/ACPR safe).
        // Quand false : toutes les routes /project-funds/* renvoient 404
        // instantanément, l'onglet « Caisses » disparaît du front au prochain
        // refresh. Aucun déploiement requis.
        projectFundsEnabled: z.boolean().optional(),
        // V200 — Seuil global (EUR) au-delà duquel un vote majoritaire des
        // contributeurs est requis avant d'exécuter une dépense de la caisse.
        // Override possible par caisse via ProjectFund.voteThreshold.
        projectFundsVoteThresholdEur: z
          .number()
          .positive()
          .max(100000)
          .optional(),
        // V212 — TEMPORAIRE : autorise l'endpoint test-add pour ajouter
        // des membres fictifs sans flow d'invitation. Désactiver avant prod.
        testModeEnabled: z.boolean().optional(),
      })
      .parse(req.body);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await (prisma as any).siteConfig.upsert({
      where: { id: "default" },
      create: { id: "default", ...(body as any) },
      update: body as any,
    });
    // Invalide le cache public pour propagation immédiate
    try {
      const { cacheDel } = await import("../../lib/cache.js");
      await cacheDel("site-config:public");
    } catch {
      /* cache module non chargé en dev — ignore */
    }
    // V213 — Si testModeEnabled change, on doit invalider les caches en
    // mémoire qui dépendent de ce flag (test-mode cache + plan-limits cache).
    // Sinon il faut attendre 10s/5min que les caches expirent naturellement.
    if (Object.prototype.hasOwnProperty.call(body, "testModeEnabled")) {
      try {
        const { invalidateTestModeCache } = await import("../../lib/test-mode.js");
        invalidateTestModeCache();
      } catch {
        /* ignore */
      }
      try {
        const { invalidatePlanCache } = await import("../../lib/plan-limits.js");
        invalidatePlanCache();
      } catch {
        /* ignore */
      }
    }
    return updated;
  });

  /* ===== Module Publicités (spec §6.4) ===== */

  /**
   * GET /admin/ads-config — config singleton (créée à la volée si absente).
   */
  app.get("/admin/ads-config", async () => {
    const existing = await prisma.adsConfig.findUnique({
      where: { id: "default" },
    });
    if (existing) return existing;
    return prisma.adsConfig.create({ data: { id: "default" } });
  });

  /**
   * PATCH /admin/ads-config — modifie la config publicités.
   */
  app.patch("/admin/ads-config", async (req) => {
    const body = z
      .object({
        enabled: z.boolean().optional(),
        enabledNetworks: z.array(z.string()).optional(),
        allowedCategories: z.array(z.string()).optional(),
        blockedCategories: z.array(z.string()).optional(),
        maxPerUserPerDay: z.number().int().min(0).max(50).optional(),
        interstitialEverySessions: z.number().int().min(1).max(100).optional(),
        enabledFormats: z.array(z.string()).optional(),
      })
      .parse(req.body);
    return prisma.adsConfig.upsert({
      where: { id: "default" },
      create: { id: "default", ...(body as any) },
      update: body as any,
    });
  });

  // ============================================================
  // A/B TESTING NOTIFICATIONS (spec §6.9)
  // ============================================================

  /**
   * GET /admin/ab-tests
   * Liste tous les tests A/B avec stats agrégées par variant.
   */
  app.get("/admin/ab-tests", async () => {
    const tests = await prisma.abTest.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        variants: {
          select: {
            id: true,
            code: true,
            payload: true,
            weight: true,
            conversions: true,
            _count: { select: { assignments: true } },
          },
        },
      },
    });
    return tests.map((t) => ({
      id: t.id,
      code: t.code,
      description: t.description,
      status: t.status,
      startedAt: t.startedAt?.toISOString() ?? null,
      completedAt: t.completedAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
      variants: t.variants.map((v) => ({
        id: v.id,
        code: v.code,
        payload: v.payload,
        weight: v.weight,
        assignments: v._count.assignments,
        conversions: v.conversions,
        conversionRate:
          v._count.assignments > 0
            ? Math.round((v.conversions / v._count.assignments) * 10000) / 100
            : 0,
      })),
    }));
  });

  /**
   * POST /admin/ab-tests
   * Crée un nouveau test A/B avec ses variants.
   * Body : { code, description?, variants: [{ code, payload, weight }] }
   */
  app.post("/admin/ab-tests", async (req) => {
    const body = z
      .object({
        code: z
          .string()
          .min(2)
          .max(80)
          .regex(/^[a-z0-9_]+$/, "Lettres minuscules, chiffres ou _ uniquement"),
        description: z.string().max(500).optional(),
        variants: z
          .array(
            z.object({
              code: z.string().min(1).max(40),
              payload: z.record(z.any()).default({}),
              weight: z.number().int().min(1).max(100).default(1),
            }),
          )
          .min(2)
          .max(10),
      })
      .parse(req.body);
    return prisma.abTest.create({
      data: {
        code: body.code,
        description: body.description,
        variants: {
          create: body.variants.map((v) => ({
            code: v.code,
            payload: v.payload as any,
            weight: v.weight,
          })),
        },
      },
      include: { variants: true },
    });
  });

  /**
   * PATCH /admin/ab-tests/:code
   * Change le statut (draft / running / paused / completed) d'un test.
   */
  app.patch("/admin/ab-tests/:code", async (req) => {
    const { code } = z
      .object({ code: z.string().min(2).max(80) })
      .parse(req.params);
    const body = z
      .object({
        status: z
          .enum(["draft", "running", "paused", "completed"])
          .optional(),
        description: z.string().max(500).optional(),
      })
      .parse(req.body);
    const data: any = {};
    if (body.status) {
      data.status = body.status;
      if (body.status === "running") data.startedAt = new Date();
      if (body.status === "completed") data.completedAt = new Date();
    }
    if (body.description !== undefined) data.description = body.description;
    return prisma.abTest.update({
      where: { code },
      data,
    });
  });

  /**
   * GET /admin/ads/stats?days=30
   * Agrégations eCPM par catégorie/régie + corrélation churn (spec §6.4).
   * eCPM = (revenue total / nombre d'impressions) × 1000
   */
  app.get("/admin/ads/stats", async (req) => {
    const { days } = z
      .object({ days: z.coerce.number().int().min(1).max(365).default(30) })
      .parse(req.query);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const impressions = await prisma.adImpression.findMany({
      where: { createdAt: { gte: since } },
      select: {
        network: true,
        category: true,
        format: true,
        event: true,
        revenueCents: true,
      },
    });

    // Agrégat par catégorie
    const byCategory = new Map<
      string,
      { impressions: number; clicks: number; revenueCents: number }
    >();
    const byNetwork = new Map<
      string,
      { impressions: number; clicks: number; revenueCents: number }
    >();
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalRevenueCents = 0;

    for (const i of impressions) {
      const isClick = i.event === "click";
      const isImp = i.event === "impression";
      if (!byCategory.has(i.category)) {
        byCategory.set(i.category, { impressions: 0, clicks: 0, revenueCents: 0 });
      }
      if (!byNetwork.has(i.network)) {
        byNetwork.set(i.network, { impressions: 0, clicks: 0, revenueCents: 0 });
      }
      const cat = byCategory.get(i.category)!;
      const net = byNetwork.get(i.network)!;
      if (isImp) {
        cat.impressions++;
        net.impressions++;
        totalImpressions++;
      }
      if (isClick) {
        cat.clicks++;
        net.clicks++;
        totalClicks++;
      }
      cat.revenueCents += i.revenueCents;
      net.revenueCents += i.revenueCents;
      totalRevenueCents += i.revenueCents;
    }

    function computeECPM(impr: number, revCents: number): number {
      if (impr === 0) return 0;
      return Math.round((revCents / impr) * 1000) / 100; // en cents → eCPM
    }

    return {
      scope: `${days}j`,
      totals: {
        impressions: totalImpressions,
        clicks: totalClicks,
        revenueCents: totalRevenueCents,
        ctr:
          totalImpressions > 0
            ? Math.round((totalClicks / totalImpressions) * 10000) / 100
            : 0,
        ecpmCents: computeECPM(totalImpressions, totalRevenueCents),
      },
      byCategory: Array.from(byCategory.entries())
        .map(([cat, agg]) => ({
          category: cat,
          impressions: agg.impressions,
          clicks: agg.clicks,
          revenueCents: agg.revenueCents,
          ecpmCents: computeECPM(agg.impressions, agg.revenueCents),
        }))
        .sort((a, b) => b.revenueCents - a.revenueCents),
      byNetwork: Array.from(byNetwork.entries())
        .map(([net, agg]) => ({
          network: net,
          impressions: agg.impressions,
          clicks: agg.clicks,
          revenueCents: agg.revenueCents,
          ecpmCents: computeECPM(agg.impressions, agg.revenueCents),
        }))
        .sort((a, b) => b.revenueCents - a.revenueCents),
    };
  });

  // ============================================================
  // Audit log global (spec §3.6 / §6.10 / §9.1)
  // ============================================================
  // Toutes les ActivityLog de tous les groupes, paginées,
  // avec vérification d'intégrité de la chaîne hash.
  //
  // GET /admin/audit-log?limit=50&offset=0&groupId=&kind=
  app.get("/admin/audit-log", async (req) => {
    const q = z
      .object({
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
        groupId: z.string().uuid().optional(),
        kind: z.string().optional(),
      })
      .parse(req.query);

    const where: any = {};
    if (q.groupId) where.groupId = q.groupId;
    if (q.kind) where.kind = q.kind;

    const [items, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: q.limit,
        skip: q.offset,
        include: {
          actor: { select: { id: true, displayName: true } },
          group: { select: { id: true, name: true } },
        },
      }),
      prisma.activityLog.count({ where }),
    ]);

    return {
      items: items.map((e) => ({
        id: e.id,
        kind: e.kind,
        groupId: e.groupId,
        groupName: e.group.name,
        actorId: e.actorId,
        actorName: e.actor?.displayName ?? null,
        payload: e.payload,
        createdAt: e.createdAt.toISOString(),
        hasHash: Boolean(e.selfHash),
      })),
      total,
      limit: q.limit,
      offset: q.offset,
    };
  });

  // ============================================================
  // CMS Traductions (spec §6.6) — éditeur ligne par ligne admin
  // ============================================================

  app.get("/admin/translations", async (req) => {
    const q = z
      .object({
        locale: z.string().optional(),
        search: z.string().optional(),
      })
      .parse(req.query);
    const where: any = {};
    if (q.locale) where.locale = q.locale;
    if (q.search) {
      where.OR = [
        { key: { contains: q.search, mode: "insensitive" } },
        { value: { contains: q.search, mode: "insensitive" } },
      ];
    }
    const items = await prisma.translation.findMany({
      where,
      orderBy: [{ key: "asc" }, { locale: "asc" }],
      take: 500,
    });
    return items.map((t) => ({
      key: t.key,
      locale: t.locale,
      value: t.value,
      context: t.context,
      updatedAt: t.updatedAt.toISOString(),
    }));
  });

  app.put("/admin/translations/:key/:locale", async (req) => {
    const { key, locale } = z
      .object({
        key: z.string().min(1).max(200),
        locale: z.string().min(2).max(10),
      })
      .parse(req.params);
    const body = z
      .object({
        value: z.string().max(5000),
        context: z.string().max(500).optional(),
      })
      .parse(req.body);
    const updated = await prisma.translation.upsert({
      where: { key_locale: { key, locale } },
      create: {
        key,
        locale,
        value: body.value,
        context: body.context,
        updatedById: req.user.sub,
      },
      update: {
        value: body.value,
        context: body.context,
        updatedById: req.user.sub,
      },
    });
    return {
      key: updated.key,
      locale: updated.locale,
      value: updated.value,
      context: updated.context,
      updatedAt: updated.updatedAt.toISOString(),
    };
  });

  app.delete("/admin/translations/:key/:locale", async (req, reply) => {
    const { key, locale } = z
      .object({
        key: z.string().min(1).max(200),
        locale: z.string().min(2).max(10),
      })
      .parse(req.params);
    await prisma.translation.deleteMany({ where: { key, locale } });
    return reply.code(204).send();
  });

  // ============================================================
  // Locales · activation/désactivation des langues (spec §6.6)
  // ============================================================

  app.get("/admin/locales", async () => {
    const locales = await prisma.locale.findMany({
      orderBy: [{ displayOrder: "asc" }, { code: "asc" }],
    });
    return locales.map((l) => ({
      code: l.code,
      name: l.name,
      flag: l.flag,
      isActive: l.isActive,
      direction: l.direction,
      displayOrder: l.displayOrder,
    }));
  });

  /**
   * POST /admin/locales — créer une nouvelle langue (au-delà du seed)
   * Permet d'ajouter des langues qui ne sont pas dans le code source
   * (ex: variantes régionales, dialectes, créoles…) sans déployer.
   */
  app.post("/admin/locales", async (req, reply) => {
    const body = z
      .object({
        code: z
          .string()
          .min(2)
          .max(10)
          .regex(/^[a-z]{2}(-[a-z]{2,4})?$/i, {
            message:
              'Format ISO 639-1 (ex: "fr") ou ISO + région (ex: "fr-CM")',
          }),
        name: z.string().min(1).max(80),
        flag: z.string().min(1).max(8),
        direction: z.enum(["ltr", "rtl"]).default("ltr"),
        displayOrder: z.number().int().min(0).max(999).default(100),
      })
      .parse(req.body);
    const code = body.code.toLowerCase();
    const existing = await prisma.locale.findUnique({ where: { code } });
    if (existing) {
      throw Errors.alreadyExists({
        what: `Une langue avec le code "${code}"`,
        tip: "Modifie-la depuis la liste plutôt que d'en créer une autre.",
      });
    }
    const created = await prisma.locale.create({
      data: { ...body, code },
    });
    return reply.code(201).send({
      code: created.code,
      name: created.name,
      flag: created.flag,
      isActive: created.isActive,
      direction: created.direction,
      displayOrder: created.displayOrder,
    });
  });

  /**
   * DELETE /admin/locales/:code — supprime une langue (et ses traductions associées)
   * Utiliser avec prudence : les utilisateurs avec defaultLocale = ce code
   * seront automatiquement basculés sur "fr" au prochain login.
   */
  app.delete("/admin/locales/:code", async (req, reply) => {
    const { code } = z
      .object({ code: z.string().min(2).max(10) })
      .parse(req.params);
    if (code === "fr") {
      throw Errors.badRequest(
        "On ne peut pas supprimer le français — c'est la langue de référence 🇫🇷",
      );
    }
    await prisma.$transaction([
      prisma.translation.deleteMany({ where: { locale: code } }),
      prisma.locale.delete({ where: { code } }),
    ]);
    return reply.code(204).send();
  });

  app.patch("/admin/locales/:code", async (req) => {
    const { code } = z
      .object({ code: z.string().min(2).max(10) })
      .parse(req.params);
    const body = z
      .object({
        isActive: z.boolean().optional(),
        displayOrder: z.number().int().min(0).max(999).optional(),
        name: z.string().min(1).max(80).optional(),
        flag: z.string().min(1).max(8).optional(),
        direction: z.enum(["ltr", "rtl"]).optional(),
      })
      .parse(req.body);
    const updated = await prisma.locale.update({
      where: { code },
      data: body,
    });
    return {
      code: updated.code,
      name: updated.name,
      flag: updated.flag,
      isActive: updated.isActive,
      direction: updated.direction,
      displayOrder: updated.displayOrder,
    };
  });

  /**
   * POST /admin/translations/auto-translate
   * Spec §6.6 — auto-traduction IA pour première passe.
   * Body : { fromLocale, toLocale, keys?[] }
   *
   * Si `keys` est omis, traduit toutes les clés présentes en `fromLocale`
   * et manquantes en `toLocale`. Sinon traduit seulement la liste donnée.
   *
   * Stratégie : utilise GPT-4o-mini avec un prompt système qui demande de
   * traduire en gardant la même tonalité + les placeholders {name}.
   * Marque les traductions générées avec context="ia_draft" pour qu'un
   * relecteur natif puisse les reviewer avant d'enlever le drapeau.
   */
  app.post("/admin/translations/auto-translate", async (req) => {
    const body = z
      .object({
        fromLocale: z.string().min(2).max(10).default("fr"),
        toLocale: z.string().min(2).max(10),
        keys: z.array(z.string()).optional(),
      })
      .parse(req.body);
    const { autoTranslateKeys } = await import(
      "../cms/auto-translate.service.js"
    );
    const result = await autoTranslateKeys({
      fromLocale: body.fromLocale.toLowerCase(),
      toLocale: body.toLocale.toLowerCase(),
      keys: body.keys,
      actorUserId: req.user.sub,
    });
    return result;
  });

  /**
   * GET /admin/translations/coverage
   * % de complétude par langue. "Référence" = ensemble des keys distincts
   * présents en base, toutes locales confondues.
   */
  app.get("/admin/translations/coverage", async () => {
    const all = await prisma.translation.findMany({
      select: { key: true, locale: true },
    });
    const allKeys = new Set(all.map((t) => t.key));
    const totalKeys = allKeys.size;
    const byLocale = new Map<string, Set<string>>();
    for (const t of all) {
      let set = byLocale.get(t.locale);
      if (!set) {
        set = new Set();
        byLocale.set(t.locale, set);
      }
      set.add(t.key);
    }
    const locales = await prisma.locale.findMany({
      orderBy: [{ displayOrder: "asc" }, { code: "asc" }],
    });
    return {
      totalKeys,
      locales: locales.map((l) => {
        const present = byLocale.get(l.code)?.size ?? 0;
        return {
          code: l.code,
          name: l.name,
          flag: l.flag,
          isActive: l.isActive,
          present,
          missing: Math.max(0, totalKeys - present),
          percent:
            totalKeys === 0
              ? 100
              : Math.round((present / totalKeys) * 100),
        };
      }),
    };
  });

  // GET /admin/audit-log/verify-all — vérifie l'intégrité de chaque groupe
  // Coût : O(n) — appelable à la demande (pas en hot path).
  app.get("/admin/audit-log/verify-all", async () => {
    const { verifyActivityChain } = await import(
      "../groups/groups.service.js"
    );
    const groups = await prisma.group.findMany({
      select: { id: true, name: true, createdById: true },
    });
    const results: Array<{
      groupId: string;
      groupName: string;
      valid: boolean;
      count: number;
      brokenAt?: number;
    }> = [];
    for (const g of groups) {
      // On passe le createdById comme actor pour bypasser la check de rôle
      // (c'est de toute façon un super admin qui appelle cette route)
      const r = await verifyActivityChain({
        groupId: g.id,
        actorUserId: g.createdById,
      });
      results.push({
        groupId: g.id,
        groupName: g.name,
        valid: r.valid,
        count: r.count,
        ...(r.brokenAt !== undefined ? { brokenAt: r.brokenAt } : {}),
      });
    }
    return {
      checkedAt: new Date().toISOString(),
      totalGroups: groups.length,
      validGroups: results.filter((r) => r.valid).length,
      brokenGroups: results.filter((r) => !r.valid),
      results,
    };
  });

  // ============================================================
  // FX rates · surcharge manuelle + historique audit (spec §6.5)
  // ============================================================

  /**
   * GET /admin/fx-rates
   * Liste tous les taux actuels avec source (provider / fixed / manual_override).
   */
  app.get("/admin/fx-rates", async () => {
    const rates = await prisma.fxRate.findMany({
      orderBy: { code: "asc" },
    });
    return rates.map((r) => ({
      code: r.code,
      rateToEur: r.rateToEur.toString(),
      source: r.source,
      fetchedAt: r.fetchedAt.toISOString(),
    }));
  });

  /**
   * PATCH /admin/fx-rates/:code
   * Body: { rateToEur: number, note?: string }
   * Surcharge manuelle d'un taux. Le scheduler FX ne réécrasera pas la valeur
   * tant que source = "manual_override". Pour revenir à la source provider,
   * appeler DELETE /admin/fx-rates/:code/override.
   */
  app.patch("/admin/fx-rates/:code", async (req) => {
    const { code } = z
      .object({ code: z.string().length(3) })
      .parse(req.params);
    const body = z
      .object({
        rateToEur: z.coerce.number().positive().finite(),
        note: z.string().max(500).optional(),
      })
      .parse(req.body);

    const existing = await prisma.fxRate.findUnique({
      where: { code: code.toUpperCase() },
    });
    if (!existing) {
      throw Errors.notFound(`Devise ${code.toUpperCase()} introuvable`);
    }

    const previousRate = existing.rateToEur;
    const updated = await prisma.fxRate.update({
      where: { code: code.toUpperCase() },
      data: {
        rateToEur: body.rateToEur as any,
        source: "manual_override",
        fetchedAt: new Date(),
      },
    });

    // Audit trail
    await prisma.fxRateHistory.create({
      data: {
        code: code.toUpperCase(),
        previousRate,
        newRate: body.rateToEur as any,
        source: "manual_override",
        actorId: req.user.sub,
        note: body.note ?? null,
      },
    });

    return {
      code: updated.code,
      rateToEur: updated.rateToEur.toString(),
      source: updated.source,
      fetchedAt: updated.fetchedAt.toISOString(),
    };
  });

  /**
   * DELETE /admin/fx-rates/:code/override
   * Lève la surcharge manuelle : la prochaine itération du scheduler FX
   * refixera la valeur depuis le provider. Ne supprime PAS l'historique.
   */
  app.delete("/admin/fx-rates/:code/override", async (req) => {
    const { code } = z
      .object({ code: z.string().length(3) })
      .parse(req.params);
    const updated = await prisma.fxRate.update({
      where: { code: code.toUpperCase() },
      data: { source: "provider" },
    });
    await prisma.fxRateHistory.create({
      data: {
        code: code.toUpperCase(),
        previousRate: updated.rateToEur,
        newRate: updated.rateToEur,
        source: "provider",
        actorId: req.user.sub,
        note: "Override admin levé — refresh provider au prochain tick",
      },
    });
    return { code: updated.code, source: updated.source };
  });

  /**
   * GET /admin/fx-rates/:code/history
   * Historique complet des modifications du taux pour audit.
   */
  app.get("/admin/fx-rates/:code/history", async (req) => {
    const { code } = z
      .object({ code: z.string().length(3) })
      .parse(req.params);
    const limit = z
      .object({
        limit: z.coerce.number().int().min(1).max(200).default(100),
      })
      .parse(req.query).limit;
    const items = await prisma.fxRateHistory.findMany({
      where: { code: code.toUpperCase() },
      orderBy: { changedAt: "desc" },
      take: limit,
    });
    // Joindre les noms des actors pour l'UI
    const actorIds = Array.from(
      new Set(items.map((i) => i.actorId).filter((id): id is string => !!id)),
    );
    const actors =
      actorIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: actorIds } },
            select: { id: true, displayName: true },
          })
        : [];
    const actorMap = new Map(actors.map((a) => [a.id, a.displayName]));
    return items.map((i) => ({
      id: i.id,
      previousRate: i.previousRate.toString(),
      newRate: i.newRate.toString(),
      source: i.source,
      actorId: i.actorId,
      actorName: i.actorId ? (actorMap.get(i.actorId) ?? null) : null,
      note: i.note,
      changedAt: i.changedAt.toISOString(),
    }));
  });
}
