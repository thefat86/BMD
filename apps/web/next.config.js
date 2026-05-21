// Bundle analyzer (opt-in via env BUNDLE_ANALYZE=1).
// Usage : BUNDLE_ANALYZE=1 npm run build → ouvre 2 rapports HTML
// (client.html + server.html) dans .next/analyze/ pour identifier
// les gros packages à optimiser. Aucun impact en build normal.
let withBundleAnalyzer = (config) => config;
if (process.env.BUNDLE_ANALYZE === "1") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    withBundleAnalyzer = require("@next/bundle-analyzer")({
      enabled: true,
      openAnalyzer: false, // pas d'auto-ouverture (CI-friendly)
    });
  } catch {
    console.warn(
      "[next.config] BUNDLE_ANALYZE=1 mais @next/bundle-analyzer non installé.\n" +
        "  → npm install --save-dev @next/bundle-analyzer",
    );
  }
}

// V39 — Expose le numéro de version du package web aux composants front.
// Utilisé notamment au pied de la page profil mobile. Lecture au build,
// pas de surcoût runtime.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require("./package.json");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@bmd/shared-types"],
  // V39 — Variables d'env injectées au build pour les pages client.
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
  },
  // Output "standalone" : Next.js trace les fichiers nécessaires et produit
  // un dossier .next/standalone autonome (~50 Mo vs 300 Mo pour `next start`).
  // Activé automatiquement quand on build dans Docker via NEXT_OUTPUT=standalone.
  // Vercel ignore ce flag et utilise son propre packaging.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  // ⚠️ NE PAS forcer une valeur par défaut ici pour NEXT_PUBLIC_API_URL :
  // ça baked 'localhost:4000' dans le bundle au build, ce qui casse l'accès
  // depuis le LAN (mobile sur Wi-Fi). Si la variable est exportée dans le
  // shell avant `npm run dev` ou `npm run build`, Next.js l'injecte
  // automatiquement (toutes les variables préfixées NEXT_PUBLIC_*).
  // En l'absence de cette variable, api-client.ts utilise window.location.hostname.

  // === Performance ===
  compress: true, // gzip/Brotli sur les responses Next.js (HTML/JSON)
  poweredByHeader: false, // retire X-Powered-By (économie d'octets + sécu)
  productionBrowserSourceMaps: false, // pas de sourcemaps en prod (réduit bundle)

  // === Proxy de dev : /_api/* → http://localhost:4000/* ===
  // Utilisé uniquement quand l'app est exposée via un tunnel public (ngrok,
  // cloudflared) ou un autre setup où le port 4000 n'est pas atteignable
  // directement. Le client web bascule automatiquement sur ce chemin via
  // api-client.ts dès qu'il détecte un hostname de tunnel.
  // En prod (Vercel), Vercel ne passe pas par ce rewrite parce que
  // api-client.ts utilise NEXT_PUBLIC_API_URL directement.
  async rewrites() {
    return [
      {
        source: "/_api/:path*",
        destination: "http://localhost:4000/:path*",
      },
    ];
  },

  // === Headers HTTP cache + sécurité ===
  // Next.js applique ces headers en plus des règles serveur en amont (Vercel/Nginx).
  async headers() {
    const securityHeaders = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value:
          "camera=(self), microphone=(self), geolocation=(), interest-cohort=()",
      },
    ];

    const isDev = process.env.NODE_ENV !== "production";

    // En DEV : ajoute des headers no-cache stricts pour FORCER le navigateur
    // (Safari iOS / WebView Capacitor) à toujours récupérer la version la
    // plus récente. Sans ça, on perd énormément de temps en test mobile à
    // cause des assets cachés par la WebView.
    const devNoCacheHeaders = isDev
      ? [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0" },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" },
          { key: "Surrogate-Control", value: "no-store" },
        ]
      : [];

    return [
      // Toutes les routes : headers sécu de base + no-cache en dev
      {
        source: "/(.*)",
        headers: [...securityHeaders, ...devNoCacheHeaders],
      },
      // Static assets versionnés (Next.js hash dans le nom de fichier)
      // → cache "immutable" 1 an, gain énorme sur les revisits.
      {
        source: "/_next/static/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      // Images publiques (icons, logo) — versions inchangées, cache 1 semaine.
      {
        source: "/:path*\\.(svg|png|jpg|jpeg|gif|webp|ico|woff2|woff)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=604800, stale-while-revalidate=86400",
          },
        ],
      },
      // Sprint AC · BIMI logo · doit être servi en image/svg+xml strict
      // pour que les clients mail (Gmail, Apple, Yahoo) le valident.
      // Cache 1 jour seulement (les changements de logo doivent se propager
      // rapidement via DNS).
      {
        source: "/bimi-logo.svg",
        headers: [
          { key: "Content-Type", value: "image/svg+xml" },
          { key: "Cache-Control", value: "public, max-age=86400" },
          // X-Content-Type-Options: nosniff bloque les overrides
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      // Manifest + service worker → toujours frais.
      {
        source: "/:path(manifest.json|sw.js|offline.html)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
      // Pages CMS publiques — cache CDN 5 min, revalidate background.
      {
        source: "/cms/:path*",
        headers: [
          {
            key: "Cache-Control",
            value:
              "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
          },
        ],
      },
      // Pages legales — quasi-statiques, cache 1h CDN.
      {
        source: "/legal/:path*",
        headers: [
          {
            key: "Cache-Control",
            value:
              "public, max-age=300, s-maxage=3600, stale-while-revalidate=7200",
          },
        ],
      },
      // === Phase 3 Capacitor · Universal Links iOS ===
      // Apple exige `application/json` strict pour valider l'association
      // domaine ↔ app. Sans ça, Universal Links ne marchent pas.
      {
        source: "/.well-known/apple-app-site-association",
        headers: [
          { key: "Content-Type", value: "application/json" },
          { key: "Cache-Control", value: "public, max-age=3600" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      // === Phase 3 Capacitor · App Links Android ===
      // Google exige `application/json` strict pour Digital Asset Links.
      {
        source: "/.well-known/assetlinks.json",
        headers: [
          { key: "Content-Type", value: "application/json" },
          { key: "Cache-Control", value: "public, max-age=3600" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },

  // === Optimisations bundle ===
  experimental: {
    // Tree-shake auto sur les gros packages (n'importe les sub-paths utilisés)
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "@simplewebauthn/browser",
    ],
  },

  // === Images === (next/image)
  // Configuration prête pour CDN externe : ajoute le hostname dans
  // remotePatterns quand tu plug Cloudinary, Imgix, S3 + CloudFront, etc.
  // Pour l'instant, autorise les avatars uploadés et les domaines publics
  // utilisés (logo BMD, OG images).
  images: {
    // Formats modernes générés automatiquement par next/image (AVIF
    // d'abord, fallback WebP, puis JPG si nécessaire). Gain typique
    // 30-60% de poids vs JPG/PNG original.
    formats: ["image/avif", "image/webp"],
    // Tailles responsives générées au build pour les srcset
    deviceSizes: [360, 640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    // Cache 24h des images optimisées au niveau Next.js (CDN garde
    // beaucoup plus longtemps via Cache-Control headers).
    minimumCacheTTL: 86400,
    remotePatterns: [
      // Stripe images (logos partenaires, factures)
      { protocol: "https", hostname: "*.stripe.com" },
      // Avatars Google SSO
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      // Avatars Apple SSO
      { protocol: "https", hostname: "appleid.cdn-apple.com" },
      // À ajouter quand tu plug un image CDN :
      // { protocol: "https", hostname: "res.cloudinary.com" },
      // { protocol: "https", hostname: "*.imgix.net" },
    ],
  },
};

module.exports = withBundleAnalyzer(nextConfig);
