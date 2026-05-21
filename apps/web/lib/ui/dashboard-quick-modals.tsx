"use client";

/**
 * V159 — Modaux d'édition direct depuis les raccourcis du dashboard desktop.
 *
 * Avant : clic sur Parrainer / Paiements / Langue & devise → redirige
 * vers /dashboard/profile (verbeux, scroll requis, perte de contexte).
 *
 * Maintenant : chaque raccourci ouvre un modal centré qui édite UNIQUEMENT
 * le paramètre concerné. Les modifs passent par les mêmes endpoints que le
 * profil (updateMe / setCurrency / applyReferralCode), donc se reflètent
 * automatiquement dans la vue profil au prochain affichage (le cache /me
 * est invalidé par les méthodes de l'api-client).
 *
 * Palette V45-light. Esc pour fermer, clic backdrop OK.
 */

import { useEffect, useState } from "react";
import { api, ApiError } from "../api-client";
import { useT } from "../i18n/app-strings";
import { useDialog } from "./dialog-provider";
import { useLocale } from "../locale-provider";
import { useCurrency } from "../currency-provider";
import {
  LOCALES,
  LOCALE_NAMES,
  LOCALE_FLAGS,
  type Locale,
} from "../i18n/marketing-translations";

// ─────────────────────────────────────────────────────────────────────
// Wrapper modal commun
// ─────────────────────────────────────────────────────────────────────

