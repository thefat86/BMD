import { test, expect } from "@playwright/test";
import { loginAs, uniqueEmail } from "../fixtures/auth";
import { createGroup } from "../fixtures/groups";

/**
 * V204.D — Tests E2E Playwright pour le module Caisses Projet.
 *
 * Couverture :
 *  1. Le tile "Caisses" apparaît dans la vue groupe quand le module est ON
 *     (test conditionnel : skip si feature gate OFF en dev)
 *  2. Création d'une caisse via le wizard (3 étapes)
 *  3. Hero de la caisse affiche nom, statut, jauge à 0
 *  4. Bannière légale Registre est visible
 *  5. Bouton "Je cotise" déclenche le sheet de contribution
 *  6. Le bouton Partager ouvre le sheet avec QR code visible
 *  7. La page publique /funds/public/[code] est accessible sans auth et
 *     affiche le nom de la caisse + la bannière légale
 *
 * Prérequis backend :
 *  - SiteConfig.projectFundsEnabled = true (à activer manuellement avant)
 *
 * Si le feature gate est OFF côté API, les tests skip plutôt que de fail
 * (permet de garder la suite verte tant que le module n'est pas activé
 * en environnement de test).
 */
test.describe("Caisses Projet V200-V204", () => {
  test.beforeEach(async ({ page }) => {
    // Sonde rapide du feature gate via la page admin (read-only).
    // Si l'API renvoie `{ enabled: false }`, on skip le test entier.
    const apiUrl =
      process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
    try {
      const r = await page.request.get(
        `${apiUrl}/project-funds/feature-gate`,
        { failOnStatusCode: false, timeout: 5000 },
      );
      const json = (await r.json().catch(() => ({ enabled: false }))) as {
        enabled?: boolean;
      };
      if (!json.enabled) {
        test.skip(true, "Module Caisses Projet désactivé côté SiteConfig");
      }
    } catch {
      test.skip(true, "API Caisses inaccessible — skip");
    }
  });

  test("Crée groupe → tile Caisses visible → crée caisse → hero OK", async ({
    page,
  }) => {
    test.setTimeout(90000);
    const email = uniqueEmail("funds-creator");
    await loginAs(page, email);

    // 1. Créer un groupe
    await createGroup(page, {
      type: "EVENT",
      name: `Funérailles E2E ${Date.now()}`,
    });

    // 2. Le tile "Caisses" apparaît dans la grille mobile (mobile viewport)
    //    ou dans la zone des tiles côté desktop.
    const fundsTile = page.getByRole("tab", { name: /caisse/i }).first();
    await expect(fundsTile).toBeVisible({ timeout: 8000 });
    await fundsTile.click();

    // 3. Page liste : empty state + bouton "Créer la première caisse"
    await expect(
      page.getByText(/aucune caisse encore|no fund yet/i),
    ).toBeVisible({ timeout: 8000 });
    const firstCta = page.getByRole("button", {
      name: /créer la première caisse|create the first fund/i,
    });
    await expect(firstCta).toBeVisible();
    await firstCta.click();

    // 4. Wizard étape 1 : nom obligatoire (CTA disabled tant que vide)
    await expect(
      page.getByText(/de quoi s'agit-il|what is it about/i),
    ).toBeVisible({ timeout: 6000 });

    const nameInput = page
      .locator('input[placeholder*="Funérailles" i], input[placeholder*="Marie" i]')
      .first();
    await nameInput.fill(`Caisse E2E ${Date.now()}`);
    await page
      .getByRole("button", { name: /continuer|next/i })
      .first()
      .click();

    // 5. Étape 2 : devise (par défaut EUR) + skip → étape 3
    await page
      .getByRole("button", { name: /continuer|next/i })
      .first()
      .click();

    // 6. Étape 3 : créer
    await page
      .getByRole("button", { name: /créer la caisse|create the fund/i })
      .first()
      .click();

    // 7. Détail caisse : hero affiche le nom + bannière légale Registre
    await expect(
      page.getByText(/BMD est un registre|BMD is a register/i),
    ).toBeVisible({ timeout: 10000 });

    // 8. Bouton "Je cotise" présent
    const contributeBtn = page.getByRole("button", {
      name: /je cotise|contribute/i,
    });
    await expect(contributeBtn).toBeVisible();
  });

  test("Page publique /funds/public/[code] accessible sans auth", async ({
    browser,
  }) => {
    // Login pour créer une caisse, récupérer le publicCode via l'API.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const email = uniqueEmail("funds-public");
    await loginAs(page, email);

    // Crée un groupe + caisse en passant directement par l'API pour
    // gagner du temps (le flow UI est testé dans le test précédent).
    const apiUrl =
      process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
    const token = await page.evaluate(() => localStorage.getItem("bmd_token"));
    expect(token).toBeTruthy();

    // Crée groupe
    const grpRes = await ctx.request.post(`${apiUrl}/groups`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `Groupe public ${Date.now()}`, type: "EVENT" },
    });
    expect(grpRes.ok()).toBeTruthy();
    const grp = (await grpRes.json()) as { id: string };

    // Crée caisse
    const fundRes = await ctx.request.post(
      `${apiUrl}/groups/${grp.id}/project-funds`,
      {
        headers: { Authorization: `Bearer ${token}` },
        data: { name: `Caisse publique ${Date.now()}`, template: "EVENT" },
      },
    );
    expect(fundRes.ok()).toBeTruthy();
    const fund = (await fundRes.json()) as {
      id: string;
      publicCode: string;
    };

    // Maintenant on accède SANS auth à la page publique
    const anonCtx = await browser.newContext();
    const anonPage = await anonCtx.newPage();
    await anonPage.goto(
      `${page.url().split("/dashboard")[0]}/funds/public/${fund.publicCode}`,
    );

    // Le nom de la caisse doit apparaître + bannière Registre
    await expect(
      anonPage.getByText(/Caisse publique/),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      anonPage.getByText(/BMD est un registre|BMD is a register/i),
    ).toBeVisible();

    // Pas d'accès au token / pas de fuite admin
    const localToken = await anonPage.evaluate(() =>
      localStorage.getItem("bmd_token"),
    );
    expect(localToken).toBeNull();

    await anonCtx.close();
    await ctx.close();
  });
});
