/**
 * V150.E — Service génération PDF certificat de remboursement (acte de quittance).
 *
 * Émis quand un DebtAgreement passe en statut COMPLETED (toutes les
 * échéances sont CONFIRMED). Le PDF est généré à la volée à chaque
 * téléchargement : il porte un identifiant unique stable basé sur
 * publicCode + completedAt pour garantir la traçabilité.
 *
 * Design : palette V45-light BMD (saffron + cocoa + ivory),
 * Helvetica via pdf-lib (les polices Cormorant Garamond ne sont pas
 * embarquées — on fait jouer la composition pour rester chic).
 *
 * Permission : seul le créditeur ou le débiteur peut télécharger.
 * Pas de plan-gate : c'est une preuve de soldé, fonction core.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { prisma as prismaClient } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";

// Cast `as any` — le client Prisma n'est pas toujours régénéré dans le
// sandbox CI avec les nouveaux modèles DebtAgreement. En prod avec
// `npx prisma generate` tournée, les types sont corrects.
const prisma = prismaClient as any;

// Palette BMD V45-light traduite en RGB pdf-lib (0-1).
const COLOR_COCOA = rgb(43 / 255, 31 / 255, 21 / 255);
const COLOR_SAFFRON = rgb(197 / 255, 138 / 255, 46 / 255);
const COLOR_EMERALD = rgb(31 / 255, 122 / 255, 87 / 255);
const COLOR_GOLD = rgb(166 / 255, 124 / 255, 50 / 255);
const COLOR_IVORY = rgb(251 / 255, 246 / 255, 236 / 255);
const COLOR_MUTED = rgb(107 / 255, 90 / 255, 71 / 255);
const COLOR_HAIRLINE = rgb(43 / 255, 31 / 255, 21 / 255); // alpha 0.12 simulé via thickness

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;

export interface DebtCertificateInput {
  debtId: string;
  actorUserId: string;
  /**
   * V242 — Mode de rendu du PDF.
   *  - `certificate` (défaut) : acte de quittance (statut COMPLETED requis).
   *  - `contract`             : aperçu/version finale du contrat (DRAFT/
   *    PROPOSED/NEGOTIATING acceptés). Injecte preamble + additionalClauses
   *    + footerNote si présents sur la RDD. Titre = « RECONNAISSANCE DE
   *    DETTE » au lieu de « CERTIFICAT DE REMBOURSEMENT ».
   */
  mode?: "certificate" | "contract";
}

