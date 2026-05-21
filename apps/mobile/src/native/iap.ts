/**
 * In-App Purchases (StoreKit) — abonnements iOS.
 *
 * STATUT PHASE 2 : stub no-op. À activer en Phase 3 quand :
 *  1. Le compte Apple Developer est actif (99 $/an)
 *  2. Les produits sont créés dans App Store Connect (PREMIUM_MONTHLY,
 *     PREMIUM_YEARLY, COMMUNITY_MONTHLY, PARISH_MONTHLY, EVENT_29)
 *  3. RevenueCat (ou alternative compat Cap 7) est choisi et configuré
 *  4. Le webhook RevenueCat → API BMD est en place
 *
 * En attendant, l'utilisateur iOS verra un message "Cette fonctionnalité
 * sera bientôt disponible sur iOS — pour t'abonner aujourd'hui, ouvre
 * BMD sur backmesdo.com depuis ton navigateur".
 *
 * Cf. project_bmd_decisions.md pour la stratégie : IAP iOS / Stripe
 * partout ailleurs.
 */

export interface IapProduct {
  productId: string;
  planCode: string;
  period: "monthly" | "yearly" | "one_shot";
  priceLocalized: string;
  priceCents: number;
  currency: string;
}

export interface IapPurchaseResult {
  transactionId: string;
  productId: string;
  planCode: string;
  receipt: string;
  expiresAt: Date | null;
}

export const iap = {
  async listProducts(): Promise<IapProduct[]> {
    return [];
  },

  async purchase(_productId: string): Promise<IapPurchaseResult> {
    throw new Error(
      "iap.purchase() sera activé en Phase 3 — abonnements iOS via StoreKit pas encore configurés",
    );
  },

  async restorePurchases(): Promise<IapPurchaseResult[]> {
    return [];
  },
};
