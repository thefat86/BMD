/**
 * Couche de messagerie (SMS, WhatsApp, Email).
 *
 * Un dispatcher unique qui choisit le canal selon `OTP_DELIVERY_MODE`
 * et le type de contact. Chaque provider est isolé pour pouvoir être
 * remplacé / mocké facilement (tests, fournisseur alternatif).
 *
 * Mode "console" (par défaut dev) : log dans la console serveur.
 * Mode "auto" : choisit le meilleur canal en fonction du contact + de
 *               ce qui est configuré dans l'env. Recommandé pour la prod.
 *
 * Tous les providers retournent une promesse résolue même en cas d'erreur
 * réseau du provider (on log mais on ne fait pas crasher la requête API).
 * En cas d'échec hard (provider indisponible), le code OTP reste valable
 * — l'utilisateur peut redemander un envoi.
 */
import { loadEnv } from "./env.js";
// V72 — Tracking LIVE des envois SMS / Email / WhatsApp pour coût réel
import {
  trackSmsSent,
  trackEmailSent,
  trackWhatsAppSent,
  trackOtpVerifySession,
} from "./usage-tracker.js";

export interface SmsMessage {
  to: string; // E.164 (+33...)
  body: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface WhatsAppOtpMessage {
  to: string; // E.164 sans le +
  code: string; // OTP à injecter dans le template
}

// ============================================================
// Twilio SMS
// ============================================================
async function sendViaTwilio(msg: SmsMessage): Promise<void> {
  const env = loadEnv();
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM_NUMBER) {
    throw new Error("Twilio non configuré (SID/TOKEN/FROM manquants)");
  }
  const auth = Buffer.from(
    `${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`,
  ).toString("base64");
  const r = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: "POST",
      headers: {
        authorization: `Basic ${auth}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: msg.to,
        From: env.TWILIO_FROM_NUMBER,
        Body: msg.body,
      }),
    },
  );
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Twilio ${r.status}: ${txt.slice(0, 200)}`);
  }
}

// ============================================================
// Twilio Verify Service · OTP géré par Twilio (anti-fraude built-in)
// ============================================================
//
// Quand TWILIO_VERIFY_SERVICE_SID est défini, on délègue la génération du
// code, l'envoi SMS, le rate limiting et la vérification au service Verify.
// Avantages vs SMS direct :
//   - Twilio génère + stocke le code (rien en BDD côté BMD)
//   - Anti-bruteforce automatique (5 tentatives max, expire 10 min)
//   - Channel multi (SMS / WhatsApp / call) selon préférence du Service
//   - Templates SMS gérés depuis le dashboard Twilio (multi-langue)

