/**
 * Détection SIM swap heuristique (spec §7.5).
 *
 * Pas d'IA externe : 6 signaux pondérés, score 0-100. RGPD-friendly :
 * pas de fingerprinting biométrique, pas d'IP brute conservée, juste
 * des comparaisons sur l'historique connu.
 *
 * Pondération réfléchie pour minimiser les faux positifs sur les
 * utilisateurs légitimes en mobilité (diaspora qui voyage entre
 * Paris et Yaoundé, étudiants qui changent de PC à la fac, etc.) :
 *
 *   Signal                                          | Poids
 *   ─────────────────────────────────────────────────|──────
 *   Nouveau pays ET nouveau navigateur               |  +30
 *   Contact modifié il y a < 24h                     |  +25
 *   Désactivation 2FA récente (< 1h)                 |  +25
 *   Taux d'OTP > 5 demandes en 1h                    |  +15
 *   Première utilisation d'un contact nouveau        |  +10
 *   Heure inhabituelle pour cet utilisateur (3h-5h)  |  +5
 *   ─────────────────────────────────────────────────|──────
 *   Score max théorique                              | 110
 *   Seuils :
 *     0-39   : LOW    (login normal, on logge silencieusement)
 *     40-59  : MEDIUM (alerte par notif, pas de blocage)
 *     60-79  : HIGH   (alerte multi-canal, MFA recommandé)
 *     80+    : BLOCKED (refus de connexion + admin alerté)
 *
 * Coût : O(N) sur l'historique récent du user (~50ms grand max).
 */
import { ContactType } from "@prisma/client";
import { prisma } from "../../lib/db.js";
import { parseUserAgent } from "../../lib/ua-parser.js";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "BLOCKED";

export interface RiskAssessment {
  /** Score brut 0-100+ */
  score: number;
  level: RiskLevel;
  signals: {
    newCountry: boolean;
    newBrowser: boolean;
    recentContactChangeHours: number | null;
    twoFactorDisabledRecently: boolean;
    otpRequestsLast1h: number;
    isFirstTimeContact: boolean;
    unusualHour: boolean;
  };
  /** Détails humains lisibles (pour l'audit + UI admin) */
  reasons: string[];
}

const SCORE_WEIGHTS = {
  newCountryAndBrowser: 30,
  recentContactChange: 25,
  twoFactorDisabledRecently: 25,
  otpHighRate: 15,
  firstTimeContact: 10,
  unusualHour: 5,
} as const;

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Calcule le score de risque pour un OTP qui vient d'être validé.
 * À appeler AVANT d'émettre le JWT — si le score est trop élevé,
 * on bloque la session.
 */
