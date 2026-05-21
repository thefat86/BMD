/**
 * V162 — Service génération PDF brandé BMD pour le compte rendu de réunion.
 *
 * Sections optionnelles (toutes activables/désactivables côté client) :
 *   - Décisions extraites par l'IA
 *   - Résumé court
 *   - Compte rendu narratif détaillé
 *   - Transcription complète (Whisper)
 *
 * Design : palette V45-light BMD (saffron + cocoa + ivory + emerald),
 * Helvetica via pdf-lib (Cormorant non embarqué, on fait jouer la
 * composition pour rester chic).
 *
 * Permission : tous les membres du groupe peuvent télécharger (lecture seule).
 *
 * Note Markdown : on parse un sous-ensemble léger (## titres, ### sous-titres,
 * paragraphes, listes "- "). Pas de rendu HTML — on dessine en pur PDF.
 */

import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import { prisma as prismaClient } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";
// V163 — Helper logo unifié (BMD par défaut, custom si abonnement actif)
import { drawGroupLogo, hasActiveCustomLogo } from "../../lib/pdf-logo.js";

const prisma = prismaClient as any;

// Palette BMD V45-light (alignée avec debt-certificate.service.ts)
const COLOR_COCOA = rgb(43 / 255, 31 / 255, 21 / 255);
const COLOR_COCOA_SOFT = rgb(107 / 255, 90 / 255, 71 / 255);
const COLOR_SAFFRON = rgb(197 / 255, 138 / 255, 46 / 255);
const COLOR_SAFFRON_STRONG = rgb(133 / 255, 79 / 255, 11 / 255);
const COLOR_EMERALD = rgb(15 / 255, 110 / 255, 86 / 255);
const COLOR_TERRACOTTA = rgb(159 / 255, 70 / 255, 40 / 255);
const COLOR_IVORY = rgb(251 / 255, 246 / 255, 236 / 255);
const COLOR_PAPER = rgb(246 / 255, 232 / 255, 197 / 255); // saffron-pale
const COLOR_MUTED = rgb(107 / 255, 90 / 255, 71 / 255);
const COLOR_HAIRLINE = rgb(0.85, 0.78, 0.65);

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

export interface MeetingPdfSections {
  /** Partie 1 — Résumé de la discussion */
  summary?: boolean;
  /** Partie 2 — Décisions prises */
  decisions?: boolean;
  /** Partie 3 — Next steps / actions à prendre (V218.H) */
  nextSteps?: boolean;
  /** Partie 4 — Compte rendu détaillé (anciennement `minutes`) */
  minutes?: boolean;
  /** Partie 5 — Transcription complète (verbatim Whisper) */
  transcript?: boolean;
}

export interface MeetingPdfInput {
  meetingId: string;
  actorUserId: string;
  sections: MeetingPdfSections;
}

