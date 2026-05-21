/**
 * V202.C — Emails brandés BMD pour le module Caisses Projet.
 * =============================================================================
 * 5 transitions clés :
 *   - CONTRIBUTION_DECLARED : trésorier reçoit info qu'une cotisation est à valider
 *   - CONTRIBUTION_VALIDATED : contributeur reçoit confirmation
 *   - VOTE_OPENED : contributeurs invités à voter sur une dépense
 *   - EXPENSE_EXECUTED : contributeurs informés de l'exécution
 *   - FUND_CLOSED : tous les contributeurs informés de la clôture
 *
 * Tous les emails utilisent le brand BMD (couleurs V45-light : cocoa,
 * saffron, emerald, terracotta). Tous portent un rappel légal Registre.
 *
 * Pour rester découplé du système email templates strictement typé, on
 * construit l'HTML directement et on appelle `sendEmail` brut. En l'absence
 * de RESEND_API_KEY (mode dev), sendEmail log dans la console.
 */
import { prisma } from "../../lib/db.js";
import { sendEmail } from "../../lib/messaging.js";

type FundEmailInput =
  | {
      kind: "CONTRIBUTION_DECLARED";
      toUserId: string;
      fundName: string;
      groupId: string;
      fundId: string;
      contributorName: string;
      amount: number;
      currency: string;
    }
  | {
      kind: "CONTRIBUTION_VALIDATED";
      toUserId: string;
      fundName: string;
      groupId: string;
      fundId: string;
      amount: number;
      currency: string;
    }
  | {
      kind: "VOTE_OPENED";
      toUserId: string;
      fundName: string;
      groupId: string;
      fundId: string;
      expenseMotive: string;
      amount: number;
      currency: string;
      voteClosesAt: Date;
    }
  | {
      kind: "EXPENSE_EXECUTED";
      toUserId: string;
      fundName: string;
      groupId: string;
      fundId: string;
      expenseMotive: string;
      amount: number;
      currency: string;
    }
  | {
      kind: "FUND_CLOSED";
      toUserId: string;
      fundName: string;
      groupId: string;
      fundId: string;
      balance: number;
      currency: string;
    };

const APP_URL = process.env.APP_URL || "https://app.backmesdo.com";