function ModalShell({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer,
  maxWidth = 540,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: number;
}): JSX.Element | null {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(43,31,21,0.45)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#FFFFFF",
          borderRadius: 18,
          maxWidth,
          width: "100%",
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 20px 60px rgba(43,31,21,0.30)",
          border: "1px solid rgba(43,31,21,0.10)",
        }}
      >
        <div
          style={{
            padding: "20px 24px 14px",
            borderBottom: "1px solid rgba(43,31,21,0.08)",
          }}
        >
          {eyebrow && (
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
              {eyebrow}
            </div>
          )}
          <h2
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 700,
              color: "#2B1F15",
              fontFamily: "Cormorant Garamond, serif",
            }}
          >
            {title}
          </h2>
        </div>
        <div style={{ padding: 24 }}>{children}</div>
        {footer && (
          <div
            style={{
              padding: "14px 24px",
              borderTop: "1px solid rgba(43,31,21,0.08)",
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              background: "#FBF6EC",
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

const btnPrimary: React.CSSProperties = {
  padding: "10px 22px",
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 10,
  border: "none",
  background: "linear-gradient(135deg, #C58A2E, #854F0B)",
  color: "#FBF6EC",
  cursor: "pointer",
  fontFamily: "inherit",
  boxShadow: "0 4px 12px rgba(133,79,11,0.25)",
};
const btnGhost: React.CSSProperties = {
  padding: "10px 18px",
  fontSize: 13,
  fontWeight: 600,
  border: "1px solid rgba(43,31,21,0.18)",
  borderRadius: 10,
  background: "transparent",
  color: "#2B1F15",
  cursor: "pointer",
  fontFamily: "inherit",
};

// ─────────────────────────────────────────────────────────────────────
// 1. ReferralModal — code parrain + lien copier + apply code
// ─────────────────────────────────────────────────────────────────────

export function ReferralModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): JSX.Element | null {
  const t = useT();
  const dialog = useDialog();
  const [me, setMe] = useState<any>(null);
  // V177.B — Infos parrain actuel (verrou + avantage)
  const [referrerInfo, setReferrerInfo] = useState<
    Awaited<ReturnType<typeof api.getMyReferrer>> | null
  >(null);
  const [copied, setCopied] = useState(false);
  const [applyCode, setApplyCode] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<
    null | { ok: boolean; message: string }
  >(null);

  useEffect(() => {
    if (!open) return;
    setCopied(false);
    setApplyCode("");
    setApplyResult(null);
    void Promise.all([
      api.me().then((r) => setMe(r.user)),
      api.getMyReferrer().then(setReferrerInfo).catch(() => setReferrerInfo(null)),
    ]);
  }, [open]);

  const code = me?.referralCode ?? null;
  const link =
    typeof window !== "undefined" && code
      ? `${window.location.origin}/r/${code}`
      : "";
  // V177.B — Verrou : si referrerInfo.referrer non-null OU me.referredById non-null,
  // l'utilisateur a déjà un parrain et le formulaire de saisie est caché.
  const referredBy = referrerInfo?.referrer ?? null;
  const hasReferrer = !!referredBy || !!me?.referredById;

  async function handleCopy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }

  async function handleApply() {
    if (!applyCode.trim() || applying) return;
    setApplying(true);
    setApplyResult(null);
    try {
      await api.applyReferralCode(applyCode.trim());
      setApplyResult({
        ok: true,
        message:
          t("dashboard.quick.referral.applySuccess") ||
          "Code parrain enregistré 🎉",
      });
      // Recharge me + referrerInfo pour refléter le nouveau lien
      const [r, rInfo] = await Promise.all([
        api.me(),
        api.getMyReferrer().catch(() => null),
      ]);
      setMe(r.user);
      if (rInfo) setReferrerInfo(rInfo);
    } catch (e) {
      // V177.A — Message d'erreur contextuel (extrait du backend si ApiError)
      const msg =
        e instanceof ApiError
          ? e.message
          : ((e as Error)?.message ??
            t("affiliate.codeError.fallback") ??
            "Erreur inconnue lors de l'application du code.");
      setApplyResult({ ok: false, message: msg });
      await dialog.alert(msg, {
        title:
          t("affiliate.codeError.title") || "Code non appliqué",
      });
    } finally {
      setApplying(false);
    }
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      eyebrow={t("dashboard.quick.referral.eyebrow") || "Parrainage BMD"}
      title={t("dashboard.quick.referral.title") || "Mon code parrain"}
      footer={
        <button type="button" onClick={onClose} style={btnGhost}>
          {t("common.close") || "Fermer"}
        </button>
      }
    >
      {code ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              padding: 16,
              background:
                "linear-gradient(135deg, rgba(197,138,46,0.10), rgba(133,79,11,0.05))",
              border: "1.5px solid #854F0B40",
              borderRadius: 14,
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: 10,
                letterSpacing: 1.2,
                textTransform: "uppercase",
                color: "#6B5A47",
                fontWeight: 700,
                marginBottom: 6,
              }}
            >
              {t("dashboard.quick.referral.codeLabel") || "Ton code"}
            </div>
            <div
              className="bmd-num"
              style={{
                fontSize: 32,
                fontWeight: 700,
                color: "#854F0B",
                letterSpacing: 2,
                fontFamily: "monospace",
                marginBottom: 10,
              }}
            >
              {code}
            </div>
            <button
              type="button"
              onClick={() => handleCopy(code)}
              style={{
                padding: "8px 18px",
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 8,
                border: "1px solid #854F0B",
                background: copied ? "#854F0B" : "transparent",
                color: copied ? "#FBF6EC" : "#854F0B",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {copied
                ? t("dashboard.quick.referral.copied") || "✓ Copié !"
                : t("dashboard.quick.referral.copyCode") || "📋 Copier le code"}
            </button>
          </div>

          {/* Lien de partage */}
          {link && (
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#6B5A47",
                  marginBottom: 6,
                }}
              >
                {t("dashboard.quick.referral.linkLabel") ||
                  "Lien de partage direct"}
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <input
                  type="text"
                  readOnly
                  value={link}
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    fontSize: 12,
                    color: "#2B1F15",
                    background: "#FBF6EC",
                    border: "1px solid rgba(43,31,21,0.12)",
                    borderRadius: 10,
                    outline: "none",
                    fontFamily: "monospace",
                  }}
                />
                <button
                  type="button"
                  onClick={() => handleCopy(link)}
                  style={{
                    padding: "10px 14px",
                    fontSize: 12,
                    fontWeight: 600,
                    border: "1px solid rgba(43,31,21,0.18)",
                    borderRadius: 10,
                    background: "#FFFFFF",
                    color: "#854F0B",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    whiteSpace: "nowrap",
                  }}
                >
                  📋
                </button>
              </div>
            </div>
          )}

          {/* V177.B — Vue filleul post-parrainage (verrou one-shot) */}
          {hasReferrer && referredBy && referrerInfo ? (
            <ReferrerLockCard info={referrerInfo} t={t} />
          ) : !hasReferrer ? (
            /* Apply code parrain reçu (si pas encore parrainé) */
            <div
              style={{
                padding: 14,
                background: "#FBF6EC",
                border: "1px solid rgba(43,31,21,0.08)",
                borderRadius: 10,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#2B1F15",
                  marginBottom: 8,
                }}
              >
                {t("dashboard.quick.referral.applyLabel") ||
                  "Tu as un code de parrain ?"}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  value={applyCode}
                  onChange={(e) => setApplyCode(e.target.value.toUpperCase())}
                  placeholder="REF-XXXXXX"
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    fontSize: 13,
                    color: "#2B1F15",
                    background: "#FFFFFF",
                    border: "1px solid rgba(43,31,21,0.14)",
                    borderRadius: 10,
                    outline: "none",
                    fontFamily: "monospace",
                  }}
                />
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={!applyCode.trim() || applying}
                  style={{
                    ...btnPrimary,
                    opacity: !applyCode.trim() || applying ? 0.5 : 1,
                    cursor:
                      !applyCode.trim() || applying ? "not-allowed" : "pointer",
                  }}
                >
                  {applying
                    ? t("dashboard.quick.referral.applying") || "…"
                    : t("dashboard.quick.referral.applyCta") || "Valider"}
                </button>
              </div>
              {applyResult && (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 11,
                    color: applyResult.ok ? "#0F6E56" : "#9F4628",
                    fontWeight: 600,
                  }}
                >
                  {applyResult.message}
                </div>
              )}
              {referrerInfo?.canApply &&
                referrerInfo.daysToApply > 0 &&
                referrerInfo.daysToApply <= 10 && (
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 10.5,
                      color: "#854F0B",
                      fontWeight: 600,
                    }}
                  >
                    {t("affiliate.codeWindow.daysLeft", {
                      days: String(referrerInfo.daysToApply),
                    }) ||
                      `Reste ${referrerInfo.daysToApply} jour${referrerInfo.daysToApply > 1 ? "s" : ""} pour utiliser un code.`}
                  </div>
                )}
            </div>
          ) : null}
        </div>
      ) : (
        <div
          style={{
            padding: 20,
            textAlign: "center",
            color: "#6B5A47",
            fontSize: 13,
          }}
        >
          {t("common.loading") || "Chargement…"}
        </div>
      )}
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────────────────
// V177.B — ReferrerLockCard : verrou + infos parrain + avantage obtenu
// ─────────────────────────────────────────────────────────────────────

