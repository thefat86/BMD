import { createHash, randomUUID } from "node:crypto";
import { prisma } from "../../lib/db.js";
import { loadEnv } from "../../lib/env.js";
import { Errors } from "../../lib/errors.js";
import { sendEmail } from "../../lib/messaging.js";
import { sendPushToUser } from "../../lib/web-push.js";
import { parseUserAgent } from "../../lib/ua-parser.js";
import {
  assessSimSwapRisk,
  recordSimSwapEvent,
} from "../sim-swap/sim-swap.service.js";
import { notifyUserSimSwapAlert } from "../sim-swap/sim-swap.notifier.js";
import type { ContactType } from "@prisma/client";
import type { FastifyInstance } from "fastify";

export interface JwtPayload {
  sub: string; // userId
  sid: string; // sessionId
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function parseExpiresIn(expiresIn: string): number {
  // Quick parser : "30d" => 30 * 86400 sec, "12h" => 12 * 3600, "60m" => 60 * 60
  const m = /^(\d+)([smhd])$/.exec(expiresIn);
  if (!m) throw new Error("Invalid JWT_EXPIRES_IN format");
  const value = parseInt(m[1]!, 10);
  const unit = m[2]!;
  const mult = { s: 1, m: 60, h: 3600, d: 86400 }[unit]!;
  return value * mult;
}

/**
 * Détection "nouveau device" via fingerprint léger (browser + OS + pays).
 * Spec §7.5 §8.6 — on alerte si le user se connecte depuis :
 *  - un navigateur jamais vu (Chrome/Firefox/Safari/Edge/Opera)
 *  - OU depuis un pays jamais vu (CF-IPCountry / X-Vercel-IP-Country)
 *
 * Si "nouveau" → on enregistre + on retourne true (déclenche notif).
 * Si déjà connu → on bump le compteur + on retourne false.
 *
 * RGPD-friendly : on ne stocke PAS l'IP brute, juste le pays sur 2 lettres.
 */
async function trackLoginFingerprint(
  userId: string,
  browser: string,
  os: string,
  country: string,
): Promise<{ isNew: boolean; reason: "new_browser" | "new_country" | null }> {
  const existing = await prisma.loginFingerprint.findUnique({
    where: {
      userId_browser_os_country: { userId, browser, os, country },
    },
  });

  if (existing) {
    // Déjà vu → bump le compteur, pas de notif
    await prisma.loginFingerprint.update({
      where: { id: existing.id },
      data: {
        count: { increment: 1 },
        lastSeenAt: new Date(),
      },
    });
    return { isNew: false, reason: null };
  }

  // Nouveau (browser, os, country) — déterminons si c'est NEW BROWSER ou NEW COUNTRY
  const sameBrowserAnyCountry = await prisma.loginFingerprint.findFirst({
    where: { userId, browser, os },
    select: { id: true },
  });
  const sameCountryAnyBrowser =
    country !== "??"
      ? await prisma.loginFingerprint.findFirst({
          where: { userId, country },
          select: { id: true },
        })
      : null;

  // Crée l'entrée
  await prisma.loginFingerprint.create({
    data: { userId, browser, os, country },
  });

  // Si c'est la 1ère connexion du user (pas d'historique du tout) : on n'envoie pas
  // de notif "nouvelle connexion" sur le tout premier login. C'est juste l'inscription.
  const totalKnown = await prisma.loginFingerprint.count({ where: { userId } });
  if (totalKnown <= 1) return { isNew: false, reason: null };

  // Sinon : on a vraiment un nouveau navigateur ou un nouveau pays
  if (!sameCountryAnyBrowser && country !== "??") {
    return { isNew: true, reason: "new_country" };
  }
  if (!sameBrowserAnyCountry) {
    return { isNew: true, reason: "new_browser" };
  }
  // Combinaison nouvelle mais browser ET pays connus séparément → silencieux
  return { isNew: false, reason: null };
}

/**
 * Envoie une notif in-app + un email "nouvelle connexion détectée" (spec §7.5).
 * Fire-and-forget — n'attend pas et ne bloque pas l'issuance du JWT.
 */
async function notifyNewDeviceLogin(
  userId: string,
  device: string,
  reason: "new_browser" | "new_country" | "device_changed",
  contextLabel: string,
): Promise<void> {
  try {
    const when = new Date().toLocaleString("fr-FR", {
      dateStyle: "long",
      timeStyle: "short",
    });
    const shortDevice = device.slice(0, 80);
    const reasonLabel =
      reason === "new_country"
        ? "depuis un pays inhabituel"
        : reason === "new_browser"
          ? "depuis un navigateur jamais vu"
          : "depuis un nouvel appareil";
    const titleEmoji = reason === "new_country" ? "🌍" : "🔐";

    // 1. Notif in-app
    await prisma.notification.create({
      data: {
        userId,
        kind: "NEW_DEVICE_LOGIN",
        title: `${titleEmoji} Connexion ${reasonLabel}`,
        body: `${contextLabel} à ${when}. Si ce n'est pas toi, révoque cette session immédiatement.`,
        link: "/dashboard/profile",
        payload: {
          device: shortDevice,
          reason,
          context: contextLabel,
          at: new Date().toISOString(),
        },
      },
    });

    // 2. Push web (si l'utilisateur a des subscriptions actives)
    void sendPushToUser(userId, {
      title: `${titleEmoji} Connexion ${reasonLabel}`,
      body: contextLabel,
      url: "/dashboard/profile",
      tag: "new-device-login",
    });

    // 3. Email — uniquement si l'utilisateur a un contact email vérifié primaire
    const primary = await prisma.userContact.findFirst({
      where: {
        userId,
        type: "EMAIL",
        isVerified: true,
        isPrimary: true,
      },
      include: { user: { select: { displayName: true } } },
    });
    if (!primary) return;

    const subjectEmoji = reason === "new_country" ? "🌍" : "🔐";
    const html = `
<!doctype html>
<html lang="fr"><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1625;background:#faf7f0">
  <div style="text-align:center;margin-bottom:24px">
    <div style="font-family:'Cormorant Garamond',serif;font-size:28px;color:#3a2f5b;font-weight:700">BMD</div>
  </div>
  <h1 style="font-size:18px;margin:0 0 12px">${subjectEmoji} Connexion ${reasonLabel}</h1>
  <p style="font-size:14px;line-height:1.5;color:#574a6e">Salut ${primary.user.displayName},</p>
  <p style="font-size:14px;line-height:1.5;color:#574a6e">On vient de remarquer une connexion à ton compte BMD ${reasonLabel} :</p>
  <div style="background:linear-gradient(135deg,#fef3e2,#f5e8d8);border-radius:14px;padding:16px;margin:16px 0">
    <div style="font-size:11px;color:#7c6e93;letter-spacing:1.4px;text-transform:uppercase;margin-bottom:6px">Détails</div>
    <div style="font-size:13px;color:#1a1625;font-weight:600">${contextLabel}</div>
    <div style="font-size:11px;color:#7c6e93;letter-spacing:1.4px;text-transform:uppercase;margin:10px 0 6px">Appareil</div>
    <div style="font-size:13px;color:#1a1625;font-family:ui-monospace,monospace">${shortDevice}</div>
    <div style="font-size:11px;color:#7c6e93;letter-spacing:1.4px;text-transform:uppercase;margin:10px 0 6px">Quand</div>
    <div style="font-size:13px;color:#1a1625">${when}</div>
  </div>
  <p style="font-size:13px;color:#574a6e;line-height:1.5"><strong>Si c'était toi</strong>, tu peux ignorer ce message — tout va bien 👌</p>
  <p style="font-size:13px;color:#b54732;line-height:1.5"><strong>Si ce n'était pas toi</strong>, change vite ton mot de passe et révoque cette session depuis ton profil → Sessions actives.</p>
  <hr style="border:none;border-top:1px solid #e5dccc;margin:24px 0">
  <p style="font-size:11px;color:#a89a8c;text-align:center">L'argent partagé. L'amitié protégée.</p>
</body></html>`;
    const text = `Connexion ${reasonLabel} sur ton compte BMD.

${contextLabel}
Appareil : ${shortDevice}
Quand : ${when}

Si c'était toi, ignore ce message. Sinon, révoque la session depuis ton profil.`;
    await sendEmail({
      to: primary.value,
      subject: `${subjectEmoji} Connexion ${reasonLabel} sur ton compte BMD`,
      text,
      html,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(
      "[notifyNewDeviceLogin] échec silencieux:",
      e instanceof Error ? e.message : e,
    );
  }
}

export interface IssueTokenContext {
  /** Type de contact utilisé pour authentifier (PHONE / EMAIL) */
  contactType?: ContactType;
  /** Valeur du contact (numéro / email) — utilisé pour le scoring SIM swap */
  contactValue?: string;
}

export async function issueToken(
  app: FastifyInstance,
  userId: string,
  device?: string,
  /** Pays dérivé des headers (CF-IPCountry…). Optionnel — "??" si inconnu. */
  country?: string,
  /** Contexte d'auth (pour le scoring SIM swap). Si vide, le scoring est sauté. */
  context?: IssueTokenContext,
): Promise<{ token: string; expiresAt: Date }> {
  const env = loadEnv();
  const c = country && country.length === 2 ? country.toUpperCase() : "??";

  // === SIM swap detection (spec §7.5) — fait AVANT toute émission de JWT ===
  // On ne déclenche le scoring que si on a le contexte minimum (contactType + contactValue).
  // Pour les flux QR-login / SSO, le scoring est sauté car il n'y a pas
  // d'OTP en jeu (donc pas de risque SIM swap au sens strict).
  if (context?.contactType && context?.contactValue) {
    const risk = await assessSimSwapRisk({
      userId,
      contactType: context.contactType,
      contactValue: context.contactValue,
      userAgent: device ?? null,
      country: c,
    });

    // BLOCKED = on refuse la connexion + on alerte l'user immédiatement
    if (risk.level === "BLOCKED") {
      const event = await recordSimSwapEvent({
        userId,
        assessment: risk,
        contactType: context.contactType,
        contactValue: context.contactValue,
        userAgent: device,
        country: c,
        initialStatus: "BLOCKED",
      });
      void notifyUserSimSwapAlert({
        userId,
        eventId: event.id,
        assessment: risk,
        attemptCountry: c,
        blocked: true,
      });
      throw Errors.forbidden(
        "Pour ta sécurité, on a bloqué cette connexion 🛡️",
        {
          tip: "Plusieurs signaux inhabituels ont été détectés. On vient de t'envoyer un email avec les instructions pour confirmer que c'était bien toi (ou sécuriser ton compte si ça ne l'était pas).",
          severity: "warning",
          action: "Vérifier mes emails",
        },
      );
    }

    // HIGH = on autorise mais on alerte tous canaux
    if (risk.level === "HIGH") {
      const event = await recordSimSwapEvent({
        userId,
        assessment: risk,
        contactType: context.contactType,
        contactValue: context.contactValue,
        userAgent: device,
        country: c,
        initialStatus: "DETECTED",
      });
      void notifyUserSimSwapAlert({
        userId,
        eventId: event.id,
        assessment: risk,
        attemptCountry: c,
        blocked: false,
      });
    }

    // MEDIUM = on logge sans bloquer ni alerter en multi-canal (juste in-app)
    if (risk.level === "MEDIUM") {
      await recordSimSwapEvent({
        userId,
        assessment: risk,
        contactType: context.contactType,
        contactValue: context.contactValue,
        userAgent: device,
        country: c,
        initialStatus: "DETECTED",
      });
    }
    // LOW = silencieux, on ne stocke rien (réduit le bruit en base)
  }

  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + parseExpiresIn(env.JWT_EXPIRES_IN) * 1000);

  const payload: JwtPayload = { sub: userId, sid: sessionId };
  const token = app.jwt.sign(payload);

  // Détection "nouveau navigateur OU nouveau pays" — AVANT de créer la session
  let trackResult: {
    isNew: boolean;
    reason: "new_browser" | "new_country" | null;
    browser: string;
    os: string;
    country: string;
  } | null = null;
  if (device) {
    const ua = parseUserAgent(device);
    const r = await trackLoginFingerprint(userId, ua.browser, ua.os, c);
    trackResult = { ...r, browser: ua.browser, os: ua.os, country: c };
  }

  await prisma.session.create({
    data: {
      id: sessionId,
      userId,
      tokenHash: hashToken(token),
      device: device ?? null,
      expiresAt,
    },
  });

  // Fire-and-forget : on n'attend pas la notif pour rendre le JWT
  if (trackResult && trackResult.isNew && device && trackResult.reason) {
    const ctx =
      trackResult.reason === "new_country"
        ? `Pays détecté : ${trackResult.country} (${trackResult.browser} sur ${trackResult.os})`
        : `Navigateur : ${trackResult.browser} sur ${trackResult.os}` +
          (trackResult.country !== "??" ? ` (depuis ${trackResult.country})` : "");
    void notifyNewDeviceLogin(userId, device, trackResult.reason, ctx);
  }

  return { token, expiresAt };
}

export async function revokeSession(sessionId: string): Promise<void> {
  // updateMany ne plante pas si l'enregistrement n'existe pas (vs update qui throw P2025).
  // Important pour la robustesse du logout après un reset de DB ou une session orpheline.
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  // V118 — Invalide immédiatement le cache mémoire pour que la prochaine
  // requête avec ce sid soit refusée tout de suite, sans attendre le TTL.
  invalidateSessionCache(sessionId);
}

/**
 * V118 — Cache mémoire LRU pour `assertSessionActive`.
 *
 * Avant : un `prisma.session.findUnique` à CHAQUE requête authentifiée.
 * Sur un dashboard qui appelle 6-8 endpoints au cold start, ça fait 6-8
 * round-trips DB redondants pour le même `sid` (~20-40 ms × N).
 *
 * Après : cache 60s par sessionId. La vérif DB n'a lieu qu'une fois par
 * minute. On reste safe vis-à-vis du logout distant : `revokeSession`
 * (cf. plus haut) appelle `invalidateSessionCache(sid)` pour évincer
 * l'entrée immédiatement.
 *
 * Le TTL court (60 s) garantit que même si on oublie une invalidation
 * quelque part, le pire cas est un user qui reste authentifié pendant
 * 60 s de plus après un logout côté serveur. C'est un compromis
 * largement acceptable pour gagner ~30 ms × N requêtes sur chaque
 * navigation.
 */
const SESSION_CACHE_TTL_MS = 60_000;
type CachedSession = {
  revokedAt: Date | null;
  expiresAt: Date;
  tokenHash: string;
  cachedAt: number;
};
const sessionCache = new Map<string, CachedSession>();

/** Vide l'entrée d'une session (appelé au revoke / logout). */
export function invalidateSessionCache(sessionId: string): void {
  sessionCache.delete(sessionId);
}

/**
 * Vérifie qu'une session JWT est toujours active (pas révoquée, pas expirée).
 * Appelé depuis le hook d'auth Fastify.
 *
 * V118 — Lookup DB caché 60s par sid pour éviter les N round-trips au cold
 * start. Voir `sessionCache` ci-dessus.
 */
export async function assertSessionActive(payload: JwtPayload, token: string): Promise<void> {
  const now = Date.now();
  const cached = sessionCache.get(payload.sid);
  let snapshot: CachedSession;

  if (cached && now - cached.cachedAt < SESSION_CACHE_TTL_MS) {
    snapshot = cached;
  } else {
    const session = await prisma.session.findUnique({
      where: { id: payload.sid },
    });
    if (!session) {
      sessionCache.delete(payload.sid);
      throw Errors.sessionExpired();
    }
    snapshot = {
      revokedAt: session.revokedAt,
      expiresAt: session.expiresAt,
      tokenHash: session.tokenHash,
      cachedAt: now,
    };
    sessionCache.set(payload.sid, snapshot);

    // Petit nettoyage opportuniste : si le cache dépasse 5000 entrées,
    // on évince les plus vieilles. Évite la fuite mémoire pour les
    // déploiements long-running.
    if (sessionCache.size > 5000) {
      const cutoff = now - SESSION_CACHE_TTL_MS;
      for (const [sid, entry] of sessionCache) {
        if (entry.cachedAt < cutoff) sessionCache.delete(sid);
      }
    }
  }

  if (snapshot.revokedAt) {
    sessionCache.delete(payload.sid);
    throw Errors.unauthorized(
      "Cette session a été déconnectée à distance — reconnecte-toi pour continuer 🔒",
    );
  }
  if (snapshot.expiresAt < new Date()) {
    sessionCache.delete(payload.sid);
    throw Errors.sessionExpired();
  }
  if (snapshot.tokenHash !== hashToken(token)) {
    sessionCache.delete(payload.sid);
    throw Errors.unauthorized(
      "Ton jeton d'accès n'est pas valide — reconnecte-toi pour repartir sur des bases saines 🔄",
    );
  }
}
