# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: marketing.spec.ts >> Vitrine publique >> Desktop : la page d'accueil charge avec sticky nav + ticker
- Location: tests/marketing.spec.ts:14:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('link', { name: /tarifs|pricing/i })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByRole('link', { name: /tarifs|pricing/i })

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "Aller au contenu principal" [ref=e2]:
    - /url: "#main-content"
  - generic [ref=e4]:
    - navigation [ref=e5]:
      - generic [ref=e6]:
        - link "BMD· Back · Mes · Do" [ref=e7]:
          - /url: /
          - img [ref=e8]:
            - generic [ref=e14]: BMD
            - generic [ref=e15]: BACK·MES·DO
          - generic [ref=e17]:
            - generic [ref=e18]: BMD·
            - generic [ref=e19]: Back · Mes · Do
        - generic [ref=e20]:
          - button "Change language" [ref=e22] [cursor=pointer]: 🇫🇷 Français ▾
          - link "Se connecter" [ref=e23]:
            - /url: /login
          - link "Créer un compte" [ref=e24]:
            - /url: /login
    - generic [ref=e26]:
      - generic [ref=e27]:
        - generic [ref=e28]: Back Mes Do · Diaspora
        - heading "L'argent partagé. L'amitié protégée." [level=1] [ref=e29]:
          - text: L'argent partagé. L'amitié
          - emphasis [ref=e30]: protégée.
        - paragraph [ref=e31]: "Tontines, colocs, voyages, mariages, paroisses, clubs : BMD calcule, simplifie et trace chaque dépense pour que personne ne se sente lésé."
        - generic [ref=e32]:
          - link "Démarrer gratuitement →" [ref=e33]:
            - /url: /login
          - link "▷ Voir une démo" [ref=e34]:
            - /url: "#features"
        - generic [ref=e35]:
          - generic [ref=e36]:
            - generic [ref=e37]: 📱
            - generic [ref=e38]:
              - strong [ref=e39]: App Store
              - text: iOS 15+
          - generic [ref=e40]:
            - generic [ref=e41]: 🤖
            - generic [ref=e42]:
              - strong [ref=e43]: Google Play
              - text: Android 9+
          - generic [ref=e44]:
            - generic [ref=e45]: 💬
            - generic [ref=e46]:
              - strong [ref=e47]: WhatsApp
              - text: Bot natif
        - generic [ref=e48]:
          - generic [ref=e49]: 🪙 Tontines
          - generic [ref=e50]: 💸 Dépenses
          - generic [ref=e51]: ↔ Swap
          - generic [ref=e52]: 📷 OCR
          - generic [ref=e53]: 🌍 Multi-devises
      - generic [ref=e54]:
        - generic [ref=e55]:
          - generic [ref=e56]: 🧾
          - generic [ref=e57]:
            - strong [ref=e58]: Receipt scanned
            - text: 67.40 EUR · split in 4 ✓
        - generic [ref=e59]:
          - generic [ref=e60]: 🪙
          - generic [ref=e61]:
            - strong [ref=e62]: Tontine
            - text: Tour 4/12 · 1 950 € collectés
        - generic [ref=e63]:
          - generic [ref=e64]: 💬
          - generic [ref=e65]:
            - strong [ref=e66]: Bot WhatsApp
            - text: « +25 € resto » → noté ✓
        - generic [ref=e69]:
          - generic [ref=e70]: Bonsoir,
          - generic [ref=e71]: Aïcha M.
          - generic [ref=e72]:
            - generic [ref=e74]: Solde global
            - generic [ref=e75]: + 247,50€
            - generic [ref=e76]:
              - generic [ref=e77]: ↗ On vous doit 412 €
              - generic [ref=e78]: ↘ Vous devez 165 €
          - generic [ref=e79]:
            - generic [ref=e80]:
              - generic [ref=e81]: 📷
              - text: Scanner
            - generic [ref=e82]:
              - generic [ref=e83]: ▣
              - text: QR
            - generic [ref=e84]:
              - generic [ref=e85]: 🪙
              - text: Tontine
            - generic [ref=e86]:
              - generic [ref=e87]: 💬
              - text: Chat
          - generic [ref=e88]: Mes groupes
          - generic [ref=e89]:
            - generic [ref=e90]: 🪙
            - generic [ref=e91]:
              - generic [ref=e92]: Tontine Bamiléké
              - generic [ref=e93]: 12 membres · Tour 4/12
            - generic [ref=e94]: +200 €
          - generic [ref=e95]:
            - generic [ref=e96]: 🏠
            - generic [ref=e97]:
              - generic [ref=e98]: Coloc Belleville
              - generic [ref=e99]: 4 membres
            - generic [ref=e100]: "-89 €"
    - generic [ref=e103]:
      - generic [ref=e104]: Notre histoire
      - heading "L'argent ne devrait jamais coûter une amitié" [level=2] [ref=e105]
    - generic [ref=e107]:
      - paragraph [ref=e108]: On a tous vécu cette soirée où le restaurant s'est transformé en tribunal. Cette tontine où plus personne ne savait qui avait payé. Ce voyage entre cousins qui a fini en groupe WhatsApp glacial.
      - generic [ref=e109]:
        - generic [ref=e110]:
          - generic [ref=e111]: 🌍
          - heading "Le problème" [level=3] [ref=e112]
          - paragraph [ref=e113]: L'inflation grignote tout. Le coût de la vie explose en Europe, au Cameroun, à Dakar, à Mumbai. Chaque euro compte — et chaque euro mal compté se transforme en silence, en rancœur, en relation cassée. La diaspora envoie de l'argent. Les familles s'organisent. Les amis voyagent. Mais l'outil n'existait pas pour suivre tout ça avec dignité.
        - generic [ref=e114]:
          - generic [ref=e115]: 💔
          - heading "La tension" [level=3] [ref=e116]
          - paragraph [ref=e117]: Les tableurs Excel sont incompréhensibles. WhatsApp ne calcule rien. Les apps occidentales ne comprennent ni les tontines, ni le franc CFA, ni les réalités d'une coloc à 6 entre étudiants à Paris. Et personne n'ose demander "tu me dois encore 47 €" sans avoir l'impression de salir le lien.
        - generic [ref=e118]:
          - generic [ref=e119]: 🕊
          - heading "La solution" [level=3] [ref=e120]
          - paragraph [ref=e121]: BMD. Un outil pensé pour ceux qui partagent vraiment leur argent — entre frères, sœurs, voisins, paroissiens, équipe de foot, copains de promo. Multi-devises (25+), multi-langues (20+), tontines, swap de dettes, OCR de tickets, bot WhatsApp. Sans drame, sans tracker, sans publicité. Pour que l'argent reste un détail, et l'amitié reste l'essentiel.
      - generic [ref=e122]:
        - paragraph [ref=e123]: « On compte chaque centime — pour ne plus jamais avoir à compter ses amis. »
        - link "Démarrer gratuitement →" [ref=e124]:
          - /url: /login
    - generic [ref=e126]:
      - generic [ref=e127]: ↘ Fait pour les communautés qui se font confiance
      - generic [ref=e128]:
        - generic [ref=e129]: 🪙 Tontines
        - generic [ref=e130]: 🏠 Colocs
        - generic [ref=e131]: ✈️ Voyages
        - generic [ref=e132]: 💍 Mariages
        - generic [ref=e133]: ⚽ Clubs
        - generic [ref=e134]: ⛪ Associations
    - generic [ref=e137]:
      - generic [ref=e138]: Écran 1
      - heading "🔓 Connexion · simplicité absolue" [level=2] [ref=e139]
    - generic [ref=e141]:
      - generic [ref=e146]: 🔒 www.backmesdo.com/login
      - generic [ref=e147]:
        - generic [ref=e148]:
          - generic [ref=e149]:
            - img [ref=e150]:
              - generic [ref=e156]: BMD
              - generic [ref=e157]: BACK·MES·DO
            - generic [ref=e159]: BMD·
          - generic [ref=e160]:
            - heading "Te reconnecter, en 30 secondes." [level=2] [ref=e161]:
              - text: Te reconnecter,
              - text: en
              - emphasis [ref=e162]: 30 secondes.
            - paragraph [ref=e163]: Aucun mot de passe. Aucune fioriture. Tu choisis ton numéro ou ton email, on t'envoie un code, et tu retrouves toute ton activité.
            - generic [ref=e164]:
              - generic [ref=e165]: ⚡
              - text: OTP en 1 étape · 0 mot de passe
            - generic [ref=e166]:
              - generic [ref=e167]: 📱
              - text: Téléphone OU email
            - generic [ref=e168]:
              - generic [ref=e169]: ✓
              - text: Tous les contacts vérifiés
        - generic [ref=e170]:
          - generic [ref=e171]:
            - generic [ref=e172]: Bon retour
            - generic [ref=e173]: Entre ton numéro · code par SMS ou WhatsApp
          - generic [ref=e174]:
            - generic [ref=e175]: Numéro de téléphone
            - generic [ref=e176]:
              - generic [ref=e177]: 🇫🇷 +33
              - generic [ref=e178]: 6 12 34 56 78
              - generic [ref=e179]: ✓ Reconnu
          - generic [ref=e180]:
            - generic [ref=e181]: 📱 SMS
            - generic [ref=e182]: 💬 WhatsApp
          - generic [ref=e183]: ou
          - generic [ref=e186]: Pas encore de compte ? Créer gratuitement
    - generic [ref=e189]:
      - generic [ref=e190]: Fonctionnalités
      - heading "Tout ce qu'il faut, rien qu'il faut" [level=2] [ref=e191]
    - generic [ref=e193]:
      - paragraph [ref=e194]: "BMD couvre toutes les situations où l'argent circule entre proches : tontines, colocs, voyages, mariages, paroisses, clubs, équipes. Voici, par grande thématique, ce que tu peux faire."
      - generic [ref=e195]:
        - tablist "Feature categories" [ref=e196]:
          - tab "👥 Groupes & rôles" [selected] [ref=e197] [cursor=pointer]:
            - generic [ref=e198]: 👥
            - generic [ref=e199]: Groupes & rôles
          - tab "💸 Dépenses partagées" [ref=e200] [cursor=pointer]:
            - generic [ref=e201]: 💸
            - generic [ref=e202]: Dépenses partagées
          - tab "🪙 Tontines & cycles" [ref=e203] [cursor=pointer]:
            - generic [ref=e204]: 🪙
            - generic [ref=e205]: Tontines & cycles
          - tab "↔ Soldes & règlements" [ref=e206] [cursor=pointer]:
            - generic [ref=e207]: ↔
            - generic [ref=e208]: Soldes & règlements
          - tab "💱 Multi-devises & paiements" [ref=e209] [cursor=pointer]:
            - generic [ref=e210]: 💱
            - generic [ref=e211]: Multi-devises & paiements
          - tab "🔔 Communication & rappels" [ref=e212] [cursor=pointer]:
            - generic [ref=e213]: 🔔
            - generic [ref=e214]: Communication & rappels
          - tab "🧠 Intelligence & automatisations" [ref=e215] [cursor=pointer]:
            - generic [ref=e216]: 🧠
            - generic [ref=e217]: Intelligence & automatisations
          - tab "🛡 Sécurité & vie privée" [ref=e218] [cursor=pointer]:
            - generic [ref=e219]: 🛡
            - generic [ref=e220]: Sécurité & vie privée
          - tab "📱 Plateformes & accessibilité" [ref=e221] [cursor=pointer]:
            - generic [ref=e222]: 📱
            - generic [ref=e223]: Plateformes & accessibilité
        - tabpanel [ref=e224]:
          - generic [ref=e225]:
            - generic [ref=e226]: 👥
            - heading "Groupes & rôles" [level=3] [ref=e227]
          - paragraph [ref=e228]: Crée le bon type de groupe en 30 secondes. Chaque type a sa logique (cycle pour la tontine, parts pour la coloc, planning pour le voyage…) et tout le monde sait qui fait quoi.
          - generic [ref=e229]:
            - generic [ref=e230]:
              - generic [ref=e231]:
                - generic [ref=e232]: 🎭
                - heading "6 types de groupes pré-pensés" [level=4] [ref=e233]
              - paragraph [ref=e234]: Tontine · Coloc · Voyage · Événement (mariage, soirée) · Club (foot, loisirs) · Paroisse / Association. Chaque type a ses raccourcis et son langage.
            - generic [ref=e235]:
              - generic [ref=e236]:
                - generic [ref=e237]: 🛡
                - heading "Rôles clairs" [level=4] [ref=e238]
              - paragraph [ref=e239]: Admin (peut éditer les règles), trésorier (suit les paiements), membre (saisit ses dépenses). Tout est traçable sans hiérarchie pesante.
            - generic [ref=e240]:
              - generic [ref=e241]:
                - generic [ref=e242]: ✉️
                - heading "Invitations multi-canaux" [level=4] [ref=e243]
              - paragraph [ref=e244]: Lien partageable, QR code, contact du téléphone (avec consentement explicite, jamais de scan global). Relance automatique J+2 et J+5 si pas accepté.
            - generic [ref=e245]:
              - generic [ref=e246]:
                - generic [ref=e247]: 🎨
                - heading "Charte par communauté" [level=4] [ref=e248]
              - paragraph [ref=e249]: Choisis l'ambiance visuelle de ton groupe (motif Bogolan, Wax, Kente…). Le groupe a sa personnalité.
    - generic [ref=e252]:
      - generic [ref=e253]: Programme commercial
      - heading "Parraine BMD, gagne sur chaque abonnement" [level=2] [ref=e254]
    - generic [ref=e256]:
      - paragraph [ref=e257]: BMD a un programme de parrainage simple, sans niveaux, sans pyramide. Tu recommandes BMD à ton entourage ou à des organisations (paroisses, clubs, associations) — chaque inscription qui devient payante te rapporte une commission, à vie tant que la personne reste cliente.
      - generic [ref=e258]:
        - generic [ref=e259]:
          - generic [ref=e260]:
            - generic [ref=e261]: 💰
            - generic [ref=e262]:
              - generic [ref=e263]: Commission directe
              - paragraph [ref=e264]: 20 % du montant payé chaque mois (ou en one-shot pour le forfait Événement) par les utilisateurs que tu as parrainés. Versé tous les 1ers du mois sur ton mode de paiement préféré.
          - generic [ref=e265]:
            - generic [ref=e266]: ♾️
            - generic [ref=e267]:
              - generic [ref=e268]: Récurrent à vie
              - paragraph [ref=e269]: Tant que ton filleul reste abonné, tu touches ta commission — pas de plafond, pas d'expiration. Une paroisse de 200 personnes que tu apportes peut générer plusieurs milliers d'euros par an.
          - generic [ref=e270]:
            - generic [ref=e271]: 📊
            - generic [ref=e272]:
              - generic [ref=e273]: Espace commercial dédié
              - paragraph [ref=e274]: "Tableau de bord clair : qui s'est inscrit grâce à toi, qui a basculé en payant, ton MRR, ton revenu prévu, ton historique de versements. Tout est traçable."
          - generic [ref=e275]:
            - generic [ref=e276]: 🎁
            - generic [ref=e277]:
              - generic [ref=e278]: Bonus pour le filleul
              - paragraph [ref=e279]: Ton filleul reçoit aussi une réduction (1 mois offert sur le plan annuel, ou 10 % de remise à vie). Tu offres un cadeau — pas une plaie.
        - generic [ref=e280]:
          - generic [ref=e281]:
            - generic [ref=e282]: "1"
            - generic [ref=e283]:
              - generic [ref=e284]: Active l'espace commercial
              - paragraph [ref=e285]: "Depuis ton profil → Espace commercial → « Activer ». Tu reçois un code de parrainage personnalisé (ex : BMD-AICHA-23) et un lien."
          - generic [ref=e286]:
            - generic [ref=e287]: "2"
            - generic [ref=e288]:
              - generic [ref=e289]: Partage à ton entourage
              - paragraph [ref=e290]: À ta paroisse, ton club de foot, tes copains diaspora… Le lien préremplit le code, donc ton filleul n'a rien à taper.
          - generic [ref=e291]:
            - generic [ref=e292]: "3"
            - generic [ref=e293]:
              - generic [ref=e294]: Suis tes inscriptions
              - paragraph [ref=e295]: Chaque clic, chaque inscription, chaque conversion en plan payant remonte en temps réel dans ton espace commercial. Pas d'attente.
          - generic [ref=e296]:
            - generic [ref=e297]: "4"
            - generic [ref=e298]:
              - generic [ref=e299]: Reçois ta commission
              - paragraph [ref=e300]: Versement automatique chaque 1er du mois (à partir de 25 €). Lydia, Wave, virement SEPA ou Mobile Money — au choix.
      - generic [ref=e301]:
        - link "Découvrir le programme →" [ref=e302]:
          - /url: /dashboard/affiliate
        - paragraph [ref=e303]: Pas de niveaux, pas de marketing pyramidal, pas de "matrices". Un seul niveau (toi → ton filleul), commission fixe et transparente. Conditions complètes dans l'espace commercial après activation.
    - generic [ref=e306]:
      - generic [ref=e307]: Démarrer
      - heading "En trois étapes" [level=2] [ref=e308]
    - generic [ref=e310]:
      - generic [ref=e311]:
        - generic [ref=e312]: "1"
        - heading "Crée ton groupe" [level=3] [ref=e313]
        - paragraph [ref=e314]: Tontine, coloc, voyage, mariage… choisis le type, la devise par défaut.
      - generic [ref=e315]:
        - generic [ref=e316]: "2"
        - heading "Invite tes proches" [level=3] [ref=e317]
        - paragraph [ref=e318]: Lien partageable, QR code, ou contacts du téléphone (avec ton consentement).
      - generic [ref=e319]:
        - generic [ref=e320]: "3"
        - heading "Vis sereinement" [level=3] [ref=e321]
        - paragraph [ref=e322]: Saisis dépenses, cotisations, swaps. BMD calcule les soldes et propose les règlements optimaux.
    - generic [ref=e325]:
      - generic [ref=e326]: Tarifs
      - heading "Gratuit pour la majorité" [level=2] [ref=e327]
    - generic [ref=e329]:
      - generic [ref=e330]:
        - text: 🌍 Tarifs adaptés à ta région —
        - strong [ref=e331]: Europe & Amérique du Nord
        - text: . Le prix sera prélevé dans la devise locale au moment du paiement.
      - generic [ref=e332]:
        - generic [ref=e333]:
          - generic [ref=e334]: Découverte
          - generic [ref=e335]: Gratuit
          - paragraph [ref=e336]: Pour démarrer · 2 groupes, 8 membres/groupe, OCR limité
          - list [ref=e337]:
            - listitem [ref=e338]: ✓2 groupes maximum
            - listitem [ref=e339]: ✓8 membres par groupe
            - listitem [ref=e340]: ✓5 scans IA / mois
          - link "Créer un compte" [ref=e341]:
            - /url: /login
        - generic [ref=e342]:
          - generic [ref=e343]: Perso
          - generic [ref=e344]: €3,99/mois
          - generic [ref=e345]: soit €39/an · économise 19%
          - paragraph [ref=e346]: Usage perso illimité · 50 scans IA + 20 voix / mois · sans pub · 27 devises
          - list [ref=e347]:
            - listitem [ref=e348]: ✓Groupes illimités
            - listitem [ref=e349]: ✓Membres illimités par groupe
            - listitem [ref=e350]: ✓50 scans IA / mois
            - listitem [ref=e351]: ✓Bot WhatsApp / SMS
            - listitem [ref=e352]: ✓Multi-devises avec FX live
            - listitem [ref=e353]: ✓Transferts de dettes
            - listitem [ref=e354]: ✓Export PDF + Excel
            - listitem [ref=e355]: ✓Sans publicité
          - link "Perso →" [ref=e356]:
            - /url: /dashboard/plans
        - generic [ref=e357]:
          - generic [ref=e358]: Famille
          - generic [ref=e359]: €5,99/mois
          - generic [ref=e360]: soit €69/an · économise 4%
          - paragraph [ref=e361]: Couple · foyer · jusqu'à 5 personnes · 200 scans + voix illimitée
          - list [ref=e362]:
            - listitem [ref=e363]: ✓Groupes illimités
            - listitem [ref=e364]: ✓Membres illimités par groupe
            - listitem [ref=e365]: ✓200 scans IA / mois
            - listitem [ref=e366]: ✓Bot WhatsApp / SMS
            - listitem [ref=e367]: ✓Multi-devises avec FX live
            - listitem [ref=e368]: ✓Transferts de dettes
            - listitem [ref=e369]: ✓Export PDF + Excel
            - listitem [ref=e370]: ✓Sans publicité
          - link "Famille →" [ref=e371]:
            - /url: /dashboard/plans
        - generic [ref=e372]:
          - generic [ref=e373]: Pro
          - generic [ref=e374]: €16,99/mois
          - generic [ref=e375]: soit €199/an · économise 2%
          - paragraph [ref=e376]: Asso · freelance · événement · 500 scans IA + file prioritaire + dashboard admin + export FEC compta
          - list [ref=e377]:
            - listitem [ref=e378]: ✓Groupes illimités
            - listitem [ref=e379]: ✓Membres illimités par groupe
            - listitem [ref=e380]: ✓500 scans IA / mois
            - listitem [ref=e381]: ✓Bot WhatsApp / SMS
            - listitem [ref=e382]: ✓Multi-devises avec FX live
            - listitem [ref=e383]: ✓Transferts de dettes
            - listitem [ref=e384]: ✓Export PDF + Excel
            - listitem [ref=e385]: ✓Support prioritaire
            - listitem [ref=e386]: ✓Sans publicité
          - link "Pro →" [ref=e387]:
            - /url: /dashboard/plans
        - generic [ref=e388]:
          - generic [ref=e389]: Perso à vie
          - generic [ref=e390]: €99/mois
          - paragraph [ref=e391]: Toutes les features Perso · à vie · paiement unique 99 €
          - list [ref=e392]:
            - listitem [ref=e393]: ✓Groupes illimités
            - listitem [ref=e394]: ✓Membres illimités par groupe
            - listitem [ref=e395]: ✓50 scans IA / mois
            - listitem [ref=e396]: ✓Bot WhatsApp / SMS
            - listitem [ref=e397]: ✓Multi-devises avec FX live
            - listitem [ref=e398]: ✓Transferts de dettes
            - listitem [ref=e399]: ✓Export PDF + Excel
            - listitem [ref=e400]: ✓Sans publicité
          - link "Perso à vie →" [ref=e401]:
            - /url: /dashboard/plans
    - generic [ref=e404]:
      - generic [ref=e405]: Questions
      - heading "Questions fréquentes" [level=2] [ref=e406]
    - generic [ref=e408]:
      - paragraph [ref=e409]: Les questions qu'on nous pose le plus, regroupées par thème. Si tu ne trouves pas ta réponse, écris-nous à hello@backmesdo.com — on répond sous 24h.
      - generic [ref=e410]:
        - tablist "FAQ topics" [ref=e411]:
          - tab "👋 Bases" [selected] [ref=e412] [cursor=pointer]:
            - generic [ref=e413]: 👋
            - generic [ref=e414]: Bases
          - tab "👥 Groupes & invitations" [ref=e415] [cursor=pointer]:
            - generic [ref=e416]: 👥
            - generic [ref=e417]: Groupes & invitations
          - tab "🪙 Tontines" [ref=e418] [cursor=pointer]:
            - generic [ref=e419]: 🪙
            - generic [ref=e420]: Tontines
          - tab "💱 Devises & paiements" [ref=e421] [cursor=pointer]:
            - generic [ref=e422]: 💱
            - generic [ref=e423]: Devises & paiements
          - tab "💸 Dépenses & justificatifs" [ref=e424] [cursor=pointer]:
            - generic [ref=e425]: 💸
            - generic [ref=e426]: Dépenses & justificatifs
          - tab "↔ Soldes & règlements" [ref=e427] [cursor=pointer]:
            - generic [ref=e428]: ↔
            - generic [ref=e429]: Soldes & règlements
          - tab "🛡 Vie privée & sécurité" [ref=e430] [cursor=pointer]:
            - generic [ref=e431]: 🛡
            - generic [ref=e432]: Vie privée & sécurité
          - tab "💳 Facturation & forfaits" [ref=e433] [cursor=pointer]:
            - generic [ref=e434]: 💳
            - generic [ref=e435]: Facturation & forfaits
        - tabpanel [ref=e436]:
          - heading "Bases" [level=3] [ref=e437]:
            - generic [ref=e438]: 👋
            - text: Bases
          - generic [ref=e439]:
            - group [ref=e440]:
              - generic "C'est quoi BMD, en une phrase ?" [ref=e441] [cursor=pointer]:
                - generic [ref=e442]: +
                - text: C'est quoi BMD, en une phrase ?
            - group [ref=e443]:
              - generic "BMD remplace-t-il ma banque ou Lydia ?" [ref=e444] [cursor=pointer]:
                - generic [ref=e445]: +
                - text: BMD remplace-t-il ma banque ou Lydia ?
            - group [ref=e446]:
              - generic "Combien ça coûte ?" [ref=e447] [cursor=pointer]:
                - generic [ref=e448]: +
                - text: Combien ça coûte ?
            - group [ref=e449]:
              - generic "Sur quels appareils ça marche ?" [ref=e450] [cursor=pointer]:
                - generic [ref=e451]: +
                - text: Sur quels appareils ça marche ?
            - group [ref=e452]:
              - generic "Faut-il que tous mes proches s'inscrivent ?" [ref=e453] [cursor=pointer]:
                - generic [ref=e454]: +
                - text: Faut-il que tous mes proches s'inscrivent ?
          - generic [ref=e455]:
            - text: 💬 Tu cherches une réponse plus précise ou tu veux nous parler d'un cas particulier ? Écris-nous à
            - link "hello@backmesdo.com" [ref=e456]:
              - /url: mailto:hello@backmesdo.com
            - text: — un humain te répond sous 24h.
    - generic [ref=e458]:
      - heading "Démarre maintenant" [level=2] [ref=e459]
      - paragraph [ref=e460]: Gratuit. Pas de carte bancaire. Inscription en moins d'une minute.
      - link "Créer mon compte →" [ref=e461]:
        - /url: /login
    - contentinfo [ref=e462]:
      - img [ref=e463]:
        - generic [ref=e469]: BMD
        - generic [ref=e470]: BACK·MES·DO
      - generic [ref=e472]: BMD·
      - generic [ref=e473]: L'argent partagé. L'amitié protégée.
      - link "Confidentialité" [ref=e475]:
        - /url: /legal/privacy
      - generic [ref=e476]: © 2026 BMD · Tous droits réservés.
    - complementary "Taux de change utilisés par BMD" [ref=e478]:
      - generic [ref=e479]:
        - img [ref=e480]
        - text: Taux BMD · 1 €
      - generic [ref=e485]:
        - link "USD 1.1709 ·" [ref=e486]:
          - /url: /dashboard/plans?country=US
          - generic [ref=e487]: 🇺🇸
          - generic [ref=e488]: USD
          - generic [ref=e489]: "1.1709"
          - generic [ref=e490]: ·
        - link "GBP 0.8665 ·" [ref=e491]:
          - /url: /dashboard/plans?country=GB
          - generic [ref=e492]: 🇬🇧
          - generic [ref=e493]: GBP
          - generic [ref=e494]: "0.8665"
          - generic [ref=e495]: ·
        - link "CHF 0.9154 ·" [ref=e496]:
          - /url: /dashboard/plans?country=CH
          - generic [ref=e497]: 🇨🇭
          - generic [ref=e498]: CHF
          - generic [ref=e499]: "0.9154"
          - generic [ref=e500]: ·
        - link "XAF 656 ·" [ref=e501]:
          - /url: /dashboard/plans?country=CM
          - generic [ref=e502]: 🌍
          - generic [ref=e503]: XAF
          - generic [ref=e504]: "656"
          - generic [ref=e505]: ·
        - link "XOF 656 ·" [ref=e506]:
          - /url: /dashboard/plans?country=SN
          - generic [ref=e507]: 🌍
          - generic [ref=e508]: XOF
          - generic [ref=e509]: "656"
          - generic [ref=e510]: ·
        - link "MAD 10.74 ·" [ref=e511]:
          - /url: /dashboard/plans?country=MA
          - generic [ref=e512]: 🇲🇦
          - generic [ref=e513]: MAD
          - generic [ref=e514]: "10.74"
          - generic [ref=e515]: ·
        - link "DZD 155 ·" [ref=e516]:
          - /url: /dashboard/plans?country=DZ
          - generic [ref=e517]: 🇩🇿
          - generic [ref=e518]: DZD
          - generic [ref=e519]: "155"
          - generic [ref=e520]: ·
        - link "TND 3.3804 ·" [ref=e521]:
          - /url: /dashboard/plans?country=TN
          - generic [ref=e522]: 🇹🇳
          - generic [ref=e523]: TND
          - generic [ref=e524]: "3.3804"
          - generic [ref=e525]: ·
        - link "NGN 1605 ·" [ref=e526]:
          - /url: /dashboard/plans?country=NG
          - generic [ref=e527]: 🇳🇬
          - generic [ref=e528]: NGN
          - generic [ref=e529]: "1605"
          - generic [ref=e530]: ·
        - link "KES 151 ·" [ref=e531]:
          - /url: /dashboard/plans?country=KE
          - generic [ref=e532]: 🇰🇪
          - generic [ref=e533]: KES
          - generic [ref=e534]: "151"
          - generic [ref=e535]: ·
        - link "GHS 13.23 ·" [ref=e536]:
          - /url: /dashboard/plans?country=GH
          - generic [ref=e537]: 🇬🇭
          - generic [ref=e538]: GHS
          - generic [ref=e539]: "13.23"
          - generic [ref=e540]: ·
        - link "ZAR 19.21 ·" [ref=e541]:
          - /url: /dashboard/plans?country=ZA
          - generic [ref=e542]: 🇿🇦
          - generic [ref=e543]: ZAR
          - generic [ref=e544]: "19.21"
          - generic [ref=e545]: ·
        - link "UGX 4390 ·" [ref=e546]:
          - /url: /dashboard/plans?country=UG
          - generic [ref=e547]: 🇺🇬
          - generic [ref=e548]: UGX
          - generic [ref=e549]: "4390"
          - generic [ref=e550]: ·
        - link "TZS 3046 ·" [ref=e551]:
          - /url: /dashboard/plans?country=TZ
          - generic [ref=e552]: 🇹🇿
          - generic [ref=e553]: TZS
          - generic [ref=e554]: "3046"
          - generic [ref=e555]: ·
        - link "CDF 2647 ·" [ref=e556]:
          - /url: /dashboard/plans?country=CD
          - generic [ref=e557]: 🇨🇩
          - generic [ref=e558]: CDF
          - generic [ref=e559]: "2647"
          - generic [ref=e560]: ·
        - link "CNY 7.9446 ·" [ref=e561]:
          - /url: /dashboard/plans?country=CN
          - generic [ref=e562]: 🇨🇳
          - generic [ref=e563]: CNY
          - generic [ref=e564]: "7.9446"
          - generic [ref=e565]: ·
        - link "USD 1.1709 ·" [ref=e566]:
          - /url: /dashboard/plans?country=US
          - generic [ref=e567]: 🇺🇸
          - generic [ref=e568]: USD
          - generic [ref=e569]: "1.1709"
          - generic [ref=e570]: ·
        - link "GBP 0.8665 ·" [ref=e571]:
          - /url: /dashboard/plans?country=GB
          - generic [ref=e572]: 🇬🇧
          - generic [ref=e573]: GBP
          - generic [ref=e574]: "0.8665"
          - generic [ref=e575]: ·
        - link "CHF 0.9154 ·" [ref=e576]:
          - /url: /dashboard/plans?country=CH
          - generic [ref=e577]: 🇨🇭
          - generic [ref=e578]: CHF
          - generic [ref=e579]: "0.9154"
          - generic [ref=e580]: ·
        - link "XAF 656 ·" [ref=e581]:
          - /url: /dashboard/plans?country=CM
          - generic [ref=e582]: 🌍
          - generic [ref=e583]: XAF
          - generic [ref=e584]: "656"
          - generic [ref=e585]: ·
        - link "XOF 656 ·" [ref=e586]:
          - /url: /dashboard/plans?country=SN
          - generic [ref=e587]: 🌍
          - generic [ref=e588]: XOF
          - generic [ref=e589]: "656"
          - generic [ref=e590]: ·
        - link "MAD 10.74 ·" [ref=e591]:
          - /url: /dashboard/plans?country=MA
          - generic [ref=e592]: 🇲🇦
          - generic [ref=e593]: MAD
          - generic [ref=e594]: "10.74"
          - generic [ref=e595]: ·
        - link "DZD 155 ·" [ref=e596]:
          - /url: /dashboard/plans?country=DZ
          - generic [ref=e597]: 🇩🇿
          - generic [ref=e598]: DZD
          - generic [ref=e599]: "155"
          - generic [ref=e600]: ·
        - link "TND 3.3804 ·" [ref=e601]:
          - /url: /dashboard/plans?country=TN
          - generic [ref=e602]: 🇹🇳
          - generic [ref=e603]: TND
          - generic [ref=e604]: "3.3804"
          - generic [ref=e605]: ·
        - link "NGN 1605 ·" [ref=e606]:
          - /url: /dashboard/plans?country=NG
          - generic [ref=e607]: 🇳🇬
          - generic [ref=e608]: NGN
          - generic [ref=e609]: "1605"
          - generic [ref=e610]: ·
        - link "KES 151 ·" [ref=e611]:
          - /url: /dashboard/plans?country=KE
          - generic [ref=e612]: 🇰🇪
          - generic [ref=e613]: KES
          - generic [ref=e614]: "151"
          - generic [ref=e615]: ·
        - link "GHS 13.23 ·" [ref=e616]:
          - /url: /dashboard/plans?country=GH
          - generic [ref=e617]: 🇬🇭
          - generic [ref=e618]: GHS
          - generic [ref=e619]: "13.23"
          - generic [ref=e620]: ·
        - link "ZAR 19.21 ·" [ref=e621]:
          - /url: /dashboard/plans?country=ZA
          - generic [ref=e622]: 🇿🇦
          - generic [ref=e623]: ZAR
          - generic [ref=e624]: "19.21"
          - generic [ref=e625]: ·
        - link "UGX 4390 ·" [ref=e626]:
          - /url: /dashboard/plans?country=UG
          - generic [ref=e627]: 🇺🇬
          - generic [ref=e628]: UGX
          - generic [ref=e629]: "4390"
          - generic [ref=e630]: ·
        - link "TZS 3046 ·" [ref=e631]:
          - /url: /dashboard/plans?country=TZ
          - generic [ref=e632]: 🇹🇿
          - generic [ref=e633]: TZS
          - generic [ref=e634]: "3046"
          - generic [ref=e635]: ·
        - link "CDF 2647 ·" [ref=e636]:
          - /url: /dashboard/plans?country=CD
          - generic [ref=e637]: 🇨🇩
          - generic [ref=e638]: CDF
          - generic [ref=e639]: "2647"
          - generic [ref=e640]: ·
        - link "CNY 7.9446 ·" [ref=e641]:
          - /url: /dashboard/plans?country=CN
          - generic [ref=e642]: 🇨🇳
          - generic [ref=e643]: CNY
          - generic [ref=e644]: "7.9446"
          - generic [ref=e645]: ·
  - region "Notifications"
  - button "Open Next.js Dev Tools" [ref=e651] [cursor=pointer]:
    - img [ref=e652]
  - alert [ref=e657]
  - generic "Build dev — tape 🧹 pour clear tout" [ref=e658]:
    - generic [ref=e659]: DEV · 13:31:59
    - button "Force fresh (clear all caches and reload)" [ref=e660] [cursor=pointer]: 🧹
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | /**
  4  |  * Tests E2E vitrine publique — pas besoin d'auth.
  5  |  *
  6  |  * Couvre :
  7  |  *  - La page d'accueil charge sans erreur sur desktop ET mobile
  8  |  *  - Le sticky header et le FX ticker bottom sont présents
  9  |  *  - Le sélecteur de langue switche les libellés
  10 |  *  - Le CTA principal mène vers /login
  11 |  */
  12 | 
  13 | test.describe("Vitrine publique", () => {
  14 |   test("Desktop : la page d'accueil charge avec sticky nav + ticker", async ({
  15 |     page,
  16 |     browserName,
  17 |   }, testInfo) => {
  18 |     // Skip mobile viewport ici — la vitrine bascule sur MobileWelcome
  19 |     test.skip(
  20 |       testInfo.project.name.startsWith("mobile"),
  21 |       "Mobile testé séparément",
  22 |     );
  23 | 
  24 |     await page.goto("/");
  25 |     // Logo BMD visible
  26 |     await expect(page.getByRole("link", { name: /BMD/i }).first()).toBeVisible();
  27 |     // Tarifs cliquable dans la nav
> 28 |     await expect(page.getByRole("link", { name: /tarifs|pricing/i })).toBeVisible();
     |                                                                       ^ Error: expect(locator).toBeVisible() failed
  29 |     // FX ticker présent en bas (peut être hors viewport — on vérifie l'existence)
  30 |     await expect(
  31 |       page.getByRole("complementary", { name: /taux de change/i }),
  32 |     ).toBeAttached();
  33 |   });
  34 | 
  35 |   test("Mobile : la home affiche le médaillon BMD + 2 CTA", async ({
  36 |     page,
  37 |   }, testInfo) => {
  38 |     test.skip(
  39 |       !testInfo.project.name.startsWith("mobile"),
  40 |       "Test spécifique mobile",
  41 |     );
  42 |     await page.goto("/");
  43 |     // Le gros logo BMD médaillon
  44 |     await expect(page.getByRole("link", { name: /accueil|home/i }).first()).toBeAttached();
  45 |     // CTA "Se connecter"
  46 |     await expect(
  47 |       page.getByRole("link", { name: /se connecter|login|sign in/i }).first(),
  48 |     ).toBeVisible();
  49 |   });
  50 | 
  51 |   test("Le bouton 'Se connecter' mène à /login", async ({ page }) => {
  52 |     await page.goto("/");
  53 |     const loginLink = page
  54 |       .getByRole("link", { name: /se connecter|login|sign in/i })
  55 |       .first();
  56 |     await loginLink.click();
  57 |     await expect(page).toHaveURL(/\/login/);
  58 |     // Logo BMD visible sur la page login
  59 |     await expect(page.locator("img[alt='BMD']").first()).toBeVisible();
  60 |   });
  61 | });
  62 | 
```