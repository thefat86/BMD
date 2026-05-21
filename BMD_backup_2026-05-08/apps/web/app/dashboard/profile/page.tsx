"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  api,
  clearToken,
  getToken,
  isUnauthorized,
} from "../../../lib/api-client";
import { BottomNav } from "../../../lib/ui/bottom-nav";
import { TwoFactorBlock } from "../../../lib/ui/two-factor-block";
import { PasskeyManager } from "../../../lib/ui/passkey-manager";
import { PushNotifBlock } from "../../../lib/ui/push-notif-block";
import { IosInstallNotice } from "../../../lib/ui/ios-install-notice";
import { GdprBlock } from "../../../lib/ui/gdpr-block";
import { PromoBlock } from "../../../lib/ui/promo-block";
import { SimSwapAlerts } from "../../../lib/ui/sim-swap-alerts";
import { PaymentMethodsBlock } from "../../../lib/ui/payment-methods-block";
import { useLocale } from "../../../lib/locale-provider";
import { useCurrency } from "../../../lib/currency-provider";
import { PlanBlock } from "../../../lib/ui/plan-block";
import { useDialog } from "../../../lib/ui/dialog-provider";
import { ResponsiveShell } from "../../../lib/ui/responsive-shell";
import { useBreakpoint } from "../../../lib/use-breakpoint";
import { usePullToRefresh } from "../../../lib/use-pull-to-refresh";
import { PullIndicator } from "../../../lib/ui/pull-indicator";
import { useT } from "../../../lib/i18n/app-strings";
import { SharedLangPicker } from "../../../lib/ui/shared-lang-picker";

