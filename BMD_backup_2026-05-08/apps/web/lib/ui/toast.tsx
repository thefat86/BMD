"use client";

/**
 * Système de toast (notifications) global et réutilisable.
 *
 * Usage :
 *   1. Wrap l'app dans <ToastProvider> (déjà fait dans layout.tsx)
 *   2. Dans n'importe quel client component :
 *        const toast = useToast();
 *        toast.success("Dépense enregistrée");
 *        toast.error("Erreur réseau");
 *        toast.info("Le QR code est généré");
 *
 * Les toasts s'affichent en haut à droite (desktop) ou en bas (mobile),
 * disparaissent automatiquement après 4s, et peuvent être fermés manuellement.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type ToastKind = "success" | "error" | "info" | "warning";

interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  push: (kind: ToastKind, message: string) => void;
  success: (message: string) => void;
  error: (message: string | unknown) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback gracieux si le provider n'est pas mount.
    // Évite des crashs en SSR / pendant l'hydratation.
    return {
      push: (_, msg) => console.log("[toast]", msg),
      success: (msg) => console.log("[toast/ok]", msg),
      error: (e) => console.error("[toast/err]", e),
      info: (msg) => console.log("[toast/i]", msg),
      warning: (msg) => console.warn("[toast/w]", msg),
    };
  }
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = Math.random().toString(36).slice(2, 10);
      setToasts((t) => [...t, { id, kind, message }]);
      // Auto-dismiss après 4s
      setTimeout(() => remove(id), 4000);
    },
    [remove],
  );

  const api: ToastApi = {
    push,
    success: (m) => push("success", m),
    error: (e) =>
      push(
        "error",
        typeof e === "string"
          ? e
          : e instanceof Error
            ? e.message
            : "Une erreur est survenue",
      ),
    info: (m) => push("info", m),
    warning: (m) => push("warning", m),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastContainer toasts={toasts} onClose={remove} />
    </ToastContext.Provider>
  );
}

function ToastContainer({
  toasts,
  onClose,
}: {
  toasts: Toast[];
  onClose: (id: string) => void;
}): JSX.Element {
  return (
    <div
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      aria-atomic="false"
      style={{
        position: "fixed",
        top: "calc(env(safe-area-inset-top, 0) + 16px)",
        right: "16px",
        left: "16px",
        maxWidth: "420px",
        marginLeft: "auto",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onClose={() => onClose(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onClose,
}: {
  toast: Toast;
  onClose: () => void;
}): JSX.Element {
  const [enter, setEnter] = useState(false);
  useEffect(() => {
    requestAnimationFrame(() => setEnter(true));
  }, []);

  const palette: Record<ToastKind, { bg: string; border: string; icon: string }> = {
    success: { bg: "#ecfdf5", border: "#10b981", icon: "✓" },
    error: { bg: "#fef2f2", border: "#ef4444", icon: "✕" },
    info: { bg: "#eff6ff", border: "#3b82f6", icon: "ℹ" },
    warning: { bg: "#fffbeb", border: "#f59e0b", icon: "!" },
  };
  const p = palette[toast.kind];

  // role="alert" pour les erreurs (lu immédiatement par les screen readers),
  // role="status" pour les autres (lu après la fin du contexte courant).
  const toastRole = toast.kind === "error" ? "alert" : "status";

  return (
    <div
      role={toastRole}
      style={{
        background: p.bg,
        border: `1px solid ${p.border}`,
        borderLeft: `4px solid ${p.border}`,
        borderRadius: "12px",
        padding: "12px 16px",
        boxShadow: "0 6px 20px rgba(0,0,0,0.08)",
        display: "flex",
        alignItems: "flex-start",
        gap: "10px",
        pointerEvents: "auto",
        transform: enter ? "translateY(0)" : "translateY(-12px)",
        opacity: enter ? 1 : 0,
        transition: "all 0.2s ease",
        fontSize: "14px",
        lineHeight: "1.4",
      }}
    >
      <span
        style={{
          color: p.border,
          fontWeight: 700,
          fontSize: "16px",
          flexShrink: 0,
          width: "20px",
          textAlign: "center",
        }}
      >
        {p.icon}
      </span>
      <span style={{ flex: 1, color: "#111827" }}>{toast.message}</span>
      <button
        onClick={onClose}
        aria-label="Fermer"
        style={{
          background: "transparent",
          border: "none",
          fontSize: "18px",
          cursor: "pointer",
          color: "#6b7280",
          padding: "0",
          lineHeight: "1",
          minHeight: "auto",
          minWidth: "auto",
        }}
      >
        ×
      </button>
    </div>
  );
}
