# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ac3-killer-features.spec.ts >> AC-3 · Search globale >> La page /dashboard/search rend l'input et le titre
- Location: tests/ac3-killer-features.spec.ts:132:3

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  locator('[role=\'alert\']')
Expected: 0
Received: 1
Timeout:  10000ms

Call log:
  - Expect "toHaveCount" with timeout 10000ms
  - waiting for locator('[role=\'alert\']')
    13 × locator resolved to 1 element
       - unexpected value "1"

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - link "Aller au contenu principal" [ref=e2]:
    - /url: "#main-content"
  - generic [ref=e4]:
    - complementary [ref=e5]:
      - link "BMD Back Mes Do" [ref=e6]:
        - /url: /dashboard
        - generic [ref=e7]:
          - generic [ref=e8]: BMD
          - generic [ref=e9]: Back Mes Do
      - link "Tableau de bord" [ref=e11]:
        - /url: /dashboard
        - generic [ref=e12]: 🏠
        - generic [ref=e13]: Tableau de bord
      - generic [ref=e14]:
        - generic [ref=e15]: Groupes
        - link "Groupes" [ref=e16]:
          - /url: /dashboard
          - generic [ref=e17]: 👥
          - generic [ref=e18]: Groupes
        - link "Statistiques" [ref=e19]:
          - /url: /dashboard/stats
          - generic [ref=e20]: 📊
          - generic [ref=e21]: Statistiques
      - generic [ref=e22]:
        - generic [ref=e23]: Mon profil
        - link "Mon profil" [ref=e24]:
          - /url: /dashboard/profile
          - generic [ref=e25]: 👤
          - generic [ref=e26]: Mon profil
        - link "Mon forfait" [ref=e27]:
          - /url: /dashboard/plans
          - generic [ref=e28]: ✨
          - generic [ref=e29]: Mon forfait
        - link "Espace commercial" [ref=e30]:
          - /url: /dashboard/affiliate
          - generic [ref=e31]: 🤝
          - generic [ref=e32]: Espace commercial
      - button "🚪 Se déconnecter" [ref=e34] [cursor=pointer]:
        - generic [ref=e35]: 🚪
        - text: Se déconnecter
    - generic [ref=e36]:
      - banner [ref=e37]:
        - generic [ref=e38]:
          - generic [ref=e39]: Tableau de bord
          - heading "Recherche" [level=1] [ref=e40]
        - generic [ref=e41]:
          - link "Notifications" [ref=e42]:
            - /url: /dashboard/profile
            - img [ref=e43]
          - link "E" [ref=e45]:
            - /url: /dashboard/profile
      - main [ref=e46]:
        - generic [ref=e47]:
          - generic [ref=e48]:
            - generic:
              - img
            - searchbox "Recherche" [active] [ref=e49]: test
          - paragraph [ref=e51]: Aucun résultat trouvé.
  - region "Notifications"
  - generic [ref=e56] [cursor=pointer]:
    - button "Open Next.js Dev Tools" [ref=e57]:
      - img [ref=e58]
    - generic [ref=e63]:
      - button "Open issues overlay" [ref=e64]:
        - generic [ref=e65]:
          - generic [ref=e66]: "0"
          - generic [ref=e67]: "1"
        - generic [ref=e68]: Issue
      - button "Collapse issues badge" [ref=e69]:
        - img [ref=e70]
  - alert [ref=e72]: Recherche
  - generic "Build dev — tape 🧹 pour clear tout" [ref=e73]:
    - generic [ref=e74]: DEV · 13:29:38
    - button "Force fresh (clear all caches and reload)" [ref=e75] [cursor=pointer]: 🧹
```

# Test source

```ts
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
  137 |     await page.goto("/dashboard/search");
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
> 155 |     await expect(page.locator("[role='alert']")).toHaveCount(0);
      |                                                  ^ Error: expect(locator).toHaveCount(expected) failed
  156 |   });
  157 | });
  158 | 
```