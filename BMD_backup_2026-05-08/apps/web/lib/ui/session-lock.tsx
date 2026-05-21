"use client";

/**
 * <SessionLock> · Verrouillage de session façon app bancaire (spec sécurité).
 *
 * UX standard fintech (Wise, Revolut, Lydia, banque mobile) :
 *  - Quand l'app est mise en arrière-plan (onglet caché, app backgroundée)
 *    pendant plus de N minutes → on affiche un overlay de verrouillage au
 *    retour. L'utilisateur DOIT s'authentifier à nouveau (mot de passe ou
 *    code OTP envoyé sur son téléphone) avant de voir ses données.
 *  - Si l'app est juste backgroundée < N minutes (l'user check Whatsapp et
 *    revient), pas de friction.
 *  - Le verrou est ARMÉ uniquement quand un token d'authentification est
 *    présent (pas la peine de verrouiller un visiteur non connecté).
 *
 * Implémentation :
 *  - Hook `visibilitychange` pour détecter background → on enregistre le
 *    timestamp de mise en arrière-plan dans sessionStorage.
 *  - Au retour (visibilité visible), si > LOCK_AFTER_MS → on affiche le
 *    lock overlay.
 *  - L'overlay propose : (1) re-saisie du mot de passe via le contact
 *    primaire (OTP), (2) déconnexion totale.
 *
 * Configuration :
 *  - Durée par défaut : 2 minutes en background → lock.
 *  - Le user peut désactiver dans son profil (à venir : prop `disabled`).
 *
 * IMPORTANT — pour les vraies app bancaires natives, on utilise typiquement
 * un PIN local + biométrie (FaceID/TouchID via Web Authentication API). Le
 * MVP ici utilise OTP standard via le contact primaire pour fonctionner
 * partout (mobile + desktop). On pourra ajouter WebAuthn ensuite (spec §7.5).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { api, clearToken, getToken } from "../api-client";
import { useBreakpoint } from "../use-breakpoint";
import { useT } from "../i18n/app-strings";

// Combien de temps en background avant de réclamer une re-auth
const LOCK_AFTER_MS = 2 * 60 * 1000; // 2 min — standard fintech

// Clé sessionStorage pour mémoriser le moment où on a backgroundé l'app
const STORAGE_KEY = "bmd:bg-since";

// Pages publiques où on N'ARM PAS le lock (login, register, vitrine, /pay, /cms)
const PUBLIC_PREFIXES = [
  "/login",
  "/register",
  "/auth",
  "/qr-login",
  "/pay",
  "/cms",
  "/legal",
  "/join",
];

interface Props {
  /** Désactive complètement le lock (debug/tests) */
  disabled?: boolean;
}

