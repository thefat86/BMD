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
import { useEffect, useState } from "react";
import Link from "next/link";
import { getToken } from "../lib/api-client";
import {
  detectLocale,
  isRtl,
  LOCALE_FLAGS,
  LOCALE_NAMES,
  LOCALES,
  Locale,
  setLocale,
  T,
} from "../lib/i18n/marketing-translations";

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

  useEffect(() => {
    setIsLogged(!!getToken());
    setLoc(detectLocale());

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
        /* Palette extraite directement des maquettes BMD_portail_web.html / BMD_maquettes.html */
        .bmd-mkt {
          --night: #0e0b14;
          --night-2: #16111e;
          --indigo: #1e1830;
          --indigo-2: #2a2244;
          --indigo-3: #3a2a52;
          --saffron: #e8a33d;
          --gold: #c9a24a;
          --terracotta: #b5462e;
          --emerald: #3f7d5c;
          --cream: #f4e4c1;
          --cream-soft: #e8d5b7;
          --muted: #8a7b6b;
          --line: rgba(232, 163, 61, 0.18);
          --line-soft: rgba(244, 228, 193, 0.08);
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
          background: #0e0b14;
          color: #f4e4c1;
          font-family:
            "Cormorant Garamond",
            Georgia,
            serif;
          font-size: 32px;
          font-weight: 700;
        }
        .bmd-marketing-loader span {
          color: #e8a33d;
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
        {/* ======== NAV ======== */}
        <nav
          style={{
            padding: "20px 24px",
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
                BMD<span style={{ color: "#E8A33D" }}>·</span>
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: "#C9A24A",
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
            <a
              href="#features"
              style={{ color: "var(--cream-soft)", textDecoration: "none" }}
            >
              {t.nav.features}
            </a>
            <a
              href="#communities"
              style={{ color: "var(--cream-soft)", textDecoration: "none" }}
            >
              {locale === "fr" ? "Communautés" : "Communities"}
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
            <a
              href="#faq"
              style={{ color: "var(--cream-soft)", textDecoration: "none" }}
            >
              FAQ
            </a>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <LangPicker
              locale={locale}
              rtl={rtl}
              show={showLangMenu}
              setShow={setShowLangMenu}
              onChange={changeLocale}
            />
            {isLogged ? (
              <Link
                href="/dashboard"
                style={{
                  background: "linear-gradient(135deg, #E8A33D, #B5462E)",
                  color: "#16111E",
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
                    color: "#F4E4C1",
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
                    color: "#16111E",
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
                  color: "#E8A33D",
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
                  color: "#F4E4C1",
                }}
                dangerouslySetInnerHTML={{
                  __html: emphasizeLast(t.hero.headline),
                }}
              />
              <p
                style={{
                  fontSize: 17,
                  lineHeight: 1.7,
                  color: "#E8D5B7",
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
                    color: "#16111E",
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
                    color: "#F4E4C1",
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
                      color: "#E8D5B7",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span style={{ fontSize: 18 }}>{s.ic}</span>
                    <span>
                      <strong
                        style={{
                          color: "#F4E4C1",
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
                        color: "#E8A33D",
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

        {/* ======== TRUST BAR (fidèle BMD_site_web.html) ======== */}
        <div
          id="communities"
          style={{
            padding: "24px 24px",
            borderTop: "1px solid rgba(244,228,193,0.08)",
            borderBottom: "1px solid rgba(244,228,193,0.08)",
            background: "rgba(22,17,30,0.5)",
            margin: "20px 0",
          }}
        >
          <div
            style={{
              maxWidth: 1300,
              margin: "0 auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 16,
            }}
          >
            <div
              style={{
                fontSize: 11,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: "#C9A24A",
                fontWeight: 600,
              }}
            >
              ↘ Fait pour les communautés qui se font confiance
            </div>
            <div
              style={{
                display: "flex",
                gap: 24,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              {[
                "🪙 Tontines",
                "🏠 Colocs",
                "✈️ Voyages",
                "💍 Mariages",
                "⚽ Clubs",
                "⛪ Associations",
              ].map((l) => (
                <span
                  key={l}
                  style={{
                    fontSize: 13,
                    color: "#E8D5B7",
                    fontWeight: 600,
                    opacity: 0.85,
                  }}
                >
                  {l}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ======== MOCKUP : LOGIN ======== */}
        <SectionDivider
          kicker={locale === "fr" ? "Écran 1" : "Screen 1"}
          title={
            locale === "fr"
              ? "🔓 Connexion · simplicité absolue"
              : "🔓 Login · radically simple"
          }
        />
        <div
          style={{
            maxWidth: 1380,
            margin: "0 auto",
            padding: "0 24px 30px",
          }}
        >
          <BrowserFrame url="app.bmd.app/login">
            <LoginMock locale={locale} t={t} rtl={rtl} />
          </BrowserFrame>
        </div>

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
            padding: "0 24px 60px",
          }}
        >
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
                    "linear-gradient(180deg, rgba(42,34,68,0.4), rgba(22,17,30,0.6))",
                  border: "1px solid rgba(244,228,193,0.08)",
                  borderRadius: 14,
                  padding: 22,
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    background:
                      "linear-gradient(135deg, rgba(232,163,61,0.15), rgba(181,70,46,0.1))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 24,
                    marginBottom: 12,
                  }}
                >
                  {f.icon}
                </div>
                <h3
                  style={{
                    fontSize: 18,
                    color: "#E8A33D",
                    marginBottom: 8,
                  }}
                >
                  {f.title}
                </h3>
                <p style={{ fontSize: 13, color: "#E8D5B7", lineHeight: 1.6 }}>
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </section>

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
            padding: "0 24px 60px",
            textAlign: "center",
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
                      "linear-gradient(135deg, #E8A33D, #B5462E)",
                    color: "#16111E",
                    fontWeight: 700,
                    fontSize: 28,
                    fontFamily: "'Cormorant Garamond', serif",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 16px",
                  }}
                >
                  {s.num}
                </div>
                <h3 style={{ fontSize: 20, color: "#F4E4C1", marginBottom: 8 }}>
                  {s.title}
                </h3>
                <p style={{ fontSize: 14, color: "#E8D5B7", lineHeight: 1.6 }}>
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
            maxWidth: 980,
            margin: "0 auto",
            padding: "0 24px 60px",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 18,
            }}
          >
            <PricingCard
              highlight
              name={t.pricing.free.name}
              price={t.pricing.free.price}
              features={t.pricing.free.features}
              cta={t.cta.button}
              ctaHref="/login"
            />
            <PricingCard
              name={t.pricing.pro.name}
              price={t.pricing.pro.price}
              features={t.pricing.pro.features}
              cta={t.pricing.pro.cta}
              disabled
            />
          </div>
        </section>

        {/* ======== FAQ ======== */}
        <SectionDivider
          kicker={locale === "fr" ? "Questions" : "Questions"}
          title={t.faq.title}
        />
        <section
          id="faq"
          style={{
            maxWidth: 800,
            margin: "0 auto",
            padding: "0 24px 60px",
          }}
        >
          {t.faq.items.map((q, i) => (
            <details
              key={i}
              style={{
                background:
                  "linear-gradient(180deg, rgba(42,34,68,0.4), rgba(22,17,30,0.6))",
                border: "1px solid rgba(244,228,193,0.08)",
                borderRadius: 12,
                padding: 18,
                marginBottom: 10,
              }}
            >
              <summary
                style={{
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 15,
                  color: "#F4E4C1",
                }}
              >
                {q.q}
              </summary>
              <p
                style={{
                  marginTop: 10,
                  color: "#E8D5B7",
                  fontSize: 13,
                  lineHeight: 1.7,
                }}
              >
                {q.a}
              </p>
            </details>
          ))}
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
              border: "1px solid rgba(232,163,61,0.3)",
              background:
                "radial-gradient(600px 300px at 50% 0%, rgba(232,163,61,0.12), transparent), linear-gradient(180deg, rgba(42,34,68,0.6), rgba(22,17,30,0.9))",
            }}
          >
            <h2
              style={{
                fontSize: "clamp(28px, 4vw, 40px)",
                color: "#E8A33D",
                marginBottom: 12,
              }}
            >
              {t.cta.headline}
            </h2>
            <p style={{ color: "#E8D5B7", marginBottom: 28, fontSize: 16 }}>
              {t.cta.body}
            </p>
            <Link
              href="/login"
              style={{
                display: "inline-block",
                background: "linear-gradient(135deg, #E8A33D, #B5462E)",
                color: "#16111E",
                padding: "16px 40px",
                borderRadius: 12,
                textDecoration: "none",
                fontSize: 16,
                fontWeight: 700,
                boxShadow: "0 12px 32px rgba(232,163,61,0.3)",
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
            color: "#8A7B6B",
          }}
        >
          <BmdLogo size={36} />
          <div
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 22,
              fontWeight: 700,
              color: "#F4E4C1",
              marginTop: 8,
              marginBottom: 6,
            }}
          >
            BMD<span style={{ color: "#E8A33D" }}>·</span>
          </div>
          <div style={{ marginBottom: 14, fontStyle: "italic", color: "#C9A24A" }}>
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
              style={{ color: "#E8D5B7", textDecoration: "none" }}
            >
              {t.footer.privacy}
            </Link>
          </div>
          <div>
            © {new Date().getFullYear()} BMD · {t.footer.rights}
          </div>
        </footer>
      </div>

    </>
  );
}

/* ============ COMPONENTS ============ */

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
          margin: "40px 0 24px",
          paddingBottom: 14,
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
              fontSize: 11,
              letterSpacing: 3,
              color: "#C9A24A",
              textTransform: "uppercase",
              fontWeight: 700,
              marginBottom: 4,
            }}
          >
            {kicker}
          </div>
          <h2
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "clamp(22px, 3vw, 28px)",
              fontWeight: 600,
              color: "#F4E4C1",
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
          borderRight: "1px solid rgba(244,228,193,0.08)",
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
              color: "#F4E4C1",
            }}
          >
            BMD<span style={{ color: "#E8A33D" }}>·</span>
          </div>
        </div>
        <div>
          <h2
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 36,
              fontWeight: 600,
              color: "#F4E4C1",
              lineHeight: 1.1,
              marginBottom: 14,
            }}
          >
            {locale === "fr" ? (
              <>
                Te reconnecter,
                <br />
                en{" "}
                <em style={{ color: "#E8A33D", fontStyle: "normal" }}>
                  30 secondes.
                </em>
              </>
            ) : (
              <>
                Sign in,
                <br />
                in{" "}
                <em style={{ color: "#E8A33D", fontStyle: "normal" }}>
                  30 seconds.
                </em>
              </>
            )}
          </h2>
          <p
            style={{
              color: "#E8D5B7",
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
                color: "#E8D5B7",
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
                  color: "#E8A33D",
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
          background: "#16111E",
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
              color: "#F4E4C1",
              fontWeight: 600,
            }}
          >
            {locale === "fr" ? "Bon retour" : "Welcome back"}
          </div>
          <div
            style={{
              color: "#8A7B6B",
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
              color: "#8A7B6B",
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
              color: "#F4E4C1",
            }}
          >
            <span
              style={{
                fontWeight: 600,
                paddingRight: 8,
                borderRight: "1px solid rgba(244,228,193,0.08)",
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
                color: "#7DC59E",
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
              color: "#16111E",
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
              color: "#F4E4C1",
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
            color: "#8A7B6B",
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
            color: "#8A7B6B",
          }}
        >
          {locale === "fr"
            ? "Pas encore de compte ? "
            : "No account yet? "}
          <span style={{ color: "#E8A33D", fontWeight: 600 }}>
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
          color: "#F4E4C1",
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
          color: "#E8D5B7",
        }}
      >
        {features.map((f, i) => (
          <li key={i}>
            <span style={{ color: "#E8A33D", marginRight: 6 }}>✓</span>
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
            color: "#16111E",
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
            color: "#8A7B6B",
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

function LangPicker({
  locale,
  rtl,
  show,
  setShow,
  onChange,
}: {
  locale: Locale;
  rtl: boolean;
  show: boolean;
  setShow: (v: boolean) => void;
  onChange: (l: Locale) => void;
}): JSX.Element {
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setShow(!show)}
        aria-label="Change language"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(244,228,193,0.08)",
          borderRadius: 10,
          padding: "8px 12px",
          color: "#F4E4C1",
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
            background: "#1E1830",
            border: "1px solid rgba(232,163,61,0.18)",
            borderRadius: 10,
            padding: 4,
            minWidth: 180,
            zIndex: 100,
            boxShadow: "0 12px 30px rgba(0,0,0,0.4)",
          }}
        >
          {LOCALES.map((l) => (
            <button
              key={l}
              onClick={() => onChange(l)}
              style={{
                display: "block",
                width: "100%",
                textAlign: rtl ? "right" : "left",
                background:
                  l === locale ? "rgba(232,163,61,0.15)" : "transparent",
                border: "none",
                padding: "10px 12px",
                color: l === locale ? "#E8A33D" : "#F4E4C1",
                cursor: "pointer",
                borderRadius: 8,
                fontSize: 13,
                minHeight: 40,
              }}
            >
              {LOCALE_FLAGS[l]} {LOCALE_NAMES[l]}
            </button>
          ))}
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
          "linear-gradient(180deg, #0E0B14 0%, #1F1429 100%)",
        color: "#F4E4C1",
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

      {/* Top : sélecteur de langue à droite (RTL flippe à gauche) */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          position: "relative",
          zIndex: 2,
        }}
      >
        <LangPicker
          locale={locale}
          rtl={rtl}
          show={showLangMenu}
          setShow={setShowLangMenu}
          onChange={onChangeLocale}
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
              color: "#C9A24A",
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
              color: "#F4E4C1",
            }}
            dangerouslySetInnerHTML={{
              __html: emphasizeLast(t.hero.headline),
            }}
          />
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              color: "#E8D5B7",
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
              color: "#16111E",
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
                color: "#16111E",
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
                color: "#F4E4C1",
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
            color: "#8A7B6B",
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
              color: "#E8A33D",
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

      {/* Float tags décoratifs */}
      <FloatTag
        title="Ticket scanné"
        subtitle="67,40 € · partagé en 4 ✓"
        icon="🧾"
        position={{ top: 80, left: -40 }}
      />
      <FloatTag
        title="Tontine"
        subtitle="Tour 4/12 · 1 950 € collectés"
        icon="🪙"
        position={{ bottom: 120, right: -30 }}
      />
      <FloatTag
        title="Bot WhatsApp"
        subtitle="« +25 € resto » → noté ✓"
        icon="💬"
        position={{ top: "50%", right: -50 }}
      />

      {/* Phone frame */}
      <div
        style={{
          width: 320,
          height: 640,
          borderRadius: 44,
          background: "linear-gradient(180deg, #0A0810, #15101D)",
          padding: 12,
          boxShadow:
            "0 40px 90px rgba(0,0,0,0.7), 0 0 0 1px rgba(232,163,61,0.15)",
          position: "relative",
        }}
      >
        {/* Notch */}
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
        {/* Screen */}
        <div
          style={{
            width: "100%",
            height: "100%",
            borderRadius: 32,
            background: "linear-gradient(180deg, #16111E, #1E1830)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            padding: "44px 18px 18px",
            color: "#F4E4C1",
          }}
        >
          <div style={{ fontSize: 11, color: "#E8D5B7", opacity: 0.6 }}>
            Bonsoir,
          </div>
          <div
            style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontSize: 22,
              fontWeight: 600,
              marginBottom: 18,
            }}
          >
            Aïcha M.
          </div>

          {/* Balance card */}
          <div
            style={{
              background: "linear-gradient(135deg, #2A2244, #3A2A52)",
              borderRadius: 20,
              padding: 18,
              border: "1px solid rgba(232,163,61,0.18)",
              position: "relative",
              overflow: "hidden",
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
                  "radial-gradient(circle, rgba(232,163,61,0.3), transparent 70%)",
              }}
            />
            <div
              style={{
                fontSize: 9,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: "#E8D5B7",
                opacity: 0.7,
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
                color: "#F4E4C1",
                marginTop: 4,
                position: "relative",
              }}
            >
              + 247,50
              <span style={{ color: "#E8A33D", fontSize: 20 }}>€</span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 10,
                marginTop: 12,
                color: "#E8D5B7",
                position: "relative",
                gap: 4,
              }}
            >
              <span style={{ color: "#7DC59E", fontWeight: 600 }}>
                ↗ On vous doit 412 €
              </span>
              <span style={{ color: "#D9714A", fontWeight: 600 }}>
                ↘ Vous devez 165 €
              </span>
            </div>
          </div>

          {/* Quick actions */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 6,
              marginTop: 14,
            }}
          >
            {[
              { ic: "📷", lbl: "Scanner" },
              { ic: "▣", lbl: "QR" },
              { ic: "🪙", lbl: "Tontine" },
              { ic: "💬", lbl: "Chat" },
            ].map((q, i) => (
              <div
                key={i}
                style={{
                  background: "rgba(232,163,61,0.06)",
                  border: "1px solid rgba(244,228,193,0.08)",
                  borderRadius: 12,
                  padding: "10px 4px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 9,
                  color: "#E8D5B7",
                  textAlign: "center",
                }}
              >
                <span style={{ fontSize: 16, color: "#E8A33D" }}>{q.ic}</span>
                {q.lbl}
              </div>
            ))}
          </div>

          <div
            style={{
              fontSize: 9,
              color: "#8A7B6B",
              textTransform: "uppercase",
              letterSpacing: 2,
              marginTop: 16,
              marginBottom: 6,
            }}
          >
            Mes groupes
          </div>

          {[
            { ic: "🪙", n: "Tontine Bamiléké", m: "12 membres · Tour 4/12", a: "+200 €", c: "#E8A33D" },
            { ic: "🏠", n: "Coloc Belleville", m: "4 membres", a: "-89 €", c: "#D9714A" },
          ].map((g, i) => (
            <div
              key={i}
              style={{
                marginTop: 6,
                background: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(244,228,193,0.08)",
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
                  background: "rgba(232,163,61,0.15)",
                  color: "#E8A33D",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  flexShrink: 0,
                }}
              >
                {g.ic}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#F4E4C1",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {g.n}
                </div>
                <div style={{ fontSize: 9, color: "#8A7B6B" }}>{g.m}</div>
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
  icon,
  position,
}: {
  title: string;
  subtitle: string;
  icon: string;
  position: React.CSSProperties;
}): JSX.Element {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        padding: "10px 14px",
        borderRadius: 12,
        background: "rgba(42,34,68,0.92)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        border: "1px solid rgba(232,163,61,0.18)",
        fontSize: 11,
        color: "#F4E4C1",
        boxShadow: "0 12px 30px rgba(0,0,0,0.4)",
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
      <span style={{ fontSize: 14, color: "#E8A33D" }}>{icon}</span>
      <span>
        <strong style={{ display: "block", color: "#F4E4C1" }}>{title}</strong>
        <span style={{ color: "#E8D5B7" }}>{subtitle}</span>
      </span>
    </div>
  );
}
