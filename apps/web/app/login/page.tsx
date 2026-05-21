"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError, setToken } from "../../lib/api-client";
import { validateContact } from "../../lib/validators";
import { rememberGoogleState } from "../../lib/google-sso";
import { rememberAppleState } from "../../lib/apple-sso";
import { useT } from "../../lib/i18n/app-strings";
import { RateLimitScreen } from "../../lib/ui/rate-limit-screen";
import { SharedLangPicker } from "../../lib/ui/shared-lang-picker";
import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import {
  detectPlatform,
  haptic,
  isPlatformAuthenticatorAvailable,
  type PlatformInfo,
} from "../../lib/platform";
// V52.B1 — Icon registry V45 (cf. AUDIT-V45-VS-PROD.md écran 1 « Login premium »).
// Remplace les emojis 👋 📞 ✉️ ✓ par des SVG outline 1.5px stroke.
import { Icon } from "../../lib/ui/icons";
// V52.D2 — Card méthode auth V45 (Face ID primary cocoa + Passkey + OTP paper).
import { LoginMethodCard } from "../../lib/ui/login-method-card";

const PENDING_INVITE_KEY = "bmd_pending_invite_token";

/// Stocke le dernier contact utilisé (type + value) pour pré-remplir
/// la prochaine connexion. Évite à l'utilisateur de retaper son numéro
/// ou son email à chaque retour. Ne stocke JAMAIS le code OTP (sensible).
const LAST_CONTACT_KEY = "bmd_last_contact_v1";

