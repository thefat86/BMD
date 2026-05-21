"use client";

/**
 * <DialogProvider> · Modals natifs in-app pour remplacer
 * window.alert / window.confirm / window.prompt.
 *
 * Pourquoi ? Les dialogues natifs du navigateur :
 *  - Cassent l'identité visuelle de l'app
 *  - Sortent du contexte (sur mobile en mode PWA, ils ressemblent à des alertes système)
 *  - Bloquent le thread JS (synchrone)
 *  - Ne sont pas accessibles aux lecteurs d'écran selon les implémentations
 *
 * Notre Provider fournit 3 helpers :
 *  - showAlert(message, opts?)   → dialog avec un seul bouton OK
 *  - showConfirm(message, opts?) → dialog avec OUI / NON, retourne boolean
 *  - showPrompt(message, opts?)  → dialog avec input texte, retourne string | null
 *
 * Tous trois retournent des Promises pour rester équivalents aux APIs natives.
 *
 * Usage :
 *   const { confirm } = useDialog();
 *   const ok = await confirm("Supprimer cet élément ?", { variant: "danger" });
 *   if (ok) doDelete();
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Variant = "info" | "warning" | "danger" | "success";

interface AlertOptions {
  title?: string;
  variant?: Variant;
  /** Texte du bouton OK (défaut: "OK") */
  okLabel?: string;
}
interface ConfirmOptions extends AlertOptions {
  /** Texte du bouton confirmer (défaut: "Confirmer") */
  confirmLabel?: string;
  /** Texte du bouton annuler (défaut: "Annuler") */
  cancelLabel?: string;
}
interface PromptOptions extends ConfirmOptions {
  /** Valeur initiale du champ */
  defaultValue?: string;
  /** Placeholder du champ */
  placeholder?: string;
  /** Type d'input (text, number, password, email...) */
  inputType?: "text" | "number" | "password" | "email" | "tel";
  /** Validation custom — retourne null si OK, ou un message d'erreur */
  validate?: (value: string) => string | null;
}

