"use client";

/**
 * <AdminFunnel /> · Étapes de conversion (signup → plan payant).
 *
 * Affichage : barres horizontales décroissantes, % vs étape précédente
 * et % global. Sélecteur de fenêtre (7j / 30j / 90j / all-time).
 *
 * Le drop-off entre 2 étapes est mis en évidence en rouge si > 50% perdu —
 * c'est typiquement le moment où le funnel "fuit" et où il faut agir.
 */
import { useEffect, useState } from "react";
import { api } from "../api-client";

type Scope = "7" | "30" | "90" | "all";

interface FunnelStep {
  key: string;
  label: string;
  count: number;
  conversionFromPrev: number;
  conversionFromTop: number;
}

const SCOPE_LABELS: Record<Scope, string> = {
  "7": "7 jours",
  "30": "30 jours",
  "90": "90 jours",
  all: "Tout",
};

export function AdminFunnel() {
  const [scope, setScope] = useState<Scope>("30");
  const [steps, setSteps] = useState<FunnelStep[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSteps(null);
    setError(null);
    (async () => {
      try {
        const days = scope === "all" ? undefined : parseInt(scope, 10);
        const r = await api.adminFunnel(days);
        if (!cancelled) setSteps(r.steps);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scope]);

  return (
    <div className="card" data-testid="admin-funnel">
      <div className="card-head" style={{ flexWrap: "wrap", gap: 10 }}>
        <h2>🪜 Funnel de conversion</h2>
        <div style={{ display: "flex", gap: 4 }}>
          {(Object.keys(SCOPE_LABELS) as Scope[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className="btn-ghost btn-sm"
              style={{
                fontSize: 11,
                padding: "4px 10px",
                background:
                  scope === s
                    ? "rgba(232,163,61,0.18)"
                    : "rgba(244,228,193,0.04)",
                borderColor:
                  scope === s
                    ? "var(--saffron)"
                    : "rgba(244,228,193,0.08)",
              }}
            >
              {SCOPE_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="error" role="alert">
          Funnel indisponible : {error}
        </div>
      ) : !steps ? (
        <p style={{ color: "var(--cream-soft)", fontSize: 13 }}>
          Chargement…
        </p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {steps.map((step, i) => (
            <FunnelBar
              key={step.key}
              step={step}
              prevStep={i > 0 ? steps[i - 1] : null}
              isFirst={i === 0}
              isLast={i === steps.length - 1}
              maxCount={steps[0].count || 1}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function FunnelBar({
  step,
  prevStep,
  isFirst,
  isLast,
  maxCount,
}: {
  step: FunnelStep;
  prevStep: FunnelStep | null;
  isFirst: boolean;
  isLast: boolean;
  maxCount: number;
}) {
  const widthPct = (step.count / maxCount) * 100;
  const dropOff = prevStep
    ? Math.max(0, prevStep.count - step.count)
    : 0;
  const dropOffPct = prevStep && prevStep.count > 0
    ? Math.round((dropOff / prevStep.count) * 100)
    : 0;
  const leakWarning = dropOffPct > 50; // perte > 50% = signal d'alarme

  return (
    <li
      style={{
        position: "relative",
      }}
    >
      <div
        style={{
          background: "rgba(244,228,193,0.04)",
          border: "1px solid rgba(244,228,193,0.08)",
          borderRadius: 12,
          padding: "10px 14px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Barre de remplissage en arrière-plan */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(90deg, rgba(232,163,61,0.18) 0%, rgba(232,163,61,0.10) ${widthPct}%, transparent ${widthPct}%)`,
            borderRadius: 12,
          }}
        />
        <div
          style={{
            position: "relative",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontWeight: 700,
                fontSize: 13,
                color: "var(--cream)",
                marginBottom: 2,
              }}
            >
              {iconForStep(step.key)} {step.label}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--cream-soft)",
              }}
            >
              {step.count.toLocaleString("fr-FR")} utilisateur
              {step.count > 1 ? "s" : ""}
              {!isFirst && (
                <>
                  {" · "}
                  <span
                    style={{
                      color: "var(--cream-muted, #aaa)",
                    }}
                  >
                    {step.conversionFromTop}% du top
                  </span>
                </>
              )}
            </div>
          </div>
          <div
            style={{
              fontFamily: "Cormorant Garamond, serif",
              fontSize: 22,
              fontWeight: 800,
              color: isFirst ? "var(--saffron)" : "var(--cream)",
            }}
          >
            {isFirst ? "100%" : `${step.conversionFromPrev}%`}
          </div>
        </div>
      </div>

      {/* Connecteur visuel + drop-off entre les étapes.
          Spec §9.3 — daltonisme-safe : on combine couleur + icône + texte
          (jamais la couleur seule). */}
      {!isLast && (
        <div
          aria-hidden
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: "4px 0",
            fontSize: 10,
            color: leakWarning ? "var(--rose, #ec5e5e)" : "var(--cream-muted, #888)",
            fontWeight: leakWarning ? 700 : 400,
          }}
        >
          ↓ {dropOff > 0 && <>−{dropOff} ({dropOffPct}%)</>}
          {leakWarning && (
            <span
              style={{ marginLeft: 6 }}
              title="Drop-off > 50% : étape à creuser pour comprendre où on perd les users"
            >
              ⚠ fuite
            </span>
          )}
        </div>
      )}
    </li>
  );
}

function iconForStep(key: string): string {
  switch (key) {
    case "signup":
      return "👋";
    case "verified":
      return "✅";
    case "first_group":
      return "🪙";
    case "first_expense":
      return "💸";
    case "paid_plan":
      return "💎";
    default:
      return "•";
  }
}
