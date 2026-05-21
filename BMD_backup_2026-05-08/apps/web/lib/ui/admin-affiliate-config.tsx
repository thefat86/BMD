"use client";

/**
 * <AdminAffiliateConfig> · Configuration du programme de parrainage et
 * du programme commercial (spec §6.9).
 *
 * Onglet "Tarifs" de l'admin. Permet de modifier en live :
 *  - Politique de downgrade (graceDays, warnDays, enabled, notifyBeforeDays)
 *  - Programme commercial multi-niveaux (% L1/L2/L3, durées, holdDays,
 *    plafonds, paliers de bonus)
 *
 * Tout est appliqué immédiatement (cache 60s côté serveur). Pas de
 * redéploiement.
 */
import { useEffect, useState } from "react";
import { api } from "../api-client";
import { useToast } from "./toast";

interface DowngradePolicy {
  graceDays: number;
  warnDays: number;
  enabled: boolean;
  notifyBeforeDays: number[];
}

interface AffiliateProgram {
  enabled: boolean;
  l1Percent: number;
  l1DurationMonths: number;
  l2Percent: number;
  l2DurationMonths: number;
  l3Percent: number;
  l3DurationMonths: number;
  holdDays: number;
  minPayoutCents: number;
  maxL1ReferralsPerMonth: number;
  milestoneBonuses: Array<{
    count: number;
    bonusCents: number;
    badge?: string;
    monthsPremium?: number;
  }>;
}

