"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  api,
  clearToken,
  getToken,
  isUnauthorized,
} from "../../../lib/api-client";
import { BottomNav } from "../../../lib/ui/bottom-nav";

// V53.C2 — Lazy load des 8 blocks lourds du profil. Chacun est chargé
// uniquement quand l'user ouvre la tile correspondante (BottomSheet mobile)
// ou scroll jusqu'à la section (desktop). Avant : 8 imports sync = ~80 KB
// bundle initial profil. Après : ~5 KB initial + chunks à la demande.
// Le skeleton {ssr: false} évite le rendu serveur (composants 100% client).
const SKELETON = (
  <div
    style={{
      minHeight: 80,
      background: "var(--paper, rgba(244,228,193,0.04))",
      borderRadius: 12,
      animation: "bmd-skel-pulse 1.2s ease-in-out infinite",
    }}
  />
);
const TwoFactorBlock = dynamic(
  () => import("../../../lib/ui/two-factor-block").then((m) => m.TwoFactorBlock),
  { ssr: false, loading: () => SKELETON },
);
const PasskeyManager = dynamic(
  () => import("../../../lib/ui/passkey-manager").then((m) => m.PasskeyManager),
  { ssr: false, loading: () => SKELETON },
);
const PushNotifBlock = dynamic(
  () => import("../../../lib/ui/push-notif-block").then((m) => m.PushNotifBlock),
  { ssr: false, loading: () => SKELETON },
);
const IosInstallNotice = dynamic(
  () => import("../../../lib/ui/ios-install-notice").then((m) => m.IosInstallNotice),
  { ssr: false, loading: () => null },
);
const GdprBlock = dynamic(
  () => import("../../../lib/ui/gdpr-block").then((m) => m.GdprBlock),
  { ssr: false, loading: () => SKELETON },
);
const PromoBlock = dynamic(
  () => import("../../../lib/ui/promo-block").then((m) => m.PromoBlock),
  { ssr: false, loading: () => SKELETON },
);
const SimSwapAlerts = dynamic(
  () => import("../../../lib/ui/sim-swap-alerts").then((m) => m.SimSwapAlerts),
  { ssr: false, loading: () => null },
);
const PaymentMethodsBlock = dynamic(
  () => import("../../../lib/ui/payment-methods-block").then((m) => m.PaymentMethodsBlock),
  { ssr: false, loading: () => SKELETON },
);
import { useLocale } from "../../../lib/locale-provider";
import { useCurrency } from "../../../lib/currency-provider";
import { PlanBlock } from "../../../lib/ui/plan-block";
import { useDialog } from "../../../lib/ui/dialog-provider";
import { ResponsiveShell } from "../../../lib/ui/responsive-shell";
import { useBreakpoint } from "../../../lib/use-breakpoint";
// V107 — Vue profil desktop refondue V45-light + factorisée.
import { DesktopProfileView } from "../../../lib/ui/desktop-profile-view";
import { usePullToRefresh } from "../../../lib/use-pull-to-refresh";
import { PullIndicator } from "../../../lib/ui/pull-indicator";
import { useT } from "../../../lib/i18n/app-strings";
import { SharedLangPicker } from "../../../lib/ui/shared-lang-picker";
import { BottomSheet } from "../../../lib/ui/bottom-sheet";
import { ThemeToggle } from "../../../lib/ui/theme-toggle";
// V52.C2 — SVG remplace EMOJI : icon registry V52.A2
import { Icon } from "../../../lib/ui/icons";

/**
 * V74.1 — Compresse une image File en data URL pour la photo de profil.
 *
 * - Côté long limité à 512px (suffisant pour avatar)
 * - JPEG qualité 0.85 (compromis poids/qualité)
 * - Garde le ratio d'origine
 *
 * Helper de module pour éviter la duplication entre le hero (page) et le
 * MobileIdentitySheet (qui a déjà sa propre version locale).
 */
function compressProfilePhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const MAX_SIDE = 512;
        let { width, height } = img;
        if (width > height && width > MAX_SIDE) {
          height = Math.round((height * MAX_SIDE) / width);
          width = MAX_SIDE;
        } else if (height >= width && height > MAX_SIDE) {
          width = Math.round((width * MAX_SIDE) / height);
          height = MAX_SIDE;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas non supporté"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = String(reader.result ?? "");
    };
    reader.readAsDataURL(file);
  });
}

