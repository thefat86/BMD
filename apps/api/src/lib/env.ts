import { z } from "zod";

/**
 * Validation et chargement des variables d'environnement.
 * Crash explicite au démarrage si une variable est manquante / invalide.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("30d"),

  OTP_PEPPER: z.string().min(8),
  OTP_LENGTH: z.coerce.number().int().min(4).max(8).default(6),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
  OTP_RATE_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(5),
  OTP_DELIVERY_MODE: z
    .enum(["console", "twilio", "whatsapp", "resend", "auto"])
    .default("console"),

  // ===== Twilio SMS (mode "twilio") =====
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(), // ex: +14155551234
  /// Sprint AC · Twilio Verify Service SID (commence par "VA").
  /// Si défini, l'OTP utilise le service Verify de Twilio (anti-fraude built-in :
  /// rate limiting, abuse detection, attempt tracking). Sinon, fallback sur
  /// l'envoi SMS direct via Messages.json + vérif locale via OtpCode en BDD.
  TWILIO_VERIFY_SERVICE_SID: z.string().optional(),

  // ===== Resend (mode "resend" pour les emails) =====
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(), // ex: noreply@backmesdo.com
  RESEND_FROM_NAME: z.string().default("BMD"),

  // ===== WhatsApp Cloud API (Meta — mode "whatsapp") =====
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  /// Numéro WhatsApp Business public au format E.164 sans le + (ex: 33612345678).
  /// Utilisé pour le bouton « Se connecter avec WhatsApp » (spec §7.2) qui ouvre
  /// wa.me/{numéro}?text=BMD-LOGIN-XXXX. Si vide → bouton WhatsApp masqué côté UI.
  WHATSAPP_BUSINESS_NUMBER: z.string().optional(),
  /// Nom du template pré-approuvé Meta (ex: bmd_otp_v1)
  WHATSAPP_OTP_TEMPLATE: z.string().optional(),
  /// Token de vérification du webhook (à renseigner côté Meta App Dashboard)
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  /// Secret applicatif Meta — vérifie la signature X-Hub-Signature-256
  WHATSAPP_APP_SECRET: z.string().optional(),

  // ===== SSO Google (optionnel — vide = bouton SSO masqué côté UI) =====
  // Setup : Google Cloud Console → OAuth 2.0 Client ID type "Application Web"
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  // URL de base de l'app web (pour construire les redirect URIs SSO,
  // Stripe Checkout success/cancel, magic links, partage social).
  // Prod : https://www.backmesdo.com — Dev : http://localhost:3000
  WEB_BASE_URL: z.string().url().default("http://localhost:3000"),

  // ===== Web Push notifications (spec §8.5 §3.12) =====
  // Génération des clés : `npx web-push generate-vapid-keys`
  // Si vide → notifications push web désactivées (in-app + email continuent).
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  /// Sujet VAPID — mailto: ou https://. Identifie le service auprès du push provider.
  VAPID_SUBJECT: z.string().default("mailto:noreply@backmesdo.com"),

  // ===== OCR providers (spec §3.8) =====
  // Mode "auto" : utilise Mindee si MINDEE_API_KEY défini, sinon OpenAI Vision si
  // OPENAI_API_KEY défini, sinon fallback sur Tesseract.js local.
  OCR_PROVIDER: z
    .enum(["auto", "mindee", "openai_vision", "tesseract"])
    .default("auto"),
  MINDEE_API_KEY: z.string().optional(),
  /// Sprint AC · Préfère le modèle Mindee Invoice v4 (factures pro B2B avec TVA,
  /// fournisseur, IBAN, etc.) plutôt que le modèle Receipts v5 (tickets de caisse
  /// simples). L'app détecte auto le bon modèle selon le contexte si non défini.
  /// Valeurs : "auto" (défaut), "invoice", "receipt".
  MINDEE_DOC_TYPE: z.enum(["auto", "invoice", "receipt"]).default("auto"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_VISION_MODEL: z.string().default("gpt-4o-mini"),

  /// Sprint AC · Whisper API (https://whisper-api.com) — transcription voix → texte.
  /// Utilisé pour le scénario "Saisie vocale" (parler une dépense au micro et le
  /// transcrire en formulaire pré-rempli). Si vide → on tombe sur l'API Web Speech
  /// du navigateur (gratuit mais qualité moindre, pas dispo sur Safari iOS).
  WHISPER_API_KEY: z.string().optional(),
  WHISPER_API_URL: z.string().default("https://transcribe.whisperapi.com"),

  // ===== SSO Apple (spec §7.2) =====
  // Setup : developer.apple.com → Identifiers → Services ID
  // APPLE_PRIVATE_KEY : contenu du .p8 (multi-lignes OK avec \n encodés)
  APPLE_CLIENT_ID: z.string().optional(),
  APPLE_TEAM_ID: z.string().optional(),
  APPLE_KEY_ID: z.string().optional(),
  APPLE_PRIVATE_KEY: z.string().optional(),

  // ===== Vault de chiffrement moyens de paiement (spec §9.1) =====
  // Génération : `openssl rand -base64 32`
  // Si vide → la fonctionnalité "moyens de paiement sauvegardés" est désactivée.
  // ⚠️ NE JAMAIS perdre cette clé en prod — sinon les méthodes existantes
  // deviennent illisibles. Procédure de rotation documentée séparément.
  PAYMENT_VAULT_KEY: z.string().optional(),

  // ===== FX Provider (spec §4) =====
  // Open Exchange Rates : compte gratuit https://openexchangerates.org/signup/free
  // 1000 requêtes/mois suffisent largement (refresh horaire = ~720/mois).
  // Si la clé est définie, le service FX l'utilise en priorité. En cas
  // d'erreur (quota dépassé, panne API), fallback automatique sur
  // exchangerate.host (gratuit, sans clé).
  // Si la clé est vide → fallback direct sur exchangerate.host.
  OPENEXCHANGERATES_KEY: z.string().optional(),

  // ===== Cache distribué (optionnel, multi-instance) =====
  // Si REDIS_URL est défini ET ioredis installé, le helper `lib/cache.ts`
  // l'utilise pour les caches inter-instances (sessions, throttling, hot
  // queries). Sinon → fallback in-memory automatique (mono-instance).
  // Format : redis://[:password@]host:port[/db] ou rediss://… (TLS).
  REDIS_URL: z.string().url().optional(),

  // ===== Stripe (spec §6.3 — paiements) =====
  // Mode test : sk_test_xxx / pk_test_xxx — basculer en sk_live_xxx en prod.
  // Sans clé, l'app fonctionne mais les flows paiement renvoient un MVP-stub.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  /// URL de base pour les redirects Checkout success/cancel (=WEB_BASE_URL)
  STRIPE_API_VERSION: z.string().default("2024-10-28.acacia"),

  // ===== V132 · Push notifications natives APNs (iOS) =====
  // Setup : developer.apple.com → Certificates, Identifiers & Profiles → Keys
  //   → "+" → activer "Apple Push Notifications service (APNs)" → Download
  //     .p8 file (UNE FOIS — non re-téléchargeable).
  // Si vide → push iOS désactivés (in-app + web push continuent).
  /// Bundle ID iOS de l'app (ex: com.backmesdo.app). Doit matcher Xcode.
  APNS_BUNDLE_ID: z.string().optional(),
  /// Key ID (10 caractères) renvoyé par Apple à la création de la clé .p8.
  APNS_KEY_ID: z.string().optional(),
  /// Team ID (10 caractères) Apple Developer.
  APNS_TEAM_ID: z.string().optional(),
  /// Contenu intégral du fichier .p8 (PEM, multi-lignes acceptées via \n).
  /// Démarre par "-----BEGIN PRIVATE KEY-----".
  APNS_KEY_P8: z.string().optional(),
  /// true → APNs production (api.push.apple.com).
  /// false → APNs sandbox (api.sandbox.push.apple.com), utilisé pour les builds
  /// dev/TestFlight signés avec un provisioning profile "Development".
  APNS_PRODUCTION: z
    .union([z.literal("true"), z.literal("false")])
    .transform((v) => v === "true")
    .default("false"),

  // ===== V132 · Push notifications natives FCM (Android) =====
  // Setup : console.firebase.google.com → projet → Project Settings →
  //   Service accounts → "Generate new private key" → JSON file.
  /// Contenu intégral du JSON service account Firebase (single-line ou \n).
  /// Si vide → push Android désactivés.
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional(),

  // ===== V150.C · Signature électronique qualifiée Yousign =====
  // Setup : console Yousign → API → Generate API key (sandbox d'abord, puis
  // production). Sans clé, les RDD restent signables en mode SIMPLE (clic +
  // OTP BMD), mais les niveaux ADVANCED et NOTARIZED renvoient une erreur claire.
  /// Clé API Yousign (Bearer token). Format sandbox : "yousign_sandbox_xxx",
  /// production : "yousign_prod_xxx".
  YOUSIGN_API_KEY: z.string().optional(),
  /// Base URL de l'API Yousign. Sandbox: "https://api-sandbox.yousign.app/v3".
  /// Production: "https://api.yousign.app/v3".
  YOUSIGN_API_BASE_URL: z
    .string()
    .url()
    .default("https://api-sandbox.yousign.app/v3"),
  /// Secret HMAC pour valider l'authenticité des webhooks Yousign. À configurer
  /// dans la console Yousign en même temps que l'URL webhook côté BMD.
  YOUSIGN_WEBHOOK_SECRET: z.string().optional(),
  /// Niveau de signature eIDAS par défaut quand le client demande "ADVANCED".
  /// Valeurs : "electronic_signature" (basique, équivalent SES eIDAS),
  /// "advanced_electronic_signature" (AES), "advanced_electronic_signature_with_qualified_certificate" (AES+),
  /// "qualified_electronic_signature" (QES — coûte plus cher mais force exécutoire en UE).
  YOUSIGN_DEFAULT_LEVEL: z
    .enum([
      "electronic_signature",
      "advanced_electronic_signature",
      "advanced_electronic_signature_with_qualified_certificate",
      "qualified_electronic_signature",
    ])
    .default("advanced_electronic_signature"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    console.error("❌ Invalid environment variables:");
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    throw new Error("Invalid env");
  }
  cached = parsed.data;
  return cached;
}

export function resetEnvCache(): void {
  cached = null;
}
