"use client";

/**
 * V155.E — Modal de confirmation track record avant création RDD.
 *
 * S'affiche au clic "Créer la reconnaissance". Deux modes :
 *
 *  1. Débiteur trouvé en base BMD → affiche son verdict (EXCELLENT/GOOD/
 *     AVERAGE/AT_RISK), stats agrégées anonymisées (nombre de RDD passées,
 *     % échéances payées à temps, ancienneté), et une recommandation
 *     textuelle. Le prêteur valide explicitement avant création.
 *
 *  2. Débiteur PAS trouvé en base → modal léger "Ce contact n'a pas encore
 *     d'historique BMD" + confirmation simple.
 *
 * Privacy : aucun nom de créancier ni montant individuel n'est révélé.
 * Le prêteur voit uniquement des compteurs et un score agrégé.
 */

import { useEffect } from "react";

export type LookupResult =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "found";
      userId: string;
      displayName: string;
      avatar: string | null;
      memberSince: string;
    }
  | { status: "not_found"; reason?: string };

export interface TrackRecord {
  userId: string;
  memberSince: string;
  memberSinceMonths: number;
  verdict: "NEW" | "EXCELLENT" | "GOOD" | "AVERAGE" | "AT_RISK";
  stats: {
    totalDebts: number;
    completedDebts: number;
    activeDebts: number;
    lateDebts: number;
    disputedDebts: number;
    totalSchedules: number;
    paidOnTime: number;
    paidLate: number;
    missed: number;
    onTimeRate: number | null;
  };
}

interface Props {
  lookup: LookupResult;
  trackRecord: TrackRecord | null;
  debtorName: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirming: boolean;
  t: (k: string) => string;
}

const VERDICT_THEME: Record<
  TrackRecord["verdict"],
  { color: string; bg: string; icon: string; label: string; reco: string }
> = {
  EXCELLENT: {
    color: "#0F6E56",
    bg: "#D1FAE5",
    icon: "★",
    label: "Excellent",
    reco:
      "Débiteur très fiable. Toutes ses échéances passées ont été payées dans les délais.",
  },
  GOOD: {
    color: "#1F7A57",
    bg: "#DCFCE7",
    icon: "✓",
    label: "Bon",
    reco:
      "Débiteur globalement fiable. Quelques retards ponctuels mais aucun défaut majeur.",
  },
  AVERAGE: {
    color: "#854F0B",
    bg: "#FEF3C7",
    icon: "≈",
    label: "Moyen",
    reco:
      "Débiteur en cours d'apprentissage. Track record encore limité — prudence recommandée.",
  },
  AT_RISK: {
    color: "#9F4628",
    bg: "#FEE2E2",
    icon: "⚠",
    label: "À risque",
    reco:
      "Débiteur a déjà eu des échéances manquées ou un litige. Prête en connaissance de cause.",
  },
  NEW: {
    color: "#6B5A47",
    bg: "#F4ECD8",
    icon: "○",
    label: "Nouveau",
    reco:
      "Membre BMD sans historique de reconnaissance de dette. Pas d'antécédent positif ni négatif.",
  },
};

