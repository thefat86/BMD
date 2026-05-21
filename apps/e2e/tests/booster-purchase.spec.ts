import { test, expect } from "@playwright/test";
import { loginAs, uniqueEmail } from "../fixtures/auth";

/**
 * V49.C · Tests E2E flow Pack IA Booster (4,99 €).
 *
 * Couvre le chemin de conversion clé :
 *  1. Un user FREE arrive sur /dashboard/plans
 *  2. La card BoosterPurchaseCard s'affiche (prix, scans, durée)
 *  3. Le tap "Acheter" en mode dev (mock=true) déclenche
 *     confirm-purchase direct (pas de redirection Stripe)
 *  4. L'état rafraîchi montre les scans Booster restants
 *  5. L'API /me/boosters retourne le pack actif
 *
 * Hypothèses :
 *  - Backend tourne sans STRIPE_SECRET_KEY (mode mock dev)
 *  - Endpoints /me/boosters/* sont enregistrés dans server.ts
 *  - User fraîchement créé → 0 packs Booster actifs au départ
 *
 * En cas d'évolution future (paywall avec quota atteint → CTA Booster),
 * ajouter un test qui consomme N scans puis vérifie le déblocage.
 */

const API_BASE = process.env.E2E_API_URL ?? "http://localhost:4000";

/**
 * Force mock=true sur la response de checkout-session, indépendamment
 * de la config Stripe locale du dev. Sinon, si STRIPE_SECRET_KEY est
 * définie dans .env, l'endpoint retourne mock=false → le frontend
 * redirige vers stripe.com et le test casse.
 *
 * Le frontend (booster-purchase-card.tsx) détecte mock=true et appelle
 * directement confirm-purchase avec un fake `pi_mock_*` ID, simulant le
 * webhook checkout.session.completed sans sortir de l'app.
 */
async function mockBoosterCheckoutSession(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.route("**/me/boosters/checkout-session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        url: "/dashboard/plans?booster=mock-success",
        sessionId: `cs_mock_test_${Date.now()}`,
        mock: true,
      }),
    });
  });
}

test.describe("Flow achat Pack IA Booster (mode mock dev)", () => {
  test("BoosterPurchaseCard s'affiche sur /dashboard/plans pour un user FREE", async ({
    page,
  }) => {
    const email = uniqueEmail("booster-render");
    await loginAs(page, email);

    await page.goto("/dashboard/plans");

    // La card doit apparaître (état chargé depuis l'API)
    // Match sur le bouton CTA "Acheter le pack · 4,99 €"
    const buyBtn = page.getByRole("button", {
      name: /acheter le pack.*4[,.]99/i,
    });
    await expect(buyBtn).toBeVisible({ timeout: 10_000 });
    await expect(buyBtn).toBeEnabled();
  });

  test("Tap 'Acheter' en mock → confirm direct → scans restants apparaissent", async ({
    page,
  }) => {
    const email = uniqueEmail("booster-buyer");
    await loginAs(page, email);

    // Force mock=true même si le dev a STRIPE_SECRET_KEY localement
    await mockBoosterCheckoutSession(page);

    await page.goto("/dashboard/plans");

    const buyBtn = page.getByRole("button", {
      name: /acheter le pack.*4[,.]99/i,
    });
    await expect(buyBtn).toBeVisible({ timeout: 10_000 });

    // === Intercepte la séquence : checkout-session → confirm-purchase ===
    // En mode mock, checkout-session retourne {mock: true} et la card
    // appelle directement confirm-purchase avec un fake pi_mock_*
    const sessionPromise = page.waitForResponse((resp) =>
      resp
        .url()
        .includes("/me/boosters/checkout-session") && resp.request().method() === "POST",
    );
    const confirmPromise = page.waitForResponse((resp) =>
      resp
        .url()
        .includes("/me/boosters/confirm-purchase") && resp.request().method() === "POST",
    );

    await buyBtn.click();

    // checkout-session → mock=true attendu
    const sessionResp = await sessionPromise;
    expect(sessionResp.ok()).toBeTruthy();
    const sessionJson = (await sessionResp.json()) as { mock?: boolean };
    expect(sessionJson.mock).toBe(true);

    // confirm-purchase → 201 attendu avec pack.scansAdded
    const confirmResp = await confirmPromise;
    expect(confirmResp.status()).toBe(201);
    const confirmJson = (await confirmResp.json()) as {
      ok: boolean;
      pack: { scansAdded: number };
    };
    expect(confirmJson.ok).toBe(true);
    expect(confirmJson.pack.scansAdded).toBeGreaterThan(0);

    // L'UI rafraîchit l'état et affiche le bloc "scans Booster restants".
    // Le composant utilise <strong>{total} scans Booster restants</strong>.
    await expect(
      page.getByText(/scans booster restants/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("API /me/boosters reflète l'achat après confirm", async ({ page }) => {
    const email = uniqueEmail("booster-api");
    await loginAs(page, email);

    // Force mock=true même si le dev a STRIPE_SECRET_KEY localement
    await mockBoosterCheckoutSession(page);

    await page.goto("/dashboard/plans");

    const buyBtn = page.getByRole("button", {
      name: /acheter le pack.*4[,.]99/i,
    });
    await buyBtn.waitFor({ state: "visible", timeout: 10_000 });
    await buyBtn.click();

    // Laisse le temps au confirm-purchase + refresh de tourner
    await page.waitForResponse((resp) =>
      resp.url().includes("/me/boosters/confirm-purchase"),
    );
    // Petite pause pour laisser le refresh GET /me/boosters se faire
    await page.waitForTimeout(500);

    // Vérifie l'état API depuis la PAGE elle-même (au lieu de
    // page.request) — ça hérite automatiquement de l'auth de l'app
    // (cookies, Bearer dans localStorage, headers custom, etc.) sans
    // qu'on ait à deviner la clé de stockage du JWT.
    const data = await page.evaluate(async (apiBase) => {
      // L'app expose `window.__bmd_api_client` ? Non — plus simple :
      // on lit le token depuis toutes les clés probables et on tente fetch.
      // BMD stocke le JWT sous la clé `bmd_token` (cf. api-client.ts).
      const token = localStorage.getItem("bmd_token") || "";
      const resp = await fetch(`${apiBase}/me/boosters`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      return {
        ok: resp.ok,
        status: resp.status,
        body: resp.ok ? await resp.json() : null,
      };
    }, API_BASE);

    expect(data.ok, `GET /me/boosters returned ${data.status}`).toBeTruthy();
    const payload = data.body as {
      activePacks: Array<{ scansRemaining: number; expiresAt: string }>;
      totalScansRemaining: number;
    };
    expect(payload.activePacks.length).toBeGreaterThan(0);
    expect(payload.totalScansRemaining).toBeGreaterThan(0);
    // Le premier pack doit avoir une date d'expiration future (~30 jours)
    const expiresAt = new Date(payload.activePacks[0].expiresAt).getTime();
    expect(expiresAt).toBeGreaterThan(Date.now());
  });
});
