"use client";

/**
 * <DesktopProfileView> · V107 — Page profil desktop refondue en V45-light.
 *
 * Avant : la page /dashboard/profile sur desktop empilait verticalement
 * une douzaine de <div className="card"> en palette legacy (texte cream
 * sur fond cream-translucide, illisible une fois le shell passé en
 * V45-light). Pas d'organisation, pas de hiérarchie.
 *
 * Architecture V107 :
 *   • HERO compact pleine largeur : avatar uploadable (camera badge),
 *     nom, email/téléphone vérifié, plan code en chip, 3 mini-stats
 *     (groupes, tontines, dépenses).
 *   • Grid 2 colonnes (380px sticky | 1fr) :
 *      ┌─ Colonne gauche STICKY ────────┐  ┌─ Colonne droite ──────────────┐
 *      │ • Identité (nom + langue +     │  │ • Plan (PlanBlock)            │
 *      │   devise + édition inline)     │  │ • Sécurité (Passkey + 2FA)    │
 *      │ • Contacts vérifiés (téléphone │  │ • Notifications push          │
 *      │   + emails)                    │  │ • Paiements enregistrés       │
 *      │ • Préférences UI (theme +      │  │ • Parrainage (PromoBlock)     │
 *      │   privacy globale + version)   │  │ • Données & RGPD              │
 *      │ • Bouton Déconnexion           │  │ • Légal (CGU/Privacy)         │
 *      └────────────────────────────────┘  └───────────────────────────────┘
 *
 * Toutes les sections passent par <SectionCard> V45-light (fond paper,
 * bordure cocoa pâle, ombre douce, titre Cormorant + sous-titre cocoa-soft).
 *
 * Les blocks lourds (PasskeyManager, TwoFactorBlock, PaymentMethodsBlock,
 * PushNotifBlock, PromoBlock, GdprBlock, PlanBlock) sont LAZY-LOADÉS via
 * dynamic() pour ne pas plomber le LCP — chacun se charge quand sa section
 * scrolle dans le viewport (intersection observer natif Next.js).
 */

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../api-client";
import { useT } from "../i18n/app-strings";
import { useLocale } from "../locale-provider";
import { useCurrency } from "../currency-provider";
import { ThemeToggle } from "./theme-toggle";
import { Icon } from "./icons";
import { SharedLangPicker } from "./shared-lang-picker";

// === Lazy-loaded blocks ====================================================
// Skeleton commun pour tous les blocks lourds.
const SKELETON = (
  <div
    style={{
      minHeight: 90,
      background: "var(--ivory-2, #F4ECD8)",
      borderRadius: 12,
      animation: "bmd-skel-pulse 1.2s ease-in-out infinite",
    }}
  />
);
const PlanBlock = dynamic(
  () => import("./plan-block").then((m) => m.PlanBlock),
  { ssr: false, loading: () => SKELETON },
);
const MySignaturesBlock = dynamic(
  () => import("./my-signatures-block").then((m) => m.MySignaturesBlock),
  { ssr: false, loading: () => SKELETON },
);
const PasskeyManager = dynamic(
  () => import("./passkey-manager").then((m) => m.PasskeyManager),
  { ssr: false, loading: () => SKELETON },
);
const TwoFactorBlock = dynamic(
  () => import("./two-factor-block").then((m) => m.TwoFactorBlock),
  { ssr: false, loading: () => SKELETON },
);
const PushNotifBlock = dynamic(
  () => import("./push-notif-block").then((m) => m.PushNotifBlock),
  { ssr: false, loading: () => SKELETON },
);
const PaymentMethodsBlock = dynamic(
  () => import("./payment-methods-block").then((m) => m.PaymentMethodsBlock),
  { ssr: false, loading: () => SKELETON },
);
const PromoBlock = dynamic(
  () => import("./promo-block").then((m) => m.PromoBlock),
  { ssr: false, loading: () => SKELETON },
);
const GdprBlock = dynamic(
  () => import("./gdpr-block").then((m) => m.GdprBlock),
  { ssr: false, loading: () => SKELETON },
);
const SimSwapAlerts = dynamic(
  () => import("./sim-swap-alerts").then((m) => m.SimSwapAlerts),
  { ssr: false, loading: () => null },
);

