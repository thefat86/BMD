"use client";

/**
 * V149.D — Wizard création reconnaissance de dette (MVP fonctionnel).
 *
 * Wizard en 1 page avec 3 sections empilées pour rester simple :
 *  - Section 1 : Montant + objet
 *  - Section 2 : Débiteur (nom + téléphone/email)
 *  - Section 3 : Calendrier (échéance finale + fréquence + nb échéances + taux)
 *
 * Au submit, appelle api.createDebt qui crée le contrat en DRAFT côté serveur,
 * génère automatiquement les schedules, et redirige vers /dashboard/debts/[id].
 *
 * Les étapes négociation/signature/garants viendront en V150.
 */

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ResponsiveShell } from "../../../../lib/ui/responsive-shell";
import { useBreakpoint } from "../../../../lib/use-breakpoint";
import { useT } from "../../../../lib/i18n/app-strings";
import { api } from "../../../../lib/api-client";
// V155.H — Lookup débiteur + modal track record sur wizard mobile
import {
  DebtorTrackRecordModal,
  type LookupResult,
  type TrackRecord,
} from "../../../../lib/ui/debtor-track-record-modal";
// V165.C — Bloc « Dette déjà existante » + « Mode de création »
import {
  DebtRetroactiveBlock,
  initialRetroactiveState,
  type DebtRetroactiveState,
} from "../../../../lib/ui/debt-retroactive-block";
// V169 — Compteur quota RDD du mois (push upgrade)
import { DebtCounter } from "../../../../lib/ui/debt-counter";

// V153.D — Wizard desktop chargé à la demande
const DesktopCreateDebtView = dynamic(
  () =>
    import("../../../../lib/ui/desktop-create-debt-view").then(
      (m) => m.DesktopCreateDebtView,
    ),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          height: 480,
          background: "rgba(43,31,21,0.04)",
          borderRadius: 14,
        }}
      />
    ),
  },
);

// V171.E — Ajout LUMP_SUM : remboursement en une seule fois à la date d'échéance.
type Frequency =
  | "WEEKLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "YEARLY"
  | "LUMP_SUM";

