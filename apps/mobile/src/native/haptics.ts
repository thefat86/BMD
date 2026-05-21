/**
 * Haptics — feedback tactile fin sur iOS (Taptic Engine) et Android.
 *
 * Sémantique BMD (à réutiliser partout pour cohérence) :
 *   - "tap"     → tap léger sur un bouton secondaire ou toggle
 *   - "select"  → sélection d'item dans une liste
 *   - "success" → action réussie (paiement OK, dépense créée)
 *   - "warn"    → confirmation requise (suppression, désynchronisation)
 *   - "error"   → erreur ou rejet (rate-limit, mauvais OTP)
 *
 * La PWA actuelle a déjà un module `lib/platform.ts` côté `apps/web/` qui
 * fait `navigator.vibrate()` côté web — mais sur iOS Safari, vibrate() ne
 * marche pas. Le bridge Capacitor remplace ce fallback par le vrai Taptic.
 */

import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

export type HapticPattern = "tap" | "select" | "success" | "warn" | "error";

export const haptics = {
  async impact(pattern: HapticPattern): Promise<void> {
    try {
      switch (pattern) {
        case "tap":
          await Haptics.impact({ style: ImpactStyle.Light });
          return;
        case "select":
          await Haptics.selectionStart();
          await Haptics.selectionEnd();
          return;
        case "success":
          await Haptics.notification({ type: NotificationType.Success });
          return;
        case "warn":
          await Haptics.notification({ type: NotificationType.Warning });
          return;
        case "error":
          await Haptics.notification({ type: NotificationType.Error });
          return;
      }
    } catch {
      // Pas de Taptic Engine sur certains Android — silent fallback.
    }
  },
};