export async function sendOtpViaTwilioVerify(
  to: string,
  channel: "sms" | "whatsapp" | "email" = "sms",
  /** V72 — userId pour tracking coût (optionnel : pas dispo au signup). */
  userId?: string,
): Promise<{ status: string; sid: string }> {
  const env = loadEnv();
  if (
    !env.TWILIO_ACCOUNT_SID ||
    !env.TWILIO_AUTH_TOKEN ||
    !env.TWILIO_VERIFY_SERVICE_SID
  ) {
    throw new Error(
      "Twilio Verify non configuré (SID/TOKEN/VERIFY_SERVICE_SID manquants)",
    );
  }
  const auth = Buffer.from(
    `${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`,
  ).toString("base64");
  const r = await fetch(
    `https://verify.twilio.com/v2/Services/${env.TWILIO_VERIFY_SERVICE_SID}/Verifications`,
    {
      method: "POST",
      headers: {
        authorization: `Basic ${auth}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, Channel: channel }),
    },
  );
  if (!r.ok) {
    const txt = await r.text();
    // V72 — Tracking aussi en cas d'échec (Twilio facture parfois)
    if (userId) {
      trackOtpVerifySession({ userId, channel, to, hadError: true });
    }
    throw new Error(`Twilio Verify ${r.status}: ${txt.slice(0, 200)}`);
  }
  // V72 — Tracking LIVE de la session Verify créée
  if (userId) {
    trackOtpVerifySession({ userId, channel, to });
  }
  return (await r.json()) as { status: string; sid: string };
}

export async function verifyOtpViaTwilioVerify(
  to: string,
  code: string,
): Promise<{ approved: boolean; status: string }> {
  const env = loadEnv();
  if (
    !env.TWILIO_ACCOUNT_SID ||
    !env.TWILIO_AUTH_TOKEN ||
    !env.TWILIO_VERIFY_SERVICE_SID
  ) {
    throw new Error(
      "Twilio Verify non configuré (SID/TOKEN/VERIFY_SERVICE_SID manquants)",
    );
  }
  const auth = Buffer.from(
    `${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`,
  ).toString("base64");
  const r = await fetch(
    `https://verify.twilio.com/v2/Services/${env.TWILIO_VERIFY_SERVICE_SID}/VerificationCheck`,
    {
      method: "POST",
      headers: {
        authorization: `Basic ${auth}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, Code: code }),
    },
  );
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Twilio Verify check ${r.status}: ${txt.slice(0, 200)}`);
  }
  const body = (await r.json()) as { status: string };
  return { approved: body.status === "approved", status: body.status };
}

export function isTwilioVerifyConfigured(): boolean {
  const env = loadEnv();
  return !!(
    env.TWILIO_ACCOUNT_SID &&
    env.TWILIO_AUTH_TOKEN &&
    env.TWILIO_VERIFY_SERVICE_SID
  );
}

// ============================================================
// Resend (emails)
// ============================================================
async function sendViaResend(msg: EmailMessage): Promise<void> {
  const env = loadEnv();
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    throw new Error("Resend non configuré (API_KEY/FROM_EMAIL manquants)");
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: `${env.RESEND_FROM_NAME} <${env.RESEND_FROM_EMAIL}>`,
      to: [msg.to],
      subject: msg.subject,
      text: msg.text,
      ...(msg.html ? { html: msg.html } : {}),
    }),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Resend ${r.status}: ${txt.slice(0, 200)}`);
  }
}

// ============================================================
// WhatsApp Cloud API (Meta) — pour OTP via template
// ============================================================
async function sendViaWhatsAppOtp(msg: WhatsAppOtpMessage): Promise<void> {
  const env = loadEnv();
  if (
    !env.WHATSAPP_PHONE_NUMBER_ID ||
    !env.WHATSAPP_ACCESS_TOKEN ||
    !env.WHATSAPP_OTP_TEMPLATE
  ) {
    throw new Error(
      "WhatsApp Cloud non configuré (PHONE_NUMBER_ID/ACCESS_TOKEN/OTP_TEMPLATE manquants)",
    );
  }
  // Le numéro doit être sans le "+" pour l'API Meta
  const to = msg.to.replace(/^\+/, "");
  const r = await fetch(
    `https://graph.facebook.com/v19.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: env.WHATSAPP_OTP_TEMPLATE,
          language: { code: "fr" },
          components: [
            {
              type: "body",
              parameters: [{ type: "text", text: msg.code }],
            },
            // Code OTP est aussi requis dans le bouton URL pour les templates "OTP"
            {
              type: "button",
              sub_type: "url",
              index: "0",
              parameters: [{ type: "text", text: msg.code }],
            },
          ],
        },
      }),
    },
  );
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`WhatsApp ${r.status}: ${txt.slice(0, 200)}`);
  }
}

// ============================================================
// Console (dev) — affiche dans les logs
// ============================================================
function sendViaConsole(label: string, payload: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.log(`\n📨 [${label}] DEV DELIVERY`);
  for (const [k, v] of Object.entries(payload)) {
    // eslint-disable-next-line no-console
    console.log(`   ${k}: ${String(v)}`);
  }
}

// ============================================================
// Dispatcher principal — appelé depuis otp.service.ts
// ============================================================

export interface DeliverOtpInput {
  contactType: "PHONE" | "EMAIL";
  contactValue: string;
  code: string;
  ttlSeconds: number;
  /** Canal préféré pour les téléphones : SMS (défaut) ou WHATSAPP. */
  channel?: "SMS" | "WHATSAPP" | "EMAIL";
  /** V72 — userId du destinataire (s'il existe déjà en DB) pour tracking
   *  des coûts par client. Pour un signup (user pas encore créé), passer
   *  undefined : le tracker skip alors le log (FK violation évitée).
   */
  userId?: string;
}

/**
 * Délivre un OTP via le canal configuré.
 * Ne throw jamais : log les erreurs mais laisse l'API répondre `sent:true`
 * (le code reste valable, l'utilisateur peut le ressaisir s'il le voit).
 */
