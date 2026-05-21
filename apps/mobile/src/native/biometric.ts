/**
 * Biometric — Face ID / Touch ID / Empreinte Android.
 *
 * STATUT PHASE 2 : stub no-op. La biométrie native sera activée en
 * Phase 3 quand on choisira la version compatible Capacitor 7 du plugin
 * (@aparajita/capacitor-biometric-auth a un peer dep restrictif à Cap 6
 * sur sa dernière major — à valider).
 *
 * En attendant, BMD utilise les **passkeys WebAuthn** côté PWA pour la
 * biométrie initiale (sign-in via Face ID enrôlé en passkey iCloud
 * Keychain / Google Password Manager). Ça marche déjà sur la PWA.
 */

export type BiometryType =
  | "faceId"
  | "touchId"
  | "fingerprint"
  | "faceAuthentication"
  | "irisAuthentication"
  | "none";

export const biometric = {
  async available(): Promise<{ available: boolean; biometryType: BiometryType }> {
    return { available: false, biometryType: "none" };
  },

  async authenticate(_reason: string): Promise<void> {
    throw new Error(
      "biometric.authenticate() sera disponible en Phase 3 — utilise WebAuthn passkeys en attendant",
    );
  },
};
