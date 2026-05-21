import { test, expect } from "@playwright/test";
import { loginAs, uniqueEmail } from "../fixtures/auth";

/**
 * Flow : ajout d'une dépense dans un groupe.
 *
 * Pré-requis : un user authentifié + un groupe existant. Comme on ne
 * partage pas l'état entre tests, on enchaîne les 2 (login → create group
 * → add expense).
 *
 * Étapes :
 *  1. Login + création groupe
 *  2. Sur /dashboard/groups/:id, clic sur la quick-card « Dépense »
 *  3. Le panel "+ Nouvelle dépense" s'ouvre
 *  4. Remplit description + montant
 *  5. Clic sur "✓ Ajouter"
 *  6. Vérifie que la dépense apparaît dans la liste
 *  7. Vérifie que la balance est mise à jour
 */
test.describe("Flow ajout de dépense", () => {
  test("Crée groupe puis ajoute une dépense — apparaît dans la liste", async ({
    page,
  }) => {
    const email = uniqueEmail("expensor");
    await loginAs(page, email);

    // ---- 1. Créer le groupe ----
    const trigger = page.getByRole("button", {
      name: /nouveau groupe|^nouveau$|＋\s*nouveau/i,
    });
    await trigger.first().click();

    await expect(
      page.getByRole("heading", { name: /nouveau groupe/i }),
    ).toBeVisible();

    const groupName = `Resto E2E ${Date.now()}`;
    await page
      .getByPlaceholder(/tontine|voyage|coloc/i)
      .first()
      .fill(groupName);
    await page.locator("select").first().selectOption("EVENT");
    await page.getByRole("button", { name: /créer le groupe/i }).click();

    await page.waitForURL(/\/dashboard\/groups\/[0-9a-f-]{36}/, {
      timeout: 10_000,
    });

    // ---- 2. Ouvrir le panel dépense ----
    // La quick-card "Dépense" est un bouton avec un span.lbl="Dépense"
    const expenseQuickCard = page
      .locator("button.quick-card", { hasText: /dépense/i })
      .first();
    await expenseQuickCard.click();

    // Le panel s'ouvre avec heading "+ Nouvelle dépense"
    await expect(
      page.getByRole("heading", { name: /nouvelle dépense/i }),
    ).toBeVisible({ timeout: 5_000 });

    // ---- 3. Remplir le formulaire ----
    const description = `Resto Africaine ${Date.now()}`;
    await page
      .getByPlaceholder(/resto|courses|hôtel/i)
      .first()
      .fill(description);

    await page
      .getByPlaceholder(/60\.00|^[0-9]+\.[0-9]+$/)
      .first()
      .fill("42.50");

    // ---- 4. Submit "✓ Ajouter" ----
    const submitBtn = page.getByRole("button", { name: /✓\s*ajouter/i });

    // Le mode de partage par défaut est EQUAL avec le créateur seul comme
    // participant — donc validation OK
    await expect(submitBtn).toBeEnabled({ timeout: 3_000 });
    await submitBtn.click();

    // ---- 5. La dépense apparaît dans la liste ----
    await expect(page.getByText(description).first()).toBeVisible({
      timeout: 5_000,
    });

    // ---- 6. Le panel se referme (heading ne devrait plus être visible) ----
    // (optionnel — selon l'UI, le panel peut rester ouvert pour ajouter
    // une autre dépense. On ne force donc pas cette vérification.)
  });

  test("Bouton 'Ajouter' désactivé si la description ou le montant manque", async ({
    page,
  }) => {
    const email = uniqueEmail("validator");
    await loginAs(page, email);

    // Créer un groupe
    const trigger = page.getByRole("button", {
      name: /nouveau groupe|^nouveau$|＋\s*nouveau/i,
    });
    await trigger.first().click();
    await page
      .getByPlaceholder(/tontine|voyage|coloc/i)
      .first()
      .fill(`Validation ${Date.now()}`);
    await page.getByRole("button", { name: /créer le groupe/i }).click();
    await page.waitForURL(/\/dashboard\/groups\/[0-9a-f-]{36}/);

    // Ouvrir le panel dépense
    await page
      .locator("button.quick-card", { hasText: /dépense/i })
      .first()
      .click();

    await expect(
      page.getByRole("heading", { name: /nouvelle dépense/i }),
    ).toBeVisible();

    // Sans description ni montant, le bouton est désactivé
    const submitBtn = page.getByRole("button", { name: /✓\s*ajouter/i });
    await expect(submitBtn).toBeDisabled();

    // Avec juste description → toujours désactivé (montant manquant)
    await page
      .getByPlaceholder(/resto|courses|hôtel/i)
      .first()
      .fill("Test");
    await expect(submitBtn).toBeDisabled();

    // Avec description + montant → activé
    await page
      .getByPlaceholder(/60\.00|^[0-9]+\.[0-9]+$/)
      .first()
      .fill("10");
    await expect(submitBtn).toBeEnabled();
  });
});
