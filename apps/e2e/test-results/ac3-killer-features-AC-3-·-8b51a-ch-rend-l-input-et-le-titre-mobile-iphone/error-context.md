# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ac3-killer-features.spec.ts >> AC-3 · Search globale >> La page /dashboard/search rend l'input et le titre
- Location: tests/ac3-killer-features.spec.ts:132:3

# Error details

```
Error: page.goto: Navigation to "http://localhost:3000/dashboard/search" is interrupted by another navigation to "http://localhost:3000/onboarding/intent"
Call log:
  - navigating to "http://localhost:3000/dashboard/search", waiting until "load"

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
        - button "Une tontineÉpargne tournante avec ma famille ou mes amis" [ref=e11] [cursor=pointer]: 🪙Une tontineÉpargne tournante avec ma famille ou mes amis
        - button "Un voyageDépenses partagées d'un trip — Dakar, Marrakech, Bali…" [ref=e12] [cursor=pointer]: ✈️Un voyageDépenses partagées d'un trip — Dakar, Marrakech, Bali…
        - button "Une colocationLoyer, factures, courses partagés au mois" [ref=e13] [cursor=pointer]: 🏠Une colocationLoyer, factures, courses partagés au mois
        - button "Un événementMariage, baptême, anniversaire — collecte + dépenses" [ref=e14] [cursor=pointer]: 💍Un événementMariage, baptême, anniversaire — collecte + dépenses
        - button "Un club ou une assoCotisations sportives, culturelles, étudiantes" [ref=e15] [cursor=pointer]: ⚽Un club ou une assoCotisations sportives, culturelles, étudiantes
        - button "Une paroisseQuêtes, projets, reçus fiscaux automatiques" [ref=e16] [cursor=pointer]: ⛪Une paroisseQuêtes, projets, reçus fiscaux automatiques
    - button "Je passe — j'explorerai par moi-même" [ref=e17] [cursor=pointer]
  - region "Notifications"
```

# Test source

