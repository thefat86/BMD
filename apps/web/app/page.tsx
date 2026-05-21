"use client";

/**
 * Site vitrine BMD — multilingue (FR, EN, ES, PT, AR, SW).
 *
 * Design fidèle aux maquettes (BMD_portail_web.html, BMD_maquettes.html) :
 *  - Palette nuit (#0E0B14) + saffron (#E8A33D) + cream (#F4E4C1) + terracotta
 *  - Typo Cormorant Garamond (titres) + Inter (texte)
 *  - Logo BMD hexagonal en SVG
 *  - Browser-frame avec mocks de l'app
 *  - Sections rythmées par "kicker + h2" + filets dorés
 *
 * Comportement :
 *  - Pas de redirect auto vers /dashboard : la home est TOUJOURS accessible
 *    (sinon "se déconnecter" ne pourrait pas y revenir naturellement)
 *  - Bouton "Mon espace" si connecté, "Se connecter" sinon
 *  - Sélecteur de langue persisté + RTL pour l'arabe
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, getToken } from "../lib/api-client";
import {
  AFRICAN_LOCALES,
  ARABIC_LOCALES,
  ASIAN_LOCALES,
  detectLocale,
  EUROPEAN_LOCALES,
  isRtl,
  LOCALE_FLAGS,
  LOCALE_NAMES,
  LOCALES,
  Locale,
  MAIN_LOCALES,
  type MarketingStrings,
  setLocale,
  T,
} from "../lib/i18n/marketing-translations";
import { LivePricingSection } from "../lib/ui/live-pricing-section";
import { FxTicker } from "../lib/ui/fx-ticker";
import { ThemeToggle } from "../lib/ui/theme-toggle";
import { Icon, type IconName } from "../lib/ui/icons";

/**
 * V173 — Map emoji utilisé dans les strings i18n marketing → IconName V45.
 * On garde les emojis dans les 27 locales (source de vérité), mais on les
 * convertit en SVG pro pour l'affichage. Fallback : "sparkles".
 */
function emojiToIcon(emoji: string | undefined): IconName {
  if (!emoji) return "sparkles";
  const map: Record<string, IconName> = {
    "🪙": "coins",
    "🏠": "home",
    "✈️": "plane",
    "💍": "gift", // mariage
    "⚽": "trophy",
    "⛪": "users",
    "🎉": "party-popper",
    "👥": "users",
    "👋": "sparkles",
    "💸": "credit-card",
    "💰": "credit-card",
    "💱": "repeat",
    "↔": "repeat",
    "↔️": "repeat",
    "🔔": "bell",
    "🛎": "bell",
    "🛎️": "bell",
    "📷": "camera",
    "📸": "camera",
    "🛡": "shield",
    "🛡️": "shield",
    "🌍": "globe",
    "🌐": "globe",
    "🌎": "globe",
    "🇪🇺": "globe",
    "💔": "users",
    "🕊": "sparkles",
    "🕊️": "sparkles",
    "🎭": "palette",
    "✉️": "mail",
    "✉": "mail",
    "🎨": "palette",
    "⚖️": "scan-line",
    "⚖": "scan-line",
    "🤖": "sparkles",
    "📜": "file-text",
    "🚨": "alert-triangle",
    "🏦": "credit-card",
    "🔄": "rotate-cw",
    "🔁": "repeat",
    "🤝": "check",
    "📅": "calendar",
    "🎯": "trophy",
    "📚": "file-text",
    "🧮": "bar-chart-2",
    "🔗": "share-2",
    "💳": "credit-card",
    "📈": "bar-chart-2",
    "📊": "bar-chart-2",
    "🧾": "receipt",
    "💬": "phone",
    "😊": "sparkles",
    "🌙": "lock",
    "🧠": "sparkles",
    "🎙": "mic",
    "🎙️": "mic",
    "🔮": "sparkles",
    "🔑": "key-round",
    "🚫": "x",
    "📱": "phone",
    "📲": "phone",
    "♿": "users",
    "🌗": "palette",
    "♾️": "repeat",
    "🎁": "gift",
    "🔓": "lock",
    "🔒": "lock",
    "✨": "sparkles",
    "🪄": "sparkles",
    "📞": "phone",
    "📄": "file-text",
    "💵": "credit-card",
    "🏅": "trophy",
    "🌟": "sparkles",
    "🤔": "search",
    "🛒": "shopping-cart",
    "🚗": "car",
  };
  return map[emoji] ?? "sparkles";
}

