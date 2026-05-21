import { test, expect } from "@playwright/test";
import { loginAs, uniqueEmail } from "../fixtures/auth";
import { createGroup } from "../fixtures/groups";

/**
 * Flow : ajout d'une dépense dans un groupe.
 *
 * V88.B — Refactorisé pour utiliser le helper `createGroup` (matche le
 * wizard `<MobileCreateGroupSheet>` V73.3). Avant : le test cherchait
 * `placeholder /tontine|voyage|coloc/` + un `<select>` qui n'existent plus.
 *
 * Étapes :
 *  1. Login + création groupe via wizard
 *  2. Sur /dashboard/groups/:id, clic sur la quick-card « Dépense »
 *  3. Remplit description + montant
 *  4. Submit "✓ Ajouter"
 *  5. Vérifie que la dépense apparaît dans la liste
 */
test.describe("Flow ajout de dépense", () => {
  test("Crée groupe puis ajoute une dépense — apparaît dans la liste", async ({
    page,
  }) => {
    const email = uniqueEmail("expensor");
    await loginAs(page, email);

    // ---- 1. Créer le groupe via le wizard ----
    await createGroup(page, {
      type: "EVENT",
      name: `Resto E2E ${Date.now()}`,
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
  });

  test("Bouton 'Ajouter' désactivé si la description ou le montant manque", async ({
    page,
  }) => {
    const email = uniqueEmail("validator");
    await loginAs(page, email);

    // Créer un groupe via le wizard
    await createGroup(page, {
      type: "EVENT",
      name: `Validation ${Date.now()}`,
    });

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