export function DebtorTrackRecordModal({
  lookup,
  trackRecord,
  debtorName,
  onCancel,
  onConfirm,
  confirming,
  t,
}: Props): JSX.Element {
  // Esc pour fermer
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !confirming) onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel, confirming]);

  const isInBmd = lookup.status === "found";
  const verdict = trackRecord?.verdict ?? "NEW";
  const theme = VERDICT_THEME[verdict];

  return (
    <div
      onClick={() => !confirming && onCancel()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(43,31,21,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 20,
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#FFFFFF",
          borderRadius: 18,
          maxWidth: 520,
          width: "100%",
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 20px 60px rgba(43,31,21,0.30)",
          border: "1px solid rgba(43,31,21,0.10)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px 16px",
            borderBottom: "1px solid rgba(43,31,21,0.08)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: "#854F0B",
              fontWeight: 700,
              marginBottom: 4,
            }}
          >
            {isInBmd
              ? t("debts.create.confirm.eyebrowKnown") ||
                "Avant de créer la RDD"
              : t("debts.create.confirm.eyebrowNew") ||
                "Confirmation création"}
          </div>
          <h2
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 700,
              color: "#2B1F15",
              fontFamily: "Cormorant Garamond, serif",
            }}
          >
            {isInBmd
              ? `${t("debts.create.confirm.titleKnown") || "Track record de"} ${debtorName}`
              : t("debts.create.confirm.titleNew") || "Vérifier les infos"}
          </h2>
        </div>

        {/* Body */}
        <div style={{ padding: 24 }}>
          {isInBmd && trackRecord ? (
            <>
              {/* Verdict card */}
              <div
                style={{
                  padding: "16px 18px",
                  background: theme.bg,
                  borderRadius: 14,
                  display: "flex",
                  gap: 14,
                  alignItems: "center",
                  marginBottom: 18,
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    minWidth: 48,
                    borderRadius: 24,
                    background: theme.color,
                    color: "#FFFFFF",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 24,
                    fontWeight: 700,
                  }}
                >
                  {theme.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 10,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      color: theme.color,
                      fontWeight: 700,
                      opacity: 0.85,
                    }}
                  >
                    {t("debts.create.confirm.verdictLabel") || "Verdict BMD"}
                  </div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      color: theme.color,
                      lineHeight: 1.1,
                      fontFamily: "Cormorant Garamond, serif",
                    }}
                  >
                    {t(`debts.create.confirm.verdict.${verdict}`) ?? theme.label}
                  </div>
                </div>
              </div>

              {/* Recommandation */}
              <div
                style={{
                  padding: 14,
                  background: "#FBF6EC",
                  borderRadius: 10,
                  fontSize: 13,
                  color: "#2B1F15",
                  lineHeight: 1.5,
                  marginBottom: 18,
                }}
              >
                {t(`debts.create.confirm.reco.${verdict}`) || theme.reco}
              </div>

              {/* Stats grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 10,
                  marginBottom: 18,
                }}
              >
                <StatCell
                  label={t("debts.create.confirm.statTotal") || "RDD totales"}
                  value={trackRecord.stats.totalDebts}
                  color="#2B1F15"
                />
                <StatCell
                  label={
                    t("debts.create.confirm.statCompleted") || "Soldées"
                  }
                  value={trackRecord.stats.completedDebts}
                  color="#0F6E56"
                />
                <StatCell
                  label={t("debts.create.confirm.statActive") || "En cours"}
                  value={trackRecord.stats.activeDebts}
                  color="#1F7A57"
                />
                <StatCell
                  label={t("debts.create.confirm.statLate") || "En retard"}
                  value={trackRecord.stats.lateDebts}
                  color={trackRecord.stats.lateDebts > 0 ? "#9F4628" : "#6B5A47"}
                />
                <StatCell
                  label={
                    t("debts.create.confirm.statDisputed") || "En litige"
                  }
                  value={trackRecord.stats.disputedDebts}
                  color={
                    trackRecord.stats.disputedDebts > 0 ? "#9F4628" : "#6B5A47"
                  }
                />
                <StatCell
                  label={
                    t("debts.create.confirm.statOnTime") || "% à temps"
                  }
                  value={
                    trackRecord.stats.onTimeRate != null
                      ? `${trackRecord.stats.onTimeRate}%`
                      : "—"
                  }
                  color={
                    (trackRecord.stats.onTimeRate ?? 0) >= 90
                      ? "#0F6E56"
                      : (trackRecord.stats.onTimeRate ?? 0) >= 70
                        ? "#854F0B"
                        : "#9F4628"
                  }
                />
              </div>

              {/* Ancienneté */}
              <div
                style={{
                  padding: "8px 12px",
                  background: "rgba(43,31,21,0.04)",
                  borderRadius: 8,
                  fontSize: 11,
                  color: "#6B5A47",
                  textAlign: "center",
                }}
              >
                {t("debts.create.confirm.memberSince") || "Membre BMD depuis"}{" "}
                <strong className="bmd-num" style={{ color: "#2B1F15" }}>
                  {trackRecord.memberSinceMonths}
                </strong>{" "}
                {trackRecord.memberSinceMonths > 1
                  ? t("debts.create.confirm.months") || "mois"
                  : t("debts.create.confirm.month") || "mois"}
              </div>
            </>
          ) : (
            // ────── PAS trouvé en BMD ──────
            <>
              <div
                style={{
                  padding: "16px 18px",
                  background: "#F4ECD8",
                  borderRadius: 14,
                  display: "flex",
                  gap: 14,
                  alignItems: "center",
                  marginBottom: 18,
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    minWidth: 48,
                    borderRadius: 24,
                    background: "#854F0B",
                    color: "#FBF6EC",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 24,
                  }}
                >
                  ?
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 10,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      color: "#854F0B",
                      fontWeight: 700,
                      opacity: 0.85,
                    }}
                  >
                    {t("debts.create.confirm.statusNoHistoryLabel") ||
                      "Statut BMD"}
                  </div>
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      color: "#2B1F15",
                      lineHeight: 1.2,
                      fontFamily: "Cormorant Garamond, serif",
                    }}
                  >
                    {t("debts.create.confirm.statusNoHistory") ||
                      "Pas encore d'historique"}
                  </div>
                </div>
              </div>
              <div
                style={{
                  padding: 14,
                  background: "#FBF6EC",
                  borderRadius: 10,
                  fontSize: 13,
                  color: "#2B1F15",
                  lineHeight: 1.5,
                }}
              >
                {t("debts.create.confirm.noHistoryReco") ||
                  "Ce client n'a pas encore d'historique de reconnaissance de dette sur BMD. Tu peux quand même créer la RDD, mais pèse les risques sans antécédent."}
              </div>
            </>
          )}
        </div>

        {/* Footer actions */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid rgba(43,31,21,0.08)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            background: "#FBF6EC",
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            style={{
              padding: "10px 20px",
              fontSize: 13,
              fontWeight: 600,
              border: "1px solid rgba(43,31,21,0.20)",
              borderRadius: 10,
              background: "transparent",
              color: "#2B1F15",
              cursor: confirming ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {t("debts.create.confirm.cancel") || "Annuler"}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            style={{
              padding: "10px 24px",
              fontSize: 13,
              fontWeight: 600,
              border: "none",
              borderRadius: 10,
              background: confirming
                ? "rgba(43,31,21,0.25)"
                : "linear-gradient(135deg, #C58A2E, #854F0B)",
              color: "#FBF6EC",
              cursor: confirming ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              boxShadow: confirming
                ? "none"
                : "0 4px 12px rgba(133,79,11,0.25)",
            }}
          >
            {confirming
              ? t("debts.create.confirm.creating") || "Création…"
              : t("debts.create.confirm.proceed") || "Créer la reconnaissance"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCell({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <div
      style={{
        padding: "10px 12px",
        background: "#FBF6EC",
        border: "1px solid rgba(43,31,21,0.08)",
        borderRadius: 10,
        textAlign: "center",
      }}
    >
      <div
        className="bmd-num"
        style={{
          fontSize: 18,
          fontWeight: 700,
          color,
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 10,
          color: "#6B5A47",
          marginTop: 3,
          letterSpacing: 0.3,
        }}
      >
        {label}
      </div>
    </div>
  );
}