export default function MarketingPage() {
  const [locale, setLoc] = useState<Locale>("fr");
  const [mounted, setMounted] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [isLogged, setIsLogged] = useState(false);
  /**
   * Mode "mobile/app" :
   *  - Viewport < 768px (téléphone)
   *  - OU app installée en PWA standalone (display-mode: standalone)
   * → on affiche un écran d'accueil "vraie app" (logo + CTA), pas le site vitrine.
   */
  const [isMobile, setIsMobile] = useState(false);
  /**
   * V23 — email de contact configurable depuis l'admin (PATCH /admin/site-config).
   * Si la requête échoue, on garde le default (hello@backmesdo.com) qui est
   * déjà dans toutes les chaînes traduites — donc aucun affichage cassé.
   */
  const [supportEmail, setSupportEmail] = useState("hello@backmesdo.com");

  useEffect(() => {
    const hasToken = !!getToken();
    setIsLogged(hasToken);
    setLoc(detectLocale());

    // === AUTO-REDIRECT mobile / PWA standalone / Capacitor WebView ===
    // Au lancement de l'app native (Capacitor) ou PWA installée, l'utilisateur
    // doit arriver DIRECTEMENT sur sa zone de travail (dashboard si connecté,
    // login si pas connecté) — pas sur la vitrine marketing qui n'a aucune
    // raison d'être présente dans l'app.
    if (typeof window !== "undefined") {
      const narrow = window.innerWidth < 768;
      const standalone =
        window.matchMedia?.("(display-mode: standalone)").matches ||
        (window.navigator as any).standalone === true;
      // Détection Capacitor : présence de window.bmdNative (injecté par le
      // bridge mobile) ou capacitor:// scheme dans l'URL.
      const isCapacitor =
        typeof (window as any).bmdNative !== "undefined" ||
        window.location.protocol === "capacitor:";

      if (narrow || standalone || isCapacitor) {
        // Mobile / app native → on bypass la vitrine.
        // ⚠ Pas de redirect si on a un `?ref=` ou un autre query param :
        // l'utilisateur partage souvent un lien marketing depuis WhatsApp.
        const params = new URLSearchParams(window.location.search);
        const hasShareParam =
          params.has("ref") || params.has("invite") || params.has("share");
        if (!hasShareParam) {
          const target = hasToken ? "/dashboard" : "/login";
          window.location.replace(target);
          return; // Stop l'init du marketing
        }
      }
    }

    // Récupère la config publique du site (cache 5 min côté API et client).
    // Defensive coding : on vérifie que la fonction existe avant d'appeler
    // pour ne PAS faire planter la vitrine si un cache de build est encore
    // sur une version pré-V23 où getSiteConfig n'existait pas. Le `try` +
    // typeof + .catch couvre les 3 modes d'échec :
    //  1. Fonction undefined → fallback hardcodé silencieux
    //  2. Promise rejected (réseau down) → fallback hardcodé silencieux
    //  3. Throw synchrone → swallow par le try
    try {
      const fn =
        typeof api.getSiteConfig === "function" ? api.getSiteConfig : null;
      if (fn) {
        fn()
          .then((cfg) => {
            if (cfg?.supportEmail) setSupportEmail(cfg.supportEmail);
          })
          .catch(() => {
            /* silencieux — on garde le default */
          });
      }
    } catch {
      /* hardcoded default — la vitrine reste fonctionnelle */
    }

    function checkMobile() {
      const narrow = window.innerWidth < 768;
      const standalone =
        window.matchMedia?.("(display-mode: standalone)").matches ||
        // iOS PWA installée
        (window.navigator as any).standalone === true;
      setIsMobile(narrow || standalone);
    }
    checkMobile();
    window.addEventListener("resize", checkMobile);
    setMounted(true);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  function changeLocale(l: Locale) {
    setLocale(l);
    setLoc(l);
    setShowLangMenu(false);
    document.documentElement.lang = l;
    document.documentElement.dir = isRtl(l) ? "rtl" : "ltr";
  }

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.lang = locale;
    document.documentElement.dir = isRtl(locale) ? "rtl" : "ltr";
  }, [mounted, locale]);

  if (!mounted) {
    return (
      <div className="bmd-marketing-loader">
        BMD<span>·</span>
      </div>
    );
  }

  const t = T[locale];
  const rtl = isRtl(locale);

  // ===== Sur téléphone / PWA installée : ÉCRAN D'ACCUEIL APP =====
  // (pas le site vitrine — c'est dédié au desktop/tablette)
  if (isMobile) {
    return (
      <MobileWelcome
        t={t}
        locale={locale}
        rtl={rtl}
        isLogged={isLogged}
        showLangMenu={showLangMenu}
        setShowLangMenu={setShowLangMenu}
        onChangeLocale={changeLocale}
      />
    );
  }

  return (
    <>
      <style jsx global>{`
        /* Palette héritée de :root (globals.css) pour suivre data-theme.
           Les vars --night, --cream, --saffron etc viennent du theme global :
           en mode light, --night devient un cream très clair, --cream devient
           un indigo profond, etc. Aucune redéfinition locale ici. */
        .bmd-mkt {
          background: var(--night);
          color: var(--cream);
          font-family:
            "Inter",
            system-ui,
            -apple-system,
            sans-serif;
          line-height: 1.5;
          min-height: 100vh;
          background-image:
            radial-gradient(
              900px 600px at 10% -10%,
              rgba(232, 163, 61, 0.08),
              transparent 60%
            ),
            radial-gradient(
              900px 600px at 110% 10%,
              rgba(181, 70, 46, 0.07),
              transparent 60%
            ),
            radial-gradient(
              1200px 800px at 50% 120%,
              rgba(63, 125, 92, 0.05),
              transparent 60%
            );
        }
        /* Halos plus chauds en mode clair (orange/terracotta saturés) */
        html[data-theme="light"] .bmd-mkt {
          background-image:
            radial-gradient(
              900px 600px at 10% -10%,
              rgba(196, 125, 42, 0.08),
              transparent 60%
            ),
            radial-gradient(
              900px 600px at 110% 10%,
              rgba(160, 59, 37, 0.06),
              transparent 60%
            );
        }
        .bmd-mkt h1,
        .bmd-mkt h2,
        .bmd-mkt h3 {
          font-family: "Cormorant Garamond", Georgia, serif;
          font-weight: 600;
        }
        .bmd-mkt h1 em,
        .bmd-mkt h2 em,
        .bmd-mkt h3 em {
          color: var(--saffron);
          font-style: normal;
        }
        .bmd-marketing-loader {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--night, #0e0b14);
          color: var(--cream, #f4e4c1);
          font-family:
            "Cormorant Garamond",
            Georgia,
            serif;
          font-size: 32px;
          font-weight: 700;
        }
        .bmd-marketing-loader span {
          color: var(--saffron, #e8a33d);
        }
        /* Browser frame, like in mockups */
        .bmd-mkt .browser {
          background: linear-gradient(180deg, #15101d, #0e0b14);
          border-radius: 18px;
          border: 1px solid var(--line);
          overflow: hidden;
          box-shadow: 0 30px 70px rgba(0, 0, 0, 0.5);
        }
        .bmd-mkt .browser-bar {
          background: #0a0810;
          border-bottom: 1px solid var(--line-soft);
          padding: 10px 16px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .bmd-mkt .dot {
          width: 11px;
          height: 11px;
          border-radius: 50%;
        }
        .bmd-mkt .dot.r {
          background: #ff5f57;
        }
        .bmd-mkt .dot.y {
          background: #febc2e;
        }
        .bmd-mkt .dot.g {
          background: #28c840;
        }
        .bmd-mkt .url-bar {
          flex: 1;
          background: rgba(255, 255, 255, 0.04);
          border-radius: 8px;
          padding: 5px 12px;
          font-size: 11px;
          color: var(--cream-soft);
          border: 1px solid var(--line-soft);
          text-align: center;
          font-family: "Inter", monospace;
        }
        .bmd-mkt .url-bar b {
          color: var(--saffron);
          font-weight: 600;
        }
        @media (max-width: 768px) {
          .bmd-mkt .url-bar {
            font-size: 9px;
            padding: 4px 8px;
          }
        }
        /* === Nav links (onglets centraux) === */
        @media (max-width: 900px) {
          .bmd-nav-links {
            display: none !important;
          }
        }
        .bmd-nav-links a:hover {
          color: var(--saffron) !important;
        }
        /* === Hero responsive === */
        @media (max-width: 768px) {
          .bmd-mkt .hero-grid {
            grid-template-columns: 1fr !important;
            padding: 32px 24px !important;
            gap: 24px !important;
          }
          .bmd-mkt .hero-logo > div {
            width: 200px !important;
            height: 200px !important;
          }
        }
      `}</style>

      <div className="bmd-mkt" dir={rtl ? "rtl" : "ltr"}>
        {/* ======== NAV STICKY ======== */}
        {/* Reste collée en haut au scroll, fond avec backdrop-blur pour
            laisser deviner le contenu derrière (style Stripe/Linear). */}
        <nav
          style={{
            position: "sticky",
            top: 0,
            zIndex: 50,
            background:
              "linear-gradient(180deg, rgba(14,11,20,0.92), rgba(14,11,20,0.78))",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            borderBottom: "1px solid rgba(244,228,193,0.06)",
          }}
        >
          <div
            style={{
              padding: "14px 24px",
              maxWidth: 1380,
              margin: "0 auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
          <Link
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <BmdLogo size={42} />
            <div>
              <div
                style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: 26,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  lineHeight: 1,
                }}
              >
                BMD<span style={{ color: "var(--saffron)" }}>·</span>
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: "var(--gold)",
                  letterSpacing: 3,
                  textTransform: "uppercase",
                  fontWeight: 700,
                  marginTop: 2,
                }}
              >
                Back · Mes · Do
              </div>
            </div>
          </Link>

          {/* Onglets de navigation centraux (fidèle BMD_site_web.html) */}
          {/* Cachés sur mobile (< 760px) — l'utilisateur a la nav scrolling */}
          <div
            className="bmd-nav-links"
            style={{
              display: "flex",
              gap: 28,
              fontSize: 14,
              fontWeight: 500,
              flex: 1,
              justifyContent: "center",
            }}
          >
            {t.story && (
              <a
                href="#story"
                style={{ color: "var(--cream-soft)", textDecoration: "none" }}
              >
                {t.nav.story ?? (locale === "fr" ? "Notre histoire" : "Our story")}
              </a>
            )}
            <a
              href="#features"
              style={{ color: "var(--cream-soft)", textDecoration: "none" }}
            >
              {t.nav.features}
            </a>
            <a
              href="#how-it-works"
              style={{ color: "var(--cream-soft)", textDecoration: "none" }}
            >
              {t.nav.howItWorks}
            </a>
            <a
              href="#pricing"
              style={{ color: "var(--cream-soft)", textDecoration: "none" }}
            >
              {t.nav.pricing}
            </a>
            {t.referral && (
              <a
                href="#referral"
                style={{ color: "var(--cream-soft)", textDecoration: "none" }}
              >
                {locale === "fr" ? "Parrainage" : "Refer"}
              </a>
            )}
            <a
              href="#faq"
              style={{ color: "var(--cream-soft)", textDecoration: "none" }}
            >
              FAQ
            </a>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ThemeToggle
              variant="ghost"
              labelDark={
                locale === "fr"
                  ? "Passer en mode clair"
                  : "Switch to light mode"
              }
              labelLight={
                locale === "fr"
                  ? "Passer en mode sombre"
                  : "Switch to dark mode"
              }
            />
            <LangPicker
              locale={locale}
              rtl={rtl}
              show={showLangMenu}
              setShow={setShowLangMenu}
              onChange={changeLocale}
              t={t}
            />
            {isLogged ? (
              <Link
                href="/dashboard"
                style={{
                  background: "linear-gradient(135deg, #E8A33D, #B5462E)",
                  color: "var(--night-2)",
                  padding: "10px 18px",
                  borderRadius: 10,
                  textDecoration: "none",
                  fontSize: 13,
                  fontWeight: 700,
                  minHeight: 40,
                  display: "inline-flex",
                  alignItems: "center",
                  letterSpacing: 0.3,
                }}
              >
                {locale === "fr"
                  ? "Mon espace →"
                  : locale === "en"
                    ? "My space →"
                    : `${t.nav.login} →`}
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  style={{
                    background: "transparent",
                    color: "var(--cream)",
                    padding: "10px 14px",
                    borderRadius: 10,
                    textDecoration: "none",
                    fontSize: 13,
                    fontWeight: 600,
                    minHeight: 40,
                    display: "inline-flex",
                    alignItems: "center",
                  }}
                >
                  {t.nav.login}
                </Link>
                <Link
                  href="/login"
                  style={{
                    background: "linear-gradient(135deg, #E8A33D, #B5462E)",
                    color: "var(--night-2)",
                    padding: "10px 18px",
                    borderRadius: 10,
                    textDecoration: "none",
                    fontSize: 13,
                    fontWeight: 700,
                    minHeight: 40,
                    display: "inline-flex",
                    alignItems: "center",
                    letterSpacing: 0.3,
                    boxShadow: "0 8px 20px rgba(232,163,61,0.25)",
                  }}
                >
                  {t.nav.signUp}
                </Link>
              </>
            )}
          </div>
          </div>
        </nav>

        {/* ======== HERO ======== */}
        <section
          style={{
            maxWidth: 1380,
            margin: "0 auto",
            padding: "32px 24px 60px",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.1fr 1fr",
              gap: 40,
              alignItems: "center",
              padding: "48px 36px",
              borderRadius: 28,
              background:
                "radial-gradient(600px 400px at 90% 10%, rgba(232,163,61,0.12), transparent 60%), linear-gradient(180deg, rgba(42,34,68,0.6), rgba(22,17,30,0.9))",
              border: "1px solid rgba(232,163,61,0.18)",
              position: "relative",
              overflow: "hidden",
            }}
            className="hero-grid"
          >
            <div style={{ position: "relative", zIndex: 1 }}>
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: 4,
                  color: "var(--saffron)",
                  textTransform: "uppercase",
                  fontWeight: 700,
                  marginBottom: 18,
                }}
              >
                {t.hero.tagline}
              </div>
              <h1
                style={{
                  fontSize: "clamp(36px, 5.5vw, 56px)",
                  lineHeight: 1.05,
                  marginBottom: 18,
                  color: "var(--cream)",
                }}
                dangerouslySetInnerHTML={{
                  __html: emphasizeLast(t.hero.headline),
                }}
              />
              <p
                style={{
                  fontSize: 17,
                  lineHeight: 1.7,
                  color: "var(--cream-soft)",
                  maxWidth: 540,
                  marginBottom: 28,
                }}
              >
                {t.hero.subhead}
              </p>
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  flexWrap: "wrap",
                  marginBottom: 24,
                }}
              >
                <Link
                  href="/login"
                  style={{
                    background: "linear-gradient(135deg, #E8A33D, #B5462E)",
                    color: "var(--night-2)",
                    padding: "16px 28px",
                    borderRadius: 12,
                    textDecoration: "none",
                    fontSize: 15,
                    fontWeight: 700,
                    minHeight: 52,
                    display: "inline-flex",
                    alignItems: "center",
                    letterSpacing: 0.3,
                    boxShadow: "0 12px 32px rgba(232,163,61,0.25)",
                  }}
                >
                  {t.hero.ctaPrimary} →
                </Link>
                <a
                  href="#features"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    color: "var(--cream)",
                    padding: "16px 28px",
                    borderRadius: 12,
                    textDecoration: "none",
                    fontSize: 15,
                    fontWeight: 600,
                    border: "1px solid rgba(244,228,193,0.08)",
                    minHeight: 52,
                    display: "inline-flex",
                    alignItems: "center",
                  }}
                >
                  ▷ {t.hero.ctaSecondary}
                </a>
              </div>

              {/* Stores row (fidèle BMD_site_web.html) */}
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  marginTop: 24,
                  marginBottom: 16,
                  flexWrap: "wrap",
                }}
              >
                {[
                  { ic: "📱", t1: "App Store", t2: "iOS 15+" },
                  { ic: "🤖", t1: "Google Play", t2: "Android 9+" },
                  { ic: "💬", t1: "WhatsApp", t2: "Bot natif" },
                ].map((s, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 12,
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(244,228,193,0.08)",
                      fontSize: 11,
                      color: "var(--cream-soft)",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span style={{ fontSize: 18 }}>{s.ic}</span>
                    <span>
                      <strong
                        style={{
                          color: "var(--cream)",
                          fontFamily: "'Cormorant Garamond', serif",
                          fontSize: 13,
                          display: "block",
                          lineHeight: 1.2,
                        }}
                      >
                        {s.t1}
                      </strong>
                      {s.t2}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["🪙 Tontines", "💸 Dépenses", "↔ Swap", "📷 OCR", "🌍 Multi-devises"].map(
                  (p) => (
                    <span
                      key={p}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 99,
                        fontSize: 11,
                        fontWeight: 600,
                        background: "rgba(232,163,61,0.08)",
                        color: "var(--saffron)",
                        border: "1px solid rgba(232,163,61,0.18)",
                      }}
                    >
                      {p}
                    </span>
                  ),
                )}
              </div>
            </div>

            {/* Phone-frame mockup avec preview dashboard (fidèle BMD_site_web.html) */}
            <PhoneFrameHero />
          </div>
        </section>

        {/* ======== NOTRE HISTOIRE — 1er onglet, storytelling ======== */}
        {t.story && (
          <>
            <SectionDivider kicker={t.story.kicker} title={t.story.title} />
            <section
              id="story"
              style={{
                maxWidth: 1380,
                margin: "0 auto",
                padding: "0 24px 40px",
                scrollMarginTop: 80,
              }}
            >
              <StorySection data={t.story} />
            </section>
          </>
        )}

        {/* ======== FEATURES ======== */}
        <SectionDivider
          kicker={locale === "fr" ? "Fonctionnalités" : "Features"}
          title={t.features.title}
        />
        <section
          id="features"
          style={{
            maxWidth: 1380,
            margin: "0 auto",
            padding: "0 24px 40px",
            scrollMarginTop: 80,
          }}
        >
          {t.featuresLong ? (
            <FeaturesLong data={t.featuresLong} />
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 18,
              }}
            >
              {t.features.items.map((f, i) => (
                <div
                  key={i}
                  style={{
                    background:
                      "linear-gradient(180deg, #FFFFFF 0%, #FBF6EC 100%)",
                    border: "1px solid rgba(197,138,46,0.22)",
                    borderRadius: 14,
                    padding: 22,
                    boxShadow: "0 6px 20px rgba(43,31,21,0.05)",
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      background: "rgba(197,138,46,0.12)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#C58A2E",
                      marginBottom: 12,
                    }}
                  >
                    <Icon
                      name={emojiToIcon(f.icon)}
                      size={22}
                      color="#C58A2E"
                      strokeWidth={1.8}
                    />
                  </div>
                  <h3
                    style={{
                      fontSize: 18,
                      color: "#C58A2E",
                      marginBottom: 8,
                    }}
                  >
                    {f.title}
                  </h3>
                  <p style={{ fontSize: 13, color: "#6B5A47", lineHeight: 1.6 }}>
                    {f.body}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ======== REFERRAL / PROGRAMME COMMERCIAL ======== */}
        {t.referral && (
          <>
            <SectionDivider
              kicker={t.referral.kicker}
              title={t.referral.title}
            />
            <section
              id="referral"
              style={{
                maxWidth: 1180,
                margin: "0 auto",
                padding: "0 24px 40px",
                scrollMarginTop: 80,
              }}
            >
              <ReferralSection data={t.referral} />
            </section>
          </>
        )}

        {/* ======== HOW IT WORKS ======== */}
        <SectionDivider
          kicker={locale === "fr" ? "Démarrer" : "Get started"}
          title={t.howItWorks.title}
        />
        <section
          id="how-it-works"
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "0 24px 40px",
            textAlign: "center",
            scrollMarginTop: 80,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 28,
            }}
          >
            {t.howItWorks.steps.map((s, i) => (
              <div key={i}>
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: "50%",
                    background:
                      "linear-gradient(135deg, #C58A2E, #B5462E)",
                    color: "#FFFFFF",
                    fontWeight: 700,
                    fontSize: 28,
                    fontFamily: "'Cormorant Garamond', serif",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 16px",
                    boxShadow: "0 10px 28px rgba(197,138,46,0.30)",
                  }}
                >
                  {s.num}
                </div>
                <h3 style={{ fontSize: 20, color: "#2B1F15", marginBottom: 8 }}>
                  {s.title}
                </h3>
                <p style={{ fontSize: 14, color: "#6B5A47", lineHeight: 1.6 }}>
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ======== PRICING ======== */}
        <SectionDivider
          kicker={locale === "fr" ? "Tarifs" : "Pricing"}
          title={t.pricing.title}
        />
        <section
          id="pricing"
          style={{
            maxWidth: 1380,
            margin: "0 auto",
            padding: "0 24px 40px",
            scrollMarginTop: 80,
          }}
        >
          {/* Tarifs LIVE depuis /plans (configurés en admin).
              Aucune duplication avec marketing-translations.ts pour rester
              sync à 100% avec ce que voit l'utilisateur dans l'app. */}
          <LivePricingSection locale={locale} />
        </section>

        {/* ======== FAQ ======== */}
        <SectionDivider
          kicker={locale === "fr" ? "Questions" : "Questions"}
          title={t.faq.title}
        />
        <section
          id="faq"
          style={{
            maxWidth: 1380,
            margin: "0 auto",
            padding: "0 24px 60px",
            scrollMarginTop: 80,
          }}
        >
          {t.faqLong ? (
            <FaqLong data={t.faqLong} supportEmail={supportEmail} />
          ) : (
            <FaqShort items={t.faq.items} />
          )}
        </section>

        {/* ======== CTA ======== */}
        <section
          style={{
            maxWidth: 880,
            margin: "0 auto",
            padding: "20px 24px 80px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              padding: "48px 28px",
              borderRadius: 24,
              border: "1px solid rgba(197,138,46,0.30)",
              background:
                "radial-gradient(600px 300px at 50% 0%, rgba(197,138,46,0.18), transparent), linear-gradient(180deg, #FFFFFF 0%, #FBF6EC 100%)",
              boxShadow: "0 12px 40px rgba(43,31,21,0.08)",
            }}
          >
            <h2
              style={{
                fontSize: "clamp(28px, 4vw, 40px)",
                color: "#C58A2E",
                marginBottom: 12,
              }}
            >
              {t.cta.headline}
            </h2>
            <p style={{ color: "#6B5A47", marginBottom: 28, fontSize: 16 }}>
              {t.cta.body}
            </p>
            <Link
              href="/login"
              style={{
                display: "inline-block",
                background: "linear-gradient(135deg, #C58A2E, #B5462E)",
                color: "#FFFFFF",
                padding: "16px 40px",
                borderRadius: 12,
                textDecoration: "none",
                fontSize: 16,
                fontWeight: 700,
                boxShadow: "0 12px 32px rgba(197,138,46,0.35)",
                letterSpacing: 0.3,
              }}
            >
              {t.cta.button} →
            </Link>
          </div>
        </section>

        {/* ======== FOOTER ======== */}
        <footer
          style={{
            maxWidth: 1380,
            margin: "0 auto",
            padding: "32px 24px",
            borderTop: "1px solid rgba(244,228,193,0.08)",
            textAlign: "center",
            fontSize: 12,
            color: "var(--muted)",
          }}
        >
          <BmdLogo size={36} />
          <div
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 22,
              fontWeight: 700,
              color: "var(--cream)",
              marginTop: 8,
              marginBottom: 6,
            }}
          >
            BMD<span style={{ color: "var(--saffron)" }}>·</span>
          </div>
          <div style={{ marginBottom: 14, fontStyle: "italic", color: "var(--gold)" }}>
            {t.footer.tagline}
          </div>
          <div
            style={{
              display: "flex",
              gap: 20,
              justifyContent: "center",
              marginBottom: 12,
              flexWrap: "wrap",
            }}
          >
            <Link
              href="/legal/privacy"
              style={{ color: "var(--cream-soft)", textDecoration: "none" }}
            >
              {t.footer.privacy}
            </Link>
          </div>
          <div>
            © {new Date().getFullYear()} BMD · {t.footer.rights}
          </div>
        </footer>

        {/* Spacer pour que le contenu juste avant le ticker ne soit pas
            masqué par la barre fixée en bas. Hauteur = ~ticker height. */}
        <div style={{ height: 48 }} aria-hidden />

        {/* === FX TICKER FIXE EN BAS DE PAGE ===
            Bandeau Bloomberg-style figé en permanence en bas du viewport :
            même quand on scrolle, la ligne reste à sa place. Seul le
            contenu (17 paires de devises) défile horizontalement en boucle
            via animation CSS. Cliquable → /dashboard/plans pour upgrade. */}
        <FxTicker />
      </div>

    </>
  );
}

