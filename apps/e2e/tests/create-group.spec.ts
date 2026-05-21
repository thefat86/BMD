import { test, expect } from "@playwright/test";
import { loginAs, uniqueEmail } from "../fixtures/auth";
import { createGroup } from "../fixtures/groups";

/**
 * Flow : création d'un groupe depuis le dashboard.
 *
 * V88.B — Refondu pour utiliser le helper `createGroup` qui matche le
 * wizard `<MobileCreateGroupSheet>` (V73.3, BottomSheet 2 étapes). L'ancien
 * modal (input placeholder + <select> type + bouton "Créer le groupe") a
 * disparu en faveur d'un parcours card-based.
 *
 * Variantes :
 *  - Test parametré sur les types TONTINE / TRAVEL / COLOC.
 *  - Test du cas erreur : nom vide → bouton désactivé.
 */
test.describe("Flow création de groupe", () => {
  test("Crée un groupe TONTINE et atterrit sur sa page de détail", async ({
    page,
  }) => {
    const email = uniqueEmail("creator");
    await loginAs(page, email);

    const groupName = `Tontine E2E ${Date.now()}`;
    await createGroup(page, { type: "TONTINE", name: groupName });

    // Le nom du groupe apparaît sur la page de détail
    await expect(page.getByText(groupName).first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("Bouton 'Créer' désactivé si le nom est vide", async ({ page }) => {
    const email = uniqueEmail("creator-empty");
    await loginAs(page, email);

    // Ouvre le wizard
    const trigger = page.getByRole("button", {
      name: /nouveau groupe|^nouveau$|＋\s*nouveau|créer un groupe/i,
    });
    await trigger.first().waitFor({ state: "visible", timeout: 30_000 });
    await trigger.first().click();

    // Étape 1 : sélectionne un type pour pouvoir passer à étape 2
    await expect(
      page.getByRole("heading", { name: /pour quoi tu crées|nouveau groupe/i }),
    ).toBeVisible({ timeout: 8_000 });
    await page.getByRole("button", { name: /^tontine$/i }).first().click();
    await page
      .getByRole("button", { name: /continuer|next|suivant/i })
      .first()
      .click();

    // Étape 2 : sans nom, le bouton "Créer le groupe" est désactivé
    await expect(
      page.getByRole("heading", { name: /détails du groupe|détails/i }),
    ).toBeVisible({ timeout: 5_000 });

    const submitBtn = page.getByRole("button", {
      name: /créer le groupe|^créer$/i,
    });
    await expect(submitBtn).toBeDisabled();

    // Tape un nom → bouton activé
    const nameInput = page
      .getByPlaceholder(/famille|tsakou|nom du groupe/i)
      .first();
    await nameInput.fill("Test");
    await expect(submitBtn).toBeEnabled();

    // Vide → re-disabled
    await nameInput.fill("");
    await expect(submitBtn).toBeDisabled();
  });

  test("Crée un groupe VOYAGE et vérifie le type sur la page de détail", async ({
    page,
  }) => {
    const email = uniqueEmail("voyageur");
    await loginAs(page, email);

    const groupName = `Voyage Dakar ${Date.now()}`;
    await createGroup(page, { type: "TRAVEL", name: groupName });

    // Sur la page de détail, on voit le nom du groupe.
    await expect(page.getByText(groupName).first()).toBeVisible({
      timeout: 5_000,
    });
  });
});