export function SessionLock({ disabled }: Props): JSX.Element | null {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const { isMobile } = useBreakpoint();
  const t = useT();
  const [locked, setLocked] = useState(false);
  const [step, setStep] = useState<"intro" | "otp" | "verifying">("intro");
  const [contactValue, setContactValue] = useState<string>("");
  const [contactType, setContactType] = useState<"PHONE" | "EMAIL">("PHONE");
  const [code, setCode] = useState("");
  const [requestingOtp, setRequestingOtp] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Évite double-armement (ex: deux mounts en parallèle)
  const armedRef = useRef(false);

  // Une page publique ? On n'arme pas le lock du tout
  const isPublicPage = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));

  // Au montage : si on a un timestamp de background suffisamment ancien,
  // on déclenche le lock immédiatement (cas où l'utilisateur a fermé puis
  // rouvert l'app via PWA installée).
  useEffect(() => {
    if (disabled || isPublicPage) return;
    if (!getToken()) return;

    const since = Number(sessionStorage.getItem(STORAGE_KEY) ?? 0);
    if (since > 0 && Date.now() - since > LOCK_AFTER_MS) {
      setLocked(true);
      setStep("intro");
    }
    sessionStorage.removeItem(STORAGE_KEY);
  }, [disabled, isPublicPage]);

  // Surveille les transitions visibilité
  useEffect(() => {
    if (disabled || isPublicPage) return;
    if (!getToken()) return;

    function onVisibility() {
      if (document.visibilityState === "hidden") {
        // App passe en arrière-plan → on note l'instant
        sessionStorage.setItem(STORAGE_KEY, String(Date.now()));
      } else if (document.visibilityState === "visible") {
        const since = Number(sessionStorage.getItem(STORAGE_KEY) ?? 0);
        sessionStorage.removeItem(STORAGE_KEY);
        if (since > 0 && Date.now() - since > LOCK_AFTER_MS) {
          armedRef.current = true;
          setLocked(true);
          setStep("intro");
          setCode("");
          setErr(null);
        }
      }
    }

    document.addEventListener("visibilitychange", onVisibility);
    // pagehide est plus fiable que visibilitychange pour iOS Safari
    window.addEventListener("pagehide", () => {
      sessionStorage.setItem(STORAGE_KEY, String(Date.now()));
    });
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [disabled, isPublicPage]);

  // Récupère le contact primaire (téléphone ou email) du user pour OTP
  const loadContact = useCallback(async () => {
    try {
      const r = await api.me();
      // L'objet user contient une liste de contacts
      const contacts = (r.user as any).contacts ?? [];
      // Priorité : primary, sinon premier vérifié, sinon premier
      const primary =
        contacts.find((c: any) => c.isPrimary) ??
        contacts.find((c: any) => c.isVerified) ??
        contacts[0];
      if (primary) {
        setContactValue(primary.value);
        setContactType(primary.type === "EMAIL" ? "EMAIL" : "PHONE");
      }
    } catch {
      /* ignore — l'user pourra cliquer "déconnexion" */
    }
  }, []);

  useEffect(() => {
    if (locked && step === "intro") void loadContact();
  }, [locked, step, loadContact]);

  async function requestOtp() {
    if (!contactValue) return;
    setRequestingOtp(true);
    setErr(null);
    try {
      await api.requestOtp(contactType, contactValue);
      setStep("otp");
    } catch (e: any) {
      setErr(e?.message ?? t("lock.errorSendCode"));
    } finally {
      setRequestingOtp(false);
    }
  }

  async function verifyOtp() {
    if (code.length < 4) return;
    setStep("verifying");
    setErr(null);
    try {
      // On vérifie l'OTP côté backend — si ok, c'est qu'on a bien la
      // possession du téléphone/email. On déverrouille la session.
      await api.verifyOtp({ contactType, contactValue, code });
      // Note : on ne re-issue pas un nouveau token car le token actuel est
      // toujours valide (l'auto-logout idle l'invalide après 30 min). On
      // signale juste que l'user a re-prouvé son identité.
      setLocked(false);
      armedRef.current = false;
      setCode("");
      setStep("intro");
    } catch (e: any) {
      setErr(e?.message ?? t("lock.errorWrongCode"));
      setStep("otp");
    }
  }

  function fullLogout() {
    clearToken();
    api.logout().catch(() => {});
    setLocked(false);
    router.replace("/login");
  }

  if (!locked) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="lock-title"
      style={{
        position: "fixed",
        inset: 0,
        background: isMobile
          ? "radial-gradient(800px 500px at 50% -10%, rgba(232,163,61,0.18), transparent 60%), linear-gradient(180deg, #0E0B14 0%, #1F1429 100%)"
          : "rgba(14,11,20,0.97)",
        backdropFilter: isMobile ? undefined : "blur(20px)",
        WebkitBackdropFilter: isMobile ? undefined : "blur(20px)",
        zIndex: 100000,
        display: "flex",
        alignItems: isMobile ? "flex-start" : "center",
        justifyContent: "center",
        padding: isMobile
          ? "calc(env(safe-area-inset-top, 0px) + 32px) 24px calc(env(safe-area-inset-bottom, 0px) + 24px)"
          : 20,
      }}
    >
      {/* === Variant MOBILE : splash plein-écran style banking app ===
          Très peu de texte, gros logo BMD en haut, message minimal,
          input OTP en grand, design adapté au pouce. */}
      {isMobile ? (
        <div
          style={{
            width: "100%",
            maxWidth: 420,
            color: "var(--cream)",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 18,
            minHeight: "calc(100dvh - 80px)",
            justifyContent: "space-between",
          }}
        >
          {/* Logo BMD signature en haut */}
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: 24,
              background:
                "linear-gradient(135deg, rgba(232,163,61,0.20), rgba(181,70,46,0.10))",
              border: "1.5px solid rgba(232,163,61,0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 12px 40px rgba(232,163,61,0.20)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/bmd-logo.svg" alt="BMD" width={56} height={56} />
          </div>

          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              gap: 14,
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: "var(--saffron)",
                letterSpacing: 3,
                textTransform: "uppercase",
                fontWeight: 700,
              }}
            >
              {t("lock.titleMobileBadge")}
            </div>
            <h2
              id="lock-title"
              style={{
                fontFamily: "Cormorant Garamond, serif",
                fontSize: 32,
                fontWeight: 600,
                margin: 0,
                lineHeight: 1.1,
                color: "var(--cream)",
              }}
            >
              {t("lock.greetingMobile")}
            </h2>
            <p
              style={{
                fontSize: 14,
                color: "var(--cream-soft)",
                margin: 0,
                maxWidth: 300,
                lineHeight: 1.55,
                opacity: 0.9,
              }}
            >
              {t("lock.subtitleMobile")}
            </p>

            {err && (
              <div
                style={{
                  background: "rgba(217,113,74,0.12)",
                  border: "1px solid rgba(217,113,74,0.4)",
                  color: "#FFB89A",
                  padding: "10px 14px",
                  borderRadius: 12,
                  fontSize: 13,
                  width: "100%",
                  marginTop: 8,
                  textAlign: "left",
                  lineHeight: 1.5,
                }}
              >
                ⚠️ {err}
              </div>
            )}

            {/* Le bloc d'auth (intro/otp/verifying) — voir plus bas, on
                wrap le contenu commun dans une variable `authContent` */}
            <div style={{ width: "100%", marginTop: 8 }}>
              {renderAuthContent({
                step,
                contactValue,
                contactType,
                code,
                requestingOtp,
                requestOtp,
                verifyOtp,
                setCode,
                setStep,
                setErr,
                setCodeStateOnly: setCode,
                fullLogout,
                t,
              })}
            </div>
          </div>

          {/* Footer minimal */}
          <div
            style={{
              fontSize: 11,
              color: "var(--muted)",
              opacity: 0.7,
            }}
          >
            {t("lock.footerTagline")}
          </div>
        </div>
      ) : (
      <div
        style={{
          background: "linear-gradient(180deg, #16111E 0%, #1F1429 100%)",
          border: "1px solid rgba(232,163,61,0.3)",
          borderRadius: 22,
          maxWidth: 420,
          width: "100%",
          padding: 28,
          color: "var(--cream, #F4E4C1)",
          textAlign: "center",
          boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
        }}
      >
        {/* Icône cadenas style fintech (desktop) */}
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            background:
              "linear-gradient(135deg, rgba(232,163,61,0.18), rgba(181,70,46,0.10))",
            border: "1px solid rgba(232,163,61,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
            fontSize: 32,
          }}
        >
          🔒
        </div>

        <h2
          id="lock-title"
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 26,
            fontWeight: 700,
            margin: "0 0 6px",
            color: "var(--cream)",
          }}
        >
          {t("lock.titleDesktop")}
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "var(--cream-soft, #d4c4a8)",
            margin: "0 0 22px",
            lineHeight: 1.5,
          }}
        >
          {t("lock.bodyDesktop")}
          <br />
          {t("lock.bodyDesktop2")}
        </p>

        {err && (
          <div
            style={{
              background: "rgba(217,113,74,0.12)",
              border: "1px solid rgba(217,113,74,0.4)",
              color: "#FFB89A",
              padding: "10px 12px",
              borderRadius: 10,
              fontSize: 13,
              marginBottom: 14,
              textAlign: "left",
            }}
          >
            ⚠️ {err}
          </div>
        )}

        {step === "intro" && (
          <>
            {contactValue ? (
              <>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--cream-soft)",
                    marginBottom: 6,
                    letterSpacing: 0.4,
                  }}
                >
                  {t("lock.codeSentTo")}
                </div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    color: "var(--cream)",
                    marginBottom: 18,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {maskContact(contactValue, contactType)}
                </div>
                <button
                  type="button"
                  onClick={requestOtp}
                  disabled={requestingOtp}
                  style={{
                    width: "100%",
                    padding: 14,
                    background:
                      "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))",
                    color: "#16111E",
                    border: "none",
                    borderRadius: 12,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: requestingOtp ? "not-allowed" : "pointer",
                    opacity: requestingOtp ? 0.6 : 1,
                    marginBottom: 10,
                  }}
                >
                  {requestingOtp ? t("lock.sending") : t("lock.sendCode")}
                </button>
              </>
            ) : (
              <div
                style={{
                  fontSize: 13,
                  color: "var(--cream-soft)",
                  marginBottom: 14,
                }}
              >
                {t("lock.noContact")}
              </div>
            )}
            <button
              type="button"
              onClick={fullLogout}
              style={{
                width: "100%",
                padding: 12,
                background: "transparent",
                border: "1px solid rgba(244,228,193,0.12)",
                color: "var(--cream-soft)",
                borderRadius: 10,
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {t("lock.fullLogout")}
            </button>
          </>
        )}

        {step === "otp" && (
          <>
            <input
              autoFocus
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter") void verifyOtp();
              }}
              placeholder="123456"
              aria-label={t("lock.codeAria")}
              style={{
                width: "100%",
                padding: "14px",
                background: "rgba(244,228,193,0.04)",
                border: "1px solid rgba(244,228,193,0.18)",
                borderRadius: 12,
                color: "var(--cream)",
                fontSize: 22,
                fontVariantNumeric: "tabular-nums",
                fontWeight: 700,
                letterSpacing: 8,
                textAlign: "center",
                fontFamily: "inherit",
                marginBottom: 14,
                boxSizing: "border-box",
              }}
            />
            <button
              type="button"
              onClick={verifyOtp}
              disabled={code.length < 4}
              style={{
                width: "100%",
                padding: 14,
                background:
                  code.length < 4
                    ? "rgba(232,163,61,0.3)"
                    : "linear-gradient(135deg, var(--saffron), var(--terracotta))",
                color: "#16111E",
                border: "none",
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 700,
                cursor: code.length < 4 ? "not-allowed" : "pointer",
                marginBottom: 10,
              }}
            >
              {t("lock.unlock")}
            </button>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => {
                  setStep("intro");
                  setCode("");
                  setErr(null);
                }}
                style={{
                  flex: 1,
                  padding: 10,
                  background: "transparent",
                  border: "1px solid rgba(244,228,193,0.12)",
                  color: "var(--cream-soft)",
                  borderRadius: 10,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {t("lock.resend")}
              </button>
              <button
                type="button"
                onClick={fullLogout}
                style={{
                  flex: 1,
                  padding: 10,
                  background: "transparent",
                  border: "1px solid rgba(244,228,193,0.12)",
                  color: "var(--cream-soft)",
                  borderRadius: 10,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {t("lock.logout")}
              </button>
            </div>
          </>
        )}

        {step === "verifying" && (
          <div
            style={{
              padding: "20px 0",
              fontSize: 14,
              color: "var(--cream-soft)",
            }}
          >
            {t("lock.verifying")}
          </div>
        )}
      </div>
      )}
    </div>
  );
}

