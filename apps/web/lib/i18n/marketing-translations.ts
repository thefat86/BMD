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

export const LOCALES = ["fr", "en", "es", "pt", "ar", "sw"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_NAMES: Record<Locale, string> = {
  fr: "Français",
  en: "English",
  es: "Español",
  pt: "Português",
  ar: "العربية",
  sw: "Kiswahili",
};

export const LOCALE_FLAGS: Record<Locale, string> = {
  fr: "🇫🇷",
  en: "🇬🇧",
  es: "🇪🇸",
  pt: "🇵🇹",
  ar: "🇲🇦",
  sw: "🇰🇪",
};

interface MarketingStrings {
  meta: { title: string; description: string };
  nav: {
    features: string;
    howItWorks: string;
    pricing: string;
    login: string;
    signUp: string;
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
      features: "Fonctionnalités",
      howItWorks: "Comment ça marche",
      pricing: "Tarifs",
      login: "Se connecter",
      signUp: "Créer un compte",
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
      features: "Features",
      howItWorks: "How it works",
      pricing: "Pricing",
      login: "Sign in",
      signUp: "Sign up",
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
      features: "Funciones",
      howItWorks: "Cómo funciona",
      pricing: "Precios",
      login: "Iniciar sesión",
      signUp: "Crear cuenta",
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
      features: "Recursos",
      howItWorks: "Como funciona",
      pricing: "Preços",
      login: "Entrar",
      signUp: "Criar conta",
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
  ar: {
    meta: {
      title: "BMD · أموال مشتركة بدون دراما",
      description:
        "تساعد BMD الجالية الأفريقية في إدارة التُّونتين والسكن المشترك والرحلات والفعاليات الجماعية بشفافية وإنصاف.",
    },
    nav: {
      features: "الميزات",
      howItWorks: "كيف يعمل",
      pricing: "الأسعار",
      login: "تسجيل الدخول",
      signUp: "إنشاء حساب",
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
      features: "Vipengele",
      howItWorks: "Jinsi inavyofanya kazi",
      pricing: "Bei",
      login: "Ingia",
      signUp: "Jisajili",
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
