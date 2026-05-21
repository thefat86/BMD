"use client";

/**
 * <ApiErrorAlert> · Affichage chaleureux des erreurs API.
 *
 * Prend une `ApiError` (ou n'importe quel `unknown` qui sera coerce) et
 * affiche un bandeau coloré avec :
 *  - Le message principal (chaleureux, en français)
 *  - Le `tip` éventuel (petit conseil pour résoudre)
 *  - Un bouton CTA si `details.action` + `details.actionHref` sont fournis
 *  - Une couleur selon `severity` (info bleu / warning ambre / error rouge)
 *
 * Usage :
 *   const [err, setErr] = useState<unknown>(null);
 *   try { await api.createGroup(...); }
 *   catch (e) { setErr(e); }
 *
 *   {err && <ApiErrorAlert error={err} onClose={() => setErr(null)} />}
 *
 * Pour les toasts éphémères, utiliser <ApiErrorToast> (à venir).
 */

import Link from "next/link";
import { ApiError } from "../api-client";

interface Props {
  error: unknown;
  /** Callback de fermeture (affiche un bouton ✕). Optionnel. */
  onClose?: () => void;
  /** Action custom (override le CTA fourni dans details). */
  customAction?: { label: string; onClick: () => void };
  className?: string;
}

const SEVERITY_STYLES = {
  info: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-900",
    iconBg: "bg-blue-100",
    icon: "💡",
  },
  warning: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-900",
    iconBg: "bg-amber-100",
    icon: "⚠️",
  },
  error: {
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-900",
    iconBg: "bg-red-100",
    icon: "🛠️",
  },
} as const;

function getApiError(input: unknown): ApiError {
  if (input instanceof ApiError) return input;
  if (input instanceof Error) {
    return new ApiError(0, "client_error", input.message);
  }
  return new ApiError(
    0,
    "unknown",
    "Une erreur inattendue est survenue — réessaie ou recharge la page 🌀",
  );
}

export function ApiErrorAlert({
  error,
  onClose,
  customAction,
  className = "",
}: Props) {
  const err = getApiError(error);
  const style = SEVERITY_STYLES[err.severity];

  return (
    <div
      role="alert"
      className={`rounded-xl border ${style.border} ${style.bg} ${style.text} p-4 ${className}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`${style.iconBg} flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg`}
        >
          {style.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium leading-snug whitespace-pre-line">
            {err.message}
          </p>
          {err.tip && (
            <p className="mt-1.5 text-sm opacity-90 whitespace-pre-line">
              {err.tip}
            </p>
          )}
          {(customAction ||
            (err.action && (err.actionHref || customAction))) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {customAction ? (
                <button
                  onClick={customAction.onClick}
                  className="rounded-lg bg-white/70 hover:bg-white px-3 py-1.5 text-sm font-medium border border-current/20 transition"
                >
                  {customAction.label}
                </button>
              ) : err.actionHref ? (
                <Link
                  href={err.actionHref}
                  className="rounded-lg bg-white/70 hover:bg-white px-3 py-1.5 text-sm font-medium border border-current/20 transition"
                >
                  {err.action} →
                </Link>
              ) : null}
            </div>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="shrink-0 opacity-60 hover:opacity-100 text-lg leading-none px-1"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Version compacte inline (ex: sous un champ de formulaire).
 * Pas de bouton de fermeture, pas d'icône, juste texte.
 */
export function ApiErrorInline({ error }: { error: unknown }) {
  const err = getApiError(error);
  const style = SEVERITY_STYLES[err.severity];

  return (
    <p className={`text-sm ${style.text} mt-1`}>
      <span className="mr-1">{style.icon}</span>
      {err.message}
      {err.tip && <span className="opacity-75"> — {err.tip}</span>}
    </p>
  );
}