export async function assessSimSwapRisk(input: {
  userId: string;
  contactType: ContactType;
  contactValue: string;
  userAgent?: string | null;
  country: string;
  now?: Date;
}): Promise<RiskAssessment> {
  const now = input.now ?? new Date();
  const reasons: string[] = [];
  let score = 0;

  // Parse UA pour les comparaisons
  const ua = parseUserAgent(input.userAgent ?? "");

  // === SIGNAL 1 : Nouveau pays + nouveau navigateur ===
  // On regarde l'historique LoginFingerprint EXISTANT (avant cette tentative).
  // Si l'utilisateur n'a jamais ni le browser ni le country → fort signal.
  const knownFingerprints = await prisma.loginFingerprint.findMany({
    where: { userId: input.userId },
    select: { browser: true, os: true, country: true },
  });
  const knownBrowsers = new Set(
    knownFingerprints.map((f) => `${f.browser}/${f.os}`),
  );
  const knownCountries = new Set(
    knownFingerprints.map((f) => f.country).filter((c) => c !== "??"),
  );
  const isNewBrowser =
    knownFingerprints.length > 0 &&
    !knownBrowsers.has(`${ua.browser}/${ua.os}`);
  const isNewCountry =
    knownFingerprints.length > 0 &&
    input.country !== "??" &&
    !knownCountries.has(input.country);

  if (isNewBrowser && isNewCountry) {
    score += SCORE_WEIGHTS.newCountryAndBrowser;
    reasons.push(
      `Connexion depuis un navigateur (${ua.browser}/${ua.os}) ET un pays (${input.country}) jamais vus auparavant`,
    );
  }

  // === SIGNAL 2 : Contact modifié récemment ===
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { contactsLastChangedAt: true, twoFactorEnabledAt: true },
  });
  let recentContactChangeHours: number | null = null;
  if (user?.contactsLastChangedAt) {
    const ageMs = now.getTime() - user.contactsLastChangedAt.getTime();
    if (ageMs < ONE_DAY_MS) {
      recentContactChangeHours = Math.round(ageMs / ONE_HOUR_MS);
      score += SCORE_WEIGHTS.recentContactChange;
      reasons.push(
        `Tu as modifié un de tes contacts il y a moins de ${Math.max(1, recentContactChangeHours)}h — c'est juste avant cette connexion`,
      );
    }
  }

  // === SIGNAL 3 : 2FA désactivée très récemment ===
  // On cherche dans l'historique : le user avait twoFactorEnabledAt récemment ?
  // Comme on ne stocke pas l'historique, on utilise un proxy : ActivityLog
  // ou la disparition récente de twoFactorEnabledAt. Pour rester simple,
  // on regarde si twoFactorEnabledAt est NULL alors qu'il y a une session
  // récente (< 1h) qui suggère qu'il était activé.
  // Approximation : pas de signal pour l'instant si pas de trace claire.
  const twoFactorDisabledRecently = false; // Placeholder — branchable sur ActivityLog futur

  // === SIGNAL 4 : Taux d'OTP élevé sur la dernière heure ===
  const oneHourAgo = new Date(now.getTime() - ONE_HOUR_MS);
  const otpRequestsLast1h = await prisma.otpCode.count({
    where: {
      contactType: input.contactType,
      contactValue: input.contactValue,
      createdAt: { gte: oneHourAgo },
    },
  });
  if (otpRequestsLast1h > 5) {
    score += SCORE_WEIGHTS.otpHighRate;
    reasons.push(
      `${otpRequestsLast1h} codes ont été demandés en 1h sur ce contact (anormal)`,
    );
  }

  // === SIGNAL 5 : Premier OTP réussi sur ce contact (jamais utilisé avant) ===
  const contactRow = await prisma.userContact.findUnique({
    where: {
      type_value: { type: input.contactType, value: input.contactValue },
    },
    select: { isVerified: true, createdAt: true, verifiedAt: true },
  });
  let isFirstTimeContact = false;
  if (contactRow) {
    // Si vérifié il y a < 1h et que c'est la 1ère utilisation pour login
    const verifiedAgeMs = contactRow.verifiedAt
      ? now.getTime() - contactRow.verifiedAt.getTime()
      : Infinity;
    if (contactRow.isVerified && verifiedAgeMs < ONE_HOUR_MS) {
      isFirstTimeContact = true;
      score += SCORE_WEIGHTS.firstTimeContact;
      reasons.push(
        "Ce contact vient d'être vérifié et est utilisé pour se connecter immédiatement",
      );
    }
  }

  // === SIGNAL 6 : Heure inhabituelle (3h-5h locale supposée serveur) ===
  // Heuristique faible : la plupart des SIM swaps se font la nuit pour
  // que la victime ne s'en rende pas compte tout de suite.
  const hour = now.getHours();
  const unusualHour = hour >= 3 && hour <= 5;
  if (unusualHour) {
    score += SCORE_WEIGHTS.unusualHour;
    reasons.push(
      `Heure inhabituelle de connexion (${hour.toString().padStart(2, "0")}h00 — la nuit)`,
    );
  }

  // Détermine le niveau
  let level: RiskLevel;
  if (score >= 80) level = "BLOCKED";
  else if (score >= 60) level = "HIGH";
  else if (score >= 40) level = "MEDIUM";
  else level = "LOW";

  return {
    score,
    level,
    signals: {
      newCountry: isNewCountry,
      newBrowser: isNewBrowser,
      recentContactChangeHours,
      twoFactorDisabledRecently,
      otpRequestsLast1h,
      isFirstTimeContact,
      unusualHour,
    },
    reasons,
  };
}

/**
 * À appeler après chaque modification d'un contact (ajout, vérification,
 * suppression, primary changé). Met à jour `User.contactsLastChangedAt`
 * pour que le scoring SIM swap puisse détecter une connexion juste après.
 */
export async function markContactsChanged(userId: string): Promise<void> {
  await prisma.user
    .update({
      where: { id: userId },
      data: { contactsLastChangedAt: new Date() },
    })
    .catch(() => {
      /* user supprimé entre-temps : on ignore */
    });
}

/**
 * Persiste un événement SIM swap en base + déclenche les notifications
 * multi-canal sur tous les contacts vérifiés.
 *
 * Renvoie l'événement créé pour que le caller puisse décider quoi faire
 * (bloquer la connexion, ou laisser passer avec alerte).
 */
export async function recordSimSwapEvent(input: {
  userId: string;
  assessment: RiskAssessment;
  contactType: ContactType;
  contactValue: string;
  userAgent?: string | null;
  country: string;
  initialStatus?: "DETECTED" | "BLOCKED";
}): Promise<{ id: string; status: string }> {
  const status = input.initialStatus ?? "DETECTED";
  const event = await prisma.simSwapEvent.create({
    data: {
      userId: input.userId,
      riskScore: input.assessment.score,
      signals: {
        ...input.assessment.signals,
        reasons: input.assessment.reasons,
        level: input.assessment.level,
      } as any,
      contactValueAttempted: input.contactValue,
      contactTypeAttempted: input.contactType,
      userAgent: input.userAgent?.slice(0, 200) ?? null,
      country: input.country,
      status,
    },
  });
  return { id: event.id, status: event.status };
}
