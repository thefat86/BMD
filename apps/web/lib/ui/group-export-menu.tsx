"use client";

/**
 * V163.B — Menu d'export unifié pour la vue groupe (web desktop).
 *
 * AVANT V163 : 6 boutons d'export en flex sur une ligne (CSV / PDF impression /
 * Excel client / PDF serveur / Excel+ serveur / Import CSV) → débordement
 * sur la plupart des largeurs, wrap chaotique, doublons visuels « 📄 PDF »
 * et « 📊 Excel » apparaissant deux fois.
 *
 * APRÈS V163 : un seul bouton « Exporter ▾ » + un seul bouton « Importer ».
 * Le menu déroule les 5 options réelles dans une popover propre :
 *   1. CSV simple (instantané, navigateur)
 *   2. Excel basique .xlsx (instantané, navigateur — SheetJS client)
 *   3. Excel premium (3 feuilles + formules) ← serveur, plan-gated
 *   4. PDF récap (vue imprimable du navigateur)
 *   5. PDF premium brandé BMD ← serveur, plan-gated
 *
 * Design V45-light : palette saffron + cocoa, popover sticky, descriptions
 * courtes pour que l'utilisateur sache quoi choisir.
 */

import { useEffect, useRef, useState } from "react";

export interface ExportOption {
  id: string;
  /** Court label affiché (ex: "CSV", "Excel premium"). */
  label: string;
  /** Description courte sous le label (ex: "Compatible Tableur"). */
  hint?: string;
  /** Émoji ou icône react à gauche. */
  icon?: React.ReactNode;
  /** True si l'option est plan-gated premium (affiche un badge). */
  premium?: boolean;
  /** Handler — peut être async pour les exports serveur. */
  onSelect: () => void | Promise<void>;
}

interface Props {
  options: ExportOption[];
  /** Label du bouton de déclenchement. Default: "Exporter". */
  buttonLabel?: string;
}

export function GroupExportMenu({
  options,
  buttonLabel = "Exporter",
}: Props): JSX.Element {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click + Escape
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          fontSize: 12,
          padding: "8px 14px",
          minHeight: 36,
          background: open
            ? "var(--v45-saffron-pale, #F6E8C5)"
            : "var(--paper, rgba(244,228,193,0.35))",
          border: `1px solid ${
            open
              ? "var(--v45-saffron, #C58A2E)"
              : "var(--cocoa-line, rgba(43,31,21,0.15))"
          }`,
          borderRadius: 10,
          cursor: "pointer",
          fontWeight: 600,
          color: "var(--cocoa, #2B1F15)",
          fontFamily: "inherit",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          whiteSpace: "nowrap",
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        {buttonLabel}
        <span
          aria-hidden
          style={{
            fontSize: 10,
            opacity: 0.7,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
            display: "inline-block",
          }}
        >
          ▾
        </span>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 280,
            background: "var(--paper, #FBF6EC)",
            border: "1px solid var(--cocoa-line, rgba(43,31,21,0.15))",
            borderRadius: 14,
            boxShadow:
              "0 12px 32px -8px rgba(43,31,21,0.20), 0 4px 12px -4px rgba(43,31,21,0.10)",
            padding: 6,
            zIndex: 50,
            // V163 — Évite que le menu déborde au-dessus d'autres éléments
            // critiques (header sticky, etc.) → max-height + scroll si > 5 items
            maxHeight: 420,
            overflowY: "auto",
          }}
        >
          {options.map((opt, idx) => (
            <button
              key={opt.id}
              type="button"
              role="menuitem"
              onClick={async () => {
                setOpen(false);
                try {
                  await opt.onSelect();
                } catch {
                  /* le handler gère ses propres erreurs (toast) */
                }
              }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: "10px 12px",
                background: "transparent",
                border: "none",
                borderRadius: 10,
                cursor: "pointer",
                textAlign: "left",
                fontFamily: "inherit",
                color: "var(--cocoa, #2B1F15)",
                marginBottom: idx === options.length - 1 ? 0 : 2,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "var(--v45-saffron-pale, #F6E8C5)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "transparent";
              }}
            >
              {opt.icon && (
                <span
                  aria-hidden
                  style={{
                    flexShrink: 0,
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: "var(--v45-saffron-pale, #F6E8C5)",
                    color: "var(--v45-saffron-strong, #854F0B)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 15,
                  }}
                >
                  {opt.icon}
                </span>
              )}
              <span style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--cocoa, #2B1F15)",
                  }}
                >
                  {opt.label}
                  {opt.premium && (
                    <span
                      style={{
                        fontSize: 9,
                        padding: "2px 6px",
                        background:
                          "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--v45-saffron-strong, #854F0B))",
                        color: "#FBF6EC",
                        borderRadius: 999,
                        letterSpacing: 0.4,
                        fontWeight: 700,
                      }}
                    >
                      PRO
                    </span>
                  )}
                </span>
                {opt.hint && (
                  <span
                    style={{
                      display: "block",
                      marginTop: 2,
                      fontSize: 11,
                      color: "var(--cocoa-soft, #6B5942)",
                      lineHeight: 1.35,
                    }}
                  >
                    {opt.hint}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