export default function ProfilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dialog = useDialog();
  const { isMobile, ready: bpReady } = useBreakpoint();
  const t = useT();
  const [user, setUser] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // V35 — Refonte profil mobile « one-screen banking app ».
  // Le profil mobile est une grille de tiles compactes. Chaque tap ouvre
  // un BottomSheet avec le contenu de la section. La vue principale tient
  // entièrement sur 1 viewport (pas de scroll long de cards verticales).
  type MobileTile =
    | null
    | "identity"
    | "contacts"
    | "security"
    | "notifications"
    | "payments"
    | "rewards"
    | "privacy"
    | "preferences";
  /** True si l'user est arrivé sur /profile via un shortcut du dashboard
   *  (?tile=...). Dans ce cas, fermer la BottomSheet doit le ramener au
   *  dashboard — pas le laisser bloqué sur la page profil qu'il n'avait
   *  pas l'intention d'ouvrir. */
  // V37 — Détection immédiate (synchrone au 1er render) si on arrive via
  // shortcut. Permet de masquer le contenu profil avant que React ait
  // monté le useEffect, évitant le flash visuel "voir le profil 50ms".
  const initialTileParam =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("tile")
      : null;
  const ALLOWED_TILES_INIT = [
    "identity",
    "contacts",
    "security",
    "notifications",
    "payments",
    "rewards",
    "preferences",
    "privacy",
  ] as const;
  const initialOpenTile: MobileTile =
    initialTileParam &&
    (ALLOWED_TILES_INIT as readonly string[]).includes(initialTileParam)
      ? (initialTileParam as MobileTile)
      : null;
  const [openTile, setOpenTile] = useState<MobileTile>(initialOpenTile);
  const [arrivedViaShortcut, setArrivedViaShortcut] = useState(
    initialOpenTile !== null,
  );

  function closeTile() {
    setOpenTile(null);
    if (arrivedViaShortcut) {
      setArrivedViaShortcut(false);
      router.replace("/dashboard");
    }
  }

  // Lecture du query param ?tile=... → ouvre directement la tile au mount.
  // Permet aux shortcuts du dashboard ("Paiements", "Préférences") d'amener
  // l'utilisateur DIRECTEMENT sur la section concernée plutôt qu'au profil
  // racine où il devrait re-cliquer.
  useEffect(() => {
    const tile = searchParams?.get("tile");
    if (!tile) return;
    const allowed: MobileTile[] = [
      "identity",
      "contacts",
      "security",
      "notifications",
      "payments",
      "rewards",
      "preferences",
      "privacy",
    ];
    if ((allowed as string[]).includes(tile)) {
      setOpenTile(tile as MobileTile);
      setArrivedViaShortcut(true);
    }
  }, [searchParams]);

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

  // V74.1 — Stats hero : compteurs Groupes/Tontines/Dépenses récupérés via
  // api.listGroups() (mémoizé 5 min côté front, donc cheap). On comptabilise
  // tous les groupes (peu importe leur état), les tontines = type TONTINE,
  // les dépenses = somme des expenseCount par groupe.
  const [heroGroups, setHeroGroups] = useState<Array<{
    type: string;
    expenseCount?: number;
  }> | null>(null);
  useEffect(() => {
    api
      .listGroups()
      .then((r) => setHeroGroups(r as Array<{ type: string; expenseCount?: number }>))
      .catch(() => {
        /* silencieux : on garde "—" si l'API échoue */
      });
  }, []);
  const heroStats = useMemo(() => {
    if (!heroGroups) return { groups: "—", tontines: "—", expenses: "—" };
    const groupsCount = heroGroups.length;
    const tontinesCount = heroGroups.filter((g) => g.type === "TONTINE").length;
    const expensesCount = heroGroups.reduce(
      (sum, g) => sum + (g.expenseCount ?? 0),
      0,
    );
    return {
      groups: String(groupsCount),
      tontines: String(tontinesCount),
      expenses: String(expensesCount),
    };
  }, [heroGroups]);

  // V74.5 — Mesure dynamique de la hauteur du hero figé pour appliquer
  // exactement le paddingTop nécessaire sur le contenu scrollable en
  // dessous. ResizeObserver garde la valeur à jour si le viewport tourne
  // ou si le contenu change (photo qui se charge, etc.).
  const heroBlockRef = useRef<HTMLDivElement | null>(null);
  const [heroBlockHeight, setHeroBlockHeight] = useState(230);
  useEffect(() => {
    const el = heroBlockRef.current;
    if (!el) return;
    const update = () => setHeroBlockHeight(el.offsetHeight);
    update();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
    }
    return undefined;
  }, [user?.id]);

  // V75 — Portal vers document.body pour le hero figé. Sur iOS Safari et
  // WKWebView, un `position: fixed` enfant d'un scroller interne (le <main>
  // overflowY: auto du MobileShell) peut être traité comme `absolute` ou
  // jitter pendant le scroll, à cause de la barre URL Safari qui modifie
  // le viewport visuel et d'un bug WebKit historique. En portalisant le
  // hero directement dans <body>, on garantit que `position: fixed` soit
  // STRICTEMENT viewport-relative — exactement comme un header système.
  // Plus aucune chance d'ancêtre transformé/overflow qui casse le fixed.
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => {
    setPortalReady(true);
  }, []);

  // V74.1 — Photo de profil dans le hero (cliquable pour upload direct).
  // Logique identique à MobileIdentitySheet : compresse 512×512 / qualité
  // 0.85 puis PATCH /auth/me + cache localStorage. On exécute aussi un
  // refresh du user pour récupérer l'avatar normalisé serveur après upload.
  const [heroPhoto, setHeroPhoto] = useState<string | null>(null);
  const heroPhotoInputRef = useRef<HTMLInputElement | null>(null);
  // V101 — Ref distinct pour l'avatar desktop (card Identité). Le ref mobile
  // est confiné dans le portal `mobileHero` (rendu uniquement quand isMobile),
  // donc côté desktop il pointe sur null → impossible de déclencher le picker.
  // Ce 2ᵉ ref est rendu à côté de l'avatar desktop, garantissant le upload
  // sur web aussi.
  const desktopPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const [heroPhotoSaving, setHeroPhotoSaving] = useState(false);
  // V77 — Toast post-upload qui informe l'user si sa photo est visible
  // aux membres de ses groupes (selon son plan). Disparaît au bout de 6s
  // ou sur tap manuel. Inclut un CTA upgrade si l'user est FREE.
  const [photoToast, setPhotoToast] = useState<{
    visible: boolean;
    canUpgrade: boolean;
  } | null>(null);
  useEffect(() => {
    if (user?.avatar) {
      setHeroPhoto(user.avatar);
      try {
        window.localStorage.setItem("bmd_profile_photo_v1", user.avatar);
      } catch {
        /* ignore */
      }
      return;
    }
    // V178.A — Si `user` est chargé (objet présent) MAIS `avatar` est null,
    // le serveur a explicitement dit "cet user n'a pas de photo". On purge
    // le localStorage stale (qui peut contenir la photo d'un autre user
    // ayant utilisé ce browser avant). Bug rapporté Fabrice : fresh signup
    // affichait la photo du compte précédent.
    if (user && !user.avatar) {
      setHeroPhoto(null);
      try {
        window.localStorage.removeItem("bmd_profile_photo_v1");
      } catch {
        /* ignore */
      }
      return;
    }
    // user pas encore chargé → on tente le cache local pour éviter un
    // flash vide au cold-start (sera écrasé par le fetch /auth/me).
    try {
      const p = window.localStorage.getItem("bmd_profile_photo_v1");
      if (p) setHeroPhoto(p);
    } catch {
      /* ignore */
    }
  }, [user, user?.avatar]);
  async function handleHeroPhoto(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      window.alert("Photo trop lourde (max 10 Mo en source).");
      return;
    }
    setHeroPhotoSaving(true);
    try {
      const dataUrl = await compressProfilePhoto(file);
      try {
        await api.updateMe({ avatar: dataUrl });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[photo hero] sync serveur échouée:", e);
      }
      try {
        window.localStorage.setItem("bmd_profile_photo_v1", dataUrl);
      } catch {
        /* ignore */
      }
      setHeroPhoto(dataUrl);
      try {
        const me = await api.me();
        setUser(me.user);
      } catch {
        /* ignore */
      }
      window.dispatchEvent(new Event("bmd:profile-photo"));
      // V77 — Toast post-upload qui informe selon le plan :
      // FREE → photo visible que pour toi + CTA upgrade
      // Plans payants → photo visible aux membres de tes groupes
      const isFree = !user?.planCode || user.planCode === "FREE";
      setPhotoToast({ visible: !isFree, canUpgrade: isFree });
    } catch (e) {
      window.alert(
        `Impossible de traiter la photo: ${(e as Error).message ?? "erreur inconnue"}`,
      );
    } finally {
      setHeroPhotoSaving(false);
    }
  }

  // V77 — Auto-dismiss du toast photo après 6 secondes (UX banking)
  useEffect(() => {
    if (!photoToast) return;
    const id = window.setTimeout(() => setPhotoToast(null), 6000);
    return () => window.clearTimeout(id);
  }, [photoToast]);

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
        hideBottomNav={isMobile}
        hideHeader={isMobile}
      >
        <p className="muted" style={{ padding: 30 }}>
          Chargement…
        </p>
      </ResponsiveShell>
    );
  }

  // V74.3 — Hero profil V45 STICKY. Le back button est INTÉGRÉ dans la
  // card hero (position absolute top-left) au lieu d'être au-dessus. Plus
  // aucune barre externe ni titre « Mon profil ». Toute la zone visible
  // est la card paper avec une bordure douce, le scroll passe en dessous.
  // V74.9 — Hero figé STABLE iOS Safari : padding-top FIXE 50px au lieu
  // de env(safe-area-inset-top) qui VARIE quand la URL bar Safari se
  // cache/montre. Cette variation faisait changer la hauteur du hero
  // pendant le scroll, créant un "jeu" / espace blanc qui apparaissait.
  // Maintenant la hauteur est constante → le hero ne bouge JAMAIS d'un
  // pixel, peu importe l'état de la URL bar Safari.
  const mobileHero = (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        margin: "0 0 10px",
        padding: "50px 14px 10px",
        background: "var(--paper, #FFFFFF)",
        borderLeft: "none",
        borderRight: "none",
        borderTop: "none",
        borderBottom: "1px solid var(--v45-line, rgba(43,31,21,0.10))",
        borderRadius: 0,
        textAlign: "center",
        boxShadow: "0 4px 14px rgba(43,31,21,0.04)",
        boxSizing: "border-box",
        width: "100%",
      }}
    >
      {/* Input file caché pour upload photo (déclenché par l'avatar) */}
      <input
        ref={heroPhotoInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleHeroPhoto(f);
          e.target.value = "";
        }}
      />

      {/* V74.9 — Back button positionné en absolute, ALIGNÉ verticalement
          avec le centre de l'avatar (top = padding-top 50 + (avatar 72/2) -
          (back 38/2) = 50 + 36 - 19 = 67). Valeur FIXE → pas de variation
          avec l'URL bar Safari, donc plus de "jeu" au scroll. */}
      <Link
        href="/dashboard"
        aria-label="Retour au tableau de bord"
        style={{
          position: "absolute",
          top: 67,
          left: 12,
          width: 38,
          height: 38,
          borderRadius: "50%",
          background: "var(--ivory-2, #F4ECD8)",
          border: "1px solid var(--v45-line, rgba(43,31,21,0.10))",
          color: "var(--cocoa, var(--cream))",
          textDecoration: "none",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 1px 3px rgba(43,31,21,0.06)",
          touchAction: "manipulation",
          WebkitTapHighlightColor: "transparent",
          zIndex: 2,
        }}
      >
        <Icon name="chevron-left" size={18} strokeWidth={1.9} />
      </Link>

      {/* Avatar 72px (au lieu de 84) avec triple anneau, cliquable */}
      <button
        type="button"
        onClick={() => heroPhotoInputRef.current?.click()}
        aria-label="Changer la photo de profil"
        style={{
          position: "relative",
          width: 72,
          height: 72,
          borderRadius: "50%",
          padding: 3,
          background:
            "linear-gradient(135deg, var(--v45-saffron, #C58A2E) 0%, var(--v45-saffron-soft, #E8C988) 55%, var(--v45-saffron-pale, #F6E8C5) 100%)",
          boxShadow:
            "0 8px 18px rgba(197,138,46,0.22), 0 1px 4px rgba(43,31,21,0.10)",
          border: "none",
          cursor: "pointer",
          flexShrink: 0,
          touchAction: "manipulation",
          WebkitTapHighlightColor: "transparent",
          opacity: heroPhotoSaving ? 0.7 : 1,
        }}
      >
        <span
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            borderRadius: "50%",
            padding: 2,
            background: "var(--paper, #FFFFFF)",
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
              fontSize: 26,
              fontWeight: 700,
              fontFamily: "Cormorant Garamond, serif",
            }}
          >
            {!heroPhoto && (user.displayName?.charAt(0).toUpperCase() ?? "?")}
          </span>
        </span>
        {/* Badge camera (taille adaptée à l'avatar) */}
        <span
          aria-hidden
          style={{
            position: "absolute",
            right: -2,
            bottom: -2,
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: "var(--v45-saffron, #C58A2E)",
            color: "#FFFFFF",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            border: "2px solid var(--paper, #FFFFFF)",
            boxShadow: "0 2px 6px rgba(197,138,46,0.45)",
          }}
        >
          <Icon name="camera" size={10} strokeWidth={2} color="currentColor" />
        </span>
      </button>

      {/* Nom + sous-titre centrés */}
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <div
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 20,
            fontWeight: 700,
            color: "var(--cocoa, var(--cream))",
            lineHeight: 1.1,
          }}
        >
          {user.displayName}
        </div>
        <div
          style={{
            fontSize: 10.5,
            color: "var(--cocoa-soft, var(--cream-soft))",
            letterSpacing: 0.4,
          }}
        >
          {user.defaultCurrency} · {user.defaultLocale?.toUpperCase()}
        </div>
      </div>

      {/* Plan badge avec étoile SVG saffron */}
      {user.planCode && (
        <Link
          href="/dashboard/plans"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "4px 11px",
            borderRadius: 999,
            background:
              user.planCode === "FREE"
                ? "var(--ivory-2, rgba(43,31,21,0.06))"
                : "var(--night-deep, #14101E)",
            color:
              user.planCode === "FREE"
                ? "var(--cocoa-soft, var(--cream-soft))"
                : "var(--v45-saffron, #C58A2E)",
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 0.7,
            textTransform: "uppercase",
            textDecoration: "none",
            border:
              user.planCode === "FREE"
                ? "1px solid var(--v45-line, rgba(43,31,21,0.10))"
                : "1px solid rgba(197,138,46,0.30)",
            flexShrink: 0,
            touchAction: "manipulation",
          }}
        >
          {user.planCode !== "FREE" && (
            <Icon name="sparkles" size={11} strokeWidth={1.7} />
          )}
          <span>{user.planCode}</span>
        </Link>
      )}

      {/* 3 mini-stats centrées en cards paper */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 6,
          width: "100%",
          marginTop: 2,
        }}
      >
        {[
          { label: "Groupes", value: heroStats.groups },
          { label: "Tontines", value: heroStats.tontines },
          { label: "Dépenses", value: heroStats.expenses },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              padding: "6px 4px",
              background: "var(--ivory, rgba(244,228,193,0.04))",
              border: "1px solid var(--v45-line, rgba(43,31,21,0.08))",
              borderRadius: 10,
              textAlign: "center",
            }}
          >
            <div
              className="bmd-num"
              style={{
                fontFamily: "Cormorant Garamond, serif",
                fontSize: 17,
                fontWeight: 700,
                color: "var(--cocoa, var(--cream))",
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {stat.value}
            </div>
            <div
              style={{
                fontSize: 8.5,
                color: "var(--cocoa-soft, var(--cream-soft))",
                marginTop: 2,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                fontWeight: 700,
              }}
            >
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // V107 — Sur desktop, on bascule sur la vue refondue V45-light avec hero,
  // grille 2 cols (sticky identité gauche / sections droite). Toute la stack
  // mobile (tiles + BottomSheets + sections legacy) reste pour mobile.
  if (bpReady && !isMobile && user) {
    return (
      <ResponsiveShell
        breadcrumb="Mon compte"
        desktopTitle="Mon profil"
        subtitle={t("profile.subtitle")}
        mobileTitle="Mon profil"
        back={{ href: "/dashboard" }}
        hideFab
      >
        <DesktopProfileView
          user={user}
          heroPhoto={heroPhoto}
          onPhotoUpload={(f) => void handleHeroPhoto(f)}
          photoSaving={heroPhotoSaving}
          onLogout={logout}
          onSaveIdentity={async (patch) => {
            // V144 — Appel direct à updateMe avec tous les champs (incl.
            // nickname + displayPreference). Le state local + saveProfile()
            // historique ne gérait que displayName/currency/locale ; on passe
            // par api.updateMe puis on rafraîchit le profil pour propager
            // partout (incl. les vues groupes côté autres membres après
            // invalidation cache front+back V144.D).
            setError(null);
            setSavingProfile(true);
            try {
              await api.updateMe({
                displayName: patch.displayName.trim(),
                nickname: patch.nickname ?? undefined,
                displayPreference: patch.displayPreference,
                defaultCurrency: patch.defaultCurrency,
                defaultLocale: patch.defaultLocale,
              });
              await applyLocaleGlobal(patch.defaultLocale);
              await applyCurrencyGlobal(patch.defaultCurrency);
              await refresh();
              flash(t("profile.updated"));
            } catch (e) {
              setError((e as Error).message);
              throw e; // Propage pour que le bouton reste en état "saving=false"
            } finally {
              setSavingProfile(false);
            }
          }}
          stats={heroStats}
        />
      </ResponsiveShell>
    );
  }

  return (
    <ResponsiveShell
      breadcrumb="Mon compte"
      desktopTitle="Mon profil"
      subtitle={t("profile.subtitle")}
      mobileTitle="Mon profil"
      back={{ href: "/dashboard" }}
      hideFab
      // V76 — bodyScroll : <body> est le scroller, plus le <main>.
      // Comportement identique aux pages SANS scroll (dashboard par groupe)
      // où le hero figé est strictement viewport-relative. Élimine le jitter
      // iOS Safari du fixed dans scroller interne.
      mobileBodyScroll
      // V39 — Sur mobile, le profil prend tout l'écran : pas de bottom-nav
      // (l'utilisateur revient au dashboard via la flèche back du header).
      // C'est aussi pour ça qu'on affiche le numéro de version en pied de
      // page profil — c'est la "fin" de la navigation.
      hideBottomNav={isMobile}
      hideHeader={isMobile}
    >
      <div
        style={{
          padding: 0,
          maxWidth: isMobile ? "100%" : 920,
          margin: "0 auto",
          // V74.4 — Anti-scroll latéral : aucun débordement horizontal
          // possible, peu importe le contenu interne (tuiles, sections,
          // back button sticky avec margin: -16px). Combo avec width: 100%.
          width: "100%",
          overflowX: "hidden",
          // V38 — Si on est arrivé via shortcut depuis le dashboard, on
          // masque visuellement le contenu profil sous-jacent : seul le
          // BottomSheet est rendu, pas de flash de la page profil. Sur
          // close de la sheet, closeTile() redirige vers /dashboard sans
          // jamais montrer le profil.
          visibility:
            isMobile && arrivedViaShortcut ? "hidden" : "visible",
        }}
      >
      {/* Pull-to-refresh indicator — au-dessus du hero, mobile only */}
      {isMobile && !arrivedViaShortcut && <PullIndicator {...pullState} />}

      {/* V75 — Hero figé PORTALISÉ dans <body>. Sans portal, le hero était
          enfant du <main overflowY: auto> du MobileShell, et iOS Safari
          traitait son position: fixed comme s'il était relatif au scroller
          interne (bug WebKit classique), d'où le "jeu" au scroll. En le
          rendant directement dans body via createPortal, plus aucun
          ancêtre (transform/overflow/filter) ne peut casser le fixed →
          il devient strictement viewport-relative, comme un vrai header
          natif. Le spacer ci-dessous compense la hauteur dans le flow. */}
      {isMobile && !arrivedViaShortcut && portalReady && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={heroBlockRef}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              zIndex: 50,
              background: "var(--ivory, #FBF6EC)",
              padding: 0,
              margin: 0,
              boxSizing: "border-box",
              boxShadow: "0 6px 12px -8px rgba(43,31,21,0.08)",
              // V75 — Force le compositing layer iOS pour zéro jitter au scroll.
              transform: "translateZ(0)",
              WebkitTransform: "translateZ(0)",
              willChange: "transform",
              WebkitBackfaceVisibility: "hidden",
              backfaceVisibility: "hidden",
            }}
          >
            {mobileHero}
          </div>,
          document.body,
        )}

      {/* V77 — Toast post-upload photo : informe l'user de la visibilité de sa
          photo selon son plan. FREE → visible que par toi + CTA upgrade.
          Plans payants → visible aux membres de tes groupes. Portalisé dans
          body pour être garanti viewport-fixed (même logique que le hero). */}
      {photoToast && portalReady && typeof document !== "undefined" &&
        createPortal(
          <div
            role="status"
            aria-live="polite"
            onClick={() => setPhotoToast(null)}
            style={{
              position: "fixed",
              left: 16,
              right: 16,
              bottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)",
              zIndex: 100,
              maxWidth: 460,
              margin: "0 auto",
              padding: "14px 16px",
              borderRadius: 14,
              background: photoToast.canUpgrade
                ? "linear-gradient(180deg, var(--v45-saffron, #C58A2E), var(--v45-terracotta, #9F4628))"
                : "var(--v45-emerald, #4F8E6E)",
              color: "#FFFFFF",
              boxShadow: "0 12px 32px rgba(43,31,21,0.22)",
              cursor: "pointer",
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              animation: "bmd-toast-in 0.32s cubic-bezier(0.22,0.61,0.36,1)",
            }}
          >
            <Icon
              name={photoToast.canUpgrade ? "lock" : "check"}
              size={20}
              strokeWidth={2}
              color="currentColor"
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.3 }}>
                {photoToast.canUpgrade
                  ? t("profile.photoToast.freeTitle")
                  : t("profile.photoToast.paidTitle")}
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  marginTop: 3,
                  lineHeight: 1.45,
                  opacity: 0.95,
                }}
              >
                {photoToast.canUpgrade
                  ? t("profile.photoToast.freeBody")
                  : t("profile.photoToast.paidBody")}
              </div>
              {photoToast.canUpgrade && (
                <Link
                  href="/dashboard/plans"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    display: "inline-block",
                    marginTop: 8,
                    padding: "6px 12px",
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.22)",
                    color: "#FFFFFF",
                    fontSize: 12.5,
                    fontWeight: 700,
                    textDecoration: "none",
                    border: "1px solid rgba(255,255,255,0.35)",
                  }}
                >
                  {t("profile.photoToast.upgradeCta")}
                </Link>
              )}
            </div>
            <style jsx>{`
              @keyframes bmd-toast-in {
                from {
                  transform: translateY(20px);
                  opacity: 0;
                }
                to {
                  transform: translateY(0);
                  opacity: 1;
                }
              }
            `}</style>
          </div>,
          document.body,
        )}

      {/* Spacer dynamique = pousse les sections sous le hero fixed. */}
      {isMobile && !arrivedViaShortcut && (
        <div
          aria-hidden
          style={{
            // V74.9 — Compense exactement la hauteur du hero fixed.
            // Valeur PURE (plus aucune soustraction env(safe-area)) car
            // env(safe-area-inset-top) varie sur iOS Safari quand l'URL
            // bar apparaît/disparaît, ce qui faisait bouger le contenu
            // sous le hero pendant le scroll. Maintenant le spacer est
            // strictement égal au hero → ZÉRO mouvement au scroll.
            height: `${heroBlockHeight}px`,
            flexShrink: 0,
          }}
        />
      )}

      {/* Conteneur des cards. En mobile, on ajoute un padding horizontal
          pour que les cards ne touchent pas les bords (dans le shell
          mobile elles ont déjà 16px de marge auto). En desktop, le
          DesktopShell fournit déjà max-width et padding. */}
      <div style={{ padding: isMobile ? "0 16px 24px" : 0 }}>

      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      {/* === Profil === (DESKTOP : card classique ; MOBILE : tile dans la
          grille plus bas qui ouvre un BottomSheet) */}
      {!isMobile && (
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
              aria-label="Annuler"
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
            >
              {/* V52.C2 — SVG remplace EMOJI */}
              <Icon name="x" size={14} strokeWidth={1.8} />
            </button>
          )}
        </div>

        {!editingProfile ? (
          <div className="list">
            <div className="list-item">
              {/* V101 — Input file caché dédié au upload photo desktop.
                  Le ref mobile (heroPhotoInputRef) est confiné dans le
                  portail mobileHero (rendu seulement quand isMobile) →
                  inutilisable sur web. Ce 2ᵉ input garantit le upload sur
                  desktop, et partage la même fonction `handleHeroPhoto`. */}
              <input
                ref={desktopPhotoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleHeroPhoto(f);
                  e.target.value = "";
                }}
              />
              {/* V101 — Avatar cliquable : ouvre le picker fichier au clic.
                  Si photo → l'affiche en cover. Sinon → initiale saffron.
                  Petit badge appareil-photo en bas à droite (signal d'affordance). */}
              <button
                type="button"
                onClick={() => desktopPhotoInputRef.current?.click()}
                aria-label={
                  t("profile.changePhoto") || "Changer la photo de profil"
                }
                disabled={heroPhotoSaving}
                style={{
                  position: "relative",
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  padding: 0,
                  border: "none",
                  cursor: heroPhotoSaving ? "wait" : "pointer",
                  background: heroPhoto
                    ? `url(${heroPhoto}) center/cover no-repeat`
                    : "linear-gradient(135deg,var(--saffron),var(--terracotta))",
                  color: "#16111e",
                  fontSize: 18,
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "inherit",
                  flexShrink: 0,
                  boxShadow:
                    "0 4px 10px rgba(197,138,46,0.18), 0 1px 3px rgba(43,31,21,0.10)",
                  opacity: heroPhotoSaving ? 0.7 : 1,
                  touchAction: "manipulation",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                {!heroPhoto && user.displayName.charAt(0).toUpperCase()}
                {/* Badge caméra — signale que l'avatar est cliquable */}
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    right: -2,
                    bottom: -2,
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background:
                      "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--v45-terracotta, #9F4628))",
                    border: "2px solid var(--paper, #FFFFFF)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#FFFFFF",
                    boxShadow: "0 1px 3px rgba(43,31,21,0.18)",
                  }}
                >
                  <Icon name="camera" size={10} strokeWidth={2.2} />
                </span>
              </button>
              <div className="text">
                <div className="name">{user.displayName}</div>
                <div className="meta">
                  {heroPhotoSaving
                    ? t("profile.uploadingPhoto") || "Mise à jour de la photo…"
                    : heroPhoto
                      ? t("profile.changePhotoHint") ||
                        "Clique sur la photo pour la changer"
                      : t("profile.addPhotoHint") ||
                        "Clique pour ajouter une photo"}
                </div>
              </div>
            </div>
            <div className="list-item">
              <div className="icon" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                {/* V52.C2 — SVG remplace EMOJI */}
                <Icon name="repeat" size={18} strokeWidth={1.6} color="currentColor" />
              </div>
              <div className="text">
                <div className="name">{user.defaultCurrency}</div>
                <div className="meta">{t("dashboard.defaultCurrency")}</div>
              </div>
            </div>
            <div className="list-item">
              <div className="icon" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                {/* V52.C2 — SVG remplace EMOJI */}
                <Icon name="globe" size={18} strokeWidth={1.6} color="currentColor" />
              </div>
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
              {/* V52.C2 — SVG remplace EMOJI : on retire le pictogramme inline (texte seul + Icon via wrapper si besoin) */}
              {savingProfile ? "Enregistrement…" : "Enregistrer"}
            </button>
          </>
        )}
      </div>
      )}

      {/* === Contacts === (DESKTOP only, tile sur mobile) */}
      {!isMobile && (
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
              <div className="icon" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                {/* V52.C2 — SVG remplace EMOJI */}
                <Icon name={c.type === "PHONE" ? "phone" : "mail"} size={16} strokeWidth={1.6} color="currentColor" />
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
                          style={{ color: "var(--saffron, #e8a33d)", display: "inline-flex", alignItems: "center", gap: 4 }}
                          title={t("profile.staleVerificationHint")}
                        >
                          {/* V52.C2 — SVG remplace EMOJI */}
                          <Icon name="alert-triangle" size={11} strokeWidth={1.6} />
                          Vérification &gt; 6 mois
                        </span>
                      ) : (
                        <>{t("profile.verified")}</>
                      )}
                      {c.verifiedAt &&
                        ` · ${new Date(c.verifiedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" })}`}
                    </>
                  ) : (
                    <span style={{ color: "var(--rose, #d9714a)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {/* V52.C2 — SVG remplace EMOJI */}
                      <Icon name="alert-triangle" size={11} strokeWidth={1.6} />
                      Non vérifié
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
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                title={t("common.delete")}
                aria-label={t("common.delete")}
              >
                {/* V52.C2 — SVG remplace EMOJI */}
                <Icon name="x" size={14} strokeWidth={1.8} />
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
                      {reverifyBusy ? (
                        "…"
                      ) : (
                        /* V52.C2 — SVG remplace EMOJI */
                        <Icon name="check" size={14} strokeWidth={2} />
                      )}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => {
                        setReverifyingContactId(null);
                        setReverifyOtpCode("");
                      }}
                      aria-label="Annuler"
                      style={{ padding: "10px 12px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                    >
                      {/* V52.C2 — SVG remplace EMOJI */}
                      <Icon name="x" size={14} strokeWidth={1.8} />
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
                aria-label="Annuler"
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
              >
                {/* V52.C2 — SVG remplace EMOJI */}
                <Icon name="x" size={14} strokeWidth={1.8} />
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
                    {/* V52.C2 — SVG remplace EMOJI : options HTML ne peuvent pas contenir SVG, on garde texte seul */}
                    <option value="PHONE">Téléphone</option>
                    <option value="EMAIL">Email</option>
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
                  {/* V52.C2 — SVG remplace EMOJI */}
                  {adding ? "Envoi…" : "Envoyer un code"}
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
      )}

      {/* === Console admin (visible uniquement si super admin + viewport
          desktop). La console est DESKTOP-ONLY : tableaux denses, éditeurs
          de plans, charts → pas utilisable en mobile. On masque entièrement
          le lien sur petit écran pour ne pas créer de fausse promesse UX. */}
      {user.isSuperAdmin && !isMobile && (
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

      {/* === Sécurité === (DESKTOP ONLY — sur mobile la déconnexion est
          en bas de page dans la version épurée, et tout ce qui touche la
          sécurité passe par la ProfileSection "Sécurité") */}
      {!isMobile && (
        <div className="card">
          <div className="card-head">
            <h2 style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              {/* V52.C2 — SVG remplace EMOJI */}
              <Icon name="lock" size={18} strokeWidth={1.6} />
              Sécurité
            </h2>
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
      )}

      {/* === Légal === (DESKTOP ONLY — sur mobile dans la section "Données &
          confidentialité" via le bloc GdprBlock) */}
      {!isMobile && (
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
      )}

      {/* ========================================================
          STRUCTURE MOBILE-FIRST : 4 ZONES
          ========================================================
          1. ALERTES (toujours visibles, in-your-face)
             - SimSwapAlerts (alerte sécu si SIM swap suspect)
             - IosInstallNotice (push PWA invite pour iOS)
          2. EN-COURS (visible par défaut)
             - PlanBlock (forfait + CTA upgrade)
          3. SECTIONS PLIABLES (1 tap pour ouvrir)
             - Sécurité (passkeys + 2FA + sessions)
             - Notifications (push)
             - Paiements (moyens enregistrés)
             - Avantages (promo / parrainage)
             - Données & confidentialité (GDPR)
          ======================================================== */}

      {/* === Zone ALERTES — pas pliable, visible immédiatement === */}
      <SimSwapAlerts />
      <IosInstallNotice />

      {/* === Zone EN-COURS — forfait toujours visible (CTA upgrade) === */}
      <PlanBlock />

      {/* ========================================================
          MOBILE · GRILLE DE TILES « ONE-SCREEN BANKING APP »
          ========================================================
          Au lieu d'empiler les ProfileSection en accordéon vertical (qui
          forçait beaucoup de scroll), on présente toutes les sections en
          grille 2 colonnes de tiles tappables. Chaque tap ouvre un
          BottomSheet avec le contenu détaillé de la section.
          → 1 seul viewport visible, navigation intuitive (Revolut/Wise style)
       */}
      {isMobile ? (
        /* V74 — Refonte maquette V45 : 4 sections groupées (Sécurité /
           Préférences / Compte / Déconnexion isolée plus bas) avec headers
           uppercase saffron en lieu et place de la grille 2-col uniforme.
           Chaque section a son propre header sticky-feel + sa grille. */
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            marginTop: 4,
          }}
        >
          {/* ===== SÉCURITÉ ===== */}
          <section>
            <SectionHeader
              label={t("profile.section.security") || "Sécurité"}
              hint="Passkeys, 2FA, sessions"
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
              }}
            >
              <MobileTile
                iconKey="shield"
                label={t("profile.section.security") || "Sécurité"}
                sub={
                  t("profile.section.securitySubtitle") ||
                  "Passkey, 2FA, sessions"
                }
                onClick={() => setOpenTile("security")}
              />
              <MobileTile
                iconKey="lock"
                label={t("profile.section.privacy") || "Confidentialité"}
                sub={
                  t("profile.section.privacySubtitle") || "RGPD, export, suppr."
                }
                onClick={() => setOpenTile("privacy")}
              />
            </div>
          </section>

          {/* ===== PRÉFÉRENCES ===== */}
          <section>
            <SectionHeader
              label={t("profile.section.preferences") || "Préférences"}
              hint="Devise, langue, notifications"
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
              }}
            >
              <MobileTile
                iconKey="globe"
                label={t("profile.section.preferences") || "Préférences"}
                sub={`${user.defaultCurrency} · ${user.defaultLocale?.toUpperCase()}`}
                onClick={() => setOpenTile("preferences")}
              />
              <MobileTile
                iconKey="bell"
                label={t("profile.section.notifications") || "Notifications"}
                sub={
                  t("profile.section.notificationsSubtitle") ||
                  "Push, email, SMS"
                }
                onClick={() => setOpenTile("notifications")}
              />
            </div>
          </section>

          {/* ===== COMPTE ===== */}
          <section>
            <SectionHeader
              label={t("profile.section.account") || "Compte"}
              hint="Identité, contacts, paiements"
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
              }}
            >
              <MobileTile
                iconKey="user"
                label={t("profile.section.account") || "Identité"}
                sub={user.displayName}
                onClick={() => setOpenTile("identity")}
              />
              <MobileTile
                iconKey="mail"
                label={t("profile.section.contacts") || "Contacts"}
                sub={`${user.contacts.length} ${user.contacts.length > 1 ? "vérifiés" : "vérifié"}`}
                onClick={() => setOpenTile("contacts")}
              />
              <MobileTile
                iconKey="card"
                label={t("profile.section.payments") || "Paiements"}
                sub={
                  t("profile.section.paymentsSubtitle") || "Cartes, IBAN, Stripe"
                }
                onClick={() => setOpenTile("payments")}
              />
              <MobileTile
                iconKey="gift"
                label={t("profile.section.rewards") || "Récompenses"}
                sub={
                  t("profile.section.rewardsSubtitle") || "Parrainage, crédit"
                }
                onClick={() => setOpenTile("rewards")}
                accent
              />
            </div>
          </section>
        </div>
      ) : (
        /* === Desktop : affichage classique en pile complète === */
        <>
          <PasskeyManager />
          <TwoFactorBlock />
          <SessionsBlock />
          <PushNotifBlock />
          <PaymentMethodsBlock />
          <PromoBlock />
          <GdprBlock />
        </>
      )}

      {/* === BottomSheet : contenu de la tile sélectionnée ===
          V38 — On wrappe la sheet dans un div `visibility: visible` pour
          contrer le `visibility: hidden` appliqué au wrapper parent quand
          on arrive via shortcut (le contenu profil reste invisible mais
          la sheet, elle, reste 100% visible). */}
      {isMobile && openTile && (
        <div style={{ visibility: "visible" }}>
        <BottomSheet
          open
          onClose={closeTile}
          title={mobileTileTitle(openTile, t)}
        >
          {openTile === "identity" && (
            <MobileIdentitySheet
              user={user}
              setUser={setUser}
              displayName={displayName}
              setDisplayName={setDisplayName}
              defaultCurrency={defaultCurrency}
              setDefaultCurrency={setDefaultCurrency}
              defaultLocale={defaultLocale}
              setDefaultLocale={setDefaultLocale}
              availableCurrencies={availableCurrencies}
              availableLocales={availableLocales}
              editingProfile={editingProfile}
              setEditingProfile={setEditingProfile}
              savingProfile={savingProfile}
              onSave={saveProfile}
              t={t}
            />
          )}
          {openTile === "contacts" && (
            <p
              style={{
                fontSize: 13,
                color: "var(--cream-soft)",
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              {/* Pour MVP, on redirige vers la version desktop si l'utilisateur
                  veut ajouter/vérifier un contact en mobile. La gestion fine
                  des contacts (add + verify OTP) sera migrée en BottomSheet
                  dans une prochaine itération. */}
              {user.contacts.map((c: any) => (
                <span
                  key={c.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 0",
                    borderBottom: "1px solid rgba(244,228,193,0.08)",
                  }}
                >
                  <span style={{ fontSize: 22 }}>
                    {c.type === "PHONE" ? "📞" : "✉️"}
                  </span>
                  <span style={{ flex: 1, fontSize: 14 }}>{c.value}</span>
                  {c.isPrimary && (
                    <span
                      style={{
                        fontSize: 9,
                        padding: "3px 8px",
                        borderRadius: 999,
                        background: "var(--saffron)",
                        color: "#16111E",
                        fontWeight: 800,
                        letterSpacing: 0.6,
                      }}
                    >
                      ★ PRIMAIRE
                    </span>
                  )}
                </span>
              ))}
              <span
                style={{
                  display: "block",
                  fontSize: 11,
                  color: "var(--muted)",
                  marginTop: 14,
                  fontStyle: "italic",
                }}
              >
                {/* V52.C2 — SVG remplace EMOJI : on retire 💡 inline (texte clair suffit) */}
                Pour ajouter / vérifier un contact, ouvre BMD sur ton
                ordinateur.
              </span>
            </p>
          )}
          {openTile === "security" && (
            <>
              <PasskeyManager />
              <TwoFactorBlock />
              <SessionsBlock />
            </>
          )}
          {openTile === "notifications" && <PushNotifBlock />}
          {openTile === "payments" && <PaymentMethodsBlock />}
          {openTile === "rewards" && <PromoBlock />}
          {openTile === "preferences" && (
            <>
              <div style={{ marginBottom: 14 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 10,
                    color: "var(--saffron)",
                    fontWeight: 700,
                    marginBottom: 8,
                    textTransform: "uppercase",
                    letterSpacing: 1.4,
                  }}
                >
                  {t("profile.preferredLang")}
                </label>
                <SharedLangPicker
                  locale={user.defaultLocale}
                  variant="inline"
                  onChange={async (code) => {
                    setDefaultLocale(code);
                    try {
                      await api.updateMe({ defaultLocale: code });
                      await applyLocaleGlobal(code);
                      const me = await api.me();
                      setUser(me.user);
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 4px",
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    color: "var(--cream)",
                    fontWeight: 600,
                  }}
                >
                  Thème
                </span>
                <ThemeToggle variant="ghost" />
              </div>
            </>
          )}
          {openTile === "privacy" && <GdprBlock />}
        </BottomSheet>
        </div>
      )}

      {/* V74 — Section déconnexion ISOLÉE (header dédié + card danger).
          Plus de mini-pill discret : la déconnexion mérite son propre
          encart pour éviter les taps accidentels au milieu des autres
          actions de la page. */}
      {isMobile && (
        <div
          style={{
            marginTop: 18,
            marginBottom: 28,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <SectionHeader
            label={t("profile.section.session") || "Session"}
            hint="Déconnexion"
            danger
          />
          <button
            type="button"
            onClick={logout}
            style={{
              padding: "14px 18px",
              background: "rgba(159,42,36,0.06)",
              color: "var(--v45-terracotta, #9F4628)",
              border: "1px solid rgba(159,42,36,0.25)",
              borderRadius: 14,
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
              transition: "background 160ms ease, transform 120ms ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              minHeight: 52,
            }}
          >
            <Icon name="log-out" size={18} strokeWidth={1.7} color="currentColor" />
            <span>{t("profile.signOut") || "Se déconnecter"}</span>
          </button>

          {/* Lien privacy + version BMD en pied — discret, espacement aéré */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              marginTop: 6,
            }}
          >
            <Link
              href="/legal/privacy"
              style={{
                fontSize: 11,
                color: "var(--cocoa-soft, var(--muted))",
                textDecoration: "none",
                padding: 6,
                touchAction: "manipulation",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Icon name="shield" size={11} strokeWidth={1.6} />
              {t("profile.privacyPolicy") || "Politique de confidentialité"}
            </Link>
            <div
              style={{
                fontSize: 10,
                color: "var(--cocoa-mute, var(--muted))",
                opacity: 0.7,
                letterSpacing: 0.5,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              BMD · v{process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0"}
            </div>
          </div>
        </div>
      )}

      {/* === BOUTON DE DÉCONNEXION proéminent — DESKTOP only ===
          Sur mobile, on a déjà un mini pill discret dans le footer plus haut.
          Sur desktop, on garde le gros bouton avec encart rouge subtil pour
          que l'utilisateur le trouve toujours rapidement. */}
      {!isMobile && (
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
      )}
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
  /**
   * Liste pliée par défaut : sur mobile (et même desktop) la liste des
   * sessions actives n'est consultée que ponctuellement. On garde l'en-tête
   * visible (avec le compteur) et l'utilisateur tape pour déplier.
   */
  const [expanded, setExpanded] = useState(false);

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
      {/* Header tappable — toggle expand/collapse.
          Cible tactile pleine largeur, chevron visuel à droite, compteur
          visible dans tous les états. */}
      <button
        type="button"
        onClick={() => {
          setExpanded((v) => !v);
          if (typeof navigator !== "undefined" && navigator.vibrate) {
            try { navigator.vibrate(6); } catch { /* ignore */ }
          }
        }}
        aria-expanded={expanded}
        aria-controls="bmd-sessions-list"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          width: "100%",
          background: "transparent",
          border: "none",
          padding: "4px 0",
          margin: 0,
          color: "inherit",
          textAlign: "left",
          cursor: "pointer",
          minHeight: 44,
          fontFamily: "inherit",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <h2 style={{ margin: 0, flex: 1, minWidth: 0 }}>
          {t("profile.activeSessionsTitle")}
        </h2>
        <span
          className="muted"
          style={{
            fontSize: 11,
            padding: "2px 8px",
            borderRadius: 999,
            background: "rgba(232,163,61,0.10)",
            color: "var(--saffron, #E8A33D)",
            fontWeight: 600,
            minWidth: 22,
            textAlign: "center",
          }}
        >
          {sessions.length}
        </span>
        <span
          aria-hidden
          style={{
            fontSize: 14,
            color: "var(--cream-soft, #E8D5B7)",
            transition: "transform 0.2s ease",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            display: "inline-block",
            width: 16,
            textAlign: "center",
          }}
        >
          ▸
        </span>
      </button>

      {expanded && (
        <>
          <p
            className="muted"
            style={{
              fontSize: 12,
              margin: "10px 0",
              lineHeight: 1.5,
            }}
          >
            {t("profile.activeSessionsDescription")}
          </p>
          <div className="list" id="bmd-sessions-list">
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
        </>
      )}
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

/* ================================================================
   ProfileSection — section collapsible mobile-first
   ================================================================
   Pattern : header tappable (titre + icône + chevron rotatif),
   contenu replié par défaut, haptic au toggle, animation chevron.
   On utilise pas <details> natif pour pouvoir contrôler haptic
   et le style à 100 %. */
function ProfileSection({
  icon,
  title,
  subtitle,
  defaultOpen = false,
  badge,
  children,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  /** Petit pill optionnel à droite du titre (ex: "Premium", "2/3") */
  badge?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  function toggle() {
    try {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        (navigator as any).vibrate(6);
      }
    } catch {
      /* ignore */
    }
    setOpen((v) => !v);
  }

  return (
    <div
      style={{
        background: "var(--overlay-2, rgba(255,255,255,0.04))",
        border: "1px solid rgba(244,228,193,0.08)",
        borderRadius: 16,
        marginBottom: 12,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        style={{
          width: "100%",
          padding: "16px 16px",
          background: "transparent",
          border: "none",
          color: "var(--cream)",
          fontFamily: "inherit",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 14,
          textAlign: "left",
          minHeight: 64,
          WebkitTapHighlightColor: "transparent",
          touchAction: "manipulation",
        }}
      >
        <div
          aria-hidden
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background:
              "linear-gradient(135deg, rgba(232,163,61,0.18), rgba(181,70,46,0.08))",
            border: "1px solid rgba(232,163,61,0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "var(--cream)",
              lineHeight: 1.2,
              overflowWrap: "anywhere",
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div
              style={{
                fontSize: 12,
                color: "var(--cream-soft, #d4c4a8)",
                marginTop: 2,
                lineHeight: 1.4,
                overflowWrap: "anywhere",
              }}
            >
              {subtitle}
            </div>
          )}
        </div>
        {badge && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              color: "#16111E",
              background:
                "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))",
              padding: "4px 9px",
              borderRadius: 999,
              flexShrink: 0,
            }}
          >
            {badge}
          </span>
        )}
        <span
          aria-hidden
          style={{
            color: "var(--saffron, #e8a33d)",
            transition: "transform 0.2s ease",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            flexShrink: 0,
            marginLeft: 4,
            display: "inline-flex",
          }}
        >
          {/* V52.C2 — SVG remplace EMOJI (› chevron) */}
          <Icon name="chevron-right" size={18} strokeWidth={1.6} />
        </span>
      </button>
      {open && (
        <div
          style={{
            padding: "0 14px 14px",
            animation: "profileSectionFade 0.2s ease-out",
          }}
        >
          {children}
        </div>
      )}
      <style jsx>{`
        @keyframes profileSectionFade {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

/* ================================================================
   MobileTile — élément de la grille profil mobile (one-screen banking)
   ================================================================
   Card compacte tappable : icon + label + sub-label + chevron.
   Sur tap, on appelle `onClick` (qui ouvre un BottomSheet dans le parent).
   Si `accent: true` → léger gradient saffron pour mettre en avant
   (utilisé sur "Avantages" car c'est un teaser revenu / monétisation).
*/
/** Icône SVG outlined minimaliste pour les tiles du profil mobile.
 *  Style banking — pas d'emojis envahissants, juste un trait fin saffron. */
function TileIcon({ name }: { name: string }) {
  const stroke = "currentColor";
  const sw = 1.7;
  const paths: Record<string, React.ReactNode> = {
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-1a6 6 0 016-6h4a6 6 0 016 6v1" />
      </>
    ),
    mail: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 7l9 6 9-6" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z" />
        <path d="M9 12l2 2 4-4" />
      </>
    ),
    bell: (
      <>
        <path d="M6 8a6 6 0 0112 0v5l1.5 3h-15L6 13V8z" />
        <path d="M10 19a2 2 0 004 0" />
      </>
    ),
    card: (
      <>
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M3 10h18M7 15h3" />
      </>
    ),
    gift: (
      <>
        <rect x="3" y="9" width="18" height="11" rx="1" />
        <path d="M12 9v11M3 13h18M8 9a3 3 0 010-6c2 0 4 3 4 6 0-3 2-6 4-6a3 3 0 010 6" />
      </>
    ),
    globe: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V8a4 4 0 018 0v3" />
      </>
    ),
  };
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {paths[name] ?? paths.user}
    </svg>
  );
}

/**
 * V74 — Header de section pour grouper les MobileTile.
 *
 * Style maquette V45 : libellé uppercase saffron 11px letter-spacing 1.6,
 * trait fin sand à droite, hint optionnel en cocoa-mute à droite.
 * `danger=true` colore en terracotta pour la section Déconnexion isolée.
 */
function SectionHeader({
  label,
  hint,
  danger,
}: {
  label: string;
  hint?: string;
  danger?: boolean;
}) {
  const accent = danger
    ? "var(--v45-terracotta, #9F4628)"
    : "var(--v45-saffron, #C58A2E)";
  // V88.C2 — `<h2>` au lieu de `<span>` pour a11y (lecteurs d'écran +
  // tests Playwright `getByRole("heading")`). Le style visuel est préservé
  // via reset des marges/poids natifs du h2.
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "4px 4px 8px",
      }}
    >
      <h2
        style={{
          fontSize: 10.5,
          color: accent,
          letterSpacing: 1.5,
          textTransform: "uppercase",
          fontWeight: 800,
          flexShrink: 0,
          margin: 0,
          lineHeight: 1.2,
          fontFamily: "inherit",
        }}
      >
        {label}
      </h2>
      <span
        aria-hidden
        style={{
          flex: 1,
          height: 1,
          background:
            "linear-gradient(90deg, var(--v45-line, rgba(43,31,21,0.10)) 0%, transparent 100%)",
        }}
      />
      {hint && (
        <span
          style={{
            fontSize: 10.5,
            color: "var(--cocoa-mute, var(--muted))",
            opacity: 0.85,
            flexShrink: 0,
          }}
        >
          {hint}
        </span>
      )}
    </div>
  );
}

function MobileTile({
  iconKey,
  label,
  sub,
  onClick,
  accent,
}: {
  iconKey: string;
  label: string;
  sub?: string;
  onClick: () => void;
  accent?: boolean;
}) {
  function buzz() {
    try {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        (navigator as any).vibrate(6);
      }
    } catch {
      /* ignore */
    }
  }
  return (
    <button
      type="button"
      onClick={() => {
        buzz();
        onClick();
      }}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 4,
        padding: "14px 14px 12px",
        minHeight: 96,
        background: accent
          ? "linear-gradient(135deg, rgba(232,163,61,0.14), rgba(181,70,46,0.06))"
          : "rgba(244,228,193,0.04)",
        border: accent
          ? "1px solid rgba(232,163,61,0.30)"
          : "1px solid rgba(244,228,193,0.08)",
        borderRadius: 16,
        color: "var(--cream)",
        fontFamily: "inherit",
        cursor: "pointer",
        textAlign: "left",
        WebkitTapHighlightColor: "transparent",
        touchAction: "manipulation",
        transition: "transform 0.05s ease, background 0.15s ease",
      }}
      onTouchStart={(e) => {
        e.currentTarget.style.transform = "scale(0.97)";
      }}
      onTouchEnd={(e) => {
        e.currentTarget.style.transform = "scale(1)";
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 36,
            height: 36,
            borderRadius: 11,
            background: accent
              ? "rgba(232,163,61,0.18)"
              : "rgba(232,163,61,0.10)",
            border: accent
              ? "1px solid rgba(232,163,61,0.32)"
              : "1px solid rgba(232,163,61,0.18)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--saffron)",
          }}
        >
          <TileIcon name={iconKey} />
        </span>
        <span
          aria-hidden
          style={{
            color: "var(--saffron)",
            opacity: 0.5,
            display: "inline-flex",
          }}
        >
          {/* V52.C2 — SVG remplace EMOJI (› chevron) */}
          <Icon name="chevron-right" size={15} strokeWidth={1.6} />
        </span>
      </div>
      <div style={{ width: "100%", minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "var(--cream)",
            lineHeight: 1.2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </div>
        {sub && (
          <div
            style={{
              fontSize: 10.5,
              color: "var(--cream-soft, #d4c4a8)",
              marginTop: 2,
              lineHeight: 1.3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {sub}
          </div>
        )}
      </div>
    </button>
  );
}

/** Retourne le titre du BottomSheet selon la tile sélectionnée */
function mobileTileTitle(
  tile: string,
  t: (key: any, vars?: Record<string, string>) => string,
): string {
  switch (tile) {
    case "identity":
      return t("profile.identity");
    case "contacts":
      return t("profile.contactsVerifiedTitle");
    case "security":
      return t("profile.section.security");
    case "notifications":
      return t("profile.section.notifications");
    case "payments":
      return t("profile.section.payments");
    case "rewards":
      return t("profile.section.rewards");
    case "preferences":
      return t("profile.section.preferences") || "Préférences";
    case "privacy":
      return t("profile.section.privacy");
    default:
      return "";
  }
}

/** BottomSheet content : édition du nom + devise + langue */
function MobileIdentitySheet({
  user,
  setUser,
  displayName,
  setDisplayName,
  defaultCurrency,
  setDefaultCurrency,
  defaultLocale,
  setDefaultLocale,
  availableCurrencies,
  availableLocales,
  editingProfile,
  setEditingProfile,
  savingProfile,
  onSave,
  t,
}: {
  user: any;
  setUser: (u: any) => void;
  displayName: string;
  setDisplayName: (v: string) => void;
  defaultCurrency: string;
  setDefaultCurrency: (v: string) => void;
  defaultLocale: string;
  setDefaultLocale: (v: string) => void;
  availableCurrencies: Array<{
    code: string;
    name: string;
    symbol: string;
    flag: string | null;
  }>;
  availableLocales: Array<{ code: string; name: string; flag: string }>;
  editingProfile: boolean;
  setEditingProfile: (v: boolean) => void;
  savingProfile: boolean;
  onSave: () => void;
  t: (k: any, vars?: Record<string, string>) => string;
}) {
  // V37 — Photo de profil SYNCED côté serveur.
  // Priorité d'affichage : user.avatar (serveur, cross-device) > localStorage
  // (fallback offline / déconnecté).
  // À l'upload : on compresse via canvas (max 512×512 + qualité 0.85) pour
  // que la data URL fasse < 500 Ko avant l'envoi. Stocké en localStorage en
  // cache + PATCH /auth/me { avatar }.
  const [localPhoto, setLocalPhoto] = useState<string | null>(null);
  const photoFileRef = useRef<HTMLInputElement | null>(null);
  const [photoSaving, setPhotoSaving] = useState(false);
  useEffect(() => {
    // Priorité 1 : user.avatar du serveur
    if (user?.avatar) {
      setLocalPhoto(user.avatar);
      try {
        window.localStorage.setItem("bmd_profile_photo_v1", user.avatar);
      } catch {
        /* ignore quota errors */
      }
      return;
    }
    // Priorité 2 : localStorage (fallback hors-ligne)
    try {
      const p = window.localStorage.getItem("bmd_profile_photo_v1");
      if (p) setLocalPhoto(p);
    } catch {
      /* ignore */
    }
  }, [user?.avatar]);

  /**
   * Redimensionne et compresse une image File en data URL.
   * - Côté long limité à 512px (suffisant pour avatar)
   * - JPEG qualité 0.85 (compromis poids/qualité)
   * - Garde le ratio d'origine
   */
  async function compressImage(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const MAX_SIDE = 512;
          let { width, height } = img;
          if (width > height && width > MAX_SIDE) {
            height = Math.round((height * MAX_SIDE) / width);
            width = MAX_SIDE;
          } else if (height >= width && height > MAX_SIDE) {
            width = Math.round((width * MAX_SIDE) / height);
            height = MAX_SIDE;
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Canvas non supporté"));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
          resolve(dataUrl);
        };
        img.src = String(reader.result ?? "");
      };
      reader.readAsDataURL(file);
    });
  }

  async function handlePhotoFile(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      window.alert("Photo trop lourde (max 10 Mo en source).");
      return;
    }
    setPhotoSaving(true);
    try {
      const dataUrl = await compressImage(file);
      // Sync serveur d'abord (source de vérité)
      try {
        await api.updateMe({ avatar: dataUrl });
      } catch (e) {
        // Si l'API échoue (offline ou erreur), on garde quand même la photo
        // en local — l'user verra son avatar mais elle ne sera pas synced.
        // eslint-disable-next-line no-console
        console.warn("[photo] sync serveur échouée, fallback local:", e);
      }
      // Cache localStorage
      try {
        window.localStorage.setItem("bmd_profile_photo_v1", dataUrl);
      } catch {
        /* quota dépassé — pas grave si serveur sync OK */
      }
      setLocalPhoto(dataUrl);
      // Refresh user (pour récup avatar du serveur)
      try {
        const me = await api.me();
        setUser(me.user);
      } catch {
        /* ignore */
      }
      window.dispatchEvent(new Event("bmd:profile-photo"));
    } catch (e) {
      window.alert(
        `Impossible de traiter la photo: ${(e as Error).message ?? "erreur inconnue"}`,
      );
    } finally {
      setPhotoSaving(false);
    }
  }

  async function removePhoto() {
    setPhotoSaving(true);
    try {
      try {
        await api.updateMe({ avatar: null });
      } catch {
        /* ignore — on retire au moins du local */
      }
      try {
        window.localStorage.removeItem("bmd_profile_photo_v1");
      } catch {
        /* ignore */
      }
      setLocalPhoto(null);
      try {
        const me = await api.me();
        setUser(me.user);
      } catch {
        /* ignore */
      }
      window.dispatchEvent(new Event("bmd:profile-photo"));
    } finally {
      setPhotoSaving(false);
    }
  }

  if (!editingProfile) {
    return (
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: localPhoto
                ? `url(${localPhoto}) center/cover no-repeat`
                : "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#16111E",
              fontSize: 22,
              fontWeight: 800,
              fontFamily: "Cormorant Garamond, serif",
              flexShrink: 0,
              border: localPhoto
                ? "1.5px solid rgba(232,163,61,0.4)"
                : "none",
              overflow: "hidden",
            }}
          >
            {!localPhoto && (user.displayName?.charAt(0).toUpperCase() ?? "?")}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: "Cormorant Garamond, serif",
                fontSize: 20,
                fontWeight: 700,
                color: "var(--cream)",
                lineHeight: 1.1,
                overflowWrap: "anywhere",
              }}
            >
              {user.displayName}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--cream-soft)",
                marginTop: 4,
                letterSpacing: 0.4,
              }}
            >
              {user.defaultCurrency} ·{" "}
              {user.defaultLocale?.toUpperCase()}
            </div>
          </div>
        </div>
        {/* Bouton modifier identité */}
        <button
          type="button"
          onClick={() => setEditingProfile(true)}
          style={{
            width: "100%",
            padding: 14,
            background:
              "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))",
            color: "#16111E",
            border: "none",
            borderRadius: 999,
            fontSize: 14,
            fontWeight: 800,
            cursor: "pointer",
            fontFamily: "inherit",
            minHeight: 52,
            touchAction: "manipulation",
            marginBottom: 10,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {/* V52.C2 — SVG remplace EMOJI */}
          <Icon name="pencil" size={14} strokeWidth={1.6} />
          {t("profile.editIdentity")}
        </button>

        {/* Boutons photo de profil */}
        <input
          ref={photoFileRef}
          type="file"
          accept="image/png, image/jpeg, image/webp"
          capture="user"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handlePhotoFile(f);
            if (photoFileRef.current) photoFileRef.current.value = "";
          }}
          style={{ display: "none" }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => photoFileRef.current?.click()}
            disabled={photoSaving}
            style={{
              flex: 1,
              padding: "12px 14px",
              background: "rgba(244,228,193,0.04)",
              color: "var(--cream)",
              border: "1px solid rgba(244,228,193,0.10)",
              borderRadius: 14,
              fontSize: 13,
              fontWeight: 600,
              cursor: photoSaving ? "wait" : "pointer",
              opacity: photoSaving ? 0.7 : 1,
              fontFamily: "inherit",
              minHeight: 46,
              touchAction: "manipulation",
            }}
          >
            {photoSaving
              ? "Enregistrement…"
              : localPhoto
                ? "Changer la photo"
                : "Ajouter une photo"}
          </button>
          {localPhoto && (
            <button
              type="button"
              onClick={removePhoto}
              disabled={photoSaving}
              aria-label="Supprimer la photo"
              style={{
                width: 46,
                height: 46,
                background: "rgba(217,113,74,0.10)",
                color: "#FFB89A",
                border: "1px solid rgba(217,113,74,0.30)",
                borderRadius: 14,
                cursor: photoSaving ? "wait" : "pointer",
                opacity: photoSaving ? 0.7 : 1,
                fontFamily: "inherit",
                touchAction: "manipulation",
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* V52.C2 — SVG remplace EMOJI */}
              <Icon name="x" size={16} strokeWidth={1.8} />
            </button>
          )}
        </div>
      </div>
    );
  }
  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <label
          style={{
            display: "block",
            fontSize: 10,
            color: "var(--saffron)",
            fontWeight: 700,
            marginBottom: 8,
            textTransform: "uppercase",
            letterSpacing: 1.4,
          }}
        >
          {t("profile.displayNameLabel")}
        </label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={t("profile.displayNameExample")}
          maxLength={60}
          autoFocus
          style={{
            width: "100%",
            padding: "14px 16px",
            borderRadius: 14,
            background: "rgba(244,228,193,0.05)",
            border: "1.5px solid rgba(244,228,193,0.12)",
            color: "var(--cream)",
            fontSize: 16,
            fontFamily: "inherit",
            boxSizing: "border-box",
            outline: "none",
            minHeight: 52,
          }}
        />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label
          style={{
            display: "block",
            fontSize: 10,
            color: "var(--saffron)",
            fontWeight: 700,
            marginBottom: 8,
            textTransform: "uppercase",
            letterSpacing: 1.4,
          }}
        >
          {t("dashboard.defaultCurrency")}
        </label>
        <select
          value={defaultCurrency}
          onChange={(e) => setDefaultCurrency(e.target.value)}
          style={{
            width: "100%",
            padding: "14px 16px",
            borderRadius: 14,
            color: "var(--cream)",
            fontSize: 15,
            fontFamily: "inherit",
            boxSizing: "border-box",
            minHeight: 52,
          }}
        >
          {availableCurrencies.map((c) => (
            <option key={c.code} value={c.code}>
              {c.flag ? `${c.flag} ` : ""}
              {c.code} — {c.name}
            </option>
          ))}
        </select>
      </div>
      <div style={{ marginBottom: 18 }}>
        <label
          style={{
            display: "block",
            fontSize: 10,
            color: "var(--saffron)",
            fontWeight: 700,
            marginBottom: 8,
            textTransform: "uppercase",
            letterSpacing: 1.4,
          }}
        >
          {t("profile.preferredLang")}
        </label>
        <SharedLangPicker
          locale={defaultLocale}
          variant="inline"
          onChange={(code) => setDefaultLocale(code)}
        />
      </div>
      <button
        type="button"
        onClick={onSave}
        disabled={!displayName.trim() || savingProfile}
        style={{
          width: "100%",
          padding: 16,
          background:
            !displayName.trim() || savingProfile
              ? "rgba(232,163,61,0.22)"
              : "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))",
          color:
            !displayName.trim() || savingProfile
              ? "rgba(22,17,30,0.55)"
              : "#16111E",
          border: "none",
          borderRadius: 999,
          fontSize: 14,
          fontWeight: 800,
          letterSpacing: 0.3,
          cursor:
            !displayName.trim() || savingProfile ? "not-allowed" : "pointer",
          minHeight: 56,
          fontFamily: "inherit",
          touchAction: "manipulation",
          marginBottom: 10,
        }}
      >
        {savingProfile ? "Enregistrement…" : "✓ Enregistrer"}
      </button>
      <button
        type="button"
        onClick={() => {
          setEditingProfile(false);
          setDisplayName(user.displayName);
          setDefaultCurrency(user.defaultCurrency);
          setDefaultLocale(user.defaultLocale);
        }}
        style={{
          width: "100%",
          padding: 12,
          background: "transparent",
          color: "var(--muted)",
          border: "none",
          fontSize: 13,
          fontWeight: 500,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        Annuler
      </button>
    </div>
  );
}