export async function generateMeetingMinutesPdf(
  input: MeetingPdfInput,
): Promise<Uint8Array> {
  const meeting = await prisma.meetingRecord.findUnique({
    where: { id: input.meetingId },
    include: {
      group: {
        select: {
          id: true,
          name: true,
          defaultCurrency: true,
          // V163 — Récupère l'état custom logo pour décider du branding PDF
          customLogoUrl: true,
          customLogoActiveUntil: true,
          members: {
            select: {
              userId: true,
              user: { select: { id: true, displayName: true } },
            },
          },
        },
      },
      createdBy: { select: { id: true, displayName: true } },
    },
  });
  if (!meeting) throw Errors.notFound("Réunion introuvable");

  // Permission : tout membre du groupe peut télécharger
  const isMember = meeting.group.members.some(
    (m: any) => m.userId === input.actorUserId,
  );
  if (!isMember) {
    throw Errors.forbidden(
      "Tu n'es pas membre du groupe de cette réunion",
    );
  }

  // Lookup userId → displayName pour les décisions
  const userById = new Map<string, string>();
  for (const m of meeting.group.members) {
    userById.set(m.userId, m.user?.displayName ?? "Membre");
  }

  // ========== Création PDF ==========
  const pdf = await PDFDocument.create();
  pdf.setTitle(`BMD · Compte rendu — ${meeting.title}`);
  pdf.setAuthor("BMD — Back Mes Do");
  pdf.setProducer("BMD app · meeting-minutes-pdf v1");
  pdf.setSubject("Compte rendu de réunion");

  const fontReg = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  // Contexte de rendu mutable : on saute de page automatiquement
  const ctx: RenderCtx = {
    pdf,
    page: pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    y: 0,
    pageNumber: 1,
    fontReg,
    fontBold,
    fontItalic,
  };

  drawPageChrome(ctx);
  ctx.y = PAGE_HEIGHT - 50;

  await drawHeader(ctx, meeting);

  // Bandeau métadonnées (date + groupe + organisateur)
  ctx.y -= 20;
  drawMetadataBand(ctx, meeting);

  // ========== Sections (V218.H — ordre des 5 parties) ==========
  // 1. Résumé de la discussion
  // 2. Décisions prises
  // 3. Next steps / actions à prendre
  // 4. Compte rendu détaillé
  // 5. Transcription complète (verbatim brut)
  const sections = {
    summary: input.sections.summary !== false,
    decisions: input.sections.decisions !== false,
    nextSteps: input.sections.nextSteps !== false,
    minutes: input.sections.minutes !== false,
    transcript: input.sections.transcript === true,
  };

  // V218.H — `detailedReport` est le champ moderne, on retombe sur `minutes`
  // pour les anciennes réunions générées avant V218.
  const detailedReport: string =
    typeof (meeting as any).detailedReport === "string" &&
    (meeting as any).detailedReport.length > 0
      ? (meeting as any).detailedReport
      : meeting.minutes ?? "";
  const nextSteps: any[] = Array.isArray((meeting as any).nextSteps)
    ? (meeting as any).nextSteps
    : [];

  if (sections.summary && meeting.summary) {
    drawSectionTitle(ctx, "Partie 1 — Résumé de la discussion");
    drawParagraph(ctx, meeting.summary, fontReg, 11, COLOR_COCOA);
  }

  if (sections.decisions) {
    drawSectionTitle(ctx, "Partie 2 — Décisions prises");
    drawDecisions(ctx, meeting, userById);
  }

  if (sections.nextSteps) {
    drawSectionTitle(ctx, "Partie 3 — Next steps / actions à prendre");
    drawNextSteps(ctx, nextSteps, userById);
  }

  if (sections.minutes && detailedReport) {
    drawSectionTitle(ctx, "Partie 4 — Compte rendu détaillé");
    drawMarkdownLight(ctx, detailedReport);
  }

  if (sections.transcript && meeting.transcript) {
    drawSectionTitle(ctx, "Partie 5 — Transcription complète");
    drawParagraph(ctx, meeting.transcript, fontReg, 9, COLOR_COCOA_SOFT, {
      lineGap: 2,
    });
  }

  // Footer sur toutes les pages (numéro + brand)
  // On le redessine maintenant en réécrivant la page courante.
  drawFooterAllPages(pdf, fontReg, fontItalic);

  return pdf.save();
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

interface RenderCtx {
  pdf: PDFDocument;
  page: PDFPage;
  y: number;
  pageNumber: number;
  fontReg: PDFFont;
  fontBold: PDFFont;
  fontItalic: PDFFont;
}

const BOTTOM_LIMIT = MARGIN + 40; // garde de la place pour footer

function ensureSpace(ctx: RenderCtx, needed: number) {
  if (ctx.y - needed < BOTTOM_LIMIT) {
    ctx.page = ctx.pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    ctx.pageNumber += 1;
    drawPageChrome(ctx);
    ctx.y = PAGE_HEIGHT - 50;
  }
}

function drawPageChrome(ctx: RenderCtx) {
  // Bandeau saffron du haut (fin, élégant)
  ctx.page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 8,
    width: PAGE_WIDTH,
    height: 8,
    color: COLOR_SAFFRON,
  });
  // Bandeau cocoa du bas (sceau)
  ctx.page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_WIDTH,
    height: 4,
    color: COLOR_COCOA,
  });
}