/// V24 — État du flow d'enrôlement passkey post-OTP.
///   - `enrolled` : l'utilisateur a déjà accepté → ne plus reposer.
///   - `declined` : l'utilisateur a refusé → on attend qu'il le fasse
///     manuellement depuis /profile (on ne harcèle pas).
/// Réinitialisable par l'utilisateur via le bouton "Activer Face ID"
/// dans /profile (qui efface cette clé avant de lancer le flow).
const PASSKEY_ENROLL_STATUS_KEY = "bmd_passkey_enroll_status_v1";

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
  // Use a fallback since we can't call useT() at top level
  return (
    <Suspense fallback={<div className="container" style={{paddingTop: '20px'}}>Chargement…</div>}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<"contact" | "code">("contact");
  const [contactType, setContactType] = useState<"PHONE" | "EMAIL">("PHONE");
  const [contactValue, setContactValue] = useState("+33");
  const [code, setCode] = useState("");
  /** Anti-shoulder surfing : option pour masquer le code à la saisie (spec §7.5) */
  const [hideCode, setHideCode] = useState(false);
  const [displayName, setDisplayName] = useState("");
  /**
   * Préférences langue & devise pour la 1ère connexion (signup).
   * On pré-remplit avec ce que LocaleProvider/CurrencyProvider ont déjà
   * détecté (carte SIM, timezone, navigator.language) — l'utilisateur
   * peut ajuster avant de valider. Au verifyOtp on PATCH /auth/me avec
   * ces choix → l'app s'affichera immédiatement dans la bonne langue
   * et devise dès le 1er écran du dashboard.
   */
  const [signupLocale, setSignupLocale] = useState<string>("");
  const [signupCurrency, setSignupCurrency] = useState<string>("");
  const [availableLocales, setAvailableLocales] = useState<
    Array<{ code: string; name: string; flag: string }>
  >([]);
  const [availableCurrencies, setAvailableCurrencies] = useState<
    Array<{ code: string; name: string; symbol: string; flag: string | null }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** Dernier contact connu — utilisé pour le mode "se reconnecter en 1 clic" */
  const [savedContact, setSavedContact] = useState<SavedContact | null>(null);
  /** SSO Google — true si le serveur a configuré GOOGLE_CLIENT_ID. */
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  /** V214 — Mode test global : si ON, on affiche un bouton « Connexion directe » qui bypass OTP. */
  const [testModeEnabled, setTestModeEnabled] = useState(false);
  const [testLoginLoading, setTestLoginLoading] = useState(false);
  /** SSO Apple — true si APPLE_CLIENT_ID + clés sont configurés. */
  const [appleEnabled, setAppleEnabled] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  /** Passkey login (WebAuthn) — true si le browser supporte. */
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  /**
   * Détection plateforme (mobile vs desktop, iOS vs Android, biometric label).
   * Sert à adapter le label du bouton (Face ID / Touch ID / Empreinte / …)
   * et à mettre le passkey EN PREMIER sur mobile (vrai usage natif), au
   * lieu d'être une option discrète à côté des SSO.
   */
  const [platformInfo, setPlatformInfo] = useState<PlatformInfo | null>(null);
  /** True si Touch/Face ID intégré dispo (autorise le bouton bien visible). */
  const [hasPlatformAuth, setHasPlatformAuth] = useState(false);
  /** Rate limit OTP — affichage plein-écran avec timer si 429 reçu */
  const [rateLimit, setRateLimit] = useState<{
    retryAfter: number;
    message: string;
    tip?: string;
  } | null>(null);
  /**
   * V24 — Prompt d'enrôlement passkey après une connexion OTP réussie.
   *
   * Quand un nouvel utilisateur se connecte par OTP sur un appareil
   * mobile compatible Face ID / Touch ID / Empreinte, on lui propose
   * d'enregistrer un passkey en 1 tap pour les prochaines connexions.
   * C'est ce qui rend le bouton « Continuer avec Face ID » fonctionnel :
   * sans passkey enregistré, le bouton ne peut pas marcher.
   *
   * `next` : URL de redirection après le flow (succès, refus ou skip).
   */
  const [enrollPrompt, setEnrollPrompt] = useState<{
    next: string;
    enrolling: boolean;
    error: string | null;
  } | null>(null);

  // V113 — Pré-auth : la page /login force toujours `data-theme="v45-light"`,
  // peu importe la pref user persistée. Les users qui ont gardé dark en
  // localStorage récupèrent leur préférence dès qu'ils atteignent le
  // dashboard (le ThemeBootScript la réapplique à chaque load). Ici on
  // priorise la lisibilité d'une page critique avant authentification.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prev = document.documentElement.getAttribute("data-theme");
    document.documentElement.setAttribute("data-theme", "v45-light");
    document.documentElement.style.colorScheme = "light";
    return () => {
      if (prev) {
        document.documentElement.setAttribute("data-theme", prev);
        document.documentElement.style.colorScheme =
          prev === "dark" ? "dark" : "light";
      }
    };
  }, []);

  // Au mount : pré-remplir le form avec le dernier contact connu
  useEffect(() => {
    const saved = loadLastContact();
    if (saved) {
      setSavedContact(saved);
      setContactType(saved.type);
      setContactValue(saved.value);
    }
    // Découvre les SSO activés côté serveur (parallèle)
    Promise.all([
      api.googleSsoConfig().catch(() => ({ enabled: false })),
      api.appleSsoConfig().catch(() => ({ enabled: false })),
      // V214 — Mode test global (bypass OTP) : si ON, on affiche le bouton
      // « Connexion directe » sur l'écran de saisie du contact.
      api.testModeGate().catch(() => ({ enabled: false })),
    ]).then(([g, a, t]) => {
      setGoogleEnabled(g.enabled);
      setAppleEnabled(a.enabled);
      setTestModeEnabled(Boolean(t?.enabled));
    });

    // Charge les langues + devises actives pour le picker signup mobile
    // (spec : "lors de la creation de compte sur l'appli mobile, le client
    //  peut choisir sa langue de prédilection + sa devise de base").
    // On pré-remplit aussi avec ce qui est détecté localement (timezone,
    // navigator.language) pour que le picker arrive déjà avec une valeur.
    Promise.all([
      api.listLocales().catch(() => []),
      api.listCurrencies().catch(() => []),
    ]).then(([locs, curs]) => {
      setAvailableLocales(
        (locs as Array<{ code: string; name: string; flag: string }>).map((l) => ({
          code: l.code,
          name: l.name,
          flag: l.flag,
        })),
      );
      setAvailableCurrencies(
        (curs as Array<{
          code: string;
          name: string;
          symbol: string;
          flag: string | null;
        }>).map((c) => ({
          code: c.code,
          name: c.name,
          symbol: c.symbol,
          flag: c.flag,
        })),
      );
      // Pré-remplit avec la langue navigator + la devise détectée par TZ
      if (typeof navigator !== "undefined") {
        const browserLang = (navigator.language ?? "fr").slice(0, 2);
        const found = (locs as Array<{ code: string }>).find(
          (l) => l.code === browserLang,
        );
        setSignupLocale(found ? found.code : "fr");
      } else {
        setSignupLocale("fr");
      }
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        // Réutilise la map du CurrencyProvider (même heuristique côté UI)
        const TZ_TO_CCY: Record<string, string> = {
          "Africa/Douala": "XAF",
          "Africa/Dakar": "XOF",
          "Africa/Abidjan": "XOF",
          "Africa/Casablanca": "MAD",
          "Africa/Algiers": "DZD",
          "Africa/Tunis": "TND",
          "Africa/Lagos": "NGN",
          "Africa/Nairobi": "KES",
          "Africa/Accra": "GHS",
          "Europe/London": "GBP",
          "America/New_York": "USD",
        };
        setSignupCurrency(TZ_TO_CCY[tz] ?? "EUR");
      } catch {
        setSignupCurrency("EUR");
      }
    });

    // Détecte la plateforme (mobile vs desktop, label biométrique)
    setPlatformInfo(detectPlatform());

    // Détecte le support WebAuthn du browser (passkey login)
    if (typeof window !== "undefined" && window.PublicKeyCredential) {
      setPasskeySupported(true);
      // Vérifie l'authenticator de plateforme (Face ID / Touch ID intégré)
      // pour décider si on met le bouton bien visible (vrai usage natif).
      void isPlatformAuthenticatorAvailable().then(setHasPlatformAuth);

      // === Conditional UI / Mobile autofill ===
      // Sur iOS Safari / Android Chrome récents, on peut lancer une
      // authentification "en arrière-plan" qui se déclenche quand l'utilisateur
      // touche le champ contact (autofill webauthn). C'est l'UX la plus
      // native sur mobile : pas de bouton à chercher, juste tape ton numéro
      // et tu vois "Touche Face ID pour te connecter" en autofill.
      void (async () => {
        try {
          const options = await api.passkeyLoginOptions();
          // Conditional UI : ne crée pas de popup, attend le focus sur input
          // V10 signature : (optionsJSON, useBrowserAutofill)
          const authResp = await startAuthentication(options, true);
          if (authResp) {
            const r = await api.passkeyLoginFinish(
              authResp,
              navigator.userAgent,
            );
            setToken(r.token);
            haptic("success");
            const next = searchParams?.get("next") ?? "/dashboard";
            router.push(next);
          }
        } catch {
          /* silencieux : l'autofill conditional UI échoue souvent
             (browser ne supporte pas, pas de passkey enregistré, etc.).
             Le bouton classique reste disponible. */
        }
      })();
    }

    // Lien viral : si ?ref=REF-XXXXXX (ou ?ref=AFF-XXXXXX) dans l'URL,
    // on stocke le code dans localStorage. Au moment du 1er login réussi,
    // on l'applique automatiquement via api.applyReferralCode(). Anti-
    // fraude : limite 30j post-inscription côté serveur.
    try {
      const ref = searchParams?.get("ref");
      if (ref && ref.length >= 6 && ref.length <= 20) {
        window.localStorage.setItem("bmd_pending_ref", ref.toUpperCase());
      }
    } catch {
      /* ignore */
    }
  }, [searchParams]);

  /** Démarre le flow OAuth Google : récupère l'URL + state, stocke, redirige. */
  async function startGoogleSso() {
    setError(null);
    setGoogleLoading(true);
    try {
      const r = await api.googleSsoStart();
      rememberGoogleState(r.state);
      window.location.href = r.url;
    } catch (e) {
      setGoogleLoading(false);
      setError(
        e instanceof Error
          ? e.message
          : t("auth.googleStartError"),
      );
    }
  }

  /** Démarre le flow OAuth Apple. */
  async function startAppleSso() {
    setError(null);
    setAppleLoading(true);
    try {
      const r = await api.appleSsoStart();
      rememberAppleState(r.state);
      window.location.href = r.url;
    } catch (e) {
      setAppleLoading(false);
      setError(
        e instanceof Error
          ? e.message
          : t("auth.appleStartError"),
      );
    }
  }

  /**
   * Connexion par passkey (WebAuthn).
   *
   * Si l'utilisateur a déjà saisi son contact, on l'utilise pour pré-fill
   * la liste des credentialIds autorisés (UX plus rapide). Sinon, on
   * démarre en mode "discoverable credentials" — le browser propose au
   * user de choisir lui-même un passkey enregistré pour ce site.
   */
  async function startPasskeyLogin() {
    setError(null);
    setPasskeyLoading(true);
    try {
      // Si l'utilisateur a saisi un contact, on essaie de pré-fill la liste
      // de credentials côté serveur. Sinon, on laisse vide (discoverable).
      const hint =
        savedContact?.value ??
        (contactValue.trim() && contactValue !== "+33"
          ? contactValue
          : undefined);
      const options = await api.passkeyLoginOptions(hint);

      // V10 signature : (optionsJSON) — pas d'objet wrapper
      const authResp = await startAuthentication(options);

      const r = await api.passkeyLoginFinish(authResp, navigator.userAgent);
      setToken(r.token);

      // Feedback haptique de succès — feel banking app sur mobile
      haptic("success");

      // Sauvegarde du contact pour le prochain login (même UX que OTP).
      if (hint) {
        saveLastContact({
          type: contactType,
          value: hint,
          lastUsedAt: new Date().toISOString(),
        });
      }

      const next = searchParams?.get("next") ?? "/dashboard";
      router.push(next);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("aborted") || msg.includes("cancelled")) {
        // Pas une erreur — l'utilisateur a juste tapé "Annuler"
        setError(t("auth.cancelled"));
      } else if (msg.includes("Passkey inconnu") || msg.includes("not allowed")) {
        haptic("error");
        setError(
          t("auth.noPasskey", { label: platformInfo?.biometricLabel ?? "Face ID" })
        );
      } else {
        haptic("error");
        setError(t("auth.passkeyError", { msg }));
      }
    } finally {
      setPasskeyLoading(false);
    }
  }

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

  /**
   * V214 — Connexion directe en mode test (bypass OTP).
   * Le user entre juste son identifiant, on valide côté client puis on
   * appelle /auth/test-login. Le backend crée le user au besoin et
   * retourne un JWT directement.
   */
  async function handleTestLogin() {
    setError(null);
    const r = validateContact(contactType, contactValue);
    if (!r.ok) {
      setError(r.message ?? "Contact invalide");
      return;
    }
    setTestLoginLoading(true);
    try {
      const res = await api.testLogin({
        contactType,
        contactValue: r.value!,
        displayName: displayName.trim() || undefined,
      });
      setToken(res.token);
      // Petit délai pour que le token soit bien committé avant la nav
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 50);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTestLoginLoading(false);
    }
  }

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
      // Si 429 (rate limited) → on bascule sur le grand écran de pause avec
      // timer plutôt que d'afficher un simple message d'erreur. Lecture des
      // détails serveur (retryAfter en secondes, tip rassurant).
      if (e instanceof ApiError && e.status === 429) {
        const retryAfter =
          (e.details?.retryAfter as number | undefined) ?? 600;
        setRateLimit({
          retryAfter,
          message: e.message,
          tip: e.details?.tip as string | undefined,
        });
      } else {
        setError((e as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setError(null);
    // V89 — Validation inline : si le user est un signup (pas de
    // savedContact) ET que le champ Prénom est vide, on bloque AVANT
    // d'appeler l'API et on scrolle vers le champ. Le backend a un
    // fallback tolérant, mais on préfère que le user choisisse lui-même
    // son prénom plutôt que de finir « Membre 3456 » dans la base.
    if (!savedContact && !displayName.trim()) {
      setError(
        t("auth.firstNameRequired") ||
          "Indique ton prénom pour finaliser ton inscription.",
      );
      // Scroll + focus sur le champ Prénom (autoComplete=given-name)
      const firstNameInput = document.querySelector<HTMLInputElement>(
        'input[autocomplete="given-name"]',
      );
      if (firstNameInput) {
        firstNameInput.scrollIntoView({ behavior: "smooth", block: "center" });
        firstNameInput.focus({ preventScroll: true });
      }
      return;
    }
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

      // Lien viral : si on a stocké un code de parrainage à l'arrivée
      // sur la page (?ref=REF-XXXXXX), on l'applique maintenant qu'on
      // est authentifié. Le serveur valide la limite 30j et l'unicité.
      // Échec silencieux : un code invalide ne doit pas bloquer le login.
      try {
        const pendingRef = window.localStorage.getItem("bmd_pending_ref");
        if (pendingRef) {
          window.localStorage.removeItem("bmd_pending_ref");
          await api
            .applyReferralCode(pendingRef)
            .catch((err) => {
              // eslint-disable-next-line no-console
              console.warn("[ref] apply failed (silencieux)", err);
            });
        }
      } catch {
        /* ignore */
      }

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

      // Onboarding contextuel (spec §3.1) : si nouveau user (compte créé
      // dans la dernière minute) ET pas de redirect spécifique demandé,
      // on l'envoie sur /onboarding/intent pour pré-configurer son
      // 1er groupe selon son cas d'usage.
      const isNewAccount =
        r.user?.createdAt &&
        Date.now() - new Date(r.user.createdAt).getTime() < 60_000;

      // Pour un nouveau compte : applique IMMÉDIATEMENT la langue + devise
      // choisies dans le picker signup. Sans ça l'utilisateur arriverait
      // sur le dashboard en français/EUR par défaut, peu importe ce qu'il
      // a choisi pendant la création de compte.
      if (isNewAccount && (signupLocale || signupCurrency)) {
        const patch: { defaultLocale?: string; defaultCurrency?: string } = {};
        if (signupLocale) patch.defaultLocale = signupLocale;
        if (signupCurrency) patch.defaultCurrency = signupCurrency;
        try {
          await api.updateMe(patch);
          // Persist localement aussi pour que LocaleProvider et CurrencyProvider
          // voient la bonne valeur dès leur prochaine init (au mount du dashboard).
          if (typeof window !== "undefined") {
            if (signupLocale) {
              window.localStorage.setItem("bmd_locale", signupLocale);
            }
            if (signupCurrency) {
              window.localStorage.setItem("bmd_currency", signupCurrency);
            }
          }
        } catch {
          // Silent : le user pourra retoucher depuis son profil si besoin
        }
      }

      if (!next && isNewAccount) {
        next = "/onboarding/intent";
      }
      const finalNext = next ?? "/dashboard";

      // V24 — Si l'appareil est mobile et supporte Face ID / Touch ID /
      // Empreinte ET que l'utilisateur n'a pas encore de passkey enregistré
      // ET qu'il n'a pas déjà décliné, on lui propose maintenant.
      // Sinon : redirection directe.
      await maybeOfferPasskeyEnrollment(finalNext);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  /**
   * V24 · Décide s'il faut proposer l'enrôlement d'un passkey à l'utilisateur
   * qui vient de se connecter par OTP, ou rediriger directement.
   *
   * Le flow d'enrôlement n'est proposé que si TOUTES ces conditions sont
   * remplies :
   *   1. Le navigateur supporte WebAuthn (PublicKeyCredential)
   *   2. La plateforme expose un authenticator intégré (Face ID, Touch ID,
   *      Empreinte, Windows Hello)
   *   3. L'appareil est mobile ou tablette (sur desktop : moins prioritaire,
   *      l'utilisateur peut le faire depuis /profile à son rythme)
   *   4. L'utilisateur n'a pas encore décliné/accepté ce prompt
   *      (localStorage, persistant entre sessions)
   *   5. Le compte n'a pas déjà un passkey enregistré (sinon le bouton
   *      passkey du login fonctionnerait déjà → pas besoin de proposer)
   *
   * Si une de ces conditions n'est pas remplie, on redirige immédiatement
   * vers `next`. Le but : ne JAMAIS bloquer le login d'un utilisateur qui
   * ne veut pas (ou ne peut pas) configurer un passkey.
   */
  async function maybeOfferPasskeyEnrollment(next: string): Promise<void> {
    try {
      if (typeof window === "undefined") {
        router.push(next);
        return;
      }
      const status = window.localStorage.getItem(PASSKEY_ENROLL_STATUS_KEY);
      const isMobileLike =
        platformInfo?.isMobile === true || platformInfo?.isTablet === true;
      if (
        !passkeySupported ||
        !hasPlatformAuth ||
        !isMobileLike ||
        status === "enrolled" ||
        status === "declined"
      ) {
        router.push(next);
        return;
      }
      // Vérifie qu'aucun passkey n'est déjà enregistré pour ce compte.
      // Si l'API échoue (réseau / 401), on skippe le prompt par sécurité —
      // on ne veut pas bloquer le login.
      const list = await api.listMyPasskeys().catch(() => null);
      if (!list || list.items.length > 0) {
        router.push(next);
        return;
      }
      // Affiche le prompt — c'est le rendu conditionnel qui prend le relais.
      setEnrollPrompt({ next, enrolling: false, error: null });
    } catch {
      router.push(next);
    }
  }

  /**
   * V24 · L'utilisateur a accepté l'enrôlement passkey post-OTP.
   * Démarre le flow WebAuthn registration. Le `deviceName` envoyé au
   * serveur est dérivé de la plateforme détectée (ex: « iPhone Face ID »,
   * « Pixel Empreinte ») — ça apparaîtra dans /profile pour que l'utilisateur
   * puisse renommer / supprimer plus tard.
   *
   * En cas d'échec (popup refusé, biométrie ratée), on garde l'utilisateur
   * sur le prompt avec un message d'erreur. L'utilisateur peut retenter
   * ou passer.
   */
  async function acceptPasskeyEnrollment(): Promise<void> {
    if (!enrollPrompt) return;
    setEnrollPrompt((p) =>
      p ? { ...p, enrolling: true, error: null } : null,
    );
    try {
      const deviceName = platformInfo
        ? `${platformInfo.biometricLabel} · ${platformInfo.platform}`
        : "Mon appareil";
      const options = await api.passkeyRegisterOptions(deviceName);
      // V10 signature : (optionsJSON) — pas d'objet wrapper
      const resp = await startRegistration(options);
      await api.passkeyRegisterFinish(resp, deviceName);
      haptic("success");
      try {
        window.localStorage.setItem(PASSKEY_ENROLL_STATUS_KEY, "enrolled");
      } catch {
        /* ignore */
      }
      const next = enrollPrompt.next;
      setEnrollPrompt(null);
      router.push(next);
    } catch (e) {
      const msg = (e as Error).message ?? t("auth.registerError");
      // Annulation utilisateur (a fermé la popup biométrique) : on
      // skippe sans afficher d'erreur agressive — c'est un choix valide.
      if (
        msg.toLowerCase().includes("aborted") ||
        msg.toLowerCase().includes("cancelled") ||
        msg.toLowerCase().includes("notallowed")
      ) {
        try {
          window.localStorage.setItem(PASSKEY_ENROLL_STATUS_KEY, "declined");
        } catch {
          /* ignore */
        }
        const next = enrollPrompt.next;
        setEnrollPrompt(null);
        router.push(next);
        return;
      }
      setEnrollPrompt((p) =>
        p ? { ...p, enrolling: false, error: msg } : null,
      );
    }
  }

  /**
   * V24 · L'utilisateur a refusé l'enrôlement (« Plus tard »).
   * On marque sa décision pour ne plus reposer la question (il pourra
   * activer Face ID depuis /profile quand il voudra).
   */
  function declinePasskeyEnrollment(): void {
    if (!enrollPrompt) return;
    try {
      window.localStorage.setItem(PASSKEY_ENROLL_STATUS_KEY, "declined");
    } catch {
      /* ignore */
    }
    const next = enrollPrompt.next;
    setEnrollPrompt(null);
    router.push(next);
  }

  // Si rate-limité, on affiche le grand écran "petite pause" plein-écran
  // (variant mobile / desktop selon le viewport). Le timer décompte ; quand
  // il atteint 0 le composant appelle onRetryReady → on déverouille.
  if (rateLimit) {
    return (
      <RateLimitScreen
        retryAfter={rateLimit.retryAfter}
        message={rateLimit.message}
        tip={rateLimit.tip}
        onRetryReady={() => setRateLimit(null)}
      />
    );
  }

  // V24 — Prompt d'enrôlement passkey post-OTP (mobile uniquement, et
  // uniquement si l'utilisateur n'a pas encore de passkey enregistré).
  // S'affiche en plein écran APRÈS que verifyOtp a réussi et stocké le
  // JWT — donc la session est déjà valide ; refuser ce prompt fait
  // simplement passer au /dashboard, refuser n'invalide pas le login.
  if (enrollPrompt && platformInfo) {
    return (
      <PasskeyEnrollPrompt
        platform={platformInfo}
        enrolling={enrollPrompt.enrolling}
        error={enrollPrompt.error}
        onAccept={acceptPasskeyEnrollment}
        onDecline={declinePasskeyEnrollment}
      />
    );
  }

  return (
    <div className="container" style={{ maxWidth: 440 }}>
      {/* Header sticky — bouton retour + logo + slogan toujours visibles
          au scroll (UX banking app : on ne perd jamais ses repères, et
          le bouton "Accueil" reste à portée). Conteneur unique pour que
          tout reste collé en haut comme un seul bloc. */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 30,
          // V113 — Sticky header en V45-light (ivoire translucide chaud +
          // blur). Le fond dark rgba(14,11,20,...) précédent ne se remappait
          // pas automatiquement (overrides v45-light couvrent .60 → .98 sauf
          // .96 et .85 — d'où le fond noir persistant signalé). On hardcode
          // ivory pour ne plus dépendre des overrides.
          background:
            "linear-gradient(180deg, rgba(251,246,236,0.96) 75%, rgba(251,246,236,0.85))",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          margin: "0 -16px",
          padding: "0 16px 14px",
          borderBottom: "1px solid rgba(43,31,21,0.06)",
        }}
      >
        {/* Lien retour vers la page d'accueil — toujours accessible */}
        <div style={{ paddingTop: 12, marginBottom: 4 }}>
          <Link
            href="/"
            aria-label={t("auth.homeLink")}
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
            {t("auth.home")}
          </Link>
        </div>
        {/* Logo BMD plein format — style splash screen banking app
            (big logo en haut, identifiant fort, rassurant pour la connexion) */}
        <Link
          href="/"
          className="text-center"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
            marginTop: 8,
            textDecoration: "none",
            color: "inherit",
          }}
        >
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: 24,
            background:
              "linear-gradient(135deg, rgba(232,163,61,0.20), rgba(181,70,46,0.12))",
            border: "1.5px solid rgba(232,163,61,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow:
              "0 12px 40px rgba(232,163,61,0.20), 0 2px 8px rgba(0,0,0,0.4)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/bmd-logo.svg"
            alt="BMD"
            width={64}
            height={64}
            style={{ flexShrink: 0 }}
          />
        </div>
        <div
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 38,
            fontWeight: 700,
            color: "var(--cream)",
            letterSpacing: 1,
            lineHeight: 1,
            marginTop: 4,
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
            fontWeight: 600,
          }}
        >
          Back · Mes · Do
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--cream-soft, #d4c4a8)",
            marginTop: 6,
            opacity: 0.85,
            letterSpacing: 0.3,
          }}
        >
          L'argent partagé. L'amitié protégée.
        </div>
      </Link>
      </div>
      {/* Espace de respiration entre le sticky-header et la card */}
      <div style={{ height: 24 }} />

      <div className="card">
        <h2 style={{ marginBottom: 14 }}>
          {step === "contact"
            ? savedContact && step === "contact"
              ? t("auth.relogin")
              : t("auth.login")
            : t("auth.code")}
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
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--cream)",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span>
                  {t("auth.welcome")}
                  {savedContact.displayName
                    ? `, ${savedContact.displayName}`
                    : ""}
                </span>
                {/* V52.B1 — SVG sparkle remplace 👋 (V45 zéro emoji) */}
                <Icon
                  name="sparkles"
                  size={14}
                  color="var(--saffron, #e8a33d)"
                  strokeWidth={1.8}
                />
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--cream-soft)",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  flexWrap: "wrap",
                }}
              >
                <span>{t("auth.reconnectWith")}</span>
                <strong
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {/* V52.B1 — SVG phone/mail remplacent 📞 / ✉️ */}
                  <Icon
                    name={savedContact.type === "PHONE" ? "phone" : "mail"}
                    size={12}
                    color="currentColor"
                  />
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
              {t("auth.anotherAccount")}
            </button>
          </div>
        )}

        {error && <div className="error">{error}</div>}

        {step === "contact" && (
          <>
            {/* === Passkey TOP CTA sur mobile ===
                Sur iPhone/Android avec biométrie intégrée, on présente le
                passkey EN PREMIER avec un bouton XL gradient saffron — exactement
                comme une app native qui propose Face ID en haut de l'écran.
                Pas besoin de scroller, pas besoin de retaper son numéro.
                Le formulaire OTP reste accessible en dessous comme fallback.

                NOTE : on n'exige PLUS `hasPlatformAuth` sur mobile. Certains
                browsers / WebViews (Capacitor iOS notamment) renvoient false
                à `isUserVerifyingPlatformAuthenticatorAvailable()` même quand
                Face ID est en réalité dispo. On affiche le bouton dès que
                WebAuthn est supporté — au pire, le user clique et iOS répond
                "aucun passkey enregistré sur ce device". */}
            {passkeySupported &&
              platformInfo &&
              (platformInfo.isMobile || platformInfo.isTablet) && (
                <>
                  {/* V52.D2 — 2 cards V45 (primary biometric + paper security
                      key) remplacent l'ancien PasskeyLoginButton XL. Même
                      handler (startPasskeyLogin) ; juste un nouveau visuel
                      cohérent V45. Le form OTP en dessous reste intact. */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    {/* Card 1 — primary cocoa : méthode biometric platform */}
                    <LoginMethodCard
                      variant="primary"
                      icon={
                        <BiometricIcon
                          platform={platformInfo}
                          hasPlatformAuth={hasPlatformAuth}
                          size={22}
                        />
                      }
                      label={
                        passkeyLoading
                          ? t("auth.authenticating")
                          : hasPlatformAuth
                            ? t("auth.continueWith", {
                                label: platformInfo.biometricLabel,
                              })
                            : t("auth.securityKey")
                      }
                      sublabel={
                        hasPlatformAuth
                          ? t("auth.faceIdSub") ||
                            "Authentification rapide et sécurisée"
                          : undefined
                      }
                      loading={passkeyLoading}
                      onClick={startPasskeyLogin}
                      ariaLabel={t("auth.continueLabel", {
                        label: platformInfo.biometricLabel,
                      })}
                    />
                    {/* Card 2 — paper : clé de sécurité externe (cross-device passkey).
                        Affichée uniquement quand on a aussi du platform auth dispo,
                        sinon Card 1 couvre déjà tous les cas. */}
                    {hasPlatformAuth && (
                      <LoginMethodCard
                        variant="default"
                        iconName="key-round"
                        label={t("auth.securityKey") || "Clé de sécurité"}
                        sublabel={
                          t("auth.securityKeySub") ||
                          "Passkey enregistré sur un autre appareil"
                        }
                        loading={passkeyLoading}
                        onClick={startPasskeyLogin}
                      />
                    )}
                  </div>
                  {/* Composant d'origine conservé caché — référence pour rollback
                      éventuel. Sera supprimé en V53 quand V45 sera validé. */}
                  <div style={{ display: "none" }}>
                    <PasskeyLoginButton
                      platform={platformInfo}
                      hasPlatformAuth={hasPlatformAuth}
                      loading={passkeyLoading}
                      onClick={startPasskeyLogin}
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      margin: "16px 0 12px",
                      color: "var(--cream-soft)",
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: 1.2,
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        height: 1,
                        background: "var(--line-soft)",
                      }}
                    />
                    Ou par code
                    <div
                      style={{
                        flex: 1,
                        height: 1,
                        background: "var(--line-soft)",
                      }}
                    />
                  </div>
                </>
              )}

            <div className="field">
              <label>{t("auth.method")}</label>
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
                /* V149.F — Certaines extensions (LastPass, Honey, Google Lens)
                   et le WebView Chrome Android injectent `__gcruniqueid` sur
                   les <select>/<input>. suppressHydrationWarning évite l'erreur
                   de hydration sans impact comportemental. */
                suppressHydrationWarning
              >
                <option value="PHONE">{t("auth.phone")}</option>
                <option value="EMAIL">{t("auth.email")}</option>
              </select>
            </div>
            <div className="field">
              <label>
                {contactType === "PHONE"
                  ? t("auth.phoneNumber")
                  : t("auth.emailAddress")}
              </label>
              <input
                type={contactType === "EMAIL" ? "email" : "tel"}
                inputMode={contactType === "EMAIL" ? "email" : "tel"}
                /* autocomplete `username webauthn` permet le conditional UI
                   sur Safari iOS 16+ / Chrome Android : quand le user touche
                   le champ, le browser propose les passkeys déjà enregistrés
                   pour ce site. UX la plus native qui soit sur mobile. */
                autoComplete={
                  contactType === "EMAIL"
                    ? "username webauthn email"
                    : "username webauthn tel"
                }
                /* enterKeyHint="send" : sur clavier mobile, le bouton Retour
                   devient "Envoyer" — accélère la conversion. */
                enterKeyHint="send"
                autoCapitalize="off"
                spellCheck={false}
                value={contactValue}
                onChange={(e) => setContactValue(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !loading &&
                    (liveValidation === null || liveValidation.ok)
                  ) {
                    e.preventDefault();
                    void requestOtp();
                  }
                }}
                placeholder={
                  contactType === "PHONE"
                    ? t("auth.phonePlaceholder")
                    : t("auth.emailPlaceholder")
                }
                /* V149.F — Voir commentaire sur le <select> ci-dessus. */
                suppressHydrationWarning
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
                  ? t("auth.validFormat")
                  : t("auth.invalidFormat", { message: liveValidation.message ?? "" })}
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
              {loading ? t("auth.sending") : t("auth.receiveCode")}
            </button>

            {/* V214 — Connexion directe en mode test (bypass OTP).
                Visible uniquement si SiteConfig.testModeEnabled = true. */}
            {testModeEnabled && (
              <div
                style={{
                  marginTop: 14,
                  padding: 12,
                  background: "rgba(159,70,40,0.08)",
                  border: "1px dashed rgba(159,70,40,0.4)",
                  borderRadius: 10,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#9F4628",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 6,
                  }}
                >
                  ⚠️ Mode test actif — connexion sans code
                </div>
                <button
                  className="btn btn-block"
                  onClick={handleTestLogin}
                  disabled={
                    testLoginLoading ||
                    (liveValidation !== null && !liveValidation.ok)
                  }
                  style={{
                    width: "100%",
                    background: "#9F4628",
                    color: "#FAF6EE",
                    border: "none",
                  }}
                >
                  {testLoginLoading
                    ? "Connexion…"
                    : "Se connecter directement"}
                </button>
                <p
                  style={{
                    margin: "6px 0 0",
                    fontSize: 10,
                    color: "#6B5949",
                    lineHeight: 1.4,
                  }}
                >
                  Aucun email/SMS ne sera envoyé. Le compte est créé s'il
                  n'existe pas. Désactive le mode test avant la prod.
                </p>
              </div>
            )}

            <p
              style={{
                marginTop: 14,
                fontSize: 12,
                color: "var(--muted)",
                textAlign: "center",
              }}
            >
              {t("auth.devMode")}
            </p>

            {/* Connexion par QR depuis mobile (spec §8.5) */}
            <div
              style={{
                margin: "16px 0",
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: "var(--muted)",
                fontSize: 11,
                letterSpacing: 2,
                textTransform: "uppercase",
              }}
            >
              <div
                style={{
                  flex: 1,
                  height: 1,
                  background: "var(--line-soft)",
                }}
              />
              {t("auth.or")}
              <div
                style={{
                  flex: 1,
                  height: 1,
                  background: "var(--line-soft)",
                }}
              />
            </div>
            <Link
              href="/login/qr"
              className="btn-ghost btn-block"
              style={{
                textAlign: "center",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {t("auth.qrScan")}
            </Link>

            {googleEnabled && (
              <button
                type="button"
                onClick={startGoogleSso}
                disabled={googleLoading}
                className="btn-ghost btn-block"
                style={{
                  marginTop: 8,
                  textAlign: "center",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  fontWeight: 500,
                }}
              >
                {googleLoading ? (
                  <>
                    <span
                      aria-hidden
                      style={{
                        display: "inline-block",
                        width: 14,
                        height: 14,
                        border: "2px solid currentColor",
                        borderTopColor: "transparent",
                        borderRadius: "50%",
                        animation: "spin 0.8s linear infinite",
                      }}
                    />
                    {t("auth.googleRedirecting")}
                  </>
                ) : (
                  <>
                    {/* Logo Google officiel (SVG inline) */}
                    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
                      <path
                        fill="#FFC107"
                        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
                      />
                      <path
                        fill="#FF3D00"
                        d="m6.3 14.7 6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
                      />
                      <path
                        fill="#4CAF50"
                        d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.2c-2 1.4-4.5 2.4-7.3 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.6 39.6 16.2 44 24 44z"
                      />
                      <path
                        fill="#1976D2"
                        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.6l6.3 5.2c-.4.4 6.6-4.8 6.6-14.8 0-1.3-.1-2.4-.4-3.5z"
                      />
                    </svg>
                    {t("auth.continueGoogle")}
                  </>
                )}
              </button>
            )}

            {appleEnabled && (
              <button
                type="button"
                onClick={startAppleSso}
                disabled={appleLoading}
                className="btn-ghost btn-block"
                style={{
                  marginTop: 8,
                  textAlign: "center",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  fontWeight: 500,
                }}
              >
                {appleLoading ? (
                  <>
                    <span
                      aria-hidden
                      style={{
                        display: "inline-block",
                        width: 14,
                        height: 14,
                        border: "2px solid currentColor",
                        borderTopColor: "transparent",
                        borderRadius: "50%",
                        animation: "spin 0.8s linear infinite",
                      }}
                    />
                    {t("auth.appleRedirecting")}
                  </>
                ) : (
                  <>
                    {/* Logo Apple */}
                    <svg width="16" height="18" viewBox="0 0 16 18" aria-hidden fill="currentColor">
                      <path d="M13.36 14c-.65 1.96-1.96 3.93-3.91 3.97-1.94.04-2.55-1.16-4.76-1.13-2.21.03-2.86 1.16-4.81 1.12C-2.06 13.94-1.34 6.4 2.74 5.95c1.94-.05 3.16 1.32 4.76 1.32 1.6 0 2.62-1.32 4.94-1.16.97.04 3.7.39 5.45 2.95-.14.09-3.26 1.91-3.23 5.69.04 4.49 3.93 5.99 3.97 6.01-.03.1-.62 2.13-2.05 4.24-1.24 1.83-2.52 3.65-4.55 3.69M9 4.4c.78-.98 1.39-2.36 1.17-3.78-1.25.09-2.7.88-3.55 1.92-.77.94-1.42 2.34-1.24 3.7C6.74 6.34 8.22 5.41 9 4.4"/>
                    </svg>
                    {t("auth.continueApple")}
                  </>
                )}
              </button>
            )}

            {/* === Connexion passkey (WebAuthn) — version desktop ===
                Sur mobile, le bouton est déjà affiché EN HAUT en primaire.
                Ici on n'affiche le bouton ghost que pour desktop. */}
            {passkeySupported &&
              platformInfo &&
              !platformInfo.isMobile &&
              !platformInfo.isTablet && (
                <PasskeyLoginButton
                  platform={platformInfo}
                  hasPlatformAuth={hasPlatformAuth}
                  loading={passkeyLoading}
                  onClick={startPasskeyLogin}
                />
              )}
          </>
        )}

        {step === "code" && (
          <>
            <p style={{ color: "var(--cream-soft)", marginBottom: 16, fontSize: 13 }}>
              {t("auth.codeSentTo")} <strong>{contactValue}</strong>
            </p>
            <div className="field">
              <label>
                {t("auth.codeDigits")}
                <button
                  type="button"
                  onClick={() => setHideCode((v) => !v)}
                  title={
                    hideCode
                      ? t("auth.showCode")
                      : t("auth.hideCode")
                  }
                  style={{
                    marginLeft: 8,
                    padding: "2px 6px",
                    fontSize: 11,
                    background: "transparent",
                    border: "1px solid var(--line-soft)",
                    borderRadius: 4,
                    cursor: "pointer",
                    color: "var(--cream-soft)",
                  }}
                >
                  {hideCode ? t("auth.reveal") : t("auth.conceal")}
                </button>
              </label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={t("auth.codePlaceholder")}
                maxLength={6}
                inputMode="numeric"
                pattern="[0-9]*"
                /* autoComplete="one-time-code" : sur iOS, lit l'OTP du SMS
                   automatiquement et l'affiche au-dessus du clavier en
                   suggestion. UX magique. */
                autoComplete="one-time-code"
                enterKeyHint="go"
                autoFocus
                type={hideCode ? "password" : "text"}
                style={{ fontSize: 24, letterSpacing: 8, textAlign: "center" }}
                /* V149.F — Voir <select> auth.method ci-dessus. */
                suppressHydrationWarning
              />
            </div>
            {/*
              W1 — Champs de signup (prénom + langue + devise) affichés
              uniquement pour les nouveaux utilisateurs.
              Heuristique : on les cache dès qu'un `savedContact` existe en
              localStorage (= l'utilisateur s'est déjà connecté au moins une
              fois sur ce navigateur). Les returning users ne voient plus
              ces champs (qui leur étaient inutiles et perturbants).
              Si l'utilisateur arrive sur un nouveau device, savedContact
              est absent → les champs réapparaissent comme attendu pour
              une 1ère config.
            */}
            {!savedContact && (
              <>
                <div className="field">
                  <label>{t("auth.firstName")}</label>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={t("auth.firstNamePlaceholder")}
                    autoComplete="given-name"
                    autoCapitalize="words"
                    enterKeyHint="next"
                    spellCheck={false}
                    /* V149.F — Voir <select> auth.method ci-dessus. */
                    suppressHydrationWarning
                  />
                  <p
                    style={{
                      fontSize: 11,
                      color: "var(--muted, #8a7b6b)",
                      marginTop: 6,
                      lineHeight: 1.5,
                    }}
                  >
                    {t("auth.firstTimeHint")}
                  </p>
                </div>
                <div
                  className="field"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                  }}
                >
                  <div>
                    <label>{t("auth.language")}</label>
                    <SharedLangPicker
                      locale={signupLocale || "fr"}
                      onChange={(l) => setSignupLocale(l)}
                      whitelist={
                        availableLocales.length > 0
                          ? availableLocales.map((l) => l.code)
                          : undefined
                      }
                      triggerStyle={{ width: "100%" }}
                    />
                  </div>
                  <div>
                    <label htmlFor="signup-currency">{t("auth.currency")}</label>
                    <select
                      id="signup-currency"
                      value={signupCurrency}
                      onChange={(e) => setSignupCurrency(e.target.value)}
                      style={{ width: "100%" }}
                      /* V149.F — Voir <select> auth.method ci-dessus. */
                      suppressHydrationWarning
                    >
                      {availableCurrencies.length === 0 ? (
                        <option value="EUR">{t("auth.euro")}</option>
                      ) : (
                        availableCurrencies.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.flag ? `${c.flag} ` : ""}
                            {c.code} · {c.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>
              </>
            )}
            <button
              className="btn btn-block"
              onClick={verifyOtp}
              disabled={loading || code.length < 4}
              style={{ width: "100%" }}
            >
              {loading ? t("auth.verifying") : t("auth.signIn")}
            </button>
            <button
              className="btn-ghost btn-block"
              onClick={() => setStep("contact")}
              style={{ width: "100%", marginTop: 10 }}
            >
              {t("auth.editContact")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Bouton de connexion par passkey, mobile-first.
 *
 * - Sur mobile/tablette (touch + platformAuthenticator dispo) : bouton
 *   PRIMAIRE pleine largeur, en haut, avec gradient saffron (vrai feel
 *   native banking app). Label "Continuer avec Face ID" / "Touch ID" / etc.
 *
 * - Sur desktop : bouton secondaire (ghost), label "Touch ID / Face ID /
 *   Windows Hello / Yubikey" (générique parce qu'on ne sait pas ce qui est
 *   branché).
 *
 * - Si la plateforme n'a pas de Touch/Face ID intégré (Linux desktop par
 *   ex), on tombe sur "Clé de sécurité" (USB / NFC).
 */
function PasskeyLoginButton({
  platform,
  hasPlatformAuth,
  loading,
  onClick,
}: {
  platform: PlatformInfo;
  hasPlatformAuth: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  const t = useT();
  const isMobileLike = platform.isMobile || platform.isTablet;
  const label = loading
    ? t("auth.authenticating")
    : hasPlatformAuth
      ? t("auth.continueWith", { label: platform.biometricLabel })
      : t("auth.securityKey");

  // Style PRIMAIRE sur mobile (gradient saffron→terracotta), SECONDAIRE sur desktop
  const primary = isMobileLike && hasPlatformAuth;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={primary ? "btn btn-block" : "btn-ghost btn-block"}
      style={{
        marginTop: 8,
        textAlign: "center",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        fontWeight: 700,
        minHeight: primary ? 52 : 44, // touch target XL sur mobile
        ...(primary
          ? {
              background:
                "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))",
              color: "#16111E",
              fontSize: 15,
              boxShadow: "0 6px 18px rgba(181,70,46,0.25)",
            }
          : {
              borderColor: "rgba(232,163,61,0.4)",
              color: "var(--saffron, #e8a33d)",
            }),
      }}
      aria-label={t("auth.continueLabel", { label: platform.biometricLabel })}
    >
      {loading ? (
        <>
          <span
            aria-hidden
            style={{
              display: "inline-block",
              width: 16,
              height: 16,
              border: "2px solid currentColor",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
          {label}
        </>
      ) : (
        <>
          {/* Icône adaptative selon le moyen biométrique */}
          <BiometricIcon
            platform={platform}
            hasPlatformAuth={hasPlatformAuth}
            size={primary ? 22 : 18}
          />
          <span>{label}</span>
        </>
      )}
    </button>
  );
}

/**
 * Icône SVG inline qui s'adapte au moyen biométrique :
 *   - Face ID → masque facial stylisé
 *   - Touch ID / Empreinte → fingerprint
 *   - Windows Hello → cible/iris
 *   - Sinon → clé de sécurité
 */
function BiometricIcon({
  platform,
  hasPlatformAuth,
  size = 18,
}: {
  platform: PlatformInfo;
  hasPlatformAuth: boolean;
  size?: number;
}) {
  const stroke = "currentColor";
  if (!hasPlatformAuth) {
    // Icône "clé"
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        aria-hidden
        fill="none"
        stroke={stroke}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="8" cy="14" r="4" />
        <path d="M11 11l9-9 2 2-2 2 2 2-2 2-2-2-3 3" />
      </svg>
    );
  }
  if (platform.biometricLabel === "Face ID") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        aria-hidden
        fill="none"
        stroke={stroke}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Cadre style "Face ID" iOS */}
        <path d="M3 7V5a2 2 0 012-2h2" />
        <path d="M21 7V5a2 2 0 00-2-2h-2" />
        <path d="M3 17v2a2 2 0 002 2h2" />
        <path d="M21 17v2a2 2 0 01-2 2h-2" />
        <path d="M9 9v1.5M15 9v1.5" />
        <path d="M12 9v3l-1 1.5h2" />
        <path d="M9 16c1 .8 2 1 3 1s2-.2 3-1" />
      </svg>
    );
  }
  if (platform.biometricLabel === "Windows Hello") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        aria-hidden
        fill="none"
        stroke={stroke}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4.5" />
        <circle cx="12" cy="12" r="1.5" fill={stroke} />
      </svg>
    );
  }
  // Touch ID / Empreinte (par défaut)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke={stroke}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2c2.5 0 5 1 7 3" />
      <path d="M3 8c2-2.5 5.5-4 9-4" />
      <path d="M5 12c0-2 1-4 3-5.5" />
      <path d="M19 12c0 4-1 7-3 9" />
      <path d="M12 6c-3 0-5 2.5-5 6 0 1.5.5 3 1 4" />
      <path d="M17 12c0 3-1 5.5-3 7.5" />
      <path d="M12 10v3c0 2-.5 4-2 5.5" />
    </svg>
  );
}

