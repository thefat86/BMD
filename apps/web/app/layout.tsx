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
import { AuthBootScript } from "../lib/auth-boot-script";
import { CapacitorLinkInterceptor } from "../lib/ui/capacitor-link-interceptor";
import { DevFreshBadge } from "../lib/ui/dev-fresh-badge";
import { NativePushBoot } from "../lib/ui/native-push-boot";
// V176 — Reporter Core Web Vitals (LCP/INP/CLS/FCP/TTFB) en prod
import { WebVitalsReporter } from "../lib/ui/web-vitals-reporter";

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
  // V41.8 — Chrome Android : redimensionne le viewport quand le clavier
  // apparaît au lieu de l'overlay par défaut. Évite que les BottomSheets
  // se cassent + scroll latéral parasite lors de la saisie d'un montant.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // URL de l'API à pré-connecter (DNS + TLS handshake en background)
  // pour économiser ~100-300ms sur le 1er appel API au boot.
  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

  return (
    // V22 — Hydration fix : on pose `data-theme` et `colorScheme` DIRECTEMENT
    // côté SSR pour que le HTML serveur et le HTML client post-ThemeBootScript
    // soient identiques (sinon React warning hydration mismatch).
    //
    // V52.D3 — Le default est maintenant `v45-light` (palette V45 livrée).
    // Les utilisateurs qui ont déjà persisté `dark` en localStorage gardent
    // leur préférence : le BootScript les détecte au load et applique. Les
    // NOUVEAUX users voient l'app directement en V45 light.
    //
    // `suppressHydrationWarning` couvre le cas où le BootScript change
    // data-theme avant l'hydratation React (anti-FOUC).
    <html
      lang="fr"
      className={`${inter.variable} ${cormorant.variable}`}
      data-theme="v45-light"
      style={{ colorScheme: "light" }}
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
        {/* V88.A — Auth gate synchrone : si on est sur /dashboard|/admin
            sans token, redirige immédiatement vers /login AVANT que React
            ne s'hydrate. Évite le timeout Playwright sur cold-start Pixel 5
            et améliore l'UX prod (pas de flash dashboard vide). */}
        <AuthBootScript />
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
                      {/* V92 — Force toutes les nav `<a>` same-origin à passer
                          par router.push() sur Capacitor iOS pour empêcher
                          WKWebView d'ouvrir Safari. No-op côté web. */}
                      <CapacitorLinkInterceptor />
                      {/* V132 — Push natif (APNs iOS / FCM Android) :
                          register au login + handler tap → deeplink.
                          No-op en PWA pur (sans Capacitor) ou si user pas auth. */}
                      <NativePushBoot />
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
        {/* Badge dev visible uniquement en NODE_ENV !== production. Permet
            de confirmer qu'on a bien le dernier bundle sur iPhone + un
            bouton 🧹 qui clear localStorage + caches + SW + reload. */}
        <DevFreshBadge />
        {/* V176 — Mesure & report des Core Web Vitals au backend.
            Best-effort silencieux, n'affecte rien si la lib n'est pas installée. */}
        <WebVitalsReporter />
      </body>
    </html>
  );
}
