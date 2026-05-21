"use client";

/**
 * <TontineCalendar /> · Vue calendrier 6 mois pour une tontine (spec §8.4).
 *
 * Vue large recommandée par la spec pour la version web : voir 6 mois de
 * cycles tontine en un coup d'œil, avec couleur selon le statut de chaque
 * tour (PENDING / IN_PROGRESS / COMPLETED / LATE).
 *
 * Affichage : grille 6 colonnes (1 par mois) × 5 lignes (1 par semaine).
 * Chaque cellule = 1 turn. Au hover : détails (bénéficiaire, montant, date).
 *
 * Sur mobile/tablette, le composant tombe gracieusement sur 2 colonnes
 * (3 mois par ligne) pour rester lisible.
 */

import type { CSSProperties } from "react";

interface TontineTurn {
  id: string;
  index: number;
  /** Date prévue (scheduledDate) ou date d'échéance par défaut (dueDate) */
  scheduledDate: string | null;
  dueDate: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  beneficiary?: {
    id: string;
    displayName: string;
  };
  /** true si la date prévue est passée et le turn pas COMPLETED */
  late?: boolean;
}

interface Tontine {
  id: string;
  contributionAmount: string;
  currency: string;
  turns: TontineTurn[];
}

const STATUS_COLOR: Record<TontineTurn["status"], string> = {
  PENDING: "rgba(244,228,193,0.10)",
  IN_PROGRESS: "var(--saffron, #e8a33d)",
  COMPLETED: "var(--emerald-soft, #66cdaa)",
  CANCELLED: "rgba(232,163,61,0.06)",
};

const STATUS_LABEL: Record<TontineTurn["status"], string> = {
  PENDING: "À venir",
  IN_PROGRESS: "En cours",
  COMPLETED: "Terminé",
  CANCELLED: "Annulé",
};

const STATUS_ICON: Record<TontineTurn["status"], string> = {
  PENDING: "○",
  IN_PROGRESS: "◐",
  COMPLETED: "●",
  CANCELLED: "✕",
};

export function TontineCalendar({ tontine }: { tontine: Tontine }) {
  // Bucket les turns par mois (YYYY-MM)
  const buckets = new Map<string, TontineTurn[]>();
  for (const t of tontine.turns) {
    const date = new Date(t.scheduledDate ?? t.dueDate);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    let arr = buckets.get(key);
    if (!arr) {
      arr = [];
      buckets.set(key, arr);
    }
    arr.push(t);
  }

  // Trie chronologique
  const monthKeys = Array.from(buckets.keys()).sort();
  if (monthKeys.length === 0) return null;

  return (
    <div className="card" data-testid="tontine-calendar">
      <div className="card-head">
        <h2>📅 Calendrier des tours</h2>
        <span style={{ fontSize: 11, color: "var(--cream-muted, #aaa)" }}>
          {tontine.turns.length} tour{tontine.turns.length > 1 ? "s" : ""} ·{" "}
          {tontine.contributionAmount} {tontine.currency} / tour
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
        }}
      >
        {monthKeys.map((key) => {
          const turns = buckets.get(key) ?? [];
          return (
            <MonthColumn
              key={key}
              monthKey={key}
              turns={turns}
              currency={tontine.currency}
              contributionAmount={tontine.contributionAmount}
            />
          );
        })}
      </div>

      {/* Légende */}
      <div
        style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: "1px solid rgba(244,228,193,0.08)",
          display: "flex",
          gap: 14,
          flexWrap: "wrap",
          fontSize: 11,
          color: "var(--cream-soft)",
        }}
        aria-label="Status legend"
      >
        {(Object.keys(STATUS_COLOR) as TontineTurn["status"][]).map((s) => (
          <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span
              aria-hidden
              style={{
                width: 12,
                height: 12,
                borderRadius: 3,
                background: STATUS_COLOR[s],
                border: "1px solid rgba(244,228,193,0.20)",
                display: "inline-block",
              }}
            />
            {STATUS_ICON[s]} {STATUS_LABEL[s]}
          </span>
        ))}
      </div>
    </div>
  );
}

function MonthColumn({
  monthKey,
  turns,
  currency,
  contributionAmount,
}: {
  monthKey: string;
  turns: TontineTurn[];
  currency: string;
  contributionAmount: string;
}) {
  const [year, month] = monthKey.split("-");
  const monthDate = new Date(`${year}-${month}-01`);
  const monthLabel = monthDate.toLocaleDateString("fr-FR", {
    month: "short",
    year: "2-digit",
  });

  return (
    <div
      style={{
        background: "rgba(244,228,193,0.04)",
        border: "1px solid rgba(244,228,193,0.10)",
        borderRadius: 14,
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "var(--saffron, #e8a33d)",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 1.2,
          marginBottom: 10,
        }}
      >
        {monthLabel}
      </div>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {turns.map((t) => (
          <TurnCell
            key={t.id}
            turn={t}
            currency={currency}
            contributionAmount={contributionAmount}
          />
        ))}
      </ul>
    </div>
  );
}

function TurnCell({
  turn,
  currency,
  contributionAmount,
}: {
  turn: TontineTurn;
  currency: string;
  contributionAmount: string;
}) {
  const isLate =
    turn.status !== "COMPLETED" &&
    turn.status !== "CANCELLED" &&
    new Date(turn.scheduledDate ?? turn.dueDate).getTime() < Date.now();

  const color = isLate ? "var(--rose, #d9714a)" : STATUS_COLOR[turn.status];
  const date = new Date(turn.scheduledDate ?? turn.dueDate);
  const dayLabel = date.toLocaleDateString("fr-FR", {
    day: "2-digit",
  });

  const cellStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    borderRadius: 10,
    background: isLate
      ? "rgba(217,113,74,0.08)"
      : turn.status === "COMPLETED"
        ? "rgba(102,205,170,0.10)"
        : "rgba(244,228,193,0.03)",
    border: `1px solid ${isLate ? "rgba(217,113,74,0.30)" : "rgba(244,228,193,0.08)"}`,
    fontSize: 12,
    cursor: "default",
  };

  return (
    <li
      style={cellStyle}
      title={`Tour ${turn.index} · ${turn.beneficiary?.displayName ?? "—"} · ${contributionAmount} ${currency} · ${date.toLocaleDateString("fr-FR")}`}
    >
      <span
        aria-hidden
        style={{
          color,
          fontSize: 14,
          fontWeight: 700,
          minWidth: 14,
          textAlign: "center",
        }}
      >
        {STATUS_ICON[turn.status]}
      </span>
      <span style={{ minWidth: 28, color: "var(--cream-muted, #aaa)", fontSize: 11 }}>
        {dayLabel}
      </span>
      <span
        style={{
          flex: 1,
          color: "var(--cream)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {turn.beneficiary?.displayName ?? `Tour ${turn.index}`}
      </span>
      {isLate && (
        <span
          aria-label="En retard"
          style={{
            fontSize: 10,
            color: "var(--rose, #d9714a)",
            fontWeight: 700,
          }}
        >
          ⚠ retard
        </span>
      )}
    </li>
  );
}