/**
 * Helper qui rend le bloc d'authentification (intro / otp / verifying) ;
 * réutilisé identiquement par la variante mobile et desktop. Ça évite la
 * duplication de ~150 lignes de markup tout en laissant chaque variante
 * imposer son propre layout / décor (logo, fond, padding…).
 *
 * Mobile : ce helper rend juste le formulaire compact qu'on injecte dans
 * la colonne centrale.
 *
 * Desktop : pas appelé — le markup est inliné dans la carte (autre design,
 * "Code envoyé à xxx" déjà visible avant qu'on demande à envoyer).
 */
function renderAuthContent(opts: {
  step: "intro" | "otp" | "verifying";
  contactValue: string;
  contactType: "PHONE" | "EMAIL";
  code: string;
  requestingOtp: boolean;
  requestOtp: () => Promise<void>;
  verifyOtp: () => Promise<void>;
  setCode: (s: string) => void;
  setStep: (s: "intro" | "otp" | "verifying") => void;
  setErr: (s: string | null) => void;
  setCodeStateOnly: (s: string) => void;
  fullLogout: () => void;
  t: (key: any, vars?: Record<string, string>) => string;
}): JSX.Element {
  const {
    step,
    contactValue,
    contactType,
    code,
    requestingOtp,
    requestOtp,
    verifyOtp,
    setCode,
    setStep,
    setErr,
    fullLogout,
    t,
  } = opts;

  if (step === "intro") {
    return (
      <>
        {contactValue ? (
          <>
            <div
              style={{
                fontSize: 12,
                color: "var(--cream-soft)",
                marginBottom: 6,
                letterSpacing: 0.4,
              }}
            >
              {t("lock.codeSentTo")}
            </div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: "var(--cream)",
                marginBottom: 18,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {maskContact(contactValue, contactType)}
            </div>
            <button
              type="button"
              onClick={() => void requestOtp()}
              disabled={requestingOtp}
              style={{
                width: "100%",
                padding: 14,
                background:
                  "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))",
                color: "#16111E",
                border: "none",
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 700,
                cursor: requestingOtp ? "not-allowed" : "pointer",
                opacity: requestingOtp ? 0.6 : 1,
                marginBottom: 10,
              }}
            >
              {requestingOtp ? t("lock.sending") : t("lock.sendCode")}
            </button>
          </>
        ) : (
          <div
            style={{
              fontSize: 13,
              color: "var(--cream-soft)",
              marginBottom: 14,
            }}
          >
            {t("lock.noContact")}
          </div>
        )}
        <button
          type="button"
          onClick={fullLogout}
          style={{
            width: "100%",
            padding: 12,
            background: "transparent",
            border: "1px solid rgba(244,228,193,0.12)",
            color: "var(--cream-soft)",
            borderRadius: 10,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          {t("lock.fullLogout")}
        </button>
      </>
    );
  }

  if (step === "otp") {
    return (
      <>
        <input
          autoFocus
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter") void verifyOtp();
          }}
          placeholder="123456"
          aria-label={t("lock.codeAria")}
          style={{
            width: "100%",
            padding: "14px",
            background: "rgba(244,228,193,0.04)",
            border: "1px solid rgba(244,228,193,0.18)",
            borderRadius: 12,
            color: "var(--cream)",
            fontSize: 22,
            fontVariantNumeric: "tabular-nums",
            fontWeight: 700,
            letterSpacing: 8,
            textAlign: "center",
            fontFamily: "inherit",
            marginBottom: 14,
            boxSizing: "border-box",
          }}
        />
        <button
          type="button"
          onClick={() => void verifyOtp()}
          disabled={code.length < 4}
          style={{
            width: "100%",
            padding: 14,
            background:
              code.length < 4
                ? "rgba(232,163,61,0.3)"
                : "linear-gradient(135deg, var(--saffron), var(--terracotta))",
            color: "#16111E",
            border: "none",
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 700,
            cursor: code.length < 4 ? "not-allowed" : "pointer",
            marginBottom: 10,
          }}
        >
          {t("lock.unlock")}
        </button>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button
            type="button"
            onClick={() => {
              setStep("intro");
              setCode("");
              setErr(null);
            }}
            style={{
              flex: 1,
              padding: 10,
              background: "transparent",
              border: "1px solid rgba(244,228,193,0.12)",
              color: "var(--cream-soft)",
              borderRadius: 10,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {t("lock.resend")}
          </button>
          <button
            type="button"
            onClick={fullLogout}
            style={{
              flex: 1,
              padding: 10,
              background: "transparent",
              border: "1px solid rgba(244,228,193,0.12)",
              color: "var(--cream-soft)",
              borderRadius: 10,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {t("lock.logout")}
          </button>
        </div>
      </>
    );
  }

  // step === "verifying"
  return (
    <div
      style={{
        padding: "20px 0",
        fontSize: 14,
        color: "var(--cream-soft)",
        textAlign: "center",
      }}
    >
      {t("lock.verifying")}
    </div>
  );
}

/**
 * Masque un email (ex: "f***@gmail.com") ou téléphone (ex: "+33 6 XX XX XX 78")
 * pour afficher juste assez d'info sans exposer le contact complet.
 */
function maskContact(value: string, type: "PHONE" | "EMAIL"): string {
  if (type === "EMAIL") {
    const [local, domain] = value.split("@");
    if (!local || !domain) return value;
    if (local.length <= 2) return `${local[0]}***@${domain}`;
    return `${local.slice(0, 2)}***@${domain}`;
  }
  // PHONE : on masque les chiffres du milieu, on garde indicatif + 2 derniers
  const digits = value.replace(/\D/g, "");
  if (digits.length < 6) return value;
  const tail = digits.slice(-2);
  const head = value.slice(0, value.indexOf(digits[0]) + 3);
  return `${head} ··· ${tail}`;
}
