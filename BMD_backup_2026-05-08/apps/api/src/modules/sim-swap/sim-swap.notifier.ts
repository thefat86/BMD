/**
 * Notifications multi-canal pour les événements SIM swap (spec §7.5).
 *
 * Principe central : quand on détecte une tentative suspecte, on alerte
 * sur **TOUS les canaux disponibles** de l'utilisateur, pas juste celui
 * qui vient d'être utilisé pour l'OTP. Ainsi, si le pirate a la SIM,
 * la victime reçoit quand même l'alerte sur son email vérifié + push web.
 *
 * Ton chaleureux + multi-culturel : la sécurité doit rassurer, pas
 * effrayer. Pas de jargon technique, focus sur l'action concrète.
 *
 * Diaspora / inclusion : on évite les références culturelles ou
 * géographiques qui ne parleraient qu'aux européens. On parle de
 * "famille proche", "communauté", "amis", "collègues" pour rester
 * universel — pas de "your colleagues at the office" par exemple.
 */
import { prisma } from "../../lib/db.js";
import { sendEmail } from "../../lib/messaging.js";
import { sendPushToUser } from "../../lib/web-push.js";
import { loadEnv } from "../../lib/env.js";
import type { RiskAssessment } from "./sim-swap.service.js";

interface NotifyArgs {
  userId: string;
  eventId: string;
  assessment: RiskAssessment;
  attemptCountry: string;
  blocked: boolean;
}

/**
 * Notifie l'utilisateur sur tous ses canaux disponibles.
 * Fire-and-forget : aucune erreur ne fait remonter d'exception.
 */
export async function notifyUserSimSwapAlert(args: NotifyArgs): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: args.userId },
      select: {
        displayName: true,
        contacts: {
          where: { isVerified: true },
          select: { type: true, value: true, isPrimary: true },
        },
      },
    });
    if (!user) return;

    const env = loadEnv();
    const verifyUrl = `${env.WEB_BASE_URL}/dashboard/profile?simSwapEvent=${args.eventId}`;

    // === 1. Notif in-app (toujours, même si l'app est fermée) ===
    await prisma.notification.create({
      data: {
        userId: args.userId,
        kind: "NEW_DEVICE_LOGIN", // réutilise le kind existant pour la sécurité
        title: args.blocked
          ? "🚨 Connexion bloquée par sécurité"
          : "⚠️ Connexion inhabituelle détectée",
        body: humanBody(args, "in-app"),
        link: "/dashboard/profile",
        payload: {
          simSwapEventId: args.eventId,
          riskScore: args.assessment.score,
          level: args.assessment.level,
          blocked: args.blocked,
        },
      },
    });

    // === 2. Push web (toutes les subscriptions actives) ===
    void sendPushToUser(args.userId, {
      title: args.blocked
        ? "🚨 BMD : Connexion bloquée"
        : "⚠️ BMD : Tentative de connexion suspecte",
      body: shortPushBody(args),
      url: "/dashboard/profile",
      tag: `sim-swap-${args.eventId}`,
    });

    // === 3. Email — sur TOUS les emails vérifiés (pas juste le primaire) ===
    // Important : si le pirate a réussi à modifier l'email primaire,
    // on alerte quand même sur les anciens emails verifiés.
    const emails = user.contacts.filter((c) => c.type === "EMAIL");
    for (const e of emails) {
      void sendEmail({
        to: e.value,
        subject: args.blocked
          ? "🚨 [BMD] Connexion bloquée — vérification urgente"
          : "⚠️ [BMD] Connexion inhabituelle sur ton compte",
        text: emailText(args, user.displayName, verifyUrl),
        html: emailHtml(args, user.displayName, verifyUrl),
      });
    }

    // Note : pour les SMS, on ne les utilise PAS dans ce contexte
    // car si c'est un SIM swap, le pirate intercepterait le SMS d'alerte.
    // L'email + push sont des canaux out-of-band sûrs.
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(
      "[sim-swap.notifier] échec silencieux:",
      e instanceof Error ? e.message : e,
    );
  }
}

// ============================================================
// Templates de message chaleureux & multi-culturel
// ============================================================

function humanBody(args: NotifyArgs, channel: "in-app" | "email"): string {
  if (args.blocked) {
    return channel === "in-app"
      ? "Pour ta sécurité, on a bloqué une connexion qui semblait inhabituelle. Si c'était toi, on t'aide à débloquer rapidement."
      : "Pour protéger ton compte, on a bloqué une tentative de connexion qui présentait plusieurs signaux inhabituels.";
  }
  return channel === "in-app"
    ? "On a remarqué une connexion inhabituelle. Si c'était toi, tu peux confirmer en un clic. Sinon, on te montre comment sécuriser ton compte."
    : "Une connexion à ton compte BMD vient d'avoir lieu avec des caractéristiques inhabituelles. Si c'était toi, ignore ce message — sinon, agis vite.";
}

function shortPushBody(args: NotifyArgs): string {
  if (args.blocked) {
    return "Connexion suspecte refusée. Vérifie tes contacts et ton 2FA.";
  }
  return `Connexion inhabituelle (score ${args.assessment.score}/100). Confirme ou agis depuis ton profil.`;
}

