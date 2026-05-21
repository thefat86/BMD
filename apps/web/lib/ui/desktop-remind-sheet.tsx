"use client";

/**
 * V223.E — DesktopRemindSheet
 * ============================================================================
 * Sheet desktop pour relancer plusieurs débiteurs d'un coup depuis la page
 * Dépenses (GroupDebtSidebar). Réutilise l'endpoint IA `generateReminderMessage`
 * (V56) et permet de copier / envoyer via WhatsApp / Email.
 *
 * UX :
 *   - Header : "Relancer N personnes"
 *   - Liste de débiteurs sélectionnables (checkbox cochée par défaut)
 *   - Tonalité (sympa / ferme / humour / pro)
 *   - Bouton "Générer" → message IA personnalisé pour chaque débiteur
 *   - Edition libre du message global (textarea)
 *   - Actions : Copier · WhatsApp · Email
 *
 * Si l'IA échoue ou n'a pas encore généré, on a un fallback message simple
 * "Hello {name}, n'oublie pas que tu me dois {amount} sur le groupe {group}".
 *
 * V45-light, fond cream. Backdrop click ou Escape pour fermer.
 */

import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api-client";
import { useToast } from "./toast";

export interface RemindDebtor {
  userId: string;
  name: string;
  amount: number;
  /** ISO currency code, hérite du groupe par défaut */
  currency: string;
}

type Tone = "sympa" | "ferme" | "humour" | "pro";

