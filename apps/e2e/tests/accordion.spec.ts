import { test, expect } from "@playwright/test";

/**
 * V27 + V28 · Tests E2E des comportements accordéon sur le site vitrine.
 *
 * Couvre :
 *  - LangPicker : ouvrir un sous-groupe ferme automatiquement le précédent.
 *  - LangPicker : un clic en dehors du picker referme le dropdown ET tous
 *    les groupes (l'utilisateur n'a pas à fermer manuellement).
 *  - LangPicker : la touche Escape referme aussi le picker.
 *  - FaqLong : ouvrir une question referme la précédente (accordion).
 *
 * Tous les tests s'exécutent en desktop uniquement (sur mobile, le site
 * vitrine bascule sur MobileWelcome qui n'a pas le LangPicker complet).
 */

test.describe("V27 · LangPicker accordion + outside-click", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      testInfo.project.name.startsWith("mobile"),
      "LangPicker complet est desktop-only",
    );
  });

  test("Ouvrir 'Asiatiques' referme 'Européennes'", async ({ page }) => {
    await page.goto("/");

    // Ouvre le picker via le bouton (il affiche le drapeau + nom de la locale)
    const picker = page.getByRole("button", { name: /change language/i });
    await picker.click();

    // Repère les en-têtes de groupe par leur libellé (FR par défaut).
    // Les libellés exacts viennent de marketing-translations.fr.langPicker.
    const europeanHeader = page.getByRole("button", {
      name: /langues européennes/i,
    });
    const asianHeader = page.getByRole("button", {
      name: /langues asiatiques/i,
    });

    await expect(europeanHeader).toBeVisible();
    await expect(asianHeader).toBeVisible();

    // 1. Ouvre "Européennes"
    await europeanHeader.click();
    await expect(europeanHeader).toHaveAttribute("aria-expanded", "true");

    // L'item Allemand (de) doit être visible
    const germanItem = page.getByRole("button", {
      name: /Deutsch|🇩🇪/i,
    });
    await expect(germanItem.first()).toBeVisible();

    // 2. Ouvre "Asiatiques" → "Européennes" doit se replier
    await asianHeader.click();
    await expect(asianHeader).toHaveAttribute("aria-expanded", "true");
    await expect(europeanHeader).toHaveAttribute("aria-expanded", "false");

    // L'item Allemand n'est plus visible (groupe replié)
    await expect(germanItem.first()).not.toBeVisible();

    // L'item Japonais (ja) est visible
    const japaneseItem = page.getByRole("button", {
      name: /日本語|🇯🇵/i,
    });
    await expect(japaneseItem.first()).toBeVisible();
  });

  test("Cliquer en dehors du picker referme tout", async ({ page }) => {
    await page.goto("/");

    const picker = page.getByRole("button", { name: /change language/i });
    await picker.click();

    // Ouvre le groupe African
    const africanHeader = page.getByRole("button", {
      name: /langues africaines/i,
    });
    await africanHeader.click();
    await expect(africanHeader).toHaveAttribute("aria-expanded", "true");

    // Le dropdown contient des items (au moins l'item Swahili)
    await expect(page.getByText(/Kiswahili/i).first()).toBeVisible();

    // Clic en dehors → on cible le hero principal (loin du picker)
    await page.locator("h1").first().click({ force: true });

    // Le dropdown doit avoir disparu : africanHeader n'existe plus dans le DOM
    await expect(africanHeader).toHaveCount(0);

    // Le bouton picker est maintenant aria-expanded=false
    await expect(picker).toHaveAttribute("aria-expanded", "false");
  });

  test("Escape referme le picker", async ({ page }) => {
    await page.goto("/");

    const picker = page.getByRole("button", { name: /change language/i });
    await picker.click();

    const europeanHeader = page.getByRole("button", {
      name: /langues européennes/i,
    });
    await expect(europeanHeader).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(europeanHeader).toHaveCount(0);
    await expect(picker).toHaveAttribute("aria-expanded", "false");
  });

  test("Réouvrir le picker ne garde pas le groupe précédemment ouvert", async ({
    page,
  }) => {
    await page.goto("/");
    const picker = page.getByRole("button", { name: /change language/i });

    // 1ère ouverture : ouvre "Asiatiques"
    await picker.click();
    const asianHeader = page.getByRole("button", {
      name: /langues asiatiques/i,
    });
    await asianHeader.click();
    await expect(asianHeader).toHaveAttribute("aria-expanded", "true");

    // Ferme via Escape
    await page.keyboard.press("Escape");
    await expect(asianHeader).toHaveCount(0);

    // Réouvre le picker
    await picker.click();
    const asianHeader2 = page.getByRole("button", {
      name: /langues asiatiques/i,
    });
    await expect(asianHeader2).toBeVisible();

    // Le groupe doit être replié (état reset)
    // Sauf si la locale active est asiatique — on est en fr donc OK.
    await expect(asianHeader2).toHaveAttribute("aria-expanded", "false");
  });
});

test.describe("V28 · FAQ accordion", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      testInfo.project.name.startsWith("mobile"),
      "FAQ vitrine n'est pas affichée dans MobileWelcome",
    );
  });

  test("Ouvrir une question referme la précédente", async ({ page }) => {
    await page.goto("/");

    // Scroll jusqu'à la section FAQ
    await page.locator("#faq").scrollIntoViewIfNeeded();

    // La FAQ longue a une sidebar de thèmes — on prend les Q/A du
    // premier thème actif. Les <summary> sont les seuls dans cette section.
    const summaries = page.locator("#faq details summary");
    const count = await summaries.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // Ouvre la 1ère question
    const first = summaries.nth(0);
    await first.click();
    const firstDetails = first.locator("xpath=..");
    await expect(firstDetails).toHaveAttribute("open", "");

    // Ouvre la 2e question
    const second = summaries.nth(1);
    await second.click();
    const secondDetails = second.locator("xpath=..");
    await expect(secondDetails).toHaveAttribute("open", "");

    // La 1ère doit s'être refermée automatiquement
    await expect(firstDetails).not.toHaveAttribute("open", "");
  });

  test("Re-cliquer sur la question ouverte la referme", async ({ page }) => {
    await page.goto("/");
    await page.locator("#faq").scrollIntoViewIfNeeded();

    const summaries = page.locator("#faq details summary");
    const first = summaries.nth(0);
    const firstDetails = first.locator("xpath=..");

    // Open
    await first.click();
    await expect(firstDetails).toHaveAttribute("open", "");

    // Click again → close
    await first.click();
    await expect(firstDetails).not.toHaveAttribute("open", "");
  });

  test("Changer de thème reset l'état d'ouverture", async ({ page }) => {
    await page.goto("/");
    await page.locator("#faq").scrollIntoViewIfNeeded();

    // Ouvre la 1ère Q du thème courant
    const summaries = page.locator("#faq details summary");
    await summaries.nth(0).click();
    const firstDetails = summaries.nth(0).locator("xpath=..");
    await expect(firstDetails).toHaveAttribute("open", "");

    // Change de thème : on prend le 2e onglet de la sidebar
    const tabs = page.locator("#faq nav[role='tablist'] button[role='tab']");
    if ((await tabs.count()) > 1) {
      await tabs.nth(1).click();

      // Toutes les Q du nouveau thème doivent être refermées
      const newSummaries = page.locator("#faq details");
      const cnt = await newSummaries.count();
      for (let i = 0; i < cnt; i++) {
        await expect(newSummaries.nth(i)).not.toHaveAttribute("open", "");
      }
    }
  });
});