function drawLogo(page: PDFPage, x: number, y: number, fontBold: PDFFont) {
  // Carré saffron 26×26 avec "B" ivoire centré.
  page.drawRectangle({
    x,
    y,
    width: 26,
    height: 26,
    color: COLOR_SAFFRON,
  });
  const letter = "B";
  const w = fontBold.widthOfTextAtSize(letter, 16);
  page.drawText(letter, {
    x: x + (26 - w) / 2,
    y: y + 6,
    size: 16,
    font: fontBold,
    color: COLOR_IVORY,
  });
}

async function drawHeader(ctx: RenderCtx, meeting: any) {
  // V163 — Logo dynamique : custom (si abonnement actif) ou BMD par défaut.
  await drawGroupLogo({
    pdf: ctx.pdf,
    page: ctx.page,
    group: meeting.group,
    x: MARGIN,
    y: ctx.y - 20,
    fontBold: ctx.fontBold,
    size: 26,
  });

  // V163 — Wordmark masqué quand un logo custom est utilisé (le client a payé
  // pour SA marque sur le doc, on retire "BMD" pour ne pas créer de confusion).
  // Le tagline reste car légalement on doit garder une trace "Généré par BMD".
  const showBmdWordmark = !hasActiveCustomLogo(meeting.group);
  if (showBmdWordmark) {
    ctx.page.drawText("BMD", {
      x: MARGIN + 34,
      y: ctx.y - 12,
      size: 20,
      font: ctx.fontBold,
      color: COLOR_COCOA,
    });
  }
  ctx.page.drawText(
    showBmdWordmark
      ? "Back Mes Do · L'argent partagé, l'amitié protégée."
      : "Compte rendu officiel · Généré via BMD",
    {
      x: MARGIN + 34,
      y: ctx.y - 24,
      size: 8,
      font: ctx.fontItalic,
      color: COLOR_MUTED,
    },
  );

  // En haut à droite : badge "COMPTE RENDU"
  const badge = "COMPTE RENDU";
  const badgeSize = 8;
  const badgeW = ctx.fontBold.widthOfTextAtSize(badge, badgeSize);
  const badgePaddingX = 10;
  const badgeH = 18;
  const badgeX = PAGE_WIDTH - MARGIN - (badgeW + badgePaddingX * 2);
  const badgeY = ctx.y - 4 - badgeH;
  ctx.page.drawRectangle({
    x: badgeX,
    y: badgeY,
    width: badgeW + badgePaddingX * 2,
    height: badgeH,
    color: COLOR_PAPER,
    borderColor: COLOR_SAFFRON,
    borderWidth: 1,
  });
  ctx.page.drawText(badge, {
    x: badgeX + badgePaddingX,
    y: badgeY + 5,
    size: badgeSize,
    font: ctx.fontBold,
    color: COLOR_SAFFRON_STRONG,
  });

  ctx.y -= 50;

  // Titre de la réunion (gros, cocoa)
  const titleSize = 22;
  // Wrap si trop long
  const titleLines = wrapText(
    meeting.title || "Réunion",
    ctx.fontBold,
    titleSize,
    CONTENT_WIDTH,
  );
  for (const line of titleLines.slice(0, 2)) {
    ctx.page.drawText(line, {
      x: MARGIN,
      y: ctx.y,
      size: titleSize,
      font: ctx.fontBold,
      color: COLOR_COCOA,
    });
    ctx.y -= titleSize + 4;
  }
}

