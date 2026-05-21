"use client";

/**
 * <SplitSuggestionBanner /> · Bandeau de suggestion IA dans le form de
 * dépense (spec §3.7).
 *
 * Au moment où l'utilisateur tape une description, on détecte la catégorie
 * (resto/courses/transport/...) et on appelle `suggestSplitAi(groupId, category)`
 * qui retourne le mode de partage + participants les plus fréquents pour
 * cette catégorie dans CE groupe (apprentissage par historique).
 *
 * Si une suggestion arrive avec une confiance suffisante (basedOnCount >= 3),
 * on affiche un banner :
 *   « 🤖 BMD propose : Égal avec Marie + Aïcha + Karim ·
 *     basé sur 7 dépenses similaires · [Appliquer] »
 *
 * Le user peut ignorer ou cliquer Appliquer → setSplitMode + setParticipants
 * sont appelés. Le banner disparaît ensuite.
 */
import { useEffect, useRef, useState } from "react";
import { api } from "../api-client";

type SplitMode = "EQUAL" | "UNEQUAL" | "PERCENTAGE" | "ITEMIZED";

interface Member {
  user: { id: string; displayName: string };
}

const CATEGORY_HINTS: Array<[RegExp, string]> = [
  [/resto|restaurant|déjeuner|d[iî]ner|brunch|pizza|burger|kebab|bar/i, "resto"],
  [/courses|carrefour|leclerc|auchan|monoprix|lidl|aldi|épicerie|supermarch/i, "courses"],
  [/uber|bolt|taxi|metro|train|sncf|essence|p[ée]age|parking|tcl|ratp/i, "transport"],
  [/loyer|edf|engie|orange|sfr|free|internet|gaz|electric/i, "logement"],
  [/cinema|concert|musee|festival|netflix|spotify|hotel|airbnb|spa|bowling/i, "loisirs"],
];

function inferCategory(description: string): string | null {
  for (const [re, cat] of CATEGORY_HINTS) {
    if (re.test(description)) return cat;
  }
  return null;
}

interface Suggestion {
  splitMode: SplitMode;
  participantUserIds: string[];
  paidByUserId: string | null;
  basedOnCount: number;
  reason: string;
}

const SPLIT_LABELS: Record<SplitMode, string> = {
  EQUAL: "Égal",
  UNEQUAL: "Parts inégales",
  PERCENTAGE: "Pourcentages",
  ITEMIZED: "Articles",
};

export function SplitSuggestionBanner({
  groupId,
  description,
  members,
  currentSplitMode,
  onApply,
}: {
  groupId: string;
  description: string;
  members: Member[];
  currentSplitMode: SplitMode;
  onApply: (s: { splitMode: SplitMode; participantUserIds: string[] }) => void;
}) {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  // Anti-spam : on ne refetch pas si la description n'a pas changé
  const lastFetchedFor = useRef<string>("");

  useEffect(() => {
    if (dismissed) return;
    const trimmed = description.trim();
    if (trimmed.length < 4) {
      setSuggestion(null);
      return;
    }
    const category = inferCategory(trimmed);
    const cacheKey = category ?? "general";
    if (cacheKey === lastFetchedFor.current) return;
    lastFetchedFor.current = cacheKey;

    let cancelled = false;
    setBusy(true);
    void (async () => {
      try {
        const r = await api.suggestSplitAi(groupId, category ?? undefined);
        if (cancelled) return;
        if (r.suggestion && r.suggestion.basedOnCount >= 3) {
          setSuggestion(r.suggestion as Suggestion);
        } else {
          setSuggestion(null);
        }
      } catch {
        // Silencieux : pas de suggestion = pas de banner
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [description, groupId, dismissed]);

  if (!suggestion || dismissed) return null;
  // Pas la peine de proposer si le mode actuel est déjà la suggestion
  // ET que les participants matchent (heuristique simple : même nb)
  if (
    suggestion.splitMode === currentSplitMode &&
    suggestion.participantUserIds.length === members.length
  ) {
    return null;
  }

  const namesPreview = members
    .filter((m) => suggestion.participantUserIds.includes(m.user.id))
    .map((m) => m.user.displayName)
    .slice(0, 3)
    .join(", ");
  const moreCount =
    suggestion.participantUserIds.length - 3 > 0
      ? ` + ${suggestion.participantUserIds.length - 3}`
      : "";

  return (
    <div
      role="region"
      aria-label="Suggestion de partage"
      style={{
        background: "rgba(102,205,170,0.08)",
        border: "1px solid rgba(102,205,170,0.30)",
        borderRadius: 12,
        padding: "10px 12px",
        marginBottom: 14,
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      <span aria-hidden style={{ fontSize: 18 }}>
        🤖
      </span>
      <div style={{ flex: 1, minWidth: 180, fontSize: 12 }}>
        <div style={{ color: "var(--cream)", fontWeight: 600, marginBottom: 2 }}>
          BMD propose : {SPLIT_LABELS[suggestion.splitMode]} ·{" "}
          {namesPreview}
          {moreCount}
        </div>
        <div style={{ color: "var(--cream-soft)", fontSize: 11 }}>
          {suggestion.reason}
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          onApply({
            splitMode: suggestion.splitMode,
            participantUserIds: suggestion.participantUserIds,
          });
          setDismissed(true);
        }}
        style={{
          padding: "6px 12px",
          background:
            "linear-gradient(135deg, var(--emerald-soft, #66cdaa), #4a9d80)",
          color: "#16111E",
          border: "none",
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        ✓ Appliquer
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Ignorer la suggestion"
        style={{
          padding: "6px 10px",
          background: "transparent",
          border: "1px solid rgba(244,228,193,0.18)",
          color: "var(--cream-soft)",
          borderRadius: 8,
          fontSize: 12,
          cursor: "pointer",
        }}
      >
        ✕
      </button>
    </div>
  );
}
