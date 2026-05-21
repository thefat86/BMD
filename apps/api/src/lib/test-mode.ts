/**
 * V213 — Mode test global (SiteConfig.testModeEnabled).
 * =============================================================================
 * TEMPORAIRE — Une fois la phase de test interne terminée, ce fichier doit
 * être supprimé et tous les call-sites `if (await isTestModeActive())` doivent
 * être enlevés. Voir la mémoire V212/V213 pour la checklist de retrait.
 *
 * Quand le flag SiteConfig.testModeEnabled est ON :
 *  - Tous les users ont les capacités d'un plan illimité (PRO/admin).
 *  - Toutes les limitations de plan sont bypassées (maxGroups, photo,
 *    custom logo, reçu fiscal, signatures qualifiées, caisses, OCR/voice,
 *    booster packs, etc.).
 *  - L'endpoint /groups/:id/members/test-add est ouvert aux admins de groupe.
 *
 * Quand le flag est OFF (défaut) : l'app fonctionne comme en prod, avec
 * les vraies limites de chaque plan.
 *
 * Le résultat est caché 10 secondes en mémoire pour éviter de spammer la
 * DB sur des routes appelées en boucle (refresh dashboard, polling, etc.).
 * Le cache est invalidé quand le flag change via PATCH /admin/site-config.
 */
import { prisma } from "./db.js";

const CACHE_TTL_MS = 10_000;

let cached: { value: boolean; loadedAt: number } | null = null;

/**
 * Retourne true si SiteConfig.testModeEnabled est ON.
 * Cache 10s en mémoire. Idempotent — appelable depuis n'importe quelle route.
 *
 * Erreurs réseau / DB indisponible → retourne false (safe default).
 */
export async function isTestModeActive(): Promise<boolean> {
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.value;
  }
  try {
    const config = await (prisma as any).siteConfig.findUnique({
      where: { id: "default" },
      select: { testModeEnabled: true },
    });
    const value = Boolean(config?.testModeEnabled);
    cached = { value, loadedAt: Date.now() };
    return value;
  } catch {
    return false;
  }
}

/**
 * Invalide le cache du mode test. À appeler quand le flag change via
 * /admin/site-config pour que le changement soit immédiat (sinon délai 10s).
 */
export function invalidateTestModeCache(): void {
  cached = null;
}

/**
 * Limites « illimitées » utilisées en mode test pour bypass toutes les
 * restrictions de plan. La forme reproduit celle attendue par les
 * `assertCanXxx` et `requireFeature` dans plan-limits.ts.
 *
 * Convention BMD :
 *  - Quotas numériques : -1 = illimité
 *  - Capacités booléennes : true = activé
 *
 * Si une nouvelle capacité plan est ajoutée plus tard, l'ajouter ici aussi.
 */
export const UNLIMITED_TEST_LIMITS: Record<string, unknown> = {
  // Quotas core
  maxGroups: -1,
  maxMembersPerGroup: -1,
  ocrPerMonth: -1,
  voicePerMonth: -1,
  scansPerMonth: -1,
  // Caisses projet
  projectFundsMax: -1,
  // Signatures RDD (V152)
  signatureLevelSimplePerMonth: -1,
  signatureLevelAdvancedPerMonth: -1,
  signatureLevelQualifiedPerMonth: -1,
  // V152 — Vraies clés utilisées par consumeSignatureQuota
  signaturesSimpleIncluded: -1,
  signaturesAdvancedIncluded: -1,
  // Réunions (Whisper IA)
  meetingsPerMonth: -1,
  meetingDurationMinutes: -1,
  // Capacités booléennes
  whatsappBot: true,
  multiCurrency: true,
  debtSwap: true,
  exportPdfExcel: true,
  taxReceipt: true,
  twoFactor: true,
  customRoles: true,
  realtime: true,
  // Photos profil visibles (V77)
  profilePhotoVisible: true,
  // Logo personnalisé PDF (V163)
  customLogoEnabled: true,
  // Reçus fiscaux (V111)
  taxReceiptsEnabled: true,
};