// === Types =================================================================
export interface ProfileUser {
  id: string;
  displayName: string;
  /** V144 — Pseudo optionnel choisi par l'user (null si pas défini). */
  nickname?: string | null;
  /** V144 — Comment l'user veut être vu : NAME (vrai nom) ou NICKNAME (pseudo). */
  displayPreference?: "NAME" | "NICKNAME";
  defaultCurrency: string;
  defaultLocale: string;
  planCode?: string | null;
  avatar?: string | null;
  isSuperAdmin?: boolean;
  // Contacts vérifiés
  contacts?: Array<{
    id: string;
    type: "PHONE" | "EMAIL";
    value: string;
    verifiedAt?: string | null;
    isPrimary?: boolean;
  }>;
}

interface Props {
  user: ProfileUser;
  /** Photo courante (sync localStorage + serveur). */
  heroPhoto: string | null;
  /** Handler upload photo (déjà câblé compresseur + PATCH /auth/me). */
  onPhotoUpload: (file: File) => void;
  /** True pendant la requête upload. */
  photoSaving: boolean;
  /** Déconnecte (clear token + redirect). */
  onLogout: () => void;
  /** Sauvegarde identité (nom + pseudo + préférence + devise + locale). */
  onSaveIdentity: (patch: {
    displayName: string;
    // V144 — Pseudo + préférence d'affichage
    nickname?: string | null;
    displayPreference?: "NAME" | "NICKNAME";
    defaultCurrency: string;
    defaultLocale: string;
  }) => Promise<void>;
  /** Stats hero (pré-chargées par la page). */
  stats: { groups: string; tontines: string; expenses: string };
}

// ===========================================================================
// === COMPOSANT PRINCIPAL ===================================================
// ===========================================================================

