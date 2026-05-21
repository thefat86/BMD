"use client";

/**
 * V163.F — Console admin : prix du logo personnalisé PDF.
 *
 * SuperAdmin only. Permet de :
 *   - Voir tous les tarifs (par devise)
 *   - Modifier le prix mensuel (centimes)
 *   - Activer/désactiver l'offre
 *   - Ajouter une nouvelle devise (XOF, XAF, NGN, etc.)
 *
 * Design V45-light cohérent avec /admin/signature-pricing.
 */

import { useEffect, useState } from "react";
import { api } from "../../../lib/api-client";
import { useToast } from "../../../lib/ui/toast";
import { ResponsiveShell } from "../../../lib/ui/responsive-shell";

interface PricingRow {
  id: string;
  currency: string;
  monthlyPriceCents: number;
  enabled: boolean;
  notes: string | null;
  updatedAt: string;
  createdAt: string;
}

export default function CustomLogoPricingAdminPage(): JSX.Element {
  const toast = useToast();
  const [rows, setRows] = useState<PricingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, Partial<PricingRow>>>(
    {},
  );
  const [savingId, setSavingId] = useState<string | null>(null);

  // Formulaire d'ajout
  const [newCurrency, setNewCurrency] = useState("");
  const [newPriceCents, setNewPriceCents] = useState<string>("999");
  const [creating, setCreating] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const r = await api.listCustomLogoPricing();
      setRows(r);
    } catch (e) {
      toast.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function saveRow(row: PricingRow) {
    const draft = editing[row.id] ?? {};
    const next = {
      currency: row.currency,
      monthlyPriceCents:
        draft.monthlyPriceCents ?? row.monthlyPriceCents,
      enabled: draft.enabled ?? row.enabled,
      notes: (draft.notes ?? row.notes ?? "") as string,
    };
    setSavingId(row.id);
    try {
      await api.upsertCustomLogoPricing(next);
      toast.success("Tarif mis à jour ✓");
      setEditing((e) => {
        const c = { ...e };
        delete c[row.id];
        return c;
      });
      await refresh();
    } catch (e) {
      toast.error(e);
    } finally {
      setSavingId(null);
    }
  }

  async function createNew() {
    if (!newCurrency || newCurrency.length !== 3) {
      toast.error(new Error("Code devise invalide (3 lettres, ex: USD)"));
      return;
    }
    const cents = parseInt(newPriceCents, 10);
    if (!Number.isFinite(cents) || cents < 0) {
      toast.error(new Error("Prix invalide"));
      return;
    }
    setCreating(true);
    try {
      await api.upsertCustomLogoPricing({
        currency: newCurrency.toUpperCase(),
        monthlyPriceCents: cents,
        enabled: true,
      });
      setNewCurrency("");
      setNewPriceCents("999");
      toast.success("Devise ajoutée ✓");
      await refresh();
    } catch (e) {
      toast.error(e);
    } finally {
      setCreating(false);
    }
  }

  return (
    <ResponsiveShell
      breadcrumb="Admin · Logo PDF — Tarification"
      desktopTitle="Logo personnalisé PDF — Tarification"
      subtitle="Prix mensuel récurrent pour activer le logo client sur tous les PDF générés (RDD, comptes rendus, reçus fiscaux, récaps groupe). Modifie ici en centimes — répercuté instantanément sur tous les groupes qui voient la page d'activation."
      mobileTitle="Logo PDF"
      back={{ href: "/admin" }}
      hideFab
    >
      <div style={{ padding: "0 16px", maxWidth: 920, margin: "0 auto" }}>

      {/* Tableau des tarifs existants */}
      <section
        style={{
          background: "var(--paper, #FBF6EC)",
          border: "1px solid var(--cocoa-line, rgba(43,31,21,0.10))",
          borderRadius: 14,
          padding: 16,
          marginBottom: 18,
        }}
      >
        <h2 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700 }}>
          Tarifs actifs
        </h2>
        {loading ? (
          <p style={{ fontSize: 13, color: "var(--cocoa-soft)" }}>…</p>
        ) : rows.length === 0 ? (
          <p
            style={{
              fontSize: 13,
              fontStyle: "italic",
              color: "var(--cocoa-soft)",
            }}
          >
            Aucun tarif configuré. Ajoute au moins EUR pour activer la fonction.
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr
                style={{
                  borderBottom:
                    "1px solid var(--cocoa-line, rgba(43,31,21,0.15))",
                }}
              >
                <th style={thStyle}>Devise</th>
                <th style={thStyle}>Prix (centimes)</th>
                <th style={thStyle}>Aperçu</th>
                <th style={thStyle}>Actif</th>
                <th style={thStyle}>Notes</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const draft = editing[row.id] ?? {};
                const cents = draft.monthlyPriceCents ?? row.monthlyPriceCents;
                const enabled = draft.enabled ?? row.enabled;
                const dirty =
                  Object.keys(editing[row.id] ?? {}).length > 0;
                return (
                  <tr
                    key={row.id}
                    style={{
                      borderBottom:
                        "1px solid var(--cocoa-line, rgba(43,31,21,0.06))",
                    }}
                  >
                    <td style={tdStyle}>
                      <strong style={{ fontFamily: "monospace" }}>
                        {row.currency}
                      </strong>
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="number"
                        value={cents}
                        min={0}
                        max={100000}
                        onChange={(e) =>
                          setEditing((p) => ({
                            ...p,
                            [row.id]: {
                              ...p[row.id],
                              monthlyPriceCents: parseInt(e.target.value, 10),
                            },
                          }))
                        }
                        style={inputStyle}
                      />
                    </td>
                    <td style={{ ...tdStyle, fontFamily: "monospace" }}>
                      {(cents / 100).toFixed(2)} {row.currency}
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) =>
                          setEditing((p) => ({
                            ...p,
                            [row.id]: {
                              ...p[row.id],
                              enabled: e.target.checked,
                            },
                          }))
                        }
                      />
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="text"
                        value={draft.notes ?? row.notes ?? ""}
                        placeholder="Note interne…"
                        onChange={(e) =>
                          setEditing((p) => ({
                            ...p,
                            [row.id]: {
                              ...p[row.id],
                              notes: e.target.value,
                            },
                          }))
                        }
                        style={{ ...inputStyle, width: 220 }}
                      />
                    </td>
                    <td style={tdStyle}>
                      <button
                        type="button"
                        disabled={!dirty || savingId === row.id}
                        onClick={() => saveRow(row)}
                        style={{
                          ...btnStyle,
                          opacity: dirty ? 1 : 0.4,
                          cursor: dirty ? "pointer" : "not-allowed",
                        }}
                      >
                        {savingId === row.id ? "…" : "Enregistrer"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Form ajout devise */}
      <section
        style={{
          background: "var(--paper, #FBF6EC)",
          border: "1px solid var(--cocoa-line, rgba(43,31,21,0.10))",
          borderRadius: 14,
          padding: 16,
        }}
      >
        <h2 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700 }}>
          Ajouter une devise
        </h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
          <label style={{ display: "block" }}>
            <span style={{ display: "block", fontSize: 11, color: "var(--cocoa-soft)" }}>
              Devise (ISO 4217)
            </span>
            <input
              type="text"
              value={newCurrency}
              maxLength={3}
              placeholder="USD"
              onChange={(e) => setNewCurrency(e.target.value.toUpperCase())}
              style={{ ...inputStyle, width: 90, textTransform: "uppercase" }}
            />
          </label>
          <label style={{ display: "block" }}>
            <span style={{ display: "block", fontSize: 11, color: "var(--cocoa-soft)" }}>
              Prix mensuel (centimes)
            </span>
            <input
              type="number"
              value={newPriceCents}
              min={0}
              max={100000}
              onChange={(e) => setNewPriceCents(e.target.value)}
              style={{ ...inputStyle, width: 140 }}
            />
          </label>
          <button
            type="button"
            disabled={creating || newCurrency.length !== 3}
            onClick={createNew}
            style={{
              ...btnStyle,
              opacity: creating || newCurrency.length !== 3 ? 0.5 : 1,
            }}
          >
            {creating ? "…" : "Ajouter"}
          </button>
        </div>
      </section>
      </div>
    </ResponsiveShell>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  color: "var(--cocoa-soft, #6B5942)",
  fontWeight: 700,
};

const tdStyle: React.CSSProperties = {
  padding: "10px 10px",
  fontSize: 13,
  color: "var(--cocoa, #2B1F15)",
};

const inputStyle: React.CSSProperties = {
  padding: "6px 10px",
  border: "1px solid var(--cocoa-line, rgba(43,31,21,0.18))",
  borderRadius: 8,
  fontSize: 13,
  fontFamily: "inherit",
  background: "var(--paper-stronger, #F4ECD8)",
  color: "var(--cocoa, #2B1F15)",
  width: 100,
};

const btnStyle: React.CSSProperties = {
  padding: "8px 14px",
  background:
    "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--v45-saffron-strong, #854F0B))",
  color: "#FBF6EC",
  border: "none",
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
  minHeight: 36,
};
