"use client";

/**
 * V223.F — DesktopCreateDebtView refondu en une-page accordéon.
 *
 * Layout cible (1080p sans scroll global) :
 *  ┌────────────────────────┬──────────────────────────────────┐
 *  │  PREVIEW LIVE          │  [Bloc 1: Parties]      ▼ ouvert │
 *  │  (certificat cocoa     │  [Bloc 2: Montant+freq]   ›      │
 *  │   sur ivoire)          │  [Bloc 3: Témoins+garants] ›     │
 *  │  → MAJ temps réel      │  [Bloc 4: Signature]       ›     │
 *  │                        │  ─────                            │
 *  │                        │  GuideButton + Submit             │
 *  └────────────────────────┴──────────────────────────────────┘
 *
 *  - `gridTemplateColumns: "1fr 1.2fr"`, gap 18, maxHeight `calc(100vh - 80px)`.
 *  - Un seul bloc accordéon ouvert à la fois (openBlock: 0..3).
 *  - Mobile inchangé : ce composant n'est utilisé que côté desktop. Le wizard
 *    mobile reste géré par la version existante (mobile-create-debt-flow ou
 *    équivalent).
 *
 * Le pattern remplace l'ancienne version V153.D (4 FormCard verticales + recap
 * sticky droite). Toute la logique métier (lookup débiteur BMD, calcul
 * mensualité, rétroactivité, niveau de signature, submit) est conservée mais
 * réorganisée pour tenir dans 4 blocs accordéon.
 *
 * Les sliders / blocs lourds (track record modal, retroactive block) restent
 * intacts. On en cache simplement le placement dans le bloc 1 (parties) ou 2
 * (montant) selon le cas.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../api-client";
import { useT } from "../i18n/app-strings";
import {
  DebtorTrackRecordModal,
  type LookupResult,
  type TrackRecord,
} from "./debtor-track-record-modal";
import {
  DebtRetroactiveBlock,
  initialRetroactiveState,
  type DebtRetroactiveState,
} from "./debt-retroactive-block";
import { CurrencySelector } from "./currency-selector";
import { SegmentedControl } from "./segmented-control";
import { GuideButton } from "./guide-button";
// V234 — Identité officielle scannée pour créancier/débiteur/garant
import { IdentityCaptureSheet } from "./identity-capture-sheet";

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

type Frequency =
  | "LUMP_SUM"
  | "WEEKLY"
  | "BIWEEKLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "YEARLY";

const FREQUENCY_OPTIONS: Array<{ value: Frequency; labelKey: string; fallback: string }> = [
  { value: "LUMP_SUM", labelKey: "debts.freqLumpSum", fallback: "Paiement unique" },
  { value: "WEEKLY", labelKey: "debts.freqWeekly", fallback: "Hebdo" },
  { value: "BIWEEKLY", labelKey: "debts.freqBiweekly", fallback: "Bi-mensuel" },
  { value: "MONTHLY", labelKey: "debts.freqMonthly", fallback: "Mensuel" },
  { value: "QUARTERLY", labelKey: "debts.freqQuarterly", fallback: "Trimestriel" },
  { value: "YEARLY", labelKey: "debts.freqYearly", fallback: "Annuel" },
];

const PERIODS_PER_YEAR: Record<Frequency, number> = {
  LUMP_SUM: 1,
  WEEKLY: 52,
  BIWEEKLY: 26,
  MONTHLY: 12,
  QUARTERLY: 4,
  YEARLY: 1,
};

interface OptionalParty {
  id: string;
  name: string;
  contact: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Composant principal
// ──────────────────────────────────────────────────────────────────────────

export function DesktopCreateDebtView(): JSX.Element {
  const router = useRouter();
  const t = useT();

  // === États core ===
  // Bloc 1 : Parties
  const [creditorIsMe, setCreditorIsMe] = useState(true);
  const [creditorName, setCreditorName] = useState("");
  const [debtorName, setDebtorName] = useState("");
  const [debtorContact, setDebtorContact] = useState("");
  // Retroactive bloc (montant déjà versé optionnel) — inclus dans bloc 1
  const [retroState, setRetroState] = useState<DebtRetroactiveState>(
    initialRetroactiveState,
  );

  // Bloc 2 : Montant + fréquence
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [frequency, setFrequency] = useState<Frequency>("MONTHLY");
  const [totalInstallments, setTotalInstallments] = useState(6);
  const [startDate, setStartDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );

  // Bloc 3 : Témoins + garants (optionnel)
  const [witnesses, setWitnesses] = useState<OptionalParty[]>([]);
  const [guarantors, setGuarantors] = useState<OptionalParty[]>([]);

  // Bloc 4 : Signature
  type SignatureLevel = "MANUAL" | "QUALIFIED";
  const [signatureLevel, setSignatureLevel] = useState<SignatureLevel>("MANUAL");

  // === Accordion state ===
  const [openBlock, setOpenBlock] = useState<0 | 1 | 2 | 3>(0);

  // === Submit & errors ===
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // === Lookup débiteur (V155.D, conservé) ===
  const [lookup, setLookup] = useState<LookupResult>({ status: "idle" });
  const [trackRecord, setTrackRecord] = useState<TrackRecord | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // === V234 — Identité officielle (créancier = moi) ===
  /** Mon scan d'identité — null tant que pas chargé / pas scanné. */
  const [myIdentity, setMyIdentity] = useState<{
    firstName: string | null;
    lastName: string | null;
    status: "PENDING" | "VERIFIED" | "REJECTED";
  } | null>(null);
  const [identitySheetOpen, setIdentitySheetOpen] = useState(false);

  // Au mount : fetch mon identité officielle
  useEffect(() => {
    let cancelled = false;
    api
      .getMyIdentity()
      .then((res) => {
        if (cancelled) return;
        if (res.identity) {
          setMyIdentity({
            firstName: res.identity.firstName,
            lastName: res.identity.lastName,
            status: res.identity.status,
          });
        } else {
          setMyIdentity(null);
        }
      })
      .catch(() => {
        if (!cancelled) setMyIdentity(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Nom officiel du créancier (= moi si creditorIsMe et identité VERIFIED)
  const creditorOfficialName = useMemo<string | null>(() => {
    if (!creditorIsMe) return null;
    if (
      myIdentity &&
      myIdentity.status === "VERIFIED" &&
      myIdentity.firstName &&
      myIdentity.lastName
    ) {
      return `${myIdentity.firstName} ${myIdentity.lastName}`;
    }
    return null;
  }, [creditorIsMe, myIdentity]);

  /** Identité requise = je suis créancier mais pas VERIFIED. */
  const identityMissing =
    creditorIsMe &&
    (!myIdentity ||
      myIdentity.status !== "VERIFIED" ||
      !myIdentity.firstName ||
      !myIdentity.lastName);

  useEffect(() => {
    const value = debtorContact.trim();
    if (!value || value.length < 5) {
      setLookup({ status: "idle" });
      return;
    }
    let cancelled = false;
    setLookup({ status: "loading" });
    const timer = setTimeout(async () => {
      try {
        const r = await api.lookupUserByContact(value);
        if (cancelled) return;
        if (r.found) {
          setDebtorName((prev) => (prev.trim() ? prev : r.displayName));
          setLookup({
            status: "found",
            userId: r.userId,
            displayName: r.displayName,
            avatar: r.avatar,
            memberSince: r.memberSince,
          });
        } else {
          setLookup({ status: "not_found", reason: r.reason });
        }
      } catch {
        if (!cancelled) setLookup({ status: "idle" });
      }
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [debtorContact]);

  // === Calculs en live ===
  const amountNum = parseFloat(amount.replace(",", ".")) || 0;
  const installmentValue = useMemo(() => {
    if (amountNum <= 0) return null;
    if (frequency === "LUMP_SUM") return amountNum;
    if (totalInstallments <= 0) return null;
    return amountNum / totalInstallments;
  }, [amountNum, frequency, totalInstallments]);

  // Date de fin auto-calculée
  const endDate = useMemo(() => {
    if (!startDate) return null;
    const d = new Date(startDate);
    if (isNaN(d.getTime())) return null;
    if (frequency === "LUMP_SUM") return d;
    const n = totalInstallments;
    // Approximation par fréquence
    switch (frequency) {
      case "WEEKLY":
        d.setDate(d.getDate() + n * 7);
        break;
      case "BIWEEKLY":
        d.setDate(d.getDate() + n * 14);
        break;
      case "MONTHLY":
        d.setMonth(d.getMonth() + n);
        break;
      case "QUARTERLY":
        d.setMonth(d.getMonth() + n * 3);
        break;
      case "YEARLY":
        d.setFullYear(d.getFullYear() + n);
        break;
    }
    return d;
  }, [startDate, frequency, totalInstallments]);

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 2,
    }).format(n);

  const fmtDate = (d: Date | null) =>
    d ? d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "—";

  // === Validation cascadée (missingActions) ===
  const missingActions = useMemo<string[]>(() => {
    const list: string[] = [];
    // V234 — Identité officielle créancier obligatoire si "moi"
    if (identityMissing) {
      list.push(
        t("debt.create.requireIdentity") ||
          "Fournis d'abord ton identité officielle pour créer une RDD.",
      );
    }
    // Bloc 1
    const creditorOk = creditorIsMe || creditorName.trim().length > 0;
    if (!creditorOk) {
      list.push(t("debt.create.missing.creditor") || "Indique le créancier");
    }
    if (debtorName.trim().length === 0) {
      list.push(t("debt.create.missing.debtor") || "Indique le débiteur");
    }
    // Bloc 2
    if (amountNum <= 0) {
      list.push(t("debt.create.missing.amount") || "Saisis un montant > 0");
    }
    if (!currency || currency.length < 3) {
      list.push(t("debt.create.missing.currency") || "Choisis une devise");
    }
    if (!frequency) {
      list.push(t("debt.create.missing.frequency") || "Choisis une fréquence");
    }
    if (!startDate) {
      list.push(
        t("debt.create.missing.startDate") || "Indique la date de début",
      );
    }
    return list;
  }, [
    creditorIsMe,
    creditorName,
    debtorName,
    amountNum,
    currency,
    frequency,
    startDate,
    identityMissing,
    t,
  ]);

  // === Compteurs par bloc (pour le badge "N champ(s) à remplir") ===
  const block1MissingCount = useMemo(() => {
    let n = 0;
    if (!(creditorIsMe || creditorName.trim().length > 0)) n++;
    if (debtorName.trim().length === 0) n++;
    // V234 — identité officielle créancier
    if (identityMissing) n++;
    return n;
  }, [creditorIsMe, creditorName, debtorName, identityMissing]);

  const block2MissingCount = useMemo(() => {
    let n = 0;
    if (amountNum <= 0) n++;
    if (!currency || currency.length < 3) n++;
    if (!frequency) n++;
    if (!startDate) n++;
    return n;
  }, [amountNum, currency, frequency, startDate]);

  // Bloc 3 entièrement optionnel → toujours "complet"
  // Bloc 4 : un choix par défaut → toujours "complet"

  // === Submit ===
  async function handleSubmitClick() {
    if (missingActions.length > 0 || submitting) return;
    setErrorMsg(null);
    // Charge le track record si débiteur matché BMD
    if (lookup.status === "found") {
      try {
        const tr = await api.getDebtTrackRecord(lookup.userId);
        setTrackRecord(tr);
      } catch {
        setTrackRecord(null);
      }
    } else {
      setTrackRecord(null);
    }
    setConfirmOpen(true);
  }

  async function actuallyCreate() {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      // V223.F — Mapping vers l'API existante.
      // Note : l'API actuelle (cf. V153.D) attend `frequency` parmi
      // WEEKLY|MONTHLY|QUARTERLY|YEARLY|LUMP_SUM. On mappe BIWEEKLY → WEEKLY
      // avec 2× les échéances pour rester compatible (TODO côté backend
      // ajouter BIWEEKLY natif).
      const apiFrequency =
        frequency === "BIWEEKLY" ? "WEEKLY" : frequency;
      const apiInstallments =
        frequency === "BIWEEKLY" ? totalInstallments * 2 : totalInstallments;

      const result = await api.createDebt({
        amount: amountNum,
        currency,
        interestRate: 0,
        purpose: undefined,
        endDate: (endDate ?? new Date()).toISOString(),
        frequency: apiFrequency as any,
        totalInstallments: apiInstallments,
        signatureLevel:
          signatureLevel === "QUALIFIED" ? "NOTARIZED" : "SIMPLE",
        debtorName: debtorName.trim(),
        debtorContact: debtorContact.trim() || undefined,
        debtorUserId:
          lookup.status === "found" ? lookup.userId : undefined,
        isPersonalLedger: retroState.isPersonalLedger || undefined,
        isRetroactive: retroState.isRetroactive || undefined,
        pastStartDate:
          retroState.isRetroactive && retroState.pastStartDate
            ? new Date(retroState.pastStartDate).toISOString()
            : undefined,
        previousPayments:
          retroState.isRetroactive && retroState.previousPayments.length > 0
            ? retroState.previousPayments
                .filter((p) => parseFloat(p.amount) > 0 && p.paidAt)
                .map((p) => ({
                  amount: parseFloat(p.amount),
                  paidAt: new Date(p.paidAt).toISOString(),
                  notes: p.notes?.trim() || undefined,
                  method: p.method,
                }))
            : undefined,
      });
      router.push(`/dashboard/debts/${result.id}`);
    } catch (e) {
      setErrorMsg((e as Error).message || "Erreur inconnue");
      setSubmitting(false);
      setConfirmOpen(false);
    }
  }

  // === Helpers d'affichage ===
  function freqLabelFor(f: Frequency) {
    const opt = FREQUENCY_OPTIONS.find((o) => o.value === f);
    if (!opt) return "—";
    return t(opt.labelKey) || opt.fallback;
  }

  function freqAdverb(f: Frequency): string {
    switch (f) {
      case "LUMP_SUM":
        return t("debts.freqLumpSum") || "Paiement unique";
      case "WEEKLY":
        return t("debts.freqWeekly") || "chaque semaine";
      case "BIWEEKLY":
        return t("debts.freqBiweekly") || "tous les 15 jours";
      case "MONTHLY":
        return t("debts.freqMonthly") || "chaque mois";
      case "QUARTERLY":
        return t("debts.freqQuarterly") || "chaque trimestre";
      case "YEARLY":
        return t("debts.freqYearly") || "chaque année";
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        maxWidth: 1280,
        margin: "0 auto",
        padding: "16px 24px",
      }}
    >
      <h1
        style={{
          fontSize: 22,
          fontWeight: 600,
          margin: "0 0 14px",
          color: "#2B1F15",
          fontFamily: "Cormorant Garamond, serif",
          letterSpacing: 0.2,
        }}
      >
        {t("debt.create.title") || "Nouvelle reconnaissance de dette"}
      </h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1.2fr",
          gap: 18,
          maxHeight: "calc(100vh - 100px)",
          alignItems: "stretch",
        }}
      >
        {/* ═══ Col GAUCHE : preview live (style certificat) ═══════════════ */}
        <PreviewCertificate
          creditorIsMe={creditorIsMe}
          creditorName={creditorName}
          creditorOfficialName={creditorOfficialName}
          debtorName={debtorName}
          amountNum={amountNum}
          currency={currency}
          frequency={frequency}
          freqLabelFor={freqLabelFor}
          freqAdverb={freqAdverb}
          installmentValue={installmentValue}
          totalInstallments={totalInstallments}
          startDate={startDate}
          endDate={endDate}
          witnesses={witnesses}
          guarantors={guarantors}
          fmtMoney={fmtMoney}
          fmtDate={fmtDate}
          t={t}
        />

        {/* ═══ Col DROITE : 4 blocs accordéon + GuideButton ═════════════════ */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            overflow: "auto",
            paddingRight: 4,
          }}
        >
          {/* Bloc 1 : Parties */}
          <AccordionBlock
            title={t("debt.create.block1Title") || "Parties"}
            subtitle={t("debt.create.block1Subtitle") || "Créancier et débiteur"}
            complete={block1MissingCount === 0}
            missingCount={block1MissingCount}
            open={openBlock === 0}
            onToggle={() => setOpenBlock(openBlock === 0 ? 1 : 0)}
            t={t}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Créancier */}
              <div>
                <Label>{t("debt.create.creditorLabel") || "Créancier"}</Label>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: "pointer",
                    fontSize: 12,
                    color: "#2B1F15",
                    marginBottom: 6,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={creditorIsMe}
                    onChange={(e) => setCreditorIsMe(e.target.checked)}
                  />
                  {t("debt.create.iAmCreditor") || "Je suis le créancier"}
                </label>
                {!creditorIsMe && (
                  <input
                    type="text"
                    value={creditorName}
                    onChange={(e) => setCreditorName(e.target.value)}
                    placeholder={
                      t("debt.create.partyNameLabel") || "Nom complet"
                    }
                    style={inputStyle}
                  />
                )}
                {/* V234 — Bandeau identité officielle si créancier = moi */}
                {creditorIsMe && (
                  <IdentityBandeau
                    identity={myIdentity}
                    onScan={() => setIdentitySheetOpen(true)}
                    t={t}
                  />
                )}
              </div>

              {/* Débiteur */}
              <div>
                <Label>{t("debt.create.debtorLabel") || "Débiteur"}</Label>
                <input
                  type="text"
                  value={debtorContact}
                  onChange={(e) => setDebtorContact(e.target.value)}
                  placeholder="email@example.com ou +33…"
                  style={inputStyle}
                />
                <LookupBadge lookup={lookup} t={t} />
                <input
                  type="text"
                  value={debtorName}
                  onChange={(e) => setDebtorName(e.target.value)}
                  placeholder={t("debt.create.partyNameLabel") || "Nom complet"}
                  style={{ ...inputStyle, marginTop: 8 }}
                />
              </div>

              {/* Rétroactivité (optionnel) */}
              <details style={{ borderTop: "0.5px dashed #D9C8A6", paddingTop: 10 }}>
                <summary
                  style={{
                    cursor: "pointer",
                    fontSize: 11,
                    color: "#8B6F47",
                    listStyle: "none",
                  }}
                >
                  ▸ {t("debt.create.previousAmountLabel") || "Montant initial déjà versé (optionnel)"}
                </summary>
                <div style={{ marginTop: 10 }}>
                  <DebtRetroactiveBlock
                    value={retroState}
                    onChange={setRetroState}
                    loanAmount={amountNum}
                    currency={currency}
                    variant="desktop"
                  />
                </div>
              </details>
            </div>
          </AccordionBlock>

          {/* Bloc 2 : Montant + fréquence */}
          <AccordionBlock
            title={t("debt.create.block2Title") || "Montant et fréquence"}
            subtitle={t("debt.create.block2Subtitle") || "Combien et quand"}
            complete={block2MissingCount === 0}
            missingCount={block2MissingCount}
            open={openBlock === 1}
            onToggle={() => setOpenBlock(openBlock === 1 ? 2 : 1)}
            t={t}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Montant + devise */}
              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 10 }}>
                <div>
                  <Label>{t("debt.create.amountLabel") || "Montant"}</Label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0,00"
                    style={{
                      ...inputStyle,
                      fontSize: 26,
                      fontWeight: 500,
                      fontVariantNumeric: "tabular-nums",
                      letterSpacing: "-0.4px",
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, monospace",
                    }}
                  />
                </div>
                <div>
                  <Label>{t("debt.create.currencyLabel") || "Devise"}</Label>
                  <CurrencySelector
                    value={currency}
                    onChange={setCurrency}
                    ariaLabel={t("debt.create.currencyLabel") || "Devise"}
                  />
                </div>
              </div>

              {/* Fréquence */}
              <div>
                <Label>{t("debt.create.frequencyLabel") || "Fréquence"}</Label>
                <SegmentedControl<Frequency>
                  value={frequency}
                  onChange={(v) => {
                    setFrequency(v);
                    if (v === "LUMP_SUM") setTotalInstallments(1);
                    else if (totalInstallments < 2) setTotalInstallments(6);
                  }}
                  segments={FREQUENCY_OPTIONS.map((o) => ({
                    value: o.value,
                    label: t(o.labelKey) || o.fallback,
                  }))}
                  size="sm"
                />
              </div>

              {/* Nombre d'échéances + auto-calc */}
              {frequency !== "LUMP_SUM" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <Label>
                      {t("debt.create.installmentsLabel") || "Nombre d'échéances"}
                    </Label>
                    <input
                      type="number"
                      min={1}
                      max={240}
                      value={totalInstallments}
                      onChange={(e) =>
                        setTotalInstallments(
                          Math.max(
                            1,
                            Math.min(240, parseInt(e.target.value) || 1),
                          ),
                        )
                      }
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <Label>
                      {t("debt.create.installmentPerLabel") || "Par échéance"}
                    </Label>
                    <div
                      style={{
                        padding: "8px 12px",
                        background: "#F4ECD9",
                        border: "0.5px solid #D9C8A6",
                        borderRadius: 9,
                        fontSize: 14,
                        fontWeight: 500,
                        color: "#2B1F15",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {installmentValue != null
                        ? fmtMoney(installmentValue)
                        : "—"}
                    </div>
                  </div>
                </div>
              )}

              {/* V235 — Date de début + Date de fin explicite */}
              <div
                style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
              >
                <div>
                  <Label>
                    {t("debt.create.startDateLabel") || "Date de début"}
                  </Label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <Label>
                    {frequency === "LUMP_SUM"
                      ? t("debt.create.endDateLumpSum") ||
                        "Date de paiement unique"
                      : t("debt.create.endDateLabel") ||
                        "Date de fin (calculée)"}
                  </Label>
                  <div
                    style={{
                      padding: "8px 12px",
                      background: "#F4ECD9",
                      border: "0.5px solid #D9C8A6",
                      borderRadius: 9,
                      fontSize: 13,
                      color: "#2B1F15",
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: 500,
                      minHeight: 18,
                    }}
                    aria-readonly="true"
                  >
                    {endDate ? fmtDate(endDate) : "—"}
                  </div>
                </div>
              </div>
            </div>
          </AccordionBlock>

          {/* Bloc 3 : Témoins + garants */}
          <AccordionBlock
            title={t("debt.create.block3Title") || "Témoins et garants"}
            subtitle={t("debt.create.block3Subtitle") || "Optionnel"}
            complete
            missingCount={0}
            open={openBlock === 2}
            onToggle={() => setOpenBlock(openBlock === 2 ? 3 : 2)}
            t={t}
            optional
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ fontSize: 10, color: "#8B6F47" }}>
                {t("debt.create.optionalBlockHint") ||
                  "Ce bloc est entièrement optionnel."}
              </div>
              <PartyList
                title={
                  t("debt.create.witnessesSectionTitle") || "Témoins"
                }
                addLabel={t("debt.create.addWitness") || "+ Ajouter un témoin"}
                value={witnesses}
                onChange={setWitnesses}
                t={t}
              />
              <PartyList
                title={
                  t("debt.create.guarantorsSectionTitle") || "Garants"
                }
                addLabel={t("debt.create.addGuarantor") || "+ Ajouter un garant"}
                value={guarantors}
                onChange={setGuarantors}
                t={t}
              />
            </div>
          </AccordionBlock>

          {/* Bloc 4 : Signature */}
          <AccordionBlock
            title={t("debt.create.block4Title") || "Signature"}
            subtitle={
              t("debt.create.block4Subtitle") || "Manuscrite ou qualifiée"
            }
            complete
            missingCount={0}
            open={openBlock === 3}
            onToggle={() => setOpenBlock(openBlock === 3 ? 0 : 3)}
            t={t}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <SignatureChoice
                active={signatureLevel === "MANUAL"}
                onClick={() => setSignatureLevel("MANUAL")}
                title={
                  t("debt.create.signatureManual") || "Signature manuscrite"
                }
                hint={
                  t("debt.create.signatureManualHint") ||
                  "Format simple : le débiteur signe le PDF généré."
                }
              />
              <SignatureChoice
                active={signatureLevel === "QUALIFIED"}
                onClick={() => setSignatureLevel("QUALIFIED")}
                title={
                  t("debt.create.signatureQualified") ||
                  "Signature qualifiée (Yousign)"
                }
                hint={
                  t("debt.create.signatureQualifiedHint") ||
                  "Vérification d'identité notariée + force exécutoire UE."
                }
                badge={
                  t("debt.create.signatureQualifiedPaywall") ||
                  "Plan payant requis"
                }
              />
            </div>
          </AccordionBlock>

          {/* ── GuideButton + submit ── */}
          <div
            style={{
              marginTop: 6,
              paddingTop: 10,
              borderTop: "0.5px solid #D9C8A6",
            }}
          >
            <GuideButton
              missingActions={missingActions}
              label={t("debt.create.submitCta") || "Créer la reconnaissance"}
              errorMessage={errorMsg}
              onErrorDismiss={() => setErrorMsg(null)}
              onSubmit={handleSubmitClick}
              submitting={submitting}
              secondaryLabel={t("debt.create.cancel") || "Annuler"}
              onSecondary={() => router.push("/dashboard/debts")}
              compact
            />
          </div>
        </div>
      </div>

      {/* Modal track record (V155) — conservée */}
      {confirmOpen && (
        <DebtorTrackRecordModal
          lookup={lookup}
          trackRecord={trackRecord}
          debtorName={debtorName.trim()}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={actuallyCreate}
          confirming={submitting}
          t={t}
        />
      )}

      {/* V234 — Sheet scan identité officielle */}
      {identitySheetOpen && (
        <IdentityCaptureSheet
          onClose={() => setIdentitySheetOpen(false)}
          onVerified={(identity) => {
            // Le scan vient d'être validé, on refresh notre état local
            setMyIdentity({
              firstName: identity?.firstName ?? null,
              lastName: identity?.lastName ?? null,
              status: identity?.status ?? "VERIFIED",
            });
          }}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// V234 — Bandeau identité officielle (Bloc 1)
// ──────────────────────────────────────────────────────────────────────────

function IdentityBandeau({
  identity,
  onScan,
  t,
}: {
  identity: {
    firstName: string | null;
    lastName: string | null;
    status: "PENDING" | "VERIFIED" | "REJECTED";
  } | null;
  onScan: () => void;
  t: (k: string) => string;
}): JSX.Element {
  const isVerified =
    identity?.status === "VERIFIED" && identity.firstName && identity.lastName;

  if (isVerified) {
    return (
      <div
        style={{
          marginTop: 8,
          padding: "8px 12px",
          background: "rgba(31,122,87,0.08)",
          border: "0.5px solid rgba(31,122,87,0.30)",
          borderRadius: 9,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          fontSize: 11.5,
          color: "#1F7A57",
        }}
      >
        <span>
          ✓ {identity.firstName} {identity.lastName}{" "}
          <span style={{ color: "#5A4632" }}>
            ({t("identity.officialBadge") || "identité officielle"})
          </span>
        </span>
        <button
          type="button"
          onClick={onScan}
          style={{
            padding: "4px 8px",
            background: "transparent",
            border: "0.5px solid #1F7A57",
            color: "#1F7A57",
            borderRadius: 7,
            fontSize: 10,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {t("identity.updateCta") || "Mettre à jour"}
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: 8,
        padding: "10px 12px",
        background: "rgba(197,138,46,0.10)",
        border: "0.5px solid rgba(197,138,46,0.40)",
        borderRadius: 9,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 11.5, color: "#854F0B", lineHeight: 1.4 }}>
        <strong>
          {t("debt.create.requireIdentity") ||
            "Fournis d'abord ton identité officielle pour créer une RDD."}
        </strong>
      </div>
      <button
        type="button"
        onClick={onScan}
        style={{
          padding: "8px 12px",
          background: "#2B1F15",
          color: "#FAF6EE",
          border: "none",
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 500,
          cursor: "pointer",
          fontFamily: "inherit",
          alignSelf: "flex-start",
        }}
      >
        {t("debt.create.scanMyIdentity") || "Scanner ma pièce d'identité"}
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Composant : Preview certificat (col gauche)
// ──────────────────────────────────────────────────────────────────────────

function PreviewCertificate({
  creditorIsMe,
  creditorName,
  creditorOfficialName,
  debtorName,
  amountNum,
  currency,
  frequency,
  freqLabelFor,
  freqAdverb,
  installmentValue,
  totalInstallments,
  startDate,
  endDate,
  witnesses,
  guarantors,
  fmtMoney,
  fmtDate,
  t,
}: {
  creditorIsMe: boolean;
  creditorName: string;
  /** V234 — Nom officiel scanné (si VERIFIED). Prime sur "Moi-même". */
  creditorOfficialName: string | null;
  debtorName: string;
  amountNum: number;
  currency: string;
  frequency: Frequency;
  freqLabelFor: (f: Frequency) => string;
  freqAdverb: (f: Frequency) => string;
  installmentValue: number | null;
  totalInstallments: number;
  startDate: string;
  endDate: Date | null;
  witnesses: OptionalParty[];
  guarantors: OptionalParty[];
  fmtMoney: (n: number) => string;
  fmtDate: (d: Date | null) => string;
  t: (k: string) => string;
}): JSX.Element {
  // V234 — Priorité : nom officiel scanné > nom saisi > placeholder.
  // Ne plus afficher "Moi-même" : un acte juridique requiert un nom propre.
  const creditorDisplay = creditorIsMe
    ? creditorOfficialName ||
      (t("debt.create.preview.identityRequired") ||
        "[Scanne ta pièce d'identité]")
    : creditorName.trim() || "______________________";
  const debtorDisplay = debtorName.trim() || "______________________";

  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "0.5px solid #D9C8A6",
        borderRadius: 14,
        padding: 28,
        boxShadow: "0 4px 18px rgba(43,31,21,0.06)",
        overflow: "auto",
        maxHeight: "calc(100vh - 130px)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "#8B6F47",
          marginBottom: 6,
        }}
      >
        {t("debt.create.preview") || "Aperçu live"}
      </div>
      <h2
        style={{
          fontFamily: "Cormorant Garamond, serif",
          fontSize: 22,
          fontWeight: 500,
          color: "#2B1F15",
          letterSpacing: "0.16em",
          textAlign: "center",
          margin: "10px 0 22px",
        }}
      >
        {t("debt.create.previewTitle") || "RECONNAISSANCE DE DETTE"}
      </h2>

      {/* Entre les soussignés */}
      <PreviewSection
        title={t("debt.create.previewBetween") || "Entre les soussignés"}
      >
        <p style={previewParaStyle}>
          <strong>{creditorDisplay}</strong>
          <br />
          <span style={{ fontSize: 11, color: "#8B6F47" }}>
            {t("debt.create.previewCreditor") ||
              "ci-après dénommé « Le créancier »"}
          </span>
        </p>
        <p style={previewParaStyle}>
          <strong>{debtorDisplay}</strong>
          <br />
          <span style={{ fontSize: 11, color: "#8B6F47" }}>
            {t("debt.create.previewDebtor") ||
              "ci-après dénommé « Le débiteur »"}
          </span>
        </p>
      </PreviewSection>

      {/* Objet */}
      <PreviewSection title={t("debt.create.previewObject") || "Objet"}>
        <div
          style={{
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 28,
            fontWeight: 600,
            color: "#C58A2E",
            letterSpacing: "-0.5px",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {amountNum > 0 ? fmtMoney(amountNum) : "—"}
        </div>
        <div style={{ fontSize: 12, color: "#5A4632", marginTop: 4 }}>
          {currency} · {freqLabelFor(frequency)}
        </div>
      </PreviewSection>

      {/* Modalités — V235 : période explicite (LUMP_SUM = 1 date, sinon Du..au) */}
      <PreviewSection title={t("debt.create.previewModalities") || "Modalités"}>
        {frequency === "LUMP_SUM" ? (
          <div style={previewLineStyle}>
            <span style={previewLabelStyle}>
              {t("debt.create.endDateLumpSum") || "Date de paiement unique"}
            </span>
            <span style={previewValueStyle}>
              {startDate ? fmtDate(new Date(startDate)) : "—"}
            </span>
          </div>
        ) : (
          <>
            <div style={previewLineStyle}>
              <span style={previewLabelStyle}>
                {t("debt.create.startDateLabel") || "Date de début"}
              </span>
              <span style={previewValueStyle}>
                {startDate ? fmtDate(new Date(startDate)) : "—"}
              </span>
            </div>
            <div style={previewLineStyle}>
              <span style={previewLabelStyle}>
                {t("debt.create.endDateLabel") || "Date de fin"}
              </span>
              <span style={previewValueStyle}>{fmtDate(endDate)}</span>
            </div>
            <div style={previewLineStyle}>
              <span style={previewLabelStyle}>Échéances</span>
              <span style={previewValueStyle}>
                {totalInstallments} ×{" "}
                {installmentValue ? fmtMoney(installmentValue) : "—"}
                <span style={{ color: "#8B6F47", marginLeft: 6 }}>
                  ({freqAdverb(frequency)})
                </span>
              </span>
            </div>
          </>
        )}
      </PreviewSection>

      {/* Témoins */}
      <PreviewSection title={t("debt.create.previewWitnesses") || "Témoins"}>
        {witnesses.length === 0 && guarantors.length === 0 ? (
          <div style={{ fontSize: 11, color: "#8B6F47", fontStyle: "italic" }}>
            {t("debt.create.previewWitnessesNone") ||
              "Aucun témoin déclaré."}
          </div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
            {witnesses.map((w) => (
              <li key={w.id}>{w.name || w.contact}</li>
            ))}
            {guarantors.map((g) => (
              <li key={g.id}>
                <strong>{g.name || g.contact}</strong>{" "}
                <span style={{ color: "#8B6F47" }}>(garant)</span>
              </li>
            ))}
          </ul>
        )}
      </PreviewSection>

      {/* Signatures */}
      <div
        style={{
          marginTop: 24,
          paddingTop: 18,
          borderTop: "0.5px dashed #D9C8A6",
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#8B6F47",
            marginBottom: 12,
            textAlign: "center",
          }}
        >
          {t("debt.create.previewSignatures") || "Signatures"}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 18,
          }}
        >
          <SignatureSlot
            role={t("debt.create.previewCreditorRole") || "Le créancier"}
            name={creditorDisplay}
          />
          <SignatureSlot
            role={t("debt.create.previewDebtorRole") || "Le débiteur"}
            name={debtorDisplay}
          />
        </div>
      </div>
    </div>
  );
}

function PreviewSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#8B6F47",
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <div style={{ color: "#2B1F15" }}>{children}</div>
    </div>
  );
}