function drawMetadataBand(ctx: RenderCtx, meeting: any) {
  const occurred = new Date(meeting.occurredAt);
  const dateStr = occurred.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const items: Array<{ label: string; value: string }> = [
    { label: "Date", value: dateStr },
    { label: "Groupe", value: meeting.group?.name ?? "—" },
    {
      label: "Organisateur",
      value: meeting.createdBy?.displayName ?? "—",
    },
  ];
  if (meeting.durationSeconds) {
    const m = Math.floor(meeting.durationSeconds / 60);
    items.push({ label: "Durée", value: `${m} min` });
  }

  const bandHeight = 36;
  ensureSpace(ctx, bandHeight + 10);

  ctx.page.drawRectangle({
    x: MARGIN,
    y: ctx.y - bandHeight,
    width: CONTENT_WIDTH,
    height: bandHeight,
    color: COLOR_PAPER,
    borderColor: COLOR_HAIRLINE,
    borderWidth: 0.5,
  });

  const colW = CONTENT_WIDTH / items.length;
  items.forEach((it, idx) => {
    const x = MARGIN + 12 + colW * idx;
    ctx.page.drawText(it.label.toUpperCase(), {
      x,
      y: ctx.y - 14,
      size: 7,
      font: ctx.fontBold,
      color: COLOR_MUTED,
    });
    ctx.page.drawText(truncate(it.value, 26), {
      x,
      y: ctx.y - 27,
      size: 10,
      font: ctx.fontBold,
      color: COLOR_COCOA,
    });
  });

  ctx.y -= bandHeight + 18;

  if (meeting.manuallyEditedAt) {
    const editedAt = new Date(meeting.manuallyEditedAt).toLocaleDateString(
      "fr-FR",
      { day: "2-digit", month: "long", year: "numeric" },
    );
    const noteText = `✎ Édité manuellement le ${editedAt}`;
    ctx.page.drawText(noteText, {
      x: MARGIN,
      y: ctx.y,
      size: 8,
      font: ctx.fontItalic,
      color: COLOR_SAFFRON_STRONG,
    });
    ctx.y -= 12;
  }
}

function drawSectionTitle(ctx: RenderCtx, title: string) {
  ensureSpace(ctx, 30);
  ctx.y -= 14;
  // Petit accent saffron à gauche
  ctx.page.drawRectangle({
    x: MARGIN - 4,
    y: ctx.y,
    width: 3,
    height: 14,
    color: COLOR_SAFFRON,
  });
  ctx.page.drawText(title, {
    x: MARGIN + 4,
    y: ctx.y + 1,
    size: 14,
    font: ctx.fontBold,
    color: COLOR_COCOA,
  });
  ctx.y -= 12;
  // Hairline sous le titre
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE_WIDTH - MARGIN, y: ctx.y },
    thickness: 0.4,
    color: COLOR_HAIRLINE,
  });
  ctx.y -= 12;
}

function drawParagraph(
  ctx: RenderCtx,
  text: string,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
  opts?: { lineGap?: number; indent?: number },
) {
  const lineGap = opts?.lineGap ?? 4;
  const indent = opts?.indent ?? 0;
  const maxW = CONTENT_WIDTH - indent;
  // Split sur les sauts de ligne d'origine (pour respecter la mise en page)
  const blocks = text.split(/\n\s*\n/);
  for (const block of blocks) {
    const cleaned = block.replace(/\s+/g, " ").trim();
    if (!cleaned) continue;
    const lines = wrapText(cleaned, font, size, maxW);
    for (const line of lines) {
      ensureSpace(ctx, size + lineGap);
      ctx.page.drawText(line, {
        x: MARGIN + indent,
        y: ctx.y - size,
        size,
        font,
        color,
      });
      ctx.y -= size + lineGap;
    }
    ctx.y -= 4; // espace entre paragraphes
  }
}