function ReferrerLockCard({
  info,
  t,
}: {
  info: NonNullable<Awaited<ReturnType<typeof api.getMyReferrer>>>;
  t: ReturnType<typeof useT>;
}): JSX.Element {
  const r = info.referrer!;
  const discount = info.discount;
  const remaining = info.remainingDays;
  const initials = (r.displayName || "?")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div
      style={{
        position: "relative",
        padding: 16,
        background: "#FFFFFF",
        border: "1.5px solid rgba(197,138,46,0.30)",
        borderRadius: 14,
        boxShadow: "0 1px 0 rgba(43,31,21,0.04)",
      }}
    >
      {/* Eyebrow + badge "acquis" */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: "#6B5A47",
            fontWeight: 700,
          }}
        >
          {t("affiliate.referrer.eyebrow") || "Ton parrain"}
        </div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 8px",
            borderRadius: 999,
            background: "rgba(31,122,87,0.10)",
            border: "1px solid rgba(31,122,87,0.25)",
            color: "#1F7A57",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.4,
            textTransform: "uppercase",
          }}
        >
          <span aria-hidden style={{ fontSize: 8 }}>●</span>
          {t("affiliate.referrer.acquired") || "Acquis pour la vie"}
        </div>
      </div>

      {/* Identité parrain */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 14,
        }}
      >
        {r.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={r.avatar}
            alt=""
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              objectFit: "cover",
              border: "1px solid rgba(43,31,21,0.08)",
            }}
          />
        ) : (
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background:
                "linear-gradient(135deg, #C58A2E 0%, #854F0B 100%)",
              color: "#FBF6EC",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            {initials}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "#2B1F15",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {r.displayName}
          </div>
          {r.codeUsed && (
            <div
              style={{
                fontSize: 11,
                color: "#6B5A47",
                marginTop: 2,
              }}
            >
              {t("affiliate.referrer.codeUsed") || "Code utilisé"}{" "}
              <code
                style={{
                  fontFamily: "monospace",
                  fontWeight: 700,
                  color: "#854F0B",
                  background: "rgba(197,138,46,0.10)",
                  padding: "1px 6px",
                  borderRadius: 4,
                  marginLeft: 4,
                }}
              >
                {r.codeUsed}
              </code>
            </div>
          )}
        </div>
      </div>

      {/* Avantage obtenu */}
      {discount && (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            background: "#FBF6EC",
            border: "1px solid rgba(43,31,21,0.06)",
            marginBottom: 10,
          }}
        >
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              color: "#6B5A47",
              letterSpacing: 0.6,
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            {t("affiliate.referrer.benefitLabel") || "Avantage obtenu"}
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#2B1F15",
            }}
          >
            {t("affiliate.referrer.benefitValue", {
              percent: String(discount.value),
              months: String(discount.durationMonths),
            }) ||
              `−${discount.value} % sur tes ${discount.durationMonths} premiers mois`}
          </div>
          {remaining > 0 ? (
            <div
              style={{
                marginTop: 4,
                fontSize: 11,
                color: "#1F7A57",
                fontWeight: 600,
              }}
            >
              {t("affiliate.referrer.remainingDays", {
                days: String(remaining),
              }) || `Reste ${remaining} jour${remaining > 1 ? "s" : ""}`}
            </div>
          ) : (
            <div
              style={{
                marginTop: 4,
                fontSize: 11,
                color: "#6B5A47",
                fontWeight: 600,
              }}
            >
              {t("affiliate.referrer.expired") || "Période terminée"}
            </div>
          )}
        </div>
      )}

      {/* Footer : verrouillage définitif */}
      <div
        style={{
          fontSize: 10.5,
          color: "#6B5A47",
          lineHeight: 1.45,
          paddingTop: 8,
          borderTop: "1px dashed rgba(43,31,21,0.10)",
        }}
      >
        <span aria-hidden style={{ marginRight: 4 }}>ⓘ</span>
        {t("affiliate.referrer.lockedHint") ||
          "Un seul code par compte — ce choix est définitif."}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 2. LangCurrencyModal — sélecteur locale + devise
