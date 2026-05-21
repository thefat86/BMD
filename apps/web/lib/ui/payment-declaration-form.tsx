"use client";

/**
 * V141 — Formulaire unifié de DÉCLARATION d'un paiement effectué.
 *
 * Réutilisé partout où un user dit « j'ai payé X à Y » :
 *   - Tontine : marquer une cotisation comme payée
 *   - Settlement (règlement entre membres) : marquer une dette comme réglée
 *   - Page publique /pay/[token] : invitee qui déclare via magic link
 *
 * 3 champs (cf. choix Fabrice V141) :
 *   1. Moyen de paiement (liste exhaustive)
 *      - Méthodes vault sauvegardées de l'utilisateur (Wave, IBAN, PayPal…)
 *      - « Espèces » (cash de la main à la main)
 *      - « Autre » (tout autre moyen non répertorié)
 *   2. Date du paiement (max = aujourd'hui, défaut = aujourd'hui)
 *   3. Référence libre (optionnel — n° virement, mention spéciale…)
 *
 * Le composant fait l'appel API lui-même : props = { onSubmit(payload) }.
 * Pas de gestion du résultat ici — c'est le caller qui décide quoi faire
 * du retour.
 */

import { useEffect, useMemo, useState } from "react";
import { api } from "../api-client";
import { useT } from "../i18n/app-strings";
import { Icon } from "./icons";

export interface PaymentDeclarationPayload {
  /** Libellé du moyen (string libre — ex "Wave (Mon Wave SN)", "Espèces", "Autre"). */
  paymentMethod: string;
  /** Référence libre du paiement (n° de virement, mention…). null si vide. */
  paymentReference: string | null;
  /** Date du paiement en ISO 8601. */
  paidAt: string;
}

/**
 * Item vault récupéré côté backend. On affiche label + last4 pour
 * différencier deux méthodes du même type.
 */
interface VaultMethod {
  id: string;
  type: string;
  typeLabel: string;
  typeEmoji: string;
  label: string;
  last4: string;
}