/**
 * Parse un sous-ensemble Markdown léger :
 *   - `## ` → titre niveau 2
 *   - `### ` → titre niveau 3
 *   - `- ` → bullet point
 *   - sinon → paragraphe simple
 *
 * Inline : on retire `**bold**` et `*italic*` markers (texte conservé).
 */
function drawMarkdownLight(ctx: RenderCtx, markdown: string) {
  const lines = markdown.split(/\r?\n/);
  // On regroupe les lignes de paragraphes ensemble (séparés par lignes vides)
  let buffer: string[] = [];
  const flushBuffer = () => {
    if (buffer.length === 0) return;
    const text = stripInlineMd(buffer.join(" ").replace(/\s+/g, " ").trim());
    if (text) {
      drawParagraph(ctx, text, ctx.fontReg, 11, COLOR_COCOA, { lineGap: 4 });
    }
    buffer = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") {
      flushBuffer();
      continue;
    }
    if (line.startsWith("## ")) {
      flushBuffer();
      drawSubsectionTitle(ctx, stripInlineMd(line.slice(3).trim()));
      continue;
    }
    if (line.startsWith("### ")) {
      flushBuffer();
      drawMinorTitle(ctx, stripInlineMd(line.slice(4).trim()));
      continue;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      flushBuffer();
      drawBullet(ctx, stripInlineMd(line.slice(2).trim()));
      continue;
    }
    buffer.push(line);
  }
  flushBuffer();
}

function drawSubsectionTitle(ctx: RenderCtx, title: string) {
  ensureSpace(ctx, 24);
  ctx.y -= 6;
  ctx.page.drawText(title, {
    x: MARGIN,
    y: ctx.y - 12,
    size: 12,
    font: ctx.fontBold,
    color: COLOR_SAFFRON_STRONG,
  });
  ctx.y -= 20;
}

function drawMinorTitle(ctx: RenderCtx, title: string) {
  ensureSpace(ctx, 20);
  ctx.y -= 4;
  ctx.page.drawText(title, {
    x: MARGIN,
    y: ctx.y - 11,
    size: 10.5,
    font: ctx.fontBold,
    color: COLOR_COCOA,
  });
  ctx.y -= 16;
}

function drawBullet(ctx: RenderCtx, text: string) {
  const lines = wrapText(text, ctx.fontReg, 10.5, CONTENT_WIDTH - 14);
  for (let i = 0; i < lines.length; i++) {
    ensureSpace(ctx, 14);
    if (i === 0) {
      ctx.page.drawCircle({
        x: MARGIN + 4,
        y: ctx.y - 5,
        size: 1.6,
        color: COLOR_SAFFRON,
      });
    }
    ctx.page.drawText(lines[i] || "", {
      x: MARGIN + 14,
      y: ctx.y - 10,
      size: 10.5,
      font: ctx.fontReg,
      color: COLOR_COCOA,
    });
    ctx.y -= 14;
  }
  ctx.y -= 2;
}

