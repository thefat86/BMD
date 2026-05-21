# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: create-group.spec.ts >> Flow création de groupe >> Bouton 'Créer' désactivé si le nom est vide
- Location: tests/create-group.spec.ts:33:3

# Error details

```
TimeoutError: locator.waitFor: Timeout 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /nouveau groupe|^nouveau$|＋\s*nouveau|créer un groupe/i }).first() to be visible

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "Aller au contenu principal" [ref=e2]:
    - /url: "#main-content"
  - main [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - generic [ref=e7]: 👋
        - heading "Tu es ici pour quoi ?" [level=1] [ref=e8]
        - paragraph [ref=e9]: Choisis ton cas d'usage principal — on te pré-remplit le premier groupe pour aller vite. Tu pourras toujours en créer d'autres ensuite.
      - generic [ref=e10]:
        - button "Une tontine Épargne tournante avec ma famille ou mes amis" [ref=e11] [cursor=pointer]:
          - generic [ref=e12]: 🪙
          - generic [ref=e13]: Une tontine
          - generic [ref=e14]: Épargne tournante avec ma famille ou mes amis
        - button "Un voyage Dépenses partagées d'un trip — Dakar, Marrakech, Bali…" [ref=e15] [cursor=pointer]:
          - generic [ref=e16]: ✈️
          - generic [ref=e17]: Un voyage
          - generic [ref=e18]: Dépenses partagées d'un trip — Dakar, Marrakech, Bali…
        - button "Une colocation Loyer, factures, courses partagés au mois" [ref=e19] [cursor=pointer]:
          - generic [ref=e20]: 🏠
          - generic [ref=e21]: Une colocation
          - generic [ref=e22]: Loyer, factures, courses partagés au mois
        - button "Un événement Mariage, baptême, anniversaire — collecte + dépenses" [ref=e23] [cursor=pointer]:
          - generic [ref=e24]: 💍
          - generic [ref=e25]: Un événement
          - generic [ref=e26]: Mariage, baptême, anniversaire — collecte + dépenses
        - button "Un club ou une asso Cotisations sportives, culturelles, étudiantes" [ref=e27] [cursor=pointer]:
          - generic [ref=e28]: ⚽
          - generic [ref=e29]: Un club ou une asso
          - generic [ref=e30]: Cotisations sportives, culturelles, étudiantes
        - button "Une paroisse Quêtes, projets, reçus fiscaux automatiques" [ref=e31] [cursor=pointer]:
          - generic [ref=e32]: ⛪
          - generic [ref=e33]: Une paroisse
          - generic [ref=e34]: Quêtes, projets, reçus fiscaux automatiques
    - button "Je passe — j'explorerai par moi-même" [ref=e35] [cursor=pointer]
  - region "Notifications"
  - button "Open Next.js Dev Tools" [ref=e41] [cursor=pointer]:
    - img [ref=e42]
  - alert [ref=e47]
  - generic "Build dev — tape 🧹 pour clear tout" [ref=e48]:
    - generic [ref=e49]: DEV · 13:26:41
    - button "Force fresh (clear all caches and reload)" [ref=e50] [cursor=pointer]: 🧹
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | import { loginAs, uniqueEmail } from "../fixtures/auth";
  3  | import { createGroup } from "../fixtures/groups";
  4  | 
  5  | /**
  6  |  * Flow : création d'un groupe depuis le dashboard.
  7  |  *
  8  |  * V88.B — Refondu pour utiliser le helper `createGroup` qui matche le
  9  |  * wizard `<MobileCreateGroupSheet>` (V73.3, BottomSheet 2 étapes). L'ancien
  10 |  * modal (input placeholder + <select> type + bouton "Créer le groupe") a
  11 |  * disparu en faveur d'un parcours card-based.
  12 |  *
  13 |  * Variantes :
  14 |  *  - Test parametré sur les types TONTINE / TRAVEL / COLOC.
  15 |  *  - Test du cas erreur : nom vide → bouton désactivé.
  16 |  */
  17 | test.describe("Flow création de groupe", () => {
  18 |   test("Crée un groupe TONTINE et atterrit sur sa page de détail", async ({
  19 |     page,
  20 |   }) => {
  21 |     const email = uniqueEmail("creator");
  22 |     await loginAs(page, email);
  23 | 
  24 |     const groupName = `Tontine E2E ${Date.now()}`;
  25 |     await createGroup(page, { type: "TONTINE", name: groupName });
  26 | 
  27 |     // Le nom du groupe apparaît sur la page de détail
  28 |     await expect(page.getByText(groupName).first()).toBeVisible({
  29 |       timeout: 5_000,
  30 |     });
  31 |   });
  32 | 
  33 |   test("Bouton 'Créer' désactivé si le nom est vide", async ({ page }) => {
  34 |     const email = uniqueEmail("creator-empty");
  35 |     await loginAs(page, email);
  36 | 
  37 |     // Ouvre le wizard
  38 |     const trigger = page.getByRole("button", {
  39 |       name: /nouveau groupe|^nouveau$|＋\s*nouveau|créer un groupe/i,
  40 |     });
> 41 |     await trigger.first().waitFor({ state: "visible", timeout: 30_000 });
     |                           ^ TimeoutError: locator.waitFor: Timeout 30000ms exceeded.
  42 |     await trigger.first().click();
  43 | 
  44 |     // Étape 1 : sélectionne un type pour pouvoir passer à étape 2
  45 |     await expect(
  46 |       page.getByRole("heading", { name: /pour quoi tu crées|nouveau groupe/i }),
  47 |     ).toBeVisible({ timeout: 8_000 });
  48 |     await page.getByRole("button", { name: /^tontine$/i }).first().click();
  49 |     await page
  50 |       .getByRole("button", { name: /continuer|next|suivant/i })
  51 |       .first()
  52 |       .click();
  53 | 
  54 |     // Étape 2 : sans nom, le bouton "Créer le groupe" est désactivé
  55 |     await expect(
  56 |       page.getByRole("heading", { name: /détails du groupe|détails/i }),
  57 |     ).toBeVisible({ timeout: 5_000 });
  58 | 
  59 |     const submitBtn = page.getByRole("button", {
  60 |       name: /créer le groupe|^créer$/i,
  61 |     });
  62 |     await expect(submitBtn).toBeDisabled();
  63 | 
  64 |     // Tape un nom → bouton activé
  65 |     const nameInput = page
  66 |       .getByPlaceholder(/famille|tsakou|nom du groupe/i)
  67 |       .first();
  68 |     await nameInput.fill("Test");
  69 |     await expect(submitBtn).toBeEnabled();
  70 | 
  71 |     // Vide → re-disabled
  72 |     await nameInput.fill("");
  73 |     await expect(submitBtn).toBeDisabled();
  74 |   });
  75 | 
  76 |   test("Crée un groupe VOYAGE et vérifie le type sur la page de détail", async ({
  77 |     page,
  78 |   }) => {
  79 |     const email = uniqueEmail("voyageur");
  80 |     await loginAs(page, email);
  81 | 
  82 |     const groupName = `Voyage Dakar ${Date.now()}`;
  83 |     await createGroup(page, { type: "TRAVEL", name: groupName });
  84 | 
  85 |     // Sur la page de détail, on voit le nom du groupe.
  86 |     await expect(page.getByText(groupName).first()).toBeVisible({
  87 |       timeout: 5_000,
  88 |     });
  89 |   });
  90 | });
  91 | 
```