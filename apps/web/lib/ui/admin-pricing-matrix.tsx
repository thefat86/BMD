"use client";

/**
 * <AdminPricingMatrix> · Éditeur des tarifs régionalisés PPA (spec §6.3).
 *
 * UX inspirée des back-offices Stripe / Recurly :
 *  - Tableau N plans × M régions (cellules éditables in-line)
 *  - Chaque cellule affiche le prix mensuel + (optionnel) annuel
 *  - Click sur une cellule → modal d'édition (prix mensuel, annuel, devise, notes)
 *  - Nouvelle région : modal séparé avec sélection multi-pays (ISO 3166-1)
 *  - Toggle isActive / ppaIndex / displayOrder par ligne
 *  - Cell vide = pas de tier régional → fallback au prix de base EUR du plan
 *
 * Le composant lit `api.adminListRegions()` qui retourne tout en une fois
 * (régions + leurs priceTiers existants), mappe en matrice 2D, et permet
 * d'éditer cellule par cellule via `api.adminSetPlanTier()`.
 *
 * IMPORTANT — pour un plan à 0 € (gratuit), le tier régional est inutile :
 * on permet de le configurer mais on n'affiche rien à l'utilisateur final
 * (qui voit juste "Gratuit"). Idem pour les plans inactifs.
 */

import { useEffect, useMemo, useState } from "react";
import { api } from "../api-client";
import { useToast } from "./toast";
import { useDialog } from "./dialog-provider";

interface Region {
  code: string;
  name: string;
  defaultCurrency: string;
  countryCodes: string[];
  description: string | null;
  ppaIndex: number;
  displayOrder: number;
  isActive: boolean;
  priceTiers: Array<{
    planCode: string;
    currency: string;
    priceCents: number;
    priceCentsYearly: number | null;
    stripePriceId?: string | null;
    stripePriceIdYearly?: string | null;
  }>;
}

interface Plan {
  code: string;
  name: string;
  priceCents: number;
}

const ZERO_DECIMAL = new Set([
  "XAF", "XOF", "JPY", "KRW", "VND", "RWF", "UGX", "BIF",
  "DJF", "GNF", "KMF", "MGA", "MWK", "TZS",
]);

const SYMBOLS: Record<string, string> = {
  EUR: "€", USD: "$", GBP: "£", CHF: "CHF", CAD: "$CA",
  XAF: "FCFA", XOF: "FCFA", MAD: "DH", DZD: "DA", TND: "DT",
  NGN: "₦", KES: "Ksh", GHS: "GH₵", ZAR: "R",
  CNY: "¥", INR: "₹", IDR: "Rp", PHP: "₱", VND: "₫",
};

function formatMoney(cents: number, currency: string): string {
  if (cents === 0) return "—";
  const sym = SYMBOLS[currency] ?? currency;
  const value = ZERO_DECIMAL.has(currency) ? cents : cents / 100;
  const formatted = ZERO_DECIMAL.has(currency)
    ? value.toLocaleString("fr-FR", { maximumFractionDigits: 0 })
    : value.toFixed(value % 1 === 0 ? 0 : 2);
  const before = ["€", "$", "£", "$CA", "¥", "₦", "₹", "₱", "₫"].includes(sym);
  return before ? `${sym}${formatted}` : `${formatted} ${sym}`;
}

