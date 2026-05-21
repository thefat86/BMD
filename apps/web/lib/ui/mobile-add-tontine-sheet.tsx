"use client";

/**
 * <MobileAddTontineSheet> · V39.1 — Stepper création tontine avec parité totale.
 *
 * Récupère toutes les fonctionnalités du formulaire desktop :
 *  - Étape 1 : MONTANT par participant + FRÉQUENCE
 *  - Étape 2 : DATE + ORDRE (RANDOM / MANUAL / AUCTION) + (si MANUAL) réordo
 *  - Étape 3 : OPTIONS (pot centralisé) + NOTES + RÉCAP + bouton Créer
 *
 * Le mode MANUAL permet de réordonner les membres avec boutons ↑↓ (drag-and-drop
 * mobile complexe, on garde simple). Si l'utilisateur active MANUAL et active
 * la tontine immédiatement, on envoie `beneficiaryOrder` via `activateTontine`.
 *
 * AUCTION (Hui) : enchères, ordre déterminé tour par tour. L'admin n'a rien
 * à pré-ordonner ; on affiche un bandeau explicatif.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BottomSheet } from "./bottom-sheet";
import { api } from "../api-client";
import { useToast } from "./toast";
// V124 — Confirm-before-close si l'utilisateur a déjà commencé à saisir.
import { useDialog } from "./dialog-provider";
import { haptic } from "../platform";
import { useT } from "../i18n/app-strings";
import { Icon } from "./icons";
import { NumpadKeypad } from "./numpad-keypad";

interface Member {
  id: string;
  role: string;
  user: { id: string; displayName: string; avatar?: string | null };
}

type Frequency = "WEEKLY" | "BIWEEKLY" | "MONTHLY";
type OrderMode = "RANDOM" | "MANUAL" | "AUCTION";

interface Props {
  open: boolean;
  onClose: () => void;
  groupId: string;
  members: Member[];
  defaultCurrency: string;
  onCreated: () => void;
}

type Step = 1 | 2 | 3;

export function MobileAddTontineSheet({
  open,
  onClose,
  groupId,
  members,
  defaultCurrency,
  onCreated,
}: Props) {
  const t = useT();
  const toast = useToast();
  const dialog = useDialog();

  const [step, setStep] = useState<Step>(1);
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("MONTHLY");
  const [startDate, setStartDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [orderMode, setOrderMode] = useState<OrderMode>("RANDOM");
  const [manualOrder, setManualOrder] = useState<string[]>([]);
  // V116 — Backfill « tontine déjà entamée » : nombre de bénéficiaires
  // qui ont déjà reçu le pot AVANT que la tontine soit enregistrée dans
  // BMD. Si > 0, on active immédiatement la tontine après création avec
  // ces N premiers de `manualOrder` marqués servis. Forcément utilisé en
  // MANUAL (pas de sens en RANDOM puisque l'ordre est tiré au sort).
  const [servedCount, setServedCount] = useState(0);
  const [centralizedPot, setCentralizedPot] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setAmount("");
    setFrequency("MONTHLY");
    setStartDate(new Date().toISOString().slice(0, 10));
    setOrderMode("RANDOM");
    setManualOrder(members.map((m) => m.user.id));
    setServedCount(0);
    setCentralizedPot(false);
    setNotes("");
  }, [open, members]);

  // V116 — Détecte si la date saisie est dans le passé (= cas backfill).
  // On compare en YYYY-MM-DD pour éviter les pièges de fuseau horaire.
  const isPastStartDate = startDate < new Date().toISOString().slice(0, 10);

  // V116 — Si l'admin sélectionne une date passée, on force MANUAL
  // (impossible de backfill sans connaître l'ordre exact). Et on
  // remet servedCount à 0 si l'utilisateur change pour une date future.
  useEffect(() => {
    if (isPastStartDate && orderMode !== "MANUAL") {
      setOrderMode("MANUAL");
    }
    if (!isPastStartDate && servedCount > 0) {
      setServedCount(0);
    }
  }, [isPastStartDate, orderMode, servedCount]);

  const amountNumber = parseFloat(amount.replace(",", ".")) || 0;
  const canGoNext =
    step === 1
      ? amountNumber > 0
      : step === 2
        ? !!startDate &&
          (orderMode !== "MANUAL" || manualOrder.length === members.length)
        : true;

  function next() {
    if (!canGoNext) return;
    if (step < 3) {
      setStep((s) => (s + 1) as Step);
      haptic("tap");
    } else {
      void submit();
    }
  }
  function prev() {
    if (step > 1) {
      setStep((s) => (s - 1) as Step);
      haptic("tap");
    }
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      // V116 — Bug fix : le backend exige un ISO 8601 complet
      // (z.string().datetime()), or l'input type=date renvoie `YYYY-MM-DD`
      // → erreur Zod "Invalid datetime". On normalise ici : on parse en
      // local (12:00 pour éviter les pièges de fuseau horaire qui
      // décalent la date d'un jour) et on émet l'ISO complet avec offset Z.
      const startDateIso = new Date(`${startDate}T12:00:00`).toISOString();
      const created = await api.createTontine(groupId, {
        contributionAmount: amountNumber.toFixed(2),
        currency: defaultCurrency,
        frequency,
        startDate: startDateIso,
        orderMode,
        centralizedPot,
        notes: notes.trim() || undefined,
      });

      // V116 — Si backfill (bénéficiaires déjà servis avant BMD) → activer
      // avec alreadyServedUserIds. Sinon, on active quand même immédiatement
      // pour générer la roue + classement — sinon la tontine reste en DRAFT
      // sans aucun bouton Activer côté mobile et l'utilisateur est bloqué.
      //
      // V134 — Avant ce fix, le mobile-tontine-view ne montrait aucun bouton
      // "Activer la tontine" pour les DRAFT (contrairement au desktop qui
      // chaînait création + activation auto). Conséquence : tontine créée
      // visible mais sans roue, sans classement, sans moyen d'avancer.
      // Maintenant on aligne le mobile sur le desktop : créer = activer.
      const willBackfill = servedCount > 0 && orderMode === "MANUAL";
      try {
        if (willBackfill) {
          await api.activateTontine(
            created.id,
            manualOrder,
            manualOrder.slice(0, servedCount),
          );
        } else if (orderMode === "MANUAL") {
          await api.activateTontine(created.id, manualOrder);
        } else {
          // RANDOM ou AUCTION : pas besoin d'ordre, le backend le tire au sort
          await api.activateTontine(created.id);
        }
      } catch (activateErr) {
        // Si l'activation plante, on garde le brouillon créé et on prévient
        // l'utilisateur — il pourra retenter depuis la page dédiée (cf V134).
        haptic("warn");
        toast.info(
          t("tontine.createdNotActivated") ||
            `Tontine créée mais l'activation a échoué : ${(activateErr as Error).message}. Tu peux la lancer depuis la page dédiée.`,
        );
        // On sort sans throw pour ne pas masquer la création — l'utilisateur
        // navigue dans la page tontine et active manuellement.
        onCreated();
        return;
      }

      haptic("success");
      toast.info(
        t("tontine.createdAndActivated") ||
          "Tontine créée et lancée — la roue est prête.",
      );
      onCreated();
    } catch (e) {
      haptic("error");
      toast.info((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const totalPerCycle = amountNumber * members.length;

  return (
    <BottomSheet
      open={open}
      onClose={() => {
        if (submitting) return;
        // V124 — Confirm-before-close : on regarde les VRAIS signaux de
        // saisie (montant > 0, notes, choix d'ordre manuel custom). On
        // n'inclut PAS `manualOrder` ni `centralizedPot` car ils sont
        // pré-remplis au mount avec des valeurs par défaut, donc leur
        // présence ne signifie pas "l'utilisateur a saisi quelque chose".
        const isDirty =
          amount.trim().length > 0 ||
          notes.trim().length > 0 ||
          servedCount > 0 ||
          orderMode !== "RANDOM";
        if (!isDirty) {
          onClose();
          return;
        }
        void (async () => {
          const ok = await dialog.confirm(
            t("tontine.discardConfirmBody") ||
              "Tu vas perdre les infos déjà saisies. Veux-tu vraiment fermer ?",
            {
              title: t("tontine.discardConfirmTitle") || "Fermer sans créer ?",
              confirmLabel: t("tontine.discardYes") || "Oui, fermer",
              cancelLabel: t("common.cancel") || "Annuler",
              variant: "danger",
            },
          );
          if (ok) onClose();
        })();
      }}
      title={t("tontine.newTontine") || "Nouvelle tontine"}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* V43 — Stepper avec labels visibles sous chaque barre */}
        <TontineStepper step={step} t={t} />

        {/* V43 — Hero pédagogique pour expliquer l'étape en cours.
            Critique pour les utilisateurs qui découvrent la tontine
            (rotation, fréquence, ordre…). */}
        <TontineStepHero
          step={step}
          amount={amount}
          currency={defaultCurrency}
          memberCount={members.length}
          frequency={frequency}
          t={t}
        />

        {step === 1 && (
          <StepAmountFreq
            amount={amount}
            setAmount={setAmount}
            frequency={frequency}
            setFrequency={setFrequency}
            currency={defaultCurrency}
            memberCount={members.length}
            totalPerCycle={totalPerCycle}
            t={t}
          />
        )}

        {step === 2 && (
          <StepDateOrder
            startDate={startDate}
            setStartDate={setStartDate}
            orderMode={orderMode}
            setOrderMode={setOrderMode}
            members={members}
            manualOrder={manualOrder}
            setManualOrder={setManualOrder}
            isPastStartDate={isPastStartDate}
            servedCount={servedCount}
            setServedCount={setServedCount}
            t={t}
          />
        )}

        {step === 3 && (
          <StepOptionsRecap
            amountNumber={amountNumber}
            currency={defaultCurrency}
            frequency={frequency}
            startDate={startDate}
            orderMode={orderMode}
            memberCount={members.length}
            totalPerCycle={totalPerCycle}
            centralizedPot={centralizedPot}
            setCentralizedPot={setCentralizedPot}
            notes={notes}
            setNotes={setNotes}
            t={t}
          />
        )}

        <div
          style={{
            display: "flex",
            gap: 8,
            paddingTop: 8,
            borderTop: "1px solid rgba(244,228,193,0.06)",
            marginTop: 4,
          }}
        >
          {step > 1 && (
            <button
              type="button"
              onClick={prev}
              disabled={submitting}
              style={{
                flex: 1,
                padding: "14px 20px",
                background: "transparent",
                color: "var(--cream-soft)",
                border: "1px solid rgba(244,228,193,0.18)",
                borderRadius: 14,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {t("common.back") || "Retour"}
            </button>
          )}
          <button
            type="button"
            onClick={next}
            disabled={!canGoNext || submitting}
            style={{
              flex: 2,
              padding: "14px 20px",
              background:
                canGoNext && !submitting
                  ? "linear-gradient(135deg, var(--saffron), var(--terracotta))"
                  : "rgba(244,228,193,0.10)",
              color: canGoNext && !submitting ? "#16111E" : "var(--muted)",
              border: "none",
              borderRadius: 14,
              fontSize: 14,
              fontWeight: 700,
              cursor: canGoNext && !submitting ? "pointer" : "not-allowed",
              fontFamily: "inherit",
              touchAction: "manipulation",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting
              ? t("common.sending") || "Création…"
              : step === 3
                ? t("tontine.createCta") || "Créer la tontine"
                : t("common.next") || "Suivant"}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

// ============ STEP 1 ============

function StepAmountFreq({
  amount,
  setAmount,
  frequency,
  setFrequency,
  currency,
  memberCount,
  totalPerCycle,
  t,
}: {
  amount: string;
  setAmount: (v: string) => void;
  frequency: Frequency;
  setFrequency: (f: Frequency) => void;
  currency: string;
  memberCount: number;
  totalPerCycle: number;
  t: ReturnType<typeof useT>;
}) {
  const amountNum = parseFloat(amount.replace(",", ".")) || 0;
  const cyclePot = amountNum * memberCount;
  const isXAFLike = ["XAF", "XOF"].includes(currency);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 18,
        maxWidth: "100%",
      }}
    >
      <div style={{ maxWidth: "100%" }}>
        <label
          style={{
            display: "block",
            fontSize: 10,
            color: "var(--v45-saffron, var(--saffron))",
            textTransform: "uppercase",
            letterSpacing: 1.4,
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          {t("tontine.amountPerPerson") || "Montant par participant"}
        </label>
        {/* Display Cormorant — affichage seul, saisie via numpad */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "center",
            gap: 8,
            padding: "16px 14px",
            background: "var(--paper, rgba(244,228,193,0.04))",
            border: "1px solid var(--v45-saffron-soft, rgba(232,163,61,0.25))",
            borderRadius: 16,
            marginBottom: 10,
            maxWidth: "100%",
            overflow: "hidden",
          }}
        >
          <span
            style={{
              fontFamily: "Cormorant Garamond, serif",
              fontSize: 38,
              fontWeight: 700,
              color: "var(--cocoa, var(--cream))",
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {amount || "0"}
          </span>
          <span
            style={{
              fontSize: 18,
              color: "var(--v45-saffron, var(--saffron))",
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {currency}
          </span>
        </div>
        {/* Fallback accessible : input caché synchronisé pour autofill/lecteurs d'écran */}
        <input
          type="text"
          inputMode="decimal"
          aria-label={t("tontine.amountPerPerson") || "Montant par participant"}
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: "hidden",
            clip: "rect(0,0,0,0)",
            whiteSpace: "nowrap",
            border: 0,
          }}
          tabIndex={-1}
        />
        {/* Numpad V45 custom */}
        <NumpadKeypad
          value={amount}
          onChange={setAmount}
          maxDecimals={isXAFLike ? 0 : 2}
          decimalSeparator=","
        />

        {/* Bandeau équation live V45 */}
        {amount && amountNum > 0 && memberCount > 0 && (
          <div
            style={{
              marginTop: 12,
              padding: "12px 14px",
              background:
                "var(--v45-saffron-pale, rgba(232,163,61,0.10))",
              border:
                "1px solid var(--v45-saffron-soft, rgba(232,200,136,0.4))",
              borderRadius: 12,
              textAlign: "center",
              lineHeight: 1.5,
              maxWidth: "100%",
            }}
          >
            <div style={{ fontSize: 14, color: "var(--cocoa, var(--cream))" }}>
              <strong
                style={{
                  color: "var(--v45-saffron, var(--saffron))",
                }}
              >
                {amount} {currency}
              </strong>
              {" × "}
              <strong>{memberCount} membres</strong>
              {" = "}
              <strong
                style={{
                  fontFamily: "Cormorant Garamond, serif",
                  fontSize: 18,
                }}
              >
                {cyclePot.toFixed(isXAFLike ? 0 : 2)} {currency}
              </strong>
            </div>
            <div
              style={{
                fontSize: 11.5,
                color: "var(--cocoa-soft, var(--cream-soft))",
                marginTop: 4,
                fontStyle: "italic",
              }}
            >
              Sur {memberCount} cycles → chacun reçoit le pot une fois
            </div>
          </div>
        )}

        {totalPerCycle > 0 && (
          <div
            style={{
              fontSize: 11,
              color: "var(--cocoa-soft, var(--cream-soft))",
              marginTop: 6,
              paddingLeft: 4,
            }}
          >
            {t("tontine.totalPerCycle", {
              count: String(memberCount),
              amount: totalPerCycle.toLocaleString("fr-FR", {
                minimumFractionDigits: isXAFLike ? 0 : 2,
                maximumFractionDigits: isXAFLike ? 0 : 2,
              }),
              currency,
            }) ||
              `Cagnotte par cycle : ${memberCount} × ${amount} = ${totalPerCycle.toLocaleString("fr-FR")} ${currency}`}
          </div>
        )}
      </div>

      <div style={{ maxWidth: "100%" }}>
        <label
          style={{
            display: "block",
            fontSize: 10,
            color: "var(--v45-saffron, var(--saffron))",
            textTransform: "uppercase",
            letterSpacing: 1.4,
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          {t("tontine.frequency") || "Fréquence"}
        </label>
        <div style={{ display: "flex", gap: 8, maxWidth: "100%" }}>
          {[
            {
              code: "WEEKLY" as const,
              number: "7",
              unit: t("tontine.freqUnitDays") || "jours",
            },
            {
              code: "BIWEEKLY" as const,
              number: "14",
              unit: t("tontine.freqUnitDays") || "jours",
            },
            {
              code: "MONTHLY" as const,
              number: "1",
              unit: t("tontine.freqUnitMonth") || "mois",
            },
          ].map((freq) => {
            const isSelected = frequency === freq.code;
            return (
              <button
                key={freq.code}
                type="button"
                onClick={() => setFrequency(freq.code)}
                style={{
                  flex: 1,
                  padding: "14px 8px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  background: isSelected
                    ? "linear-gradient(135deg, var(--v45-saffron-pale, rgba(232,163,61,0.18)), var(--paper, rgba(244,228,193,0.04)))"
                    : "var(--paper, rgba(244,228,193,0.04))",
                  border: isSelected
                    ? "1.5px solid var(--v45-saffron, var(--saffron))"
                    : "1px solid var(--v45-line, rgba(43,31,21,0.08))",
                  borderRadius: 12,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  color: "var(--cocoa, var(--cream))",
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    fontFamily: "Cormorant Garamond, serif",
                    fontSize: 28,
                    fontWeight: 700,
                    color: isSelected
                      ? "var(--v45-saffron, var(--saffron))"
                      : "var(--cocoa, var(--cream))",
                    lineHeight: 1,
                  }}
                >
                  {freq.number}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--cocoa-soft, var(--cream-soft))",
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                  }}
                >
                  {freq.unit}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============ STEP 2 : DATE + ORDRE + (manual réordo) ============

function StepDateOrder({
  startDate,
  setStartDate,
  orderMode,
  setOrderMode,
  members,
  manualOrder,
  setManualOrder,
  isPastStartDate,
  servedCount,
  setServedCount,
  t,
}: {
  startDate: string;
  setStartDate: (s: string) => void;
  orderMode: OrderMode;
  setOrderMode: (m: OrderMode) => void;
  members: Member[];
  manualOrder: string[];
  setManualOrder: (o: string[]) => void;
  /** V116 — `true` si l'admin a saisi une date dans le passé. Force
   *  l'ordre MANUAL et révèle la section « bénéficiaires déjà servis ». */
  isPastStartDate: boolean;
  servedCount: number;
  setServedCount: (n: number) => void;
  t: ReturnType<typeof useT>;
}) {
  function moveUp(idx: number) {
    if (idx === 0) return;
    const next = [...manualOrder];
    [next[idx - 1], next[idx]] = [next[idx]!, next[idx - 1]!];
    setManualOrder(next);
    haptic("tap");
  }
  function moveDown(idx: number) {
    if (idx === manualOrder.length - 1) return;
    const next = [...manualOrder];
    [next[idx + 1], next[idx]] = [next[idx]!, next[idx + 1]!];
    setManualOrder(next);
    haptic("tap");
  }

  const memberById = useMemo(() => {
    const m = new Map<string, string>();
    for (const mem of members) m.set(mem.user.id, mem.user.displayName);
    return m;
  }, [members]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <label
          style={{
            display: "block",
            fontSize: 10,
            color: "var(--saffron)",
            textTransform: "uppercase",
            letterSpacing: 1.4,
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          {t("tontine.startDate") || "Date de démarrage"}
        </label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          style={{
            width: "100%",
            padding: "14px 14px",
            background: "rgba(244,228,193,0.04)",
            border: "1px solid rgba(232,163,61,0.25)",
            borderRadius: 14,
            color: "var(--cream)",
            fontSize: 14,
            fontFamily: "inherit",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      <div>
        <label
          style={{
            display: "block",
            fontSize: 10,
            color: "var(--saffron)",
            textTransform: "uppercase",
            letterSpacing: 1.4,
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          {t("tontine.orderMode") || "Ordre de réception"}
        </label>
        <div style={{ display: "flex", gap: 6 }}>
          <OrderTile
            active={orderMode === "RANDOM"}
            onClick={() => setOrderMode("RANDOM")}
            icon="🎲"
            label={t("tontine.orderRandom") || "Aléatoire"}
          />
          {/* V52.C3 — SVG pencil remplace EMOJI */}
          <OrderTile
            active={orderMode === "MANUAL"}
            onClick={() => setOrderMode("MANUAL")}
            icon={<Icon name="pencil" size={16} color="currentColor" strokeWidth={1.6} />}
            label={t("tontine.orderManual") || "Manuel"}
          />
          {/* V52.C3 — SVG trophy remplace EMOJI */}
          <OrderTile
            active={orderMode === "AUCTION"}
            onClick={() => setOrderMode("AUCTION")}
            icon={<Icon name="trophy" size={16} color="currentColor" strokeWidth={1.6} />}
            label={t("tontine.orderAuction") || "Enchères"}
          />
        </div>
        <p
          style={{
            fontSize: 11,
            color: "var(--cream-soft)",
            marginTop: 8,
            lineHeight: 1.5,
            opacity: 0.8,
          }}
        >
          {orderMode === "RANDOM"
            ? t("tontine.randomHint") ||
              "Un tirage au sort sera fait à l'activation de la tontine."
            : orderMode === "MANUAL"
              ? t("tontine.manualHint") ||
                "Réordonne les membres ci-dessous. Ton choix sera appliqué à l'activation."
              : t("tontine.auctionHint") ||
                "À chaque tour, les membres enchérissent un montant qu'ils acceptent de sacrifier pour gagner le pot complet (système Hui)."}
        </p>
      </div>

      {/* V116 — Bandeau backfill : visible quand la date est passée
          (forcément MANUAL, cf. useEffect d'autorégulation côté parent).
          Permet à l'admin d'indiquer combien de bénéficiaires ont déjà
          reçu le pot avant l'enregistrement BMD — la roue rotative se
          construit alors avec les rangs servis en vert et le bon cycle
          courant à l'activation immédiate (cf. submit). */}
      {orderMode === "MANUAL" && isPastStartDate && (
        <div
          style={{
            background:
              "linear-gradient(135deg, rgba(125,197,158,0.10), rgba(125,197,158,0.04))",
            border: "1px solid rgba(125,197,158,0.30)",
            borderRadius: 12,
            padding: 12,
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: "var(--emerald, #4F8E6E)",
              fontWeight: 700,
              marginBottom: 4,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Icon name="rotate-cw" size={14} strokeWidth={2} />
            {t("tontine.backfillTitle") || "Cette tontine a déjà démarré"}
          </div>
          <p
            style={{
              fontSize: 11.5,
              color: "var(--cream-soft, var(--cocoa-soft))",
              margin: "0 0 10px",
              lineHeight: 1.5,
            }}
          >
            {t("tontine.backfillHint") ||
              "Indique combien de personnes ont déjà reçu le pot. La roue sera initialisée avec leur rang en vert, et le bénéficiaire courant sera la personne suivante dans l'ordre."}
          </p>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              background: "var(--paper, rgba(255,255,255,0.04))",
              borderRadius: 10,
              border: "1px solid rgba(125,197,158,0.20)",
            }}
          >
            <button
              type="button"
              onClick={() => {
                if (servedCount > 0) {
                  setServedCount(servedCount - 1);
                  haptic("tap");
                }
              }}
              disabled={servedCount === 0}
              aria-label="Moins"
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                background:
                  servedCount === 0
                    ? "rgba(43,31,21,0.06)"
                    : "var(--emerald, #4F8E6E)",
                color: servedCount === 0 ? "var(--muted)" : "#FFFFFF",
                border: "none",
                fontSize: 18,
                fontWeight: 700,
                cursor: servedCount === 0 ? "not-allowed" : "pointer",
                opacity: servedCount === 0 ? 0.4 : 1,
                touchAction: "manipulation",
                fontFamily: "inherit",
              }}
            >
              −
            </button>
            <div
              style={{
                flex: 1,
                textAlign: "center",
                fontSize: 13,
                color: "var(--cream)",
              }}
            >
              <span
                style={{
                  fontFamily: "Cormorant Garamond, serif",
                  fontSize: 22,
                  fontWeight: 700,
                  color: "var(--emerald, #4F8E6E)",
                }}
              >
                {servedCount}
              </span>
              <span style={{ opacity: 0.7, margin: "0 4px" }}>/</span>
              <span style={{ fontSize: 13 }}>
                {manualOrder.length}{" "}
                {t("tontine.beneficiaries") || "bénéficiaires"}
              </span>
              <div
                style={{
                  fontSize: 10.5,
                  color: "var(--cream-soft, var(--cocoa-soft))",
                  marginTop: 2,
                  letterSpacing: 0.2,
                }}
              >
                {servedCount === 0
                  ? t("tontine.backfillNone") || "Personne n'a encore reçu"
                  : servedCount === manualOrder.length - 1
                    ? t("tontine.backfillAlmostAll") ||
                      "Tous sauf un ont reçu"
                    : `${servedCount} ${t("tontine.alreadyServed") || "déjà servis"}`}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (servedCount < manualOrder.length - 1) {
                  setServedCount(servedCount + 1);
                  haptic("tap");
                }
              }}
              disabled={servedCount >= manualOrder.length - 1}
              aria-label="Plus"
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                background:
                  servedCount >= manualOrder.length - 1
                    ? "rgba(43,31,21,0.06)"
                    : "var(--emerald, #4F8E6E)",
                color:
                  servedCount >= manualOrder.length - 1
                    ? "var(--muted)"
                    : "#FFFFFF",
                border: "none",
                fontSize: 18,
                fontWeight: 700,
                cursor:
                  servedCount >= manualOrder.length - 1
                    ? "not-allowed"
                    : "pointer",
                opacity: servedCount >= manualOrder.length - 1 ? 0.4 : 1,
                touchAction: "manipulation",
                fontFamily: "inherit",
              }}
            >
              +
            </button>
          </div>
        </div>
      )}

      {orderMode === "MANUAL" && (
        <div
          style={{
            background: "rgba(244,228,193,0.03)",
            border: "1px solid rgba(244,228,193,0.06)",
            borderRadius: 12,
            padding: 10,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "var(--muted)",
              textTransform: "uppercase",
              letterSpacing: 1.2,
              fontWeight: 700,
              marginBottom: 8,
              paddingLeft: 4,
            }}
          >
            {t("tontine.beneficiaryOrder") || "Ordre des bénéficiaires"}
          </div>
          <div
            style={{ display: "flex", flexDirection: "column", gap: 4 }}
          >
            {manualOrder.map((uid, idx) => {
              const name = memberById.get(uid) ?? "?";
              // V116 — Marquage visuel des rangs servis (vert) /
              // courant (saffron solide) / à venir (saffron pale). En
              // accord avec la spec roue rotative (V52.E2/F3).
              const isServed = idx < servedCount;
              const isCurrent = idx === servedCount && servedCount > 0;
              return (
                <div
                  key={uid}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 8px",
                    background: isServed
                      ? "rgba(125,197,158,0.10)"
                      : isCurrent
                        ? "rgba(232,163,61,0.12)"
                        : "rgba(244,228,193,0.04)",
                    border: isServed
                      ? "1px solid rgba(125,197,158,0.35)"
                      : isCurrent
                        ? "1px solid rgba(232,163,61,0.45)"
                        : "1px solid rgba(244,228,193,0.08)",
                    borderRadius: 10,
                    transition: "background 160ms ease",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 8,
                      background: isServed
                        ? "var(--emerald, #4F8E6E)"
                        : isCurrent
                          ? "linear-gradient(135deg, var(--saffron), var(--terracotta))"
                          : "rgba(232,163,61,0.18)",
                      color: isServed || isCurrent ? "#FFFFFF" : "var(--saffron)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 800,
                      flexShrink: 0,
                    }}
                  >
                    {isServed ? "✓" : idx + 1}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      fontSize: 13,
                      color: "var(--cream)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      opacity: isServed ? 0.75 : 1,
                    }}
                  >
                    {name}
                    {isCurrent && (
                      <span
                        style={{
                          fontSize: 9.5,
                          color: "var(--saffron)",
                          marginLeft: 6,
                          fontWeight: 700,
                          letterSpacing: 0.5,
                          textTransform: "uppercase",
                        }}
                      >
                        {t("tontine.currentTurn") || "Cycle courant"}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    aria-label="Monter"
                    onClick={() => moveUp(idx)}
                    disabled={idx === 0}
                    style={arrowBtnStyle(idx === 0)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label="Descendre"
                    onClick={() => moveDown(idx)}
                    disabled={idx === manualOrder.length - 1}
                    style={arrowBtnStyle(idx === manualOrder.length - 1)}
                  >
                    ↓
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function OrderTile({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: "12px 6px",
        background: active
          ? "linear-gradient(135deg, var(--saffron), var(--terracotta))"
          : "rgba(244,228,193,0.04)",
        color: active ? "#16111E" : "var(--cream)",
        border: active
          ? "1px solid rgba(232,163,61,0.50)"
          : "1px solid rgba(244,228,193,0.10)",
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
        fontFamily: "inherit",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 3,
      }}
    >
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ letterSpacing: 0.2 }}>{label}</span>
    </button>
  );
}

function arrowBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 28,
    height: 28,
    borderRadius: 8,
    background: "rgba(244,228,193,0.06)",
    border: "1px solid rgba(244,228,193,0.10)",
    color: disabled ? "var(--muted)" : "var(--cream)",
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "inherit",
    fontSize: 14,
    fontWeight: 700,
    opacity: disabled ? 0.4 : 1,
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
    flexShrink: 0,
  };
}

// ============ STEP 3 : OPTIONS + RÉCAP ============

function StepOptionsRecap({
  amountNumber,
  currency,
  frequency,
  startDate,
  orderMode,
  memberCount,
  totalPerCycle,
  centralizedPot,
  setCentralizedPot,
  notes,
  setNotes,
  t,
}: {
  amountNumber: number;
  currency: string;
  frequency: Frequency;
  startDate: string;
  orderMode: OrderMode;
  memberCount: number;
  totalPerCycle: number;
  centralizedPot: boolean;
  setCentralizedPot: (b: boolean) => void;
  notes: string;
  setNotes: (s: string) => void;
  t: ReturnType<typeof useT>;
}) {
  const freqLabel: Record<Frequency, string> = {
    WEEKLY: t("tontine.freqWeeklyLong") || "Toutes les semaines",
    BIWEEKLY: t("tontine.freqBiweeklyLong") || "Toutes les 2 semaines",
    MONTHLY: t("tontine.freqMonthlyLong") || "Tous les mois",
  };
  const orderLabel: Record<OrderMode, string> = {
    RANDOM: t("tontine.orderRandomLong") || "Tirage au sort",
    MANUAL: t("tontine.orderManualLong") || "Ordre défini par l'admin",
    AUCTION: t("tontine.orderAuctionLong") || "Enchères (Hui)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Cagnotte */}
      <div
        style={{
          padding: "16px 14px",
          background:
            "linear-gradient(135deg, rgba(232,163,61,0.10), rgba(181,70,46,0.05))",
          border: "1px solid rgba(232,163,61,0.30)",
          borderRadius: 14,
        }}
      >
        <div
          style={{
            fontSize: 10,
            color: "var(--saffron)",
            textTransform: "uppercase",
            letterSpacing: 1.4,
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          {t("tontine.cagnotte") || "Cagnotte par cycle"}
        </div>
        <div
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 30,
            fontWeight: 700,
            color: "var(--cream)",
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
          }}
        >
          {totalPerCycle.toLocaleString("fr-FR", {
            minimumFractionDigits: ["XAF", "XOF"].includes(currency) ? 0 : 2,
            maximumFractionDigits: ["XAF", "XOF"].includes(currency) ? 0 : 2,
          })}{" "}
          <span style={{ fontSize: 16, color: "var(--saffron)" }}>
            {currency}
          </span>
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--cream-soft)",
            marginTop: 6,
          }}
        >
          {memberCount} ×{" "}
          {amountNumber.toLocaleString("fr-FR", {
            minimumFractionDigits: ["XAF", "XOF"].includes(currency) ? 0 : 2,
            maximumFractionDigits: ["XAF", "XOF"].includes(currency) ? 0 : 2,
          })}{" "}
          {currency} · {freqLabel[frequency].toLowerCase()}
        </div>
      </div>

      <RecapRow label={t("tontine.frequency") || "Fréquence"} value={freqLabel[frequency]} />
      <RecapRow
        label={t("tontine.startDate") || "Démarrage"}
        value={new Date(startDate).toLocaleDateString("fr-FR", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      />
      <RecapRow
        label={t("tontine.orderMode") || "Ordre"}
        value={orderLabel[orderMode]}
      />

      {/* Pot centralisé toggle */}
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 12px",
          background: "rgba(244,228,193,0.03)",
          border: "1px solid rgba(244,228,193,0.08)",
          borderRadius: 11,
          cursor: "pointer",
          touchAction: "manipulation",
        }}
      >
        <input
          type="checkbox"
          checked={centralizedPot}
          onChange={(e) => setCentralizedPot(e.target.checked)}
          style={{
            width: 18,
            height: 18,
            accentColor: "var(--saffron, #e8a33d)",
            cursor: "pointer",
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--cream)",
            }}
          >
            {t("tontine.centralizedPot") || "Pot centralisé"}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--cream-soft)",
              marginTop: 2,
              lineHeight: 1.4,
            }}
          >
            {t("tontine.centralizedPotHint") ||
              "Toutes les contributions s'accumulent avant la distribution finale (sinon, chaque bénéficiaire reçoit le pot de son tour)."}
          </div>
        </div>
      </label>

      {/* Notes */}
      <div>
        <label
          style={{
            display: "block",
            fontSize: 10,
            color: "var(--saffron)",
            textTransform: "uppercase",
            letterSpacing: 1.4,
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          {t("tontine.notesLabel") || "Notes (optionnel)"}
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={
            t("tontine.notesPlaceholder") ||
            "Règles spéciales, contexte, etc."
          }
          rows={2}
          style={{
            width: "100%",
            padding: "10px 12px",
            background: "rgba(244,228,193,0.04)",
            border: "1px solid rgba(244,228,193,0.10)",
            borderRadius: 12,
            color: "var(--cream)",
            fontSize: 13,
            fontFamily: "inherit",
            outline: "none",
            boxSizing: "border-box",
            resize: "vertical",
            minHeight: 60,
          }}
        />
      </div>

      <p
        style={{
          fontSize: 11,
          color: "var(--cream-soft)",
          textAlign: "center",
          margin: 0,
          lineHeight: 1.6,
          opacity: 0.85,
          padding: "8px 4px",
        }}
      >
        {t("tontine.createDraftHint") ||
          "La tontine sera créée en brouillon. Tu pourras l'activer ensuite depuis sa page dédiée."}
      </p>
    </div>
  );
}

function RecapRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "10px 12px",
        background: "rgba(244,228,193,0.03)",
        border: "1px solid rgba(244,228,193,0.06)",
        borderRadius: 11,
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: 0.6,
          fontWeight: 700,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 13,
          color: "var(--cream)",
          fontWeight: 600,
          textAlign: "right",
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ============ V43 · Stepper + Hero pédagogique tontine ============

function TontineStepper({
  step,
  t,
}: {
  step: Step;
  t: ReturnType<typeof useT>;
}) {
  const labels = [
    t("tontine.stepperAmount") || "Montant",
    t("tontine.stepperCalendar") || "Calendrier",
    t("tontine.stepperRecap") || "Récap",
  ];
  return (
    <div
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={3}
      aria-valuenow={step}
      style={{ display: "flex", flexDirection: "column", gap: 6 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {[1, 2, 3].map((s) => (
          <span
            key={s}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 999,
              background:
                s <= step
                  ? "linear-gradient(135deg, var(--saffron), var(--terracotta))"
                  : "rgba(244,228,193,0.10)",
              transition: "background 0.2s ease",
            }}
            aria-hidden
          />
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {labels.map((label, i) => {
          const s = (i + 1) as Step;
          const active = s === step;
          const done = s < step;
          return (
            <span
              key={label}
              style={{
                flex: 1,
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: 1.2,
                textTransform: "uppercase",
                textAlign: "center",
                color: active
                  ? "var(--saffron, #E8A33D)"
                  : done
                    ? "var(--cream-soft, #d4c4a8)"
                    : "var(--muted, #8A7B6B)",
                opacity: active ? 1 : 0.7,
              }}
            >
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * V43 — Hero contextuel : explique chaque étape en clair, surtout pour les
 * utilisateurs qui ne connaissent pas la mécanique de tontine (rotation,
 * ordre, fréquence). Affiche un récap discret de la cotisation par cycle
 * dès l'étape 2 pour garder le fil.
 */
function TontineStepHero({
  step,
  amount,
  currency,
  memberCount,
  frequency,
  t,
}: {
  step: Step;
  amount: string;
  currency: string;
  memberCount: number;
  frequency: Frequency;
  t: ReturnType<typeof useT>;
}) {
  const titles = {
    1:
      t("tontine.heroAmountTitle") ||
      "Combien chacun mettra ?",
    2:
      t("tontine.heroCalendarTitle") ||
      "Quand et dans quel ordre ?",
    3:
      t("tontine.heroRecapTitle") ||
      "Vérifie et lance la tontine",
  } as const;
  const subtitles = {
    1:
      t("tontine.heroAmountSub") ||
      "La cotisation que chaque membre versera à chaque cycle. C'est la même pour tout le monde.",
    2:
      t("tontine.heroCalendarSub") ||
      "Date du 1er tour + comment l'ordre des bénéficiaires est décidé.",
    3:
      t("tontine.heroRecapSub") ||
      "Dernière vérif : pot, options et création.",
  } as const;

  const amountNum = parseFloat(amount.replace(",", ".")) || 0;
  const cyclePot = amountNum * memberCount;
  const showRecap = step !== 1 && amountNum > 0 && memberCount > 0;

  const freqLabel: Record<Frequency, string> = {
    WEEKLY: t("tontine.freqWeekly") || "hebdomadaire",
    BIWEEKLY: t("tontine.freqBiweekly") || "bimensuel",
    MONTHLY: t("tontine.freqMonthly") || "mensuel",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <h3
        style={{
          fontFamily: "Cormorant Garamond, Georgia, serif",
          fontSize: 20,
          fontWeight: 700,
          color: "var(--cream)",
          margin: 0,
          lineHeight: 1.15,
        }}
      >
        {titles[step]}
      </h3>
      <p
        style={{
          fontSize: 12.5,
          color: "var(--cream-soft, #d4c4a8)",
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        {subtitles[step]}
      </p>
      {showRecap && (
        <div
          style={{
            marginTop: 6,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 10px",
            background:
              "linear-gradient(135deg, rgba(232,163,61,0.10), rgba(91,108,255,0.05))",
            border: "1px solid rgba(232,163,61,0.20)",
            borderRadius: 10,
            fontSize: 11,
            color: "var(--cream-soft, #d4c4a8)",
            alignSelf: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontWeight: 700,
              color: "var(--saffron, #E8A33D)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {amountNum.toFixed(2)} {currency}
          </span>
          <span aria-hidden style={{ opacity: 0.5 }}>×</span>
          <span>
            {memberCount}{" "}
            {memberCount > 1
              ? t("tontine.heroMembers") || "membres"
              : t("tontine.heroMember") || "membre"}
          </span>
          <span aria-hidden style={{ opacity: 0.5 }}>=</span>
          <span
            style={{
              fontWeight: 700,
              color: "var(--saffron, #E8A33D)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {cyclePot.toFixed(2)} {currency}
          </span>
          <span style={{ opacity: 0.7 }}>
            / {freqLabel[frequency]}
          </span>
        </div>
      )}
    </div>
  );
}
