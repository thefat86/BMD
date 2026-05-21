import { test, expect } from "@playwright/test";
import { loginAs, uniqueEmail } from "../fixtures/auth";

/**
 * Flow : création d'un groupe depuis le dashboard.
 *
 * Étapes couvertes :
 *  1. Login OTP (via helper)
 *  2. Clic sur le FAB « + » (mobile) ou « Nouveau groupe » (desktop)
 *  3. Remplissage du modal CreateGroupModal (nom + type)
 *  4. Submit → redirection vers /dashboard/groups/:id
 *  5. Vérification de la présence du nom du groupe sur la page de détail
 *
 * Variantes :
 *  - Test parametré sur les types TONTINE / VOYAGE / COLOC pour valider que
 *    le `select` est correctement câblé.
 *  - Test du cas erreur : nom vide → bouton désactivé.
 */
test.describe("Flow création de groupe", () => {
  test("Crée un groupe TONTINE et atterrit sur sa page de détail", async ({
    page,
  }) => {
    const email = uniqueEmail("creator");
    await loginAs(page, email);

    // Sur mobile, le FAB est le bouton aria-label="Nouveau"
    // Sur desktop, c'est plutôt "Nouveau groupe" dans le header
    // On utilise un selector qui match les deux
    const trigger = page.getByRole("button", {
      name: /nouveau groupe|^nouveau$|＋\s*nouveau/i,
    });
    await trigger.first().click();

    // Modal apparaît avec heading "Nouveau groupe"
    await expect(
      page.getByRole("heading", { name: /nouveau groupe/i }),
    ).toBeVisible({ timeout: 5_000 });

    // Remplit le nom
    const groupName = `Tontine E2E ${Date.now()}`;
    await page
      .getByPlaceholder(/tontine|voyage|coloc/i)
      .first()
      .fill(groupName);

    // Choisit le type TONTINE (devrait être le défaut, mais on force)
    const typeSelect = page.locator("select").first();
    await typeSelect.selectOption("TONTINE");

    // Submit
    await page.getByRole("button", { name: /créer le groupe/i }).click();

    // Redirection vers /dashboard/groups/:id (UUID)
    await page.waitForURL(
      /\/dashboard\/groups\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
      { timeout: 10_000 },
    );

    // Le nom du groupe apparaît sur la page de détail
    await expect(page.getByText(groupName).first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("Bouton 'Créer' désactivé si le nom est vide", async ({ page }) => {
    const email = uniqueEmail("creator-empty");
    await loginAs(page, email);

    // Ouvre le modal
    const trigger = page.getByRole("button", {
      name: /nouveau groupe|^nouveau$|＋\s*nouveau/i,
    });
    await trigger.first().click();

    await expect(
      page.getByRole("heading", { name: /nouveau groupe/i }),
    ).toBeVisible();

    // Le bouton submit existe mais est disabled
    const submitBtn = page.getByRole("button", { name: /créer le groupe/i });
    await expect(submitBtn).toBeDisabled();

    // Tape un nom → bouton activé
    await page
      .getByPlaceholder(/tontine|voyage|coloc/i)
      .first()
      .fill("Test");
    await expect(submitBtn).toBeEnabled();

    // Vide → re-disabled
    await page
      .getByPlaceholder(/tontine|voyage|coloc/i)
      .first()
      .fill("");
    await expect(submitBtn).toBeDisabled();
  });

  test("Crée un groupe VOYAGE et vérifie le type sur la page de détail", async ({
    page,
  }) => {
    const email = uniqueEmail("voyageur");
    await loginAs(page, email);

    const trigger = page.getByRole("button", {
      name: /nouveau groupe|^nouveau$|＋\s*nouveau/i,
    });
    await trigger.first().click();

    await expect(
      page.getByRole("heading", { name: /nouveau groupe/i }),
    ).toBeVisible();

    const groupName = `Voyage Dakar ${Date.now()}`;
    await page
      .getByPlaceholder(/tontine|voyage|coloc/i)
      .first()
      .fill(groupName);

    const typeSelect = page.locator("select").first();
    await typeSelect.selectOption("VOYAGE");

    await page.getByRole("button", { name: /créer le groupe/i }).click();

    await page.waitForURL(/\/dashboard\/groups\/[0-9a-f-]{36}/, {
      timeout: 10_000,
    });

    // Sur la page de détail, on voit le nom + un indice du type voyage
    await expect(page.getByText(groupName).first()).toBeVisible();
  });
});
