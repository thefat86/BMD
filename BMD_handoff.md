# BMD · Document de handoff

> **À transférer dans le nouveau projet Cowork dédié.**
> Date du handoff : 8 mai 2026
> Auteur : Fabrice Tsakou (`fabricetsakou@gmail.com`)
> Dépôt : monorepo Turborepo `bmd-app/` (Next.js 15 + Node/Fastify + Prisma)

---

## 1. Résumé du projet BMD

### Concept général (5 lignes)

**BMD — « Back Mes Do »** est une fintech sociale pensée pour la diaspora africaine et asiatique. Elle permet de gérer collectivement l'argent (dépenses partagées entre amis, tontines rotatives entre membres d'une communauté, événements ponctuels comme mariages ou voyages) avec un parcours sans friction, multi-devises et multi-langues. La promesse de marque : *« L'argent partagé. L'amitié protégée. »* Concrètement, BMD fait disparaître les conversations gênantes autour de l'argent en automatisant les calculs, les rappels, les règlements (mobile money, virement, Stripe) et la traduction. Le produit existe en web responsive, PWA installable, et bot WhatsApp/SMS.

### Public cible

- **Cœur de cible** : diaspora africaine vivant en Europe (France, Luxembourg, Belgique, Allemagne, Italie, UK), Amérique du Nord, Golfe — et leurs proches restés au pays. Communautés camerounaise, ivoirienne, sénégalaise, nigériane, congolaise (RDC), éthiopienne, ghanéenne, kényane, swahiliphone.
- **Cible secondaire** : diaspora asiatique (Inde, Chine, Vietnam, Philippines), expats européens entre eux, voyageurs en groupe.
- **Personas** : (a) le « connecté » qui gère sa famille étendue depuis l'étranger, (b) le trésorier de tontine ou d'association cultuelle, (c) le groupe d'amis qui voyage, (d) la paroisse/association qui collecte les dîmes ou cotisations.

### Modèle économique retenu

Modèle freemium avec 5 plans :

- **FREE / Découverte** — gratuit. 2 groupes, 8 membres/groupe, OCR limité. Avec publicités douces.
- **PREMIUM** — abonnement mensuel (≈ 4,99 €) ou annuel. Tout illimité, sans pub, swap de dettes, 25 devises, support prioritaire, scan IA illimité, double authentification.
- **COMMUNITY / Communauté** — pour clubs et associations (≈ 19 €/mois). Dashboard admin client, rôles custom, sans pub.
- **PARISH / Paroisse** — paroisses et associations cultuelles (≈ 15 €/mois). Reçus fiscaux automatiques.
- **EVENT / Événement** — paiement unique 29 € pour mariage / voyage / événement, valable 30 jours.

Tarification régionale (PPA) déjà câblée : prix locaux en XAF, NGN, INR, etc. Add-ons facturés via Stripe (réunion premium 1 h, audio proof 5 min, OCR factures Mindee). Trial Premium 14 jours après le 4ᵉ scan OCR. Affiliation/parrainage actif.

### Stack technique

**Monorepo Turborepo** (`apps/api`, `apps/web`, `packages/shared-types`).

