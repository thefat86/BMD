/**
 * Erreurs métier — couche centrale.
 *
 * Philosophie : chaque erreur DOIT être :
 *  1. Lisible par un humain (message en français, ton chaleureux & fun)
 *  2. Actionnable (le frontend doit pouvoir afficher un CTA clair)
 *  3. Catégorisée (`code` stable pour le routage côté client)
 *
 * Structure :
 *  - `statusCode` : code HTTP (400, 401, 402, 403, 404, 409, 422, 429, 500, ...)
 *  - `code`       : identifiant machine stable, ex: "plan_required"
 *  - `message`    : phrase principale, claire et chaleureuse
 *  - `details`    : objet structuré pour l'UI :
 *       {
 *         tip?:    "Petit conseil pour résoudre le souci"
 *         action?: "label affiché sur un bouton CTA",
 *         actionHref?: "/dashboard/billing",
 *         severity?: "info" | "warning" | "error",
 *         // tout autre context-specific (current, required, ...)
 *       }
 */

export interface AppErrorDetails {
  tip?: string;
  action?: string;
  actionHref?: string;
  severity?: "info" | "warning" | "error";
  [k: string]: unknown;
}

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: AppErrorDetails,
  ) {
    super(message);
    this.name = "AppError";
  }
}

// =============================================================
// Helpers génériques (raccourcis)
// =============================================================
export const Errors = {
  badRequest: (msg: string, details?: AppErrorDetails) =>
    new AppError(400, "bad_request", msg, details),

  unauthorized: (
    msg = "Tu dois te reconnecter pour accéder à cette page 🔐",
    details?: AppErrorDetails,
  ) =>
    new AppError(401, "unauthorized", msg, {
      severity: "warning",
      action: "Me reconnecter",
      actionHref: "/login",
      ...details,
    }),

  forbidden: (
    msg = "Cette action n'est pas pour toi — seuls les membres autorisés peuvent y accéder.",
    details?: AppErrorDetails,
  ) =>
    new AppError(403, "forbidden", msg, {
      severity: "warning",
      ...details,
    }),

  notFound: (
    msg = "On ne retrouve pas cet élément — il a peut-être été supprimé entre-temps 🤔",
    details?: AppErrorDetails,
  ) => new AppError(404, "not_found", msg, { severity: "info", ...details }),

  conflict: (msg: string, details?: AppErrorDetails) =>
    new AppError(409, "conflict", msg, { severity: "warning", ...details }),

  validation: (msg: string, details?: AppErrorDetails) =>
    new AppError(422, "validation", msg, { severity: "warning", ...details }),

  rateLimited: (
    msg = "Doucement, doucement 🐢 — réessaie dans quelques instants.",
    details?: {
      /** Secondes à attendre avant de pouvoir réessayer */
      retryAfter?: number;
      /** Heure (timestamp ISO) à laquelle on pourra réessayer */
      retryAt?: string;
      tip?: string;
    },
  ) =>
    new AppError(429, "rate_limited", msg, {
      severity: "info",
      tip: details?.tip ?? "Tu as atteint la limite de tentatives sur cette action.",
      retryAfter: details?.retryAfter,
      retryAt: details?.retryAt,
    }),

  internal: (
    msg = "Oups, quelque chose a coincé de notre côté 🛠️ — l'équipe a été prévenue.",
  ) =>
    new AppError(500, "internal", msg, {
      severity: "error",
      tip: "Réessaie dans quelques instants. Si ça persiste, contacte-nous.",
    }),

  // ============================================================
  // Helpers SPÉCIALISÉS — métier BMD
  // ============================================================

  /** Plan tarifaire insuffisant (HTTP 402). */
  planRequired: (params: {
    feature: string; // ex: "ajouter un 3e groupe"
    why: string; // ex: "Tu es sur la formule Découverte qui autorise 2 groupes max"
    required: string; // "PREMIUM" | "COMMUNITY"
    current: string; // "FREE"
  }) =>
    new AppError(
      402,
      "plan_required",
      `Pour ${params.feature}, il te faudrait passer en formule ${params.required} ✨`,
      {
        severity: "info",
        tip: params.why,
        action: `Découvrir ${params.required}`,
        actionHref: `/dashboard/plans?upgrade=${params.required}`,
        feature: params.feature,
        // Champ exposé au front pour pré-sélectionner le bon plan
        // dans <PlanGateDialog>. On garde aussi `required` pour rétrocompat.
        requiredPlan: params.required,
        suggestedPlan: params.required,
        required: params.required,
        current: params.current,
      },
    ),

  /** Quota mensuel atteint (OCR, exports, réunions, ...) */
  quotaReached: (params: {
    feature: string; // "scan OCR de tickets"
    used: number;
    max: number;
    resetInfo?: string; // "le 1er du mois prochain"
    upgradeTo?: string; // "PREMIUM"
    /** Sprint AC-2 · Si >0, le frontend peut proposer un addon "1 réunion en plus" */
    addonCents?: number;
  }) =>
    new AppError(
      402,
      "quota_reached",
      `Tu as utilisé tes ${params.max} ${params.feature} du mois 🎯 — bravo, tu fais bien tourner BMD !`,
      {
        severity: "info",
        tip: params.resetInfo
          ? `Le compteur repart à zéro ${params.resetInfo}.`
          : "Le compteur se remet à zéro chaque début de mois.",
        action: params.upgradeTo
          ? `Passer en ${params.upgradeTo}`
          : undefined,
        actionHref: params.upgradeTo
          ? `/dashboard/plans?upgrade=${params.upgradeTo}`
          : undefined,
        // Pour <PlanGateDialog> côté front (mêmes champs que planRequired)
        requiredPlan: params.upgradeTo,
        suggestedPlan: params.upgradeTo,
        used: params.used,
        max: params.max,
        addonCents: params.addonCents,
      },
    ),

  /** Une formule de partage / config bloque l'opération. */
  invalidFormula: (params: {
    what: string; // "le partage de cette dépense"
    why: string; // "Le total des parts ne fait pas 100%"
    fix: string; // "Ajuste les pourcentages pour qu'ils totalisent 100%"
  }) =>
    new AppError(
      422,
      "invalid_formula",
      `On n'a pas pu valider ${params.what} 🧮`,
      {
        severity: "warning",
        tip: params.why,
        action: params.fix,
      },
    ),

  /** L'utilisateur n'est pas membre du groupe / de la ressource. */
  notMember: (resource = "ce groupe") =>
    new AppError(
      403,
      "not_member",
      `Tu n'es pas (encore) membre de ${resource} — demande une invitation à un admin pour y accéder 🤝`,
      {
        severity: "info",
        tip: "Seuls les membres invités peuvent voir le contenu d'un groupe privé.",
      },
    ),

  /** Rôle insuffisant (admin/trésorier requis). */
  roleRequired: (requiredRole: string, action = "cette action") =>
    new AppError(
      403,
      "role_required",
      `Seuls les ${requiredRole.toLowerCase()}s du groupe peuvent effectuer ${action} 🛡️`,
      {
        severity: "warning",
        tip: "Si tu penses que tu devrais avoir ce rôle, demande à un admin de te promouvoir.",
        requiredRole,
      },
    ),

  /** Compte suspendu. */
  suspended: () =>
    new AppError(
      403,
      "account_suspended",
      "Ton compte a été temporairement suspendu 🚫",
      {
        severity: "error",
        tip: "Contacte le support pour comprendre la raison et débloquer ton accès.",
        action: "Contacter le support",
        actionHref: "mailto:support@backmesdo.com",
      },
    ),

  /** Session expirée. */
  sessionExpired: () =>
    new AppError(
      401,
      "session_expired",
      "Ta session a expiré pour des raisons de sécurité — reconnecte-toi pour continuer 🔄",
      {
        severity: "info",
        action: "Me reconnecter",
        actionHref: "/login",
      },
    ),

  /** Action impossible à cause de l'état actuel (ex: tontine déjà clôturée). */
  invalidState: (params: {
    what: string; // "Cette tontine"
    currentState: string; // "déjà terminée"
    requiredState?: string; // "active"
    tip?: string;
  }) =>
    new AppError(
      409,
      "invalid_state",
      `${params.what} est ${params.currentState} — l'action n'est plus possible.`,
      {
        severity: "info",
        tip:
          params.tip ??
          (params.requiredState
            ? `Pour faire ça, il faudrait que ce soit ${params.requiredState}.`
            : undefined),
      },
    ),

  /** Doublon (ressource déjà existante avec contrainte unique). */
  alreadyExists: (params: { what: string; tip?: string }) =>
    new AppError(409, "already_exists", `${params.what} existe déjà ✋`, {
      severity: "info",
      tip:
        params.tip ??
        "Tu peux peut-être réutiliser l'élément existant plutôt que d'en créer un nouveau.",
    }),
};