/* ============ COMPONENTS ============ */

/**
 * <FeaturesLong> · présentation détaillée et catégorisée des fonctionnalités.
 *
 * Layout : 1 carte par catégorie thématique (👥 Groupes, 💸 Dépenses, 🪙
 * Tontines, ↔ Soldes, 💱 Multi-devises, 🔔 Communication, 🧠 Intelligence,
 * 🛡 Sécurité, 📱 Plateformes). Chaque carte contient un pitch + une liste
 * d'items (icône + titre + body) en 2 colonnes responsive.
 *
 * Onglets sticky en haut pour navigation rapide entre catégories.
 */
function FeaturesLong({
  data,
}: {
  data: NonNullable<MarketingStrings["featuresLong"]>;
}): JSX.Element {
  // V17 : layout sidebar gauche (catégories) + frame droite (contenu actif).
  // Plus de scroll vertical : on switche entre catégories sans scroller.
  // Sur mobile (≤ 768px), la sidebar bascule au-dessus en barre horizontale
  // scrollable (overflow-x), et le contenu suit en-dessous.
  const [active, setActive] = useState<string>(data.categories[0]?.key ?? "");
  const activeCat =
    data.categories.find((c) => c.key === active) ?? data.categories[0];

  return (
    <div>
      <p
        style={{
          fontSize: 14,
          color: "#6B5A47",
          lineHeight: 1.65,
          maxWidth: 900,
          marginBottom: 18,
        }}
      >
        {data.intro}
      </p>

      {/* styled-jsx ne tolère pas les <style jsx> imbriqués : on regroupe
          TOUTES les rules de la section ici, au même niveau de l'arbre. */}
      <style jsx>{`
        .bmd-sidebar-layout {
          display: grid;
          grid-template-columns: 240px 1fr;
          gap: 22px;
          align-items: start;
        }
        @media (max-width: 768px) {
          .bmd-sidebar-layout {
            grid-template-columns: 1fr;
            gap: 14px;
          }
          .bmd-sidebar-nav {
            flex-direction: row !important;
            overflow-x: auto;
            position: static !important;
            top: auto !important;
            gap: 6px !important;
            padding: 6px !important;
            scrollbar-width: thin;
          }
          .bmd-sidebar-nav button {
            flex-shrink: 0;
          }
        }
      `}</style>

      <div className="bmd-sidebar-layout">
        {/* Sidebar gauche / barre horizontale mobile : liste des catégories */}
        <nav
          role="tablist"
          aria-label="Feature categories"
          className="bmd-sidebar-nav"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            background:
              "linear-gradient(180deg, #FFFFFF 0%, #FBF6EC 100%)",
            border: "1px solid rgba(197,138,46,0.22)",
            borderRadius: 14,
            padding: 8,
            position: "sticky",
            top: 80,
            boxShadow: "0 6px 24px rgba(43,31,21,0.06)",
          }}
        >
          {data.categories.map((cat) => {
            const isActive = active === cat.key;
            return (
              <button
                key={cat.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActive(cat.key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  textAlign: "left",
                  background: isActive
                    ? "linear-gradient(135deg, #C58A2E, #B5462E)"
                    : "transparent",
                  color: isActive ? "#FFFFFF" : "#2B1F15",
                  border: isActive
                    ? "1px solid rgba(197,138,46,0.40)"
                    : "1px solid transparent",
                  transition: "all 0.15s ease",
                  whiteSpace: "nowrap",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 22,
                    height: 22,
                    color: isActive ? "#FFFFFF" : "#C58A2E",
                  }}
                  aria-hidden="true"
                >
                  <Icon
                    name={emojiToIcon(cat.icon)}
                    size={16}
                    color={isActive ? "#FFFFFF" : "#C58A2E"}
                    strokeWidth={1.8}
                  />
                </span>
                <span>{cat.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Frame droite : catégorie active uniquement */}
        <div
          role="tabpanel"
          style={{
            background:
              "linear-gradient(180deg, #FFFFFF 0%, #FBF6EC 100%)",
            border: "1px solid rgba(197,138,46,0.22)",
            borderRadius: 16,
            padding: "18px 20px",
            minHeight: 320,
            boxShadow: "0 6px 24px rgba(43,31,21,0.06)",
          }}
        >
          {activeCat && (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 4,
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background:
                      "linear-gradient(135deg, rgba(197,138,46,0.22), rgba(159,70,40,0.14))",
                    border: "1px solid rgba(197,138,46,0.30)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#C58A2E",
                    flexShrink: 0,
                  }}
                  aria-hidden="true"
                >
                  <Icon
                    name={emojiToIcon(activeCat.icon)}
                    size={22}
                    color="#C58A2E"
                    strokeWidth={1.8}
                  />
                </div>
                <h3
                  style={{
                    fontFamily: "'Cormorant Garamond', serif",
                    fontSize: "clamp(20px, 2.4vw, 24px)",
                    fontWeight: 600,
                    color: "#2B1F15",
                    margin: 0,
                    lineHeight: 1.2,
                  }}
                >
                  {activeCat.label}
                </h3>
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: "#6B5A47",
                  lineHeight: 1.6,
                  marginTop: 8,
                  marginBottom: 16,
                }}
              >
                {activeCat.pitch}
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: 10,
                }}
              >
                {activeCat.items.map((it, i) => (
                  <div
                    key={i}
                    style={{
                      background: "#FFFFFF",
                      border: "1px solid rgba(197,138,46,0.18)",
                      borderRadius: 12,
                      padding: 12,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 4,
                      }}
                    >
                      {it.icon && (
                        <span
                          aria-hidden="true"
                          style={{
                            display: "inline-flex",
                            width: 36,
                            height: 36,
                            borderRadius: 12,
                            background: "rgba(197,138,46,0.12)",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#C58A2E",
                            flexShrink: 0,
                          }}
                        >
                          <Icon
                            name={emojiToIcon(it.icon)}
                            size={20}
                            color="#C58A2E"
                            strokeWidth={1.8}
                          />
                        </span>
                      )}
                      <h4
                        style={{
                          fontSize: 13,
                          color: "#2B1F15",
                          fontWeight: 700,
                          fontFamily: "inherit",
                          margin: 0,
                          lineHeight: 1.3,
                        }}
                      >
                        {it.title}
                      </h4>
                    </div>
                    <p
                      style={{
                        fontSize: 12.5,
                        color: "#6B5A47",
                        lineHeight: 1.55,
                        margin: 0,
                      }}
                    >
                      {it.body}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * <ReferralSection> · présentation du programme commercial / parrainage
 * sales (référencement simple à 1 niveau, 20% à vie).
 */
function ReferralSection({
  data,
}: {
  data: NonNullable<MarketingStrings["referral"]>;
}): JSX.Element {
  // V17 : layout 2 colonnes compactes — Avantages (gauche) + Étapes (droite),
  // intro + manifesto + CTA en un seul écran sans scroll.
  return (
    <div
      style={{
        padding: "20px 22px",
        borderRadius: 18,
        background:
          "radial-gradient(700px 400px at 80% 0%, rgba(197,138,46,0.18), transparent 60%), linear-gradient(180deg, #FFFFFF 0%, #FBF6EC 100%)",
        border: "1px solid rgba(197,138,46,0.22)",
        boxShadow: "0 10px 30px rgba(43,31,21,0.06)",
      }}
    >
      <p
        style={{
          fontSize: 14,
          color: "#6B5A47",
          lineHeight: 1.6,
          marginBottom: 16,
        }}
      >
        {data.intro}
      </p>

      <div className="bmd-ref-grid">
        <style jsx>{`
          .bmd-ref-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
            margin-bottom: 14px;
          }
          @media (max-width: 768px) {
            .bmd-ref-grid {
              grid-template-columns: 1fr;
            }
          }
        `}</style>

        {/* Colonne gauche : 4 bénéfices empilés compact */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.benefits.map((b, i) => (
            <div
              key={i}
              style={{
                background: "rgba(197,138,46,0.08)",
                border: "1px solid rgba(197,138,46,0.18)",
                borderRadius: 10,
                padding: "10px 12px",
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: "rgba(197,138,46,0.14)",
                  color: "#C58A2E",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: 2,
                }}
                aria-hidden="true"
              >
                <Icon
                  name={emojiToIcon(b.icon)}
                  size={18}
                  color="#C58A2E"
                  strokeWidth={1.8}
                />
              </div>
              <div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#2B1F15",
                    marginBottom: 2,
                  }}
                >
                  {b.title}
                </div>
                <p
                  style={{
                    fontSize: 12,
                    color: "#6B5A47",
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  {b.body}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Colonne droite : 4 étapes verticales compactes */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.howItWorks.map((s, i) => (
            <div
              key={i}
              style={{
                background: "#FFFFFF",
                border: "1px solid rgba(197,138,46,0.18)",
                borderRadius: 10,
                padding: "10px 12px",
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background:
                    "linear-gradient(135deg, #C58A2E, #B5462E)",
                  color: "#FFFFFF",
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: 14,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: 1,
                }}
                aria-hidden="true"
              >
                {s.num}
              </div>
              <div>
                <div
                  style={{
                    fontSize: 13,
                    color: "#2B1F15",
                    fontWeight: 700,
                    marginBottom: 2,
                  }}
                >
                  {s.title}
                </div>
                <p
                  style={{
                    fontSize: 12,
                    color: "#6B5A47",
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  {s.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA + small print en bas */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
          padding: "12px 14px",
          borderRadius: 12,
          border: "1px solid rgba(197,138,46,0.22)",
          background: "rgba(197,138,46,0.10)",
        }}
      >
        <Link
          href={data.cta.href}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background:
              "linear-gradient(135deg, #C58A2E, #B5462E)",
            color: "#FFFFFF",
            padding: "10px 18px",
            borderRadius: 10,
            textDecoration: "none",
            fontSize: 13,
            fontWeight: 700,
            minHeight: 40,
            letterSpacing: 0.3,
            boxShadow: "0 8px 22px rgba(197,138,46,0.30)",
            flexShrink: 0,
          }}
        >
          {data.cta.label} →
        </Link>
        <p
          style={{
            fontSize: 11,
            color: "#6B5A47",
            lineHeight: 1.5,
            flex: 1,
            minWidth: 200,
            margin: 0,
          }}
        >
          {data.smallPrint}
        </p>
      </div>
    </div>
  );
}

/**
 * <FaqLong> · FAQ catégorisée. Tabs sticky + sections empilées avec
 * <details> animés. Mobile-friendly (les tabs deviennent scrollables).
 */
/**
 * V28 · Fallback FAQ accordéon (utilisé seulement si la locale n'a pas
 * de `faqLong`). Comportement identique à `FaqLong` : un seul Q/A
 * ouvert à la fois, contrôlé via React.
 */
function FaqShort({
  items,
}: {
  items: Array<{ q: string; a: string }>;
}): JSX.Element {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  return (
    <>
      {items.map((q, i) => {
        const isOpen = openIndex === i;
        return (
          <details
            key={i}
            open={isOpen}
            style={{
              background:
                "linear-gradient(180deg, #FFFFFF 0%, #FBF6EC 100%)",
              border: "1px solid rgba(197,138,46,0.22)",
              borderRadius: 12,
              padding: 18,
              marginBottom: 10,
              boxShadow: "0 4px 16px rgba(43,31,21,0.04)",
            }}
          >
            <summary
              onClick={(e) => {
                e.preventDefault();
                setOpenIndex((prev) => (prev === i ? null : i));
              }}
              style={{
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 15,
                color: "#2B1F15",
              }}
            >
              {q.q}
            </summary>
            <p
              style={{
                marginTop: 10,
                color: "#6B5A47",
                fontSize: 13,
                lineHeight: 1.7,
              }}
            >
              {q.a}
            </p>
          </details>
        );
      })}
    </>
  );
}

function FaqLong({
  data,
  supportEmail = "hello@backmesdo.com",
}: {
  data: NonNullable<MarketingStrings["faqLong"]>;
  /** V23 — email configurable côté admin, remplace hello@backmesdo.com */
  supportEmail?: string;
}): JSX.Element {
  // V17 : layout sidebar gauche (thèmes) + frame droite (Q/R du thème actif).
  // Pas de scroll latéral, pas de scroll vertical excessif. Mobile : sidebar
  // bascule en barre horizontale scrollable.
  const [active, setActive] = useState<string>(data.categories[0]?.key ?? "");
  const activeCat =
    data.categories.find((c) => c.key === active) ?? data.categories[0];

  // V28 — Comportement accordion : un seul Q/A ouvert à la fois dans le
  // thème actif. Quand on change de thème, l'index est reset à null pour
  // que le nouvel onglet s'ouvre tout fermé (l'utilisateur choisit ce qui
  // l'intéresse). Index = numéro de la question dans `activeCat.items`.
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  useEffect(() => {
    setOpenIndex(null);
  }, [active]);

  return (
    <div>
      <p
        style={{
          fontSize: 14,
          color: "#6B5A47",
          lineHeight: 1.65,
          marginBottom: 16,
        }}
      >
        {data.intro}
      </p>

      {/* styled-jsx : un seul <style jsx> par composant, fusionné ici */}
      <style jsx>{`
        .bmd-faq-layout {
          display: grid;
          grid-template-columns: 220px 1fr;
          gap: 22px;
          align-items: start;
        }
        @media (max-width: 768px) {
          .bmd-faq-layout {
            grid-template-columns: 1fr;
            gap: 14px;
          }
          .bmd-faq-nav {
            flex-direction: row !important;
            overflow-x: auto;
            position: static !important;
            top: auto !important;
            gap: 6px !important;
            padding: 6px !important;
            scrollbar-width: thin;
          }
          .bmd-faq-nav button {
            flex-shrink: 0;
          }
        }
      `}</style>

      <div className="bmd-faq-layout">
        {/* Sidebar des thèmes */}
        <nav
          role="tablist"
          aria-label="FAQ topics"
          className="bmd-faq-nav"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            background:
              "linear-gradient(180deg, #FFFFFF 0%, #FBF6EC 100%)",
            border: "1px solid rgba(197,138,46,0.22)",
            borderRadius: 14,
            padding: 8,
            position: "sticky",
            top: 80,
            boxShadow: "0 6px 24px rgba(43,31,21,0.06)",
          }}
        >
          {data.categories.map((cat) => {
            const isActive = active === cat.key;
            return (
              <button
                key={cat.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActive(cat.key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  textAlign: "left",
                  background: isActive
                    ? "linear-gradient(135deg, #C58A2E, #B5462E)"
                    : "transparent",
                  color: isActive ? "#FFFFFF" : "#2B1F15",
                  border: isActive
                    ? "1px solid rgba(197,138,46,0.40)"
                    : "1px solid transparent",
                  transition: "all 0.15s ease",
                  whiteSpace: "nowrap",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 22,
                    height: 22,
                  }}
                >
                  <Icon
                    name={emojiToIcon(cat.icon)}
                    size={16}
                    color={isActive ? "#FFFFFF" : "#C58A2E"}
                    strokeWidth={1.8}
                  />
                </span>
                <span>{cat.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Frame Q/R actif */}
        <div
          role="tabpanel"
          style={{
            background:
              "linear-gradient(180deg, #FFFFFF 0%, #FBF6EC 100%)",
            border: "1px solid rgba(197,138,46,0.22)",
            borderRadius: 16,
            padding: "16px 18px",
            minHeight: 320,
            boxShadow: "0 6px 24px rgba(43,31,21,0.06)",
          }}
        >
          {activeCat && (
            <>
              <h3
                style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: "clamp(20px, 2.4vw, 24px)",
                  fontWeight: 600,
                  color: "#2B1F15",
                  margin: "0 0 14px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    display: "inline-flex",
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    background: "rgba(197,138,46,0.12)",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#C58A2E",
                  }}
                >
                  <Icon
                    name={emojiToIcon(activeCat.icon)}
                    size={20}
                    color="#C58A2E"
                    strokeWidth={1.8}
                  />
                </span>
                {activeCat.label}
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {activeCat.items.map((q, i) => {
                  const isOpen = openIndex === i;
                  return (
                    <details
                      key={i}
                      open={isOpen}
                      style={{
                        background: "#FFFFFF",
                        border: "1px solid rgba(197,138,46,0.18)",
                        borderRadius: 10,
                        padding: "10px 14px",
                      }}
                    >
                      <summary
                        onClick={(e) => {
                          // V28 — On intercepte le toggle natif pour que
                          // React contrôle l'état (`open` est géré via
                          // openIndex). Sans preventDefault, le navigateur
                          // toggle aussi, ce qui crée un état incohérent.
                          e.preventDefault();
                          setOpenIndex((prev) => (prev === i ? null : i));
                        }}
                        style={{
                          cursor: "pointer",
                          fontWeight: 600,
                          fontSize: 13.5,
                          color: "#2B1F15",
                          listStyle: "none",
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          lineHeight: 1.4,
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            color: "#C58A2E",
                            fontWeight: 700,
                            fontSize: 17,
                            lineHeight: 1,
                            width: 16,
                            flexShrink: 0,
                            // V28 — rotation du « + » en « × » pour indiquer
                            // visuellement qu'un clic referme la question.
                            transform: isOpen
                              ? "rotate(45deg)"
                              : "rotate(0deg)",
                            transition: "transform 0.18s ease",
                            display: "inline-block",
                          }}
                        >
                          +
                        </span>
                        {q.q}
                      </summary>
                      <p
                        style={{
                          marginTop: 8,
                          marginLeft: 26,
                          color: "#6B5A47",
                          fontSize: 12.5,
                          lineHeight: 1.65,
                        }}
                      >
                        {q.a}
                      </p>
                    </details>
                  );
                })}
              </div>
              <div
                style={{
                  marginTop: 14,
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: "rgba(197,138,46,0.10)",
                  border: "1px solid rgba(197,138,46,0.22)",
                  fontSize: 12,
                  color: "#6B5A47",
                  lineHeight: 1.55,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Icon name="phone" size={14} color="#C58A2E" strokeWidth={1.8} />
                <span>{renderContactNudge(data.contactNudge, supportEmail)}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}



/**
 * V23 — Remplace toute occurrence de l'email par défaut (hello@backmesdo.com)
 * dans une chaîne FAQ par la valeur configurée côté admin, et rend le résultat
 * en cliquable mailto: lorsque l'email est présent.
 *
 * Pourquoi : les chaînes traduites des 27 locales ont `hello@backmesdo.com`
 * littéralement dans `contactNudge`. Plutôt que de toucher 27 traductions
 * et risquer de casser les espaces/ponctuations, on remplace au render.
 */
function renderContactNudge(
  text: string,
  email: string,
): React.ReactNode {
  const DEFAULT = "hello@backmesdo.com";
  // Si l'admin n'a pas changé l'email, on linkify quand même la valeur par défaut
  const target = email || DEFAULT;
  const parts = text.split(DEFAULT);
  if (parts.length <= 1) {
    // Pas trouvé — affiche le texte tel quel + un mailto séparé en fallback
    return (
      <>
        {text}{" "}
        <a
          href={`mailto:${target}`}
          style={{ color: "#C58A2E", fontWeight: 600 }}
        >
          {target}
        </a>
      </>
    );
  }
  // Reconstruit le texte avec un mailto cliquable à chaque occurrence
  const out: React.ReactNode[] = [];
  parts.forEach((p, i) => {
    out.push(<span key={`p-${i}`}>{p}</span>);
    if (i < parts.length - 1) {
      out.push(
        <a
          key={`m-${i}`}
          href={`mailto:${target}`}
          style={{ color: "#C58A2E", fontWeight: 600 }}
        >
          {target}
        </a>,
      );
    }
  });
  return <>{out}</>;
}

/**
 * <StorySection> · le 1er onglet du site vitrine — narrative.
 *
 * Layout : punchline héro centrée, 3 chapitres en grid (problème →
 * tension → solution), manifesto en bas, CTA. Pas de scroll vertical
 * sur desktop (1180×~620 max) ; sur mobile, empilement naturel.
 */
function StorySection({
  data,
}: {
  data: NonNullable<MarketingStrings["story"]>;
}): JSX.Element {
  // V173 — Mapping emoji story → icône V45 SVG pro
  const storyIconMap: Record<number, IconName> = {
    0: "globe", // 🌍 Le problème
    1: "users", // 💔 La tension (humain/relations)
    2: "sparkles", // 🕊 La solution (paix / magie)
  };
  return (
    <div>
      {/* Punchline héro */}
      <p
        style={{
          fontSize: "clamp(17px, 2vw, 21px)",
          color: "#2B1F15",
          lineHeight: 1.55,
          fontWeight: 500,
          marginBottom: 32,
          maxWidth: 920,
          fontStyle: "italic",
        }}
      >
        {data.punchline}
      </p>

      {/* 3 chapitres en grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 18,
          marginBottom: 28,
        }}
      >
        {data.chapters.map((c, i) => (
          <div
            key={i}
            style={{
              background:
                "linear-gradient(180deg, #FFFFFF 0%, #FBF6EC 100%)",
              border: "1px solid rgba(197,138,46,0.22)",
              borderRadius: 16,
              padding: "22px 20px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              boxShadow: "0 6px 24px rgba(43,31,21,0.06)",
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                background:
                  "linear-gradient(135deg, rgba(197,138,46,0.22), rgba(159,70,40,0.14))",
                border: "1px solid rgba(197,138,46,0.30)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#C58A2E",
              }}
              aria-hidden="true"
            >
              <Icon
                name={storyIconMap[i] ?? "sparkles"}
                size={26}
                color="#C58A2E"
                strokeWidth={1.8}
              />
            </div>
            <h3
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 22,
                fontWeight: 600,
                color: "#C58A2E",
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              {c.title}
            </h3>
            <p
              style={{
                fontSize: 13.5,
                color: "#6B5A47",
                lineHeight: 1.65,
                margin: 0,
              }}
            >
              {c.body}
            </p>
          </div>
        ))}
      </div>

      {/* Manifesto + CTA — bandeau ivory chic */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          flexWrap: "wrap",
          padding: "22px 26px",
          borderRadius: 18,
          background:
            "radial-gradient(700px 280px at 30% 50%, rgba(197,138,46,0.18), transparent 60%), linear-gradient(180deg, #FFFFFF 0%, #FBF6EC 100%)",
          border: "1px solid rgba(197,138,46,0.32)",
          boxShadow: "0 10px 30px rgba(43,31,21,0.06)",
        }}
      >
        <p
          style={{
            flex: 1,
            minWidth: 240,
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: "clamp(18px, 2.2vw, 24px)",
            color: "#2B1F15",
            lineHeight: 1.4,
            margin: 0,
            fontStyle: "italic",
          }}
        >
          {data.manifesto}
        </p>
        <Link
          href="/login"
          style={{
            background: "linear-gradient(135deg, #C58A2E, #B5462E)",
            color: "#FFFFFF",
            padding: "14px 24px",
            borderRadius: 12,
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 700,
            minHeight: 48,
            display: "inline-flex",
            alignItems: "center",
            letterSpacing: 0.3,
            boxShadow: "0 10px 26px rgba(197,138,46,0.30)",
            flexShrink: 0,
          }}
        >
          {data.cta} →
        </Link>
      </div>
    </div>
  );
}

function BmdLogo({ size = 64 }: { size?: number }): JSX.Element {
  // Logo simplifié inline — fidèle au BMD_logo.svg fourni
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={{ flexShrink: 0 }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="bmdLogoGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F4E4C1" />
          <stop offset="40%" stopColor="#E8A33D" />
          <stop offset="100%" stopColor="#B5462E" />
        </linearGradient>
        <radialGradient id="bmdLogoBg" cx="0.3" cy="0.3" r="0.9">
          <stop offset="0%" stopColor="#2A2244" />
          <stop offset="100%" stopColor="#0E0B14" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#bmdLogoBg)" />
      <circle
        cx="50"
        cy="50"
        r="48"
        fill="none"
        stroke="url(#bmdLogoGrad)"
        strokeWidth="0.7"
      />
      <circle
        cx="50"
        cy="50"
        r="44"
        fill="none"
        stroke="#E8A33D"
        strokeWidth="0.2"
        strokeDasharray="0.8 1"
        opacity="0.5"
      />
      <polygon
        points="50,18 76,33 76,67 50,82 24,67 24,33"
        fill="none"
        stroke="url(#bmdLogoGrad)"
        strokeWidth="1.2"
      />
      <polygon
        points="50,25 70,36 70,64 50,75 30,64 30,36"
        fill="#0E0B14"
        opacity="0.85"
        stroke="#E8A33D"
        strokeWidth="0.2"
        strokeDasharray="0.5 0.5"
      />
      <text
        x="50"
        y="56"
        textAnchor="middle"
        fontFamily="'Cormorant Garamond', Georgia, serif"
        fontSize="18"
        fontWeight="700"
        fill="url(#bmdLogoGrad)"
        letterSpacing="0.5"
      >
        BMD
      </text>
      <text
        x="50"
        y="65"
        textAnchor="middle"
        fontFamily="'Inter', sans-serif"
        fontSize="3"
        letterSpacing="1.5"
        fill="#E8A33D"
        opacity="0.85"
      >
        BACK·MES·DO
      </text>
      <polygon
        points="50,12 51,15 54,15 51.5,17 52.5,20 50,18.5 47.5,20 48.5,17 46,15 49,15"
        fill="#E8A33D"
      />
    </svg>
  );
}

function SectionDivider({
  kicker,
  title,
}: {
  kicker: string;
  title: string;
}): JSX.Element {
  return (
    <div
      style={{
        maxWidth: 1380,
        margin: "0 auto",
        padding: "0 24px",
      }}
    >
      <div
        style={{
          margin: "24px 0 16px",
          paddingBottom: 10,
          borderBottom: "1px solid rgba(244,228,193,0.08)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              letterSpacing: 2.5,
              color: "var(--gold)",
              textTransform: "uppercase",
              fontWeight: 700,
              marginBottom: 2,
            }}
          >
            {kicker}
          </div>
          <h2
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "clamp(20px, 2.6vw, 26px)",
              fontWeight: 600,
              color: "var(--cream)",
            }}
          >
            {title}
          </h2>
        </div>
      </div>
    </div>
  );
}

function BrowserFrame({
  url,
  children,
}: {
  url: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="browser">
      <div className="browser-bar">
        <div className="dot r" />
        <div className="dot y" />
        <div className="dot g" />
        <div className="url-bar">
          🔒 <b>{url.split(".")[0]}</b>
          {url.slice(url.indexOf("."))}
        </div>
      </div>
      {children}
    </div>
  );
}

function LoginMock({
  locale,
  t,
  rtl,
}: {
  locale: Locale;
  t: any;
  rtl: boolean;
}): JSX.Element {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        minHeight: 480,
      }}
      className="login-mock-grid"
    >
      <style jsx>{`
        @media (max-width: 768px) {
          .login-mock-grid {
            grid-template-columns: 1fr !important;
          }
          .login-mock-left {
            display: none !important;
          }
        }
      `}</style>
      <div
        className="login-mock-left"
        style={{
          background:
            "radial-gradient(700px 500px at 30% 30%, rgba(232,163,61,0.12), transparent 60%), linear-gradient(135deg, #1E1830, #0E0B14)",
          padding: "44px 36px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          gap: 24,
          borderRight: "1px solid var(--line-soft)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <BmdLogo size={36} />
          <div
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 22,
              fontWeight: 700,
              color: "var(--cream)",
            }}
          >
            BMD<span style={{ color: "var(--saffron)" }}>·</span>
          </div>
        </div>
        <div>
          <h2
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 36,
              fontWeight: 600,
              color: "var(--cream)",
              lineHeight: 1.1,
              marginBottom: 14,
            }}
          >
            {locale === "fr" ? (
              <>
                Te reconnecter,
                <br />
                en{" "}
                <em style={{ color: "var(--saffron)", fontStyle: "normal" }}>
                  30 secondes.
                </em>
              </>
            ) : (
              <>
                Sign in,
                <br />
                in{" "}
                <em style={{ color: "var(--saffron)", fontStyle: "normal" }}>
                  30 seconds.
                </em>
              </>
            )}
          </h2>
          <p
            style={{
              color: "var(--cream-soft)",
              fontSize: 13,
              lineHeight: 1.7,
              marginBottom: 20,
            }}
          >
            {locale === "fr"
              ? "Aucun mot de passe. Aucune fioriture. Tu choisis ton numéro ou ton email, on t'envoie un code, et tu retrouves toute ton activité."
              : "No password. No fluff. Pick your number or email, we send a code, and you're back to all your activity."}
          </p>
          {[
            { ic: "⚡", label: locale === "fr" ? "OTP en 1 étape · 0 mot de passe" : "1-step OTP · 0 passwords" },
            { ic: "📱", label: locale === "fr" ? "Téléphone OU email" : "Phone OR email" },
            { ic: "✓", label: locale === "fr" ? "Tous les contacts vérifiés" : "All contacts verified" },
          ].map((f, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 12,
                color: "var(--cream-soft)",
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 8,
                  background: "rgba(232,163,61,0.12)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--saffron)",
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                {f.ic}
              </div>
              {f.label}
            </div>
          ))}
        </div>
      </div>
      <div
        style={{
          padding: "44px 36px",
          background: "var(--night-2)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          justifyContent: "center",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 22,
              color: "var(--cream)",
              fontWeight: 600,
            }}
          >
            {locale === "fr" ? "Bon retour" : "Welcome back"}
          </div>
          <div
            style={{
              color: "var(--muted)",
              fontSize: 12,
              marginTop: 4,
            }}
          >
            {locale === "fr"
              ? "Entre ton numéro · code par SMS ou WhatsApp"
              : "Enter your phone · code by SMS or WhatsApp"}
          </div>
        </div>
        <div>
          <div
            style={{
              fontSize: 10,
              color: "var(--muted)",
              textTransform: "uppercase",
              letterSpacing: 1.5,
              fontWeight: 700,
              marginBottom: 6,
            }}
          >
            {locale === "fr" ? "Numéro de téléphone" : "Phone number"}
          </div>
          <div
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid #E8A33D",
              borderRadius: 10,
              padding: 12,
              boxShadow: "0 0 0 3px rgba(232,163,61,0.12)",
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 14,
              color: "var(--cream)",
            }}
          >
            <span
              style={{
                fontWeight: 600,
                paddingRight: 8,
                borderRight: "1px solid var(--line-soft)",
              }}
            >
              🇫🇷 +33
            </span>
            <span style={{ flex: 1 }}>6 12 34 56 78</span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: "3px 8px",
                borderRadius: 99,
                background: "rgba(63,125,92,0.15)",
                color: "var(--emerald-soft)",
                border: "1px solid rgba(63,125,92,0.3)",
              }}
            >
              ✓ {locale === "fr" ? "Reconnu" : "Recognized"}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div
            style={{
              flex: 1,
              padding: "12px 16px",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
              textAlign: "center",
              background: "linear-gradient(135deg, #E8A33D, #B5462E)",
              color: "var(--night-2)",
              boxShadow: "0 12px 32px rgba(232,163,61,0.25)",
            }}
          >
            📱 SMS
          </div>
          <div
            style={{
              flex: 1,
              padding: "12px 16px",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              textAlign: "center",
              background: "rgba(255,255,255,0.04)",
              color: "var(--cream)",
              border: "1px solid rgba(244,228,193,0.08)",
            }}
          >
            💬 WhatsApp
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            color: "var(--muted)",
            fontSize: 10,
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          <div style={{ flex: 1, height: 1, background: "rgba(244,228,193,0.08)" }} />
          {locale === "fr" ? "ou" : "or"}
          <div style={{ flex: 1, height: 1, background: "rgba(244,228,193,0.08)" }} />
        </div>
        <div
          style={{
            fontSize: 11,
            textAlign: "center",
            color: "var(--muted)",
          }}
        >
          {locale === "fr"
            ? "Pas encore de compte ? "
            : "No account yet? "}
          <span style={{ color: "#C58A2E", fontWeight: 600 }}>
            {locale === "fr" ? "Créer gratuitement" : "Sign up free"}
          </span>
        </div>
      </div>
    </div>
  );
}