/**
 * V24 · Plein-écran proposé après une 1ère connexion OTP réussie sur
 * un mobile compatible Face ID / Touch ID / Empreinte.
 *
 * UX banking app : on profite du moment où l'utilisateur vient de
 * réussir un OTP (donc habitude de validation biométrique fraîche)
 * pour proposer en 1 tap d'éliminer le besoin d'OTP la prochaine fois.
 *
 * Le bouton « Plus tard » fait un router.push direct — la session est
 * déjà valide, on n'invalide rien si l'utilisateur dit non. Il pourra
 * activer Face ID quand il voudra depuis /profile.
 */
function PasskeyEnrollPrompt({
  platform,
  enrolling,
  error,
  onAccept,
  onDecline,
}: {
  platform: PlatformInfo;
  enrolling: boolean;
  error: string | null;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const t = useT();
  const label = platform.biometricLabel; // « Face ID », « Touch ID », « Empreinte »…
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        // V113 — Fond V45-light : ivoire avec halo saffron chaud (au lieu
        // du fond #0E0B14 sombre). L'écran d'enrôlement passkey post-OTP
        // était la dernière zone dark non remappée de /login.
        background:
          "radial-gradient(ellipse at top, rgba(197,138,46,0.14), transparent 60%), var(--ivory, #FBF6EC)",
        color: "var(--cocoa, #2B1F15)",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18,
        }}
      >
        <div
          aria-hidden
          style={{
            width: 96,
            height: 96,
            borderRadius: "50%",
            background:
              "linear-gradient(135deg, rgba(232,163,61,0.25), rgba(181,70,46,0.25))",
            border: "1px solid rgba(232,163,61,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 12px 36px rgba(232,163,61,0.18)",
            color: "var(--saffron, #e8a33d)",
          }}
        >
          <BiometricIcon platform={platform} hasPlatformAuth size={44} />
        </div>
        <h1
          style={{
            fontSize: 26,
            fontWeight: 800,
            margin: "8px 0 4px",
            lineHeight: 1.2,
          }}
        >
          {t("auth.enrollTitle", { label })}
        </h1>
        <p
          style={{
            fontSize: 15,
            lineHeight: 1.55,
            opacity: 0.85,
            margin: 0,
            maxWidth: 360,
          }}
        >
          {t("auth.enrollBenefit")}
        </p>
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: "8px 0 12px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            fontSize: 14,
            opacity: 0.85,
            textAlign: "left",
            width: "100%",
            maxWidth: 320,
          }}
        >
          {/* V52.B1 — SVG check remplace ✓ unicode (V45 SVG outline 1.5px) */}
          <li
            style={{ display: "flex", alignItems: "center", gap: 10 }}
            aria-hidden={false}
          >
            <Icon
              name="check"
              size={16}
              color="var(--saffron, #e8a33d)"
              strokeWidth={2}
            />
            <span>{t("auth.enrollSpeed")}</span>
          </li>
          <li style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Icon
              name="check"
              size={16}
              color="var(--saffron, #e8a33d)"
              strokeWidth={2}
            />
            <span>{t("auth.enrollSecurity")}</span>
          </li>
          <li style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Icon
              name="check"
              size={16}
              color="var(--saffron, #e8a33d)"
              strokeWidth={2}
            />
            <span>{t("auth.enrollDisable")}</span>
          </li>
        </ul>

        {error ? (
          <div
            role="alert"
            style={{
              fontSize: 13,
              color: "#fca5a5",
              background: "rgba(239,68,68,0.12)",
              border: "1px solid rgba(239,68,68,0.35)",
              padding: "10px 14px",
              borderRadius: 12,
              width: "100%",
              maxWidth: 340,
              textAlign: "left",
              lineHeight: 1.4,
            }}
          >
            <strong>{t("auth.enrollError")}</strong> {error}
            <br />
            <span style={{ opacity: 0.85 }}>
              {t("auth.enrollRetryHint")}
            </span>
          </div>
        ) : null}

        <button
          type="button"
          onClick={onAccept}
          disabled={enrolling}
          className="btn btn-block"
          style={{
            background:
              "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))",
            color: "#16111E",
            fontWeight: 700,
            fontSize: 16,
            minHeight: 56,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            boxShadow: "0 8px 22px rgba(181,70,46,0.30)",
            maxWidth: 340,
          }}
          aria-label={`Activer ${label} maintenant`}
        >
          {enrolling ? (
            <>
              <span
                aria-hidden
                style={{
                  display: "inline-block",
                  width: 18,
                  height: 18,
                  border: "2px solid currentColor",
                  borderTopColor: "transparent",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                }}
              />
              {t("auth.enrollSetup")}
            </>
          ) : (
            <>
              <BiometricIcon
                platform={platform}
                hasPlatformAuth
                size={22}
              />
              {t("auth.enrollActivate", { label })}
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onDecline}
          disabled={enrolling}
          className="btn-ghost btn-block"
          style={{
            // V113 — Couleur cocoa-soft sur ivoire (au lieu du fallback
            // text dark #f4eef7 qui restait clair sur fond ivory et donc
            // illisible après la migration du background hero).
            color: "var(--cocoa-soft, #6B5A47)",
            opacity: 0.85,
            fontWeight: 500,
            fontSize: 14,
            minHeight: 44,
            maxWidth: 340,
          }}
        >
          {t("auth.enrollLater")}
        </button>
        <p
          style={{
            fontSize: 12,
            opacity: 0.55,
            marginTop: 4,
            maxWidth: 340,
          }}
        >
          {t("auth.enrollPrivacy")}
        </p>
      </div>

      <style jsx>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
