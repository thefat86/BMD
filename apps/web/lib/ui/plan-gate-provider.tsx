"use client";

/**
 * <PlanGateProvider> · Ctx global pour déclencher le PlanGateDialog
 * depuis n'importe quel composant.
 *
 * Usage :
 *   const { showPlanGate, handleApiError } = usePlanGate();
 *
 *   try {
 *     await api.createGroup(...);
 *   } catch (e) {
 *     if (handleApiError(e)) return; // Le dialog upgrade s'affiche
 *     // sinon, gère l'erreur normalement (toast, in-modal error, etc.)
 *   }
 *
 * Le helper `handleApiError(e)` :
 *  - retourne true si l'erreur est un 402 (gating activé, dialog ouvert)
 *  - retourne false sinon (le caller doit gérer l'erreur autrement)
 *
 * Pour que `currentPlanCode` soit affiché dans le dialog, le Provider lit
 * `api.me()` au mount (cache 30s).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError, isPlanRequired } from "../api-client";
import { PlanGateDialog } from "./plan-gate-dialog";

interface PlanGateContextValue {
  /**
   * Affiche le dialog avec une erreur custom (pour les cas où le caller veut
   * forcer l'affichage sans avoir une ApiError). Optionnel.
   */
  showPlanGate: (opts: {
    error?: ApiError | null;
    requiredPlan?: string;
  }) => void;
  /**
   * Helper le plus utilisé : gère une erreur d'API. Si c'est un 402, ouvre
   * le dialog et retourne true. Sinon retourne false (le caller continue).
   */
  handleApiError: (e: unknown) => boolean;
}

const PlanGateContext = createContext<PlanGateContextValue | null>(null);

export function PlanGateProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [requiredPlan, setRequiredPlan] = useState<string | undefined>();
  const [currentPlanCode, setCurrentPlanCode] = useState<string | undefined>();

  // Charge le plan courant au mount (utilise le cache me() existant)
  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((r) => {
        if (!cancelled) setCurrentPlanCode(r.user?.planCode);
      })
      .catch(() => {
        /* pas connecté ou erreur — on laisse undefined */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // W3 — Listener global : tout 402 émis par l'API ouvre le dialog
  // automatiquement, où qu'il soit déclenché dans l'app. Évite que chaque
  // composant doive penser à appeler planGate.handleApiError(e).
  useEffect(() => {
    function onPlanRequired(ev: Event) {
      const detail = (ev as CustomEvent).detail;
      if (detail instanceof ApiError) {
        setError(detail);
        setRequiredPlan(
          (detail.details?.requiredPlan as string | undefined) ??
            (detail.details?.suggestedPlan as string | undefined),
        );
        setOpen(true);
      }
    }
    window.addEventListener("bmd:plan-required", onPlanRequired);
    return () => {
      window.removeEventListener("bmd:plan-required", onPlanRequired);
    };
  }, []);

  const showPlanGate = useCallback(
    (opts: { error?: ApiError | null; requiredPlan?: string }) => {
      setError(opts.error ?? null);
      setRequiredPlan(opts.requiredPlan);
      setOpen(true);
    },
    [],
  );

  const handleApiError = useCallback((e: unknown): boolean => {
    if (isPlanRequired(e) && e instanceof ApiError) {
      setError(e);
      setRequiredPlan(
        (e.details?.requiredPlan as string | undefined) ??
          (e.details?.suggestedPlan as string | undefined),
      );
      setOpen(true);
      return true;
    }
    return false;
  }, []);

  return (
    <PlanGateContext.Provider value={{ showPlanGate, handleApiError }}>
      {children}
      <PlanGateDialog
        open={open}
        error={error}
        currentPlanCode={currentPlanCode}
        requiredPlanCode={requiredPlan}
        onClose={() => setOpen(false)}
      />
    </PlanGateContext.Provider>
  );
}

/**
 * Hook d'accès. Si appelé hors Provider, retourne un no-op safe.
 */
export function usePlanGate(): PlanGateContextValue {
  const ctx = useContext(PlanGateContext);
  if (!ctx) {
    return {
      showPlanGate: () => {
        if (typeof console !== "undefined") {
          console.warn("[plan-gate] showPlanGate called outside Provider");
        }
      },
      handleApiError: () => false,
    };
  }
  return ctx;
}
