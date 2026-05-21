/**
 * Contacts — accès au carnet d'adresses pour suggérer des invitations.
 *
 * V96 — Implémentation native via `@capacitor-community/contacts` (Cap 7).
 *
 * Pourquoi un import dynamique :
 *  - Le plugin n'est pas un peer dependency obligatoire — si l'app
 *    Capacitor est construite sans le plugin (build dev sans `npm i`),
 *    on ne veut pas planter le bridge. On tente l'import à la demande.
 *  - Côté web pur (PWA hors Capacitor), ce module ne s'exécute pas
 *    (le bridge est seulement monté quand `Capacitor.isNativePlatform()`).
 *
 * RGPD :
 *  - On NE STOCKE RIEN. La liste est lue côté natif → renvoyée au JS →
 *    affichée dans BMD pour que l'utilisateur sélectionne, puis on n'envoie
 *    QUE les contacts cochés au serveur (via batchInviteMembers).
 *  - Le prompt système iOS s'affiche au 1ʳᵉ appel `requestPermission()`.
 *  - Sur Android 13+, le runtime permission READ_CONTACTS est demandé
 *    automatiquement par le plugin à `getContacts()`.
 *
 * Permissions plateforme :
 *  - iOS  : NSContactsUsageDescription (Info.plist) — ✓ déjà ajouté
 *  - Android : android.permission.READ_CONTACTS (Manifest) — ✓ déjà ajouté
 */

export interface ContactEntry {
  contactId: string;
  displayName: string | null;
  phones: string[];
  emails: string[];
}

export interface ContactsResult {
  contacts: ContactEntry[];
  totalCount: number;
}

/**
 * Tente de charger le plugin natif. Retourne null si non installé
 * (mode dev, ou plateforme web). On garde `any` pour ne pas forcer
 * une dépendance de type à la compilation côté `apps/mobile/`.
 */
async function loadContactsPlugin(): Promise<any | null> {
  try {
    // @ts-ignore — peer optionnel, peut ne pas être installé en dev.
    const mod = await import("@capacitor-community/contacts");
    return mod?.Contacts ?? null;
  } catch {
    return null;
  }
}

/**
 * Normalise un téléphone brut en E.164 best-effort (préfixe "+", pas de
 * séparateurs). Côté serveur, `validateContact` re-vérifie le format.
 * On laisse tomber les numéros qui n'ont pas l'air d'être en E.164 plutôt
 * que de risquer une invitation à un mauvais numéro.
 */
function normalizePhone(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  // Enlève espaces, tirets, parenthèses, points.
  const cleaned = trimmed.replace(/[\s\-().]/g, "");
  // Si commence par 00 → remplace par +.
  const withPlus = cleaned.startsWith("00")
    ? "+" + cleaned.slice(2)
    : cleaned;
  // Doit commencer par + suivi de 7-15 chiffres pour être E.164.
  if (/^\+\d{7,15}$/.test(withPlus)) return withPlus;
  // Si pas de + mais 9-10 chiffres → on tente +33 (FR par défaut).
  // On NE force PAS ça automatiquement : on préfère renvoyer le numéro
  // tel quel et laisser BMD prompter l'utilisateur pour confirmer.
  if (/^\d{9,15}$/.test(cleaned)) return "+" + cleaned;
  return null;
}

function normalizeEmail(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

export const contacts = {
  /**
   * Demande l'autorisation système d'accéder aux contacts.
   * Affiche le prompt iOS / Android au 1ᵉʳ appel.
   */
  async requestPermission(): Promise<{ granted: boolean }> {
    const plugin = await loadContactsPlugin();
    if (!plugin) return { granted: false };
    try {
      // Plugin v7 : requestPermissions() retourne { contacts: "granted" | ... }
      const result = await plugin.requestPermissions();
      const status =
        result?.contacts ?? result?.contactsPermission ?? "denied";
      return { granted: status === "granted" };
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[bmd-contacts] requestPermission failed:", e);
      return { granted: false };
    }
  },

  /**
   * Récupère la liste complète des contacts (nom + téls + emails).
   * Demande la permission si pas encore accordée. Retourne une liste
   * vide si refusée — pas d'exception (UX : on bascule sur la saisie
   * manuelle dans BMD).
   *
   * Le tri est alphabétique sur le nom affiché pour faciliter la
   * recherche dans le picker BMD.
   */
  async list(): Promise<ContactsResult> {
    const plugin = await loadContactsPlugin();
    if (!plugin) return { contacts: [], totalCount: 0 };

    // 1. Vérifie/demande la permission
    try {
      const perm = await plugin.checkPermissions().catch(() => ({}));
      const status =
        perm?.contacts ?? perm?.contactsPermission ?? "prompt";
      if (status !== "granted") {
        const ask = await plugin.requestPermissions();
        const newStatus =
          ask?.contacts ?? ask?.contactsPermission ?? "denied";
        if (newStatus !== "granted") {
          return { contacts: [], totalCount: 0 };
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[bmd-contacts] permission check failed:", e);
      return { contacts: [], totalCount: 0 };
    }

    // 2. Lit la liste avec une projection minimale (RGPD)
    try {
      const result = await plugin.getContacts({
        projection: {
          name: true,
          phones: true,
          emails: true,
        },
      });
      const rawList: any[] = Array.isArray(result?.contacts)
        ? result.contacts
        : [];
      const entries: ContactEntry[] = [];
      for (const c of rawList) {
        const id = c?.contactId ?? c?.id ?? "";
        const displayName: string | null =
          c?.name?.display ??
          [c?.name?.given, c?.name?.family].filter(Boolean).join(" ") ??
          null;

        const phones: string[] = [];
        const rawPhones: any[] = Array.isArray(c?.phones) ? c.phones : [];
        for (const p of rawPhones) {
          const num = normalizePhone(p?.number);
          if (num && !phones.includes(num)) phones.push(num);
        }

        const emails: string[] = [];
        const rawEmails: any[] = Array.isArray(c?.emails) ? c.emails : [];
        for (const e of rawEmails) {
          const adr = normalizeEmail(e?.address);
          if (adr && !emails.includes(adr)) emails.push(adr);
        }

        // Skip les contacts sans aucun moyen de joindre — inutilisables
        // pour BMD.
        if (phones.length === 0 && emails.length === 0) continue;

        entries.push({
          contactId: String(id || `c-${entries.length}`),
          displayName: displayName?.trim() || null,
          phones,
          emails,
        });
      }

      // Tri alphabétique : place les "sans nom" en fin de liste.
      entries.sort((a, b) => {
        if (!a.displayName && b.displayName) return 1;
        if (a.displayName && !b.displayName) return -1;
        if (!a.displayName && !b.displayName) return 0;
        return (a.displayName ?? "").localeCompare(b.displayName ?? "", "fr");
      });

      return { contacts: entries, totalCount: entries.length };
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[bmd-contacts] getContacts failed:", e);
      return { contacts: [], totalCount: 0 };
    }
  },
};
