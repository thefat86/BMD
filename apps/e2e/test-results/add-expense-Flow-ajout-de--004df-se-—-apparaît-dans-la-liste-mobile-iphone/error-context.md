# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: add-expense.spec.ts >> Flow ajout de dépense >> Crée groupe puis ajoute une dépense — apparaît dans la liste
- Location: tests/add-expense.spec.ts:20:3

# Error details

```
TimeoutError: locator.click: Timeout 10000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /nouveau groupe|^nouveau$|＋\s*nouveau|créer.*premier|créer un groupe/i }).first()
    - locator resolved to <button type="button">＋ Créer un groupe personnalisé</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <button type="button">…</button> from <div role="dialog" aria-modal="true" aria-labelledby="onboarding-title">…</div> subtree intercepts pointer events
    - retrying click action
    - waiting 20ms
    - waiting for element to be visible, enabled and stable
    - element is not stable
  2 × retrying click action
      - waiting 100ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <button type="button">…</button> from <div role="dialog" aria-modal="true" aria-labelledby="onboarding-title">…</div> subtree intercepts pointer events
  16 × retrying click action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <button type="button">…</button> from <div role="dialog" aria-modal="true" aria-labelledby="onboarding-title">…</div> subtree intercepts pointer events
  - retrying click action
    - waiting 500ms

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "Aller au contenu principal" [ref=e2]:
    - /url: "#main-content"
  - generic [ref=e4]:
    - banner [ref=e5]:
      - link "Tableau de bord" [ref=e6]:
        - /url: /dashboard
      - generic [ref=e8]: BMD
      - link "Notifications" [ref=e9] [cursor=pointer]:
        - /url: /dashboard/notifications
        - img [ref=e10]
      - link "Mon profil" [ref=e12]:
        - /url: /dashboard/profile
        - text: E
    - main [ref=e13]:
      - generic [ref=e14]:
        - link "Bon après-midi E2E ● Équilibré Mon solde global + 0 ,00 EUR" [ref=e15] [cursor=pointer]:
          - /url: /dashboard/stats
          - generic [ref=e16]:
            - generic [ref=e17]:
              - generic [ref=e18]: Bon après-midi
              - heading "E2E" [level=2] [ref=e19]:
                - generic [ref=e20]: E2E
                - img [ref=e21]
            - generic [ref=e23]: ● Équilibré
          - generic [ref=e24]: Mon solde global
          - generic [ref=e25]:
            - generic [ref=e26]: +
            - generic [ref=e27]:
              - generic [ref=e28]: "0"
              - generic [ref=e29]: ",00"
            - generic [ref=e30]: EUR
        - generic [ref=e31]:
          - generic [ref=e32]:
            - heading "Raccourcis" [level=3] [ref=e33]
            - link "0/5 scans IA" [ref=e34]:
              - /url: /dashboard/plans
              - img [ref=e35]
              - generic [ref=e38]: 0/5 scans IA
          - generic [ref=e39]:
            - button "Créer groupe" [ref=e40] [cursor=pointer]:
              - img [ref=e42]
              - generic [ref=e43]: Créer groupe
            - link "Parrainer" [ref=e44] [cursor=pointer]:
              - /url: /dashboard/affiliate?from=/dashboard
              - img [ref=e46]
              - generic [ref=e50]: Parrainer
            - link "Statistiques" [ref=e51] [cursor=pointer]:
              - /url: /dashboard/stats?from=/dashboard
              - img [ref=e53]
              - generic [ref=e54]: Statistiques
            - button "Régler dettes" [ref=e55] [cursor=pointer]:
              - img [ref=e57]
              - generic [ref=e62]: Régler dettes
            - button "Relancer" [ref=e63] [cursor=pointer]:
              - img [ref=e65]
              - generic [ref=e68]: Relancer
            - button "Inviter amis" [ref=e69] [cursor=pointer]:
              - img [ref=e71]
              - generic [ref=e77]: Inviter amis
        - generic [ref=e78]:
          - heading "Mes groupes (0)" [level=3] [ref=e80]
          - tablist "Vue du dashboard" [ref=e82]:
            - tab "Par groupe" [selected] [ref=e84] [cursor=pointer]
            - tab "Par personne" [ref=e85] [cursor=pointer]
          - generic [ref=e86]:
            - img
            - generic [ref=e87]:
              - generic [ref=e88]: 👋
              - heading "Bienvenue dans BMD" [level=2] [ref=e89]
              - paragraph [ref=e90]: Crée ton premier groupe pour gérer une tontine, un voyage, une coloc ou un événement. Touche un modèle ci-dessous, on te pré-remplit l'essentiel.
              - generic [ref=e91]:
                - button "Tontine L'épargne tournante en famille ou entre amis" [ref=e92] [cursor=pointer]:
                  - generic [ref=e93]: 🪙
                  - generic [ref=e94]: Tontine
                  - generic [ref=e95]: L'épargne tournante en famille ou entre amis
                - button "Voyage Dépenses partagées d'un trip — Dakar, Marrakech, Bali…" [ref=e96] [cursor=pointer]:
                  - generic [ref=e97]: ✈️
                  - generic [ref=e98]: Voyage
                  - generic [ref=e99]: Dépenses partagées d'un trip — Dakar, Marrakech, Bali…
                - button "Coloc Loyer, courses, factures partagés au mois" [ref=e100] [cursor=pointer]:
                  - generic [ref=e101]: 🏠
                  - generic [ref=e102]: Coloc
                  - generic [ref=e103]: Loyer, courses, factures partagés au mois
                - button "Événement Mariage, baptême, anniversaire — collecte + dépenses" [ref=e104] [cursor=pointer]:
                  - generic [ref=e105]: 💍
                  - generic [ref=e106]: Événement
                  - generic [ref=e107]: Mariage, baptême, anniversaire — collecte + dépenses
              - button "＋ Créer un groupe personnalisé" [ref=e108] [cursor=pointer]
              - generic [ref=e109]:
                - generic [ref=e110]: 🔗
                - generic [ref=e111]: Tu as un lien d'invitation ?
                - link "Le coller →" [ref=e112]:
                  - /url: /join
      - dialog "Crée ton 1er groupe" [ref=e113]:
        - generic [ref=e114]:
          - generic [ref=e117]:
            - generic "Étape 1 sur 4" [ref=e118]
            - button "Passer le tour" [ref=e123] [cursor=pointer]: ✕
          - img [ref=e125]:
            - generic [ref=e127]: 🪙 Tontine Bamiléké
          - generic [ref=e133]: 🪙
          - heading "Crée ton 1er groupe" [level=2] [ref=e134]
          - paragraph [ref=e135]: Tontine, voyage, coloc, événement — choisis un modèle ou pars de zéro. Tes amis te rejoignent par lien d'invitation.
          - button "Suivant →" [ref=e137] [cursor=pointer]
          - button "Passer le tour" [ref=e138] [cursor=pointer]
      - dialog "Tu es ici pour quoi ?" [ref=e139]:
        - generic [ref=e140]:
          - img "BMD" [ref=e142]
          - generic [ref=e143]: Bienvenue · E2E Tester
          - heading "Tu es ici pour quoi ?" [level=2] [ref=e144]
          - paragraph [ref=e145]: Choisis ton cas d'usage — on adapte BMD pour toi.
        - generic [ref=e146]:
          - button "Une tontine Épargne collective rotative entre amis ou famille" [ref=e147] [cursor=pointer]:
            - img [ref=e149]
            - generic [ref=e154]:
              - generic [ref=e155]: Une tontine
              - generic [ref=e156]: Épargne collective rotative entre amis ou famille
            - generic [ref=e157]: →
          - button "Une coloc Loyer, factures, courses partagées au mois" [ref=e158] [cursor=pointer]:
            - img [ref=e160]
            - generic [ref=e163]:
              - generic [ref=e164]: Une coloc
              - generic [ref=e165]: Loyer, factures, courses partagées au mois
            - generic [ref=e166]: →
          - button "Un voyage Vacances en groupe avec dépenses à splitter" [ref=e167] [cursor=pointer]:
            - img [ref=e169]
            - generic [ref=e171]:
              - generic [ref=e172]: Un voyage
              - generic [ref=e173]: Vacances en groupe avec dépenses à splitter
            - generic [ref=e174]: →
          - button "Un mariage / événement Comité d'organisation avec partages flexibles" [ref=e175] [cursor=pointer]:
            - img [ref=e177]
            - generic [ref=e182]:
              - generic [ref=e183]: Un mariage / événement
              - generic [ref=e184]: Comité d'organisation avec partages flexibles
            - generic [ref=e185]: →
          - button "Un club / asso Cotisations sportives, culturelles, étudiantes" [ref=e186] [cursor=pointer]:
            - img [ref=e188]
            - generic [ref=e193]:
              - generic [ref=e194]: Un club / asso
              - generic [ref=e195]: Cotisations sportives, culturelles, étudiantes
            - generic [ref=e196]: →
          - button "Une paroisse Quêtes, projets, reçus pour les membres" [ref=e197] [cursor=pointer]:
            - img [ref=e199]
            - generic [ref=e204]:
              - generic [ref=e205]: Une paroisse
              - generic [ref=e206]: Quêtes, projets, reçus pour les membres
            - generic [ref=e207]: →
        - button "Pas tout de suite · explorer" [ref=e208] [cursor=pointer]
    - navigation "Tableau de bord" [ref=e209]:
      - generic [ref=e210]:
        - link "Accueil" [ref=e211] [cursor=pointer]:
          - /url: /dashboard
          - img [ref=e213]
          - generic [ref=e216]: Accueil
        - link "Groupes" [ref=e217] [cursor=pointer]:
          - /url: /dashboard/groups
          - img [ref=e219]
          - generic [ref=e224]: Groupes
        - button "Ajout express IA" [ref=e225] [cursor=pointer]:
          - img [ref=e226]
        - link "Stats" [ref=e229] [cursor=pointer]:
          - /url: /dashboard/stats
          - img [ref=e231]
          - generic [ref=e232]: Stats
        - link "Cherche" [ref=e233] [cursor=pointer]:
          - /url: /dashboard/search
          - img [ref=e235]
          - generic [ref=e238]: Cherche
  - region "Notifications"
  - generic [ref=e243] [cursor=pointer]:
    - button "Open Next.js Dev Tools" [ref=e244]:
      - img [ref=e245]
    - generic [ref=e250]:
      - button "Open issues overlay" [ref=e251]:
        - generic [ref=e252]:
          - generic [ref=e253]: "0"
          - generic [ref=e254]: "1"
        - generic [ref=e255]: Issue
      - button "Collapse issues badge" [ref=e256]:
        - img [ref=e257]
  - alert [ref=e259]
  - generic "Build dev — tape 🧹 pour clear tout" [ref=e260]:
    - generic [ref=e261]: DEV · 13:26:23
    - button "Force fresh (clear all caches and reload)" [ref=e262] [cursor=pointer]: 🧹
```