export async function generateDebtCertificatePdf(
  input: DebtCertificateInput,
): Promise<Uint8Array> {
  const mode = input.mode ?? "certificate";
  const debt = await prisma.debtAgreement.findUnique({
    where: { id: input.debtId },
    include: {
      parties: true,
      schedules: { orderBy: { sequenceNumber: "asc" } },
    },
  });
  if (!debt) throw Errors.notFound("Contrat introuvable");

  // Permission : seuls créditeur et débiteur ont accès. EXCEPTION V242 :
  // en mode contract, seul le créateur (=créditeur) peut générer le PDF
  // d'aperçu — le débiteur le verra dans le flux propose/signature.
  const actorParty = debt.parties.find(
    (p: any) =>
      p.userId === input.actorUserId &&
      (p.role === "CREDITOR" || p.role === "DEBTOR"),
  );
  if (!actorParty && !(mode === "contract" && debt.creatorUserId === input.actorUserId)) {
    throw Errors.forbidden(
      "Seul le créditeur ou le débiteur peut télécharger ce PDF",
    );
  }

  // V242 — Validation du statut selon le mode.
  if (mode === "certificate") {
    // Le certificat n'a de sens que si le contrat est SOLDÉ.
    if (debt.status !== "COMPLETED") {
      throw Errors.badRequest(
        "Le certificat n'est délivré qu'une fois le contrat soldé",
      );
    }
  } else {
    // mode === "contract" : aperçu / version finale du contrat. Toujours
    // disponible AVANT la quittance, càd tant qu'on n'est pas COMPLETED.
    // En COMPLETED, on retombe sur le certificate (qui est plus pertinent).
    if (debt.status === "COMPLETED") {
      throw Errors.badRequest(
        "Le contrat est déjà soldé. Utilise le certificat de remboursement.",
      );
    }
  }

  const creditor = debt.parties.find((p: any) => p.role === "CREDITOR");
  const debtor = debt.parties.find((p: any) => p.role === "DEBTOR");
  const witnesses = debt.parties.filter((p: any) => p.role === "WITNESS");
  const guarantors = debt.parties.filter((p: any) => p.role === "GUARANTOR");

  // V244 — Mode contract : on bascule vers un rendu juridique multi-pages
  // dédié (renderContractPdf) au lieu du rendu single-page « quittance »
  // qui n'est conçu que pour les RDD soldées. Évite aussi le crash WinAnsi
  // sur les caractères Unicode (▴) qui ne sont pas encodables par les
  // polices standard de pdf-lib.
  if (mode === "contract") {
    return renderContractPdf({
      debt,
      creditor,
      debtor,
      witnesses,
      guarantors,
    });
  }

  const totalPaid = debt.schedules.reduce(
    (sum: number, s: any) =>
      sum + (s.paidAmount ? Number(s.paidAmount) : Number(s.expectedAmount)),
    0,
  );
  const completedAt = debt.completedAt ?? new Date();
  const completedAtIso = new Date(completedAt).toISOString();
  // V244 — Mode contract est handled par renderContractPdf (early return).
  // Ici on est en mode 'certificate' uniquement.
  const certificateId = `BMD-CERT-${debt.publicCode}`;

  // ========== Génération PDF ==========
  const pdf = await PDFDocument.create();
  const fontReg = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  // Bandeau saffron du haut (élégant, fin)
  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 12,
    width: PAGE_WIDTH,
    height: 12,
    color: COLOR_SAFFRON,
  });

  // Bandeau cocoa du bas
  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_WIDTH,
    height: 6,
    color: COLOR_COCOA,
  });

  let y = PAGE_HEIGHT - 50;

  // Logo monogramme BMD : carré saffron + "B" cocoa centré (mock logo)
  drawLogo(page, MARGIN, y - 22, fontBold);

  // Wordmark à côté
  page.drawText("BMD", {
    x: MARGIN + 38,
    y: y - 14,
    size: 22,
    font: fontBold,
    color: COLOR_COCOA,
  });
  page.drawText("Back Mes Do · L'argent partagé, l'amitié protégée.", {
    x: MARGIN + 38,
    y: y - 28,
    size: 8,
    font: fontItalic,
    color: COLOR_MUTED,
  });

  // En haut à droite : ID document (mode certificate uniquement ici)
  const idLabel = "ID CERTIFICAT";
  page.drawText(idLabel, {
    x: PAGE_WIDTH - MARGIN - fontReg.widthOfTextAtSize(idLabel, 7),
    y: y - 4,
    size: 7,
    font: fontBold,
    color: COLOR_MUTED,
  });
  page.drawText(certificateId, {
    x: PAGE_WIDTH - MARGIN - fontBold.widthOfTextAtSize(certificateId, 10),
    y: y - 17,
    size: 10,
    font: fontBold,
    color: COLOR_COCOA,
  });

  y -= 80;

  // Titre principal (certificate mode uniquement ici)
  const titleMain = "CERTIFICAT DE REMBOURSEMENT";
  const titleSize = 22;
  const titleW = fontBold.widthOfTextAtSize(titleMain, titleSize);
  page.drawText(titleMain, {
    x: (PAGE_WIDTH - titleW) / 2,
    y,
    size: titleSize,
    font: fontBold,
    color: COLOR_COCOA,
  });

  y -= 16;
  const subtitle = "— Acquit définitif et libératoire —";
  const subSize = 11;
  const subW = fontItalic.widthOfTextAtSize(subtitle, subSize);
  page.drawText(subtitle, {
    x: (PAGE_WIDTH - subW) / 2,
    y,
    size: subSize,
    font: fontItalic,
    color: COLOR_GOLD,
  });

  // V244 — Le mode contract est désormais rendu par renderContractPdf
  // (early return plus haut). Cette section ne s'exécute que pour le mode
  // « certificate » (quittance soldée).

  y -= 28;

  // Bloc montant — la signature visuelle du document
  const amountStr = formatAmount(totalPaid, debt.currency);
  const amountSize = 36;
  const amountW = fontBold.widthOfTextAtSize(amountStr, amountSize);
  page.drawText(amountStr, {
    x: (PAGE_WIDTH - amountW) / 2,
    y,
    size: amountSize,
    font: fontBold,
    color: COLOR_SAFFRON,
  });
  y -= 16;
  const totalLabel = "MONTANT INTÉGRALEMENT REMBOURSÉ";
  const totalLabelW = fontBold.widthOfTextAtSize(totalLabel, 8);
  page.drawText(totalLabel, {
    x: (PAGE_WIDTH - totalLabelW) / 2,
    y,
    size: 8,
    font: fontBold,
    color: COLOR_GOLD,
  });

  y -= 36;

  // Phrase d'engagement (cœur du document)
  const story = [
    `Le présent certificat atteste, en date du ${formatDate(completedAt)},`,
    `que la reconnaissance de dette identifiée sous le code ${debt.publicCode}`,
    `a été intégralement remboursée par ${debtor?.displayName ?? "?"}`,
    `à ${creditor?.displayName ?? "?"}.`,
  ];
  for (const line of story) {
    const w = fontReg.widthOfTextAtSize(line, 11);
    page.drawText(line, {
      x: (PAGE_WIDTH - w) / 2,
      y,
      size: 11,
      font: fontReg,
      color: COLOR_COCOA,
    });
    y -= 15;
  }

  y -= 8;
  const release = "Le créancier en donne quittance définitive et libère le débiteur de toute obligation.";
  // Split long line if needed
  drawCenteredWrapped(page, release, fontItalic, 10, COLOR_MUTED, y, PAGE_WIDTH - 2 * MARGIN);

  y -= 50;

  // Section parties — carte bordurée
  const cardX = MARGIN;
  const cardW = PAGE_WIDTH - 2 * MARGIN;
  const cardTop = y;
  const cardBottom = drawPartiesCard(
    page,
    cardX,
    cardTop,
    cardW,
    creditor,
    debtor,
    witnesses,
    guarantors,
    fontReg,
    fontBold,
  );
  y = cardBottom - 20;

  // Section détails contrat — table simple
  const detailsTop = y;
  const detailsBottom = drawDetailsTable(page, cardX, detailsTop, cardW, {
    purpose: debt.purpose ?? "Non précisé",
    startDate: debt.startDate ? formatDate(new Date(debt.startDate)) : "—",
    completedAt: formatDate(new Date(completedAt)),
    totalInstallments: String(debt.totalInstallments),
    interestRate: `${Number(debt.interestRate).toFixed(2).replace(".", ",")} % / an`,
  }, fontReg, fontBold);
  y = detailsBottom - 24;

  // V244 — Les clauses additionnelles + footer custom ne s'appliquent
  // qu'au mode contract (rendu par renderContractPdf). Ici on est en mode
  // certificate, on utilise le footer standard.
  drawFooter(page, fontReg, fontItalic, certificateId, completedAtIso);

  const bytes = await pdf.save();
  return bytes;
}

// ---------------------------------------------------------------------------
// Helpers de rendu
// ---------------------------------------------------------------------------

function drawLogo(page: PDFPage, x: number, y: number, fontBold: PDFFont) {
  // Carré saffron 28×28 avec "B" cocoa centré.
  page.drawRectangle({
    x,
    y,
    width: 28,
    height: 28,
    color: COLOR_SAFFRON,
  });
  const letter = "B";
  const w = fontBold.widthOfTextAtSize(letter, 18);
  page.drawText(letter, {
    x: x + (28 - w) / 2,
    y: y + 7,
    size: 18,
    font: fontBold,
    color: COLOR_IVORY,
  });
}

