/**
 * Seed des langues supportées (spec §6.6).
 *
 * 11 langues seedées par défaut. L'admin peut activer/désactiver
 * depuis /admin/locales sans déployer de code.
 *
 * Idempotent : upsert sur le code. Les modifications admin (isActive,
 * displayOrder) ne sont pas réécrasées au redémarrage.
 */
import { prisma } from "./db.js";

interface LocaleSeed {
  code: string;
  name: string;
  flag: string;
  direction?: "ltr" | "rtl";
  displayOrder: number;
}

const LOCALES: LocaleSeed[] = [
  // === Top tier (UE et marchés majeurs) ===
  { code: "fr", name: "Français", flag: "🇫🇷", displayOrder: 1 },
  { code: "en", name: "English", flag: "🇬🇧", displayOrder: 2 },
  { code: "es", name: "Español", flag: "🇪🇸", displayOrder: 3 },
  { code: "pt", name: "Português", flag: "🇵🇹", displayOrder: 4 },
  { code: "de", name: "Deutsch", flag: "🇩🇪", displayOrder: 5 },
  { code: "it", name: "Italiano", flag: "🇮🇹", displayOrder: 6 },
  { code: "lb", name: "Lëtzebuergesch", flag: "🇱🇺", displayOrder: 7 },
  { code: "ru", name: "Русский", flag: "🇷🇺", displayOrder: 8 },
  { code: "ja", name: "日本語", flag: "🇯🇵", displayOrder: 9 },
  { code: "ko", name: "한국어", flag: "🇰🇷", displayOrder: 10 },
  // === Diaspora afro-asiatique ===
  { code: "ar", name: "العربية", flag: "🇲🇦", direction: "rtl", displayOrder: 11 },
  { code: "sw", name: "Kiswahili", flag: "🇰🇪", displayOrder: 12 },
  { code: "zh", name: "中文", flag: "🇨🇳", displayOrder: 13 },
  { code: "wo", name: "Wolof", flag: "🇸🇳", displayOrder: 14 },
  { code: "am", name: "አማርኛ", flag: "🇪🇹", direction: "rtl", displayOrder: 15 },
  { code: "ln", name: "Lingála", flag: "🇨🇩", displayOrder: 16 },
  // === Pidgins (créoles anglais ouest-africains — variantes par pays) ===
  // Le pidgin camerounais, nigérian et ghanéen sont mutuellement intelligibles
  // mais ont des spécificités lexicales et culturelles. On les sépare pour
  // permettre des traductions adaptées à chaque diaspora.
  // Le code "pcm" (générique) reste pour rétrocompatibilité.
  { code: "pcm", name: "Pidgin", flag: "🌍", displayOrder: 17 },
  { code: "pcm-cm", name: "Pidgin (Cameroun)", flag: "🇨🇲", displayOrder: 18 },
  { code: "pcm-ng", name: "Pidgin (Nigeria)", flag: "🇳🇬", displayOrder: 19 },
  { code: "pcm-gh", name: "Pidgin (Ghana)", flag: "🇬🇭", displayOrder: 20 },
  // === Argots urbains spécifiques ===
  // Francanglais : argot camerounais mêlant français + anglais + langues locales
  // (très utilisé par la jeunesse urbaine de Douala/Yaoundé).
  { code: "fr-cm", name: "Francanglais (Cameroun)", flag: "🇨🇲", displayOrder: 21 },
  // Nouchi : argot urbain ivoirien mêlant français + dioula + baoulé + autres
  // langues locales (très répandu à Abidjan, popularisé par le coupé-décalé).
  { code: "fr-ci", name: "Nouchi (Côte d'Ivoire)", flag: "🇨🇮", displayOrder: 22 },
];

export async function seedLocales(): Promise<void> {
  for (const l of LOCALES) {
    try {
      await prisma.locale.upsert({
        where: { code: l.code },
        create: {
          code: l.code,
          name: l.name,
          flag: l.flag,
          direction: l.direction ?? "ltr",
          displayOrder: l.displayOrder,
        },
        // À la mise à jour : on ne touche PAS isActive (admin maître)
        // ni displayOrder (admin peut avoir réordonné)
        update: {
          name: l.name,
          flag: l.flag,
          direction: l.direction ?? "ltr",
        },
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[seed-locales] skip", l.code, (err as Error).message);
    }
  }
}
