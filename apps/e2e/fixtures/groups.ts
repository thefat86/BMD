/**
 * Helpers pour créer un groupe via le wizard `<MobileCreateGroupSheet>`.
 *
 * V88.B — Refonte du wizard en V73.3 : le formulaire historique
 * (<input placeholder=tontine|coloc...> + <select> type + bouton
 * "Créer le groupe") a été remplacé par un BottomSheet 2-étapes :
 *
 *   Étape 1 — Choix du type (5 cards : Tontine / Coloc / Voyage & sortie /
 *             Vie quotidienne / Autre) + bouton « Continuer → »
 *   Étape 2 — Détails (input nom + memberCount/lieu optionnels) +
 *             bouton « Créer le groupe »
 *
 * Ce helper encapsule ce parcours pour que les tests E2E s'occupent
 * uniquement de leur logique métier (ajout de dépense, settlement, ...),
 * pas de comment cliquer dans le wizard.
 *
 * Map vers les types backend :
 *   TONTINE → TONTINE
 *   COLOC   → COLOC
 *   TRAVEL  → TRAVEL (label = "Voyage & sortie")
 *   EVENT   → EVENT  (label = "Vie quotidienne")
 *   OTHER   → GENERIC (le wizard mappe "OTHER" côté front avant l'API)
 */
import { expect, type Page } from "@playwright/test";

export type GroupType = "TONTINE" | "COLOC" | "TRAVEL" | "EVENT" | "OTHER";

interface CreateGroupOpts {
  /** Type de groupe (aria-label de la card étape 1). */
  type?: GroupType;
  /** Nom du groupe (étape 2). Default : `Groupe E2E ${timestamp}`. */
  name?: string;
  /** Pré-condition : l'utilisateur doit déjà être loggué et sur /dashboard. */
  skipNav?: boolean;
}

const TYPE_LABELS: Record<GroupType, RegExp> = {
  TONTINE: /^tontine$/i,
  COLOC: /^coloc$/i,
  TRAVEL: /voyage|travel|sortie/i,
  EVENT: /vie quotidienne|événement|event/i,
  OTHER: /^autre$|^other$/i,
};

/**
 * Ouvre le sheet de création, sélectionne un type, remplit le nom et valide.
 * Attend l'arrivée sur la page détail du groupe (`/dashboard/groups/{uuid}`).
 *
 * Retourne le `groupId` extrait de l'URL et le `name` utilisé.
 */
export async function createGroup(
  page: Page,
  opts: CreateGroupOpts = {},
): Promise<{ groupId: string; name: string }> {
  const { type = "EVENT", name = `Groupe E2E ${Date.now()}`, skipNav } = opts;

  if (!skipNav && !page.url().endsWith("/dashboard")) {
    await page.goto("/dashboard");
  }

  // ---- 1. Trigger d'ouverture du sheet ----
  // Plusieurs entrées possibles selon la page :
  //  - Bouton header desktop « + Nouveau » (dashboard)
  //  - Empty state « Créer ton premier groupe » (dashboard sans groupe)
  //  - FAB chooser → « Créer un groupe » (mobile)
  //
  // On essaie d'abord le bouton header desktop ; si pas trouvé, on tombe
  // sur le FAB ou l'empty-state.
  const trigger = page
    .getByRole("button", {
      name: /nouveau groupe|^nouveau$|＋\s*nouveau|créer.*premier|créer un groupe/i,
    })
    .first();
  // On force visible avec un timeout généreux (cold-start dev Next.js peut
  // mettre du temps à compiler /dashboard).
  await trigger.waitFor({ state: "visible", timeout: 30_000 });
  await trigger.click();

  // ---- 2. Étape 1 — Choisir le type ----
  // Le wizard a un h2 "Pour quoi tu crées ce groupe ?".
  await expect(
    page.getByRole("heading", { name: /pour quoi tu crées|nouveau groupe/i }),
  ).toBeVisible({ timeout: 8_000 });

  // Click sur la card du type (aria-label = label visible).
  const typeCard = page
    .getByRole("button", { name: TYPE_LABELS[type] })
    .first();
  await typeCard.click();

  // Click sur « Continuer → »
  await page
    .getByRole("button", { name: /continuer|next|suivant/i })
    .first()
    .click();

  // ---- 3. Étape 2 — Saisir le nom + valider ----
  await expect(
    page.getByRole("heading", { name: /détails du groupe|détails/i }),
  ).toBeVisible({ timeout: 5_000 });

  // L'input nom est `autoFocus` avec placeholder "Ex: Famille Tsakou".
  const nameInput = page.getByPlaceholder(/famille|tsakou|nom du groupe/i).first();
  await nameInput.waitFor({ state: "visible", timeout: 5_000 });
  await nameInput.fill(name);

  // Bouton « Créer le groupe » (gradient saffron-terracotta).
  await page
    .getByRole("button", { name: /créer le groupe|^créer$|create the group/i })
    .first()
    .click();

  // ---- 4. Atterrissage page détail groupe ----
  await page.waitForURL(/\/dashboard\/groups\/[0-9a-f-]{36}/, {
    timeout: 15_000,
  });

  const match = page.url().match(/\/dashboard\/groups\/([0-9a-f-]{36})/);
  if (!match) {
    throw new Error(
      `URL inattendue après création de groupe : ${page.url()}`,
    );
  }
  return { groupId: match[1], name };
}
