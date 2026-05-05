"use client";

/**
 * Site vitrine BMD — multilingue (FR, EN, ES, PT, AR, SW).
 *
 * Stratégie :
 *  - Si déjà connecté → redirige direct vers /dashboard
 *  - Sinon → landing page traduite selon la langue détectée
 *  - Sélecteur de langue persisté en localStorage
 *  - RTL automatique pour l'arabe
 *
 * Bouton "Se connecter" / "Créer un compte" → /login
 *
 * Design : sombre cohérent avec l'app, palette saffron/terracotta.
 * Aucune image externe : tout en SVG/CSS inline pour chargement instantané.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [locale, setLoc] = useState<Locale>("fr");
  const [mounted, setMounted] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);

  useEffect(() => {
    if (getToken()) {
      router.replace("/dashboard");
      return;
    }
    setLoc(detectLocale());
    setMounted(true);
  }, [router]);

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

  const t = T[locale];
  const rtl = isRtl(locale);

  if (!mounted) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0E0B14",
          color: "#fff",
          fontFamily: "system-ui",
        }}
      >
        BMD<span style={{ color: "#E8A33D" }}>·</span>
      </div>
    );
  }

  return (
    <div
      dir={rtl ? "rtl" : "ltr"}
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, #0E0B14 0%, #1F1429 50%, #0E0B14 100%)",
        color: "#f0e6d8",
        fontFamily:
          "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        lineHeight: 1.6,
      }}
    >
      <nav
        style={{
          padding: "20px 24px",
          maxWidth: 1200,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 24,
            fontWeight: 700,
            color: "#f0e6d8",
          }}
        >
          BMD<span style={{ color: "#E8A33D" }}>·</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowLangMenu(!showLangMenu)}
              aria-label="Change language"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                padding: "8px 12px",
                color: "#f0e6d8",
                cursor: "pointer",
                fontSize: 14,
                minHeight: 40,
              }}
            >
              {LOCALE_FLAGS[locale]} {LOCALE_NAMES[locale]} ▾
            </button>
            {showLangMenu && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  ...(rtl ? { left: 0 } : { right: 0 }),
                  background: "#1F1429",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 8,
                  padding: 4,
                  minWidth: 180,
                  zIndex: 100,
                  boxShadow: "0 12px 30px rgba(0,0,0,0.4)",
                }}
              >
                {LOCALES.map((l) => (
                  <button
                    key={l}
                    onClick={() => changeLocale(l)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: rtl ? "right" : "left",
                      background:
                        l === locale ? "rgba(232,163,61,0.15)" : "transparent",
                      border: "none",
                      padding: "10px 12px",
                      color: l === locale ? "#E8A33D" : "#f0e6d8",
                      cursor: "pointer",
                      borderRadius: 6,
                      fontSize: 14,
                      minHeight: 40,
                    }}
                  >
                    {LOCALE_FLAGS[l]} {LOCALE_NAMES[l]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Link
            href="/login"
            style={{
              background: "transparent",
              color: "#f0e6d8",
              padding: "10px 16px",
              borderRadius: 8,
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 500,
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
              background: "#E8A33D",
              color: "#0E0B14",
              padding: "10px 16px",
              borderRadius: 8,
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 700,
              minHeight: 40,
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            {t.nav.signUp}
          </Link>
        </div>
      </nav>

      <section
        style={{
          padding: "60px 24px 80px",
          maxWidth: 1200,
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: 4,
            color: "#E8A33D",
            fontWeight: 700,
            textTransform: "uppercase",
            marginBottom: 16,
          }}
        >
          {t.hero.tagline}
        </div>
        <h1
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: "clamp(36px, 7vw, 64px)",
            lineHeight: 1.1,
            margin: "0 auto 24px",
            maxWidth: 800,
            fontWeight: 700,
            color: "#f0e6d8",
          }}
        >
          {t.hero.headline}
        </h1>
        <p
          style={{
            fontSize: 18,
            color: "#c9bfae",
            maxWidth: 640,
            margin: "0 auto 32px",
            lineHeight: 1.6,
          }}
        >
          {t.hero.subhead}
        </p>
        <div
          style={{
            display: "flex",
            gap: 12,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <Link
            href="/login"
            style={{
              background: "linear-gradient(135deg, #E8A33D, #B5462E)",
              color: "#0E0B14",
              padding: "16px 32px",
              borderRadius: 12,
              textDecoration: "none",
              fontSize: 16,
              fontWeight: 700,
              minHeight: 52,
              display: "inline-flex",
              alignItems: "center",
              boxShadow: "0 8px 24px rgba(232,163,61,0.3)",
            }}
          >
            {t.hero.ctaPrimary} →
          </Link>
          <Link
            href="#how-it-works"
            style={{
              background: "transparent",
              color: "#f0e6d8",
              padding: "16px 32px",
              borderRadius: 12,
              textDecoration: "none",
              fontSize: 16,
              fontWeight: 600,
              border: "1px solid rgba(255,255,255,0.2)",
              minHeight: 52,
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            ▷ {t.hero.ctaSecondary}
          </Link>
        </div>

        <div
          style={{
            marginTop: 60,
            maxWidth: 700,
            margin: "60px auto 0",
            background: "linear-gradient(135deg, #1F1429, #16111e)",
            border: "1px solid rgba(232,163,61,0.2)",
            borderRadius: 20,
            padding: 24,
            boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
          }}
        >
          <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff5f57" }} />
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ffbd2e" }} />
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#28c941" }} />
          </div>
          <div style={{ textAlign: rtl ? "right" : "left" }}>
            <div
              style={{
                fontSize: 12,
                color: "#E8A33D",
                marginBottom: 8,
                letterSpacing: 2,
              }}
            >
              🪙 TONTINE
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>
              Tour 3 / 12
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              {[
                { name: "Aïssa", val: "+850" },
                { name: "Boubacar", val: "−200" },
                { name: "Coumba", val: "−200" },
                { name: "Diallo", val: "−200" },
              ].map((m, i) => (
                <div
                  key={i}
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 10,
                    padding: 12,
                    fontSize: 14,
                  }}
                >
                  <div style={{ color: "#c9bfae", marginBottom: 4 }}>{m.name}</div>
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      color: m.val.startsWith("+") ? "#10b981" : "#ef4444",
                    }}
                  >
                    {m.val} €
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="features" style={{ padding: "80px 24px", maxWidth: 1200, margin: "0 auto" }}>
        <h2
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: "clamp(28px, 5vw, 44px)",
            textAlign: "center",
            marginBottom: 48,
            fontWeight: 700,
          }}
        >
          {t.features.title}
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 24,
          }}
        >
          {t.features.items.map((f, i) => (
            <div
              key={i}
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 16,
                padding: 24,
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 12 }}>{f.icon}</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: "#E8A33D" }}>
                {f.title}
              </h3>
              <p style={{ fontSize: 14, color: "#c9bfae", lineHeight: 1.6 }}>
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section
        id="how-it-works"
        style={{ padding: "80px 24px", maxWidth: 1000, margin: "0 auto", textAlign: "center" }}
      >
        <h2
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: "clamp(28px, 5vw, 44px)",
            marginBottom: 48,
            fontWeight: 700,
          }}
        >
          {t.howItWorks.title}
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 32,
          }}
        >
          {t.howItWorks.steps.map((s, i) => (
            <div key={i}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #E8A33D, #B5462E)",
                  color: "#0E0B14",
                  fontWeight: 700,
                  fontSize: 28,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 16px",
                }}
              >
                {s.num}
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                {s.title}
              </h3>
              <p style={{ fontSize: 14, color: "#c9bfae" }}>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" style={{ padding: "80px 24px", maxWidth: 900, margin: "0 auto" }}>
        <h2
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: "clamp(28px, 5vw, 44px)",
            textAlign: "center",
            marginBottom: 48,
            fontWeight: 700,
          }}
        >
          {t.pricing.title}
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: 24,
          }}
        >
          <div
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "2px solid #E8A33D",
              borderRadius: 16,
              padding: 32,
            }}
          >
            <div
              style={{
                fontSize: 14,
                color: "#E8A33D",
                fontWeight: 700,
                marginBottom: 8,
                letterSpacing: 2,
                textTransform: "uppercase",
              }}
            >
              {t.pricing.free.name}
            </div>
            <div
              style={{
                fontSize: 48,
                fontWeight: 700,
                fontFamily: "'Cormorant Garamond', serif",
                marginBottom: 24,
              }}
            >
              {t.pricing.free.price}
            </div>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: "0 0 24px",
                fontSize: 14,
                lineHeight: 2,
                color: "#c9bfae",
              }}
            >
              {t.pricing.free.features.map((f, i) => (
                <li key={i}>✓ {f}</li>
              ))}
            </ul>
            <Link
              href="/login"
              style={{
                display: "block",
                background: "linear-gradient(135deg, #E8A33D, #B5462E)",
                color: "#0E0B14",
                padding: "14px",
                borderRadius: 10,
                textDecoration: "none",
                textAlign: "center",
                fontWeight: 700,
                minHeight: 48,
              }}
            >
              {t.cta.button}
            </Link>
          </div>

          <div
            style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 16,
              padding: 32,
              opacity: 0.7,
            }}
          >
            <div
              style={{
                fontSize: 14,
                color: "#c9bfae",
                fontWeight: 700,
                marginBottom: 8,
                letterSpacing: 2,
                textTransform: "uppercase",
              }}
            >
              {t.pricing.pro.name}
            </div>
            <div
              style={{
                fontSize: 32,
                fontWeight: 700,
                fontFamily: "'Cormorant Garamond', serif",
                marginBottom: 24,
              }}
            >
              {t.pricing.pro.price}
            </div>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: "0 0 24px",
                fontSize: 14,
                lineHeight: 2,
                color: "#c9bfae",
              }}
            >
              {t.pricing.pro.features.map((f, i) => (
                <li key={i}>✓ {f}</li>
              ))}
            </ul>
            <button
              disabled
              style={{
                width: "100%",
                background: "rgba(255,255,255,0.05)",
                color: "#c9bfae",
                padding: "14px",
                borderRadius: 10,
                border: "none",
                fontWeight: 700,
                minHeight: 48,
                cursor: "not-allowed",
              }}
            >
              {t.pricing.pro.cta}
            </button>
          </div>
        </div>
      </section>

      <section id="faq" style={{ padding: "80px 24px", maxWidth: 800, margin: "0 auto" }}>
        <h2
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: "clamp(28px, 5vw, 44px)",
            textAlign: "center",
            marginBottom: 48,
            fontWeight: 700,
          }}
        >
          {t.faq.title}
        </h2>
        {t.faq.items.map((item, i) => (
          <details
            key={i}
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 12,
              padding: 20,
              marginBottom: 12,
            }}
          >
            <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 16, color: "#f0e6d8" }}>
              {item.q}
            </summary>
            <p style={{ marginTop: 12, color: "#c9bfae", fontSize: 14, lineHeight: 1.7 }}>
              {item.a}
            </p>
          </details>
        ))}
      </section>

      <section
        style={{
          padding: "80px 24px",
          maxWidth: 800,
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg, rgba(232,163,61,0.1), rgba(181,70,46,0.05))",
            border: "1px solid rgba(232,163,61,0.3)",
            borderRadius: 20,
            padding: "48px 24px",
          }}
        >
          <h2
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "clamp(28px, 5vw, 40px)",
              marginBottom: 12,
              color: "#E8A33D",
              fontWeight: 700,
            }}
          >
            {t.cta.headline}
          </h2>
          <p style={{ fontSize: 16, color: "#c9bfae", marginBottom: 32 }}>
            {t.cta.body}
          </p>
          <Link
            href="/login"
            style={{
              display: "inline-block",
              background: "linear-gradient(135deg, #E8A33D, #B5462E)",
              color: "#0E0B14",
              padding: "16px 40px",
              borderRadius: 12,
              textDecoration: "none",
              fontSize: 16,
              fontWeight: 700,
              boxShadow: "0 8px 24px rgba(232,163,61,0.3)",
            }}
          >
            {t.cta.button} →
          </Link>
        </div>
      </section>

      <footer
        style={{
          padding: "40px 24px",
          maxWidth: 1200,
          margin: "0 auto",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          textAlign: "center",
          fontSize: 13,
          color: "#c9bfae",
        }}
      >
        <div
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 20,
            fontWeight: 700,
            color: "#f0e6d8",
            marginBottom: 8,
          }}
        >
          BMD<span style={{ color: "#E8A33D" }}>·</span>
        </div>
        <div style={{ marginBottom: 16, fontStyle: "italic" }}>
          {t.footer.tagline}
        </div>
        <div
          style={{
            display: "flex",
            gap: 24,
            justifyContent: "center",
            flexWrap: "wrap",
            marginBottom: 16,
          }}
        >
          <Link href="/legal/privacy" style={{ color: "#c9bfae", textDecoration: "none" }}>
            {t.footer.privacy}
          </Link>
        </div>
        <div style={{ fontSize: 11 }}>
          © {new Date().getFullYear()} BMD · {t.footer.rights}
        </div>
      </footer>
    </div>
  );
}