function drawCenteredWrapped(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
  startY: number,
  maxWidth: number,
): number {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const test = current ? `${current} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  let y = startY;
  for (const line of lines) {
    const w = font.widthOfTextAtSize(line, size);
    page.drawText(line, {
      x: (PAGE_WIDTH - w) / 2,
      y,
      size,
      font,
      color,
    });
    y -= size + 4;
  }
  return y;
}

function drawPartiesCard(
  page: PDFPage,
  x: number,
  topY: number,
  width: number,
  creditor: any,
  debtor: any,
  witnesses: any[],
  guarantors: any[],
  fontReg: PDFFont,
  fontBold: PDFFont,
): number {
  const padding = 16;
  const lineHeight = 18;
  // Pré-calcul de la hauteur
  const rows: Array<{ label: string; value: string; accent: ReturnType<typeof rgb> }> = [
    {
      label: "Créancier",
      value: creditor?.displayName ?? "?",
      accent: COLOR_EMERALD,
    },
    {
      label: "Débiteur",
      value: debtor?.displayName ?? "?",
      accent: COLOR_SAFFRON,
    },
  ];
  if (witnesses.length > 0) {
    rows.push({
      label: witnesses.length === 1 ? "Témoin" : "Témoins",
      value: witnesses.map((p) => p.displayName).join(", "),
      accent: COLOR_GOLD,
    });
  }
  if (guarantors.length > 0) {
    rows.push({
      label: guarantors.length === 1 ? "Garant" : "Garants",
      value: guarantors.map((p) => p.displayName).join(", "),
      accent: COLOR_EMERALD,
    });
  }
  const headerH = 22;
  const cardH = padding * 2 + headerH + rows.length * lineHeight;
  const bottomY = topY - cardH;

  // Card outline
  page.drawRectangle({
    x,
    y: bottomY,
    width,
    height: cardH,
    color: COLOR_IVORY,
    borderColor: COLOR_HAIRLINE,
    borderWidth: 0.4,
  });

  // Section title
  page.drawText("PARTIES PRENANTES", {
    x: x + padding,
    y: topY - padding - 8,
    size: 8,
    font: fontBold,
    color: COLOR_GOLD,
  });
  // Separator
  page.drawLine({
    start: { x: x + padding, y: topY - padding - 14 },
    end: { x: x + width - padding, y: topY - padding - 14 },
    thickness: 0.3,
    color: COLOR_MUTED,
  });

  let rowY = topY - padding - 14 - lineHeight + 4;
  for (const r of rows) {
    // Pastille couleur
    page.drawCircle({
      x: x + padding + 3,
      y: rowY + 3,
      size: 3,
      color: r.accent,
    });
    page.drawText(r.label, {
      x: x + padding + 14,
      y: rowY,
      size: 9,
      font: fontBold,
      color: COLOR_MUTED,
    });
    page.drawText(r.value, {
      x: x + padding + 90,
      y: rowY,
      size: 11,
      font: fontReg,
      color: COLOR_COCOA,
    });
    rowY -= lineHeight;
  }

  return bottomY;
}

function drawDetailsTable(
  page: PDFPage,
  x: number,
  topY: number,
  width: number,
  details: {
    purpose: string;
    startDate: string;
    completedAt: string;
    totalInstallments: string;
    interestRate: string;
  },
  fontReg: PDFFont,
  fontBold: PDFFont,
): number {
  const padding = 16;
  const lineH = 18;
  const rows: Array<[string, string]> = [
    ["Objet du prêt", details.purpose],
    ["Date de signature", details.startDate],
    ["Date de remboursement intégral", details.completedAt],
    ["Nombre d'échéances", details.totalInstallments],
    ["Taux d'intérêt convenu", details.interestRate],
  ];
  const headerH = 22;
  const cardH = padding * 2 + headerH + rows.length * lineH;
  const bottomY = topY - cardH;

  page.drawRectangle({
    x,
    y: bottomY,
    width,
    height: cardH,
    color: COLOR_IVORY,
    borderColor: COLOR_HAIRLINE,
    borderWidth: 0.4,
  });

  page.drawText("DÉTAILS DU CONTRAT", {
    x: x + padding,
    y: topY - padding - 8,
    size: 8,
    font: fontBold,
    color: COLOR_GOLD,
  });
  page.drawLine({
    start: { x: x + padding, y: topY - padding - 14 },
    end: { x: x + width - padding, y: topY - padding - 14 },
    thickness: 0.3,
    color: COLOR_MUTED,
  });

  let rowY = topY - padding - 14 - lineH + 4;
  for (const [label, value] of rows) {
    page.drawText(label, {
      x: x + padding,
      y: rowY,
      size: 9,
      font: fontReg,
      color: COLOR_MUTED,
    });
    const vSize = 10;
    const vW = fontReg.widthOfTextAtSize(value, vSize);
    page.drawText(value, {
      x: x + width - padding - vW,
      y: rowY,
      size: vSize,
      font: fontBold,
      color: COLOR_COCOA,
    });
    rowY -= lineH;
  }

  return bottomY;
}

function drawFooter(
  page: PDFPage,
  fontReg: PDFFont,
  fontItalic: PDFFont,
  certificateId: string,
  iso: string,
) {
  const footerY = 36;
  const mention =
    "Ce certificat est émis automatiquement par BMD à partir des données vérifiées dans l'application.";
  const mentionW = fontItalic.widthOfTextAtSize(mention, 8);
  page.drawText(mention, {
    x: (PAGE_WIDTH - mentionW) / 2,
    y: footerY + 12,
    size: 8,
    font: fontItalic,
    color: COLOR_MUTED,
  });
  const stamp = `Émis le ${formatDate(new Date())} · Réf. ${certificateId} · ${iso}`;
  const stampW = fontReg.widthOfTextAtSize(stamp, 7);
  page.drawText(stamp, {
    x: (PAGE_WIDTH - stampW) / 2,
    y: footerY,
    size: 7,
    font: fontReg,
    color: COLOR_MUTED,
  });
}

function formatAmount(n: number, currency: string): string {
  const sym = currency === "EUR" ? "€" : currency;
  // Formatage français-friendly avec espace fine entre milliers
  const fixed = n.toFixed(2).replace(".", ",");
  // Insère un espace tous les 3 chiffres avant la virgule
  const [intPart, decPart] = fixed.split(",");
  const grouped = intPart!.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${grouped},${decPart} ${sym}`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ============================================================================
// V244 — RENDU PDF CONTRAT (mode='contract')
// ============================================================================
//
// Génère un acte de reconnaissance de dette juridiquement structuré :
//   - Header brandé BMD (logo + wordmark)
//   - Référence Art. 1376 du Code civil (acte sous seing privé)
//   - Bandeau "APERCU - VERSION NON SIGNEE" si pas SIGNED/ACTIVE
//   - Préambule libre du créateur (si présent)
//   - Identification complète des parties (créancier / débiteur / témoins / garants)
//   - 7 articles numérotés couvrant : objet, modalités, intérêts, clauses
//     libres, défaut, juridiction, plateforme BMD (tiers facilitateur)
//   - Montant en chiffres ET en lettres (mention obligatoire art. 1376)
//   - Cadres de signature avec mention "Lu et approuvé - Bon pour la
//     somme de X euros (en lettres)"
//   - Footer juridique avec mentions BMD + horodatage + ID contrat
//
// Multi-pages : helper ensureSpace(y) ajoute une nouvelle page si on
// approche du footer. Toutes les chaînes sont strictement WinAnsi-safe
// (pas d'emoji, pas de triangles, pas de symboles Unicode > U+00FF).
//
// Disclaimer BMD (art. 7) : on rappelle expressément que BMD n'agit qu'en
// tant que tiers facilitateur. La responsabilité juridique reste entière
// entre les parties signataires. Aucune obligation de paiement ne pèse
// sur BMD.

async function renderContractPdf(input: {
  debt: any;
  creditor: any;
  debtor: any;
  witnesses: any[];
  guarantors: any[];
}): Promise<Uint8Array> {
  const { debt, creditor, debtor, witnesses, guarantors } = input;

  const pdf = await PDFDocument.create();
  const fontReg = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const contractId = `BMD-CONTRAT-${debt.publicCode}`;
  const isPreview = debt.status !== "SIGNED" && debt.status !== "ACTIVE";
  const startDate = debt.startDate ? new Date(debt.startDate) : new Date();
  const endDate = new Date(debt.endDate);
  const amount = Number(debt.amount);
  const interestRate = Number(debt.interestRate ?? 0);
  const totalInst = Number(debt.totalInstallments ?? 1);
  const frequencyLabel = formatFrequency(debt.frequency, totalInst);
  const installmentAmount =
    totalInst > 0 ? amount / totalInst : amount;

  // ===== État de pagination =====
  // y diminue avec le rendu. Quand y < FOOTER_GUARD, on ajoute une page.
  const FOOTER_GUARD = 90;
  let page: PDFPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let pageNumber = 1;
  let y = drawContractPageHeader(
    page,
    fontReg,
    fontBold,
    fontItalic,
    contractId,
    isPreview,
    pageNumber,
  );

  function ensureSpace(needed: number) {
    if (y - needed < FOOTER_GUARD) {
      drawContractPageFooter(
        page,
        fontReg,
        fontItalic,
        contractId,
        debt.footerNote ?? null,
        pageNumber,
      );
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      pageNumber += 1;
      y = drawContractPageHeader(
        page,
        fontReg,
        fontBold,
        fontItalic,
        contractId,
        isPreview,
        pageNumber,
      );
    }
  }

  function drawSectionTitle(text: string) {
    ensureSpace(28);
    y -= 8;
    page.drawText(text, {
      x: MARGIN,
      y,
      size: 12,
      font: fontBold,
      color: COLOR_COCOA,
    });
    // Sous-ligne saffron
    page.drawRectangle({
      x: MARGIN,
      y: y - 4,
      width: 32,
      height: 1.2,
      color: COLOR_SAFFRON,
    });
    y -= 18;
  }

  function drawParagraph(
    text: string,
    opts: {
      font?: PDFFont;
      size?: number;
      color?: ReturnType<typeof rgb>;
      indent?: number;
    } = {},
  ) {
    const font = opts.font ?? fontReg;
    const size = opts.size ?? 10;
    const color = opts.color ?? COLOR_COCOA;
    const indent = opts.indent ?? 0;
    const maxWidth = PAGE_WIDTH - 2 * MARGIN - indent;
    const lines = wrapText(text, font, size, maxWidth);
    for (const line of lines) {
      ensureSpace(size + 4);
      page.drawText(line, {
        x: MARGIN + indent,
        y,
        size,
        font,
        color,
      });
      y -= size + 4;
    }
  }

  function drawLabelValue(label: string, value: string) {
    ensureSpace(16);
    page.drawText(label, {
      x: MARGIN,
      y,
      size: 9,
      font: fontBold,
      color: COLOR_MUTED,
    });
    const labelW = fontBold.widthOfTextAtSize(label, 9);
    page.drawText(value, {
      x: MARGIN + labelW + 6,
      y,
      size: 10,
      font: fontReg,
      color: COLOR_COCOA,
    });
    y -= 16;
  }

  // ===== TITRE PRINCIPAL =====
  const titleMain = "RECONNAISSANCE DE DETTE";
  const titleSize = 22;
  const titleW = fontBold.widthOfTextAtSize(titleMain, titleSize);
  page.drawText(titleMain, {
    x: (PAGE_WIDTH - titleW) / 2,
    y,
    size: titleSize,
    font: fontBold,
    color: COLOR_COCOA,
  });
  y -= 16;
  const subtitle = "Acte sous seing prive - Article 1376 du Code civil";
  const subW = fontItalic.widthOfTextAtSize(subtitle, 10);
  page.drawText(subtitle, {
    x: (PAGE_WIDTH - subW) / 2,
    y,
    size: 10,
    font: fontItalic,
    color: COLOR_GOLD,
  });
  y -= 24;

  // ===== BANDEAU APERCU (si non signe) =====
  if (isPreview) {
    const bannerText = ">> APERCU - VERSION NON SIGNEE - A VALIDER PAR LES PARTIES <<";
    const bannerW = fontBold.widthOfTextAtSize(bannerText, 9);
    // Fond saffron clair
    page.drawRectangle({
      x: (PAGE_WIDTH - bannerW - 20) / 2,
      y: y - 4,
      width: bannerW + 20,
      height: 18,
      color: rgb(246 / 255, 232 / 255, 197 / 255),
      borderColor: COLOR_SAFFRON,
      borderWidth: 0.8,
    });
    page.drawText(bannerText, {
      x: (PAGE_WIDTH - bannerW) / 2,
      y: y + 1,
      size: 9,
      font: fontBold,
      color: COLOR_COCOA,
    });
    y -= 28;
  }

  // ===== PREAMBULE LIBRE (si present) =====
  if (debt.preamble) {
    y -= 4;
    y = drawCenteredWrapped(
      page,
      String(debt.preamble),
      fontItalic,
      10,
      COLOR_MUTED,
      y,
      PAGE_WIDTH - 2 * MARGIN,
    );
    y -= 12;
  }

  // ===== PARTIES =====
  drawSectionTitle("ENTRE LES SOUSSIGNES");
  drawParagraph(
    "Le present acte est etabli entre les parties identifiees ci-dessous, qui declarent avoir la capacite juridique de contracter et reconnaissent l'existence de la dette qui suit.",
    { color: COLOR_MUTED, size: 9 },
  );
  y -= 4;

  // Créancier
  drawLabelValue("LE CREANCIER :", asciiSafe(creditor?.displayName ?? "Non identifie"));
  if (creditor?.user?.email)
    drawLabelValue("Email :", asciiSafe(creditor.user.email));
  drawParagraph(
    "Ci-apres designe \"le Creancier\", de premiere part,",
    { font: fontItalic, color: COLOR_MUTED, size: 9, indent: 12 },
  );
  y -= 4;

  // Débiteur
  drawLabelValue("LE DEBITEUR :", asciiSafe(debtor?.displayName ?? "Non identifie"));
  if (debtor?.user?.email)
    drawLabelValue("Email :", asciiSafe(debtor.user.email));
  else if (debtor?.inviteContact)
    drawLabelValue("Contact :", asciiSafe(debtor.inviteContact));
  drawParagraph(
    "Ci-apres designe \"le Debiteur\", de seconde part,",
    { font: fontItalic, color: COLOR_MUTED, size: 9, indent: 12 },
  );
  y -= 4;

  // Témoins
  if (witnesses.length > 0) {
    drawLabelValue(
      witnesses.length === 1 ? "TEMOIN :" : "TEMOINS :",
      asciiSafe(witnesses.map((p: any) => p.displayName).join(", ")),
    );
  }
  // Garants
  if (guarantors.length > 0) {
    drawLabelValue(
      guarantors.length === 1 ? "GARANT :" : "GARANTS :",
      asciiSafe(guarantors.map((p: any) => p.displayName).join(", ")),
    );
    drawParagraph(
      "Le(s) Garant(s) se porte(nt) caution personnelle et solidaire du Debiteur conformement aux articles 2288 et suivants du Code civil.",
      { font: fontItalic, color: COLOR_MUTED, size: 9, indent: 12 },
    );
  }
  y -= 8;

  // ===== ARTICLE 1 - OBJET =====
  drawSectionTitle("Article 1 - Objet du pret");
  const amountInWords = numberToFrenchWords(Math.floor(amount));
  const amountCents = Math.round((amount - Math.floor(amount)) * 100);
  const wordsPart =
    amountCents > 0
      ? `${amountInWords} euros et ${numberToFrenchWords(amountCents)} centimes`
      : `${amountInWords} euros`;
  drawParagraph(
    `Le Creancier a remis au Debiteur, qui le reconnait et l'accepte, la somme de ${formatAmount(amount, debt.currency)} (${wordsPart}), a titre de pret personnel.`,
  );
  if (debt.purpose) {
    drawParagraph(`Objet du pret : ${asciiSafe(debt.purpose)}.`, {
      font: fontItalic,
    });
  }
  y -= 4;

  // ===== ARTICLE 2 - REMBOURSEMENT =====
  drawSectionTitle("Article 2 - Modalites de remboursement");
  drawParagraph(
    `Le Debiteur s'engage a rembourser au Creancier la somme empruntee selon les modalites suivantes :`,
  );
  drawLabelValue("Date de debut :", formatDate(startDate));
  drawLabelValue("Date d'echeance finale :", formatDate(endDate));
  drawLabelValue("Frequence :", frequencyLabel);
  drawLabelValue("Nombre d'echeances :", String(totalInst));
  drawLabelValue(
    "Montant par echeance :",
    formatAmount(installmentAmount, debt.currency),
  );
  y -= 4;

  // ===== ARTICLE 3 - INTERETS =====
  drawSectionTitle("Article 3 - Interets");
  if (interestRate > 0) {
    const totalInterest =
      installmentAmount * totalInst - amount;
    drawParagraph(
      `Le present pret est consenti moyennant un taux d'interet annuel de ${interestRate.toFixed(2).replace(".", ",")} %. Les interets sont calcules sur le capital restant du, conformement aux usages bancaires.`,
    );
    if (totalInterest > 0.01) {
      drawParagraph(
        `Le cout total des interets sur la duree du pret est estime a ${formatAmount(totalInterest, debt.currency)}.`,
        { font: fontItalic, color: COLOR_MUTED },
      );
    }
    drawParagraph(
      `Le taux applique respecte le plafond legal d'usure en vigueur. Le Debiteur reconnait avoir ete informe du Taux Effectif Global (TEG) et du cout total du credit.`,
      { font: fontItalic, color: COLOR_MUTED, size: 9 },
    );
  } else {
    drawParagraph(
      "Le present pret est consenti a titre gratuit, sans interet. Le Debiteur s'engage a rembourser le capital integralement selon l'echeancier convenu a l'Article 2.",
    );
  }
  y -= 4;

  // ===== ARTICLE 4 - CLAUSES ADDITIONNELLES (si presentes) =====
  if (debt.additionalClauses) {
    drawSectionTitle("Article 4 - Clauses particulieres");
    drawParagraph(asciiSafe(String(debt.additionalClauses)));
    y -= 4;
  }

  // ===== ARTICLE 5 - DEFAUT =====
  const articleDefaut = debt.additionalClauses
    ? "Article 5 - Defaut de paiement"
    : "Article 4 - Defaut de paiement";
  drawSectionTitle(articleDefaut);
  drawParagraph(
    "En cas de retard de paiement superieur a 30 jours, le Debiteur s'expose aux consequences suivantes :",
  );
  drawParagraph(
    "- mise en demeure formelle par lettre recommandee avec accuse de reception ;",
    { indent: 12, size: 9.5 },
  );
  drawParagraph(
    "- application d'interets de retard au taux legal en vigueur, conformement a l'article 1231-6 du Code civil ;",
    { indent: 12, size: 9.5 },
  );
  drawParagraph(
    "- en cas de non-execution apres mise en demeure, le Creancier pourra solliciter le recouvrement par voie judiciaire et l'application de la clause penale prevue a l'article 1231-5 du Code civil.",
    { indent: 12, size: 9.5 },
  );
  drawParagraph(
    "Le Debiteur s'engage a informer le Creancier sans delai de toute difficulte financiere susceptible d'affecter sa capacite de remboursement.",
    { font: fontItalic, color: COLOR_MUTED, size: 9 },
  );
  y -= 4;

  // ===== ARTICLE 6 - JURIDICTION =====
  const articleJuridiction = debt.additionalClauses
    ? "Article 6 - Loi applicable et juridiction"
    : "Article 5 - Loi applicable et juridiction";
  drawSectionTitle(articleJuridiction);
  drawParagraph(
    "Le present acte est regi par la loi francaise. Tout litige relatif a son interpretation, son execution ou sa resiliation sera soumis a la competence exclusive des tribunaux francais, apres tentative prealable de resolution amiable.",
  );
  drawParagraph(
    "Les parties s'engagent a privilegier la voie de la conciliation ou de la mediation avant toute action judiciaire.",
    { font: fontItalic, color: COLOR_MUTED, size: 9 },
  );
  y -= 4;

  // ===== ARTICLE 7 - PLATEFORME BMD (DISCLAIMER) =====
  const articleBmd = debt.additionalClauses
    ? "Article 7 - Plateforme BMD (tiers facilitateur)"
    : "Article 6 - Plateforme BMD (tiers facilitateur)";
  drawSectionTitle(articleBmd);
  drawParagraph(
    "Le present acte a ete redige et formalise via la plateforme BMD (Back Mes Do), editee par BMD SAS. Les parties reconnaissent et acceptent expressement que :",
  );
  drawParagraph(
    "- BMD n'agit qu'en qualite de tiers facilitateur. BMD n'est ni partie, ni garante, ni mediatrice de la presente reconnaissance de dette ;",
    { indent: 12, size: 9.5 },
  );
  drawParagraph(
    "- BMD ne saurait etre tenue responsable du contenu, de la veracite, de la legalite ou de la bonne execution des engagements pris entre le Creancier et le Debiteur ;",
    { indent: 12, size: 9.5 },
  );
  drawParagraph(
    "- BMD met a disposition un outil de mise en forme et d'archivage des actes, mais ne se substitue en aucun cas a l'avis d'un professionnel du droit (notaire, avocat, conseiller juridique) ;",
    { indent: 12, size: 9.5 },
  );
  drawParagraph(
    "- En cas de litige entre les parties, BMD ne pourra etre appelee a la cause ni recherchee en garantie de quelque maniere que ce soit ;",
    { indent: 12, size: 9.5 },
  );
  drawParagraph(
    "- Pour les actes engageant des sommes importantes ou des situations juridiques complexes, les parties sont expressement invitees a consulter un professionnel du droit et, le cas echeant, a recourir a la signature electronique qualifiee eIDAS proposee par BMD via son partenaire certifie.",
    { indent: 12, size: 9.5 },
  );
  y -= 6;

  // ===== ARTICLE FINAL - SIGNATURE & MENTION =====
  ensureSpace(60);
  drawSectionTitle("Fait et signe en deux exemplaires originaux");
  drawParagraph(
    `Etabli le ${formatDate(new Date())}, en deux (2) exemplaires originaux dont un (1) remis a chaque partie.`,
  );
  drawParagraph(
    `Le Debiteur reconnait avoir pris connaissance integrale de l'ensemble des clauses du present acte et les accepter sans reserve.`,
    { font: fontItalic, color: COLOR_MUTED, size: 9 },
  );
  y -= 6;

  // Mention manuscrite obligatoire (article 1376 Code civil)
  ensureSpace(34);
  page.drawRectangle({
    x: MARGIN,
    y: y - 22,
    width: PAGE_WIDTH - 2 * MARGIN,
    height: 28,
    borderColor: COLOR_GOLD,
    borderWidth: 0.6,
    color: rgb(246 / 255, 232 / 255, 197 / 255),
  });
  const mentionLabel = "MENTION MANUSCRITE OBLIGATOIRE (Art. 1376 du Code civil) :";
  page.drawText(mentionLabel, {
    x: MARGIN + 6,
    y: y - 6,
    size: 8,
    font: fontBold,
    color: COLOR_COCOA,
  });
  const mentionText = `\"Lu et approuve. Bon pour reconnaissance de dette de la somme de ${formatAmount(amount, debt.currency)} (${wordsPart}).\"`;
  // Wrap au cas où c'est long
  const mLines = wrapText(mentionText, fontItalic, 9, PAGE_WIDTH - 2 * MARGIN - 12);
  let mY = y - 18;
  for (const line of mLines) {
    page.drawText(line, {
      x: MARGIN + 6,
      y: mY,
      size: 9,
      font: fontItalic,
      color: COLOR_COCOA,
    });
    mY -= 11;
  }
  y -= 38 + Math.max(0, (mLines.length - 1) * 11);

  // Signature blocks
  ensureSpace(110);
  y -= 8;
  drawSignatureBlock(
    page,
    fontReg,
    fontBold,
    fontItalic,
    MARGIN,
    y,
    (PAGE_WIDTH - 2 * MARGIN - 16) / 2,
    "Le Creancier",
    creditor?.displayName ?? "",
    "Signature precedee de la mention 'Lu et approuve'",
  );
  drawSignatureBlock(
    page,
    fontReg,
    fontBold,
    fontItalic,
    PAGE_WIDTH / 2 + 8,
    y,
    (PAGE_WIDTH - 2 * MARGIN - 16) / 2,
    "Le Debiteur",
    debtor?.displayName ?? "",
    "Signature precedee de la mention manuscrite obligatoire ci-dessus",
  );
  y -= 110;

  // Témoins / garants signature blocks si présents
  if (witnesses.length > 0 || guarantors.length > 0) {
    ensureSpace(110);
    const extras = [
      ...witnesses.map((w) => ({ role: "Temoin", name: w.displayName })),
      ...guarantors.map((g) => ({ role: "Garant", name: g.displayName })),
    ];
    const blockW = (PAGE_WIDTH - 2 * MARGIN - 16) / 2;
    let i = 0;
    while (i < extras.length) {
      ensureSpace(110);
      const a = extras[i]!;
      drawSignatureBlock(
        page,
        fontReg,
        fontBold,
        fontItalic,
        MARGIN,
        y,
        blockW,
        a.role,
        a.name,
        a.role === "Garant"
          ? "Signature precedee de 'Lu et approuve, bon pour caution solidaire'"
          : "Signature precedee de 'Lu et approuve'",
      );
      if (i + 1 < extras.length) {
        const b = extras[i + 1]!;
        drawSignatureBlock(
          page,
          fontReg,
          fontBold,
          fontItalic,
          PAGE_WIDTH / 2 + 8,
          y,
          blockW,
          b.role,
          b.name,
          b.role === "Garant"
            ? "Signature precedee de 'Lu et approuve, bon pour caution solidaire'"
            : "Signature precedee de 'Lu et approuve'",
        );
      }
      y -= 110;
      i += 2;
    }
  }

  // Footer dernière page
  drawContractPageFooter(
    page,
    fontReg,
    fontItalic,
    contractId,
    debt.footerNote ?? null,
    pageNumber,
  );

  // Met à jour le total pages sur tous les footers
  const totalPages = pdf.getPages().length;
  pdf.getPages().forEach((p, idx) => {
    drawContractPageNumber(p, fontReg, idx + 1, totalPages);
  });

  return pdf.save();
}

// ============================================================================
// Helpers contract PDF
// ============================================================================

/** Header standard d'une page de contrat (logo + ID + bandeau saffron) */
function drawContractPageHeader(
  page: PDFPage,
  fontReg: PDFFont,
  fontBold: PDFFont,
  fontItalic: PDFFont,
  contractId: string,
  isPreview: boolean,
  _pageNumber: number,
): number {
  // Bandeau saffron top + bandeau cocoa bottom
  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 8,
    width: PAGE_WIDTH,
    height: 8,
    color: COLOR_SAFFRON,
  });
  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_WIDTH,
    height: 4,
    color: COLOR_COCOA,
  });

  // Logo (mini, en haut gauche)
  page.drawRectangle({
    x: MARGIN,
    y: PAGE_HEIGHT - 36,
    width: 20,
    height: 20,
    color: COLOR_SAFFRON,
  });
  const w = fontBold.widthOfTextAtSize("B", 12);
  page.drawText("B", {
    x: MARGIN + (20 - w) / 2,
    y: PAGE_HEIGHT - 32,
    size: 12,
    font: fontBold,
    color: COLOR_IVORY,
  });
  page.drawText("BMD", {
    x: MARGIN + 26,
    y: PAGE_HEIGHT - 24,
    size: 12,
    font: fontBold,
    color: COLOR_COCOA,
  });
  page.drawText("Back Mes Do - L'argent partage, l'amitie protegee.", {
    x: MARGIN + 26,
    y: PAGE_HEIGHT - 34,
    size: 7,
    font: fontItalic,
    color: COLOR_MUTED,
  });

  // ID contrat en haut à droite
  const idLabel = "ID CONTRAT";
  page.drawText(idLabel, {
    x: PAGE_WIDTH - MARGIN - fontReg.widthOfTextAtSize(idLabel, 7),
    y: PAGE_HEIGHT - 22,
    size: 7,
    font: fontBold,
    color: COLOR_MUTED,
  });
  page.drawText(contractId, {
    x: PAGE_WIDTH - MARGIN - fontBold.widthOfTextAtSize(contractId, 9),
    y: PAGE_HEIGHT - 33,
    size: 9,
    font: fontBold,
    color: COLOR_COCOA,
  });

  // Watermark APERCU si isPreview (centré, opacité 6%)
  if (isPreview) {
    const wmW = fontBold.widthOfTextAtSize("APERCU", 90);
    page.drawText("APERCU", {
      x: (PAGE_WIDTH - wmW) / 2,
      y: PAGE_HEIGHT / 2 - 30,
      size: 90,
      font: fontBold,
      color: rgb(197 / 255, 138 / 255, 46 / 255),
      opacity: 0.06,
    });
  }

  return PAGE_HEIGHT - 60;
}

