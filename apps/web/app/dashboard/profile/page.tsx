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

const CURRENCIES = [
  { v: "EUR", lbl: "EUR · Euro" },
  { v: "USD", lbl: "USD · US Dollar" },
  { v: "GBP", lbl: "GBP · British Pound" },
  { v: "CHF", lbl: "CHF · Franc Suisse" },
  { v: "XAF", lbl: "XAF · Franc CFA BEAC" },
  { v: "XOF", lbl: "XOF · Franc CFA BCEAO" },
  { v: "MAD", lbl: "MAD · Dirham marocain" },
  { v: "TND", lbl: "TND · Dinar tunisien" },
  { v: "DZD", lbl: "DZD · Dinar algérien" },
  { v: "EGP", lbl: "EGP · Livre égyptienne" },
  { v: "NGN", lbl: "NGN · Naira nigérian" },
  { v: "GHS", lbl: "GHS · Cedi ghanéen" },
  { v: "KES", lbl: "KES · Shilling kényan" },
  { v: "ZAR", lbl: "ZAR · Rand sud-africain" },
  { v: "CAD", lbl: "CAD · Dollar canadien" },
  { v: "CNY", lbl: "CNY · Yuan chinois" },
];

const LOCALES = [
  { v: "fr", lbl: "🇫🇷 Français" },
  { v: "en", lbl: "🇬🇧 English" },
  { v: "ar", lbl: "🇸🇦 العربية" },
];

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Profil edit
  const [editingProfile, setEditingProfile] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [defaultCurrency, setDefaultCurrency] = useState("EUR");
  const [defaultLocale, setDefaultLocale] = useState("fr");
  const [savingProfile, setSavingProfile] = useState(false);

  // Add contact
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactType, setContactType] = useState<"PHONE" | "EMAIL">("PHONE");
  const [contactValue, setContactValue] = useState("+33");
  const [addStep, setAddStep] = useState<"contact" | "code">("contact");
  const [otpCode, setOtpCode] = useState("");
  const [adding, setAdding] = useState(false);

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
      await refresh();
      setEditingProfile(false);
      flash("Profil mis à jour");
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
      flash("Code envoyé. Récupère-le dans la console du backend.");
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
      flash("Contact ajouté et vérifié ✓");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function removeContact(id: string) {
    if (!window.confirm("Supprimer ce contact ?")) return;
    setError(null);
    try {
      await api.deleteContact(id);
      await refresh();
      flash("Contact supprimé");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function makePrimary(id: string) {
    setError(null);
    try {
      await api.setPrimaryContact(id);
      await refresh();
      flash("Contact principal mis à jour");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function logout() {
    clearToken();
    api.logout().catch(() => {});
    // Retour à la page d'accueil (vitrine) après déconnexion volontaire
    router.replace("/");
  }

  if (!user) {
    return (
      <div className="container">
        <p className="muted">Chargement…</p>
      </div>
    );
  }

  return (
    <div className="container">
      {/* Top bar */}
      <div className="between" style={{ marginBottom: 14 }}>
        <Link
          href="/dashboard"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 13,
            color: "var(--cream-soft)",
          }}
        >
          ← Mes groupes
        </Link>
        <Link
          href="/"
          aria-label="Retour à l'accueil"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            textDecoration: "none",
            color: "inherit",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/bmd-logo.svg"
            alt=""
            width={28}
            height={28}
            style={{ flexShrink: 0 }}
          />
          <span
            style={{
              fontFamily: "Cormorant Garamond, serif",
              fontSize: 18,
              color: "var(--cream)",
              fontWeight: 700,
            }}
          >
            BMD<span style={{ color: "var(--saffron)" }}>·</span>
          </span>
        </Link>
      </div>

      {/* Page header */}
      <div className="page-header">
        <div className="titles">
          <h1>👤 Mon profil</h1>
          <div className="sub">Compte et préférences</div>
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      {/* === Profil === */}
      <div className="card">
        <div className="card-head">
          <h2>Identité</h2>
          {!editingProfile ? (
            <button
              className="btn-ghost btn-sm"
              onClick={() => setEditingProfile(true)}
            >
              ✎ Modifier
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
                <div className="meta">Nom affiché aux autres membres</div>
              </div>
            </div>
            <div className="list-item">
              <div className="icon">💱</div>
              <div className="text">
                <div className="name">{user.defaultCurrency}</div>
                <div className="meta">Devise par défaut</div>
              </div>
            </div>
            <div className="list-item">
              <div className="icon">🌍</div>
              <div className="text">
                <div className="name">
                  {LOCALES.find((l) => l.v === user.defaultLocale)?.lbl ??
                    user.defaultLocale}
                </div>
                <div className="meta">Langue préférée</div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="field">
              <label>Nom affiché</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Aïcha M."
              />
            </div>
            <div className="field">
              <label>Devise par défaut</label>
              <select
                value={defaultCurrency}
                onChange={(e) => setDefaultCurrency(e.target.value)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.v} value={c.v}>
                    {c.lbl}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Langue</label>
              <select
                value={defaultLocale}
                onChange={(e) => setDefaultLocale(e.target.value)}
              >
                {LOCALES.map((l) => (
                  <option key={l.v} value={l.v}>
                    {l.lbl}
                  </option>
                ))}
              </select>
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
          <h2>📞 Contacts vérifiés</h2>
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
                      ★ Principal
                    </span>
                  )}
                </div>
                <div className="meta">
                  {c.isVerified ? (
                    <>
                      ✓ Vérifié
                      {c.verifiedAt &&
                        ` · ${new Date(c.verifiedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" })}`}
                    </>
                  ) : (
                    "⚠ Non vérifié"
                  )}
                </div>
              </div>
              {c.isVerified && !c.isPrimary && (
                <button
                  className="btn-ghost btn-sm"
                  onClick={() => makePrimary(c.id)}
                  style={{ padding: "4px 10px" }}
                  title="Définir comme principal"
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
                title="Supprimer"
              >
                ✕
              </button>
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
            ＋ Ajouter un contact
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
                  : "Vérifier le code"}
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
                      ? "Numéro"
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
                  {adding ? "Vérification…" : "✓ Vérifier et ajouter"}
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
            <h2>⚙ Console admin</h2>
            <span className="chip chip-saffron">Super admin</span>
          </div>
          <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
            Tu es super admin de cette instance BMD. Accès à la console de
            pilotage : stats, utilisateurs, groupes, activité.
          </p>
          <Link
            href="/admin"
            className="btn btn-block"
            style={{ textDecoration: "none" }}
          >
            ⚙ Ouvrir la console admin →
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
          Pour supprimer ton compte, écris à{" "}
          <strong style={{ color: "var(--saffron)" }}>
            privacy@bmd.app
          </strong>
        </p>
      </div>

      {/* === Légal === */}
      <div className="card">
        <div className="card-head">
          <h2>📜 Légal & vie privée</h2>
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
          🛡️ Politique de confidentialité
        </Link>
        <p
          className="muted text-center"
          style={{ fontSize: 11, marginTop: 10, lineHeight: 1.5 }}
        >
          BMD respecte le RGPD. Tes données ne sont ni vendues, ni
          partagées. Tu peux les exporter ou les supprimer à tout moment.
        </p>
      </div>

      {/* === Sessions actives (spec §7.5) === */}
      <SessionsBlock />

      {/* Bottom-nav mobile (visible uniquement < 768px) */}
      <BottomNav active="profile" hideFab />
    </div>
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
    if (
      !window.confirm(
        "Déconnecter cet appareil ? Il ne pourra plus accéder à ton compte sans se reconnecter.",
      )
    ) {
      return;
    }
    try {
      await api.revokeSession(id);
      await load();
    } catch (e) {
      window.alert(`Échec : ${(e as Error).message}`);
    }
  }

  if (loading || sessions.length === 0) return null;

  return (
    <div className="card">
      <div className="card-head">
        <h2>🔓 Sessions actives</h2>
        <span className="muted" style={{ fontSize: 11 }}>
          {sessions.length}
        </span>
      </div>
      <p
        className="muted"
        style={{ fontSize: 12, marginBottom: 10, lineHeight: 1.5 }}
      >
        Voici les appareils qui ont accès à ton compte. Tu peux en
        déconnecter un à distance s'il n'est plus à toi.
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
                      CETTE SESSION
                    </span>
                  )}
                </div>
                <div className="meta">
                  Connectée le{" "}
                  {new Date(s.createdAt).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}{" "}
                  · expire le{" "}
                  {new Date(s.expiresAt).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "short",
                  })}
                </div>
              </div>
              {!s.isCurrent && (
                <button
                  type="button"
                  onClick={() => revoke(s.id)}
                  aria-label="Déconnecter"
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
                  ✗ Déconnecter
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