```ts
  37  | 
  38  |     // Crée un groupe rapide via le wizard V73.3
  39  |     await createGroup(page, {
  40  |       type: "EVENT",
  41  |       name: `Multi E2E ${Date.now()}`,
  42  |     });
  43  | 
  44  |     // Ouvre le panel dépense
  45  |     await page
  46  |       .locator("button.quick-card", { hasText: /dépense/i })
  47  |       .first()
  48  |       .click();
  49  |     await expect(
  50  |       page.getByRole("heading", { name: /nouvelle dépense/i }),
  51  |     ).toBeVisible();
  52  | 
  53  |     // Saisit un montant — le widget multi-payeurs doit apparaître
  54  |     // (apparition conditionnelle : amount && group.members.length >= 2)
  55  |     // Comme on est seul dans le groupe à ce stade, le widget peut ne pas
  56  |     // s'afficher — on teste juste que le label "Plusieurs personnes ont payé"
  57  |     // est dans le DOM si le groupe a 2+ membres. Pour rester robuste, on
  58  |     // se contente de vérifier l'absence d'erreur quand on saisit un montant.
  59  |     await page.getByPlaceholder(/60.00|0\.00|montant/i).first().fill("100");
  60  | 
  61  |     // Pas d'erreur visible
  62  |     await expect(page.locator(".error, [role='alert']")).toHaveCount(0);
  63  |   });
  64  | });
  65  | 
  66  | test.describe("AC-3 · Audio proof bouton", () => {
  67  |   test("Bouton 🎙️ Audio est rendu dans la zone justificatifs après création d'expense", async ({
  68  |     page,
  69  |   }) => {
  70  |     const email = uniqueEmail("audioproof");
  71  |     await loginAs(page, email);
  72  | 
  73  |     // Crée groupe via wizard V73.3
  74  |     await createGroup(page, {
  75  |       type: "EVENT",
  76  |       name: `Audio E2E ${Date.now()}`,
  77  |     });
  78  | 
  79  |     // Crée une dépense
  80  |     await page
  81  |       .locator("button.quick-card", { hasText: /dépense/i })
  82  |       .first()
  83  |       .click();
  84  |     await page.getByPlaceholder(/resto|courses/i).first().fill("Marché");
  85  |     await page.getByPlaceholder(/60.00|0\.00|montant/i).first().fill("5");
  86  |     await page.getByRole("button", { name: /✓\s*ajouter|✓\s*créer/i }).click();
  87  | 
  88  |     // La dépense apparaît dans la liste — clique pour voir le détail
  89  |     await expect(page.locator("text=Marché").first()).toBeVisible({
  90  |       timeout: 8_000,
  91  |     });
  92  |     await page.locator("text=Marché").first().click();
  93  | 
  94  |     // Cherche le bouton 🎙️ Audio dans la zone Justificatifs
  95  |     // (peut être hors viewport sur mobile, on accepte les 2 cas)
  96  |     const audioBtn = page.locator("button", { hasText: /🎙️\s*Audio/i });
  97  |     if ((await audioBtn.count()) > 0) {
  98  |       await expect(audioBtn.first()).toBeVisible();
  99  |     }
  100 |   });
  101 | });
  102 | 
  103 | test.describe("AC-3 · Panneau Réunions", () => {
  104 |   test("Le panneau « 🎙️ Réunions » apparaît dans la vue groupe", async ({
  105 |     page,
  106 |   }) => {
  107 |     const email = uniqueEmail("meetings");
  108 |     await loginAs(page, email);
  109 | 
  110 |     // Crée groupe TONTINE via wizard V73.3
  111 |     await createGroup(page, {
  112 |       type: "TONTINE",
  113 |       name: `Meetings E2E ${Date.now()}`,
  114 |     });
  115 | 
  116 |     // Le panel meetings est en bas de la page → scroll
  117 |     await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  118 |     // Cherche le titre du panneau
  119 |     await expect(page.locator("text=/🎙️.*réunion|réunions/i").first()).toBeVisible({
  120 |       timeout: 8_000,
  121 |     });
  122 | 
  123 |     // Le bouton record doit être présent (peut être désactivé si plan FREE)
  124 |     const recordBtn = page.locator("button", {
  125 |       hasText: /enregistrer|démarrer/i,
  126 |     });
  127 |     expect(await recordBtn.count()).toBeGreaterThan(0);
  128 |   });
  129 | });
  130 | 
  131 | test.describe("AC-3 · Search globale", () => {
  132 |   test("La page /dashboard/search rend l'input et le titre", async ({
  133 |     page,
  134 |   }) => {
  135 |     const email = uniqueEmail("searcher");
  136 |     await loginAs(page, email);
> 137 |     await page.goto("/dashboard/search");
      |                ^ Error: page.goto: Navigation to "http://localhost:3000/dashboard/search" is interrupted by another navigation to "http://localhost:3000/onboarding/intent"
  138 | 
  139 |     // Input présent + focus auto
  140 |     const input = page.getByRole("searchbox").or(
  141 |       page.locator("input[type='search']"),
  142 |     );
  143 |     await expect(input.first()).toBeVisible();
  144 | 
  145 |     // Tape un mot court (< 2 chars) → pas de résultats affichés
  146 |     await input.first().fill("a");
  147 |     await page.waitForTimeout(400);
  148 |     await expect(page.locator("text=/résultat\\(s\\)/i")).toHaveCount(0);
  149 | 
  150 |     // Tape une vraie query — doit appeler l'API. On accepte aucun résultat
  151 |     // (groupes vides) sans erreur.
  152 |     await input.first().fill("test");
  153 |     await page.waitForTimeout(700); // > 300ms debounce
  154 |     // Pas d'alerte d'erreur affichée
  155 |     await expect(page.locator("[role='alert']")).toHaveCount(0);
  156 |   });
  157 | });
  158 | 
```