function emailText(
  args: NotifyArgs,
  displayName: string,
  verifyUrl: string,
): string {
  const reasonsList = args.assessment.reasons
    .map((r) => `  • ${r}`)
    .join("\n");
  if (args.blocked) {
    return `Salut ${displayName},

Pour ta sécurité, BMD a BLOQUÉ une tentative de connexion à ton compte.

Voici ce qu'on a remarqué d'inhabituel :
${reasonsList}

Que faire ?

→ Si c'était bien toi (par exemple tu voyages, tu as changé de téléphone) :
  Ouvre BMD depuis un appareil que tu utilises habituellement et confirme :
  ${verifyUrl}

→ Si ce n'était PAS toi :
  1. Change immédiatement ton mot de passe / désactive l'accès SMS
  2. Active la double authentification (2FA) si pas déjà fait
  3. Vérifie tes contacts (numéro, email) — supprime ceux qui ne sont pas à toi
  4. Contacte ton opérateur télécom si tu suspectes un SIM swap

À ton service,
L'équipe BMD`;
  }
  return `Salut ${displayName},

Une connexion à ton compte BMD vient d'avoir lieu avec quelques signaux inhabituels.

Voici ce qu'on a remarqué :
${reasonsList}

Que faire ?

→ Si c'était bien toi : pas de souci, tu peux ignorer ce message.
  Si tu veux, confirme depuis ton profil pour qu'on n'envoie plus d'alerte
  pour cette nouvelle situation : ${verifyUrl}

→ Si ce n'était PAS toi :
  1. Change ton mot de passe et active la double authentification
  2. Vérifie tes contacts dans ton profil
  3. Reviens sur ce mail et clique le lien plus bas pour signaler le problème

On veille toujours sur tes données.

L'équipe BMD`;
}

function emailHtml(
  args: NotifyArgs,
  displayName: string,
  verifyUrl: string,
): string {
  const blocked = args.blocked;
  const titleEmoji = blocked ? "🚨" : "⚠️";
  const titleText = blocked
    ? "Connexion bloquée par sécurité"
    : "Connexion inhabituelle détectée";
  const bgGradient = blocked
    ? "linear-gradient(135deg,#fef2f2,#fee2e2)"
    : "linear-gradient(135deg,#fef3e2,#fde68a)";
  const accentColor = blocked ? "#991b1b" : "#b45309";

  const reasonsHtml = args.assessment.reasons
    .map(
      (r) =>
        `<li style="padding:6px 0;color:#574a6e;font-size:13px;line-height:1.5">${escapeHtml(r)}</li>`,
    )
    .join("");

  return `<!doctype html>
<html lang="fr"><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1625;background:#faf7f0">
  <div style="text-align:center;margin-bottom:24px">
    <div style="font-family:'Cormorant Garamond',serif;font-size:28px;color:#3a2f5b;font-weight:700">BMD</div>
    <div style="font-size:11px;color:#7c6e93;letter-spacing:2px;text-transform:uppercase">Back Mes Do</div>
  </div>

  <div style="background:${bgGradient};border-radius:14px;padding:20px;margin-bottom:20px;text-align:center">
    <div style="font-size:36px;margin-bottom:6px">${titleEmoji}</div>
    <div style="font-size:18px;font-weight:700;color:${accentColor}">${titleText}</div>
  </div>

  <p style="font-size:14px;line-height:1.5;color:#574a6e">Salut ${escapeHtml(displayName)},</p>

  <p style="font-size:14px;line-height:1.5;color:#574a6e">
    ${
      blocked
        ? "Pour ta sécurité, BMD a <strong>bloqué une tentative de connexion</strong> à ton compte qui présentait plusieurs signaux inhabituels."
        : "Une connexion à ton compte BMD vient d'avoir lieu avec quelques signaux inhabituels. Pas de panique : on te montre quoi faire."
    }
  </p>

  <div style="background:rgba(232,163,61,0.08);border-left:3px solid #e8a33d;border-radius:8px;padding:14px;margin:16px 0">
    <div style="font-size:11px;color:#7c6e93;letter-spacing:1.4px;text-transform:uppercase;margin-bottom:8px">Ce qu'on a remarqué</div>
    <ul style="margin:0;padding-left:18px">${reasonsHtml}</ul>
  </div>

  <h2 style="font-size:15px;color:#3a2f5b;margin:24px 0 8px">✅ Si c'était toi</h2>
  <p style="font-size:13px;line-height:1.5;color:#574a6e;margin:0 0 12px">
    Tu voyages ? Tu as changé de téléphone ? Tout va bien. Confirme en un clic
    ${blocked ? "pour débloquer la connexion" : "pour qu'on n'envoie plus d'alerte"} :
  </p>
  <div style="text-align:center;margin:14px 0">
    <a href="${verifyUrl}" style="display:inline-block;padding:12px 22px;background:#10b981;color:#fff;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px">C'était bien moi ✓</a>
  </div>

  <h2 style="font-size:15px;color:#991b1b;margin:24px 0 8px">🚫 Si ce n'était PAS toi</h2>
  <ol style="margin:0;padding-left:20px;font-size:13px;line-height:1.6;color:#574a6e">
    <li><strong>Change ton mot de passe</strong> immédiatement (si tu en as un) et active la <strong>double authentification (2FA)</strong> dans ton profil.</li>
    <li><strong>Vérifie tes contacts</strong> (numéros, emails) — supprime ceux que tu ne reconnais pas.</li>
    <li>Si tu suspectes un <strong>SIM swap</strong> (quelqu'un a pris le contrôle de ton numéro), <strong>appelle ton opérateur télécom</strong> sans attendre.</li>
    <li>Reviens sur BMD depuis un appareil que tu connais et utilise « Sessions actives » pour déconnecter les sessions suspectes.</li>
  </ol>

  <hr style="border:none;border-top:1px solid #e5dccc;margin:24px 0">

  <p style="font-size:11px;color:#a89a8c;text-align:center;line-height:1.5">
    Cet email t'a été envoyé sur tous tes contacts vérifiés pour ta sécurité.<br>
    L'argent partagé. L'amitié protégée. Et la sécurité d'abord.
  </p>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