export function AdminAffiliateConfig(): JSX.Element {
  const toast = useToast();
  const [downgrade, setDowngrade] = useState<DowngradePolicy | null>(null);
  const [program, setProgram] = useState<AffiliateProgram | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingDowngrade, setSavingDowngrade] = useState(false);
  const [savingProgram, setSavingProgram] = useState(false);

  async function load() {
    try {
      const [d, p] = await Promise.all([
        api.adminGetDowngradePolicy(),
        api.adminGetAffiliateProgram(),
      ]);
      setDowngrade(d);
      setProgram(p);
      setLoading(false);
    } catch (e) {
      toast.error(e);
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function saveDowngrade() {
    if (!downgrade) return;
    setSavingDowngrade(true);
    try {
      await api.adminUpdateDowngradePolicy(downgrade);
      toast.success("Politique d'expiration mise à jour");
    } catch (e) {
      toast.error(e);
    } finally {
      setSavingDowngrade(false);
    }
  }

  async function saveProgram() {
    if (!program) return;
    setSavingProgram(true);
    try {
      await api.adminUpdateAffiliateProgram(program);
      toast.success("Programme commercial mis à jour");
    } catch (e) {
      toast.error(e);
    } finally {
      setSavingProgram(false);
    }
  }

  if (loading || !downgrade || !program) {
    return (
      <div style={{ padding: 30, textAlign: "center", color: "var(--cream-soft)" }}>
        Chargement…
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* === Politique d'expiration === */}
      <div
        className="card"
        style={{
          background:
            "linear-gradient(135deg, rgba(217,113,74,0.06), rgba(232,163,61,0.04))",
          border: "1px solid var(--line)",
        }}
      >
        <div className="card-head">
          <h2>⏰ Politique d'expiration des abonnements</h2>
        </div>
        <p
          style={{
            fontSize: 12,
            color: "var(--cream-soft)",
            lineHeight: 1.55,
            marginBottom: 14,
          }}
        >
          Quand un abonnement Premium expire, l'utilisateur passe par 3 phases
          configurables ci-dessous : <strong>grâce</strong> (Premium maintenu) →{" "}
          <strong>warning</strong> (Premium maintenu mais bandeau) →{" "}
          <strong>downgrade</strong> (groupes au-delà du quota FREE en lecture
          seule).
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          <NumField
            label="Jours de grâce"
            help="Premium maintenu après expiration"
            value={downgrade.graceDays}
            onChange={(v) =>
              setDowngrade({ ...downgrade, graceDays: v })
            }
          />
          <NumField
            label="Jours de warning"
            help="Bandeau d'alerte avant downgrade"
            value={downgrade.warnDays}
            onChange={(v) => setDowngrade({ ...downgrade, warnDays: v })}
          />
          <ToggleField
            label="Activer le downgrade"
            help="Si désactivé : restera Premium indéfiniment"
            value={downgrade.enabled}
            onChange={(v) => setDowngrade({ ...downgrade, enabled: v })}
          />
          <TextField
            label="Notif avant expiration (jours)"
            help='Liste de jours, ex: "7,3,1"'
            value={downgrade.notifyBeforeDays.join(",")}
            onChange={(v) =>
              setDowngrade({
                ...downgrade,
                notifyBeforeDays: v
                  .split(",")
                  .map((s) => parseInt(s.trim(), 10))
                  .filter((n) => !isNaN(n)),
              })
            }
          />
        </div>

        <button
          type="button"
          onClick={saveDowngrade}
          disabled={savingDowngrade}
          className="btn btn-sm"
          style={{ marginTop: 14, padding: "8px 18px", fontSize: 12 }}
        >
          {savingDowngrade ? "Enregistrement…" : "💾 Enregistrer la politique"}
        </button>
      </div>

      {/* === Programme commercial === */}
      <div
        className="card"
        style={{
          background:
            "linear-gradient(135deg, rgba(91,108,255,0.06), rgba(232,163,61,0.04))",
          border: "1px solid var(--line)",
        }}
      >
        <div className="card-head">
          <h2>🤝 Programme commercial (multi-niveaux)</h2>
          <ToggleField
            inline
            label=""
            help=""
            value={program.enabled}
            onChange={(v) => setProgram({ ...program, enabled: v })}
          />
        </div>
        <p
          style={{
            fontSize: 12,
            color: "var(--cream-soft)",
            lineHeight: 1.55,
            marginBottom: 14,
          }}
        >
          Commerciaux promus depuis l'admin. Reçoivent des commissions
          récurrentes sur leurs filleuls (3 niveaux). Les % et durées sont
          appliqués au moment de chaque paiement (snapshot — modif ne change
          pas l'historique). Conversion automatique dans la devise du
          commercial via <code>/fx-rates</code>.
        </p>

        <h3 style={{ fontSize: 13, marginTop: 18, marginBottom: 10 }}>
          Niveaux de commission
        </h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          <LevelEditor
            label="L1 · Filleul direct"
            color="#7DC59E"
            percent={program.l1Percent}
            durationMonths={program.l1DurationMonths}
            onPercent={(v) => setProgram({ ...program, l1Percent: v })}
            onDuration={(v) =>
              setProgram({ ...program, l1DurationMonths: v })
            }
          />
          <LevelEditor
            label="L2 · Filleul de filleul"
            color="#5b6cff"
            percent={program.l2Percent}
            durationMonths={program.l2DurationMonths}
            onPercent={(v) => setProgram({ ...program, l2Percent: v })}
            onDuration={(v) =>
              setProgram({ ...program, l2DurationMonths: v })
            }
          />
          <LevelEditor
            label="L3 · 3e niveau"
            color="#7c6e93"
            percent={program.l3Percent}
            durationMonths={program.l3DurationMonths}
            onPercent={(v) => setProgram({ ...program, l3Percent: v })}
            onDuration={(v) =>
              setProgram({ ...program, l3DurationMonths: v })
            }
          />
        </div>

        <h3 style={{ fontSize: 13, marginTop: 22, marginBottom: 10 }}>
          Anti-fraude & paiement
        </h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          <NumField
            label="Hold (jours)"
            help="Délai anti-chargeback avant payable"
            value={program.holdDays}
            onChange={(v) => setProgram({ ...program, holdDays: v })}
          />
          <NumField
            label="Min payout (centimes EUR)"
            help="Seuil avant déclenchement virement"
            value={program.minPayoutCents}
            onChange={(v) =>
              setProgram({ ...program, minPayoutCents: v })
            }
          />
          <NumField
            label="Max L1 / mois"
            help="Plafond nouveaux filleuls / mois / commercial"
            value={program.maxL1ReferralsPerMonth}
            onChange={(v) =>
              setProgram({ ...program, maxL1ReferralsPerMonth: v })
            }
          />
        </div>

        <h3 style={{ fontSize: 13, marginTop: 22, marginBottom: 10 }}>
          Paliers de bonus (one-shot)
        </h3>
        <p
          style={{
            fontSize: 11,
            color: "var(--muted)",
            marginBottom: 10,
            lineHeight: 1.5,
          }}
        >
          Quand un commercial atteint X filleuls actifs, il reçoit un bonus
          one-shot. Centimes EUR pivot, converti dans sa devise.
        </p>
        <MilestonesEditor
          milestones={program.milestoneBonuses}
          onChange={(m) =>
            setProgram({ ...program, milestoneBonuses: m })
          }
        />

        <button
          type="button"
          onClick={saveProgram}
          disabled={savingProgram}
          className="btn btn-sm"
          style={{ marginTop: 18, padding: "8px 18px", fontSize: 12 }}
        >
          {savingProgram ? "Enregistrement…" : "💾 Enregistrer le programme"}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Helpers UI
// ============================================================
function NumField({
  label,
  help,
  value,
  onChange,
}: {
  label: string;
  help?: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label
        style={{
          display: "block",
          fontSize: 11,
          color: "var(--cream-soft)",
          fontWeight: 600,
          marginBottom: 4,
          textTransform: "uppercase",
          letterSpacing: 1,
        }}
      >
        {label}
      </label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
        style={inputStyle}
      />
      {help && (
        <div
          style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}
        >
          {help}
        </div>
      )}
    </div>
  );
}

function TextField({
  label,
  help,
  value,
  onChange,
}: {
  label: string;
  help?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label
        style={{
          display: "block",
          fontSize: 11,
          color: "var(--cream-soft)",
          fontWeight: 600,
          marginBottom: 4,
          textTransform: "uppercase",
          letterSpacing: 1,
        }}
      >
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      />
      {help && (
        <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
          {help}
        </div>
      )}
    </div>
  );
}

function ToggleField({
  label,
  help,
  value,
  onChange,
  inline,
}: {
  label: string;
  help?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  inline?: boolean;
}) {
  if (inline) {
    return (
      <button
        type="button"
        onClick={() => onChange(!value)}
        style={{
          padding: "6px 14px",
          background: value ? "rgba(125,197,158,0.15)" : "rgba(244,228,193,0.05)",
          color: value ? "#7DC59E" : "var(--muted)",
          border: `1px solid ${value ? "rgba(125,197,158,0.40)" : "rgba(244,228,193,0.10)"}`,
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        {value ? "● ACTIF" : "○ Désactivé"}
      </button>
    );
  }
  return (
    <div>
      <label
        style={{
          display: "block",
          fontSize: 11,
          color: "var(--cream-soft)",
          fontWeight: 600,
          marginBottom: 4,
          textTransform: "uppercase",
          letterSpacing: 1,
        }}
      >
        {label}
      </label>
      <button
        type="button"
        onClick={() => onChange(!value)}
        style={{
          padding: "8px 14px",
          background: value ? "rgba(125,197,158,0.15)" : "rgba(244,228,193,0.05)",
          color: value ? "#7DC59E" : "var(--cream-soft)",
          border: `1px solid ${value ? "rgba(125,197,158,0.40)" : "rgba(244,228,193,0.10)"}`,
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          width: "100%",
          textAlign: "left",
        }}
      >
        {value ? "● Activé" : "○ Désactivé"}
      </button>
      {help && (
        <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
          {help}
        </div>
      )}
    </div>
  );
}

function LevelEditor({
  label,
  color,
  percent,
  durationMonths,
  onPercent,
  onDuration,
}: {
  label: string;
  color: string;
  percent: number;
  durationMonths: number;
  onPercent: (v: number) => void;
  onDuration: (v: number) => void;
}) {
  return (
    <div
      style={{
        background: "rgba(244,228,193,0.03)",
        border: `1px solid ${color}33`,
        borderRadius: 12,
        padding: 14,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color,
          letterSpacing: 1,
          textTransform: "uppercase",
          marginBottom: 10,
        }}
      >
        {label}
      </div>
      <div style={{ marginBottom: 8 }}>
        <label style={miniLabelStyle}>% de commission</label>
        <input
          type="number"
          step="0.5"
          min="0"
          max="100"
          value={percent}
          onChange={(e) => onPercent(parseFloat(e.target.value) || 0)}
          style={inputStyle}
        />
      </div>
      <div>
        <label style={miniLabelStyle}>Durée (mois, -1 = à vie)</label>
        <input
          type="number"
          min="-1"
          max="120"
          value={durationMonths}
          onChange={(e) => onDuration(parseInt(e.target.value, 10) || 0)}
          style={inputStyle}
        />
      </div>
    </div>
  );
}

function MilestonesEditor({
  milestones,
  onChange,
}: {
  milestones: Array<{
    count: number;
    bonusCents: number;
    badge?: string;
    monthsPremium?: number;
  }>;
  onChange: (
    m: Array<{
      count: number;
      bonusCents: number;
      badge?: string;
      monthsPremium?: number;
    }>,
  ) => void;
}) {
  function update(i: number, key: string, v: any) {
    const copy = [...milestones];
    copy[i] = { ...copy[i]!, [key]: v };
    onChange(copy);
  }
  function add() {
    onChange([
      ...milestones,
      { count: 10, bonusCents: 5000, badge: "" },
    ]);
  }
  function remove(i: number) {
    onChange(milestones.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      {milestones.length === 0 && (
        <div
          style={{
            padding: 12,
            background: "rgba(244,228,193,0.03)",
            border: "1px dashed rgba(244,228,193,0.10)",
            borderRadius: 10,
            fontSize: 12,
            color: "var(--muted)",
            textAlign: "center",
            marginBottom: 8,
          }}
        >
          Aucun palier configuré.
        </div>
      )}
      {milestones.map((m, i) => (
        <div
          key={i}
          style={{
            display: "grid",
            gridTemplateColumns: "100px 130px 1fr auto",
            gap: 8,
            alignItems: "center",
            padding: "8px 10px",
            marginBottom: 6,
            background: "rgba(244,228,193,0.03)",
            border: "1px solid rgba(244,228,193,0.06)",
            borderRadius: 8,
          }}
        >
          <input
            type="number"
            value={m.count}
            min="1"
            onChange={(e) =>
              update(i, "count", parseInt(e.target.value, 10) || 1)
            }
            style={{ ...inputStyle, fontSize: 12 }}
            placeholder="Filleuls"
          />
          <input
            type="number"
            value={m.bonusCents}
            min="0"
            step="100"
            onChange={(e) =>
              update(i, "bonusCents", parseInt(e.target.value, 10) || 0)
            }
            style={{ ...inputStyle, fontSize: 12 }}
            placeholder="Bonus (cts EUR)"
          />
          <input
            type="text"
            value={m.badge ?? ""}
            onChange={(e) => update(i, "badge", e.target.value)}
            style={{ ...inputStyle, fontSize: 12 }}
            placeholder="Badge (ex: Apporteur)"
          />
          <button
            type="button"
            onClick={() => remove(i)}
            style={{
              padding: "6px 10px",
              background: "rgba(217,113,74,0.10)",
              color: "#D9714A",
              border: "1px solid rgba(217,113,74,0.30)",
              borderRadius: 6,
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            🗑
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="btn-ghost btn-sm"
        style={{ padding: "6px 12px", fontSize: 11, marginTop: 4 }}
      >
        ＋ Ajouter un palier
      </button>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  fontSize: 13,
  background: "rgba(244,228,193,0.04)",
  border: "1px solid rgba(244,228,193,0.10)",
  borderRadius: 8,
  color: "var(--cream)",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const miniLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 10,
  color: "var(--muted)",
  fontWeight: 600,
  marginBottom: 3,
  textTransform: "uppercase",
  letterSpacing: 1,
};
