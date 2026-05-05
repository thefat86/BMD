/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@bmd/shared-types"],
  // ⚠️ NE PAS forcer une valeur par défaut ici pour NEXT_PUBLIC_API_URL :
  // ça baked 'localhost:4000' dans le bundle au build, ce qui casse l'accès
  // depuis le LAN (mobile sur Wi-Fi). Si la variable est exportée dans le
  // shell avant `npm run dev` ou `npm run build`, Next.js l'injecte
  // automatiquement (toutes les variables préfixées NEXT_PUBLIC_*).
  // En l'absence de cette variable, api-client.ts utilise window.location.hostname.
};

module.exports = nextConfig;