- **Backend** : Node.js 20, **Fastify**, **Prisma 5** sur PostgreSQL 16, Vitest pour les tests (≥ 80 % couverture).
- **Frontend web** : **Next.js 15.5.15** (App Router), React 18, hooks `useT()` maison pour i18n, CSS-in-JS inline + variables CSS, mode dark uniquement.
- **PWA** : Service Worker network-first agressif, install prompt iOS + Android, push notifications, haptics, safe-areas natives.
- **Mobile** : pas de natif iOS/Android pour l'instant — la PWA fait office d'app native (passkey Face ID / Touch ID via WebAuthn fonctionne).
- **Auth** : OTP 6 chiffres (SMS / WhatsApp / e-mail via Twilio Verify + Resend) + JWT révocables côté DB, SSO Google + Apple + Sign in with WhatsApp, **passkeys WebAuthn** (priorité mobile).
- **Paiements** : Stripe (fiat) + intégrations Mobile Money (M-Pesa, MTN MoMo, Orange Money, Wave, Airtel) + crypto désactivé pour l'instant.
- **IA** : OpenAI GPT-4o (parse-expense conversationnel, extraction de décisions de réunion), Whisper (transcription voix), Mindee Invoice OCR + GPT-4o Vision + Tesseract (3 moteurs OCR avec fallback transparent).
- **Infra** : Postgres avec connection pooling, Redis cache (drop-in si `REDIS_URL` fournie, sinon in-memory), BullMQ pour les jobs lourds, S3 pour audio (rotation + rétention 90 jours), Resend pour les emails.
- **i18n** : 27 locales sur le site vitrine, 25 dans le catalog client (`apps/web/lib/i18n/app-strings.ts`) + fr-cm (Francanglais), fr-ci (Nouchi). 100 % de couverture vérifiée par CI (`npm run i18n:check:strict`).
- **CI/CD** : GitHub Actions (`.github/workflows/ci.yml`), Dockerfile prêt, `DEPLOYMENT.md` documenté.
- **Branding email** : SVG inline avec gradient saffron→terracotta, signature manuscrite serif Cormorant Garamond, citation BMD du jour auto-injectée.

---

## 2. Décisions structurantes prises

### Produit & marque

- **Nom retenu : BMD = Back · Mes · Do** (jeu de mots sur « rends-moi-dos », l'idée de se rendre l'argent sans drama). Domaine : `backmesdo.com`. Logo : cercle saffron avec « B » en serif Cormorant Garamond, couronne or pour effet « blason luxe ». Tagline : *« L'argent partagé. L'amitié protégée. »* Décision : ne PAS pivoter le nom — il a une identité culturelle forte qui parle à la diaspora.
- **Tonalité : chaleureuse, complice, parfois humoristique.** Tutoiement par défaut en FR, « tú » en ES, « você » en PT, vouvoiement formel en DE. Pourquoi : BMD vit dans des moments délicats (argent + amitié) — la chaleur et l'humour adoucissent le rappel d'une dette.
- **Mode dark uniquement.** Le mode clair a été retiré (sprint V13) pour cohérence visuelle et lisibilité, et parce que la cible cœur (mobile night-time) bénéficie plus du dark.
- **Pas de bot Telegram, pas de Discord.** WhatsApp + SMS suffisent pour la cible. Évite la dispersion produit.

### Architecture & code

- **Monorepo Turborepo** plutôt que multi-repos. Pourquoi : les types partagés (`packages/shared-types`) circulent entre API et web sans publication npm, et un seul `npm test` lance tout.
- **Next.js App Router** plutôt que Pages Router. Pourquoi : Server Components pour les pages publiques (vitrine, FAQ, pricing — Sprint R3), edge runtime sur les routes compatibles (T1), `loading.tsx` étendus.
- **Prisma + PostgreSQL** plutôt que Drizzle ou raw SQL. Pourquoi : DX rapide, génération de types, migrations versionnées, et le besoin de relations complexes (groups ↔ members ↔ expenses ↔ payers ↔ shares).
- **Fastify** plutôt qu'Express. Pourquoi : 2-3× plus rapide, schémas TypeBox pour validation, plugin ecosystem propre (CORS, rate-limit, multipart, JWT).
- **In-memory JobQueue avec adaptateur BullMQ optionnel.** Pourquoi : démarrer sans Redis pour le MVP, switcher dès qu'on a du trafic via `REDIS_URL` (Sprint AC-4.5). Zéro refacto métier.
- **Catalog i18n single source of truth en TypeScript** (`apps/web/lib/i18n/app-strings.ts`) avec `Record<LocaleCode, Record<string, string>>` et `AppStringKey = keyof typeof APP_STRINGS_FR_KEYS`. Pourquoi : type-safety stricte sur les clés (auto-complétion IDE), pas de fichiers JSON éparpillés, et un script Python pour le fanout multi-locale rapide.
- **CI i18n stricte.** `npm run i18n:check:strict` (chaque clé FR doit exister dans 24 autres locales) + `npm run i18n:audit:strict` (zéro string FR hardcodée détectée). Pourquoi : empêcher toute régression — le user a explicitement dit *« un Chinois ne doit jamais voir du français sur son compte »*.