export function DesktopProfileView({
  user,
  heroPhoto,
  onPhotoUpload,
  photoSaving,
  onLogout,
  onSaveIdentity,
  stats,
}: Props) {
  const t = useT();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 22,
        maxWidth: 1180,
        margin: "0 auto",
      }}
    >
      {/* === HERO === */}
      <ProfileHero
        user={user}
        heroPhoto={heroPhoto}
        onPhotoUpload={onPhotoUpload}
        photoSaving={photoSaving}
        stats={stats}
      />

      {/* === Alertes critiques en bandeau (rare mais important) === */}
      <SimSwapAlerts />

      {/* === Grid 2 colonnes ===
          Gauche : identité + préférences + déconnexion (sticky pour
          consultation rapide pendant qu'on scroll les blocks à droite).
          Droite : tous les blocks de gestion. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 360px) minmax(0, 1fr)",
          gap: 22,
          alignItems: "start",
        }}
      >
        {/* === Colonne gauche === */}
        <aside
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            position: "sticky",
            top: 100,
          }}
        >
          <IdentitySection user={user} onSave={onSaveIdentity} />
          <ContactsSection user={user} />
          <PreferencesSection />
          <LogoutSection onLogout={onLogout} t={t} />
        </aside>

        {/* === Colonne droite === */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Plan : visible immédiatement (CTA upgrade) */}
          <SectionCard
            title={t("profile.planTitle") || "Mon forfait"}
            subtitle={
              t("profile.planSubtitle") || "Quotas IA, photos, options actives"
            }
            iconName="sparkles"
          >
            <PlanBlock />
            {/* V152.I — Block consommation signatures (auto-caché si N/A) */}
            <MySignaturesBlock />
          </SectionCard>

          {/* Sécurité = passkey + 2FA dans un même bloc */}
          <SectionCard
            title={t("profile.section.security") || "Sécurité"}
            subtitle={
              t("profile.section.securitySubtitle") ||
              "Passkey, 2FA, sessions actives"
            }
            iconName="lock"
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <PasskeyManager />
              <TwoFactorBlock />
            </div>
          </SectionCard>

          {/* Notifications push */}
          <SectionCard
            title={t("profile.section.notifications") || "Notifications"}
            subtitle={
              t("profile.section.notificationsSubtitle") ||
              "Push, rappels et alertes en temps réel"
            }
            iconName="bell"
          >
            <PushNotifBlock />
          </SectionCard>

          {/* Paiements enregistrés */}
          <SectionCard
            title={t("profile.section.payments") || "Paiements"}
            subtitle={
              t("profile.section.paymentsSubtitle") ||
              "Cartes et IBAN enregistrés"
            }
            iconName="credit-card"
          >
            <PaymentMethodsBlock />
          </SectionCard>

          {/* Parrainage / promo */}
          <SectionCard
            title={t("profile.section.rewards") || "Parrainage"}
            subtitle={
              t("profile.section.rewardsSubtitle") ||
              "Invite tes amis et gagne des avantages"
            }
            iconName="gift"
          >
            <PromoBlock />
          </SectionCard>

          {/* Données + RGPD */}
          <SectionCard
            title={t("profile.section.privacy") || "Données & confidentialité"}
            subtitle={
              t("profile.section.privacySubtitle") ||
              "Export, contrôle d'accès, suppression de compte"
            }
            iconName="shield"
          >
            <GdprBlock />
          </SectionCard>

          {/* Légal — bouton vers /legal/privacy */}
          <SectionCard
            title={t("profile.legalTitle") || "Légal"}
            subtitle={t("profile.gdprNote") || "Mentions légales et politique de confidentialité"}
            iconName="file-text"
          >
            <Link
              href="/legal/privacy"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "10px 16px",
                background: "var(--ivory-2, #F4ECD8)",
                border: "1px solid rgba(43,31,21,0.10)",
                borderRadius: 10,
                color: "var(--cocoa, #2B1F15)",
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              {t("profile.privacyPolicy") || "Politique de confidentialité"} →
            </Link>
          </SectionCard>
        </div>
      </div>

      {/* Animation skeleton + clean-up CSS */}
      <style jsx>{`
        @keyframes bmd-skel-pulse {
          0%,
          100% {
            opacity: 0.5;
          }
          50% {
            opacity: 0.9;
          }
        }
      `}</style>
    </div>
  );
}

// ===========================================================================
// === HERO ==================================================================
// ===========================================================================

