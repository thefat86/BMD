"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, setToken } from "../../lib/api-client";
import { validateContact } from "../../lib/validators";

const PENDING_INVITE_KEY = "bmd_pending_invite_token";

/// Stocke le dernier contact utilisé (type + value) pour pré-remplir
/// la prochaine connexion. Évite à l'utilisateur de retaper son numéro
/// ou son email à chaque retour. Ne stocke JAMAIS le code OTP (sensible).
const LAST_CONTACT_KEY = "bmd_last_contact_v1";

interface SavedContact {
  type: "PHONE" | "EMAIL";
  value: string;
  displayName?: string;
  /** ISO date du dernier login réussi */
  lastUsedAt: string;
}

function loadLastContact(): SavedContact | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LAST_CONTACT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SavedContact;
  } catch {
    return null;
  }
}

function saveLastContact(c: SavedContact): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LAST_CONTACT_KEY, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

// Wrap dans Suspense car useSearchParams() le requiert (Next 15)
export default function LoginPage() {
  return (
    <Suspense fallback={<div className="container">Chargement…</div>}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<"contact" | "code">("contact");
  const [contactType, setContactType] = useState<"PHONE" | "EMAIL">("PHONE");
  const [contactValue, setContactValue] = useState("+33");
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** Dernier contact connu — utilisé pour le mode "se reconnecter en 1 clic" */
  const [savedContact, setSavedContact] = useState<SavedContact | null>(null);

  // Au mount : pré-remplir le form avec le dernier contact connu
  useEffect(() => {
    const saved = loadLastContact();
    if (saved) {
      setSavedContact(saved);
      setContactType(saved.type);
      setContactValue(saved.value);
    }
  }, []);

  /** "Utiliser un autre compte" : reset complet */
  function useAnotherAccount() {
    setSavedContact(null);
    setContactType("PHONE");
    setContactValue("+33");
    setCode("");
  }

  // Validation en temps réel pour l'indicateur visuel
  const liveValidation = useMemo(() => {
    if (!contactValue.trim() || contactValue === "+33") return null;
    return validateContact(contactType, contactValue);
  }, [contactType, contactValue]);

  async function requestOtp() {
    setError(null);
    // Bloque côté client si la validation échoue
    const r = validateContact(contactType, contactValue);
    if (!r.ok) {
      setError(r.message ?? "Contact invalide");
      return;
    }
    setLoading(true);
    try {
      // On envoie la valeur normalisée pour éviter les doublons côté serveur
      await api.requestOtp(contactType, r.value!);
      setStep("code");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setError(null);
    setLoading(true);
    try {
      const r = await api.verifyOtp({
        contactType,
        contactValue,
        code,
        displayName: displayName || undefined,
      });
      setToken(r.token);

      // Sauvegarde le contact pour la prochaine connexion (UX fluide)
      saveLastContact({
        type: contactType,
        value: contactValue,
        displayName: r.user.displayName,
        lastUsedAt: new Date().toISOString(),
      });

      // Si l'utilisateur arrive ici via un lien d'invitation,
      // on le redirige vers la page /join/[token] pour finir le flow.
      let next = searchParams?.get("next");
      if (!next) {
        try {
          const pending = localStorage.getItem(PENDING_INVITE_KEY);
          if (pending) next = `/join/${pending}`;
        } catch {
          /* localStorage indisponible */
        }
      }
      router.push(next ?? "/dashboard");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 440 }}>
      {/* Lien retour vers la page d'accueil — toujours accessible */}
      <div style={{ marginTop: 16, marginBottom: 8 }}>
        <Link
          href="/"
          aria-label="Retour à l'accueil"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: "var(--cream-soft, #E8D5B7)",
            textDecoration: "none",
            fontSize: 13,
            padding: "8px 4px",
            minHeight: 36,
          }}
        >
          ← Accueil
        </Link>
      </div>
      <Link
        href="/"
        className="text-center"
        style={{
          display: "block",
          marginTop: 12,
          marginBottom: 28,
          textDecoration: "none",
          color: "inherit",
        }}
      >
        <div
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 42,
            fontWeight: 700,
            color: "var(--cream)",
            letterSpacing: 1,
            lineHeight: 1,
          }}
        >
          BMD<span style={{ color: "var(--saffron)" }}>·</span>
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--gold)",
            letterSpacing: 4,
            textTransform: "uppercase",
            marginTop: 8,
            fontWeight: 600,
          }}
        >
          Back · Mes · Do
        </div>
      </Link>

      <div className="card">
        <h2 style={{ marginBottom: 14 }}>
          {step === "contact"
            ? savedContact && step === "contact"
              ? "Te reconnecter"
              : "Te connecter"
            : "Saisir le code"}
        </h2>

        {/* Bandeau "Reconnecter en 1 clic" — affiché si dernier contact connu */}
        {step === "contact" && savedContact && (
          <div
            style={{
              background:
                "linear-gradient(135deg, rgba(232,163,61,0.12), rgba(63,125,92,0.08))",
              border: "1px solid var(--line, rgba(232,163,61,0.18))",
              borderRadius: 12,
              padding: 12,
              marginBottom: 14,
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background:
                  "linear-gradient(135deg, var(--saffron, #E8A33D), var(--terracotta, #B5462E))",
                color: "#16111E",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {(savedContact.displayName ?? savedContact.value)
                .charAt(0)
                .toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <div
                style={{ fontSize: 13, fontWeight: 700, color: "var(--cream)" }}
              >
                Bienvenue
                {savedContact.displayName ? `, ${savedContact.displayName}` : ""}
                {" "}👋
              </div>
              <div style={{ fontSize: 11, color: "var(--cream-soft)" }}>
                Reconnecte-toi avec{" "}
                <strong>
                  {savedContact.type === "PHONE" ? "📞" : "✉️"}{" "}
                  {savedContact.value}
                </strong>
              </div>
            </div>
            <button
              onClick={useAnotherAccount}
              type="button"
              className="btn-ghost btn-sm"
              style={{
                fontSize: 11,
                padding: "6px 10px",
                minHeight: 30,
              }}
            >
              Autre compte
            </button>
          </div>
        )}

        {error && <div className="error">{error}</div>}

        {step === "contact" && (
          <>
            <div className="field">
              <label>Méthode</label>
              <select
                value={contactType}
                onChange={(e) => {
                  const newType = e.target.value as "PHONE" | "EMAIL";
                  setContactType(newType);
                  // Reset le champ avec une valeur appropriée :
                  // - téléphone : pré-remplir "+33" (utile pour la France)
                  // - email : vider le champ (l'utilisateur tape son email)
                  setContactValue(newType === "PHONE" ? "+33" : "");
                  setError(null);
                }}
              >
                <option value="PHONE">📞 Téléphone</option>
                <option value="EMAIL">✉️ Email</option>
              </select>
            </div>
            <div className="field">
              <label>
                {contactType === "PHONE"
                  ? "Numéro de téléphone"
                  : "Adresse email"}
              </label>
              <input
                type={contactType === "EMAIL" ? "email" : "tel"}
                inputMode={contactType === "EMAIL" ? "email" : "tel"}
                autoComplete={contactType === "EMAIL" ? "email" : "tel"}
                value={contactValue}
                onChange={(e) => setContactValue(e.target.value)}
                placeholder={
                  contactType === "PHONE"
                    ? "+33 6 12 34 56 78"
                    : "ton.email@exemple.com"
                }
              />
            </div>
            {liveValidation && (
              <div
                style={{
                  fontSize: 12,
                  marginTop: -8,
                  marginBottom: 8,
                  color: liveValidation.ok ? "var(--emerald, #10b981)" : "var(--rose, #ef4444)",
                }}
              >
                {liveValidation.ok
                  ? "✓ Format valide"
                  : `⚠ ${liveValidation.message}`}
              </div>
            )}
            <button
              className="btn btn-block"
              onClick={requestOtp}
              disabled={
                loading ||
                (liveValidation !== null && !liveValidation.ok)
              }
              style={{ width: "100%" }}
            >
              {loading ? "Envoi…" : "Recevoir un code"}
            </button>
            <p
              style={{
                marginTop: 14,
                fontSize: 12,
                color: "var(--muted)",
                textAlign: "center",
              }}
            >
              En mode dev, le code s'affiche dans la console du backend.
            </p>
          </>
        )}

        {step === "code" && (
          <>
            <p style={{ color: "var(--cream-soft)", marginBottom: 16, fontSize: 13 }}>
              Code envoyé à <strong>{contactValue}</strong>
            </p>
            <div className="field">
              <label>Code à 6 chiffres</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                maxLength={6}
                inputMode="numeric"
                style={{ fontSize: 24, letterSpacing: 8, textAlign: "center" }}
              />
            </div>
            <div className="field">
              <label>Ton prénom (1ère connexion uniquement)</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Aïcha"
              />
            </div>
            <button
              className="btn btn-block"
              onClick={verifyOtp}
              disabled={loading || code.length < 4}
              style={{ width: "100%" }}
            >
              {loading ? "Vérification…" : "✓ Me connecter"}
            </button>
            <button
              className="btn-ghost btn-block"
              onClick={() => setStep("contact")}
              style={{ width: "100%", marginTop: 10 }}
            >
              ← Modifier le contact
            </button>
          </>
        )}
      </div>
    </div>
  );
}