// ─────────────────────────────────────────────────────────────────────

const CURRENCIES = [
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "CHF", symbol: "CHF", name: "Swiss Franc" },
  { code: "CAD", symbol: "CA$", name: "Canadian Dollar" },
  { code: "XOF", symbol: "FCFA", name: "Franc CFA Ouest" },
  { code: "XAF", symbol: "FCFA", name: "Franc CFA Central" },
  { code: "NGN", symbol: "₦", name: "Naira" },
  { code: "MAD", symbol: "DH", name: "Dirham marocain" },
  { code: "DZD", symbol: "DA", name: "Dinar algérien" },
  { code: "TND", symbol: "DT", name: "Dinar tunisien" },
  { code: "KES", symbol: "KSh", name: "Shilling kenyan" },
  { code: "GHS", symbol: "₵", name: "Cedi" },
  { code: "ZAR", symbol: "R", name: "Rand sud-africain" },
];

export function LangCurrencyModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): JSX.Element | null {
  const t = useT();
  const { code: locale, setLocale } = useLocale();
  const { code: currency, setCurrency } = useCurrency();
  const [pendingLocale, setPendingLocale] = useState<string>(locale);
  const [pendingCurrency, setPendingCurrency] = useState<string>(currency);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPendingLocale(locale);
      setPendingCurrency(currency);
      setSavedMsg(null);
    }
  }, [open, locale, currency]);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setSavedMsg(null);
    try {
      const promises: Promise<unknown>[] = [];
      if (pendingLocale !== locale) {
        promises.push(setLocale(pendingLocale));
      }
      if (pendingCurrency !== currency) {
        promises.push(setCurrency(pendingCurrency));
      }
      await Promise.all(promises);
      setSavedMsg(
        t("dashboard.quick.langCurrency.saved") || "✓ Préférences enregistrées",
      );
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (e) {
      setSavedMsg((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const hasChanges =
    pendingLocale !== locale || pendingCurrency !== currency;

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      eyebrow={t("dashboard.quick.langCurrency.eyebrow") || "Préférences"}
      title={t("dashboard.quick.langCurrency.title") || "Langue & devise"}
      footer={
        <>
          <button type="button" onClick={onClose} style={btnGhost}>
            {t("common.cancel") || "Annuler"}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasChanges || saving}
            style={{
              ...btnPrimary,
              opacity: !hasChanges || saving ? 0.5 : 1,
              cursor: !hasChanges || saving ? "not-allowed" : "pointer",
            }}
          >
            {saving
              ? t("common.saving") || "Enregistrement…"
              : t("common.save") || "Enregistrer"}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <label
            style={{
              display: "block",
              fontSize: 11,
              fontWeight: 600,
              color: "#6B5A47",
              marginBottom: 6,
              letterSpacing: 0.3,
            }}
          >
            {t("dashboard.quick.langCurrency.langLabel") || "Langue d'affichage"}
          </label>
          <select
            value={pendingLocale}
            onChange={(e) => setPendingLocale(e.target.value)}
            style={selectStyle}
          >
            {(LOCALES as readonly Locale[]).map((loc) => (
              <option key={loc} value={loc}>
                {LOCALE_FLAGS[loc] ?? ""} {LOCALE_NAMES[loc] ?? loc}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            style={{
              display: "block",
              fontSize: 11,
              fontWeight: 600,
              color: "#6B5A47",
              marginBottom: 6,
              letterSpacing: 0.3,
            }}
          >
            {t("dashboard.quick.langCurrency.currencyLabel") ||
              "Devise principale"}
          </label>
          <select
            value={pendingCurrency}
            onChange={(e) => setPendingCurrency(e.target.value)}
            style={selectStyle}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.symbol} · {c.code} — {c.name}
              </option>
            ))}
          </select>
          <div
            style={{
              fontSize: 10.5,
              color: "#6B5A47",
              opacity: 0.85,
              marginTop: 6,
              lineHeight: 1.5,
            }}
          >
            {t("dashboard.quick.langCurrency.currencyHint") ||
              "Tes soldes globaux sont convertis dans cette devise. Les dépenses dans d'autres devises restent affichées en local."}
          </div>
        </div>
        {savedMsg && (
          <div
            style={{
              padding: "10px 12px",
              background: "rgba(15,110,86,0.08)",
              border: "1px solid rgba(15,110,86,0.20)",
              borderRadius: 10,
              fontSize: 12,
              color: "#0F6E56",
              textAlign: "center",
              fontWeight: 600,
            }}
          >
            {savedMsg}
          </div>
        )}
      </div>
    </ModalShell>
  );
}

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  fontSize: 13,
  color: "#2B1F15",
  background: "#FBF6EC",
  border: "1px solid rgba(43,31,21,0.14)",
  borderRadius: 10,
  outline: "none",
  fontFamily: "inherit",
  cursor: "pointer",
};

