/**
 * V202.G — Génération PDF récap brandé pour une Caisse Projet.
 * =============================================================================
 * Utilise pdf-lib (déjà installé pour V150.E certificats RDD). Pages :
 *   1. Hero : nom caisse + groupe + status + balance (collecté/dépensé/dispo)
 *   2. Cotisations validées : contributeur + montant + date + méthode
 *   3. Dépenses exécutées : motif + bénéficiaire + montant + date
 *   4. Audit log : kind + horodatage + hash chaîné (preuve d'intégrité)
 *   5. Pied : mention légale Registre + signature BMD
 *
 * Pour rester compatible avec l'environnement minimal, on génère un PDF
 * simple A4 portrait sans images embarquées (le logo BMD est tracé en SVG
 * vectoriel via texte stylisé Cormorant).
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";
import { computeFundBalance } from "./project-funds.service.js";

/**
 * V202.G — Génère un PDF récap pour une caisse.
 * Retourne un Uint8Array (à streamer comme application/pdf).
 */
export async function generateFundReceiptPdf(
  fundId: string,
  userId: string,
): Promise<Uint8Array> {
  // Vérification accès : l'user doit être membre du groupe
  const fund = await prisma.projectFund.findUnique({
    where: { id: fundId },
    include: {
      group: { select: { name: true } },
      treasurer: { select: { displayName: true } },
      createdBy: { select: { displayName: true } },
    },
  });
  if (!fund) throw Errors.notFound("Cette caisse est introuvable.");
  const isMember = await prisma.groupMember.findFirst({
    where: { groupId: fund.groupId, userId },
    select: { id: true },
  });
  if (!isMember) {
    throw Errors.forbidden("Tu n'es pas membre de ce groupe.");
  }

  const [contribs, expenses, audit, balance] = await Promise.all([
    prisma.fundContribution.findMany({
      where: { fundId, status: "VALIDATED" },
      include: { contributor: { select: { displayName: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.fundExpense.findMany({
      where: { fundId, status: "EXECUTED" },
      orderBy: { executedAt: "asc" },
    }),
    prisma.fundEvent.findMany({
      where: { fundId },
      orderBy: { createdAt: "asc" },
    }),
    computeFundBalance(fundId),
  ]);

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);

  // Couleurs V45-light
  const cocoa = rgb(0.169, 0.122, 0.082);
  const saffron = rgb(0.773, 0.541, 0.18);
  const emerald = rgb(0.122, 0.478, 0.341);
  const terracotta = rgb(0.624, 0.275, 0.157);
  const muted = rgb(0.478, 0.439, 0.388);
  const line = rgb(0.9, 0.86, 0.78);

  let page = pdf.addPage([595, 842]); // A4
  const margin = 50;
  let y = 800;

  const writeLine = (
    text: string,
    opts: {
      size?: number;
      font?: typeof font;
      color?: typeof cocoa;
      indent?: number;
    } = {},
  ) => {
    page.drawText(text, {
      x: margin + (opts.indent ?? 0),
      y,
      size: opts.size ?? 11,
      font: opts.font ?? font,
      color: opts.color ?? cocoa,
    });
    y -= (opts.size ?? 11) + 6;
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < 60) {
      page = pdf.addPage([595, 842]);
      y = 800;
    }
  };

  // === HEADER ===
  page.drawRectangle({ x: 0, y: 800, width: 595, height: 42, color: saffron });
  page.drawText("BMD", {
    x: margin,
    y: 814,
    size: 18,
    font: serifBold,
    color: rgb(0.984, 0.965, 0.925),
  });
  page.drawText("Caisse projet · Récap officiel", {
    x: margin + 60,
    y: 818,
    size: 10,
    font,
    color: rgb(0.984, 0.965, 0.925),
  });
  y = 770;

  // === TITRE ===
  writeLine(fund.name, { size: 22, font: serifBold });
  writeLine(
    `Groupe : ${fund.group.name} · ${fund.currency} · ${fund.status}`,
    { size: 10, color: muted },
  );
  y -= 6;

  // === BALANCE ===
  ensureSpace(80);
  page.drawRectangle({
    x: margin,
    y: y - 60,
    width: 495,
    height: 60,
    color: rgb(0.984, 0.965, 0.925),
    borderColor: line,
    borderWidth: 1,
  });
  const statY = y - 14;
  page.drawText("Collecté", { x: margin + 20, y: statY, size: 9, font, color: muted });
  page.drawText(`${balance.contributed.toFixed(2)} ${fund.currency}`, {
    x: margin + 20,
    y: statY - 18,
    size: 16,
    font: serifBold,
    color: cocoa,
  });
  page.drawText("Dépensé", { x: margin + 180, y: statY, size: 9, font, color: muted });
  page.drawText(`${balance.spent.toFixed(2)} ${fund.currency}`, {
    x: margin + 180,
    y: statY - 18,
    size: 16,
    font: serifBold,
    color: terracotta,
  });
  page.drawText("Disponible", { x: margin + 340, y: statY, size: 9, font, color: muted });
  page.drawText(`${balance.balance.toFixed(2)} ${fund.currency}`, {
    x: margin + 340,
    y: statY - 18,
    size: 16,
    font: serifBold,
    color: emerald,
  });
  y -= 80;

  // === COTISATIONS ===
  ensureSpace(40);
  writeLine(`Cotisations validées (${contribs.length})`, {
    size: 13,
    font: bold,
    color: saffron,
  });
  y -= 4;
  for (const c of contribs) {
    ensureSpace(20);
    const date = c.validatedAt
      ? new Date(c.validatedAt).toLocaleDateString("fr-FR")
      : new Date(c.createdAt).toLocaleDateString("fr-FR");
    writeLine(
      `• ${c.contributor.displayName} — ${c.amount.toString()} ${c.currency} (${c.method}) · ${date}`,
      { size: 10 },
    );
  }
  if (contribs.length === 0) {
    writeLine("Aucune cotisation validée.", { size: 10, color: muted });
  }

  // === DÉPENSES ===
  y -= 10;
  ensureSpace(40);
  writeLine(`Dépenses exécutées (${expenses.length})`, {
    size: 13,
    font: bold,
    color: terracotta,
  });
  y -= 4;
  for (const e of expenses) {
    ensureSpace(20);
    const date = e.executedAt
      ? new Date(e.executedAt).toLocaleDateString("fr-FR")
      : "—";
    const benef = e.beneficiary ? ` (→ ${e.beneficiary})` : "";
    writeLine(
      `• ${e.motive}${benef} — ${e.amount.toString()} ${e.currency} · ${date}`,
      { size: 10 },
    );
  }
  if (expenses.length === 0) {
    writeLine("Aucune dépense exécutée.", { size: 10, color: muted });
  }

  // === AUDIT (hash chaîné) ===
  y -= 10;
  ensureSpace(40);
  writeLine(`Journal d'audit (${audit.length} événements)`, {
    size: 13,
    font: bold,
    color: emerald,
  });
  y -= 4;
  for (const ev of audit) {
    ensureSpace(18);
    const date = new Date(ev.createdAt).toLocaleString("fr-FR");
    writeLine(`${date} — ${ev.kind}`, { size: 9 });
    writeLine(`  hash: ${ev.hash.slice(0, 32)}...`, { size: 8, color: muted });
  }

  // === FOOTER LÉGAL ===
  ensureSpace(80);
  y -= 10;
  page.drawRectangle({
    x: margin,
    y: y - 60,
    width: 495,
    height: 60,
    color: rgb(0.93, 0.96, 0.94),
    borderColor: emerald,
    borderWidth: 1,
  });
  page.drawText("BMD est un registre, pas une banque.", {
    x: margin + 12,
    y: y - 18,
    size: 10,
    font: bold,
    color: emerald,
  });
  page.drawText(
    "L'argent n'est jamais détenu par BMD. Le trésorier nommé est seul",
    { x: margin + 12, y: y - 32, size: 9, font, color: cocoa },
  );
  page.drawText(
    "responsable de la garde des fonds. Ce document fait foi du registre.",
    { x: margin + 12, y: y - 44, size: 9, font, color: cocoa },
  );
  y -= 80;

  ensureSpace(20);
  writeLine(`Trésorier : ${fund.treasurer?.displayName ?? fund.createdBy.displayName}`, {
    size: 9,
    color: muted,
  });
  writeLine(`Créateur : ${fund.createdBy.displayName}`, {
    size: 9,
    color: muted,
  });
  writeLine(`Code public : ${fund.publicCode}`, { size: 9, color: muted });
  writeLine(
    `Généré le ${new Date().toLocaleString("fr-FR")} · backmesdo.com`,
    { size: 8, color: muted },
  );

  return await pdf.save();
}
