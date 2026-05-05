"use client";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, setToken } from "../../lib/api-client";
import { validateContact } from "@bmd/shared-types";

const PENDING_INVITE_KEY = "bmd_pending_invite_token";

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
      <div
        className="text-center"
        style={{
          marginTop: 28,
          marginBottom: 28,
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
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 14 }}>
          {step === "contact" ? "Te connecter" : "Saisir le code"}
        </h2>

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