function PricingCard({
  highlight,
  name,
  price,
  features,
  cta,
  ctaHref,
  disabled,
}: {
  highlight?: boolean;
  name: string;
  price: string;
  features: string[];
  cta: string;
  ctaHref?: string;
  disabled?: boolean;
}): JSX.Element {
  return (
    <div
      style={{
        background:
          "linear-gradient(180deg, rgba(42,34,68,0.4), rgba(22,17,30,0.6))",
        border: highlight
          ? "1.5px solid #E8A33D"
          : "1px solid rgba(244,228,193,0.08)",
        borderRadius: 18,
        padding: 28,
        opacity: disabled ? 0.7 : 1,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: highlight ? "#E8A33D" : "#8A7B6B",
          fontWeight: 700,
          marginBottom: 6,
          letterSpacing: 2,
          textTransform: "uppercase",
        }}
      >
        {name}
      </div>
      <div
        style={{
          fontSize: highlight ? 44 : 32,
          fontFamily: "'Cormorant Garamond', serif",
          fontWeight: 700,
          marginBottom: 18,
          color: "var(--cream)",
        }}
      >
        {price}
      </div>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: "0 0 20px",
          fontSize: 13,
          lineHeight: 2,
          color: "var(--cream-soft)",
        }}
      >
        {features.map((f, i) => (
          <li key={i}>
            <span style={{ color: "var(--saffron)", marginRight: 6 }}>✓</span>
            {f}
          </li>
        ))}
      </ul>
      {ctaHref && !disabled ? (
        <Link
          href={ctaHref}
          style={{
            display: "block",
            background: "linear-gradient(135deg, #E8A33D, #B5462E)",
            color: "var(--night-2)",
            padding: "14px",
            borderRadius: 10,
            textDecoration: "none",
            textAlign: "center",
            fontWeight: 700,
            minHeight: 48,
          }}
        >
          {cta}
        </Link>
      ) : (
        <div
          style={{
            background: "rgba(255,255,255,0.05)",
            color: "var(--muted)",
            padding: "14px",
            borderRadius: 10,
            textAlign: "center",
            fontWeight: 700,
            minHeight: 48,
          }}
        >
          {cta}
        </div>
      )}
    </div>
  );
}

