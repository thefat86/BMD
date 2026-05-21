"use client";

/**
 * V238.A — Helper centralisé pour transformer n'importe quelle erreur
 * (network, HTTP 4xx/5xx, Zod, Prisma, AppError) en `{ title, body, code?,
 * severity?, details? }` localisé via i18n.
 *
 * Avant V238, chaque catch faisait `(e as Error).message` ce qui produisait
 * des messages bruts incompréhensibles ("Failed to fetch", "HTTP 500",
 * "Body cannot be empty…"). Fabrice s'est plaint : « les submits restent
 * muets, mets des messages parlants ».
 *
 * Désormais, tous les catch des drawers/sheets doivent passer par
 * `parseApiError(e, t)` et brancher le résultat soit sur :
 *   - le banner terracotta du <GuideButton errorMessage={...}> (persistant)
 *   - le toast.error() (visibilité immédiate)
 *
 * Les deux peuvent coexister : le banner reste tant que l'utilisateur n'a
 * rien retenté, le toast se ferme tout seul après 4s.
 *
 * Cas particulier V238.B : si l'erreur est un 409 RECEIPT_DUPLICATE
 * (anti-doublon scan facture), `details` contient `existingExpense` que
 * le drawer affiche avec un banner saffron dédié (pas terracotta) + CTA
 * "Voir la dépense" et "Forcer la création".
 */

import { ApiError } from "./api-client";

export interface ParsedApiError {
  /** Titre court en bold (1 ligne) */
  title: string;
  /** Description plus détaillée (1-2 lignes) */
  body: string;
  /** Code machine stable pour le routage UI (ex: "RECEIPT_DUPLICATE") */
  code?: string;
  /** Sévérité visuelle suggérée */
  severity?: "info" | "warning" | "error";
  /** Données structurées (ex: existingExpense pour anti-doublon) */
  details?: Record<string, unknown>;
}

/**
 * Type minimal pour la fonction `t()` qu'on accepte. On évite d'importer
 * directement `useT()` pour ne pas créer de dépendance circulaire (ce
 * module est appelé depuis n'importe quel composant client).
 */
type TFn = (key: string, vars?: Record<string, string>) => string;

/**
 * Tente d'extraire la liste des champs Zod en erreur depuis un body
 * d'erreur API. Le backend Fastify renvoie soit :
 *   - { issues: [{ path: ["amount"], message: "..." }, ...] }
 *   - { details: { fields: ["amount", "currency"] } }
 *   - { message: "amount: Required" }  (fallback texte)
 */
function extractInvalidFields(e: ApiError): string {
  const d = e.details as any;
  if (Array.isArray(d?.fields) && d.fields.length > 0) {
    return d.fields.join(", ");
  }
  if (Array.isArray(d?.issues) && d.issues.length > 0) {
    return d.issues
      .map((it: any) => it?.path?.join?.(".") ?? "")
      .filter(Boolean)
      .join(", ");
  }
  return "";
}

/**
 * Parse une erreur quelconque et retourne un payload localisé prêt à
 * afficher. Ne throw jamais — retourne toujours quelque chose.
 *
 * @param e   L'erreur (ApiError, Error, ou unknown)
 * @param t   La fonction de traduction du composant appelant (useT()).
 */