export async function deliverOtp(input: DeliverOtpInput): Promise<{
  channel: string;
  ok: boolean;
  error?: string;
}> {
  const env = loadEnv();
  const mode = env.OTP_DELIVERY_MODE;

  // Construit le contenu humain
  const minutes = Math.round(input.ttlSeconds / 60);
  const smsBody = `BMD : ton code de connexion est ${input.code}. Valable ${minutes} min. Ne le partage avec personne 🔒`;
  const emailSubject = `${input.code} · ton code BMD`;
  const emailText = `Salut,

Ton code de connexion BMD est : ${input.code}

Il est valable ${minutes} minutes. Si tu n'es pas à l'origine de cette demande, ignore simplement ce message — personne n'aura accès à ton compte.

À tout de suite,
L'équipe BMD`;
  const emailHtml = `
<!doctype html>
<html lang="fr"><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1625;background:#faf7f0">
  <div style="text-align:center;margin-bottom:24px">
    <div style="font-family:'Cormorant Garamond',serif;font-size:28px;color:#3a2f5b;font-weight:700">BMD</div>
    <div style="font-size:11px;color:#7c6e93;letter-spacing:2px;text-transform:uppercase">Back Mes Do</div>
  </div>
  <h1 style="font-size:18px;margin:0 0 12px">Ton code de connexion 🔐</h1>
  <p style="font-size:14px;line-height:1.5;color:#574a6e">Salut ! Voici le code à saisir pour te connecter :</p>
  <div style="font-family:ui-monospace,monospace;font-size:36px;font-weight:700;letter-spacing:8px;text-align:center;padding:20px;background:linear-gradient(135deg,#fef3e2,#f5e8d8);border-radius:14px;color:#b54732;margin:20px 0">${input.code}</div>
  <p style="font-size:13px;color:#7c6e93;line-height:1.5">Il est valable <strong>${minutes} minutes</strong>.</p>
  <p style="font-size:13px;color:#7c6e93;line-height:1.5">Si tu n'es pas à l'origine de cette demande, tu peux ignorer ce message — personne n'aura accès à ton compte.</p>
  <hr style="border:none;border-top:1px solid #e5dccc;margin:24px 0">
  <p style="font-size:11px;color:#a89a8c;text-align:center">L'argent partagé. L'amitié protégée.</p>
</body></html>`;

  // Mode console (dev) — affiche tout, succès garanti
  if (mode === "console") {
    sendViaConsole("OTP", {
      contactType: input.contactType,
      contactValue: input.contactValue,
      code: input.code,
      validFor: `${minutes} min`,
    });
    return { channel: "console", ok: true };
  }

  // Détermine le canal effectif
  let effectiveChannel: "twilio" | "whatsapp" | "resend";
  if (mode === "auto") {
    if (input.contactType === "EMAIL") {
      effectiveChannel = "resend";
    } else {
      // PHONE : SMS si Twilio configuré, sinon WhatsApp si configuré
      const hasT = Boolean(
        env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER,
      );
      const hasW = Boolean(
        env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_ACCESS_TOKEN,
      );
      if (input.channel === "WHATSAPP" && hasW) effectiveChannel = "whatsapp";
      else if (hasT) effectiveChannel = "twilio";
      else if (hasW) effectiveChannel = "whatsapp";
      else {
        sendViaConsole("OTP-fallback", {
          reason: "PHONE channel mais ni Twilio ni WhatsApp configurés",
          code: input.code,
        });
        return { channel: "console-fallback", ok: true };
      }
    }
  } else if (mode === "twilio") effectiveChannel = "twilio";
  else if (mode === "whatsapp") effectiveChannel = "whatsapp";
  else effectiveChannel = "resend";

  // Tentative d'envoi
  try {
    if (effectiveChannel === "twilio") {
      await sendViaTwilio({ to: input.contactValue, body: smsBody });
    } else if (effectiveChannel === "whatsapp") {
      await sendViaWhatsAppOtp({ to: input.contactValue, code: input.code });
    } else {
      await sendViaResend({
        to: input.contactValue,
        subject: emailSubject,
        text: emailText,
        html: emailHtml,
      });
    }
    // V72 — Tracking LIVE des envois (uniquement si userId connu)
    if (input.userId) {
      if (effectiveChannel === "twilio") {
        trackSmsSent({
          userId: input.userId,
          to: input.contactValue,
          metadata: { purpose: "OTP" },
        });
      } else if (effectiveChannel === "whatsapp") {
        trackWhatsAppSent({
          userId: input.userId,
          to: input.contactValue,
        });
      } else {
        trackEmailSent({
          userId: input.userId,
          subject: emailSubject,
        });
      }
    }
    return { channel: effectiveChannel, ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.error(`❌ OTP delivery failed (${effectiveChannel}):`, msg);
    // V72 — Tracking aussi en cas d'erreur (Twilio facture souvent même
    // les requêtes qui échouent partiellement).
    if (input.userId) {
      if (effectiveChannel === "twilio") {
        trackSmsSent({
          userId: input.userId,
          to: input.contactValue,
          hadError: true,
          metadata: { purpose: "OTP", error: msg.slice(0, 100) },
        });
      } else if (effectiveChannel === "whatsapp") {
        trackWhatsAppSent({
          userId: input.userId,
          to: input.contactValue,
          hadError: true,
        });
      } else {
        trackEmailSent({
          userId: input.userId,
          subject: emailSubject,
          hadError: true,
        });
      }
    }
    // En dev, on log quand même le code pour ne pas bloquer le test
    if (process.env.NODE_ENV !== "production") {
      sendViaConsole("OTP-fallback-after-error", {
        contactValue: input.contactValue,
        code: input.code,
        provider_error: msg,
      });
    }
    return { channel: effectiveChannel, ok: false, error: msg };
  }
}

// ============================================================
// Helper public : envoyer un SMS simple (V95.C admin invitations, etc.)
// ============================================================
export async function sendSms(
  msg: SmsMessage,
  /** V95.C — userId pour tracking coût (optionnel). */
  userId?: string,
): Promise<{ ok: boolean; error?: string }> {
  const env = loadEnv();
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM_NUMBER) {
    sendViaConsole("SMS", { to: msg.to, body: msg.body.slice(0, 140) });
    return { ok: true };
  }
  try {
    await sendViaTwilio(msg);
    if (userId) {
      trackSmsSent({ userId, to: msg.to, metadata: { purpose: "admin_invite" } });
    }
    return { ok: true };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.error("❌ SMS send failed:", errMsg);
    if (userId) {
      trackSmsSent({
        userId,
        to: msg.to,
        hadError: true,
        metadata: { purpose: "admin_invite", error: errMsg.slice(0, 100) },
      });
    }
    return { ok: false, error: errMsg };
  }
}