type LangGroupKey = "european" | "asian" | "arabic" | "african";

function LangPicker({
  locale,
  rtl,
  show,
  setShow,
  onChange,
  t,
}: {
  locale: Locale;
  rtl: boolean;
  show: boolean;
  setShow: (v: boolean) => void;
  onChange: (l: Locale) => void;
  t: MarketingStrings;
}): JSX.Element {
  // V19 — 5 groupes : Main (FR+EN toujours visibles) + 4 sous-groupes
  // repliables (Européennes / Asiatiques / Arabes / Africaines).
  //
  // V27 — Comportement accordion : un seul groupe ouvert à la fois
  // (cliquer un autre referme le précédent), et le picker entier se referme
  // si l'utilisateur clique ailleurs sur la page.
  //
  // Auto-ouverture initiale : si la locale active appartient à un sous-groupe,
  // ce groupe est ouvert au mount.
  const initialGroup: LangGroupKey | null = EUROPEAN_LOCALES.includes(locale)
    ? "european"
    : ASIAN_LOCALES.includes(locale)
      ? "asian"
      : ARABIC_LOCALES.includes(locale)
        ? "arabic"
        : AFRICAN_LOCALES.includes(locale)
          ? "african"
          : null;
  const [openGroup, setOpenGroup] = useState<LangGroupKey | null>(initialGroup);

  /** Toggle "accordion" : ouvrir un groupe ferme automatiquement le précédent. */
  const toggleGroup = (key: LangGroupKey) => {
    setOpenGroup((prev) => (prev === key ? null : key));
  };

  // V27 — Référence au container du picker (bouton + dropdown) pour détecter
  // les clics extérieurs. Quand l'utilisateur clique en dehors → on referme
  // le dropdown ET on replie tous les groupes (état reset à null).
  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!show) return; // pas besoin de listener si fermé
    function handlePointerDown(ev: MouseEvent | TouchEvent) {
      const target = ev.target as Node | null;
      if (!target) return;
      if (containerRef.current && containerRef.current.contains(target)) {
        return; // clic à l'intérieur — ne rien faire
      }
      setShow(false);
      setOpenGroup(null);
    }
    function handleEscape(ev: KeyboardEvent) {
      if (ev.key === "Escape") {
        setShow(false);
        setOpenGroup(null);
      }
    }
    // mousedown + touchstart pour couvrir desktop ET mobile, capture pour
    // attraper le clic même si un autre handler le `stopPropagation`.
    document.addEventListener("mousedown", handlePointerDown, true);
    document.addEventListener("touchstart", handlePointerDown, true);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown, true);
      document.removeEventListener("touchstart", handlePointerDown, true);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [show, setShow]);

  const lp = t.langPicker;
  const labels = {
    main: lp?.main ?? "Main languages",
    european: lp?.europeanGroup ?? "European languages",
    asian: lp?.asianGroup ?? "Asian languages",
    arabic: lp?.arabicGroup ?? "Arabic languages",
    african: lp?.africanGroup ?? "African languages",
  };

  /** Bouton item d'une locale dans une liste. */
  const renderItem = (l: Locale, indented = false) => (
    <button
      key={l}
      onClick={() => onChange(l)}
      style={{
        display: "block",
        width: "100%",
        textAlign: rtl ? "right" : "left",
        background: l === locale ? "rgba(232,163,61,0.15)" : "transparent",
        border: "none",
        padding: indented ? "9px 16px" : "9px 12px",
        color: l === locale ? "var(--saffron)" : "var(--cream)",
        cursor: "pointer",
        borderRadius: 8,
        fontSize: 13,
        minHeight: 38,
        fontFamily: "inherit",
      }}
    >
      {LOCALE_FLAGS[l]} {LOCALE_NAMES[l]}
    </button>
  );

  /** Bouton entête d'un sous-groupe (en-tête repliable). */
  const renderGroupHeader = (
    icon: string,
    label: string,
    open: boolean,
    setOpen: (v: boolean) => void,
  ) => (
    <button
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        textAlign: rtl ? "right" : "left",
        background: "transparent",
        border: "none",
        padding: "9px 12px",
        color: "var(--cream-soft)",
        cursor: "pointer",
        borderRadius: 8,
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 1.2,
        fontFamily: "inherit",
        minHeight: 36,
      }}
    >
      <span>
        {icon} {label}
      </span>
      <span
        style={{
          fontSize: 14,
          transform: open ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform 0.18s ease",
        }}
        aria-hidden="true"
      >
        ▾
      </span>
    </button>
  );

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        onClick={() => {
          // V27 — Toggle d'ouverture du picker. Si on referme manuellement
          // le picker via son bouton, on replie aussi tous les groupes.
          if (show) {
            setShow(false);
            setOpenGroup(null);
          } else {
            setShow(true);
          }
        }}
        aria-label="Change language"
        aria-expanded={show}
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(244,228,193,0.08)",
          borderRadius: 10,
          padding: "8px 12px",
          color: "var(--cream)",
          cursor: "pointer",
          fontSize: 13,
          minHeight: 40,
        }}
      >
        {LOCALE_FLAGS[locale]} {LOCALE_NAMES[locale]} ▾
      </button>
      {show && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            ...(rtl ? { left: 0 } : { right: 0 }),
            background: "var(--indigo)",
            border: "1px solid rgba(232,163,61,0.18)",
            borderRadius: 10,
            padding: 4,
            minWidth: 240,
            maxHeight: "min(75vh, 560px)",
            overflowY: "auto",
            zIndex: 100,
            boxShadow: "0 12px 30px rgba(0,0,0,0.4)",
          }}
        >
          {/* === Main : FR + EN toujours visibles === */}
          <div
            style={{
              padding: "8px 10px 4px",
              fontSize: 10,
              color: "var(--muted)",
              textTransform: "uppercase",
              letterSpacing: 1.2,
              fontWeight: 700,
            }}
          >
            {labels.main}
          </div>
          {MAIN_LOCALES.map((l) => renderItem(l))}

          {/* === Européennes === */}
          <div
            style={{
              marginTop: 6,
              borderTop: "1px solid rgba(244,228,193,0.08)",
              paddingTop: 4,
            }}
          >
            {renderGroupHeader(
              "🇪🇺",
              labels.european,
              openGroup === "european",
              () => toggleGroup("european"),
            )}
            {openGroup === "european" &&
              EUROPEAN_LOCALES.map((l) => renderItem(l, true))}
          </div>

          {/* === Asiatiques === */}
          <div
            style={{
              borderTop: "1px solid rgba(244,228,193,0.08)",
              paddingTop: 4,
            }}
          >
            {renderGroupHeader(
              "🌏",
              labels.asian,
              openGroup === "asian",
              () => toggleGroup("asian"),
            )}
            {openGroup === "asian" &&
              ASIAN_LOCALES.map((l) => renderItem(l, true))}
          </div>

          {/* === Arabes === */}
          <div
            style={{
              borderTop: "1px solid rgba(244,228,193,0.08)",
              paddingTop: 4,
            }}
          >
            {renderGroupHeader(
              "☪️",
              labels.arabic,
              openGroup === "arabic",
              () => toggleGroup("arabic"),
            )}
            {openGroup === "arabic" &&
              ARABIC_LOCALES.map((l) => renderItem(l, true))}
          </div>

          {/* === Africaines (12 langues) === */}
          <div
            style={{
              borderTop: "1px solid rgba(244,228,193,0.08)",
              paddingTop: 4,
            }}
          >
            {renderGroupHeader(
              "🌍",
              labels.african,
              openGroup === "african",
              () => toggleGroup("african"),
            )}
            {openGroup === "african" &&
              AFRICAN_LOCALES.map((l) => renderItem(l, true))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Met le dernier mot du headline en italique saffron pour ce style maquette. */
function emphasizeLast(text: string): string {
  const parts = text.trim().split(/\s+/);
  if (parts.length < 2) return text;
  const last = parts.pop()!;
  return `${parts.join(" ")} <em>${last}</em>`;
}

/* =================================================================
 * MOBILE WELCOME — écran d'accueil de l'app sur téléphone / PWA
 * =================================================================
 * Inspiré directement de la maquette BMD_maquettes.html :
 *  - Fond night avec halos radiaux saffron/terracotta
 *  - Logo BMD médaillon centré (gradient + cercle pointillé)
 *  - Titre Cormorant Garamond avec dernier mot en italique saffron
 *  - Tagline en gold/letterspacing
 *  - 2 CTA empilés : "Se connecter" (saffron) + "Découvrir BMD" (lien vers le site)
 *  - Sélecteur de langue discret en haut à droite
 *
 * Pas de site vitrine sur mobile — c'est une expérience "app native".
 * L'utilisateur peut quand même cliquer "Découvrir BMD" pour accéder à la
 * version site complète si besoin (forçage via param ?site=1).
 */
function MobileWelcome({
  t,
  locale,
  rtl,
  isLogged,
  showLangMenu,
  setShowLangMenu,
  onChangeLocale,
}: {
  t: any;
  locale: Locale;
  rtl: boolean;
  isLogged: boolean;
  showLangMenu: boolean;
  setShowLangMenu: (v: boolean) => void;
  onChangeLocale: (l: Locale) => void;
}): JSX.Element {
  return (
    <div
      dir={rtl ? "rtl" : "ltr"}
      style={{
        // 100dvh = viewport dynamique (gère barre d'adresse mobile);
        // 100vh en fallback CSS via la classe ci-dessous si le navigateur
        // ne supporte pas dvh. On préfère dvh pour iOS Safari.
        minHeight: "100dvh",
        background:
          "radial-gradient(900px 600px at 10% -10%, rgba(232,163,61,0.12), transparent 60%), " +
          "radial-gradient(900px 600px at 110% 10%, rgba(181,70,46,0.1), transparent 60%), " +
          "radial-gradient(1200px 800px at 50% 120%, rgba(63,125,92,0.06), transparent 60%), " +
          "linear-gradient(180deg, var(--night) 0%, var(--indigo) 100%)",
        color: "var(--cream)",
        fontFamily:
          "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        // Safe-area iOS (notch / home indicator)
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)",
        paddingLeft: "calc(env(safe-area-inset-left, 0px) + 24px)",
        paddingRight: "calc(env(safe-area-inset-right, 0px) + 24px)",
      }}
    >
      {/* Bandeau bogolan décoratif (style maquette) */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "repeating-linear-gradient(45deg, rgba(232,163,61,0.025) 0 2px, transparent 2px 22px)",
          pointerEvents: "none",
        }}
      />

      {/* Top : sélecteur de langue à droite + bouton thème (RTL flippe à gauche) */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          position: "relative",
          zIndex: 2,
        }}
      >
        <ThemeToggle
          variant="ghost"
          labelDark={
            locale === "fr" ? "Passer en mode clair" : "Switch to light mode"
          }
          labelLight={
            locale === "fr" ? "Passer en mode sombre" : "Switch to dark mode"
          }
        />
        <LangPicker
          locale={locale}
          rtl={rtl}
          show={showLangMenu}
          setShow={setShowLangMenu}
          onChange={onChangeLocale}
          t={t}
        />
      </div>

      {/* Bloc central : logo + titre + tagline */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          gap: 24,
          padding: "32px 8px",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Logo médaillon (style maquette mobile : cercle sombre + halo) */}
        <div
          style={{
            width: 220,
            height: 220,
            borderRadius: "50%",
            background:
              "radial-gradient(circle at 30% 30%, #2A2244, #16111E 70%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow:
              "0 30px 80px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(232,163,61,0.3)",
            position: "relative",
            // Cercle pointillé interne
            outline: "1px dashed rgba(232,163,61,0.35)",
            outlineOffset: -14,
          }}
        >
          <BmdLogo size={170} />
        </div>

        <div>
          <div
            style={{
              fontSize: 11,
              letterSpacing: 4,
              color: "var(--gold)",
              textTransform: "uppercase",
              fontWeight: 700,
              marginBottom: 12,
            }}
          >
            Back · Mes · Do
          </div>
          <h1
            style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontSize: "clamp(28px, 8vw, 38px)",
              fontWeight: 600,
              lineHeight: 1.15,
              margin: 0,
              color: "var(--cream)",
            }}
            dangerouslySetInnerHTML={{
              __html: emphasizeLast(t.hero.headline),
            }}
          />
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              color: "var(--cream-soft)",
              marginTop: 16,
              maxWidth: 340,
            }}
          >
            {locale === "fr"
              ? "Tontines, colocs, voyages… BMD calcule, simplifie et trace chaque dépense pour que personne ne se sente lésé."
              : t.hero.subhead}
          </p>
        </div>
      </div>

      {/* CTAs en bas (style "vraie app") */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          position: "relative",
          zIndex: 1,
        }}
      >
        {isLogged ? (
          <Link
            href="/dashboard"
            style={{
              background: "linear-gradient(135deg, #E8A33D, #B5462E)",
              color: "var(--night-2)",
              padding: "16px 24px",
              borderRadius: 14,
              textDecoration: "none",
              fontSize: 16,
              fontWeight: 700,
              textAlign: "center",
              minHeight: 52,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 12px 32px rgba(232,163,61,0.3)",
              letterSpacing: 0.3,
            }}
          >
            {locale === "fr"
              ? "Ouvrir mon espace →"
              : `${t.nav.login} →`}
          </Link>
        ) : (
          <>
            <Link
              href="/login"
              style={{
                background: "linear-gradient(135deg, #E8A33D, #B5462E)",
                color: "var(--night-2)",
                padding: "16px 24px",
                borderRadius: 14,
                textDecoration: "none",
                fontSize: 16,
                fontWeight: 700,
                textAlign: "center",
                minHeight: 52,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 12px 32px rgba(232,163,61,0.3)",
                letterSpacing: 0.3,
              }}
            >
              {t.nav.login} →
            </Link>
            <Link
              href="/login"
              style={{
                background: "rgba(255,255,255,0.04)",
                color: "var(--cream)",
                padding: "14px 24px",
                borderRadius: 14,
                textDecoration: "none",
                fontSize: 14,
                fontWeight: 600,
                textAlign: "center",
                minHeight: 48,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid rgba(244,228,193,0.08)",
              }}
            >
              ＋ {t.nav.signUp}
            </Link>
          </>
        )}

        {/* Petite mention CGU/Privacy en pied (style mobile) */}
        <div
          style={{
            fontSize: 11,
            color: "var(--muted)",
            textAlign: "center",
            marginTop: 8,
            lineHeight: 1.5,
          }}
        >
          {locale === "fr"
            ? "En continuant tu acceptes notre "
            : "By continuing you agree to our "}
          <Link
            href="/legal/privacy"
            style={{
              color: "var(--saffron)",
              textDecoration: "none",
            }}
          >
            {t.footer.privacy.toLowerCase()}
          </Link>
          .
        </div>
      </div>
    </div>
  );
}