export function PaymentDeclarationForm(props: {
  /** Montant + devise affichés en hero pour rappel. */
  amountLabel: string;
  /** Texte « Tu paies à X » ou « X t'a payé ». */
  contextLabel?: string;
  /** Au submit, callback async qui fait l'appel API métier. */
  onSubmit: (payload: PaymentDeclarationPayload) => Promise<void>;
  /** Cancel optionnel — si fourni, affiche un bouton Annuler. */
  onCancel?: () => void;
  /** Label du bouton de submit (défaut: « Confirmer le paiement »). */
  submitLabel?: string;
  /** Désactive le formulaire (loading externe). */
  disabled?: boolean;
}) {
  const t = useT();
  const [vault, setVault] = useState<VaultMethod[]>([]);
  const [vaultLoaded, setVaultLoaded] = useState(false);
  // Sélection : "vault:<id>" | "cash" | "other"
  const [selected, setSelected] = useState<string>("cash");
  const [reference, setReference] = useState("");
  // Date YYYY-MM-DD format pour input[type=date]
  const [date, setDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().slice(0, 10);
  });
  const [busy, setBusy] = useState(false);

  // Bornes du date picker : max = aujourd'hui, min = il y a 1 an
  const maxDate = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const minDate = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const cfg = await api.paymentMethodsConfig();
        if (!cfg.enabled) {
          setVaultLoaded(true);
          return;
        }
        const list = await api.listMyPaymentMethods();
        if (cancelled) return;
        setVault(list);
        // Pré-sélection : 1re méthode vault si dispo, sinon "cash".
        if (list.length > 0) {
          setSelected(`vault:${list[0].id}`);
        }
      } catch {
        /* silent — pas de vault dispo, le user peut quand même choisir
           Espèces ou Autre. */
      } finally {
        if (!cancelled) setVaultLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Convertit la sélection en libellé final stocké en BDD. */
  function resolvePaymentMethodLabel(): string {
    if (selected === "cash") {
      return t("payment.cashLabel") || "Espèces";
    }
    if (selected === "other") {
      return t("payment.otherLabel") || "Autre";
    }
    if (selected.startsWith("vault:")) {
      const id = selected.slice("vault:".length);
      const m = vault.find((v) => v.id === id);
      if (m) {
        // Format final : « Wave · Mon Wave SN » (lisible pour le receveur)
        return `${m.typeLabel} · ${m.label}`;
      }
    }
    // Fallback
    return t("payment.otherLabel") || "Autre";
  }

  async function handleSubmit() {
    if (busy || props.disabled) return;
    setBusy(true);
    try {
      // Date saisie en jj/mm/yyyy → ISO datetime UTC midi (évite bascules TZ)
      const paidAtIso = new Date(`${date}T12:00:00.000Z`).toISOString();
      await props.onSubmit({
        paymentMethod: resolvePaymentMethodLabel(),
        paymentReference: reference.trim() || null,
        paidAt: paidAtIso,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        padding: "8px 4px",
      }}
    >
      {/* Hero rappel montant + contexte */}
      <div
        style={{
          background:
            "linear-gradient(135deg, rgba(197,138,46,0.12), rgba(181,71,50,0.08))",
          border: "1px solid rgba(197,138,46,0.25)",
          borderRadius: 14,
          padding: "14px 16px",
          textAlign: "center",
        }}
      >
        {props.contextLabel && (
          <div
            style={{
              fontSize: 11,
              color: "var(--cocoa-soft, #6B5B47)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 4,
            }}
          >
            {props.contextLabel}
          </div>
        )}
        <div
          style={{
            fontSize: 24,
            fontWeight: 800,
            color: "var(--cocoa, #2B1F15)",
            fontFamily: "var(--font-num, ui-monospace, monospace)",
          }}
        >
          {props.amountLabel}
        </div>
      </div>

      {/* Sélecteur moyen */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--cocoa, #2B1F15)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {t("payment.methodLabel") || "Moyen de paiement"}
        </label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          disabled={!vaultLoaded || props.disabled || busy}
          style={{
            padding: "12px 14px",
            background: "var(--paper, #FFFFFF)",
            border: "1px solid var(--v45-line, rgba(43,31,21,0.12))",
            borderRadius: 12,
            fontSize: 14,
            color: "var(--cocoa, #2B1F15)",
            fontFamily: "inherit",
            outline: "none",
            minHeight: 44,
          }}
        >
          {vault.length > 0 && (
            <optgroup label={t("payment.vaultGroup") || "Mes moyens"}>
              {vault.map((m) => (
                <option key={m.id} value={`vault:${m.id}`}>
                  {m.typeLabel} — {m.label} (•••• {m.last4})
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label={t("payment.genericGroup") || "Génériques"}>
            <option value="cash">
              {t("payment.cashLabel") || "Espèces"}
            </option>
            <option value="other">
              {t("payment.otherLabel") || "Autre"}
            </option>
          </optgroup>
        </select>
      </div>

      {/* Date */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--cocoa, #2B1F15)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {t("payment.dateLabel") || "Date du paiement"}
        </label>
        <input
          type="date"
          value={date}
          min={minDate}
          max={maxDate}
          onChange={(e) => setDate(e.target.value)}
          disabled={props.disabled || busy}
          style={{
            padding: "12px 14px",
            background: "var(--paper, #FFFFFF)",
            border: "1px solid var(--v45-line, rgba(43,31,21,0.12))",
            borderRadius: 12,
            fontSize: 14,
            color: "var(--cocoa, #2B1F15)",
            fontFamily: "inherit",
            outline: "none",
            minHeight: 44,
          }}
        />
        <span
          style={{
            fontSize: 11,
            color: "var(--cocoa-soft, #6B5B47)",
          }}
        >
          {t("payment.dateHint") ||
            "Jusqu'à aujourd'hui (pas de date future)."}
        </span>
      </div>

      {/* Référence libre */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--cocoa, #2B1F15)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {t("payment.referenceLabel") || "Référence (optionnel)"}
        </label>
        <input
          type="text"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder={
            t("payment.referencePlaceholder") ||
            "N° de virement, mention, mémo…"
          }
          maxLength={200}
          disabled={props.disabled || busy}
          style={{
            padding: "12px 14px",
            background: "var(--paper, #FFFFFF)",
            border: "1px solid var(--v45-line, rgba(43,31,21,0.12))",
            borderRadius: 12,
            fontSize: 14,
            color: "var(--cocoa, #2B1F15)",
            fontFamily: "inherit",
            outline: "none",
            minHeight: 44,
          }}
        />
      </div>

      {/* Hint receveur */}
      <div
        style={{
          fontSize: 12,
          color: "var(--cocoa-soft, #6B5B47)",
          background: "var(--ivory, #FBF6EC)",
          border: "1px dashed rgba(197,138,46,0.30)",
          borderRadius: 10,
          padding: "10px 12px",
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          lineHeight: 1.4,
        }}
      >
        <Icon
          name="bell"
          size={14}
          color="var(--saffron, #C58A2E)"
          strokeWidth={1.6}
        />
        <span>
          {t("payment.notifyHint") ||
            "Le destinataire recevra une notification push et un email pour confirmer la réception."}
        </span>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={busy || props.disabled || !vaultLoaded}
          style={{
            flex: 1,
            padding: "12px 18px",
            background:
              busy || props.disabled
                ? "rgba(197,138,46,0.5)"
                : "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--v45-terracotta, #B54732))",
            color: "var(--paper, #FFFFFF)",
            border: "none",
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 700,
            cursor: busy || props.disabled ? "wait" : "pointer",
            fontFamily: "inherit",
            minHeight: 46,
          }}
        >
          {busy
            ? t("payment.submitting") || "Enregistrement…"
            : props.submitLabel || t("payment.declareCta") || "Confirmer le paiement"}
        </button>
        {props.onCancel && (
          <button
            type="button"
            onClick={props.onCancel}
            disabled={busy}
            style={{
              padding: "12px 18px",
              background: "transparent",
              color: "var(--cocoa-soft, #6B5B47)",
              border: "1px solid var(--v45-line, rgba(43,31,21,0.15))",
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              minHeight: 46,
            }}
          >
            {t("common.cancel") || "Annuler"}
          </button>
        )}
      </div>
    </div>
  );
}