export function AdminPricingMatrix(): JSX.Element {
  const toast = useToast();
  const dialog = useDialog();
  const [regions, setRegions] = useState<Region[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{
    planCode: string;
    regionCode: string;
    existing?: Region["priceTiers"][0];
  } | null>(null);
  const [creatingRegion, setCreatingRegion] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [rs, ps] = await Promise.all([
        api.adminListRegions(),
        api.adminListPlans(),
      ]);
      setRegions(rs);
      // adminListPlans retourne un Array<Plan> (route /admin/plans pas /plans)
      setPlans(
        ps.map((p: any) => ({
          code: p.code,
          name: p.name,
          priceCents: p.priceCents,
        })),
      );
      setLoading(false);
    } catch (e) {
      toast.error(e);
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function findTier(regionCode: string, planCode: string) {
    const region = regions.find((r) => r.code === regionCode);
    return region?.priceTiers.find((t) => t.planCode === planCode);
  }

  async function handleDeleteRegion(code: string) {
    const ok = await dialog.confirm(
      `Supprimer la région ${code} et tous ses tarifs ? Cette action est irréversible.`,
      {
        variant: "danger",
        title: "Suppression de région",
        confirmLabel: "Supprimer",
      },
    );
    if (!ok) return;
    try {
      await api.adminDeleteRegion(code);
      toast.success("Région supprimée");
      await load();
    } catch (e) {
      toast.error(e);
    }
  }

  async function toggleRegion(r: Region) {
    try {
      await api.adminUpdateRegion(r.code, { isActive: !r.isActive });
      await load();
    } catch (e) {
      toast.error(e);
    }
  }

  if (loading) {
    return (
      <div className="card" style={{ padding: 30, textAlign: "center" }}>
        <p className="muted">Chargement de la matrice tarifaire…</p>
      </div>
    );
  }

  return (
    <div>
      {/* Bandeau d'explication PPA */}
      <div
        style={{
          background:
            "linear-gradient(135deg, rgba(232,163,61,0.08), rgba(181,70,46,0.04))",
          border: "1px solid rgba(232,163,61,0.20)",
          borderRadius: 12,
          padding: "12px 16px",
          marginBottom: 16,
          fontSize: 13,
          lineHeight: 1.55,
          color: "var(--cream-soft)",
        }}
      >
        🌍 <strong style={{ color: "var(--saffron)" }}>Pricing PPA</strong>{" "}
        (Parité de Pouvoir d'Achat) — chaque plan peut avoir des prix
        différents selon la zone du visiteur, à la Spotify / Netflix. Les
        régions sont détectées via IP (header Cloudflare) avec fallback
        timezone navigateur. Le pays est verrouillé après le 1<sup>er</sup>{" "}
        paiement.
      </div>

      {/* En-tête : actions */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 14 }}>
          Matrice tarifaire ({regions.length} régions × {plans.length} plans)
        </h3>
        <button
          type="button"
          onClick={() => setCreatingRegion(true)}
          className="btn btn-sm"
          style={{ padding: "6px 14px", fontSize: 12 }}
        >
          ＋ Nouvelle région
        </button>
      </div>

      {/* Matrice */}
      <div
        style={{
          overflowX: "auto",
          border: "1px solid rgba(244,228,193,0.08)",
          borderRadius: 12,
          background: "rgba(244,228,193,0.02)",
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
            minWidth: 700,
          }}
        >
          <thead>
            <tr
              style={{
                background: "rgba(0,0,0,0.25)",
                color: "var(--muted)",
                fontSize: 10,
                letterSpacing: 1.4,
                textTransform: "uppercase",
                fontWeight: 700,
              }}
            >
              <th style={thStyle}>Région</th>
              <th style={thStyle}>Pays / index PPA</th>
              {plans.map((p) => (
                <th
                  key={p.code}
                  style={{
                    ...thStyle,
                    textAlign: "right",
                  }}
                >
                  {p.name}
                </th>
              ))}
              <th style={{ ...thStyle, width: 100 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {regions.map((r) => (
              <tr
                key={r.code}
                style={{
                  borderTop: "1px solid rgba(244,228,193,0.06)",
                  opacity: r.isActive ? 1 : 0.5,
                }}
              >
                <td style={tdStyle}>
                  <div
                    style={{
                      fontWeight: 600,
                      color: "var(--cream)",
                      fontSize: 13,
                    }}
                  >
                    {r.name}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--muted)",
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      marginTop: 2,
                    }}
                  >
                    {r.code} · {r.defaultCurrency}
                  </div>
                </td>
                <td style={tdStyle}>
                  <div style={{ fontSize: 11, color: "var(--cream-soft)" }}>
                    {r.countryCodes.length} pays
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--saffron)",
                      fontWeight: 700,
                      marginTop: 2,
                    }}
                  >
                    PPA {r.ppaIndex}%
                  </div>
                </td>
                {plans.map((p) => {
                  const tier = r.priceTiers.find(
                    (t) => t.planCode === p.code,
                  );
                  const cellHasPrice = !!tier;
                  return (
                    <td
                      key={p.code}
                      style={{
                        ...tdStyle,
                        textAlign: "right",
                        cursor: "pointer",
                        background: cellHasPrice
                          ? "transparent"
                          : "rgba(244,228,193,0.02)",
                      }}
                      onClick={() =>
                        setEditing({
                          planCode: p.code,
                          regionCode: r.code,
                          existing: tier,
                        })
                      }
                    >
                      {cellHasPrice ? (
                        <>
                          <div
                            style={{
                              fontFamily: "Cormorant Garamond, serif",
                              fontWeight: 700,
                              color: "var(--cream)",
                              fontSize: 16,
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {formatMoney(tier.priceCents, tier.currency)}
                          </div>
                          {tier.priceCentsYearly && (
                            <div
                              style={{
                                fontSize: 10,
                                color: "var(--muted)",
                                marginTop: 2,
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              an{" "}
                              {formatMoney(
                                tier.priceCentsYearly,
                                tier.currency,
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        <span
                          style={{
                            color: "var(--muted)",
                            fontSize: 12,
                            fontStyle: "italic",
                          }}
                        >
                          (base)
                        </span>
                      )}
                    </td>
                  );
                })}
                <td style={tdStyle}>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      type="button"
                      onClick={() => toggleRegion(r)}
                      title={r.isActive ? "Désactiver" : "Activer"}
                      style={iconBtn}
                    >
                      {r.isActive ? "🟢" : "⚪"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteRegion(r.code)}
                      title="Supprimer"
                      style={iconBtn}
                    >
                      🗑
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p
        style={{
          fontSize: 11,
          color: "var(--muted)",
          marginTop: 14,
          lineHeight: 1.6,
        }}
      >
        💡 Clique sur une cellule pour modifier le prix de ce plan dans cette
        région. Les cellules « (base) » utilisent le prix de base EUR du plan
        (pas de tarif régional spécifique).
      </p>

      {/* Modal édition cellule */}
      {editing && (
        <TierEditModal
          plan={plans.find((p) => p.code === editing.planCode)!}
          region={regions.find((r) => r.code === editing.regionCode)!}
          existing={editing.existing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
            toast.success("Tarif enregistré");
          }}
          onDeleted={async () => {
            setEditing(null);
            await load();
            toast.success("Tarif supprimé (retour au prix de base)");
          }}
        />
      )}

      {/* Modal nouvelle région */}
      {creatingRegion && (
        <NewRegionModal
          onClose={() => setCreatingRegion(false)}
          onCreated={async () => {
            setCreatingRegion(false);
            await load();
            toast.success("Région créée");
          }}
        />
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px 14px",
  textAlign: "left",
};
const tdStyle: React.CSSProperties = {
  padding: "12px 14px",
  textAlign: "left",
};
const iconBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid rgba(244,228,193,0.10)",
  borderRadius: 6,
  cursor: "pointer",
  padding: "4px 8px",
  fontSize: 13,
};

// ============================================================
// Modal d'édition d'un tier (cellule de la matrice)
// ============================================================
function TierEditModal({
  plan,
  region,
  existing,
  onClose,
  onSaved,
  onDeleted,
}: {
  plan: Plan;
  region: Region;
  existing?: Region["priceTiers"][0];
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const dialog = useDialog();
  const [currency, setCurrency] = useState(
    existing?.currency ?? region.defaultCurrency,
  );
  // Affichage en unité monétaire (pas en cents) pour faciliter la saisie
  const initialMonthly = existing
    ? ZERO_DECIMAL.has(existing.currency)
      ? String(existing.priceCents)
      : (existing.priceCents / 100).toFixed(2)
    : "";
  const initialYearly = existing?.priceCentsYearly
    ? ZERO_DECIMAL.has(existing.currency)
      ? String(existing.priceCentsYearly)
      : (existing.priceCentsYearly / 100).toFixed(2)
    : "";
  const [monthly, setMonthly] = useState(initialMonthly);
  const [yearly, setYearly] = useState(initialYearly);
  // Stripe Price IDs (optionnels — uniquement pour les régions Stripe-payantes)
  const [stripePriceId, setStripePriceId] = useState<string>(
    (existing as any)?.stripePriceId ?? "",
  );
  const [stripePriceIdYearly, setStripePriceIdYearly] = useState<string>(
    (existing as any)?.stripePriceIdYearly ?? "",
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    const m = parseFloat(monthly);
    if (!Number.isFinite(m) || m < 0) {
      toast.error("Prix mensuel invalide");
      return;
    }
    const y = yearly ? parseFloat(yearly) : null;
    if (y !== null && (!Number.isFinite(y) || y < 0)) {
      toast.error("Prix annuel invalide");
      return;
    }
    setSaving(true);
    try {
      const isZeroDecimal = ZERO_DECIMAL.has(currency);
      const monthlyCents = Math.round(isZeroDecimal ? m : m * 100);
      const yearlyCents =
        y === null
          ? null
          : Math.round(isZeroDecimal ? y : y * 100);
      await api.adminSetPlanTier({
        planCode: plan.code,
        regionCode: region.code,
        currency,
        priceCents: monthlyCents,
        priceCentsYearly: yearlyCents,
        stripePriceId: stripePriceId.trim() || null,
        stripePriceIdYearly: stripePriceIdYearly.trim() || null,
      });
      onSaved();
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!existing) {
      onClose();
      return;
    }
    const ok = await dialog.confirm(
      `Supprimer le tarif ${plan.name} pour ${region.name} ? Le plan retombera sur le prix de base EUR.`,
      {
        variant: "warning",
        title: "Supprimer le tarif régional",
        confirmLabel: "Supprimer",
      },
    );
    if (!ok) return;
    try {
      await api.adminDeletePlanTier(plan.code, region.code);
      onDeleted();
    } catch (e) {
      toast.error(e);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={modalOverlay}
    >
      <div style={modalPanel} onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 14,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                color: "var(--saffron)",
                letterSpacing: 1.2,
                textTransform: "uppercase",
                fontWeight: 700,
                marginBottom: 4,
              }}
            >
              {region.name}
            </div>
            <h3
              style={{
                fontFamily: "Cormorant Garamond, serif",
                fontSize: 22,
                fontWeight: 700,
                margin: 0,
                color: "var(--cream)",
              }}
            >
              Tarif {plan.name}
            </h3>
          </div>
          <button type="button" onClick={onClose} style={iconBtn}>
            ✕
          </button>
        </div>

        <Field label="Devise (ISO 4217)">
          <input
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            maxLength={3}
            style={inputStyle}
            placeholder={region.defaultCurrency}
          />
        </Field>

        <Field
          label={`Prix mensuel (${
            ZERO_DECIMAL.has(currency)
              ? `unités ${currency}`
              : `unités ${currency}, ex: 2.99`
          })`}
        >
          <input
            type="number"
            step={ZERO_DECIMAL.has(currency) ? "1" : "0.01"}
            min="0"
            value={monthly}
            onChange={(e) => setMonthly(e.target.value)}
            style={inputStyle}
            placeholder="0"
            autoFocus
          />
        </Field>

        <Field label="Prix annuel (optionnel)">
          <input
            type="number"
            step={ZERO_DECIMAL.has(currency) ? "1" : "0.01"}
            min="0"
            value={yearly}
            onChange={(e) => setYearly(e.target.value)}
            style={inputStyle}
            placeholder="—"
          />
        </Field>

        {/* === Stripe Price IDs (optionnels — pour les régions Stripe) === */}
        <div
          style={{
            marginTop: 14,
            padding: "10px 12px",
            background: "rgba(91,108,255,0.06)",
            border: "1px solid rgba(91,108,255,0.20)",
            borderRadius: 10,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "#5b6cff",
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            🔌 Stripe (optionnel)
          </div>
          <Field label="Stripe Price ID — mensuel">
            <input
              type="text"
              value={stripePriceId}
              onChange={(e) => setStripePriceId(e.target.value)}
              placeholder="price_1Qxxx…"
              style={{
                ...inputStyle,
                fontFamily: "monospace",
                fontSize: 12,
              }}
            />
          </Field>
          <Field label="Stripe Price ID — annuel">
            <input
              type="text"
              value={stripePriceIdYearly}
              onChange={(e) => setStripePriceIdYearly(e.target.value)}
              placeholder="price_1Qyyy…"
              style={{
                ...inputStyle,
                fontFamily: "monospace",
                fontSize: 12,
              }}
            />
          </Field>
          <div
            style={{
              fontSize: 10,
              color: "var(--muted)",
              marginTop: 6,
              lineHeight: 1.5,
            }}
          >
            Crée d'abord les Prices dans{" "}
            <a
              href="https://dashboard.stripe.com/test/products"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#5b6cff" }}
            >
              Stripe Dashboard → Products
            </a>{" "}
            puis colle leurs IDs ici. Sans Stripe Price ID, ce tier reste
            « hors Stripe » (paiement manuel / mobile money).
          </div>
        </div>

        {/* Aide PPA — recommandation auto */}
        {plan.priceCents > 0 && (
          <div
            style={{
              fontSize: 11,
              color: "var(--muted)",
              background: "rgba(244,228,193,0.04)",
              border: "1px dashed rgba(244,228,193,0.10)",
              padding: 8,
              borderRadius: 8,
              marginTop: 10,
            }}
          >
            💡 Recommandation PPA pour cette région (index {region.ppaIndex}%) :{" "}
            <strong style={{ color: "var(--cream)" }}>
              ~{((plan.priceCents / 100) * (region.ppaIndex / 100)).toFixed(2)}{" "}
              € équivalent
            </strong>{" "}
            — à convertir manuellement dans la devise locale.
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 18,
            justifyContent: "flex-end",
          }}
        >
          {existing && (
            <button
              type="button"
              onClick={remove}
              style={{
                padding: "10px 16px",
                background: "rgba(217,113,74,0.10)",
                color: "#D9714A",
                border: "1px solid rgba(217,113,74,0.30)",
                borderRadius: 10,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Supprimer
            </button>
          )}
          <button
            type="button"
            onClick={save}
            disabled={saving || !monthly}
            style={{
              padding: "10px 18px",
              background:
                "linear-gradient(135deg, var(--saffron), var(--terracotta))",
              color: "#16111E",
              border: "none",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Modal nouvelle région
// ============================================================
function NewRegionModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("");
  const [countriesRaw, setCountriesRaw] = useState("");
  const [ppaIndex, setPpaIndex] = useState(50);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const countryCodes = countriesRaw
        .split(/[\s,]+/)
        .map((c) => c.trim().toUpperCase())
        .filter((c) => c.length === 2);
      if (countryCodes.length === 0) {
        toast.error("Indique au moins un code pays (ex: NG, KE, ZA)");
        return;
      }
      await api.adminCreateRegion({
        code: code.toUpperCase(),
        name,
        defaultCurrency: currency.toUpperCase(),
        countryCodes,
        ppaIndex,
      });
      onCreated();
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={modalOverlay}
    >
      <div style={modalPanel} onClick={(e) => e.stopPropagation()}>
        <h3
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 22,
            margin: "0 0 16px",
            color: "var(--cream)",
          }}
        >
          Nouvelle région tarifaire
        </h3>
        <Field label="Code (ex: AFRICA_EAST)">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            style={inputStyle}
            placeholder="MIDDLE_EAST"
          />
        </Field>
        <Field label="Nom affiché">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
            placeholder="Moyen-Orient"
          />
        </Field>
        <Field label="Devise par défaut (ISO 4217)">
          <input
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            maxLength={3}
            style={inputStyle}
            placeholder="AED"
          />
        </Field>
        <Field label="Codes pays ISO 3166-1 alpha-2 (séparés par espace ou virgule)">
          <textarea
            value={countriesRaw}
            onChange={(e) => setCountriesRaw(e.target.value)}
            rows={3}
            style={{ ...inputStyle, resize: "vertical" }}
            placeholder="AE QA SA OM BH KW"
          />
        </Field>
        <Field label="Index PPA (% du tier de référence — 100 = prix plein)">
          <input
            type="number"
            min="1"
            max="200"
            value={ppaIndex}
            onChange={(e) => setPpaIndex(parseInt(e.target.value) || 100)}
            style={inputStyle}
          />
        </Field>
        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            marginTop: 16,
          }}
        >
          <button type="button" onClick={onClose} style={iconBtn}>
            Annuler
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            style={{
              padding: "10px 18px",
              background:
                "linear-gradient(135deg, var(--saffron), var(--terracotta))",
              color: "#16111E",
              border: "none",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Création…" : "Créer la région"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label
        style={{
          display: "block",
          fontSize: 11,
          color: "var(--cream-soft)",
          fontWeight: 600,
          marginBottom: 6,
          textTransform: "uppercase",
          letterSpacing: 1.1,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  background: "rgba(244,228,193,0.04)",
  border: "1px solid rgba(244,228,193,0.10)",
  color: "var(--cream)",
  fontSize: 14,
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const modalOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(14,11,20,0.7)",
  backdropFilter: "blur(6px)",
  zIndex: 1000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
};

const modalPanel: React.CSSProperties = {
  background: "linear-gradient(135deg, #2A2244, #3A2A52)",
  border: "1px solid rgba(232,163,61,0.25)",
  borderRadius: 18,
  padding: 24,
  maxWidth: 480,
  width: "100%",
  color: "var(--cream)",
  maxHeight: "90vh",
  overflowY: "auto",
};