/**
 * Phone-frame avec preview dashboard fidèle à la maquette BMD_site_web.html.
 *
 * Reproduit :
 *  - Cadre téléphone avec notch noir
 *  - Écran avec greet + balance card (gradient indigo + halo) montrant
 *    +247,50€ / On vous doit / Vous devez
 *  - Quick actions 4 colonnes (Scanner / QR / Tontine / Chat)
 *  - Mes groupes (2 lignes)
 *  - Float-tags absolus : "Ticket scanné", "Tontine", "Bot WhatsApp"
 */
function PhoneFrameHero(): JSX.Element {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
      className="bmd-phone-hero"
    >
      <style jsx>{`
        @media (max-width: 900px) {
          .bmd-phone-hero {
            transform: scale(0.85);
          }
        }
        @media (max-width: 600px) {
          .bmd-phone-hero {
            transform: scale(0.75);
          }
        }
      `}</style>

      {/* Float tags décoratifs — V45-light */}
      <FloatTag
        title="Receipt scanned"
        subtitle="67,40 € · split in 4"
        iconName="receipt"
        position={{ top: 80, left: -40 }}
      />
      <FloatTag
        title="Tontine"
        subtitle="Tour 4/12 · 1 950 € collectés"
        iconName="coins"
        position={{ bottom: 120, right: -30 }}
      />
      <FloatTag
        title="Bot WhatsApp"
        subtitle="« +25 € resto » → noté"
        iconName="phone"
        position={{ top: "50%", right: -50 }}
      />

      {/* Phone frame — V45-light */}
      <div
        style={{
          width: 320,
          height: 640,
          borderRadius: 44,
          background: "linear-gradient(180deg, #2B1F15, #3A2A52)",
          padding: 12,
          boxShadow:
            "0 40px 90px rgba(43,31,21,0.35), 0 0 0 1px rgba(197,138,46,0.20)",
          position: "relative",
        }}
      >
        {/* Notch (reste noir, cohérent avec un vrai iPhone) */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            width: 120,
            height: 24,
            borderRadius: 16,
            background: "#000",
            zIndex: 5,
          }}
        />
        {/* Screen — V45-light */}
        <div
          style={{
            width: "100%",
            height: "100%",
            borderRadius: 32,
            background: "linear-gradient(180deg, #FFFFFF 0%, #FBF6EC 100%)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            padding: "44px 18px 18px",
            color: "#2B1F15",
          }}
        >
          <div style={{ fontSize: 11, color: "#6B5A47", opacity: 0.8 }}>
            Bonsoir,
          </div>
          <div
            style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontSize: 22,
              fontWeight: 600,
              marginBottom: 18,
              color: "#2B1F15",
            }}
          >
            Aïcha M.
          </div>

          {/* Balance card — ivory premium */}
          <div
            style={{
              background: "linear-gradient(135deg, #FBF6EC 0%, #F4ECD8 100%)",
              borderRadius: 20,
              padding: 18,
              border: "1px solid rgba(197,138,46,0.28)",
              position: "relative",
              overflow: "hidden",
              boxShadow: "0 6px 20px rgba(43,31,21,0.06)",
            }}
          >
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                right: -30,
                top: -30,
                width: 150,
                height: 150,
                borderRadius: "50%",
                background:
                  "radial-gradient(circle, rgba(197,138,46,0.22), transparent 70%)",
              }}
            />
            <div
              style={{
                fontSize: 9,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: "#6B5A47",
                opacity: 0.9,
                position: "relative",
              }}
            >
              Solde global
            </div>
            <div
              style={{
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontSize: 38,
                fontWeight: 600,
                color: "#1F7A57",
                marginTop: 4,
                position: "relative",
              }}
            >
              + 247,50
              <span style={{ color: "#C58A2E", fontSize: 20 }}>€</span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 10,
                marginTop: 12,
                position: "relative",
                gap: 4,
              }}
            >
              <span style={{ color: "#1F7A57", fontWeight: 600 }}>
                ↗ On vous doit 412 €
              </span>
              <span style={{ color: "#9F4628", fontWeight: 600 }}>
                ↘ Vous devez 165 €
              </span>
            </div>
          </div>

          {/* Quick actions — V45-light */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 6,
              marginTop: 14,
            }}
          >
            {[
              { ic: "camera" as IconName, lbl: "Scanner" },
              { ic: "scan-line" as IconName, lbl: "QR" },
              { ic: "coins" as IconName, lbl: "Tontine" },
              { ic: "bell" as IconName, lbl: "Notif" },
            ].map((q, i) => (
              <div
                key={i}
                style={{
                  background: "#FFFFFF",
                  border: "1px solid rgba(197,138,46,0.18)",
                  borderRadius: 12,
                  padding: "10px 4px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 9,
                  color: "#6B5A47",
                  textAlign: "center",
                }}
              >
                <Icon name={q.ic} size={16} color="#C58A2E" strokeWidth={1.8} />
                {q.lbl}
              </div>
            ))}
          </div>

          <div
            style={{
              fontSize: 9,
              color: "#8a7b6b",
              textTransform: "uppercase",
              letterSpacing: 2,
              marginTop: 16,
              marginBottom: 6,
            }}
          >
            Mes groupes
          </div>

          {[
            { ic: "coins" as IconName, n: "Tontine Bamiléké", m: "12 membres · Tour 4/12", a: "+200 €", c: "#1F7A57" },
            { ic: "home" as IconName, n: "Coloc Belleville", m: "4 membres", a: "-89 €", c: "#9F4628" },
          ].map((g, i) => (
            <div
              key={i}
              style={{
                marginTop: 6,
                background: "#FFFFFF",
                border: "1px solid rgba(197,138,46,0.18)",
                borderRadius: 12,
                padding: 10,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 9,
                  background: "rgba(197,138,46,0.14)",
                  color: "#C58A2E",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon name={g.ic} size={14} color="#C58A2E" strokeWidth={1.8} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#2B1F15",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {g.n}
                </div>
                <div style={{ fontSize: 9, color: "#8a7b6b" }}>{g.m}</div>
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: g.c,
                }}
              >
                {g.a}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FloatTag({
  title,
  subtitle,
  iconName,
  position,
}: {
  title: string;
  subtitle: string;
  iconName: IconName;
  position: React.CSSProperties;
}): JSX.Element {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        padding: "10px 14px",
        borderRadius: 12,
        background: "#FFFFFF",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        border: "1px solid rgba(197,138,46,0.30)",
        fontSize: 11,
        color: "#2B1F15",
        boxShadow: "0 12px 30px rgba(43,31,21,0.15)",
        display: "flex",
        alignItems: "center",
        gap: 8,
        zIndex: 3,
        maxWidth: 200,
        ...position,
      }}
      className="bmd-float-tag"
    >
      <style jsx>{`
        @media (max-width: 900px) {
          .bmd-float-tag {
            display: none;
          }
        }
      `}</style>
      <span
        style={{
          display: "inline-flex",
          width: 28,
          height: 28,
          borderRadius: 10,
          background: "rgba(197,138,46,0.14)",
          alignItems: "center",
          justifyContent: "center",
          color: "#C58A2E",
          flexShrink: 0,
        }}
      >
        <Icon name={iconName} size={16} color="#C58A2E" strokeWidth={1.8} />
      </span>
      <span>
        <strong style={{ display: "block", color: "#2B1F15" }}>{title}</strong>
        <span style={{ color: "#6B5A47" }}>{subtitle}</span>
      </span>
    </div>
  );
}
