"use client";

/**
 * V151 — Admin · Tarification signatures électroniques (par niveau × pays).
 *
 * Table éditable avec :
 *  - Niveau (SIMPLE / ADVANCED / NOTARIZED)
 *  - Pays (FR, LU, CI, CM, ... ou "*" = défaut global)
 *  - Coût Yousign (centimes) → ce que BMD paie
 *  - Prix vente (centimes) → ce qu'on facture au client
 *  - Marge €/€/% (auto)
 *  - Toggle activé/désactivé
 *  - Notes admin
 *
 * Réservé aux SuperAdmins. Les changements sont reflétés en temps réel
 * sur la page tarifs publique côté client.
 */

import { useEffect, useState } from "react";
import {
  api,
  type AdminSignaturePricing,
} from "@/lib/api-client";
import { ApiErrorAlert } from "@/lib/ui/api-error-alert";
import { ResponsiveShell } from "@/lib/ui/responsive-shell";

type Level = "SIMPLE" | "ADVANCED" | "NOTARIZED";

const LEVELS: Level[] = ["SIMPLE", "ADVANCED", "NOTARIZED"];

// Quelques pays clés BMD pour le dropdown de création (+ "*" pour défaut)
const COMMON_COUNTRIES = [
  { code: "*", name: "Tous (défaut global)" },
  { code: "FR", name: "France" },
  { code: "LU", name: "Luxembourg" },
  { code: "BE", name: "Belgique" },
  { code: "CH", name: "Suisse" },
  { code: "DE", name: "Allemagne" },
  { code: "ES", name: "Espagne" },
  { code: "IT", name: "Italie" },
  { code: "PT", name: "Portugal" },
  { code: "GB", name: "Royaume-Uni" },
  { code: "US", name: "États-Unis" },
  { code: "CA", name: "Canada" },
  { code: "CI", name: "Côte d'Ivoire" },
  { code: "CM", name: "Cameroun" },
  { code: "SN", name: "Sénégal" },
  { code: "ML", name: "Mali" },
  { code: "BJ", name: "Bénin" },
  { code: "BF", name: "Burkina Faso" },
  { code: "TG", name: "Togo" },
  { code: "CD", name: "RDC" },
  { code: "GA", name: "Gabon" },
  { code: "CG", name: "Congo" },
  { code: "MA", name: "Maroc" },
  { code: "DZ", name: "Algérie" },
  { code: "TN", name: "Tunisie" },
];

const YOUSIGN_LEVELS = [
  { value: "electronic_signature", label: "SES — Simple" },
  { value: "advanced_electronic_signature", label: "AES — Avancée" },
  {
    value: "advanced_electronic_signature_with_qualified_certificate",
    label: "AES+ — Avancée certificat qualifié",
  },
  { value: "qualified_electronic_signature", label: "QES — Qualifiée" },
];