function ProfileHero({
  user,
  heroPhoto,
  onPhotoUpload,
  photoSaving,
  stats,
}: {
  user: ProfileUser;
  heroPhoto: string | null;
  onPhotoUpload: (file: File) => void;
  photoSaving: boolean;
  stats: { groups: string; tontines: string; expenses: string };
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const primaryContact = user.contacts?.find((c) => c.isPrimary);

  return (
    <section
      style={{
        position: "relative",
        padding: 24,
        borderRadius: 22,
        background:
          "linear-gradient(135deg, #FBF6EC 0%, #F6E8C5 60%, #F4ECD8 100%)",
        border: "1px solid rgba(197,138,46,0.20)",
        boxShadow:
          "0 6px 20px rgba(43,31,21,0.08), 0 1px 2px rgba(43,31,21,0.06)",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        gap: 24,
        flexWrap: "wrap",
      }}
    >
      {/* Halo radial saffron */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -120,
          right: -120,
          width: 360,
          height: 360,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(197,138,46,0.18), transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Input file caché (V107) */}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPhotoUpload(f);
          e.target.value = "";
        }}
      />

      {/* Avatar cliquable XL */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={photoSaving}
        aria-label={t("profile.changePhoto") || "Changer la photo de profil"}
        style={{
          position: "relative",
          width: 96,
          height: 96,
          borderRadius: "50%",
          padding: 3,
          background:
            "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--v45-saffron-soft, #E8C988))",
          border: "none",
          cursor: photoSaving ? "wait" : "pointer",
          flexShrink: 0,
          boxShadow: "0 8px 20px rgba(197,138,46,0.30)",
          opacity: photoSaving ? 0.7 : 1,
        }}
      >
        <span
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            borderRadius: "50%",
            background: heroPhoto
              ? `url(${heroPhoto}) center/cover no-repeat`
              : "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--v45-terracotta, #9F4628))",
            alignItems: "center",
            justifyContent: "center",
            color: "#FFFFFF",
            fontSize: 38,
            fontWeight: 700,
            fontFamily: "Cormorant Garamond, serif",
          }}
        >
          {!heroPhoto && (user.displayName?.charAt(0).toUpperCase() ?? "?")}
        </span>
        {/* Badge caméra */}
        <span
          aria-hidden
          style={{
            position: "absolute",
            right: 0,
            bottom: 0,
            width: 28,
            height: 28,
            borderRadius: "50%",
            background:
              "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--v45-terracotta, #9F4628))",
            border: "3px solid var(--paper, #FFFFFF)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#FFFFFF",
            boxShadow: "0 2px 6px rgba(43,31,21,0.18)",
          }}
        >
          <Icon name="camera" size={13} strokeWidth={2.2} />
        </span>
      </button>

      {/* Bloc info */}
      <div
        style={{
          position: "relative",
          flex: 1,
          minWidth: 240,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "var(--v45-saffron, #C58A2E)",
            letterSpacing: 1.8,
            textTransform: "uppercase",
            fontWeight: 700,
          }}
        >
          {t("profile.identity") || "Identité"}
        </div>
        <h1
          style={{
            margin: 0,
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 36,
            fontWeight: 600,
            color: "var(--cocoa, #2B1F15)",
            lineHeight: 1.1,
          }}
        >
          {user.displayName}
        </h1>
        <div
          style={{
            fontSize: 13,
            color: "var(--cocoa-soft, #6B5A47)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            marginTop: 4,
          }}
        >
          {primaryContact && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Icon
                name={primaryContact.type === "EMAIL" ? "mail" : "phone"}
                size={13}
                strokeWidth={1.7}
              />
              {primaryContact.value}
            </span>
          )}
          <PlanChip code={user.planCode} />
          {user.isSuperAdmin && (
            <span
              style={{
                padding: "3px 8px",
                borderRadius: 999,
                background: "rgba(155,89,182,0.14)",
                color: "#7C3AED",
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: 0.8,
                border: "1px solid rgba(155,89,182,0.30)",
              }}
            >
              SUPERADMIN
            </span>
          )}
        </div>
      </div>

      {/* Mini-stats droite */}
      <div
        style={{
          position: "relative",
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(80px, auto))",
          gap: 12,
          flexShrink: 0,
        }}
      >
        <MiniStat label="Groupes" value={stats.groups} />
        <MiniStat label="Tontines" value={stats.tontines} />
        <MiniStat label="Dépenses" value={stats.expenses} />
      </div>
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "10px 14px",
        background: "rgba(255,255,255,0.62)",
        border: "1px solid rgba(43,31,21,0.10)",
        borderRadius: 12,
        textAlign: "center",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)",
        minWidth: 80,
      }}
    >
      <div
        className="bmd-num"
        style={{
          fontFamily: "Cormorant Garamond, serif",
          fontSize: 22,
          fontWeight: 700,
          color: "var(--cocoa, #2B1F15)",
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 9.5,
          color: "var(--cocoa-soft, #6B5A47)",
          letterSpacing: 1.2,
          textTransform: "uppercase",
          fontWeight: 700,
          marginTop: 3,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function PlanChip({ code }: { code?: string | null }) {
  const planLabel = (code ?? "FREE").toUpperCase();
  return (
    <span
      style={{
        padding: "3px 10px",
        borderRadius: 999,
        background:
          "linear-gradient(135deg, rgba(197,138,46,0.16), rgba(232,201,136,0.10))",
        color: "var(--v45-saffron, #C58A2E)",
        fontSize: 10.5,
        fontWeight: 800,
        letterSpacing: 0.8,
        border: "1px solid rgba(197,138,46,0.30)",
      }}
    >
      {planLabel}
    </span>
  );
}

// ===========================================================================
// === IDENTITÉ (colonne gauche) =============================================
// ===========================================================================

function IdentitySection({
  user,
  onSave,
}: {
  user: ProfileUser;
  onSave: Props["onSaveIdentity"];
}) {
  const t = useT();
  const { available: availableLocales } = useLocale();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user.displayName);
  // V144 — Pseudo + préférence d'affichage. Fabrice décide comment les autres
  // membres le voient (nom OU pseudo). Fallback "NAME" pour les comptes
  // créés avant la migration.
  const [nickname, setNickname] = useState(user.nickname ?? "");
  const [displayPref, setDisplayPref] = useState<"NAME" | "NICKNAME">(
    (user.displayPreference ?? "NAME") as "NAME" | "NICKNAME",
  );
  const [currency, setCurrency] = useState(user.defaultCurrency);
  const [locale, setLocale] = useState(user.defaultLocale);
  const [saving, setSaving] = useState(false);
  const [availableCurrencies, setAvailableCurrencies] = useState<
    Array<{ code: string; name: string; symbol: string; flag: string | null }>
  >([]);

  useEffect(() => {
    if (!editing) return;
    api.listCurrencies().then((rows) =>
      setAvailableCurrencies(
        rows.map((r) => ({
          code: r.code,
          name: r.name,
          symbol: r.symbol,
          flag: r.flag,
        })),
      ),
    );
  }, [editing]);

  async function save() {
    setSaving(true);
    try {
      // V144 — On envoie aussi nickname + displayPreference. nickname vide
      // → null (effacer le pseudo). Le backend accepte les 2 formats.
      const trimmedNick = nickname.trim();
      await onSave({
        displayName,
        nickname: trimmedNick === "" ? null : trimmedNick,
        displayPreference: displayPref,
        defaultCurrency: currency,
        defaultLocale: locale,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setDisplayName(user.displayName);
    setNickname(user.nickname ?? "");
    setDisplayPref((user.displayPreference ?? "NAME") as "NAME" | "NICKNAME");
    setCurrency(user.defaultCurrency);
    setLocale(user.defaultLocale);
    setEditing(false);
  }

  const currentLocale = availableLocales.find((l) => l.code === user.defaultLocale);

  return (
    <SectionCard
      title={t("profile.identity") || "Identité"}
      subtitle={
        editing
          ? t("profile.editingHint") || "Modifie puis enregistre"
          : t("profile.identitySubtitle") || "Nom affiché, langue, devise"
      }
      iconName="user"
      action={
        !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            style={ghostBtnStyle}
          >
            {t("profile.editIdentity") || "Modifier"}
          </button>
        )
      }
    >
      {!editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <KeyValueRow label={t("profile.displayedName") || "Nom"} value={user.displayName} />
          {/* V144 — Pseudo + comment les autres me voient (lecture). */}
          {user.nickname && (
            <KeyValueRow
              label={t("profile.nicknameLabel") || "Pseudo"}
              value={user.nickname}
            />
          )}
          <KeyValueRow
            label={t("profile.shownAsLabel") || "Les autres me voient"}
            value={
              (user.displayPreference ?? "NAME") === "NICKNAME" && user.nickname
                ? `${t("profile.shownAsNickname") || "Sous mon pseudo"} · ${user.nickname}`
                : `${t("profile.shownAsName") || "Sous mon nom"} · ${user.displayName}`
            }
          />
          <KeyValueRow
            label={t("dashboard.defaultCurrency") || "Devise"}
            value={user.defaultCurrency}
          />
          <KeyValueRow
            label={t("profile.preferredLang") || "Langue"}
            value={
              currentLocale
                ? `${currentLocale.flag ?? ""} ${currentLocale.name}`
                : user.defaultLocale
            }
          />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label={t("profile.displayNameLabel") || "Nom"}>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t("profile.displayNameExample") || "Ton prénom"}
              style={inputStyle}
            />
          </Field>
          {/* V144 — Pseudo + bascule "comment les autres me voient" */}
          <Field
            label={t("profile.nicknameLabel") || "Pseudo (optionnel)"}
            hint={
              t("profile.nicknameHint") ||
              "Un surnom que tu peux choisir d'afficher à la place de ton nom."
            }
          >
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder={t("profile.nicknamePlaceholder") || "Ex : Fabe, FT, …"}
              style={inputStyle}
            />
          </Field>
          <Field
            label={t("profile.shownAsLabel") || "Comment les autres me voient"}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
              }}
            >
              <button
                type="button"
                onClick={() => setDisplayPref("NAME")}
                style={{
                  ...inputStyle,
                  cursor: "pointer",
                  background:
                    displayPref === "NAME"
                      ? "var(--v45-saffron, #C58A2E)"
                      : "transparent",
                  color:
                    displayPref === "NAME"
                      ? "#FBF6EC"
                      : "var(--cocoa, #2B1F15)",
                  borderColor:
                    displayPref === "NAME"
                      ? "var(--v45-saffron, #C58A2E)"
                      : undefined,
                  fontWeight: 600,
                  textAlign: "center",
                }}
              >
                {t("profile.shownAsName") || "Sous mon nom"}
              </button>
              <button
                type="button"
                onClick={() => setDisplayPref("NICKNAME")}
                disabled={nickname.trim() === ""}
                title={
                  nickname.trim() === ""
                    ? t("profile.shownAsNicknameDisabled") ||
                      "Renseigne d'abord un pseudo"
                    : undefined
                }
                style={{
                  ...inputStyle,
                  cursor: nickname.trim() === "" ? "not-allowed" : "pointer",
                  background:
                    displayPref === "NICKNAME"
                      ? "var(--v45-saffron, #C58A2E)"
                      : "transparent",
                  color:
                    displayPref === "NICKNAME"
                      ? "#FBF6EC"
                      : nickname.trim() === ""
                        ? "var(--cocoa-soft, #6B5A47)"
                        : "var(--cocoa, #2B1F15)",
                  borderColor:
                    displayPref === "NICKNAME"
                      ? "var(--v45-saffron, #C58A2E)"
                      : undefined,
                  opacity: nickname.trim() === "" ? 0.55 : 1,
                  fontWeight: 600,
                  textAlign: "center",
                }}
              >
                {t("profile.shownAsNickname") || "Sous mon pseudo"}
              </button>
            </div>
          </Field>
          <Field label={t("dashboard.defaultCurrency") || "Devise"}>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              style={inputStyle}
            >
              {availableCurrencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag ? `${c.flag} ` : ""}
                  {c.code} · {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("profile.appLanguage") || "Langue"}>
            <SharedLangPicker
              locale={locale || "fr"}
              onChange={(l) => setLocale(l)}
              whitelist={availableLocales.map((l) => l.code)}
              triggerStyle={{ width: "100%" }}
            />
          </Field>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              style={{ ...ghostBtnStyle, flex: 1 }}
            >
              {t("common.cancel") || "Annuler"}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || !displayName.trim()}
              style={{ ...primaryBtnStyle, flex: 1 }}
            >
              {saving
                ? t("common.saving") || "Enregistrement…"
                : t("common.save") || "Enregistrer"}
            </button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ===========================================================================
// === CONTACTS (colonne gauche) =============================================
// ===========================================================================

function ContactsSection({ user }: { user: ProfileUser }) {
  const t = useT();
  const contacts = user.contacts ?? [];
  return (
    <SectionCard
      title={t("profile.contactsVerifiedTitle") || "Contacts vérifiés"}
      subtitle={
        t("profile.contactsSubtitle") ||
        "Téléphones et emails confirmés"
      }
      iconName="phone"
    >
      {contacts.length === 0 ? (
        <p
          style={{
            margin: 0,
            fontSize: 12.5,
            color: "var(--cocoa-soft, #6B5A47)",
            fontStyle: "italic",
            padding: "8px 0",
          }}
        >
          {t("profile.noContactsYet") || "Aucun contact vérifié pour le moment."}
        </p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {contacts.map((c) => (
            <li
              key={c.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                background: "var(--ivory, #FBF6EC)",
                border: "1px solid rgba(43,31,21,0.08)",
                borderRadius: 10,
                fontSize: 13,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: "rgba(197,138,46,0.14)",
                  color: "var(--v45-saffron, #C58A2E)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon
                  name={c.type === "EMAIL" ? "mail" : "phone"}
                  size={15}
                  strokeWidth={1.7}
                />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 600,
                    color: "var(--cocoa, #2B1F15)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {c.value}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--cocoa-soft, #6B5A47)",
                    marginTop: 1,
                  }}
                >
                  {c.isPrimary
                    ? t("profile.primaryContact") || "Contact principal"
                    : c.verifiedAt
                      ? t("profile.verified") || "Vérifié"
                      : t("profile.unverified") || "Non vérifié"}
                </div>
              </div>
              {c.verifiedAt && (
                <span
                  aria-label="Vérifié"
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: "#2F8B5C",
                    color: "#FFFFFF",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 800,
                    flexShrink: 0,
                  }}
                >
                  ✓
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

// ===========================================================================
// === PRÉFÉRENCES (colonne gauche) ==========================================
// ===========================================================================

function PreferencesSection() {
  const t = useT();
  const appVersion =
    process.env.NEXT_PUBLIC_APP_VERSION || "dev";
  return (
    <SectionCard
      title={t("profile.preferencesTitle") || "Préférences"}
      subtitle={t("profile.preferencesSubtitle") || "Thème, version, infos système"}
      iconName="settings"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "10px 12px",
            background: "var(--ivory, #FBF6EC)",
            border: "1px solid rgba(43,31,21,0.08)",
            borderRadius: 10,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--cocoa, #2B1F15)",
              }}
            >
              {t("profile.themeLabel") || "Thème"}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--cocoa-soft, #6B5A47)",
                marginTop: 2,
              }}
            >
              {t("profile.themeHint") || "Clair (V45) ou sombre"}
            </div>
          </div>
          <ThemeToggle variant="ghost" size={36} />
        </div>
        <KeyValueRow
          label={t("profile.appVersion") || "Version app"}
          value={appVersion}
        />
      </div>
    </SectionCard>
  );
}

// ===========================================================================
// === DÉCONNEXION (colonne gauche, en bas) ==================================
// ===========================================================================

function LogoutSection({
  onLogout,
  t,
}: {
  onLogout: () => void;
  t: ReturnType<typeof useT>;
}) {
  return (
    <SectionCard
      title={t("profile.section.account") || "Compte"}
      subtitle={
        t("profile.section.accountSubtitle") ||
        "Suppression et déconnexion"
      }
      iconName="log-out"
    >
      <button
        type="button"
        onClick={onLogout}
        style={{
          ...primaryBtnStyle,
          width: "100%",
          background:
            "linear-gradient(135deg, rgba(159,70,40,0.10), rgba(217,113,74,0.06))",
          color: "var(--v45-terracotta, #9F4628)",
          border: "1px solid rgba(159,70,40,0.30)",
          boxShadow: "none",
        }}
      >
        <Icon name="log-out" size={15} strokeWidth={1.8} />
        {t("desktop.logout") || "Me déconnecter"}
      </button>
      <p
        style={{
          fontSize: 11,
          color: "var(--cocoa-soft, #6B5A47)",
          textAlign: "center",
          marginTop: 10,
          marginBottom: 0,
          lineHeight: 1.5,
        }}
      >
        {t("profile.deleteAccountInstruction", {
          email: "privacy@backmesdo.com",
        }) ||
          "Pour supprimer ton compte, écris à privacy@backmesdo.com depuis l'email associé."}
      </p>
    </SectionCard>
  );
}

// ===========================================================================
// === HELPERS UI partagés ===================================================
// ===========================================================================

function SectionCard({
  title,
  subtitle,
  iconName,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  iconName?: Parameters<typeof Icon>[0]["name"];
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      style={{
        background: "var(--paper, #FFFFFF)",
        border: "1px solid rgba(43,31,21,0.08)",
        borderRadius: 18,
        padding: 20,
        boxShadow: "0 2px 8px rgba(43,31,21,0.04)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3
            style={{
              margin: 0,
              fontFamily: "Cormorant Garamond, serif",
              fontSize: 20,
              fontWeight: 600,
              color: "var(--cocoa, #2B1F15)",
              lineHeight: 1.2,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {iconName && (
              <span
                aria-hidden
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: "rgba(197,138,46,0.14)",
                  color: "var(--v45-saffron, #C58A2E)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon name={iconName} size={15} strokeWidth={1.7} />
              </span>
            )}
            {title}
          </h3>
          {subtitle && (
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 12,
                color: "var(--cocoa-soft, #6B5A47)",
                lineHeight: 1.4,
                paddingLeft: iconName ? 36 : 0,
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
        {action && <div style={{ flexShrink: 0 }}>{action}</div>}
      </header>
      {children}
    </section>
  );
}

function KeyValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "8px 12px",
        background: "var(--ivory, #FBF6EC)",
        border: "1px solid rgba(43,31,21,0.06)",
        borderRadius: 10,
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: "var(--cocoa-soft, #6B5A47)",
          letterSpacing: 1.2,
          textTransform: "uppercase",
          fontWeight: 700,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 13,
          color: "var(--cocoa, #2B1F15)",
          fontWeight: 600,
          textAlign: "right",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: "60%",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  /** V144 — Texte explicatif sous le label (optionnel) */
  hint?: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          fontSize: 11,
          color: "var(--cocoa-soft, #6B5A47)",
          letterSpacing: 1.2,
          textTransform: "uppercase",
          fontWeight: 700,
        }}
      >
        {label}
      </span>
      {hint && (
        <span
          style={{
            fontSize: 11.5,
            color: "var(--cocoa-soft, #6B5A47)",
            fontStyle: "italic",
            marginTop: -2,
            marginBottom: 2,
            lineHeight: 1.4,
          }}
        >
          {hint}
        </span>
      )}
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  background: "var(--ivory, #FBF6EC)",
  border: "1px solid rgba(43,31,21,0.12)",
  borderRadius: 10,
  fontSize: 14,
  color: "var(--cocoa, #2B1F15)",
  fontFamily: "inherit",
  outline: "none",
};

const ghostBtnStyle: React.CSSProperties = {
  padding: "8px 14px",
  background: "transparent",
  border: "1px solid rgba(43,31,21,0.14)",
  borderRadius: 10,
  fontSize: 12,
  fontWeight: 600,
  color: "var(--cocoa-soft, #6B5A47)",
  cursor: "pointer",
  fontFamily: "inherit",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const primaryBtnStyle: React.CSSProperties = {
  padding: "12px 16px",
  background:
    "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--v45-terracotta, #9F4628))",
  border: "none",
  borderRadius: 12,
  fontSize: 13,
  fontWeight: 700,
  color: "#FFFFFF",
  cursor: "pointer",
  fontFamily: "inherit",
  boxShadow: "0 4px 12px rgba(197,138,46,0.30)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
};