export default function NewDebtPage(): JSX.Element {
  const router = useRouter();
  const t = useT();
  const { isMobile } = useBreakpoint();
  // ── State ──
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [debtorName, setDebtorName] = useState("");
  const [debtorContact, setDebtorContact] = useState("");
  const [endDate, setEndDate] = useState(() => {
    // Default : 6 mois dans le futur
    const d = new Date();
    d.setMonth(d.getMonth() + 6);
    return d.toISOString().slice(0, 10);
  });
  const [frequency, setFrequency] = useState<Frequency>("MONTHLY");
  const [totalInstallments, setTotalInstallments] = useState(6);
  const [interestRate, setInterestRate] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // V155.H — Lookup débiteur + modal track record
  const [lookup, setLookup] = useState<LookupResult>({ status: "idle" });
  const [trackRecord, setTrackRecord] = useState<TrackRecord | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // V165.C — Dette rétroactive + mode personal/officiel
  const [retroState, setRetroState] = useState<DebtRetroactiveState>(
    initialRetroactiveState,
  );

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
          // Auto-fill displayName si vide
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

  // ── Calcul mensualité en live ──
  const installment = useMemo(() => {
    const p = parseFloat(amount);
    // V171.E — Paiement unique : une seule échéance, donc installment = capital
    // + intérêt cumulé. Ici on affiche juste le capital, l'intérêt est ajouté
    // par le backend si interestRate > 0.
    if (frequency === "LUMP_SUM") {
      if (!p || p <= 0) return null;
      return p;
    }
    const n = totalInstallments;
    if (!p || p <= 0 || n <= 0) return null;
    const periodsPerYear = { WEEKLY: 52, MONTHLY: 12, QUARTERLY: 4, YEARLY: 1 }[
      frequency as "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY"
    ];
    const r = interestRate / 100 / periodsPerYear;
    if (r === 0) return p / n;
    return (p * r) / (1 - Math.pow(1 + r, -n));
  }, [amount, totalInstallments, frequency, interestRate]);

  const totalToPay = useMemo(
    () => (installment != null ? installment * totalInstallments : null),
    [installment, totalInstallments],
  );

  // ── Validation ──
  // V165.C — Mode rétroactif : date d'origine doit être dans le passé
  // Si registre personnel rétroactif entièrement remboursé, on autorise endDate dans le passé
  const totalRetroPaid = retroState.previousPayments.reduce(
    (s, p) => s + (parseFloat(p.amount) || 0),
    0,
  );
  const retroOk = retroState.isRetroactive
    ? !!retroState.pastStartDate &&
      new Date(retroState.pastStartDate) <= new Date() &&
      totalRetroPaid <= parseFloat(amount || "0") + 0.001
    : true;
  const endDateOk =
    retroState.isPersonalLedger && retroState.isRetroactive
      ? true // libre : peut être historique
      : new Date(endDate) > new Date();
  const isValid =
    parseFloat(amount) > 0 &&
    debtorName.trim().length > 0 &&
    endDateOk &&
    totalInstallments >= 1 &&
    totalInstallments <= 120 &&
    interestRate >= 0 &&
    interestRate <= 22 &&
    retroOk;

  // V155.H — 2-step submit : précharge track record puis ouvre modal
  async function submit() {
    if (!isValid || submitting) return;
    setError(null);
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
    setError(null);
    try {
      const result = await api.createDebt({
        amount: parseFloat(amount),
        currency: "EUR",
        interestRate,
        purpose: purpose.trim() || undefined,
        endDate: new Date(endDate).toISOString(),
        frequency,
        totalInstallments,
        debtorName: debtorName.trim(),
        debtorContact: debtorContact.trim() || undefined,
        debtorUserId:
          lookup.status === "found" ? lookup.userId : undefined,
        // V165.C — Mode + rétroactivité
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
      setError((e as Error).message);
      setSubmitting(false);
      setConfirmOpen(false);
    }
  }

  return (
    <ResponsiveShell
      breadcrumb={t("debts.breadcrumb") || "Reconnaissances"}
      desktopTitle={t("debts.newTitle") || "Nouvelle reconnaissance"}
      mobileTitle={t("debts.newTitle") || "Nouvelle reconnaissance"}
      back={{ href: "/dashboard/debts" }}
      hideFab
    >
      {!isMobile ? (
        <DesktopCreateDebtView />
      ) : (
      <div
        style={{
          maxWidth: 520,
          margin: "0 auto",
          padding: "0 4px",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        {/* V169 — Compteur RDD mensuel en tête de wizard */}
        <DebtCounter variant="card" />

        {/* === Section 1 : Montant + objet === */}
        <Section title={t("debts.amountTitle") || "Combien et pour quoi ?"}>
          <Label>{t("debts.amountLabel") || "Montant prêté"}</Label>
          <div
            style={{
              background: "#FFFFFF",
              border: "0.5px solid rgba(43,31,21,0.15)",
              borderRadius: 12,
              padding: 14,
              display: "flex",
              alignItems: "baseline",
              gap: 10,
            }}
          >
            <input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="bmd-num"
              style={{
                flex: 1,
                fontFamily: "Cormorant Garamond, serif",
                fontSize: 30,
                fontWeight: 500,
                border: "none",
                outline: "none",
                background: "transparent",
                color: "#2B1F15",
                minWidth: 0,
              }}
            />
            <span
              style={{ fontSize: 13, color: "#6B5A47", fontWeight: 600 }}
            >
              EUR €
            </span>
          </div>

          <Label style={{ marginTop: 14 }}>
            {t("debts.purposeLabel") || "Objet du prêt"}
          </Label>
          <input
            type="text"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder={
              t("debts.purposePlaceholder") ||
              "Ex : apport boutique, réparation voiture…"
            }
            style={inputStyle}
          />
        </Section>

        {/* === V165.C — Mode + dette rétroactive === */}
        <DebtRetroactiveBlock
          value={retroState}
          onChange={setRetroState}
          loanAmount={parseFloat(amount) || 0}
          currency="EUR"
          variant="mobile"
        />

        {/* === Section 2 : Débiteur === */}
        <Section title={t("debts.debtorTitle") || "À qui prêtes-tu ?"}>
          <Label>{t("debts.debtorNameLabel") || "Nom du débiteur"}</Label>
          <input
            type="text"
            value={debtorName}
            onChange={(e) => setDebtorName(e.target.value)}
            placeholder={
              t("debts.debtorNamePlaceholder") || "Ex : Kouassi Mathieu"
            }
            style={inputStyle}
          />
          <Label style={{ marginTop: 14 }}>
            {t("debts.debtorContactLabel") ||
              "Téléphone ou email (pour l'inviter)"}
          </Label>
          <input
            type="text"
            value={debtorContact}
            onChange={(e) => setDebtorContact(e.target.value)}
            placeholder="+33 6 12 34 56 78"
            style={inputStyle}
          />
          <MobileLookupBadge lookup={lookup} t={t} />
          <Hint>
            {t("debts.debtorHint") ||
              "Le débiteur recevra une notification pour signer le contrat de son côté."}
          </Hint>
        </Section>

        {/* === Section 3 : Calendrier + taux === */}
        <Section title={t("debts.scheduleTitle") || "Calendrier & intérêts"}>
          <Label>{t("debts.endDateLabel") || "Échéance finale"}</Label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
            style={inputStyle}
          />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              marginTop: 14,
            }}
          >
            <div>
              <Label>{t("debts.frequencyLabel") || "Fréquence"}</Label>
              <select
                value={frequency}
                onChange={(e) => {
                  const newFreq = e.target.value as Frequency;
                  // V171.F — En mode paiement unique, force 1 échéance pour
                  // que l'UI reflète immédiatement la nouvelle logique.
                  if (newFreq === "LUMP_SUM") {
                    setTotalInstallments(1);
                  } else if (frequency === "LUMP_SUM") {
                    // V179.B — On revient depuis LUMP_SUM vers un mode multi-échéances :
                    // restaure 6 par défaut pour ne pas laisser le user bloqué sur 1.
                    setTotalInstallments(6);
                  }
                  setFrequency(newFreq);
                }}
                style={inputStyle}
              >
                <option value="WEEKLY">{t("debts.freqWeekly") || "Hebdo"}</option>
                <option value="MONTHLY">{t("debts.freqMonthly") || "Mensuelle"}</option>
                <option value="QUARTERLY">{t("debts.freqQuarterly") || "Trimestrielle"}</option>
                <option value="YEARLY">{t("debts.freqYearly") || "Annuelle"}</option>
                {/* V171.E — Paiement unique : 1 échéance à la date de fin */}
                <option value="LUMP_SUM">
                  {t("debts.freqLumpSum") || "Paiement unique"}
                </option>
              </select>
            </div>
            <div>
              <Label>{t("debts.installmentsLabel") || "Nb échéances"}</Label>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={120}
                value={totalInstallments}
                onChange={(e) =>
                  setTotalInstallments(
                    Math.max(1, Math.min(120, parseInt(e.target.value) || 1)),
                  )
                }
                disabled={frequency === "LUMP_SUM"}
                style={{
                  ...inputStyle,
                  opacity: frequency === "LUMP_SUM" ? 0.5 : 1,
                  cursor:
                    frequency === "LUMP_SUM" ? "not-allowed" : "text",
                }}
                title={
                  frequency === "LUMP_SUM"
                    ? t("debts.lumpSumNote") ||
                      "Mode paiement unique : 1 échéance à la date de fin."
                    : undefined
                }
              />
            </div>
          </div>
          {frequency === "LUMP_SUM" && (
            <div
              style={{
                marginTop: 8,
                padding: "8px 12px",
                background: "rgba(197,138,46,0.10)",
                border: "1px solid rgba(197,138,46,0.30)",
                borderRadius: 10,
                fontSize: 11.5,
                color: "#854F0B",
                lineHeight: 1.5,
              }}
            >
              {t("debts.lumpSumHint") ||
                "Mode paiement unique : la totalité du capital sera remboursée en une seule fois à la date d'échéance choisie ci-dessus."}
            </div>
          )}

          <Label style={{ marginTop: 14 }}>
            {t("debts.interestLabel") || "Taux d'intérêt annuel"}
          </Label>
          <div
            style={{
              background: "#FFFFFF",
              border: "0.5px solid rgba(43,31,21,0.15)",
              borderRadius: 12,
              padding: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <input
                type="number"
                inputMode="decimal"
                step={0.1}
                min={0}
                max={22}
                value={interestRate}
                onChange={(e) =>
                  setInterestRate(
                    Math.max(0, Math.min(22, parseFloat(e.target.value) || 0)),
                  )
                }
                className="bmd-num"
                style={{
                  fontFamily: "Cormorant Garamond, serif",
                  fontSize: 24,
                  fontWeight: 500,
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  color: "#2B1F15",
                  width: 80,
                }}
              />
              <span style={{ fontSize: 13, color: "#6B5A47" }}>%/an</span>
            </div>
            <input
              type="range"
              min={0}
              max={22}
              step={0.1}
              value={interestRate}
              onChange={(e) => setInterestRate(parseFloat(e.target.value))}
              style={{ width: "100%", marginTop: 8 }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 10,
                color: "#6B5A47",
                marginTop: 4,
              }}
            >
              <span>0 %</span>
              <span style={{ color: "#1F7A57" }}>Conso 8 %</span>
              <span style={{ color: "#C58A2E" }}>Risque 15 %</span>
              <span style={{ color: "#9F4628" }}>Stop 22 %</span>
            </div>
          </div>

          {installment != null && totalToPay != null && (
            <div
              style={{
                background: "rgba(31,122,87,0.10)",
                borderRadius: 10,
                padding: "10px 12px",
                fontSize: 11.5,
                color: "#0F6E56",
                marginTop: 12,
                lineHeight: 1.5,
              }}
            >
              {t("debts.installmentSummary") || "Mensualité estimée"} :{" "}
              <strong>{installment.toFixed(2)} €</strong> · {t("debts.totalSummary") || "Total à rembourser"} :{" "}
              <strong>{totalToPay.toFixed(2)} €</strong>
            </div>
          )}
        </Section>

        {error && (
          <div
            style={{
              background: "rgba(159,70,40,0.10)",
              border: "0.5px solid rgba(159,70,40,0.30)",
              borderRadius: 10,
              padding: 12,
              fontSize: 12,
              color: "#9F4628",
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={() => router.push("/dashboard/debts")}
            style={{
              flex: 1,
              background: "transparent",
              border: "0.5px solid rgba(43,31,21,0.25)",
              color: "#2B1F15",
              borderRadius: 12,
              padding: 12,
              fontSize: 13,
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            {t("common.cancel") || "Annuler"}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!isValid || submitting}
            style={{
              flex: 1.4,
              background: !isValid || submitting ? "#D3D1C7" : "#C58A2E",
              color: "#FBF6EC",
              border: "none",
              borderRadius: 12,
              padding: 12,
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "inherit",
              cursor: !isValid || submitting ? "not-allowed" : "pointer",
              opacity: !isValid || submitting ? 0.6 : 1,
            }}
          >
            {submitting
              ? t("common.creating") || "Création…"
              : t("debts.createSubmit") || "Créer le contrat"}
          </button>
        </div>
      </div>
      )}

      {/* V155.H — Modal track record débiteur (mobile + desktop) */}
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
    </ResponsiveShell>
  );
}

/**
 * V155.H — Badge sous champ contact dans wizard mobile (style sobre
 * adapté au layout mobile, palette V45-light).
 */
function MobileLookupBadge({
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
          color: "#6B5A47",
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
          marginTop: 8,
          padding: "10px 12px",
          background: "rgba(31,122,87,0.10)",
          border: "1px solid rgba(31,122,87,0.30)",
          borderRadius: 10,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        {lookup.avatar ? (
          <img
            src={lookup.avatar}
            alt=""
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              objectFit: "cover",
            }}
          />
        ) : (
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              background: "#1F7A57",
              color: "#FBF6EC",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {initials || "?"}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#0F6E56",
              lineHeight: 1.2,
            }}
          >
            ✓ {lookup.displayName}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "#6B5A47",
              marginTop: 2,
            }}
          >
            {t("debts.create.lookup.foundHint") ||
              "Membre BMD existant — infos auto-complétées"}
          </div>
        </div>
      </div>
    );
  }
  // not_found
  return (
    <div
      style={{
        marginTop: 8,
        padding: "10px 12px",
        background: "rgba(133,79,11,0.08)",
        border: "1px solid rgba(133,79,11,0.20)",
        borderRadius: 10,
        fontSize: 12,
        color: "#854F0B",
        lineHeight: 1.4,
      }}
    >
      <strong>
        {t("debts.create.lookup.notFoundTitle") || "Nouveau contact"}
      </strong>
      <div style={{ marginTop: 2, color: "#6B5A47", fontSize: 11 }}>
        {t("debts.create.lookup.notFoundHint") ||
          "Cette personne sera invitée à rejoindre BMD pour signer la reconnaissance."}
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  background: "#FFFFFF",
  border: "0.5px solid rgba(43,31,21,0.15)",
  borderRadius: 10,
  padding: "11px 12px",
  fontSize: 13,
  color: "#2B1F15",
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box" as const,
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: "rgba(255,255,255,0.6)",
        border: "0.5px solid rgba(43,31,21,0.08)",
        borderRadius: 14,
        padding: 14,
      }}
    >
      <h2
        style={{
          fontFamily: "Cormorant Garamond, serif",
          fontSize: 18,
          fontWeight: 500,
          color: "#2B1F15",
          margin: "0 0 12px",
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Label({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        fontSize: 10,
        letterSpacing: 1.2,
        textTransform: "uppercase",
        color: "#6B5A47",
        fontWeight: 700,
        marginBottom: 6,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        color: "#6B5A47",
        fontStyle: "italic",
        marginTop: 6,
        lineHeight: 1.4,
      }}
    >
      {children}
    </div>
  );
}