export default function SignaturePricingAdminPage(): JSX.Element {
  const [pricings, setPricings] = useState<AdminSignaturePricing[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showAddSheet, setShowAddSheet] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const r = await api.adminListSignaturePricings();
      setPricings(r.pricings);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleToggle(p: AdminSignaturePricing) {
    setSavingId(p.id);
    setError(null);
    try {
      await api.adminSetSignaturePricingEnabled(p.id, !p.enabled);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  async function handleSaveRow(p: AdminSignaturePricing) {
    setSavingId(p.id);
    setError(null);
    try {
      await api.adminUpsertSignaturePricing({
        level: p.level,
        countryCode: p.countryCode,
        enabled: p.enabled,
        costCents: p.costCents,
        priceCents: p.priceCents,
        currency: p.currency,
        yousignLevel: p.yousignLevel,
        notes: p.notes,
      });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(p: AdminSignaturePricing) {
    if (
      !window.confirm(
        `Supprimer la tarification ${p.level} pour ${p.countryCode} ?`,
      )
    )
      return;
    setSavingId(p.id);
    setError(null);
    try {
      await api.adminDeleteSignaturePricing(p.id);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  // Group par pays pour une lecture facile
  const byCountry = new Map<string, AdminSignaturePricing[]>();
  for (const p of pricings) {
    const arr = byCountry.get(p.countryCode) ?? [];
    arr.push(p);
    byCountry.set(p.countryCode, arr);
  }
  const sortedCountries = Array.from(byCountry.keys()).sort((a, b) => {
    if (a === "*") return -1;
    if (b === "*") return 1;
    return a.localeCompare(b);
  });

  return (
    <ResponsiveShell
      breadcrumb="Admin · Tarifs signatures"
      desktopTitle="Tarification signatures électroniques"
      mobileTitle="Tarifs signatures"
      back={{ href: "/admin" }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 12px" }}>
        <div
          style={{
            background:
              "linear-gradient(135deg, rgba(197,138,46,0.08), rgba(31,122,87,0.06))",
            border: "1px solid rgba(197,138,46,0.25)",
            borderRadius: 14,
            padding: 18,
            marginBottom: 18,
          }}
        >
          <div
            style={{
              fontSize: 11,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: "#854F0B",
              fontWeight: 700,
              marginBottom: 4,
            }}
          >
            Signature électronique eIDAS
          </div>
          <div
            style={{
              fontSize: 15,
              color: "#2B1F15",
              lineHeight: 1.5,
              marginBottom: 8,
            }}
          >
            Configure les 3 niveaux <strong>SIMPLE</strong>,{" "}
            <strong>ADVANCED</strong>, <strong>NOTARIZED</strong> par pays. La
            ligne <code>*</code> sert de défaut quand aucun tarif spécifique
            n'existe pour le pays de l'utilisateur. Les niveaux désactivés
            disparaissent de la page tarifs publique.
          </div>
          <div style={{ fontSize: 12, color: "#6B5A47" }}>
            Astuce : modifie le coût Yousign si leur tarification évolue, la
            marge se recalcule auto.
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
          <button
            type="button"
            onClick={() => setShowAddSheet(true)}
            style={{
              padding: "10px 16px",
              fontSize: 13,
              fontWeight: 700,
              borderRadius: 999,
              border: "none",
              background: "linear-gradient(135deg, #1F7A57, #0F6E56)",
              color: "#FBF6EC",
              cursor: "pointer",
            }}
          >
            + Ajouter une règle
          </button>
        </div>

        {error && (
          <div style={{ marginBottom: 14 }}>
            <ApiErrorAlert error={error} onClose={() => setError(null)} />
          </div>
        )}

        {loading && pricings.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: "#6B5A47" }}>
            Chargement…
          </div>
        )}

        {sortedCountries.map((cc) => {
          const rows = byCountry.get(cc)!;
          const country = COMMON_COUNTRIES.find((c) => c.code === cc);
          return (
            <div
              key={cc}
              style={{
                marginBottom: 20,
                background: "#FFFFFF",
                border: "1px solid rgba(43,31,21,0.12)",
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "12px 16px",
                  background:
                    cc === "*"
                      ? "rgba(197,138,46,0.10)"
                      : "rgba(43,31,21,0.04)",
                  borderBottom: "1px solid rgba(43,31,21,0.08)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#2B1F15",
                    letterSpacing: 0.3,
                  }}
                >
                  {cc === "*" ? "🌍 Défaut global (toutes locations)" : `📍 ${country?.name ?? cc} (${cc})`}
                </div>
                <div style={{ fontSize: 11, color: "#6B5A47" }}>
                  {rows.length} niveau{rows.length > 1 ? "x" : ""}
                </div>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "rgba(43,31,21,0.02)" }}>
                    <Th>Niveau</Th>
                    <Th align="right">Coût BMD</Th>
                    <Th align="right">Prix vente</Th>
                    <Th align="right">Marge €</Th>
                    <Th align="right">Marge %</Th>
                    <Th align="center">Activé</Th>
                    <Th align="right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {LEVELS.map((level) => {
                    const row = rows.find((r) => r.level === level);
                    return (
                      <PricingRow
                        key={`${cc}-${level}`}
                        level={level}
                        row={row}
                        countryCode={cc}
                        saving={row ? savingId === row.id : false}
                        onToggle={handleToggle}
                        onSave={handleSaveRow}
                        onDelete={handleDelete}
                        onCreate={async (input) => {
                          setSavingId("new");
                          try {
                            await api.adminUpsertSignaturePricing(input);
                            await refresh();
                          } catch (e) {
                            setError((e as Error).message);
                          } finally {
                            setSavingId(null);
                          }
                        }}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}

        {showAddSheet && (
          <AddCountrySheet
            onClose={() => setShowAddSheet(false)}
            onPicked={async (countryCode) => {
              // Crée 3 lignes par défaut (SIMPLE, ADVANCED, NOTARIZED) sur ce pays
              setShowAddSheet(false);
              const defaults: Array<{
                level: Level;
                cost: number;
                price: number;
                yousign: string;
              }> = [
                {
                  level: "SIMPLE",
                  cost: 100,
                  price: 250,
                  yousign: "electronic_signature",
                },
                {
                  level: "ADVANCED",
                  cost: 300,
                  price: 750,
                  yousign: "advanced_electronic_signature",
                },
                {
                  level: "NOTARIZED",
                  cost: 1500,
                  price: 3900,
                  yousign: "qualified_electronic_signature",
                },
              ];
              for (const d of defaults) {
                try {
                  await api.adminUpsertSignaturePricing({
                    level: d.level,
                    countryCode,
                    enabled: true,
                    costCents: d.cost,
                    priceCents: d.price,
                    yousignLevel: d.yousign,
                  });
                } catch (e) {
                  setError((e as Error).message);
                  break;
                }
              }
              await refresh();
            }}
            existingCountries={sortedCountries}
          />
        )}
      </div>
    </ResponsiveShell>
  );
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
}): JSX.Element {
  return (
    <th
      style={{
        padding: "10px 14px",
        textAlign: align ?? "left",
        fontSize: 10,
        letterSpacing: 1,
        textTransform: "uppercase",
        color: "#6B5A47",
        fontWeight: 700,
        borderBottom: "1px solid rgba(43,31,21,0.08)",
      }}
    >
      {children}
    </th>
  );
}

function PricingRow({
  level,
  row,
  countryCode,
  saving,
  onToggle,
  onSave,
  onDelete,
  onCreate,
}: {
  level: Level;
  row: AdminSignaturePricing | undefined;
  countryCode: string;
  saving: boolean;
  onToggle: (p: AdminSignaturePricing) => void;
  onSave: (p: AdminSignaturePricing) => void;
  onDelete: (p: AdminSignaturePricing) => void;
  onCreate: (input: {
    level: Level;
    countryCode: string;
    costCents: number;
    priceCents: number;
    enabled: boolean;
  }) => void;
}): JSX.Element {
  const [cost, setCost] = useState(row ? row.costCents / 100 : 0);
  const [price, setPrice] = useState(row ? row.priceCents / 100 : 0);

  useEffect(() => {
    if (row) {
      setCost(row.costCents / 100);
      setPrice(row.priceCents / 100);
    }
  }, [row?.costCents, row?.priceCents]);

  if (!row) {
    // Ligne d'ajout rapide (créer ce niveau pour ce pays)
    return (
      <tr>
        <Td>
          <LevelBadge level={level} />
        </Td>
        <Td colSpan={5} align="center">
          <span
            style={{
              color: "#6B5A47",
              fontSize: 12,
              fontStyle: "italic",
            }}
          >
            Pas configuré pour ce pays · fallback sur défaut global
          </span>
        </Td>
        <Td align="right">
          <button
            type="button"
            onClick={() => {
              const defaults: Record<
                Level,
                { cost: number; price: number }
              > = {
                SIMPLE: { cost: 100, price: 250 },
                ADVANCED: { cost: 300, price: 750 },
                NOTARIZED: { cost: 1500, price: 3900 },
              };
              const d = defaults[level];
              onCreate({
                level,
                countryCode,
                costCents: d.cost,
                priceCents: d.price,
                enabled: true,
              });
            }}
            style={{
              padding: "5px 10px",
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 8,
              border: "1px solid rgba(31,122,87,0.4)",
              background: "rgba(31,122,87,0.08)",
              color: "#0F6E56",
              cursor: "pointer",
            }}
          >
            + Créer
          </button>
        </Td>
      </tr>
    );
  }

  const costCents = Math.round(cost * 100);
  const priceCents = Math.round(price * 100);
  const margin = priceCents - costCents;
  const marginPct = priceCents > 0 ? Math.round((margin / priceCents) * 100) : 0;
  const dirty = costCents !== row.costCents || priceCents !== row.priceCents;

  return (
    <tr style={{ opacity: row.enabled ? 1 : 0.55 }}>
      <Td>
        <LevelBadge level={row.level} />
      </Td>
      <Td align="right">
        <input
          type="number"
          step={0.01}
          min={0}
          value={cost}
          onChange={(e) => setCost(parseFloat(e.target.value) || 0)}
          className="bmd-num"
          style={inputStyle}
        />
        <span style={{ marginLeft: 4, color: "#6B5A47", fontSize: 11 }}>
          {row.currency === "EUR" ? "€" : row.currency}
        </span>
      </Td>
      <Td align="right">
        <input
          type="number"
          step={0.01}
          min={0}
          value={price}
          onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
          className="bmd-num"
          style={inputStyle}
        />
        <span style={{ marginLeft: 4, color: "#6B5A47", fontSize: 11 }}>
          {row.currency === "EUR" ? "€" : row.currency}
        </span>
      </Td>
      <Td align="right">
        <span
          className="bmd-num"
          style={{
            fontWeight: 600,
            color: margin >= 0 ? "#0F6E56" : "#9F4628",
          }}
        >
          {(margin / 100).toFixed(2)}
        </span>
      </Td>
      <Td align="right">
        <span
          className="bmd-num"
          style={{
            padding: "2px 8px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 700,
            background:
              marginPct >= 50
                ? "rgba(31,122,87,0.18)"
                : marginPct >= 25
                  ? "rgba(197,138,46,0.18)"
                  : "rgba(159,70,40,0.18)",
            color:
              marginPct >= 50
                ? "#0F6E56"
                : marginPct >= 25
                  ? "#854F0B"
                  : "#9F4628",
          }}
        >
          {marginPct}%
        </span>
      </Td>
      <Td align="center">
        <button
          type="button"
          onClick={() => onToggle(row)}
          disabled={saving}
          aria-label={row.enabled ? "Désactiver" : "Activer"}
          style={{
            width: 40,
            height: 22,
            borderRadius: 999,
            border: "none",
            background: row.enabled ? "#1F7A57" : "rgba(43,31,21,0.2)",
            position: "relative",
            cursor: saving ? "not-allowed" : "pointer",
            transition: "background 0.2s",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 2,
              left: row.enabled ? 20 : 2,
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: "#FBF6EC",
              transition: "left 0.2s",
            }}
          />
        </button>
      </Td>
      <Td align="right">
        <div style={{ display: "inline-flex", gap: 6 }}>
          {dirty && (
            <button
              type="button"
              onClick={() =>
                onSave({
                  ...row,
                  costCents,
                  priceCents,
                })
              }
              disabled={saving}
              style={{
                padding: "5px 10px",
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 8,
                border: "none",
                background: "linear-gradient(135deg, #C58A2E, #854F0B)",
                color: "#FBF6EC",
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              Enregistrer
            </button>
          )}
          <button
            type="button"
            onClick={() => onDelete(row)}
            disabled={saving}
            aria-label="Supprimer"
            style={{
              padding: "5px 8px",
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 8,
              border: "1px solid rgba(159,70,40,0.3)",
              background: "transparent",
              color: "#9F4628",
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            🗑
          </button>
        </div>
      </Td>
    </tr>
  );
}

function Td({
  children,
  align,
  colSpan,
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  colSpan?: number;
}): JSX.Element {
  return (
    <td
      colSpan={colSpan}
      style={{
        padding: "10px 14px",
        fontSize: 13,
        color: "#2B1F15",
        textAlign: align ?? "left",
        borderBottom: "0.5px solid rgba(43,31,21,0.06)",
      }}
    >
      {children}
    </td>
  );
}

function LevelBadge({ level }: { level: Level }): JSX.Element {
  const map: Record<Level, { label: string; bg: string; color: string }> = {
    SIMPLE: {
      label: "SIMPLE · SES",
      bg: "rgba(43,31,21,0.10)",
      color: "#2B1F15",
    },
    ADVANCED: {
      label: "ADVANCED · AES",
      bg: "rgba(197,138,46,0.18)",
      color: "#854F0B",
    },
    NOTARIZED: {
      label: "NOTARIZED · QES",
      bg: "rgba(31,122,87,0.18)",
      color: "#0F6E56",
    },
  };
  const c = map[level];
  return (
    <span
      style={{
        padding: "3px 10px",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.5,
        borderRadius: 999,
        background: c.bg,
        color: c.color,
        textTransform: "uppercase",
      }}
    >
      {c.label}
    </span>
  );
}

function AddCountrySheet({
  onClose,
  onPicked,
  existingCountries,
}: {
  onClose: () => void;
  onPicked: (countryCode: string) => void;
  existingCountries: string[];
}): JSX.Element {
  const [picked, setPicked] = useState("");
  const [custom, setCustom] = useState("");
  const available = COMMON_COUNTRIES.filter(
    (c) => !existingCountries.includes(c.code),
  );
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(43,31,21,0.55)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#FBF6EC",
          borderRadius: 16,
          padding: 24,
          maxWidth: 480,
          width: "92%",
        }}
      >
        <h3
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "#2B1F15",
            margin: "0 0 12px",
          }}
        >
          Ajouter un pays
        </h3>
        <p
          style={{
            fontSize: 12,
            color: "#6B5A47",
            margin: "0 0 16px",
            lineHeight: 1.5,
          }}
        >
          Choisis un pays — les 3 niveaux SIMPLE/ADVANCED/NOTARIZED seront
          créés avec les tarifs par défaut, que tu pourras ensuite ajuster
          ligne par ligne.
        </p>
        <select
          value={picked}
          onChange={(e) => setPicked(e.target.value)}
          style={{
            width: "100%",
            padding: "10px 12px",
            fontSize: 14,
            border: "1px solid rgba(43,31,21,0.18)",
            borderRadius: 10,
            background: "#FFFFFF",
            color: "#2B1F15",
            marginBottom: 12,
          }}
        >
          <option value="">Sélectionner…</option>
          {available.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name} ({c.code})
            </option>
          ))}
        </select>
        <div
          style={{
            fontSize: 11,
            color: "#6B5A47",
            margin: "8px 0",
            textAlign: "center",
          }}
        >
          OU code ISO custom
        </div>
        <input
          type="text"
          maxLength={2}
          value={custom}
          onChange={(e) => setCustom(e.target.value.toUpperCase())}
          placeholder="Ex: JP, KE…"
          style={{
            width: "100%",
            padding: "10px 12px",
            fontSize: 14,
            textTransform: "uppercase",
            border: "1px solid rgba(43,31,21,0.18)",
            borderRadius: 10,
            background: "#FFFFFF",
            color: "#2B1F15",
            marginBottom: 16,
          }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              padding: "10px",
              borderRadius: 10,
              border: "1px solid rgba(43,31,21,0.2)",
              background: "transparent",
              color: "#2B1F15",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => {
              const code = (custom || picked).trim().toUpperCase();
              if (!code) return;
              if (existingCountries.includes(code)) {
                window.alert("Ce pays existe déjà");
                return;
              }
              onPicked(code);
            }}
            disabled={!picked && !custom}
            style={{
              flex: 1,
              padding: "10px",
              borderRadius: 10,
              border: "none",
              background:
                !picked && !custom
                  ? "rgba(31,122,87,0.35)"
                  : "linear-gradient(135deg, #1F7A57, #0F6E56)",
              color: "#FBF6EC",
              fontSize: 13,
              fontWeight: 700,
              cursor: !picked && !custom ? "not-allowed" : "pointer",
            }}
          >
            Créer les 3 niveaux
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: 80,
  padding: "5px 8px",
  fontSize: 13,
  border: "1px solid rgba(43,31,21,0.18)",
  borderRadius: 6,
  background: "#FFFFFF",
  color: "#2B1F15",
  textAlign: "right",
};