export default function ProfilePage() {
  const router = useRouter();
  const dialog = useDialog();
  const { isMobile } = useBreakpoint();
  const t = useT();
  const [user, setUser] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Profil edit
  const [editingProfile, setEditingProfile] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [defaultCurrency, setDefaultCurrency] = useState("EUR");
  const [defaultLocale, setDefaultLocale] = useState("fr");
  const [savingProfile, setSavingProfile] = useState(false);

  // Listes dynamiques (chargées depuis le backend pour refléter les langues
  // et devises ACTIVES — pas un set hardcodé qui dérive du code source)
  const { available: availableLocales, setLocale: applyLocaleGlobal } =
    useLocale();
  const { setCurrency: applyCurrencyGlobal } = useCurrency();
  const [availableCurrencies, setAvailableCurrencies] = useState<
    Array<{ code: string; name: string; symbol: string; flag: string | null }>
  >([]);

  useEffect(() => {
    api
      .listCurrencies()
      .then((rows) =>
        setAvailableCurrencies(
          rows.map((r) => ({
            code: r.code,
            name: r.name,
            symbol: r.symbol,
            flag: r.flag,
          })),
        ),
      )
      .catch(() => {
        // Fallback minimal si offline
        setAvailableCurrencies([
          { code: "EUR", name: "Euro", symbol: "€", flag: "🇪🇺" },
          { code: "USD", name: "Dollar US", symbol: "$", flag: "🇺🇸" },
        ]);
      });
  }, []);

  // Add contact
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactType, setContactType] = useState<"PHONE" | "EMAIL">("PHONE");
  const [contactValue, setContactValue] = useState("+33");
  const [addStep, setAddStep] = useState<"contact" | "code">("contact");
  const [otpCode, setOtpCode] = useState("");
  const [adding, setAdding] = useState(false);
  /**
   * Re-vérification d'un contact existant (spec §7.3) : si la dernière
   * vérification date de plus de 6 mois (badge ⚠ stale), l'utilisateur
   * peut taper « Re-vérifier » → on envoie un OTP et on affiche un input
   * inline pour saisir le code.
   */
  const [reverifyingContactId, setReverifyingContactId] = useState<string | null>(null);
  const [reverifyOtpCode, setReverifyOtpCode] = useState("");
  const [reverifyBusy, setReverifyBusy] = useState(false);

  async function refresh() {
    try {
      const r = await api.me();
      setUser(r.user);
      setDisplayName(r.user.displayName);
      setDefaultCurrency(r.user.defaultCurrency);
      setDefaultLocale(r.user.defaultLocale);
    } catch (e) {
      if (isUnauthorized(e)) {
        clearToken();
        router.replace("/login");
        return;
      }
      setError((e as Error).message);
    }
  }

  // Pull-to-refresh natif (mobile only). Recharge profil + contacts.
  const { state: pullState, bindToScrollContainer } = usePullToRefresh({
    onRefresh: async () => {
      await Promise.all([
        new Promise((r) => setTimeout(r, 600)),
        refresh(),
      ]);
    },
  });
  useEffect(() => {
    bindToScrollContainer(document.body);
  }, [bindToScrollContainer]);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function flash(msg: string) {
    setSuccess(msg);
    setError(null);
    setTimeout(() => setSuccess(null), 3000);
  }

  async function saveProfile() {
    setError(null);
    setSavingProfile(true);
    try {
      await api.updateMe({
        displayName: displayName.trim(),
        defaultCurrency,
        defaultLocale,
      });
      // Applique IMMÉDIATEMENT la langue ET la devise choisies à toute
      // l'app (sinon il faudrait que l'utilisateur recharge la page).
      // Les deux providers (LocaleProvider + CurrencyProvider) propagent
      // le changement à TOUS les composants qui les consomment.
      await applyLocaleGlobal(defaultLocale);
      await applyCurrencyGlobal(defaultCurrency);
      await refresh();
      setEditingProfile(false);
      flash(t("profile.updated"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingProfile(false);
    }
  }

  async function startAddContact() {
    setError(null);
    setAdding(true);
    try {
      await api.addContact(contactType, contactValue);
      setAddStep("code");
      flash(t("profile.codeSentBackend"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function confirmAddContact() {
    setError(null);
    setAdding(true);
    try {
      await api.verifyContact({
        contactType,
        contactValue,
        code: otpCode,
      });
      setShowAddContact(false);
      setAddStep("contact");
      setContactValue(contactType === "PHONE" ? "+33" : "");
      setOtpCode("");
      await refresh();
      flash(t("profile.contactAdded"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  /**
   * Démarre la re-vérification d'un contact stale : envoie un nouvel OTP
   * sur le contact + ouvre le formulaire OTP inline (spec §7.3).
   */
  async function startReverify(contact: { id: string; type: "PHONE" | "EMAIL"; value: string }) {
    setError(null);
    setReverifyBusy(true);
    try {
      await api.requestOtp(contact.type, contact.value);
      setReverifyingContactId(contact.id);
      setReverifyOtpCode("");
    } catch (e) {
      setError(t("profile.cantSendCode", { message: (e as Error).message }));
    } finally {
      setReverifyBusy(false);
    }
  }

  /**
   * Confirme la re-vérification : envoie le code reçu, le serveur met à jour
   * verifiedAt → le badge ⚠ disparaît, redevient ✓ Vérifié.
   */
  async function confirmReverify(contact: {
    id: string;
    type: "PHONE" | "EMAIL";
    value: string;
  }) {
    setError(null);
    setReverifyBusy(true);
    try {
      await api.verifyContact({
        contactType: contact.type,
        contactValue: contact.value,
        code: reverifyOtpCode,
      });
      setReverifyingContactId(null);
      setReverifyOtpCode("");
      await refresh();
      flash(t("profile.contactReverified"));
    } catch (e) {
      setError(t("profile.invalidCode", { message: (e as Error).message }));
    } finally {
      setReverifyBusy(false);
    }
  }

  async function removeContact(id: string) {
    if (
      !(await dialog.confirm(t("profile.deleteContactConfirm"), {
        variant: "danger",
        title: "Suppression",
        confirmLabel: "Supprimer",
      }))
    )
      return;
    setError(null);
    try {
      await api.deleteContact(id);
      await refresh();
      flash(t("profile.contactDeleted"));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function makePrimary(id: string) {
    setError(null);
    try {
      await api.setPrimaryContact(id);
      await refresh();
      flash(t("profile.primaryUpdated"));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  /**
   * Déconnexion avec confirmation façon app bancaire.
   * Demande confirmation avant de logger out (évite les déconnexions
   * accidentelles, et donne un moment de réflexion à l'utilisateur).
   * Toutes les sessions sont révoquées côté serveur via api.logout().
   */
  async function logout() {
    const ok = await dialog.confirm(
      t("profile.logoutConfirmMsg"),
      {
        variant: "warning",
        title: t("profile.logoutDialogTitle"),
        confirmLabel: t("profile.logoutConfirmLabel"),
        cancelLabel: t("common.cancel"),
      },
    );
    if (!ok) return;
    clearToken();
    api.logout().catch(() => {});
    // Retour à la page d'accueil (vitrine) après déconnexion volontaire
    router.replace("/");
  }

  if (!user) {
    return (
      <ResponsiveShell
        breadcrumb="Mon compte"
        desktopTitle="Mon profil"
        mobileTitle="Mon profil"
        back={{ href: "/dashboard" }}
        hideFab
      >
        <p className="muted" style={{ padding: 30 }}>
          Chargement…
        </p>
      </ResponsiveShell>
    );
  }

  // Hero header mobile : avatar XL + nom + plan badge + CTA "Modifier"
  // Style banking app (Lydia/Revolut) : fond gradient saffron/terracotta,
  // chiffres clairs, badge plan en évidence, déconnexion en bas.
  const mobileHero = (
    <div
      style={{
        background:
          "linear-gradient(135deg, rgba(232,163,61,0.12) 0%, rgba(181,70,46,0.06) 100%)",
        borderRadius: 22,
        padding: 22,
        margin: "8px 16px 18px",
        textAlign: "center",
        border: "1px solid rgba(232,163,61,0.15)",
      }}
    >
      <div
        style={{
          width: 88,
          height: 88,
          borderRadius: "50%",
          background:
            "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#16111E",
          fontSize: 36,
          fontWeight: 800,
          fontFamily: "Cormorant Garamond, serif",
          margin: "0 auto 14px",
          boxShadow: "0 6px 20px rgba(232,163,61,0.35)",
        }}
      >
        {user.displayName?.charAt(0).toUpperCase() ?? "?"}
      </div>
      <div
        style={{
          fontFamily: "Cormorant Garamond, serif",
          fontSize: 24,
          fontWeight: 700,
          color: "var(--cream)",
          marginBottom: 6,
          lineHeight: 1.1,
        }}
      >
        {user.displayName}
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--cream-soft, #d4c4a8)",
          marginBottom: 12,
          letterSpacing: 0.6,
        }}
      >
        {user.defaultCurrency} · {user.defaultLocale?.toUpperCase()}
      </div>
      {user.planCode && (
        <Link
          href="/dashboard/plans"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 14px",
            borderRadius: 999,
            background:
              user.planCode === "FREE"
                ? "rgba(244,228,193,0.06)"
                : "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))",
            color: user.planCode === "FREE" ? "var(--cream-soft)" : "#16111E",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.8,
            textTransform: "uppercase",
            textDecoration: "none",
            border:
              user.planCode === "FREE"
                ? "1px solid rgba(244,228,193,0.15)"
                : "none",
          }}
        >
          {user.planCode === "FREE" ? "🌱" : "✨"} {t("profile.planBadge", { planCode: user.planCode })}
        </Link>
      )}
    </div>
  );

  return (
    <ResponsiveShell
      breadcrumb="Mon compte"
      desktopTitle="Mon profil"
      subtitle={t("profile.subtitle")}
      mobileTitle="Mon profil"
      back={{ href: "/dashboard" }}
      hideFab
    >
      <div
        style={{
          padding: isMobile ? 0 : 0,
          maxWidth: isMobile ? "100%" : 920,
          margin: "0 auto",
        }}
      >
      {/* Pull-to-refresh indicator — au-dessus du hero, mobile only */}
      {isMobile && <PullIndicator {...pullState} />}

      {isMobile && mobileHero}

      {/* Conteneur des cards. En mobile, on ajoute un padding horizontal
          pour que les cards ne touchent pas les bords (dans le shell
          mobile elles ont déjà 16px de marge auto). En desktop, le
          DesktopShell fournit déjà max-width et padding. */}
      <div style={{ padding: isMobile ? "0 16px 24px" : 0 }}>

      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      {/* === Profil === */}
      <div className="card">
        <div className="card-head">
          <h2>{t("profile.identity")}</h2>
          {!editingProfile ? (
            <button
              className="btn-ghost btn-sm"
              onClick={() => setEditingProfile(true)}
            >
              {t("profile.editIdentity")}
            </button>
          ) : (
            <button
              className="btn-ghost btn-sm"
              onClick={() => {
                setEditingProfile(false);
                setDisplayName(user.displayName);
                setDefaultCurrency(user.defaultCurrency);
                setDefaultLocale(user.defaultLocale);
              }}
            >
              ✕
            </button>
          )}
        </div>

        {!editingProfile ? (
          <div className="list">
            <div className="list-item">
              <div
                className="icon"
                style={{
                  background:
                    "linear-gradient(135deg,var(--saffron),var(--terracotta))",
                  color: "#16111e",
                  fontSize: 18,
                  fontWeight: 700,
                }}
              >
                {user.displayName.charAt(0).toUpperCase()}
              </div>
              <div className="text">
                <div className="name">{user.displayName}</div>
                <div className="meta">{t("profile.displayedName")}</div>
              </div>
            </div>
            <div className="list-item">
              <div className="icon">💱</div>
              <div className="text">
                <div className="name">{user.defaultCurrency}</div>
                <div className="meta">{t("dashboard.defaultCurrency")}</div>
              </div>
            </div>
            <div className="list-item">
              <div className="icon">🌍</div>
              <div className="text">
                <div className="name">
                  {(() => {
                    const found = availableLocales.find(
                      (l) => l.code === user.defaultLocale,
                    );
                    return found
                      ? `${found.flag} ${found.name}`
                      : user.defaultLocale;
                  })()}
                </div>
                <div className="meta">{t("profile.preferredLang")}</div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="field">
              <label>{t("profile.displayNameLabel")}</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t("profile.displayNameExample")}
              />
            </div>
            <div className="field">
              <label>
                Devise par défaut
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--cream-soft)",
                    marginLeft: 6,
                    fontWeight: 400,
                  }}
                >
                  · utilisée pour ton solde global et la création de groupes
                </span>
              </label>
              <select
                value={defaultCurrency}
                onChange={(e) => setDefaultCurrency(e.target.value)}
              >
                {availableCurrencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag ? `${c.flag} ` : ""}
                    {c.code} · {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>
                {t("profile.appLanguage")}
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--cream-soft)",
                    marginLeft: 6,
                    fontWeight: 400,
                  }}
                >
                  · {t("profile.localesAvailable", {
                    n: String(availableLocales.length),
                  })}
                </span>
              </label>
              <SharedLangPicker
                locale={defaultLocale || "fr"}
                onChange={(l) => setDefaultLocale(l)}
                whitelist={
                  availableLocales.length > 0
                    ? availableLocales.map((l) => l.code)
                    : undefined
                }
                triggerStyle={{ width: "100%" }}
              />
            </div>
            <button
              className="btn btn-block"
              onClick={saveProfile}
              disabled={!displayName.trim() || savingProfile}
            >
              {savingProfile ? "Enregistrement…" : "✓ Enregistrer"}
            </button>
          </>
        )}
      </div>

      {/* === Contacts === */}
      <div className="card">
        <div className="card-head">
          <h2>{t("profile.contactsVerifiedTitle")}</h2>
          <span className="muted" style={{ fontSize: 11 }}>
            {user.contacts.length}
          </span>
        </div>

        <div className="list">
          {user.contacts.map((c: any) => (
            <div key={c.id} className="list-item">
              <div className="icon">
                {c.type === "PHONE" ? "📞" : "✉️"}
              </div>
              <div className="text">
                <div className="name">
                  {c.value}
                  {c.isPrimary && (
                    <span
                      className="chip chip-saffron"
                      style={{
                        marginLeft: 6,
                        fontSize: 9,
                        padding: "2px 6px",
                      }}
                    >
                      {t("profile.primary")}
                    </span>
                  )}
                </div>
                <div className="meta">
                  {c.isVerified ? (
                    <>
                      {(c as any).stale ? (
                        <span
                          style={{ color: "var(--saffron, #e8a33d)" }}
                          title={t("profile.staleVerificationHint")}
                        >
                          ⚠ Vérification &gt; 6 mois
                        </span>
                      ) : (
                        <>{t("profile.verified")}</>
                      )}
                      {c.verifiedAt &&
                        ` · ${new Date(c.verifiedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" })}`}
                    </>
                  ) : (
                    <span style={{ color: "var(--rose, #d9714a)" }}>
                      ⚠ Non vérifié
                    </span>
                  )}
                </div>
              </div>
              {/* Bouton "Re-vérifier" si stale (spec §7.3) */}
              {c.isVerified && (c as any).stale && reverifyingContactId !== c.id && (
                <button
                  className="btn-ghost btn-sm"
                  onClick={() =>
                    startReverify({
                      id: c.id,
                      type: c.type as "PHONE" | "EMAIL",
                      value: c.value,
                    })
                  }
                  disabled={reverifyBusy}
                  style={{
                    padding: "4px 10px",
                    color: "var(--saffron, #e8a33d)",
                    borderColor: "rgba(232,163,61,0.4)",
                  }}
                  title={t("profile.reverifyTitle")}
                >
                  ↻
                </button>
              )}
              {c.isVerified && !c.isPrimary && (
                <button
                  className="btn-ghost btn-sm"
                  onClick={() => makePrimary(c.id)}
                  style={{ padding: "4px 10px" }}
                  title={t("profile.makePrimaryTitle")}
                >
                  ★
                </button>
              )}
              <button
                className="btn-ghost btn-sm"
                onClick={() => removeContact(c.id)}
                style={{
                  padding: "4px 10px",
                  color: "var(--rose)",
                  borderColor: "rgba(217,113,74,0.3)",
                }}
                title={t("common.delete")}
              >
                ✕
              </button>

              {/* Formulaire OTP inline pour la re-vérification */}
              {reverifyingContactId === c.id && (
                <div
                  style={{
                    flexBasis: "100%",
                    marginTop: 10,
                    padding: 12,
                    background: "rgba(232,163,61,0.06)",
                    border: "1px solid rgba(232,163,61,0.30)",
                    borderRadius: 10,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div style={{ fontSize: 12, color: "var(--cream-soft)" }}>
                    Code envoyé à <strong>{c.value}</strong> — saisis-le ci-dessous
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      value={reverifyOtpCode}
                      onChange={(e) => setReverifyOtpCode(e.target.value)}
                      placeholder="123456"
                      maxLength={6}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      autoFocus
                      style={{
                        flex: 1,
                        padding: "10px 14px",
                        fontSize: 16,
                        letterSpacing: 6,
                        textAlign: "center",
                        background: "rgba(244,228,193,0.06)",
                        border: "1px solid rgba(244,228,193,0.18)",
                        borderRadius: 8,
                        color: "var(--cream)",
                        fontFamily: "inherit",
                      }}
                    />
                    <button
                      type="button"
                      className="btn"
                      disabled={reverifyOtpCode.length < 4 || reverifyBusy}
                      onClick={() =>
                        confirmReverify({
                          id: c.id,
                          type: c.type as "PHONE" | "EMAIL",
                          value: c.value,
                        })
                      }
                      style={{ padding: "10px 16px", fontSize: 13 }}
                    >
                      {reverifyBusy ? "…" : "✓"}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => {
                        setReverifyingContactId(null);
                        setReverifyOtpCode("");
                      }}
                      style={{ padding: "10px 12px" }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {!showAddContact ? (
          <button
            className="btn-ghost btn-block"
            onClick={() => {
              setShowAddContact(true);
              setAddStep("contact");
            }}
            style={{ marginTop: 12 }}
          >
            {t("profile.addContact")}
          </button>
        ) : (
          <div
            style={{
              marginTop: 14,
              padding: 14,
              background: "var(--overlay)",
              border: "1px solid var(--line)",
              borderRadius: 12,
            }}
          >
            <div className="between" style={{ marginBottom: 10 }}>
              <strong
                style={{
                  fontSize: 14,
                  color: "var(--cream)",
                  fontFamily: "Cormorant Garamond, serif",
                }}
              >
                {addStep === "contact"
                  ? "Nouveau contact"
                  : t("profile.verifyCode")}
              </strong>
              <button
                className="btn-ghost btn-sm"
                onClick={() => {
                  setShowAddContact(false);
                  setAddStep("contact");
                  setOtpCode("");
                }}
              >
                ✕
              </button>
            </div>

            {addStep === "contact" && (
              <>
                <div className="field">
                  <label>Type</label>
                  <select
                    value={contactType}
                    onChange={(e) => {
                      const t = e.target.value as "PHONE" | "EMAIL";
                      setContactType(t);
                      setContactValue(t === "PHONE" ? "+33" : "");
                    }}
                  >
                    <option value="PHONE">📞 Téléphone</option>
                    <option value="EMAIL">✉️ Email</option>
                  </select>
                </div>
                <div className="field">
                  <label>
                    {contactType === "PHONE"
                      ? t("profile.phoneLabel")
                      : "Adresse email"}
                  </label>
                  <input
                    type={contactType === "EMAIL" ? "email" : "tel"}
                    inputMode={contactType === "EMAIL" ? "email" : "tel"}
                    value={contactValue}
                    onChange={(e) => setContactValue(e.target.value)}
                    placeholder={
                      contactType === "PHONE"
                        ? "+237 6 88 12 34 56"
                        : "autre@email.com"
                    }
                  />
                </div>
                <button
                  className="btn btn-block"
                  onClick={startAddContact}
                  disabled={adding || contactValue.trim().length < 3}
                >
                  {adding ? "Envoi…" : "✓ Envoyer un code"}
                </button>
              </>
            )}

            {addStep === "code" && (
              <>
                <p
                  className="muted"
                  style={{ fontSize: 12, marginBottom: 10 }}
                >
                  Code envoyé à <strong>{contactValue}</strong>.
                  En mode dev, il s'affiche dans la console du backend.
                </p>
                <div className="field">
                  <label>Code à 6 chiffres</label>
                  <input
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    placeholder="123456"
                    inputMode="numeric"
                    maxLength={6}
                    style={{
                      fontSize: 22,
                      letterSpacing: 6,
                      textAlign: "center",
                    }}
                  />
                </div>
                <button
                  className="btn btn-block"
                  onClick={confirmAddContact}
                  disabled={adding || otpCode.length < 4}
                >
                  {adding ? t("profile.verifying") : t("profile.verifyAndAdd")}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* === Console admin (visible uniquement si super admin) === */}
      {user.isSuperAdmin && (
        <div className="card">
          <div className="card-head">
            <h2>{t("profile.adminConsoleTitle")}</h2>
            <span className="chip chip-saffron">{t("profile.superAdmin")}</span>
          </div>
          <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
            {t("profile.adminAccessDescription")}
          </p>
          <Link
            href="/admin"
            className="btn btn-block"
            style={{ textDecoration: "none" }}
          >
            {t("profile.openAdminConsole")}
          </Link>
        </div>
      )}

      {/* === Sécurité === */}
      <div className="card">
        <div className="card-head">
          <h2>🔐 Sécurité</h2>
        </div>
        <button className="btn-ghost btn-block" onClick={logout}>
          ↩ Me déconnecter
        </button>
        <p
          className="muted text-center"
          style={{ fontSize: 11, marginTop: 10 }}
        >
          {t("profile.deleteAccountInstruction", { email: "privacy@backmesdo.com" })}
        </p>
      </div>

      {/* === Légal === */}
      <div className="card">
        <div className="card-head">
          <h2>{t("profile.legalTitle")}</h2>
        </div>
        <Link
          href="/legal/privacy"
          className="btn-ghost btn-block"
          style={{
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          {t("profile.privacyPolicy")}
        </Link>
        <p
          className="muted text-center"
          style={{ fontSize: 11, marginTop: 10, lineHeight: 1.5 }}
        >
          {t("profile.gdprNote")}
        </p>
      </div>

      {/* === Alertes SIM swap (spec §7.5) === affichées EN HAUT pour visibilité max */}
      <SimSwapAlerts />

      {/* === Mon forfait (spec §6.3) === en haut pour CTA upgrade visible */}
      <PlanBlock />

      {/* === Passkeys WebAuthn (spec §7.5) === */}
      <PasskeyManager />

      {/* === 2FA TOTP (spec §7.5) === */}
      <TwoFactorBlock />

      {/* === Sessions actives (spec §7.5) === */}
      <SessionsBlock />

      {/* === Bandeau iOS : install PWA pour activer les push (Safari sans
          PWA = pas de push possible iOS 16.4+) === */}
      <IosInstallNotice />

      {/* === Notifications push web (spec §3.12 §8.5) === */}
      <PushNotifBlock />

      {/* === Moyens de paiement chiffrés (spec §9.1) === */}
      <PaymentMethodsBlock />

      {/* === Codes promo & parrainage (spec §6.9) === */}
      <PromoBlock />

      {/* === RGPD : export + droit à l'oubli (spec §9.1) === */}
      <GdprBlock />

      {/* === BOUTON DE DÉCONNEXION proéminent — style banking app ===
          Toujours visible, en bas, en grand, séparé visuellement du reste
          du profil pour qu'on ne le rate pas (les utilisateurs cherchent
          souvent "comment me déconnecter" et on doit pas les faire creuser).
          Le bouton appelle logout() qui demande confirmation via dialog.
       */}
      <div
        style={{
          marginTop: 28,
          marginBottom: 24,
          padding: 18,
          background: "rgba(217,113,74,0.04)",
          border: "1px solid rgba(217,113,74,0.18)",
          borderRadius: 16,
          textAlign: "center",
        }}
      >
        <button
          type="button"
          onClick={logout}
          style={{
            width: "100%",
            padding: "14px 20px",
            background: "rgba(217,113,74,0.10)",
            color: "#FFB89A",
            border: "1px solid rgba(217,113,74,0.30)",
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            letterSpacing: 0.4,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {t("profile.signOut")}
        </button>
        <p
          style={{
            margin: "10px 0 0",
            fontSize: 11,
            color: "var(--muted)",
            lineHeight: 1.5,
          }}
        >
          {t("profile.signOutHint")}
        </p>
      </div>
      </div>
      </div>
    </ResponsiveShell>
  );
}

/**
 * Liste des sessions actives + bouton révoquer pour chacune.
 * Spec §7.5 : "Sessions actives listées dans le profil, possibilité de
 * déconnecter à distance."
 *
 * La session courante est marquée et non-révocable depuis ici (l'utilisateur
 * doit utiliser le bouton "Se déconnecter" plus haut pour ça, ce qui évite
 * une déconnexion accidentelle suivie d'un état incohérent).
 */
function SessionsBlock(): JSX.Element | null {
  const dialog = useDialog();
  const t = useT();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const list = await api.listSessions();
      setSessions(list);
    } catch {
      // Silencieux : si l'utilisateur n'a pas accès, on n'affiche rien
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function revoke(id: string) {
    const ok = await dialog.confirm(
      t("profile.deviceLogoutConfirmMsg"),
      {
        variant: "warning",
        title: t("profile.deviceLogoutTitle"),
        confirmLabel: t("profile.deviceDisconnect"),
      },
    );
    if (!ok) return;
    try {
      await api.revokeSession(id);
      await load();
    } catch (e) {
      await dialog.alert(`Échec : ${(e as Error).message}`, {
        variant: "danger",
        title: "Erreur",
      });
    }
  }

  if (loading || sessions.length === 0) return null;

  return (
    <div className="card">
      <div className="card-head">
        <h2>{t("profile.activeSessionsTitle")}</h2>
        <span className="muted" style={{ fontSize: 11 }}>
          {sessions.length}
        </span>
      </div>
      <p
        className="muted"
        style={{ fontSize: 12, marginBottom: 10, lineHeight: 1.5 }}
      >
        {t("profile.activeSessionsDescription")}
      </p>
      <div className="list">
        {sessions.map((s) => {
          const ua = s.device ?? "Appareil inconnu";
          const isMobile = /mobile|iphone|android/i.test(ua);
          return (
            <div key={s.id} className="list-item">
              <div className="icon">{isMobile ? "📱" : "💻"}</div>
              <div className="text">
                <div className="name">
                  {/* Description compacte du user-agent */}
                  {parseUA(ua)}
                  {s.isCurrent && (
                    <span
                      style={{
                        fontSize: 9,
                        color: "var(--saffron)",
                        marginLeft: 6,
                        letterSpacing: 1,
                      }}
                    >
                      {t("profile.thisSession")}
                    </span>
                  )}
                </div>
                <div className="meta">
                  {t("profile.connectedOn", {
                    date: new Date(s.createdAt).toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    }),
                    expiry: new Date(s.expiresAt).toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "short",
                    }),
                  })}
                </div>
              </div>
              {!s.isCurrent && (
                <button
                  type="button"
                  onClick={() => revoke(s.id)}
                  aria-label={t("profile.disconnect")}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--rose, #ef4444)",
                    cursor: "pointer",
                    fontSize: 14,
                    padding: "6px 10px",
                    minHeight: 36,
                  }}
                >
                  {t("profile.disconnect")}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Parse léger d'un user-agent → label lisible (Chrome on iPhone, Firefox on Mac…) */
function parseUA(ua: string): string {
  if (!ua) return "Appareil inconnu";
  const browser =
    /Edg/i.test(ua)
      ? "Edge"
      : /Chrome/i.test(ua) && !/Edg/i.test(ua)
        ? "Chrome"
        : /Safari/i.test(ua) && !/Chrome/i.test(ua)
          ? "Safari"
          : /Firefox/i.test(ua)
            ? "Firefox"
            : "Navigateur";
  const os =
    /iPhone|iPad/i.test(ua)
      ? "iPhone"
      : /Android/i.test(ua)
        ? "Android"
        : /Macintosh|Mac OS/i.test(ua)
          ? "macOS"
          : /Windows/i.test(ua)
            ? "Windows"
            : /Linux/i.test(ua)
              ? "Linux"
              : "appareil";
  return `${browser} sur ${os}`;
}