function drawDecisions(ctx: RenderCtx, meeting: any, userById: Map<string, string>) {
  const decisions: any[] = Array.isArray(meeting.extractedJson?.decisions)
    ? meeting.extractedJson.decisions
    : [];

  if (decisions.length === 0) {
    drawParagraph(
      ctx,
      "Aucune décision financière n'a été extraite de cette réunion.",
      ctx.fontItalic,
      10,
      COLOR_MUTED,
    );
    return;
  }

  decisions.forEach((d, idx) => {
    ensureSpace(ctx, 40);
    // Card-like background
    const cardStartY = ctx.y;
    const cardX = MARGIN;
    const cardW = CONTENT_WIDTH;
    // On dessine d'abord le contenu pour mesurer, puis on overlay le fond
    // — méthode simple : on garde un fond léger en horizontal full width.

    const numLabel = `${idx + 1}.`;
    const kindLabel = decisionKindLabel(d.kind);

    // Header décision : "1. EXPENSE · Repas équipe"
    const headerLine = `${numLabel}  ${kindLabel}`;
    ctx.page.drawText(headerLine, {
      x: cardX + 8,
      y: ctx.y - 11,
      size: 9,
      font: ctx.fontBold,
      color: COLOR_SAFFRON_STRONG,
    });
    ctx.y -= 14;

    const description = formatDecisionDescription(d, userById, meeting.group.defaultCurrency);
    const descLines = wrapText(description, ctx.fontReg, 10.5, cardW - 16);
    for (const line of descLines) {
      ensureSpace(ctx, 13);
      ctx.page.drawText(line, {
        x: cardX + 8,
        y: ctx.y - 10,
        size: 10.5,
        font: ctx.fontReg,
        color: COLOR_COCOA,
      });
      ctx.y -= 13;
    }

    // Fond carte (rectangle léger)
    const cardEndY = ctx.y;
    const cardHeight = cardStartY - cardEndY + 6;
    ctx.page.drawRectangle({
      x: cardX,
      y: cardEndY - 4,
      width: cardW,
      height: cardHeight,
      color: COLOR_IVORY,
      borderColor: COLOR_HAIRLINE,
      borderWidth: 0.4,
      opacity: 0.4,
    });
    ctx.y -= 8;
  });
}

/**
 * V218.H — Dessine la liste des next steps (Partie 3) en checklist élégante.
 *
 * Chaque item est précédé d'une case à cocher vide (saffron), avec optionnel :
 *   - "→ NomResponsable" en italic saffron
 *   - "(échéance)" en gris cocoa-soft
 */
function drawNextSteps(
  ctx: RenderCtx,
  nextSteps: Array<{
    text: string;
    ownerUserId?: string | null;
    ownerName?: string | null;
    dueHint?: string | null;
  }>,
  userById: Map<string, string>,
) {
  if (!Array.isArray(nextSteps) || nextSteps.length === 0) {
    drawParagraph(
      ctx,
      "Aucune action à entreprendre n'a été identifiée à l'issue de cette réunion.",
      ctx.fontItalic,
      10,
      COLOR_MUTED,
    );
    return;
  }

  nextSteps.forEach((step, idx) => {
    ensureSpace(ctx, 28);
    // Case à cocher saffron
    const checkboxX = MARGIN + 2;
    const checkboxY = ctx.y - 13;
    ctx.page.drawRectangle({
      x: checkboxX,
      y: checkboxY,
      width: 10,
      height: 10,
      borderColor: COLOR_SAFFRON,
      borderWidth: 0.8,
      color: COLOR_PAPER,
    });

    const textX = MARGIN + 18;
    const maxW = CONTENT_WIDTH - 18;
    const numberedText = `${idx + 1}. ${step.text}`;
    const lines = wrapText(numberedText, ctx.fontReg, 11, maxW);
    let firstLine = true;
    for (const line of lines) {
      ensureSpace(ctx, 14);
      ctx.page.drawText(line, {
        x: firstLine ? textX : textX,
        y: ctx.y - 11,
        size: 11,
        font: ctx.fontReg,
        color: COLOR_COCOA,
      });
      ctx.y -= 14;
      firstLine = false;
    }

    // Métadonnées : responsable + échéance
    const ownerName =
      (step.ownerUserId && userById.get(step.ownerUserId)) ||
      step.ownerName ||
      null;
    const metaParts: string[] = [];
    if (ownerName) metaParts.push(`Responsable : ${ownerName}`);
    if (step.dueHint) metaParts.push(`Échéance : ${step.dueHint}`);
    if (metaParts.length > 0) {
      const meta = metaParts.join(" · ");
      const metaLines = wrapText(meta, ctx.fontItalic, 9, maxW);
      for (const line of metaLines) {
        ensureSpace(ctx, 12);
        ctx.page.drawText(line, {
          x: textX,
          y: ctx.y - 9,
          size: 9,
          font: ctx.fontItalic,
          color: COLOR_SAFFRON_STRONG,
        });
        ctx.y -= 12;
      }
    }
    ctx.y -= 6; // espace entre actions
  });
}