### UX & i18n

- **27 locales** sur la vitrine, dont **fr-cm (Francanglais)** et **fr-ci (Nouchi)** — variantes culturelles de la diaspora. Pourquoi : pas symbolique. Le « Nouchi » d'Abidjan a une force d'identification que le « français standard » n'a pas pour cette cible.
- **LangPicker à 5 groupes** (Main / Européennes / Asiatiques / Arabes / Africaines) avec accordion (un seul groupe ouvert à la fois) et auto-ouverture du groupe contenant la locale active. Click-outside et Escape ferment tout. Composant partagé `SharedLangPicker` utilisé sur **vitrine + login + profil + mobile** pour cohérence visuelle (Sprint AD-1).
- **Plans tarifs traduits dans 27 locales partout** (vitrine, espace client, modal d'upgrade, app mobile). Bullets de limites (« Groupes illimités », « Multi-devises », « OCR illimité ») dans toutes les langues — pas de fallback EN. Sprint AC-6.
- **Console admin exclue de l'i18n.** Décision actée : l'admin reste en français — c'est l'équipe interne qui l'utilise. Le `check-no-fr-strings.mjs` skip `app/admin/**`.

### Emails

- **Layout shell unique** (`renderLayout`) avec hero gradient saffron→terracotta, logo SVG inline, CTA bouton, blockQuote optionnel, signature manuscrite serif. Pourquoi : cohérence visuelle, et un seul endroit à patcher pour tous les templates.
- **Citation BMD du jour** auto-injectée à la fin de chaque email (Sprint AD-2). Rotation déterministe par jour pour qu'un même destinataire reçoive la même citation s'il a plusieurs emails dans la journée. 6 citations × 14 locales natives, fallback EN pour les autres.
- **Pas de tracking pixel ni d'A/B test sur les emails transactionnels.** Décision RGPD : on respecte le destinataire. Les emails marketing sont un autre flow (newsletter, pas encore mise en place).
- **BIMI configuré** (Sprint « BIMI · logo email + DNS setup ») : le logo BMD apparaît dans Gmail/Apple Mail à côté du sender.

### Sécurité

- **Audit sécu fait** (Sprint U4). `.env.example` complet, secrets hors repo, helmet sur Fastify, rate-limit aggressif sur OTP (5/h/contact), passkey + admin routes auditées (Sprint 22).
- **Pas de stockage de mot de passe.** OTP + passkeys + SSO uniquement. Pourquoi : les attaques credential stuffing tuent les fintechs, on les évite par design.
- **Audio proof avec rotation S3 + rétention 90 jours** (Sprint AC-4.3). RGPD-friendly et limite l'exposition.

### Légal & paiements

- **Reçus fiscaux automatiques** sur le plan PARISH (loi française : déductibilité de 66 % pour dons à associations cultuelles). Inclus dans le plan PREMIUM aussi pour la flexibilité.
- **Stripe portal lien** sur refus add-on meeting (Sprint AC-4.2) : l'utilisateur peut toujours gérer son abonnement.

---

## 3. Livrables produits

> Tous les chemins sont relatifs à `apps/web/` ou `apps/api/` du monorepo `bmd-app/`.

### Documentation (racine du repo)

| Fichier | Description |
|---|---|
| `README.md` | Démarrage 3 min, architecture, modules livrés. |
| `CHANGELOG.md` | Récap exhaustif de tous les sprints (V1 → AD-3). |
| `CONTRIBUTING.md` | Conventions code, i18n-first, fanout GPT. |
| `DEPLOYMENT.md` | Steps prod (Postgres, Redis, S3, env vars). |
| `SECURITY.md` | Politique de divulgation, secrets, RGPD. |
| `Dockerfile` + `.github/workflows/ci.yml` | Build + CI/CD. |

### Backend (`apps/api/src/`)

| Chemin | Rôle |
|---|---|
| `prisma/schema.prisma` | Schema complet : User, Group, Member, Expense, ExpensePayer, Tontine, TontineTurn, Settlement, CrossGroupSettlement, MeetingRecord, Plan, Subscription, etc. |
| `modules/auth/` | M01 — OTP + JWT + sessions + passkeys + SSO. |
| `modules/groups/` | M05 — CRUD groupes, rôles, invitations, themes. |
| `modules/expenses/` | M06 — saisie + 3 modes de partage + multi-payeurs (AC-2.1). |
| `modules/settlements/` | M07 — soldes, algo simplification, cross-group settlements (V30). |
| `modules/tontines/` | Tontines rotatives, double validation, calendrier 6 mois. |
| `modules/meetings/` | Enregistrement audio + transcription Whisper + extraction décisions GPT-4o. |
| `modules/admin/` | Dashboard admin : MRR, ARPU, churn, cohorts, FX override. |
| `lib/email-templates.ts` | Shell premium : logo SVG inline, hero gradient, CTA, **citation BMD du jour** (AD-2), signature, footer multi-locale 14 langues natives. |
| `lib/messaging.ts` | Adaptateurs Resend (email), Twilio (SMS/WhatsApp), Whisper. |
| `lib/scheduler.ts` | Crons : résumé hebdo, relances invitations J+2/J+5/J+10, rotation S3. |
| `lib/cache.ts` | Abstraction Redis avec fallback in-memory. |
| `lib/queue.ts` | JobQueue in-memory + adapter BullMQ optionnel. |

### Frontend (`apps/web/`)

| Chemin | Rôle |
|---|---|
| `app/page.tsx` | Site vitrine (3500+ lignes) : hero, story, features, FAQ, pricing live, lang picker. |
| `app/login/page.tsx` | OTP + signup mobile avec champs conditionnels (locale + currency) + passkey first-class. |
| `app/dashboard/page.tsx` | Dashboard groupes + dual view (par groupe / par personne). |
| `app/dashboard/groups/[id]/page.tsx` | Détail groupe : dépenses, soldes, suggestions, calendrier tontine, anomalies. |
| `app/dashboard/groups/[id]/settings/page.tsx` | Settings groupe + thème custom + règles catégories. |
| `app/dashboard/groups/[id]/print/page.tsx` | Vue imprimable (PDF via Cmd+P). |
| `app/dashboard/profile/page.tsx` | Profil + langue + devise + parrainage + GDPR + sessions + plan actuel. |
| `app/dashboard/plans/page.tsx` | Comparateur de plans + checkout Stripe. |
| `app/dashboard/search/page.tsx` | Search globale (incluant transcripts de réunions). |
| `app/legal/privacy/page.tsx` | Politique RGPD. |
| `lib/i18n/app-strings.ts` | **Catalog i18n** : 1095+ clés × 27 locales (~29k traductions). |
| `lib/i18n/marketing-translations.ts` | Strings vitrine (T[locale] structuré par section). |
| `lib/ui/shared-lang-picker.tsx` | **Composant partagé** LangPicker 5 groupes (AD-1). |
| `lib/ui/live-pricing-section.tsx` | Tarifs vitrine avec PLAN_TRANSLATIONS + BULLET_LABELS × 27 locales. |
| `lib/ui/plan-block.tsx` | Bloc « Mon forfait » dans le profil — tout traduit (AC-6). |
| `lib/ui/plan-gate-dialog.tsx` | Modal d'upgrade au gating, accepte `t` injecté. |
| `lib/ui/tontine-calendar.tsx` | Vue calendrier 6 mois × 5 lignes (web). |
| `lib/ui/skeleton.tsx` | Skeleton loaders avec shimmer + `prefers-reduced-motion`. |
| `lib/ui/expense-anomalies-badge.tsx` | Banner d'anomalies (montant inhabituel, doublon, retard). |
| `lib/ui/promo-block.tsx`, `lib/ui/gdpr-block.tsx`, `lib/ui/payment-methods-block.tsx`, … | Blocs profil. |
| `scripts/check-i18n-coverage.mjs` | CI : 100 % de couverture i18n. |
| `scripts/check-no-fr-strings.mjs` | CI : zéro string FR hardcodée. |

### Scripts utilitaires (racine session)

| Chemin | Rôle |
|---|---|
| `add-ac5-i18n.py`, `add-ac6-i18n.py`, `add-ac6b-i18n.py` | Fanout des nouvelles clés sur 25-27 locales. |
| `add-plan-limit-i18n.py`, `add-langpicker-i18n.py`, `add-locales-available-i18n.py`, `add-ocr-none-i18n.py` | Fanout ciblé par feature. |
| `dedupe-ac5-keys.py` | Nettoyage des doublons après fanout. |
| `translate-fallback-locales.ts` | Auto-traduction GPT-4o pour les clés manquantes (avec retry, batching, support non-Latin scripts). |

---

## 4. État d'avancement

### ✅ Fait (227+ sprints)

- **Sprint 0 + MVP** : Auth (M01), Groupes (M05), Dépenses (M06), Soldes & règlements (M07).
- **Sprints A-F** : Onboarding contextuel, DND par groupe, IA parse-expense, suggestions IA partage, règles catégories, import bancaire CSV, mobile money, calendrier tontines, scan ticket drag-drop, themes par communauté, anomalies, A/B testing, NPS, bot WhatsApp natif.
- **Sprints M (mobile)** : MobileGroupDetail natif, admin mobile cards, NotificationCenter fullscreen, group settings sheets, admin mobile complet.
- **Sprints P-T (perf)** : memoization, prefetch hover, lazy load, optimistic UI, haptics, SW network-first, resource hints, Cache-Control, edge runtime, font optimization.
- **Sprints U-V (prod ready)** : DEPLOYMENT, CI/CD, seeds démo, audit sécu, .env.example, Dockerfile, theme system, FAQ enrichie, fix passkey mobile.
- **Sprints W-Z (UX)** : signup conditionnel, OTP double-code fix, UpgradePrompt unifié, cross-settlements, currency USD partout, locale 27 langues partout.
- **Sprints AA (cleanup)** : profile FX, group detail FX, expense form labels, mobile dashboard.
- **Sprints AC** : multi-payeurs (AC-2.1), MeetingRecord (AC-2.2), plans éditables (AC-3.1), audio proof, Stripe addon billing, BullMQ Redis adapter, tests E2E Playwright, audit i18n exhaustif (AC-5), 100 % i18n strict + audit anti-FR strict.
- **Sprint AC-6** : 0 string FR hardcodée dans tout l'espace client + tarifs traduits 27 locales (vitrine + client + plan-gate).
- **Sprint AD-1** : `SharedLangPicker` composant unique sur vitrine + login + profil. Cohérence UX.
- **Sprint AD-2** : Emails premium avec citation BMD du jour (rotation déterministe), 14 locales natives, fallback EN. Logo SVG inline, BIMI configuré.
- **Sprint AD-3** : Vérifs E2E (`npx tsc`, `i18n:check:strict`, `i18n:audit:strict`) toutes vertes.

### 🟡 En cours / partiellement traité

- **App mobile native** : pas démarrée. La PWA fait le job pour le MVP (passkey Face ID / Touch ID, push iOS, install prompt). Une vraie app React Native ou Capacitor est à arbitrer.
- **Newsletter marketing** : pas démarrée. Les emails actuels sont tous transactionnels.

### ⏳ Reste à faire (par priorité)

1. **Beta fermée 50 utilisateurs diaspora.** Recrutement (Cameroun + Côte d'Ivoire + Sénégal en priorité). Onboarding individuel, feedback Whatsapp, NPS hebdo. Cible : 6 semaines.
2. **Vérification fiscale Luxembourg.** Confirmer le statut BMD : SARL-S, S.à r.l., ou Auto-Entrepreneur transfrontalier ? TVA intra-com sur les abonnements ? Voir point 5 ci-dessous.
3. **Compliance & licence paiements.** Si BMD touche à la garde de fonds (cross-group settlements en attente, tontines), il y a un sujet PSP / Établissement de Paiement / Agent. À ne PAS sous-estimer.
4. **App mobile native (Capacitor d'abord).** Capacitor wrappe la PWA — 2 semaines de travail max. React Native plus tard si traction.
5. **Marketing organique** : landing CM/CI/SN dédiées, témoignages vidéo (3 utilisateurs filmés), TikTok diaspora.
6. **Newsletter mensuelle** : « La lettre BMD » avec des histoires de partage réussi (anonymisées avec consentement). Ton : chaleureux + une citation BMD à la fin (cohérent avec emails transactionnels).
7. **Internationalisation des moyens de paiement** : ajouter Hong Kong, Taïwan, Singapour, Brésil (Pix) — la cible asiatique a ces besoins.
8. **Programme parrainage récompensé** : 1 mois Premium offert pour 1 ami invité qui s'abonne. Déjà câblé techniquement, à activer + créa.

---

## 5. Points ouverts / décisions à prendre

### 🔴 Critiques

- **Statut juridique de BMD au Luxembourg.** Tu vis au LU et as un lien fiscal FR. Avant la beta, il faut trancher : SARL-S unipersonnelle (capital 1 €, idéal MVP) vs SCI vs S.à r.l. classique. **À voir avec un conseil fiscal franco-luxembourgeois** — la convention CSG/RDS franco-LU et la TVA intra-com ont des spécificités sur les services numériques B2C.
- **Licence paiement / agrément.** BMD facilite des transferts inter-membres (cross-group settlements, tontines). Si BMD reste en mode « registre comptable » sans toucher les fonds (les utilisateurs paient directement entre eux via Stripe ou Mobile Money externe), pas d'agrément requis. Si BMD séquestre les fonds, il faut un agrément CSSF (LU) ou ACPR (FR) niveau Établissement de Paiement OU un partenariat avec un PSP agréé (type Stripe Treasury, Mangopay, Lemonway). **Décision urgente avant beta.**
- **Données personnelles & RGPD vs marchés africains.** Le Cameroun et la Côte d'Ivoire ont leurs propres lois de protection des données (loi n°2010/012 au CM, loi 2013-450 en CI). DPO requis ? Hébergement local ? À auditer.

### 🟡 Importants mais pas bloquants

- **Stripe vs Mangopay / Lemonway.** Stripe est intégré pour le fiat occidental. Mais pour les flux Europe→Afrique, Mangopay ou Lemonway sont meilleurs (KYC adapté). Choix à arbitrer en fonction de la croissance.
- **Marque BMD vs nom commercial localisé.** Faut-il décliner « Back Mes Do » en versions locales (« BackChezMoi » au Sénégal, « ZerolitigeBro » en CI, etc.) ? Ou garder BMD partout pour cohérence ? **Mon avis : garder BMD partout, mais autoriser les groupes à se nommer localement.**
- **Crypto wallet.** Désactivé pour le MVP. La diaspora utilise USDT/USDC pour contourner les contrôles de change (Nigeria notamment). À réétudier après V1 — risque réglementaire à anticiper.
- **Bot Telegram en plus de WhatsApp.** Décidé NON pour le MVP. À réétudier si la cible asiatique demande.

### 🟢 Sujets à approfondir plus tard

- **B2B paroisses.** Le plan PARISH cible bien, mais il faut un commercial dédié + démos. Pas pour le MVP solo.
- **Plan EVENT one-shot 29 €.** Marketing à imaginer (mariages = saisonnier).
- **Tableau de bord analytics partenaires.** L'API publique partenaires (E1) est en place mais pas de portal self-serve pour générer une clé API.

### 🚨 Risques identifiés

1. **Concurrence directe** : Splitwise (US, sans diaspora focus), Tricount (FR), AzaPay (UK→Afrique). Avantage BMD : i18n native + tontines + WhatsApp + tarification PPA. Mais ils ont budget marketing supérieur.
2. **Coût OpenAI sur l'IA conversationnelle.** GPT-4o pour parse-expense + Whisper + Vision OCR = ~0,02 € par interaction lourde. Si croissance virale, prévoir plafonds par plan (déjà câblé pour OCR via `assertCanUseOcr`).
3. **Compliance Mobile Money.** Chaque opérateur (M-Pesa, MTN MoMo, Orange Money, Wave) a ses propres conditions d'API et frais. À renégocier en volume après MVP.
4. **Risque culturel diaspora** : la tontine est un sujet sensible — la perte de confiance d'un seul groupe peut tuer la viralité. Le système de double validation cotisations (Sprint D2) doit absolument tenir en prod.

---

## 6. Contexte personnel utile

### Profil entrepreneurial *(à compléter avec ce que tu juges pertinent)*

> **Ce que je sais :** Tu es Fabrice Tsakou (`fabricetsakou@gmail.com`), tu travailles sur BMD comme projet entrepreneurial, tu as une exigence forte sur la qualité (« tout doit être carré, aucun écart ») et tu privilégies l'autonomie agentique (tu m'as explicitement dit *« sois persistant, utilise le contexte nécessaire »*). Tu donnes des consignes en français avec des passages d'humour (« j'avais remarqué… j'aimerais bien… »). Tu as un sens produit fort : les détails branding (logo email, citations contextuelles, ton chaleureux) comptent autant que les features.
>
> **À compléter dans le nouveau projet** : background (parcours, anciennes boîtes), pourquoi BMD, financement (bootstrap / friends&family / VC), équipe envisagée, horizon de sortie.

### Contraintes *(à valider/compléter)*

- **Résidence fiscale : Luxembourg** (déduit du contexte « LU » + « FR »). Probablement un statut de salarié ou TNS au LU avec activités complémentaires côté FR.
- **Lien fiscal France** : peut-être travailleur frontalier, ou ancienne résidence. **Implication : la convention fiscale franco-luxembourgeoise s'applique** — pas de double imposition mais déclarations dans les deux pays selon la nature des revenus.
- **TVA intra-com** : si tu factures depuis LU à des clients UE B2C particuliers, taux TVA du pays du consommateur (OSS), seuil 10 000 € avant obligation OSS. À couvrir dès la beta payante.
- **Pas d'équipe pour l'instant** (tu travailles seul avec moi en pair-programming agentique). Pas de CTO ni de CMO.

### Préférences de travail (observées dans nos échanges)

- **Standard de qualité élevé** : *« je ne veux aucun écart… que tout soit carré »*. Tu veux du fini, pas du « ça marche à peu près ».
- **Travail en français** avec passages courts en anglais/franglais quand le concept l'exige (« live FX », « FloatTag », « BIMI »).
- **Tu donnes des batchs de consignes longues** plutôt que ping-pong rapide. Tu apprécies que je structure ma réponse en sections claires (sprints, livrables, vérifs).
- **Tu valorises la persistence** : tu préfères que je termine le boulot plutôt que demander confirmation à chaque étape — tu m'as explicitement dit *« je suis conscient de tes contraintes de contexte, utilise le entièrement »*.
- **Tu aimes le récap final concis** avec ✅ / chiffres / vérifs vertes.
- **Tu apprécies la chaleur dans le produit** : citations contextuelles, ton humoristique léger, signature manuscrite — tu m'as dit *« le but de cette application est d'offrir aux gens de vivre une expérience »*.
- **Pas d'emojis dans la prose technique** (je le respecte par défaut), mais OK dans le branding (logo, FloatTags, citations).
- **Tu n'aimes pas le bullshit corporate** : tu attends des vraies décisions argumentées, pas des « ça dépend ».

### Outils & workflow

- Mac (`MBP-du-Tsakou`).
- Tu utilises Cowork (cette session) avec Claude pour le pair-programming.
- Repo local dans le folder mounté `/sessions/great-youthful-euler/mnt/bmd-app/`.
- Tu lances les commandes npm directement dans `apps/web` quand le test root échoue (Turbo binaire macOS).
- Tu ne pousses pas tout sur GitHub immédiatement — pas de push automatique. Décisions de commit à ton initiative.

---

## 7. Prochaines étapes immédiates

> Ordre de priorité recommandé. Les 5 actions sont chacune actionnables sous 24-72 h.

### 1. Préparer la consultation fiscale & juridique LU/FR *(action externe, 2-5 jours)*

Prendre rendez-vous avec **un conseil fiscal franco-luxembourgeois** spécialisé fintech / SaaS. Préparer un dossier court :
- Modèle économique BMD (les 5 plans + add-ons).
- Volumes prévisionnels beta : 50 users, ~150 € MRR maxi à 6 semaines.
- Question structure : SARL-S au LU vs S.à r.l. classique ? Holding FR ?
- Question agrément : ai-je besoin d'un agrément paiement si je ne séquestre pas les fonds (paiements directs P2P via Stripe) ?
- Question TVA OSS sur abonnements B2C UE.

### 2. Migrer BMD dans son projet Cowork dédié *(30 minutes)*

- Créer un nouveau projet Cowork « BMD ».
- Y déposer ce document (`BMD_handoff.md`) + le `CHANGELOG.md` complet.
- Optionnel : zipper le repo `bmd-app/` et l'attacher pour que Claude puisse y accéder dès la première session.

### 3. Démarrer la beta fermée — recruter 10 testeurs *(1 semaine)*

- Liste de 10 amis/famille diaspora (CM/CI/SN/RDC en priorité).
- Onboarding individuel : appel 30 min, configuration du premier groupe (famille / amis / tontine).
- Canal feedback dédié : groupe WhatsApp privé « BMD Pilots ».
- Mesurer : NPS hebdo (le composant est déjà câblé), nombre de dépenses créées, taux de retour J7.

### 4. Stabiliser une démo publique chiffrée *(2-3 jours)*

- Déployer l'env de prod (suivre `DEPLOYMENT.md`).
- Configurer Stripe en mode live (clés réelles).
- Tester le flow complet : signup → créer groupe → ajouter dépense → upgrade Premium → recevoir email avec citation BMD.
- Faire un Loom de 90 secondes en français + un en anglais pour partager aux investisseurs/conseillers.

### 5. Capter les premiers signaux PMF *(continu pendant la beta)*

- Activer un panneau retro mensuel : « Qu'est-ce qui marche, qu'est-ce qui coince, qu'est-ce qu'il manque ».
- Surveiller l'OCR usage (4ᵉ scan = trial Premium auto — vérifier la conversion).
- Surveiller les anomalies de dépenses détectées : c'est un signal fort qu'on est utile.
- Ne pas ajouter de nouvelles features avant 50 users actifs réguliers.

---

> **Note de fin** : ce document a été généré à partir de l'historique complet de la conversation. Les sections 6 (profil entrepreneurial) et 5 (décisions fiscales/légales) reposent en partie sur des déductions — à valider/compléter au démarrage du nouveau projet Cowork.
>
> *« L'argent partagé. L'amitié protégée. »* — La promesse BMD.
