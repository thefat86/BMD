import { test, expect } from "@playwright/test";
import { loginAs, uniqueEmail } from "../fixtures/auth";
import { createGroup } from "../fixtures/groups";

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
 *
 * V88.C — Refactorisé pour utiliser `createGroup()` (wizard V73.3
 * `<MobileCreateGroupSheet>`).
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

    // Crée le groupe via le wizard V73.3
    const groupName = `Voyage E2E ${Date.now()}`;
    const { groupId } = await createGroup(page, {
      type: "TRAVEL",
      name: groupName,
    });
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
