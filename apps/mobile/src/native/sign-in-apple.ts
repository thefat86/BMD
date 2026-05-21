/**
 * Sign in with Apple — flow natif iOS, fallback web sur Android.
 *
 * STATUT PHASE 2 : redirection vers le flow OAuth web `/auth/apple`
 * (déjà câblé côté backend dans `apps/api/src/lib/apple-oauth.ts`).
 * Le natif `@capacitor-community/sign-in-with-apple` sera activé en
 * Phase 3 quand on validera sa version Cap 7 et qu'on configurera le
 * Services ID + Key .p8 chez Apple Developer.
 *
 * En attendant, l'app Capacitor ouvrira le flow OAuth web qui marche
 * déjà côté PWA — moins fluide que le natif mais 100 % fonctionnel.
 */

export interface AppleSignInResult {
  identityToken: string;
  authorizationCode: string;
  email: string | null;
  fullName: string | null;
  user: string;
}

export const signInWithApple = {
  async signIn(): Promise<AppleSignInResult> {
    // Redirection vers le flow OAuth web — l'API BMD gère le callback.
    window.location.href = "/auth/apple";
    // Ne résout jamais — la redirection prend le contrôle.
    return new Promise(() => {});
  },
};
