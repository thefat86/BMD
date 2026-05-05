"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, setToken } from "../../lib/api-client";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"contact" | "code">("contact");
  const [contactType, setContactType] = useState<"PHONE" | "EMAIL">("PHONE");
  const [contactValue, setContactValue] = useState("+33");
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function requestOtp() {
    setError(null);
    setLoading(true);
    try {
      await api.requestOtp(contactType, contactValue);
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
      router.push("/dashboard");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 480 }}>
      <div className="brand">
        BMD<span>·</span>
      </div>

      <div className="card">
        <h2>{step === "contact" ? "Te connecter" : "Saisir le code"}</h2>

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
            <button
              className="btn"
              onClick={requestOtp}
              disabled={loading}
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
              className="btn"
              onClick={verifyOtp}
              disabled={loading || code.length < 4}
              style={{ width: "100%" }}
            >
              {loading ? "Vérification…" : "✓ Me connecter"}
            </button>
            <button
              className="btn-ghost"
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