/** Footer standard d'une page (mention BMD ou note custom + horodatage) */
function drawContractPageFooter(
  page: PDFPage,
  fontReg: PDFFont,
  fontItalic: PDFFont,
  contractId: string,
  customFooterNote: string | null,
  _pageNumber: number,
) {
  const footerY = 22;
  const mention =
    customFooterNote && customFooterNote.length > 0
      ? asciiSafe(customFooterNote)
      : "Acte etabli via BMD SAS - Tiers facilitateur sans engagement de responsabilite. Pour les actes complexes, consultez un professionnel du droit.";
  // Wrap si trop long
  const lines = wrapText(mention, fontItalic, 7.5, PAGE_WIDTH - 2 * MARGIN);
  let ly = footerY + (lines.length - 1) * 9;
  for (const line of lines) {
    const lw = fontItalic.widthOfTextAtSize(line, 7.5);
    page.drawText(line, {
      x: (PAGE_WIDTH - lw) / 2,
      y: ly,
      size: 7.5,
      font: fontItalic,
      color: COLOR_MUTED,
    });
    ly -= 9;
  }
  const stamp = `Reference ${contractId} - Genere le ${formatDate(new Date())} ${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
  const sw = fontReg.widthOfTextAtSize(stamp, 6.5);
  page.drawText(stamp, {
    x: (PAGE_WIDTH - sw) / 2,
    y: footerY - 10,
    size: 6.5,
    font: fontReg,
    color: COLOR_MUTED,
  });
}

/** Numéro de page en bas à droite (X/Y) */
function drawContractPageNumber(
  page: PDFPage,
  font: PDFFont,
  current: number,
  total: number,
) {
  const txt = `Page ${current} / ${total}`;
  const w = font.widthOfTextAtSize(txt, 7);
  page.drawText(txt, {
    x: PAGE_WIDTH - MARGIN - w,
    y: 10,
    size: 7,
    font,
    color: COLOR_MUTED,
  });
}

/** Cadre de signature pour une partie */
function drawSignatureBlock(
  page: PDFPage,
  fontReg: PDFFont,
  fontBold: PDFFont,
  fontItalic: PDFFont,
  x: number,
  topY: number,
  width: number,
  role: string,
  name: string,
  hint: string,
) {
  const height = 96;
  // Card
  page.drawRectangle({
    x,
    y: topY - height,
    width,
    height,
    borderColor: COLOR_HAIRLINE,
    borderWidth: 0.5,
    color: COLOR_IVORY,
  });
  // Role + nom
  page.drawText(role.toUpperCase(), {
    x: x + 8,
    y: topY - 14,
    size: 8,
    font: fontBold,
    color: COLOR_GOLD,
  });
  page.drawText(asciiSafe(name) || "_________________________", {
    x: x + 8,
    y: topY - 28,
    size: 11,
    font: fontBold,
    color: COLOR_COCOA,
  });
  // Hint
  const hintLines = wrapText(hint, fontItalic, 7.5, width - 16);
  let hy = topY - 42;
  for (const line of hintLines) {
    page.drawText(line, {
      x: x + 8,
      y: hy,
      size: 7.5,
      font: fontItalic,
      color: COLOR_MUTED,
    });
    hy -= 10;
  }
  // Zone "Fait a / le"
  page.drawText("Fait a : __________________________", {
    x: x + 8,
    y: topY - 70,
    size: 8,
    font: fontReg,
    color: COLOR_COCOA,
  });
  page.drawText("Le : ______________________________", {
    x: x + 8,
    y: topY - 82,
    size: 8,
    font: fontReg,
    color: COLOR_COCOA,
  });
  // Zone signature (rectangle vide)
  page.drawText("Signature :", {
    x: x + 8,
    y: topY - 94,
    size: 7,
    font: fontBold,
    color: COLOR_MUTED,
  });
}

// ============================================================================
// Helpers utilitaires
// ============================================================================

/** Wrap simple par largeur de police (split sur espaces, force coupe si mot trop long) */
function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const safe = asciiSafe(text);
  const words = safe.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const test = current ? `${current} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * V244.A — Sanitise une chaine pour les polices WinAnsi (Helvetica
 * standard pdf-lib). Remplace les caracteres Unicode hors WinAnsi (emoji,
 * triangles, fleches, etc.) par des equivalents ASCII safe. Sans ca le
 * rendu PDF crash avec "WinAnsi cannot encode ...".
 */
function asciiSafe(input: string): string {
  if (!input) return "";
  return input
    .replace(/▴|▾|▸|▹/g, ">")
    .replace(/✓|✔/g, "v")
    .replace(/✗|✘/g, "x")
    .replace(/→|⇒/g, "->")
    .replace(/←|⇐/g, "<-")
    .replace(/•/g, "-")
    .replace(/—/g, "-")
    .replace(/–/g, "-")
    .replace(/‘|’/g, "'")
    .replace(/“|”/g, '"')
    // Strip remaining non-WinAnsi chars > U+00FF
    .replace(/[^\x00-\xFF]/g, "");
}

/**
 * V244.C — Convertit un entier (0..999_999_999) en mots francais.
 * Usage : mention "Bon pour la somme de X euros (en lettres)" obligatoire
 * pour les reconnaissances de dettes (art. 1376 CC).
 */
function numberToFrenchWords(n: number): string {
  if (n === 0) return "zero";
  if (n < 0) return `moins ${numberToFrenchWords(-n)}`;
  const units = [
    "",
    "un",
    "deux",
    "trois",
    "quatre",
    "cinq",
    "six",
    "sept",
    "huit",
    "neuf",
    "dix",
    "onze",
    "douze",
    "treize",
    "quatorze",
    "quinze",
    "seize",
    "dix-sept",
    "dix-huit",
    "dix-neuf",
  ];
  const tens: Record<number, string> = {
    2: "vingt",
    3: "trente",
    4: "quarante",
    5: "cinquante",
    6: "soixante",
    7: "soixante",
    8: "quatre-vingt",
    9: "quatre-vingt",
  };
  function under100(x: number): string {
    if (x < 20) return units[x] ?? "";
    const t = Math.floor(x / 10);
    const u = x % 10;
    if (t === 7 || t === 9) {
      // soixante-(dix..dix-neuf) ou quatre-vingt-(dix..dix-neuf)
      const sub = 10 + u;
      const tBase = t === 7 ? 6 : 8;
      const link = tBase === 6 && sub === 11 ? "-et-" : "-";
      return `${tens[tBase]}${link}${units[sub]}`;
    }
    if (u === 0) {
      // 80 = quatre-vingts (avec s), 20-60 sans s
      return t === 8 ? "quatre-vingts" : tens[t] ?? "";
    }
    if (u === 1 && t !== 8) return `${tens[t]}-et-un`;
    return `${tens[t]}-${units[u]}`;
  }
  function under1000(x: number): string {
    if (x < 100) return under100(x);
    const h = Math.floor(x / 100);
    const rest = x % 100;
    const hPart =
      h === 1 ? "cent" : rest === 0 ? `${units[h]} cents` : `${units[h]} cent`;
    return rest === 0 ? hPart : `${hPart} ${under100(rest)}`;
  }
  if (n < 1000) return under1000(n);
  if (n < 1_000_000) {
    const t = Math.floor(n / 1000);
    const rest = n % 1000;
    const tPart = t === 1 ? "mille" : `${under1000(t)} mille`;
    return rest === 0 ? tPart : `${tPart} ${under1000(rest)}`;
  }
  if (n < 1_000_000_000) {
    const m = Math.floor(n / 1_000_000);
    const rest = n % 1_000_000;
    const mPart =
      m === 1 ? "un million" : `${under1000(m)} millions`;
    return rest === 0
      ? mPart
      : `${mPart} ${rest < 1000 ? under1000(rest) : numberToFrenchWords(rest)}`;
  }
  // Fallback pour montants tres eleves
  return `${n}`;
}

/** Frequency label fr (singular for 1 echeance, pluriel sinon) */
function formatFrequency(freq: string, totalInst: number): string {
  if (freq === "LUMP_SUM") return "Paiement unique";
  const map: Record<string, string> = {
    WEEKLY: "Hebdomadaire",
    MONTHLY: "Mensuelle",
    QUARTERLY: "Trimestrielle",
    YEARLY: "Annuelle",
    CUSTOM: "Personnalisee",
  };
  const base = map[freq] ?? "Mensuelle";
  if (totalInst === 1) return `${base} (1 echeance)`;
  return `${base} (${totalInst} echeances)`;
}