// ============================================================
// Helper public : envoyer un email simple (notif "nouvelle connexion", etc.)
// ============================================================
export async function sendEmail(
  msg: EmailMessage,
  /** V72 — userId du destinataire pour tracking coût (optionnel). */
  userId?: string,
): Promise<{ ok: boolean }> {
  const env = loadEnv();
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    sendViaConsole("EMAIL", { to: msg.to, subject: msg.subject });
    return { ok: true };
  }
  try {
    await sendViaResend(msg);
    // V72 — Tracking LIVE de l'envoi Resend
    if (userId) {
      trackEmailSent({ userId, subject: msg.subject });
    }
    return { ok: true };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("❌ Email send failed:", e instanceof Error ? e.message : e);
    if (userId) {
      trackEmailSent({ userId, subject: msg.subject, hadError: true });
    }
    return { ok: false };
  }
}

/**
 * Sprint AC · Envoie un email via un template typé multi-langue.
 *
 * `locale` est utilisée pour choisir la traduction. Si elle n'est pas
 * supportée par le template, fallback sur "fr". Le caller passe la
 * locale du destinataire (User.defaultLocale ou Accept-Language).
 *
 * Exemple d'usage :
 *   await sendTemplatedEmail("a@b.com", { kind: "welcome", payload: { displayName: "Aïcha" } }, "fr");
 */
export async function sendTemplatedEmail(
  to: string,
  template: import("./email-templates.js").EmailTemplate,
  locale?: string | null,
  /** V72 — userId du destinataire pour tracking coût (optionnel). */
  userId?: string,
): Promise<{ ok: boolean }> {
  const { renderEmail } = await import("./email-templates.js");
  const env = loadEnv();
  const baseUrl = env.WEB_BASE_URL ?? "https://www.backmesdo.com";
  const { subject, html, text } = renderEmail(template, locale, baseUrl);
  return sendEmail({ to, subject, text, html }, userId);
}