// ─────────────────────────────────────────────────────────────────────
// 3. PaymentsModal — gestion des moyens de paiement
// ─────────────────────────────────────────────────────────────────────

interface PaymentMethodRow {
  id: string;
  kind: string;
  label: string;
  details: any;
  isDefault: boolean;
}

export function PaymentsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): JSX.Element | null {
  const t = useT();
  const [methods, setMethods] = useState<PaymentMethodRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setMethods(null);
    (api as any)
      .listMyPaymentMethods?.()
      .then((r: any) => {
        setMethods(
          Array.isArray(r?.methods) ? r.methods : Array.isArray(r) ? r : [],
        );
      })
      .catch((e: Error) => setError(e.message));
  }, [open]);

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      eyebrow={t("dashboard.quick.payments.eyebrow") || "Moyens de paiement"}
      title={t("dashboard.quick.payments.title") || "Mes moyens de paiement"}
      maxWidth={600}
      footer={
        <>
          <button type="button" onClick={onClose} style={btnGhost}>
            {t("common.close") || "Fermer"}
          </button>
          <a
            href="/dashboard/profile#payment-methods"
            style={{
              ...btnPrimary,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            {t("dashboard.quick.payments.manageFull") ||
              "Gérer en détail →"}
          </a>
        </>
      }
    >
      {error ? (
        <div
          style={{
            padding: 16,
            background: "rgba(159,70,40,0.08)",
            border: "1px solid rgba(159,70,40,0.25)",
            borderRadius: 10,
            color: "#9F4628",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : methods === null ? (
        <div
          style={{
            padding: 20,
            textAlign: "center",
            color: "#6B5A47",
            fontSize: 13,
          }}
        >
          {t("common.loading") || "Chargement…"}
        </div>
      ) : methods.length === 0 ? (
        <div
          style={{
            padding: 24,
            textAlign: "center",
            background: "#FBF6EC",
            border: "1px dashed rgba(43,31,21,0.18)",
            borderRadius: 12,
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 8 }}>💳</div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#2B1F15",
              marginBottom: 4,
              fontFamily: "Cormorant Garamond, serif",
            }}
          >
            {t("dashboard.quick.payments.emptyTitle") ||
              "Pas encore de moyen de paiement"}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "#6B5A47",
              lineHeight: 1.5,
              maxWidth: 380,
              margin: "0 auto 14px",
            }}
          >
            {t("dashboard.quick.payments.emptyHint") ||
              "Ajoute tes IBAN, Mobile Money ou Lien PayPal pour qu'on te paie facilement dans les groupes."}
          </div>
          <a
            href="/dashboard/profile#payment-methods"
            style={{
              ...btnPrimary,
              display: "inline-block",
              textDecoration: "none",
            }}
          >
            + {t("dashboard.quick.payments.addCta") || "Ajouter un moyen"}
          </a>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {methods.map((m) => (
            <PaymentMethodRowDisplay key={m.id} method={m} />
          ))}
          <a
            href="/dashboard/profile#payment-methods"
            style={{
              marginTop: 8,
              padding: "10px 14px",
              fontSize: 12,
              fontWeight: 600,
              border: "1px dashed rgba(43,31,21,0.20)",
              borderRadius: 10,
              background: "transparent",
              color: "#854F0B",
              cursor: "pointer",
              textAlign: "center",
              textDecoration: "none",
              display: "block",
            }}
          >
            + {t("dashboard.quick.payments.addAnother") || "Ajouter un autre"}
          </a>
        </div>
      )}
    </ModalShell>
  );
}

function PaymentMethodRowDisplay({ method }: { method: PaymentMethodRow }) {
  const kindEmoji: Record<string, string> = {
    IBAN: "🏦",
    MOBILE_MONEY: "📱",
    PAYPAL: "💰",
    REVOLUT: "💳",
    WISE: "🌍",
    LYDIA: "💸",
    OTHER: "💳",
  };
  return (
    <div
      style={{
        padding: "12px 14px",
        background: "#FFFFFF",
        border: "1px solid rgba(43,31,21,0.10)",
        borderRadius: 10,
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div style={{ fontSize: 22 }}>{kindEmoji[method.kind] ?? "💳"}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#2B1F15" }}>
          {method.label}
          {method.isDefault && (
            <span
              style={{
                marginLeft: 6,
                fontSize: 9,
                padding: "1px 6px",
                background: "#1F7A57",
                color: "#FBF6EC",
                borderRadius: 999,
                fontWeight: 700,
                letterSpacing: 0.5,
                verticalAlign: "middle",
              }}
            >
              DÉFAUT
            </span>
          )}
        </div>
        <div style={{ fontSize: 10.5, color: "#6B5A47", marginTop: 2 }}>
          {method.kind}
        </div>
      </div>
    </div>
  );
}
