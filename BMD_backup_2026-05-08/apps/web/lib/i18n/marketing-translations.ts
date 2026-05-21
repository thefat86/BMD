/**
 * Traductions du site vitrine BMD.
 *
 * On utilise un système inline (pas next-intl) pour rester léger et éviter
 * d'ajouter une dépendance lourde + fichiers de config. Les chaînes sont
 * organisées par section pour faciliter la traduction par un humain.
 *
 * Langues supportées :
 *  - fr : français (langue de référence)
 *  - en : anglais
 *  - es : espagnol (Amérique latine)
 *  - pt : portugais (lusophonie africaine)
 *  - ar : arabe (Afrique du Nord)
 *  - sw : swahili (Afrique de l'Est)
 *
 * Pour ajouter une langue : copier la structure d'un objet existant,
 * traduire chaque chaîne, ajouter la clé dans `LOCALES`.
 */

export const LOCALES = [
  // Principales (toujours visibles dans le picker)
  "fr",
  "en",
  // Européennes (groupe repliable)
  "es",
  "pt",
  "de",
  "it",
  "lb",
  "ru",
  // Asiatiques (groupe repliable)
  "ja",
  "ko",
  "hi",
  "zh",
  // Arabes (groupe repliable)
  "ar",
  // Africaines (groupe repliable)
  "sw",
  "wo",
  "am",
  "ln",
  "pcm",
  "ha",
  "yo",
  "om",
  "ig",
  "ff",
  "zu",
  "ak",
  "fr-cm",
  "fr-ci",
] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_NAMES: Record<Locale, string> = {
  fr: "Français",
  en: "English",
  es: "Español",
  pt: "Português",
  de: "Deutsch",
  it: "Italiano",
  lb: "Lëtzebuergesch",
  ru: "Русский",
  ja: "日本語",
  ko: "한국어",
  hi: "हिन्दी",
  ar: "العربية",
  zh: "中文",
  sw: "Kiswahili",
  wo: "Wolof",
  am: "አማርኛ",
  ln: "Lingála",
  pcm: "Pidgin",
  ha: "Hausa",
  yo: "Yorùbá",
  om: "Afaan Oromoo",
  ig: "Igbo",
  ff: "Fulfulde",
  zu: "isiZulu",
  ak: "Akan / Twi",
  "fr-cm": "Francanglais",
  "fr-ci": "Nouchi",
};

export const LOCALE_FLAGS: Record<Locale, string> = {
  fr: "🇫🇷",
  en: "🇬🇧",
  es: "🇪🇸",
  pt: "🇵🇹",
  de: "🇩🇪",
  it: "🇮🇹",
  lb: "🇱🇺",
  ru: "🇷🇺",
  ja: "🇯🇵",
  ko: "🇰🇷",
  hi: "🇮🇳",
  ar: "🇲🇦",
  zh: "🇨🇳",
  sw: "🇰🇪",
  wo: "🇸🇳",
  am: "🇪🇹",
  ln: "🇨🇩",
  pcm: "🌍",
  ha: "🇳🇬",
  yo: "🇳🇬",
  om: "🇪🇹",
  ig: "🇳🇬",
  ff: "🇸🇳",
  zu: "🇿🇦",
  ak: "🇬🇭",
  "fr-cm": "🇨🇲",
  "fr-ci": "🇨🇮",
};

/**
 * Groupements régionaux pour le LangPicker (V19).
 * - MAIN_LOCALES : toujours visibles en haut du menu
 * - les autres : repliables, libellés via langPicker.{groupe}
 */
export const MAIN_LOCALES: Locale[] = ["fr", "en"];
export const EUROPEAN_LOCALES: Locale[] = ["es", "pt", "de", "it", "lb", "ru"];
export const ASIAN_LOCALES: Locale[] = ["ja", "ko", "hi", "zh"];
export const ARABIC_LOCALES: Locale[] = ["ar"];
/**
 * Langues africaines : nationales/régionales + pidgins/argots urbains
 * spécifiques (Francanglais Cameroun, Nouchi Côte d'Ivoire).
 */
export const AFRICAN_LOCALES: Locale[] = [
  "sw",
  "wo",
  "am",
  "ln",
  "pcm",
  "ha",
  "yo",
  "om",
  "ig",
  "ff",
  "zu",
  "ak",
  "fr-cm",
  "fr-ci",
];

export interface MarketingStrings {
  meta: { title: string; description: string };
  nav: {
    features: string;
    howItWorks: string;
    pricing: string;
    login: string;
    signUp: string;
    /** Onglet "Notre histoire" — V16, optionnel pour rétrocompat */
    story?: string;
  };
  /**
   * Section storytelling (V16) — pourquoi BMD existe, problématique
   * (inflation, drama d'argent, diaspora), solution.
   *
   * Optionnelle : si une locale ne l'a pas, le 1er onglet de la nav
   * disparaît proprement plutôt que d'afficher du FR.
   */
  story?: {
    kicker: string;
    title: string;
    /** Punchline héro (1 phrase forte) */
    punchline: string;
    /** 3 chapitres : problème → tension → solution */
    chapters: Array<{
      icon: string;
      title: string;
      body: string;
    }>;
    /** Citation/manifesto en bas de section */
    manifesto: string;
    cta: string;
  };
  /** Libellés des sous-groupes dans le LangPicker (V19) */
  langPicker?: {
    /** Groupe principal (FR + EN) — toujours visible en haut */
    main: string;
    /** Groupe européen (ES, PT, DE, IT, LB, RU) — repliable */
    europeanGroup?: string;
    /** Groupe asiatique (JA, KO, HI, ZH) — repliable */
    asianGroup?: string;
    /** Groupe arabe (AR) — repliable */
    arabicGroup?: string;
    /** Groupe africain (SW, WO, AM, LN, PCM, HA, YO, OM, IG, FF, ZU, AK, fr-cm, fr-ci) */
    africanGroup: string;
  };
  hero: {
    tagline: string;
    headline: string;
    subhead: string;
    ctaPrimary: string;
    ctaSecondary: string;
  };
  features: {
    title: string;
    items: Array<{ icon: string; title: string; body: string }>;
  };
  /**
   * Version enrichie & catégorisée des fonctionnalités. Optionnelle :
   * si présente, le site vitrine l'utilise à la place de `features.items`
   * pour offrir une vue détaillée et thématique. Sinon, fallback sur la
   * liste plate.
   */
  featuresLong?: {
    intro: string;
    categories: Array<{
      key: string;
      icon: string;
      label: string;
      pitch: string;
      items: Array<{ icon?: string; title: string; body: string }>;
    }>;
  };
  /**
   * Programme de parrainage (sales / partenariat). Optionnel par locale.
   */
  referral?: {
    kicker: string;
    title: string;
    intro: string;
    benefits: Array<{ icon: string; title: string; body: string }>;
    howItWorks: Array<{ num: string; title: string; body: string }>;
    cta: { label: string; href: string };
    smallPrint: string;
  };
  howItWorks: {
    title: string;
    steps: Array<{ num: string; title: string; body: string }>;
  };
  pricing: {
    title: string;
    free: { name: string; price: string; features: string[] };
    pro: { name: string; price: string; features: string[]; cta: string };
  };
  faq: {
    title: string;
    items: Array<{ q: string; a: string }>;
  };
  /**
   * FAQ enrichie & regroupée par thèmes. Optionnelle :
   * si présente, le site vitrine l'affiche à la place de `faq.items`.
   */
  faqLong?: {
    intro: string;
    categories: Array<{
      key: string;
      icon: string;
      label: string;
      items: Array<{ q: string; a: string }>;
    }>;
    contactNudge: string;
  };
  cta: {
    headline: string;
    body: string;
    button: string;
  };
  footer: {
    tagline: string;
    rights: string;
    privacy: string;
    terms: string;
    contact: string;
  };
}

export const T: Record<Locale, MarketingStrings> = {
  fr: {
    meta: {
      title: "BMD · L'argent partagé sans drama",
      description:
        "BMD aide la diaspora africaine à gérer tontines, colocs, voyages et événements en groupe — transparence, fiabilité, équité.",
    },
    nav: {
      story: "Notre histoire",
      features: "Fonctionnalités",
      howItWorks: "Comment ça marche",
      pricing: "Tarifs",
      login: "Se connecter",
      signUp: "Créer un compte",
    },
    langPicker: {
      main: "Langues principales",
      europeanGroup: "Langues européennes",
      asianGroup: "Langues asiatiques",
      arabicGroup: "Langues arabes",
      africanGroup: "Langues africaines",
    },
    story: {
      kicker: "Notre histoire",
      title: "L'argent ne devrait jamais coûter une amitié",
      punchline:
        "On a tous vécu cette soirée où le restaurant s'est transformé en tribunal. Cette tontine où plus personne ne savait qui avait payé. Ce voyage entre cousins qui a fini en groupe WhatsApp glacial.",
      chapters: [
        {
          icon: "🌍",
          title: "Le problème",
          body:
            "L'inflation grignote tout. Le coût de la vie explose en Europe, au Cameroun, à Dakar, à Mumbai. Chaque euro compte — et chaque euro mal compté se transforme en silence, en rancœur, en relation cassée. La diaspora envoie de l'argent. Les familles s'organisent. Les amis voyagent. Mais l'outil n'existait pas pour suivre tout ça avec dignité.",
        },
        {
          icon: "💔",
          title: "La tension",
          body:
            "Les tableurs Excel sont incompréhensibles. WhatsApp ne calcule rien. Les apps occidentales ne comprennent ni les tontines, ni le franc CFA, ni les réalités d'une coloc à 6 entre étudiants à Paris. Et personne n'ose demander \"tu me dois encore 47 €\" sans avoir l'impression de salir le lien.",
        },
        {
          icon: "🕊",
          title: "La solution",
          body:
            "BMD. Un outil pensé pour ceux qui partagent vraiment leur argent — entre frères, sœurs, voisins, paroissiens, équipe de foot, copains de promo. Multi-devises (25+), multi-langues (20+), tontines, swap de dettes, OCR de tickets, bot WhatsApp. Sans drame, sans tracker, sans publicité. Pour que l'argent reste un détail, et l'amitié reste l'essentiel.",
        },
      ],
      manifesto:
        "« On compte chaque centime — pour ne plus jamais avoir à compter ses amis. »",
      cta: "Démarrer gratuitement",
    },
    hero: {
      tagline: "Back Mes Do · Diaspora",
      headline: "L'argent partagé. L'amitié protégée.",
      subhead:
        "Tontines, colocs, voyages, mariages, paroisses, clubs : BMD calcule, simplifie et trace chaque dépense pour que personne ne se sente lésé.",
      ctaPrimary: "Démarrer gratuitement",
      ctaSecondary: "Voir une démo",
    },
    features: {
      title: "Tout ce qu'il faut, rien qu'il faut",
      items: [
        {
          icon: "🪙",
          title: "Tontines complètes",
          body: "Cycle, ordre des bénéficiaires, dates ajustables, accusés de réception, historique sur des années.",
        },
        {
          icon: "💸",
          title: "Dépenses partagées",
          body: "Égal, parts ou pourcentages. Justificatifs photo/PDF visibles par tous, modifiables seulement par le créateur.",
        },
        {
          icon: "↔",
          title: "Swap & transfert de dette",
          body: "Compense ou transfère une dette à un autre membre, avec validation des trois parties impliquées.",
        },
        {
          icon: "🔔",
          title: "Notifications complètes",
          body: "Chaque événement qui te concerne déclenche une notif. Anti-spam : pas d'auto-notification, désactivation possible.",
        },
        {
          icon: "📷",
          title: "OCR de tickets",
          body: "Scanne ta photo de ticket : montant, marchand, date détectés automatiquement.",
        },
        {
          icon: "🛡",
          title: "RGPD & vie privée",
          body: "Aucune lecture en bulk de carnets d'adresses. Consentement explicite, droit à l'oubli respecté.",
        },
      ],
    },
    howItWorks: {
      title: "En trois étapes",
      steps: [
        {
          num: "1",
          title: "Crée ton groupe",
          body: "Tontine, coloc, voyage, mariage… choisis le type, la devise par défaut.",
        },
        {
          num: "2",
          title: "Invite tes proches",
          body: "Lien partageable, QR code, ou contacts du téléphone (avec ton consentement).",
        },
        {
          num: "3",
          title: "Vis sereinement",
          body: "Saisis dépenses, cotisations, swaps. BMD calcule les soldes et propose les règlements optimaux.",
        },
      ],
    },
    pricing: {
      title: "Gratuit pour la majorité",
      free: {
        name: "Gratuit",
        price: "0 €",
        features: [
          "Jusqu'à 3 groupes actifs",
          "Tontines, dépenses, swaps illimités",
          "Justificatifs PDF/photos",
          "Notifications complètes",
        ],
      },
      pro: {
        name: "Pro",
        price: "4,99 € / mois",
        features: [
          "Groupes illimités",
          "Export comptable détaillé",
          "Historique sur 10 ans",
          "Support prioritaire",
        ],
        cta: "Bientôt",
      },
    },
    faq: {
      title: "Questions fréquentes",
      items: [
        {
          q: "BMD remplace-t-il une banque ?",
          a: "Non. BMD est un outil de gestion partagée. Les paiements se font via tes moyens habituels (Lydia, Wave, Mobile Money, virement). BMD enregistre, calcule, simplifie.",
        },
        {
          q: "Mes données sont-elles en sécurité ?",
          a: "Oui. Nous chiffrons les communications, ne lisons jamais ton carnet d'adresses sans ton consentement explicite, et tu peux exporter ou supprimer tes données à tout moment (RGPD).",
        },
        {
          q: "Comment fonctionne une tontine sur BMD ?",
          a: "Tu crées le groupe, fixes le montant et la fréquence (mensuelle, bimensuelle, hebdo). À chaque tour, le bénéficiaire choisit la date exacte dans son mois et tous accusent réception. Tu peux suivre l'historique sur plusieurs années.",
        },
      ],
    },
    // ============================================================
    // VERSIONS ENRICHIES (FR — locale principale BMD)
    // ============================================================
    featuresLong: {
      intro:
        "BMD couvre toutes les situations où l'argent circule entre proches : tontines, colocs, voyages, mariages, paroisses, clubs, équipes. Voici, par grande thématique, ce que tu peux faire.",
      categories: [
        {
          key: "groups",
          icon: "👥",
          label: "Groupes & rôles",
          pitch:
            "Crée le bon type de groupe en 30 secondes. Chaque type a sa logique (cycle pour la tontine, parts pour la coloc, planning pour le voyage…) et tout le monde sait qui fait quoi.",
          items: [
            {
              icon: "🎭",
              title: "6 types de groupes pré-pensés",
              body: "Tontine · Coloc · Voyage · Événement (mariage, soirée) · Club (foot, loisirs) · Paroisse / Association. Chaque type a ses raccourcis et son langage.",
            },
            {
              icon: "🛡",
              title: "Rôles clairs",
              body: "Admin (peut éditer les règles), trésorier (suit les paiements), membre (saisit ses dépenses). Tout est traçable sans hiérarchie pesante.",
            },
            {
              icon: "✉️",
              title: "Invitations multi-canaux",
              body: "Lien partageable, QR code, contact du téléphone (avec consentement explicite, jamais de scan global). Relance automatique J+2 et J+5 si pas accepté.",
            },
            {
              icon: "🎨",
              title: "Charte par communauté",
              body: "Choisis l'ambiance visuelle de ton groupe (motif Bogolan, Wax, Kente…). Le groupe a sa personnalité.",
            },
          ],
        },
        {
          key: "expenses",
          icon: "💸",
          label: "Dépenses partagées",
          pitch:
            "Saisir une dépense doit prendre 5 secondes. BMD propose tout : la photo du ticket, la suggestion de partage, l'anomalie détectée, la conversion automatique de devise.",
          items: [
            {
              icon: "📷",
              title: "OCR de tickets (photo, PDF, scan)",
              body: "Prends une photo du ticket de caisse : montant, marchand et date sont détectés automatiquement. Trois moteurs (Mindee, GPT-4o Vision, Tesseract) — fallback transparent.",
            },
            {
              icon: "⚖️",
              title: "Partage : égal · parts · pourcentages",
              body: "Mode égalitaire en 1 clic, ou parts personnalisées par membre, ou pourcentages exacts. Idéal pour les colocs où chacun a une chambre différente.",
            },
            {
              icon: "🤖",
              title: "Suggestion IA du bon partage",
              body: "Au fur et à mesure que tu saisis, BMD apprend tes habitudes (\"resto = toujours partage égal entre 4 personnes\") et propose le bon mode automatiquement.",
            },
            {
              icon: "📜",
              title: "Règles par catégorie",
              body: "« Toutes les courses Carrefour vont dans Coloc Belleville » : crée la règle une fois, BMD applique pour toi à chaque scan ou import.",
            },
            {
              icon: "🚨",
              title: "Détection d'anomalies",
              body: "Doublons, montants atypiques, dépenses qui sortent de la fourchette habituelle : un badge te prévient avant que tout le monde valide.",
            },
            {
              icon: "🏦",
              title: "Import bancaire CSV",
              body: "Importe le relevé de ton compte (BNP, Crédit Agricole, Wave, Orange Money…) en CSV. BMD propose la catégorisation et la répartition automatiquement.",
            },
          ],
        },
        {
          key: "tontines",
          icon: "🪙",
          label: "Tontines & cycles",
          pitch:
            "La tontine bamiléké, le hui chinois, la susu antillaise — tous les modèles d'épargne tournante sont supportés, avec validation à 4 yeux et historique inaltérable.",
          items: [
            {
              icon: "🔄",
              title: "Cycle complet automatisé",
              body: "Définis le montant, la fréquence (hebdo · bimensuelle · mensuelle) et l'ordre des bénéficiaires. À chaque tour, le bénéficiaire choisit la date exacte dans son mois.",
            },
            {
              icon: "🤝",
              title: "Double validation des cotisations",
              body: "Le payeur déclare, le trésorier confirme. Personne ne peut dire « j'ai payé » sans la trace de l'autre côté. Anti-malentendu.",
            },
            {
              icon: "📅",
              title: "Vue calendrier",
              body: "Tous les tours futurs s'affichent visuellement. Tu vois en un clin d'œil qui touche quoi et quand pendant les 12 prochains mois.",
            },
            {
              icon: "🎯",
              title: "Enchères (Hui)",
              body: "Pour les communautés chinoises : à chaque tour, mise pour avancer son passage. BMD calcule l'intérêt effectif et le partage entre les autres membres.",
            },
            {
              icon: "📚",
              title: "Historique sur plusieurs années",
              body: "Audit log immuable : 5 ans minimum d'historique conservés (obligation comptable). Export complet à tout moment.",
            },
          ],
        },
        {
          key: "settle",
          icon: "↔",
          label: "Soldes & règlements",
          pitch:
            "BMD calcule pour toi le minimum de transactions à faire pour solder le groupe. Plus de tableurs, plus de \"qui doit quoi à qui\".",
          items: [
            {
              icon: "🧮",
              title: "Soldes en temps réel",
              body: "Solde global multi-devises, et solde par groupe en devise locale. Tout est recalculé instantanément à chaque dépense ou cotisation.",
            },
            {
              icon: "🎯",
              title: "Règlement optimal",
              body: "Algorithme \"minimum cash flow\" : si Aïcha doit 30 € à Mehdi qui doit 30 € à David, BMD propose qu'Aïcha paie directement David. 1 transaction au lieu de 2.",
            },
            {
              icon: "🔁",
              title: "Swap & transfert de dette",
              body: "Compense ou transfère une dette à un autre membre. Validation à 3 (créditeur + débiteur original + nouveau débiteur) pour éviter toute fraude.",
            },
            {
              icon: "🔗",
              title: "Liens de paiement à usage unique",
              body: "Génère un lien sécurisé pour qu'un membre te règle via Lydia, Wave, virement. Le lien expire après usage et est tracé dans l'audit log.",
            },
          ],
        },
        {
          key: "money",
          icon: "💱",
          label: "Multi-devises & paiements",
          pitch:
            "BMD est conçu pour la diaspora. 25+ devises supportées, taux de change rafraîchis chaque heure, conversions transparentes.",
          items: [
            {
              icon: "🌍",
              title: "25+ devises avec taux live",
              body: "Euro, dollar, livre, franc CFA (XAF/XOF), naira, dirham, rand, real, shilling, peso… Open Exchange Rates ou exchangerate.host en fallback.",
            },
            {
              icon: "💳",
              title: "Compatible avec tes outils habituels",
              body: "Lydia, Wave, Orange Money, MTN MoMo, Wise, virement SEPA, PayPal. BMD ne remplace pas — il enregistre la transaction quand tu paies par ton canal préféré.",
            },
            {
              icon: "📈",
              title: "Conversion en temps réel",
              body: "Une dépense en XAF sera affichée à chaque membre dans SA devise par défaut, en temps réel, avec le taux du jour.",
            },
            {
              icon: "🧾",
              title: "Reçus fiscaux téléchargeables",
              body: "Pour les paroisses, associations, clubs sportifs : génère des reçus fiscaux PDF avec ton n° SIRET et la mention RUP.",
            },
          ],
        },
        {
          key: "comms",
          icon: "🔔",
          label: "Communication & rappels",
          pitch:
            "Tout est piloté par notification — anti-spam par construction, jamais d'auto-notification, et tu choisis le ton des rappels.",
          items: [
            {
              icon: "🛎",
              title: "Notifications fines",
              body: "Tu reçois UNIQUEMENT ce qui te concerne (dépense partagée avec toi, dette à régler, tour de tontine arrivant). Jamais de \"X a fait quelque chose dans ton groupe\".",
            },
            {
              icon: "📅",
              title: "Résumé hebdomadaire",
              body: "Chaque dimanche soir, un récap clair : ce qu'il s'est passé dans tes groupes, ton solde, tes dettes en cours. En 30 secondes tu sais où tu en es.",
            },
            {
              icon: "💬",
              title: "Bot WhatsApp natif",
              body: "Ajoute des dépenses en envoyant un message vocal ou texte (« +25 € resto au Lagon »). BMD reconnaît, range, demande confirmation.",
            },
            {
              icon: "😊",
              title: "Tonalité au choix",
              body: "Sympa, ferme, humour, pro : choisis le ton des rappels que BMD envoie aux retardataires en ton nom. Diplomatie auto.",
            },
            {
              icon: "🌙",
              title: "Mode Ne pas déranger par groupe",
              body: "Tu peux silence un groupe pour 1h, 24h ou jusqu'à demain matin sans quitter la conversation. Idéal pour le voyage où tout le monde post à 4h du mat'.",
            },
          ],
        },
        {
          key: "intelligence",
          icon: "🧠",
          label: "Intelligence & automatisations",
          pitch:
            "BMD utilise l'IA pour faire disparaître la paperasse, pas pour spammer. Confidentielle, locale ou via fournisseurs RGPD-compatibles.",
          items: [
            {
              icon: "🎙",
              title: "Saisie vocale Whisper",
              body: "Vocal WhatsApp ou directement dans l'app : « j'ai payé 47 euros au Carrefour de Belleville pour les courses de la coloc ». BMD transcrit, comprend, range.",
            },
            {
              icon: "📊",
              title: "Statistiques & insights",
              body: "Voir l'évolution mensuelle de tes dépenses, ta répartition par catégorie, ta dépense moyenne par groupe. Sans tracker ni publicité.",
            },
            {
              icon: "🌐",
              title: "Auto-traduction des contenus admin",
              body: "Les paroisses et associations ont souvent des messages multilingues. BMD traduit automatiquement (GPT-4o-mini) avec révision manuelle possible.",
            },
            {
              icon: "🔮",
              title: "Anomalies & doublons",
              body: "Une dépense de 1 200 € quand tu fais d'habitude 50 € ? Un même resto facturé 2 fois en 1 minute ? BMD prévient avant que ça crée du drama.",
            },
          ],
        },
        {
          key: "trust",
          icon: "🛡",
          label: "Sécurité & vie privée",
          pitch:
            "Conçu RGPD by design. Tes contacts ne sont jamais lus en bulk. Aucun mot de passe, aucun cookie de tracking, aucun pixel publicitaire.",
          items: [
            {
              icon: "🔑",
              title: "Connexion sans mot de passe",
              body: "OTP par SMS, email ou WhatsApp. Passkeys (Face ID / Touch ID / Windows Hello) pour les habitués. SSO Google et Apple en option.",
            },
            {
              icon: "🚫",
              title: "Zéro lecture du carnet",
              body: "BMD ne lit JAMAIS ton répertoire en entier. Le picker système te montre tes contacts, et seuls ceux que tu sélectionnes explicitement sont transmis.",
            },
            {
              icon: "📜",
              title: "Audit log immuable",
              body: "Toutes les opérations sensibles (admin, paiements, swaps) sont append-only, signées, conservées 5 ans. Anti-falsification.",
            },
            {
              icon: "🇪🇺",
              title: "RGPD complet",
              body: "Export JSON/CSV de toutes tes données, suppression à la demande sous 30 jours, registre des sous-traitants public, DPO joignable.",
            },
            {
              icon: "🌐",
              title: "Hébergement EU",
              body: "Bases de données et serveurs en région Europe (Vercel EU, Railway Frankfurt). Aucun transfert hors UE sans Standard Contractual Clauses.",
            },
          ],
        },
        {
          key: "platform",
          icon: "📱",
          label: "Plateformes & accessibilité",
          pitch:
            "Une vraie app native sur téléphone, un vrai portail web sur ordinateur. Et un bot WhatsApp pour ceux qui préfèrent rester dans la conversation.",
          items: [
            {
              icon: "📲",
              title: "PWA installable",
              body: "Sur iPhone, Android ou desktop : installe BMD comme une vraie app, fonctionne hors-ligne pour la consultation, raccourci sur ton écran d'accueil.",
            },
            {
              icon: "💬",
              title: "Bot WhatsApp",
              body: "Connecte ton numéro WhatsApp en 30s : ajout de dépense vocal/texte, consultation du solde, validation des cotisations, sans quitter WhatsApp.",
            },
            {
              icon: "🌍",
              title: "Multilingue (FR · EN · ES · PT · AR · SW)",
              body: "L'interface s'adapte à ta langue préférée. Arabe et autres langues RTL sont gérées nativement (alignement, picker calendrier, dates).",
            },
            {
              icon: "♿",
              title: "Accessibilité WCAG 2.1 AA",
              body: "Contraste validé, navigation clavier, support lecteur d'écran, mode sombre/clair, taille de police respectée. Aucun de tes proches n'est exclu.",
            },
            {
              icon: "🌗",
              title: "Mode clair / mode sombre",
              body: "Bascule en un clic depuis l'icône 🌞/🌙 (en haut à droite). L'app et le site changent ensemble. Persistance entre sessions.",
            },
          ],
        },
      ],
    },
    referral: {
      kicker: "Programme commercial",
      title: "Parraine BMD, gagne sur chaque abonnement",
      intro:
        "BMD a un programme de parrainage simple, sans niveaux, sans pyramide. Tu recommandes BMD à ton entourage ou à des organisations (paroisses, clubs, associations) — chaque inscription qui devient payante te rapporte une commission, à vie tant que la personne reste cliente.",
      benefits: [
        {
          icon: "💰",
          title: "Commission directe",
          body: "20 % du montant payé chaque mois (ou en one-shot pour le forfait Événement) par les utilisateurs que tu as parrainés. Versé tous les 1ers du mois sur ton mode de paiement préféré.",
        },
        {
          icon: "♾️",
          title: "Récurrent à vie",
          body: "Tant que ton filleul reste abonné, tu touches ta commission — pas de plafond, pas d'expiration. Une paroisse de 200 personnes que tu apportes peut générer plusieurs milliers d'euros par an.",
        },
        {
          icon: "📊",
          title: "Espace commercial dédié",
          body: "Tableau de bord clair : qui s'est inscrit grâce à toi, qui a basculé en payant, ton MRR, ton revenu prévu, ton historique de versements. Tout est traçable.",
        },
        {
          icon: "🎁",
          title: "Bonus pour le filleul",
          body: "Ton filleul reçoit aussi une réduction (1 mois offert sur le plan annuel, ou 10 % de remise à vie). Tu offres un cadeau — pas une plaie.",
        },
      ],
      howItWorks: [
        {
          num: "1",
          title: "Active l'espace commercial",
          body: "Depuis ton profil → Espace commercial → « Activer ». Tu reçois un code de parrainage personnalisé (ex : BMD-AICHA-23) et un lien.",
        },
        {
          num: "2",
          title: "Partage à ton entourage",
          body: "À ta paroisse, ton club de foot, tes copains diaspora… Le lien préremplit le code, donc ton filleul n'a rien à taper.",
        },
        {
          num: "3",
          title: "Suis tes inscriptions",
          body: "Chaque clic, chaque inscription, chaque conversion en plan payant remonte en temps réel dans ton espace commercial. Pas d'attente.",
        },
        {
          num: "4",
          title: "Reçois ta commission",
          body: "Versement automatique chaque 1er du mois (à partir de 25 €). Lydia, Wave, virement SEPA ou Mobile Money — au choix.",
        },
      ],
      cta: { label: "Découvrir le programme", href: "/dashboard/affiliate" },
      smallPrint:
        "Pas de niveaux, pas de marketing pyramidal, pas de \"matrices\". Un seul niveau (toi → ton filleul), commission fixe et transparente. Conditions complètes dans l'espace commercial après activation.",
    },
    faqLong: {
      intro:
        "Les questions qu'on nous pose le plus, regroupées par thème. Si tu ne trouves pas ta réponse, écris-nous à hello@backmesdo.com — on répond sous 24h.",
      categories: [
        {
          key: "basics",
          icon: "👋",
          label: "Bases",
          items: [
            {
              q: "C'est quoi BMD, en une phrase ?",
              a: "Une app qui aide les groupes à gérer l'argent partagé sans drama : tontines, colocs, voyages, mariages, paroisses, clubs. BMD calcule, simplifie, trace — tu paies ensuite avec ton outil habituel (Lydia, Wave, virement…).",
            },
            {
              q: "BMD remplace-t-il ma banque ou Lydia ?",
              a: "Non. BMD ne déplace pas l'argent lui-même. Tu continues à payer par tes canaux habituels (Lydia, Wave, MoMo, virement SEPA, PayPal). BMD enregistre la transaction, calcule qui doit quoi, et propose le règlement minimum.",
            },
            {
              q: "Combien ça coûte ?",
              a: "Le plan Gratuit couvre la majorité des usages : 3 groupes actifs, tontines / dépenses / swaps illimités, justificatifs PDF. Le plan Pro à 4,99 €/mois (payable mensuel ou annuel) débloque les groupes illimités, l'export comptable et le support prioritaire. Plan Événement à 29 € one-shot pour un mariage ou une grosse soirée.",
            },
            {
              q: "Sur quels appareils ça marche ?",
              a: "Sur iPhone (iOS 15+), Android (9+) et tout ordinateur récent (Chrome, Safari, Firefox). Tu peux aussi ajouter des dépenses depuis WhatsApp directement, via notre bot natif.",
            },
            {
              q: "Faut-il que tous mes proches s'inscrivent ?",
              a: "Non — pas tout de suite. Tu peux créer un groupe et y inscrire des « profils ombre » (juste un nom + un téléphone). BMD calcule pareil. Les filleuls sont ensuite invités à s'inscrire pour valider les soldes les concernant.",
            },
          ],
        },
        {
          key: "groups",
          icon: "👥",
          label: "Groupes & invitations",
          items: [
            {
              q: "Quels types de groupes je peux créer ?",
              a: "6 types pré-pensés : Tontine (cycle d'épargne tournante), Coloc (loyers/factures partagés), Voyage (dépenses ponctuelles entre amis), Événement (mariage, soirée, anniversaire), Club (foot, loisirs, équipe), Paroisse / Association. Chaque type a ses raccourcis adaptés.",
            },
            {
              q: "Combien de membres maximum dans un groupe ?",
              a: "Aucune limite stricte. On a des paroisses avec plus de 300 membres et tout fonctionne. Les notifications sont fines, donc ça ne spamme personne.",
            },
            {
              q: "Comment inviter quelqu'un ?",
              a: "Trois options : (1) lien partageable cliquable que tu envoies par WhatsApp/SMS, (2) QR code (pratique en réunion), (3) sélection depuis ton carnet de contacts (avec consentement explicite — BMD ne lit jamais ton répertoire en entier). Si la personne n'a pas répondu, BMD relance automatiquement à J+2 et J+5.",
            },
            {
              q: "Puis-je supprimer ou bloquer un membre ?",
              a: "Oui, l'admin peut retirer un membre du groupe à tout moment. Ses dépenses passées restent dans l'historique (anti-fraude), mais il ne reçoit plus de notifications et ne peut plus voir le groupe.",
            },
            {
              q: "Les invités voient-ils mes autres groupes ?",
              a: "Non, jamais. Chaque groupe est étanche. Aïcha qui est dans la coloc et le club de foot ne voit que ces deux groupes, pas le mariage que tu organises avec Mehdi.",
            },
          ],
        },
        {
          key: "tontines",
          icon: "🪙",
          label: "Tontines",
          items: [
            {
              q: "Comment fonctionne une tontine sur BMD ?",
              a: "Tu crées le groupe, fixes le montant et la fréquence (hebdo, bimensuelle, mensuelle). À chaque tour, le bénéficiaire choisit la date exacte de réception dans son mois. Les autres membres confirment leur cotisation. BMD trace tout, calcule le montant total, et garde un historique sur 5 ans minimum.",
            },
            {
              q: "Quelle différence entre tontine bamiléké, hui chinois et susu antillaise ?",
              a: "Le principe est le même (épargne tournante), la différence est dans l'ordre des bénéficiaires et le mécanisme. Bamiléké : ordre fixé d'avance, parts égales. Hui : à chaque tour, mise pour avancer son passage (intérêt). Susu : ordre tiré au sort. BMD supporte les trois, tu choisis au moment de créer le groupe.",
            },
            {
              q: "Et si quelqu'un ne paie pas son tour ?",
              a: "Le trésorier voit immédiatement qui n'a pas confirmé. BMD envoie un rappel automatique au ton choisi (sympa, ferme, humour). Si la personne ne paie toujours pas, l'admin peut suspendre les tours suivants ou la retirer, à votre discrétion.",
            },
            {
              q: "Puis-je suivre une tontine sur plusieurs années ?",
              a: "Oui, l'historique est conservé 5 ans minimum (obligation comptable française) et tu peux exporter au format Excel à tout moment. Idéal pour les tontines longues (10 personnes × 12 mois = 10 ans de cycle).",
            },
          ],
        },
        {
          key: "money",
          icon: "💱",
          label: "Devises & paiements",
          items: [
            {
              q: "Quelles devises BMD supporte-t-il ?",
              a: "25+ devises actives par défaut : EUR, USD, GBP, CHF, CAD, XAF, XOF, NGN, GHS, ZAR, KES, EGP, MAD, DZD, TND, BRL, MXN, INR, CNY, AED, SAR, JPY, AUD, et d'autres. Les taux sont rafraîchis chaque heure via Open Exchange Rates, avec exchangerate.host en fallback gratuit.",
            },
            {
              q: "Comment se passe la conversion entre devises ?",
              a: "Tu peux saisir une dépense en XAF dans un groupe en EUR : BMD convertit instantanément avec le taux du jour. Chaque membre voit le montant dans SA devise par défaut. Les soldes globaux multi-devises sont aussi reconvertis en temps réel.",
            },
            {
              q: "BMD prend-il une commission sur les paiements ?",
              a: "Non, jamais. BMD ne déplace pas l'argent. Quand tu paies un membre, ça passe par ton canal habituel (Lydia, Wave, virement) — c'est ce canal qui prend ses propres frais (généralement 0 € pour SEPA, quelques centimes pour Mobile Money). BMD est juste l'enregistreur.",
            },
            {
              q: "Quels moyens de paiement sont compatibles ?",
              a: "Tous, en réalité. BMD ne pousse pas un canal en particulier — tu paies par ce que tu veux et tu enregistres dans BMD. Les plus utilisés par notre communauté : Lydia, Wave, Orange Money, MTN MoMo, Wise, virement SEPA, PayPal, espèces (oui, c'est valide).",
            },
            {
              q: "Comment marche le paiement du forfait BMD lui-même ?",
              a: "Stripe Checkout sécurisé : carte bancaire, Apple Pay, Google Pay, SEPA Direct Debit selon ton pays. Tu peux changer ou annuler à tout moment depuis ton profil. Le forfait Événement (29 €) est un paiement unique, pas un abonnement.",
            },
          ],
        },
        {
          key: "expenses",
          icon: "💸",
          label: "Dépenses & justificatifs",
          items: [
            {
              q: "Comment scanner un ticket de caisse ?",
              a: "Tu prends une photo du ticket (ou tu importes un PDF), et BMD détecte automatiquement le montant, le marchand et la date. Trois moteurs OCR (Mindee pour la précision, GPT-4o Vision pour le contexte, Tesseract en local pour la confidentialité) — fallback transparent si l'un échoue.",
            },
            {
              q: "Qui peut modifier une dépense après coup ?",
              a: "Uniquement la personne qui l'a créée, et l'admin du groupe. Toute modification est tracée dans l'audit log (qui a changé quoi, quand). Anti-revisionnisme.",
            },
            {
              q: "Comment partager autrement qu'à parts égales ?",
              a: "Trois modes : égal (1 clic), parts personnalisées (ex: Marie 2 parts, les autres 1 chacun), ou pourcentages exacts (ex: 40 % / 30 % / 30 %). Tu peux aussi exclure un membre d'une dépense (ex: \"Mehdi n'a pas mangé au resto\").",
            },
            {
              q: "BMD détecte-t-il les doublons ?",
              a: "Oui, automatiquement. Si tu scannes deux fois le même ticket, ou si une dépense identique est créée à 2 minutes d'intervalle, un badge ⚠️ apparaît avec une suggestion pour fusionner. Tu décides.",
            },
            {
              q: "Puis-je importer mon relevé bancaire ?",
              a: "Oui, en CSV. BMD reconnaît les formats des principales banques (BNP, Crédit Agricole, Boursorama, Wise, Wave, Orange Money…). Tu mappes une fois les colonnes, BMD propose la catégorisation et la répartition automatiquement.",
            },
          ],
        },
        {
          key: "settle",
          icon: "↔",
          label: "Soldes & règlements",
          items: [
            {
              q: "Comment BMD calcule qui doit quoi ?",
              a: "Algorithme \"minimum cash flow\" : à partir de toutes les dépenses du groupe, BMD trouve le NOMBRE MINIMUM de transactions à faire pour solder tout le monde. Si Aïcha doit à Mehdi qui doit à David, BMD propose qu'Aïcha paie directement David. 1 transaction au lieu de 2.",
            },
            {
              q: "C'est quoi un swap de dette ?",
              a: "Quand un membre prend la dette d'un autre. Exemple : Aïcha doit 100 € à Mehdi, mais Mehdi doit 100 € à Aïcha pour autre chose. BMD propose un swap qui annule les deux d'un coup. Validation à 3 (créditeur + débiteur original + nouveau débiteur) pour éviter toute fraude.",
            },
            {
              q: "Comment marquer une dette comme payée ?",
              a: "Dans le groupe → Soldes → tu cliques \"Régler\" → tu choisis le canal (Lydia, virement…) → tu valides. Le créditeur reçoit une notif et confirme la réception. Tant que les deux n'ont pas validé, la dette reste \"en cours de règlement\".",
            },
            {
              q: "Et si quelqu'un dit qu'il a payé sans qu'on l'ait reçu ?",
              a: "C'est exactement pour ça que BMD demande la confirmation des deux côtés. Si le créditeur ne confirme pas dans 7 jours, BMD relance automatiquement. Tu peux aussi joindre un justificatif (capture d'écran de virement) au règlement.",
            },
          ],
        },
        {
          key: "privacy",
          icon: "🛡",
          label: "Vie privée & sécurité",
          items: [
            {
              q: "Mes données sont-elles en sécurité ?",
              a: "Oui. Connexions chiffrées TLS 1.3, mots de passe inexistants (OTP à usage unique hashés argon2), aucune lecture de carnet d'adresses, aucun cookie de tracking, aucun pixel publicitaire. Hébergement en région UE (Vercel EU + Railway Frankfurt). Conformité RGPD complète.",
            },
            {
              q: "Comment fonctionne la connexion sans mot de passe ?",
              a: "Tu rentres ton numéro de téléphone ou ton email, tu reçois un code à 6 chiffres (par SMS, email ou WhatsApp), tu le saisis. Le code expire après 5 minutes ou 1 utilisation. Beaucoup plus sûr qu'un mot de passe (qui peut fuiter), beaucoup plus simple (rien à retenir).",
            },
            {
              q: "Qu'est-ce qu'une passkey ?",
              a: "Une clé d'accès biométrique (Face ID, Touch ID, Windows Hello). Tu actives une fois, ensuite tu te connectes en un regard ou une empreinte. Plus rapide qu'un OTP et impossible à phisher.",
            },
            {
              q: "BMD lit-il mon répertoire ?",
              a: "JAMAIS en bulk. Quand tu invites un contact, le picker système (Android Chrome, iOS Safari) te montre tes contacts — tu choisis ceux que tu veux partager. Seuls ceux que tu sélectionnes explicitement sont transmis à BMD.",
            },
            {
              q: "Puis-je supprimer mon compte ?",
              a: "Oui, à tout moment, depuis ton profil → Vie privée → \"Supprimer mon compte\". La suppression est effective sous 30 jours (RGPD). Tes données dans des groupes partagés sont anonymisées (les autres membres voient \"Utilisateur supprimé\" à la place de ton nom).",
            },
            {
              q: "Puis-je exporter toutes mes données ?",
              a: "Oui, en JSON ou CSV, depuis ton profil → Vie privée → \"Exporter mes données\". Tu reçois un email avec le fichier sous 24h. Conforme à l'article 20 RGPD (droit à la portabilité).",
            },
          ],
        },
        {
          key: "billing",
          icon: "💳",
          label: "Facturation & forfaits",
          items: [
            {
              q: "Que comprend le plan Gratuit exactement ?",
              a: "Jusqu'à 3 groupes actifs simultanés, tontines / dépenses / swaps en nombre illimité, justificatifs photo et PDF, notifications complètes, scan OCR de tickets (3 par mois), export CSV de base.",
            },
            {
              q: "Et le plan Pro à 4,99 €/mois ?",
              a: "Groupes illimités, OCR illimité, export comptable détaillé (Excel + PDF), historique conservé 10 ans, support prioritaire (réponse sous 4h ouvrées), thèmes communauté avancés, statistiques détaillées.",
            },
            {
              q: "C'est quoi le plan Événement à 29 € ?",
              a: "Un paiement unique (PAS un abonnement) pour les gros événements ponctuels : mariage, EVJF/EVG, soirée d'entreprise, anniversaire. Donne accès aux fonctions Pro pendant 6 mois sur ce groupe précis. Pratique pour les organisateurs qui ne veulent pas s'engager.",
            },
            {
              q: "Puis-je annuler à tout moment ?",
              a: "Oui, depuis ton profil → Mon forfait → Annuler. Pas de frais d'annulation. Tu gardes l'accès jusqu'à la fin de la période payée. Aucune relance.",
            },
            {
              q: "Le prix change-t-il selon mon pays ?",
              a: "Oui, BMD adapte les tarifs à la zone géographique (parité de pouvoir d'achat). Le prix au Cameroun, en Côte d'Ivoire, ou au Sénégal est plus accessible qu'en France ou aux USA. Détecté automatiquement via ton IP, ajustable manuellement.",
            },
            {
              q: "Comment marche le programme de parrainage ?",
              a: "Active l'espace commercial dans ton profil → tu reçois un code/lien personnel → tu partages → tu touches 20 % à vie sur chaque inscription qui devient payante. Versement chaque 1er du mois (à partir de 25 € accumulés). Voir la section \"Parrainage\" plus haut pour tous les détails.",
            },
          ],
        },
      ],
      contactNudge:
        "Tu cherches une réponse plus précise ou tu veux nous parler d'un cas particulier ? Écris-nous à hello@backmesdo.com — un humain te répond sous 24h.",
    },
    cta: {
      headline: "Démarre maintenant",
      body: "Gratuit. Pas de carte bancaire. Inscription en moins d'une minute.",
      button: "Créer mon compte",
    },
    footer: {
      tagline: "L'argent partagé. L'amitié protégée.",
      rights: "Tous droits réservés.",
      privacy: "Confidentialité",
      terms: "CGU",
      contact: "Contact",
    },
  },
  en: {
    meta: {
      title: "BMD · Shared money, drama-free",
      description:
        "BMD helps the African diaspora manage tontines, shared rent, trips and group events — transparency, fairness, peace of mind.",
    },
    nav: {
      story: "Our story",
      features: "Features",
      howItWorks: "How it works",
      pricing: "Pricing",
      login: "Sign in",
      signUp: "Sign up",
    },
    langPicker: {
      main: "Main languages",
      europeanGroup: "European languages",
      asianGroup: "Asian languages",
      arabicGroup: "Arabic languages",
      africanGroup: "African languages",
    },
    story: {
      kicker: "Our story",
      title: "Money should never cost a friendship",
      punchline:
        "We've all been at that dinner where the restaurant turned into a courtroom. That tontine where nobody knew who had paid. That cousin trip that ended in a frozen WhatsApp group.",
      chapters: [
        {
          icon: "🌍",
          title: "The problem",
          body:
            "Inflation is eating everything. Cost of living is exploding in Europe, in Cameroon, in Dakar, in Mumbai. Every euro counts — and every euro miscounted turns into silence, resentment, a broken relationship. The diaspora sends money. Families organize. Friends travel. But the tool didn't exist to track all that with dignity.",
        },
        {
          icon: "💔",
          title: "The tension",
          body:
            "Excel sheets are unreadable. WhatsApp can't compute. Western apps don't understand tontines, the CFA franc, or the reality of a 6-person student flatshare in Paris. And nobody dares ask \"you still owe me 47 €\" without feeling they're tarnishing the bond.",
        },
        {
          icon: "🕊",
          title: "The solution",
          body:
            "BMD. A tool designed for those who actually share their money — between brothers, sisters, neighbors, parishioners, soccer teams, classmates. Multi-currency (25+), multi-language (20+), tontines, debt swaps, receipt OCR, WhatsApp bot. No drama, no trackers, no ads. So money stays a detail, and friendship stays essential.",
        },
      ],
      manifesto:
        "\"We count every cent — so we never have to count our friends.\"",
      cta: "Get started free",
    },
    hero: {
      tagline: "Back Mes Do · Diaspora",
      headline: "Shared money. Protected friendships.",
      subhead:
        "Tontines, roommates, trips, weddings, parishes, clubs: BMD computes, simplifies and tracks every expense so nobody feels short-changed.",
      ctaPrimary: "Get started free",
      ctaSecondary: "Watch demo",
    },
    features: {
      title: "Everything you need, nothing you don't",
      items: [
        {
          icon: "🪙",
          title: "Full tontines",
          body: "Cycle, beneficiary order, adjustable dates, acknowledgements, history over years.",
        },
        {
          icon: "💸",
          title: "Shared expenses",
          body: "Equal, custom or percentage splits. Photo/PDF receipts visible to all, editable only by creator.",
        },
        {
          icon: "↔",
          title: "Debt swap & transfer",
          body: "Offset or transfer a debt to another member, with validation from all three involved parties.",
        },
        {
          icon: "🔔",
          title: "Complete notifications",
          body: "Every event that matters to you triggers a notification. Anti-spam: no self-notifications.",
        },
        {
          icon: "📷",
          title: "Receipt OCR",
          body: "Scan a photo of your receipt: amount, merchant, date detected automatically.",
        },
        {
          icon: "🛡",
          title: "GDPR & privacy",
          body: "No bulk address book reads. Explicit consent, right to be forgotten respected.",
        },
      ],
    },
    howItWorks: {
      title: "In three steps",
      steps: [
        {
          num: "1",
          title: "Create your group",
          body: "Tontine, shared rent, trip, wedding… pick the type and default currency.",
        },
        {
          num: "2",
          title: "Invite your circle",
          body: "Shareable link, QR code, or phone contacts (with your consent).",
        },
        {
          num: "3",
          title: "Live with peace",
          body: "Add expenses, contributions, swaps. BMD computes balances and suggests optimal settlements.",
        },
      ],
    },
    pricing: {
      title: "Free for most",
      free: {
        name: "Free",
        price: "$0",
        features: [
          "Up to 3 active groups",
          "Unlimited tontines, expenses, swaps",
          "PDF/photo receipts",
          "Complete notifications",
        ],
      },
      pro: {
        name: "Pro",
        price: "$4.99 / month",
        features: [
          "Unlimited groups",
          "Detailed accounting export",
          "10-year history",
          "Priority support",
        ],
        cta: "Coming soon",
      },
    },
    faq: {
      title: "Frequently asked questions",
      items: [
        {
          q: "Is BMD a bank?",
          a: "No. BMD is a shared management tool. Payments happen via your usual channels (Lydia, Wave, Mobile Money, bank transfer). BMD records, computes, and simplifies.",
        },
        {
          q: "Is my data safe?",
          a: "Yes. We encrypt communications, never read your address book without explicit consent, and you can export or delete your data anytime (GDPR).",
        },
        {
          q: "How do BMD tontines work?",
          a: "You create the group, set the amount and frequency (monthly, biweekly, weekly). Each turn, the beneficiary picks the exact date within their month and everyone acknowledges. History is preserved over the years.",
        },
      ],
    },
    featuresLong: {
      intro:
        "BMD covers every situation where money moves between friends or community: tontines, shared rents, trips, weddings, parishes, clubs, teams. Here's what you can do, organized by theme.",
      categories: [
        {
          key: "groups",
          icon: "👥",
          label: "Groups & roles",
          pitch:
            "Create the right group type in 30 seconds. Each type has its own logic (cycle for tontine, shares for shared rent, schedule for trips…) and everyone knows who does what.",
          items: [
            { icon: "🎭", title: "6 pre-built group types", body: "Tontine · Shared rent · Trip · Event (wedding, party) · Club (sports, hobbies) · Parish / Association. Each type has its dedicated shortcuts and language." },
            { icon: "🛡", title: "Clear roles", body: "Admin (edits rules), treasurer (tracks payments), member (logs expenses). Everything is auditable without rigid hierarchy." },
            { icon: "✉️", title: "Multi-channel invites", body: "Shareable link, QR code, phone contacts (with explicit consent — no bulk address book reads). Auto-reminders on day 2 and 5 if not accepted." },
            { icon: "🎨", title: "Per-community themes", body: "Pick the visual identity of your group (Bogolan, Wax, Kente patterns…). Your group has its own personality." },
          ],
        },
        {
          key: "expenses",
          icon: "💸",
          label: "Shared expenses",
          pitch:
            "Logging an expense should take 5 seconds. BMD offers everything: receipt photo, share suggestion, anomaly detection, automatic currency conversion.",
          items: [
            { icon: "📷", title: "Receipt OCR (photo, PDF, scan)", body: "Take a photo of your receipt: amount, merchant and date are detected automatically. Three engines (Mindee, GPT-4o Vision, Tesseract) with transparent fallback." },
            { icon: "⚖️", title: "Split: equal · shares · percentages", body: "1-click equal split, custom shares per member, or exact percentages. Perfect for shared rents where each room is different." },
            { icon: "🤖", title: "AI share suggestions", body: "As you log expenses, BMD learns your habits (\"restaurant = always equal split among 4\") and suggests the right split automatically." },
            { icon: "📜", title: "Per-category rules", body: "\"All Carrefour grocery purchases go to Belleville Shared Rent\": create the rule once, BMD applies it on every scan or import." },
            { icon: "🚨", title: "Anomaly detection", body: "Duplicates, atypical amounts, expenses outside your usual range: a badge warns you before everyone validates." },
            { icon: "🏦", title: "Bank CSV import", body: "Import your bank statement (BNP, Crédit Agricole, Wave, Orange Money…) as CSV. BMD suggests categorization and split automatically." },
          ],
        },
        {
          key: "tontines",
          icon: "🪙",
          label: "Tontines & cycles",
          pitch:
            "Bamileke tontine, Chinese hui, Caribbean susu — every rotating savings model is supported, with 4-eyes validation and tamper-proof history.",
          items: [
            { icon: "🔄", title: "Fully automated cycle", body: "Set the amount, frequency (weekly · biweekly · monthly) and beneficiary order. Each turn, the recipient picks the exact date within their month." },
            { icon: "🤝", title: "Double validation of contributions", body: "Payer declares, treasurer confirms. No one can claim \"I paid\" without the other side's record. Anti-misunderstanding." },
            { icon: "📅", title: "Calendar view", body: "All future turns are shown visually. You see at a glance who gets what and when over the next 12 months." },
            { icon: "🎯", title: "Auctions (Hui)", body: "For Chinese communities: each turn, bid to advance your payout. BMD computes effective interest and shares it across other members." },
            { icon: "📚", title: "Multi-year history", body: "Immutable audit log: 5 years minimum (legal accounting requirement). Full export anytime." },
          ],
        },
        {
          key: "settle",
          icon: "↔",
          label: "Balances & settlements",
          pitch:
            "BMD computes the minimum number of transactions needed to settle the group. No more spreadsheets, no more \"who owes what to whom\".",
          items: [
            { icon: "🧮", title: "Real-time balances", body: "Multi-currency global balance, per-group balance in local currency. Recalculated instantly on every expense or contribution." },
            { icon: "🎯", title: "Optimal settlement", body: "\"Minimum cash flow\" algorithm: if Aïcha owes Mehdi who owes David, BMD suggests Aïcha pays David directly. 1 transaction instead of 2." },
            { icon: "🔁", title: "Debt swap & transfer", body: "Net out or transfer a debt to another member. 3-way validation (creditor + original debtor + new debtor) to prevent fraud." },
            { icon: "🔗", title: "Single-use payment links", body: "Generate a secure link for a member to pay you via Lydia, Wave, transfer. Link expires after use and is logged in the audit trail." },
          ],
        },
        {
          key: "money",
          icon: "💱",
          label: "Multi-currency & payments",
          pitch:
            "BMD is built for the diaspora. 25+ currencies supported, FX rates refreshed hourly, transparent conversions.",
          items: [
            { icon: "🌍", title: "25+ currencies with live rates", body: "Euro, dollar, pound, CFA franc (XAF/XOF), naira, dirham, rand, real, shilling, peso… Open Exchange Rates with exchangerate.host fallback." },
            { icon: "💳", title: "Works with your usual tools", body: "Lydia, Wave, Orange Money, MTN MoMo, Wise, SEPA transfer, PayPal. BMD doesn't replace — it records the transaction when you pay via your favorite channel." },
            { icon: "📈", title: "Real-time conversion", body: "An XAF expense will appear to each member in THEIR default currency, in real time, at today's rate." },
            { icon: "🧾", title: "Downloadable tax receipts", body: "For parishes, associations, sports clubs: generate PDF tax receipts with your business ID and applicable mention." },
          ],
        },
        {
          key: "comms",
          icon: "🔔",
          label: "Communication & reminders",
          pitch:
            "Everything is notification-driven — anti-spam by design, never auto-notifications, and you choose the tone of reminders.",
          items: [
            { icon: "🛎", title: "Granular notifications", body: "You only get notified about what concerns YOU (expense shared with you, debt to settle, upcoming tontine turn). Never \"X did something in your group\"." },
            { icon: "📅", title: "Weekly summary", body: "Every Sunday evening, a clear recap: what happened in your groups, your balance, your open debts. 30 seconds to know where you stand." },
            { icon: "💬", title: "Native WhatsApp bot", body: "Add expenses by sending a voice or text message (\"+25€ restaurant Lagon\"). BMD recognizes, files, asks for confirmation." },
            { icon: "😊", title: "Choose your tone", body: "Friendly, firm, humorous, professional: pick the tone of reminders BMD sends to late payers on your behalf. Auto-diplomacy." },
            { icon: "🌙", title: "Per-group Do Not Disturb", body: "Mute a group for 1h, 24h or until tomorrow morning without leaving the conversation. Perfect for trips where everyone posts at 4am." },
          ],
        },
        {
          key: "intelligence",
          icon: "🧠",
          label: "Intelligence & automations",
          pitch:
            "BMD uses AI to remove paperwork, not to spam you. Confidential, local or via GDPR-compatible providers.",
          items: [
            { icon: "🎙", title: "Whisper voice input", body: "WhatsApp voice or directly in the app: \"I paid 47 euros at Belleville Carrefour for groceries\". BMD transcribes, understands, files." },
            { icon: "📊", title: "Stats & insights", body: "Monthly spending trends, category breakdown, average per group. Without trackers or ads." },
            { icon: "🌐", title: "Auto-translation of admin content", body: "Parishes and associations often have multilingual messages. BMD translates automatically (GPT-4o-mini) with optional manual review." },
            { icon: "🔮", title: "Anomalies & duplicates", body: "An expense of 1,200€ when you usually do 50€? Same restaurant billed twice in 1 minute? BMD warns before it creates drama." },
          ],
        },
        {
          key: "trust",
          icon: "🛡",
          label: "Security & privacy",
          pitch:
            "GDPR by design. Your contacts are never read in bulk. No password, no tracking cookies, no advertising pixels.",
          items: [
            { icon: "🔑", title: "Passwordless sign-in", body: "OTP via SMS, email or WhatsApp. Passkeys (Face ID / Touch ID / Windows Hello) for power users. Google and Apple SSO optional." },
            { icon: "🚫", title: "Zero address book reads", body: "BMD NEVER reads your contacts list. The system picker shows your contacts; only those you explicitly select are sent to BMD." },
            { icon: "📜", title: "Immutable audit log", body: "All sensitive operations (admin, payments, swaps) are append-only, signed, kept for 5 years. Tamper-proof." },
            { icon: "🇪🇺", title: "Full GDPR compliance", body: "JSON/CSV export of all your data, deletion within 30 days on request, public sub-processor registry, reachable DPO." },
            { icon: "🌐", title: "EU hosting", body: "Databases and servers in EU region (Vercel EU, Railway Frankfurt). No transfers outside EU without Standard Contractual Clauses." },
          ],
        },
        {
          key: "platform",
          icon: "📱",
          label: "Platforms & accessibility",
          pitch:
            "A real native app on phone, a real web portal on desktop. And a WhatsApp bot for those who prefer to stay in the conversation.",
          items: [
            { icon: "📲", title: "Installable PWA", body: "On iPhone, Android or desktop: install BMD as a native-feeling app, works offline for browsing, shortcut on your home screen." },
            { icon: "💬", title: "WhatsApp bot", body: "Connect your WhatsApp number in 30s: voice/text expense logging, balance check, contribution validation — all without leaving WhatsApp." },
            { icon: "🌍", title: "Multilingual (FR · EN · ES · PT · AR · SW)", body: "The interface adapts to your preferred language. Arabic and other RTL languages handled natively (alignment, calendars, dates)." },
            { icon: "♿", title: "WCAG 2.1 AA accessibility", body: "Validated contrast, keyboard navigation, screen reader support, dark/light mode, font size respected. None of your loved ones is excluded." },
            { icon: "🌗", title: "Light / dark mode", body: "1-click toggle from the ☀️/🌙 icon (top right). App and website switch together. Persists across sessions." },
          ],
        },
      ],
    },
    referral: {
      kicker: "Sales program",
      title: "Refer BMD, earn on every subscription",
      intro:
        "BMD has a simple referral program — no levels, no pyramid. Recommend BMD to friends, family or organizations (parishes, clubs, associations) — every signup that converts to paid earns you a commission, for life as long as the person stays a customer.",
      benefits: [
        { icon: "💰", title: "Direct commission", body: "20% of the monthly amount paid (or one-shot for the Event plan) by the users you referred. Paid on the 1st of every month to your preferred method." },
        { icon: "♾️", title: "Recurring for life", body: "As long as your referee stays subscribed, you earn your commission — no cap, no expiration. A parish of 200 members you bring in can generate thousands per year." },
        { icon: "📊", title: "Dedicated sales dashboard", body: "Clear dashboard: who signed up via you, who converted to paid, your MRR, projected revenue, payout history. Fully traceable." },
        { icon: "🎁", title: "Bonus for the referee", body: "Your referee also gets a discount (1 month free on annual plan, or 10% off for life). You give a gift — not a hassle." },
      ],
      howItWorks: [
        { num: "1", title: "Activate the sales space", body: "From your profile → Sales space → \"Activate\". You receive a personalized referral code (e.g. BMD-AICHA-23) and a link." },
        { num: "2", title: "Share with your network", body: "To your parish, your soccer club, your diaspora friends… The link pre-fills the code so your referee has nothing to type." },
        { num: "3", title: "Track signups", body: "Every click, signup, conversion to paid plan shows up in real time in your sales space. No waiting." },
        { num: "4", title: "Receive your commission", body: "Automatic payout on the 1st of every month (from 25€). Lydia, Wave, SEPA transfer or Mobile Money — your choice." },
      ],
      cta: { label: "Discover the program", href: "/dashboard/affiliate" },
      smallPrint:
        "No levels, no pyramid marketing, no \"matrices\". Just one level (you → your referee), fixed and transparent commission. Full terms in the sales space after activation.",
    },
    faqLong: {
      intro:
        "The questions we hear most, grouped by theme. If you don't find your answer, write to hello@backmesdo.com — we reply within 24h.",
      categories: [
        {
          key: "basics",
          icon: "👋",
          label: "Basics",
          items: [
            { q: "What's BMD in one sentence?", a: "An app that helps groups manage shared money without drama: tontines, shared rents, trips, weddings, parishes, clubs. BMD computes, simplifies, traces — you then pay with your usual tool (Lydia, Wave, transfer…)." },
            { q: "Does BMD replace my bank or Lydia?", a: "No. BMD doesn't move money itself. You keep paying via your usual channels (Lydia, Wave, MoMo, SEPA, PayPal). BMD records the transaction, computes who owes what, and suggests minimum settlement." },
            { q: "How much does it cost?", a: "The Free plan covers most use cases: 3 active groups, unlimited tontines/expenses/swaps, PDF receipts. The Pro plan at €4.99/month (monthly or yearly) unlocks unlimited groups, accounting export, priority support. The Event plan is a €29 one-shot for a wedding or big party." },
            { q: "Which devices does it work on?", a: "iPhone (iOS 15+), Android (9+), and any modern computer (Chrome, Safari, Firefox). You can also add expenses directly from WhatsApp via our native bot." },
            { q: "Do all my friends need to sign up?", a: "No, not right away. You can create a group with \"shadow profiles\" (just a name + phone). BMD computes the same way. Referees are then invited to sign up to validate the balances that concern them." },
          ],
        },
        {
          key: "groups",
          icon: "👥",
          label: "Groups & invitations",
          items: [
            { q: "Which group types can I create?", a: "6 pre-built types: Tontine (rotating savings), Shared rent (rent/utilities split), Trip (occasional expenses with friends), Event (wedding, party, birthday), Club (soccer, hobbies, team), Parish/Association. Each has tailored shortcuts." },
            { q: "Maximum group size?", a: "No strict limit. We have parishes with 300+ members and everything works smoothly. Notifications are granular, so it doesn't spam anyone." },
            { q: "How do I invite someone?", a: "Three options: (1) clickable shareable link via WhatsApp/SMS, (2) QR code (handy in meetings), (3) selection from your contacts (with explicit consent — BMD never reads your full address book). If they don't reply, BMD auto-reminds on day 2 and 5." },
            { q: "Can I remove or block a member?", a: "Yes, the admin can remove a member at any time. Their past expenses stay in history (anti-fraud), but they no longer get notifications and can't see the group." },
            { q: "Can guests see my other groups?", a: "Never. Each group is sealed. Aïcha in shared rent and soccer club only sees those two — not the wedding you're organizing with Mehdi." },
          ],
        },
        {
          key: "tontines",
          icon: "🪙",
          label: "Tontines",
          items: [
            { q: "How does a tontine work on BMD?", a: "Create the group, set amount and frequency (weekly, biweekly, monthly). Each turn, the beneficiary picks the exact receipt date within their month. Other members confirm their contribution. BMD traces everything, computes the total, keeps history for at least 5 years." },
            { q: "Difference between Bamileke, Chinese hui, Caribbean susu?", a: "Same principle (rotating savings), differs in beneficiary order and mechanism. Bamileke: fixed order, equal shares. Hui: each turn, bid to advance your payout (interest). Susu: random order. BMD supports all three; you choose at group creation." },
            { q: "What if someone doesn't pay their turn?", a: "The treasurer immediately sees who hasn't confirmed. BMD sends an auto-reminder in your chosen tone (friendly, firm, humorous). If they still don't pay, the admin can suspend further turns or remove them — your discretion." },
            { q: "Can I track a tontine across multiple years?", a: "Yes, history is kept for at least 5 years (French accounting requirement) and you can export to Excel anytime. Ideal for long tontines (10 people × 12 months = 10-year cycle)." },
          ],
        },
        {
          key: "money",
          icon: "💱",
          label: "Currencies & payments",
          items: [
            { q: "Which currencies does BMD support?", a: "25+ active currencies by default: EUR, USD, GBP, CHF, CAD, XAF, XOF, NGN, GHS, ZAR, KES, EGP, MAD, DZD, TND, BRL, MXN, INR, CNY, AED, SAR, JPY, AUD, and more. Rates refresh hourly via Open Exchange Rates with exchangerate.host as free fallback." },
            { q: "How does cross-currency conversion work?", a: "You can log an XAF expense in an EUR group: BMD converts instantly at today's rate. Each member sees the amount in THEIR default currency. Multi-currency global balances are also reconverted in real time." },
            { q: "Does BMD take a commission on payments?", a: "Never. BMD doesn't move money. When you pay a member, it goes through your usual channel (Lydia, Wave, transfer) — that channel applies its own fees (usually 0€ for SEPA, a few cents for Mobile Money). BMD just records." },
            { q: "Which payment methods are supported?", a: "All of them, really. BMD doesn't push a specific channel — you pay how you want and log it in BMD. Most-used in our community: Lydia, Wave, Orange Money, MTN MoMo, Wise, SEPA transfer, PayPal, cash (yes, valid)." },
            { q: "How do I pay for the BMD plan itself?", a: "Stripe Checkout (secure): card, Apple Pay, Google Pay, SEPA Direct Debit by country. Change or cancel anytime from your profile. The Event plan (€29) is a one-time payment, not a subscription." },
          ],
        },
        {
          key: "expenses",
          icon: "💸",
          label: "Expenses & receipts",
          items: [
            { q: "How do I scan a receipt?", a: "Snap a photo (or import a PDF), and BMD detects amount, merchant and date automatically. Three OCR engines (Mindee for accuracy, GPT-4o Vision for context, Tesseract local for privacy) — transparent fallback if one fails." },
            { q: "Who can edit an expense after it's created?", a: "Only the creator and the group admin. Every edit is tracked in the audit log (who changed what, when). Anti-revisionism." },
            { q: "How do I split unequally?", a: "Three modes: equal (1 click), custom shares (e.g. Marie 2 shares, others 1 each), or exact percentages (e.g. 40% / 30% / 30%). You can also exclude a member from an expense (\"Mehdi didn't eat at the restaurant\")." },
            { q: "Does BMD detect duplicates?", a: "Yes, automatically. If you scan the same receipt twice or create an identical expense within 2 minutes, a ⚠️ badge appears with a merge suggestion. You decide." },
            { q: "Can I import my bank statement?", a: "Yes, in CSV. BMD recognizes formats from major banks (BNP, Crédit Agricole, Boursorama, Wise, Wave, Orange Money…). Map columns once, BMD suggests categorization and split automatically." },
          ],
        },
        {
          key: "settle",
          icon: "↔",
          label: "Balances & settlements",
          items: [
            { q: "How does BMD compute who owes what?", a: "\"Minimum cash flow\" algorithm: from all group expenses, BMD finds the MINIMUM number of transactions to settle everyone. If Aïcha owes Mehdi who owes David, BMD suggests Aïcha pays David directly. 1 transaction instead of 2." },
            { q: "What's a debt swap?", a: "When one member takes on another's debt. Example: Aïcha owes Mehdi 100€ but Mehdi owes Aïcha 100€ for something else. BMD suggests a swap that cancels both at once. 3-way validation (creditor + original debtor + new debtor) to prevent fraud." },
            { q: "How do I mark a debt as paid?", a: "In the group → Balances → click \"Settle\" → choose channel (Lydia, transfer…) → confirm. The creditor gets a notification and confirms receipt. Until both sides validate, the debt stays \"in settlement\"." },
            { q: "What if someone says they paid but I didn't receive?", a: "That's exactly why BMD requires both sides to confirm. If the creditor doesn't confirm within 7 days, BMD auto-reminds. You can also attach a proof (transfer screenshot) to the settlement." },
          ],
        },
        {
          key: "privacy",
          icon: "🛡",
          label: "Privacy & security",
          items: [
            { q: "Is my data safe?", a: "Yes. TLS 1.3 encrypted connections, no passwords (single-use OTPs hashed with argon2), no address book reads, no tracking cookies, no advertising pixels. EU hosting (Vercel EU + Railway Frankfurt). Full GDPR compliance." },
            { q: "How does passwordless sign-in work?", a: "Enter your phone or email, receive a 6-digit code (SMS, email or WhatsApp), enter it. The code expires after 5 minutes or 1 use. Far safer than a password (which can leak), much simpler (nothing to remember)." },
            { q: "What's a passkey?", a: "A biometric access key (Face ID, Touch ID, Windows Hello). Activate once, then sign in with a glance or a fingerprint. Faster than OTP and impossible to phish." },
            { q: "Does BMD read my contacts?", a: "NEVER in bulk. When you invite a contact, the system picker (Android Chrome, iOS Safari) shows your contacts — you choose what to share. Only those you explicitly select are sent to BMD." },
            { q: "Can I delete my account?", a: "Yes, anytime, from your profile → Privacy → \"Delete my account\". Deletion is effective within 30 days (GDPR). Your data in shared groups is anonymized (other members see \"Deleted user\" instead of your name)." },
            { q: "Can I export all my data?", a: "Yes, in JSON or CSV, from your profile → Privacy → \"Export my data\". You receive an email with the file within 24h. Compliant with GDPR Article 20 (right to portability)." },
          ],
        },
        {
          key: "billing",
          icon: "💳",
          label: "Billing & plans",
          items: [
            { q: "What's included in the Free plan?", a: "Up to 3 active groups simultaneously, unlimited tontines/expenses/swaps, photo and PDF receipts, full notifications, OCR scan (3/month), basic CSV export." },
            { q: "And the €4.99/month Pro plan?", a: "Unlimited groups, unlimited OCR, detailed accounting export (Excel + PDF), 10-year history retention, priority support (4-business-hours response), advanced community themes, detailed statistics." },
            { q: "What's the €29 Event plan?", a: "A one-time payment (NOT a subscription) for big occasional events: wedding, hen/stag party, company event, birthday. Unlocks Pro features for 6 months on that specific group. Handy for organizers who don't want a commitment." },
            { q: "Can I cancel anytime?", a: "Yes, from your profile → My plan → Cancel. No cancellation fee. You keep access until the end of the paid period. Zero follow-up." },
            { q: "Does the price change by country?", a: "Yes, BMD adapts pricing by region (purchasing power parity). Pricing in Cameroon, Ivory Coast or Senegal is more accessible than in France or the US. Detected automatically via IP, manually adjustable." },
            { q: "How does the referral program work?", a: "Activate the sales space in your profile → receive a personal code/link → share → earn 20% for life on every signup that converts to paid. Payout on the 1st of every month (from €25 accumulated). See the \"Referral\" section above for full details." },
          ],
        },
      ],
      contactNudge:
        "Looking for a more specific answer or want to chat about a particular case? Write to hello@backmesdo.com — a human replies within 24h.",
    },
    cta: {
      headline: "Start now",
      body: "Free. No credit card. Sign up in less than a minute.",
      button: "Create my account",
    },
    footer: {
      tagline: "Shared money. Protected friendships.",
      rights: "All rights reserved.",
      privacy: "Privacy",
      terms: "Terms",
      contact: "Contact",
    },
  },
  es: {
    meta: {
      title: "BMD · Dinero compartido sin dramas",
      description:
        "BMD ayuda a la diáspora africana a gestionar tontinas, alquileres compartidos, viajes y eventos grupales con transparencia y equidad.",
    },
    nav: {
      story: "Nuestra historia",
      features: "Funciones",
      howItWorks: "Cómo funciona",
      pricing: "Precios",
      login: "Iniciar sesión",
      signUp: "Crear cuenta",
    },
    langPicker: { main: "Lenguas principales", europeanGroup: "Lenguas europeas", asianGroup: "Lenguas asiáticas", arabicGroup: "Lenguas árabes", africanGroup: "Lenguas africanas" },
    story: {
      kicker: "Nuestra historia",
      title: "El dinero nunca debería costar una amistad",
      punchline: "Todos hemos vivido esa cena donde el restaurante se convirtió en tribunal. Esa tontina donde nadie sabía quién había pagado. Ese viaje entre primos que terminó en grupo de WhatsApp helado.",
      chapters: [
        { icon: "🌍", title: "El problema", body: "La inflación devora todo. El coste de vida explota en Europa, Camerún, Dakar, Bombay. Cada euro cuenta — y cada euro mal contado se vuelve silencio, resentimiento, relación rota. La diáspora envía dinero. Las familias se organizan. Los amigos viajan. Pero la herramienta no existía para seguir todo eso con dignidad." },
        { icon: "💔", title: "La tensión", body: "Las hojas Excel son ilegibles. WhatsApp no calcula. Las apps occidentales no entienden tontinas, el franco CFA, o la realidad de un piso de 6 estudiantes en París. Y nadie se atreve a pedir \"todavía me debes 47 €\" sin sentir que ensucia el vínculo." },
        { icon: "🕊", title: "La solución", body: "BMD. Una herramienta para quienes realmente comparten su dinero. Multidivisa (25+), multilengua (20+), tontinas, swap de deudas, OCR de tickets, bot WhatsApp. Sin drama, sin rastreadores, sin publicidad." },
      ],
      manifesto: "« Contamos cada céntimo — para no tener que contar a nuestros amigos. »",
      cta: "Empieza gratis",
    },
    hero: {
      tagline: "Back Mes Do · Diáspora",
      headline: "Dinero compartido. Amistades protegidas.",
      subhead:
        "Tontinas, compañeros de piso, viajes, bodas, parroquias, clubes: BMD calcula, simplifica y registra cada gasto para que nadie se sienta perjudicado.",
      ctaPrimary: "Empezar gratis",
      ctaSecondary: "Ver demo",
    },
    features: {
      title: "Todo lo necesario, nada superfluo",
      items: [
        {
          icon: "🪙",
          title: "Tontinas completas",
          body: "Ciclo, orden de beneficiarios, fechas ajustables, acuses de recibo, histórico de años.",
        },
        {
          icon: "💸",
          title: "Gastos compartidos",
          body: "Iguales, partes o porcentajes. Justificantes foto/PDF visibles para todos, editables solo por el creador.",
        },
        {
          icon: "↔",
          title: "Intercambio de deuda",
          body: "Compensa o transfiere una deuda a otro miembro, con validación de las tres partes implicadas.",
        },
        {
          icon: "🔔",
          title: "Notificaciones completas",
          body: "Cada evento que te concierne genera una notificación. Anti-spam: sin auto-notificaciones.",
        },
        {
          icon: "📷",
          title: "OCR de tickets",
          body: "Escanea tu ticket: importe, comercio, fecha detectados automáticamente.",
        },
        {
          icon: "🛡",
          title: "RGPD y privacidad",
          body: "Sin lectura masiva de contactos. Consentimiento explícito, derecho al olvido respetado.",
        },
      ],
    },
    howItWorks: {
      title: "En tres pasos",
      steps: [
        {
          num: "1",
          title: "Crea tu grupo",
          body: "Tontina, alquiler, viaje, boda… elige el tipo y la moneda predeterminada.",
        },
        {
          num: "2",
          title: "Invita a tus contactos",
          body: "Enlace compartible, QR, o contactos del teléfono (con tu consentimiento).",
        },
        {
          num: "3",
          title: "Vive tranquilo",
          body: "Registra gastos, cotizaciones, intercambios. BMD calcula los saldos y sugiere los ajustes óptimos.",
        },
      ],
    },
    pricing: {
      title: "Gratis para la mayoría",
      free: {
        name: "Gratis",
        price: "0 €",
        features: [
          "Hasta 3 grupos activos",
          "Tontinas, gastos, swaps ilimitados",
          "Justificantes PDF/fotos",
          "Notificaciones completas",
        ],
      },
      pro: {
        name: "Pro",
        price: "4,99 € / mes",
        features: [
          "Grupos ilimitados",
          "Exportación contable detallada",
          "Histórico de 10 años",
          "Soporte prioritario",
        ],
        cta: "Próximamente",
      },
    },
    faq: {
      title: "Preguntas frecuentes",
      items: [
        {
          q: "¿BMD reemplaza un banco?",
          a: "No. BMD es una herramienta de gestión compartida. Los pagos se hacen por tus canales habituales (Lydia, Wave, Mobile Money, transferencia). BMD registra, calcula, simplifica.",
        },
        {
          q: "¿Mis datos están seguros?",
          a: "Sí. Ciframos las comunicaciones, nunca leemos tu agenda sin consentimiento explícito, y puedes exportar o borrar tus datos en cualquier momento (RGPD).",
        },
        {
          q: "¿Cómo funciona una tontina en BMD?",
          a: "Creas el grupo, fijas el importe y la frecuencia (mensual, quincenal, semanal). En cada turno, el beneficiario elige la fecha exacta dentro de su mes y todos acusan recibo. Histórico durante años.",
        },
      ],
    },
    featuresLong: {
      intro:
        "BMD cubre todas las situaciones donde el dinero circula entre allegados: tontinas, alquileres compartidos, viajes, bodas, parroquias, clubes, equipos. Esto es lo que puedes hacer, organizado por tema.",
      categories: [
        {
          key: "groups",
          icon: "👥",
          label: "Grupos & roles",
          pitch: "Crea el tipo correcto de grupo en 30 segundos. Cada tipo tiene su propia lógica (ciclo para tontina, partes para alquiler compartido, planning para viaje…) y todos saben quién hace qué.",
          items: [
            { icon: "🎭", title: "6 tipos predefinidos", body: "Tontina · Alquiler compartido · Viaje · Evento (boda, fiesta) · Club (deporte, ocio) · Parroquia / Asociación. Cada tipo con sus atajos y lenguaje propios." },
            { icon: "🛡", title: "Roles claros", body: "Admin (edita reglas), tesorero (sigue pagos), miembro (registra gastos). Todo trazable sin jerarquía pesada." },
            { icon: "✉️", title: "Invitaciones multicanal", body: "Enlace para compartir, código QR, contactos del teléfono (con consentimiento explícito, sin lectura masiva). Recordatorios automáticos al día 2 y 5." },
            { icon: "🎨", title: "Tema por comunidad", body: "Elige la identidad visual de tu grupo (motivos Bogolan, Wax, Kente…). Tu grupo tiene personalidad." },
          ],
        },
        {
          key: "expenses",
          icon: "💸",
          label: "Gastos compartidos",
          pitch: "Registrar un gasto debe llevar 5 segundos. BMD ofrece foto del recibo, sugerencia de reparto, detección de anomalías y conversión automática de divisas.",
          items: [
            { icon: "📷", title: "OCR de tickets (foto, PDF, escaneo)", body: "Foto del ticket: importe, comerciante y fecha detectados automáticamente. Tres motores (Mindee, GPT-4o Vision, Tesseract) con respaldo transparente." },
            { icon: "⚖️", title: "Reparto: igual · partes · porcentajes", body: "Modo igualitario en 1 clic, partes personalizadas o porcentajes exactos. Ideal para alquileres compartidos con habitaciones distintas." },
            { icon: "🤖", title: "Sugerencia IA del reparto", body: "Mientras registras, BMD aprende tus hábitos (\"restaurante = siempre reparto igual entre 4\") y propone el modo correcto automáticamente." },
            { icon: "📜", title: "Reglas por categoría", body: "\"Toda compra Carrefour va al grupo Coloc\": creas la regla una vez, BMD la aplica en cada escaneo o importación." },
            { icon: "🚨", title: "Detección de anomalías", body: "Duplicados, importes atípicos, gastos fuera del rango habitual: un aviso aparece antes de que todos validen." },
            { icon: "🏦", title: "Importación bancaria CSV", body: "Importa tu extracto (BNP, BBVA, Wave, Orange Money…) en CSV. BMD propone categorización y reparto automáticamente." },
          ],
        },
        {
          key: "tontines",
          icon: "🪙",
          label: "Tontinas & ciclos",
          pitch: "Tontina bamileke, hui chino, susu antillano — todos los modelos de ahorro rotativo soportados, con doble validación e historial inalterable.",
          items: [
            { icon: "🔄", title: "Ciclo automatizado", body: "Define el importe, la frecuencia (semanal · quincenal · mensual) y el orden de beneficiarios. En cada turno, el destinatario elige la fecha exacta de su mes." },
            { icon: "🤝", title: "Doble validación", body: "El pagador declara, el tesorero confirma. Nadie puede decir \"ya pagué\" sin la traza del otro lado. Anti-malentendidos." },
            { icon: "📅", title: "Vista calendario", body: "Todos los turnos futuros visibles. Ves de un vistazo quién recibe qué y cuándo en los próximos 12 meses." },
            { icon: "🎯", title: "Subastas (Hui)", body: "Para comunidades chinas: en cada turno, puja por adelantar tu cobro. BMD calcula el interés efectivo y lo reparte." },
            { icon: "📚", title: "Historial multianual", body: "Registro inmutable: 5 años mínimo (obligación contable). Exportación completa cuando quieras." },
          ],
        },
        {
          key: "settle",
          icon: "↔",
          label: "Saldos & liquidaciones",
          pitch: "BMD calcula el mínimo de transacciones para liquidar el grupo. Sin más hojas de cálculo, sin más \"quién debe a quién\".",
          items: [
            { icon: "🧮", title: "Saldos en tiempo real", body: "Saldo global multidivisa y por grupo en moneda local. Recalculado al instante en cada gasto o cotización." },
            { icon: "🎯", title: "Liquidación óptima", body: "Algoritmo \"flujo mínimo\": si Aïcha le debe a Mehdi que le debe a David, BMD propone que Aïcha pague directo a David. 1 transacción en lugar de 2." },
            { icon: "🔁", title: "Swap & traspaso de deuda", body: "Compensa o traspasa una deuda a otro miembro. Validación a 3 (acreedor + deudor original + nuevo deudor) anti-fraude." },
            { icon: "🔗", title: "Enlaces de pago de un solo uso", body: "Genera un enlace seguro para que un miembro te pague vía Lydia, Wave, transferencia. Caduca tras uso, queda en el log." },
          ],
        },
        {
          key: "money",
          icon: "💱",
          label: "Multidivisa & pagos",
          pitch: "BMD está hecho para la diáspora. 25+ divisas soportadas, tasas actualizadas cada hora, conversiones transparentes.",
          items: [
            { icon: "🌍", title: "25+ divisas en tiempo real", body: "Euro, dólar, libra, franco CFA (XAF/XOF), naira, dirham, rand, real, chelín, peso… Open Exchange Rates con respaldo gratuito." },
            { icon: "💳", title: "Compatible con tus herramientas", body: "Lydia, Wave, Orange Money, MTN MoMo, Wise, transferencia SEPA, PayPal. BMD no reemplaza, registra cuando pagas por tu canal favorito." },
            { icon: "📈", title: "Conversión en tiempo real", body: "Un gasto en XAF se mostrará a cada miembro en SU divisa por defecto, con la tasa del día." },
            { icon: "🧾", title: "Recibos fiscales descargables", body: "Para parroquias, asociaciones, clubes deportivos: genera recibos PDF con tu identificación fiscal." },
          ],
        },
        {
          key: "comms",
          icon: "🔔",
          label: "Comunicación & recordatorios",
          pitch: "Todo va por notificación — anti-spam por diseño, nunca auto-notificaciones, y eliges el tono.",
          items: [
            { icon: "🛎", title: "Notificaciones precisas", body: "Recibes SOLO lo que te concierne (gasto compartido contigo, deuda a saldar, próximo turno). Nunca \"X hizo algo en tu grupo\"." },
            { icon: "📅", title: "Resumen semanal", body: "Cada domingo por la noche, un resumen claro: qué pasó en tus grupos, tu saldo, tus deudas pendientes. 30 segundos para saber dónde estás." },
            { icon: "💬", title: "Bot WhatsApp nativo", body: "Añade gastos por voz o texto (\"+25€ resto Lagon\"). BMD reconoce, ordena, pide confirmación." },
            { icon: "😊", title: "Tono a elegir", body: "Amable, firme, humor, profesional: elige el tono de los recordatorios que BMD envía a los morosos en tu nombre. Diplomacia automática." },
            { icon: "🌙", title: "No molestar por grupo", body: "Silencia un grupo 1h, 24h o hasta mañana sin salir de la conversación. Ideal para viajes con publicaciones a las 4 a.m." },
          ],
        },
        {
          key: "intelligence",
          icon: "🧠",
          label: "Inteligencia & automatizaciones",
          pitch: "BMD usa IA para eliminar papeleo, no para spam. Confidencial, local o vía proveedores RGPD-compatibles.",
          items: [
            { icon: "🎙", title: "Entrada de voz Whisper", body: "Voz por WhatsApp o en la app: \"pagué 47 euros en el Carrefour de Belleville para la compra\". BMD transcribe, entiende, ordena." },
            { icon: "📊", title: "Estadísticas & insights", body: "Evolución mensual, reparto por categoría, gasto medio por grupo. Sin trackers ni publicidad." },
            { icon: "🌐", title: "Auto-traducción de contenidos admin", body: "Las parroquias y asociaciones suelen tener mensajes multilingües. BMD traduce automáticamente (GPT-4o-mini) con revisión opcional." },
            { icon: "🔮", title: "Anomalías & duplicados", body: "¿Un gasto de 1 200€ cuando sueles hacer 50€? ¿Mismo restaurante facturado dos veces en 1 minuto? BMD avisa antes del drama." },
          ],
        },
        {
          key: "trust",
          icon: "🛡",
          label: "Seguridad & privacidad",
          pitch: "RGPD by design. Tus contactos nunca se leen masivamente. Sin contraseña, sin cookies de tracking, sin píxeles publicitarios.",
          items: [
            { icon: "🔑", title: "Conexión sin contraseña", body: "OTP por SMS, email o WhatsApp. Passkeys (Face ID / Touch ID / Windows Hello) para los habituales. SSO Google y Apple opcionales." },
            { icon: "🚫", title: "Cero lectura de la agenda", body: "BMD NUNCA lee tu lista de contactos. El selector del sistema te muestra los tuyos; solo los que eliges expresamente se transmiten." },
            { icon: "📜", title: "Registro inmutable", body: "Operaciones sensibles (admin, pagos, swaps) son append-only, firmadas, conservadas 5 años. Anti-falsificación." },
            { icon: "🇪🇺", title: "RGPD completo", body: "Exportación JSON/CSV, eliminación bajo demanda en 30 días, registro de subcontratistas público, DPO accesible." },
            { icon: "🌐", title: "Hosting UE", body: "Bases de datos y servidores en la UE (Vercel EU, Railway Frankfurt). Sin transferencias fuera de la UE sin cláusulas contractuales." },
          ],
        },
        {
          key: "platform",
          icon: "📱",
          label: "Plataformas & accesibilidad",
          pitch: "Una verdadera app nativa en móvil, un verdadero portal web en ordenador. Y un bot WhatsApp para quien prefiere quedarse en la conversación.",
          items: [
            { icon: "📲", title: "PWA instalable", body: "En iPhone, Android o escritorio: instala BMD como app real, funciona offline para consulta, atajo en pantalla de inicio." },
            { icon: "💬", title: "Bot WhatsApp", body: "Conecta tu número WhatsApp en 30s: añadir gastos por voz/texto, consultar saldo, validar cotizaciones, sin salir de WhatsApp." },
            { icon: "🌍", title: "Multilingüe (FR · EN · ES · PT · AR · SW)", body: "La interfaz se adapta a tu idioma preferido. Árabe y otras RTL gestionadas nativamente (alineación, calendarios, fechas)." },
            { icon: "♿", title: "Accesibilidad WCAG 2.1 AA", body: "Contraste validado, navegación por teclado, soporte de lectores de pantalla, modo claro/oscuro, tamaño de fuente respetado." },
            { icon: "🌗", title: "Modo claro / oscuro", body: "Cambia con un clic desde el icono ☀️/🌙 (arriba a la derecha). App y web cambian juntos. Persiste entre sesiones." },
          ],
        },
      ],
    },
    referral: {
      kicker: "Programa comercial",
      title: "Recomienda BMD, gana en cada suscripción",
      intro:
        "BMD tiene un programa de afiliación simple — sin niveles, sin pirámide. Recomienda BMD a tu entorno o a organizaciones (parroquias, clubes, asociaciones) — cada inscripción que pase a plan de pago te genera comisión, de por vida mientras la persona siga siendo cliente.",
      benefits: [
        { icon: "💰", title: "Comisión directa", body: "20% del importe pagado mensualmente (o one-shot para el plan Evento) por los usuarios que recomendaste. Pagado el 1 de cada mes en tu método preferido." },
        { icon: "♾️", title: "Recurrente de por vida", body: "Mientras tu referido siga abonado, sigues cobrando — sin techo, sin caducidad. Una parroquia de 200 personas puede generar miles de euros al año." },
        { icon: "📊", title: "Espacio comercial dedicado", body: "Panel claro: quién se inscribió por ti, quién pasó a pago, tu MRR, ingreso previsto, historial de pagos. Trazable al 100%." },
        { icon: "🎁", title: "Bonus para el referido", body: "Tu referido también recibe un descuento (1 mes gratis en plan anual, o 10% de por vida). Regalas un detalle, no un fastidio." },
      ],
      howItWorks: [
        { num: "1", title: "Activa el espacio comercial", body: "Desde tu perfil → Espacio comercial → \"Activar\". Recibes un código personalizado (ej. BMD-AICHA-23) y un enlace." },
        { num: "2", title: "Comparte con tu entorno", body: "A tu parroquia, club de fútbol, amigos de la diáspora… El enlace prerrellena el código, así tu referido no escribe nada." },
        { num: "3", title: "Sigue tus inscripciones", body: "Cada clic, inscripción y conversión a plan de pago aparece en tiempo real en tu espacio. Sin esperas." },
        { num: "4", title: "Recibe tu comisión", body: "Pago automático el 1 de cada mes (a partir de 25 €). Lydia, Wave, transferencia SEPA o Mobile Money — tú eliges." },
      ],
      cta: { label: "Descubrir el programa", href: "/dashboard/affiliate" },
      smallPrint:
        "Sin niveles, sin marketing piramidal, sin \"matrices\". Un único nivel (tú → tu referido), comisión fija y transparente. Condiciones completas en el espacio comercial tras activación.",
    },
    faqLong: {
      intro:
        "Las preguntas más habituales, agrupadas por tema. Si no encuentras tu respuesta, escríbenos a hello@backmesdo.com — respondemos en 24h.",
      categories: [
        {
          key: "basics",
          icon: "👋",
          label: "Bases",
          items: [
            { q: "¿Qué es BMD en una frase?", a: "Una app que ayuda a grupos a gestionar el dinero compartido sin drama: tontinas, alquileres compartidos, viajes, bodas, parroquias, clubes. BMD calcula, simplifica, traza — luego pagas con tu herramienta habitual." },
            { q: "¿BMD reemplaza mi banco o Lydia?", a: "No. BMD no mueve el dinero. Sigues pagando por tus canales habituales (Lydia, Wave, MoMo, transferencia SEPA, PayPal). BMD registra, calcula y propone la liquidación mínima." },
            { q: "¿Cuánto cuesta?", a: "El plan Gratis cubre la mayoría: 3 grupos activos, tontinas/gastos/swaps ilimitados. Pro a 4,99 €/mes. Plan Evento a 29 € one-shot para una boda o gran fiesta." },
            { q: "¿En qué dispositivos funciona?", a: "iPhone (iOS 15+), Android (9+) y cualquier ordenador moderno (Chrome, Safari, Firefox). También puedes añadir gastos desde WhatsApp con nuestro bot nativo." },
            { q: "¿Tienen que registrarse todos mis allegados?", a: "No de inmediato. Puedes crear un grupo con \"perfiles fantasma\" (solo nombre + teléfono). BMD calcula igual. Los referidos son invitados después a registrarse para validar los saldos que les conciernen." },
          ],
        },
        {
          key: "groups",
          icon: "👥",
          label: "Grupos & invitaciones",
          items: [
            { q: "¿Qué tipos de grupos puedo crear?", a: "6 tipos predefinidos: Tontina, Alquiler compartido, Viaje, Evento, Club, Parroquia/Asociación. Cada uno con sus atajos." },
            { q: "¿Tamaño máximo del grupo?", a: "Sin límite estricto. Tenemos parroquias con 300+ miembros y todo va fluido. Las notificaciones son finas, no spamean." },
            { q: "¿Cómo invito a alguien?", a: "Tres opciones: enlace compartible, código QR, o desde tus contactos (con consentimiento explícito). Si no responde, BMD recuerda automáticamente al día 2 y 5." },
            { q: "¿Puedo eliminar a un miembro?", a: "Sí, el admin puede retirarlo en cualquier momento. Sus gastos pasados se conservan en el historial (anti-fraude), pero ya no recibe notificaciones." },
            { q: "¿Los invitados ven mis otros grupos?", a: "Nunca. Cada grupo es estanco. Los miembros solo ven los grupos a los que pertenecen." },
          ],
        },
        {
          key: "tontines",
          icon: "🪙",
          label: "Tontinas",
          items: [
            { q: "¿Cómo funciona una tontina en BMD?", a: "Creas el grupo, fijas el importe y la frecuencia. En cada turno, el beneficiario elige la fecha exacta. Los demás confirman su cotización. BMD lo traza todo, calcula y conserva el historial 5 años mínimo." },
            { q: "¿Diferencias entre bamileke, hui chino y susu?", a: "Mismo principio (ahorro rotativo), distintos en orden y mecanismo. Bamileke: orden fijo, partes iguales. Hui: pujas para adelantar tu cobro. Susu: orden aleatorio. BMD soporta los tres." },
            { q: "¿Y si alguien no paga su turno?", a: "El tesorero ve quién no ha confirmado. BMD envía un recordatorio automático en el tono elegido. Si sigue sin pagar, el admin puede suspender los siguientes turnos o retirarlo." },
            { q: "¿Puedo seguir una tontina a varios años?", a: "Sí, el historial se conserva 5 años mínimo (obligación contable) y puedes exportar a Excel cuando quieras." },
          ],
        },
        {
          key: "money",
          icon: "💱",
          label: "Divisas & pagos",
          items: [
            { q: "¿Qué divisas soporta BMD?", a: "25+ divisas activas: EUR, USD, GBP, CHF, CAD, XAF, XOF, NGN, GHS, ZAR, KES, MAD, BRL, MXN, INR, CNY, AED, JPY, AUD y más. Tasas actualizadas cada hora." },
            { q: "¿Cómo se hace la conversión entre divisas?", a: "Puedes registrar un gasto en XAF en un grupo en EUR: BMD convierte al instante. Cada miembro ve el importe en SU divisa por defecto." },
            { q: "¿BMD cobra comisión por los pagos?", a: "Nunca. BMD no mueve el dinero. Tu canal habitual (Lydia, Wave, transferencia) aplica sus propias comisiones." },
            { q: "¿Qué métodos de pago son compatibles?", a: "Todos. BMD no impone canal. Los más usados en nuestra comunidad: Lydia, Wave, Orange Money, MTN MoMo, Wise, SEPA, PayPal, efectivo." },
            { q: "¿Cómo se paga el plan BMD?", a: "Stripe Checkout seguro: tarjeta, Apple Pay, Google Pay, SEPA Direct Debit. Cancela cuando quieras desde tu perfil. Plan Evento (29€) es pago único." },
          ],
        },
        {
          key: "expenses",
          icon: "💸",
          label: "Gastos & justificantes",
          items: [
            { q: "¿Cómo escaneo un ticket?", a: "Foto o PDF, BMD detecta importe, comerciante y fecha automáticamente. Tres motores OCR (Mindee, GPT-4o Vision, Tesseract) con respaldo." },
            { q: "¿Quién puede modificar un gasto?", a: "Solo el creador y el admin del grupo. Toda modificación queda registrada en el log de auditoría." },
            { q: "¿Cómo reparto desigualmente?", a: "Tres modos: igual, partes personalizadas o porcentajes exactos. También puedes excluir a un miembro de un gasto." },
            { q: "¿BMD detecta duplicados?", a: "Sí, automáticamente. Si escaneas dos veces el mismo ticket, aparece un aviso ⚠️ con sugerencia de fusión." },
            { q: "¿Puedo importar mi extracto bancario?", a: "Sí, en CSV. BMD reconoce los formatos de los principales bancos. Mapeas las columnas una vez, BMD propone categorización." },
          ],
        },
        {
          key: "settle",
          icon: "↔",
          label: "Saldos & liquidaciones",
          items: [
            { q: "¿Cómo calcula BMD quién debe a quién?", a: "Algoritmo \"flujo mínimo\": BMD encuentra el MÍNIMO de transacciones para liquidar a todos. 1 transacción en lugar de 2 o 3." },
            { q: "¿Qué es un swap de deuda?", a: "Cuando un miembro asume la deuda de otro. Si Aïcha le debe a Mehdi y Mehdi le debe a Aïcha, BMD propone un swap que cancela ambos. Validación a 3 anti-fraude." },
            { q: "¿Cómo marco una deuda como pagada?", a: "En el grupo → Saldos → \"Liquidar\" → eliges canal → confirmas. El acreedor recibe notificación y confirma recibo." },
            { q: "¿Y si dicen que pagaron pero no recibí?", a: "Por eso BMD pide confirmación de ambas partes. Si el acreedor no confirma en 7 días, BMD recuerda automáticamente." },
          ],
        },
        {
          key: "privacy",
          icon: "🛡",
          label: "Privacidad & seguridad",
          items: [
            { q: "¿Mis datos están seguros?", a: "Sí. Conexiones cifradas TLS 1.3, sin contraseñas, sin lectura masiva de la agenda, sin cookies de tracking. Hosting en UE. Conformidad RGPD completa." },
            { q: "¿Cómo funciona el login sin contraseña?", a: "Introduces tu teléfono o email, recibes un código de 6 dígitos (SMS, email o WhatsApp), lo introduces. Caduca en 5 min o tras 1 uso." },
            { q: "¿Qué es una passkey?", a: "Una llave de acceso biométrica (Face ID, Touch ID, Windows Hello). Activas una vez, después te conectas con un vistazo. Más rápido y anti-phishing." },
            { q: "¿BMD lee mi agenda?", a: "NUNCA en bulk. El selector del sistema te muestra tus contactos — eliges los que quieres compartir. Solo los seleccionados se transmiten." },
            { q: "¿Puedo borrar mi cuenta?", a: "Sí, desde tu perfil → Privacidad → \"Borrar cuenta\". Efectivo en 30 días (RGPD). Tus datos en grupos compartidos se anonimizan." },
            { q: "¿Puedo exportar todos mis datos?", a: "Sí, en JSON o CSV, desde tu perfil. Recibes un email con el archivo en 24h. Conforme al artículo 20 RGPD." },
          ],
        },
        {
          key: "billing",
          icon: "💳",
          label: "Facturación & planes",
          items: [
            { q: "¿Qué incluye el plan Gratis?", a: "Hasta 3 grupos activos simultáneos, tontinas/gastos/swaps ilimitados, recibos foto y PDF, notificaciones completas, escaneo OCR (3/mes), exportación CSV básica." },
            { q: "¿Y el plan Pro a 4,99 €/mes?", a: "Grupos ilimitados, OCR ilimitado, exportación contable detallada, historial 10 años, soporte prioritario, temas avanzados, estadísticas detalladas." },
            { q: "¿Qué es el plan Evento a 29 €?", a: "Pago único (NO suscripción) para grandes eventos puntuales: boda, despedida, evento de empresa, cumpleaños. Da acceso Pro durante 6 meses en ese grupo." },
            { q: "¿Puedo cancelar cuando quiera?", a: "Sí, desde tu perfil → Mi plan → Cancelar. Sin gastos. Mantienes acceso hasta el final del periodo pagado." },
            { q: "¿El precio cambia según mi país?", a: "Sí, BMD adapta tarifas por zona (paridad de poder adquisitivo). Más accesible en Camerún, Costa de Marfil o Senegal que en Francia o EE. UU." },
            { q: "¿Cómo funciona el programa de afiliación?", a: "Activas el espacio comercial → recibes código/enlace personal → compartes → ganas 20% de por vida. Pago el 1 de cada mes (desde 25€)." },
          ],
        },
      ],
      contactNudge:
        "¿Buscas una respuesta más concreta o quieres hablarnos de un caso particular? Escríbenos a hello@backmesdo.com — un humano responde en 24h.",
    },
    cta: {
      headline: "Empieza ahora",
      body: "Gratis. Sin tarjeta. Registro en menos de un minuto.",
      button: "Crear mi cuenta",
    },
    footer: {
      tagline: "Dinero compartido. Amistades protegidas.",
      rights: "Todos los derechos reservados.",
      privacy: "Privacidad",
      terms: "Términos",
      contact: "Contacto",
    },
  },
  pt: {
    meta: {
      title: "BMD · Dinheiro partilhado sem drama",
      description:
        "BMD ajuda a diáspora africana a gerir tontinas, partilhas, viagens e eventos em grupo com transparência e equidade.",
    },
    nav: {
      story: "A nossa história",
      features: "Recursos",
      howItWorks: "Como funciona",
      pricing: "Preços",
      login: "Entrar",
      signUp: "Criar conta",
    },
    langPicker: { main: "Línguas principais", europeanGroup: "Línguas europeias", asianGroup: "Línguas asiáticas", arabicGroup: "Línguas árabes", africanGroup: "Línguas africanas" },
    story: {
      kicker: "A nossa história",
      title: "O dinheiro nunca devia custar uma amizade",
      punchline: "Todos vivemos aquele jantar onde o restaurante virou tribunal. Aquela tontina onde ninguém sabia quem tinha pago. Aquela viagem entre primos que terminou num grupo de WhatsApp gelado.",
      chapters: [
        { icon: "🌍", title: "O problema", body: "A inflação devora tudo. O custo de vida explode na Europa, em Camarões, em Dakar, em Mumbai. Cada euro conta — e cada euro mal contado vira silêncio, ressentimento, relação quebrada." },
        { icon: "💔", title: "A tensão", body: "Folhas Excel ilegíveis. WhatsApp não calcula. Apps ocidentais não entendem tontinas, o franco CFA, ou a realidade de uma partilha de 6 estudantes em Paris." },
        { icon: "🕊", title: "A solução", body: "BMD. Uma ferramenta para quem realmente partilha o seu dinheiro. Multimoeda (25+), multilíngue (20+), tontinas, swap de dívidas, OCR, bot WhatsApp. Sem drama, sem rastreadores, sem publicidade." },
      ],
      manifesto: "« Contamos cada cêntimo — para nunca ter que contar os nossos amigos. »",
      cta: "Começar grátis",
    },
    hero: {
      tagline: "Back Mes Do · Diáspora",
      headline: "Dinheiro partilhado. Amizades protegidas.",
      subhead:
        "Tontinas, partilhas, viagens, casamentos, paróquias, clubes: BMD calcula, simplifica e regista cada despesa para que ninguém se sinta prejudicado.",
      ctaPrimary: "Começar grátis",
      ctaSecondary: "Ver demo",
    },
    features: {
      title: "Tudo o que precisas, nada a mais",
      items: [
        {
          icon: "🪙",
          title: "Tontinas completas",
          body: "Ciclo, ordem dos beneficiários, datas ajustáveis, confirmações, histórico ao longo dos anos.",
        },
        {
          icon: "💸",
          title: "Despesas partilhadas",
          body: "Iguais, partes ou percentagens. Comprovativos foto/PDF visíveis a todos, editáveis só pelo criador.",
        },
        {
          icon: "↔",
          title: "Troca de dívida",
          body: "Compensa ou transfere uma dívida a outro membro, com validação das três partes envolvidas.",
        },
        {
          icon: "🔔",
          title: "Notificações completas",
          body: "Cada evento importante gera uma notificação. Anti-spam: sem autonotificações.",
        },
        {
          icon: "📷",
          title: "OCR de recibos",
          body: "Digitaliza o recibo: valor, comerciante, data detectados automaticamente.",
        },
        {
          icon: "🛡",
          title: "RGPD e privacidade",
          body: "Sem leitura em massa de contactos. Consentimento explícito, direito ao esquecimento.",
        },
      ],
    },
    howItWorks: {
      title: "Em três passos",
      steps: [
        {
          num: "1",
          title: "Cria o teu grupo",
          body: "Tontina, partilha, viagem, casamento… escolhe o tipo e a moeda padrão.",
        },
        {
          num: "2",
          title: "Convida o teu círculo",
          body: "Link partilhável, QR code, ou contactos do telefone (com o teu consentimento).",
        },
        {
          num: "3",
          title: "Vive tranquilo",
          body: "Regista despesas, cotizações, trocas. BMD calcula saldos e sugere os melhores acertos.",
        },
      ],
    },
    pricing: {
      title: "Grátis para a maioria",
      free: {
        name: "Grátis",
        price: "0 €",
        features: [
          "Até 3 grupos ativos",
          "Tontinas, despesas, trocas ilimitadas",
          "Comprovativos PDF/fotos",
          "Notificações completas",
        ],
      },
      pro: {
        name: "Pro",
        price: "4,99 € / mês",
        features: [
          "Grupos ilimitados",
          "Exportação contabilística detalhada",
          "Histórico de 10 anos",
          "Suporte prioritário",
        ],
        cta: "Em breve",
      },
    },
    faq: {
      title: "Perguntas frequentes",
      items: [
        {
          q: "BMD substitui um banco?",
          a: "Não. BMD é uma ferramenta de gestão partilhada. Os pagamentos passam pelos teus canais habituais (Lydia, Wave, Mobile Money, transferência). BMD regista, calcula, simplifica.",
        },
        {
          q: "Os meus dados estão seguros?",
          a: "Sim. Encriptamos as comunicações, nunca lemos os teus contactos sem consentimento explícito, e podes exportar ou apagar os teus dados a qualquer momento (RGPD).",
        },
        {
          q: "Como funciona uma tontina no BMD?",
          a: "Crias o grupo, fixas o valor e a frequência (mensal, quinzenal, semanal). Em cada volta, o beneficiário escolhe a data dentro do mês e todos confirmam. Histórico ao longo dos anos.",
        },
      ],
    },
    featuresLong: {
      intro:
        "O BMD cobre todas as situações em que o dinheiro circula entre próximos: tontinas, partilhas, viagens, casamentos, paróquias, clubes, equipas. Aqui está o que podes fazer, organizado por tema.",
      categories: [
        {
          key: "groups",
          icon: "👥",
          label: "Grupos & papéis",
          pitch: "Cria o tipo certo de grupo em 30 segundos. Cada tipo tem a sua própria lógica e toda a gente sabe o que fazer.",
          items: [
            { icon: "🎭", title: "6 tipos pré-definidos", body: "Tontina · Partilha de casa · Viagem · Evento · Clube · Paróquia / Associação. Cada um com atalhos próprios." },
            { icon: "🛡", title: "Papéis claros", body: "Admin (edita regras), tesoureiro (segue pagamentos), membro (regista despesas). Tudo rastreável sem hierarquia pesada." },
            { icon: "✉️", title: "Convites multicanal", body: "Link partilhável, código QR, contactos do telefone (com consentimento explícito). Lembretes automáticos no dia 2 e 5." },
            { icon: "🎨", title: "Tema por comunidade", body: "Escolhe a identidade visual do teu grupo (Bogolan, Wax, Kente…). O grupo tem personalidade." },
          ],
        },
        {
          key: "expenses",
          icon: "💸",
          label: "Despesas partilhadas",
          pitch: "Registar uma despesa deve demorar 5 segundos. BMD oferece foto do recibo, sugestão de divisão, deteção de anomalias e conversão automática.",
          items: [
            { icon: "📷", title: "OCR de recibos (foto, PDF)", body: "Foto do recibo: valor, comerciante e data detetados automaticamente. Três motores (Mindee, GPT-4o Vision, Tesseract) com fallback transparente." },
            { icon: "⚖️", title: "Divisão: igual · partes · percentagens", body: "Modo igualitário em 1 clique, partes personalizadas ou percentagens exatas. Ideal para casas partilhadas com quartos diferentes." },
            { icon: "🤖", title: "Sugestão IA de divisão", body: "À medida que registas, o BMD aprende os teus hábitos e propõe o modo certo automaticamente." },
            { icon: "📜", title: "Regras por categoria", body: "\"Toda a compra Continente vai para Coloc\": cria a regra uma vez, BMD aplica em cada scan ou importação." },
            { icon: "🚨", title: "Deteção de anomalias", body: "Duplicados, valores atípicos, despesas fora do habitual: um aviso aparece antes de todos validarem." },
            { icon: "🏦", title: "Importação bancária CSV", body: "Importa o teu extrato bancário em CSV. BMD propõe categorização e divisão automaticamente." },
          ],
        },
        {
          key: "tontines",
          icon: "🪙",
          label: "Tontinas & ciclos",
          pitch: "Tontina bamiléké, hui chinês, susu — todos os modelos de poupança rotativa suportados, com dupla validação e histórico inalterável.",
          items: [
            { icon: "🔄", title: "Ciclo automatizado", body: "Define o valor, a frequência e a ordem de beneficiários. Em cada volta, o destinatário escolhe a data dentro do mês." },
            { icon: "🤝", title: "Dupla validação", body: "O pagador declara, o tesoureiro confirma. Ninguém pode dizer \"já paguei\" sem o registo dos dois lados." },
            { icon: "📅", title: "Vista calendário", body: "Todas as voltas futuras visíveis. Vês de relance quem recebe o quê e quando nos próximos 12 meses." },
            { icon: "🎯", title: "Leilões (Hui)", body: "Para comunidades chinesas: em cada volta, licitas para adiantar o teu pagamento. BMD calcula o juro efetivo." },
            { icon: "📚", title: "Histórico multianual", body: "Registo imutável: 5 anos mínimo. Exportação completa quando quiseres." },
          ],
        },
        {
          key: "settle",
          icon: "↔",
          label: "Saldos & acertos",
          pitch: "BMD calcula o mínimo de transações para acertar o grupo. Sem mais folhas de cálculo.",
          items: [
            { icon: "🧮", title: "Saldos em tempo real", body: "Saldo global multimoeda, saldo por grupo na moeda local. Recalculado instantaneamente." },
            { icon: "🎯", title: "Acerto ótimo", body: "Algoritmo \"fluxo mínimo\": 1 transação em vez de 2 ou 3 quando possível." },
            { icon: "🔁", title: "Swap & transferência de dívida", body: "Compensa ou transfere uma dívida a outro membro. Validação a 3 anti-fraude." },
            { icon: "🔗", title: "Links de pagamento únicos", body: "Gera um link seguro para um membro pagar via Lydia, Wave, transferência. Expira após uso." },
          ],
        },
        {
          key: "money",
          icon: "💱",
          label: "Multimoeda & pagamentos",
          pitch: "BMD é feito para a diáspora. 25+ moedas, taxas de câmbio atualizadas a cada hora, conversões transparentes.",
          items: [
            { icon: "🌍", title: "25+ moedas em tempo real", body: "Euro, dólar, libra, franco CFA (XAF/XOF), naira, dirham, rand, real… Open Exchange Rates." },
            { icon: "💳", title: "Compatível com as tuas ferramentas", body: "Lydia, Wave, Orange Money, MTN MoMo, Wise, transferência SEPA, PayPal, MB Way. BMD não substitui — regista." },
            { icon: "📈", title: "Conversão em tempo real", body: "Uma despesa em XAF aparece a cada membro na SUA moeda por defeito, à taxa do dia." },
            { icon: "🧾", title: "Recibos fiscais descarregáveis", body: "Para paróquias, associações, clubes desportivos: gera recibos PDF com o NIF aplicável." },
          ],
        },
        {
          key: "comms",
          icon: "🔔",
          label: "Comunicação & lembretes",
          pitch: "Tudo é gerido por notificação — anti-spam por design, e escolhes o tom dos lembretes.",
          items: [
            { icon: "🛎", title: "Notificações precisas", body: "Recebes APENAS o que te diz respeito. Nunca \"X fez algo no teu grupo\"." },
            { icon: "📅", title: "Resumo semanal", body: "Cada domingo à noite, um resumo claro: o que aconteceu, o teu saldo, dívidas em aberto." },
            { icon: "💬", title: "Bot WhatsApp nativo", body: "Adiciona despesas por voz ou texto. BMD reconhece, organiza, pede confirmação." },
            { icon: "😊", title: "Tom à escolha", body: "Simpático, firme, humor, profissional: escolhe o tom dos lembretes que BMD envia em teu nome." },
            { icon: "🌙", title: "Não perturbar por grupo", body: "Silencia um grupo por 1h, 24h ou até amanhã. Ideal para viagens onde toda a gente publica às 4h." },
          ],
        },
        {
          key: "intelligence",
          icon: "🧠",
          label: "Inteligência & automatizações",
          pitch: "BMD usa IA para eliminar burocracia, não para spammear. Confidencial, local ou via fornecedores RGPD.",
          items: [
            { icon: "🎙", title: "Entrada por voz Whisper", body: "Voz por WhatsApp ou na app: BMD transcreve, percebe, organiza." },
            { icon: "📊", title: "Estatísticas & insights", body: "Evolução mensal, repartição por categoria, gasto médio por grupo. Sem trackers nem publicidade." },
            { icon: "🌐", title: "Auto-tradução de conteúdos admin", body: "Paróquias e associações com mensagens multilingues. BMD traduz automaticamente com revisão opcional." },
            { icon: "🔮", title: "Anomalias & duplicados", body: "Uma despesa de 1 200€ quando costumas 50€? Mesmo restaurante faturado duas vezes? BMD avisa antes do drama." },
          ],
        },
        {
          key: "trust",
          icon: "🛡",
          label: "Segurança & privacidade",
          pitch: "RGPD by design. Os teus contactos nunca são lidos em massa. Sem palavra-passe, sem cookies de tracking.",
          items: [
            { icon: "🔑", title: "Login sem palavra-passe", body: "OTP por SMS, email ou WhatsApp. Passkeys (Face ID / Touch ID / Windows Hello). SSO Google e Apple opcionais." },
            { icon: "🚫", title: "Zero leitura da agenda", body: "BMD NUNCA lê a tua lista de contactos. Apenas os que selecionas explicitamente são transmitidos." },
            { icon: "📜", title: "Registo imutável", body: "Operações sensíveis são append-only, assinadas, conservadas 5 anos. Anti-falsificação." },
            { icon: "🇪🇺", title: "RGPD completo", body: "Exportação JSON/CSV, eliminação sob pedido em 30 dias, registo de subcontratantes público." },
            { icon: "🌐", title: "Hosting UE", body: "Bases de dados e servidores na UE. Sem transferências fora da UE sem cláusulas contratuais." },
          ],
        },
        {
          key: "platform",
          icon: "📱",
          label: "Plataformas & acessibilidade",
          pitch: "Uma verdadeira app nativa no telefone, um verdadeiro portal web no computador.",
          items: [
            { icon: "📲", title: "PWA instalável", body: "Em iPhone, Android ou desktop: instala BMD como uma app real, funciona offline para consulta." },
            { icon: "💬", title: "Bot WhatsApp", body: "Liga o teu número WhatsApp em 30s: adicionar despesas, consultar saldo, validar — sem sair do WhatsApp." },
            { icon: "🌍", title: "Multilingue (FR · EN · ES · PT · AR · SW)", body: "A interface adapta-se à tua língua preferida. Árabe e RTL geridas nativamente." },
            { icon: "♿", title: "Acessibilidade WCAG 2.1 AA", body: "Contraste validado, navegação por teclado, suporte de leitores de ecrã, modo claro/escuro." },
            { icon: "🌗", title: "Modo claro / escuro", body: "Alterna com 1 clique no ícone ☀️/🌙. App e site mudam juntos. Persiste entre sessões." },
          ],
        },
      ],
    },
    referral: {
      kicker: "Programa comercial",
      title: "Recomenda BMD, ganha em cada subscrição",
      intro:
        "BMD tem um programa de afiliação simples — sem níveis, sem pirâmide. Recomenda BMD à tua rede ou a organizações — cada inscrição que se torne paga gera-te comissão, vitalícia enquanto a pessoa continuar cliente.",
      benefits: [
        { icon: "💰", title: "Comissão direta", body: "20% do valor mensal pago (ou one-shot para o plano Evento) pelos utilizadores que recomendaste. Pago no dia 1 de cada mês." },
        { icon: "♾️", title: "Recorrente vitalício", body: "Enquanto o teu indicado se mantiver subscrito, recebes a tua comissão — sem teto, sem expiração." },
        { icon: "📊", title: "Espaço comercial dedicado", body: "Painel claro: quem se inscreveu por ti, quem passou a pago, o teu MRR, receita prevista, histórico de pagamentos." },
        { icon: "🎁", title: "Bónus para o indicado", body: "O teu indicado também recebe um desconto (1 mês grátis no plano anual, ou 10% para a vida). Ofereces uma prenda." },
      ],
      howItWorks: [
        { num: "1", title: "Ativa o espaço comercial", body: "Do teu perfil → Espaço comercial → \"Ativar\". Recebes um código personalizado e um link." },
        { num: "2", title: "Partilha com a tua rede", body: "À tua paróquia, clube de futebol, amigos da diáspora. O link pré-preenche o código." },
        { num: "3", title: "Acompanha as inscrições", body: "Cada clique, inscrição e conversão a plano pago aparece em tempo real." },
        { num: "4", title: "Recebe a tua comissão", body: "Pagamento automático no dia 1 de cada mês (a partir de 25 €). Lydia, Wave, transferência SEPA ou Mobile Money." },
      ],
      cta: { label: "Descobrir o programa", href: "/dashboard/affiliate" },
      smallPrint:
        "Sem níveis, sem marketing piramidal. Apenas um nível (tu → o teu indicado), comissão fixa e transparente. Condições completas no espaço comercial após ativação.",
    },
    faqLong: {
      intro:
        "As perguntas mais comuns, agrupadas por tema. Se não encontrares a tua resposta, escreve para hello@backmesdo.com — respondemos em 24h.",
      categories: [
        {
          key: "basics",
          icon: "👋",
          label: "Bases",
          items: [
            { q: "O que é BMD numa frase?", a: "Uma app que ajuda grupos a gerir o dinheiro partilhado sem drama: tontinas, partilhas, viagens, casamentos, paróquias, clubes." },
            { q: "BMD substitui o meu banco ou Lydia?", a: "Não. BMD não move dinheiro. Continuas a pagar pelos teus canais habituais. BMD regista, calcula e propõe o acerto mínimo." },
            { q: "Quanto custa?", a: "Plano Grátis: 3 grupos ativos, tontinas/despesas/swaps ilimitados. Pro a 4,99 €/mês. Plano Evento a 29 € one-shot." },
            { q: "Em que dispositivos funciona?", a: "iPhone (iOS 15+), Android (9+) e qualquer computador moderno. Também via bot WhatsApp." },
            { q: "Todos os meus próximos têm de se inscrever?", a: "Não imediatamente. Podes criar grupos com \"perfis sombra\" (só nome + telefone)." },
          ],
        },
        {
          key: "groups",
          icon: "👥",
          label: "Grupos & convites",
          items: [
            { q: "Que tipos de grupos posso criar?", a: "6 tipos: Tontina, Partilha de casa, Viagem, Evento, Clube, Paróquia/Associação." },
            { q: "Tamanho máximo de grupo?", a: "Sem limite estrito. Temos paróquias com 300+ membros e tudo funciona suavemente." },
            { q: "Como convido alguém?", a: "Link partilhável, QR code, ou contactos com consentimento. Lembretes automáticos ao dia 2 e 5." },
            { q: "Posso retirar um membro?", a: "Sim, o admin pode retirar. As despesas passadas ficam no histórico (anti-fraude)." },
            { q: "Os convidados veem os meus outros grupos?", a: "Nunca. Cada grupo é estanque." },
          ],
        },
        {
          key: "tontines",
          icon: "🪙",
          label: "Tontinas",
          items: [
            { q: "Como funciona uma tontina no BMD?", a: "Crias o grupo, fixas valor e frequência. Em cada volta, o beneficiário escolhe a data exata. BMD traça tudo, conserva 5 anos mínimo." },
            { q: "Diferenças entre bamiléké, hui chinês e susu?", a: "Mesmo princípio (poupança rotativa), diferentes na ordem e mecanismo. BMD suporta os três." },
            { q: "E se alguém não pagar?", a: "O tesoureiro vê quem não confirmou. BMD envia lembrete automático no tom escolhido." },
            { q: "Posso seguir uma tontina por vários anos?", a: "Sim, histórico 5 anos mínimo, exportação Excel quando quiseres." },
          ],
        },
        {
          key: "money",
          icon: "💱",
          label: "Moedas & pagamentos",
          items: [
            { q: "Que moedas BMD suporta?", a: "25+ moedas ativas. Taxas atualizadas a cada hora via Open Exchange Rates." },
            { q: "Como funciona a conversão entre moedas?", a: "Cada membro vê o valor na SUA moeda por defeito, à taxa do dia." },
            { q: "BMD cobra comissão pelos pagamentos?", a: "Nunca. BMD não move dinheiro. O teu canal habitual aplica as suas próprias taxas." },
            { q: "Que métodos de pagamento são compatíveis?", a: "Todos. Lydia, Wave, MoMo, Wise, MB Way, SEPA, PayPal, dinheiro." },
            { q: "Como pago o plano BMD?", a: "Stripe Checkout seguro: cartão, Apple Pay, Google Pay, débito direto SEPA." },
          ],
        },
        {
          key: "expenses",
          icon: "💸",
          label: "Despesas & comprovativos",
          items: [
            { q: "Como digitalizo um recibo?", a: "Foto ou PDF. BMD deteta valor, comerciante e data automaticamente. Três motores OCR com fallback." },
            { q: "Quem pode editar uma despesa?", a: "Apenas o criador e o admin do grupo. Cada edição é registada no log de auditoria." },
            { q: "Como divido de forma desigual?", a: "Três modos: igual, partes personalizadas, percentagens exatas. Também podes excluir um membro." },
            { q: "BMD deteta duplicados?", a: "Sim, automaticamente. Aparece um aviso ⚠️ com sugestão de fusão." },
            { q: "Posso importar o meu extrato bancário?", a: "Sim, em CSV. BMD reconhece os formatos dos principais bancos." },
          ],
        },
        {
          key: "settle",
          icon: "↔",
          label: "Saldos & acertos",
          items: [
            { q: "Como BMD calcula quem deve a quem?", a: "Algoritmo \"fluxo mínimo\": encontra o número MÍNIMO de transações para acertar todos." },
            { q: "O que é um swap de dívida?", a: "Quando um membro assume a dívida de outro. Validação a 3 anti-fraude." },
            { q: "Como marco uma dívida como paga?", a: "No grupo → Saldos → \"Acertar\" → escolhes canal → confirmas. O credor confirma a receção." },
            { q: "E se disserem que pagaram mas não recebi?", a: "Por isso BMD pede confirmação dos dois lados. Lembretes automáticos ao 7º dia." },
          ],
        },
        {
          key: "privacy",
          icon: "🛡",
          label: "Privacidade & segurança",
          items: [
            { q: "Os meus dados estão seguros?", a: "Sim. Conexões cifradas TLS 1.3, sem palavras-passe, sem leitura massiva. Hosting UE. RGPD completo." },
            { q: "Como funciona o login sem palavra-passe?", a: "Introduz o teu telefone ou email, recebes um código de 6 dígitos, introduces. Expira em 5 min." },
            { q: "O que é uma passkey?", a: "Uma chave biométrica (Face ID, Touch ID). Mais rápida e anti-phishing." },
            { q: "BMD lê os meus contactos?", a: "NUNCA em bulk. Só os que selecionas explicitamente são transmitidos." },
            { q: "Posso apagar a minha conta?", a: "Sim, do teu perfil → Privacidade. Efetivo em 30 dias (RGPD)." },
            { q: "Posso exportar todos os meus dados?", a: "Sim, em JSON ou CSV. Recebes um email com o ficheiro em 24h." },
          ],
        },
        {
          key: "billing",
          icon: "💳",
          label: "Faturação & planos",
          items: [
            { q: "O que inclui o plano Grátis?", a: "Até 3 grupos ativos, tontinas/despesas/swaps ilimitados, recibos foto e PDF, OCR (3/mês)." },
            { q: "E o plano Pro a 4,99 €/mês?", a: "Grupos ilimitados, OCR ilimitado, exportação contabilística, histórico 10 anos, suporte prioritário." },
            { q: "O que é o plano Evento a 29 €?", a: "Pagamento único (não subscrição) para grandes eventos pontuais. Acesso Pro durante 6 meses no grupo." },
            { q: "Posso cancelar quando quiser?", a: "Sim, do teu perfil. Sem custos. Mantém acesso até ao fim do período pago." },
            { q: "O preço muda conforme o país?", a: "Sim, BMD adapta às zonas (paridade de poder de compra). Mais acessível em África Lusófona." },
            { q: "Como funciona o programa de afiliação?", a: "Ativa o espaço comercial → recebe código pessoal → partilha → ganha 20% vitalício. Pagamento dia 1 de cada mês." },
          ],
        },
      ],
      contactNudge:
        "Procuras uma resposta mais específica ou queres falar de um caso particular? Escreve para hello@backmesdo.com — um humano responde em 24h.",
    },
    cta: {
      headline: "Começa agora",
      body: "Grátis. Sem cartão. Inscrição em menos de um minuto.",
      button: "Criar a minha conta",
    },
    footer: {
      tagline: "Dinheiro partilhado. Amizades protegidas.",
      rights: "Todos os direitos reservados.",
      privacy: "Privacidade",
      terms: "Termos",
      contact: "Contacto",
    },
  },
  // ============================================================
  // Deutsch — diaspora franco-/germanophone (Allemagne, Suisse, Autriche)
  // ============================================================
  de: {
    meta: {
      title: "BMD · Geteiltes Geld, ohne Drama",
      description:
        "BMD hilft der afrikanischen Diaspora, Tontinen, WGs, Reisen und Gruppenveranstaltungen zu verwalten — Transparenz, Fairness, Seelenfrieden.",
    },
    nav: {
      story: "Unsere Geschichte",
      features: "Funktionen",
      howItWorks: "So funktioniert's",
      pricing: "Preise",
      login: "Anmelden",
      signUp: "Konto erstellen",
    },
    langPicker: { main: "Hauptsprachen", europeanGroup: "Europäische Sprachen", asianGroup: "Asiatische Sprachen", arabicGroup: "Arabische Sprachen", africanGroup: "Afrikanische Sprachen" },
    story: {
      kicker: "Unsere Geschichte",
      title: "Geld sollte niemals eine Freundschaft kosten",
      punchline: "Wir alle hatten dieses Abendessen, bei dem das Restaurant zum Gerichtssaal wurde. Diese Tontine, wo niemand mehr wusste, wer bezahlt hatte. Diese Cousin-Reise, die in einer eisigen WhatsApp-Gruppe endete.",
      chapters: [
        { icon: "🌍", title: "Das Problem", body: "Inflation frisst alles. Lebenshaltungskosten explodieren in Europa, Kamerun, Dakar, Mumbai. Jeder Euro zählt — und jeder schlecht gezählte Euro wird zu Schweigen, Groll, einer zerbrochenen Beziehung." },
        { icon: "💔", title: "Die Spannung", body: "Excel-Tabellen sind unleserlich. WhatsApp rechnet nicht. Westliche Apps verstehen weder Tontinen, noch den CFA-Franc, noch die Realität einer 6er-WG in Paris." },
        { icon: "🕊", title: "Die Lösung", body: "BMD. Ein Tool für die, die ihr Geld wirklich teilen. Multi-Währung (25+), mehrsprachig (20+), Tontinen, Schuldentausch, Beleg-OCR, WhatsApp-Bot. Ohne Drama, ohne Tracker, ohne Werbung." },
      ],
      manifesto: "„Wir zählen jeden Cent — damit wir nie unsere Freunde zählen müssen.\"",
      cta: "Kostenlos starten",
    },
    hero: {
      tagline: "Back Mes Do · Diaspora",
      headline: "Geteiltes Geld. Geschützte Freundschaften.",
      subhead:
        "Tontinen, WGs, Reisen, Hochzeiten, Pfarreien, Vereine: BMD berechnet, vereinfacht und dokumentiert jede Ausgabe, damit sich niemand benachteiligt fühlt.",
      ctaPrimary: "Kostenlos starten",
      ctaSecondary: "Demo ansehen",
    },
    features: {
      title: "Alles, was du brauchst — nichts mehr",
      items: [
        { icon: "🪙", title: "Vollständige Tontinen", body: "Zyklus, Reihenfolge der Empfänger, anpassbare Termine, Quittungen, mehrjährige Historie." },
        { icon: "💸", title: "Geteilte Ausgaben", body: "Gleich, Anteile oder Prozentsätze. Foto/PDF-Belege für alle sichtbar." },
        { icon: "↔", title: "Schuldentausch", body: "Schulden ausgleichen oder übertragen — mit Drei-Parteien-Validierung." },
        { icon: "🔔", title: "Smarte Benachrichtigungen", body: "Du erhältst nur, was dich betrifft. Kein Spam, keine Selbst-Benachrichtigungen." },
        { icon: "📷", title: "Beleg-OCR", body: "Foto vom Kassenbon: Betrag, Händler, Datum werden automatisch erkannt." },
        { icon: "🛡", title: "DSGVO & Privatsphäre", body: "Kein Massenlesen des Adressbuchs. Ausdrückliche Einwilligung." },
      ],
    },
    featuresLong: {
      intro:
        "BMD deckt jede Situation ab, in der Geld zwischen Nahestehenden zirkuliert: Tontinen, WGs, Reisen, Hochzeiten, Pfarreien, Vereine, Teams. Hier ist alles, was du tun kannst — nach Themen geordnet.",
      categories: [
        { key: "groups", icon: "👥", label: "Gruppen & Rollen", pitch: "Erstelle in 30 Sekunden den richtigen Gruppentyp. Jeder Typ hat seine eigene Logik, und alle wissen, wer was tut.",
          items: [
            { icon: "🎭", title: "6 vorgefertigte Gruppentypen", body: "Tontine · WG · Reise · Event (Hochzeit, Party) · Verein · Pfarrei/Verband. Jeder mit eigener Sprache." },
            { icon: "🛡", title: "Klare Rollen", body: "Admin (Regeln), Kassenwart (Zahlungen), Mitglied (Ausgaben). Alles nachvollziehbar ohne starre Hierarchie." },
            { icon: "✉️", title: "Multi-Kanal-Einladungen", body: "Teilbarer Link, QR-Code, Telefonkontakte (mit ausdrücklicher Zustimmung). Auto-Erinnerungen Tag 2 und 5." },
            { icon: "🎨", title: "Community-Themes", body: "Wähle die visuelle Identität deiner Gruppe (Bogolan, Wax, Kente). Deine Gruppe hat Persönlichkeit." },
          ],
        },
        { key: "expenses", icon: "💸", label: "Geteilte Ausgaben", pitch: "Eine Ausgabe einzutragen sollte 5 Sekunden dauern. BMD bietet Belegfoto, Aufteilungsvorschlag, Anomalieerkennung, automatische Währungsumrechnung.",
          items: [
            { icon: "📷", title: "Beleg-OCR (Foto, PDF, Scan)", body: "Foto vom Kassenbon: Betrag, Händler, Datum automatisch erkannt. Drei Engines (Mindee, GPT-4o Vision, Tesseract) mit Fallback." },
            { icon: "⚖️", title: "Aufteilung: gleich · Anteile · Prozent", body: "1-Klick-Gleichaufteilung, individuelle Anteile pro Mitglied oder exakte Prozente. Ideal für WGs mit unterschiedlichen Zimmern." },
            { icon: "🤖", title: "KI-Aufteilungsvorschläge", body: "Während du eingibst, lernt BMD deine Gewohnheiten und schlägt automatisch den richtigen Modus vor." },
            { icon: "📜", title: "Kategorienregeln", body: "\"Alle Edeka-Einkäufe gehen in WG\": Regel einmal erstellen, BMD wendet sie bei jedem Scan an." },
            { icon: "🚨", title: "Anomalieerkennung", body: "Duplikate, atypische Beträge, Ausreißer: Eine Warnung erscheint, bevor alle bestätigen." },
            { icon: "🏦", title: "Bank-CSV-Import", body: "Importiere deinen Kontoauszug. BMD schlägt Kategorisierung und Aufteilung automatisch vor." },
          ],
        },
        { key: "tontines", icon: "🪙", label: "Tontinen & Zyklen", pitch: "Bamiléké-Tontine, chinesische Hui, karibische Susu — alle rotierenden Sparmodelle werden unterstützt, mit Vier-Augen-Validierung und unveränderlicher Historie.",
          items: [
            { icon: "🔄", title: "Vollautomatischer Zyklus", body: "Lege Betrag, Frequenz und Empfängerreihenfolge fest. In jeder Runde wählt der Empfänger den genauen Termin." },
            { icon: "🤝", title: "Doppelvalidierung der Beiträge", body: "Zahler erklärt, Kassenwart bestätigt. Niemand kann \"ich habe gezahlt\" sagen ohne Gegenstück." },
            { icon: "📅", title: "Kalenderansicht", body: "Alle künftigen Runden visuell dargestellt. Du siehst auf einen Blick, wer was wann bekommt." },
            { icon: "🎯", title: "Auktionen (Hui)", body: "Für chinesische Communities: Pro Runde wird geboten, um die eigene Auszahlung vorzuziehen." },
            { icon: "📚", title: "Mehrjährige Historie", body: "Unveränderliches Audit-Log: mindestens 5 Jahre. Vollexport jederzeit möglich." },
          ],
        },
        { key: "settle", icon: "↔", label: "Salden & Begleichungen", pitch: "BMD berechnet die minimale Anzahl Transaktionen zur Gruppenabrechnung. Keine Tabellen mehr.",
          items: [
            { icon: "🧮", title: "Echtzeit-Salden", body: "Globaler Multi-Währungs-Saldo, Saldo pro Gruppe in Lokalwährung. Sofortige Neuberechnung." },
            { icon: "🎯", title: "Optimale Begleichung", body: "\"Minimum Cash Flow\"-Algorithmus: 1 Transaktion statt 2 oder 3, wo möglich." },
            { icon: "🔁", title: "Schuldentausch & -übertragung", body: "Schulden ausgleichen oder an anderes Mitglied übertragen. 3-Wege-Validierung gegen Betrug." },
            { icon: "🔗", title: "Einmalige Zahlungslinks", body: "Generiere einen sicheren Link, damit ein Mitglied dich bezahlt. Verfällt nach Nutzung." },
          ],
        },
        { key: "money", icon: "💱", label: "Multi-Währung & Zahlungen", pitch: "BMD ist für die Diaspora gemacht. 25+ Währungen unterstützt, stündlich aktualisierte Wechselkurse.",
          items: [
            { icon: "🌍", title: "25+ Währungen mit Live-Kursen", body: "Euro, Dollar, Pfund, CFA-Franc (XAF/XOF), Naira, Dirham, Rand, Real, Schilling, Peso… Open Exchange Rates mit Fallback." },
            { icon: "💳", title: "Kompatibel mit deinen Tools", body: "Lydia, Wave, Orange Money, MTN MoMo, Wise, SEPA-Überweisung, PayPal. BMD ersetzt nicht — es zeichnet auf." },
            { icon: "📈", title: "Echtzeitumrechnung", body: "Eine XAF-Ausgabe wird jedem Mitglied in SEINER Standardwährung angezeigt, zum Tageskurs." },
            { icon: "🧾", title: "Steuerquittungen herunterladen", body: "Für Pfarreien, Verbände, Sportvereine: PDF-Quittungen mit deiner Steuer-ID." },
          ],
        },
        { key: "comms", icon: "🔔", label: "Kommunikation & Erinnerungen", pitch: "Alles wird per Benachrichtigung gesteuert — Anti-Spam by Design, und du wählst den Ton.",
          items: [
            { icon: "🛎", title: "Granulare Benachrichtigungen", body: "Du wirst NUR über Dinge informiert, die DICH betreffen. Niemals \"X hat etwas in deiner Gruppe getan\"." },
            { icon: "📅", title: "Wöchentliche Zusammenfassung", body: "Jeden Sonntagabend: was passierte, dein Saldo, deine offenen Schulden. 30 Sekunden." },
            { icon: "💬", title: "Nativer WhatsApp-Bot", body: "Ausgaben per Sprach- oder Textnachricht hinzufügen. BMD erkennt, ordnet, fragt nach Bestätigung." },
            { icon: "😊", title: "Wähle den Ton", body: "Freundlich, bestimmt, humorvoll, professionell: Wähle den Ton der Erinnerungen, die BMD an Spätzahler sendet." },
            { icon: "🌙", title: "Bitte nicht stören (pro Gruppe)", body: "Stumm für 1h, 24h oder bis morgen früh, ohne den Chat zu verlassen. Ideal für Reisen." },
          ],
        },
        { key: "intelligence", icon: "🧠", label: "Intelligenz & Automatisierung", pitch: "BMD nutzt KI, um Bürokratie zu beseitigen, nicht um zu spammen. Vertraulich, lokal oder über DSGVO-konforme Anbieter.",
          items: [
            { icon: "🎙", title: "Whisper-Spracheingabe", body: "Sprache via WhatsApp oder direkt in der App: BMD transkribiert, versteht, ordnet ein." },
            { icon: "📊", title: "Statistiken & Insights", body: "Monatliche Trends, Aufteilung nach Kategorie, Durchschnitt pro Gruppe. Ohne Tracker oder Werbung." },
            { icon: "🌐", title: "Auto-Übersetzung von Admin-Inhalten", body: "Pfarreien und Verbände haben oft mehrsprachige Mitteilungen. BMD übersetzt automatisch mit optionaler Prüfung." },
            { icon: "🔮", title: "Anomalien & Duplikate", body: "Ausgabe von 1.200€, wenn du sonst 50€ machst? Selbes Restaurant zweimal in 1 Minute? BMD warnt vor dem Drama." },
          ],
        },
        { key: "trust", icon: "🛡", label: "Sicherheit & Datenschutz", pitch: "DSGVO by Design. Deine Kontakte werden nie massenhaft gelesen. Keine Passwörter, keine Tracking-Cookies.",
          items: [
            { icon: "🔑", title: "Passwortlose Anmeldung", body: "OTP per SMS, E-Mail oder WhatsApp. Passkeys (Face ID / Touch ID / Windows Hello). Google- und Apple-SSO optional." },
            { icon: "🚫", title: "Null Adressbuch-Lesen", body: "BMD liest deine Kontaktliste NIE im Ganzen. Nur explizit ausgewählte Kontakte werden übertragen." },
            { icon: "📜", title: "Unveränderliches Audit-Log", body: "Sensible Operationen append-only, signiert, 5 Jahre aufbewahrt. Manipulationssicher." },
            { icon: "🇪🇺", title: "Volle DSGVO-Konformität", body: "JSON/CSV-Export aller Daten, Löschung auf Anfrage binnen 30 Tagen, öffentliches Auftragsverarbeiterregister." },
            { icon: "🌐", title: "EU-Hosting", body: "Datenbanken und Server in der EU-Region. Keine Übertragungen außerhalb der EU ohne Standard-Vertragsklauseln." },
          ],
        },
        { key: "platform", icon: "📱", label: "Plattformen & Barrierefreiheit", pitch: "Echte native App auf dem Handy, echtes Webportal auf dem PC. Plus WhatsApp-Bot für Chat-Liebhaber.",
          items: [
            { icon: "📲", title: "Installierbare PWA", body: "Auf iPhone, Android oder Desktop: Installiere BMD wie eine echte App, funktioniert offline für Browsen." },
            { icon: "💬", title: "WhatsApp-Bot", body: "Verknüpfe deine WhatsApp-Nummer in 30s: Ausgaben hinzufügen, Saldo prüfen — alles ohne WhatsApp zu verlassen." },
            { icon: "🌍", title: "Mehrsprachig (FR · EN · ES · PT · DE · IT · LB · RU · JA · KO · AR · SW)", body: "Die Oberfläche passt sich deiner bevorzugten Sprache an. Arabisch und andere RTL-Sprachen nativ unterstützt." },
            { icon: "♿", title: "WCAG 2.1 AA Barrierefreiheit", body: "Validierter Kontrast, Tastaturnavigation, Bildschirmlese-Unterstützung, Hell-/Dunkelmodus." },
            { icon: "🌗", title: "Hell- / Dunkelmodus", body: "1-Klick-Umschalten via ☀️/🌙-Symbol oben rechts. App und Website wechseln gemeinsam." },
          ],
        },
      ],
    },
    referral: {
      kicker: "Vertriebsprogramm",
      title: "Empfehle BMD, verdiene an jedem Abo",
      intro:
        "BMD hat ein einfaches Empfehlungsprogramm — keine Stufen, keine Pyramide. Empfehle BMD an Bekannte oder Organisationen — jede zahlende Anmeldung bringt dir lebenslange Provision, solange die Person Kunde bleibt.",
      benefits: [
        { icon: "💰", title: "Direkte Provision", body: "20% des monatlichen Beitrags (oder Einmalbetrag für Event-Plan) deiner Empfohlenen. Auszahlung am 1. jeden Monats." },
        { icon: "♾️", title: "Lebenslang wiederkehrend", body: "Solange dein Empfohlener Kunde bleibt, verdienst du — ohne Obergrenze, ohne Verfall. Eine 200-Mitglieder-Pfarrei kann tausende Euro/Jahr generieren." },
        { icon: "📊", title: "Eigenes Vertriebsdashboard", body: "Klare Übersicht: wer sich angemeldet hat, wer auf bezahlt umgestiegen ist, dein MRR, prognostizierte Einnahmen, Auszahlungshistorie." },
        { icon: "🎁", title: "Bonus für Empfohlene", body: "Dein Empfohlener bekommt auch Rabatt (1 Monat gratis im Jahresplan oder 10% lebenslang). Du schenkst — keine Belastung." },
      ],
      howItWorks: [
        { num: "1", title: "Vertriebsbereich aktivieren", body: "Profil → Vertriebsbereich → \"Aktivieren\". Du erhältst einen persönlichen Empfehlungscode (z.B. BMD-AICHA-23) und Link." },
        { num: "2", title: "Mit deinem Netzwerk teilen", body: "An deine Pfarrei, deinen Fußballverein, deine Diaspora-Freunde. Der Link füllt den Code automatisch." },
        { num: "3", title: "Anmeldungen verfolgen", body: "Jeder Klick, jede Anmeldung, jede Konvertierung erscheint in Echtzeit." },
        { num: "4", title: "Provision erhalten", body: "Automatische Auszahlung am 1. jeden Monats (ab 25€). Lydia, Wave, SEPA oder Mobile Money — du wählst." },
      ],
      cta: { label: "Programm entdecken", href: "/dashboard/affiliate" },
      smallPrint:
        "Keine Stufen, kein Pyramidenmarketing. Nur eine Ebene (du → dein Empfohlener), feste und transparente Provision. Vollständige Bedingungen nach Aktivierung.",
    },
    howItWorks: {
      title: "In drei Schritten",
      steps: [
        { num: "1", title: "Erstelle deine Gruppe", body: "Tontine, WG, Reise, Hochzeit… Wähle Typ und Standardwährung." },
        { num: "2", title: "Lade deine Liebsten ein", body: "Teilbarer Link, QR-Code oder Telefonkontakte (mit deiner Zustimmung)." },
        { num: "3", title: "Lebe entspannt", body: "Erfasse Ausgaben, Beiträge, Tausche. BMD berechnet Salden und schlägt optimale Begleichungen vor." },
      ],
    },
    pricing: {
      title: "Für die meisten kostenlos",
      free: {
        name: "Gratis",
        price: "0 €",
        features: ["Bis zu 3 aktive Gruppen", "Unbegrenzte Tontinen, Ausgaben, Tausche", "PDF-/Foto-Belege", "Vollständige Benachrichtigungen"],
      },
      pro: {
        name: "Pro",
        price: "4,99 € / Monat",
        features: ["Unbegrenzte Gruppen", "Detaillierter Buchhaltungsexport", "10 Jahre Historie", "Priorisierter Support"],
        cta: "Bald",
      },
    },
    faq: {
      title: "Häufige Fragen",
      items: [
        { q: "Ersetzt BMD eine Bank?", a: "Nein. BMD ist ein Tool zur gemeinsamen Verwaltung. Zahlungen erfolgen über deine üblichen Kanäle (Lydia, Wave, Mobile Money, Überweisung). BMD zeichnet auf, berechnet, vereinfacht." },
        { q: "Sind meine Daten sicher?", a: "Ja. Wir verschlüsseln Kommunikation, lesen nie dein Adressbuch ohne ausdrückliche Zustimmung und du kannst deine Daten jederzeit exportieren oder löschen (DSGVO)." },
        { q: "Wie funktionieren BMD-Tontinen?", a: "Du erstellst die Gruppe, legst Betrag und Frequenz fest. In jeder Runde wählt der Empfänger das genaue Datum innerhalb seines Monats und alle bestätigen." },
      ],
    },
    faqLong: {
      intro: "Die häufigsten Fragen, nach Themen gruppiert. Findest du keine Antwort, schreib uns an hello@backmesdo.com — wir antworten binnen 24h.",
      categories: [
        { key: "basics", icon: "👋", label: "Grundlagen",
          items: [
            { q: "Was ist BMD in einem Satz?", a: "Eine App, die Gruppen hilft, geteiltes Geld ohne Drama zu verwalten: Tontinen, WGs, Reisen, Hochzeiten, Pfarreien, Vereine." },
            { q: "Ersetzt BMD meine Bank oder Lydia?", a: "Nein. BMD bewegt kein Geld. Du zahlst weiter über deine üblichen Kanäle. BMD zeichnet auf, berechnet und schlägt minimale Begleichung vor." },
            { q: "Was kostet es?", a: "Gratis-Plan deckt das Meiste: 3 aktive Gruppen. Pro 4,99 €/Monat. Event-Plan 29 € einmalig für eine Hochzeit oder große Party." },
            { q: "Auf welchen Geräten funktioniert es?", a: "iPhone (iOS 15+), Android (9+), jeder moderne Computer. Auch via WhatsApp-Bot." },
            { q: "Müssen sich alle meine Liebsten registrieren?", a: "Nicht sofort. Du kannst Gruppen mit \"Schattenprofilen\" (nur Name + Telefon) erstellen." },
          ],
        },
        { key: "groups", icon: "👥", label: "Gruppen & Einladungen",
          items: [
            { q: "Welche Gruppentypen kann ich erstellen?", a: "6 vorgefertigte Typen: Tontine, WG, Reise, Event, Verein, Pfarrei/Verband." },
            { q: "Maximale Gruppengröße?", a: "Keine harte Grenze. Wir haben Pfarreien mit 300+ Mitgliedern und alles funktioniert flüssig." },
            { q: "Wie lade ich jemanden ein?", a: "Drei Optionen: teilbarer Link, QR-Code oder Auswahl aus Kontakten (mit ausdrücklicher Zustimmung). Auto-Erinnerungen Tag 2 und 5." },
            { q: "Kann ich ein Mitglied entfernen?", a: "Ja, der Admin kann jederzeit entfernen. Vergangene Ausgaben bleiben in der Historie (Anti-Betrug)." },
            { q: "Sehen Eingeladene meine anderen Gruppen?", a: "Niemals. Jede Gruppe ist isoliert." },
          ],
        },
        { key: "tontines", icon: "🪙", label: "Tontinen",
          items: [
            { q: "Wie funktioniert eine Tontine bei BMD?", a: "Du erstellst die Gruppe, legst Betrag und Frequenz fest. In jeder Runde wählt der Empfänger das genaue Datum, andere bestätigen ihren Beitrag." },
            { q: "Unterschied Bamiléké, chinesische Hui, karibische Susu?", a: "Gleiches Prinzip (rotierende Ersparnis), unterschiedlich in Reihenfolge und Mechanismus. BMD unterstützt alle drei." },
            { q: "Was wenn jemand seine Runde nicht zahlt?", a: "Der Kassenwart sieht sofort, wer nicht bestätigt hat. BMD sendet eine Auto-Erinnerung im gewählten Ton." },
            { q: "Kann ich eine Tontine über mehrere Jahre verfolgen?", a: "Ja, die Historie wird mindestens 5 Jahre aufbewahrt, Excel-Export jederzeit möglich." },
          ],
        },
        { key: "money", icon: "💱", label: "Währungen & Zahlungen",
          items: [
            { q: "Welche Währungen unterstützt BMD?", a: "25+ aktive Währungen. Kurse stündlich aktualisiert via Open Exchange Rates." },
            { q: "Wie funktioniert die Umrechnung?", a: "Jedes Mitglied sieht den Betrag in SEINER Standardwährung zum Tageskurs." },
            { q: "Nimmt BMD Provision auf Zahlungen?", a: "Nie. BMD bewegt kein Geld. Dein üblicher Kanal erhebt eigene Gebühren." },
            { q: "Welche Zahlungsmethoden sind kompatibel?", a: "Alle. Lydia, Wave, MoMo, Wise, SEPA, PayPal, Bargeld." },
            { q: "Wie zahle ich den BMD-Plan?", a: "Stripe Checkout sicher: Karte, Apple Pay, Google Pay, SEPA-Lastschrift." },
          ],
        },
        { key: "expenses", icon: "💸", label: "Ausgaben & Belege",
          items: [
            { q: "Wie scanne ich einen Beleg?", a: "Foto oder PDF, BMD erkennt Betrag, Händler und Datum automatisch." },
            { q: "Wer kann eine Ausgabe nach Erstellung bearbeiten?", a: "Nur Ersteller und Gruppen-Admin. Jede Änderung wird im Audit-Log protokolliert." },
            { q: "Wie teile ich ungleich auf?", a: "Drei Modi: gleich, individuelle Anteile, exakte Prozente. Du kannst auch ein Mitglied ausschließen." },
            { q: "Erkennt BMD Duplikate?", a: "Ja, automatisch. Ein ⚠️-Badge erscheint mit Verschmelzungsvorschlag." },
            { q: "Kann ich meinen Kontoauszug importieren?", a: "Ja, als CSV. BMD erkennt die Formate der wichtigsten Banken." },
          ],
        },
        { key: "settle", icon: "↔", label: "Salden & Begleichungen",
          items: [
            { q: "Wie berechnet BMD wer wem schuldet?", a: "\"Minimum Cash Flow\"-Algorithmus: findet die MINIMALE Anzahl Transaktionen zur Begleichung." },
            { q: "Was ist ein Schuldentausch?", a: "Wenn ein Mitglied die Schuld eines anderen übernimmt. 3-Wege-Validierung gegen Betrug." },
            { q: "Wie markiere ich eine Schuld als beglichen?", a: "In der Gruppe → Salden → \"Begleichen\" → Kanal wählen → bestätigen. Der Gläubiger bestätigt den Erhalt." },
            { q: "Was wenn jemand sagt sie hätten gezahlt?", a: "Genau deshalb fordert BMD Bestätigung beider Seiten. Auto-Erinnerung nach 7 Tagen." },
          ],
        },
        { key: "privacy", icon: "🛡", label: "Datenschutz & Sicherheit",
          items: [
            { q: "Sind meine Daten sicher?", a: "Ja. TLS 1.3-verschlüsselte Verbindungen, keine Passwörter, kein Massenlesen, keine Tracking-Cookies. EU-Hosting. Vollständige DSGVO-Konformität." },
            { q: "Wie funktioniert die passwortlose Anmeldung?", a: "Telefon oder E-Mail eingeben, 6-stelligen Code erhalten (SMS, E-Mail, WhatsApp), eingeben. Verfällt nach 5 min oder 1 Nutzung." },
            { q: "Was ist ein Passkey?", a: "Biometrischer Zugangsschlüssel (Face ID, Touch ID). Schneller und Phishing-sicher." },
            { q: "Liest BMD meine Kontakte?", a: "NIEMALS in Bulk. Nur explizit ausgewählte Kontakte werden übertragen." },
            { q: "Kann ich mein Konto löschen?", a: "Ja, vom Profil → Datenschutz. Wirksam binnen 30 Tagen (DSGVO)." },
            { q: "Kann ich alle meine Daten exportieren?", a: "Ja, in JSON oder CSV. Du erhältst eine E-Mail mit der Datei binnen 24h." },
          ],
        },
        { key: "billing", icon: "💳", label: "Abrechnung & Pläne",
          items: [
            { q: "Was ist im Gratis-Plan enthalten?", a: "Bis zu 3 aktive Gruppen gleichzeitig, unbegrenzte Tontinen/Ausgaben/Tausche, Foto- und PDF-Belege, OCR-Scan (3/Monat)." },
            { q: "Und der Pro-Plan zu 4,99 €/Monat?", a: "Unbegrenzte Gruppen, unbegrenztes OCR, detaillierter Buchhaltungsexport, 10 Jahre Historie, priorisierter Support." },
            { q: "Was ist der Event-Plan zu 29 €?", a: "Einmalzahlung (KEIN Abo) für große Events: Hochzeit, JGA, Firmenevent, Geburtstag. Pro-Funktionen 6 Monate auf der Gruppe." },
            { q: "Kann ich jederzeit kündigen?", a: "Ja, vom Profil. Keine Kündigungsgebühren. Zugriff bis Ende der bezahlten Periode." },
            { q: "Ändert sich der Preis je nach Land?", a: "Ja, BMD passt Tarife an Regionen an (Kaufkraftparität)." },
            { q: "Wie funktioniert das Empfehlungsprogramm?", a: "Vertriebsbereich aktivieren → persönlichen Code/Link erhalten → teilen → 20% lebenslang verdienen." },
          ],
        },
      ],
      contactNudge:
        "Suchst du eine spezifischere Antwort oder möchtest du über einen besonderen Fall sprechen? Schreib an hello@backmesdo.com — ein Mensch antwortet binnen 24h.",
    },
    cta: {
      headline: "Jetzt starten",
      body: "Kostenlos. Keine Kreditkarte. Anmeldung in unter einer Minute.",
      button: "Konto erstellen",
    },
    footer: {
      tagline: "Geteiltes Geld. Geschützte Freundschaften.",
      rights: "Alle Rechte vorbehalten.",
      privacy: "Datenschutz",
      terms: "AGB",
      contact: "Kontakt",
    },
  },
  // ============================================================
  // Italiano — diaspora italiana e Italia
  // ============================================================
  it: {
    meta: {
      title: "BMD · Soldi condivisi, senza drammi",
      description:
        "BMD aiuta la diaspora africana a gestire tontine, coinquilini, viaggi ed eventi di gruppo — trasparenza, equità, tranquillità.",
    },
    nav: {
      story: "La nostra storia",
      features: "Funzionalità",
      howItWorks: "Come funziona",
      pricing: "Prezzi",
      login: "Accedi",
      signUp: "Crea account",
    },
    langPicker: { main: "Lingue principali", europeanGroup: "Lingue europee", asianGroup: "Lingue asiatiche", arabicGroup: "Lingue arabe", africanGroup: "Lingue africane" },
    story: {
      kicker: "La nostra storia",
      title: "Il denaro non dovrebbe mai costare un'amicizia",
      punchline: "Tutti abbiamo vissuto quella cena dove il ristorante è diventato tribunale. Quella tontina dove nessuno sapeva chi avesse pagato. Quel viaggio tra cugini finito in un gruppo WhatsApp gelato.",
      chapters: [
        { icon: "🌍", title: "Il problema", body: "L'inflazione divora tutto. Il costo della vita esplode in Europa, in Camerun, a Dakar, a Mumbai. Ogni euro conta — e ogni euro mal contato diventa silenzio, rancore, relazione spezzata." },
        { icon: "💔", title: "La tensione", body: "Excel è illeggibile. WhatsApp non calcola. Le app occidentali non capiscono le tontine, il franco CFA, o la realtà di una coabitazione di 6 studenti a Parigi." },
        { icon: "🕊", title: "La soluzione", body: "BMD. Uno strumento per chi condivide davvero i propri soldi. Multivaluta (25+), multilingue (20+), tontine, swap di debiti, OCR, bot WhatsApp. Senza drammi, senza tracker, senza pubblicità." },
      ],
      manifesto: "« Contiamo ogni centesimo — per non dover mai contare i nostri amici. »",
      cta: "Inizia gratis",
    },
    hero: {
      tagline: "Back Mes Do · Diaspora",
      headline: "Soldi condivisi. Amicizie protette.",
      subhead:
        "Tontine, coinquilini, viaggi, matrimoni, parrocchie, club: BMD calcola, semplifica e traccia ogni spesa per non lasciare nessuno svantaggiato.",
      ctaPrimary: "Inizia gratis",
      ctaSecondary: "Guarda demo",
    },
    features: {
      title: "Tutto ciò che ti serve, niente di superfluo",
      items: [
        { icon: "🪙", title: "Tontine complete", body: "Ciclo, ordine dei beneficiari, date regolabili, ricevute, storico pluriennale." },
        { icon: "💸", title: "Spese condivise", body: "Equa, quote o percentuali. Scontrini foto/PDF visibili a tutti." },
        { icon: "↔", title: "Scambio di debiti", body: "Compensa o trasferisce un debito con validazione a tre parti." },
        { icon: "🔔", title: "Notifiche complete", body: "Solo ciò che ti riguarda. Anti-spam by design." },
        { icon: "📷", title: "OCR scontrini", body: "Foto dello scontrino: importo, commerciante, data rilevati automaticamente." },
        { icon: "🛡", title: "GDPR e privacy", body: "Nessuna lettura in massa della rubrica. Consenso esplicito." },
      ],
    },
    featuresLong: {
      intro:
        "BMD copre ogni situazione in cui i soldi circolano tra persone vicine: tontine, coinquilini, viaggi, matrimoni, parrocchie, club, squadre. Ecco cosa puoi fare, organizzato per tema.",
      categories: [
        { key: "groups", icon: "👥", label: "Gruppi e ruoli", pitch: "Crea il tipo giusto di gruppo in 30 secondi. Ogni tipo ha la sua logica e tutti sanno chi fa cosa.",
          items: [
            { icon: "🎭", title: "6 tipi predefiniti", body: "Tontina · Coinquilini · Viaggio · Evento (matrimonio, festa) · Club · Parrocchia/Associazione." },
            { icon: "🛡", title: "Ruoli chiari", body: "Admin (modifica regole), tesoriere (segue pagamenti), membro (registra spese). Tracciabile senza gerarchia pesante." },
            { icon: "✉️", title: "Inviti multicanale", body: "Link condivisibile, codice QR, contatti del telefono (con consenso esplicito). Promemoria automatici giorno 2 e 5." },
            { icon: "🎨", title: "Tema per comunità", body: "Scegli l'identità visiva del tuo gruppo. La tua comunità ha personalità." },
          ],
        },
        { key: "expenses", icon: "💸", label: "Spese condivise", pitch: "Registrare una spesa deve durare 5 secondi. BMD offre foto dello scontrino, suggerimento di divisione, rilevamento di anomalie e conversione automatica delle valute.",
          items: [
            { icon: "📷", title: "OCR scontrini (foto, PDF, scan)", body: "Foto dello scontrino: importo, commerciante e data rilevati automaticamente. Tre motori (Mindee, GPT-4o Vision, Tesseract) con fallback." },
            { icon: "⚖️", title: "Divisione: equa · quote · percentuali", body: "Modalità equa con 1 clic, quote personalizzate o percentuali esatte. Ideale per coinquilini con stanze diverse." },
            { icon: "🤖", title: "Suggerimento IA della divisione", body: "Mentre registri, BMD impara le tue abitudini e propone automaticamente la modalità giusta." },
            { icon: "📜", title: "Regole per categoria", body: "\"Tutta la spesa Esselunga va al gruppo Coinquilini\": crea la regola una volta, BMD la applica sempre." },
            { icon: "🚨", title: "Rilevamento anomalie", body: "Duplicati, importi atipici, spese fuori dal solito: avviso prima della validazione." },
            { icon: "🏦", title: "Importazione bancaria CSV", body: "Importa il tuo estratto conto. BMD propone categorizzazione e divisione automaticamente." },
          ],
        },
        { key: "tontines", icon: "🪙", label: "Tontine e cicli", pitch: "Tontina bamiléké, hui cinese, susu caraibica — tutti i modelli di risparmio rotativo supportati, con doppia validazione e storico inalterabile.",
          items: [
            { icon: "🔄", title: "Ciclo automatizzato", body: "Definisci importo, frequenza e ordine dei beneficiari. In ogni turno, il destinatario sceglie la data esatta." },
            { icon: "🤝", title: "Doppia validazione", body: "Il pagatore dichiara, il tesoriere conferma. Anti-malintesi." },
            { icon: "📅", title: "Vista calendario", body: "Tutti i turni futuri visualizzati. Vedi a colpo d'occhio chi riceve cosa e quando." },
            { icon: "🎯", title: "Aste (Hui)", body: "Per le comunità cinesi: in ogni turno, offri per anticipare il tuo pagamento." },
            { icon: "📚", title: "Storico pluriennale", body: "Log immutabile: 5 anni minimo. Esportazione completa in qualsiasi momento." },
          ],
        },
        { key: "settle", icon: "↔", label: "Saldi e regolamenti", pitch: "BMD calcola il numero minimo di transazioni per saldare il gruppo. Niente più fogli di calcolo.",
          items: [
            { icon: "🧮", title: "Saldi in tempo reale", body: "Saldo globale multivaluta, saldo per gruppo in valuta locale. Ricalcolo istantaneo." },
            { icon: "🎯", title: "Regolamento ottimale", body: "Algoritmo \"flusso minimo\": 1 transazione invece di 2 o 3 quando possibile." },
            { icon: "🔁", title: "Swap e trasferimento debito", body: "Compensa o trasferisce un debito a un altro membro. Validazione a 3 anti-frode." },
            { icon: "🔗", title: "Link di pagamento monouso", body: "Genera un link sicuro per farti pagare. Scade dopo l'uso." },
          ],
        },
        { key: "money", icon: "💱", label: "Multivaluta e pagamenti", pitch: "BMD è progettato per la diaspora. Oltre 25 valute, tassi aggiornati ogni ora, conversioni trasparenti.",
          items: [
            { icon: "🌍", title: "Oltre 25 valute live", body: "Euro, dollaro, sterlina, franco CFA (XAF/XOF), naira, dirham, rand, real, scellino, peso…" },
            { icon: "💳", title: "Compatibile con i tuoi strumenti", body: "Lydia, Wave, Orange Money, MTN MoMo, Wise, bonifico SEPA, PayPal, Satispay. BMD non sostituisce — registra." },
            { icon: "📈", title: "Conversione in tempo reale", body: "Una spesa in XAF appare a ogni membro nella SUA valuta predefinita, al tasso del giorno." },
            { icon: "🧾", title: "Ricevute fiscali scaricabili", body: "Per parrocchie, associazioni, club sportivi: ricevute PDF con codice fiscale." },
          ],
        },
        { key: "comms", icon: "🔔", label: "Comunicazione e promemoria", pitch: "Tutto è gestito tramite notifiche — anti-spam by design, e scegli il tono.",
          items: [
            { icon: "🛎", title: "Notifiche granulari", body: "Ricevi SOLO ciò che ti riguarda. Mai \"X ha fatto qualcosa nel tuo gruppo\"." },
            { icon: "📅", title: "Riepilogo settimanale", body: "Ogni domenica sera, riepilogo chiaro: cosa è successo, il tuo saldo, debiti pendenti." },
            { icon: "💬", title: "Bot WhatsApp nativo", body: "Aggiungi spese tramite messaggio vocale o testuale. BMD riconosce, archivia, chiede conferma." },
            { icon: "😊", title: "Tono a scelta", body: "Amichevole, fermo, umoristico, professionale: scegli il tono dei promemoria che BMD invia per te." },
            { icon: "🌙", title: "Non disturbare per gruppo", body: "Silenzia un gruppo per 1h, 24h o fino a domattina senza lasciare la conversazione." },
          ],
        },
        { key: "intelligence", icon: "🧠", label: "Intelligenza e automazioni", pitch: "BMD usa l'IA per eliminare la burocrazia, non per spammare. Confidenziale, locale o tramite fornitori GDPR-compatibili.",
          items: [
            { icon: "🎙", title: "Input vocale Whisper", body: "Voce WhatsApp o direttamente in app: BMD trascrive, comprende, archivia." },
            { icon: "📊", title: "Statistiche e insight", body: "Andamento mensile, ripartizione per categoria, media per gruppo. Senza tracker o pubblicità." },
            { icon: "🌐", title: "Auto-traduzione contenuti admin", body: "Parrocchie e associazioni con messaggi multilingue. BMD traduce automaticamente con revisione opzionale." },
            { icon: "🔮", title: "Anomalie e duplicati", body: "Una spesa di 1.200€ quando di solito fai 50€? Stesso ristorante fatturato due volte? BMD avvisa." },
          ],
        },
        { key: "trust", icon: "🛡", label: "Sicurezza e privacy", pitch: "GDPR by design. I tuoi contatti non vengono mai letti in massa. Niente password, niente cookie di tracking.",
          items: [
            { icon: "🔑", title: "Accesso senza password", body: "OTP via SMS, email o WhatsApp. Passkey (Face ID / Touch ID / Windows Hello). SSO Google e Apple opzionali." },
            { icon: "🚫", title: "Zero lettura della rubrica", body: "BMD non legge MAI la tua rubrica in massa. Solo i contatti che selezioni esplicitamente vengono trasmessi." },
            { icon: "📜", title: "Audit log immutabile", body: "Operazioni sensibili append-only, firmate, conservate 5 anni. A prova di manomissione." },
            { icon: "🇪🇺", title: "GDPR completo", body: "Esportazione JSON/CSV di tutti i tuoi dati, eliminazione su richiesta entro 30 giorni." },
            { icon: "🌐", title: "Hosting UE", body: "Database e server in regione UE. Nessun trasferimento extra-UE senza Clausole Contrattuali Standard." },
          ],
        },
        { key: "platform", icon: "📱", label: "Piattaforme e accessibilità", pitch: "Una vera app nativa sul telefono, un vero portale web sul computer. E un bot WhatsApp per chi preferisce restare in chat.",
          items: [
            { icon: "📲", title: "PWA installabile", body: "Su iPhone, Android o desktop: installa BMD come app vera, funziona offline per la consultazione." },
            { icon: "💬", title: "Bot WhatsApp", body: "Collega il numero WhatsApp in 30s: aggiunta spese vocale/testuale, consultazione saldo, validazione contributi." },
            { icon: "🌍", title: "Multilingue", body: "L'interfaccia si adatta alla tua lingua preferita. Arabo e altre lingue RTL gestite nativamente." },
            { icon: "♿", title: "Accessibilità WCAG 2.1 AA", body: "Contrasto validato, navigazione da tastiera, supporto screen reader, modalità chiaro/scuro." },
            { icon: "🌗", title: "Modalità chiaro / scuro", body: "Cambia con un clic dall'icona ☀️/🌙 (in alto a destra). App e sito cambiano insieme." },
          ],
        },
      ],
    },
    referral: {
      kicker: "Programma commerciale",
      title: "Raccomanda BMD, guadagna su ogni abbonamento",
      intro:
        "BMD ha un programma di affiliazione semplice — senza livelli, senza piramide. Raccomanda BMD ai tuoi cari o a organizzazioni — ogni iscrizione che diventa pagante ti genera commissione, a vita finché la persona resta cliente.",
      benefits: [
        { icon: "💰", title: "Commissione diretta", body: "20% dell'importo mensile pagato (o una tantum per il piano Evento) dagli utenti che hai raccomandato. Pagato il 1° di ogni mese." },
        { icon: "♾️", title: "Ricorrente a vita", body: "Finché il tuo referente resta abbonato, guadagni commissione — senza tetto, senza scadenza." },
        { icon: "📊", title: "Spazio commerciale dedicato", body: "Dashboard chiara: chi si è iscritto tramite te, chi è passato a pagamento, il tuo MRR, ricavi previsti, storico pagamenti." },
        { icon: "🎁", title: "Bonus per il referente", body: "Il tuo referente riceve anche uno sconto (1 mese gratis sul piano annuale o 10% a vita)." },
      ],
      howItWorks: [
        { num: "1", title: "Attiva lo spazio commerciale", body: "Dal tuo profilo → Spazio commerciale → \"Attiva\". Ricevi un codice referral personalizzato e un link." },
        { num: "2", title: "Condividi con la tua rete", body: "Alla tua parrocchia, al tuo club, agli amici della diaspora. Il link precompila il codice." },
        { num: "3", title: "Segui le iscrizioni", body: "Ogni clic, iscrizione, conversione a piano pagante appare in tempo reale." },
        { num: "4", title: "Ricevi la commissione", body: "Pagamento automatico il 1° di ogni mese (da 25€). Lydia, Wave, bonifico SEPA o Mobile Money — a tua scelta." },
      ],
      cta: { label: "Scopri il programma", href: "/dashboard/affiliate" },
      smallPrint:
        "Senza livelli, senza marketing piramidale. Un solo livello (tu → il tuo referente), commissione fissa e trasparente. Termini completi nello spazio commerciale dopo l'attivazione.",
    },
    howItWorks: {
      title: "In tre passi",
      steps: [
        { num: "1", title: "Crea il tuo gruppo", body: "Tontina, coinquilini, viaggio, matrimonio… Scegli tipo e valuta predefinita." },
        { num: "2", title: "Invita i tuoi cari", body: "Link condivisibile, QR code o contatti del telefono (con il tuo consenso)." },
        { num: "3", title: "Vivi sereno", body: "Inserisci spese, contributi, scambi. BMD calcola i saldi e propone i regolamenti ottimali." },
      ],
    },
    pricing: {
      title: "Gratis per la maggioranza",
      free: {
        name: "Gratuito",
        price: "0 €",
        features: ["Fino a 3 gruppi attivi", "Tontine, spese, swap illimitati", "Ricevute foto/PDF", "Notifiche complete"],
      },
      pro: {
        name: "Pro",
        price: "4,99 € / mese",
        features: ["Gruppi illimitati", "Esportazione contabile dettagliata", "Storico 10 anni", "Supporto prioritario"],
        cta: "In arrivo",
      },
    },
    faq: {
      title: "Domande frequenti",
      items: [
        { q: "BMD sostituisce una banca?", a: "No. BMD è uno strumento di gestione condivisa. I pagamenti avvengono tramite i tuoi canali abituali (Lydia, Wave, Mobile Money, bonifico). BMD registra, calcola, semplifica." },
        { q: "I miei dati sono al sicuro?", a: "Sì. Cifriamo le comunicazioni, non leggiamo mai la tua rubrica senza consenso esplicito, e puoi esportare o eliminare i tuoi dati in qualsiasi momento (GDPR)." },
        { q: "Come funzionano le tontine BMD?", a: "Crei il gruppo, fissi importo e frequenza. Ad ogni giro, il beneficiario sceglie la data esatta nel suo mese e tutti confermano. Storico per anni." },
      ],
    },
    faqLong: {
      intro: "Le domande più frequenti, raggruppate per tema. Se non trovi la tua risposta, scrivi a hello@backmesdo.com — rispondiamo entro 24h.",
      categories: [
        { key: "basics", icon: "👋", label: "Basi",
          items: [
            { q: "Cos'è BMD in una frase?", a: "Un'app che aiuta i gruppi a gestire i soldi condivisi senza drammi: tontine, coinquilini, viaggi, matrimoni, parrocchie, club." },
            { q: "BMD sostituisce la mia banca o Lydia?", a: "No. BMD non sposta soldi. Continui a pagare con i tuoi canali abituali. BMD registra, calcola e propone il regolamento minimo." },
            { q: "Quanto costa?", a: "Il piano Gratuito copre la maggior parte: 3 gruppi attivi. Pro a 4,99 €/mese. Piano Evento a 29 € una tantum per matrimonio o grande festa." },
            { q: "Su quali dispositivi funziona?", a: "iPhone (iOS 15+), Android (9+), qualsiasi computer moderno. Anche tramite bot WhatsApp." },
            { q: "Devono iscriversi tutti i miei cari?", a: "Non subito. Puoi creare un gruppo con \"profili ombra\" (solo nome + telefono)." },
          ],
        },
        { key: "groups", icon: "👥", label: "Gruppi e inviti",
          items: [
            { q: "Quali tipi di gruppi posso creare?", a: "6 tipi predefiniti: Tontina, Coinquilini, Viaggio, Evento, Club, Parrocchia/Associazione." },
            { q: "Dimensione massima del gruppo?", a: "Nessun limite rigido. Abbiamo parrocchie con 300+ membri e tutto funziona fluido." },
            { q: "Come invito qualcuno?", a: "Tre opzioni: link condivisibile, QR code, o dai tuoi contatti (con consenso esplicito). Promemoria auto al giorno 2 e 5." },
            { q: "Posso rimuovere un membro?", a: "Sì, l'admin può rimuoverlo in qualsiasi momento. Le spese passate restano nello storico (anti-frode)." },
            { q: "Gli ospiti vedono i miei altri gruppi?", a: "Mai. Ogni gruppo è isolato." },
          ],
        },
        { key: "tontines", icon: "🪙", label: "Tontine",
          items: [
            { q: "Come funziona una tontina su BMD?", a: "Crei il gruppo, fissi importo e frequenza. Ad ogni giro, il beneficiario sceglie la data esatta. Gli altri confermano il loro contributo." },
            { q: "Differenze tra bamiléké, hui cinese, susu?", a: "Stesso principio (risparmio rotativo), differenti per ordine e meccanismo. BMD supporta tutti e tre." },
            { q: "Cosa succede se qualcuno non paga?", a: "Il tesoriere vede chi non ha confermato. BMD invia un promemoria automatico nel tono scelto." },
            { q: "Posso seguire una tontina su più anni?", a: "Sì, lo storico è conservato 5 anni minimo, esportazione Excel in qualsiasi momento." },
          ],
        },
        { key: "money", icon: "💱", label: "Valute e pagamenti",
          items: [
            { q: "Quali valute supporta BMD?", a: "Oltre 25 valute attive. Tassi aggiornati ogni ora via Open Exchange Rates." },
            { q: "Come funziona la conversione tra valute?", a: "Ogni membro vede l'importo nella SUA valuta predefinita, al tasso del giorno." },
            { q: "BMD prende commissione sui pagamenti?", a: "Mai. BMD non sposta denaro. Il tuo canale abituale applica le sue commissioni." },
            { q: "Quali metodi di pagamento sono compatibili?", a: "Tutti. Lydia, Wave, MoMo, Wise, bonifico SEPA, PayPal, Satispay, contanti." },
            { q: "Come pago il piano BMD?", a: "Stripe Checkout sicuro: carta, Apple Pay, Google Pay, addebito diretto SEPA." },
          ],
        },
        { key: "expenses", icon: "💸", label: "Spese e ricevute",
          items: [
            { q: "Come scansiono uno scontrino?", a: "Foto o PDF. BMD rileva importo, commerciante e data automaticamente." },
            { q: "Chi può modificare una spesa?", a: "Solo il creatore e l'admin del gruppo. Ogni modifica è registrata nell'audit log." },
            { q: "Come divido in modo non equo?", a: "Tre modalità: equa, quote personalizzate, percentuali esatte. Puoi anche escludere un membro." },
            { q: "BMD rileva i duplicati?", a: "Sì, automaticamente. Appare un badge ⚠️ con suggerimento di unione." },
            { q: "Posso importare il mio estratto conto?", a: "Sì, in CSV. BMD riconosce i formati delle principali banche." },
          ],
        },
        { key: "settle", icon: "↔", label: "Saldi e regolamenti",
          items: [
            { q: "Come BMD calcola chi deve cosa?", a: "Algoritmo \"flusso minimo\": trova il numero MINIMO di transazioni per saldare tutti." },
            { q: "Cos'è uno swap di debito?", a: "Quando un membro si accolla il debito di un altro. Validazione a 3 anti-frode." },
            { q: "Come segno un debito come pagato?", a: "Nel gruppo → Saldi → \"Salda\" → scegli canale → conferma. Il creditore conferma la ricezione." },
            { q: "E se dicono di aver pagato ma non ho ricevuto?", a: "Per questo BMD chiede conferma da entrambe le parti. Promemoria automatico dopo 7 giorni." },
          ],
        },
        { key: "privacy", icon: "🛡", label: "Privacy e sicurezza",
          items: [
            { q: "I miei dati sono al sicuro?", a: "Sì. Connessioni cifrate TLS 1.3, niente password, niente lettura in massa, niente cookie di tracking. Hosting UE. GDPR completo." },
            { q: "Come funziona l'accesso senza password?", a: "Inserisci telefono o email, ricevi un codice di 6 cifre, lo inserisci. Scade dopo 5 min." },
            { q: "Cos'è una passkey?", a: "Una chiave biometrica (Face ID, Touch ID, Windows Hello). Più veloce e a prova di phishing." },
            { q: "BMD legge i miei contatti?", a: "MAI in massa. Solo quelli che selezioni esplicitamente vengono trasmessi." },
            { q: "Posso eliminare il mio account?", a: "Sì, dal tuo profilo → Privacy. Effettivo entro 30 giorni (GDPR)." },
            { q: "Posso esportare tutti i miei dati?", a: "Sì, in JSON o CSV. Ricevi un'email con il file entro 24h." },
          ],
        },
        { key: "billing", icon: "💳", label: "Fatturazione e piani",
          items: [
            { q: "Cosa include il piano Gratuito?", a: "Fino a 3 gruppi attivi, tontine/spese/swap illimitati, ricevute foto e PDF, OCR (3/mese)." },
            { q: "E il piano Pro a 4,99 €/mese?", a: "Gruppi illimitati, OCR illimitato, esportazione contabile dettagliata, storico 10 anni, supporto prioritario." },
            { q: "Cos'è il piano Evento a 29 €?", a: "Pagamento unico (NON abbonamento) per grandi eventi: matrimonio, addio al celibato/nubilato, festa aziendale." },
            { q: "Posso cancellare in qualsiasi momento?", a: "Sì, dal tuo profilo. Senza spese. Mantieni l'accesso fino alla fine del periodo pagato." },
            { q: "Il prezzo cambia in base al paese?", a: "Sì, BMD adatta i prezzi per regione (parità di potere d'acquisto)." },
            { q: "Come funziona il programma di affiliazione?", a: "Attiva lo spazio commerciale → ricevi codice/link personale → condividi → guadagna 20% a vita." },
          ],
        },
      ],
      contactNudge:
        "Cerchi una risposta più specifica o vuoi parlarci di un caso particolare? Scrivi a hello@backmesdo.com — un umano risponde entro 24h.",
    },
    cta: {
      headline: "Inizia ora",
      body: "Gratis. Nessuna carta. Iscrizione in meno di un minuto.",
      button: "Crea il mio account",
    },
    footer: {
      tagline: "Soldi condivisi. Amicizie protette.",
      rights: "Tutti i diritti riservati.",
      privacy: "Privacy",
      terms: "Termini",
      contact: "Contatto",
    },
  },
  // ============================================================
  // Lëtzebuergesch — diaspora franco-luxembourgeoise
  // ============================================================
  lb: {
    meta: {
      title: "BMD · Gedeelt Geld, ouni Drama",
      description:
        "BMD hëlleft der afrikanescher Diaspora, Tontinnen, WGen, Reesen a Gruppenevents ze geréieren — Transparenz, Equitéit, Roueg.",
    },
    nav: {
      story: "Eis Geschicht",
      features: "Funktiounen",
      howItWorks: "Wéi et funktionéiert",
      pricing: "Präisser",
      login: "Aloggen",
      signUp: "Konto erstellen",
    },
    langPicker: { main: "Haaptsproochen", europeanGroup: "Europäesch Sproochen", asianGroup: "Asiatesch Sproochen", arabicGroup: "Arabesch Sproochen", africanGroup: "Afrikanesch Sproochen" },
    story: {
      kicker: "Eis Geschicht",
      title: "Geld sollt ni eng Frëndschaft kaschten",
      punchline: "Mir alleguer haten déi Owesiessen, wou de Restaurant zum Geriicht ginn ass. Déi Tontine, wou kee méi wousst wien bezuelt hat. Déi Reesc tëschent Cousin'en, déi an enger äiseger WhatsApp-Grupp opgehört huet.",
      chapters: [
        { icon: "🌍", title: "D'Problem", body: "Inflatioun friisst alles. Liewenskäschten explodéieren an Europa, am Kamerun, zu Dakar, zu Mumbai. All Euro zielt." },
        { icon: "💔", title: "D'Spannung", body: "Excel ass onlieserbar. WhatsApp rechent net. Westlech Apps verstinn keng Tontinen oder de CFA-Frang." },
        { icon: "🕊", title: "D'Léisung", body: "BMD. E Tool fir déi, déi hiert Geld wierklech deelen. Multi-Währung (25+), méisproocheg (20+), Tontinen, Schold-Tausch." },
      ],
      manifesto: "„Mir zielen all Cent — fir ni eis Frënn ze zielen.\"",
      cta: "Gratis ufänken",
    },
    hero: {
      tagline: "Back Mes Do · Diaspora",
      headline: "Gedeelt Geld. Geschützte Frëndschaft.",
      subhead:
        "Tontinnen, WGen, Reesen, Hochzäiten, Päiren, Veräiner: BMD rechent, vereinfacht an dokumentéiert all Ausgab, sou datt keen sech benodeelegt fillt.",
      ctaPrimary: "Gratis ufänken",
      ctaSecondary: "Demo kucken",
    },
    features: {
      title: "Alles wat s du brauchst, näischt méi",
      items: [
        { icon: "🪙", title: "Komplett Tontinnen", body: "Zyklus, Reihenfolg vun de Begënschtegten, upassbar Datumer, Quittungen, méijäreg Geschicht." },
        { icon: "💸", title: "Gedeelt Ausgaben", body: "Glaich, Deeler oder Prozentsätz. Foto/PDF-Belege fir all Memberen sichtbar." },
        { icon: "↔", title: "Schold-Tausch", body: "Schold ausgläichen oder iwwerdroen mat Drai-Parteien-Validéierung." },
        { icon: "🔔", title: "Komplett Notifikatiounen", body: "Nëmmen wat dech betrëfft. Anti-Spam by Design." },
        { icon: "📷", title: "OCR vun Tickete", body: "Foto vum Ticket: Betrag, Händler, Datum automatesch erkannt." },
        { icon: "🛡", title: "DSGVO & Privatsphär", body: "Keng Massendlecken vum Adressbuch. Ausdrécklech Zoustëmmung." },
      ],
    },
    featuresLong: {
      intro:
        "BMD deckt all Situatioun of, wou Geld tëschent Léifsten zirkuléiert: Tontinnen, WGen, Reesen, Hochzäiten, Päiren, Veräiner, Equipen.",
      categories: [
        { key: "groups", icon: "👥", label: "Gruppen & Rollen", pitch: "Erstell de richtegen Typ vu Grupp an 30 Sekonnen.",
          items: [
            { icon: "🎭", title: "6 virgeschloen Gruppentypen", body: "Tontine · WG · Rees · Event · Veräin · Päir/Verband." },
            { icon: "🛡", title: "Kloer Rollen", body: "Admin, Keessekapsmeeschter, Member. Alles nochvollziebar." },
            { icon: "✉️", title: "Multi-Kanal Aluedungen", body: "Deelbarer Link, QR-Code, Telefonkontakter (mat ausdrécklecher Zoustëmmung)." },
            { icon: "🎨", title: "Communautéitsthemen", body: "Wiel d'visuell Identitéit vun denger Grupp." },
          ],
        },
        { key: "expenses", icon: "💸", label: "Gedeelt Ausgaben", pitch: "Eng Ausgab antippen sollt 5 Sekonnen daueren.",
          items: [
            { icon: "📷", title: "Ticket-OCR", body: "Foto vum Ticket: Betrag, Händler, Datum automatesch erkannt." },
            { icon: "⚖️", title: "Opdeelung: glaich · Deeler · Prozent", body: "Glaicht Modus mat 1 Klick, perséinlech Deeler oder exakt Prozenter." },
            { icon: "🤖", title: "AI-Virschléi", body: "BMD léiert deng Gewunnechten an proposéiert automatesch de richtege Modus." },
            { icon: "📜", title: "Kategorieregelen", body: "Erstell d'Regel eemol, BMD applizéiert se ëmmer." },
            { icon: "🚨", title: "Anomalie-Erkennung", body: "Duplikater, atypesch Beträg: Warnung virum Validéieren." },
            { icon: "🏦", title: "Bank-CSV-Import", body: "Importéier däi Kontoauszuch. BMD propéiert Kategoriséierung." },
          ],
        },
        { key: "tontines", icon: "🪙", label: "Tontinnen & Zyklen", pitch: "All rotéierend Spuermodeller ënnerstëtzt.",
          items: [
            { icon: "🔄", title: "Vollautomatesche Zyklus", body: "Definéier Betrag, Frequenz an Reihenfolg vun de Begënschtegten." },
            { icon: "🤝", title: "Duebel-Validéierung", body: "Bezueler erkläert, Keessekapsmeeschter bestätegt. Anti-Mëssverständnesser." },
            { icon: "📅", title: "Kalennerusiicht", body: "All zukünfteg Ronnen visuell duergestallt." },
            { icon: "🎯", title: "Auktiounen (Hui)", body: "Fir chinesesch Communautéiten." },
            { icon: "📚", title: "Méijäreg Geschicht", body: "Onverännerleche Audit-Log: mannst 5 Joer." },
          ],
        },
        { key: "settle", icon: "↔", label: "Salden & Regelungen", pitch: "BMD rechent déi minimal Unzuel Transaktiounen.",
          items: [
            { icon: "🧮", title: "Echtzäit-Salden", body: "Globalen Multi-Währungs-Saldo, sofortege Neirechen." },
            { icon: "🎯", title: "Optimal Regelung", body: "1 Transaktioun amplaz vun 2 oder 3 wann méiglech." },
            { icon: "🔁", title: "Schold-Tausch", body: "Iwwerdroe Schold un en aneren Member. 3-Weeër-Validéierung." },
            { icon: "🔗", title: "Eemoleg Bezuelinglinken", body: "Generéier e séchere Link fir bezuelt ze ginn." },
          ],
        },
        { key: "money", icon: "💱", label: "Multi-Währung & Bezuelen", pitch: "BMD ass fir d'Diaspora gemaach.",
          items: [
            { icon: "🌍", title: "Méi wéi 25 Währungen mat Live-Käschten", body: "Euro, Dollar, Pond, CFA-Frang, Naira, Dirham…" },
            { icon: "💳", title: "Kompatibel mat denge Gewunnechten", body: "Lydia, Wave, Orange Money, Wise, SEPA-Iwwerweisung, PayPal." },
            { icon: "📈", title: "Echtzäit-Konvertéierung", body: "Eng XAF-Ausgab erschéngt all Member a senger Standardwährung." },
            { icon: "🧾", title: "Steierquittungen erofzelueden", body: "Fir Päiren, Verbänn, Sportveräiner." },
          ],
        },
        { key: "comms", icon: "🔔", label: "Kommunikatioun & Erënnerungen", pitch: "Alles gëtt iwwer Notifikatiounen geleet.",
          items: [
            { icon: "🛎", title: "Granulär Notifikatiounen", body: "Du gëss NËMMEN iwwer Saachen informéiert, déi DECH betreffen." },
            { icon: "📅", title: "Wëchentlech Resumé", body: "All Sonnden Owend: kloer Resumé." },
            { icon: "💬", title: "Native WhatsApp-Bot", body: "Ausgaben per Sproach- oder Textmessage." },
            { icon: "😊", title: "Wiel den Toun", body: "Frëndlech, fest, humorvoll, professionell." },
            { icon: "🌙", title: "Net stéieren pro Grupp", body: "Stomm fir 1 Stonn, 24h oder bis muer fréi." },
          ],
        },
        { key: "intelligence", icon: "🧠", label: "Intelligenz & Automatiséierung", pitch: "BMD benotzt KI fir Bürokratie ze beseitigen.",
          items: [
            { icon: "🎙", title: "Whisper-Sproochinput", body: "BMD transkribéiert, versteet, ordent an." },
            { icon: "📊", title: "Statistiken & Insights", body: "Méintleg Trends, Verdeelung no Kategorie." },
            { icon: "🌐", title: "Auto-Iwwersetzung", body: "BMD iwwersetzt automatesch mat optionaler Iwwerpréifung." },
            { icon: "🔮", title: "Anomalien & Duplikater", body: "BMD warnt virum Drama." },
          ],
        },
        { key: "trust", icon: "🛡", label: "Sécherheet & Privatsphär", pitch: "DSGVO by Design.",
          items: [
            { icon: "🔑", title: "Aloggen ouni Passwuert", body: "OTP per SMS, E-Mail oder WhatsApp. Passkeys." },
            { icon: "🚫", title: "Null Adressbuch-Liesen", body: "Nëmmen explizit ausgewielt Kontakter ginn iwwerdroen." },
            { icon: "📜", title: "Onverännerleche Audit-Log", body: "Sensibel Operatiounen append-only, signéiert, 5 Joer opbewahrt." },
            { icon: "🇪🇺", title: "Vollstänneg DSGVO", body: "JSON/CSV-Export, Läschen op Ufro bannent 30 Deeg." },
            { icon: "🌐", title: "EU-Hosting", body: "Datebanken a Server an der EU-Regioun." },
          ],
        },
        { key: "platform", icon: "📱", label: "Plattformen & Zougänglechkeet", pitch: "Eng richteg native App um Telefon, e richtege Web-Portal um PC.",
          items: [
            { icon: "📲", title: "Installéierbar PWA", body: "Op iPhone, Android oder Desktop." },
            { icon: "💬", title: "WhatsApp-Bot", body: "Verbann deng WhatsApp-Nummer an 30 Sekonnen." },
            { icon: "🌍", title: "Méisproocheg", body: "D'Interface upasst sech denger gewënschter Sprooch." },
            { icon: "♿", title: "WCAG 2.1 AA Zougänglechkeet", body: "Validéierte Kontrast, Tastaturnavigatioun, Hell-/Däischtermodus." },
            { icon: "🌗", title: "Hell- / Däischtermodus", body: "1-Klick-Wiessel iwwert d'Symbol ☀️/🌙." },
          ],
        },
      ],
    },
    referral: {
      kicker: "Verkafsprogramm",
      title: "Recommandéier BMD, verdéin op all Abonnement",
      intro:
        "BMD huet en einfache Recommandatiounsprogramm — keng Stufen, keng Pyramid. Fir all bezuelend Aschreiwung kriss du eng Provisioun, lieweg laang.",
      benefits: [
        { icon: "💰", title: "Direkt Provisioun", body: "20% vum monatleche Betrag (oder Eemolbetrag fir den Eventplang) vun denge Recommandéierten." },
        { icon: "♾️", title: "Lieweg laang widderhuelend", body: "Sou laang däi Recommandéierten Client bleift, verdéins du." },
        { icon: "📊", title: "Eegen Verkafs-Dashboard", body: "Kloer Iwwersiicht: wien sech ugemellt huet, MRR, prognostizéiert Recetten." },
        { icon: "🎁", title: "Bonus fir Recommandéiert", body: "Däi Recommandéierten kritt och Rabatt." },
      ],
      howItWorks: [
        { num: "1", title: "Verkafsberäich aktivéieren", body: "Profil → Verkafsberäich → \"Aktivéieren\". Du kriss ee perséinleche Code." },
        { num: "2", title: "Mat dengem Netzwierk deelen", body: "Un deng Päir, däi Veräin, deng Diaspora-Frënn." },
        { num: "3", title: "Aschreiwungen verfollegen", body: "All Klick a Konvertéierung erschéngt an Echtzäit." },
        { num: "4", title: "Provisioun kréien", body: "Automatesch Auszuelung den 1. vun all Mount (vun 25€ un)." },
      ],
      cta: { label: "Programm entdecken", href: "/dashboard/affiliate" },
      smallPrint:
        "Keng Stufen, keng Pyramid-Marketing. Nëmmen ee Niveau, fix an transparent Provisioun.",
    },
    howItWorks: {
      title: "An dräi Schrëtt",
      steps: [
        { num: "1", title: "Erstell deng Grupp", body: "Tontine, WG, Rees, Hochzäit… Wiel Typ a Standardwährung." },
        { num: "2", title: "Lued deng Léifsten an", body: "Deelbare Link, QR-Code oder Telefonkontakter." },
        { num: "3", title: "Liewe roueg", body: "Erfaass Ausgaben, Bäiträg, Tausch. BMD rechent Salden." },
      ],
    },
    pricing: {
      title: "Fir déi meeschten gratis",
      free: {
        name: "Gratis",
        price: "0 €",
        features: ["Bis zu 3 aktiv Gruppen", "Onlimitéiert Tontinnen, Ausgaben, Tausch", "PDF/Foto-Belege", "Komplett Notifikatiounen"],
      },
      pro: {
        name: "Pro",
        price: "4,99 € / Mount",
        features: ["Onlimitéiert Gruppen", "Detailléierten Bichhalterexport", "10 Joer Geschicht", "Prioritäre Support"],
        cta: "Geschwënn",
      },
    },
    faq: {
      title: "Heefeg Froen",
      items: [
        { q: "Ersetzt BMD eng Bank?", a: "Nee. BMD ass e Geréierungstool. Bezuelungen lafen iwwer deng gewinnt Kanäl." },
        { q: "Sinn meng Donnéeën sécher?", a: "Jo. Mir verschlësselen, liesen ni däi Adressbuch ouni Zoustëmmung." },
        { q: "Wéi funktionéieren BMD-Tontinnen?", a: "Du erstells d'Grupp, definéiert Betrag a Frequenz." },
      ],
    },
    faqLong: {
      intro: "Déi heefegst Froen, no Themen gruppéiert.",
      categories: [
        { key: "basics", icon: "👋", label: "Grondlagen",
          items: [
            { q: "Wat ass BMD an engem Saz?", a: "Eng App, déi Gruppen hëlleft, gedeelt Geld ouni Drama ze geréieren." },
            { q: "Ersetzt BMD meng Bank?", a: "Nee. BMD beweegt kee Geld. Du bezuels weider iwwer deng gewinnt Kanäl." },
            { q: "Wéi vill kascht et?", a: "Gratis-Plang deckt déi meeschten of: 3 aktiv Gruppen. Pro 4,99€/Mount. Eventplang 29€ eemoleg." },
            { q: "Op wéi enge Geräter funktionéiert et?", a: "iPhone (iOS 15+), Android (9+), all modernen Computer." },
            { q: "Mussen all meng Léifsten sech registréieren?", a: "Net direkt. Du kanns Gruppen mat 'Schiedeprofiler' erstellen." },
          ],
        },
        { key: "groups", icon: "👥", label: "Gruppen",
          items: [
            { q: "Wéi eng Gruppentypen kann ech erstellen?", a: "6 virgeschloen Typen: Tontine, WG, Rees, Event, Veräin, Päir/Verband." },
            { q: "Maximal Gruppegréisst?", a: "Keng harten Limit. Mir hu Päiren mat 300+ Memberen." },
            { q: "Wéi luede ech een an?", a: "Dräi Optiounen: Link, QR-Code, oder aus dengen Kontakter." },
            { q: "Kann ech e Member ewechhuelen?", a: "Jo, den Admin kann zu all Moment ewechhuelen." },
            { q: "Gesinn Invitéiert meng aner Gruppen?", a: "Ni. All Grupp ass isoléiert." },
          ],
        },
        { key: "tontines", icon: "🪙", label: "Tontinnen",
          items: [
            { q: "Wéi funktionéiert eng Tontine bei BMD?", a: "Du erstells d'Grupp, definéiert Betrag a Frequenz." },
            { q: "Ënnerscheed bamiléké, hui, susu?", a: "Selwecht Prinzip, ënnerscheedlech a Reihenfolg a Mechanismus." },
            { q: "Wat wann een seng Ronn net bezielt?", a: "BMD schéckt automatesch Erënnerungen." },
            { q: "Kann ech eng Tontine iwwer méi Joeren verfollegen?", a: "Jo, Geschicht gëtt mannst 5 Joer opbewahrt." },
          ],
        },
        { key: "money", icon: "💱", label: "Währungen",
          items: [
            { q: "Wéi eng Währungen ënnerstëtzt BMD?", a: "Méi wéi 25 aktiv Währungen, stondegstündlech aktualiséiert." },
            { q: "Wéi funktionéiert d'Konvertéierung?", a: "All Member gesäit de Betrag a SENGER Standardwährung." },
            { q: "Hëlt BMD Provisioun op Bezuelungen?", a: "Ni. BMD bewegt kee Geld." },
            { q: "Wat fir Bezuelmethoden si kompatibel?", a: "All. Lydia, Wave, Wise, SEPA, PayPal." },
            { q: "Wéi bezuelen ech de BMD-Plang?", a: "Stripe Checkout sécher: Kaart, Apple Pay, SEPA." },
          ],
        },
        { key: "expenses", icon: "💸", label: "Ausgaben",
          items: [
            { q: "Wéi scannéieren ech eng Quittung?", a: "Foto oder PDF. BMD erkennt automatesch." },
            { q: "Wien kann eng Ausgab änneren?", a: "Nëmmen Ersteller an Admin." },
            { q: "Wéi deelen ech ongläich?", a: "Dräi Modi: gläich, Deeler, Prozenter." },
            { q: "Erkennt BMD Duplikater?", a: "Jo, automatesch." },
            { q: "Kann ech mäin Auszuch importéieren?", a: "Jo, als CSV." },
          ],
        },
        { key: "settle", icon: "↔", label: "Salden",
          items: [
            { q: "Wéi rechent BMD?", a: "'Minimum Cash Flow'-Algorithmus." },
            { q: "Wat ass e Schold-Tausch?", a: "Wann ee Member d'Schold vun engem aneren iwwerhëlt. 3-Weeër-Validéierung." },
            { q: "Wéi markéieren ech eng Schold als bezuelt?", a: "An der Grupp → Salden → 'Regelen'." },
            { q: "Wat wann een seet hien hätt bezielt?", a: "BMD verlangt Bestätegung vu béid Säiten." },
          ],
        },
        { key: "privacy", icon: "🛡", label: "Privatsphär",
          items: [
            { q: "Sinn meng Donnéeën sécher?", a: "Jo. TLS 1.3, keng Passwierder, EU-Hosting." },
            { q: "Wéi funktionéiert d'Aloggen ouni Passwuert?", a: "Telefon oder E-Mail aginn, 6-stellege Code kréien." },
            { q: "Wat ass e Passkey?", a: "Biometresche Schlëssel (Face ID, Touch ID)." },
            { q: "Liest BMD meng Kontakter?", a: "NI a Bulk." },
            { q: "Kann ech mäi Konto läschen?", a: "Jo, vum Profil." },
            { q: "Kann ech all meng Donnéeën exportéieren?", a: "Jo, an JSON oder CSV." },
          ],
        },
        { key: "billing", icon: "💳", label: "Pläng",
          items: [
            { q: "Wat ass am Gratis-Plang abegraff?", a: "Bis zu 3 aktiv Gruppen, onlimitéiert Tontinnen." },
            { q: "An den Pro-Plang?", a: "Onlimitéiert Gruppen, OCR onlimitéiert, 10 Joer Geschicht." },
            { q: "Wat ass den Eventplang?", a: "Eemolzuelung 29€ fir grouss Eventer." },
            { q: "Kann ech zu all Moment kënnegen?", a: "Jo, ouni Käschten." },
            { q: "Ännert de Präis no Land?", a: "Jo, BMD upasst d'Tariffer." },
            { q: "Wéi funktionéiert d'Recommandatioun?", a: "Aktivéier Verkafsberäich → kritt e Code → deelen → 20% lieweg laang." },
          ],
        },
      ],
      contactNudge:
        "Schreif eis op hello@backmesdo.com fir spezifesch Froen.",
    },
    cta: {
      headline: "Elo ufänken",
      body: "Gratis. Keng Kreditkaart. Aschreiwung an manner wéi enger Minutt.",
      button: "Konto erstellen",
    },
    footer: {
      tagline: "Gedeelt Geld. Geschützte Frëndschaft.",
      rights: "All Rechter virbehalen.",
      privacy: "Privatsphär",
      terms: "AGB",
      contact: "Kontakt",
    },
  },
  // ============================================================
  // Русский — diaspora russophone (Russie, ex-URSS, Israël)
  // ============================================================
  ru: {
    meta: {
      title: "BMD · Общие деньги, без драмы",
      description:
        "BMD помогает африканской диаспоре управлять тонтинами, совместным жильём, поездками и групповыми мероприятиями — прозрачность, справедливость, спокойствие.",
    },
    nav: {
      story: "Наша история",
      features: "Возможности",
      howItWorks: "Как это работает",
      pricing: "Цены",
      login: "Войти",
      signUp: "Регистрация",
    },
    langPicker: { main: "Основные языки", europeanGroup: "Европейские языки", asianGroup: "Азиатские языки", arabicGroup: "Арабские языки", africanGroup: "Африканские языки" },
    story: {
      kicker: "Наша история",
      title: "Деньги никогда не должны стоить дружбы",
      punchline: "Мы все были на ужине, когда ресторан превратился в суд. На тонтине, где никто не знал, кто заплатил. В поездке с кузенами, которая закончилась холодным WhatsApp-чатом.",
      chapters: [
        { icon: "🌍", title: "Проблема", body: "Инфляция съедает всё. Стоимость жизни взрывается в Европе, в Камеруне, в Дакаре, в Мумбаи. Каждый евро на счету — и каждый плохо подсчитанный евро превращается в молчание, обиду, разорванные отношения." },
        { icon: "💔", title: "Напряжение", body: "Excel-таблицы нечитаемы. WhatsApp не считает. Западные приложения не понимают тонтин, франк CFA, или реальность 6-местной квартиры в Париже." },
        { icon: "🕊", title: "Решение", body: "BMD. Инструмент для тех, кто действительно делит свои деньги. Мультивалюта (25+), многоязычность (20+), тонтины, обмен долгами, OCR, WhatsApp-бот. Без драмы, без трекеров, без рекламы." },
      ],
      manifesto: "«Мы считаем каждую копейку — чтобы никогда не считать наших друзей.»",
      cta: "Начать бесплатно",
    },
    hero: {
      tagline: "Back Mes Do · Диаспора",
      headline: "Общие деньги. Защищённая дружба.",
      subhead:
        "Тонтины, совместное жильё, поездки, свадьбы, приходы, клубы: BMD рассчитывает, упрощает и отслеживает каждый расход, чтобы никто не чувствовал себя обделённым.",
      ctaPrimary: "Начать бесплатно",
      ctaSecondary: "Смотреть демо",
    },
    features: {
      title: "Всё необходимое, ничего лишнего",
      items: [
        { icon: "🪙", title: "Полные тонтины", body: "Цикл, порядок получателей, регулируемые даты, квитанции, многолетняя история." },
        { icon: "💸", title: "Совместные расходы", body: "Поровну, доли или проценты. Чеки фото/PDF видны всем." },
        { icon: "↔", title: "Обмен долгами", body: "Зачёт или передача долга с подтверждением трёх сторон." },
        { icon: "🔔", title: "Полные уведомления", body: "Только то, что вас касается. Анти-спам по дизайну." },
        { icon: "📷", title: "OCR чеков", body: "Фото чека: сумма, продавец, дата определяются автоматически." },
        { icon: "🛡", title: "GDPR и приватность", body: "Никакого массового чтения адресной книги. Явное согласие." },
      ],
    },
    featuresLong: {
      intro:
        "BMD охватывает все ситуации, когда деньги ходят между близкими: тонтины, совместное жильё, поездки, свадьбы, приходы, клубы, команды.",
      categories: [
        { key: "groups", icon: "👥", label: "Группы и роли", pitch: "Создайте правильный тип группы за 30 секунд.",
          items: [
            { icon: "🎭", title: "6 готовых типов групп", body: "Тонтина · Совместное жильё · Поездка · Событие · Клуб · Приход/Ассоциация." },
            { icon: "🛡", title: "Чёткие роли", body: "Админ, казначей, член. Всё отслеживаемо без жёсткой иерархии." },
            { icon: "✉️", title: "Многоканальные приглашения", body: "Ссылка, QR-код, контакты телефона (с явным согласием). Авто-напоминания на 2 и 5 день." },
            { icon: "🎨", title: "Темы по сообществу", body: "Выберите визуальную идентичность вашей группы." },
          ],
        },
        { key: "expenses", icon: "💸", label: "Совместные расходы", pitch: "Запись расхода должна занимать 5 секунд.",
          items: [
            { icon: "📷", title: "OCR чеков (фото, PDF, скан)", body: "Фото чека: сумма, продавец, дата определяются автоматически. Три движка с резервом." },
            { icon: "⚖️", title: "Деление: поровну · доли · проценты", body: "Поровну в 1 клик, индивидуальные доли или точные проценты." },
            { icon: "🤖", title: "ИИ-предложения деления", body: "BMD изучает ваши привычки и автоматически предлагает правильный режим." },
            { icon: "📜", title: "Правила по категориям", body: "Создайте правило один раз, BMD применяет его при каждом сканировании." },
            { icon: "🚨", title: "Обнаружение аномалий", body: "Дубликаты, нетипичные суммы: предупреждение перед валидацией." },
            { icon: "🏦", title: "Импорт банковского CSV", body: "Импортируйте выписку. BMD предложит категоризацию автоматически." },
          ],
        },
        { key: "tontines", icon: "🪙", label: "Тонтины и циклы", pitch: "Все ротационные сберегательные модели поддерживаются, с двойной валидацией.",
          items: [
            { icon: "🔄", title: "Полностью автоматизированный цикл", body: "Задайте сумму, частоту и порядок получателей." },
            { icon: "🤝", title: "Двойная валидация взносов", body: "Плательщик заявляет, казначей подтверждает." },
            { icon: "📅", title: "Календарный вид", body: "Все будущие туры визуально показаны." },
            { icon: "🎯", title: "Аукционы (Hui)", body: "Для китайских сообществ." },
            { icon: "📚", title: "Многолетняя история", body: "Неизменяемый журнал: минимум 5 лет." },
          ],
        },
        { key: "settle", icon: "↔", label: "Балансы и расчёты", pitch: "BMD рассчитывает минимальное число транзакций.",
          items: [
            { icon: "🧮", title: "Балансы в реальном времени", body: "Глобальный мультивалютный баланс, мгновенный пересчёт." },
            { icon: "🎯", title: "Оптимальный расчёт", body: "Алгоритм минимального потока: 1 транзакция вместо 2 или 3." },
            { icon: "🔁", title: "Своп и передача долга", body: "3-стороннее подтверждение против мошенничества." },
            { icon: "🔗", title: "Одноразовые ссылки оплаты", body: "Создайте безопасную ссылку для получения оплаты." },
          ],
        },
        { key: "money", icon: "💱", label: "Мультивалюта и платежи", pitch: "BMD создан для диаспоры. 25+ валют, обновление курсов каждый час.",
          items: [
            { icon: "🌍", title: "25+ валют с живыми курсами", body: "Евро, доллар, фунт, франк CFA, найра, дирхам, ранд, реал, шиллинг…" },
            { icon: "💳", title: "Совместимо с вашими инструментами", body: "Lydia, Wave, Wise, SEPA, PayPal. BMD не заменяет — записывает." },
            { icon: "📈", title: "Конвертация в реальном времени", body: "Расход в XAF появится у каждого члена в ЕГО валюте по умолчанию." },
            { icon: "🧾", title: "Налоговые квитанции", body: "Для приходов, ассоциаций, спортивных клубов." },
          ],
        },
        { key: "comms", icon: "🔔", label: "Коммуникация и напоминания", pitch: "Всё управляется уведомлениями.",
          items: [
            { icon: "🛎", title: "Точные уведомления", body: "Получаете ТОЛЬКО то, что вас касается." },
            { icon: "📅", title: "Еженедельный итог", body: "Каждое воскресенье вечером: что произошло, ваш баланс, открытые долги." },
            { icon: "💬", title: "Нативный WhatsApp-бот", body: "Добавляйте расходы голосом или текстом." },
            { icon: "😊", title: "Тон на выбор", body: "Дружелюбный, твёрдый, юмористический, профессиональный." },
            { icon: "🌙", title: "Не беспокоить по группе", body: "Заглушите группу на 1ч, 24ч или до утра." },
          ],
        },
        { key: "intelligence", icon: "🧠", label: "Интеллект и автоматизация", pitch: "BMD использует ИИ для устранения бюрократии.",
          items: [
            { icon: "🎙", title: "Голосовой ввод Whisper", body: "BMD транскрибирует, понимает, упорядочивает." },
            { icon: "📊", title: "Статистика и аналитика", body: "Месячные тренды, разбивка по категориям." },
            { icon: "🌐", title: "Авто-перевод админ-контента", body: "BMD переводит автоматически." },
            { icon: "🔮", title: "Аномалии и дубликаты", body: "BMD предупреждает перед драмой." },
          ],
        },
        { key: "trust", icon: "🛡", label: "Безопасность и приватность", pitch: "GDPR by design.",
          items: [
            { icon: "🔑", title: "Вход без пароля", body: "OTP по SMS, email или WhatsApp. Passkey." },
            { icon: "🚫", title: "Ноль массового чтения", body: "Только явно выбранные контакты передаются." },
            { icon: "📜", title: "Неизменяемый журнал", body: "Чувствительные операции хранятся 5 лет." },
            { icon: "🇪🇺", title: "Полное GDPR", body: "Экспорт JSON/CSV, удаление по запросу за 30 дней." },
            { icon: "🌐", title: "Хостинг ЕС", body: "Базы данных и серверы в регионе ЕС." },
          ],
        },
        { key: "platform", icon: "📱", label: "Платформы и доступность", pitch: "Настоящее нативное приложение на телефоне, настоящий веб-портал на ПК.",
          items: [
            { icon: "📲", title: "Устанавливаемое PWA", body: "На iPhone, Android или десктопе." },
            { icon: "💬", title: "WhatsApp-бот", body: "Подключите номер WhatsApp за 30 секунд." },
            { icon: "🌍", title: "Многоязычный", body: "Интерфейс адаптируется к вашему языку." },
            { icon: "♿", title: "Доступность WCAG 2.1 AA", body: "Подтверждённый контраст, навигация с клавиатуры." },
            { icon: "🌗", title: "Светлый / тёмный режим", body: "Переключение одним кликом по иконке ☀️/🌙." },
          ],
        },
      ],
    },
    referral: {
      kicker: "Партнёрская программа",
      title: "Рекомендуйте BMD, зарабатывайте на каждой подписке",
      intro:
        "У BMD простая реферальная программа — без уровней, без пирамиды. За каждую регистрацию, ставшую платной, вы получаете комиссию пожизненно.",
      benefits: [
        { icon: "💰", title: "Прямая комиссия", body: "20% от суммы ежемесячных платежей пользователей, которых вы пригласили. Выплата 1-го числа каждого месяца." },
        { icon: "♾️", title: "Постоянная пожизненно", body: "Пока ваш приглашённый остаётся подписчиком, вы получаете комиссию." },
        { icon: "📊", title: "Личный кабинет партнёра", body: "Чёткая панель: кто зарегистрировался, ваш MRR, прогноз дохода." },
        { icon: "🎁", title: "Бонус для приглашённого", body: "Ваш приглашённый получает скидку (1 месяц бесплатно или 10% пожизненно)." },
      ],
      howItWorks: [
        { num: "1", title: "Активируйте партнёрский кабинет", body: "Профиль → Партнёрский кабинет → \"Активировать\". Вы получаете персональный код." },
        { num: "2", title: "Поделитесь с вашей сетью", body: "С приходом, клубом, друзьями диаспоры. Ссылка автоматически заполняет код." },
        { num: "3", title: "Отслеживайте регистрации", body: "Каждый клик и конверсия отображаются в реальном времени." },
        { num: "4", title: "Получите комиссию", body: "Автовыплата 1-го числа каждого месяца (от 25€)." },
      ],
      cta: { label: "Узнать о программе", href: "/dashboard/affiliate" },
      smallPrint:
        "Без уровней, без пирамидального маркетинга. Один уровень, фиксированная и прозрачная комиссия.",
    },
    howItWorks: {
      title: "В три шага",
      steps: [
        { num: "1", title: "Создайте свою группу", body: "Тонтина, жильё, поездка, свадьба… Выберите тип и валюту." },
        { num: "2", title: "Пригласите близких", body: "Ссылка, QR-код или контакты телефона." },
        { num: "3", title: "Живите спокойно", body: "Записывайте расходы. BMD рассчитывает балансы." },
      ],
    },
    pricing: {
      title: "Бесплатно для большинства",
      free: {
        name: "Бесплатно",
        price: "0 €",
        features: ["До 3 активных групп", "Безлимитные тонтины, расходы, свопы", "PDF/фото чеки", "Полные уведомления"],
      },
      pro: {
        name: "Pro",
        price: "4,99 € / месяц",
        features: ["Безлимитные группы", "Подробный экспорт", "История 10 лет", "Приоритетная поддержка"],
        cta: "Скоро",
      },
    },
    faq: {
      title: "Частые вопросы",
      items: [
        { q: "BMD заменяет банк?", a: "Нет. BMD — это инструмент совместного управления. Платежи идут через ваши обычные каналы." },
        { q: "Мои данные в безопасности?", a: "Да. Мы шифруем коммуникации, не читаем адресную книгу без явного согласия (GDPR)." },
        { q: "Как работают тонтины BMD?", a: "Создаёте группу, задаёте сумму и частоту. На каждом туре получатель выбирает дату." },
      ],
    },
    faqLong: {
      intro: "Самые частые вопросы по темам. Не нашли ответ? Пишите hello@backmesdo.com — отвечаем за 24ч.",
      categories: [
        { key: "basics", icon: "👋", label: "Основы",
          items: [
            { q: "Что такое BMD одной фразой?", a: "Приложение, помогающее группам управлять общими деньгами без драмы." },
            { q: "BMD заменяет мой банк или Lydia?", a: "Нет. BMD не двигает деньги. Вы продолжаете платить через привычные каналы." },
            { q: "Сколько стоит?", a: "Бесплатный план: 3 активные группы. Pro 4,99€/мес. Event 29€ разово." },
            { q: "На каких устройствах работает?", a: "iPhone (iOS 15+), Android (9+), любой современный компьютер." },
            { q: "Все ли мои близкие должны зарегистрироваться?", a: "Не сразу. Можно создавать группы с 'теневыми профилями'." },
          ],
        },
        { key: "groups", icon: "👥", label: "Группы",
          items: [
            { q: "Какие типы групп можно создать?", a: "6 готовых типов: Тонтина, Жильё, Поездка, Событие, Клуб, Приход." },
            { q: "Максимальный размер группы?", a: "Без жёсткого лимита. У нас есть приходы с 300+ членами." },
            { q: "Как пригласить кого-то?", a: "Три варианта: ссылка, QR-код или из контактов." },
            { q: "Можно ли удалить участника?", a: "Да, админ может удалить в любой момент." },
            { q: "Видят ли гости мои другие группы?", a: "Никогда. Каждая группа изолирована." },
          ],
        },
        { key: "tontines", icon: "🪙", label: "Тонтины",
          items: [
            { q: "Как работает тонтина в BMD?", a: "Создаёте группу, задаёте сумму и частоту. На каждом туре получатель выбирает дату." },
            { q: "В чём разница bamileke, hui, susu?", a: "Тот же принцип, разный порядок и механизм. BMD поддерживает все три." },
            { q: "Что если кто-то не платит?", a: "Казначей видит, кто не подтвердил. BMD отправляет автонапоминание." },
            { q: "Можно ли вести тонтину несколько лет?", a: "Да, история хранится минимум 5 лет." },
          ],
        },
        { key: "money", icon: "💱", label: "Валюты и платежи",
          items: [
            { q: "Какие валюты поддерживает BMD?", a: "25+ активных валют, обновление курсов каждый час." },
            { q: "Как работает конвертация?", a: "Каждый член видит сумму в СВОЕЙ валюте по умолчанию." },
            { q: "BMD берёт комиссию с платежей?", a: "Никогда. BMD не двигает деньги." },
            { q: "Какие методы оплаты совместимы?", a: "Все. Lydia, Wave, MoMo, Wise, SEPA, PayPal." },
            { q: "Как оплатить план BMD?", a: "Stripe Checkout: карта, Apple Pay, SEPA." },
          ],
        },
        { key: "expenses", icon: "💸", label: "Расходы",
          items: [
            { q: "Как отсканировать чек?", a: "Фото или PDF. BMD определяет сумму автоматически." },
            { q: "Кто может редактировать расход?", a: "Только создатель и админ группы." },
            { q: "Как делить неравномерно?", a: "Три режима: поровну, доли, проценты." },
            { q: "BMD обнаруживает дубликаты?", a: "Да, автоматически." },
            { q: "Можно ли импортировать выписку?", a: "Да, в CSV." },
          ],
        },
        { key: "settle", icon: "↔", label: "Балансы",
          items: [
            { q: "Как BMD рассчитывает кто кому должен?", a: "Алгоритм минимального потока: МИНИМУМ транзакций." },
            { q: "Что такое своп долга?", a: "Когда член принимает долг другого. 3-стороннее подтверждение." },
            { q: "Как отметить долг как оплаченный?", a: "В группе → Балансы → 'Закрыть' → выбрать канал." },
            { q: "А если говорят что заплатили но я не получил?", a: "Поэтому BMD требует подтверждения с обеих сторон." },
          ],
        },
        { key: "privacy", icon: "🛡", label: "Приватность",
          items: [
            { q: "Мои данные в безопасности?", a: "Да. TLS 1.3, без паролей, хостинг ЕС, полное GDPR." },
            { q: "Как работает вход без пароля?", a: "Вводите телефон или email, получаете 6-значный код." },
            { q: "Что такое passkey?", a: "Биометрический ключ (Face ID, Touch ID)." },
            { q: "BMD читает мои контакты?", a: "НИКОГДА массово." },
            { q: "Можно ли удалить аккаунт?", a: "Да, из профиля → Приватность." },
            { q: "Можно ли экспортировать все мои данные?", a: "Да, в JSON или CSV." },
          ],
        },
        { key: "billing", icon: "💳", label: "Тарифы",
          items: [
            { q: "Что входит в бесплатный план?", a: "До 3 активных групп, безлимитные тонтины, расходы, свопы." },
            { q: "А Pro план 4,99€/мес?", a: "Безлимитные группы, OCR без лимита, подробный экспорт, история 10 лет." },
            { q: "Что такое план Event 29€?", a: "Разовый платёж для крупных событий." },
            { q: "Можно ли отменить в любое время?", a: "Да, без штрафов." },
            { q: "Цена меняется по странам?", a: "Да, BMD адаптирует тарифы по регионам." },
            { q: "Как работает реферальная программа?", a: "Активируйте партнёрский кабинет → получите код → делитесь → 20% пожизненно." },
          ],
        },
      ],
      contactNudge:
        "Ищете более конкретный ответ? Пишите hello@backmesdo.com — отвечаем за 24ч.",
    },
    cta: {
      headline: "Начните сейчас",
      body: "Бесплатно. Без карты. Регистрация менее чем за минуту.",
      button: "Создать аккаунт",
    },
    footer: {
      tagline: "Общие деньги. Защищённая дружба.",
      rights: "Все права защищены.",
      privacy: "Приватность",
      terms: "Условия",
      contact: "Контакт",
    },
  },
  // ============================================================
  // 日本語 — diaspora japonaise et globale
  // ============================================================
  ja: {
    meta: {
      title: "BMD · 共有マネー、ドラマなし",
      description:
        "BMDはアフリカ系ディアスポラがトンチン、シェアハウス、旅行、グループイベントを管理するのを支援します — 透明性、公平性、安心。",
    },
    nav: {
      story: "私たちの物語",
      features: "機能",
      howItWorks: "仕組み",
      pricing: "料金",
      login: "ログイン",
      signUp: "登録",
    },
    langPicker: { main: "主要言語", europeanGroup: "ヨーロッパ言語", asianGroup: "アジア言語", arabicGroup: "アラビア語", africanGroup: "アフリカの言語" },
    story: {
      kicker: "私たちの物語",
      title: "お金が友情を犠牲にすることがあってはならない",
      punchline: "私たちは皆、レストランが裁判所になった夕食を経験しました。誰が払ったか誰も知らなかったトンチン。凍ったWhatsAppグループで終わったいとこ達の旅行。",
      chapters: [
        { icon: "🌍", title: "問題", body: "インフレがすべてを蝕んでいます。生活費はヨーロッパ、カメルーン、ダカール、ムンバイで爆発しています。1ユーロが大切で、間違えた1ユーロは沈黙、恨み、壊れた関係に変わります。" },
        { icon: "💔", title: "緊張", body: "Excelシートは読めない。WhatsAppは計算しない。西洋のアプリはトンチンも、CFAフランも、パリの6人シェアハウスの現実も理解していない。" },
        { icon: "🕊", title: "解決", body: "BMD。本当にお金を共有する人々のためのツール。マルチ通貨(25+)、多言語(20+)、トンチン、債務スワップ、レシートOCR、WhatsAppボット。ドラマなし、トラッカーなし、広告なし。" },
      ],
      manifesto: "「すべての1円を数えることで、友達を数える必要をなくします。」",
      cta: "無料で始める",
    },
    hero: {
      tagline: "Back Mes Do · ディアスポラ",
      headline: "共有マネー。守られる友情。",
      subhead:
        "トンチン、シェアハウス、旅行、結婚式、教会、クラブ:BMDは計算、簡素化、追跡を行い、誰も損をしないようにします。",
      ctaPrimary: "無料で始める",
      ctaSecondary: "デモを見る",
    },
    features: {
      title: "必要なものすべて、それ以上はなし",
      items: [
        { icon: "🪙", title: "完全なトンチン", body: "サイクル、受益者の順序、調整可能な日付、領収書、複数年の履歴。" },
        { icon: "💸", title: "共有費用", body: "均等、シェア、パーセンテージ。写真/PDFレシートを全員が閲覧可能。" },
        { icon: "↔", title: "債務スワップ", body: "三者承認による相殺または移転。" },
        { icon: "🔔", title: "完全な通知", body: "あなたに関係することだけ。設計上のスパム対策。" },
        { icon: "📷", title: "レシートOCR", body: "レシート写真:金額、加盟店、日付を自動検出。" },
        { icon: "🛡", title: "GDPR & プライバシー", body: "アドレス帳の一括読み取りなし。明示的な同意。" },
      ],
    },
    featuresLong: {
      intro:
        "BMDは、お金が親しい人々の間で流れるすべての状況をカバーします:トンチン、シェアハウス、旅行、結婚式、教会、クラブ、チーム。",
      categories: [
        { key: "groups", icon: "👥", label: "グループと役割", pitch: "30秒で適切なグループタイプを作成。",
          items: [
            { icon: "🎭", title: "6つの事前定義タイプ", body: "トンチン · シェアハウス · 旅行 · イベント · クラブ · 教会。" },
            { icon: "🛡", title: "明確な役割", body: "管理者、会計、メンバー。重い階層なしで追跡可能。" },
            { icon: "✉️", title: "マルチチャネル招待", body: "共有可能なリンク、QRコード、電話連絡先(明示的同意で)。" },
            { icon: "🎨", title: "コミュニティテーマ", body: "グループのビジュアルアイデンティティを選択。" },
          ],
        },
        { key: "expenses", icon: "💸", label: "共有費用", pitch: "費用記録は5秒で完了。",
          items: [
            { icon: "📷", title: "レシートOCR", body: "レシート写真で金額、加盟店、日付を自動検出。" },
            { icon: "⚖️", title: "分配:均等 · シェア · パーセント", body: "1クリックで均等分配、カスタムシェア、または正確なパーセント。" },
            { icon: "🤖", title: "AI分配提案", body: "BMDがあなたの習慣を学習し、自動的に正しいモードを提案。" },
            { icon: "📜", title: "カテゴリルール", body: "ルールを一度作成、BMDが毎回適用。" },
            { icon: "🚨", title: "異常検出", body: "重複、非典型的な金額:検証前に警告。" },
            { icon: "🏦", title: "銀行CSVインポート", body: "明細書をインポート。BMDが自動的にカテゴリ化を提案。" },
          ],
        },
        { key: "tontines", icon: "🪙", label: "トンチンとサイクル", pitch: "すべての回転貯蓄モデルがサポートされ、二重承認と改ざん不可能な履歴。",
          items: [
            { icon: "🔄", title: "完全自動化サイクル", body: "金額、頻度、受益者の順序を設定。" },
            { icon: "🤝", title: "拠出の二重承認", body: "支払者が宣言、会計が確認。" },
            { icon: "📅", title: "カレンダービュー", body: "今後12ヶ月間、誰がいつ何を受け取るかが一目瞭然。" },
            { icon: "🎯", title: "オークション(Hui)", body: "中国系コミュニティ向け。" },
            { icon: "📚", title: "複数年の履歴", body: "改ざん不可能な監査ログ:最低5年保存。" },
          ],
        },
        { key: "settle", icon: "↔", label: "残高と決済", pitch: "BMDがグループを清算するための最小取引数を計算。",
          items: [
            { icon: "🧮", title: "リアルタイム残高", body: "マルチ通貨グローバル残高、即座の再計算。" },
            { icon: "🎯", title: "最適な決済", body: "「最小キャッシュフロー」アルゴリズム:可能なら2〜3回ではなく1回の取引。" },
            { icon: "🔁", title: "債務スワップと譲渡", body: "詐欺防止のための3者承認。" },
            { icon: "🔗", title: "使い捨て支払いリンク", body: "メンバーから支払いを受けるための安全なリンクを生成。" },
          ],
        },
        { key: "money", icon: "💱", label: "マルチ通貨と支払い", pitch: "BMDはディアスポラのために設計。25以上の通貨をサポート。",
          items: [
            { icon: "🌍", title: "25以上の通貨をライブレートで", body: "ユーロ、ドル、ポンド、CFAフラン、ナイラ、ディルハム、ランド、レアル…" },
            { icon: "💳", title: "あなたのツールと互換", body: "Lydia、Wave、Wise、SEPA送金、PayPal、PayPay。BMDは置き換えず — 記録します。" },
            { icon: "📈", title: "リアルタイム変換", body: "XAFでの費用は各メンバーのデフォルト通貨で表示されます。" },
            { icon: "🧾", title: "ダウンロード可能な税務レシート", body: "教会、協会、スポーツクラブ向け。" },
          ],
        },
        { key: "comms", icon: "🔔", label: "コミュニケーションとリマインダー", pitch: "すべて通知駆動 — 設計上のスパム対策。",
          items: [
            { icon: "🛎", title: "粒度の細かい通知", body: "あなたに関係することだけ通知されます。" },
            { icon: "📅", title: "週次サマリー", body: "毎週日曜の夕方:何が起きたか、残高、未払い債務。" },
            { icon: "💬", title: "ネイティブWhatsAppボット", body: "音声またはテキストメッセージで費用を追加。" },
            { icon: "😊", title: "トーンを選択", body: "親しみやすい、しっかり、ユーモア、プロフェッショナル。" },
            { icon: "🌙", title: "グループごとの通知オフ", body: "1時間、24時間、または明朝までグループをミュート。" },
          ],
        },
        { key: "intelligence", icon: "🧠", label: "知能と自動化", pitch: "BMDはAIを書類作業の排除に使用、スパムには使いません。",
          items: [
            { icon: "🎙", title: "Whisper音声入力", body: "BMDが書き起こし、理解、整理。" },
            { icon: "📊", title: "統計とインサイト", body: "月次トレンド、カテゴリ別内訳、グループ平均。" },
            { icon: "🌐", title: "管理コンテンツの自動翻訳", body: "BMDが自動的に翻訳、オプションでレビュー。" },
            { icon: "🔮", title: "異常と重複", body: "ドラマになる前にBMDが警告。" },
          ],
        },
        { key: "trust", icon: "🛡", label: "セキュリティとプライバシー", pitch: "GDPR by design。",
          items: [
            { icon: "🔑", title: "パスワードなしサインイン", body: "OTPはSMS、メール、またはWhatsAppで。Passkeys。" },
            { icon: "🚫", title: "アドレス帳の一括読み取りゼロ", body: "明示的に選択した連絡先のみが送信されます。" },
            { icon: "📜", title: "改ざん不可能な監査ログ", body: "機密操作は追加のみ、署名付き、5年保存。" },
            { icon: "🇪🇺", title: "完全なGDPR準拠", body: "JSON/CSVエクスポート、リクエスト時30日以内に削除。" },
            { icon: "🌐", title: "EUホスティング", body: "データベースとサーバーはEU地域。" },
          ],
        },
        { key: "platform", icon: "📱", label: "プラットフォームとアクセシビリティ", pitch: "本物のネイティブアプリ、本物のWebポータル。",
          items: [
            { icon: "📲", title: "インストール可能なPWA", body: "iPhone、Android、デスクトップで本物のアプリとしてインストール。" },
            { icon: "💬", title: "WhatsAppボット", body: "WhatsApp番号を30秒で接続。" },
            { icon: "🌍", title: "多言語(FR · EN · ES · PT · DE · IT · LB · RU · JA · KO · AR · SW)", body: "インターフェースが優先言語に適応。" },
            { icon: "♿", title: "WCAG 2.1 AAアクセシビリティ", body: "検証済みコントラスト、キーボードナビゲーション、ライト/ダークモード。" },
            { icon: "🌗", title: "ライト/ダークモード", body: "右上の☀️/🌙アイコンから1クリックで切替。" },
          ],
        },
      ],
    },
    referral: {
      kicker: "セールスプログラム",
      title: "BMDを推薦して、サブスクリプションごとに獲得",
      intro:
        "BMDはシンプルな紹介プログラム — レベルなし、ピラミッドなし。有料に変わる登録ごとに、ユーザーが顧客である限り生涯コミッションを獲得。",
      benefits: [
        { icon: "💰", title: "直接コミッション", body: "あなたが推薦したユーザーが支払う月額の20%(またはイベントプランの一括払い)。毎月1日に支払い。" },
        { icon: "♾️", title: "生涯継続", body: "紹介者がサブスクライブし続ける限り、コミッションを獲得 — 上限なし、有効期限なし。" },
        { icon: "📊", title: "専用セールスダッシュボード", body: "誰が登録したか、MRR、予測収益、支払履歴。" },
        { icon: "🎁", title: "紹介者へのボーナス", body: "紹介者も割引を受け取ります(年間プランで1ヶ月無料、または生涯10%オフ)。" },
      ],
      howItWorks: [
        { num: "1", title: "セールスエリアを有効化", body: "プロフィール → セールスエリア → 「有効化」。パーソナライズされた紹介コードを受け取ります。" },
        { num: "2", title: "ネットワークと共有", body: "教会、サッカークラブ、ディアスポラの友人へ。" },
        { num: "3", title: "登録を追跡", body: "クリック、登録、有料プランへの変換がリアルタイムで表示。" },
        { num: "4", title: "コミッションを受け取る", body: "毎月1日に自動支払い(25€から)。Lydia、Wave、SEPA送金、Mobile Money。" },
      ],
      cta: { label: "プログラムを発見", href: "/dashboard/affiliate" },
      smallPrint:
        "レベルなし、ピラミッドマーケティングなし。1レベルのみ、固定で透明なコミッション。",
    },
    howItWorks: {
      title: "3ステップで",
      steps: [
        { num: "1", title: "グループを作成", body: "トンチン、シェアハウス、旅行、結婚式…タイプとデフォルト通貨を選択。" },
        { num: "2", title: "親しい人を招待", body: "共有可能なリンク、QRコード、または電話連絡先。" },
        { num: "3", title: "穏やかに暮らす", body: "費用、拠出、スワップを記録。BMDが残高を計算します。" },
      ],
    },
    pricing: {
      title: "ほとんどの人に無料",
      free: {
        name: "無料",
        price: "¥0",
        features: ["最大3つのアクティブグループ", "無制限のトンチン、費用、スワップ", "PDF/写真レシート", "完全な通知"],
      },
      pro: {
        name: "Pro",
        price: "¥600 / 月",
        features: ["無制限のグループ", "詳細な会計エクスポート", "10年の履歴", "優先サポート"],
        cta: "近日公開",
      },
    },
    faq: {
      title: "よくある質問",
      items: [
        { q: "BMDは銀行に代わりますか?", a: "いいえ。BMDは共有管理ツールです。支払いは通常のチャネル(Lydia、Wave、PayPay、銀行振込)で行われます。" },
        { q: "私のデータは安全ですか?", a: "はい。通信は暗号化され、明示的な同意なしにアドレス帳を読みません(GDPR)。" },
        { q: "BMDのトンチンはどう機能しますか?", a: "グループを作成、金額と頻度を設定。各ターンで受益者が日付を選択し、全員が確認します。" },
      ],
    },
    faqLong: {
      intro: "最もよく聞かれる質問をテーマ別にグループ化。回答が見つからない場合は hello@backmesdo.com まで — 24時間以内に返信します。",
      categories: [
        { key: "basics", icon: "👋", label: "基本",
          items: [
            { q: "BMDを一文で?", a: "グループがドラマなしで共有マネーを管理するのを助けるアプリ。" },
            { q: "BMDは銀行に代わりますか?", a: "いいえ。BMDはお金を動かしません。通常のチャネルで支払い続けます。" },
            { q: "いくらかかりますか?", a: "無料プランは3つのアクティブグループをカバー。Pro ¥600/月。Eventプラン ¥3000一括払い。" },
            { q: "どのデバイスで動作しますか?", a: "iPhone(iOS 15+)、Android(9+)、最新のコンピュータ。" },
            { q: "親しい人全員が登録する必要がありますか?", a: "すぐではありません。「シャドウプロファイル」でグループを作成できます。" },
          ],
        },
        { key: "groups", icon: "👥", label: "グループ",
          items: [
            { q: "どのタイプのグループを作成できますか?", a: "6つの事前定義タイプ:トンチン、シェアハウス、旅行、イベント、クラブ、教会。" },
            { q: "最大グループサイズ?", a: "厳格な制限なし。300人以上のメンバーがいる教会もあります。" },
            { q: "誰かを招待するには?", a: "3つのオプション:共有可能なリンク、QRコード、または連絡先から(明示的同意で)。" },
            { q: "メンバーを削除できますか?", a: "はい、管理者はいつでも削除できます。過去の費用は履歴に残ります。" },
            { q: "ゲストは私の他のグループを見ますか?", a: "決して。各グループは隔離されています。" },
          ],
        },
        { key: "tontines", icon: "🪙", label: "トンチン",
          items: [
            { q: "BMDのトンチンはどう機能しますか?", a: "グループを作成、金額と頻度を設定。各ターンで受益者が正確な日付を選択。" },
            { q: "bamileke、hui、susuの違いは?", a: "同じ原則(回転貯蓄)、順序とメカニズムが異なります。BMDは3つすべてをサポート。" },
            { q: "誰かが支払わない場合は?", a: "会計係が確認していない人を確認。BMDが選択したトーンで自動リマインダーを送信。" },
            { q: "複数年にわたってトンチンを追跡できますか?", a: "はい、履歴は最低5年保存され、いつでもExcelエクスポート可能。" },
          ],
        },
        { key: "money", icon: "💱", label: "通貨",
          items: [
            { q: "BMDはどの通貨をサポートしますか?", a: "25以上のアクティブな通貨。レートは毎時更新。" },
            { q: "通貨間の変換はどう機能しますか?", a: "各メンバーが自分のデフォルト通貨で金額を見ます。" },
            { q: "BMDは支払いに手数料を取りますか?", a: "決して。BMDはお金を動かしません。" },
            { q: "どの支払い方法が互換ですか?", a: "すべて。Lydia、Wave、Wise、SEPA、PayPal、現金、PayPay。" },
            { q: "BMDプランの支払いは?", a: "Stripe Checkout:カード、Apple Pay、Google Pay。" },
          ],
        },
        { key: "expenses", icon: "💸", label: "費用",
          items: [
            { q: "レシートをスキャンするには?", a: "写真またはPDF。BMDが自動的に検出。" },
            { q: "誰が費用を編集できますか?", a: "作成者とグループ管理者のみ。すべての編集は監査ログに記録。" },
            { q: "不均等に分割するには?", a: "3つのモード:均等、カスタムシェア、正確なパーセント。" },
            { q: "BMDは重複を検出しますか?", a: "はい、自動的に。マージ提案付きの⚠️バッジが表示されます。" },
            { q: "銀行明細書をインポートできますか?", a: "はい、CSVで。BMDは主要銀行のフォーマットを認識。" },
          ],
        },
        { key: "settle", icon: "↔", label: "残高",
          items: [
            { q: "BMDは誰が誰に借りているかをどう計算しますか?", a: "「最小キャッシュフロー」アルゴリズム:すべての清算に必要な最小取引数を見つける。" },
            { q: "債務スワップとは?", a: "メンバーが他のメンバーの債務を引き受ける時。3者承認。" },
            { q: "債務を支払い済みとマークするには?", a: "グループ → 残高 → 「決済」 → チャネル選択 → 確認。" },
            { q: "支払ったと言うが受け取っていない場合は?", a: "そのため、BMDは両側からの確認を要求します。" },
          ],
        },
        { key: "privacy", icon: "🛡", label: "プライバシー",
          items: [
            { q: "私のデータは安全ですか?", a: "はい。TLS 1.3暗号化接続、パスワードなし、EUホスティング、完全なGDPR。" },
            { q: "パスワードなしサインインはどう機能しますか?", a: "電話またはメールを入力、6桁のコードを受け取り、入力。5分または1回の使用後に期限切れ。" },
            { q: "passkeyとは?", a: "生体認証アクセスキー(Face ID、Touch ID、Windows Hello)。" },
            { q: "BMDは私の連絡先を読みますか?", a: "決して一括では。明示的に選択した連絡先のみが送信されます。" },
            { q: "アカウントを削除できますか?", a: "はい、プロフィールから。30日以内に有効(GDPR)。" },
            { q: "すべてのデータをエクスポートできますか?", a: "はい、JSONまたはCSVで。24時間以内にファイル付きメールを受け取ります。" },
          ],
        },
        { key: "billing", icon: "💳", label: "プラン",
          items: [
            { q: "無料プランには何が含まれますか?", a: "最大3つのアクティブグループ、無制限のトンチン/費用/スワップ、写真とPDFレシート、OCR(月3回)。" },
            { q: "Proプラン¥600/月は?", a: "無制限のグループ、無制限のOCR、詳細な会計エクスポート、10年の履歴、優先サポート。" },
            { q: "Eventプラン¥3000とは?", a: "大きな機会向けの一括払い(サブスクリプションではない)。" },
            { q: "いつでもキャンセルできますか?", a: "はい、プロフィールから。キャンセル料なし。" },
            { q: "価格は国によって変わりますか?", a: "はい、BMDは地域ごとに価格を調整(購買力平価)。" },
            { q: "紹介プログラムはどう機能しますか?", a: "セールスエリアを有効化 → パーソナルコード/リンクを受け取り → 共有 → 生涯20%獲得。" },
          ],
        },
      ],
      contactNudge:
        "より具体的な回答や特定のケースについて話したい?hello@backmesdo.com まで — 人間が24時間以内に返信します。",
    },
    cta: {
      headline: "今すぐ始める",
      body: "無料。クレジットカード不要。1分以内に登録。",
      button: "アカウントを作成",
    },
    footer: {
      tagline: "共有マネー。守られる友情。",
      rights: "全著作権所有。",
      privacy: "プライバシー",
      terms: "利用規約",
      contact: "お問い合わせ",
    },
  },
  // ============================================================
  // 한국어 — diaspora coréenne et globale
  // ============================================================
  ko: {
    meta: {
      title: "BMD · 공유 자금, 드라마 없이",
      description:
        "BMD는 아프리카 디아스포라가 톤틴, 공동 주거, 여행 및 그룹 행사를 관리하는 데 도움을 줍니다 — 투명성, 공정성, 평온.",
    },
    nav: {
      story: "우리의 이야기",
      features: "기능",
      howItWorks: "작동 방식",
      pricing: "가격",
      login: "로그인",
      signUp: "가입",
    },
    langPicker: { main: "주요 언어", europeanGroup: "유럽 언어", asianGroup: "아시아 언어", arabicGroup: "아랍어", africanGroup: "아프리카 언어" },
    story: {
      kicker: "우리의 이야기",
      title: "돈이 우정을 잃게 해서는 안 됩니다",
      punchline: "우리 모두는 레스토랑이 법정이 된 저녁 식사를 경험했습니다. 누가 지불했는지 아무도 모르는 톤틴. 차가운 WhatsApp 그룹으로 끝난 사촌들의 여행.",
      chapters: [
        { icon: "🌍", title: "문제", body: "인플레이션이 모든 것을 잠식합니다. 생활비가 유럽, 카메룬, 다카르, 뭄바이에서 폭발하고 있습니다. 모든 유로가 중요하며, 잘못 계산된 유로는 침묵, 원한, 깨진 관계가 됩니다." },
        { icon: "💔", title: "긴장", body: "Excel 시트는 읽을 수 없고, WhatsApp은 계산하지 않으며, 서양 앱은 톤틴, CFA 프랑, 파리의 6인 공동주거의 현실을 이해하지 못합니다." },
        { icon: "🕊", title: "해결책", body: "BMD. 진짜로 돈을 공유하는 사람들을 위한 도구. 다중 통화(25+), 다국어(20+), 톤틴, 부채 교환, 영수증 OCR, WhatsApp 봇. 드라마 없이, 추적기 없이, 광고 없이." },
      ],
      manifesto: "「우리는 모든 센트를 세어, 친구를 세지 않아도 됩니다.」",
      cta: "무료로 시작",
    },
    hero: {
      tagline: "Back Mes Do · 디아스포라",
      headline: "공유 자금. 보호되는 우정.",
      subhead:
        "톤틴, 공동 주거, 여행, 결혼식, 교회, 클럽: BMD는 모든 비용을 계산, 단순화 및 추적하여 누구도 손해보지 않게 합니다.",
      ctaPrimary: "무료로 시작",
      ctaSecondary: "데모 보기",
    },
    features: {
      title: "필요한 모든 것, 그 이상은 없음",
      items: [
        { icon: "🪙", title: "완전한 톤틴", body: "주기, 수혜자 순서, 조정 가능한 날짜, 영수증, 다년간의 기록." },
        { icon: "💸", title: "공유 비용", body: "균등, 분할 또는 비율. 모든 멤버가 볼 수 있는 사진/PDF 영수증." },
        { icon: "↔", title: "부채 교환", body: "삼자 검증으로 상쇄 또는 이전." },
        { icon: "🔔", title: "완전한 알림", body: "당신과 관련된 것만. 디자인에 의한 안티 스팸." },
        { icon: "📷", title: "영수증 OCR", body: "영수증 사진: 금액, 상점, 날짜를 자동 감지." },
        { icon: "🛡", title: "GDPR 및 프라이버시", body: "주소록 일괄 읽기 없음. 명시적 동의." },
      ],
    },
    featuresLong: {
      intro:
        "BMD는 가까운 사람들 사이에서 돈이 순환하는 모든 상황을 다룹니다: 톤틴, 공동 주거, 여행, 결혼식, 교회, 클럽, 팀.",
      categories: [
        { key: "groups", icon: "👥", label: "그룹과 역할", pitch: "30초 안에 적합한 그룹 유형 생성.",
          items: [
            { icon: "🎭", title: "6가지 사전 정의된 유형", body: "톤틴 · 공동 주거 · 여행 · 이벤트 · 클럽 · 교회/협회." },
            { icon: "🛡", title: "명확한 역할", body: "관리자, 회계 담당, 회원. 무거운 계층 없이 추적 가능." },
            { icon: "✉️", title: "다중 채널 초대", body: "공유 가능한 링크, QR 코드, 전화 연락처(명시적 동의)." },
            { icon: "🎨", title: "커뮤니티 테마", body: "그룹의 시각적 정체성을 선택." },
          ],
        },
        { key: "expenses", icon: "💸", label: "공유 비용", pitch: "비용 기록은 5초가 걸려야 합니다.",
          items: [
            { icon: "📷", title: "영수증 OCR", body: "영수증 사진: 금액, 상점, 날짜 자동 감지. 세 가지 엔진." },
            { icon: "⚖️", title: "분할: 균등 · 분할 · 비율", body: "1클릭 균등 분할, 사용자 지정 분할 또는 정확한 비율." },
            { icon: "🤖", title: "AI 분할 제안", body: "BMD가 습관을 학습하고 자동으로 올바른 모드를 제안." },
            { icon: "📜", title: "카테고리 규칙", body: "규칙을 한 번 만들면 BMD가 항상 적용." },
            { icon: "🚨", title: "이상 감지", body: "중복, 비정상적인 금액: 검증 전에 경고." },
            { icon: "🏦", title: "은행 CSV 가져오기", body: "거래 내역서를 가져오면 BMD가 자동으로 분류 제안." },
          ],
        },
        { key: "tontines", icon: "🪙", label: "톤틴과 주기", pitch: "모든 회전 저축 모델 지원, 이중 검증과 변경 불가능한 기록.",
          items: [
            { icon: "🔄", title: "완전 자동화된 주기", body: "금액, 빈도, 수혜자 순서를 정의." },
            { icon: "🤝", title: "기여금 이중 검증", body: "지불자가 신고, 회계 담당자가 확인." },
            { icon: "📅", title: "캘린더 보기", body: "모든 미래 라운드가 시각적으로 표시." },
            { icon: "🎯", title: "경매 (Hui)", body: "중국 커뮤니티용." },
            { icon: "📚", title: "다년간 기록", body: "변경 불가능한 감사 로그: 최소 5년." },
          ],
        },
        { key: "settle", icon: "↔", label: "잔액과 결제", pitch: "BMD가 그룹 결제에 필요한 최소 거래 수를 계산.",
          items: [
            { icon: "🧮", title: "실시간 잔액", body: "다중 통화 글로벌 잔액, 즉각적인 재계산." },
            { icon: "🎯", title: "최적 결제", body: "「최소 현금 흐름」 알고리즘: 가능한 경우 2-3회가 아닌 1회 거래." },
            { icon: "🔁", title: "부채 교환 및 이전", body: "사기 방지를 위한 3자 검증." },
            { icon: "🔗", title: "일회용 결제 링크", body: "안전한 링크를 생성하여 회원으로부터 결제 받기." },
          ],
        },
        { key: "money", icon: "💱", label: "다중 통화 및 결제", pitch: "BMD는 디아스포라를 위해 만들어졌습니다. 25개 이상의 통화 지원.",
          items: [
            { icon: "🌍", title: "라이브 환율로 25개 이상의 통화", body: "유로, 달러, 파운드, CFA 프랑, 나이라, 디르함, 랜드, 헤알…" },
            { icon: "💳", title: "도구와 호환", body: "Lydia, Wave, Wise, SEPA, PayPal, 카카오페이. BMD는 대체하지 않고 — 기록합니다." },
            { icon: "📈", title: "실시간 변환", body: "XAF로 된 비용은 각 회원의 기본 통화로 표시됩니다." },
            { icon: "🧾", title: "다운로드 가능한 세금 영수증", body: "교회, 협회, 스포츠 클럽용." },
          ],
        },
        { key: "comms", icon: "🔔", label: "커뮤니케이션 및 알림", pitch: "모든 것이 알림으로 구동됩니다.",
          items: [
            { icon: "🛎", title: "세분화된 알림", body: "당신과 관련된 것만 알림." },
            { icon: "📅", title: "주간 요약", body: "매주 일요일 저녁: 무엇이 일어났는지, 잔액, 미결제 부채." },
            { icon: "💬", title: "기본 WhatsApp 봇", body: "음성 또는 텍스트 메시지로 비용 추가." },
            { icon: "😊", title: "톤 선택", body: "친근한, 단호한, 유머러스한, 전문적인." },
            { icon: "🌙", title: "그룹별 방해 금지", body: "1시간, 24시간 또는 내일 아침까지 그룹 음소거." },
          ],
        },
        { key: "intelligence", icon: "🧠", label: "지능 및 자동화", pitch: "BMD는 AI를 사용하여 서류 작업을 제거합니다.",
          items: [
            { icon: "🎙", title: "Whisper 음성 입력", body: "BMD가 전사, 이해, 정리." },
            { icon: "📊", title: "통계 및 인사이트", body: "월별 트렌드, 카테고리별 분류." },
            { icon: "🌐", title: "관리 콘텐츠 자동 번역", body: "BMD가 자동 번역, 선택적 검토." },
            { icon: "🔮", title: "이상과 중복", body: "드라마가 되기 전에 BMD가 경고." },
          ],
        },
        { key: "trust", icon: "🛡", label: "보안 및 프라이버시", pitch: "GDPR by design.",
          items: [
            { icon: "🔑", title: "비밀번호 없는 로그인", body: "OTP는 SMS, 이메일 또는 WhatsApp으로. Passkeys." },
            { icon: "🚫", title: "주소록 일괄 읽기 제로", body: "명시적으로 선택한 연락처만 전송됩니다." },
            { icon: "📜", title: "변경 불가능한 감사 로그", body: "민감한 작업은 추가 전용, 서명, 5년 보관." },
            { icon: "🇪🇺", title: "완전한 GDPR 준수", body: "JSON/CSV 내보내기, 요청 시 30일 이내 삭제." },
            { icon: "🌐", title: "EU 호스팅", body: "데이터베이스 및 서버는 EU 지역에 있습니다." },
          ],
        },
        { key: "platform", icon: "📱", label: "플랫폼 및 접근성", pitch: "전화의 진정한 네이티브 앱, PC의 진정한 웹 포털.",
          items: [
            { icon: "📲", title: "설치 가능한 PWA", body: "iPhone, Android 또는 데스크톱에서." },
            { icon: "💬", title: "WhatsApp 봇", body: "30초 만에 WhatsApp 번호 연결." },
            { icon: "🌍", title: "다국어", body: "인터페이스가 선호 언어에 적응." },
            { icon: "♿", title: "WCAG 2.1 AA 접근성", body: "검증된 대비, 키보드 탐색, 라이트/다크 모드." },
            { icon: "🌗", title: "라이트 / 다크 모드", body: "오른쪽 상단의 ☀️/🌙 아이콘에서 1클릭으로 전환." },
          ],
        },
      ],
    },
    referral: {
      kicker: "영업 프로그램",
      title: "BMD 추천하고 모든 구독에서 수익 창출",
      intro:
        "BMD에는 간단한 추천 프로그램이 있습니다 — 레벨 없음, 피라미드 없음. 유료로 전환되는 모든 가입은 사용자가 고객인 한 평생 수수료를 제공합니다.",
      benefits: [
        { icon: "💰", title: "직접 수수료", body: "추천한 사용자가 매월 지불하는 금액의 20%(또는 이벤트 플랜의 일회성). 매월 1일에 지급." },
        { icon: "♾️", title: "평생 반복", body: "추천인이 구독을 유지하는 한, 수수료를 받습니다 — 상한 없음, 만료 없음." },
        { icon: "📊", title: "전용 영업 대시보드", body: "누가 등록했는지, MRR, 예상 수익, 지급 내역." },
        { icon: "🎁", title: "추천인 보너스", body: "추천인도 할인을 받습니다(연간 플랜에서 1개월 무료, 또는 평생 10%)." },
      ],
      howItWorks: [
        { num: "1", title: "영업 영역 활성화", body: "프로필 → 영업 영역 → 「활성화」. 개인화된 추천 코드를 받습니다." },
        { num: "2", title: "네트워크와 공유", body: "교회, 축구 클럽, 디아스포라 친구들에게." },
        { num: "3", title: "가입 추적", body: "각 클릭, 가입, 유료 플랜으로의 전환이 실시간으로 표시." },
        { num: "4", title: "수수료 받기", body: "매월 1일 자동 지급(25€부터)." },
      ],
      cta: { label: "프로그램 발견", href: "/dashboard/affiliate" },
      smallPrint:
        "레벨 없음, 피라미드 마케팅 없음. 단일 레벨, 고정되고 투명한 수수료.",
    },
    howItWorks: {
      title: "세 단계로",
      steps: [
        { num: "1", title: "그룹 생성", body: "톤틴, 공동 주거, 여행, 결혼식… 유형과 기본 통화 선택." },
        { num: "2", title: "가까운 사람 초대", body: "공유 가능한 링크, QR 코드 또는 전화 연락처." },
        { num: "3", title: "평온하게 살기", body: "비용, 기여금, 교환을 기록. BMD가 잔액을 계산." },
      ],
    },
    pricing: {
      title: "대부분의 사람들에게 무료",
      free: {
        name: "무료",
        price: "₩0",
        features: ["최대 3개 활성 그룹", "무제한 톤틴, 비용, 교환", "PDF/사진 영수증", "완전한 알림"],
      },
      pro: {
        name: "Pro",
        price: "₩6,000 / 월",
        features: ["무제한 그룹", "상세한 회계 내보내기", "10년 기록", "우선 지원"],
        cta: "곧 출시",
      },
    },
    faq: {
      title: "자주 묻는 질문",
      items: [
        { q: "BMD는 은행을 대체합니까?", a: "아니오. BMD는 공유 관리 도구입니다. 결제는 일반 채널(Lydia, Wave, 카카오페이, 은행 송금)을 통해 이루어집니다." },
        { q: "내 데이터는 안전합니까?", a: "예. 통신을 암호화하고 명시적 동의 없이 주소록을 읽지 않습니다(GDPR)." },
        { q: "BMD 톤틴은 어떻게 작동합니까?", a: "그룹을 생성하고 금액과 빈도를 설정합니다. 각 라운드마다 수혜자가 날짜를 선택하고 모든 사람이 확인합니다." },
      ],
    },
    faqLong: {
      intro: "가장 자주 묻는 질문을 주제별로 그룹화. 답을 찾을 수 없다면 hello@backmesdo.com 으로 — 24시간 이내에 답변합니다.",
      categories: [
        { key: "basics", icon: "👋", label: "기초",
          items: [
            { q: "한 문장으로 BMD는?", a: "그룹이 드라마 없이 공유 자금을 관리하도록 돕는 앱." },
            { q: "BMD는 내 은행이나 Lydia를 대체합니까?", a: "아니오. BMD는 돈을 옮기지 않습니다. 일반 채널로 계속 결제." },
            { q: "비용은 얼마입니까?", a: "무료 플랜은 대부분을 다룹니다: 3개의 활성 그룹. Pro ₩6,000/월. Event 플랜 ₩30,000 일회성." },
            { q: "어떤 장치에서 작동합니까?", a: "iPhone(iOS 15+), Android(9+), 모든 최신 컴퓨터." },
            { q: "내 가까운 사람들이 모두 등록해야 합니까?", a: "즉시는 아닙니다. 「섀도우 프로필」로 그룹을 만들 수 있습니다." },
          ],
        },
        { key: "groups", icon: "👥", label: "그룹",
          items: [
            { q: "어떤 유형의 그룹을 만들 수 있습니까?", a: "6가지 사전 정의된 유형: 톤틴, 공동 주거, 여행, 이벤트, 클럽, 교회/협회." },
            { q: "최대 그룹 크기?", a: "엄격한 제한 없음. 300명 이상의 회원이 있는 교회도 있습니다." },
            { q: "누군가를 초대하려면?", a: "세 가지 옵션: 공유 가능한 링크, QR 코드 또는 연락처에서." },
            { q: "회원을 제거할 수 있습니까?", a: "예, 관리자는 언제든지 제거할 수 있습니다." },
            { q: "초대된 사람들이 다른 그룹을 봅니까?", a: "절대 아닙니다. 각 그룹은 격리되어 있습니다." },
          ],
        },
        { key: "tontines", icon: "🪙", label: "톤틴",
          items: [
            { q: "BMD에서 톤틴은 어떻게 작동합니까?", a: "그룹을 생성하고 금액과 빈도를 설정. 각 라운드에서 수혜자가 정확한 날짜를 선택." },
            { q: "bamileke, hui, susu의 차이는?", a: "동일한 원칙(회전 저축), 순서와 메커니즘이 다름. BMD는 세 가지 모두 지원." },
            { q: "누군가가 지불하지 않으면?", a: "회계 담당자가 확인하지 않은 사람을 봅니다. BMD가 선택한 톤으로 자동 알림 전송." },
            { q: "여러 해에 걸쳐 톤틴을 추적할 수 있습니까?", a: "예, 기록은 최소 5년 보관, Excel 내보내기 언제든지 가능." },
          ],
        },
        { key: "money", icon: "💱", label: "통화",
          items: [
            { q: "BMD는 어떤 통화를 지원합니까?", a: "25개 이상의 활성 통화. 매시간 환율 업데이트." },
            { q: "통화 간 변환은 어떻게 작동합니까?", a: "각 회원이 자신의 기본 통화로 금액을 봅니다." },
            { q: "BMD는 결제 수수료를 받습니까?", a: "절대 아닙니다. BMD는 돈을 옮기지 않습니다." },
            { q: "어떤 결제 방법이 호환됩니까?", a: "모두. Lydia, Wave, Wise, SEPA, PayPal, 카카오페이." },
            { q: "BMD 플랜은 어떻게 결제합니까?", a: "Stripe Checkout: 카드, Apple Pay, Google Pay." },
          ],
        },
        { key: "expenses", icon: "💸", label: "비용",
          items: [
            { q: "영수증을 어떻게 스캔합니까?", a: "사진 또는 PDF. BMD가 자동 감지." },
            { q: "비용을 누가 편집할 수 있습니까?", a: "생성자와 그룹 관리자만." },
            { q: "불균등하게 분할하려면?", a: "세 가지 모드: 균등, 사용자 지정 분할, 정확한 비율." },
            { q: "BMD는 중복을 감지합니까?", a: "예, 자동으로." },
            { q: "은행 명세서를 가져올 수 있습니까?", a: "예, CSV로." },
          ],
        },
        { key: "settle", icon: "↔", label: "잔액",
          items: [
            { q: "BMD는 누가 누구에게 빚지고 있는지 어떻게 계산합니까?", a: "「최소 현금 흐름」 알고리즘." },
            { q: "부채 교환이란?", a: "한 회원이 다른 회원의 부채를 인수할 때. 3자 검증." },
            { q: "부채를 결제됨으로 표시하려면?", a: "그룹 → 잔액 → 「결제」 → 채널 선택." },
            { q: "지불했다고 하지만 받지 못했다면?", a: "그래서 BMD는 양측의 확인을 요구합니다." },
          ],
        },
        { key: "privacy", icon: "🛡", label: "프라이버시",
          items: [
            { q: "내 데이터는 안전합니까?", a: "예. TLS 1.3 암호화 연결, 비밀번호 없음, EU 호스팅, 완전한 GDPR." },
            { q: "비밀번호 없는 로그인은 어떻게 작동합니까?", a: "전화 또는 이메일을 입력하고 6자리 코드를 받아 입력. 5분 또는 1회 사용 후 만료." },
            { q: "passkey란?", a: "생체 인식 액세스 키(Face ID, Touch ID)." },
            { q: "BMD는 내 연락처를 읽습니까?", a: "절대로 일괄적으로는 아닙니다." },
            { q: "내 계정을 삭제할 수 있습니까?", a: "예, 프로필에서. 30일 이내에 유효." },
            { q: "모든 데이터를 내보낼 수 있습니까?", a: "예, JSON 또는 CSV로." },
          ],
        },
        { key: "billing", icon: "💳", label: "플랜",
          items: [
            { q: "무료 플랜에는 무엇이 포함됩니까?", a: "최대 3개 활성 그룹, 무제한 톤틴/비용/교환, 사진 및 PDF 영수증." },
            { q: "Pro 플랜 ₩6,000/월은?", a: "무제한 그룹, 무제한 OCR, 상세한 회계 내보내기, 10년 기록." },
            { q: "Event 플랜 ₩30,000은?", a: "큰 행사를 위한 일회성 결제." },
            { q: "언제든지 취소할 수 있습니까?", a: "예, 취소 수수료 없음." },
            { q: "가격은 국가에 따라 다릅니까?", a: "예, BMD는 지역별 가격 조정." },
            { q: "추천 프로그램은 어떻게 작동합니까?", a: "영업 영역 활성화 → 개인 코드 받기 → 공유 → 평생 20% 획득." },
          ],
        },
      ],
      contactNudge:
        "더 구체적인 답변을 찾고 있거나 특정 사례에 대해 이야기하고 싶다면 hello@backmesdo.com 으로 — 사람이 24시간 이내에 답변합니다.",
    },
    cta: {
      headline: "지금 시작하세요",
      body: "무료. 신용카드 불필요. 1분 이내에 등록.",
      button: "내 계정 만들기",
    },
    footer: {
      tagline: "공유 자금. 보호되는 우정.",
      rights: "모든 권리 보유.",
      privacy: "프라이버시",
      terms: "약관",
      contact: "연락처",
    },
  },
  ar: {
    meta: {
      title: "BMD · أموال مشتركة بدون دراما",
      description:
        "تساعد BMD الجالية الأفريقية في إدارة التُّونتين والسكن المشترك والرحلات والفعاليات الجماعية بشفافية وإنصاف.",
    },
    nav: {
      story: "قصتنا",
      features: "الميزات",
      howItWorks: "كيف يعمل",
      pricing: "الأسعار",
      login: "تسجيل الدخول",
      signUp: "إنشاء حساب",
    },
    langPicker: { main: "اللغات الرئيسية", europeanGroup: "اللغات الأوروبية", asianGroup: "اللغات الآسيوية", arabicGroup: "اللغات العربية", africanGroup: "اللغات الأفريقية" },
    story: {
      kicker: "قصتنا",
      title: "يجب ألا يكلف المال الصداقة أبدًا",
      punchline: "كلنا عشنا تلك العشاء حيث تحول المطعم إلى محكمة. تلك التُّونتين حيث لم يعد أحد يعرف من دفع. تلك الرحلة بين أبناء العمومة التي انتهت بمجموعة WhatsApp باردة.",
      chapters: [
        { icon: "🌍", title: "المشكلة", body: "التضخم يلتهم كل شيء. تكلفة المعيشة تنفجر في أوروبا، والكاميرون، وداكار، ومومباي. كل يورو مهم — وكل يورو محسوب بشكل سيء يتحول إلى صمت، إلى ضغينة، إلى علاقة مكسورة." },
        { icon: "💔", title: "التوتر", body: "جداول Excel غير قابلة للقراءة. WhatsApp لا يحسب. التطبيقات الغربية لا تفهم التُّونتين، ولا فرنك CFA، ولا واقع سكن مشترك من 6 طلاب في باريس." },
        { icon: "🕊", title: "الحل", body: "BMD. أداة لمن يتشاركون أموالهم حقًا. متعدد العملات (25+)، متعدد اللغات (20+)، تُونتين، تبادل ديون، OCR، بوت WhatsApp. بدون دراما، بدون متعقبات، بدون إعلانات." },
      ],
      manifesto: "«نحسب كل قرش — حتى لا نضطر أبدًا لحساب أصدقائنا.»",
      cta: "ابدأ مجانًا",
    },
    hero: {
      tagline: "Back Mes Do · المهجر",
      headline: "أموال مشتركة. صداقات محفوظة.",
      subhead:
        "التُّونتين، السكن المشترك، الرحلات، الأعراس، الكنائس، النوادي: تحسب BMD وتُبسّط وتُتابع كل مصروف لتطمئن جميع الأطراف.",
      ctaPrimary: "ابدأ مجانًا",
      ctaSecondary: "شاهد العرض",
    },
    features: {
      title: "كل ما تحتاجه، لا أكثر",
      items: [
        {
          icon: "🪙",
          title: "تُونتين كاملة",
          body: "دورة، ترتيب المستفيدين، تواريخ قابلة للتعديل، إيصالات استلام، سجل لسنوات.",
        },
        {
          icon: "💸",
          title: "نفقات مشتركة",
          body: "بالتساوي أو بحصص أو بالنسب. إيصالات صور/PDF يراها الجميع، يعدّلها المنشئ فقط.",
        },
        {
          icon: "↔",
          title: "تبادل الديون",
          body: "تعويض أو نقل دين لعضو آخر، بمصادقة الأطراف الثلاثة.",
        },
        {
          icon: "🔔",
          title: "إشعارات شاملة",
          body: "كل حدث يهمّك يولّد إشعارًا. مكافحة الإغراق: بلا إشعارات ذاتية.",
        },
        {
          icon: "📷",
          title: "OCR للفواتير",
          body: "صوّر إيصالك: المبلغ والتاجر والتاريخ يُكتشفون تلقائيًا.",
        },
        {
          icon: "🛡",
          title: "RGPD والخصوصية",
          body: "بلا قراءة جماعية لدفتر العناوين. موافقة صريحة، حق النسيان مكفول.",
        },
      ],
    },
    howItWorks: {
      title: "في ثلاث خطوات",
      steps: [
        {
          num: "١",
          title: "أنشئ مجموعتك",
          body: "تُونتين، سكن، سفر، عرس… اختر النوع والعملة الافتراضية.",
        },
        {
          num: "٢",
          title: "ادعُ من حولك",
          body: "رابط قابل للمشاركة أو رمز QR أو جهات اتصال الهاتف (بموافقتك).",
        },
        {
          num: "٣",
          title: "عش بطمأنينة",
          body: "أدخل المصاريف والاشتراكات والمبادلات. BMD يحسب الأرصدة ويقترح أفضل التسويات.",
        },
      ],
    },
    pricing: {
      title: "مجاني للأغلب",
      free: {
        name: "مجاني",
        price: "٠ €",
        features: [
          "حتى ٣ مجموعات نشطة",
          "تُونتين ونفقات ومبادلات بلا حدود",
          "إيصالات PDF/صور",
          "إشعارات كاملة",
        ],
      },
      pro: {
        name: "Pro",
        price: "٤٫٩٩ € / شهر",
        features: [
          "مجموعات بلا حدود",
          "تصدير محاسبي مفصل",
          "سجل ١٠ سنوات",
          "دعم ذو أولوية",
        ],
        cta: "قريبًا",
      },
    },
    faq: {
      title: "أسئلة متكررة",
      items: [
        {
          q: "هل BMD يحلّ محل البنك؟",
          a: "لا. BMD أداة إدارة مشتركة. الدفعات تتم عبر قنواتك المعتادة (Lydia, Wave, الموبايل موني، التحويل البنكي). يسجّل ويحسب ويبسّط.",
        },
        {
          q: "هل بياناتي آمنة؟",
          a: "نعم. نشفّر الاتصالات، لا نقرأ دفتر العناوين دون موافقة، ويمكنك تصدير بياناتك أو حذفها متى شئت (RGPD).",
        },
        {
          q: "كيف تعمل التُّونتين في BMD؟",
          a: "أنشئ المجموعة وحدد المبلغ والوتيرة. في كل دورة، يختار المستفيد تاريخه الفعلي ضمن شهره ويصادق الجميع. سجل لسنوات.",
        },
      ],
    },
    featuresLong: {
      intro:
        "يغطي BMD كل المواقف التي يدور فيها المال بين المقربين: التُّونتين، السكن المشترك، الرحلات، الأعراس، الكنائس، الأندية، الفِرق. إليك ما يمكنك فعله، مرتّبًا حسب الموضوع.",
      categories: [
        {
          key: "groups",
          icon: "👥",
          label: "المجموعات والأدوار",
          pitch: "أنشئ النوع المناسب من المجموعة في 30 ثانية. لكل نوع منطقه الخاص ويعرف الجميع مَن يفعل ماذا.",
          items: [
            { icon: "🎭", title: "6 أنواع جاهزة", body: "تُونتين · سكن مشترك · رحلة · حدث (عرس، حفلة) · نادٍ · كنيسة / جمعية. لكل نوع اختصاراته الخاصة." },
            { icon: "🛡", title: "أدوار واضحة", body: "المسؤول (يحرّر القواعد)، أمين الصندوق (يتابع الدفعات)، العضو (يسجّل المصاريف). كل شيء قابل للتتبع." },
            { icon: "✉️", title: "دعوات متعددة القنوات", body: "رابط قابل للمشاركة، رمز QR، جهات اتصال الهاتف (بموافقة صريحة فقط). تذكير تلقائي في اليوم 2 و 5." },
            { icon: "🎨", title: "هوية بصرية لكل مجتمع", body: "اختر هوية مجموعتك (نقوش بوغولان، واكس، كنتي…). مجموعتك لها شخصيتها الخاصة." },
          ],
        },
        {
          key: "expenses",
          icon: "💸",
          label: "المصاريف المشتركة",
          pitch: "تسجيل مصروف يجب ألا يأخذ أكثر من 5 ثوانٍ. BMD يقدّم لك صورة الإيصال، اقتراح التقسيم، كشف المخالفات والتحويل التلقائي للعملات.",
          items: [
            { icon: "📷", title: "OCR للإيصالات", body: "صوّر إيصالك: المبلغ والتاجر والتاريخ تُكتشف تلقائيًا. ثلاثة محرّكات (Mindee, GPT-4o Vision, Tesseract) مع تبديل شفّاف." },
            { icon: "⚖️", title: "تقسيم: متساوٍ · حصص · نسب", body: "وضع متساوٍ بنقرة واحدة، أو حصص مخصّصة، أو نسب مئوية دقيقة. مثالي للسكن المشترك." },
            { icon: "🤖", title: "اقتراح ذكي للتقسيم", body: "كلما سجّلت، يتعلم BMD عاداتك ويقترح الوضع الصحيح تلقائيًا." },
            { icon: "📜", title: "قواعد حسب الفئة", body: "\"كل مشتريات السوق تذهب إلى مجموعة السكن\": تُنشئ القاعدة مرة، يطبّقها BMD في كل مرة." },
            { icon: "🚨", title: "كشف المخالفات", body: "التكرار، المبالغ غير المعتادة، المصاريف خارج النطاق المعهود: تنبيه قبل أن يصادق الجميع." },
            { icon: "🏦", title: "استيراد بنكي CSV", body: "استورد كشف حسابك. BMD يقترح التصنيف والتقسيم تلقائيًا." },
          ],
        },
        {
          key: "tontines",
          icon: "🪙",
          label: "التُّونتين والدورات",
          pitch: "تُونتين الباميليكي، الـhui الصيني، الـsusu الكاريبي — كل نماذج التوفير الدوّار مدعومة، مع تحقّق رباعي وسجل غير قابل للتلاعب.",
          items: [
            { icon: "🔄", title: "دورة آلية كاملة", body: "حدّد المبلغ والوتيرة وترتيب المستفيدين. في كل دورة يختار المستفيد التاريخ الدقيق." },
            { icon: "🤝", title: "تحقّق مزدوج", body: "الدافع يُعلن، أمين الصندوق يؤكّد. لا أحد يقول \"دفعتُ\" بدون أثر من الجهتين." },
            { icon: "📅", title: "عرض تقويم", body: "كل الدورات القادمة معروضة بصريًا. ترى من يحصل على ماذا ومتى خلال الـ 12 شهرًا القادمة." },
            { icon: "🎯", title: "مزادات (Hui)", body: "للمجتمعات الصينية: في كل دورة تزايد لتقديم استلامك. BMD يحسب الفائدة الفعلية." },
            { icon: "📚", title: "سجل متعدد السنوات", body: "سجل غير قابل للتلاعب: 5 سنوات على الأقل. تصدير كامل في أي وقت." },
          ],
        },
        {
          key: "settle",
          icon: "↔",
          label: "الأرصدة والتسويات",
          pitch: "BMD يحسب الحدّ الأدنى من المعاملات لتسوية المجموعة. لا مزيد من الجداول.",
          items: [
            { icon: "🧮", title: "أرصدة فورية", body: "رصيد عام متعدد العملات، ورصيد لكل مجموعة بالعملة المحلية. يُعاد حسابه فوريًا." },
            { icon: "🎯", title: "تسوية مثلى", body: "خوارزمية \"التدفق الأدنى\": عملية واحدة بدل اثنتين أو ثلاث." },
            { icon: "🔁", title: "تبادل ونقل الديون", body: "عوّض أو انقل دينًا إلى عضو آخر. تحقّق ثلاثي مضادّ للاحتيال." },
            { icon: "🔗", title: "روابط دفع لاستخدام واحد", body: "أنشئ رابطًا آمنًا ليدفع لك عضو. ينتهي بعد الاستخدام ويُسجَّل في سجل التدقيق." },
          ],
        },
        {
          key: "money",
          icon: "💱",
          label: "متعدد العملات والدفع",
          pitch: "BMD مصمّم للشتات. أكثر من 25 عملة مدعومة، أسعار صرف محدّثة كل ساعة، تحويلات شفافة.",
          items: [
            { icon: "🌍", title: "+25 عملة بأسعار حية", body: "اليورو، الدولار، الجنيه، فرنك CFA (XAF/XOF)، النيرة، الدرهم، الراند، الريال، الشلن، البيزو…" },
            { icon: "💳", title: "متوافق مع أدواتك المعتادة", body: "Lydia, Wave, Orange Money, MTN MoMo, Wise, تحويل SEPA, PayPal. BMD لا يستبدل، بل يسجّل." },
            { icon: "📈", title: "تحويل في الوقت الحقيقي", body: "مصروف بالـ XAF يظهر لكل عضو بعملته الافتراضية، بسعر اليوم." },
            { icon: "🧾", title: "إيصالات ضريبية للتحميل", body: "للكنائس والجمعيات والأندية الرياضية: ولّد إيصالات PDF رسمية." },
          ],
        },
        {
          key: "comms",
          icon: "🔔",
          label: "التواصل والتذكير",
          pitch: "كل شيء يُدار بالإشعارات — مضادّ للسبام بحكم التصميم، وأنت تختار النبرة.",
          items: [
            { icon: "🛎", title: "إشعارات دقيقة", body: "تستلم فقط ما يخصّك. لا \"X فعل شيئًا في مجموعتك\" أبدًا." },
            { icon: "📅", title: "ملخص أسبوعي", body: "كل أحد مساء، ملخص واضح: ما حدث، رصيدك، ديونك المعلّقة. 30 ثانية لتعرف أين أنت." },
            { icon: "💬", title: "بوت WhatsApp أصلي", body: "أضف المصاريف برسالة صوتية أو نصية. BMD يتعرّف، يرتّب، يطلب التأكيد." },
            { icon: "😊", title: "نبرة على اختيارك", body: "ودودة، حازمة، مرحة، احترافية: اختر نبرة التذكيرات التي يرسلها BMD نيابة عنك." },
            { icon: "🌙", title: "وضع \"عدم الإزعاج\" لكل مجموعة", body: "اكتم مجموعة لساعة، 24 ساعة أو حتى الصباح بدون مغادرة المحادثة." },
          ],
        },
        {
          key: "intelligence",
          icon: "🧠",
          label: "الذكاء والأتمتة",
          pitch: "BMD يستخدم الذكاء الاصطناعي للتخلص من الأوراق، ليس للسبام. سرّي، محلي أو عبر مزوّدين متوافقين مع RGPD.",
          items: [
            { icon: "🎙", title: "الإدخال الصوتي Whisper", body: "صوت WhatsApp أو في التطبيق مباشرة: BMD يفرّغ النص، يفهم، ويرتّب." },
            { icon: "📊", title: "إحصائيات وتحليلات", body: "تطوّر شهري، توزيع حسب الفئة، متوسط الإنفاق لكل مجموعة. بدون متعقّبات أو إعلانات." },
            { icon: "🌐", title: "ترجمة تلقائية للمحتوى الإداري", body: "الكنائس والجمعيات لها رسائل متعددة اللغات. BMD يترجم تلقائيًا مع مراجعة اختيارية." },
            { icon: "🔮", title: "مخالفات وتكرارات", body: "مصروف 1200€ في حين تعتاد 50€؟ نفس المطعم محسوب مرتين في دقيقة؟ BMD يحذّر قبل الدراما." },
          ],
        },
        {
          key: "trust",
          icon: "🛡",
          label: "الأمن والخصوصية",
          pitch: "RGPD by design. لا تُقرأ جهات اتصالك بشكل جماعي. لا كلمات مرور، لا كوكيز تتبّع.",
          items: [
            { icon: "🔑", title: "اتصال بدون كلمة مرور", body: "OTP عبر SMS أو البريد أو WhatsApp. Passkeys (Face ID / Touch ID / Windows Hello). SSO Google وApple اختيارية." },
            { icon: "🚫", title: "صفر قراءة لدفتر العناوين", body: "BMD لا يقرأ قائمة جهات اتصالك أبدًا بشكل جماعي. فقط ما تختار صراحة يُرسل." },
            { icon: "📜", title: "سجل تدقيق غير قابل للتعديل", body: "العمليات الحسّاسة تُحفظ بالإضافة فقط، موقّعة، لمدة 5 سنوات. مضادّ للتزوير." },
            { icon: "🇪🇺", title: "RGPD كامل", body: "تصدير JSON/CSV لكل بياناتك، حذف عند الطلب خلال 30 يومًا، سجل المتعاقدين الفرعيين عمومي." },
            { icon: "🌐", title: "استضافة في الاتحاد الأوروبي", body: "قواعد البيانات والخوادم في منطقة الاتحاد الأوروبي." },
          ],
        },
        {
          key: "platform",
          icon: "📱",
          label: "المنصات وإمكانية الوصول",
          pitch: "تطبيق أصلي حقيقي على الهاتف، بوابة ويب حقيقية على الحاسوب. وبوت WhatsApp لمن يفضّل البقاء في المحادثة.",
          items: [
            { icon: "📲", title: "PWA قابل للتثبيت", body: "على iPhone أو Android أو سطح المكتب: ثبّت BMD كتطبيق حقيقي، يعمل أوفلاين للاستعراض." },
            { icon: "💬", title: "بوت WhatsApp", body: "اربط رقم WhatsApp الخاص بك في 30 ثانية. أضف المصاريف صوتيًا/نصيًا، استشر الرصيد، صادق على المساهمات." },
            { icon: "🌍", title: "متعدد اللغات", body: "الواجهة تتكيف مع لغتك المفضلة. اللغة العربية وRTL مدعومة بشكل أصلي." },
            { icon: "♿", title: "إمكانية الوصول WCAG 2.1 AA", body: "تباين موثّق، تنقّل بلوحة المفاتيح، دعم قارئات الشاشة، وضع داكن/فاتح." },
            { icon: "🌗", title: "وضع فاتح / داكن", body: "تبديل بنقرة واحدة من الأيقونة ☀️/🌙. التطبيق والموقع يتغيّران معًا. يُحفظ بين الجلسات." },
          ],
        },
      ],
    },
    referral: {
      kicker: "البرنامج التجاري",
      title: "أوصِ بـ BMD، اربح من كل اشتراك",
      intro:
        "لـ BMD برنامج إحالة بسيط — بدون مستويات، بدون هرم. أوصِ بـ BMD لمحيطك أو لمنظمات (كنائس، أندية، جمعيات) — كل تسجيل يصبح مدفوعًا يدرّ لك عمولة، مدى الحياة ما دام الشخص عميلًا.",
      benefits: [
        { icon: "💰", title: "عمولة مباشرة", body: "20% من المبلغ الشهري المدفوع (أو دفعة واحدة لباقة الحدث) من المستخدمين الذين أوصيتَ بهم. يُدفع في 1 من كل شهر بطريقتك المفضلة." },
        { icon: "♾️", title: "متكرر مدى الحياة", body: "ما دام مُحالك مشتركًا، تستلم عمولتك — بلا سقف، بلا انتهاء. كنيسة من 200 شخص يمكن أن تدرّ آلاف اليوروهات سنويًا." },
        { icon: "📊", title: "فضاء تجاري مخصّص", body: "لوحة واضحة: من سجّل عبرك، من انتقل إلى مدفوع، MRR الخاص بك، الإيرادات المتوقعة، تاريخ المدفوعات." },
        { icon: "🎁", title: "مكافأة للمُحال", body: "مُحالك يستلم أيضًا تخفيضًا (شهر مجاني على الباقة السنوية، أو 10% مدى الحياة). تقدّم هدية، لا إزعاجًا." },
      ],
      howItWorks: [
        { num: "1", title: "فعّل الفضاء التجاري", body: "من ملفّك الشخصي → الفضاء التجاري → \"تفعيل\". تستلم رمز إحالة شخصيًا (مثلًا BMD-AICHA-23) ورابطًا." },
        { num: "2", title: "شارك مع محيطك", body: "إلى كنيستك، نادي كرة القدم، أصدقاء الشتات. الرابط يملأ الرمز تلقائيًا." },
        { num: "3", title: "تابع التسجيلات", body: "كل نقرة وتسجيل وتحويل إلى باقة مدفوعة يظهر في الوقت الحقيقي في فضائك." },
        { num: "4", title: "استلم عمولتك", body: "دفع تلقائي في 1 من كل شهر (ابتداءً من 25 يورو). Lydia, Wave, تحويل SEPA أو Mobile Money — على اختيارك." },
      ],
      cta: { label: "اكتشف البرنامج", href: "/dashboard/affiliate" },
      smallPrint:
        "بدون مستويات، بدون تسويق هرمي، بدون \"مصفوفات\". مستوى واحد فقط (أنت ← مُحالك)، عمولة ثابتة وشفافة. الشروط الكاملة في الفضاء التجاري بعد التفعيل.",
    },
    faqLong: {
      intro:
        "الأسئلة الأكثر تكرارًا، مجمّعة حسب الموضوع. إذا لم تجد إجابتك، اكتب لنا على hello@backmesdo.com — نردّ خلال 24 ساعة.",
      categories: [
        {
          key: "basics",
          icon: "👋",
          label: "الأساسيات",
          items: [
            { q: "ما هو BMD في جملة؟", a: "تطبيق يساعد المجموعات على إدارة المال المشترك بدون دراما: تُونتين، سكن مشترك، رحلات، أعراس، كنائس، أندية." },
            { q: "هل يحلّ BMD محل البنك أو Lydia؟", a: "لا. BMD لا ينقل المال بنفسه. تواصل الدفع بقنواتك المعتادة. BMD يسجّل ويحسب ويقترح التسوية الدنيا." },
            { q: "كم يكلّف؟", a: "الباقة المجانية تغطي الأغلبية: 3 مجموعات نشطة. باقة Pro بـ 4.99 يورو/شهر. باقة الحدث بـ 29 يورو دفعة واحدة." },
            { q: "على أي أجهزة يعمل؟", a: "iPhone (iOS 15+)، Android (9+)، وأي حاسوب حديث. يمكنك أيضًا إضافة المصاريف من WhatsApp." },
            { q: "هل يجب أن يسجّل كل أقاربي؟", a: "ليس فورًا. يمكنك إنشاء مجموعة بـ \"ملفّات الظلّ\" (اسم + هاتف فقط)." },
          ],
        },
        {
          key: "groups",
          icon: "👥",
          label: "المجموعات والدعوات",
          items: [
            { q: "ما أنواع المجموعات التي يمكنني إنشاؤها؟", a: "6 أنواع جاهزة: تُونتين، سكن مشترك، رحلة، حدث، نادٍ، كنيسة/جمعية." },
            { q: "ما الحد الأقصى لعدد الأعضاء؟", a: "بدون حدّ صارم. لدينا كنائس بأكثر من 300 عضو وكل شيء يعمل بسلاسة." },
            { q: "كيف أدعو شخصًا؟", a: "ثلاث خيارات: رابط قابل للمشاركة، QR، أو من جهات اتصالك بموافقة صريحة. تذكير تلقائي في اليوم 2 و 5." },
            { q: "هل يمكنني حذف عضو؟", a: "نعم، يمكن للمسؤول إزالة عضو في أي وقت. مصاريفه السابقة تبقى في السجل (ضدّ الاحتيال)." },
            { q: "هل يرى المدعوون مجموعاتي الأخرى؟", a: "أبدًا. كل مجموعة معزولة." },
          ],
        },
        {
          key: "tontines",
          icon: "🪙",
          label: "التُّونتين",
          items: [
            { q: "كيف تعمل التُّونتين في BMD؟", a: "أنشئ المجموعة، حدد المبلغ والوتيرة. في كل دورة، يختار المستفيد التاريخ الدقيق. الأعضاء يؤكّدون مساهمتهم." },
            { q: "ما الفرق بين الباميليكي والـ hui الصيني والـ susu؟", a: "نفس المبدأ (توفير دوّار)، يختلفون في الترتيب والآلية. BMD يدعم الثلاثة." },
            { q: "ماذا لو لم يدفع أحد؟", a: "أمين الصندوق يرى من لم يؤكّد. BMD يرسل تذكيرًا تلقائيًا بالنبرة المختارة." },
            { q: "هل يمكنني متابعة تُونتين على عدة سنوات؟", a: "نعم، السجل يُحفظ 5 سنوات على الأقل، ويمكن التصدير إلى Excel في أي وقت." },
          ],
        },
        {
          key: "money",
          icon: "💱",
          label: "العملات والدفع",
          items: [
            { q: "ما العملات التي يدعمها BMD؟", a: "أكثر من 25 عملة نشطة. الأسعار محدّثة كل ساعة." },
            { q: "كيف يتم التحويل بين العملات؟", a: "كل عضو يرى المبلغ بعملته الافتراضية بسعر اليوم." },
            { q: "هل يأخذ BMD عمولة على الدفعات؟", a: "أبدًا. BMD لا ينقل المال. قناتك المعتادة تطبّق رسومها الخاصة." },
            { q: "ما طرق الدفع المتوافقة؟", a: "كلها. Lydia, Wave, MoMo, Wise, تحويل SEPA, PayPal, نقدًا." },
            { q: "كيف أدفع باقة BMD نفسها؟", a: "Stripe Checkout الآمن: بطاقة، Apple Pay, Google Pay, خصم مباشر SEPA." },
          ],
        },
        {
          key: "expenses",
          icon: "💸",
          label: "المصاريف والإيصالات",
          items: [
            { q: "كيف أمسح إيصالًا؟", a: "صورة أو PDF. BMD يكتشف المبلغ والتاجر والتاريخ تلقائيًا." },
            { q: "من يمكنه تعديل مصروف؟", a: "فقط المنشئ ومسؤول المجموعة. كل تعديل مسجّل في سجل التدقيق." },
            { q: "كيف أقسّم بشكل غير متساوٍ؟", a: "ثلاثة أوضاع: متساوٍ، حصص مخصّصة، نسب مئوية دقيقة." },
            { q: "هل يكشف BMD التكرارات؟", a: "نعم تلقائيًا. شارة ⚠️ تظهر مع اقتراح للدمج." },
            { q: "هل يمكنني استيراد كشف حسابي البنكي؟", a: "نعم، بـ CSV. BMD يتعرف على صيغ معظم البنوك الكبرى." },
          ],
        },
        {
          key: "settle",
          icon: "↔",
          label: "الأرصدة والتسويات",
          items: [
            { q: "كيف يحسب BMD مَن يدين لمَن؟", a: "خوارزمية \"التدفق الأدنى\": يجد العدد الأدنى من المعاملات." },
            { q: "ما هو تبادل الديون؟", a: "عندما يأخذ عضو دين عضو آخر. تحقّق ثلاثي مضادّ للاحتيال." },
            { q: "كيف أضع علامة على دين كمدفوع؟", a: "في المجموعة → الأرصدة → \"تسوية\". الدائن يستلم إشعارًا ويؤكّد." },
            { q: "ماذا لو قال أحدهم إنه دفع ولم أستلم؟", a: "لذلك يطلب BMD تأكيدًا من الجهتين. تذكير تلقائي بعد 7 أيام." },
          ],
        },
        {
          key: "privacy",
          icon: "🛡",
          label: "الخصوصية والأمن",
          items: [
            { q: "هل بياناتي آمنة؟", a: "نعم. اتصالات مشفّرة TLS 1.3، بدون كلمات مرور، بدون قراءة جماعية، بدون كوكيز تتبع. استضافة في الاتحاد الأوروبي." },
            { q: "كيف يعمل تسجيل الدخول بدون كلمة مرور؟", a: "تُدخل هاتفك أو بريدك، تستلم رمزًا من 6 أرقام، تُدخله. ينتهي بعد 5 دقائق." },
            { q: "ما هي passkey؟", a: "مفتاح وصول بيومتري (Face ID, Touch ID, Windows Hello). أسرع وأكثر حماية من التصيّد." },
            { q: "هل يقرأ BMD جهات اتصالي؟", a: "أبدًا بشكل جماعي. فقط من تختاره صراحة يُرسل." },
            { q: "هل يمكنني حذف حسابي؟", a: "نعم، من ملفّك → الخصوصية. يُنفذ خلال 30 يومًا (RGPD)." },
            { q: "هل يمكنني تصدير كل بياناتي؟", a: "نعم، بـ JSON أو CSV. تستلم بريدًا بالملف خلال 24 ساعة." },
          ],
        },
        {
          key: "billing",
          icon: "💳",
          label: "الفوترة والباقات",
          items: [
            { q: "ما الذي تشمله الباقة المجانية؟", a: "حتى 3 مجموعات نشطة، تُونتين/مصاريف/تبادلات بلا حدود، إيصالات صور وPDF، OCR (3/شهر)." },
            { q: "وباقة Pro بـ 4.99 يورو/شهر؟", a: "مجموعات بلا حدود، OCR بلا حدود، تصدير محاسبي مفصّل، سجل 10 سنوات، دعم ذو أولوية." },
            { q: "ما هي باقة الحدث بـ 29 يورو؟", a: "دفعة واحدة لأحداث كبيرة عابرة: عرس، حفلة. تتيح ميزات Pro لمدة 6 أشهر على المجموعة." },
            { q: "هل يمكنني الإلغاء في أي وقت؟", a: "نعم، من ملفّك. بدون رسوم. تحتفظ بالوصول حتى نهاية الفترة المدفوعة." },
            { q: "هل يتغير السعر حسب البلد؟", a: "نعم، BMD يتكيّف مع المناطق (تعادل القوة الشرائية)." },
            { q: "كيف يعمل برنامج الإحالة؟", a: "فعّل الفضاء التجاري → استلم رمزًا شخصيًا → شارك → اربح 20% مدى الحياة." },
          ],
        },
      ],
      contactNudge:
        "تبحث عن إجابة أكثر تحديدًا أو تريد التحدث عن حالة خاصة؟ اكتب لنا على hello@backmesdo.com — إنسان يردّ خلال 24 ساعة.",
    },
    cta: {
      headline: "ابدأ الآن",
      body: "مجاني. بدون بطاقة. التسجيل في أقل من دقيقة.",
      button: "أنشئ حسابي",
    },
    footer: {
      tagline: "أموال مشتركة. صداقات محفوظة.",
      rights: "جميع الحقوق محفوظة.",
      privacy: "الخصوصية",
      terms: "الشروط",
      contact: "اتصل بنا",
    },
  },
  sw: {
    meta: {
      title: "BMD · Fedha za pamoja, bila migogoro",
      description:
        "BMD inasaidia diaspora ya Kiafrika kusimamia tontine, makazi ya pamoja, safari na matukio ya kikundi kwa uwazi na haki.",
    },
    nav: {
      story: "Hadithi yetu",
      features: "Vipengele",
      howItWorks: "Jinsi inavyofanya kazi",
      pricing: "Bei",
      login: "Ingia",
      signUp: "Jisajili",
    },
    langPicker: { main: "Lugha kuu", europeanGroup: "Lugha za Ulaya", asianGroup: "Lugha za Asia", arabicGroup: "Lugha za Kiarabu", africanGroup: "Lugha za Kiafrika" },
    story: {
      kicker: "Hadithi yetu",
      title: "Pesa haipaswi kamwe kugharimu urafiki",
      punchline: "Sote tumekuwa kwenye chakula cha jioni ambapo mgahawa ulibadilika kuwa mahakama. Tontine ambapo hakuna aliyejua nani alilipa. Safari ya binamu iliyoishia kwenye kikundi cha WhatsApp baridi.",
      chapters: [
        { icon: "🌍", title: "Tatizo", body: "Mfumuko wa bei unameza kila kitu. Gharama za maisha zinalipuka Ulaya, Kamerun, Dakar, Mumbai. Kila yuro ni muhimu, na kila yuro iliyohesabiwa vibaya inakuwa kimya, chuki, uhusiano uliovunjika." },
        { icon: "💔", title: "Mvutano", body: "Excel hazisomeki. WhatsApp haihesabu. Programu za Magharibi haziwezi kuelewa tontines, faranga ya CFA, au ukweli wa nyumba ya wanafunzi 6 huko Paris." },
        { icon: "🕊", title: "Suluhisho", body: "BMD. Zana kwa wale wanaoshiriki pesa zao kweli. Sarafu nyingi (25+), lugha nyingi (20+), tontines, swap ya madeni, OCR, bot ya WhatsApp. Bila drama, bila vifuatiliaji, bila matangazo." },
      ],
      manifesto: "«Tunahesabu kila senti — ili tusilazimike kuwahesabu marafiki zetu.»",
      cta: "Anza bure",
    },
    hero: {
      tagline: "Back Mes Do · Diaspora",
      headline: "Fedha za pamoja. Urafiki uliolindwa.",
      subhead:
        "Tontine, wenzio wa nyumba, safari, harusi, parokia, vilabu: BMD inahesabu, inarahisisha na kufuatilia kila gharama ili hakuna anayejisikia kudhulumiwa.",
      ctaPrimary: "Anza bure",
      ctaSecondary: "Tazama demo",
    },
    features: {
      title: "Kila kitu unachohitaji, hakuna ziada",
      items: [
        {
          icon: "🪙",
          title: "Tontine kamili",
          body: "Mzunguko, mpangilio wa wanufaika, tarehe za kurekebisha, uthibitisho, historia kwa miaka.",
        },
        {
          icon: "💸",
          title: "Gharama za pamoja",
          body: "Sawa, sehemu au asilimia. Stakabadhi za picha/PDF zinaonekana kwa wote, zinabadilishwa na muundaji tu.",
        },
        {
          icon: "↔",
          title: "Ubadilishaji wa deni",
          body: "Lipia au hamisha deni kwa mwanachama mwingine, kwa idhini ya pande tatu zinazohusika.",
        },
        {
          icon: "🔔",
          title: "Arifa kamili",
          body: "Kila tukio linalokuhusu hutuma arifa. Hakuna spam: hakuna kujitumia arifa.",
        },
        {
          icon: "📷",
          title: "OCR ya stakabadhi",
          body: "Skani picha ya stakabadhi: kiasi, muuzaji, tarehe hugunduliwa kiotomatiki.",
        },
        {
          icon: "🛡",
          title: "GDPR na faragha",
          body: "Hakuna kusoma anwani kwa wingi. Idhini wazi, haki ya kusahaulika inaheshimiwa.",
        },
      ],
    },
    howItWorks: {
      title: "Katika hatua tatu",
      steps: [
        {
          num: "1",
          title: "Unda kikundi chako",
          body: "Tontine, makazi, safari, harusi… chagua aina na sarafu chaguo-msingi.",
        },
        {
          num: "2",
          title: "Alika wenzako",
          body: "Kiungo kinachoshirikiwa, msimbo wa QR, au anwani za simu (kwa idhini yako).",
        },
        {
          num: "3",
          title: "Ishi kwa amani",
          body: "Andika gharama, michango, ubadilishaji. BMD inahesabu salio na kupendekeza malipo bora.",
        },
      ],
    },
    pricing: {
      title: "Bure kwa wengi",
      free: {
        name: "Bure",
        price: "$0",
        features: [
          "Hadi vikundi 3 vinavyofanya kazi",
          "Tontine, gharama, swap zisizo na kikomo",
          "Stakabadhi za PDF/picha",
          "Arifa kamili",
        ],
      },
      pro: {
        name: "Pro",
        price: "$4.99 / mwezi",
        features: [
          "Vikundi visivyo na kikomo",
          "Hamisha hesabu kwa undani",
          "Historia ya miaka 10",
          "Msaada wa haraka",
        ],
        cta: "Hivi karibuni",
      },
    },
    faq: {
      title: "Maswali yanayoulizwa mara kwa mara",
      items: [
        {
          q: "BMD inachukua nafasi ya benki?",
          a: "La. BMD ni zana ya usimamizi wa pamoja. Malipo hufanywa kupitia njia zako za kawaida (Lydia, Wave, Mobile Money, kuhamisha). BMD inarekodi, inahesabu, inarahisisha.",
        },
        {
          q: "Je, data yangu iko salama?",
          a: "Ndiyo. Tunaficha mawasiliano, hatusomi anwani zako bila idhini wazi, na unaweza kuhamisha au kufuta data yako wakati wowote (GDPR).",
        },
        {
          q: "Tontine inafanyaje kazi kwenye BMD?",
          a: "Unaunda kikundi, unaweka kiasi na mzunguko (kila mwezi, kila wiki mbili, kila wiki). Katika kila zamu, mnufaika anachagua tarehe halisi ndani ya mwezi wake na wote wanathibitisha. Historia ya miaka.",
        },
      ],
    },
    featuresLong: {
      intro:
        "BMD inashughulikia hali zote ambapo pesa huzunguka kati ya wapendwa: tontines, makazi ya pamoja, safari, harusi, makanisa, klabu, timu. Hapa ndio unachoweza kufanya, kimewekwa kulingana na mada.",
      categories: [
        {
          key: "groups",
          icon: "👥",
          label: "Vikundi & majukumu",
          pitch: "Unda aina sahihi ya kikundi kwa sekunde 30. Kila aina ina mantiki yake, na kila mtu anajua nani anafanya nini.",
          items: [
            { icon: "🎭", title: "Aina 6 zilizotengenezwa", body: "Tontine · Makazi ya pamoja · Safari · Tukio · Klabu · Kanisa/Chama. Kila aina ina vifupisho vyake." },
            { icon: "🛡", title: "Majukumu wazi", body: "Msimamizi (anabadilisha sheria), mtunzi wa hazina (anafuatilia malipo), mwanachama (anaandikisha matumizi)." },
            { icon: "✉️", title: "Mialiko ya njia nyingi", body: "Kiungo cha kushirikishwa, msimbo QR, anwani za simu (kwa idhini wazi). Vikumbusho moja kwa moja siku ya 2 na 5." },
            { icon: "🎨", title: "Mada kwa kila jamii", body: "Chagua utambulisho wa kikundi chako (Bogolan, Wax, Kente). Kikundi kina utu wake." },
          ],
        },
        {
          key: "expenses",
          icon: "💸",
          label: "Matumizi ya pamoja",
          pitch: "Kuandikisha matumizi inapaswa kuchukua sekunde 5. BMD inakupa picha ya stakabadhi, pendekezo la kugawa, ugunduzi wa hitilafu na ubadilishaji wa fedha kiotomatiki.",
          items: [
            { icon: "📷", title: "OCR ya stakabadhi", body: "Piga picha stakabadhi: kiasi, muuzaji na tarehe vinatambuliwa kiotomatiki. Injini tatu (Mindee, GPT-4o Vision, Tesseract) zikifeli, kuna fallback." },
            { icon: "⚖️", title: "Mgawanyiko: sawasawa · sehemu · asilimia", body: "Hali ya usawa kwa bonyeza moja, sehemu maalum kwa kila mwanachama, au asilimia kamili." },
            { icon: "🤖", title: "Pendekezo la AI la kugawa", body: "Unapoandikisha, BMD inajifunza tabia zako na kupendekeza hali sahihi kiotomatiki." },
            { icon: "📜", title: "Sheria kwa kategoria", body: "\"Manunuzi yote ya soko huingia kwenye kikundi cha makazi\": unda sheria mara moja, BMD inaitumia kila wakati." },
            { icon: "🚨", title: "Ugunduzi wa hitilafu", body: "Mara mbili, kiasi kisicho cha kawaida, matumizi nje ya wastani: arifa kabla wote hawajathibitisha." },
            { icon: "🏦", title: "Uingizaji wa benki CSV", body: "Ingiza taarifa ya benki yako. BMD inapendekeza kuanisha na kugawa kiotomatiki." },
          ],
        },
        {
          key: "tontines",
          icon: "🪙",
          label: "Tontines & mizunguko",
          pitch: "Bamileke, hui ya Wachina, susu — mifumo yote ya akiba zinazozunguka inaungwa mkono, kwa uthibitisho mara mbili na historia isiyobadilika.",
          items: [
            { icon: "🔄", title: "Mzunguko otomatiki", body: "Weka kiasi, mzunguko (kila wiki, kila wiki mbili, kila mwezi) na utaratibu wa wanufaika. Kila zamu, mpokeaji anachagua tarehe halisi." },
            { icon: "🤝", title: "Uthibitisho mara mbili", body: "Mlipaji anaandika, mtunzi wa hazina anathibitisha. Hakuna anayeweza kusema \"nililipa\" bila ushahidi wa pande mbili." },
            { icon: "📅", title: "Mtazamo wa kalenda", body: "Zamu zote zijazo zinaonyeshwa. Unaona mara moja nani atapokea nini na lini katika miezi 12 ijayo." },
            { icon: "🎯", title: "Minada (Hui)", body: "Kwa jamii za Wachina: katika kila zamu, unatoa zabuni kuendeleza malipo yako. BMD inakokotoa riba." },
            { icon: "📚", title: "Historia ya miaka mingi", body: "Logi isiyobadilika: angalau miaka 5. Hamisha kabisa wakati wowote." },
          ],
        },
        {
          key: "settle",
          icon: "↔",
          label: "Salio & malipo",
          pitch: "BMD inahesabu chini ya idadi ya muamala kuondoa madeni. Hakuna karatasi za hesabu tena.",
          items: [
            { icon: "🧮", title: "Salio kwa wakati halisi", body: "Salio la jumla la fedha nyingi, salio la kila kikundi katika fedha ya ndani. Inahesabiwa upya papo hapo." },
            { icon: "🎯", title: "Malipo bora zaidi", body: "Algoriti ya \"mtiririko mdogo\": muamala 1 badala ya 2 au 3 inapowezekana." },
            { icon: "🔁", title: "Swap & uhamisho wa deni", body: "Lipia au hamisha deni kwa mwanachama mwingine. Uthibitisho wa pande 3 dhidi ya udanganyifu." },
            { icon: "🔗", title: "Viungo vya malipo vya matumizi moja", body: "Tengeneza kiungo salama kwa mwanachama akulipe. Kinakwisha baada ya matumizi." },
          ],
        },
        {
          key: "money",
          icon: "💱",
          label: "Fedha nyingi & malipo",
          pitch: "BMD imeundwa kwa diaspora. Fedha 25+ zinaungwa mkono, viwango vya kubadilishana fedha vinaboreshwa kila saa.",
          items: [
            { icon: "🌍", title: "Fedha 25+ kwa viwango vya moja kwa moja", body: "Yuro, dola, pauni, faranga ya CFA (XAF/XOF), naira, dirham, rand, real, shilingi…" },
            { icon: "💳", title: "Inafanya kazi na zana zako za kawaida", body: "Lydia, Wave, Orange Money, MTN MoMo, Wise, kuhamisha SEPA, PayPal. BMD haichukulii — inarekodi." },
            { icon: "📈", title: "Ubadilishaji wa wakati halisi", body: "Matumizi ya XAF yataonekana kwa kila mwanachama katika fedha YAKE ya kawaida, kwa kiwango cha leo." },
            { icon: "🧾", title: "Stakabadhi za kodi za kupakua", body: "Kwa makanisa, vyama, klabu za michezo: tengeneza stakabadhi za PDF na kitambulisho chako cha biashara." },
          ],
        },
        {
          key: "comms",
          icon: "🔔",
          label: "Mawasiliano & vikumbusho",
          pitch: "Kila kitu kinaendeshwa na arifa — kupinga spam kwa muundo, na unachagua sauti ya vikumbusho.",
          items: [
            { icon: "🛎", title: "Arifa za usahihi", body: "Unapata TU kile kinachokuhusu. Kamwe \"X amefanya kitu kwenye kikundi chako\"." },
            { icon: "📅", title: "Muhtasari wa kila wiki", body: "Kila Jumapili jioni, muhtasari mkali: kilichotokea, salio lako, madeni yako." },
            { icon: "💬", title: "Bot ya WhatsApp ya asili", body: "Ongeza matumizi kwa sauti au maandishi. BMD inatambua, inapanga, inaomba uthibitisho." },
            { icon: "😊", title: "Sauti ya kuchagua", body: "Ya kirafiki, kali, ya ucheshi, ya kitaalamu: chagua sauti ya vikumbusho ambavyo BMD hutuma kwa niaba yako." },
            { icon: "🌙", title: "Usisumbue kwa kila kikundi", body: "Nyamaza kikundi kwa saa 1, 24, au hadi asubuhi bila kuondoka kwenye mazungumzo." },
          ],
        },
        {
          key: "intelligence",
          icon: "🧠",
          label: "Akili & otomatiki",
          pitch: "BMD inatumia AI kuondoa karatasi, sio kutuma spam. Siri, ya ndani au kupitia watoa huduma wanaolingana na GDPR.",
          items: [
            { icon: "🎙", title: "Kuingiza sauti Whisper", body: "Sauti ya WhatsApp au katika programu moja kwa moja. BMD inanakili, inaelewa, inapanga." },
            { icon: "📊", title: "Takwimu & ufahamu", body: "Mwelekeo wa mwezi, mgawanyiko wa kategoria, wastani wa kila kikundi. Bila vifuatiliaji au matangazo." },
            { icon: "🌐", title: "Tafsiri otomatiki ya maudhui ya msimamizi", body: "Makanisa na vyama vyenye ujumbe wa lugha nyingi. BMD inatafsiri kiotomatiki kwa marekebisho ya hiari." },
            { icon: "🔮", title: "Hitilafu & nakala", body: "Matumizi ya €1,200 wakati kawaida hufanya €50? Mgahawa huo huo umetozwa mara mbili katika dakika? BMD inaonya." },
          ],
        },
        {
          key: "trust",
          icon: "🛡",
          label: "Usalama & faragha",
          pitch: "GDPR by design. Anwani zako hazisomwi kwa wingi. Hakuna nywila, hakuna vidakuzi vya ufuatiliaji.",
          items: [
            { icon: "🔑", title: "Ingia bila nywila", body: "OTP kupitia SMS, barua pepe au WhatsApp. Passkeys (Face ID / Touch ID / Windows Hello)." },
            { icon: "🚫", title: "Sifuri kusoma anwani", body: "BMD HAITOMI orodha yako ya anwani kabisa. Tu wale unaowachagua waziwazi hutumwa." },
            { icon: "📜", title: "Logi isiyobadilika", body: "Operesheni nyeti ni za kuongeza-tu, zilizosainiwa, zilizohifadhiwa miaka 5. Dhidi ya udanganyifu." },
            { icon: "🇪🇺", title: "GDPR kamili", body: "Hamisha JSON/CSV ya data zako zote, futa kwa ombi ndani ya siku 30, sajili ya wakandarasi wadogo wa umma." },
            { icon: "🌐", title: "Mwenyeji wa EU", body: "Hifadhidata na seva katika eneo la EU. Hakuna uhamishaji nje ya EU bila vifungu vya mkataba." },
          ],
        },
        {
          key: "platform",
          icon: "📱",
          label: "Mifumo & ufikiaji",
          pitch: "Programu halisi ya asili kwenye simu, lango halisi la wavuti kwenye kompyuta. Na bot ya WhatsApp kwa wale wanaopendelea kubaki kwenye mazungumzo.",
          items: [
            { icon: "📲", title: "PWA inayoweza kusakinishwa", body: "Kwenye iPhone, Android au desktop: sakinisha BMD kama programu halisi, inafanya kazi nje ya mtandao kwa kutazama." },
            { icon: "💬", title: "Bot ya WhatsApp", body: "Unganisha nambari yako ya WhatsApp katika sekunde 30: kuongeza matumizi kwa sauti/maandishi, kuangalia salio, kuthibitisha michango." },
            { icon: "🌍", title: "Lugha nyingi (FR · EN · ES · PT · AR · SW)", body: "Kiolesura kinabadilika kwa lugha unayopendelea. Kiarabu na lugha zingine za RTL zinashughulikiwa kwa asili." },
            { icon: "♿", title: "Ufikiaji wa WCAG 2.1 AA", body: "Tofauti iliyothibitishwa, urambazaji wa kibodi, msaada wa visomaji vya skrini, hali ya giza/mwanga." },
            { icon: "🌗", title: "Hali ya mwanga / giza", body: "Badilisha kwa bonyeza moja kutoka aikoni ☀️/🌙. Programu na tovuti zinabadilika pamoja." },
          ],
        },
      ],
    },
    referral: {
      kicker: "Mpango wa kibiashara",
      title: "Pendekeza BMD, pata pesa kwa kila usajili",
      intro:
        "BMD ina mpango rahisi wa rufaa — hakuna ngazi, hakuna piramidi. Pendekeza BMD kwa watu wako au mashirika (makanisa, klabu, vyama) — kila usajili unaolipwa unakupa kamisheni, maisha yote madamu mtu anabaki mteja.",
      benefits: [
        { icon: "💰", title: "Kamisheni ya moja kwa moja", body: "20% ya kiasi kinacholipwa kila mwezi (au mara moja kwa mpango wa Tukio) na watumiaji uliopendekeza. Inalipwa tarehe 1 ya kila mwezi." },
        { icon: "♾️", title: "Mara kwa mara maisha yote", body: "Madamu mrejewa wako anabaki amejiandikisha, unapata kamisheni — bila kikomo, bila kuisha." },
        { icon: "📊", title: "Nafasi ya biashara iliyojitolea", body: "Dashibodi wazi: nani amejiandikisha kupitia kwako, nani amehama kwenda kulipwa, MRR yako, mapato yanayotarajiwa." },
        { icon: "🎁", title: "Bonasi kwa mrejewa", body: "Mrejewa wako pia anapata punguzo (mwezi 1 bure kwenye mpango wa kila mwaka, au 10% maisha yote)." },
      ],
      howItWorks: [
        { num: "1", title: "Wezesha nafasi ya biashara", body: "Kutoka wasifu wako → Nafasi ya biashara → \"Wezesha\". Unapokea nambari ya rufaa ya kibinafsi na kiungo." },
        { num: "2", title: "Shiriki na watu wako", body: "Kwa kanisa lako, klabu yako ya mpira, marafiki wa diaspora… Kiungo kinajaza nambari kabla." },
        { num: "3", title: "Fuatilia usajili", body: "Kila bonyeza, usajili, kubadilisha kwa mpango wa kulipwa, unaonekana kwa wakati halisi." },
        { num: "4", title: "Pokea kamisheni yako", body: "Malipo otomatiki tarehe 1 ya kila mwezi (kuanzia €25). Lydia, Wave, kuhamisha SEPA au Mobile Money." },
      ],
      cta: { label: "Gundua mpango", href: "/dashboard/affiliate" },
      smallPrint:
        "Hakuna ngazi, hakuna uuzaji wa piramidi. Ngazi moja tu (wewe → mrejewa wako), kamisheni ya kudumu na ya wazi.",
    },
    faqLong: {
      intro:
        "Maswali tunayopata mara nyingi, yamewekwa kulingana na mada. Ikiwa hupati jibu lako, andika hello@backmesdo.com — tunajibu ndani ya saa 24.",
      categories: [
        {
          key: "basics",
          icon: "👋",
          label: "Misingi",
          items: [
            { q: "BMD ni nini katika sentensi moja?", a: "Programu inayosaidia vikundi kusimamia pesa zilizoshirikiwa bila drama: tontines, makazi ya pamoja, safari, harusi, makanisa, klabu." },
            { q: "BMD inachukua nafasi ya benki yangu au Lydia?", a: "Hapana. BMD haisogei pesa yenyewe. Unaendelea kulipa kupitia njia zako za kawaida. BMD inarekodi, inahesabu na kupendekeza malipo madogo zaidi." },
            { q: "Inagharimu kiasi gani?", a: "Mpango wa Bure unashughulikia wengi: vikundi 3 vilivyoanzishwa. Pro €4.99/mwezi. Mpango wa Tukio €29 mara moja." },
            { q: "Inafanya kazi kwenye vifaa gani?", a: "iPhone (iOS 15+), Android (9+), na kompyuta yoyote ya kisasa. Pia kupitia bot ya WhatsApp." },
            { q: "Je, watu wangu wote wanapaswa kujisajili?", a: "Sio mara moja. Unaweza kuunda kikundi na \"wasifu wa kivuli\" (jina + simu tu)." },
          ],
        },
        {
          key: "groups",
          icon: "👥",
          label: "Vikundi & mialiko",
          items: [
            { q: "Ni aina zipi za vikundi ninazoweza kuunda?", a: "Aina 6: Tontine, Makazi ya pamoja, Safari, Tukio, Klabu, Kanisa/Chama." },
            { q: "Ukubwa wa juu wa kikundi?", a: "Hakuna kikomo kikali. Tuna makanisa yenye washirika 300+ na kila kitu kinafanya kazi vizuri." },
            { q: "Ninamwaliaje mtu?", a: "Chaguzi tatu: kiungo cha kushirikishwa, msimbo QR, au kutoka kwa anwani zako (kwa idhini wazi)." },
            { q: "Je, ninaweza kuondoa mwanachama?", a: "Ndiyo, msimamizi anaweza kuondoa wakati wowote. Matumizi yake yaliyopita yanabaki kwenye historia." },
            { q: "Je, wageni wanaona vikundi vyangu vingine?", a: "Kamwe. Kila kikundi kimezungushwa." },
          ],
        },
        {
          key: "tontines",
          icon: "🪙",
          label: "Tontines",
          items: [
            { q: "Tontine inafanyaje kazi kwenye BMD?", a: "Unaunda kikundi, unaweka kiasi na mzunguko. Kila zamu, mnufaika anachagua tarehe halisi. Wengine wanathibitisha mchango wao." },
            { q: "Tofauti kati ya bamileke, hui ya Wachina na susu?", a: "Kanuni sawa (akiba inayozunguka), zinatofautiana katika mpangilio. BMD inaunga mkono zote tatu." },
            { q: "Je, ikiwa mtu hajalipa zamu yake?", a: "Mtunzi wa hazina anaona ni nani hajathibitisha. BMD inatuma kikumbusho otomatiki kwa sauti uliyochagua." },
            { q: "Je, ninaweza kufuatilia tontine miaka mingi?", a: "Ndiyo, historia inahifadhiwa miaka 5 angalau, na unaweza kuhamisha kwa Excel wakati wowote." },
          ],
        },
        {
          key: "money",
          icon: "💱",
          label: "Fedha & malipo",
          items: [
            { q: "Ni fedha zipi BMD inaunga mkono?", a: "Fedha 25+ zilizoanzishwa. Viwango vinaboreshwa kila saa." },
            { q: "Ubadilishaji kati ya fedha hufanyikaje?", a: "Kila mwanachama anaona kiasi katika fedha YAKE ya kawaida, kwa kiwango cha leo." },
            { q: "Je, BMD inachukua kamisheni kwenye malipo?", a: "Kamwe. BMD haisogei pesa. Njia yako ya kawaida hutumia ada zake." },
            { q: "Ni mbinu zipi za malipo zinazoungwa mkono?", a: "Zote. Lydia, Wave, MoMo, Wise, kuhamisha SEPA, PayPal, fedha taslimu." },
            { q: "Ninalipaje mpango wa BMD?", a: "Stripe Checkout salama: kadi, Apple Pay, Google Pay, Direct Debit ya SEPA." },
          ],
        },
        {
          key: "expenses",
          icon: "💸",
          label: "Matumizi & stakabadhi",
          items: [
            { q: "Ninapigaje stakabadhi?", a: "Picha au PDF. BMD inagundua kiasi, muuzaji na tarehe kiotomatiki." },
            { q: "Nani anaweza kuhariri matumizi?", a: "Tu muumbaji na msimamizi wa kikundi. Kila uhariri umeandikwa kwenye logi ya ukaguzi." },
            { q: "Ninagawanyaje bila usawa?", a: "Hali tatu: sawa, sehemu maalum, au asilimia kamili. Pia unaweza kumtenga mwanachama kutoka kwa matumizi." },
            { q: "Je, BMD inagundua nakala?", a: "Ndiyo, kiotomatiki. Beji ya ⚠️ inaonekana na pendekezo la kuunganisha." },
            { q: "Je, ninaweza kuingiza taarifa yangu ya benki?", a: "Ndiyo, kwa CSV. BMD inatambua miundo ya benki kuu." },
          ],
        },
        {
          key: "settle",
          icon: "↔",
          label: "Salio & malipo",
          items: [
            { q: "BMD inahesabuje ni nani anadaiwa nani?", a: "Algoriti ya \"mtiririko mdogo\": inapata KIASI CHA CHINI cha muamala kuondoa madeni ya wote." },
            { q: "Swap ya deni ni nini?", a: "Wakati mwanachama anachukua deni la mwingine. Uthibitisho wa pande 3 dhidi ya udanganyifu." },
            { q: "Ninaonyeshaje deni kama imelipwa?", a: "Katika kikundi → Salio → \"Lipia\" → chagua njia → thibitisha. Mdaiwa anapokea arifa." },
            { q: "Ikiwa mtu anasema amelipa lakini sijapata?", a: "Ndio sababu BMD anaomba uthibitisho wa pande zote mbili. Vikumbusho otomatiki baada ya siku 7." },
          ],
        },
        {
          key: "privacy",
          icon: "🛡",
          label: "Faragha & usalama",
          items: [
            { q: "Je, data yangu iko salama?", a: "Ndiyo. Mawasiliano yamesimbwa TLS 1.3, hakuna nywila, hakuna kusoma kwa wingi. Mwenyeji wa EU. GDPR kamili." },
            { q: "Login bila nywila inafanyaje kazi?", a: "Unaingiza simu au barua pepe, unapokea nambari ya tarakimu 6, unaiingiza. Inaisha baada ya dakika 5." },
            { q: "Passkey ni nini?", a: "Funguo ya ufikiaji ya kibayoloji (Face ID, Touch ID). Kasi zaidi na haiwezi kudukuliwa." },
            { q: "Je, BMD inasoma anwani zangu?", a: "KAMWE kwa wingi. Tu wale unaowachagua waziwazi hutumwa." },
            { q: "Je, ninaweza kufuta akaunti yangu?", a: "Ndiyo, kutoka kwa wasifu → Faragha. Inafanya kazi ndani ya siku 30 (GDPR)." },
            { q: "Je, ninaweza kuhamisha data yangu yote?", a: "Ndiyo, katika JSON au CSV. Unapokea barua pepe na faili ndani ya saa 24." },
          ],
        },
        {
          key: "billing",
          icon: "💳",
          label: "Malipo & mipango",
          items: [
            { q: "Mpango wa Bure unajumuisha nini?", a: "Hadi vikundi 3 vilivyoanzishwa, tontines/matumizi/swap zisizo na kikomo, stakabadhi za picha na PDF, OCR (3/mwezi)." },
            { q: "Na mpango wa Pro €4.99/mwezi?", a: "Vikundi visivyo na kikomo, OCR isiyo na kikomo, mauzo ya hesabu kwa undani, historia ya miaka 10, msaada wa kipaumbele." },
            { q: "Mpango wa Tukio €29 ni nini?", a: "Malipo ya mara moja kwa matukio makubwa: harusi, sherehe ya kazi. Inatoa ufikiaji wa Pro kwa miezi 6 kwenye kikundi." },
            { q: "Je, ninaweza kufuta wakati wowote?", a: "Ndiyo, kutoka kwa wasifu → Mpango wangu → Futa. Hakuna gharama. Unahifadhi ufikiaji hadi mwisho wa kipindi kilicholipwa." },
            { q: "Je, bei inabadilika kulingana na nchi?", a: "Ndiyo, BMD inarekebisha bei kwa mikoa (usawa wa nguvu ya ununuzi)." },
            { q: "Mpango wa rufaa unafanyaje kazi?", a: "Wezesha nafasi ya biashara → pata nambari ya kibinafsi → shiriki → pata 20% maisha yote. Malipo tarehe 1 ya kila mwezi." },
          ],
        },
      ],
      contactNudge:
        "Unatafuta jibu maalum zaidi au unataka kuzungumza kuhusu kesi fulani? Andika hello@backmesdo.com — binadamu anajibu ndani ya saa 24.",
    },
    cta: {
      headline: "Anza sasa",
      body: "Bure. Hakuna kadi. Usajili kwa chini ya dakika moja.",
      button: "Unda akaunti yangu",
    },
    footer: {
      tagline: "Fedha za pamoja. Urafiki uliolindwa.",
      rights: "Haki zote zimehifadhiwa.",
      privacy: "Faragha",
      terms: "Masharti",
      contact: "Mawasiliano",
    },
  },
  // 中文 — pour les diasporas chinoises (Hui / 標會)
  zh: {
    meta: {
      title: "BMD · 共享金钱,无忧无虑",
      description:
        "BMD 帮助非洲和华人侨民管理标会、合租、旅行和团体活动 — 透明、公平、安心。",
    },
    nav: {
      story: "我们的故事",
      features: "功能",
      howItWorks: "工作原理",
      pricing: "价格",
      login: "登录",
      signUp: "注册",
    },
    langPicker: { main: "主要语言", europeanGroup: "欧洲语言", asianGroup: "亚洲语言", arabicGroup: "阿拉伯语", africanGroup: "非洲语言" },
    story: {
      kicker: "我们的故事",
      title: "金钱永远不应让友谊付出代价",
      punchline: "我们都经历过那次餐厅变成法庭的晚餐。那次没人知道谁付钱的标会。那次以冰冷的WhatsApp群结束的表亲旅行。",
      chapters: [
        { icon: "🌍", title: "问题", body: "通货膨胀吞噬一切。在欧洲、喀麦隆、达喀尔、孟买,生活成本爆炸。每一欧元都很重要——每一欧元算错都会变成沉默、怨恨、破碎的关系。" },
        { icon: "💔", title: "紧张", body: "Excel无法阅读。WhatsApp不计算。西方应用不理解标会、CFA法郎或巴黎6人合租的现实。" },
        { icon: "🕊", title: "解决方案", body: "BMD。为真正分享金钱的人设计的工具。多币种(25+)、多语言(20+)、标会、债务交换、收据OCR、WhatsApp机器人。无戏剧、无追踪器、无广告。" },
      ],
      manifesto: "「我们数每一分钱——这样我们就不必数我们的朋友。」",
      cta: "免费开始",
    },
    hero: {
      tagline: "Back Mes Do · 侨民",
      headline: "共享金钱。守护友谊。",
      subhead:
        "标会、合租、旅行、婚礼、教区、俱乐部:BMD 计算、简化和追踪每一笔费用,让没有人感到吃亏。",
      ctaPrimary: "免费开始",
      ctaSecondary: "观看演示",
    },
    features: {
      title: "你需要的一切,无多余",
      items: [
        { icon: "🪙", title: "完整的标会", body: "周期、受益人顺序、可调整日期、确认收据、多年历史。" },
        { icon: "💸", title: "共享支出", body: "平均、定额或百分比。所有成员可见的照片/PDF 收据。" },
        { icon: "↔", title: "债务交换", body: "在三方验证下抵消或转移债务。" },
        { icon: "🔔", title: "完整通知", body: "每个相关事件都会触发通知。反垃圾邮件设计。" },
        { icon: "📷", title: "收据 OCR", body: "扫描照片:金额、商家、日期自动检测。" },
        { icon: "🛡", title: "GDPR 与隐私", body: "无批量地址簿读取。明确同意。" },
      ],
    },
    howItWorks: {
      title: "三步搞定",
      steps: [
        { num: "1", title: "创建你的群组", body: "标会、合租、旅行、婚礼…选择类型和默认货币。" },
        { num: "2", title: "邀请你的圈子", body: "可分享链接、QR 码或电话联系人(经你同意)。" },
        { num: "3", title: "安心生活", body: "添加费用、贡献、交换。BMD 计算余额并建议最优结算。" },
      ],
    },
    pricing: {
      title: "大多数人免费",
      free: {
        name: "免费",
        price: "¥0",
        features: ["最多 3 个活跃群组", "无限标会、费用、交换", "PDF/照片收据", "完整通知"],
      },
      pro: {
        name: "Pro",
        price: "¥29 / 月",
        features: ["无限群组", "详细会计导出", "10 年历史", "优先支持"],
        cta: "即将推出",
      },
    },
    faq: {
      title: "常见问题",
      items: [
        { q: "BMD 是银行吗?", a: "不是。BMD 是共享管理工具。付款通过你的常用渠道进行。" },
        { q: "我的数据安全吗?", a: "是的。我们加密通信,不会未经明确同意读取你的地址簿。" },
        { q: "BMD 标会如何运作?", a: "你创建群组,设置金额和频率。每一轮,受益人选择月内的具体日期,所有人确认。" },
      ],
    },
    featuresLong: {
      intro: "BMD 涵盖资金在亲友之间流动的所有情况:标会、合租、旅行、婚礼、教区、俱乐部、团队。",
      categories: [
        { key: "groups", icon: "👥", label: "群组与角色", pitch: "30 秒内创建合适的群组类型。",
          items: [
            { icon: "🎭", title: "6 种预设类型", body: "标会 · 合租 · 旅行 · 活动 · 俱乐部 · 教区/协会。" },
            { icon: "🛡", title: "明确角色", body: "管理员、出纳、成员。无繁重等级即可追溯。" },
            { icon: "✉️", title: "多渠道邀请", body: "可分享链接、二维码、电话联系人(明确同意)。" },
            { icon: "🎨", title: "社区主题", body: "选择群组的视觉身份。" },
          ],
        },
        { key: "expenses", icon: "💸", label: "共享支出", pitch: "记录支出应只需 5 秒。",
          items: [
            { icon: "📷", title: "收据 OCR", body: "拍照即可自动识别金额、商家、日期。" },
            { icon: "⚖️", title: "分摊:平均 · 份额 · 百分比", body: "一键平均分摊、自定义份额或精确百分比。" },
            { icon: "🤖", title: "AI 分摊建议", body: "BMD 学习你的习惯,自动推荐正确模式。" },
            { icon: "📜", title: "类别规则", body: "创建一次规则,BMD 总是应用。" },
            { icon: "🚨", title: "异常检测", body: "重复、异常金额:验证前提醒。" },
            { icon: "🏦", title: "银行 CSV 导入", body: "导入对账单。BMD 自动分类。" },
          ],
        },
        { key: "tontines", icon: "🪙", label: "标会与周期", pitch: "支持所有轮替储蓄模型,双重验证和不可篡改的历史。",
          items: [
            { icon: "🔄", title: "完全自动化周期", body: "定义金额、频率和受益人顺序。" },
            { icon: "🤝", title: "出资双重验证", body: "付款人申报,出纳确认。" },
            { icon: "📅", title: "日历视图", body: "所有未来轮次可视化显示。" },
            { icon: "🎯", title: "拍卖 (标会)", body: "供华人社区使用。" },
            { icon: "📚", title: "多年历史", body: "不可变审计日志:至少 5 年。" },
          ],
        },
        { key: "settle", icon: "↔", label: "余额与结算", pitch: "BMD 计算结算群组所需的最少交易数。",
          items: [
            { icon: "🧮", title: "实时余额", body: "多币种全球余额,即时重新计算。" },
            { icon: "🎯", title: "最优结算", body: "「最小现金流」算法:1 次交易代替 2-3 次。" },
            { icon: "🔁", title: "债务交换与转移", body: "三方验证防欺诈。" },
            { icon: "🔗", title: "一次性付款链接", body: "生成安全链接以接收成员付款。" },
          ],
        },
        { key: "money", icon: "💱", label: "多币种与支付", pitch: "BMD 为侨民设计。支持 25+ 种货币。",
          items: [
            { icon: "🌍", title: "25+ 种货币实时汇率", body: "欧元、美元、英镑、CFA 法郎、奈拉、迪拉姆等。" },
            { icon: "💳", title: "兼容你的工具", body: "Lydia, Wave, Wise, SEPA, PayPal, 支付宝。BMD 不替代 — 它记录。" },
            { icon: "📈", title: "实时转换", body: "XAF 支出会以每个成员的默认货币显示。" },
            { icon: "🧾", title: "可下载税务收据", body: "供教区、协会、体育俱乐部使用。" },
          ],
        },
        { key: "comms", icon: "🔔", label: "沟通与提醒", pitch: "一切由通知驱动。",
          items: [
            { icon: "🛎", title: "精细通知", body: "只通知与你相关的内容。" },
            { icon: "📅", title: "每周摘要", body: "每周日晚上:发生了什么、你的余额、未结清债务。" },
            { icon: "💬", title: "原生 WhatsApp 机器人", body: "通过语音或文本消息添加支出。" },
            { icon: "😊", title: "选择语气", body: "友好、坚定、幽默、专业。" },
            { icon: "🌙", title: "群组级勿扰", body: "静音群组 1 小时、24 小时或到明早。" },
          ],
        },
        { key: "intelligence", icon: "🧠", label: "智能与自动化", pitch: "BMD 使用 AI 消除文书工作。",
          items: [
            { icon: "🎙", title: "Whisper 语音输入", body: "BMD 转录、理解、整理。" },
            { icon: "📊", title: "统计与洞察", body: "月度趋势、类别分类、群组平均值。" },
            { icon: "🌐", title: "管理内容自动翻译", body: "BMD 自动翻译,可选审查。" },
            { icon: "🔮", title: "异常与重复", body: "在产生争议前 BMD 提醒。" },
          ],
        },
        { key: "trust", icon: "🛡", label: "安全与隐私", pitch: "GDPR 设计先行。",
          items: [
            { icon: "🔑", title: "无密码登录", body: "通过 SMS、邮件或 WhatsApp 的 OTP。Passkeys。" },
            { icon: "🚫", title: "零批量读取", body: "只有你明确选择的联系人才会被传输。" },
            { icon: "📜", title: "不可变审计日志", body: "敏感操作仅追加、签名、保留 5 年。" },
            { icon: "🇪🇺", title: "完全 GDPR 合规", body: "JSON/CSV 导出、按要求 30 天内删除。" },
            { icon: "🌐", title: "欧盟托管", body: "数据库和服务器位于欧盟地区。" },
          ],
        },
        { key: "platform", icon: "📱", label: "平台与无障碍", pitch: "手机上真正的原生应用,电脑上真正的 Web 门户。",
          items: [
            { icon: "📲", title: "可安装 PWA", body: "在 iPhone、Android 或桌面上。" },
            { icon: "💬", title: "WhatsApp 机器人", body: "30 秒内连接你的 WhatsApp 号码。" },
            { icon: "🌍", title: "多语言", body: "界面适应你偏好的语言。" },
            { icon: "♿", title: "WCAG 2.1 AA 无障碍", body: "经验证的对比度、键盘导航、明/暗模式。" },
            { icon: "🌗", title: "明/暗模式", body: "通过右上角的 ☀️/🌙 图标一键切换。" },
          ],
        },
      ],
    },
    referral: {
      kicker: "销售计划",
      title: "推荐 BMD,从每个订阅中获利",
      intro: "BMD 拥有简单的推荐计划 — 无层级、无金字塔。每次注册转为付费,只要用户保持客户身份,你就能终身获得佣金。",
      benefits: [
        { icon: "💰", title: "直接佣金", body: "你推荐的用户每月支付金额的 20%。每月 1 日支付。" },
        { icon: "♾️", title: "终身定期", body: "只要你的推荐人保持订阅,你就能继续获得佣金。" },
        { icon: "📊", title: "专属销售面板", body: "清晰仪表板:谁通过你注册、你的 MRR、预期收入。" },
        { icon: "🎁", title: "推荐人奖励", body: "你的推荐人也获得折扣(年度计划 1 个月免费,或终身 9 折)。" },
      ],
      howItWorks: [
        { num: "1", title: "激活销售空间", body: "个人资料 → 销售空间 → 「激活」。获取个性化推荐码。" },
        { num: "2", title: "与你的网络分享", body: "向你的教区、足球俱乐部、侨民朋友。" },
        { num: "3", title: "跟踪注册", body: "每次点击和转换实时显示。" },
        { num: "4", title: "获得佣金", body: "每月 1 日自动支付(从 25€ 起)。" },
      ],
      cta: { label: "发现计划", href: "/dashboard/affiliate" },
      smallPrint: "无层级、无金字塔营销。仅一级,固定透明佣金。",
    },
    faqLong: {
      intro: "最常被问到的问题,按主题分组。如果找不到答案,请发邮件到 hello@backmesdo.com — 我们 24 小时内回复。",
      categories: [
        { key: "basics", icon: "👋", label: "基础",
          items: [
            { q: "一句话介绍 BMD?", a: "帮助群组无忧管理共享资金的应用。" },
            { q: "BMD 是否替代我的银行或 Lydia?", a: "不是。BMD 不转账,你继续通过常用渠道支付。" },
            { q: "费用是多少?", a: "免费计划:3 个活跃群组。Pro ¥29/月。Event 计划 ¥199 一次性。" },
            { q: "在哪些设备上工作?", a: "iPhone (iOS 15+)、Android (9+)、任何现代电脑。" },
            { q: "我所有的亲人都需要注册吗?", a: "不需要立即。可创建带「影子档案」的群组。" },
          ],
        },
        { key: "groups", icon: "👥", label: "群组",
          items: [
            { q: "我可以创建哪些类型的群组?", a: "6 种预设类型:标会、合租、旅行、活动、俱乐部、教区/协会。" },
            { q: "群组最大规模?", a: "无严格限制。我们有 300+ 成员的教区。" },
            { q: "如何邀请某人?", a: "三种选择:可分享链接、二维码或从联系人中选择。" },
            { q: "可以删除成员吗?", a: "可以,管理员可随时删除。" },
            { q: "客人能看到我的其他群组吗?", a: "永远不会。每个群组都是隔离的。" },
          ],
        },
        { key: "tontines", icon: "🪙", label: "标会",
          items: [
            { q: "BMD 标会如何运作?", a: "创建群组,设置金额和频率。每轮受益人选择确切日期。" },
            { q: "bamileke、hui、susu 的区别?", a: "相同原则(轮替储蓄),顺序和机制不同。BMD 全部支持。" },
            { q: "如果有人不付款怎么办?", a: "出纳看到谁未确认。BMD 以选定的语气发送自动提醒。" },
            { q: "可以多年跟踪标会吗?", a: "是的,历史保留至少 5 年,可随时导出 Excel。" },
          ],
        },
        { key: "money", icon: "💱", label: "货币",
          items: [
            { q: "BMD 支持哪些货币?", a: "25+ 种活跃货币。每小时更新汇率。" },
            { q: "货币转换如何工作?", a: "每个成员以自己的默认货币查看金额。" },
            { q: "BMD 收取支付佣金吗?", a: "永远不会。BMD 不转账。" },
            { q: "兼容哪些支付方式?", a: "全部。Lydia, Wave, Wise, SEPA, PayPal, 支付宝, 现金。" },
            { q: "如何支付 BMD 计划?", a: "Stripe Checkout:卡、Apple Pay、Google Pay、SEPA 直接借记。" },
          ],
        },
        { key: "expenses", icon: "💸", label: "支出",
          items: [
            { q: "如何扫描收据?", a: "照片或 PDF。BMD 自动检测金额、商家、日期。" },
            { q: "谁可以编辑支出?", a: "只有创建者和群组管理员。每次编辑都记录在审计日志中。" },
            { q: "如何不平均分摊?", a: "三种模式:平均、自定义份额、精确百分比。" },
            { q: "BMD 检测重复吗?", a: "是的,自动。" },
            { q: "可以导入银行对账单吗?", a: "可以,CSV 格式。" },
          ],
        },
        { key: "settle", icon: "↔", label: "余额",
          items: [
            { q: "BMD 如何计算谁欠谁?", a: "「最小现金流」算法:找到结算所有人所需的最少交易数。" },
            { q: "什么是债务交换?", a: "当一个成员承担另一个成员的债务时。三方验证。" },
            { q: "如何标记债务为已支付?", a: "在群组 → 余额 →「结算」 → 选择渠道 → 确认。" },
            { q: "如果有人说付了但我没收到怎么办?", a: "因此 BMD 要求双方确认。" },
          ],
        },
        { key: "privacy", icon: "🛡", label: "隐私",
          items: [
            { q: "我的数据安全吗?", a: "是的。TLS 1.3 加密、无密码、欧盟托管、完全 GDPR 合规。" },
            { q: "无密码登录如何工作?", a: "输入电话或邮件,接收 6 位代码,输入。5 分钟后过期。" },
            { q: "passkey 是什么?", a: "生物识别访问密钥(Face ID、Touch ID)。" },
            { q: "BMD 读取我的联系人吗?", a: "永远不会批量。" },
            { q: "可以删除我的账户吗?", a: "可以,从个人资料 → 隐私。30 天内生效。" },
            { q: "可以导出所有数据吗?", a: "可以,JSON 或 CSV 格式。" },
          ],
        },
        { key: "billing", icon: "💳", label: "计划",
          items: [
            { q: "免费计划包含什么?", a: "最多 3 个活跃群组、无限标会/支出/交换、照片和 PDF 收据。" },
            { q: "Pro 计划 ¥29/月呢?", a: "无限群组、无限 OCR、详细会计导出、10 年历史、优先支持。" },
            { q: "Event 计划 ¥199 是什么?", a: "大型一次性活动:婚礼、公司活动、生日。" },
            { q: "可以随时取消吗?", a: "可以,无费用。" },
            { q: "价格因国家而异吗?", a: "是的,BMD 按地区调整定价。" },
            { q: "推荐计划如何工作?", a: "激活销售空间 → 获取个人代码 → 分享 → 终身赚取 20%。" },
          ],
        },
      ],
      contactNudge: "需要更具体的答案?发邮件到 hello@backmesdo.com — 真人 24 小时内回复。",
    },
    cta: {
      headline: "立即开始",
      body: "免费。无信用卡。一分钟内注册。",
      button: "创建我的账户",
    },
    footer: {
      tagline: "共享金钱。守护友谊。",
      rights: "保留所有权利。",
      privacy: "隐私",
      terms: "条款",
      contact: "联系",
    },
  },
  // Wolof — pour la diaspora sénégalaise (UEMOA, Wave dominant)
  wo: {
    meta: {
      title: "BMD · Xaalis bu nu bokk, doxalin",
      description:
        "BMD dafay dimbali xeet yi (diaspora yi) ngir téye seeni tontine, dëkkuwaay, tukki, tay ay xewe.",
    },
    nav: {
      story: "Sunu istoryaa",
      features: "Sàrta yi",
      howItWorks: "Naka la liggéeyee",
      pricing: "Njëg",
      login: "Dugg",
      signUp: "Bind sa kont",
    },
    langPicker: { main: "Lakk yu mag", europeanGroup: "Lakk yu Tugal", asianGroup: "Lakk yu Asia", arabicGroup: "Lakk yu Araab", africanGroup: "Lakk yu Afrik" },
    story: {
      kicker: "Sunu istoryaa",
      title: "Xaalis du war faye xarit",
      punchline: "Ñépp dañ am ndeeñ jëf bi ñu lekkuwoon, restaurant bi nekk fitt. Tontine bu kenn nekkutu mu yor xaalis. Tukki bu xarit yi mu jeexal ci WhatsApp bu sedd.",
      chapters: [
        { icon: "🌍", title: "Jafe-jafe bi", body: "Inflation lépp lay yor. Dund daa diis ci Tugal, Kamarun, Ndakaaru, Mumbai. Won bu nekk am solo, te bu ñu ko nirbal, mu nekk noon, lëj-lëj." },
        { icon: "💔", title: "Tëlim bi", body: "Excel rëy na. WhatsApp xamul a waññi. Aplikaasioon yu Tugal xamuñu tontine, walla franc CFA, walla dëkkuwaay yu 6 sa Paris." },
        { icon: "🕊", title: "Solution bi", body: "BMD. Jumtukaay ngir ñiy bokk seen xaalis. Multi-xaalis (25+), multi-lakk (20+), tontine, swap bor, OCR, bot WhatsApp." },
      ],
      manifesto: "«Nu waññi sunug kopék — ngir bañ a waññi sunuy xarit.»",
      cta: "Tàmbali ci dara",
    },
    hero: {
      tagline: "Back Mes Do · Diaspora",
      headline: "Xaalis bu nu bokk. Mbokk biñ aar.",
      subhead:
        "Tontine, dëkkuwaay, tukki, séyu, parouwas, klub : BMD lay nataal, taxawal, te di topp lépp ñu yor xaalis.",
      ctaPrimary: "Tàmbali ci dara",
      ctaSecondary: "Gis demo",
    },
    features: {
      title: "Lépp loo soxla, lu doy rekk",
      items: [
        { icon: "🪙", title: "Tontine bu mat", body: "Yoonu jox, tànneef bu nu am, bés yi nu mën a soppi, ay tan." },
        { icon: "💸", title: "Xaalis bu nu bokk", body: "Yamoo, way wala portion. Reseepi yi nit ñépp gis." },
        { icon: "↔", title: "Bayyi/jox bor", body: "Ku am bor, mën nañ ko jox keneen, ñépp dañ koy nangu." },
        { icon: "🔔", title: "Yónne yu mat", body: "Lu xew lépp lu la jëm, dañ la koy yónne. Yónne yu jaaxle." },
        { icon: "📷", title: "OCR tikket", body: "Foto rek, BMD bind njëg, jëkkër, jamono." },
        { icon: "🛡", title: "GDPR · Sutura", body: "Du jël sa list seetaay yi yepp." },
      ],
    },
    howItWorks: {
      title: "Ci ñetti taatu",
      steps: [
        { num: "1", title: "Sos sa kër", body: "Tontine, dëkkuwaay, tukki…tànn xeet bi ak xaalis bi." },
        { num: "2", title: "Wokoo ay xarit", body: "Lien, QR wala numero — bu nu yónne." },
        { num: "3", title: "Dund ci jàmm", body: "Bind sa joxe, BMD luy waññi te wax kii lay laaj." },
      ],
    },
    pricing: {
      title: "Lu ëpp neexal ci nit ñi",
      free: {
        name: "Free",
        price: "0 F",
        features: ["3 kër yu liggéey", "Tontine bu àpp", "Reseepi PDF/foto", "Yónne yu mat"],
      },
      pro: {
        name: "Pro",
        price: "1 950 F / weer",
        features: ["Kër bu àpp", "Bind komptable", "10 at istoryaa", "Ndimbal jëkk"],
        cta: "Bët",
      },
    },
    faq: {
      title: "Laaj yi ñu duggal",
      items: [
        { q: "Ndax BMD bànk lay?", a: "Déédéet. BMD jumtukaay la ngir doxal seeni xaalis. Fee fii nga jëfandikoo Wave wala Orange." },
        { q: "Ndax sama mbind aar nañ?", a: "Waaw. Mbind yi nu yor sutura lañu am. Du jël sa jëfandiku bu la ko yónnewul." },
        { q: "Naka tontine BMD doxe?", a: "Sos kër bi, defar njëg ak tànneef. Ci tan bu nekk, bu mu jox xaalis." },
      ],
    },
    featuresLong: {
      intro: "BMD ngeejal lépp lu xaalis tëdd ci diggante mbokk yi: tontine, dëkkuwaay, tukki, séyu, parouwas, klub, ekip.",
      categories: [
        { key: "groups", icon: "👥", label: "Kër ak Lel", pitch: "Sos sa kër ci 30 segond.",
          items: [
            { icon: "🎭", title: "6 xeet yu am", body: "Tontine · Dëkkuwaay · Tukki · Xewu · Klub · Parouwas." },
            { icon: "🛡", title: "Lel yu leer", body: "Jiitéef, jaay-xaalis, way-bokk. Gis lépp." },
            { icon: "✉️", title: "Yónnee yu bare", body: "Lien, QR, numero (ak nga ko nangu)." },
            { icon: "🎨", title: "Tema ngir mbokk", body: "Tànn natal bu sa kër." },
          ],
        },
        { key: "expenses", icon: "💸", label: "Xaalis bu nu bokk", pitch: "Bind njëg, 5 segond rekk.",
          items: [
            { icon: "📷", title: "OCR tikket", body: "Foto rek, BMD bind njëg, jëkkër, jamono." },
            { icon: "⚖️", title: "Yamoo · way · pourcent", body: "1 pus rekk wala way personnel wala pourcent." },
            { icon: "🤖", title: "AI proposer", body: "BMD jàng ndax sa jëfandiku te tànn modular." },
            { icon: "📜", title: "Yoonu kategori", body: "Sos yoonu benn yoon, BMD def lépp." },
            { icon: "🚨", title: "Gis anomali", body: "Doublons, njëg yu rëy: BMD soppi." },
            { icon: "🏦", title: "Import CSV bànk", body: "Yónnee sa relevé. BMD def lépp." },
          ],
        },
        { key: "tontines", icon: "🪙", label: "Tontine", pitch: "Tontine bamiléké, hui chinois, susu — ñépp lañ ko jàppe.",
          items: [
            { icon: "🔄", title: "Cycle bu auto", body: "Defar njëg, frequence, molongo." },
            { icon: "🤝", title: "Validation ñaari yoon", body: "Ku fey, kii nangu. Anti-saafara." },
            { icon: "📅", title: "Kalendiriyu", body: "Tan yu ñëw lañu lépp gis." },
            { icon: "🎯", title: "Encheer (Hui)", body: "Ngir mbokk Chinois yi." },
            { icon: "📚", title: "5 at minimum", body: "Bind ñoo dóoreel ko." },
          ],
        },
        { key: "settle", icon: "↔", label: "Solde ak xaalis", pitch: "BMD nataal lu gën mën a doxal.",
          items: [
            { icon: "🧮", title: "Solde tay", body: "Solde global multi-xaalis, recalcul." },
            { icon: "🎯", title: "Solution gën", body: "Mënëfu min: 1 transaksioon ci 2-3." },
            { icon: "🔁", title: "Échange bor", body: "Validation 3 bopp anti-fraude." },
            { icon: "🔗", title: "Lien benn benn", body: "Sos lien sutura ngir nu fey la." },
          ],
        },
        { key: "money", icon: "💱", label: "Multi-xaalis", pitch: "BMD yor 25+ xaalis.",
          items: [
            { icon: "🌍", title: "25+ xaalis ci tay", body: "FCFA, Euro, Naira, Dirham, Rand…" },
            { icon: "💳", title: "Liggéey ak Wave, Orange", body: "Lydia, Wave, Wise, SEPA, PayPal. BMD du replace, dafa bind." },
            { icon: "📈", title: "Conversion tay", body: "Njëg XAF dafa feeñ ci xaalis bu nit ki." },
            { icon: "🧾", title: "Reseepi fiscal", body: "Ngir parouwas, club, asosiyaasioon." },
          ],
        },
        { key: "comms", icon: "🔔", label: "Yónne ak rappel", pitch: "Lépp ci yónne.",
          items: [
            { icon: "🛎", title: "Yónne yu xellal", body: "Lépp lu la jëm rekk." },
            { icon: "📅", title: "Resume bu weer", body: "Yajaayu, ndax xew, sa solde." },
            { icon: "💬", title: "Bot WhatsApp", body: "Bind njëg ak vocal wala texte." },
            { icon: "😊", title: "Ton yu tànn", body: "Sympa, ferme, humour, pro." },
            { icon: "🌙", title: "Bul stuf ci kër", body: "Stuf 1h, 24h wala ba suba." },
          ],
        },
        { key: "intelligence", icon: "🧠", label: "AI ak otomatik", pitch: "BMD jëfandikoo AI ngir suppress papier.",
          items: [
            { icon: "🎙", title: "Vocal Whisper", body: "BMD trankribéer, gëm, jëkkër." },
            { icon: "📊", title: "Stat ak lemo", body: "Évolution weer, partage kategori." },
            { icon: "🌐", title: "Tradiksioon auto", body: "BMD tradiksioon kontno admin auto." },
            { icon: "🔮", title: "Anomali ak doublon", body: "BMD soppi balaa drama." },
          ],
        },
        { key: "trust", icon: "🛡", label: "Sutura", pitch: "GDPR by design.",
          items: [
            { icon: "🔑", title: "Dugg sans password", body: "OTP par SMS, mail wala WhatsApp." },
            { icon: "🚫", title: "Carnet ñépp", body: "Du jël sa list seetaay yi yepp." },
            { icon: "📜", title: "Bind yi du soppi", body: "Operasion sensibles 5 at." },
            { icon: "🇪🇺", title: "GDPR mat", body: "Yónne JSON/CSV, suppression 30 fan." },
            { icon: "🌐", title: "Hosting EU", body: "Server yi ci EU lañu." },
          ],
        },
        { key: "platform", icon: "📱", label: "Plateforme ak aksesibilite", pitch: "App native ci tëlefon.",
          items: [
            { icon: "📲", title: "PWA install", body: "Ci iPhone, Android, ordinateur." },
            { icon: "💬", title: "Bot WhatsApp", body: "Connect numero ci 30 segond." },
            { icon: "🌍", title: "Lakk yu bare", body: "Interface tànn lakku." },
            { icon: "♿", title: "WCAG 2.1 AA", body: "Kontras, navigation klavier." },
            { icon: "🌗", title: "Mode leer / lëndëm", body: "Soppi ci ☀️/🌙 ci kanam." },
          ],
        },
      ],
    },
    referral: {
      kicker: "Programu xaalis",
      title: "Soog BMD, am xaalis ci abonement bu nekk",
      intro: "BMD am programu rufaa bu yomb — du naa xeet yu yore wala piramid.",
      benefits: [
        { icon: "💰", title: "Komisioon dëgg", body: "20% ci njëg bu nit ki fey weer wu nekk." },
        { icon: "♾️", title: "Ba fab dund", body: "Su sa rufaa toftalle, dinga am." },
        { icon: "📊", title: "Espace komercial", body: "Tableau leer: kii bind, MRR, prediksioon." },
        { icon: "🎁", title: "Bonus rufaa", body: "Sa rufaa am pajagal (1 weer ofele)." },
      ],
      howItWorks: [
        { num: "1", title: "Tëgg espace", body: "Profil → Espace komercial → Tëgg." },
        { num: "2", title: "Wàcce ak bokk", body: "Yónnee ci sa parouwas, klub." },
        { num: "3", title: "Toppal binditay", body: "Bu nekk fey, dafay feeñ." },
        { num: "4", title: "Jot komisioon", body: "Fey auto premier weer (deppi 25 €)." },
      ],
      cta: { label: "Gis programu", href: "/dashboard/affiliate" },
      smallPrint: "Du naa xeet, du marketing piramid. Benn niveau rekk, komisioon fixé.",
    },
    faqLong: {
      intro: "Laaj yi ñu duggal lu bare. Bind hello@backmesdo.com ngir respons ci 24h.",
      categories: [
        { key: "basics", icon: "👋", label: "Kàttan", items: [
          { q: "Lan mu BMD?", a: "Aplikasioon ngir doxal xaalis bu nu bokk." },
          { q: "Ndax BMD jox bànk?", a: "Déédéet. Yelef yi ngir Wave, Lydia." },
          { q: "Njëg lan?", a: "Ofele 3 kër. Pro 4,99 €/weer." },
          { q: "Ci ban tëlefon?", a: "iPhone 15+, Android 9+." },
          { q: "Ndax mbokk yepp dañu doon bind?", a: "Déédéet. Mën nga sos profil sombre." },
        ]},
        { key: "groups", icon: "👥", label: "Kër", items: [
          { q: "Ban xeet yu mën a sos?", a: "6 xeet: Tontine, Dëkkuwaay, Tukki, Xewu, Klub, Parouwas." },
          { q: "Limit ci kër?", a: "Du am limit. 300+ ñu am." },
          { q: "Naka mën a yónnee?", a: "Lien, QR, contact." },
          { q: "Mën a tu way bokk?", a: "Waaw, jiitéef mën a tu." },
          { q: "Wokoo gis sama yeneen kër?", a: "Déédéet, kër yi yamoo." },
        ]},
        { key: "tontines", icon: "🪙", label: "Tontine", items: [
          { q: "Naka tontine doxe?", a: "Sos kër, defar njëg, frequence." },
          { q: "Bamiléké, hui, susu ban deet?", a: "Bopp principe, doxalin yu yor xeet." },
          { q: "Su keneen feyul?", a: "Treyizoor gis, BMD soppi." },
          { q: "5 at?", a: "Waaw, bind 5 at minimum." },
        ]},
        { key: "money", icon: "💱", label: "Xaalis", items: [
          { q: "Ban xaalis?", a: "25+ xaalis." },
          { q: "Naka conversion?", a: "Bu nit ki gis ci xaalis-am." },
          { q: "BMD jëlat komisioon?", a: "Mukk." },
          { q: "Ban moyens?", a: "Lépp: Lydia, Wave, MoMo." },
          { q: "Naka fey BMD?", a: "Stripe Checkout." },
        ]},
        { key: "expenses", icon: "💸", label: "Njëg", items: [
          { q: "Naka skanee tikket?", a: "Foto, BMD bind auto." },
          { q: "Kii mën a soppi?", a: "Sos ak admin rekk." },
          { q: "Yamoo deet?", a: "3 mode." },
          { q: "BMD gis doublon?", a: "Waaw auto." },
          { q: "Importer relevé?", a: "Waaw CSV." },
        ]},
        { key: "settle", icon: "↔", label: "Solde", items: [
          { q: "Naka BMD nataal?", a: "Algorithm minimum." },
          { q: "Échange bor?", a: "Validation 3 yoon." },
          { q: "Naka mark fey?", a: "Solde → Fey." },
          { q: "Su keneen wax fey?", a: "BMD laaj kondima 2 yoon." },
        ]},
        { key: "privacy", icon: "🛡", label: "Sutura", items: [
          { q: "Mbind aar?", a: "Waaw, TLS 1.3, EU hosting, GDPR." },
          { q: "Naka dugg sans password?", a: "Numero, kod 6 chiffres, dugg." },
          { q: "Passkey lan?", a: "Klee biometrik (Face ID, Touch ID)." },
          { q: "BMD jang carnet?", a: "Mukk." },
          { q: "Mën a suppress kont?", a: "Waaw, profil → Sutura." },
          { q: "Mën a yónnee mbind yepp?", a: "Waaw JSON wala CSV." },
        ]},
        { key: "billing", icon: "💳", label: "Forfait", items: [
          { q: "Lan ofele?", a: "3 kër, tontine sans suka." },
          { q: "Pro 4,99 €?", a: "Kër sans suka, OCR sans suka." },
          { q: "Event 29 €?", a: "Fey benn benn ngir séyu, xewu yu mag." },
          { q: "Annuler?", a: "Waaw sans frais." },
          { q: "Njëg ci dëkk?", a: "Waaw, BMD adapter." },
          { q: "Programu rufaa?", a: "Tëgg → kod → wàcce → 20% sa dund." },
        ]},
      ],
      contactNudge: "Jang hello@backmesdo.com ngir laaj yu xellal.",
    },
    cta: {
      headline: "Tàmbali fii",
      body: "Du jëf dara. Bind sa kont ci ñaari simili.",
      button: "Bind sama kont",
    },
    footer: {
      tagline: "Xaalis bu nu bokk. Mbokk biñ aar.",
      rights: "Yonn yi yepp dañ leen aar.",
      privacy: "Sutura",
      terms: "Sàrta yi",
      contact: "Jokkoo",
    },
  },
  // አማርኛ — pour la diaspora éthiopienne (TeleBirr, US/CA)
  am: {
    meta: {
      title: "BMD · የተጋራ ገንዘብ ያለ ችግር",
      description:
        "BMD የአፍሪካ ስደተኞችን ቱንቲንስ፣ የጋራ ኑሮ፣ ጉዞ እና የቡድን ዝግጅቶችን እንዲያስተዳድሩ ይረዳል።",
    },
    nav: {
      story: "የእኛ ታሪክ",
      features: "ባህሪያት",
      howItWorks: "እንዴት ይሰራል",
      pricing: "ዋጋ",
      login: "ግባ",
      signUp: "ተመዝገብ",
    },
    langPicker: { main: "ዋና ቋንቋዎች", europeanGroup: "የአውሮፓ ቋንቋዎች", asianGroup: "የእስያ ቋንቋዎች", arabicGroup: "የአረብኛ", africanGroup: "የአፍሪካ ቋንቋዎች" },
    story: {
      kicker: "የእኛ ታሪክ",
      title: "ገንዘብ በፍፁም ጓደኝነትን ሊያስከፍል አይገባም",
      punchline: "ሁላችንም ምግብ ቤቱ ወደ ፍርድ ቤት የተቀየረበትን እራት አይተናል። ማን እንደከፈለ ማንም የማያውቅበትን ቱንቲን። በቀዘቀዘ WhatsApp ቡድን ያበቃውን የአጎት ልጆች ጉዞ።",
      chapters: [
        { icon: "🌍", title: "ችግሩ", body: "የዋጋ ግሽበት ሁሉንም ይበላል። የኑሮ ዋጋ በአውሮፓ፣ ካሜሩን፣ ዳካር፣ ሙምባይ ይፈነዳል። እያንዳንዱ ዩሮ አስፈላጊ ነው — እና በስህተት የተቆጠረ እያንዳንዱ ዩሮ ወደ ዝምታ፣ ቅሬታ፣ የተሰበረ ግንኙነት ይቀየራል።" },
        { icon: "💔", title: "ውጥረቱ", body: "Excel ሉሆች ለመነበብ የማይቻሉ ናቸው። WhatsApp አይሰላም። የምዕራባውያን መተግበሪያዎች ቱንቲኖችን፣ የCFA ፍራንክን፣ ወይም የ6 ተማሪዎች የጋራ ቤት እውነታን አይረዱም።" },
        { icon: "🕊", title: "መፍትሄው", body: "BMD። በትክክል ገንዘባቸውን ለሚጋሩ ሰዎች የተነደፈ መሣሪያ። ብዙ ምንዛሬ (25+)፣ ብዙ ቋንቋ (20+)፣ ቱንቲኖች፣ የዕዳ መለዋወጥ፣ የደረሰኝ OCR፣ WhatsApp ቦት።" },
      ],
      manifesto: "«እያንዳንዱን ሳንቲም እንቆጥራለን — ጓደኞቻችንን መቆጠር እንዳንፈልግ።»",
      cta: "ነፃ ይጀምሩ",
    },
    hero: {
      tagline: "Back Mes Do · ስደተኞች",
      headline: "የተጋራ ገንዘብ። የተጠበቀ ጓደኝነት።",
      subhead:
        "ቱንቲንስ፣ የጋራ ቤት፣ ጉዞ፣ ሰርግ፣ ቤተ ክርስቲያን፣ ክለቦች፡ BMD ሁሉንም ወጪዎች ያሰላል፣ ያቃልላል እና ይከታተላል።",
      ctaPrimary: "ነፃ ጀምር",
      ctaSecondary: "ማሳያ ይመልከቱ",
    },
    features: {
      title: "የሚያስፈልግዎት ሁሉ፣ ሌላ ነገር የለም",
      items: [
        { icon: "🪙", title: "ሙሉ ቱንቲንስ", body: "ዙር፣ የተጠቃሚዎች ቅደም ተከተል፣ ሊስተካከል የሚችል ቀኖች።" },
        { icon: "💸", title: "የተጋሩ ወጪዎች", body: "እኩል፣ በከፊል ወይም በመቶኛ። ሁሉም አባላት የሚታዩ ደረሰኞች።" },
        { icon: "↔", title: "የዕዳ መለዋወጥ", body: "በሶስቱ ወገኖች ማረጋገጫ ዕዳን ማቃለል ወይም ማስተላለፍ።" },
        { icon: "🔔", title: "ሙሉ ማሳወቂያዎች", body: "የሚመለከትዎት ክስተት ሁሉ ማሳወቂያ ይፈጥራል።" },
        { icon: "📷", title: "የደረሰኝ OCR", body: "ፎቶ ይቅረጹ፡ መጠን፣ ነጋዴ፣ ቀን በራስ-ሰር ይታወቃል።" },
        { icon: "🛡", title: "GDPR እና ግላዊነት", body: "የአድራሻ ደብተር በብዛት አይነበብም። ግልጽ ስምምነት።" },
      ],
    },
    howItWorks: {
      title: "በሶስት ደረጃ",
      steps: [
        { num: "1", title: "ቡድንዎን ይፍጠሩ", body: "ቱንቲን፣ የጋራ ቤት፣ ጉዞ…ዓይነት እና ምንዛሬ ይምረጡ።" },
        { num: "2", title: "ጓደኞችዎን ይጋብዙ", body: "ሊጋራ የሚችል አገናኝ፣ QR ኮድ ወይም የስልክ እውቂያዎች።" },
        { num: "3", title: "በሰላም ይኑሩ", body: "ወጪዎችን፣ መዋጮዎችን ይጨምሩ። BMD ቀሪዎችን ያሰላል።" },
      ],
    },
    pricing: {
      title: "ለአብዛኛው ሰው ነፃ",
      free: {
        name: "ነፃ",
        price: "$0",
        features: ["እስከ 3 ንቁ ቡድኖች", "ያልተገደበ ቱንቲን፣ ወጪ", "PDF/ፎቶ ደረሰኞች", "ሙሉ ማሳወቂያዎች"],
      },
      pro: {
        name: "Pro",
        price: "$4.99 / ወር",
        features: ["ያልተገደበ ቡድኖች", "ዝርዝር የሂሳብ ኤክስፖርት", "የ10 ዓመት ታሪክ", "የቅድሚያ ድጋፍ"],
        cta: "በቅርብ",
      },
    },
    faq: {
      title: "ተደጋጋሚ ጥያቄዎች",
      items: [
        { q: "BMD ባንክ ነው?", a: "አይደለም። BMD የጋራ አስተዳደር መሳሪያ ነው። ክፍያዎች በመደበኛ መንገዶችዎ ይከናወናሉ።" },
        { q: "የእኔ መረጃ ደህንነቱ የተጠበቀ ነው?", a: "አዎ። ግንኙነቶችን እናመስጥራለን፣ ያለ ግልጽ ስምምነት የአድራሻ ደብተርዎን አንደነግርም።" },
        { q: "የBMD ቱንቲን እንዴት ይሰራል?", a: "ቡድኑን ይፍጠሩ፣ መጠን እና ድግግሞሽ ያዘጋጁ። በእያንዳንዱ ዙር፣ ተጠቃሚው ትክክለኛ ቀን ይመርጣል።" },
      ],
    },
    featuresLong: {
      intro: "BMD በቅርብ ሰዎች መካከል ገንዘብ የሚዘዋወረውን ሁሉንም ሁኔታዎች ይሸፍናል፡ ቱንቲኖች፣ የጋራ ቤቶች፣ ጉዞዎች፣ ሰርጎች፣ አብያተ ክርስቲያናት፣ ክለቦች፣ ቡድኖች።",
      categories: [
        { key: "groups", icon: "👥", label: "ቡድኖች እና ሚናዎች", pitch: "በ30 ሰከንድ ውስጥ ትክክለኛውን የቡድን ዓይነት ይፍጠሩ።",
          items: [
            { icon: "🎭", title: "6 አስቀድሞ የተወሰኑ ዓይነቶች", body: "ቱንቲን · የጋራ ቤት · ጉዞ · ዝግጅት · ክለብ · አብያተ ክርስቲያን።" },
            { icon: "🛡", title: "ግልጽ ሚናዎች", body: "አስተዳዳሪ፣ ካዝና፣ አባል። ሁሉም ሊከታተል ይችላል።" },
            { icon: "✉️", title: "ባለ ብዙ ቻናል ግብዣዎች", body: "ሊጋራ የሚችል አገናኝ፣ QR፣ ስልክ።" },
            { icon: "🎨", title: "ለማህበረሰብ ጭብጥ", body: "የቡድንዎን ምስላዊ ማንነት ይምረጡ።" },
          ],
        },
        { key: "expenses", icon: "💸", label: "የተጋራ ወጪዎች", pitch: "ወጪ መመዝገብ 5 ሰከንድ ብቻ ይፈጃል።",
          items: [
            { icon: "📷", title: "የደረሰኝ OCR", body: "ፎቶ፡ መጠን፣ ነጋዴ፣ ቀን በራስ-ሰር ይታወቃል።" },
            { icon: "⚖️", title: "እኩል · ድርሻ · በመቶኛ", body: "በ1 ጠቅታ እኩል፣ ወይም በመቶኛ።" },
            { icon: "🤖", title: "AI ጥቆማ", body: "BMD ልምድዎን ይማራል።" },
            { icon: "📜", title: "በምድብ ደንቦች", body: "አንዴ ይፍጠሩ፣ BMD ሁሌም ይተግብራል።" },
            { icon: "🚨", title: "ያልተለመደ መመዝገብ", body: "ድግግሞሽ፣ ያልተለመደ ድምር።" },
            { icon: "🏦", title: "ባንክ CSV", body: "ሂሳብዎን ያስገቡ።" },
          ],
        },
        { key: "tontines", icon: "🪙", label: "ቱንቲኖች", pitch: "ሁሉም ሞዴሎች ይደገፋሉ።",
          items: [
            { icon: "🔄", title: "ሙሉ በራስ-ሰር ዑደት", body: "መጠን፣ ድግግሞሽ፣ ቅደም ተከተል ይግለጹ።" },
            { icon: "🤝", title: "ድርብ ማረጋገጫ", body: "ከፋይ ያውጃል፣ ካዝና ያረጋግጣል።" },
            { icon: "📅", title: "የቀን መቁጠሪያ እይታ", body: "ሁሉም ዙሮች በዓይን ይታያሉ።" },
            { icon: "🎯", title: "ጨረታዎች (Hui)", body: "ለቻይና ማህበረሰቦች።" },
            { icon: "📚", title: "ብዙ ዓመት ታሪክ", body: "ቢያንስ 5 ዓመታት።" },
          ],
        },
        { key: "settle", icon: "↔", label: "ሚዛን እና ሰፈራ", pitch: "BMD አነስተኛ ግብይቶች ያሰላል።",
          items: [
            { icon: "🧮", title: "በቅጽበት ሚዛን", body: "ብዙ ምንዛሬ፣ ቅጽበታዊ ስሌት።" },
            { icon: "🎯", title: "ምርጥ ሰፈራ", body: "1 ግብይት ከ2-3 ይልቅ።" },
            { icon: "🔁", title: "የዕዳ መለዋወጥ", body: "የ3 ወገን ማረጋገጫ።" },
            { icon: "🔗", title: "የአንድ ጊዜ የክፍያ አገናኝ", body: "ደህንነቱ የተጠበቀ አገናኝ።" },
          ],
        },
        { key: "money", icon: "💱", label: "ብዙ ምንዛሬ", pitch: "BMD ለስደተኞች የተሰራ።",
          items: [
            { icon: "🌍", title: "25+ ምንዛሬዎች", body: "ዩሮ፣ ዶላር፣ ብር፣ ናይራ፣ ዲርሃም።" },
            { icon: "💳", title: "ከመሳሪያዎችዎ ጋር ተኳሃኝ", body: "Lydia, Wave, Wise, SEPA, PayPal, TeleBirr።" },
            { icon: "📈", title: "በቅጽበት መለወጥ", body: "በራስዎ ምንዛሬ ይታያል።" },
            { icon: "🧾", title: "የቀረጥ ደረሰኝ", body: "ለአብያተ ክርስቲያናት፣ ማህበራት።" },
          ],
        },
        { key: "comms", icon: "🔔", label: "ግንኙነት", pitch: "ሁሉም በማሳወቂያዎች።",
          items: [
            { icon: "🛎", title: "ጥሩ ማሳወቂያዎች", body: "የሚመለከትዎትን ብቻ።" },
            { icon: "📅", title: "ሳምንታዊ ማጠቃለያ", body: "እያንዳንዱ እሁድ ምሽት።" },
            { icon: "💬", title: "WhatsApp ቦት", body: "በድምጽ ወይም ጽሑፍ።" },
            { icon: "😊", title: "የሚመረጥ ቃና", body: "ወዳጃዊ፣ ጥብቅ፣ ቀልድ፣ ሙያዊ።" },
            { icon: "🌙", title: "ቡድን ጸጥ ያድርጉ", body: "ለ1ሰ፣ 24ሰ።" },
          ],
        },
        { key: "intelligence", icon: "🧠", label: "AI እና ራስ-ሰር", pitch: "BMD AI ይጠቀማል።",
          items: [
            { icon: "🎙", title: "Whisper የድምጽ ግብዓት", body: "BMD ይጽፋል፣ ይረዳል።" },
            { icon: "📊", title: "ስታቲስቲክስ", body: "ወርሃዊ አዝማሚያዎች።" },
            { icon: "🌐", title: "ራስ-ሰር ትርጉም", body: "BMD በራስ-ሰር ይተረጉማል።" },
            { icon: "🔮", title: "ያልተለመዱ", body: "BMD ድራማ ሳይፈጠር ያስጠነቅቃል።" },
          ],
        },
        { key: "trust", icon: "🛡", label: "ደህንነት", pitch: "GDPR by design።",
          items: [
            { icon: "🔑", title: "ያለ ይለፍ ቃል መግባት", body: "OTP በSMS, ኢሜል, WhatsApp።" },
            { icon: "🚫", title: "ዝርዝር ማንበብ የለም", body: "የመረጡት ብቻ ይተላለፋል።" },
            { icon: "📜", title: "የማይቀየር መዝገብ", body: "5 ዓመታት ይቆያል።" },
            { icon: "🇪🇺", title: "ሙሉ GDPR", body: "JSON/CSV ላክ፣ በ30 ቀን መሰረዝ።" },
            { icon: "🌐", title: "የEU አስተናጋጅ", body: "በEU ክልል።" },
          ],
        },
        { key: "platform", icon: "📱", label: "መድረኮች", pitch: "በስልክ እውነተኛ ተወላጅ መተግበሪያ።",
          items: [
            { icon: "📲", title: "ሊጫን የሚችል PWA", body: "በiPhone, Android, ዴስክቶፕ።" },
            { icon: "💬", title: "WhatsApp ቦት", body: "በ30 ሰከንድ።" },
            { icon: "🌍", title: "ብዙ ቋንቋ", body: "ለሚፈልጉት ቋንቋ።" },
            { icon: "♿", title: "WCAG 2.1 AA", body: "የተረጋገጠ ንጽጽር።" },
            { icon: "🌗", title: "ብርሃን / ጨለማ ሁነታ", body: "በ☀️/🌙 አዶ።" },
          ],
        },
      ],
    },
    referral: {
      kicker: "የሽያጭ ፕሮግራም",
      title: "BMD ይምከሩ፣ በእያንዳንዱ ምዝገባ ያግኙ",
      intro: "BMD ቀላል የሪፈራል ፕሮግራም አለው — ደረጃ የለም፣ ፒራሚድ የለም።",
      benefits: [
        { icon: "💰", title: "ቀጥተኛ ኮሚሽን", body: "በወር 20% በተጠቃሚዎችዎ።" },
        { icon: "♾️", title: "ለሕይወት ተደጋጋሚ", body: "ምዝገባቸውን እስከያቆዩ ድረስ።" },
        { icon: "📊", title: "የተወሰነ ዳሽቦርድ", body: "ግልጽ መገናኛ።" },
        { icon: "🎁", title: "ለተጋባዣ ቦነስ", body: "ቅናሽ ያገኛል።" },
      ],
      howItWorks: [
        { num: "1", title: "ሽያጭ ቦታ ያነቃቁ", body: "መገለጫ → ሽያጭ ቦታ።" },
        { num: "2", title: "ከአውታረ መረብዎ ጋር ያጋሩ", body: "ለቤተ ክርስቲያን፣ ክለብ።" },
        { num: "3", title: "ምዝገባ ይከታተሉ", body: "በቅጽበት ይታያል።" },
        { num: "4", title: "ኮሚሽን ያግኙ", body: "ራስ-ሰር በወር መጀመሪያ።" },
      ],
      cta: { label: "ፕሮግራም ይወቁ", href: "/dashboard/affiliate" },
      smallPrint: "አንድ ደረጃ ብቻ፣ ቋሚ እና ግልጽ ኮሚሽን።",
    },
    faqLong: {
      intro: "በብዛት የሚጠየቁ ጥያቄዎች።",
      categories: [
        { key: "basics", icon: "👋", label: "መሰረታዊ", items: [
          { q: "BMD በአንድ ዓረፍተ ነገር?", a: "ቡድኖችን እንዲያስተዳድሩ የሚረዳ መተግበሪያ።" },
          { q: "BMD ባንክን ይተካል?", a: "አይደለም።" },
          { q: "ምን ያህል ያስወጣል?", a: "ነፃ ለ3 ቡድኖች። Pro $4.99/ወር።" },
          { q: "በየትኞቹ መሣሪያዎች?", a: "iPhone (iOS 15+)፣ Android (9+)።" },
          { q: "ሁሉም መመዝገብ አለባቸው?", a: "ወዲያውኑ አይደለም።" },
        ]},
        { key: "groups", icon: "👥", label: "ቡድኖች", items: [
          { q: "ምን ዓይነት ቡድኖች?", a: "6 ዓይነቶች።" },
          { q: "ከፍተኛ መጠን?", a: "ጥብቅ ገደብ የለም።" },
          { q: "እንዴት እጋብዛለሁ?", a: "ሊንክ፣ QR፣ እውቂያዎች።" },
          { q: "አባል ማስወገድ ይቻላል?", a: "አዎ።" },
          { q: "እንግዶች ሌሎች ቡድኖቼን ያያሉ?", a: "ፈጽሞ።" },
        ]},
        { key: "tontines", icon: "🪙", label: "ቱንቲኖች", items: [
          { q: "ቱንቲን እንዴት ይሰራል?", a: "መጠን እና ድግግሞሽ ያዘጋጁ።" },
          { q: "በbamileke, hui, susu መካከል ልዩነት?", a: "ተመሳሳይ መርህ።" },
          { q: "ካልከፈሉ?", a: "ራስ-ሰር ማስታወሻ።" },
          { q: "ለብዙ ዓመታት?", a: "5 ዓመታት ቢያንስ።" },
        ]},
        { key: "money", icon: "💱", label: "ምንዛሬ", items: [
          { q: "ምን ምንዛሬዎች?", a: "25+ ንቁ።" },
          { q: "መለወጥ?", a: "በራስዎ ምንዛሬ።" },
          { q: "BMD ኮሚሽን ይወስዳል?", a: "ፈጽሞ።" },
          { q: "ምን የክፍያ ዘዴዎች?", a: "ሁሉም።" },
          { q: "የBMD እቅድ?", a: "Stripe Checkout።" },
        ]},
        { key: "expenses", icon: "💸", label: "ወጪዎች", items: [
          { q: "ደረሰኝ መቅረጽ?", a: "ፎቶ ወይም PDF።" },
          { q: "ማን ሊያስተካክል ይችላል?", a: "ፈጣሪ እና አስተዳዳሪ ብቻ።" },
          { q: "በእኩል አለመከፋፈል?", a: "3 ሁነታዎች።" },
          { q: "ድግግሞሽ ይታወቃል?", a: "አዎ ራስ-ሰር።" },
          { q: "ባንክ ማስገባት ይቻላል?", a: "አዎ CSV።" },
        ]},
        { key: "settle", icon: "↔", label: "ሚዛን", items: [
          { q: "BMD እንዴት ያሰላል?", a: "አነስተኛ ፍሰት።" },
          { q: "ዕዳ መለዋወጥ?", a: "የ3 ወገን ማረጋገጫ።" },
          { q: "እንደተከፈለ ምልክት?", a: "ሰፈራ → ይምረጡ።" },
          { q: "ካልተቀበሉ?", a: "ሁለቱም ወገኖች ማረጋገጥ ይኖርባቸዋል።" },
        ]},
        { key: "privacy", icon: "🛡", label: "ግላዊነት", items: [
          { q: "መረጃዬ ደህንነቱ የተጠበቀ?", a: "አዎ TLS 1.3።" },
          { q: "ያለ ይለፍ ቃል እንዴት?", a: "OTP በSMS።" },
          { q: "passkey ምንድን ነው?", a: "ባዮሜትሪክ።" },
          { q: "BMD እውቂያዎችን ያነባል?", a: "ፈጽሞ በብዛት።" },
          { q: "መለያዬን መሰረዝ?", a: "አዎ።" },
          { q: "መረጃ ላክ?", a: "አዎ JSON/CSV።" },
        ]},
        { key: "billing", icon: "💳", label: "ክፍያ", items: [
          { q: "ነፃ?", a: "3 ቡድኖች።" },
          { q: "Pro?", a: "ያልተገደበ።" },
          { q: "Event $29?", a: "ለትላልቅ ዝግጅቶች።" },
          { q: "መሰረዝ?", a: "በማንኛውም ጊዜ።" },
          { q: "ዋጋ በአገር?", a: "አዎ።" },
          { q: "ሪፈራል?", a: "20% ለሕይወት።" },
        ]},
      ],
      contactNudge: "ለ hello@backmesdo.com ይጻፉ።",
    },
    cta: {
      headline: "አሁን ይጀምሩ",
      body: "ነፃ። ካርድ የለም። ከአንድ ደቂቃ ባነሰ ጊዜ ውስጥ ይመዝገቡ።",
      button: "መለያዬን ፍጠር",
    },
    footer: {
      tagline: "የተጋራ ገንዘብ። የተጠበቀ ጓደኝነት።",
      rights: "ሁሉም መብቶች የተጠበቁ ናቸው።",
      privacy: "ግላዊነት",
      terms: "ውሎች",
      contact: "አግኙን",
    },
  },
  // Lingála — RDC, Congo-Brazzaville, diaspora belge & française
  ln: {
    meta: {
      title: "BMD · Mbongo ya kosangana, kimia",
      description:
        "BMD esalisaka diaspora ya Afrika kosalela tontines, kofuta etônga, mibembo mpe milulu — polele, sembo, kimia.",
    },
    nav: {
      story: "Lisapo na biso",
      features: "Makoki",
      howItWorks: "Ndenge esalemaka",
      pricing: "Mbongo",
      login: "Kokota",
      signUp: "Komikomisa",
    },
    langPicker: { main: "Minoko ya minene", europeanGroup: "Minoko ya Mpoto", asianGroup: "Minoko ya Asia", arabicGroup: "Minoko ya Arabe", africanGroup: "Minoko ya Afrika" },
    story: {
      kicker: "Lisapo na biso",
      title: "Mbongo esengeli te kobomba boninga",
      punchline: "Biso nyonso tomoná butu wana oyo restaurant ekómaka tribunal. Tontine wana oyo moto te ayebaki naa nani afutaki. Mobembo na bandeko ya bompika oyo esukaki na groupe WhatsApp ya malili.",
      chapters: [
        { icon: "🌍", title: "Mokakatano", body: "Inflation eliaka nyonso. Mbongo ya bomoi ekómi ndenge na Europe, na Cameroun, na Dakar, na Mumbai. Euro nyonso ezali na ntina." },
        { icon: "💔", title: "Tension", body: "Excel ezali pasi mpo ya kotanga. WhatsApp eyebanaka te. Apps ya Mpoto ezali kososola te tontines, franc CFA." },
        { icon: "🕊", title: "Solution", body: "BMD. Esaleli mpo na bato ya solo basangani mbongo na bango. Multi-mbongo (25+), multi-lokota (20+), tontines, swap nyongo, OCR, bot WhatsApp." },
      ],
      manifesto: "«Tozali kotanga centime nyonso — mpo ete tózwa mokolo te ya kotanga baninga na biso.»",
      cta: "Banda ofele",
    },
    hero: {
      tagline: "Back Mes Do · Diaspora",
      headline: "Mbongo ya kosangana. Boninga ya kobatela.",
      subhead:
        "Tontines, kofuta etônga, mibembo, libala, paroisses, club: BMD eyebanaka, esimbaka mpe etalaka mbongo nyonso, mpo moto moko te ayoka mawa.",
      ctaPrimary: "Kobanda ya ofele",
      ctaSecondary: "Tala demo",
    },
    features: {
      title: "Nyonso oyo osengeli, eleki te",
      items: [
        { icon: "🪙", title: "Tontines mobimba", body: "Tango, molongo ya bato, mikolo, kondima ya bofuti, lisolo ya bambula." },
        { icon: "💸", title: "Kofuta esangani", body: "Pakola, motángo to pourcentage. Justificatif na photo to PDF." },
        { icon: "↔", title: "Échange ya nyongo", body: "Kosukisa to kotinda nyongo na kondima ya bato nyonso." },
        { icon: "🔔", title: "Notifications ebongi", body: "Likambo nyonso ya ntina ekobenda notification. Anti-spam." },
        { icon: "📷", title: "OCR ya tickets", body: "Skanela photo: motángo, vendeur, mokolo eyebana ye moko." },
        { icon: "🛡", title: "RGPD & vie privée", body: "Tozali kotala carnet ya bato te. Kondima ya polele." },
      ],
    },
    howItWorks: {
      title: "Bitéma misato",
      steps: [
        { num: "1", title: "Salá groupe na yo", body: "Tontine, kofuta etônga, mobembo, libala… Poná lolenge mpe mbongo." },
        { num: "2", title: "Bénga baninga", body: "Lien, QR-code to numéro (na kondima na yo)." },
        { num: "3", title: "Vivá na kimia", body: "Bakisa mbongo, contributions, échanges. BMD eyebanaka mpe epesaka likanisi ya kosukisa." },
      ],
    },
    pricing: {
      title: "Ya ofele mpo na mingi",
      free: {
        name: "Ofele",
        price: "0 €",
        features: ["Groupes 3 actifs", "Tontines, mbongo, échanges sans suka", "Justificatifs PDF/photo", "Notifications mobimba"],
      },
      pro: {
        name: "Pro",
        price: "2,99 € / sanza",
        features: ["Groupes sans suka", "Export comptable", "Lisolo ya 10 ans", "Lisalisi ya liboso"],
        cta: "Eyei kala te",
      },
    },
    faq: {
      title: "Mituna oyo bato batunaka",
      items: [
        { q: "BMD ezali banque?", a: "Te. BMD ezali esaleli ya kosangana. Bofuti ekosalema na nzela ya bino." },
        { q: "Mbongo na ngai ezali na sécurité?", a: "Iyo. Tozali kobomba na chiffrement, mpe totalaka carnet ya bino te." },
        { q: "Tontine ya BMD esalemi ndenge nini?", a: "Osali groupe, otia motángo na fréquence. Mbala na mbala, moto oyo akozwa aponaka mokolo, bato nyonso bandimi." },
      ],
    },
    featuresLong: {
      intro: "BMD ezali kosalisa makambo nyonso oyo mbongo etambolaka kati na bato ya kosangana: tontines, ndako esangani, mibembo, libala, paroisses, club.",
      categories: [
        { key: "groups", icon: "👥", label: "Groupes mpe rôles", pitch: "Salá lolenge ya groupe na minute 30.",
          items: [
            { icon: "🎭", title: "6 ndenge ya groupes", body: "Tontine · Ndako · Mobembo · Likita · Club · Paroisse." },
            { icon: "🛡", title: "Bilembo ya polele", body: "Chef, banzelo, membre. Nyonso ekoyebana." },
            { icon: "✉️", title: "Babiénga", body: "Lien, QR, numero (na kondima na yo)." },
            { icon: "🎨", title: "Komonisi ya groupe", body: "Poná elilingi ya groupe na yo." },
          ],
        },
        { key: "expenses", icon: "💸", label: "Mbongo ya kofutela", pitch: "Kobakisa mbongo esengeli kosala 5 segondes.",
          items: [
            { icon: "📷", title: "OCR ya tickets", body: "Foto rek, BMD eyebanaka." },
            { icon: "⚖️", title: "Pakola · way · pourcent", body: "Pakola na 1 click, way ya bopɛto, to pourcent." },
            { icon: "🤖", title: "Likanisi AI", body: "BMD eyekolaka mpe epesaka likanisi." },
            { icon: "📜", title: "Mibeko ya catégorie", body: "Salá mibeko mbala moko, BMD ekosalela ko." },
            { icon: "🚨", title: "Komona makambo ya bizali te", body: "Doublons, mbongo ya bizali te." },
            { icon: "🏦", title: "Import CSV ya banque", body: "BMD ekoyebanaka." },
          ],
        },
        { key: "tontines", icon: "🪙", label: "Tontines", pitch: "Ndenge nyonso ya kobomba mbongo.",
          items: [
            { icon: "🔄", title: "Cycle ya auto", body: "Defar mbongo, fréquence." },
            { icon: "🤝", title: "Validation ya double", body: "Mofutaki adeklare, banzelo akondima." },
            { icon: "📅", title: "Calendrier", body: "Ba tours nyonso emonisamaka." },
            { icon: "🎯", title: "Auctions (Hui)", body: "Mpo na bato ya Chinois." },
            { icon: "📚", title: "Histoire ya bambula", body: "Mbula 5 mpenza." },
          ],
        },
        { key: "settle", icon: "↔", label: "Soldes mpe bofuti", pitch: "BMD eyebanaka transactions ya moke.",
          items: [
            { icon: "🧮", title: "Soldes ya tango", body: "Multi-mbongo, recalcul mbala moko." },
            { icon: "🎯", title: "Bofuti ya malamu", body: "1 transaction na esika ya 2-3." },
            { icon: "🔁", title: "Échange ya nyongo", body: "3-yoon validation." },
            { icon: "🔗", title: "Liens ya 1-yoon", body: "Liens ya sécurité." },
          ],
        },
        { key: "money", icon: "💱", label: "Multi-mbongo", pitch: "BMD esalami mpo na diaspora.",
          items: [
            { icon: "🌍", title: "25+ ya mbongo", body: "Euro, Dollar, FCFA…" },
            { icon: "💳", title: "Outils na bino", body: "Lydia, Wave, Wise, MoMo, SEPA." },
            { icon: "📈", title: "Conversion na tango", body: "Membre nyonso amonaka na mbongo na ye." },
            { icon: "🧾", title: "Reçus fiscaux", body: "Mpo na paroisses, asociations." },
          ],
        },
        { key: "comms", icon: "🔔", label: "Communication", pitch: "Nyonso ezali via notifications.",
          items: [
            { icon: "🛎", title: "Notifications ya leer", body: "Kaka oyo etali yo." },
            { icon: "📅", title: "Récap ya pɔsɔ", body: "Lomingo nyonso." },
            { icon: "💬", title: "Bot WhatsApp", body: "Bakisa mbongo na vocal." },
            { icon: "😊", title: "Ton oyo opondi", body: "Sympa, fim, humoris, pro." },
            { icon: "🌙", title: "Bul stuf ya groupe", body: "Stuf 1h, 24h." },
          ],
        },
        { key: "intelligence", icon: "🧠", label: "AI", pitch: "BMD esaleli AI mpo na suppress papier.",
          items: [
            { icon: "🎙", title: "Whisper", body: "BMD etranskribelaka." },
            { icon: "📊", title: "Stats", body: "Évolution ya sanza." },
            { icon: "🌐", title: "Tradiksioon auto", body: "BMD etradiksionalaka." },
            { icon: "🔮", title: "Bizali te", body: "BMD ekokebisa." },
          ],
        },
        { key: "trust", icon: "🛡", label: "Sécurité", pitch: "GDPR by design.",
          items: [
            { icon: "🔑", title: "Kokota sans password", body: "OTP." },
            { icon: "🚫", title: "Carnet te", body: "Kaka oyo opondi." },
            { icon: "📜", title: "Bind ya sécurité", body: "Mbula 5." },
            { icon: "🇪🇺", title: "GDPR", body: "Export, suppression 30 mikolo." },
            { icon: "🌐", title: "Hosting EU", body: "Server na EU." },
          ],
        },
        { key: "platform", icon: "📱", label: "Plateformes", pitch: "App ya solo na téléphone.",
          items: [
            { icon: "📲", title: "PWA", body: "iPhone, Android, desktop." },
            { icon: "💬", title: "Bot WhatsApp", body: "30 segondes." },
            { icon: "🌍", title: "Lakk ebele", body: "Interface eyei na lakk na yo." },
            { icon: "♿", title: "WCAG 2.1 AA", body: "Contraste validé." },
            { icon: "🌗", title: "Mode malamu / molili", body: "1 click ☀️/🌙." },
          ],
        },
      ],
    },
    referral: {
      kicker: "Programme commercial",
      title: "Recommander BMD, kozua mbongo na chaque abonnement",
      intro: "BMD ezali na programme ya rufaa ya pɛtɛɛ — niveau te, pyramide te.",
      benefits: [
        { icon: "💰", title: "Commission ya direct", body: "20% na mbongo ya sanza." },
        { icon: "♾️", title: "Mokolo na mokolo", body: "Awa moninga na yo azali client." },
        { icon: "📊", title: "Espace commercial", body: "Tableau ya polele." },
        { icon: "🎁", title: "Bonus ya filleul", body: "Reduction." },
      ],
      howItWorks: [
        { num: "1", title: "Tëgg espace", body: "Profil → Espace commercial." },
        { num: "2", title: "Wàcce", body: "Na paroisse, club, baninga." },
        { num: "3", title: "Toppal", body: "Inscription emonisamaka." },
        { num: "4", title: "Recevoir", body: "Mokolo 1 ya sanza." },
      ],
      cta: { label: "Talá programme", href: "/dashboard/affiliate" },
      smallPrint: "Niveau moko rekk, commission fixe.",
    },
    faqLong: {
      intro: "Mituna oyo bato batunaka mingi.",
      categories: [
        { key: "basics", icon: "👋", label: "Bibandeli", items: [
          { q: "BMD ezali nini?", a: "Application." },
          { q: "BMD ezali kozalisa banque?", a: "Te." },
          { q: "Combien?", a: "Ya ofele 3 groupes." },
          { q: "Quels appareils?", a: "iPhone, Android." },
          { q: "Bato nyonso?", a: "Mbala moko te." },
        ]},
        { key: "groups", icon: "👥", label: "Groupes", items: [
          { q: "Quels types?", a: "6 types." },
          { q: "Combien?", a: "Limit te." },
          { q: "Comment inviter?", a: "Lien, QR." },
          { q: "Retirer membre?", a: "Iyo." },
          { q: "Voir d'autres groupes?", a: "Te." },
        ]},
        { key: "tontines", icon: "🪙", label: "Tontines", items: [
          { q: "Comment marche?", a: "Mbongo na fréquence." },
          { q: "Différence?", a: "Même principe." },
          { q: "Si pas payé?", a: "Auto rappel." },
          { q: "Plusieurs ans?", a: "5 ans." },
        ]},
        { key: "money", icon: "💱", label: "Mbongo", items: [
          { q: "Quelles?", a: "25+." },
          { q: "Conversion?", a: "Auto." },
          { q: "Commission?", a: "Te." },
          { q: "Méthodes?", a: "Nyonso." },
          { q: "Plan BMD?", a: "Stripe." },
        ]},
        { key: "expenses", icon: "💸", label: "Mbongo", items: [
          { q: "Scanner?", a: "Foto." },
          { q: "Modifier?", a: "Sos rek." },
          { q: "Diviser?", a: "3 modes." },
          { q: "Doublons?", a: "Auto." },
          { q: "Importer?", a: "CSV." },
        ]},
        { key: "settle", icon: "↔", label: "Soldes", items: [
          { q: "Calcule?", a: "Min flux." },
          { q: "Échange?", a: "3 yoon." },
          { q: "Marquer payé?", a: "Soldes → Régler." },
          { q: "Disputes?", a: "2 yoon valid." },
        ]},
        { key: "privacy", icon: "🛡", label: "Sécurité", items: [
          { q: "Sécurité?", a: "TLS 1.3." },
          { q: "Sans password?", a: "OTP." },
          { q: "Passkey?", a: "Biométrique." },
          { q: "Carnet?", a: "Te." },
          { q: "Supprimer?", a: "Iyo." },
          { q: "Exporter?", a: "JSON/CSV." },
        ]},
        { key: "billing", icon: "💳", label: "Forfait", items: [
          { q: "Gratuit?", a: "3 groupes." },
          { q: "Pro?", a: "Sans limite." },
          { q: "Event?", a: "29€." },
          { q: "Annuler?", a: "Sans frais." },
          { q: "Pays?", a: "Iyo." },
          { q: "Rufaa?", a: "20% mokolo." },
        ]},
      ],
      contactNudge: "Komeli hello@backmesdo.com.",
    },
    cta: {
      headline: "Banda sik'oyo",
      body: "Ya ofele. Carte ya crédit te. Komikomisa na minute moko.",
      button: "Salá compte na ngai",
    },
    footer: {
      tagline: "Mbongo ya kosangana. Boninga ya kobatela.",
      rights: "Makoki nyonso ezali ya biso.",
      privacy: "Vie privée",
      terms: "Mibeko",
      contact: "Tobenga biso",
    },
  },
  // Pidgin / Bamiléké — Cameroun anglophone & diaspora West African
  pcm: {
    meta: {
      title: "BMD · Money for share, no wahala",
      description:
        "BMD dey help African diaspora arrange tontines, share house bills, manage trips and group events — clear, fair, no wahala.",
    },
    nav: {
      story: "Our story",
      features: "Wetin e fit do",
      howItWorks: "How e dey work",
      pricing: "Price",
      login: "Enter",
      signUp: "Make account",
    },
    langPicker: { main: "Main languages", europeanGroup: "European languages", asianGroup: "Asian languages", arabicGroup: "Arabic languages", africanGroup: "African languages" },
    story: {
      kicker: "Our story",
      title: "Money no suppose to cost friendship",
      punchline: "All of us don see that dinner where restaurant turn court. That tontine wey nobody know who don pay. That cousin trip wey end for cold WhatsApp group.",
      chapters: [
        { icon: "🌍", title: "The problem", body: "Inflation dey chop everything. Cost of life dey explode for Europe, Cameroon, Dakar, Mumbai. Every euro count — and every euro wey we no count well dey turn silence, vex, broken relationship." },
        { icon: "💔", title: "The tension", body: "Excel hard to read. WhatsApp no fit calculate. Western apps no understand tontines, CFA franc, or 6-person flat for Paris." },
        { icon: "🕊", title: "The solution", body: "BMD. Tool for those wey really dey share their money. Multi-currency (25+), multi-language (20+), tontines, debt swap, OCR, WhatsApp bot. No drama, no tracker, no advert." },
      ],
      manifesto: "«We dey count every kobo — so we no go ever count our friends.»",
      cta: "Start free",
    },
    hero: {
      tagline: "Back Mes Do · Diaspora",
      headline: "Money for share. Friendship for protect.",
      subhead:
        "Tontine, house, trip, wedding, parish, club: BMD dey count, dey simplify and dey track every expense, so nobody go feel say dem cheat am.",
      ctaPrimary: "Start free",
      ctaSecondary: "See demo",
    },
    features: {
      title: "Everything wey you need, no extra wahala",
      items: [
        { icon: "🪙", title: "Complete tontine", body: "Cycle, who go collect, dates, confirm payment, history for many years." },
        { icon: "💸", title: "Share expense", body: "Equal, fixed amount, or percent. Receipt for photo or PDF wey everybody fit see." },
        { icon: "↔", title: "Debt swap", body: "Cancel or transfer debts wit consent of all sides." },
        { icon: "🔔", title: "Smart notifications", body: "Every important thing dey send notification. Designed no go disturb." },
        { icon: "📷", title: "Receipt OCR", body: "Snap your receipt: amount, shop, date dey detect by demselves." },
        { icon: "🛡", title: "GDPR & privacy", body: "We no dey read your phone contacts secretly. Clear consent for everything." },
      ],
    },
    howItWorks: {
      title: "Three steps na im e be",
      steps: [
        { num: "1", title: "Create your group", body: "Tontine, house, trip, wedding… Choose type and currency." },
        { num: "2", title: "Invite your people", body: "Link wey you fit share, QR-code, or phone contact (wit consent)." },
        { num: "3", title: "Live free of wahala", body: "Add expenses, contributions, swaps. BMD dey calculate balance and propose better way to settle." },
      ],
    },
    pricing: {
      title: "Free for plenty people",
      free: {
        name: "Free",
        price: "€0",
        features: ["3 active groups maximum", "Unlimited tontines, expenses, swaps", "PDF/photo receipts", "All notifications"],
      },
      pro: {
        name: "Pro",
        price: "€2.99 / month",
        features: ["Unlimited groups", "Detailed accounting export", "10 years history", "Priority support"],
        cta: "Soon come",
      },
    },
    faq: {
      title: "Question wey people dey ask",
      items: [
        { q: "BMD na bank?", a: "No. BMD na tool wey dey help share. Payment go dey pass your normal channels." },
        { q: "My data safe?", a: "Yes. We dey encrypt communication, and we no dey read your contacts unless you say make we do am." },
        { q: "How tontine for BMD dey work?", a: "You create group, set amount and frequency. For every round, beneficiary dey choose date for the month, everybody confirm." },
      ],
    },
    featuresLong: {
      intro: "BMD dey cover any situation wey money dey move between people wey dey close: tontine, house wey una dey share, trip, wedding, parish, club.",
      categories: [
        { key: "groups", icon: "👥", label: "Group dem & roles", pitch: "Create di right group type for 30 seconds.",
          items: [
            { icon: "🎭", title: "6 ready-made types", body: "Tontine · House share · Trip · Event · Club · Parish/Association." },
            { icon: "🛡", title: "Clear roles", body: "Admin (rules), treasurer (payment), member (expense)." },
            { icon: "✉️", title: "Multi-channel invite", body: "Link, QR, phone contact (with consent)." },
            { icon: "🎨", title: "Community theme", body: "Choose visual identity for your group." },
          ],
        },
        { key: "expenses", icon: "💸", label: "Share expense", pitch: "To enter expense suppose take 5 seconds.",
          items: [
            { icon: "📷", title: "Receipt OCR", body: "Snap photo: amount, shop, date dey detect by demselves." },
            { icon: "⚖️", title: "Equal · share · percent", body: "1-click equal split, custom shares, exact percent." },
            { icon: "🤖", title: "AI suggestion", body: "BMD dey learn your habit and suggest correct mode." },
            { icon: "📜", title: "Category rules", body: "Make di rule once, BMD go apply am every time." },
            { icon: "🚨", title: "Anomaly detection", body: "Duplicate, strange amount: warn before validation." },
            { icon: "🏦", title: "Bank CSV import", body: "Import your statement, BMD go suggest categorization." },
          ],
        },
        { key: "tontines", icon: "🪙", label: "Tontine & cycle", pitch: "All rotating savings model dey supported, with 4-eye validation.",
          items: [
            { icon: "🔄", title: "Full auto cycle", body: "Set amount, frequency, beneficiary order." },
            { icon: "🤝", title: "Double validation", body: "Payer declare, treasurer confirm." },
            { icon: "📅", title: "Calendar view", body: "All future rounds visible." },
            { icon: "🎯", title: "Auctions (Hui)", body: "For Chinese community." },
            { icon: "📚", title: "Multi-year history", body: "5 years minimum, immutable log." },
          ],
        },
        { key: "settle", icon: "↔", label: "Balance & settle", pitch: "BMD dey calculate minimum number of transaction.",
          items: [
            { icon: "🧮", title: "Real-time balance", body: "Multi-currency global balance, instant recalc." },
            { icon: "🎯", title: "Optimal settle", body: "Minimum cash flow algorithm: 1 transaction instead of 2-3." },
            { icon: "🔁", title: "Debt swap", body: "3-way validation against fraud." },
            { icon: "🔗", title: "One-time pay link", body: "Generate secure link to receive payment." },
          ],
        },
        { key: "money", icon: "💱", label: "Multi-currency", pitch: "BMD na for diaspora.",
          items: [
            { icon: "🌍", title: "25+ currency live", body: "Euro, Naira, Dollar, CFA franc…" },
            { icon: "💳", title: "Compatible with your tools", body: "Lydia, Wave, MoMo, Wise, SEPA, PayPal. BMD no dey replace, e dey record." },
            { icon: "📈", title: "Real-time conversion", body: "XAF expense go appear for everybody for THEIR default currency." },
            { icon: "🧾", title: "Tax receipt", body: "For parish, association, sports club." },
          ],
        },
        { key: "comms", icon: "🔔", label: "Communication", pitch: "Everything dey driven by notification.",
          items: [
            { icon: "🛎", title: "Granular notification", body: "You go only get notify of wetin concern YOU." },
            { icon: "📅", title: "Weekly summary", body: "Every Sunday evening, clear recap." },
            { icon: "💬", title: "WhatsApp bot", body: "Add expense by voice or text message." },
            { icon: "😊", title: "Choose tone", body: "Friendly, firm, humorous, professional." },
            { icon: "🌙", title: "Per-group DND", body: "Mute group for 1h, 24h, until tomorrow." },
          ],
        },
        { key: "intelligence", icon: "🧠", label: "AI & automation", pitch: "BMD dey use AI to remove paperwork.",
          items: [
            { icon: "🎙", title: "Whisper voice input", body: "BMD go transcribe, understand, file am." },
            { icon: "📊", title: "Stats & insights", body: "Monthly trends, category breakdown." },
            { icon: "🌐", title: "Auto-translation", body: "BMD go translate admin content automatic." },
            { icon: "🔮", title: "Anomaly & duplicate", body: "BMD go warn before any wahala start." },
          ],
        },
        { key: "trust", icon: "🛡", label: "Privacy", pitch: "GDPR by design.",
          items: [
            { icon: "🔑", title: "No password sign-in", body: "OTP via SMS, email or WhatsApp. Passkeys." },
            { icon: "🚫", title: "No bulk address book read", body: "Only contacts wey you select dem dey transmit." },
            { icon: "📜", title: "Immutable audit log", body: "Sensitive operations append-only, signed, kept 5 years." },
            { icon: "🇪🇺", title: "Full GDPR", body: "JSON/CSV export, deletion within 30 days." },
            { icon: "🌐", title: "EU hosting", body: "Database & server for EU region." },
          ],
        },
        { key: "platform", icon: "📱", label: "Platforms", pitch: "Real native app for phone, real web portal for PC.",
          items: [
            { icon: "📲", title: "Installable PWA", body: "On iPhone, Android, desktop." },
            { icon: "💬", title: "WhatsApp bot", body: "Connect your WhatsApp number for 30s." },
            { icon: "🌍", title: "Multi-language", body: "Interface go adapt to your preferred language." },
            { icon: "♿", title: "WCAG 2.1 AA", body: "Validated contrast, keyboard navigation." },
            { icon: "🌗", title: "Light / dark mode", body: "1-click toggle from ☀️/🌙 icon." },
          ],
        },
      ],
    },
    referral: {
      kicker: "Sales program",
      title: "Recommend BMD, earn for every subscription",
      intro: "BMD get simple referral program — no levels, no pyramid. Every signup wey turn paying go give you commission for life.",
      benefits: [
        { icon: "💰", title: "Direct commission", body: "20% of monthly amount paid by your referrals. Pay 1st of every month." },
        { icon: "♾️", title: "Recurring for life", body: "As long as your referee dey subscribed, you dey earn." },
        { icon: "📊", title: "Dedicated sales space", body: "Clear dashboard: who signup via you, MRR, projected revenue." },
        { icon: "🎁", title: "Bonus for referee", body: "Your referee go get discount too." },
      ],
      howItWorks: [
        { num: "1", title: "Activate sales space", body: "Profile → Sales space → 'Activate'." },
        { num: "2", title: "Share with your network", body: "To your parish, club, diaspora friends." },
        { num: "3", title: "Track signups", body: "Every click and conversion show real-time." },
        { num: "4", title: "Receive commission", body: "Auto payout 1st of every month (from 25€)." },
      ],
      cta: { label: "Discover program", href: "/dashboard/affiliate" },
      smallPrint: "No levels, no pyramid marketing. Just one level, fixed and transparent commission.",
    },
    faqLong: {
      intro: "Questions wey we hear most. If you no find your answer, write hello@backmesdo.com.",
      categories: [
        { key: "basics", icon: "👋", label: "Basics", items: [
          { q: "Wetin be BMD for one sentence?", a: "App wey dey help group manage shared money no wahala." },
          { q: "BMD go replace my bank?", a: "No. BMD no dey move money. You go continue use your normal channels." },
          { q: "How much e dey cost?", a: "Free plan: 3 active groups. Pro €4.99/month. Event plan €29 one-shot." },
          { q: "Wetin device e dey work for?", a: "iPhone (iOS 15+), Android (9+), any modern computer." },
          { q: "All my people need register?", a: "Not immediately. You fit create group with 'shadow profile'." },
        ]},
        { key: "groups", icon: "👥", label: "Groups", items: [
          { q: "Wetin types?", a: "6 types: Tontine, House, Trip, Event, Club, Parish." },
          { q: "Maximum size?", a: "No hard limit. We get parish wey get 300+ member." },
          { q: "How invite?", a: "Link, QR, contacts (with consent)." },
          { q: "Remove member?", a: "Yes, admin fit remove anytime." },
          { q: "Guest see other groups?", a: "Never. Each group sealed." },
        ]},
        { key: "tontines", icon: "🪙", label: "Tontine", items: [
          { q: "How tontine for BMD work?", a: "Create group, set amount and frequency." },
          { q: "Difference?", a: "Same principle, different order. BMD support all." },
          { q: "Somebody no pay?", a: "Auto reminder for your chosen tone." },
          { q: "Multi year?", a: "5 years minimum, Excel export anytime." },
        ]},
        { key: "money", icon: "💱", label: "Currency", items: [
          { q: "Wetin currencies BMD support?", a: "25+ active. Rates refresh hourly." },
          { q: "How conversion work?", a: "Each member see amount for HER default currency." },
          { q: "BMD take commission?", a: "Never." },
          { q: "Wetin payment methods?", a: "All. Lydia, Wave, MoMo, Wise, SEPA, PayPal, cash." },
          { q: "How pay BMD plan?", a: "Stripe Checkout: card, Apple Pay, Google Pay." },
        ]},
        { key: "expenses", icon: "💸", label: "Expense", items: [
          { q: "How scan receipt?", a: "Photo or PDF. BMD detect automatic." },
          { q: "Who fit edit?", a: "Only creator and admin." },
          { q: "How split unequal?", a: "3 modes." },
          { q: "Detect duplicate?", a: "Yes automatic." },
          { q: "Import bank?", a: "Yes CSV." },
        ]},
        { key: "settle", icon: "↔", label: "Balance", items: [
          { q: "How BMD calculate?", a: "Min cash flow algorithm." },
          { q: "Wetin debt swap?", a: "When member take another's debt. 3-way validation." },
          { q: "How mark debt paid?", a: "Group → Balance → 'Settle'." },
          { q: "Somebody say e pay but I no receive?", a: "Both sides must confirm." },
        ]},
        { key: "privacy", icon: "🛡", label: "Privacy", items: [
          { q: "My data safe?", a: "Yes. TLS 1.3, EU hosting, full GDPR." },
          { q: "How no password sign in work?", a: "Phone or email, 6-digit code." },
          { q: "Wetin passkey?", a: "Biometric key (Face ID, Touch ID)." },
          { q: "BMD read my contacts?", a: "NEVER bulk." },
          { q: "Delete account?", a: "Yes from profile." },
          { q: "Export data?", a: "Yes JSON/CSV." },
        ]},
        { key: "billing", icon: "💳", label: "Plans", items: [
          { q: "Wetin Free plan include?", a: "3 active groups, unlimited tontine/expense/swap." },
          { q: "Pro €4.99/month?", a: "Unlimited groups, OCR, 10 years history." },
          { q: "Event €29?", a: "One-shot for big event." },
          { q: "Cancel anytime?", a: "Yes, no fee." },
          { q: "Price by country?", a: "Yes, BMD adapt." },
          { q: "Referral?", a: "Activate space → personal code → share → 20% for life." },
        ]},
      ],
      contactNudge: "Write hello@backmesdo.com.",
    },
    cta: {
      headline: "Start now-now",
      body: "Free. No credit card. Account ready in one minute.",
      button: "Create my account",
    },
    footer: {
      tagline: "Money for share. Friendship for protect.",
      rights: "All rights reserved.",
      privacy: "Privacy",
      terms: "Terms",
      contact: "Contact",
    },
  },
  // ============================================================
  // हिन्दी (Hindi) — diaspora indienne globale
  // ============================================================
  hi: {
    meta: {
      title: "BMD · साझा पैसा, बिना ड्रामा",
      description: "BMD अफ्रीकी और एशियाई प्रवासी समुदाय को टॉन्टीन, साझा घर, यात्रा और समूह कार्यक्रम प्रबंधित करने में मदद करता है — पारदर्शिता, निष्पक्षता, मानसिक शांति।",
    },
    nav: {
      story: "हमारी कहानी",
      features: "विशेषताएँ",
      howItWorks: "यह कैसे काम करता है",
      pricing: "मूल्य निर्धारण",
      login: "साइन इन",
      signUp: "साइन अप",
    },
    langPicker: { main: "मुख्य भाषाएँ", europeanGroup: "यूरोपीय भाषाएँ", asianGroup: "एशियाई भाषाएँ", arabicGroup: "अरबी", africanGroup: "अफ्रीकी भाषाएँ" },
    hero: {
      tagline: "Back Mes Do · प्रवासी",
      headline: "साझा पैसा। संरक्षित दोस्ती।",
      subhead: "टॉन्टीन, साझा घर, यात्रा, शादी, चर्च, क्लब: BMD हर खर्च की गणना, सरलीकरण और ट्रैकिंग करता है ताकि किसी को नुकसान न हो।",
      ctaPrimary: "मुफ्त शुरू करें",
      ctaSecondary: "डेमो देखें",
    },
    story: {
      kicker: "हमारी कहानी",
      title: "पैसे के लिए दोस्ती की कीमत कभी न चुकाएँ",
      punchline: "हम सभी ने वो डिनर देखा है जहाँ रेस्टोरेंट अदालत बन गया। वो टॉन्टीन जहाँ किसी को नहीं पता था कि किसने भुगतान किया। वो भाई-बहनों की यात्रा जो ठंडे WhatsApp ग्रुप में खत्म हुई।",
      chapters: [
        { icon: "🌍", title: "समस्या", body: "मुद्रास्फीति सब कुछ खा रही है। यूरोप, कैमरून, डकार, मुंबई में जीवन यापन की लागत बढ़ रही है। हर रुपया मायने रखता है — और हर गलत गिना गया रुपया चुप्पी, नाराज़गी, टूटे रिश्ते में बदल जाता है।" },
        { icon: "💔", title: "तनाव", body: "Excel शीट पढ़ने योग्य नहीं हैं। WhatsApp गणना नहीं करता। पश्चिमी ऐप्स टॉन्टीन, CFA फ्रैंक, या पेरिस में 6 छात्रों के साझा अपार्टमेंट की वास्तविकता को नहीं समझते।" },
        { icon: "🕊", title: "समाधान", body: "BMD। उन लोगों के लिए एक उपकरण जो वास्तव में अपना पैसा साझा करते हैं। बहु-मुद्रा (25+), बहुभाषी (20+), टॉन्टीन, ऋण स्वैप, OCR, WhatsApp बॉट। बिना ड्रामा, बिना ट्रैकर, बिना विज्ञापन।" },
      ],
      manifesto: "«हम हर पैसे को गिनते हैं — ताकि हमें कभी अपने दोस्तों को न गिनना पड़े।»",
      cta: "मुफ्त शुरू करें",
    },
    features: {
      title: "जो ज़रूरी है, वही",
      items: [
        { icon: "🪙", title: "पूर्ण टॉन्टीन", body: "चक्र, लाभार्थी क्रम, समायोज्य तिथियाँ, बहु-वर्षीय इतिहास।" },
        { icon: "💸", title: "साझा खर्च", body: "बराबर, हिस्से या प्रतिशत।" },
        { icon: "↔", title: "ऋण स्वैप", body: "तीन-पक्षीय सत्यापन के साथ ऋण ऑफसेट या ट्रांसफर।" },
        { icon: "🔔", title: "स्मार्ट सूचनाएँ", body: "केवल वही जो आपसे संबंधित है।" },
        { icon: "📷", title: "रसीद OCR", body: "रसीद की फोटो: राशि, व्यापारी, तारीख स्वचालित रूप से पहचानी जाती है।" },
        { icon: "🛡", title: "GDPR और गोपनीयता", body: "एड्रेस बुक की कोई बल्क रीडिंग नहीं।" },
      ],
    },
    howItWorks: {
      title: "तीन चरणों में",
      steps: [
        { num: "1", title: "अपना समूह बनाएँ", body: "टॉन्टीन, साझा घर, यात्रा, शादी… प्रकार और मुद्रा चुनें।" },
        { num: "2", title: "अपने प्रियजनों को आमंत्रित करें", body: "साझा करने योग्य लिंक, QR कोड, या फोन संपर्क।" },
        { num: "3", title: "शांति से जिएँ", body: "खर्च, योगदान, स्वैप दर्ज करें। BMD शेष राशि की गणना करता है।" },
      ],
    },
    pricing: {
      title: "अधिकांश के लिए मुफ्त",
      free: { name: "मुफ्त", price: "₹0", features: ["3 सक्रिय समूह तक", "असीमित टॉन्टीन/खर्च/स्वैप", "PDF/फोटो रसीदें", "पूर्ण सूचनाएँ"] },
      pro: { name: "Pro", price: "₹399 / माह", features: ["असीमित समूह", "विस्तृत लेखा निर्यात", "10 साल का इतिहास", "प्राथमिकता समर्थन"], cta: "जल्द आ रहा है" },
    },
    faq: {
      title: "अक्सर पूछे जाने वाले प्रश्न",
      items: [
        { q: "क्या BMD एक बैंक है?", a: "नहीं। BMD एक साझा प्रबंधन उपकरण है। भुगतान आपके सामान्य चैनलों के माध्यम से होते हैं।" },
        { q: "क्या मेरा डेटा सुरक्षित है?", a: "हाँ। हम संचार को एन्क्रिप्ट करते हैं और स्पष्ट सहमति के बिना आपकी एड्रेस बुक नहीं पढ़ते।" },
        { q: "BMD टॉन्टीन कैसे काम करता है?", a: "आप समूह बनाते हैं, राशि और आवृत्ति निर्धारित करते हैं। हर दौर में, लाभार्थी सटीक तिथि चुनता है।" },
      ],
    },
    featuresLong: {
      intro: "BMD उन सभी स्थितियों को कवर करता है जहाँ करीबी लोगों के बीच पैसा घूमता है: टॉन्टीन, साझा घर, यात्रा, शादी, चर्च, क्लब।",
      categories: [
        { key: "groups", icon: "👥", label: "समूह और भूमिकाएँ", pitch: "30 सेकंड में सही समूह प्रकार बनाएँ।",
          items: [
            { icon: "🎭", title: "6 पूर्व-निर्धारित प्रकार", body: "टॉन्टीन · साझा घर · यात्रा · कार्यक्रम · क्लब · चर्च/संघ।" },
            { icon: "🛡", title: "स्पष्ट भूमिकाएँ", body: "व्यवस्थापक, कोषाध्यक्ष, सदस्य।" },
            { icon: "✉️", title: "मल्टी-चैनल आमंत्रण", body: "लिंक, QR, फोन संपर्क।" },
            { icon: "🎨", title: "समुदाय थीम", body: "अपने समूह की दृश्य पहचान चुनें।" },
          ],
        },
        { key: "expenses", icon: "💸", label: "साझा खर्च", pitch: "खर्च दर्ज करना 5 सेकंड लेना चाहिए।",
          items: [
            { icon: "📷", title: "रसीद OCR", body: "रसीद की फोटो: राशि, व्यापारी, तारीख स्वचालित रूप से पहचानी जाती है।" },
            { icon: "⚖️", title: "विभाजन: समान · हिस्से · प्रतिशत", body: "1-क्लिक समान विभाजन, अनुकूलित हिस्से या सटीक प्रतिशत।" },
            { icon: "🤖", title: "AI विभाजन सुझाव", body: "BMD आपकी आदतों को सीखता है।" },
            { icon: "📜", title: "श्रेणी नियम", body: "एक बार नियम बनाएँ, BMD हमेशा लागू करता है।" },
            { icon: "🚨", title: "विसंगति का पता लगाना", body: "डुप्लिकेट, असामान्य राशियाँ।" },
            { icon: "🏦", title: "बैंक CSV आयात", body: "अपना स्टेटमेंट आयात करें।" },
          ],
        },
        { key: "tontines", icon: "🪙", label: "टॉन्टीन और चक्र", pitch: "सभी रोटेटिंग बचत मॉडल समर्थित।",
          items: [
            { icon: "🔄", title: "पूर्ण स्वचालित चक्र", body: "राशि, आवृत्ति और लाभार्थी क्रम परिभाषित करें।" },
            { icon: "🤝", title: "योगदान का दोहरा सत्यापन", body: "भुगतानकर्ता घोषित करता है, कोषाध्यक्ष पुष्टि करता है।" },
            { icon: "📅", title: "कैलेंडर दृश्य", body: "सभी भविष्य के दौर दृश्यमान।" },
            { icon: "🎯", title: "नीलामी (Hui)", body: "चीनी समुदायों के लिए।" },
            { icon: "📚", title: "बहु-वर्षीय इतिहास", body: "न्यूनतम 5 साल।" },
          ],
        },
        { key: "settle", icon: "↔", label: "शेष और निपटान", pitch: "BMD न्यूनतम लेनदेन की गणना करता है।",
          items: [
            { icon: "🧮", title: "रीयल-टाइम शेष", body: "बहु-मुद्रा वैश्विक शेष।" },
            { icon: "🎯", title: "इष्टतम निपटान", body: "1 लेनदेन 2-3 के बजाय।" },
            { icon: "🔁", title: "ऋण स्वैप", body: "3-पक्षीय सत्यापन।" },
            { icon: "🔗", title: "एकल-उपयोग भुगतान लिंक", body: "सुरक्षित लिंक।" },
          ],
        },
        { key: "money", icon: "💱", label: "बहु-मुद्रा और भुगतान", pitch: "BMD प्रवासियों के लिए बनाया गया है। 25+ मुद्राएँ समर्थित।",
          items: [
            { icon: "🌍", title: "लाइव दरों के साथ 25+ मुद्राएँ", body: "यूरो, डॉलर, पाउंड, रुपया…" },
            { icon: "💳", title: "आपके सामान्य उपकरणों के साथ संगत", body: "Lydia, Wave, Wise, SEPA, PayPal, UPI।" },
            { icon: "📈", title: "रीयल-टाइम रूपांतरण", body: "हर सदस्य अपनी डिफ़ॉल्ट मुद्रा में देखता है।" },
            { icon: "🧾", title: "डाउनलोड करने योग्य कर रसीदें", body: "चर्चों, संघों, खेल क्लबों के लिए।" },
          ],
        },
        { key: "comms", icon: "🔔", label: "संचार और अनुस्मारक", pitch: "सब कुछ सूचना-संचालित है।",
          items: [
            { icon: "🛎", title: "ग्रैन्युलर सूचनाएँ", body: "केवल वही जो आपसे संबंधित है।" },
            { icon: "📅", title: "साप्ताहिक सारांश", body: "हर रविवार शाम।" },
            { icon: "💬", title: "मूल WhatsApp बॉट", body: "आवाज या पाठ संदेश के माध्यम से खर्च जोड़ें।" },
            { icon: "😊", title: "स्वर का चयन करें", body: "मित्रवत, दृढ़, हास्यपूर्ण, पेशेवर।" },
            { icon: "🌙", title: "प्रति-समूह 'परेशान न करें'", body: "1 घंटे, 24 घंटे, या कल सुबह तक मूट करें।" },
          ],
        },
        { key: "intelligence", icon: "🧠", label: "बुद्धिमत्ता और स्वचालन", pitch: "BMD कागजी कार्रवाई हटाने के लिए AI का उपयोग करता है।",
          items: [
            { icon: "🎙", title: "Whisper आवाज इनपुट", body: "BMD प्रतिलेखन, समझ, फ़ाइल करता है।" },
            { icon: "📊", title: "आँकड़े और अंतर्दृष्टि", body: "मासिक रुझान, श्रेणी विभाजन।" },
            { icon: "🌐", title: "व्यवस्थापक सामग्री का स्वतः अनुवाद", body: "BMD स्वचालित रूप से अनुवाद करता है।" },
            { icon: "🔮", title: "विसंगतियाँ और डुप्लिकेट", body: "ड्रामा होने से पहले BMD चेतावनी देता है।" },
          ],
        },
        { key: "trust", icon: "🛡", label: "सुरक्षा और गोपनीयता", pitch: "GDPR by design।",
          items: [
            { icon: "🔑", title: "बिना पासवर्ड साइन-इन", body: "SMS, ईमेल या WhatsApp के माध्यम से OTP। पासकीज़।" },
            { icon: "🚫", title: "एड्रेस बुक की शून्य रीडिंग", body: "केवल आपके द्वारा स्पष्ट रूप से चुने गए संपर्क ही प्रसारित किए जाते हैं।" },
            { icon: "📜", title: "अपरिवर्तनीय ऑडिट लॉग", body: "5 साल तक रखा जाता है।" },
            { icon: "🇪🇺", title: "पूर्ण GDPR अनुपालन", body: "JSON/CSV निर्यात, 30 दिनों के भीतर अनुरोध पर हटाना।" },
            { icon: "🌐", title: "EU होस्टिंग", body: "डेटाबेस और सर्वर EU क्षेत्र में।" },
          ],
        },
        { key: "platform", icon: "📱", label: "प्लेटफ़ॉर्म और पहुँच", pitch: "फोन पर असली नेटिव ऐप।",
          items: [
            { icon: "📲", title: "इंस्टॉल करने योग्य PWA", body: "iPhone, Android या डेस्कटॉप पर।" },
            { icon: "💬", title: "WhatsApp बॉट", body: "30 सेकंड में अपना WhatsApp नंबर कनेक्ट करें।" },
            { icon: "🌍", title: "बहुभाषी", body: "इंटरफ़ेस आपकी पसंदीदा भाषा के अनुसार अनुकूलित होता है।" },
            { icon: "♿", title: "WCAG 2.1 AA पहुँच", body: "सत्यापित कंट्रास्ट, कीबोर्ड नेविगेशन।" },
            { icon: "🌗", title: "हल्का / गहरा मोड", body: "☀️/🌙 आइकन से 1-क्लिक टॉगल।" },
          ],
        },
      ],
    },
    referral: {
      kicker: "बिक्री कार्यक्रम",
      title: "BMD की सिफारिश करें, हर सदस्यता पर कमाएँ",
      intro: "BMD में एक सरल रेफरल कार्यक्रम है — कोई स्तर नहीं, कोई पिरामिड नहीं।",
      benefits: [
        { icon: "💰", title: "सीधा कमीशन", body: "20% मासिक राशि।" },
        { icon: "♾️", title: "जीवन भर आवर्ती", body: "जब तक आपका रेफरी ग्राहक है।" },
        { icon: "📊", title: "समर्पित बिक्री डैशबोर्ड", body: "स्पष्ट डैशबोर्ड।" },
        { icon: "🎁", title: "रेफरी के लिए बोनस", body: "आपके रेफरी को छूट मिलती है।" },
      ],
      howItWorks: [
        { num: "1", title: "बिक्री क्षेत्र सक्रिय करें", body: "प्रोफ़ाइल → बिक्री क्षेत्र।" },
        { num: "2", title: "अपने नेटवर्क के साथ साझा करें", body: "अपने चर्च, क्लब, प्रवासी मित्रों के साथ।" },
        { num: "3", title: "साइन-अप ट्रैक करें", body: "रीयल-टाइम।" },
        { num: "4", title: "कमीशन प्राप्त करें", body: "हर महीने की 1 तारीख।" },
      ],
      cta: { label: "कार्यक्रम जानें", href: "/dashboard/affiliate" },
      smallPrint: "कोई स्तर नहीं, कोई पिरामिड मार्केटिंग नहीं।",
    },
    faqLong: {
      intro: "सबसे अधिक पूछे जाने वाले प्रश्न।",
      categories: [
        { key: "basics", icon: "👋", label: "मूल बातें", items: [
          { q: "एक वाक्य में BMD?", a: "एक ऐप जो समूहों को बिना ड्रामा साझा पैसा प्रबंधित करने में मदद करता है।" },
          { q: "क्या BMD मेरे बैंक की जगह लेता है?", a: "नहीं।" },
          { q: "लागत कितनी है?", a: "मुफ्त: 3 समूह। Pro ₹399/माह।" },
          { q: "किन उपकरणों पर?", a: "iPhone, Android।" },
          { q: "क्या सभी को पंजीकरण करना होगा?", a: "तुरंत नहीं।" },
        ]},
        { key: "groups", icon: "👥", label: "समूह", items: [
          { q: "कौन से प्रकार?", a: "6 प्रकार।" },
          { q: "अधिकतम आकार?", a: "कोई कठोर सीमा नहीं।" },
          { q: "कैसे आमंत्रित करें?", a: "लिंक, QR।" },
          { q: "सदस्य हटाना?", a: "हाँ।" },
          { q: "मेहमान अन्य समूह देखते हैं?", a: "कभी नहीं।" },
        ]},
        { key: "tontines", icon: "🪙", label: "टॉन्टीन", items: [
          { q: "BMD में टॉन्टीन कैसे काम करता है?", a: "राशि और आवृत्ति निर्धारित करें।" },
          { q: "अंतर?", a: "वही सिद्धांत।" },
          { q: "अगर कोई भुगतान नहीं करता?", a: "स्वत: अनुस्मारक।" },
          { q: "बहु-वर्षीय?", a: "5 साल न्यूनतम।" },
        ]},
        { key: "money", icon: "💱", label: "मुद्रा", items: [
          { q: "कौन सी मुद्राएँ?", a: "25+।" },
          { q: "रूपांतरण?", a: "स्वचालित।" },
          { q: "कमीशन?", a: "कभी नहीं।" },
          { q: "तरीके?", a: "सभी।" },
          { q: "BMD योजना?", a: "Stripe।" },
        ]},
        { key: "expenses", icon: "💸", label: "खर्च", items: [
          { q: "रसीद स्कैन?", a: "फोटो।" },
          { q: "संपादित कौन कर सकता है?", a: "केवल निर्माता और व्यवस्थापक।" },
          { q: "असमान विभाजन?", a: "3 मोड।" },
          { q: "डुप्लिकेट?", a: "हाँ स्वत:।" },
          { q: "आयात?", a: "हाँ CSV।" },
        ]},
        { key: "settle", icon: "↔", label: "शेष", items: [
          { q: "गणना?", a: "न्यूनतम प्रवाह।" },
          { q: "ऋण स्वैप?", a: "3-पक्षीय सत्यापन।" },
          { q: "भुगतान चिह्नित?", a: "शेष → निपटान।" },
          { q: "विवाद?", a: "दोनों पक्षों की पुष्टि।" },
        ]},
        { key: "privacy", icon: "🛡", label: "गोपनीयता", items: [
          { q: "सुरक्षित?", a: "हाँ TLS 1.3, EU होस्टिंग।" },
          { q: "बिना पासवर्ड?", a: "OTP।" },
          { q: "passkey?", a: "बायोमेट्रिक।" },
          { q: "संपर्क?", a: "कभी बल्क नहीं।" },
          { q: "खाता हटाएँ?", a: "हाँ।" },
          { q: "डेटा निर्यात?", a: "JSON/CSV।" },
        ]},
        { key: "billing", icon: "💳", label: "योजनाएँ", items: [
          { q: "मुफ्त?", a: "3 समूह।" },
          { q: "Pro?", a: "असीमित।" },
          { q: "Event?", a: "₹2400 एक बार।" },
          { q: "रद्द करें?", a: "कभी भी।" },
          { q: "देश के अनुसार मूल्य?", a: "हाँ।" },
          { q: "रेफरल?", a: "20% जीवन भर।" },
        ]},
      ],
      contactNudge: "hello@backmesdo.com पर लिखें।",
    },
    cta: { headline: "अभी शुरू करें", body: "मुफ्त। कोई क्रेडिट कार्ड नहीं। एक मिनट से कम में पंजीकरण।", button: "मेरा खाता बनाएँ" },
    footer: { tagline: "साझा पैसा। संरक्षित दोस्ती।", rights: "सर्वाधिकार सुरक्षित।", privacy: "गोपनीयता", terms: "शर्तें", contact: "संपर्क" },
  },
  // ============================================================
  // Francanglais (Cameroun) — argot urbain Douala/Yaoundé
  // ============================================================
  "fr-cm": {
    meta: {
      title: "BMD · L'argent partagé sans drame",
      description: "BMD aide la diaspora et les Camerounais à gérer tontines, colocs, voyages et events sans drame.",
    },
    nav: {
      story: "Notre story",
      features: "Les features",
      howItWorks: "Comment ça marche",
      pricing: "Les prix",
      login: "Se ngondo",
      signUp: "Créer le compte",
    },
    langPicker: { main: "Langues principales", europeanGroup: "Langues européennes", asianGroup: "Langues asiatiques", arabicGroup: "Langues arabes", africanGroup: "Langues africaines" },
    hero: {
      tagline: "Back Mes Do · Diaspora",
      headline: "L'argent partagé. L'amitié protégée.",
      subhead: "Tontines, colocs, voyages, mariages, paroisses, clubs — BMD compte pour toi, pas de wahala.",
      ctaPrimary: "Démarrer gratos",
      ctaSecondary: "Voir le démo",
    },
    story: {
      kicker: "Notre story",
      title: "L'argent ne doit jamais coûter une amitié",
      punchline: "Tu connais cette soirée où le resto a viré en tribunal. Cette tontine où plus personne ne sait qui a déjà mouillé. Ce voyage entre cousins qui finit en groupe WhatsApp froid comme la mort.",
      chapters: [
        { icon: "🌍", title: "Le problème", body: "L'inflation gnak tout. La life is hard à Paris, à Douala, à Dakar, à Mumbai. Chaque franc compte — et chaque franc mal compté, ça devient silence, malaise, mboutoukou. La diaspora envoie le don, les familles s'organisent, les amis voyagent. Mais y'avait pas l'outil pour suivre tout ça en mode propre." },
        { icon: "💔", title: "La tension", body: "Excel c'est la galère. WhatsApp ne calcule rien. Les apps des blancs ne comprennent ni la tontine, ni le franc CFA, ni la coloc à 6 entre étudiants à Paris. Et personne n'ose lancer « tu me dois encore 47 € » sans avoir le seum." },
        { icon: "🕊", title: "La solution", body: "BMD. L'app pensée pour ceux qui partagent vraiment leur do — avec les frères, les sisters, les voisins, l'église, les copains de promo. Multi-devises (25+), multi-langues (20+), tontines, swap, OCR, bot WhatsApp. Sans drame, sans tracker, sans pub." },
      ],
      manifesto: "« On compte chaque franc — pour ne plus jamais avoir à compter ses guys. »",
      cta: "Démarrer gratos",
    },
    features: {
      title: "Tout ce qu'il faut, pas plus",
      items: [
        { icon: "🪙", title: "Tontines complètes", body: "Cycle, ordre, dates flexibles, accusés de réception." },
        { icon: "💸", title: "Dépenses partagées", body: "Égal, parts, pourcent. Justificatifs photo/PDF." },
        { icon: "↔", title: "Swap de dette", body: "Compense ou transfère, validation à 3." },
        { icon: "🔔", title: "Notifs propres", body: "Que ce qui te concerne." },
        { icon: "📷", title: "OCR tickets", body: "Photo, montant détecté direct." },
        { icon: "🛡", title: "RGPD propre", body: "Pas de scan ton phone." },
      ],
    },
    howItWorks: {
      title: "En trois steps",
      steps: [
        { num: "1", title: "Crée ton groupe", body: "Tontine, coloc, voyage, mariage." },
        { num: "2", title: "Invite tes guys", body: "Lien, QR, contact phone." },
        { num: "3", title: "Vis tranquille", body: "BMD calcule, propose le règlement." },
      ],
    },
    pricing: {
      title: "Gratos pour la majorité",
      free: { name: "Gratos", price: "0 F", features: ["3 groupes max", "Tontines, dépenses sans limite", "Reçus PDF/photo", "Toutes les notifs"] },
      pro: { name: "Pro", price: "1 950 F / mois", features: ["Groupes sans limite", "Export comptable", "10 ans d'historique", "Support priorité"], cta: "Bientôt" },
    },
    faq: {
      title: "Les questions qui reviennent",
      items: [
        { q: "BMD c'est une banque?", a: "Non. BMD c'est l'outil pour gérer. Tu paies par tes canaux habituels (Wave, Lydia, Orange Money)." },
        { q: "Mes do sont safe?", a: "Yes. On chiffre tout, on ne lit pas ton phone sans toi dire." },
        { q: "La tontine BMD ça marche comment?", a: "Tu crées le groupe, tu fixes le montant et la fréquence. Chaque tour, le bénéficiaire choisit la date." },
      ],
    },
    featuresLong: {
      intro: "BMD couvre toutes les sits où l'argent circule entre tes guys: tontines, colocs, voyages, mariages, paroisses, clubs.",
      categories: [
        { key: "groups", icon: "👥", label: "Groupes & rôles", pitch: "Crée le bon groupe en 30 secondes.",
          items: [
            { icon: "🎭", title: "6 types prêts", body: "Tontine · Coloc · Voyage · Event · Club · Paroisse." },
            { icon: "🛡", title: "Rôles clairs", body: "Admin, trésorier, membre." },
            { icon: "✉️", title: "Invitations multi-canal", body: "Lien, QR, contacts (avec ton accord)." },
            { icon: "🎨", title: "Thème par communauté", body: "Choisis l'identité visuelle." },
          ],
        },
        { key: "expenses", icon: "💸", label: "Dépenses partagées", pitch: "5 secondes pour saisir.",
          items: [
            { icon: "📷", title: "OCR tickets", body: "Photo, BMD détecte tout." },
            { icon: "⚖️", title: "Égal · parts · pourcent", body: "1 clic ou personnalisé." },
            { icon: "🤖", title: "Suggestion IA", body: "BMD apprend tes habitudes." },
            { icon: "📜", title: "Règles par catégorie", body: "Une fois, BMD applique partout." },
            { icon: "🚨", title: "Anomalies", body: "Doublons, montants louches." },
            { icon: "🏦", title: "Import bancaire", body: "CSV depuis ton banque." },
          ],
        },
        { key: "tontines", icon: "🪙", label: "Tontines", pitch: "Tous les modèles supportés.",
          items: [
            { icon: "🔄", title: "Cycle automatique", body: "Montant, fréquence, ordre." },
            { icon: "🤝", title: "Double validation", body: "Anti-malentendu." },
            { icon: "📅", title: "Vue calendrier", body: "Tous les tours visibles." },
            { icon: "🎯", title: "Enchères (Hui)", body: "Pour les Chinois." },
            { icon: "📚", title: "Historique 5 ans", body: "Audit log immuable." },
          ],
        },
        { key: "settle", icon: "↔", label: "Soldes & règlements", pitch: "Minimum de transactions.",
          items: [
            { icon: "🧮", title: "Soldes en temps réel", body: "Multi-devise." },
            { icon: "🎯", title: "Règlement optimal", body: "1 transaction au lieu de 2-3." },
            { icon: "🔁", title: "Swap dette", body: "Validation à 3." },
            { icon: "🔗", title: "Liens de paiement", body: "Usage unique." },
          ],
        },
        { key: "money", icon: "💱", label: "Multi-devises", pitch: "25+ devises live.",
          items: [
            { icon: "🌍", title: "Toutes les devises", body: "Euro, FCFA, Naira, Dollar." },
            { icon: "💳", title: "Compatible Wave, Orange", body: "Lydia, Wise, MoMo, SEPA." },
            { icon: "📈", title: "Conversion live", body: "Chacun voit dans sa devise." },
            { icon: "🧾", title: "Reçus fiscaux", body: "Pour paroisses, clubs." },
          ],
        },
        { key: "comms", icon: "🔔", label: "Comms", pitch: "Tout via notifs.",
          items: [
            { icon: "🛎", title: "Notifs precise", body: "Que ce qui te concerne." },
            { icon: "📅", title: "Récap weekly", body: "Tous les dimanches." },
            { icon: "💬", title: "Bot WhatsApp", body: "Vocal ou texte." },
            { icon: "😊", title: "Ton à choisir", body: "Sympa, ferme, humour." },
            { icon: "🌙", title: "DND par groupe", body: "Mute 1h, 24h." },
          ],
        },
        { key: "intelligence", icon: "🧠", label: "IA", pitch: "BMD utilise l'IA pour la paperasse.",
          items: [
            { icon: "🎙", title: "Vocal Whisper", body: "BMD transcrit." },
            { icon: "📊", title: "Stats", body: "Évolution mensuelle." },
            { icon: "🌐", title: "Auto-traduction", body: "Multi-langues auto." },
            { icon: "🔮", title: "Anomalies", body: "BMD prévient." },
          ],
        },
        { key: "trust", icon: "🛡", label: "Sécurité", pitch: "RGPD by design.",
          items: [
            { icon: "🔑", title: "Sans password", body: "OTP." },
            { icon: "🚫", title: "Zero scan phone", body: "Que les contacts choisis." },
            { icon: "📜", title: "Audit log", body: "5 ans." },
            { icon: "🇪🇺", title: "RGPD complet", body: "Export, suppression." },
            { icon: "🌐", title: "Hosting EU", body: "Servers en EU." },
          ],
        },
        { key: "platform", icon: "📱", label: "Plateformes", pitch: "App native, portail web, bot WhatsApp.",
          items: [
            { icon: "📲", title: "PWA", body: "iPhone, Android, desktop." },
            { icon: "💬", title: "Bot WhatsApp", body: "30 sec à connecter." },
            { icon: "🌍", title: "Multi-langues", body: "20+ langues." },
            { icon: "♿", title: "Accessibilité", body: "WCAG AA." },
            { icon: "🌗", title: "Mode clair/sombre", body: "1 clic." },
          ],
        },
      ],
    },
    referral: {
      kicker: "Programme commercial",
      title: "Recommande BMD, gagne sur chaque abonnement",
      intro: "BMD a un programme de parrainage simple — pas de niveaux, pas de pyramide.",
      benefits: [
        { icon: "💰", title: "Commission directe", body: "20% du montant mensuel." },
        { icon: "♾️", title: "À vie", body: "Tant que ton filleul reste client." },
        { icon: "📊", title: "Espace dédié", body: "Tableau de bord clair." },
        { icon: "🎁", title: "Bonus filleul", body: "Réduction pour eux." },
      ],
      howItWorks: [
        { num: "1", title: "Active espace", body: "Profil → Espace commercial." },
        { num: "2", title: "Partage avec tes guys", body: "Paroisse, club, copains." },
        { num: "3", title: "Suis les inscriptions", body: "Temps réel." },
        { num: "4", title: "Reçois ta commission", body: "Premier de chaque mois (à partir de 25€)." },
      ],
      cta: { label: "Découvrir le programme", href: "/dashboard/affiliate" },
      smallPrint: "Pas de niveaux, pas de pyramidal.",
    },
    faqLong: {
      intro: "Les questions qui reviennent le plus.",
      categories: [
        { key: "basics", icon: "👋", label: "Bases", items: [
          { q: "BMD en une phrase?", a: "L'app pour gérer l'argent partagé sans drame." },
          { q: "BMD remplace ma banque?", a: "Non. Tu paies par tes canaux habituels." },
          { q: "Combien ça coûte?", a: "Gratos: 3 groupes. Pro 4,99€/mois." },
          { q: "Quels appareils?", a: "iPhone, Android, ordi." },
          { q: "Tous mes guys doivent s'inscrire?", a: "Pas direct. Profils ombre possibles." },
        ]},
        { key: "groups", icon: "👥", label: "Groupes", items: [
          { q: "Quels types?", a: "6 types." },
          { q: "Taille max?", a: "Pas de limite stricte." },
          { q: "Comment inviter?", a: "Lien, QR, contact." },
          { q: "Retirer un membre?", a: "Oui." },
          { q: "Voir d'autres groupes?", a: "Jamais." },
        ]},
        { key: "tontines", icon: "🪙", label: "Tontines", items: [
          { q: "Comment ça marche?", a: "Montant et fréquence." },
          { q: "Différences?", a: "Même principe." },
          { q: "Si quelqu'un ne paie pas?", a: "Rappel auto." },
          { q: "Plusieurs ans?", a: "5 ans mini." },
        ]},
        { key: "money", icon: "💱", label: "Devises", items: [
          { q: "Quelles devises?", a: "25+." },
          { q: "Conversion?", a: "Auto." },
          { q: "Commission?", a: "Jamais." },
          { q: "Méthodes?", a: "Toutes." },
          { q: "Plan BMD?", a: "Stripe." },
        ]},
        { key: "expenses", icon: "💸", label: "Dépenses", items: [
          { q: "Scanner ticket?", a: "Photo." },
          { q: "Modifier?", a: "Créateur et admin." },
          { q: "Diviser?", a: "3 modes." },
          { q: "Doublons?", a: "Auto." },
          { q: "Importer?", a: "CSV." },
        ]},
        { key: "settle", icon: "↔", label: "Soldes", items: [
          { q: "Calcul?", a: "Min flux." },
          { q: "Swap?", a: "3 yoon." },
          { q: "Marquer payé?", a: "Soldes → Régler." },
          { q: "Disputes?", a: "Validation 2 yoon." },
        ]},
        { key: "privacy", icon: "🛡", label: "Vie privée", items: [
          { q: "Sécurité?", a: "TLS 1.3, EU." },
          { q: "Sans password?", a: "OTP." },
          { q: "Passkey?", a: "Biométrique." },
          { q: "Carnet?", a: "Pas de scan." },
          { q: "Supprimer?", a: "Oui." },
          { q: "Exporter?", a: "JSON/CSV." },
        ]},
        { key: "billing", icon: "💳", label: "Forfait", items: [
          { q: "Gratos?", a: "3 groupes." },
          { q: "Pro?", a: "Sans limite." },
          { q: "Event?", a: "29€." },
          { q: "Annuler?", a: "Sans frais." },
          { q: "Pays?", a: "Oui." },
          { q: "Parrainage?", a: "20% à vie." },
        ]},
      ],
      contactNudge: "Écris-nous à hello@backmesdo.com.",
    },
    cta: { headline: "Démarre maintenant", body: "Gratos. Pas de carte. Inscription en 1 minute.", button: "Créer mon compte" },
    footer: { tagline: "L'argent partagé. L'amitié protégée.", rights: "Tous droits réservés.", privacy: "Confidentialité", terms: "CGU", contact: "Contact" },
  },
  // ============================================================
  // Nouchi (Côte d'Ivoire) — argot urbain Abidjan
  // ============================================================
  "fr-ci": {
    meta: {
      title: "BMD · L'argent enjaillant sans drama",
      description: "BMD aide les Ivoiriens et la diaspora à gérer tontines, colocs, voyages et events sans drama.",
    },
    nav: {
      story: "Notre histoire",
      features: "Les fonctionnalités",
      howItWorks: "Comment ça gbo",
      pricing: "Les prix",
      login: "Connecter",
      signUp: "Faire le compte",
    },
    langPicker: { main: "Langues principales", europeanGroup: "Langues européennes", asianGroup: "Langues asiatiques", arabicGroup: "Langues arabes", africanGroup: "Langues africaines" },
    hero: {
      tagline: "Back Mes Do · Diaspora",
      headline: "L'argent enjaillé. L'amitié blindée.",
      subhead: "Tontines, colocs, voyages, mariages, paroisses, clubs — BMD calcule pour toi, zéro djo.",
      ctaPrimary: "Gérer gratos",
      ctaSecondary: "Voir le démo",
    },
    story: {
      kicker: "Notre histoire",
      title: "L'argent ne doit jamais salir l'amitié",
      punchline: "Tu connais ce tchatcho où le maquis a fini en cour. Cette tontine où plus personne ne sait qui a mouillé. Ce voyage entre go et boy qui finit en groupe WhatsApp froid sec.",
      chapters: [
        { icon: "🌍", title: "Le problème", body: "L'inflation djoss tout. La vie est dure à Abidjan, à Paris, à Dakar, à Mumbai. Chaque franc compte — et chaque franc mal compté ça devient silence, gbangban, la khassa cassée." },
        { icon: "💔", title: "La tension", body: "Excel c'est trop wopro. WhatsApp ne calcule pas. Les apps des couleurs ne comprennent ni la tontine, ni le franc CFA, ni la coloc en 6 à Paris." },
        { icon: "🕊", title: "La solution", body: "BMD. L'app pour ceux qui partagent vraiment leur do. Multi-devises (25+), multi-langues (20+), tontines, swap, OCR, bot WhatsApp. Pas de drama, pas de mouchard, pas de pub." },
      ],
      manifesto: "« On compte chaque franc — pour ne plus jamais compter ses gars. »",
      cta: "Gérer gratos",
    },
    features: {
      title: "Tout ce qu'il faut, et c'est tout",
      items: [
        { icon: "🪙", title: "Tontines complètes", body: "Cycle, ordre, dates, accusés de réception." },
        { icon: "💸", title: "Dépenses partagées", body: "Égal, parts, pourcent." },
        { icon: "↔", title: "Swap de dette", body: "Compense, validation à 3." },
        { icon: "🔔", title: "Notifs propres", body: "Que ce qui te concerne." },
        { icon: "📷", title: "OCR tickets", body: "Photo, on détecte tout." },
        { icon: "🛡", title: "RGPD propre", body: "Pas de scan ton phone." },
      ],
    },
    howItWorks: {
      title: "En trois étapes",
      steps: [
        { num: "1", title: "Crée ton groupe", body: "Tontine, coloc, voyage." },
        { num: "2", title: "Invite tes gars", body: "Lien, QR, contact." },
        { num: "3", title: "Vis enjaillé", body: "BMD calcule, propose le règlement." },
      ],
    },
    pricing: {
      title: "Gratos pour la majorité",
      free: { name: "Gratos", price: "0 F", features: ["3 groupes max", "Tontines sans limite", "Reçus PDF/photo", "Notifs"] },
      pro: { name: "Pro", price: "1 950 F / mois", features: ["Groupes sans limite", "Export comptable", "10 ans historique", "Support"], cta: "Bientôt" },
    },
    faq: {
      title: "Les questions qui reviennent",
      items: [
        { q: "BMD c'est une banque?", a: "Non. Outil pour gérer. Paiement via tes canaux habituels (Wave, Orange Money)." },
        { q: "Mes do sont safe?", a: "Yes. On chiffre, on ne lit pas ton carnet sans toi dire." },
        { q: "Tontine BMD?", a: "Tu crées, tu fixes le montant et la fréquence." },
      ],
    },
    featuresLong: {
      intro: "BMD couvre toutes les sits où l'argent circule entre les gars: tontines, colocs, voyages, mariages, paroisses, clubs.",
      categories: [
        { key: "groups", icon: "👥", label: "Groupes & rôles", pitch: "Crée le bon groupe en 30 secondes.",
          items: [
            { icon: "🎭", title: "6 types prêts", body: "Tontine · Coloc · Voyage · Event · Club · Paroisse." },
            { icon: "🛡", title: "Rôles clairs", body: "Admin, trésorier, membre." },
            { icon: "✉️", title: "Invitations", body: "Lien, QR, contacts." },
            { icon: "🎨", title: "Thème par communauté", body: "Identité visuelle." },
          ],
        },
        { key: "expenses", icon: "💸", label: "Dépenses", pitch: "5 secondes max.",
          items: [
            { icon: "📷", title: "OCR tickets", body: "Photo, on détecte." },
            { icon: "⚖️", title: "Égal · parts · pourcent", body: "1 clic." },
            { icon: "🤖", title: "AI suggestions", body: "BMD apprend." },
            { icon: "📜", title: "Règles", body: "Une fois, BMD applique." },
            { icon: "🚨", title: "Anomalies", body: "Doublons détectés." },
            { icon: "🏦", title: "Import CSV", body: "Banque." },
          ],
        },
        { key: "tontines", icon: "🪙", label: "Tontines", pitch: "Tous les modèles.",
          items: [
            { icon: "🔄", title: "Cycle auto", body: "Montant, fréquence." },
            { icon: "🤝", title: "Double validation", body: "Anti-malentendu." },
            { icon: "📅", title: "Calendrier", body: "Tours visibles." },
            { icon: "🎯", title: "Enchères Hui", body: "Pour Chinois." },
            { icon: "📚", title: "5 ans", body: "Audit log." },
          ],
        },
        { key: "settle", icon: "↔", label: "Soldes", pitch: "Minimum transactions.",
          items: [
            { icon: "🧮", title: "Temps réel", body: "Multi-devise." },
            { icon: "🎯", title: "Optimal", body: "1 au lieu de 2-3." },
            { icon: "🔁", title: "Swap", body: "3-validation." },
            { icon: "🔗", title: "Liens", body: "Usage unique." },
          ],
        },
        { key: "money", icon: "💱", label: "Devises", pitch: "25+ live.",
          items: [
            { icon: "🌍", title: "25+ devises", body: "Euro, FCFA, Naira." },
            { icon: "💳", title: "Compatible", body: "Wave, Orange, Wise." },
            { icon: "📈", title: "Conversion live", body: "Chacun sa devise." },
            { icon: "🧾", title: "Reçus fiscaux", body: "Paroisses." },
          ],
        },
        { key: "comms", icon: "🔔", label: "Comms", pitch: "Tout via notifs.",
          items: [
            { icon: "🛎", title: "Notifs précises", body: "Ce qui te concerne." },
            { icon: "📅", title: "Récap weekly", body: "Dimanche." },
            { icon: "💬", title: "Bot WhatsApp", body: "Vocal/texte." },
            { icon: "😊", title: "Ton à choisir", body: "Sympa, ferme." },
            { icon: "🌙", title: "DND", body: "Mute par groupe." },
          ],
        },
        { key: "intelligence", icon: "🧠", label: "AI", pitch: "Pour la paperasse.",
          items: [
            { icon: "🎙", title: "Whisper vocal", body: "BMD transcrit." },
            { icon: "📊", title: "Stats", body: "Évolution." },
            { icon: "🌐", title: "Auto-traduction", body: "Multi-langues." },
            { icon: "🔮", title: "Anomalies", body: "BMD prévient." },
          ],
        },
        { key: "trust", icon: "🛡", label: "Sécurité", pitch: "RGPD.",
          items: [
            { icon: "🔑", title: "Sans password", body: "OTP." },
            { icon: "🚫", title: "Pas de scan", body: "Contacts choisis." },
            { icon: "📜", title: "Audit log", body: "5 ans." },
            { icon: "🇪🇺", title: "RGPD", body: "Export." },
            { icon: "🌐", title: "Hosting EU", body: "Servers EU." },
          ],
        },
        { key: "platform", icon: "📱", label: "Plateformes", pitch: "App native + web.",
          items: [
            { icon: "📲", title: "PWA", body: "iPhone, Android, desktop." },
            { icon: "💬", title: "Bot WhatsApp", body: "30 sec." },
            { icon: "🌍", title: "Multi-langues", body: "20+." },
            { icon: "♿", title: "Accessibilité", body: "WCAG AA." },
            { icon: "🌗", title: "Modes", body: "Clair/sombre." },
          ],
        },
      ],
    },
    referral: {
      kicker: "Programme commercial",
      title: "Recommande BMD, gagne sur chaque abonnement",
      intro: "BMD a un programme de parrainage simple, pas de pyramide.",
      benefits: [
        { icon: "💰", title: "Commission directe", body: "20% du montant mensuel." },
        { icon: "♾️", title: "À vie", body: "Tant que ton filleul reste client." },
        { icon: "📊", title: "Espace dédié", body: "Tableau de bord clair." },
        { icon: "🎁", title: "Bonus filleul", body: "Réduction pour eux." },
      ],
      howItWorks: [
        { num: "1", title: "Active espace", body: "Profil → Espace commercial." },
        { num: "2", title: "Partage", body: "Avec tes gars de la diaspora." },
        { num: "3", title: "Suis", body: "Inscriptions en temps réel." },
        { num: "4", title: "Reçois", body: "Premier de chaque mois." },
      ],
      cta: { label: "Découvrir le programme", href: "/dashboard/affiliate" },
      smallPrint: "1 niveau, transparent.",
    },
    faqLong: {
      intro: "Les questions qui reviennent.",
      categories: [
        { key: "basics", icon: "👋", label: "Bases", items: [
          { q: "BMD en une phrase?", a: "L'app pour gérer l'argent partagé sans drama." },
          { q: "BMD remplace ma banque?", a: "Non." },
          { q: "Combien?", a: "Gratos: 3 groupes." },
          { q: "Quels appareils?", a: "iPhone, Android, ordi." },
          { q: "Tous doivent s'inscrire?", a: "Non direct." },
        ]},
        { key: "groups", icon: "👥", label: "Groupes", items: [
          { q: "Types?", a: "6 types." },
          { q: "Taille max?", a: "Pas de limite." },
          { q: "Inviter?", a: "Lien, QR." },
          { q: "Retirer?", a: "Oui." },
          { q: "Autres groupes?", a: "Jamais." },
        ]},
        { key: "tontines", icon: "🪙", label: "Tontines", items: [
          { q: "Comment?", a: "Montant + fréquence." },
          { q: "Différences?", a: "Même principe." },
          { q: "Si pas payé?", a: "Rappel auto." },
          { q: "Plusieurs ans?", a: "5 ans." },
        ]},
        { key: "money", icon: "💱", label: "Devises", items: [
          { q: "Quelles?", a: "25+." },
          { q: "Conversion?", a: "Auto." },
          { q: "Commission?", a: "Jamais." },
          { q: "Méthodes?", a: "Toutes." },
          { q: "Plan?", a: "Stripe." },
        ]},
        { key: "expenses", icon: "💸", label: "Dépenses", items: [
          { q: "Scanner?", a: "Photo." },
          { q: "Modifier?", a: "Créateur/admin." },
          { q: "Diviser?", a: "3 modes." },
          { q: "Doublons?", a: "Auto." },
          { q: "Importer?", a: "CSV." },
        ]},
        { key: "settle", icon: "↔", label: "Soldes", items: [
          { q: "Calcul?", a: "Min flux." },
          { q: "Swap?", a: "3 validation." },
          { q: "Payé?", a: "Soldes → Régler." },
          { q: "Disputes?", a: "Validation 2 yoon." },
        ]},
        { key: "privacy", icon: "🛡", label: "Privé", items: [
          { q: "Sécurité?", a: "TLS, EU." },
          { q: "Sans password?", a: "OTP." },
          { q: "Passkey?", a: "Biométrique." },
          { q: "Carnet?", a: "Pas scan." },
          { q: "Supprimer?", a: "Oui." },
          { q: "Exporter?", a: "JSON/CSV." },
        ]},
        { key: "billing", icon: "💳", label: "Forfait", items: [
          { q: "Gratos?", a: "3 groupes." },
          { q: "Pro?", a: "Sans limite." },
          { q: "Event?", a: "29€." },
          { q: "Annuler?", a: "Sans frais." },
          { q: "Pays?", a: "Oui." },
          { q: "Parrainage?", a: "20% à vie." },
        ]},
      ],
      contactNudge: "hello@backmesdo.com.",
    },
    cta: { headline: "Démarre maintenant", body: "Gratos. Pas de carte. 1 minute.", button: "Créer mon compte" },
    footer: { tagline: "L'argent enjaillé. L'amitié blindée.", rights: "Tous droits réservés.", privacy: "Confidentialité", terms: "CGU", contact: "Contact" },
  },

  // ============================================================
  // V18 — 7 nouvelles langues africaines (Hausa, Yoruba, Oromo,
  // Igbo, Fula, Zulu, Akan). Contenu condensé mais complet pour
  // satisfaire le type Record<Locale, MarketingStrings>.
  // ============================================================

  // 🇳🇬 Hausa (Nigeria, Niger, Tchad, Soudan)
  ha: {
    meta: { title: "BMD · Kuɗi tare babu wahala", description: "BMD na taimaka wa diaspora Afrika sarrafa tontines, gidaje, tafiye-tafiye da abubuwan da suka shafi rukuni." },
    nav: { story: "Tarihinmu", features: "Abubuwa", howItWorks: "Yadda yake aiki", pricing: "Farashi", login: "Shiga", signUp: "Buɗe asusu" },
    langPicker: { main: "Manyan harsuna", europeanGroup: "Harsunan Turai", asianGroup: "Harsunan Asiya", arabicGroup: "Harshen Larabci", africanGroup: "Harsunan Afrika" },
    hero: { tagline: "Back Mes Do · Diaspora", headline: "Kuɗi tare. Abota a kiyaye.", subhead: "Tontines, gidajen haɗin gwiwa, tafiye-tafiye, bukukuwan aure, majami'u, ƙungiyoyi: BMD na lissafa, sauƙaƙe, kuma na bin diddigin kowane kashe.", ctaPrimary: "Fara kyauta", ctaSecondary: "Kalli demo" },
    features: { title: "Duk abin da kake bukata, babu kari", items: [
      { icon: "🪙", title: "Tontines cikakke", body: "Zagaye, tsari, kwanaki, tabbatarwa." },
      { icon: "💸", title: "Kashe tare", body: "Daidai, ɓangare ko kashi cikin ɗari." },
      { icon: "↔", title: "Musayar bashi", body: "Tabbatarwa daga ɓangare uku." },
      { icon: "🔔", title: "Sanarwa", body: "Abin da ya shafe ka kawai." },
      { icon: "📷", title: "OCR", body: "Hoton rasit: kuɗi, dillalin, kwanan wata na atomatik." },
      { icon: "🛡", title: "GDPR", body: "Ba a karantar littafin lambobi ba." },
    ]},
    story: {
      kicker: "Tarihinmu",
      title: "Kuɗi bai kamata ya tsadar abota ba",
      punchline: "Dukkanmu mun fuskanci wancan abincin dare inda gidan abinci ya zama kotu. Wancan tontine inda babu wanda ya san wanda ya biya. Wancan tafiya tsakanin yan'uwa wanda ya ƙare a cikin rukunin WhatsApp mai sanyi.",
      chapters: [
        { icon: "🌍", title: "Matsalar", body: "Hauhawar farashi yana cinye komai. Tsadar rayuwa tana fashe a Turai, Kamaru, Dakar, Mumbai. Kowane kuɗi na da muhimmanci." },
        { icon: "💔", title: "Tashin hankali", body: "Excel ba a iya karantawa. WhatsApp ba ya lissafi. Ƙa'idodin Yamma ba su fahimci tontines ba." },
        { icon: "🕊", title: "Maganin", body: "BMD. Kayan aiki ga waɗanda gaske suke raba kuɗinsu. Multi-currency (25+), multi-language (20+), tontines, swap, OCR, bot WhatsApp." },
      ],
      manifesto: "«Muna ƙidaya kowane kobo — don kada mu ƙidaya abokanmu.»",
      cta: "Fara kyauta",
    },
    howItWorks: { title: "A matakai uku", steps: [
      { num: "1", title: "Ƙirƙira rukunin ka", body: "Tontine, gida, tafiya, bikin aure…" },
      { num: "2", title: "Gayyaci ƙaunatattun ka", body: "Hanyar haɗin yanar gizo, QR, lambobi." },
      { num: "3", title: "Rayu cikin natsuwa", body: "BMD na lissafi." },
    ]},
    pricing: { title: "Kyauta ga mafi yawa", free: { name: "Kyauta", price: "0 €", features: ["Har zuwa rukuni 3 masu aiki", "Tontines mara iyaka", "Rasit PDF/hoto", "Sanarwa kammala"] }, pro: { name: "Pro", price: "4,99 €/wata", features: ["Rukuni mara iyaka", "Fitar da lissafin kuɗi", "Tarihi 10 shekara", "Goyon bayan fifiko"], cta: "Nan da nan" } },
    faq: { title: "Tambayoyi", items: [
      { q: "BMD banki ne?", a: "A'a. BMD kayan aikin sarrafawa ne." },
      { q: "Bayanai sun amintacce?", a: "Eh." },
      { q: "Yaya tontine BMD ke aiki?", a: "Ƙirƙira rukuni, saita kuɗi da yawa." },
    ]},
    featuresLong: { intro: "BMD ya ƙunshi duk yanayin da kuɗi ke yawo tsakanin masoya: tontines, gidaje, tafiye-tafiye.", categories: [
      { key: "groups", icon: "👥", label: "Rukuni & matsayi", pitch: "Ƙirƙira rukuni a 30 daƙiƙa.", items: [
        { icon: "🎭", title: "Nau'ikan 6", body: "Tontine, gida, tafiya, taro, ƙungiya, majami'a." },
        { icon: "🛡", title: "Matsayi a sarari", body: "Admin, ma'aji, memba." },
        { icon: "✉️", title: "Gayyatar", body: "Hanyar haɗi, QR, lambobi." },
        { icon: "🎨", title: "Jigo", body: "Zaɓi alamar gani." },
      ]},
      { key: "expenses", icon: "💸", label: "Kashe tare", pitch: "Sa kashe daƙiƙa 5.", items: [
        { icon: "📷", title: "OCR", body: "Hoton rasit." },
        { icon: "⚖️", title: "Daidai · ɓangare · kashi", body: "Modes 3." },
        { icon: "🤖", title: "Shawarar AI", body: "BMD na koyon halaye." },
        { icon: "📜", title: "Dokoki", body: "Sau ɗaya kawai." },
        { icon: "🚨", title: "Gano abubuwan da ba a saba ba", body: "Maimaita, kuɗi mara kyau." },
        { icon: "🏦", title: "Shigo CSV", body: "Daga banki." },
      ]},
      { key: "tontines", icon: "🪙", label: "Tontines", pitch: "Dukkanin tsare-tsare.", items: [
        { icon: "🔄", title: "Zagaye atomatik", body: "Kuɗi, mita, oda." },
        { icon: "🤝", title: "Tabbatarwa biyu", body: "Magani 4-eyes." },
        { icon: "📅", title: "Kalanda", body: "Duk juyi a gani." },
        { icon: "🎯", title: "Gwanjo (Hui)", body: "Don al'ummomin Sinawa." },
        { icon: "📚", title: "Tarihi shekaru", body: "Mafi ƙanƙanci 5 shekara." },
      ]},
      { key: "settle", icon: "↔", label: "Daidaita", pitch: "Mafi ƙarancin musaya.", items: [
        { icon: "🧮", title: "Lokaci na gaske", body: "Multi-currency." },
        { icon: "🎯", title: "Mafi kyau", body: "1 cinikin." },
        { icon: "🔁", title: "Musaya bashi", body: "Tabbatarwa 3-yoon." },
        { icon: "🔗", title: "Hanyoyin biyan kuɗi", body: "Amfani sau ɗaya." },
      ]},
      { key: "money", icon: "💱", label: "Kuɗi da yawa", pitch: "An yi don diaspora.", items: [
        { icon: "🌍", title: "25+ kuɗi", body: "Naira, Euro, Dollar, FCFA." },
        { icon: "💳", title: "Mai jituwa", body: "Lydia, Wave, Wise." },
        { icon: "📈", title: "Sauya kuɗi nan take", body: "Kowane mai yana ganin." },
        { icon: "🧾", title: "Rasidi haraji", body: "Don majami'u." },
      ]},
      { key: "comms", icon: "🔔", label: "Sadarwa", pitch: "Komai ta hanyar sanarwa.", items: [
        { icon: "🛎", title: "Sanarwa madaidaici", body: "Abin da ya shafe ka kawai." },
        { icon: "📅", title: "Takaitawa mako", body: "Kowace Lahadi." },
        { icon: "💬", title: "Bot WhatsApp", body: "Sauti ko rubutu." },
        { icon: "😊", title: "Murya", body: "Abokantaka, wasa." },
        { icon: "🌙", title: "Kar a damu", body: "Tsayar da ƙungiya." },
      ]},
      { key: "intelligence", icon: "🧠", label: "AI", pitch: "BMD na amfani da AI.", items: [
        { icon: "🎙", title: "Whisper", body: "BMD na fassara." },
        { icon: "📊", title: "Kididdiga", body: "Yanayin watan." },
        { icon: "🌐", title: "Fassarar kai", body: "BMD na fassara." },
        { icon: "🔮", title: "Maimaita", body: "BMD na gargaɗi." },
      ]},
      { key: "trust", icon: "🛡", label: "Tsaro", pitch: "GDPR.", items: [
        { icon: "🔑", title: "Babu kalmar sirri", body: "OTP." },
        { icon: "🚫", title: "Babu karatun", body: "Lambobin da aka zaɓa." },
        { icon: "📜", title: "Audit log", body: "Shekaru 5." },
        { icon: "🇪🇺", title: "GDPR", body: "Fitarwa." },
        { icon: "🌐", title: "EU hosting", body: "Server EU." },
      ]},
      { key: "platform", icon: "📱", label: "Dandamali", pitch: "App na asali.", items: [
        { icon: "📲", title: "PWA", body: "iPhone, Android." },
        { icon: "💬", title: "WhatsApp bot", body: "Daƙiƙa 30." },
        { icon: "🌍", title: "Yaruka da yawa", body: "20+." },
        { icon: "♿", title: "Damar shiga", body: "WCAG AA." },
        { icon: "🌗", title: "Yanayin haske/duhu", body: "Sau ɗaya." },
      ]},
    ]},
    referral: { kicker: "Shirin tallace-tallace", title: "Shawara BMD, ka samu", intro: "Shirin sauƙi.", benefits: [
      { icon: "💰", title: "Komishon", body: "20%." },
      { icon: "♾️", title: "Tsawon rai", body: "Rayuwa." },
      { icon: "📊", title: "Daskbod", body: "Bayyananne." },
      { icon: "🎁", title: "Bonus", body: "Ragi." },
    ], howItWorks: [
      { num: "1", title: "Kunna sararin", body: "Profile." },
      { num: "2", title: "Raba", body: "Da hanyar sadarwa." },
      { num: "3", title: "Bi", body: "Lokaci na gaske." },
      { num: "4", title: "Karɓi", body: "Kowane wata na 1." },
    ], cta: { label: "Gano shirin", href: "/dashboard/affiliate" }, smallPrint: "Mataki 1 kawai." },
    faqLong: { intro: "Tambayoyi.", categories: [
      { key: "basics", icon: "👋", label: "Tushe", items: [
        { q: "BMD?", a: "App." }, { q: "Banki?", a: "A'a." }, { q: "Farashi?", a: "Kyauta." }, { q: "Na'urori?", a: "iPhone, Android." }, { q: "Duk?", a: "A'a nan da nan." },
      ]},
      { key: "groups", icon: "👥", label: "Rukuni", items: [
        { q: "Iri?", a: "6." }, { q: "Iyaka?", a: "Babu." }, { q: "Gayyata?", a: "Hanyar haɗi." }, { q: "Cire?", a: "Eh." }, { q: "Ganin sauran?", a: "A'a." },
      ]},
      { key: "tontines", icon: "🪙", label: "Tontines", items: [
        { q: "Yadda?", a: "Saita kuɗi." }, { q: "Bambanci?", a: "Daidai." }, { q: "Idan?", a: "Tunatarwa." }, { q: "Shekaru?", a: "5." },
      ]},
      { key: "money", icon: "💱", label: "Kuɗi", items: [
        { q: "Wanne?", a: "25+." }, { q: "Sauya?", a: "Atomatik." }, { q: "Komishon?", a: "Kar." }, { q: "Hanyoyin?", a: "Duk." }, { q: "Plan?", a: "Stripe." },
      ]},
      { key: "expenses", icon: "💸", label: "Kashe", items: [
        { q: "Skan?", a: "Hoto." }, { q: "Gyara?", a: "Mahalicci." }, { q: "Raba?", a: "3 modes." }, { q: "Maimaita?", a: "Atomatik." }, { q: "CSV?", a: "Eh." },
      ]},
      { key: "settle", icon: "↔", label: "Ma'auni", items: [
        { q: "Kididdiga?", a: "Mafi ƙanƙan." }, { q: "Swap?", a: "3-yoon." }, { q: "Biya?", a: "Daidaita." }, { q: "Rikici?", a: "2-yoon." },
      ]},
      { key: "privacy", icon: "🛡", label: "Sirri", items: [
        { q: "Tsaro?", a: "TLS 1.3." }, { q: "Babu kalmar sirri?", a: "OTP." }, { q: "Passkey?", a: "Biyometrik." }, { q: "Lambobi?", a: "Babu." }, { q: "Goge?", a: "Eh." }, { q: "Fitar?", a: "JSON." },
      ]},
      { key: "billing", icon: "💳", label: "Tsare-tsare", items: [
        { q: "Kyauta?", a: "3." }, { q: "Pro?", a: "Babu iyaka." }, { q: "Event?", a: "29€." }, { q: "Soke?", a: "Kowane lokaci." }, { q: "Ƙasa?", a: "Eh." }, { q: "Shawara?", a: "20%." },
      ]},
    ], contactNudge: "hello@backmesdo.com." },
    cta: { headline: "Fara yanzu", body: "Kyauta. Babu katin. Minti 1.", button: "Buɗe asusu" },
    footer: { tagline: "Kuɗi tare. Abota a kiyaye.", rights: "Duk haƙƙoƙi an kiyaye.", privacy: "Sirri", terms: "Sharuɗɗa", contact: "Tuntuɓi" },
  },

  // 🇳🇬 Yorùbá
  yo: {
    meta: { title: "BMD · Owó tí a pín láìsí dráma", description: "BMD ń ràn àwọn ọmọ Áfríkà ní àjèjì lọ́wọ́ láti ṣàkóso tontines, ìbùgbé pínpín, ìrìnàjò àti àpéjọ ẹgbẹ́." },
    nav: { story: "Ìtàn wa", features: "Àwọn ohun", howItWorks: "Bí ó ṣe ń ṣiṣẹ́", pricing: "Iye owó", login: "Wọlé", signUp: "Forúkọsílẹ̀" },
    langPicker: { main: "Àwọn èdè àkọ́kọ́", europeanGroup: "Àwọn èdè Yúróòpù", asianGroup: "Àwọn èdè Éṣíà", arabicGroup: "Èdè Lárúbáwá", africanGroup: "Àwọn èdè Áfríkà" },
    hero: { tagline: "Back Mes Do · Diaspora", headline: "Owó tí a pín. Ọ̀rẹ́ tí a pa mọ́.", subhead: "Tontines, ìbùgbé pínpín, ìrìnàjò: BMD ṣe ìṣirò, ó ṣe sí mímọ́ ńlá àti tọpinpin gbogbo ìnáwó.", ctaPrimary: "Bẹ̀rẹ̀ ọfẹ́", ctaSecondary: "Wo ìṣàfihàn" },
    features: { title: "Ohun gbogbo, kò sí àwọn àfikún", items: [
      { icon: "🪙", title: "Tontines pípé", body: "Ìyípadà, ọ̀rọ̀, ọjọ́." },
      { icon: "💸", title: "Ìnáwó pínpín", body: "Bákan náà, apá tàbí ìpín." },
      { icon: "↔", title: "Yíyípadà ìgbèsè", body: "Ìfọwọ́sí mẹ́ta." },
      { icon: "🔔", title: "Ìfìlọ̀", body: "Ohun tí ó kàn ọ́." },
      { icon: "📷", title: "OCR", body: "Fọ́tò ìwé ìpamọ́." },
      { icon: "🛡", title: "GDPR", body: "Kò sí kíkà." },
    ]},
    story: {
      kicker: "Ìtàn wa",
      title: "Owó kò gbọ́dọ̀ ná ọ̀rẹ́",
      punchline: "Gbogbo wa ni a ti rí àlẹ́ yẹn nígbà tí oúnjẹ ti di ilé ẹjọ́. Tontine yẹn níbi tí kò sí ẹni tí ó mọ ẹni tí ó ti san. Ìrìnàjò àwọn ìbátan tí ó parí nínú ẹgbẹ́ WhatsApp tí ó tutù.",
      chapters: [
        { icon: "🌍", title: "Ìṣòro", body: "Àfikún owó ń jẹ gbogbo nǹkan. Iye owó ìgbé ayé ń pọ̀ sí i ní Yúróòpù, Cameroon, Dakar, Mumbai." },
        { icon: "💔", title: "Ìjà", body: "Excel kò ṣeé kà. WhatsApp kò ṣe ìṣirò. Àwọn ìránṣẹ́ Ìwọ̀-oòrùn kò mọ tontines." },
        { icon: "🕊", title: "Ojútùú", body: "BMD. Ohun èlò fún àwọn tí wọ́n pín owó wọn nítòótọ́. Èdè púpọ̀, owó púpọ̀, tontines, swap." },
      ],
      manifesto: "«A ka gbogbo kobo — kí a má fi ka àwọn ọ̀rẹ́ wa.»",
      cta: "Bẹ̀rẹ̀ ọfẹ́",
    },
    howItWorks: { title: "Ní ìgbésẹ̀ mẹ́ta", steps: [
      { num: "1", title: "Ṣẹ̀dá ẹgbẹ́ rẹ", body: "Tontine, ilé, ìrìnàjò." },
      { num: "2", title: "Pe àwọn olólùfẹ́", body: "Ọnà, QR, olùbáṣepọ̀." },
      { num: "3", title: "Gbé pẹ̀lú àlàáfíà", body: "BMD ṣe ìṣirò." },
    ]},
    pricing: { title: "Ọfẹ́ fún ọ̀pọ̀lọpọ̀", free: { name: "Ọfẹ́", price: "0 €", features: ["Ẹgbẹ́ 3", "Tontines láìní opin", "Ìwé ìpamọ́ PDF", "Ìfìlọ̀ pípé"] }, pro: { name: "Pro", price: "4,99 €/oṣù", features: ["Ẹgbẹ́ aláìní opin", "Ìjáde", "Ìtàn ọdún 10", "Àtìlẹ́yìn"], cta: "Láìpẹ́" } },
    faq: { title: "Àwọn ìbéèrè", items: [
      { q: "BMD banki?", a: "Bẹ́ẹ̀ kọ́." }, { q: "Ìpamọ́?", a: "Bẹ́ẹ̀ ni." }, { q: "Tontine?", a: "Ṣẹ̀dá ẹgbẹ́." },
    ]},
    featuresLong: { intro: "BMD bo gbogbo ipò.", categories: [
      { key: "groups", icon: "👥", label: "Ẹgbẹ́", pitch: "30 ìṣẹ́jú àáyá.", items: [
        { icon: "🎭", title: "Iru 6", body: "Tontine." }, { icon: "🛡", title: "Ipa", body: "Admin." }, { icon: "✉️", title: "Pípè", body: "Ọnà." }, { icon: "🎨", title: "Àkọlé", body: "Yan." },
      ]},
      { key: "expenses", icon: "💸", label: "Ìnáwó", pitch: "5 ìṣẹ́jú.", items: [
        { icon: "📷", title: "OCR", body: "Fọ́tò." }, { icon: "⚖️", title: "Pínpín", body: "3 modes." }, { icon: "🤖", title: "AI", body: "Kọ́." }, { icon: "📜", title: "Òfin", body: "Ní ẹ̀ẹ̀kan." }, { icon: "🚨", title: "Ìbátan", body: "Tani." }, { icon: "🏦", title: "CSV", body: "Banki." },
      ]},
      { key: "tontines", icon: "🪙", label: "Tontines", pitch: "Gbogbo.", items: [
        { icon: "🔄", title: "Zagaye", body: "Owó." }, { icon: "🤝", title: "Ìdánilójú", body: "Méjì." }, { icon: "📅", title: "Kàlẹ́ńdà", body: "Wo." }, { icon: "🎯", title: "Hui", body: "Ṣáínà." }, { icon: "📚", title: "Ọdún 5", body: "Pípamọ́." },
      ]},
      { key: "settle", icon: "↔", label: "Owó", pitch: "Kéréje.", items: [
        { icon: "🧮", title: "Báyìí", body: "Multi." }, { icon: "🎯", title: "Pípé", body: "1." }, { icon: "🔁", title: "Swap", body: "3-yoon." }, { icon: "🔗", title: "Ọnà", body: "Lóŋbé." },
      ]},
      { key: "money", icon: "💱", label: "Owó", pitch: "Diaspora.", items: [
        { icon: "🌍", title: "25+", body: "Naira." }, { icon: "💳", title: "Ìbámu", body: "Wave." }, { icon: "📈", title: "Báyìí", body: "Lóŋbé." }, { icon: "🧾", title: "Tax", body: "PDF." },
      ]},
      { key: "comms", icon: "🔔", label: "Ìbáraẹnisọ̀rọ̀", pitch: "Ìfìlọ̀.", items: [
        { icon: "🛎", title: "Tinrin", body: "Tirẹ." }, { icon: "📅", title: "Òṣù", body: "Sun." }, { icon: "💬", title: "WhatsApp", body: "Ohùn." }, { icon: "😊", title: "Ohùn", body: "Yàn." }, { icon: "🌙", title: "DND", body: "Mute." },
      ]},
      { key: "intelligence", icon: "🧠", label: "AI", pitch: "BMD lo.", items: [
        { icon: "🎙", title: "Whisper", body: "Tù." }, { icon: "📊", title: "Iṣiro", body: "Òṣù." }, { icon: "🌐", title: "Ìtumọ̀", body: "Auto." }, { icon: "🔮", title: "Ìbátan", body: "Gbígbọ́n." },
      ]},
      { key: "trust", icon: "🛡", label: "Ààbò", pitch: "GDPR.", items: [
        { icon: "🔑", title: "Aláìní ọ̀rọ̀ àṣínà", body: "OTP." }, { icon: "🚫", title: "Aláìka", body: "Yàn." }, { icon: "📜", title: "Aláìpadà", body: "5 ọdún." }, { icon: "🇪🇺", title: "GDPR", body: "Fùnpúpọ̀." }, { icon: "🌐", title: "EU", body: "Ìránṣẹ́." },
      ]},
      { key: "platform", icon: "📱", label: "Ipinlẹ̀", pitch: "App.", items: [
        { icon: "📲", title: "PWA", body: "iPhone." }, { icon: "💬", title: "Bot", body: "30s." }, { icon: "🌍", title: "Èdè púpọ̀", body: "20+." }, { icon: "♿", title: "Wíwọlé", body: "AA." }, { icon: "🌗", title: "Mode", body: "Ìmọ́lẹ̀." },
      ]},
    ]},
    referral: { kicker: "Ètò títà", title: "Sọ BMD", intro: "Ètò.", benefits: [
      { icon: "💰", title: "Owó", body: "20%." }, { icon: "♾️", title: "Ayé", body: "Ìgbà gbogbo." }, { icon: "📊", title: "Pánẹ́ẹ̀lì", body: "Mímọ́." }, { icon: "🎁", title: "Bonus", body: "Ìdín." },
    ], howItWorks: [
      { num: "1", title: "Mu", body: "Profaìl." }, { num: "2", title: "Pínpín", body: "Pẹ̀lú." }, { num: "3", title: "Tẹ̀lé", body: "Báyìí." }, { num: "4", title: "Gba", body: "1 òṣù." },
    ], cta: { label: "Wá ètò", href: "/dashboard/affiliate" }, smallPrint: "Ipele 1." },
    faqLong: { intro: "Ìbéèrè.", categories: [
      { key: "basics", icon: "👋", label: "Ìpilẹ̀", items: [
        { q: "BMD?", a: "App." }, { q: "Banki?", a: "Rárá." }, { q: "Owó?", a: "Ọfẹ́." }, { q: "Ẹrọ?", a: "iPhone." }, { q: "Gbogbo?", a: "Bẹ́ẹ̀ kọ́." },
      ]},
      { key: "groups", icon: "👥", label: "Ẹgbẹ́", items: [
        { q: "Iru?", a: "6." }, { q: "Ìwọn?", a: "Aláìní." }, { q: "Pípè?", a: "Ọnà." }, { q: "Yọ?", a: "Bẹ́ẹ̀ ni." }, { q: "Wo?", a: "Rárá." },
      ]},
      { key: "tontines", icon: "🪙", label: "Tontines", items: [
        { q: "Báwo?", a: "Owó." }, { q: "Ìyàtọ̀?", a: "Bákan náà." }, { q: "Bí?", a: "Ìránti." }, { q: "Ọdún?", a: "5." },
      ]},
      { key: "money", icon: "💱", label: "Owó", items: [
        { q: "Wo?", a: "25+." }, { q: "Yíyípadà?", a: "Ara-ẹni." }, { q: "Owó?", a: "Rárá." }, { q: "Ọnà?", a: "Gbogbo." }, { q: "Ètò?", a: "Stripe." },
      ]},
      { key: "expenses", icon: "💸", label: "Ìnáwó", items: [
        { q: "Skan?", a: "Fọ́tò." }, { q: "Sá?", a: "Olùṣẹ̀dá." }, { q: "Pínpín?", a: "3." }, { q: "Tani?", a: "Auto." }, { q: "CSV?", a: "Bẹ́ẹ̀ ni." },
      ]},
      { key: "settle", icon: "↔", label: "Owó", items: [
        { q: "Iṣiro?", a: "Min." }, { q: "Swap?", a: "3-yoon." }, { q: "San?", a: "Ojú." }, { q: "Pípè?", a: "Méjì." },
      ]},
      { key: "privacy", icon: "🛡", label: "Aṣírí", items: [
        { q: "Ààbò?", a: "TLS." }, { q: "Aláìní?", a: "OTP." }, { q: "Passkey?", a: "Bio." }, { q: "Olùbáṣepọ̀?", a: "Rárá." }, { q: "Yọ?", a: "Bẹ́ẹ̀ ni." }, { q: "Fùn?", a: "JSON." },
      ]},
      { key: "billing", icon: "💳", label: "Ètò", items: [
        { q: "Ọfẹ́?", a: "3." }, { q: "Pro?", a: "Aláìní." }, { q: "Event?", a: "29€." }, { q: "Pa?", a: "Ìgbà." }, { q: "Orílẹ̀?", a: "Bẹ́ẹ̀ ni." }, { q: "Sọ?", a: "20%." },
      ]},
    ], contactNudge: "hello@backmesdo.com." },
    cta: { headline: "Bẹ̀rẹ̀ báyìí", body: "Ọfẹ́. Kò sí kádì.", button: "Ṣẹ̀dá àkọsílẹ̀" },
    footer: { tagline: "Owó pínpín.", rights: "Gbogbo ẹ̀tọ́.", privacy: "Aṣírí", terms: "Àwọn ọ̀rọ̀", contact: "Olùbáṣepọ̀" },
  },

  // 🇪🇹 Afaan Oromoo (Oromo, Ethiopia)
  om: {
    meta: { title: "BMD · Maallaqa walitti qabame, gariin gariin", description: "BMD diaspoora Afriikaa qarshii waliin qabachuuf gargaaru: tontines, mana waliin jiraachuu, imala, fi taatewwan garee." },
    nav: { story: "Seenaa keenya", features: "Amaloota", howItWorks: "Akkamiin hojjeta", pricing: "Gatii", login: "Galchi", signUp: "Galmaa'i" },
    langPicker: { main: "Afaanota Ijoo", europeanGroup: "Afaanota Awurooppaa", asianGroup: "Afaanota Eshiyaa", arabicGroup: "Afaan Arabaa", africanGroup: "Afaanota Afriikaa" },
    hero: { tagline: "Back Mes Do · Diaspora", headline: "Maallaqni waliin. Hiriyummaan eegamaa.", subhead: "Tontines, mana, imala, cidha: BMD ni shallaga, ni salphisa.", ctaPrimary: "Tola jalqabi", ctaSecondary: "Demoo ilaali" },
    features: { title: "Hundi, malee dabalataa", items: [
      { icon: "🪙", title: "Tontines guutuu", body: "Tartiiba, oodii, beessisa." }, { icon: "💸", title: "Baasii waliin", body: "Walqixa, qooda." }, { icon: "↔", title: "Geeddarama idaa", body: "Mirkaneessa sadii." }, { icon: "🔔", title: "Beeksisa", body: "Si ilaalu qofa." }, { icon: "📷", title: "OCR", body: "Foto." }, { icon: "🛡", title: "GDPR", body: "Hindubbifamu." },
    ]},
    story: {
      kicker: "Seenaa keenya",
      title: "Maallaqni gonkumaa hiriyummaa baasii hin qabu",
      punchline: "Hundi keenya irbaata sana mana adabbii ta'e arginee jirra. Tontine sana eenyu akka kaffalee hin beekamne. Imala fira waliin akkasitti garee WhatsApp qaboo keessaa xumure.",
      chapters: [
        { icon: "🌍", title: "Rakkoon", body: "Inflashinii hunda nyaata. Gatii jireenyaa Awurooppaa, Kameruun, Dakar, Mumbaayi keessatti dhuka'aa jira." },
        { icon: "💔", title: "Walxaxxoo", body: "Excel hindubbifamu. WhatsApp hin shallagu. Aappootiin Lixaa tontines hin hubatan." },
        { icon: "🕊", title: "Furmaata", body: "BMD. Meeshaa namoota dhugatti maallaqa isaanii waliin qaban. Sharafa hedduu (25+), afaan hedduu (20+)." },
      ],
      manifesto: "«Sentii hunda lakkoofna — hiriyoota keenya akka hin lakkoofneef.»",
      cta: "Tola jalqabi",
    },
    howItWorks: { title: "Tarkaanfii sadii", steps: [
      { num: "1", title: "Garee uumi", body: "Tontine, mana." }, { num: "2", title: "Affeeri", body: "Hidhuu, QR." }, { num: "3", title: "Tasgabbii", body: "BMD shallaga." },
    ]},
    pricing: { title: "Hedduuf tola", free: { name: "Tola", price: "0 €", features: ["Garee 3", "Tontines daangaa hin qabne", "Beessisa PDF", "Beeksisa guutuu"] }, pro: { name: "Pro", price: "4,99 €/ji'a", features: ["Garee daangaa hin qabne", "Eksportii", "Seenaa waggaa 10", "Deeggarsa"], cta: "Dhihootti" } },
    faq: { title: "Gaaffilee", items: [
      { q: "BMD baankii?", a: "Lakki." }, { q: "Daataa?", a: "Eyyee." }, { q: "Tontine?", a: "Garee uumi." },
    ]},
    featuresLong: { intro: "BMD haalota hunda dabalata.", categories: [
      { key: "groups", icon: "👥", label: "Garee", pitch: "Sekondii 30.", items: [
        { icon: "🎭", title: "Akaakuu 6", body: "Hunda." }, { icon: "🛡", title: "Gahee", body: "Admin." }, { icon: "✉️", title: "Affeerraa", body: "Hidhuu." }, { icon: "🎨", title: "Akaakuu", body: "Filadhu." },
      ]},
      { key: "expenses", icon: "💸", label: "Baasii", pitch: "Sekondii 5.", items: [
        { icon: "📷", title: "OCR", body: "Foto." }, { icon: "⚖️", title: "Hir'isaa", body: "3 modes." }, { icon: "🤖", title: "AI", body: "Barata." }, { icon: "📜", title: "Seerota", body: "Yeroo." }, { icon: "🚨", title: "Yoomeessa", body: "Argi." }, { icon: "🏦", title: "CSV", body: "Baankii." },
      ]},
      { key: "tontines", icon: "🪙", label: "Tontines", pitch: "Hundii.", items: [
        { icon: "🔄", title: "Zagaye", body: "Maallaqa." }, { icon: "🤝", title: "Mirkaneessa", body: "Lama." }, { icon: "📅", title: "Kalandar", body: "Ilaali." }, { icon: "🎯", title: "Hui", body: "Chinaa." }, { icon: "📚", title: "5 ji'a", body: "Kaayyoo." },
      ]},
      { key: "settle", icon: "↔", label: "Hir'isuu", pitch: "Xiqqoo.", items: [
        { icon: "🧮", title: "Yeroo", body: "Multi." }, { icon: "🎯", title: "Filannoo", body: "1 daldaltii." }, { icon: "🔁", title: "Swap", body: "3 mirkaneessa." }, { icon: "🔗", title: "Hidhuu", body: "Yeroo." },
      ]},
      { key: "money", icon: "💱", label: "Sharafa", pitch: "Diaspoora.", items: [
        { icon: "🌍", title: "25+", body: "Hunda." }, { icon: "💳", title: "Walitti", body: "Wave." }, { icon: "📈", title: "Yeroo", body: "Hundi." }, { icon: "🧾", title: "Beessisa gibira", body: "Mana sagada." },
      ]},
      { key: "comms", icon: "🔔", label: "Quunnamtii", pitch: "Beeksisa.", items: [
        { icon: "🛎", title: "Sirrii", body: "Ati." }, { icon: "📅", title: "Torbanee", body: "Dilbata." }, { icon: "💬", title: "WhatsApp", body: "Sagalee." }, { icon: "😊", title: "Sagalee", body: "Filadhu." }, { icon: "🌙", title: "DND", body: "Cal'isa." },
      ]},
      { key: "intelligence", icon: "🧠", label: "AI", pitch: "BMD.", items: [
        { icon: "🎙", title: "Whisper", body: "Galmeessa." }, { icon: "📊", title: "Statistics", body: "Ji'aa." }, { icon: "🌐", title: "Hiika", body: "Auto." }, { icon: "🔮", title: "Yoomeessa", body: "Akeekkachiisa." },
      ]},
      { key: "trust", icon: "🛡", label: "Nageenya", pitch: "GDPR.", items: [
        { icon: "🔑", title: "Sirrumaa malee", body: "OTP." }, { icon: "🚫", title: "Hindubbifamu", body: "Filannoo." }, { icon: "📜", title: "Audit log", body: "5 ji'a." }, { icon: "🇪🇺", title: "GDPR", body: "Eksport." }, { icon: "🌐", title: "EU", body: "Server." },
      ]},
      { key: "platform", icon: "📱", label: "Pilaatformii", pitch: "App.", items: [
        { icon: "📲", title: "PWA", body: "Hundii." }, { icon: "💬", title: "Bot", body: "30s." }, { icon: "🌍", title: "Afaanota", body: "20+." }, { icon: "♿", title: "Galchii", body: "AA." }, { icon: "🌗", title: "Mode", body: "Ifaa." },
      ]},
    ]},
    referral: { kicker: "Saggoo", title: "Akeeki BMD", intro: "Saggoo.", benefits: [
      { icon: "💰", title: "Komishiina", body: "20%." }, { icon: "♾️", title: "Jireenya", body: "Yeroo." }, { icon: "📊", title: "Daashboordii", body: "Ifa." }, { icon: "🎁", title: "Bonus", body: "Hir'isa." },
    ], howItWorks: [
      { num: "1", title: "Banachuu", body: "Profile." }, { num: "2", title: "Qoodi", body: "Network." }, { num: "3", title: "Hordofi", body: "Yeroo." }, { num: "4", title: "Fudhadhu", body: "Ji'a 1." },
    ], cta: { label: "Saggoo argachuu", href: "/dashboard/affiliate" }, smallPrint: "Sadarkaa 1." },
    faqLong: { intro: "Gaaffilee.", categories: [
      { key: "basics", icon: "👋", label: "Bu'uura", items: [
        { q: "BMD?", a: "App." }, { q: "Baankii?", a: "Lakki." }, { q: "Gatii?", a: "Tola." }, { q: "Meeshaa?", a: "iPhone." }, { q: "Hundi?", a: "Lakki." },
      ]},
      { key: "groups", icon: "👥", label: "Garee", items: [
        { q: "Akaakuu?", a: "6." }, { q: "Daangaa?", a: "Hin." }, { q: "Affeeri?", a: "Hidhuu." }, { q: "Bahuu?", a: "Eyyee." }, { q: "Ilaali?", a: "Lakki." },
      ]},
      { key: "tontines", icon: "🪙", label: "Tontines", items: [
        { q: "Akkamitti?", a: "Maallaqa." }, { q: "Garaagarummaa?", a: "Walfakkaata." }, { q: "Yoo?", a: "Yaadachiisa." }, { q: "Waggoota?", a: "5." },
      ]},
      { key: "money", icon: "💱", label: "Sharafa", items: [
        { q: "Kamiin?", a: "25+." }, { q: "Geeddaruu?", a: "Auto." }, { q: "Komishina?", a: "Lakki." }, { q: "Kanneen?", a: "Hundi." }, { q: "Karoora?", a: "Stripe." },
      ]},
      { key: "expenses", icon: "💸", label: "Baasii", items: [
        { q: "Skan?", a: "Foto." }, { q: "Jijjiiri?", a: "Uumtuu." }, { q: "Hiruu?", a: "3." }, { q: "Yoomeessa?", a: "Auto." }, { q: "CSV?", a: "Eyyee." },
      ]},
      { key: "settle", icon: "↔", label: "Walhirisa", items: [
        { q: "Shallagi?", a: "Min." }, { q: "Swap?", a: "3-yoon." }, { q: "Kaffaluu?", a: "Walhirisa." }, { q: "Mormii?", a: "Lama." },
      ]},
      { key: "privacy", icon: "🛡", label: "Iccitii", items: [
        { q: "Nageenya?", a: "TLS." }, { q: "Sirrumaa malee?", a: "OTP." }, { q: "Passkey?", a: "Bio." }, { q: "Daataa?", a: "Lakki." }, { q: "Haquu?", a: "Eyyee." }, { q: "Fùn?", a: "JSON." },
      ]},
      { key: "billing", icon: "💳", label: "Karoora", items: [
        { q: "Tola?", a: "3." }, { q: "Pro?", a: "Daangaa hin qabne." }, { q: "Event?", a: "29€." }, { q: "Haquu?", a: "Yeroo." }, { q: "Biyya?", a: "Eyyee." }, { q: "Saggoo?", a: "20%." },
      ]},
    ], contactNudge: "hello@backmesdo.com." },
    cta: { headline: "Amma jalqabi", body: "Tola. Daqiiqaa 1.", button: "Akkawuntii uumuu" },
    footer: { tagline: "Maallaqa waliin. Hiriyummaa eegamaa.", rights: "Mirgi hundi.", privacy: "Iccitii", terms: "Haalota", contact: "Quunnamtii" },
  },

  // 🇳🇬 Igbo
  ig: {
    meta: { title: "BMD · Ego ekekọrịtara n'enweghị okwu", description: "BMD na-enyere ndị Africa nọ na mba ọzọ aka ịhazi tontines, ụlọ ekekọrịtara, njem na ihe omume òtù." },
    nav: { story: "Akụkọ anyị", features: "Atụmatụ", howItWorks: "Otu o si arụ ọrụ", pricing: "Ọnụahịa", login: "Banye", signUp: "Debanye aha" },
    langPicker: { main: "Asụsụ ndị bụ isi", europeanGroup: "Asụsụ Europe", asianGroup: "Asụsụ Asia", arabicGroup: "Asụsụ Arab", africanGroup: "Asụsụ Africa" },
    hero: { tagline: "Back Mes Do · Diaspora", headline: "Ego ekekọrịtara. Ọbụbụenyi echebere.", subhead: "Tontines, ụlọ, njem, agbamakwụkwọ: BMD na-agbakọ, na-ahazi, na-eso ụzọ ọ bụla ego.", ctaPrimary: "Bido n'efu", ctaSecondary: "Lee demo" },
    features: { title: "Ihe niile, naanị ihe", items: [
      { icon: "🪙", title: "Tontines zuru oke", body: "Okirikiri, usoro." }, { icon: "💸", title: "Mmefu", body: "Ha nha." }, { icon: "↔", title: "Mgbanwe ụgwọ", body: "Nkwado atọ." }, { icon: "🔔", title: "Ọkwa", body: "Naanị gị." }, { icon: "📷", title: "OCR", body: "Foto." }, { icon: "🛡", title: "GDPR", body: "Enweghị ngụgharị." },
    ]},
    story: {
      kicker: "Akụkọ anyị",
      title: "Ego agaghị akwụ ụgwọ ọbụbụenyi",
      punchline: "Anyị niile ahụla nri abalị ahụ ebe ụlọ oriri ghọrọ ụlọikpe. Tontine ahụ ebe ọ dịghị onye maara onye kwụrụ ụgwọ.",
      chapters: [
        { icon: "🌍", title: "Nsogbu", body: "Mmụba ọnụ ahịa na-eri ihe niile. Ọnụahịa ndụ na-arị elu na Europe, Cameroon, Dakar, Mumbai." },
        { icon: "💔", title: "Esemokwu", body: "Excel adịghị mfe ịgụ. WhatsApp anaghị agbakọ. Ngwa ndị Westerner aghọtaghị tontines." },
        { icon: "🕊", title: "Ngwọta", body: "BMD. Ngwá ọrụ maka ndị na-ekekọrịta ego ha n'ezie. Ego dị iche iche (25+), asụsụ dị iche iche (20+)." },
      ],
      manifesto: "«Anyị na-agụ kobọ ọ bụla — ka anyị ghara ịgụ ndị enyi anyị.»",
      cta: "Bido n'efu",
    },
    howItWorks: { title: "Na nzọụkwụ atọ", steps: [
      { num: "1", title: "Mepụta òtù", body: "Tontine, ụlọ." }, { num: "2", title: "Kpọọ", body: "Njikọ, QR." }, { num: "3", title: "Bie n'udo", body: "BMD agbakọ." },
    ]},
    pricing: { title: "N'efu", free: { name: "N'efu", price: "0 €", features: ["3 òtù", "Tontines", "Akwụkwọ azụmaahịa PDF", "Ọkwa zuru ezu"] }, pro: { name: "Pro", price: "4,99 €/ọnwa", features: ["Òtù enweghị oke", "Mbupụ", "Akụkọ ihe mere eme afọ 10", "Nkwado"], cta: "Ọsọsọ" } },
    faq: { title: "Ajụjụ", items: [
      { q: "BMD bụ ụlọakụ?", a: "Mba." }, { q: "Data echekwala?", a: "Ee." }, { q: "Otu BMD tontine si arụ ọrụ?", a: "Mepụta òtù." },
    ]},
    featuresLong: { intro: "BMD na-ekpuchi ọnọdụ niile.", categories: [
      { key: "groups", icon: "👥", label: "Òtù", pitch: "30 sekọnd.", items: [
        { icon: "🎭", title: "Ụdị 6", body: "Niile." }, { icon: "🛡", title: "Ọrụ", body: "Admin." }, { icon: "✉️", title: "Òkù", body: "Njikọ." }, { icon: "🎨", title: "Isiokwu", body: "Họrọ." },
      ]},
      { key: "expenses", icon: "💸", label: "Mmefu", pitch: "Sekọnd 5.", items: [
        { icon: "📷", title: "OCR", body: "Foto." }, { icon: "⚖️", title: "Nkewa", body: "3 modes." }, { icon: "🤖", title: "AI", body: "Mụta." }, { icon: "📜", title: "Iwu", body: "Otu mgbe." }, { icon: "🚨", title: "Mgbasara", body: "Chọta." }, { icon: "🏦", title: "CSV", body: "Ụlọakụ." },
      ]},
      { key: "tontines", icon: "🪙", label: "Tontines", pitch: "Niile.", items: [
        { icon: "🔄", title: "Okirikiri", body: "Auto." }, { icon: "🤝", title: "Nkwenye abụọ", body: "Lama." }, { icon: "📅", title: "Kalịnda", body: "Lee." }, { icon: "🎯", title: "Hui", body: "Chinese." }, { icon: "📚", title: "Afọ 5", body: "Echekwa." },
      ]},
      { key: "settle", icon: "↔", label: "Ụgwọ", pitch: "Pere.", items: [
        { icon: "🧮", title: "Ozugbo", body: "Multi." }, { icon: "🎯", title: "Kacha mma", body: "1 azụmahịa." }, { icon: "🔁", title: "Swap", body: "3-yoon." }, { icon: "🔗", title: "Njikọ", body: "Otu mgbe." },
      ]},
      { key: "money", icon: "💱", label: "Ego", pitch: "Diaspora.", items: [
        { icon: "🌍", title: "25+", body: "Niile." }, { icon: "💳", title: "Dabara", body: "Wave." }, { icon: "📈", title: "Ozugbo", body: "Onye ọ bụla." }, { icon: "🧾", title: "Akwụkwọ azụmaahịa ụtụ", body: "PDF." },
      ]},
      { key: "comms", icon: "🔔", label: "Nzikọrịta", pitch: "Ọkwa.", items: [
        { icon: "🛎", title: "Ngwere", body: "Naanị gị." }, { icon: "📅", title: "Izu", body: "Sondee." }, { icon: "💬", title: "WhatsApp", body: "Olu." }, { icon: "😊", title: "Olu", body: "Họrọ." }, { icon: "🌙", title: "DND", body: "Mute." },
      ]},
      { key: "intelligence", icon: "🧠", label: "AI", pitch: "BMD.", items: [
        { icon: "🎙", title: "Whisper", body: "Dee." }, { icon: "📊", title: "Statistics", body: "Ọnwa." }, { icon: "🌐", title: "Tụgharị", body: "Auto." }, { icon: "🔮", title: "Mgbasara", body: "Dọọ aka na ntị." },
      ]},
      { key: "trust", icon: "🛡", label: "Nchekwa", pitch: "GDPR.", items: [
        { icon: "🔑", title: "Enweghị paswọọdụ", body: "OTP." }, { icon: "🚫", title: "Enweghị ngụgharị", body: "Họrọ." }, { icon: "📜", title: "Audit log", body: "5 afọ." }, { icon: "🇪🇺", title: "GDPR", body: "Mbupụ." }, { icon: "🌐", title: "EU", body: "Sava." },
      ]},
      { key: "platform", icon: "📱", label: "Ọnọdụ", pitch: "App.", items: [
        { icon: "📲", title: "PWA", body: "iPhone." }, { icon: "💬", title: "Bot", body: "30s." }, { icon: "🌍", title: "Asụsụ", body: "20+." }, { icon: "♿", title: "Inweta", body: "AA." }, { icon: "🌗", title: "Mode", body: "Ìhè." },
      ]},
    ]},
    referral: { kicker: "Mmemme", title: "Tụgharịa BMD", intro: "Mmemme.", benefits: [
      { icon: "💰", title: "Ego", body: "20%." }, { icon: "♾️", title: "Ndụ", body: "Mgbe niile." }, { icon: "📊", title: "Daashboodu", body: "Doro anya." }, { icon: "🎁", title: "Bonus", body: "Mbelata." },
    ], howItWorks: [
      { num: "1", title: "Mee ka ọ rụọ ọrụ", body: "Profaịlụ." }, { num: "2", title: "Kekọrịta", body: "Network." }, { num: "3", title: "Soro", body: "Ozugbo." }, { num: "4", title: "Nweta", body: "1 ọnwa." },
    ], cta: { label: "Chọpụta", href: "/dashboard/affiliate" }, smallPrint: "Larịị 1." },
    faqLong: { intro: "Ajụjụ.", categories: [
      { key: "basics", icon: "👋", label: "Ntọala", items: [
        { q: "BMD?", a: "App." }, { q: "Ụlọakụ?", a: "Mba." }, { q: "Ọnụahịa?", a: "N'efu." }, { q: "Ngwaọrụ?", a: "iPhone." }, { q: "Niile?", a: "Mba." },
      ]},
      { key: "groups", icon: "👥", label: "Òtù", items: [
        { q: "Ụdị?", a: "6." }, { q: "Oke?", a: "Enweghị." }, { q: "Òkù?", a: "Njikọ." }, { q: "Wepụ?", a: "Ee." }, { q: "Ndị ọzọ?", a: "Mba." },
      ]},
      { key: "tontines", icon: "🪙", label: "Tontines", items: [
        { q: "Otu?", a: "Ego." }, { q: "Ọdịiche?", a: "Otu." }, { q: "Ọ bụrụ?", a: "Ncheta." }, { q: "Afọ?", a: "5." },
      ]},
      { key: "money", icon: "💱", label: "Ego", items: [
        { q: "Kedu?", a: "25+." }, { q: "Mgbanwe?", a: "Auto." }, { q: "Komishiọn?", a: "Mba." }, { q: "Ụzọ?", a: "Niile." }, { q: "Plan?", a: "Stripe." },
      ]},
      { key: "expenses", icon: "💸", label: "Mmefu", items: [
        { q: "Skan?", a: "Foto." }, { q: "Dezie?", a: "Onye okike." }, { q: "Kewaa?", a: "3." }, { q: "Mgbasara?", a: "Auto." }, { q: "CSV?", a: "Ee." },
      ]},
      { key: "settle", icon: "↔", label: "Ụgwọ", items: [
        { q: "Gbakọọ?", a: "Min." }, { q: "Swap?", a: "3-yoon." }, { q: "Kwụọ?", a: "Họrọ." }, { q: "Esemokwu?", a: "Abụọ." },
      ]},
      { key: "privacy", icon: "🛡", label: "Nzuzo", items: [
        { q: "Nchekwa?", a: "TLS." }, { q: "Enweghị paswọọdụ?", a: "OTP." }, { q: "Passkey?", a: "Bio." }, { q: "Kọntaktị?", a: "Mba." }, { q: "Hichapụ?", a: "Ee." }, { q: "Mbupụ?", a: "JSON." },
      ]},
      { key: "billing", icon: "💳", label: "Atụmatụ", items: [
        { q: "N'efu?", a: "3." }, { q: "Pro?", a: "Enweghị oke." }, { q: "Event?", a: "29€." }, { q: "Kagbuo?", a: "Mgbe niile." }, { q: "Obodo?", a: "Ee." }, { q: "Ntụgharị?", a: "20%." },
      ]},
    ], contactNudge: "hello@backmesdo.com." },
    cta: { headline: "Bido ugbu a", body: "N'efu. Naanị nkeji 1.", button: "Mepụta akaụntụ" },
    footer: { tagline: "Ego ekekọrịtara.", rights: "Ihe niile.", privacy: "Nzuzo", terms: "Usoro", contact: "Kpọọ" },
  },

  // 🇸🇳 Fulfulde / Fula
  ff: {
    meta: { title: "BMD · Kaalisi mootol, ngon kaani", description: "BMD walloto Africa diaspora yiɗi tontines, hoɗoro, jaɓɓingol, e ginki golle." },
    nav: { story: "Daartol amen", features: "Goɓi", howItWorks: "Hol no waɗiri", pricing: "Coggu", login: "Naatu", signUp: "Hottini hisaade" },
    langPicker: { main: "Ɗemɗe mawɗe", europeanGroup: "Ɗemɗe Yuropu", asianGroup: "Ɗemɗe Asi", arabicGroup: "Ɗemngal Arab", africanGroup: "Ɗemɗe Afrik" },
    hero: { tagline: "Back Mes Do · Diaspora", headline: "Kaalisi mootol. Banndiraagal raɓɓini.", subhead: "Tontines, hoɗoro, jaɓɓingol: BMD limanto, jakkido, refto kala kaalisi.", ctaPrimary: "Fuɗɗo neldoyo", ctaSecondary: "Yiy demo" },
    features: { title: "Ko fewi", items: [
      { icon: "🪙", title: "Tontines timminni", body: "Wuro, sara, lebbi." }, { icon: "💸", title: "Mootol", body: "Ɗo ngonɗi." }, { icon: "↔", title: "Wuyloo ñawooje", body: "Lugaaji tati." }, { icon: "🔔", title: "Tinndingol", body: "Ko ñami maa." }, { icon: "📷", title: "OCR", body: "Hoore." }, { icon: "🛡", title: "GDPR", body: "Tinaaki taro." },
    ]},
    story: {
      kicker: "Daartol amen",
      title: "Kaalisi suusataa banndiraagal",
      punchline: "Wonti en kala laaɓi resto wonɗi ñaawirde. Tontine wonɗi gooto faamaani ko fawi. Jaɓɓingol musiɓɓe wonɗi telefon WhatsApp tijoringol.",
      chapters: [
        { icon: "🌍", title: "Caɗeele", body: "Coggu daanaaji ñami nguurnde Yuropu, Kameruun, Dakaar, Mumbaayi." },
        { icon: "💔", title: "Caɗtugol", body: "Excel ɗoftaaki. WhatsApp limataa. Aplikaasiyon Yuropu faamataa tontines." },
        { icon: "🕊", title: "Safaara", body: "BMD. Kaɓirgol mo musiɓɓe moototoo kaalisi mum'en. Kaalisi keewɗi (25+), ɗemɗe keewɗe (20+)." },
      ],
      manifesto: "«Min limanɗen kala kaalisi — fii nde min limanaani musiɓɓe amen.»",
      cta: "Fuɗɗo neldoyo",
    },
    howItWorks: { title: "Tati", steps: [
      { num: "1", title: "Sos goolol", body: "Tontine." }, { num: "2", title: "Hooko", body: "Lien." }, { num: "3", title: "Wuro deeƴɗi", body: "BMD." },
    ]},
    pricing: { title: "Neldoyo", free: { name: "Neldoyo", price: "0 €", features: ["3 goolle", "Tontines", "PDF", "Tinndingol"] }, pro: { name: "Pro", price: "4,99 €/lewru", features: ["Goolle", "Eksport", "10 hitaande", "Wallita"], cta: "Yawayre" } },
    faq: { title: "Naamne", items: [
      { q: "BMD bank?", a: "Alaa." }, { q: "Faaɗum?", a: "Eey." }, { q: "Tontine?", a: "Sos." },
    ]},
    featuresLong: { intro: "BMD haɓɓa.", categories: [
      { key: "groups", icon: "👥", label: "Goolle", pitch: "30s.", items: [
        { icon: "🎭", title: "6 mooli", body: "Niile." }, { icon: "🛡", title: "Ngal", body: "Admin." }, { icon: "✉️", title: "Hooko", body: "Lien." }, { icon: "🎨", title: "Mbeydaari", body: "Suɓo." },
      ]},
      { key: "expenses", icon: "💸", label: "Mootol", pitch: "5s.", items: [
        { icon: "📷", title: "OCR", body: "Hoore." }, { icon: "⚖️", title: "Sara", body: "3." }, { icon: "🤖", title: "AI", body: "Jangoo." }, { icon: "📜", title: "Sariya", body: "Laawol." }, { icon: "🚨", title: "Caɗtu", body: "Yiy." }, { icon: "🏦", title: "CSV", body: "Banki." },
      ]},
      { key: "tontines", icon: "🪙", label: "Tontines", pitch: "Niile.", items: [
        { icon: "🔄", title: "Wuro", body: "Auto." }, { icon: "🤝", title: "Lugaaji ɗiɗi", body: "Tabal." }, { icon: "📅", title: "Calandirewol", body: "Yiy." }, { icon: "🎯", title: "Hui", body: "Chine." }, { icon: "📚", title: "5 hitaande", body: "Cuɓɓinaa." },
      ]},
      { key: "settle", icon: "↔", label: "Yoɓɗe", pitch: "Famɗum.", items: [
        { icon: "🧮", title: "Jamɗum", body: "Multi." }, { icon: "🎯", title: "Maantanaagal", body: "1." }, { icon: "🔁", title: "Swap", body: "Tati." }, { icon: "🔗", title: "Lien", body: "Laawol." },
      ]},
      { key: "money", icon: "💱", label: "Kaalisi", pitch: "Diaspora.", items: [
        { icon: "🌍", title: "25+", body: "Niile." }, { icon: "💳", title: "Naatandirde", body: "Wave." }, { icon: "📈", title: "Yarnde", body: "Kala." }, { icon: "🧾", title: "Coggu lewru", body: "PDF." },
      ]},
      { key: "comms", icon: "🔔", label: "Jokkondiral", pitch: "Tinndingol.", items: [
        { icon: "🛎", title: "Tigi rigi", body: "Maa." }, { icon: "📅", title: "Yontere", body: "Alet." }, { icon: "💬", title: "WhatsApp", body: "Hito." }, { icon: "😊", title: "Hito", body: "Suɓo." }, { icon: "🌙", title: "DND", body: "Daaɗu." },
      ]},
      { key: "intelligence", icon: "🧠", label: "AI", pitch: "BMD.", items: [
        { icon: "🎙", title: "Whisper", body: "Bind." }, { icon: "📊", title: "Limaaji", body: "Lewru." }, { icon: "🌐", title: "Firngo", body: "Auto." }, { icon: "🔮", title: "Caɗtu", body: "Dolla." },
      ]},
      { key: "trust", icon: "🛡", label: "Hisnugol", pitch: "GDPR.", items: [
        { icon: "🔑", title: "Sans password", body: "OTP." }, { icon: "🚫", title: "Tinaaki", body: "Suɓo." }, { icon: "📜", title: "Audit log", body: "5 hitaande." }, { icon: "🇪🇺", title: "GDPR", body: "Eksport." }, { icon: "🌐", title: "EU", body: "Sava." },
      ]},
      { key: "platform", icon: "📱", label: "Plateforme", pitch: "App.", items: [
        { icon: "📲", title: "PWA", body: "iPhone." }, { icon: "💬", title: "Bot", body: "30s." }, { icon: "🌍", title: "Ɗemɗe", body: "20+." }, { icon: "♿", title: "Naatngo", body: "AA." }, { icon: "🌗", title: "Mode", body: "Ifaa." },
      ]},
    ]},
    referral: { kicker: "Coggu", title: "Hooko BMD", intro: "Coggu.", benefits: [
      { icon: "💰", title: "Komisiyon", body: "20%." }, { icon: "♾️", title: "Ngurrunde", body: "Sahaa." }, { icon: "📊", title: "Tabaloo", body: "Laaɓɗo." }, { icon: "🎁", title: "Bonus", body: "Famɗingol." },
    ], howItWorks: [
      { num: "1", title: "Goll", body: "Profil." }, { num: "2", title: "Hooko", body: "Network." }, { num: "3", title: "Refto", body: "Yarnde." }, { num: "4", title: "Heɓ", body: "Lewru 1." },
    ], cta: { label: "Yiy", href: "/dashboard/affiliate" }, smallPrint: "Tolno 1." },
    faqLong: { intro: "Naamne.", categories: [
      { key: "basics", icon: "👋", label: "Asakal", items: [
        { q: "BMD?", a: "App." }, { q: "Bank?", a: "Alaa." }, { q: "Coggu?", a: "Neldoyo." }, { q: "Kaɓirɗe?", a: "iPhone." }, { q: "Fof?", a: "Alaa." },
      ]},
      { key: "groups", icon: "👥", label: "Goolle", items: [
        { q: "Mooli?", a: "6." }, { q: "Limɗum?", a: "Alaa." }, { q: "Hooko?", a: "Lien." }, { q: "Yaltinde?", a: "Eey." }, { q: "Yiyaade?", a: "Alaa." },
      ]},
      { key: "tontines", icon: "🪙", label: "Tontines", items: [
        { q: "No?", a: "Coggu." }, { q: "Lannya?", a: "Gooto." }, { q: "Yo?", a: "Tinndinde." }, { q: "Hitaande?", a: "5." },
      ]},
      { key: "money", icon: "💱", label: "Kaalisi", items: [
        { q: "Hol?", a: "25+." }, { q: "Wayli?", a: "Auto." }, { q: "Komisiyon?", a: "Alaa." }, { q: "Laabi?", a: "Niile." }, { q: "Plan?", a: "Stripe." },
      ]},
      { key: "expenses", icon: "💸", label: "Mootol", items: [
        { q: "Skan?", a: "Hoore." }, { q: "Edit?", a: "Sosɗo." }, { q: "Sara?", a: "3." }, { q: "Caɗtu?", a: "Auto." }, { q: "CSV?", a: "Eey." },
      ]},
      { key: "settle", icon: "↔", label: "Yoɓɗe", items: [
        { q: "Limooje?", a: "Min." }, { q: "Swap?", a: "Tati." }, { q: "Hisaade?", a: "Yoɓ." }, { q: "Calɗi?", a: "Ɗiɗi." },
      ]},
      { key: "privacy", icon: "🛡", label: "Suturaal", items: [
        { q: "Hisnugol?", a: "TLS." }, { q: "Sans password?", a: "OTP." }, { q: "Passkey?", a: "Bio." }, { q: "Kontak?", a: "Alaa." }, { q: "Yaltin?", a: "Eey." }, { q: "Eksport?", a: "JSON." },
      ]},
      { key: "billing", icon: "💳", label: "Tippudi", items: [
        { q: "Neldoyo?", a: "3." }, { q: "Pro?", a: "Sans." }, { q: "Event?", a: "29€." }, { q: "Haɓɓi?", a: "Sahaa." }, { q: "Leydi?", a: "Eey." }, { q: "Hooko?", a: "20%." },
      ]},
    ], contactNudge: "hello@backmesdo.com." },
    cta: { headline: "Fuɗɗo jooni", body: "Neldoyo. Hojom 1.", button: "Hottini hisaade" },
    footer: { tagline: "Kaalisi mootol.", rights: "Sago fof.", privacy: "Suturaal", terms: "Sariya", contact: "Hokoo" },
  },

  // 🇿🇦 isiZulu
  zu: {
    meta: { title: "BMD · Imali ehlukaniswa ngaphandle kwedrama", description: "I-BMD isiza i-diaspora yase-Afrika ukulawula i-tontines, indlu eyabiwe, uhambo nemicimbi yamaqembu." },
    nav: { story: "Indaba yethu", features: "Izici", howItWorks: "Indlela esebenza ngayo", pricing: "Amanani", login: "Ngena", signUp: "Bhalisa" },
    langPicker: { main: "Izilimi eziyinhloko", europeanGroup: "Izilimi zase-Europe", asianGroup: "Izilimi zase-Asia", arabicGroup: "Isi-Arabhu", africanGroup: "Izilimi zase-Afrika" },
    hero: { tagline: "Back Mes Do · Diaspora", headline: "Imali ehlukaniswa. Ubungane buvikelwe.", subhead: "I-Tontines, indlu eyabiwe, uhambo: i-BMD ibala, yenze lula futhi ilandelele yonke imali.", ctaPrimary: "Qala mahhala", ctaSecondary: "Buka i-demo" },
    features: { title: "Konke okudingayo", items: [
      { icon: "🪙", title: "I-Tontines ephelele", body: "Umjikelezo, oda." }, { icon: "💸", title: "Izindleko", body: "Ezilinganayo." }, { icon: "↔", title: "Ushintsho", body: "Ukuqinisekisa kwemibili." }, { icon: "🔔", title: "Izaziso", body: "Lokho okukuqondene nawe." }, { icon: "📷", title: "OCR", body: "Isithombe." }, { icon: "🛡", title: "GDPR", body: "Akukho ukufunda." },
    ]},
    story: {
      kicker: "Indaba yethu",
      title: "Imali akufanele ibize ubungani",
      punchline: "Sonke siye sabona lokho kudla kwasebusuku lapho indawo yokudlela yaba inkantolo. I-tontine lapho akekho owayazi ukuthi ubani okhokhile.",
      chapters: [
        { icon: "🌍", title: "Inkinga", body: "I-inflation idla yonke into. Izindleko zokuphila zikhuphuka e-Europe, e-Cameroon, e-Dakar, e-Mumbai." },
        { icon: "💔", title: "Ukunyanya", body: "I-Excel ayifundeki. I-WhatsApp ayibali. Izinhlelo zase-Western azizwa i-tontines." },
        { icon: "🕊", title: "Isisombululo", body: "I-BMD. Ithuluzi labantu abahlanganyela imali yabo ngempela. Izinhlobonhlobo zezimali (25+), izilimi (20+)." },
      ],
      manifesto: "«Sibala isenti ngayinye — ukuze singabali abangani bethu.»",
      cta: "Qala mahhala",
    },
    howItWorks: { title: "Ngezinyathelo ezintathu", steps: [
      { num: "1", title: "Dala iqembu", body: "Tontine, indlu." }, { num: "2", title: "Mema abantu bakho", body: "Isixhumanisi, QR." }, { num: "3", title: "Phila ngokuthula", body: "I-BMD ibala." },
    ]},
    pricing: { title: "Mahhala", free: { name: "Mahhala", price: "0 €", features: ["3 amaqembu", "Tontines ezingenamkhawulo", "Iziqinisekiso ze-PDF", "Izaziso eziphelele"] }, pro: { name: "Pro", price: "4,99 €/inyanga", features: ["Amaqembu angenamkhawulo", "Ukuthekelisa", "Umlando weminyaka eyi-10", "Ukusekelwa"], cta: "Maduze" } },
    faq: { title: "Imibuzo", items: [
      { q: "I-BMD yibhange?", a: "Cha." }, { q: "Idatha?", a: "Yebo." }, { q: "I-tontine?", a: "Dala iqembu." },
    ]},
    featuresLong: { intro: "I-BMD ihlanganisa zonke izimo.", categories: [
      { key: "groups", icon: "👥", label: "Amaqembu", pitch: "30 amasekhondi.", items: [
        { icon: "🎭", title: "6 izinhlobo", body: "Konke." }, { icon: "🛡", title: "Izindima", body: "Admin." }, { icon: "✉️", title: "Izimemo", body: "Isixhumanisi." }, { icon: "🎨", title: "Itimu", body: "Khetha." },
      ]},
      { key: "expenses", icon: "💸", label: "Izindleko", pitch: "5 amasekhondi.", items: [
        { icon: "📷", title: "OCR", body: "Isithombe." }, { icon: "⚖️", title: "Ukuhlukanisa", body: "3." }, { icon: "🤖", title: "AI", body: "Funda." }, { icon: "📜", title: "Imithetho", body: "Kanye." }, { icon: "🚨", title: "Ukuthola", body: "Bona." }, { icon: "🏦", title: "CSV", body: "Ibhange." },
      ]},
      { key: "tontines", icon: "🪙", label: "Tontines", pitch: "Konke.", items: [
        { icon: "🔄", title: "Umjikelezo", body: "Auto." }, { icon: "🤝", title: "Ukuqinisekisa", body: "Kabili." }, { icon: "📅", title: "Ikhalenda", body: "Buka." }, { icon: "🎯", title: "Hui", body: "Chinese." }, { icon: "📚", title: "5 iminyaka", body: "Igciniwe." },
      ]},
      { key: "settle", icon: "↔", label: "Ukubhalansa", pitch: "Encane.", items: [
        { icon: "🧮", title: "Ngesikhathi sangempela", body: "Multi." }, { icon: "🎯", title: "Engcono", body: "1 ukuthengiselana." }, { icon: "🔁", title: "Swap", body: "3-yoon." }, { icon: "🔗", title: "Izixhumanisi", body: "Kanye." },
      ]},
      { key: "money", icon: "💱", label: "Imali", pitch: "Diaspora.", items: [
        { icon: "🌍", title: "25+", body: "Konke." }, { icon: "💳", title: "Ehambelana", body: "Wave." }, { icon: "📈", title: "Ukuguqulwa", body: "Wonke." }, { icon: "🧾", title: "Iziqinisekiso zentela", body: "PDF." },
      ]},
      { key: "comms", icon: "🔔", label: "Ukuxhumana", pitch: "Izaziso.", items: [
        { icon: "🛎", title: "Ezinemininingwane", body: "Wena kuphela." }, { icon: "📅", title: "Isikhumbuzo sesonto", body: "ISonto." }, { icon: "💬", title: "WhatsApp", body: "Izwi." }, { icon: "😊", title: "Iphimbo", body: "Khetha." }, { icon: "🌙", title: "DND", body: "Thulisa." },
      ]},
      { key: "intelligence", icon: "🧠", label: "AI", pitch: "BMD.", items: [
        { icon: "🎙", title: "Whisper", body: "Bhala." }, { icon: "📊", title: "Izibalo", body: "Inyangazonke." }, { icon: "🌐", title: "Ukuhumusha", body: "Auto." }, { icon: "🔮", title: "Ukungafani", body: "Xwayisa." },
      ]},
      { key: "trust", icon: "🛡", label: "Ukuphepha", pitch: "GDPR.", items: [
        { icon: "🔑", title: "Ngaphandle kwephasiwedi", body: "OTP." }, { icon: "🚫", title: "Akukho ukufunda", body: "Khethiwe." }, { icon: "📜", title: "I-Audit log", body: "5 iminyaka." }, { icon: "🇪🇺", title: "GDPR", body: "Thumela." }, { icon: "🌐", title: "EU", body: "Iseva." },
      ]},
      { key: "platform", icon: "📱", label: "Iziphakeli", pitch: "App.", items: [
        { icon: "📲", title: "PWA", body: "iPhone." }, { icon: "💬", title: "Bot", body: "30s." }, { icon: "🌍", title: "Izilimi", body: "20+." }, { icon: "♿", title: "Ukufinyelela", body: "AA." }, { icon: "🌗", title: "Imodi", body: "Ukukhanya." },
      ]},
    ]},
    referral: { kicker: "Uhlelo", title: "Tusa i-BMD", intro: "Uhlelo.", benefits: [
      { icon: "💰", title: "Ikhomishini", body: "20%." }, { icon: "♾️", title: "Ngonaphakade", body: "Impilo." }, { icon: "📊", title: "I-dashboard", body: "Esobala." }, { icon: "🎁", title: "Bonus", body: "Isaphulelo." },
    ], howItWorks: [
      { num: "1", title: "Vula isikhala", body: "I-Profile." }, { num: "2", title: "Yabela", body: "Inethiwekhi." }, { num: "3", title: "Landela", body: "Ngokwesikhathi sangempela." }, { num: "4", title: "Thola", body: "1 inyanga." },
    ], cta: { label: "Thola uhlelo", href: "/dashboard/affiliate" }, smallPrint: "Izinga elilodwa." },
    faqLong: { intro: "Imibuzo.", categories: [
      { key: "basics", icon: "👋", label: "Okuyisisekelo", items: [
        { q: "BMD?", a: "Uhlelo." }, { q: "Ibhange?", a: "Cha." }, { q: "Inani?", a: "Mahhala." }, { q: "Amadivayisi?", a: "iPhone." }, { q: "Konke?", a: "Cha." },
      ]},
      { key: "groups", icon: "👥", label: "Amaqembu", items: [
        { q: "Izinhlobo?", a: "6." }, { q: "Usayizi?", a: "Lutho." }, { q: "Mema?", a: "Isixhumanisi." }, { q: "Susa?", a: "Yebo." }, { q: "Bona?", a: "Cha." },
      ]},
      { key: "tontines", icon: "🪙", label: "Tontines", items: [
        { q: "Kanjani?", a: "Imali." }, { q: "Umehluko?", a: "Kuyafana." }, { q: "Uma?", a: "Isikhumbuzo." }, { q: "Iminyaka?", a: "5." },
      ]},
      { key: "money", icon: "💱", label: "Imali", items: [
        { q: "Yiziphi?", a: "25+." }, { q: "Ukuguqulwa?", a: "Auto." }, { q: "Ikhomishini?", a: "Cha." }, { q: "Izindlela?", a: "Konke." }, { q: "Uhlelo?", a: "Stripe." },
      ]},
      { key: "expenses", icon: "💸", label: "Izindleko", items: [
        { q: "Skena?", a: "Isithombe." }, { q: "Hlela?", a: "Umdali." }, { q: "Hlukanisa?", a: "3." }, { q: "Ngokufana?", a: "Auto." }, { q: "CSV?", a: "Yebo." },
      ]},
      { key: "settle", icon: "↔", label: "Ibhalansi", items: [
        { q: "Bala?", a: "Min." }, { q: "Swap?", a: "3-yoon." }, { q: "Khokhile?", a: "Hlukanisa." }, { q: "Izinkinga?", a: "Kabili." },
      ]},
      { key: "privacy", icon: "🛡", label: "Imfihlo", items: [
        { q: "Ukuphepha?", a: "TLS." }, { q: "Ngaphandle?", a: "OTP." }, { q: "Passkey?", a: "Bio." }, { q: "Othintana?", a: "Cha." }, { q: "Susa?", a: "Yebo." }, { q: "Thumela?", a: "JSON." },
      ]},
      { key: "billing", icon: "💳", label: "Amapulani", items: [
        { q: "Mahhala?", a: "3." }, { q: "Pro?", a: "Akunamkhawulo." }, { q: "Event?", a: "29€." }, { q: "Khansela?", a: "Nganoma yisiphi." }, { q: "Izwe?", a: "Yebo." }, { q: "Ushikilelo?", a: "20%." },
      ]},
    ], contactNudge: "hello@backmesdo.com." },
    cta: { headline: "Qala manje", body: "Mahhala. Ngomzuzu owodwa.", button: "Dala i-akhawunti" },
    footer: { tagline: "Imali ehlukaniswa.", rights: "Wonke amalungelo.", privacy: "Imfihlo", terms: "Imigomo", contact: "Othintana" },
  },

  // 🇬🇭 Akan / Twi
  ak: {
    meta: { title: "BMD · Sika a yɛkyɛ a basabasa biara nni mu", description: "BMD boa Africa amanaman ne mma a wɔwɔ amannɔne ma wɔtumi hwɛ tontines, ofi a wɔbom kyɛ, akwantu ne ɔman dwumadie." },
    nav: { story: "Yɛn asɛm", features: "Nneɛma a etumi yɛ", howItWorks: "Sɛnea ɛyɛ adwuma", pricing: "Bo a ɛyɛ", login: "Hyɛn mu", signUp: "Krataa" },
    langPicker: { main: "Kasa atitire", europeanGroup: "Europe kasa", asianGroup: "Asia kasa", arabicGroup: "Arab kasa", africanGroup: "Africa kasa" },
    hero: { tagline: "Back Mes Do · Diaspora", headline: "Sika a yɛkyɛ. Adamfofa a yɛbɔ ho ban.", subhead: "Tontines, ofi, akwantu, ayɛforɔhyia: BMD bu, ma ɛyɛ mmerɛw na hwɛ ka biara.", ctaPrimary: "Hyɛ ase kwa", ctaSecondary: "Hwɛ demo" },
    features: { title: "Biribiara a wohia", items: [
      { icon: "🪙", title: "Tontines a ɛyɛ pɛ", body: "Twa, oda, akoma." }, { icon: "💸", title: "Sɛkyɛ", body: "Pɛ." }, { icon: "↔", title: "Ka mu sesa", body: "Nsɔhwɛ baasa." }, { icon: "🔔", title: "Akwankyerɛ", body: "Wo nko." }, { icon: "📷", title: "OCR", body: "Mfonin." }, { icon: "🛡", title: "GDPR", body: "Wonkenkan." },
    ]},
    story: {
      kicker: "Yɛn asɛm",
      title: "Sika ɛnsɛ sɛ ɛbɔ adamfofa",
      punchline: "Yɛn nyinaa ahu saa anwummerɛ adidi a aduanee dan asomuayi. Saa tontine a obiara nnim onipa ko a watua.",
      chapters: [
        { icon: "🌍", title: "Asɛm", body: "Bo a ɛkɔ soro renya biribiara. Nkwa bo rekɔ soro wɔ Europe, Cameroon, Dakar, Mumbai mu." },
        { icon: "💔", title: "Adwennwen", body: "Excel mfa nkenkan. WhatsApp mmu. Western nnwuma ntena tontines mu." },
        { icon: "🕊", title: "Ano gye", body: "BMD. Adwumayɛ ma wɔn a wɔkyɛ wɔn sika ampa. Sika ahodoɔ (25+), kasa ahodoɔ (20+)." },
      ],
      manifesto: "«Yɛkan kobo biara — sɛnea yɛrenkan yɛn nnamfo.»",
      cta: "Hyɛ ase kwa",
    },
    howItWorks: { title: "Anammɔn miɛnsa", steps: [
      { num: "1", title: "Bɔ wo kuw", body: "Tontine." }, { num: "2", title: "Frɛ wo nkurɔfo", body: "Link, QR." }, { num: "3", title: "Tena ase", body: "BMD bu." },
    ]},
    pricing: { title: "Kwa", free: { name: "Kwa", price: "0 €", features: ["Akuw 3", "Tontines a anhwɛ", "Akrataa PDF", "Akwankyerɛ"] }, pro: { name: "Pro", price: "4,99 €/bosome", features: ["Akuw a anhwɛ", "Yi", "Mfe 10 abakɔsɛm", "Mmoa"], cta: "Ɛrebɛba" } },
    faq: { title: "Nsɛmmisa", items: [
      { q: "BMD yɛ banki?", a: "Dabi." }, { q: "Data?", a: "Aane." }, { q: "Tontine?", a: "Bɔ kuw." },
    ]},
    featuresLong: { intro: "BMD kata.", categories: [
      { key: "groups", icon: "👥", label: "Akuw", pitch: "30 sɛkɛnt.", items: [
        { icon: "🎭", title: "Akuw 6", body: "Nyinaa." }, { icon: "🛡", title: "Dwumadie", body: "Admin." }, { icon: "✉️", title: "Frɛ", body: "Link." }, { icon: "🎨", title: "Asɛm", body: "Yi." },
      ]},
      { key: "expenses", icon: "💸", label: "Sɛkyɛ", pitch: "5 sɛkɛnt.", items: [
        { icon: "📷", title: "OCR", body: "Mfonin." }, { icon: "⚖️", title: "Kyɛ", body: "3." }, { icon: "🤖", title: "AI", body: "Sua." }, { icon: "📜", title: "Mmara", body: "Pɛnkoro." }, { icon: "🚨", title: "Hu", body: "Hyia." }, { icon: "🏦", title: "CSV", body: "Banki." },
      ]},
      { key: "tontines", icon: "🪙", label: "Tontines", pitch: "Nyinaa.", items: [
        { icon: "🔄", title: "Twa", body: "Auto." }, { icon: "🤝", title: "Nsɔhwɛ mmienu", body: "Tabal." }, { icon: "📅", title: "Akakraba", body: "Hwɛ." }, { icon: "🎯", title: "Hui", body: "Chinese." }, { icon: "📚", title: "Mfe 5", body: "Sie." },
      ]},
      { key: "settle", icon: "↔", label: "Akontaabu", pitch: "Kakra.", items: [
        { icon: "🧮", title: "Bere ankasa", body: "Multi." }, { icon: "🎯", title: "Pa", body: "1." }, { icon: "🔁", title: "Swap", body: "Baasa." }, { icon: "🔗", title: "Link", body: "Pɛ." },
      ]},
      { key: "money", icon: "💱", label: "Sika", pitch: "Diaspora.", items: [
        { icon: "🌍", title: "25+", body: "Nyinaa." }, { icon: "💳", title: "Hyia", body: "Wave." }, { icon: "📈", title: "Sesa", body: "Obiara." }, { icon: "🧾", title: "Tax", body: "PDF." },
      ]},
      { key: "comms", icon: "🔔", label: "Nkitahodi", pitch: "Akwankyerɛ.", items: [
        { icon: "🛎", title: "Pɛɛ", body: "Wo." }, { icon: "📅", title: "Nnawɔtwe", body: "Kwasiada." }, { icon: "💬", title: "WhatsApp", body: "Nne." }, { icon: "😊", title: "Nne", body: "Yi." }, { icon: "🌙", title: "DND", body: "Sii." },
      ]},
      { key: "intelligence", icon: "🧠", label: "AI", pitch: "BMD.", items: [
        { icon: "🎙", title: "Whisper", body: "Twerɛ." }, { icon: "📊", title: "Akontaabu", body: "Bosome." }, { icon: "🌐", title: "Kasa-sesa", body: "Auto." }, { icon: "🔮", title: "Hu", body: "Kɔkɔ." },
      ]},
      { key: "trust", icon: "🛡", label: "Banbɔ", pitch: "GDPR.", items: [
        { icon: "🔑", title: "Sɛn password", body: "OTP." }, { icon: "🚫", title: "Wokenkan", body: "Yi." }, { icon: "📜", title: "Audit log", body: "Mfe 5." }, { icon: "🇪🇺", title: "GDPR", body: "Yi." }, { icon: "🌐", title: "EU", body: "Sava." },
      ]},
      { key: "platform", icon: "📱", label: "Beae", pitch: "App.", items: [
        { icon: "📲", title: "PWA", body: "iPhone." }, { icon: "💬", title: "Bot", body: "30s." }, { icon: "🌍", title: "Kasa", body: "20+." }, { icon: "♿", title: "Kohwe", body: "AA." }, { icon: "🌗", title: "Mode", body: "Hann." },
      ]},
    ]},
    referral: { kicker: "Dwumadie", title: "Ka BMD ho asɛm", intro: "Dwumadie.", benefits: [
      { icon: "💰", title: "Akatua", body: "20%." }, { icon: "♾️", title: "Nkwa", body: "Daa." }, { icon: "📊", title: "Dashboard", body: "Wɔ hu." }, { icon: "🎁", title: "Bonus", body: "Te so." },
    ], howItWorks: [
      { num: "1", title: "Bue", body: "Profil." }, { num: "2", title: "Kyɛ", body: "Network." }, { num: "3", title: "Di akyi", body: "Bere." }, { num: "4", title: "Nya", body: "Bosome 1." },
    ], cta: { label: "Hu", href: "/dashboard/affiliate" }, smallPrint: "Anammɔn 1." },
    faqLong: { intro: "Nsɛmmisa.", categories: [
      { key: "basics", icon: "👋", label: "Nnyinasoɔ", items: [
        { q: "BMD?", a: "App." }, { q: "Banki?", a: "Dabi." }, { q: "Bo?", a: "Kwa." }, { q: "Nnoɔma?", a: "iPhone." }, { q: "Nyinaa?", a: "Dabi." },
      ]},
      { key: "groups", icon: "👥", label: "Akuw", items: [
        { q: "Ahodoɔ?", a: "6." }, { q: "Akɛse?", a: "Mma." }, { q: "Frɛ?", a: "Link." }, { q: "Yi?", a: "Aane." }, { q: "Hwɛ?", a: "Dabi." },
      ]},
      { key: "tontines", icon: "🪙", label: "Tontines", items: [
        { q: "Sɛnea?", a: "Sika." }, { q: "Nsonsonoeɛ?", a: "Pɛ." }, { q: "Sɛ?", a: "Kae." }, { q: "Mfe?", a: "5." },
      ]},
      { key: "money", icon: "💱", label: "Sika", items: [
        { q: "Bɛn?", a: "25+." }, { q: "Sesa?", a: "Auto." }, { q: "Akatua?", a: "Dabi." }, { q: "Akwan?", a: "Nyinaa." }, { q: "Nhyehyɛeɛ?", a: "Stripe." },
      ]},
      { key: "expenses", icon: "💸", label: "Sɛkyɛ", items: [
        { q: "Skan?", a: "Mfonin." }, { q: "Sesa?", a: "Bɔni." }, { q: "Kyɛ?", a: "3." }, { q: "Saa ara?", a: "Auto." }, { q: "CSV?", a: "Aane." },
      ]},
      { key: "settle", icon: "↔", label: "Akontaabu", items: [
        { q: "Buabua?", a: "Min." }, { q: "Swap?", a: "Baasa." }, { q: "Tua?", a: "Si." }, { q: "Akasakasa?", a: "Mmienu." },
      ]},
      { key: "privacy", icon: "🛡", label: "Kokoamsɛm", items: [
        { q: "Banbɔ?", a: "TLS." }, { q: "Sɛn password?", a: "OTP." }, { q: "Passkey?", a: "Bio." }, { q: "Akontaeɛ?", a: "Dabi." }, { q: "Yi?", a: "Aane." }, { q: "Yi?", a: "JSON." },
      ]},
      { key: "billing", icon: "💳", label: "Nhyehyɛe", items: [
        { q: "Kwa?", a: "3." }, { q: "Pro?", a: "Sɛn anhwɛ." }, { q: "Event?", a: "29€." }, { q: "Twa?", a: "Bere." }, { q: "Ɔman?", a: "Aane." }, { q: "Ka?", a: "20%." },
      ]},
    ], contactNudge: "hello@backmesdo.com." },
    cta: { headline: "Hyɛ ase seesei", body: "Kwa. Simma 1.", button: "Bɔ akawunt" },
    footer: { tagline: "Sika a yɛkyɛ.", rights: "Hokan nyinaa.", privacy: "Kokoamsɛm", terms: "Mmara", contact: "Akontaeɛ" },
  },
};

export function detectLocale(): Locale {
  if (typeof window === "undefined") return "fr";
  const saved = localStorage.getItem("bmd_locale") as Locale | null;
  if (saved && LOCALES.includes(saved)) return saved;
  const lang = navigator.language.toLowerCase().slice(0, 2);
  if (LOCALES.includes(lang as Locale)) return lang as Locale;
  return "fr";
}

export function setLocale(loc: Locale) {
  if (typeof window === "undefined") return;
  localStorage.setItem("bmd_locale", loc);
}

export function isRtl(loc: Locale): boolean {
  return loc === "ar";
}
