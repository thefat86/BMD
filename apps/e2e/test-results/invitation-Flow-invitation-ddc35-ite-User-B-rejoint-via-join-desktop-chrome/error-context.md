# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: invitation.spec.ts >> Flow invitation >> User A crée un groupe + invite, User B rejoint via /join
- Location: tests/invitation.spec.ts:24:3

# Error details

```
TimeoutError: locator.click: Timeout 10000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /nouveau groupe|^nouveau$|＋\s*nouveau|créer.*premier|créer un groupe/i }).first()
    - locator resolved to <button type="button">＋ Nouveau groupe</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div role="dialog" aria-modal="true" aria-labelledby="onboarding-title">…</div> from <main>…</main> subtree intercepts pointer events
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div role="dialog" aria-modal="true" aria-labelledby="onboarding-title">…</div> from <main>…</main> subtree intercepts pointer events
    - retrying click action
      - waiting 100ms
    17 × waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <div role="dialog" aria-modal="true" aria-labelledby="onboarding-title">…</div> from <main>…</main> subtree intercepts pointer events
     - retrying click action
       - waiting 500ms

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "Aller au contenu principal" [ref=e2] [cursor=pointer]:
    - /url: "#main-content"
  - generic [ref=e4]:
    - complementary [ref=e5]:
      - link "BMD Back Mes Do" [ref=e6] [cursor=pointer]:
        - /url: /dashboard
        - generic [ref=e7]:
          - generic [ref=e8]: BMD
          - generic [ref=e9]: Back Mes Do
      - link "Tableau de bord" [ref=e11] [cursor=pointer]:
        - /url: /dashboard
        - generic [ref=e12]: 🏠
        - generic [ref=e13]: Tableau de bord
      - generic [ref=e14]:
        - generic [ref=e15]: Groupes
        - link "Groupes" [ref=e16] [cursor=pointer]:
          - /url: /dashboard
          - generic [ref=e17]: 👥
          - generic [ref=e18]: Groupes
        - link "Statistiques" [ref=e19] [cursor=pointer]:
          - /url: /dashboard/stats
          - generic [ref=e20]: 📊
          - generic [ref=e21]: Statistiques
      - generic [ref=e22]:
        - generic [ref=e23]: Mon profil
        - link "Mon profil" [ref=e24] [cursor=pointer]:
          - /url: /dashboard/profile
          - generic [ref=e25]: 👤
          - generic [ref=e26]: Mon profil
        - link "Mon forfait" [ref=e27] [cursor=pointer]:
          - /url: /dashboard/plans
          - generic [ref=e28]: ✨
          - generic [ref=e29]: Mon forfait
        - link "Espace commercial" [ref=e30] [cursor=pointer]:
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
          - heading "Bonjour E2E" [level=1] [ref=e40]
          - paragraph [ref=e41]: Bienvenue
        - generic [ref=e42]:
          - button "＋ Nouveau groupe" [ref=e43] [cursor=pointer]
          - link "Notifications" [ref=e44] [cursor=pointer]:
            - /url: /dashboard/profile
            - img [ref=e45]
          - link "E" [ref=e47] [cursor=pointer]:
            - /url: /dashboard/profile
      - main [ref=e48]:
        - generic [ref=e49]:
          - generic [ref=e50]:
            - generic [ref=e51]:
              - generic [ref=e52]: Mon solde global · E2E
              - generic [ref=e53]:
                - generic [ref=e54]: +0,00
                - generic [ref=e55]: EUR
              - generic [ref=e56]:
                - generic [ref=e57]:
                  - generic [ref=e58]: On me doit
                  - generic [ref=e59]: 0,00 EUR
                - generic [ref=e60]:
                  - generic [ref=e61]: Je dois
                  - generic [ref=e62]: 0,00 EUR
            - generic [ref=e63]:
              - generic [ref=e64]:
                - generic [ref=e65]: 👥
                - generic [ref=e66]:
                  - generic [ref=e67]: Groupes actifs
                  - generic [ref=e68]: "0"
              - generic [ref=e69]:
                - generic [ref=e70]: 💰
                - generic [ref=e71]:
                  - generic [ref=e72]: Total dépensé
                  - generic [ref=e73]: 0 EUR
              - generic [ref=e74]:
                - generic [ref=e75]: 🌍
                - generic [ref=e76]:
                  - generic [ref=e77]: Devise par défaut
                  - generic [ref=e78]: EUR
          - generic [ref=e79]:
            - generic [ref=e80]:
              - heading "Raccourcis" [level=2] [ref=e81]
              - link "0/5 scans IA" [ref=e82] [cursor=pointer]:
                - /url: /dashboard/plans
                - img [ref=e83]
                - generic [ref=e86]: 0/5 scans IA
            - generic [ref=e87]:
              - link "📊 Statistiques" [ref=e88] [cursor=pointer]:
                - /url: /dashboard/stats
                - generic [ref=e89]: 📊
                - generic [ref=e90]: Statistiques
              - link "👤 Mon profil" [ref=e91] [cursor=pointer]:
                - /url: /dashboard/profile
                - generic [ref=e92]: 👤
                - generic [ref=e93]: Mon profil
              - link "🎁 Parrainer" [ref=e94] [cursor=pointer]:
                - /url: /dashboard/profile
                - generic [ref=e95]: 🎁
                - generic [ref=e96]: Parrainer
              - link "💳 Paiements" [ref=e97] [cursor=pointer]:
                - /url: /dashboard/profile
                - generic [ref=e98]: 💳
                - generic [ref=e99]: Paiements
              - link "🌍 Langue & devise" [ref=e100] [cursor=pointer]:
                - /url: /dashboard/profile
                - generic [ref=e101]: 🌍
                - generic [ref=e102]: Langue & devise
              - link "🏠 Site vitrine" [ref=e103] [cursor=pointer]:
                - /url: /
                - generic [ref=e104]: 🏠
                - generic [ref=e105]: Site vitrine
              - button "＋ ＋ Nouveau groupe" [ref=e106] [cursor=pointer]:
                - generic [ref=e107]: ＋
                - generic [ref=e108]: ＋ Nouveau groupe
          - generic [ref=e109]:
            - generic [ref=e110]:
              - generic [ref=e111]:
                - heading "Mes groupes (0)" [level=2] [ref=e112]
                - tablist "Vue du dashboard" [ref=e113]:
                  - tab "Par groupe" [selected] [ref=e114] [cursor=pointer]
                  - tab "Par personne" [ref=e115] [cursor=pointer]
                - button "＋ Nouveau" [ref=e116] [cursor=pointer]
              - generic [ref=e117]:
                - img
                - generic [ref=e118]:
                  - generic [ref=e119]: 👋
                  - heading "Bienvenue dans BMD" [level=2] [ref=e120]
                  - paragraph [ref=e121]: Crée ton premier groupe pour gérer une tontine, un voyage, une coloc ou un événement. Touche un modèle ci-dessous, on te pré-remplit l'essentiel.
                  - generic [ref=e122]:
                    - button "Tontine L'épargne tournante en famille ou entre amis" [ref=e123] [cursor=pointer]:
                      - generic [ref=e124]: 🪙
                      - generic [ref=e125]: Tontine
                      - generic [ref=e126]: L'épargne tournante en famille ou entre amis
                    - button "Voyage Dépenses partagées d'un trip — Dakar, Marrakech, Bali…" [ref=e127] [cursor=pointer]:
                      - generic [ref=e128]: ✈️
                      - generic [ref=e129]: Voyage
                      - generic [ref=e130]: Dépenses partagées d'un trip — Dakar, Marrakech, Bali…
                    - button "Coloc Loyer, courses, factures partagés au mois" [ref=e131] [cursor=pointer]:
                      - generic [ref=e132]: 🏠
                      - generic [ref=e133]: Coloc
                      - generic [ref=e134]: Loyer, courses, factures partagés au mois
                    - button "Événement Mariage, baptême, anniversaire — collecte + dépenses" [ref=e135] [cursor=pointer]:
                      - generic [ref=e136]: 💍
                      - generic [ref=e137]: Événement
                      - generic [ref=e138]: Mariage, baptême, anniversaire — collecte + dépenses
                  - button "＋ Créer un groupe personnalisé" [ref=e139] [cursor=pointer]
                  - generic [ref=e140]:
                    - generic [ref=e141]: 🔗
                    - generic [ref=e142]: Tu as un lien d'invitation ?
                    - link "Le coller →" [ref=e143] [cursor=pointer]:
                      - /url: /join
            - generic [ref=e144]:
              - generic [ref=e145]:
                - generic [ref=e146]: Répartition par type
                - generic [ref=e147]: Aucun groupe pour l'instant.
              - generic [ref=e148]:
                - generic [ref=e149]: Astuce
                - generic [ref=e150]:
                  - text: 💡 Tu peux fixer ta devise principale dans Mon profil. Tous les soldes seront convertis dans cette devise.
                  - link "Mon profil" [ref=e151] [cursor=pointer]:
                    - /url: /dashboard/profile
        - dialog "Crée ton 1er groupe" [ref=e152]:
          - generic [ref=e153]:
            - generic [ref=e154]:
              - generic "Étape 1 sur 4" [ref=e155]
              - button "Passer le tour" [ref=e160] [cursor=pointer]: ✕
            - img [ref=e162]:
              - generic [ref=e164]: 🪙 Tontine Bamiléké
            - generic [ref=e170]: 🪙
            - heading "Crée ton 1er groupe" [level=2] [ref=e171]
            - paragraph [ref=e172]: Tontine, voyage, coloc, événement — choisis un modèle ou pars de zéro. Tes amis te rejoignent par lien d'invitation.
            - button "Suivant →" [ref=e174] [cursor=pointer]
            - button "Passer le tour" [ref=e175] [cursor=pointer]
        - dialog "Tu es ici pour quoi ?" [ref=e176]:
          - generic [ref=e177]:
            - generic [ref=e178]:
              - generic [ref=e179]: Bienvenue · E2E Tester
              - heading "Tu es ici pour quoi ?" [level=2] [ref=e180]
              - paragraph [ref=e181]: "Choisis ton cas d'usage — on adapte tout : vocabulaire, suggestions, et type de groupe."
            - generic [ref=e182]:
              - button "Une tontine Épargne collective rotative entre amis ou famille" [ref=e183] [cursor=pointer]:
                - img [ref=e185]
                - generic [ref=e190]: Une tontine
                - generic [ref=e191]: Épargne collective rotative entre amis ou famille
              - button "Une coloc Loyer, factures, courses partagées au mois" [ref=e192] [cursor=pointer]:
                - img [ref=e194]
                - generic [ref=e197]: Une coloc
                - generic [ref=e198]: Loyer, factures, courses partagées au mois
              - button "Un voyage Vacances en groupe avec dépenses à splitter" [ref=e199] [cursor=pointer]:
                - img [ref=e201]
                - generic [ref=e203]: Un voyage
                - generic [ref=e204]: Vacances en groupe avec dépenses à splitter
              - button "Un mariage / événement Comité d'organisation avec partages flexibles" [ref=e205] [cursor=pointer]:
                - img [ref=e207]
                - generic [ref=e212]: Un mariage / événement
                - generic [ref=e213]: Comité d'organisation avec partages flexibles
              - button "Un club / asso Cotisations sportives, culturelles, étudiantes" [ref=e214] [cursor=pointer]:
                - img [ref=e216]
                - generic [ref=e221]: Un club / asso
                - generic [ref=e222]: Cotisations sportives, culturelles, étudiantes
              - button "Une paroisse Quêtes, projets, reçus pour les membres" [ref=e223] [cursor=pointer]:
                - img [ref=e225]
                - generic [ref=e230]: Une paroisse
                - generic [ref=e231]: Quêtes, projets, reçus pour les membres
            - button "Pas tout de suite · explorer d'abord" [ref=e232] [cursor=pointer]
  - region "Notifications"
  - generic [ref=e237] [cursor=pointer]:
    - button "Open Next.js Dev Tools" [ref=e238]:
      - img [ref=e239]
    - generic [ref=e242]:
      - button "Open issues overlay" [ref=e243]:
        - generic [ref=e244]:
          - generic [ref=e245]: "0"
          - generic [ref=e246]: "1"
        - generic [ref=e247]: Issue
      - button "Collapse issues badge" [ref=e248]:
        - img [ref=e249]
  - alert [ref=e251]
  - generic "Build dev — tape 🧹 pour clear tout" [ref=e252]:
    - generic [ref=e253]: DEV · 13:25:06
    - button "Force fresh (clear all caches and reload)" [ref=e254] [cursor=pointer]: 🧹
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