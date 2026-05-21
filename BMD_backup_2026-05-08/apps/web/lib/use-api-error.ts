"use client";

/**
 * Z1 · `useApiErrorHandler` — Helper unifié pour catcher et afficher
 * proprement TOUTE erreur d'API ou de validation client.
 *
 * **Pourquoi** : avant ce hook, ~15 fichiers stockaient l'erreur dans un
 * `setError(string)` puis la rendaient en `<div className="error">{error}</div>`
 * en bas de page. Conséquences :
 *   - Texte brut sans contexte ni CTA
 *   - Sur PC : il fallait scroller pour voir le message
 *   - Pas uniforme : certains endroits utilisaient toast, d'autres setError,
 *     d'autres encore un dialog
 *   - Erreurs 402 (plan insuffisant) parfois loupées → message générique
 *     au lieu d'ouvrir le PlanGateDialog
 *
 * **Maintenant** : un seul hook qui :
 *   1. Si c'est une 402 → ouvre `<PlanGateDialog>` via `usePlanGate()`
 *   2. Si c'est une 401 → redirige vers /login
 *   3. Sinon → affiche un toast d'erreur (visible en haut de page,
 *      auto-dismiss, action possible si `details.action` présent)
 *   4. Bonus : retourne aussi un `formError` string pour les cas où on veut
 *      AUSSI afficher inline (champ obligatoire, etc.) — combinable avec toast.
 *
 * **Usage** :
 *
 *   const handleError = useApiErrorHandler();
 *
 *   try {
 *     await api.proposeSwap(groupId);
 *   } catch (e) {
 *     handleError(e);
 *     // C'est tout. Le hook gère 402, 401, et fallback toast.
 *   }
 *
 * Pour les validations client :
 *
 *   if (!email) {
 *     handleError("Email requis", { kind: "validation" });
 *     return;
 *   }
 */

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  clearToken,
  formatApiError,
  isPlanRequired,
  isUnauthorized,
} from "./api-client";
import { useToast } from "./ui/toast";
import { usePlanGate } from "./ui/plan-gate-provider";

interface HandleErrorOptions {
  /**
   * "api" (défaut) : erreur backend → toast error + dispatch 402/401
   * "validation" : erreur client (champ vide, format invalide) → toast warning
   * "network" : pas de connexion → toast warning avec retry
   */
  kind?: "api" | "validation" | "network";
  /**
   * Callback custom pour les cas où on veut faire autre chose qu'un toast
   * (ex: focus sur le champ en erreur). Reçoit le message formaté.
   */
  onMessage?: (message: string) => void;
}

export function useApiErrorHandler() {
  const router = useRouter();
  const toast = useToast();
  const planGate = usePlanGate();

  return useCallback(
    (error: unknown, opts?: HandleErrorOptions): void => {
      const kind = opts?.kind ?? "api";

      // 1. Validation client → toast warning, pas de redirect
      if (kind === "validation") {
        const message =
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "Champ invalide";
        toast.warning(message);
        opts?.onMessage?.(message);
        return;
      }

      // 2. Erreur réseau → toast warning avec hint retry
      if (kind === "network") {
        toast.warning(
          typeof error === "string"
            ? error
            : "Pas de connexion. Vérifie ton réseau et réessaie.",
        );
        return;
      }

      // 3. API 401 → token invalide, redirect login
      if (isUnauthorized(error)) {
        clearToken();
        router.replace("/login");
        return;
      }

      // 4. API 402 → plan insuffisant, ouvre le dialog upgrade
      if (isPlanRequired(error) && error instanceof ApiError) {
        planGate.handleApiError(error);
        return;
      }

      // 5. Autre erreur API → toast error avec message formaté
      const message = formatApiError(error);
      toast.error(message);
      opts?.onMessage?.(message);
    },
    [router, toast, planGate],
  );
}
