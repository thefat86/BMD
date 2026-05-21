/**
 * Search routes (Sprint AC-3) — recherche unifiée par transcript.
 *
 * Cherche dans :
 *   - ExpenseAttachment.transcript (preuves audio marché transcrites par Whisper)
 *   - MeetingRecord.transcript et summary (réunions enregistrées)
 *   - Expense.description (libellé saisi)
 *
 * Scope : uniquement les groupes dont l'utilisateur est membre.
 *
 * Performance :
 *   - Recherche LIKE %q% sur PostgreSQL (acceptable jusqu'à ~100k records).
 *   - Si volumétrie devient un souci, on bascule sur tsvector + GIN index
 *     dans une itération ultérieure (les colonnes existent déjà).
 *   - Pagination 20/page pour limiter la taille des réponses.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/db.js";

interface SearchHit {
  kind: "EXPENSE" | "ATTACHMENT_TRANSCRIPT" | "MEETING";
  id: string; // id de l'objet trouvé
  groupId: string;
  groupName: string;
  /** Snippet de texte autour du match (centré sur le mot recherché) */
  snippet: string;
  /** Lien profond pour ouvrir l'objet */
  link: string;
  /** Date pour tri */
  occurredAt: string;
}

/**
 * Génère un extrait de texte centré autour du mot recherché (style Google).
 * On garde ~120 caractères avant + après pour donner du contexte.
 */
function snippetAround(haystack: string, needle: string): string {
  if (!haystack || !needle) return haystack?.slice(0, 240) ?? "";
  const idx = haystack.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) return haystack.slice(0, 240);
  const start = Math.max(0, idx - 120);
  const end = Math.min(haystack.length, idx + needle.length + 120);
  let s = haystack.slice(start, end);
  if (start > 0) s = "…" + s;
  if (end < haystack.length) s = s + "…";
  return s;
}

export async function searchRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  /**
   * GET /me/search?q=...&limit=20&offset=0
   *
   * Recherche dans toutes les données textuelles indexables des groupes du user.
   */
  app.get("/me/search", async (req) => {
    const query = z
      .object({
        q: z.string().min(2).max(200),
        limit: z.coerce.number().int().min(1).max(50).default(20),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(req.query);
    const meId = (req.user as any).sub;

    // 1. Liste des groupes auxquels l'user appartient
    const memberships = await prisma.groupMember.findMany({
      where: { userId: meId },
      select: { group: { select: { id: true, name: true } } },
    });
    const groupIds = memberships.map((m) => m.group.id);
    const groupsById = new Map(
      memberships.map((m) => [m.group.id, m.group.name]),
    );
    if (groupIds.length === 0) {
      return { results: [], total: 0 };
    }

    const q = query.q;
    const hits: SearchHit[] = [];

    // 2. Match sur Expense.description (libellé)
    const expenses = await prisma.expense.findMany({
      where: {
        groupId: { in: groupIds },
        description: { contains: q, mode: "insensitive" },
      },
      select: {
        id: true,
        description: true,
        groupId: true,
        occurredAt: true,
      },
      orderBy: { occurredAt: "desc" },
      take: query.limit,
    });
    for (const e of expenses) {
      hits.push({
        kind: "EXPENSE",
        id: e.id,
        groupId: e.groupId,
        groupName: groupsById.get(e.groupId) ?? "",
        snippet: snippetAround(e.description, q),
        link: `/dashboard/groups/${e.groupId}#expense-${e.id}`,
        occurredAt: e.occurredAt.toISOString(),
      });
    }

    // 3. Match sur ExpenseAttachment.transcript (preuves audio marché)
    const attachments = await (prisma as any).expenseAttachment.findMany({
      where: {
        transcript: { contains: q, mode: "insensitive" },
        expense: { groupId: { in: groupIds } },
      },
      select: {
        id: true,
        transcript: true,
        expense: {
          select: { id: true, groupId: true, description: true, occurredAt: true },
        },
      },
      take: query.limit,
    });
    for (const a of attachments as Array<any>) {
      hits.push({
        kind: "ATTACHMENT_TRANSCRIPT",
        id: a.id,
        groupId: a.expense.groupId,
        groupName: groupsById.get(a.expense.groupId) ?? "",
        snippet: snippetAround(a.transcript ?? "", q),
        link: `/dashboard/groups/${a.expense.groupId}#expense-${a.expense.id}`,
        occurredAt: a.expense.occurredAt.toISOString(),
      });
    }

    // 4. Match sur MeetingRecord.transcript ET summary
    const meetings = await (prisma as any).meetingRecord.findMany({
      where: {
        groupId: { in: groupIds },
        OR: [
          { transcript: { contains: q, mode: "insensitive" } },
          { summary: { contains: q, mode: "insensitive" } },
          { title: { contains: q, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        title: true,
        groupId: true,
        occurredAt: true,
        transcript: true,
        summary: true,
      },
      take: query.limit,
    });
    for (const m of meetings as Array<any>) {
      // Privilégie le snippet du transcript s'il match, sinon summary, sinon title
      const source = (m.transcript ?? "").toLowerCase().includes(q.toLowerCase())
        ? m.transcript
        : (m.summary ?? "").toLowerCase().includes(q.toLowerCase())
          ? m.summary
          : m.title;
      hits.push({
        kind: "MEETING",
        id: m.id,
        groupId: m.groupId,
        groupName: groupsById.get(m.groupId) ?? "",
        snippet: snippetAround(source ?? "", q),
        link: `/dashboard/groups/${m.groupId}/meetings/${m.id}`,
        occurredAt: m.occurredAt.toISOString(),
      });
    }

    // 5. Tri par date desc, puis pagination
    hits.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    const paginated = hits.slice(query.offset, query.offset + query.limit);

    return { results: paginated, total: hits.length };
  });
}