export function DesktopRemindSheet({
  open,
  onClose,
  debtors,
  groupName,
  locale,
  // i18n
  titleTemplate,
  emptyLabel,
  toneLabel,
  toneSympaLabel,
  toneFermeLabel,
  toneHumourLabel,
  toneProLabel,
  generateLabel,
  generatingLabel,
  draftLabel,
  copyLabel,
  whatsAppLabel,
  emailLabel,
  closeLabel,
  fallbackTemplate, // "Hello {{name}}, n'oublie pas que tu me dois {{amount}} sur le groupe {{group}}"
}: {
  open: boolean;
  onClose: () => void;
  debtors: RemindDebtor[];
  groupName: string;
  locale: string;
  titleTemplate: string;
  emptyLabel: string;
  toneLabel: string;
  toneSympaLabel: string;
  toneFermeLabel: string;
  toneHumourLabel: string;
  toneProLabel: string;
  generateLabel: string;
  generatingLabel: string;
  draftLabel: string;
  copyLabel: string;
  whatsAppLabel: string;
  emailLabel: string;
  closeLabel: string;
  fallbackTemplate: string;
}): JSX.Element | null {
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tone, setTone] = useState<Tone>("sympa");
  const [draft, setDraft] = useState<string>("");
  const [generating, setGenerating] = useState(false);

  // Reset quand on rouvre / change la liste
  useEffect(() => {
    if (!open) return;
    setSelected(new Set(debtors.map((d) => d.userId)));
    setDraft("");
  }, [open, debtors]);

  // Escape pour fermer
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const activeDebtors = useMemo(
    () => debtors.filter((d) => selected.has(d.userId)),
    [debtors, selected],
  );

  // V225.B — Single-brace `{x}` (cohérent avec t() BMD) + fallback double.
  function fillTemplate(
    tpl: string,
    vars: Record<string, string | number>,
  ): string {
    let s = tpl;
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g"), String(v));
      s = s.replace(new RegExp(`\\{\\s*${k}\\s*\\}`, "g"), String(v));
    }
    return s;
  }

  function buildFallback(): string {
    return activeDebtors
      .map((d) =>
        fillTemplate(fallbackTemplate, {
          name: d.name,
          amount: `${d.amount.toFixed(2)} ${d.currency}`,
          group: groupName,
        }),
      )
      .join("\n\n");
  }

  async function handleGenerate() {
    if (activeDebtors.length === 0) {
      toast.error(new Error(emptyLabel));
      return;
    }
    setGenerating(true);
    try {
      // V223.E — Si 1 seul débiteur, on demande à l'IA un message ciblé.
      // Si plusieurs, on les concatène (1 IA call par personne max parallèle 3).
      const messages = await Promise.all(
        activeDebtors.slice(0, 3).map(async (d) => {
          try {
            const r = await api.generateReminderMessage({
              debtorName: d.name.split(" ")[0] ?? d.name,
              debtorUserId: d.userId,
              amount: d.amount.toFixed(2),
              currency: d.currency,
              tone,
              locale,
              groupNames: [groupName],
            });
            return r.message;
          } catch {
            return fillTemplate(fallbackTemplate, {
              name: d.name,
              amount: `${d.amount.toFixed(2)} ${d.currency}`,
              group: groupName,
            });
          }
        }),
      );
      // Si plus de 3 débiteurs, on complète avec fallback
      const overflow = activeDebtors.slice(3).map((d) =>
        fillTemplate(fallbackTemplate, {
          name: d.name,
          amount: `${d.amount.toFixed(2)} ${d.currency}`,
          group: groupName,
        }),
      );
      setDraft([...messages, ...overflow].join("\n\n"));
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error).message;
      toast.error(new Error(msg));
      // fallback offline
      setDraft(buildFallback());
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy() {
    const text = draft || buildFallback();
    try {
      await navigator.clipboard.writeText(text);
      toast.success(copyLabel);
    } catch {
      toast.error(new Error("clipboard_failed"));
    }
  }

  function handleWhatsApp() {
    const text = encodeURIComponent(draft || buildFallback());
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
  }

  function handleEmail() {
    const subject = encodeURIComponent(
      fillTemplate(titleTemplate, { count: activeDebtors.length }),
    );
    const body = encodeURIComponent(draft || buildFallback());
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(43,31,21,0.45)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          background: "#FFFFFF",
          border: "0.5px solid #D9C8A6",
          borderRadius: 14,
          padding: 20,
          width: "min(540px, 100%)",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 24px 64px rgba(43,31,21,0.20)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 600,
              color: "#2B1F15",
            }}
          >
            {fillTemplate(titleTemplate, { count: activeDebtors.length })}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            style={{
              background: "transparent",
              border: "none",
              fontSize: 18,
              color: "#8B6F47",
              cursor: "pointer",
              padding: 4,
              lineHeight: 1,
              fontFamily: "inherit",
            }}
          >
            ×
          </button>
        </div>

        {/* Liste des débiteurs cochables */}
        {debtors.length === 0 ? (
          <div
            style={{
              padding: 20,
              textAlign: "center",
              color: "#6B5A47",
              fontSize: 13,
              background: "#FAF6EE",
              borderRadius: 10,
            }}
          >
            {emptyLabel}
          </div>
        ) : (
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {debtors.map((d) => {
              const checked = selected.has(d.userId);
              return (
                <li key={d.userId}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      background: checked ? "#F4ECD9" : "#FAF6EE",
                      border: `0.5px solid ${checked ? "#D9C8A6" : "#EEE4CC"}`,
                      borderRadius: 9,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(d.userId)) next.delete(d.userId);
                          else next.add(d.userId);
                          return next;
                        });
                      }}
                      style={{
                        accentColor: "#C58A2E",
                        width: 16,
                        height: 16,
                        cursor: "pointer",
                      }}
                    />
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 13,
                        color: "#2B1F15",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {d.name}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#9F4628",
                        fontFamily: "ui-monospace, Menlo, monospace",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {d.amount.toFixed(2)} {d.currency}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        {/* Tonalité */}
        <div>
          <div
            style={{
              fontSize: 10,
              color: "#8B6F47",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 6,
              fontWeight: 600,
            }}
          >
            {toneLabel}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(
              [
                { value: "sympa", label: toneSympaLabel },
                { value: "ferme", label: toneFermeLabel },
                { value: "humour", label: toneHumourLabel },
                { value: "pro", label: toneProLabel },
              ] as Array<{ value: Tone; label: string }>
            ).map((opt) => {
              const isActive = tone === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTone(opt.value)}
                  style={{
                    padding: "6px 12px",
                    background: isActive ? "#C58A2E" : "#FFFFFF",
                    color: isActive ? "#FFFFFF" : "#2B1F15",
                    border: `0.5px solid ${isActive ? "#C58A2E" : "#D9C8A6"}`,
                    borderRadius: 7,
                    fontSize: 12,
                    fontFamily: "inherit",
                    cursor: "pointer",
                    fontWeight: 500,
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Bouton générer */}
        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={generating || activeDebtors.length === 0}
          style={{
            padding: "10px 14px",
            background: generating ? "#D9C8A6" : "#C58A2E",
            color: "#FFFFFF",
            border: "none",
            borderRadius: 9,
            fontSize: 13,
            fontWeight: 600,
            cursor: generating ? "wait" : "pointer",
            fontFamily: "inherit",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            opacity: activeDebtors.length === 0 ? 0.6 : 1,
          }}
        >
          {generating ? generatingLabel : `✦ ${generateLabel}`}
        </button>

        {/* Message draft */}
        <div>
          <div
            style={{
              fontSize: 10,
              color: "#8B6F47",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 6,
              fontWeight: 600,
            }}
          >
            {draftLabel}
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            placeholder={buildFallback()}
            style={{
              width: "100%",
              padding: 10,
              background: "#FAF6EE",
              border: "0.5px solid #D9C8A6",
              borderRadius: 9,
              color: "#2B1F15",
              fontFamily: "inherit",
              fontSize: 13,
              lineHeight: 1.5,
              resize: "vertical",
              minHeight: 100,
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Actions */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={() => void handleCopy()}
            style={{
              padding: "10px 12px",
              background: "transparent",
              color: "#2B1F15",
              border: "0.5px solid #D9C8A6",
              borderRadius: 9,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {copyLabel}
          </button>
          <button
            type="button"
            onClick={handleWhatsApp}
            style={{
              padding: "10px 12px",
              background: "#1F7A57",
              color: "#FFFFFF",
              border: "none",
              borderRadius: 9,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {whatsAppLabel}
          </button>
          <button
            type="button"
            onClick={handleEmail}
            style={{
              padding: "10px 12px",
              background: "#2B1F15",
              color: "#FFFFFF",
              border: "none",
              borderRadius: 9,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {emailLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