export async function sendFundEmail(input: FundEmailInput): Promise<void> {
  // V202.C — User.email n'existe pas en colonne ; on récupère via UserContact
  // (table séparée, plusieurs contacts par user). On prend l'EMAIL primary
  // si dispo, sinon le 1er EMAIL vérifié.
  const user = await prisma.user.findUnique({
    where: { id: input.toUserId },
    select: {
      displayName: true,
      contacts: {
        where: { type: "EMAIL" },
        select: { value: true, isPrimary: true },
        orderBy: { isPrimary: "desc" },
        take: 1,
      },
    },
  }) as any;
  const email = user?.contacts?.[0]?.value;
  if (!email) return;

  const link = `${APP_URL}/dashboard/groups/${input.groupId}/funds/${input.fundId}`;
  const built = buildFundEmailParts(input, user?.displayName ?? "");
  const html = wrapBrandedHtml(built.subject, built.bodyHtml, built.ctaLabel, link);

  // Version texte simple pour respect EmailMessage typage strict
  const text = stripHtml(built.bodyHtml).trim();

  await sendEmail(
    { to: email, subject: built.subject, html, text },
    input.toUserId,
  );
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

function buildFundEmailParts(
  input: FundEmailInput,
  recipientName: string,
): { subject: string; bodyHtml: string; ctaLabel: string } {
  const greeting = recipientName ? `Bonjour ${recipientName},` : "Bonjour,";
  switch (input.kind) {
    case "CONTRIBUTION_DECLARED":
      return {
        subject: `Cotisation déclarée — ${input.fundName}`,
        ctaLabel: "Valider la cotisation",
        bodyHtml: `
          <p>${greeting}</p>
          <p><strong>${escapeHtml(input.contributorName)}</strong> vient de déclarer
          une cotisation de <strong>${input.amount.toFixed(2)} ${input.currency}</strong>
          pour la caisse <strong>« ${escapeHtml(input.fundName)} »</strong>.</p>
          <p>Vérifie la preuve (virement, mobile money, etc.) avant de valider.</p>
        `,
      };
    case "CONTRIBUTION_VALIDATED":
      return {
        subject: `Cotisation validée — ${input.fundName}`,
        ctaLabel: "Voir la caisse",
        bodyHtml: `
          <p>${greeting}</p>
          <p>Ta cotisation de <strong>${input.amount.toFixed(2)} ${input.currency}</strong>
          pour la caisse <strong>« ${escapeHtml(input.fundName)} »</strong> vient
          d'être validée par le trésorier.</p>
          <p>Merci de ta contribution.</p>
        `,
      };
    case "VOTE_OPENED":
      return {
        subject: `Vote ouvert : ${input.expenseMotive}`,
        ctaLabel: "Voter maintenant",
        bodyHtml: `
          <p>${greeting}</p>
          <p>Une dépense est proposée pour la caisse
          <strong>« ${escapeHtml(input.fundName)} »</strong> :</p>
          <ul>
            <li><strong>Motif :</strong> ${escapeHtml(input.expenseMotive)}</li>
            <li><strong>Montant :</strong> ${input.amount.toFixed(2)} ${input.currency}</li>
            <li><strong>Fin du vote :</strong> ${input.voteClosesAt.toLocaleString("fr-FR")}</li>
          </ul>
          <p>Vote « Pour » ou « Contre » avant la fin de la période.</p>
        `,
      };
    case "EXPENSE_EXECUTED":
      return {
        subject: `Dépense exécutée — ${input.fundName}`,
        ctaLabel: "Voir le détail",
        bodyHtml: `
          <p>${greeting}</p>
          <p>Le trésorier vient d'exécuter une dépense de
          <strong>${input.amount.toFixed(2)} ${input.currency}</strong> depuis la
          caisse <strong>« ${escapeHtml(input.fundName)} »</strong>.</p>
          <p><strong>Motif :</strong> ${escapeHtml(input.expenseMotive)}</p>
          <p>L'événement est enregistré dans le journal d'audit (hash chaîné SHA-256).</p>
        `,
      };
    case "FUND_CLOSED":
      return {
        subject: `Caisse clôturée — ${input.fundName}`,
        ctaLabel: "Voir le récap",
        bodyHtml: `
          <p>${greeting}</p>
          <p>La caisse <strong>« ${escapeHtml(input.fundName)} »</strong> a été
          clôturée.</p>
          <p><strong>Solde final :</strong> ${input.balance.toFixed(2)} ${input.currency}</p>
          <p>Le journal d'audit reste accessible — exporte-le en PDF à tout moment.</p>
        `,
      };
  }
}

function wrapBrandedHtml(
  subject: string,
  bodyHtml: string,
  ctaLabel: string,
  ctaUrl: string,
): string {
  const legalFooter = `
    <p style="margin-top:20px; padding:10px 12px; border-left:3px solid #1F7A57; background:rgba(31,122,87,0.06); font-size:12px; color:#5a4b3a; line-height:1.5;">
      <strong>BMD est un registre, pas une banque.</strong> L'argent n'est jamais
      détenu par BMD. Le trésorier nommé est seul responsable de la garde des fonds.
    </p>
  `;
  return `
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:560px;margin:0 auto;color:#2B1F15;background:#FBF6EC;padding:24px;">
      <div style="background:#C58A2E;color:#FBF6EC;padding:10px 16px;border-radius:8px 8px 0 0;font-size:11px;letter-spacing:0.6px;text-transform:uppercase;font-weight:700;">
        Caisse projet · BMD
      </div>
      <div style="background:#fff;border-radius:0 0 8px 8px;padding:24px;border:1px solid rgba(43,31,21,0.10);">
        <h1 style="margin:0 0 16px;font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:700;color:#2B1F15;line-height:1.3;">${escapeHtml(subject)}</h1>
        <div style="font-size:14px;line-height:1.55;color:#2B1F15;">${bodyHtml}</div>
        <p style="margin:18px 0 0;">
          <a href="${ctaUrl}" style="display:inline-block;padding:11px 18px;background:linear-gradient(135deg,#C58A2E,#9F4628);color:#FBF6EC;text-decoration:none;border-radius:999px;font-weight:700;font-size:13px;">${escapeHtml(ctaLabel)} →</a>
        </p>
        ${legalFooter}
      </div>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