interface DialogContextValue {
  alert: (message: string, opts?: AlertOptions) => Promise<void>;
  confirm: (message: string, opts?: ConfirmOptions) => Promise<boolean>;
  prompt: (message: string, opts?: PromptOptions) => Promise<string | null>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

type DialogState =
  | null
  | {
      kind: "alert";
      message: string;
      opts: AlertOptions;
      resolve: () => void;
    }
  | {
      kind: "confirm";
      message: string;
      opts: ConfirmOptions;
      resolve: (v: boolean) => void;
    }
  | {
      kind: "prompt";
      message: string;
      opts: PromptOptions;
      resolve: (v: string | null) => void;
    };

const VARIANT_STYLES: Record<Variant, { accent: string; emoji: string }> = {
  info: { accent: "#5b6cff", emoji: "💡" },
  warning: { accent: "#e8a33d", emoji: "⚠️" },
  danger: { accent: "#ef4444", emoji: "🛑" },
  success: { accent: "#10b981", emoji: "✅" },
};

export function DialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState>(null);
  const [inputValue, setInputValue] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Reset input quand un nouveau prompt s'ouvre
  useEffect(() => {
    if (state?.kind === "prompt") {
      setInputValue(state.opts.defaultValue ?? "");
      setInputError(null);
      // Focus auto sur l'input (UX)
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [state]);

  // Ferme avec Escape
  useEffect(() => {
    if (!state) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (state?.kind === "confirm") state.resolve(false);
        else if (state?.kind === "prompt") state.resolve(null);
        else if (state?.kind === "alert") state.resolve();
        setState(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state]);

  const alert = useCallback(
    (message: string, opts: AlertOptions = {}) =>
      new Promise<void>((resolve) => {
        setState({ kind: "alert", message, opts, resolve });
      }),
    [],
  );

  const confirm = useCallback(
    (message: string, opts: ConfirmOptions = {}) =>
      new Promise<boolean>((resolve) => {
        setState({ kind: "confirm", message, opts, resolve });
      }),
    [],
  );

  const prompt = useCallback(
    (message: string, opts: PromptOptions = {}) =>
      new Promise<string | null>((resolve) => {
        setState({ kind: "prompt", message, opts, resolve });
      }),
    [],
  );

  function close() {
    setState(null);
  }

  function handleConfirm() {
    if (!state) return;
    if (state.kind === "alert") {
      state.resolve();
      close();
    } else if (state.kind === "confirm") {
      state.resolve(true);
      close();
    } else if (state.kind === "prompt") {
      // Validate
      if (state.opts.validate) {
        const err = state.opts.validate(inputValue);
        if (err) {
          setInputError(err);
          return;
        }
      }
      state.resolve(inputValue);
      close();
    }
  }

  function handleCancel() {
    if (!state) return;
    if (state.kind === "alert") state.resolve();
    else if (state.kind === "confirm") state.resolve(false);
    else if (state.kind === "prompt") state.resolve(null);
    close();
  }

  return (
    <DialogContext.Provider value={{ alert, confirm, prompt }}>
      {children}
      {state && (
        <DialogOverlay
          state={state}
          inputValue={inputValue}
          inputError={inputError}
          inputRef={inputRef}
          setInputValue={(v) => {
            setInputValue(v);
            if (inputError) setInputError(null);
          }}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </DialogContext.Provider>
  );
}

interface OverlayProps {
  state: NonNullable<DialogState>;
  inputValue: string;
  inputError: string | null;
  inputRef: React.MutableRefObject<HTMLInputElement | null>;
  setInputValue: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

function DialogOverlay({
  state,
  inputValue,
  inputError,
  inputRef,
  setInputValue,
  onConfirm,
  onCancel,
}: OverlayProps) {
  const variant = state.opts.variant ?? "info";
  const style = VARIANT_STYLES[variant];
  const isPrompt = state.kind === "prompt";
  const isConfirmKind = state.kind === "confirm";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      onClick={(e) => {
        // Click hors du panneau → annule (sauf alert qui exige un OK explicite)
        if (e.target === e.currentTarget && state.kind !== "alert") {
          onCancel();
        }
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(14,11,20,0.6)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        // Animation d'entrée
        animation: "dialog-fade-in 0.15s ease-out",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "var(--overlay, #1e1830)",
          color: "var(--cream, #f4e4c1)",
          borderRadius: 16,
          padding: 20,
          border: `1px solid ${style.accent}33`,
          boxShadow:
            "0 20px 50px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)",
          animation: "dialog-slide-up 0.2s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête : emoji + titre éventuel */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 12,
          }}
        >
          <div
            aria-hidden
            style={{
              fontSize: 28,
              flexShrink: 0,
              filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))",
            }}
          >
            {style.emoji}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {state.opts.title && (
              <h3
                id="dialog-title"
                style={{
                  margin: 0,
                  fontSize: 16,
                  fontWeight: 700,
                  color: style.accent,
                }}
              >
                {state.opts.title}
              </h3>
            )}
            {!state.opts.title && (
              <span id="dialog-title" className="sr-only">
                Boîte de dialogue
              </span>
            )}
          </div>
        </div>

        {/* Message */}
        <p
          style={{
            fontSize: 14,
            lineHeight: 1.5,
            margin: "0 0 14px",
            color: "var(--cream-soft, #d4c4a8)",
            whiteSpace: "pre-wrap",
          }}
        >
          {state.message}
        </p>

        {/* Input pour prompt */}
        {isPrompt && (
          <>
            <input
              ref={inputRef}
              type={state.opts.inputType ?? "text"}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={state.opts.placeholder}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onConfirm();
                }
              }}
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: 14,
                background: "var(--overlay-2, #2a2244)",
                border: `1px solid ${
                  inputError ? "#ef4444" : "var(--line-soft, #3a2f5b)"
                }`,
                borderRadius: 10,
                color: "var(--cream, #f4e4c1)",
                outline: "none",
                marginBottom: inputError ? 4 : 14,
              }}
            />
            {inputError && (
              <p
                style={{
                  fontSize: 12,
                  color: "#ef4444",
                  margin: "0 0 10px",
                }}
              >
                {inputError}
              </p>
            )}
          </>
        )}

        {/* Boutons */}
        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            flexWrap: "wrap",
          }}
        >
          {(isConfirmKind || isPrompt) && (
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: "10px 18px",
                fontSize: 13,
                fontWeight: 600,
                background: "transparent",
                color: "var(--cream-soft, #d4c4a8)",
                border: "1px solid var(--line-soft, #3a2f5b)",
                borderRadius: 10,
                cursor: "pointer",
                minHeight: 44,
              }}
            >
              {state.opts.cancelLabel ?? "Annuler"}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            autoFocus={!isPrompt}
            style={{
              padding: "10px 18px",
              fontSize: 13,
              fontWeight: 700,
              background:
                variant === "danger"
                  ? "#ef4444"
                  : `linear-gradient(135deg, ${style.accent}, ${style.accent}cc)`,
              color: variant === "danger" ? "white" : "#16111e",
              border: "none",
              borderRadius: 10,
              cursor: "pointer",
              minHeight: 44,
            }}
          >
            {state.kind === "alert"
              ? state.opts.okLabel ?? "OK"
              : isConfirmKind
                ? (state.opts as ConfirmOptions).confirmLabel ?? "Confirmer"
                : (state.opts as PromptOptions).confirmLabel ?? "Valider"}
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes dialog-fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes dialog-slide-up {
          from {
            transform: translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

/**
 * Hook pour utiliser les dialogs depuis n'importe quel composant.
 * Fallback safe : si appelé hors d'un Provider, utilise les dialogs natifs
 * (pour ne jamais bloquer l'app).
 */
export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    return {
      alert: async (m) => {
        if (typeof window !== "undefined") window.alert(m);
      },
      confirm: async (m) => {
        if (typeof window === "undefined") return false;
        return window.confirm(m);
      },
      prompt: async (m, opts) => {
        if (typeof window === "undefined") return null;
        return window.prompt(m, opts?.defaultValue);
      },
    };
  }
  return ctx;
}
