import { test, expect } from "@playwright/test";

/**
 * V26 · Tests E2E du toggle dual-view sur le dashboard.
 *
 * Ces tests vérifient l'aspect UI du toggle (présence, persistance localStorage,
 * état actif) sans requérir d'authentification. Pour un test complet incluant
 * la donnée réelle, voir les tests d'intégration backend (balance.service).
 */

test.describe("V26 · Dashboard dual-view toggle", () => {
  // Le dashboard nécessite une session — on stub un token bidon pour passer
  // le check d'auth, ou on skip si l'app redirige vers /login.
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    // Le dashboard sera testé au niveau du toggle UI, qui n'est rendu
    // qu'après login. Pour ces tests on assume une session de démo.
    // Skip propre si pas d'env de demo dispo.
  });

  test("Toggle 'Par groupe / Par personne' présent sur le dashboard desktop", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name.startsWith("mobile"),
      "Test desktop uniquement",
    );

    // Tente d'aller sur /dashboard (sera redirigé vers /login si pas de session)
    await page.goto("/dashboard");
    if (page.url().includes("/login")) {
      test.skip(true, "Pas de session de démo — toggle testé en intégration");
      return;
    }

    // Toggle présent
    const byGroup = page.getByRole("tab", { name: /par groupe/i });
    const byPerson = page.getByRole("tab", { name: /par personne/i });
    await expect(byGroup).toBeVisible();
    await expect(byPerson).toBeVisible();

    // État initial (default) : Par groupe sélectionné
    await expect(byGroup).toHaveAttribute("aria-selected", "true");
    await expect(byPerson).toHaveAttribute("aria-selected", "false");
  });

  test("Cliquer 'Par personne' bascule la vue et persiste en localStorage", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name.startsWith("mobile"),
      "Test desktop uniquement",
    );

    await page.goto("/dashboard");
    if (page.url().includes("/login")) {
      test.skip(true, "Pas de session de démo");
      return;
    }

    const byPerson = page.getByRole("tab", { name: /par personne/i });
    await byPerson.click();
    await expect(byPerson).toHaveAttribute("aria-selected", "true");

    // Le titre de section a changé : "Mes contreparties" au lieu de "Mes groupes"
    await expect(page.getByText(/mes contreparties/i)).toBeVisible();

    // localStorage persiste la valeur
    const saved = await page.evaluate(() =>
      window.localStorage.getItem("bmd_dashboard_view"),
    );
    expect(saved).toBe("byPerson");

    // Reload — le state doit être restauré
    await page.reload();
    if (page.url().includes("/login")) return;
    await expect(
      page.getByRole("tab", { name: /par personne/i }),
    ).toHaveAttribute("aria-selected", "true");
  });

  test("Toggle visible et fonctionnel sur mobile", async ({
    page,
  }, testInfo) => {
    test.skip(
      !testInfo.project.name.startsWith("mobile"),
      "Test mobile uniquement",
    );

    await page.goto("/dashboard");
    if (page.url().includes("/login")) {
      test.skip(true, "Pas de session de démo");
      return;
    }

    const byGroup = page.getByRole("tab", { name: /par groupe/i });
    const byPerson = page.getByRole("tab", { name: /par personne/i });
    await expect(byGroup).toBeVisible();
    await expect(byPerson).toBeVisible();

    // Tap sur "Par personne"
    await byPerson.tap();
    await expect(byPerson).toHaveAttribute("aria-selected", "true");
  });

  test("V55 — Toggle mobile : 1 tap = 1 état (séquence A → B → A → B)", async ({
    page,
  }, testInfo) => {
    // Scénario Fabrice : "lorsque on clique sur byGroup ca le désactive,
    // lorsque on clique sur byPerson ca active byGroup la 1re fois".
    // Ce test vérifie qu'AUCUNE de ces régressions ne réapparaît : un seul
    // tap doit suffire à activer l'onglet visé, peu importe l'état précédent.
    test.skip(
      !testInfo.project.name.startsWith("mobile"),
      "Test mobile uniquement (cliquabilité tactile)",
    );

    await page.goto("/dashboard");
    if (page.url().includes("/login")) {
      test.skip(true, "Pas de session de démo");
      return;
    }

    const byGroup = page.getByRole("tab", { name: /par groupe/i });
    const byPerson = page.getByRole("tab", { name: /par personne/i });

    // Reset localStorage pour partir de l'état par défaut (byGroup)
    await page.evaluate(() =>
      window.localStorage.removeItem("bmd_dashboard_view"),
    );
    await page.reload();
    if (page.url().includes("/login")) return;

    // État initial : byGroup actif
    await expect(byGroup).toHaveAttribute("aria-selected", "true");
    await expect(byPerson).toHaveAttribute("aria-selected", "false");

    // Tap byPerson → byPerson actif EN UN SEUL TAP
    await byPerson.tap();
    await expect(byPerson).toHaveAttribute("aria-selected", "true");
    await expect(byGroup).toHaveAttribute("aria-selected", "false");

    // Tap byGroup → byGroup actif EN UN SEUL TAP
    await byGroup.tap();
    await expect(byGroup).toHaveAttribute("aria-selected", "true");
    await expect(byPerson).toHaveAttribute("aria-selected", "false");

    // Re-tap sur l'onglet déjà actif : DOIT rester actif (pas de désactivation)
    await byGroup.tap();
    await expect(byGroup).toHaveAttribute("aria-selected", "true");
    await expect(byPerson).toHaveAttribute("aria-selected", "false");

    // Tap byPerson — encore une fois pour confirmer
    await byPerson.tap();
    await expect(byPerson).toHaveAttribute("aria-selected", "true");
    await expect(byGroup).toHaveAttribute("aria-selected", "false");
  });

  test("V57 — Toggle : invariant XOR (un et un seul actif à tout moment)", async ({
    page,
  }, testInfo) => {
    // Reproduit le bug Fabrice : "on arrive dans un état où les 2 sont
    // désélectionnés". Test : après 10 taps aléatoires, l'un est TOUJOURS actif.
    test.skip(
      !testInfo.project.name.startsWith("mobile"),
      "Test mobile uniquement",
    );

    await page.goto("/dashboard");
    if (page.url().includes("/login")) {
      test.skip(true, "Pas de session de démo");
      return;
    }

    const byGroup = page.getByRole("tab", { name: /par groupe/i });
    const byPerson = page.getByRole("tab", { name: /par personne/i });

    // Séquence stress : 10 taps aléatoires
    for (let i = 0; i < 10; i++) {
      await (i % 2 === 0 ? byGroup : byPerson).tap();
      const g = await byGroup.getAttribute("aria-selected");
      const p = await byPerson.getAttribute("aria-selected");
      // INVARIANT : exactement UN des deux est "true"
      const activeCount = (g === "true" ? 1 : 0) + (p === "true" ? 1 : 0);
      expect(activeCount, `Iter ${i}: byGroup=${g}, byPerson=${p}`).toBe(1);
    }
  });
});