# Test source

```ts
  1   | /**
  2   |  * Helpers pour créer un groupe via le wizard `<MobileCreateGroupSheet>`.
  3   |  *
  4   |  * V88.B — Refonte du wizard en V73.3 : le formulaire historique
  5   |  * (<input placeholder=tontine|coloc...> + <select> type + bouton
  6   |  * "Créer le groupe") a été remplacé par un BottomSheet 2-étapes :
  7   |  *
  8   |  *   Étape 1 — Choix du type (5 cards : Tontine / Coloc / Voyage & sortie /
  9   |  *             Vie quotidienne / Autre) + bouton « Continuer → »
  10  |  *   Étape 2 — Détails (input nom + memberCount/lieu optionnels) +
  11  |  *             bouton « Créer le groupe »
  12  |  *
  13  |  * Ce helper encapsule ce parcours pour que les tests E2E s'occupent
  14  |  * uniquement de leur logique métier (ajout de dépense, settlement, ...),
  15  |  * pas de comment cliquer dans le wizard.
  16  |  *
  17  |  * Map vers les types backend :
  18  |  *   TONTINE → TONTINE
  19  |  *   COLOC   → COLOC
  20  |  *   TRAVEL  → TRAVEL (label = "Voyage & sortie")
  21  |  *   EVENT   → EVENT  (label = "Vie quotidienne")
  22  |  *   OTHER   → GENERIC (le wizard mappe "OTHER" côté front avant l'API)
  23  |  */
  24  | import { expect, type Page } from "@playwright/test";
  25  | 
  26  | export type GroupType = "TONTINE" | "COLOC" | "TRAVEL" | "EVENT" | "OTHER";
  27  | 
  28  | interface CreateGroupOpts {
  29  |   /** Type de groupe (aria-label de la card étape 1). */
  30  |   type?: GroupType;
  31  |   /** Nom du groupe (étape 2). Default : `Groupe E2E ${timestamp}`. */
  32  |   name?: string;
  33  |   /** Pré-condition : l'utilisateur doit déjà être loggué et sur /dashboard. */
  34  |   skipNav?: boolean;
  35  | }
  36  | 
  37  | const TYPE_LABELS: Record<GroupType, RegExp> = {
  38  |   TONTINE: /^tontine$/i,
  39  |   COLOC: /^coloc$/i,
  40  |   TRAVEL: /voyage|travel|sortie/i,
  41  |   EVENT: /vie quotidienne|événement|event/i,
  42  |   OTHER: /^autre$|^other$/i,
  43  | };
  44  | 
  45  | /**
  46  |  * Ouvre le sheet de création, sélectionne un type, remplit le nom et valide.
  47  |  * Attend l'arrivée sur la page détail du groupe (`/dashboard/groups/{uuid}`).
  48  |  *
  49  |  * Retourne le `groupId` extrait de l'URL et le `name` utilisé.
  50  |  */
  51  | export async function createGroup(
  52  |   page: Page,
  53  |   opts: CreateGroupOpts = {},
  54  | ): Promise<{ groupId: string; name: string }> {
  55  |   const { type = "EVENT", name = `Groupe E2E ${Date.now()}`, skipNav } = opts;
  56  | 
  57  |   if (!skipNav && !page.url().endsWith("/dashboard")) {
  58  |     await page.goto("/dashboard");
  59  |   }
  60  | 
  61  |   // ---- 1. Trigger d'ouverture du sheet ----
  62  |   // Plusieurs entrées possibles selon la page :
  63  |   //  - Bouton header desktop « + Nouveau » (dashboard)
  64  |   //  - Empty state « Créer ton premier groupe » (dashboard sans groupe)
  65  |   //  - FAB chooser → « Créer un groupe » (mobile)
  66  |   //
  67  |   // On essaie d'abord le bouton header desktop ; si pas trouvé, on tombe
  68  |   // sur le FAB ou l'empty-state.
  69  |   const trigger = page
  70  |     .getByRole("button", {
  71  |       name: /nouveau groupe|^nouveau$|＋\s*nouveau|créer.*premier|créer un groupe/i,
  72  |     })
  73  |     .first();
  74  |   // On force visible avec un timeout généreux (cold-start dev Next.js peut
  75  |   // mettre du temps à compiler /dashboard).
  76  |   await trigger.waitFor({ state: "visible", timeout: 30_000 });
> 77  |   await trigger.click();
      |                 ^ TimeoutError: locator.click: Timeout 10000ms exceeded.
  78  | 
  79  |   // ---- 2. Étape 1 — Choisir le type ----
  80  |   // Le wizard a un h2 "Pour quoi tu crées ce groupe ?".
  81  |   await expect(
  82  |     page.getByRole("heading", { name: /pour quoi tu crées|nouveau groupe/i }),
  83  |   ).toBeVisible({ timeout: 8_000 });
  84  | 
  85  |   // Click sur la card du type (aria-label = label visible).
  86  |   const typeCard = page
  87  |     .getByRole("button", { name: TYPE_LABELS[type] })
  88  |     .first();
  89  |   await typeCard.click();
  90  | 
  91  |   // Click sur « Continuer → »
  92  |   await page
  93  |     .getByRole("button", { name: /continuer|next|suivant/i })
  94  |     .first()
  95  |     .click();
  96  | 
  97  |   // ---- 3. Étape 2 — Saisir le nom + valider ----
  98  |   await expect(
  99  |     page.getByRole("heading", { name: /détails du groupe|détails/i }),
  100 |   ).toBeVisible({ timeout: 5_000 });
  101 | 
  102 |   // L'input nom est `autoFocus` avec placeholder "Ex: Famille Tsakou".
  103 |   const nameInput = page.getByPlaceholder(/famille|tsakou|nom du groupe/i).first();
  104 |   await nameInput.waitFor({ state: "visible", timeout: 5_000 });
  105 |   await nameInput.fill(name);
  106 | 
  107 |   // Bouton « Créer le groupe » (gradient saffron-terracotta).
  108 |   await page
  109 |     .getByRole("button", { name: /créer le groupe|^créer$|create the group/i })
  110 |     .first()
  111 |     .click();
  112 | 
  113 |   // ---- 4. Atterrissage page détail groupe ----
  114 |   await page.waitForURL(/\/dashboard\/groups\/[0-9a-f-]{36}/, {
  115 |     timeout: 15_000,
  116 |   });
  117 | 
  118 |   const match = page.url().match(/\/dashboard\/groups\/([0-9a-f-]{36})/);
  119 |   if (!match) {
  120 |     throw new Error(
  121 |       `URL inattendue après création de groupe : ${page.url()}`,
  122 |     );
  123 |   }
  124 |   return { groupId: match[1], name };
  125 | }
  126 | 
```