function SignatureSlot({ role, name }: { role: string; name: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#8B6F47", marginBottom: 4 }}>
        {role}
      </div>
      <div style={{ fontSize: 12, fontWeight: 500, color: "#2B1F15" }}>
        {name}
      </div>
      <div
        style={{
          marginTop: 24,
          borderBottom: "0.5px solid #2B1F15",
          height: 0,
        }}
      />
    </div>
  );
}

const previewParaStyle: React.CSSProperties = {
  margin: "0 0 10px",
  fontSize: 13,
  lineHeight: 1.5,
  color: "#2B1F15",
};

const previewLineStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  padding: "4px 0",
  fontSize: 12,
};

const previewLabelStyle: React.CSSProperties = {
  color: "#8B6F47",
};

const previewValueStyle: React.CSSProperties = {
  color: "#2B1F15",
  fontVariantNumeric: "tabular-nums",
};

// ──────────────────────────────────────────────────────────────────────────
// Composant : AccordionBlock
// ──────────────────────────────────────────────────────────────────────────

function AccordionBlock({
  title,
  subtitle,
  complete,
  missingCount,
  open,
  onToggle,
  optional = false,
  t,
  children,
}: {
  title: string;
  subtitle: string;
  complete: boolean;
  missingCount: number;
  open: boolean;
  onToggle: () => void;
  optional?: boolean;
  t: (k: string) => string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: "0.5px solid #D9C8A6",
        borderRadius: 11,
        overflow: "hidden",
        background: "#FFFFFF",
        transition: "all 0.2s ease",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          padding: "10px 14px",
          background: "#FAF6EE",
          border: "none",
          borderBottom: open ? "1px solid #C58A2E" : "0.5px solid transparent",
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
          transition: "background 0.15s ease, border-color 0.15s ease",
        }}
        onMouseEnter={(e) => {
          if (!open) e.currentTarget.style.background = "#F4ECD9";
        }}
        onMouseLeave={(e) => {
          if (!open) e.currentTarget.style.background = "#FAF6EE";
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "#2B1F15",
              marginBottom: 1,
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: 10, color: "#8B6F47" }}>{subtitle}</div>
        </div>
        {optional ? (
          <span
            style={{
              fontSize: 9,
              padding: "3px 8px",
              background: "rgba(43,31,21,0.06)",
              color: "#5A4632",
              borderRadius: 999,
              letterSpacing: 0.4,
              textTransform: "uppercase",
            }}
          >
            Optionnel
          </span>
        ) : complete ? (
          <span
            style={{
              fontSize: 10,
              padding: "3px 8px",
              background: "rgba(31,122,87,0.10)",
              color: "#1F7A57",
              borderRadius: 999,
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            ✓ {t("debt.create.complete") || "Complété"}
          </span>
        ) : (
          <span
            style={{
              fontSize: 10,
              padding: "3px 8px",
              background: "rgba(159,70,40,0.10)",
              color: "#9F4628",
              borderRadius: 999,
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            {/* V225 — t() BMD interpole `{count}` single-brace directement */}
            {t("debt.create.fieldsRemaining", { count: String(missingCount) }) ||
              `${missingCount} champ(s) à remplir`}
          </span>
        )}
        <span style={{ fontSize: 12, color: "#8B6F47", marginLeft: 2 }}>
          {open ? "▾" : "›"}
        </span>
      </button>
      <div
        style={{
          maxHeight: open ? 900 : 0,
          opacity: open ? 1 : 0,
          overflow: "hidden",
          transition: "max-height 0.3s ease, opacity 0.2s ease",
          padding: open ? 14 : "0 14px",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Composant : Liste optionnelle (témoins / garants)
// ──────────────────────────────────────────────────────────────────────────

function PartyList({
  title,
  addLabel,
  value,
  onChange,
  t,
}: {
  title: string;
  addLabel: string;
  value: OptionalParty[];
  onChange: (v: OptionalParty[]) => void;
  t: (k: string) => string;
}) {
  const [draft, setDraft] = useState<{ name: string; contact: string }>({
    name: "",
    contact: "",
  });
  const [showForm, setShowForm] = useState(false);

  function add() {
    if (!draft.name.trim() && !draft.contact.trim()) return;
    onChange([
      ...value,
      {
        id: Math.random().toString(36).slice(2, 9),
        name: draft.name.trim(),
        contact: draft.contact.trim(),
      },
    ]);
    setDraft({ name: "", contact: "" });
    setShowForm(false);
  }

  function remove(id: string) {
    onChange(value.filter((p) => p.id !== id));
  }

  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: "#8B6F47",
          textTransform: "uppercase",
          letterSpacing: 0.04,
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      {value.length > 0 && (
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {value.map((p) => (
            <li
              key={p.id}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "6px 0",
                borderBottom: "0.5px dashed #D9C8A6",
                fontSize: 12,
              }}
            >
              <span style={{ flex: 1 }}>
                {p.name || p.contact}{" "}
                {p.name && p.contact && (
                  <span style={{ color: "#8B6F47" }}>· {p.contact}</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => remove(p.id)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#9F4628",
                  cursor: "pointer",
                  fontSize: 14,
                  fontFamily: "inherit",
                }}
                aria-label="Supprimer"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {showForm ? (
        <div
          style={{
            marginTop: 8,
            display: "grid",
            gridTemplateColumns: "1fr 1fr auto",
            gap: 6,
          }}
        >
          <input
            type="text"
            value={draft.name}
            onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
            placeholder={t("debt.create.partyNameLabel") || "Nom"}
            style={inputStyle}
          />
          <input
            type="text"
            value={draft.contact}
            onChange={(e) =>
              setDraft((p) => ({ ...p, contact: e.target.value }))
            }
            placeholder={t("debt.create.partyContactLabel") || "Email/tel"}
            style={inputStyle}
          />
          <button
            type="button"
            onClick={add}
            style={{
              padding: "8px 14px",
              background: "#C58A2E",
              color: "#2B1F15",
              border: "none",
              borderRadius: 9,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {t("debt.create.partyAdd") || "Ajouter"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          style={{
            marginTop: 8,
            padding: "6px 12px",
            background: "transparent",
            color: "#8B6F47",
            border: "0.5px dashed #D9C8A6",
            borderRadius: 7,
            fontSize: 11,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {addLabel}
        </button>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Composant : Choix de signature (toggle visuel)
// ──────────────────────────────────────────────────────────────────────────

function SignatureChoice({
  active,
  onClick,
  title,
  hint,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  hint: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: "left",
        padding: "12px 14px",
        background: active ? "rgba(197,138,46,0.08)" : "#FFFFFF",
        border: active ? "1px solid #C58A2E" : "0.5px solid #D9C8A6",
        borderRadius: 9,
        cursor: "pointer",
        display: "flex",
        gap: 12,
        alignItems: "center",
        fontFamily: "inherit",
        transition: "background 0.15s ease, border 0.15s ease",
      }}
    >
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: 8,
          border: active ? "5px solid #C58A2E" : "1.5px solid #D9C8A6",
          flexShrink: 0,
          transition: "border 0.15s ease",
        }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "#2B1F15" }}>
          {title}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "#8B6F47",
            marginTop: 2,
            lineHeight: 1.4,
          }}
        >
          {hint}
        </div>
      </div>
      {badge && (
        <span
          style={{
            fontSize: 9,
            padding: "3px 7px",
            background: "rgba(159,70,40,0.10)",
            color: "#9F4628",
            borderRadius: 999,
            fontWeight: 500,
            letterSpacing: 0.3,
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Composant : Badge lookup débiteur (réutilisé de V155.D)
// ──────────────────────────────────────────────────────────────────────────

function LookupBadge({
  lookup,
  t,
}: {
  lookup: LookupResult;
  t: (k: string) => string;
}): JSX.Element | null {
  if (lookup.status === "idle") return null;
  if (lookup.status === "loading") {
    return (
      <div
        style={{
          marginTop: 6,
          fontSize: 11,
          color: "#8B6F47",
          opacity: 0.8,
        }}
      >
        {t("debts.create.lookup.checking") || "Vérification en cours…"}
      </div>
    );
  }
  if (lookup.status === "found") {
    const initials = lookup.displayName
      .split(/\s+/)
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
    return (
      <div
        style={{
          marginTop: 6,
          padding: "6px 10px",
          background: "rgba(31,122,87,0.08)",
          border: "0.5px solid rgba(31,122,87,0.30)",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {lookup.avatar ? (
          <img
            src={lookup.avatar}
            alt=""
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              objectFit: "cover",
            }}
          />
        ) : (
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              background: "#1F7A57",
              color: "#FFFFFF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 9,
              fontWeight: 600,
            }}
          >
            {initials || "?"}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0, fontSize: 11, color: "#2B1F15" }}>
          ✓ {lookup.displayName}{" "}
          <span style={{ color: "#8B6F47" }}>
            ({t("debts.create.lookup.foundHint") || "membre BMD"})
          </span>
        </div>
      </div>
    );
  }
  return (
    <div
      style={{
        marginTop: 6,
        padding: "6px 10px",
        background: "rgba(133,79,11,0.06)",
        border: "0.5px solid rgba(133,79,11,0.20)",
        borderRadius: 8,
        fontSize: 11,
        color: "#854F0B",
      }}
    >
      {t("debts.create.lookup.notFoundHint") ||
        "Nouveau contact — sera invité à signer."}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Composants utilitaires (Label, inputStyle)
// ──────────────────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label
      style={{
        display: "block",
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        color: "#8B6F47",
        marginBottom: 4,
        fontWeight: 500,
      }}
    >
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  background: "#FFFFFF",
  border: "0.5px solid #D9C8A6",
  borderRadius: 9,
  fontSize: 12,
  color: "#2B1F15",
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
};
