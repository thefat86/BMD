"use client";

/**
 * <MobileReminderSheet> · V56
 *
 * BottomSheet qui permet à l'utilisateur de relancer ses débiteurs en
 * 1 tap avec un message IA personnalisé.
 *
 * Flow :
 *  1. Liste des débiteurs (= personnes avec un net < 0 du POV utilisateur)
 *  2. Tap sur un débiteur → step "ton + langue"
 *  3. Tap "Générer" → POST /ai/reminder-message → message GPT-4o-mini
 *  4. Tap "Envoyer" → Web Share API (WhatsApp/SMS/Mail) avec le message
 *
 * Utilise les balances calculées par PersonBalanceList côté serveur, donc
 * pas de double fetch. Les seules personnes affichées sont celles à qui
 * l'utilisateur peut effectivement réclamer de l'argent (net > 0 du POV
 * utilisateur, c-à-d "elle me doit").
 */

import { useEffect, useState } from "react";
import { BottomSheet } from "./bottom-sheet";
import { api, ApiError } from "../api-client";
import { useT } from "../i18n/app-strings";
import { useLocale } from "../locale-provider";
import { Icon } from "./icons";
import { haptic } from "../platform";

type Tone = "sympa" | "ferme" | "humour" | "pro";
/** V165.E — Onglet actif : "groups" (balances groupes) ou "debts" (RDD créditeur) */
type ReminderTab = "groups" | "debts";

interface DebtorRow {
  counterpartyUserId: string;
  displayName: string;
  /** Montant absolu dû à l'utilisateur courant (toujours positif ici) */
  amountOwed: number;
  currency: string;
  sharedGroupNames: string[];
  /** V165.E — Type de source pour ajuster le prompt LLM */
  source?: "GROUP" | "DEBT";
  /** V165.E — ID du contrat RDD si source=DEBT */
  debtId?: string;
  /** V165.E — Nb d'échéances en retard (si source=DEBT) */
  overdueCount?: number;
}

