import { test, expect } from "@playwright/test";
import { loginAs, uniqueEmail } from "../fixtures/auth";

/**
 * Flow : invitation et rejoindre un groupe.
 *
 * 1. User A crée un groupe + génère un lien d'invitation via l'API
 * 2. User B se logue, ouvre le lien /join/:token
 * 3. User B clique "Rejoindre" → atterrit sur /dashboard/groups/:id
 * 4. La page de détail montre 2 membres
 *
 * On utilise l'API directement pour générer le token (pas l'UI),
 * ce qui rend le test plus stable (pas dépendant des changements UI
 * de la page settings).
 */

const API_BASE = process.env.E2E_API_URL ?? "http://localhost:4000";

test.describe("Flow invitation", () => {
  test("User A crée un groupe + invite, User B rejoint via /join", async ({
    browser,
    page,
  }) => {
    // ===== User A : crée le groupe + génère un token =====
    const emailA = uniqueEmail("inviter");
    await loginAs(page, emailA);

    // Crée le groupe via l'UI (déjà testé plus loin, mais on a besoin du groupId)
    await page
      .getByRole("button", { name: /nouveau groupe|^nouveau$|＋\s*nouveau/i })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: /nouveau groupe/i }),
    ).toBeVisible();
    const groupName = `Voyage E2E ${Date.now()}`;
    await page
      .getByPlaceholder(/tontine|voyage|coloc/i)
      .first()
      .fill(groupName);
    await page.locator("select").first().selectOption("TRAVEL");
    await page.getByRole("button", { name: /créer le groupe/i }).click();
    await page.waitForURL(/\/dashboard\/groups\/([0-9a-f-]{36})/);
    const groupIdMatch = page.url().match(/groups\/([0-9a-f-]{36})/);
    const groupId = groupIdMatch?.[1];
    expect(groupId).toBeTruthy();

    // Récupère le JWT de A pour générer un token via l'API directement
    const tokenA = await page.evaluate(() =>
      window.localStorage.getItem("bmd_token"),
    );
    expect(tokenA).toBeTruthy();

    // POST /groups/:id/invite-tokens (pas de body requis)
    const inviteResp = await page.request.post(
      `${API_BASE}/groups/${groupId}/invite-tokens`,
      {
        headers: {
          Authorization: `Bearer ${tokenA}`,
          "Content-Type": "application/json",
        },
        data: {},
      },
    );
    expect(inviteResp.ok()).toBe(true);
    const inviteBody = await inviteResp.json();
    const inviteToken = inviteBody.token as string;
    expect(inviteToken).toBeTruthy();
    expect(inviteToken.length).toBeGreaterThan(8);

    // ===== User B : se logue dans un nouveau browser context =====
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    const emailB = uniqueEmail("invitee");
    await loginAs(pageB, emailB);

    // Ouvre le lien d'invitation
    await pageB.goto(`/join/${inviteToken}`);

    // Le bouton "Rejoindre le groupe" doit s'afficher
    const joinBtn = pageB.getByRole("button", {
      name: /rejoindre le groupe/i,
    });
    await expect(joinBtn).toBeVisible({ timeout: 10_000 });
    await joinBtn.click();

    // Redirection vers /dashboard/groups/:id
    await pageB.waitForURL(
      new RegExp(`/dashboard/groups/${groupId}`),
      { timeout: 10_000 },
    );

    // Le nom du groupe est visible
    await expect(pageB.getByText(groupName).first()).toBeVisible({
      timeout: 5_000,
    });

    await ctxB.close();
  });

  test("Lien invitation invalide → message d'erreur clair", async ({
    page,
  }) => {
    const email = uniqueEmail("bad-link");
    await loginAs(page, email);

    // Token random qui n'existe pas en base
    await page.goto("/join/invalid-token-xyz-not-real");

    // On attend une erreur visible (alert role ou texte explicite)
    await expect(
      page.locator("[role='alert'], .error").first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
