import type { Metadata, Viewport } from "next";
import { Inter, Cormorant_Garamond } from "next/font/google";
import "./globals.css";

/**
 * Fonts self-hostées au build via next/font/google.
 *
 * Avantages vs CDN Google Fonts :
 *  - Zéro roundtrip réseau (les .woff2 sont servis depuis notre origin)
 *  - Zéro layout shift (préchargement automatique avec font-face inliné)
 *  - Privacy : aucun ping Google par le navigateur de l'utilisateur
 *  - Subset latin uniquement (économie ~70 KB sur le woff2)
 *  - display: swap → texte instantané en fallback puis swap silencieux
 */
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
  variable: "--font-inter",
  fallback: ["-apple-system", "BlinkMacSystemFont", "sans-serif"],
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
  variable: "--font-cormorant",
  fallback: ["Georgia", "serif"],
});
import { PwaRegister } from "./pwa-register";
import { ToastProvider } from "../lib/ui/toast";
import { IdleLogout } from "../lib/ui/idle-logout";
import { LocaleProvider } from "../lib/locale-provider";
import { CurrencyProvider } from "../lib/currency-provider";
import { DialogProvider } from "../lib/ui/dialog-provider";
import { PlanGateProvider } from "../lib/ui/plan-gate-provider";
import { SessionLock } from "../lib/ui/session-lock";
import { RealtimeNotifier } from "../lib/ui/realtime-notifier";
import { ErrorBoundary } from "../lib/ui/error-boundary";
import { ThemeBootScript, ThemeProvider } from "../lib/ui/theme-provider";

export const metadata: Metadata = {
  title: "BMD · Back Mes Do",
  description: "L'argent partagé. L'amitié protégée. Tontines, colocs, voyages — sans drama.",
  manifest: "/manifest.json",
  applicationName: "BMD",
  appleWebApp: {
    capable: true,
    title: "BMD",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#0E0B14",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // URL de l'API à pré-connecter (DNS + TLS handshake en background)
  // pour économiser ~100-300ms sur le 1er appel API au boot.
  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

  return (
    // V22 — Hydration fix : on pose `data-theme="dark"` et `colorScheme: "dark"`
    // DIRECTEMENT côté SSR pour que le HTML serveur et le HTML client
    // post-ThemeBootScript soient identiques. Sans ça, le bootscript ajoutait
    // ces attributs après hydration → React détectait une mismatch et avertissait.
    // Le mode clair étant désactivé (V13), on fixe `dark` dur. Le bootscript
    // continue d'exister pour purger une éventuelle pref localStorage `light`
    // résiduelle, mais il ne change plus l'attribut (c'est déjà bon).
    <html
      lang="fr"
      className={`${inter.variable} ${cormorant.variable}`}
      data-theme="dark"
      style={{ colorScheme: "dark" }}
      suppressHydrationWarning
    >
      <head>
        {/* === Resource hints performance ===
            - dns-prefetch : résolution DNS en background (gain ~50ms)
            - preconnect : DNS + TCP + TLS en background (gain ~150-300ms)
            - On préconnecte à l'API (premier appel après mount).
            - Les fonts sont désormais self-hostées via next/font (pas de
              ping Google), donc plus besoin de preconnect Google. */}
        <link rel="dns-prefetch" href={apiUrl} />
        <link rel="preconnect" href={apiUrl} crossOrigin="anonymous" />
        {/* === ThemeBootScript ===
            En V13 le mode clair est désactivé → ce script ne fait plus que
            nettoyer une éventuelle pref localStorage "light" périmée. Il
            n'introduit plus de mismatch d'attribut puisque le SSR pose déjà
            `data-theme="dark"` ci-dessus. */}
        <ThemeBootScript />
      </head>
      <body>
        {/* Skip link a11y (WCAG 2.4.1) — visible uniquement au focus clavier */}
        <a href="#main-content" className="skip-link">
          Aller au contenu principal
        </a>
        <ErrorBoundary>
          <ThemeProvider>
            <LocaleProvider>
              <CurrencyProvider>
                <ToastProvider>
                  <DialogProvider>
                    <PlanGateProvider>
                      {/* Bridge SSE → toasts — actif uniquement si user
                          authentifié (vérif interne via getToken). Aucun render
                          visuel : juste un listener qui pousse des toasts. */}
                      <RealtimeNotifier />
                      <div id="main-content">{children}</div>
                    </PlanGateProvider>
                  </DialogProvider>
                </ToastProvider>
              </CurrencyProvider>
            </LocaleProvider>
          </ThemeProvider>
        </ErrorBoundary>
        <PwaRegister />
        <IdleLogout />
        {/* Verrouillage façon app bancaire : si l'app est mise en
            arrière-plan plus de 2 minutes, on demande une re-auth via OTP
            au retour sur l'app. */}
        <SessionLock />
      </body>
    </html>
  );
}