export function parseApiError(e: unknown, t: TFn): ParsedApiError {
  // ============= Erreurs structurées BMD =============
  if (e instanceof ApiError) {
    const code = e.code;
    const status = e.status;

    // Network / serveur injoignable
    if (status === 0 || code === "network_error") {
      return {
        title: t("apiError.network.title") || "Connexion impossible",
        body:
          t("apiError.network.body") ||
          "Vérifie ta connexion internet.",
        code,
        severity: "warning",
      };
    }

    // Authentification (401, session expirée)
    if (
      status === 401 ||
      code === "unauthorized" ||
      code === "session_expired"
    ) {
      return {
        title: t("apiError.auth.title") || "Tu n'es plus connecté",
        body:
          t("apiError.auth.body") || "Reconnecte-toi pour continuer.",
        code,
        severity: "info",
      };
    }

    // Quota IA atteint (402 plan_required / quota_reached)
    if (
      status === 402 ||
      code === "plan_required" ||
      code === "quota_reached"
    ) {
      return {
        title: t("apiError.quota.title") || "Quota IA atteint",
        body:
          e.message ||
          t("apiError.quota.body") ||
          "Tu as dépassé ton quota mensuel. Upgrade ton plan ou attends le mois prochain.",
        code,
        severity: "info",
        details: e.details as Record<string, unknown> | undefined,
      };
    }

    // Forbidden (403)
    if (status === 403 || code === "forbidden" || code === "not_member") {
      return {
        title: t("apiError.forbidden.title") || "Accès refusé",
        body: e.message || t("apiError.forbidden.body") || "Tu n'as pas la permission d'effectuer cette action.",
        code,
        severity: "warning",
      };
    }

    // Not found (404)
    if (status === 404 || code === "not_found") {
      return {
        title: t("apiError.notFound.title") || "Ressource introuvable",
        body: e.message || t("apiError.notFound.body") || "L'élément demandé n'existe plus ou a été supprimé.",
        code,
        severity: "info",
      };
    }

    // Conflit / doublon (409) — cas spécial RECEIPT_DUPLICATE
    if (
      status === 409 ||
      code === "conflict" ||
      code === "already_exists" ||
      code === "RECEIPT_DUPLICATE" ||
      code === "receipt_duplicate"
    ) {
      const details = e.details as any;
      return {
        title: t("apiError.conflict.title") || "Conflit",
        body: e.message || t("apiError.conflict.body") || "Cette opération entre en conflit avec une donnée existante.",
        code: code === "RECEIPT_DUPLICATE" || code === "receipt_duplicate" ? "RECEIPT_DUPLICATE" : code,
        severity: "warning",
        details,
      };
    }

    // Données invalides (422 ou 400)
    if (
      status === 422 ||
      status === 400 ||
      code === "validation" ||
      code === "bad_request" ||
      code === "invalid_formula"
    ) {
      const fields = extractInvalidFields(e);
      return {
        title: t("apiError.invalid.title") || "Données invalides",
        body: fields
          ? (t("apiError.invalid.body", { fields }) ||
            `Vérifie les champs en erreur : ${fields}`)
          : e.message ||
            t("apiError.invalid.bodyGeneric") ||
            "Certaines informations sont incorrectes ou manquantes.",
        code,
        severity: "warning",
      };
    }

    // Rate limited (429)
    if (status === 429 || code === "rate_limited") {
      return {
        title: t("apiError.rateLimit.title") || "Trop de tentatives",
        body: e.message || t("apiError.rateLimit.body") || "Patiente quelques instants avant de réessayer.",
        code,
        severity: "info",
      };
    }

    // Erreur serveur (5xx)
    if (status >= 500) {
      return {
        title: t("apiError.server.title") || "Erreur serveur",
        body:
          t("apiError.server.body") || "Réessaie dans quelques instants.",
        code,
        severity: "error",
      };
    }

    // Fallback : message du backend (qui est déjà chaleureux côté BMD)
    return {
      title: t("apiError.unknown.title") || "Une erreur est survenue",
      body: e.message || "",
      code,
      severity: e.severity,
    };
  }

  // ============= Erreurs JS génériques =============
  if (e instanceof Error) {
    const msg = e.message || "";
    // Le navigateur lève parfois "Failed to fetch" / "Load failed" en pure
    // network error sans qu'on passe par notre wrapper ApiError. On le
    // détecte ici comme fallback.
    if (
      msg.toLowerCase().includes("fetch") ||
      msg.toLowerCase().includes("network") ||
      msg.toLowerCase().includes("load failed")
    ) {
      return {
        title: t("apiError.network.title") || "Connexion impossible",
        body:
          t("apiError.network.body") || "Vérifie ta connexion internet.",
        severity: "warning",
      };
    }
    return {
      title: t("apiError.unknown.title") || "Une erreur est survenue",
      body: msg,
      severity: "error",
    };
  }

  // ============= unknown =============
  return {
    title: t("apiError.unknown.title") || "Une erreur est survenue",
    body:
      typeof e === "string"
        ? e
        : t("apiError.unknown.body") || "Réessaie ou contacte le support si ça persiste.",
    severity: "error",
  };
}

/**
 * Helper court pour afficher l'erreur sous forme d'une seule string (utile
 * pour les toasts qui ne supportent pas title + body). Format : "Title — Body".
 */
export function formatParsedError(p: ParsedApiError): string {
  if (!p.body) return p.title;
  return `${p.title} — ${p.body}`;
}