export function MobileReminderSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): JSX.Element {
  const t = useT();
  const { code: localeCode } = useLocale();
  const [step, setStep] = useState<"list" | "compose">("list");
  /** V165.E — Onglet actif : groupes (balances) ou RDD (contrats créditeur) */
  const [tab, setTab] = useState<ReminderTab>("groups");
  const [debtors, setDebtors] = useState<DebtorRow[] | null>(null);
  /** V165.E — Cache filleuls RDD pour éviter de refetch à chaque switch */
  const [debtRows, setDebtRows] = useState<DebtorRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<DebtorRow | null>(null);
  const [tone, setTone] = useState<Tone>("sympa");
  const [genLocale, setGenLocale] = useState<string>(localeCode);
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState<string>("");

  // Reset quand on rouvre la sheet
  useEffect(() => {
    if (!open) return;
    setStep("list");
    setTab("groups");
    setSelected(null);
    setDraft("");
    setError(null);
    setLoading(true);
    // V165.E — On charge les 2 sources en parallèle pour switcher instantanément
    // entre les onglets sans nouveau fetch. Si l'une échoue, l'autre reste utile.
    Promise.allSettled([
      api.getMyBalancesByPerson(),
      api.listDebts().catch(() => ({ debts: [] as any[] })),
    ])
      .then(([balancesRes, debtsRes]) => {
        // Onglet "Groupes" : balances par personne
        if (balancesRes.status === "fulfilled") {
          const data = balancesRes.value;
          const rows: DebtorRow[] = data.people
            .map((p) => ({
              counterpartyUserId: p.counterpartyUserId,
              displayName: p.displayName,
              amountOwed: parseFloat(p.net),
              currency: p.currency || data.primaryCurrency,
              sharedGroupNames: p.byGroup.map((g) => g.groupName).slice(0, 3),
              source: "GROUP" as const,
            }))
            .filter((r) => Number.isFinite(r.amountOwed) && r.amountOwed > 0)
            .sort((a, b) => b.amountOwed - a.amountOwed);
          setDebtors(rows);
        } else {
          setError((balancesRes.reason as Error)?.message ?? "Erreur");
        }
        // Onglet "Reconnaissances" : RDD où je suis créditeur avec retards
        const debtsData = debtsRes.status === "fulfilled" ? debtsRes.value : { debts: [] };
        const myId = (window as any).__bmd_me_id ?? null;
        const rddRows: DebtorRow[] = (debtsData.debts ?? [])
          .filter((d: any) => {
            // Je suis créditeur ?
            const me = d.parties?.find?.(
              (p: any) => p.role === "CREDITOR" && p.userId,
            );
            if (!me) return false;
            if (myId && me.userId !== myId) return false;
            // Statut actif (pas COMPLETED ni CANCELLED)
            if (["COMPLETED", "CANCELLED", "REJECTED"].includes(d.status)) {
              return false;
            }
            // Au moins une échéance en retard OU à venir prochainement
            const overdue = (d.schedules ?? []).filter(
              (s: any) =>
                s.status !== "PAID" &&
                new Date(s.dueDate) <= new Date(Date.now() + 7 * 86400000),
            );
            return overdue.length > 0;
          })
          .map((d: any) => {
            const debtor = d.parties?.find?.((p: any) => p.role === "DEBTOR");
            const overdue = (d.schedules ?? []).filter(
              (s: any) =>
                s.status !== "PAID" &&
                new Date(s.dueDate) <= new Date(Date.now() + 7 * 86400000),
            );
            const overdueAmount = overdue.reduce(
              (sum: number, s: any) =>
                sum + (parseFloat(s.expectedAmount) - parseFloat(s.paidAmount ?? "0")),
              0,
            );
            return {
              counterpartyUserId: debtor?.userId ?? d.id,
              displayName: debtor?.displayName ?? "Débiteur",
              amountOwed: overdueAmount,
              currency: d.currency || "EUR",
              sharedGroupNames: [d.purpose ?? "Reconnaissance de dette"],
              source: "DEBT" as const,
              debtId: d.id,
              overdueCount: overdue.length,
            };
          })
          .sort((a: DebtorRow, b: DebtorRow) => b.amountOwed - a.amountOwed);
        setDebtRows(rddRows);
      })
      .finally(() => setLoading(false));
  }, [open]);

  async function handleGenerate() {
    if (!selected) return;
    setGenerating(true);
    setError(null);
    setDraft("");
    try {
      const r = await api.generateReminderMessage({
        debtorName: selected.displayName.split(" ")[0] ?? selected.displayName,
        debtorUserId: selected.counterpartyUserId,
        amount: selected.amountOwed.toFixed(2),
        currency: selected.currency,
        tone,
        locale: genLocale,
        groupNames: selected.sharedGroupNames,
      });
      setDraft(r.message);
      haptic("success");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error).message;
      setError(msg);
      haptic("error");
    } finally {
      setGenerating(false);
    }
  }

  async function handleShare() {
    if (!draft) return;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: t("reminder.shareTitle"),
          text: draft,
        });
        haptic("success");
        onClose();
        return;
      }
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(draft);
        if (typeof window !== "undefined") {
          window.alert(t("reminder.copied"));
        }
        onClose();
      }
    } catch {
      /* user dismissed */
    }
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={
        step === "list"
          ? t("reminder.title")
          : selected?.displayName ?? t("reminder.title")
      }
    >
      {step === "list" ? (
        <>
          {/* V165.E — Toggle 2 onglets : balances Groupes vs RDD créditeur */}
          <div
            role="tablist"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 6,
              padding: 4,
              background: "var(--paper, rgba(244,228,193,0.06))",
              border: "1px solid var(--cocoa-line, rgba(43,31,21,0.08))",
              borderRadius: 12,
              marginBottom: 12,
            }}
          >
            {(
              [
                {
                  key: "groups",
                  label: t("reminder.tab.groups") || "Groupes",
                  count: debtors?.length ?? 0,
                },
                {
                  key: "debts",
                  label: t("reminder.tab.debts") || "Reconnaissances",
                  count: debtRows?.length ?? 0,
                },
              ] as const
            ).map((opt) => {
              const active = tab === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(opt.key)}
                  style={{
                    padding: "10px 8px",
                    borderRadius: 10,
                    background: active
                      ? "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--v45-saffron-strong, #854F0B))"
                      : "transparent",
                    color: active ? "#FBF6EC" : "var(--cocoa, #2B1F15)",
                    border: "none",
                    fontWeight: 700,
                    fontSize: 12.5,
                    fontFamily: "inherit",
                    cursor: "pointer",
                    transition: "all 0.15s",
                    minHeight: 40,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  {opt.label}
                  {opt.count > 0 && (
                    <span
                      style={{
                        fontSize: 10,
                        padding: "1px 6px",
                        borderRadius: 999,
                        background: active
                          ? "rgba(251,246,236,0.25)"
                          : "var(--v45-saffron-pale, #F6E8C5)",
                        color: active ? "#FBF6EC" : "var(--v45-saffron-strong, #854F0B)",
                        fontWeight: 700,
                      }}
                    >
                      {opt.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <ListStep
            debtors={tab === "groups" ? debtors : debtRows}
            tab={tab}
            loading={loading}
            error={error}
            t={t}
            onSelect={(d) => {
              setSelected(d);
              setStep("compose");
              setDraft("");
              setError(null);
            }}
          />
        </>
      ) : (
        <ComposeStep
          debtor={selected!}
          tone={tone}
          onToneChange={setTone}
          locale={genLocale}
          onLocaleChange={setGenLocale}
          draft={draft}
          onDraftChange={setDraft}
          generating={generating}
          error={error}
          t={t}
          onBack={() => {
            setStep("list");
            setSelected(null);
          }}
          onGenerate={handleGenerate}
          onShare={handleShare}
        />
      )}
    </BottomSheet>
  );
}

function ListStep({
  debtors,
  tab,
  loading,
  error,
  t,
  onSelect,
}: {
  debtors: DebtorRow[] | null;
  tab?: ReminderTab;
  loading: boolean;
  error: string | null;
  t: ReturnType<typeof useT>;
  onSelect: (d: DebtorRow) => void;
}) {
  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--cream-soft)" }}>
        {t("reminder.loading")}
      </div>
    );
  }
  if (error) {
    return (
      <div
        style={{
          padding: 14,
          background: "rgba(239,68,68,0.10)",
          border: "1px solid rgba(239,68,68,0.30)",
          borderRadius: 12,
          color: "#fca5a5",
          fontSize: 13,
        }}
      >
        {error}
      </div>
    );
  }
  if (!debtors || debtors.length === 0) {
    const emptyMsg =
      tab === "debts"
        ? t("reminder.noDebts") || "Aucune reconnaissance de dette en retard 🎉"
        : t("reminder.noDebtors");
    return (
      <div
        data-empty-msg={emptyMsg}
        style={{
          padding: "24px 18px",
          textAlign: "center",
          color: "var(--cream-soft)",
          fontSize: 14,
          lineHeight: 1.6,
          border: "1px dashed rgba(244,228,193,0.15)",
          borderRadius: 14,
        }}
      >
        {emptyMsg}
      </div>
    );
  }
  return (
    <>
      <p
        style={{
          margin: "0 0 12px",
          fontSize: 12.5,
          color: "var(--cream-soft)",
          lineHeight: 1.5,
        }}
      >
        {t("reminder.intro", { count: String(debtors.length) })}
      </p>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {debtors.map((d) => (
          <li key={d.counterpartyUserId}>
            <button
              type="button"
              onClick={() => onSelect(d)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                width: "100%",
                padding: "12px 14px",
                background: "rgba(244,228,193,0.03)",
                border: "1px solid rgba(244,228,193,0.08)",
                borderRadius: 12,
                color: "var(--cream)",
                fontFamily: "inherit",
                cursor: "pointer",
                textAlign: "left",
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
                minHeight: 56,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background:
                    "linear-gradient(135deg, rgba(232,163,61,0.18), rgba(181,70,46,0.22))",
                  border: "1px solid rgba(232,163,61,0.25)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--saffron)",
                  flexShrink: 0,
                }}
              >
                {(d.displayName.split(" ").map((s) => s[0]).filter(Boolean).slice(0, 2).join("") || "?").toUpperCase()}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 600, fontSize: 14 }}>
                  {d.displayName}
                </span>
                <span
                  className="bmd-num"
                  style={{
                    display: "block",
                    fontSize: 12,
                    color: "#7DC59E",
                    marginTop: 2,
                  }}
                >
                  +{d.amountOwed.toFixed(2)} {d.currency}
                </span>
              </span>
              <Icon name="sparkles" size={16} color="var(--saffron)" strokeWidth={1.6} />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function ComposeStep({
  debtor,
  tone,
  onToneChange,
  locale,
  onLocaleChange,
  draft,
  onDraftChange,
  generating,
  error,
  t,
  onBack,
  onGenerate,
  onShare,
}: {
  debtor: DebtorRow;
  tone: Tone;
  onToneChange: (t: Tone) => void;
  locale: string;
  onLocaleChange: (l: string) => void;
  draft: string;
  onDraftChange: (d: string) => void;
  generating: boolean;
  error: string | null;
  t: ReturnType<typeof useT>;
  onBack: () => void;
  onGenerate: () => void;
  onShare: () => void;
}) {
  const TONES: Array<{ value: Tone; labelKey: string }> = [
    { value: "sympa", labelKey: "reminder.toneSympa" },
    { value: "ferme", labelKey: "reminder.toneFerme" },
    { value: "humour", labelKey: "reminder.toneHumour" },
    { value: "pro", labelKey: "reminder.tonePro" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <button
        type="button"
        onClick={onBack}
        style={{
          background: "transparent",
          border: "none",
          color: "var(--cream-soft)",
          fontFamily: "inherit",
          fontSize: 12,
          textAlign: "left",
          padding: 0,
          cursor: "pointer",
          alignSelf: "flex-start",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        ← {t("reminder.changeRecipient")}
      </button>

      <div
        style={{
          padding: 12,
          borderRadius: 12,
          background:
            "linear-gradient(135deg, rgba(232,163,61,0.10), rgba(125,197,158,0.06))",
          border: "1px solid rgba(232,163,61,0.25)",
        }}
      >
        <div style={{ fontSize: 13, color: "var(--cream-soft)", marginBottom: 2 }}>
          {t("reminder.you")} → <strong>{debtor.displayName}</strong>
        </div>
        <div
          className="bmd-num"
          style={{ fontSize: 18, fontWeight: 700, color: "#7DC59E" }}
        >
          {debtor.amountOwed.toFixed(2)} {debtor.currency}
        </div>
      </div>

      {/* Tone */}
      <div>
        <div
          style={{
            fontSize: 11,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: "var(--muted)",
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          {t("reminder.toneLabel")}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {TONES.map(({ value, labelKey }) => {
            const isActive = tone === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => onToneChange(value)}
                style={{
                  padding: "10px 8px",
                  borderRadius: 10,
                  border: `1px solid ${isActive ? "rgba(232,163,61,0.45)" : "rgba(244,228,193,0.08)"}`,
                  background: isActive
                    ? "rgba(232,163,61,0.18)"
                    : "rgba(244,228,193,0.03)",
                  color: isActive ? "var(--saffron)" : "var(--cream)",
                  fontFamily: "inherit",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  touchAction: "manipulation",
                  WebkitTapHighlightColor: "transparent",
                  minHeight: 40,
                }}
              >
                {t(labelKey)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Locale */}
      <div>
        <div
          style={{
            fontSize: 11,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: "var(--muted)",
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          {t("reminder.languageLabel")}
        </div>
        <select
          value={locale}
          onChange={(e) => onLocaleChange(e.target.value)}
          style={{
            width: "100%",
            padding: "10px 12px",
            background: "rgba(244,228,193,0.04)",
            border: "1px solid rgba(244,228,193,0.10)",
            borderRadius: 10,
            color: "var(--cream)",
            fontFamily: "inherit",
            fontSize: 14,
          }}
        >
          <option value="fr">Français</option>
          <option value="en">English</option>
          <option value="es">Español</option>
          <option value="pt">Português</option>
          <option value="de">Deutsch</option>
          <option value="it">Italiano</option>
          <option value="ar">العربية</option>
          <option value="sw">Kiswahili</option>
          <option value="wo">Wolof</option>
          <option value="ln">Lingala</option>
          <option value="lb">Lëtzebuergesch</option>
          <option value="ru">Русский</option>
          <option value="ja">日本語</option>
          <option value="ko">한국어</option>
          <option value="zh">中文</option>
        </select>
      </div>

      {/* CTA Generate */}
      {!draft && (
        <button
          type="button"
          onClick={onGenerate}
          disabled={generating}
          style={{
            background:
              "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))",
            color: "var(--night-2, #16111E)",
            fontWeight: 700,
            fontSize: 14,
            minHeight: 48,
            border: "none",
            borderRadius: 12,
            width: "100%",
            cursor: generating ? "wait" : "pointer",
            fontFamily: "inherit",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            opacity: generating ? 0.7 : 1,
            touchAction: "manipulation",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <Icon name="sparkles" size={16} color="currentColor" strokeWidth={2} />
          {generating ? t("reminder.generating") : t("reminder.generateCta")}
        </button>
      )}

      {error && (
        <div
          role="alert"
          style={{
            padding: "10px 12px",
            background: "rgba(239,68,68,0.10)",
            border: "1px solid rgba(239,68,68,0.30)",
            borderRadius: 10,
            color: "#fca5a5",
            fontSize: 12.5,
          }}
        >
          {error}
        </div>
      )}

      {/* Draft + share */}
      {draft && (
        <>
          <div>
            <div
              style={{
                fontSize: 11,
                letterSpacing: 1.2,
                textTransform: "uppercase",
                color: "var(--muted)",
                fontWeight: 700,
                marginBottom: 6,
              }}
            >
              {t("reminder.draftLabel")}
            </div>
            <textarea
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              rows={6}
              style={{
                width: "100%",
                padding: 12,
                background: "rgba(244,228,193,0.04)",
                border: "1px solid rgba(244,228,193,0.10)",
                borderRadius: 10,
                color: "var(--cream)",
                fontFamily: "inherit",
                fontSize: 14,
                lineHeight: 1.5,
                resize: "vertical",
                minHeight: 120,
              }}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button
              type="button"
              onClick={onGenerate}
              disabled={generating}
              style={{
                background: "transparent",
                border: "1px solid rgba(244,228,193,0.18)",
                color: "var(--cream-soft)",
                borderRadius: 12,
                padding: "12px 14px",
                fontSize: 13,
                cursor: generating ? "wait" : "pointer",
                fontFamily: "inherit",
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
                minHeight: 48,
              }}
            >
              {generating ? "…" : t("reminder.regenerate")}
            </button>
            <button
              type="button"
              onClick={onShare}
              style={{
                background:
                  "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))",
                color: "var(--night-2, #16111E)",
                fontWeight: 700,
                fontSize: 14,
                minHeight: 48,
                border: "none",
                borderRadius: 12,
                cursor: "pointer",
                fontFamily: "inherit",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <Icon name="share-2" size={14} color="currentColor" strokeWidth={2} />
              {t("reminder.sendCta")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