function decisionKindLabel(kind: string): string {
  switch (kind) {
    case "EXPENSE":
      return "DÉPENSE";
    case "SETTLEMENT":
      return "REMBOURSEMENT";
    case "TONTINE_CONTRIBUTION":
      return "COTISATION TONTINE";
    case "NOTE":
      return "NOTE";
    default:
      return kind;
  }
}

function formatDecisionDescription(
  d: any,
  userById: Map<string, string>,
  defaultCurrency: string,
): string {
  const cur = d.currency || defaultCurrency || "EUR";
  if (d.kind === "EXPENSE") {
    const payer = d.paidByUserId
      ? userById.get(d.paidByUserId) ?? "—"
      : "Non spécifié";
    const participants = (d.participantIds ?? [])
      .map((id: string) => userById.get(id) ?? "—")
      .slice(0, 6)
      .join(", ");
    const more =
      d.participantIds && d.participantIds.length > 6
        ? ` (+${d.participantIds.length - 6})`
        : "";
    return `${d.description} · ${formatNum(d.amount)} ${cur} payé par ${payer} · partagé entre ${participants}${more}`;
  }
  if (d.kind === "SETTLEMENT") {
    const from = userById.get(d.fromUserId) ?? "—";
    const to = userById.get(d.toUserId) ?? "—";
    return `${from} → ${to} · ${formatNum(d.amount)} ${cur}${
      d.notes ? ` · ${d.notes}` : ""
    }`;
  }
  if (d.kind === "TONTINE_CONTRIBUTION") {
    const who = userById.get(d.contributorUserId) ?? "—";
    return `${who} a versé ${formatNum(d.amount)} ${cur} au pot${
      d.paymentMethod ? ` (${d.paymentMethod})` : ""
    }`;
  }
  if (d.kind === "NOTE") {
    return d.text ?? "";
  }
  return JSON.stringify(d);
}

function drawFooterAllPages(
  pdf: PDFDocument,
  fontReg: PDFFont,
  fontItalic: PDFFont,
) {
  const pages = pdf.getPages();
  const total = pages.length;
  pages.forEach((page, i) => {
    const pageNum = i + 1;
    // Hairline au-dessus du footer
    page.drawLine({
      start: { x: MARGIN, y: 28 },
      end: { x: PAGE_WIDTH - MARGIN, y: 28 },
      thickness: 0.4,
      color: COLOR_HAIRLINE,
    });
    // Gauche : brand
    const generatedOn = new Date().toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    page.drawText(`Généré par BMD · bmd.app · ${generatedOn}`, {
      x: MARGIN,
      y: 16,
      size: 7,
      font: fontItalic,
      color: COLOR_MUTED,
    });
    // Droite : pagination
    const pageText = `Page ${pageNum} / ${total}`;
    const w = fontReg.widthOfTextAtSize(pageText, 7);
    page.drawText(pageText, {
      x: PAGE_WIDTH - MARGIN - w,
      y: 16,
      size: 7,
      font: fontReg,
      color: COLOR_MUTED,
    });
  });
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const test = current ? `${current} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      // Si le mot seul dépasse, on le tronque dur (filename URL etc.)
      if (font.widthOfTextAtSize(w, size) > maxWidth) {
        // hard-break char by char
        let chunk = "";
        for (const ch of w) {
          if (font.widthOfTextAtSize(chunk + ch, size) <= maxWidth) {
            chunk += ch;
          } else {
            lines.push(chunk);
            chunk = ch;
          }
        }
        current = chunk;
      } else {
        current = w;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function stripInlineMd(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

function formatNum(n: number): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// keep emerald + terracotta referenced (used elsewhere in future variants)
void COLOR_EMERALD;
void COLOR_TERRACOTTA;
