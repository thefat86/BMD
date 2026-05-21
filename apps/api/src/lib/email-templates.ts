/**
 * Templates emails BMD · refonte premium « cinematic warm » (Sprint AC).
 *
 * Philosophie de design :
 *  - **Touchant** : chaque email raconte une histoire courte qui rappelle
 *    pourquoi BMD existe — l'argent qui ne casse pas l'amitié.
 *  - **Premium** : couleurs brand (night-2, saffron, terracotta, gold, cream),
 *    typographies serif pour les titres, generous padding, hero gradient.
 *  - **Mobile-first** : single column, 600 px max, fonts ≥ 16 px sur le body.
 *  - **Multi-langue** : FR/EN/ES/PT/AR/DE/IT/SW/WO/LN/AM/JA/KO/ZH (14).
 *  - **Tonalité** : chaleureuse, complice (tutoiement FR, "tú" ES, "você" PT,
 *    politesse formelle DE), avec storytelling court.
 *
 * Compatibilité clients email :
 *  - Tables imbriquées (PAS de flex/grid)
 *  - Inline styles uniquement
 *  - Images via URL absolue (pas de data: URI)
 *  - SVG inline pour le logo (supporté par Apple Mail, Gmail web, Outlook 2019+)
 *  - Fallback PNG hébergé sur le domaine (à ajouter côté hosting)
 *
 * Architecture :
 *  - `renderLayout()` produit le shell HTML commun
 *  - Chaque template `renderXXX()` injecte son contenu narratif
 *  - `renderEmail()` est le dispatcher typé
 *  - Les copies par locale sont dans des objets `XXX_COPY` séparés
 */

/**
 * Sprint AC-5 · Toutes les 25 locales du site sont déclarées comme
 * EmailLocale, MÊME celles dont les copies natives ne sont pas encore
 * écrites. Les locales qui n'ont pas de copy native dans un template
 * spécifique tombent sur le fallback EN (pas FR — un utilisateur hindi ou
 * chinois préfère lire EN à FR si on ne lui parle pas dans sa langue).
 */
const SUPPORTED_LOCALES = [
  "fr", "en", "es", "pt", "ar", "de", "it",
  "sw", "wo", "ln", "am", "ja", "ko", "zh",
  // Sprint AC-5 · ajout des 11 locales manquantes (fallback EN par template)
  "ru", "lb", "hi", "pcm", "ha", "yo", "om", "ig", "ff", "zu", "ak",
] as const;
export type EmailLocale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Sprint AC-5 · Locales en fallback EN (pas de copy native dans la majorité
 * des templates). Si un template ne couvre pas la locale demandée, on passe
 * par cette table pour choisir le fallback le plus pertinent (EN > FR).
 */
const FALLBACK_TO_EN = new Set<string>([
  "ru", "lb", "hi", "pcm", "ha", "yo", "om", "ig", "ff", "zu", "ak",
]);

function pickLocale(loc?: string | null): EmailLocale {
  if (!loc) return "fr";
  // Normalise les variantes (fr-cm → fr, en-US → en)
  const base = loc.toLowerCase().split("-")[0];
  if ((SUPPORTED_LOCALES as readonly string[]).includes(base)) {
    return base as EmailLocale;
  }
  return "fr";
}

/**
 * Sprint AC-5 · Helper pour les templates : retourne la copy de la locale
 * demandée si dispo, sinon EN si la locale est dans FALLBACK_TO_EN, sinon FR.
 *
 * Usage dans un template :
 *   const copy = pickCopy(WELCOME_COPY, locale, payload);
 */
export function pickCopy<T, P>(
  copyMap: Partial<Record<EmailLocale, (p: P) => T>>,
  locale: EmailLocale,
  payload: P,
): T {
  const fn = copyMap[locale];
  if (fn) return fn(payload);
  if (FALLBACK_TO_EN.has(locale) && copyMap.en) {
    return copyMap.en(payload);
  }
  // Dernier fallback : FR (qui existe toujours)
  return (copyMap.fr ?? copyMap.en!)(payload);
}

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ============================================================
// Brand · couleurs et constantes (single source of truth)
// ============================================================
const BRAND = {
  night1: "#0E0B14",       // fond ultime
  night2: "#16111E",       // card surface
  night3: "#1F1429",       // card surface secondary
  saffron: "#E8A33D",      // accent or
  saffronSoft: "#F0BB6A",  // accent or clair pour hover/highlights
  terracotta: "#B5462E",   // accent rouge brique
  gold: "#C9A24A",         // détails luxueux
  cream: "#F4E4C1",        // texte principal
  creamSoft: "#E8D5B7",    // texte secondaire
  muted: "#8A7B6B",        // texte tertiaire / footers
  emerald: "#3F7D5C",      // accent positif (gains, succès)
  rose: "#D9714A",         // accent attention
} as const;

// V178.B — Exporté pour permettre aux emails "ad-hoc" (hors templates,
// envoyés via `sendEmail()` direct comme la weekly summary) d'embedder
// le même logo officiel BMD que les templates.
export function logoSvg(size = 80): string {
  return `
  <svg width="${size}" height="${size}" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="BMD">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${BRAND.saffron}" stop-opacity="0.22"/>
        <stop offset="100%" stop-color="${BRAND.terracotta}" stop-opacity="0.14"/>
      </linearGradient>
      <linearGradient id="ring" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${BRAND.gold}"/>
        <stop offset="100%" stop-color="${BRAND.saffron}"/>
      </linearGradient>
    </defs>
    <circle cx="40" cy="40" r="38" fill="url(#bg)" stroke="url(#ring)" stroke-width="1.5"/>
    <text x="40" y="55" text-anchor="middle"
          font-family="'Cormorant Garamond', Georgia, serif"
          font-size="42" font-weight="700"
          fill="${BRAND.saffron}">B</text>
    <circle cx="62" cy="40" r="2.5" fill="${BRAND.saffron}"/>
  </svg>`;
}

// ============================================================
// Layout · shell HTML commun
// ============================================================
interface LayoutOptions {
  preheader: string;       // preview text Gmail/Outlook
  heroEmoji?: string;      // emoji décoratif au-dessus du titre (optionnel)
  heroTitle: string;       // titre H1 serif
  heroSubtitle?: string;   // tagline sous le titre
  bodyHtml: string;        // contenu central
  ctaLabel?: string;
  ctaHref?: string;
  /** Quote chaleureuse en encadré italique (storytelling). */
  blockQuote?: string;
  /** Auteur de la quote (ex: "L'équipe BMD" ou un témoin) */
  blockQuoteAuthor?: string;
  /** Trois bénéfices en icônes/lignes (optionnel, pour les onboarding) */
  benefits?: Array<{ icon: string; title: string; body: string }>;
  locale: EmailLocale;
  baseUrl: string;
}

/**
 * Citations BMD — chaque email se termine par une citation chaleureuse
 * choisie aléatoirement dans cette banque, en cohérence avec la philosophie
 * BMD : l'argent qui ne casse pas l'amitié, la diaspora, le partage,
 * la dignité collective. Touche d'humour subtil bienvenue.
 *
 * Sprint AD-2 — chaque message DOIT se terminer par une citation contextuelle.
 */
const BMD_QUOTES: Partial<Record<EmailLocale, Array<{ text: string; author: string }>>> = {
  fr: [
    { text: "L'argent passe, l'amitié reste. Et les bons souvenirs aussi.", author: "Proverbe BMD" },
    { text: "Chez nous, on ne dit pas \"tu me dois\" — on dit \"on partage\".", author: "L'esprit BMD" },
    { text: "La diaspora, c'est un cœur qui bat sur deux continents.", author: "Sagesse BMD" },
    { text: "Compter à plusieurs, c'est déjà être ensemble.", author: "Philosophie BMD" },
    { text: "Le plus beau cadeau qu'on se fasse entre amis ? Ne plus avoir à parler d'argent.", author: "L'équipe BMD" },
    { text: "Une dette oubliée vaut mieux qu'un ami fâché — mais une dette réglée vaut encore mieux.", author: "Avec un clin d'œil, BMD" },
  ],
  en: [
    { text: "Money passes. Friendships stay. (And so do the good memories.)", author: "BMD proverb" },
    { text: "Here, we don't say \"you owe me\" — we say \"we share\".", author: "The BMD spirit" },
    { text: "Diaspora: one heart beating on two continents.", author: "BMD wisdom" },
    { text: "Counting together is already being together.", author: "BMD philosophy" },
    { text: "The best gift between friends? Never having to talk about money again.", author: "The BMD team" },
    { text: "A forgotten debt is better than a lost friend — but a settled one is even better.", author: "Wink, BMD" },
  ],
  es: [
    { text: "El dinero pasa, la amistad queda. Y los buenos recuerdos también.", author: "Proverbio BMD" },
    { text: "Aquí no decimos \"me debes\" — decimos \"compartimos\".", author: "El espíritu BMD" },
    { text: "Diáspora: un corazón que late en dos continentes.", author: "Sabiduría BMD" },
    { text: "Contar juntos ya es estar juntos.", author: "Filosofía BMD" },
    { text: "El mejor regalo entre amigos: no volver a hablar de dinero.", author: "El equipo BMD" },
  ],
  pt: [
    { text: "O dinheiro passa, a amizade fica. E as boas lembranças também.", author: "Provérbio BMD" },
    { text: "Aqui não dizemos \"você me deve\" — dizemos \"a gente divide\".", author: "O espírito BMD" },
    { text: "Diáspora: um coração que bate em dois continentes.", author: "Sabedoria BMD" },
    { text: "Contar juntos já é estar juntos.", author: "Filosofia BMD" },
  ],
  de: [
    { text: "Geld vergeht. Freundschaft bleibt. Und die schönen Erinnerungen auch.", author: "BMD-Sprichwort" },
    { text: "Bei uns sagt man nicht \"du schuldest mir\" — sondern \"wir teilen\".", author: "Der BMD-Geist" },
    { text: "Diaspora: ein Herz, das auf zwei Kontinenten schlägt.", author: "BMD-Weisheit" },
    { text: "Gemeinsam zählen heißt schon, gemeinsam zu sein.", author: "BMD-Philosophie" },
  ],
  it: [
    { text: "I soldi passano. L'amicizia resta. E anche i bei ricordi.", author: "Proverbio BMD" },
    { text: "Qui non si dice \"mi devi\" — si dice \"condividiamo\".", author: "Lo spirito BMD" },
    { text: "Diaspora: un cuore che batte su due continenti.", author: "Saggezza BMD" },
  ],
  ar: [
    { text: "المال يمر، والصداقة تبقى. والذكريات الجميلة أيضاً.", author: "حكمة BMD" },
    { text: "هنا لا نقول \"أنت مدين لي\" — نقول \"نتشارك\".", author: "روح BMD" },
    { text: "الشتات: قلب ينبض على قارّتَين.", author: "BMD" },
  ],
  sw: [
    { text: "Pesa zinapita. Urafiki unabaki. Na kumbukumbu nzuri pia.", author: "Mithali ya BMD" },
    { text: "Hapa hatusemi \"unanidaiwa\" — tunasema \"tunashiriki\".", author: "Roho ya BMD" },
    { text: "Diaspora: moyo mmoja unaodunda katika mabara mawili.", author: "Hekima ya BMD" },
  ],
  wo: [
    { text: "Xaalis dafa wesu. Mbokk dañu sax. Te xel yu rafet itam.", author: "Léebu BMD" },
    { text: "Fii, du naa wax \"a may bor\" — naa wax \"nu séqu\".", author: "Xelu BMD" },
  ],
  ln: [
    { text: "Mbongo elekaka. Bondeko etikalaka. Mpe makanisi malamu mpe.", author: "Lisese ya BMD" },
    { text: "Awa, tolobaka te \"ozali na nyongo\" — tolobaka \"tokabolaka\".", author: "Molimo BMD" },
  ],
  am: [
    { text: "ገንዘብ ያልፋል፣ ጓደኝነት ይቀራል። ጥሩ ትዝታዎችም እንዲሁ።", author: "የBMD ምሳሌ" },
    { text: "እዚህ \"ከፋይ ነህ\" አንልም — \"እንካፈላለን\" እንላለን።", author: "የBMD መንፈስ" },
  ],
  ja: [
    { text: "お金は流れ、友情は残る。そして良い思い出も。", author: "BMD のことわざ" },
    { text: "ここでは「借りがある」ではなく「分かち合う」と言います。", author: "BMD の精神" },
    { text: "ディアスポラ — 二つの大陸で鼓動する一つの心。", author: "BMD の知恵" },
  ],
  ko: [
    { text: "돈은 흘러가고, 우정은 남는다. 그리고 좋은 추억도.", author: "BMD 격언" },
    { text: "여기선 \"빚졌다\"가 아니라 \"나누었다\"고 말합니다.", author: "BMD 정신" },
  ],
  zh: [
    { text: "金钱流逝,友谊长存。美好的回忆也是。", author: "BMD 格言" },
    { text: "在这里,我们不说\"你欠我\"——我们说\"我们一起分享\"。", author: "BMD 精神" },
    { text: "侨民:一颗心,跳动在两片大陆。", author: "BMD 智慧" },
  ],
};

/**
 * Sélectionne une citation BMD aléatoire pour la locale, avec fallback EN.
 * Le hash est déterministe par jour pour qu'un même utilisateur reçoive
 * la même citation s'il reçoit plusieurs emails dans la journée.
 */
function pickQuote(locale: EmailLocale): { text: string; author: string } {
  const pool = BMD_QUOTES[locale] ?? (FALLBACK_TO_EN.has(locale) ? BMD_QUOTES.en : BMD_QUOTES.fr) ?? BMD_QUOTES.en!;
  // Rotation déterministe par jour pour cohérence intra-journée
  const dayIndex = Math.floor(Date.now() / (24 * 3600 * 1000));
  return pool[dayIndex % pool.length]!;
}

function autoQuoteBlock(locale: EmailLocale): string {
  const q = pickQuote(locale);
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:32px 0 0">
      <tr><td align="center" style="padding:0 16px">
        <p style="font-family:'Cormorant Garamond',Georgia,serif;font-size:17px;font-style:italic;color:${BRAND.creamSoft};line-height:1.55;margin:0 0 8px;letter-spacing:0.2px">
          « ${htmlEscape(q.text)} »
        </p>
        <p style="font-size:10px;color:${BRAND.gold};letter-spacing:2px;text-transform:uppercase;font-weight:600;margin:0">
          — ${htmlEscape(q.author)}
        </p>
      </td></tr>
    </table>
  `;
}

function footerByLocale(locale: EmailLocale, baseUrl: string): string {
  const map: Partial<Record<EmailLocale, {
    tagline: string;
    legal: string;
    unsub: string;
    help: string;
    signature: string;
  }>> = {
    fr: {
      tagline: "L'argent partagé. L'amitié protégée.",
      legal: "Tu reçois cet email parce que tu as un compte BMD. ",
      unsub: "Me désabonner",
      help: "Besoin d'aide ?",
      signature: "Avec affection,<br>L'équipe BMD",
    },
    en: {
      tagline: "Shared money. Friendships protected.",
      legal: "You're getting this email because you have a BMD account. ",
      unsub: "Unsubscribe",
      help: "Need help?",
      signature: "With love,<br>The BMD team",
    },
    es: {
      tagline: "Dinero compartido. Amistad protegida.",
      legal: "Recibes este correo porque tienes una cuenta BMD. ",
      unsub: "Darme de baja",
      help: "¿Necesitas ayuda?",
      signature: "Con cariño,<br>El equipo BMD",
    },
    pt: {
      tagline: "Dinheiro compartilhado. Amizade protegida.",
      legal: "Você recebe este email porque tem uma conta BMD. ",
      unsub: "Cancelar inscrição",
      help: "Precisa de ajuda?",
      signature: "Com carinho,<br>Equipe BMD",
    },
    ar: {
      tagline: "مال مشترك. صداقة محمية.",
      legal: "تتلقى هذا البريد لأن لديك حسابًا في BMD. ",
      unsub: "إلغاء الاشتراك",
      help: "بحاجة لمساعدة؟",
      signature: "بمودّة،<br>فريق BMD",
    },
    de: {
      tagline: "Geteiltes Geld. Geschützte Freundschaft.",
      legal: "Sie erhalten diese E-Mail, weil Sie ein BMD-Konto haben. ",
      unsub: "Abmelden",
      help: "Hilfe nötig?",
      signature: "Mit Herz,<br>Das BMD-Team",
    },
    it: {
      tagline: "Denaro condiviso. Amicizia protetta.",
      legal: "Ricevi questa email perché hai un account BMD. ",
      unsub: "Annulla iscrizione",
      help: "Hai bisogno di aiuto?",
      signature: "Con affetto,<br>Il team BMD",
    },
    sw: {
      tagline: "Pesa pamoja. Urafiki ulindwa.",
      legal: "Unapokea barua pepe hii kwa sababu una akaunti ya BMD. ",
      unsub: "Jiondoe",
      help: "Unahitaji msaada?",
      signature: "Kwa upendo,<br>Timu ya BMD",
    },
    wo: {
      tagline: "Xaalis bu boole. Xarit gu aar.",
      legal: "Yónni nañu la email bii ndax am nga kont BMD. ",
      unsub: "Génn ci listing",
      help: "Soxla nga ndimbal ?",
      signature: "Ak xelu yamoo,<br>Equip BMD",
    },
    ln: {
      tagline: "Mbongo ya kabolama. Boninga ekokangama.",
      legal: "Email oyo etindami na yo mpo ozali na compte BMD. ",
      unsub: "Longola yo",
      help: "Olingi lisalisi ?",
      signature: "Na bolingo,<br>Equipe BMD",
    },
    am: {
      tagline: "የጋራ ገንዘብ። የተጠበቀ ጓደኝነት።",
      legal: "ይህን ኢሜይል የምታገኝ የ BMD መለያ ስላለህ ነው። ",
      unsub: "መሰረዝ",
      help: "እርዳታ ይፈልጋሉ?",
      signature: "በፍቅር፣<br>የBMD ቡድን",
    },
    ja: {
      tagline: "共有のお金。守られた友情。",
      legal: "BMDのアカウントをお持ちなのでこのメールを受け取っています。",
      unsub: "配信停止",
      help: "ヘルプ",
      signature: "心を込めて、<br>BMDチーム",
    },
    ko: {
      tagline: "공유 자금. 보호된 우정.",
      legal: "BMD 계정이 있어 이 이메일을 받으셨습니다. ",
      unsub: "구독 취소",
      help: "도움이 필요하신가요?",
      signature: "사랑을 담아,<br>BMD 팀",
    },
    zh: {
      tagline: "共享金钱。友谊保护。",
      legal: "您收到此邮件是因为您有 BMD 账户。",
      unsub: "取消订阅",
      help: "需要帮助？",
      signature: "用心送上，<br>BMD 团队",
    },
  };
  // Sprint AC-5 · fallback intelligent : EN pour les locales non latines, FR sinon
  const t = map[locale] ?? (FALLBACK_TO_EN.has(locale) ? map.en : map.fr) ?? map.fr!;
  // Footer riche : signature manuscrite + citation BMD du jour + tagline + liens utilitaires
  return `
    <!-- Citation BMD (sprint AD-2 : chaque email se termine par une citation) -->
    ${autoQuoteBlock(locale)}

    <!-- Signature -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:24px 0 24px">
      <tr><td align="center">
        <p style="font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;font-style:italic;color:${BRAND.saffron};margin:0;line-height:1.4">
          ${t.signature}
        </p>
      </td></tr>
    </table>

    <!-- Divider luxe -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr><td align="center" style="padding:0 32px">
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            <td style="width:80px;height:1px;background:linear-gradient(90deg,transparent,${BRAND.gold});font-size:1px;line-height:1px">&nbsp;</td>
            <td style="padding:0 12px;color:${BRAND.gold};font-size:14px">✦</td>
            <td style="width:80px;height:1px;background:linear-gradient(90deg,${BRAND.gold},transparent);font-size:1px;line-height:1px">&nbsp;</td>
          </tr>
        </table>
      </td></tr>
    </table>

    <!-- Tagline brand -->
    <p style="font-family:'Cormorant Garamond',Georgia,serif;font-size:16px;font-style:italic;color:${BRAND.gold};text-align:center;margin:16px 0 0;letter-spacing:0.3px">
      ${htmlEscape(t.tagline)}
    </p>

    <!-- Mentions légales -->
    <p style="font-size:11px;color:${BRAND.muted};line-height:1.6;margin:24px 0 4px;text-align:center;padding:0 24px">
      ${htmlEscape(t.legal)}
      <a href="${baseUrl}/unsubscribe" style="color:${BRAND.muted};text-decoration:underline">${htmlEscape(t.unsub)}</a>
      &nbsp;·&nbsp;
      <a href="${baseUrl}/help" style="color:${BRAND.saffron};text-decoration:none">${htmlEscape(t.help)}</a>
    </p>
    <p style="font-size:10px;color:${BRAND.muted};text-align:center;margin:0 0 8px;letter-spacing:1px">
      BMD · backmesdo.com
    </p>
  `;
}

function renderLayout(opts: LayoutOptions): { html: string; text: string } {
  const direction = opts.locale === "ar" ? "rtl" : "ltr";

  // Hero
  const heroBlock = `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:linear-gradient(135deg,rgba(232,163,61,0.18) 0%,rgba(181,70,46,0.10) 60%,${BRAND.night2} 100%);padding:48px 32px 36px;border-radius:20px 20px 0 0">
      <tr><td align="center">
        <!-- Logo -->
        <div style="margin-bottom:20px">${logoSvg(72)}</div>
        <!-- Marque texte -->
        <p style="font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;font-weight:700;color:${BRAND.cream};letter-spacing:1.5px;margin:0">
          BMD<span style="color:${BRAND.saffron}">·</span>
        </p>
        <p style="font-size:10px;color:${BRAND.gold};letter-spacing:4px;text-transform:uppercase;font-weight:600;margin:6px 0 28px">
          Back · Mes · Do
        </p>
        ${opts.heroEmoji ? `<div style="font-size:42px;line-height:1;margin-bottom:14px">${opts.heroEmoji}</div>` : ""}
        <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:30px;font-weight:600;color:${BRAND.cream};line-height:1.25;margin:0 0 12px;padding:0 16px">
          ${htmlEscape(opts.heroTitle)}
        </h1>
        ${opts.heroSubtitle ? `
          <p style="font-size:15px;color:${BRAND.creamSoft};margin:0;line-height:1.55;padding:0 24px;max-width:420px;display:inline-block">
            ${htmlEscape(opts.heroSubtitle)}
          </p>
        ` : ""}
      </td></tr>
    </table>
  `;

  // Block quote (storytelling encadré)
  const quoteBlock = opts.blockQuote
    ? `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:24px 0 8px">
      <tr><td style="padding:20px 24px;background:rgba(201,162,74,0.08);border-left:3px solid ${BRAND.gold};border-radius:0 12px 12px 0">
        <p style="font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;font-style:italic;color:${BRAND.cream};line-height:1.5;margin:0">
          « ${htmlEscape(opts.blockQuote)} »
        </p>
        ${opts.blockQuoteAuthor ? `
          <p style="font-size:11px;color:${BRAND.gold};letter-spacing:1.5px;text-transform:uppercase;font-weight:600;margin:10px 0 0">
            — ${htmlEscape(opts.blockQuoteAuthor)}
          </p>
        ` : ""}
      </td></tr>
    </table>
  `
    : "";

  // Trois bénéfices en cards
  const benefitsBlock = opts.benefits && opts.benefits.length > 0
    ? `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:24px 0">
      ${opts.benefits.map((b) => `
        <tr><td style="padding:14px 0">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="width:48px;vertical-align:top;padding-right:14px">
                <div style="width:40px;height:40px;border-radius:10px;background:rgba(232,163,61,0.12);border:1px solid rgba(232,163,61,0.25);text-align:center;line-height:40px;font-size:20px">
                  ${b.icon}
                </div>
              </td>
              <td style="vertical-align:top">
                <p style="font-size:14px;font-weight:700;color:${BRAND.cream};margin:0 0 4px">${htmlEscape(b.title)}</p>
                <p style="font-size:13px;color:${BRAND.creamSoft};line-height:1.5;margin:0">${htmlEscape(b.body)}</p>
              </td>
            </tr>
          </table>
        </td></tr>
      `).join("")}
    </table>
  `
    : "";

  // CTA principal
  const ctaButton = opts.ctaLabel && opts.ctaHref
    ? `
    <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:28px auto 8px">
      <tr><td style="border-radius:14px;background:linear-gradient(135deg,${BRAND.saffron} 0%,${BRAND.terracotta} 100%);box-shadow:0 8px 24px rgba(232,163,61,0.35)">
        <a href="${opts.ctaHref}" style="display:inline-block;padding:16px 36px;color:${BRAND.night1};text-decoration:none;font-weight:700;font-size:15px;letter-spacing:0.5px;border-radius:14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
          ${htmlEscape(opts.ctaLabel)}
        </a>
      </td></tr>
    </table>
    `
    : "";

  const html = `<!DOCTYPE html>
<html lang="${opts.locale}" dir="${direction}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${htmlEscape(opts.heroTitle)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.night1};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;color:${BRAND.cream}">
<!-- Preheader hidden preview text -->
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${BRAND.night1};opacity:0">${htmlEscape(opts.preheader)}</div>

<!-- Outer wrapper (centre & background) -->
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${BRAND.night1}">
<tr><td align="center" style="padding:32px 16px 48px">

  <!-- Card principale -->
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:linear-gradient(180deg,${BRAND.night2} 0%,${BRAND.night3} 100%);border-radius:20px;border:1px solid rgba(232,163,61,0.20);box-shadow:0 24px 80px rgba(0,0,0,0.6)">

    <!-- Hero -->
    <tr><td>${heroBlock}</td></tr>

    <!-- Contenu -->
    <tr><td style="padding:0 32px 32px">
      <div style="font-size:15px;line-height:1.65;color:${BRAND.creamSoft}">
        ${opts.bodyHtml}
      </div>
      ${ctaButton}
      ${quoteBlock}
      ${benefitsBlock}
    </td></tr>

  </table>

  <!-- Footer (hors card) -->
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px">
    <tr><td>${footerByLocale(opts.locale, opts.baseUrl)}</td></tr>
  </table>

</td></tr>
</table>
</body>
</html>`;

  // Plain text (fallback pour clients qui ne rendent pas le HTML)
  const stripHtml = (s: string) =>
    s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const dailyQuote = pickQuote(opts.locale);
  const text = [
    opts.heroTitle,
    opts.heroSubtitle ?? "",
    "",
    stripHtml(opts.bodyHtml),
    opts.ctaLabel && opts.ctaHref ? `\n${opts.ctaLabel} : ${opts.ctaHref}` : "",
    opts.blockQuote ? `\n« ${opts.blockQuote} »` : "",
    "",
    "—",
    `« ${dailyQuote.text} »`,
    `— ${dailyQuote.author}`,
    "",
    "BMD · backmesdo.com",
  ].filter(Boolean).join("\n");

  return { html, text };
}

// ============================================================
// Templates métier
// ============================================================
export interface WelcomeEmailPayload { displayName: string }
export interface OtpEmailPayload { code: string; ttlMinutes: number }
export interface GroupInvitePayload {
  inviterName: string;
  groupName: string;
  joinUrl: string;
}
export interface ExpenseAddedPayload {
  payerName: string;
  groupName: string;
  amount: string;
  currency: string;
  description: string;
  groupUrl: string;
}
export interface SettlementProposedPayload {
  fromName: string;
  toName: string;
  amount: string;
  currency: string;
  groupName: string;
  confirmUrl: string;
}
export interface WeeklyDigestPayload {
  displayName: string;
  weekStart: string;
  totalSpent: string;
  topGroup: string;
  dashboardUrl: string;
}

/**
 * V150.A6 · Reconnaissances de dette (RDD)
 *
 * 4 emails du workflow négociation, à savoir : (1) le créancier envoie le
 * contrat (PROPOSED), (2) le débiteur accepte (ACCEPTED), (3) il refuse
 * (REJECTED), (4) il contre-propose (COUNTER_PROPOSED). Tous en design
 * cinematic warm, ton chaleureux/pro, multilingue.
 */
export interface DebtProposedPayload {
  /** Nom du créancier qui propose le contrat (= « moi » côté envoi) */
  creditorName: string;
  /** Nom du débiteur (= destinataire de l'email) */
  debtorName: string;
  /** Montant formaté (ex : "1 200,00") sans devise */
  amount: string;
  currency: string;
  /** Nombre d'échéances et fréquence (ex : "12 mensualités") */
  installmentsLabel: string;
  /** Taux d'intérêt annuel formaté (ex : "0 %" ou "3,5 %") */
  rateLabel: string;
  /** Objet du prêt (peut être vide) */
  purpose: string;
  /** Date d'expiration de la proposition (ISO formatée pour humain ex "12 juillet 2026") */
  expiresAtLabel: string;
  /** URL absolue vers la page détail du contrat dans l'app */
  contractUrl: string;
}

export interface DebtAcceptedPayload {
  /** Créancier (= destinataire) */
  creditorName: string;
  /** Débiteur (= émetteur de la décision) */
  debtorName: string;
  amount: string;
  currency: string;
  /** publicCode du contrat (ex : « BMD-A12B ») */
  contractCode: string;
  /** "signé" si SIGNED, "en attente de signature" sinon */
  statusLabel: string;
  contractUrl: string;
}

export interface DebtRejectedPayload {
  creditorName: string;
  debtorName: string;
  amount: string;
  currency: string;
  contractCode: string;
  contractUrl: string;
}

export interface DebtCounterProposedPayload {
  creditorName: string;
  debtorName: string;
  amount: string;
  currency: string;
  contractCode: string;
  /** Raison fournie par le débiteur pour la contre-proposition (peut être vide) */
  reason: string;
  contractUrl: string;
}

/**
 * V150.B — Tu as été désigné(e) témoin sur un contrat RDD.
 * Email chaleureux : la présence du témoin sécurise un accord entre proches.
 */
export interface DebtWitnessAddedPayload {
  /** Destinataire (témoin invité) */
  recipientName: string;
  /** Créancier (le prêteur) */
  creditorName: string;
  /** Débiteur (l'emprunteur) */
  debtorName: string;
  /** Montant formaté (ex : "1 200,00") sans devise */
  amount: string;
  currency: string;
  /** publicCode du contrat */
  contractCode: string;
  /** Objet du prêt (peut être vide) */
  purpose: string;
  contractUrl: string;
}

/**
 * V150.D — Une partie a signalé un litige sur ton contrat RDD.
 * Ton calme et factuel : on ne dramatise pas, on invite au dialogue.
 */
export interface DebtDisputedPayload {
  recipientName: string;
  /// Nom de la personne qui a signalé le litige
  initiatorName: string;
  /// Rôle de l'initiateur (CREDITOR/DEBTOR)
  initiatorRole: "CREDITOR" | "DEBTOR";
  /// Catégorie du litige
  categoryLabel: string;
  /// Raison libre fournie
  reason: string;
  /// publicCode du contrat
  contractCode: string;
  amount: string;
  currency: string;
  contractUrl: string;
}

/**
 * V150.D — Le litige a été résolu amiablement.
 * Ton apaisé qui célèbre la résolution sans en faire trop.
 */
export interface DebtDisputeResolvedPayload {
  recipientName: string;
  /// Nom de la personne qui a marqué comme résolu
  resolverName: string;
  /// Statut auquel le contrat est revenu (ex: "ACTIVE")
  restoredStatusLabel: string;
  /// Note de résolution (peut être vide)
  note: string;
  contractCode: string;
  amount: string;
  currency: string;
  contractUrl: string;
}

/**
 * V150.B — Tu as été désigné(e) garant sur un contrat RDD.
 * Email chaleureux qui clarifie l'engagement (couverture + délai de déclenchement).
 */
export interface DebtGuarantorAddedPayload {
  recipientName: string;
  creditorName: string;
  debtorName: string;
  amount: string;
  currency: string;
  contractCode: string;
  purpose: string;
  /** Pourcentage du montant garanti (1-100) */
  coverage: number;
  /** Jours après défaut avant activation de la garantie */
  triggerDays: number;
  contractUrl: string;
}

export type EmailTemplate =
  | { kind: "welcome"; payload: WelcomeEmailPayload }
  | { kind: "otp"; payload: OtpEmailPayload }
  | { kind: "groupInvite"; payload: GroupInvitePayload }
  | { kind: "expenseAdded"; payload: ExpenseAddedPayload }
  | { kind: "settlementProposed"; payload: SettlementProposedPayload }
  | { kind: "weeklyDigest"; payload: WeeklyDigestPayload }
  // Sprint AC-3 · réunion enregistrée prête à valider
  | { kind: "meetingReady"; payload: MeetingReadyPayload }
  // V150.A6 · Workflow négociation RDD
  | { kind: "debtProposed"; payload: DebtProposedPayload }
  | { kind: "debtAccepted"; payload: DebtAcceptedPayload }
  | { kind: "debtRejected"; payload: DebtRejectedPayload }
  | { kind: "debtCounterProposed"; payload: DebtCounterProposedPayload }
  // V150.B · Témoins & garants
  | { kind: "debtWitnessAdded"; payload: DebtWitnessAddedPayload }
  | { kind: "debtGuarantorAdded"; payload: DebtGuarantorAddedPayload }
  // V150.D · Médiation / litige
  | { kind: "debtDisputed"; payload: DebtDisputedPayload }
  | { kind: "debtDisputeResolved"; payload: DebtDisputeResolvedPayload }
  // V164 · Message d'un ambassadeur/commercial à un filleul direct
  | { kind: "networkMessage"; payload: NetworkMessagePayload };

/**
 * V164 — Email envoyé par un ambassadeur/commercial à un filleul direct.
 * Le sujet et le corps sont déjà interpolés ({{recipientName}} et
 * {{senderName}} remplacés côté service). On encadre juste avec le wrapper
 * BMD pour rester pro.
 */
export interface NetworkMessagePayload {
  recipientName: string;
  senderName: string;
  subject: string;
  body: string;
}

/**
 * Sprint AC-3 · Données pour le mail "Réunion prête à valider".
 * Envoyé à tous les admins du groupe quand le pipeline Whisper+LLM termine.
 */
export interface MeetingReadyPayload {
  recipientName: string;
  groupName: string;
  meetingTitle: string;
  meetingId: string;
  groupId: string;
  decisionsCount: number;
  summary: string | null;
  organizerName: string;
}

export function renderEmail(
  template: EmailTemplate,
  locale: string | null | undefined,
  baseUrl: string,
): { subject: string; html: string; text: string } {
  const loc = pickLocale(locale);
  switch (template.kind) {
    case "welcome": return renderWelcome(template.payload, loc, baseUrl);
    case "otp": return renderOtp(template.payload, loc, baseUrl);
    case "groupInvite": return renderGroupInvite(template.payload, loc, baseUrl);
    case "expenseAdded": return renderExpenseAdded(template.payload, loc, baseUrl);
    case "settlementProposed": return renderSettlementProposed(template.payload, loc, baseUrl);
    case "weeklyDigest": return renderWeeklyDigest(template.payload, loc, baseUrl);
    case "meetingReady": return renderMeetingReady(template.payload, loc, baseUrl);
    case "debtProposed": return renderDebtProposed(template.payload, loc, baseUrl);
    case "debtAccepted": return renderDebtAccepted(template.payload, loc, baseUrl);
    case "debtRejected": return renderDebtRejected(template.payload, loc, baseUrl);
    case "debtCounterProposed": return renderDebtCounterProposed(template.payload, loc, baseUrl);
    case "debtWitnessAdded": return renderDebtWitnessAdded(template.payload, loc, baseUrl);
    case "debtGuarantorAdded": return renderDebtGuarantorAdded(template.payload, loc, baseUrl);
    case "debtDisputed": return renderDebtDisputed(template.payload, loc, baseUrl);
    case "debtDisputeResolved": return renderDebtDisputeResolved(template.payload, loc, baseUrl);
    case "networkMessage": return renderNetworkMessage(template.payload, loc, baseUrl);
  }
}

/**
 * V164 — Rend l'email "message d'un ambassadeur/commercial".
 * Sujet et corps déjà interpolés. On préserve les sauts de ligne du body en
 * convertissant les \n en <br> pour le HTML.
 */
function renderNetworkMessage(
  p: NetworkMessagePayload,
  loc: string,
  baseUrl: string,
): { subject: string; html: string; text: string } {
  const bodyHtml = p.body
    .split("\n")
    .map((line) => escapeHtml(line) || "&nbsp;")
    .join("<br>");
  const footer = loc === "en"
    ? `You receive this email because ${p.senderName} is part of your BMD network. Reply directly to them — this address doesn't accept replies.`
    : loc === "ar"
      ? `تتلقى هذا البريد لأن ${p.senderName} جزء من شبكتك على BMD. للرد، تواصل معه/معها مباشرة.`
      : `Tu reçois ce mail car ${p.senderName} fait partie de ton réseau BMD. Réponds-lui directement — cette adresse ne reçoit pas les réponses.`;
  const html = `
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:560px;margin:0 auto;color:#2B1F15;background:#FBF6EC;padding:32px 24px;">
      <div style="background:#C58A2E;color:#FBF6EC;padding:10px 16px;border-radius:8px 8px 0 0;font-size:11px;letter-spacing:0.6px;text-transform:uppercase;font-weight:700;">
        Message · BMD
      </div>
      <div style="background:#fff;border-radius:0 0 8px 8px;padding:24px;border:1px solid rgba(43,31,21,0.10);">
        <p style="margin:0 0 6px;font-size:13px;color:#6B5942;">${escapeHtml(`De : ${p.senderName}`)}</p>
        <h1 style="margin:0 0 18px;font-size:20px;font-weight:700;color:#2B1F15;line-height:1.3;">${escapeHtml(p.subject)}</h1>
        <div style="font-size:14px;line-height:1.6;color:#2B1F15;">${bodyHtml}</div>
        <hr style="margin:24px 0;border:none;border-top:1px solid rgba(43,31,21,0.10);">
        <p style="margin:0;font-size:11px;color:#6B5942;font-style:italic;line-height:1.5;">${escapeHtml(footer)}</p>
        <p style="margin:14px 0 0;font-size:11px;color:#6B5942;">
          <a href="${baseUrl}/dashboard/notifications" style="color:#854F0B;text-decoration:none;font-weight:600;">Voir dans BMD →</a>
        </p>
      </div>
    </div>
  `;
  const text = `${p.subject}\n\nDe : ${p.senderName}\n\n${p.body}\n\n---\n${footer}\n\nVoir dans BMD : ${baseUrl}/dashboard/notifications`;
  return { subject: p.subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ============================================================
// Sprint AC-3 · MEETING_READY · « Ta réunion est prête à valider »
// ============================================================
//
// Mail envoyé aux admins du groupe quand le pipeline Whisper+LLM termine.
// Ton chaleureux, professionnel — on rappelle l'importance de la transparence
// dans les comptes du groupe.

interface MeetingReadyCopy {
  subject: string;
  hero: string;
  subtitle: string;
  greeting: string;
  intro: string;
  decisionsLine: string;
  summaryLabel: string;
  cta: string;
  blockQuote: string;
  blockQuoteAuthor: string;
}

const MEETING_READY_COPY: Partial<Record<EmailLocale, (p: MeetingReadyPayload) => MeetingReadyCopy>> = {
  fr: (p) => ({
    subject: `📋 Réunion à valider — ${p.groupName}`,
    hero: "Ta réunion est prête",
    subtitle: `${p.organizerName} a enregistré une réunion dans ${p.groupName}`,
    greeting: `Salut <strong>${htmlEscape(p.recipientName)}</strong> 👋`,
    intro: `<p><strong>${htmlEscape(p.organizerName)}</strong> a enregistré une réunion intitulée <em>« ${htmlEscape(p.meetingTitle)} »</em>. Notre IA a transcrit l'audio et extrait les décisions financières.</p>`,
    decisionsLine: `<strong>${p.decisionsCount} décision(s)</strong> détectée(s) — règlements, dépenses, cotisations.`,
    summaryLabel: "Résumé",
    cta: "Vérifier et appliquer",
    blockQuote: "Une réunion bien notée, c'est six mois d'amitiés préservées.",
    blockQuoteAuthor: "L'équipe BMD",
  }),
  en: (p) => ({
    subject: `📋 Meeting to review — ${p.groupName}`,
    hero: "Your meeting is ready",
    subtitle: `${p.organizerName} recorded a meeting in ${p.groupName}`,
    greeting: `Hi <strong>${htmlEscape(p.recipientName)}</strong> 👋`,
    intro: `<p><strong>${htmlEscape(p.organizerName)}</strong> recorded a meeting titled <em>"${htmlEscape(p.meetingTitle)}"</em>. Our AI transcribed the audio and extracted the financial decisions.</p>`,
    decisionsLine: `<strong>${p.decisionsCount} decision(s)</strong> detected — settlements, expenses, contributions.`,
    summaryLabel: "Summary",
    cta: "Review and apply",
    blockQuote: "A meeting well noted is six months of preserved friendships.",
    blockQuoteAuthor: "The BMD team",
  }),
  es: (p) => ({
    subject: `📋 Reunión a validar — ${p.groupName}`,
    hero: "Tu reunión está lista",
    subtitle: `${p.organizerName} grabó una reunión en ${p.groupName}`,
    greeting: `Hola <strong>${htmlEscape(p.recipientName)}</strong> 👋`,
    intro: `<p><strong>${htmlEscape(p.organizerName)}</strong> grabó una reunión titulada <em>"${htmlEscape(p.meetingTitle)}"</em>. Nuestra IA transcribió el audio y extrajo las decisiones financieras.</p>`,
    decisionsLine: `<strong>${p.decisionsCount} decisión(es)</strong> detectada(s) — liquidaciones, gastos, aportes.`,
    summaryLabel: "Resumen",
    cta: "Revisar y aplicar",
    blockQuote: "Una reunión bien anotada son seis meses de amistad preservada.",
    blockQuoteAuthor: "El equipo BMD",
  }),
  pt: (p) => ({
    subject: `📋 Reunião a validar — ${p.groupName}`,
    hero: "A tua reunião está pronta",
    subtitle: `${p.organizerName} gravou uma reunião em ${p.groupName}`,
    greeting: `Olá <strong>${htmlEscape(p.recipientName)}</strong> 👋`,
    intro: `<p><strong>${htmlEscape(p.organizerName)}</strong> gravou uma reunião intitulada <em>"${htmlEscape(p.meetingTitle)}"</em>. A nossa IA transcreveu o áudio e extraiu as decisões financeiras.</p>`,
    decisionsLine: `<strong>${p.decisionsCount} decisão(ões)</strong> detetada(s) — pagamentos, despesas, contribuições.`,
    summaryLabel: "Resumo",
    cta: "Verificar e aplicar",
    blockQuote: "Uma reunião bem anotada é seis meses de amizades preservadas.",
    blockQuoteAuthor: "A equipa BMD",
  }),
  ar: (p) => ({
    subject: `📋 اجتماع للتحقق — ${p.groupName}`,
    hero: "اجتماعك جاهز",
    subtitle: `سجّل ${p.organizerName} اجتماعاً في ${p.groupName}`,
    greeting: `مرحباً <strong>${htmlEscape(p.recipientName)}</strong> 👋`,
    intro: `<p>سجّل <strong>${htmlEscape(p.organizerName)}</strong> اجتماعاً بعنوان <em>"${htmlEscape(p.meetingTitle)}"</em>. قام الذكاء الاصطناعي بنسخ الصوت واستخراج القرارات المالية.</p>`,
    decisionsLine: `<strong>${p.decisionsCount} قرار(ات)</strong> تم اكتشافها — تسويات، نفقات، مساهمات.`,
    summaryLabel: "ملخص",
    cta: "مراجعة وتطبيق",
    blockQuote: "اجتماع موثّق جيداً يحفظ ستة أشهر من الصداقة.",
    blockQuoteAuthor: "فريق BMD",
  }),
  de: (p) => ({
    subject: `📋 Meeting zum Validieren — ${p.groupName}`,
    hero: "Dein Meeting ist bereit",
    subtitle: `${p.organizerName} hat ein Meeting in ${p.groupName} aufgenommen`,
    greeting: `Hallo <strong>${htmlEscape(p.recipientName)}</strong> 👋`,
    intro: `<p><strong>${htmlEscape(p.organizerName)}</strong> hat ein Meeting mit dem Titel <em>"${htmlEscape(p.meetingTitle)}"</em> aufgezeichnet. Unsere KI hat das Audio transkribiert und die finanziellen Entscheidungen extrahiert.</p>`,
    decisionsLine: `<strong>${p.decisionsCount} Entscheidung(en)</strong> erkannt — Abrechnungen, Ausgaben, Beiträge.`,
    summaryLabel: "Zusammenfassung",
    cta: "Prüfen und anwenden",
    blockQuote: "Ein gut dokumentiertes Meeting bewahrt sechs Monate Freundschaft.",
    blockQuoteAuthor: "Das BMD-Team",
  }),
  it: (p) => ({
    subject: `📋 Riunione da validare — ${p.groupName}`,
    hero: "La tua riunione è pronta",
    subtitle: `${p.organizerName} ha registrato una riunione in ${p.groupName}`,
    greeting: `Ciao <strong>${htmlEscape(p.recipientName)}</strong> 👋`,
    intro: `<p><strong>${htmlEscape(p.organizerName)}</strong> ha registrato una riunione intitolata <em>"${htmlEscape(p.meetingTitle)}"</em>. La nostra IA ha trascritto l'audio ed estratto le decisioni finanziarie.</p>`,
    decisionsLine: `<strong>${p.decisionsCount} decisione/i</strong> rilevata/e — rimborsi, spese, contributi.`,
    summaryLabel: "Riassunto",
    cta: "Verifica e applica",
    blockQuote: "Una riunione ben annotata sono sei mesi di amicizia preservata.",
    blockQuoteAuthor: "Il team BMD",
  }),
  sw: (p) => ({
    subject: `📋 Mkutano wa kuthibitisha — ${p.groupName}`,
    hero: "Mkutano wako uko tayari",
    subtitle: `${p.organizerName} amerekodi mkutano katika ${p.groupName}`,
    greeting: `Habari <strong>${htmlEscape(p.recipientName)}</strong> 👋`,
    intro: `<p><strong>${htmlEscape(p.organizerName)}</strong> amerekodi mkutano wenye kichwa <em>"${htmlEscape(p.meetingTitle)}"</em>. AI yetu imenakili sauti na kutoa maamuzi ya kifedha.</p>`,
    decisionsLine: `<strong>Maamuzi ${p.decisionsCount}</strong> yamegunduliwa — malipo, gharama, michango.`,
    summaryLabel: "Muhtasari",
    cta: "Kagua na utumie",
    blockQuote: "Mkutano uliorekodiwa vizuri ni miezi sita ya urafiki uliohifadhiwa.",
    blockQuoteAuthor: "Timu ya BMD",
  }),
  wo: (p) => ({
    subject: `📋 Mboolo bu war a wéral — ${p.groupName}`,
    hero: "Sa mboolo dafa parri",
    subtitle: `${p.organizerName} dafa enregistre benn mboolo ci ${p.groupName}`,
    greeting: `Salaamaalekum <strong>${htmlEscape(p.recipientName)}</strong> 👋`,
    intro: `<p><strong>${htmlEscape(p.organizerName)}</strong> dafa enregistre benn mboolo bu tudd <em>"${htmlEscape(p.meetingTitle)}"</em>. AI bi transcripté na sunu audio te jëfandikoo dogal yi.</p>`,
    decisionsLine: `<strong>${p.decisionsCount} dogal</strong> ñu gisé — fey, dëkk-dëkkin, contribution.`,
    summaryLabel: "Resume",
    cta: "Wéral te jëfandikoo",
    blockQuote: "Benn mboolo bu nu bind bu baax, juróom-benni weer la xarit yi sax.",
    blockQuoteAuthor: "Equipe BMD",
  }),
  ln: (p) => ({
    subject: `📋 Likita ya kondima — ${p.groupName}`,
    hero: "Likita na yo ezali libela",
    subtitle: `${p.organizerName} azwi likita na ${p.groupName}`,
    greeting: `Mbote <strong>${htmlEscape(p.recipientName)}</strong> 👋`,
    intro: `<p><strong>${htmlEscape(p.organizerName)}</strong> azwi likita na nkombo <em>"${htmlEscape(p.meetingTitle)}"</em>. AI na biso ekomeli audio mpe ekamati makanisi ya mbongo.</p>`,
    decisionsLine: `<strong>Makanisi ${p.decisionsCount}</strong> emonani — kofuta, mbongo, kosalisa.`,
    summaryLabel: "Mokuse",
    cta: "Tala mpe salelá",
    blockQuote: "Likita oyo ekomami malamu ezali sanza motoba ya boninga ebombami.",
    blockQuoteAuthor: "Equipe BMD",
  }),
  am: (p) => ({
    subject: `📋 ለመቅረብ ስብሰባ — ${p.groupName}`,
    hero: "ስብሰባዎ ዝግጁ ነው",
    subtitle: `${p.organizerName} በ${p.groupName} ስብሰባ ቀርቷል`,
    greeting: `ሰላም <strong>${htmlEscape(p.recipientName)}</strong> 👋`,
    intro: `<p><strong>${htmlEscape(p.organizerName)}</strong> "${htmlEscape(p.meetingTitle)}" የሚል ስብሰባ ቀርቧል። AI አዕምሮ ድምጹን ጻፎታል።</p>`,
    decisionsLine: `<strong>${p.decisionsCount} ውሳኔ(ዎች)</strong> ተገኝተዋል።`,
    summaryLabel: "ማጠቃለያ",
    cta: "ይመልከቱ እና ይተግብሩ",
    blockQuote: "በሚገባ የተመዘገበ ስብሰባ ስድስት ወር የሚቆይ ጓደኝነት ነው።",
    blockQuoteAuthor: "BMD ቡድን",
  }),
  ja: (p) => ({
    subject: `📋 検証する会議 — ${p.groupName}`,
    hero: "ミーティングの準備ができました",
    subtitle: `${p.organizerName} が ${p.groupName} で会議を録音しました`,
    greeting: `こんにちは <strong>${htmlEscape(p.recipientName)}</strong> 👋`,
    intro: `<p><strong>${htmlEscape(p.organizerName)}</strong> が「${htmlEscape(p.meetingTitle)}」というタイトルの会議を録音しました。AI が音声を文字起こしし、財務上の決定を抽出しました。</p>`,
    decisionsLine: `<strong>${p.decisionsCount} 件の決定</strong> が検出されました — 精算、経費、拠出金。`,
    summaryLabel: "概要",
    cta: "確認して適用",
    blockQuote: "よく記録された会議は、6ヶ月間の友情を守ります。",
    blockQuoteAuthor: "BMD チーム",
  }),
  ko: (p) => ({
    subject: `📋 검토할 회의 — ${p.groupName}`,
    hero: "회의 준비가 완료되었습니다",
    subtitle: `${p.organizerName} 님이 ${p.groupName}에서 회의를 녹음했습니다`,
    greeting: `안녕하세요 <strong>${htmlEscape(p.recipientName)}</strong> 👋`,
    intro: `<p><strong>${htmlEscape(p.organizerName)}</strong> 님이 "${htmlEscape(p.meetingTitle)}"라는 제목의 회의를 녹음했습니다. AI가 오디오를 전사하고 재무 결정을 추출했습니다.</p>`,
    decisionsLine: `<strong>${p.decisionsCount}개의 결정</strong>이 감지되었습니다.`,
    summaryLabel: "요약",
    cta: "검토 및 적용",
    blockQuote: "잘 기록된 회의는 6개월의 우정을 보존합니다.",
    blockQuoteAuthor: "BMD 팀",
  }),
  zh: (p) => ({
    subject: `📋 待审核的会议 — ${p.groupName}`,
    hero: "您的会议已准备就绪",
    subtitle: `${p.organizerName} 在 ${p.groupName} 录制了一次会议`,
    greeting: `您好 <strong>${htmlEscape(p.recipientName)}</strong> 👋`,
    intro: `<p><strong>${htmlEscape(p.organizerName)}</strong> 录制了名为"${htmlEscape(p.meetingTitle)}"的会议。我们的 AI 已转录音频并提取财务决策。</p>`,
    decisionsLine: `检测到 <strong>${p.decisionsCount} 个决定</strong> — 结算、支出、捐款。`,
    summaryLabel: "摘要",
    cta: "查看并应用",
    blockQuote: "一次记录良好的会议保存六个月的友谊。",
    blockQuoteAuthor: "BMD 团队",
  }),
};

function renderMeetingReady(
  payload: MeetingReadyPayload,
  locale: EmailLocale,
  baseUrl: string,
): { subject: string; html: string; text: string } {
  const c = pickCopy(MEETING_READY_COPY, locale, payload);
  const link = `${baseUrl}/dashboard/groups/${payload.groupId}/meetings/${payload.meetingId}`;
  const summarySection = payload.summary
    ? `<div style="margin:16px 0;padding:12px 16px;border-left:3px solid ${BRAND.saffron};background:rgba(232,163,61,0.06);border-radius:0 6px 6px 0">
        <p style="font-size:11px;color:${BRAND.muted};text-transform:uppercase;letter-spacing:1px;margin:0 0 4px">${htmlEscape(c.summaryLabel)}</p>
        <p style="font-size:14px;color:${BRAND.cream};margin:0;line-height:1.5">${htmlEscape(payload.summary)}</p>
      </div>`
    : "";
  const bodyHtml = `
    <p style="font-size:18px;line-height:1.5;color:${BRAND.cream};margin:0 0 16px">${c.greeting}</p>
    ${c.intro}
    <p style="font-size:15px;color:${BRAND.creamSoft};margin:16px 0">${c.decisionsLine}</p>
    ${summarySection}
  `;
  const layout = renderLayout({
    preheader: c.subtitle,
    heroEmoji: "📋",
    heroTitle: c.hero,
    heroSubtitle: c.subtitle,
    bodyHtml,
    ctaLabel: c.cta,
    ctaHref: link,
    blockQuote: c.blockQuote,
    blockQuoteAuthor: c.blockQuoteAuthor,
    locale,
    baseUrl,
  });
  return {
    subject: c.subject,
    html: layout.html,
    text:
      `${c.subtitle}\n\n${c.decisionsLine.replace(/<[^>]+>/g, "")}\n\n` +
      (payload.summary ? `${c.summaryLabel}: ${payload.summary}\n\n` : "") +
      `${c.cta}: ${link}\n\n— ${c.blockQuoteAuthor}`,
  };
}

// ============================================================
// WELCOME · L'email le plus important — première impression
// ============================================================
//
// Storytelling : on raconte le pourquoi de BMD en 2 paragraphes.
// L'idée : créer une connexion émotionnelle dès le premier contact.

interface WelcomeCopy {
  subject: string;
  hero: string;
  subtitle: string;
  greeting: string;
  story: string;
  cta: string;
  benefits: Array<{ icon: string; title: string; body: string }>;
  quote: string;
  quoteAuthor: string;
}

const WELCOME_COPY: Partial<Record<EmailLocale, (n: string) => WelcomeCopy>> = {
  fr: (n) => ({
    subject: `Bienvenue chez BMD, ${n} 👋 — On t'attendait`,
    hero: `${n}, bienvenue chez nous`,
    subtitle: "On est super contents que tu sois là.",
    greeting: `Salut <strong>${htmlEscape(n)}</strong> 👋`,
    story: `<p>BMD est né d'une conviction simple : <strong>les histoires d'argent ne devraient jamais abîmer les histoires d'amitié.</strong></p>
<p>Combien de fois as-tu hésité à demander à un ami de te rembourser ? Combien de tontines, de voyages, de soirées entre potes ont laissé un goût amer parce que personne n'osait parler des comptes ?</p>
<p>On a construit BMD pour <strong>toi</strong> — et pour la communauté qui te ressemble. Diaspora africaine, asiatique, étudiants, colocs, paroisses, associations… tous ceux qui partagent leurs vies (et leurs dépenses) avec ceux qui comptent vraiment.</p>
<p>Maintenant que tu es là, on a hâte que tu découvres comme c'est <strong>simple, élégant et juste</strong>.</p>`,
    cta: "Créer mon premier groupe",
    benefits: [
      { icon: "🪙", title: "Tontines & coloc", body: "Un mode pour chaque type de partage : voyage, événement, tontine rotative, cotisations…" },
      { icon: "💱", title: "25 devises, FX en temps réel", body: "Paie en CFA, le coloc voit en EUR. Tout se convertit avec le taux du jour." },
      { icon: "🤝", title: "Régler en 1 tap", body: "Mobile Money, virement, cash — chacun ses méthodes, BMD compte juste." },
    ],
    quote: "L'argent partagé. L'amitié protégée.",
    quoteAuthor: "La promesse BMD",
  }),
  en: (n) => ({
    subject: `Welcome to BMD, ${n} 👋 — We've been waiting for you`,
    hero: `${n}, welcome home`,
    subtitle: "We're so glad you're here.",
    greeting: `Hi <strong>${htmlEscape(n)}</strong> 👋`,
    story: `<p>BMD was born from a simple belief: <strong>money stories should never break friendship stories.</strong></p>
<p>How many times have you hesitated to remind a friend to pay you back? How many trips, group dinners, or shared apartments left a bitter aftertaste because nobody dared talk about the math?</p>
<p>We built BMD for <strong>you</strong> — and for the community that feels like home. African and Asian diaspora, students, flatmates, parishes, associations… anyone who shares life (and expenses) with the people who really matter.</p>
<p>Now that you're here, we can't wait for you to discover how <strong>simple, elegant, and fair</strong> it can be.</p>`,
    cta: "Create my first group",
    benefits: [
      { icon: "🪙", title: "Tontines & flatshare", body: "A mode for every kind of sharing: trip, event, rotating tontine, monthly dues…" },
      { icon: "💱", title: "25 currencies, live FX", body: "Pay in CFA, your flatmate sees EUR. Everything converts at today's rate." },
      { icon: "🤝", title: "Settle in 1 tap", body: "Mobile Money, transfer, cash — everyone's preferred method, BMD just keeps the math." },
    ],
    quote: "Shared money. Friendships protected.",
    quoteAuthor: "The BMD promise",
  }),
  es: (n) => ({
    subject: `Bienvenido a BMD, ${n} 👋 — Te esperábamos`,
    hero: `${n}, bienvenido a casa`,
    subtitle: "Nos hace mucha ilusión tenerte aquí.",
    greeting: `Hola <strong>${htmlEscape(n)}</strong> 👋`,
    story: `<p>BMD nació de una convicción sencilla: <strong>las historias de dinero no deberían arruinar las historias de amistad.</strong></p>
<p>¿Cuántas veces dudaste antes de pedirle a un amigo que te devolviera lo que te debe? ¿Cuántos viajes, cenas, pisos compartidos dejaron un sabor amargo porque nadie se atrevía a hablar de las cuentas?</p>
<p>Construimos BMD para <strong>ti</strong> — y para la comunidad que se siente como casa. Diáspora africana y asiática, estudiantes, compañeros de piso, parroquias, asociaciones… cualquiera que comparte su vida (y sus gastos) con la gente que de verdad importa.</p>
<p>Ahora que estás aquí, no podemos esperar a que descubras lo <strong>simple, elegante y justo</strong> que puede ser.</p>`,
    cta: "Crear mi primer grupo",
    benefits: [
      { icon: "🪙", title: "Tontinas y piso", body: "Un modo para cada tipo de reparto: viaje, evento, tontina rotativa, cuotas…" },
      { icon: "💱", title: "25 divisas, FX en vivo", body: "Paga en CFA, tu compañero ve EUR. Todo se convierte al tipo del día." },
      { icon: "🤝", title: "Liquida en 1 toque", body: "Mobile Money, transferencia, efectivo — cada uno con su método, BMD solo lleva la cuenta." },
    ],
    quote: "Dinero compartido. Amistad protegida.",
    quoteAuthor: "La promesa BMD",
  }),
  pt: (n) => ({
    subject: `Bem-vindo ao BMD, ${n} 👋 — Estávamos esperando você`,
    hero: `${n}, seja bem-vindo`,
    subtitle: "Estamos muito felizes que você esteja aqui.",
    greeting: `Oi <strong>${htmlEscape(n)}</strong> 👋`,
    story: `<p>O BMD nasceu de uma convicção simples: <strong>histórias de dinheiro nunca deveriam estragar histórias de amizade.</strong></p>
<p>Quantas vezes você já hesitou em cobrar um amigo? Quantas viagens, jantares, repúblicas deixaram um gosto amargo porque ninguém quis falar de contas?</p>
<p>A gente construiu o BMD para <strong>você</strong> — e para a comunidade que parece família. Diáspora africana, asiática, estudantes, repúblicas, paróquias, associações… qualquer um que divide a vida (e as despesas) com as pessoas que realmente importam.</p>
<p>Agora que você chegou, mal podemos esperar que você descubra como pode ser <strong>simples, elegante e justo</strong>.</p>`,
    cta: "Criar meu primeiro grupo",
    benefits: [
      { icon: "🪙", title: "Tontinas & repúblicas", body: "Um modo para cada tipo de divisão: viagem, evento, tontina rotativa, mensalidades…" },
      { icon: "💱", title: "25 moedas, FX ao vivo", body: "Pague em CFA, seu colega vê em EUR. Tudo converte na taxa do dia." },
      { icon: "🤝", title: "Acerto em 1 toque", body: "Mobile Money, transferência, dinheiro — cada um com seu método, o BMD só faz as contas." },
    ],
    quote: "Dinheiro compartilhado. Amizade protegida.",
    quoteAuthor: "A promessa BMD",
  }),
  ar: (n) => ({
    subject: `أهلاً بك في BMD، ${n} 👋 — كنا في انتظارك`,
    hero: `${n}، أهلاً بك معنا`,
    subtitle: "نحن سعداء جداً بانضمامك.",
    greeting: `مرحباً <strong>${htmlEscape(n)}</strong> 👋`,
    story: `<p>وُلِد BMD من قناعة بسيطة: <strong>قصص المال يجب ألا تُفسد قصص الصداقة أبداً.</strong></p>
<p>كم مرة ترددت قبل أن تطلب من صديق أن يردّ لك المال؟ كم رحلة وعشاء وسكن مشترك ترك في النفس مرارة لأن لا أحد تجرّأ على الحديث عن الحسابات؟</p>
<p>بنينا BMD من أجلك أنت — ومن أجل المجتمع الذي يشبه البيت. الجاليات الأفريقية والآسيوية، الطلاب، شركاء السكن، الكنائس، الجمعيات… كل من يشارك حياته (ونفقاته) مع من يهمهم حقاً.</p>
<p>الآن وقد أتيت، لا نطيق صبراً حتى تكتشف كم يمكن أن يكون الأمر <strong>بسيطاً وأنيقاً وعادلاً</strong>.</p>`,
    cta: "أنشئ مجموعتي الأولى",
    benefits: [
      { icon: "🪙", title: "تونتين و سكن مشترك", body: "نمط لكل نوع من المشاركة: رحلة، مناسبة، تونتين دوّارة، اشتراكات…" },
      { icon: "💱", title: "٢٥ عملة بأسعار حية", body: "ادفع بـ CFA، يرى زميلك بـ EUR. كل شيء يُحوّل بسعر اليوم." },
      { icon: "🤝", title: "تسوية بنقرة واحدة", body: "Mobile Money، تحويل، نقد — كل بطريقته، BMD يحتسب الباقي." },
    ],
    quote: "مال مشترك. صداقة محمية.",
    quoteAuthor: "وعد BMD",
  }),
  de: (n) => ({
    subject: `Willkommen bei BMD, ${n} 👋 — Wir haben auf Sie gewartet`,
    hero: `${n}, schön dass Sie da sind`,
    subtitle: "Wir freuen uns sehr.",
    greeting: `Hallo <strong>${htmlEscape(n)}</strong> 👋`,
    story: `<p>BMD entstand aus einer einfachen Überzeugung: <strong>Geldgeschichten sollten niemals Freundschaftsgeschichten zerstören.</strong></p>
<p>Wie oft haben Sie gezögert, einen Freund an seine Schulden zu erinnern? Wie viele Reisen, Abendessen, WGs hinterließen einen bitteren Beigeschmack, weil sich niemand traute, über Zahlen zu sprechen?</p>
<p>Wir haben BMD für <strong>Sie</strong> gebaut — und für die Gemeinschaft, die sich wie Familie anfühlt. Afrikanische und asiatische Diaspora, Studierende, WG-Bewohner, Gemeinden, Vereine… alle, die ihr Leben (und Ausgaben) mit den Menschen teilen, die wirklich zählen.</p>
<p>Jetzt, da Sie hier sind, freuen wir uns, dass Sie entdecken, wie <strong>einfach, elegant und fair</strong> es sein kann.</p>`,
    cta: "Erste Gruppe erstellen",
    benefits: [
      { icon: "🪙", title: "Tontinen & WG", body: "Ein Modus für jede Aufteilung: Reise, Event, rotierende Tontine, Mietbeiträge…" },
      { icon: "💱", title: "25 Währungen mit Live-FX", body: "Bezahle in CFA, der Mitbewohner sieht EUR. Alles wandelt sich zum Tageskurs." },
      { icon: "🤝", title: "Mit 1 Tipp ausgleichen", body: "Mobile Money, Überweisung, Bargeld — jede Methode, BMD rechnet einfach." },
    ],
    quote: "Geteiltes Geld. Geschützte Freundschaft.",
    quoteAuthor: "Das BMD-Versprechen",
  }),
  it: (n) => ({
    subject: `Benvenuto in BMD, ${n} 👋 — Ti aspettavamo`,
    hero: `${n}, benvenuto a casa`,
    subtitle: "Siamo davvero felici di averti qui.",
    greeting: `Ciao <strong>${htmlEscape(n)}</strong> 👋`,
    story: `<p>BMD è nato da una convinzione semplice: <strong>le storie di soldi non dovrebbero mai rovinare le storie di amicizia.</strong></p>
<p>Quante volte hai esitato a chiedere a un amico di rimborsarti? Quanti viaggi, cene di gruppo, coinquilini hanno lasciato l'amaro in bocca perché nessuno osava parlare di conti?</p>
<p>Abbiamo costruito BMD per <strong>te</strong> — e per la comunità che ti somiglia. Diaspora africana e asiatica, studenti, coinquilini, parrocchie, associazioni… chiunque condivide la vita (e le spese) con chi conta davvero.</p>
<p>Ora che sei qui, non vediamo l'ora che tu scopra quanto può essere <strong>semplice, elegante e giusto</strong>.</p>`,
    cta: "Crea il mio primo gruppo",
    benefits: [
      { icon: "🪙", title: "Tontine & coinquilini", body: "Una modalità per ogni tipo di divisione: viaggio, evento, tontina rotativa, quote…" },
      { icon: "💱", title: "25 valute, FX in tempo reale", body: "Paga in CFA, il coinquilino vede EUR. Tutto si converte al tasso del giorno." },
      { icon: "🤝", title: "Salda in 1 tap", body: "Mobile Money, bonifico, contanti — ognuno il suo metodo, BMD fa solo i conti." },
    ],
    quote: "Denaro condiviso. Amicizia protetta.",
    quoteAuthor: "La promessa BMD",
  }),
  sw: (n) => ({
    subject: `Karibu BMD, ${n} 👋 — Tulikuwa tunakusubiri`,
    hero: `${n}, karibu nyumbani`,
    subtitle: "Tunafurahi sana ulipo hapa.",
    greeting: `Habari <strong>${htmlEscape(n)}</strong> 👋`,
    story: `<p>BMD ilizaliwa kutokana na imani rahisi: <strong>hadithi za pesa hazipaswi kamwe kuvunja hadithi za urafiki.</strong></p>
<p>Mara ngapi umesita kumkumbusha rafiki yako akulipe? Safari, chakula cha jioni, nyumba mbalimbali ziliacha ladha mbaya kwa sababu hakuna aliyejaribu kuzungumza kuhusu hesabu.</p>
<p>Tulijenga BMD kwa ajili <strong>yako</strong> — na kwa jamii inayohisi kama nyumbani. Wakimbizi wa Afrika na Asia, wanafunzi, wapangaji wenza, parokia, vyama… yeyote anayeshiriki maisha (na gharama) na watu wanaohesabu kweli.</p>
<p>Sasa kwa kuwa upo, hatuwezi kusubiri ugundue jinsi inavyoweza kuwa <strong>rahisi, ya kifahari na ya haki</strong>.</p>`,
    cta: "Tengeneza kikundi changu cha kwanza",
    benefits: [
      { icon: "🪙", title: "Tontine na nyumba", body: "Hali kwa kila aina ya mgawanyiko: safari, tukio, tontine ya kuzunguka, michango…" },
      { icon: "💱", title: "Sarafu 25, FX ya moja kwa moja", body: "Lipa kwa CFA, mwenzio anaona EUR. Yote inageuka kwa kiwango cha leo." },
      { icon: "🤝", title: "Lipa kwa mguso 1", body: "Mobile Money, uhamisho, fedha taslimu — kila mmoja na njia yake, BMD unahesabu tu." },
    ],
    quote: "Pesa pamoja. Urafiki ulindwa.",
    quoteAuthor: "Ahadi ya BMD",
  }),
  wo: (n) => ({
    subject: `Dalal Jamm ci BMD, ${n} 👋 — Dañu la nekkoon di séqu`,
    hero: `${n}, dalal jamm`,
    subtitle: "Begg nañu sa cosaan.",
    greeting: `Salam <strong>${htmlEscape(n)}</strong> 👋`,
    story: `<p>BMD juddu na ci ndogal bu woor : <strong>jaaru xaalis bi du war a yàq jaaru xarit.</strong></p>
<p>Ñaata yoon nga jiital di laaj sa xarit mu fey la dara ? Ñaata tukki, lekk ak xarit, koloñ amul gënë jinaxiy dund ndax kenn musa wax ay komptaa ?</p>
<p>Defar nañu BMD ngir yow — ak askan wi tollook yow. Diaspora afrika, asia, daara, koloñ, paroisses, mbootaayi… képp ku boole sa dund (ak dépenses) ak ñi am solo.</p>
<p>Léegi nga fi nekk, dañu liggéey nga gis ni mën a mucc <strong>woon, rafet ak yoon</strong>.</p>`,
    cta: "Sosaal sama groupe bu jëkk",
    benefits: [
      { icon: "🪙", title: "Tontines ak coloc", body: "Mode bu nekk ngir bopp séddale : tukki, événement, tontine yu wër…" },
      { icon: "💱", title: "25 devises, FX bu yàgg", body: "Fey ci CFA, sa coloc gis ko ci EUR. Lépp dafay sopplikoo ci taux bi." },
      { icon: "🤝", title: "Régler ci 1 tap", body: "Mobile Money, virement, cash — kuy nekk ak méthode bi mu bëgg." },
    ],
    quote: "Xaalis bu boole. Xarit gu aar.",
    quoteAuthor: "Digal BMD",
  }),
  ln: (n) => ({
    subject: `Boyei malamu na BMD, ${n} 👋 — Tozalaki kozela yo`,
    hero: `${n}, boyei malamu`,
    subtitle: "Tosepelaka mingi mpo ozali awa.",
    greeting: `Mbote <strong>${htmlEscape(n)}</strong> 👋`,
    story: `<p>BMD ebimaki uta na bondimi moko ya pete : <strong>masolo ya mbongo esengeli te kobebisa masolo ya bondeko.</strong></p>
<p>Mbala boni okakatana koloba na moninga ete azongisa yo mbongo ? Mibembo, balabala ya bandeko, makambo ya kosangana etikaki bololo mpo moto moko te ameka koloba ya kotanga ?</p>
<p>Totongi BMD mpo na <strong>yo</strong> — mpe mpo na bato basangani na yo. Diaspora afrika, asia, bana kelasi, bandeko ya ndako, paroisses, mangomba… moto nyonso oyo akabolaka bomoyi (mpe makambo ya mbongo) na bato ya solo.</p>
<p>Sikoyo ozali awa, tozali kozela ete oyeba ndenge ekoki kozala <strong>pete, kitoko mpe na bosembo</strong>.</p>`,
    cta: "Sala etuluku na ngai ya liboso",
    benefits: [
      { icon: "🪙", title: "Tontines mpe ndako", body: "Mode mpo na lolenge ya kokabola : mobembo, lisolo, tontine ya bozongi…" },
      { icon: "💱", title: "Mbongo 25, FX ya sika", body: "Futa na CFA, moninga akoki komona na EUR. Nyonso ekobongwana." },
      { icon: "🤝", title: "Régler na nzela ya 1 toque", body: "Mobile Money, virement, mbongo na maboko." },
    ],
    quote: "Mbongo ya kabolama. Boninga ekokangama.",
    quoteAuthor: "Ndaka ya BMD",
  }),
  am: (n) => ({
    subject: `እንኳን ወደ BMD በደህና መጡ፣ ${n} 👋 — እየጠበቅንዎ ነበር`,
    hero: `${n}፣ እንኳን በሰላም መጡ`,
    subtitle: "በመምጣትዎ በጣም ደስተኞች ነን።",
    greeting: `ሰላም <strong>${htmlEscape(n)}</strong> 👋`,
    story: `<p>BMD የተወለደው ከአንድ ቀላል እምነት ነው፦ <strong>የገንዘብ ታሪኮች በፍፁም የጓደኝነት ታሪኮችን ማበላሸት የለባቸውም።</strong></p>
<p>ስንቴ ጓደኛዎ እንዲከፍልዎ ለመጠየቅ አንገራግረዋል? ስንት ጉዞዎች፣ የቡድን እራት እና የጋራ መኖሪያ ቤቶች ሰው ስለ ሂሳብ መነጋገር ስላልደፈረ መጥፎ ጣዕም አስቀርተዋል?</p>
<p>BMDን ለ<strong>እርስዎ</strong> ሠርተናል — እና ቤት መሰል ለሚሰማው ማህበረሰብ። የአፍሪካ እና እስያ ዲያስፖራ፣ ተማሪዎች፣ ቤት ጓደኞች፣ ቤተ ክርስቲያኖች፣ ማህበራት… ህይወታቸውን (እና ወጪዎችን) ለሚጋሩ ሁሉ።</p>
<p>አሁን እዚህ ስለሆኑ፣ ምን ያህል <strong>ቀላል፣ የተዋበ እና ፍትሃዊ</strong> ሊሆን እንደሚችል እንዲያገኙ ጓጉተናል።</p>`,
    cta: "የመጀመሪያውን ቡድን ይፍጠሩ",
    benefits: [
      { icon: "🪙", title: "ቶንቲንስ እና የጋራ ቤት", body: "ለእያንዳንዱ የመከፋፈል ዓይነት ሁነታ።" },
      { icon: "💱", title: "25 ምንዛሬዎች፣ ቀጥታ FX", body: "በCFA ይክፈሉ፣ ጓደኛዎ EUR ያያል።" },
      { icon: "🤝", title: "በ1 ጠቅታ ይክፈሉ", body: "Mobile Money፣ ዝውውር፣ ጥሬ ገንዘብ።" },
    ],
    quote: "የጋራ ገንዘብ። የተጠበቀ ጓደኝነት።",
    quoteAuthor: "የBMD ተስፋ",
  }),
  ja: (n) => ({
    subject: `BMDへようこそ、${n}さん 👋 — お待ちしておりました`,
    hero: `${n}さん、ようこそ`,
    subtitle: "あなたを迎えられて嬉しいです。",
    greeting: `<strong>${htmlEscape(n)}</strong>さん、こんにちは 👋`,
    story: `<p>BMDはシンプルな信念から生まれました：<strong>お金の物語が友情の物語を壊すべきではありません。</strong></p>
<p>友達に返済をお願いするのをためらったことはありませんか？旅行、グループディナー、シェアハウスで誰も会計の話を切り出せず、後味が悪くなったことは？</p>
<p>BMDは<strong>あなた</strong>のために、そして家族のように感じられるコミュニティのために作りました。アフリカ・アジアのディアスポラ、学生、シェアメイト、教会、団体…本当に大切な人たちと人生（と支出）を分かち合うすべての人のために。</p>
<p>あなたが来てくださった今、これがどれほど<strong>シンプルで、エレガントで、公平</strong>になり得るかを発見していただくのが楽しみです。</p>`,
    cta: "最初のグループを作る",
    benefits: [
      { icon: "🪙", title: "トンティーヌ＆シェア", body: "あらゆる分担に対応するモード：旅行、イベント、回転トンティーヌ、月会費…" },
      { icon: "💱", title: "25通貨、リアルタイムFX", body: "CFAで支払い、ルームメイトはEURで見る。すべて当日レートで換算。" },
      { icon: "🤝", title: "1タップで精算", body: "Mobile Money、振込、現金 — 各自の方法でOK。" },
    ],
    quote: "共有のお金。守られた友情。",
    quoteAuthor: "BMDの約束",
  }),
  ko: (n) => ({
    subject: `BMD에 오신 것을 환영합니다, ${n}님 👋 — 기다리고 있었어요`,
    hero: `${n}님, 환영합니다`,
    subtitle: "함께해 주셔서 정말 기뻐요.",
    greeting: `안녕하세요 <strong>${htmlEscape(n)}</strong>님 👋`,
    story: `<p>BMD는 단순한 신념에서 시작되었습니다: <strong>돈 이야기가 우정 이야기를 망쳐서는 안 됩니다.</strong></p>
<p>친구에게 갚으라고 말하기를 망설인 적이 몇 번이나 있나요? 여행, 단체 식사, 셰어하우스에서 아무도 회계 이야기를 꺼내지 못해 씁쓸함이 남은 적은요?</p>
<p>BMD는 <strong>당신</strong>을 위해, 그리고 집처럼 느껴지는 공동체를 위해 만들어졌습니다. 아프리카·아시아 디아스포라, 학생, 셰어메이트, 교회, 단체… 정말 중요한 사람들과 삶(과 지출)을 나누는 모든 분을 위해.</p>
<p>이제 함께하시니, 이 모든 게 얼마나 <strong>단순하고 우아하며 공정</strong>할 수 있는지 발견하시기를 기대합니다.</p>`,
    cta: "첫 그룹 만들기",
    benefits: [
      { icon: "🪙", title: "톤티느 & 셰어하우스", body: "모든 종류의 분담을 위한 모드: 여행, 이벤트, 회전 톤티느, 월 회비…" },
      { icon: "💱", title: "25개 통화, 실시간 FX", body: "CFA로 결제하고 룸메이트는 EUR로 봅니다." },
      { icon: "🤝", title: "원탭 정산", body: "Mobile Money, 송금, 현금 — 각자의 방식으로." },
    ],
    quote: "공유 자금. 보호된 우정.",
    quoteAuthor: "BMD의 약속",
  }),
  zh: (n) => ({
    subject: `欢迎来到 BMD，${n} 👋 — 我们一直在等你`,
    hero: `${n}，欢迎回家`,
    subtitle: "很高兴你的到来。",
    greeting: `你好 <strong>${htmlEscape(n)}</strong> 👋`,
    story: `<p>BMD 源于一个简单的信念：<strong>金钱的故事不应该破坏友谊的故事。</strong></p>
<p>你有多少次在催促朋友还钱时犹豫？多少次旅行、聚餐、合租因为没人敢谈账目而留下苦涩？</p>
<p>我们为<strong>你</strong>而建造了 BMD —— 也为那个让你感到家的社区。非洲与亚洲华侨、学生、室友、教堂、社团… 所有与真正重要的人分享生活（与支出）的人。</p>
<p>现在你来了，我们迫不及待让你发现这一切可以多么<strong>简单、优雅、公平</strong>。</p>`,
    cta: "创建我的第一个群组",
    benefits: [
      { icon: "🪙", title: "互助会与合租", body: "为每种分担方式提供模式：旅行、活动、轮转互助会、月费…" },
      { icon: "💱", title: "25种货币，实时汇率", body: "用CFA付款，室友看到EUR。一切按当日汇率转换。" },
      { icon: "🤝", title: "一键结算", body: "Mobile Money、转账、现金 —— 各自的方式。" },
    ],
    quote: "共享金钱。守护友谊。",
    quoteAuthor: "BMD 的承诺",
  }),
};

function renderWelcome(p: WelcomeEmailPayload, loc: EmailLocale, baseUrl: string) {
  const c = pickCopy(WELCOME_COPY, loc, p.displayName);
  const r = renderLayout({
    preheader: c.subject,
    heroEmoji: "👋",
    heroTitle: c.hero,
    heroSubtitle: c.subtitle,
    bodyHtml: c.story,
    ctaLabel: c.cta,
    ctaHref: `${baseUrl}/dashboard`,
    benefits: c.benefits,
    blockQuote: c.quote,
    blockQuoteAuthor: c.quoteAuthor,
    locale: loc,
    baseUrl,
  });
  return { subject: c.subject, html: r.html, text: r.text };
}

// ============================================================
// OTP · code de connexion — court, élégant, rassurant
// ============================================================

interface OtpCopy {
  subject: string;
  hero: string;
  subtitle: string;
  body: string;
  warning: string;
  ignore: string;
}

const OTP_COPY: Partial<Record<EmailLocale, (code: string, ttl: number) => OtpCopy>> = {
  fr: (code, ttl) => ({
    subject: `${code} · ton code BMD`,
    hero: "Ton code de connexion",
    subtitle: `Voici les 6 chiffres pour ouvrir ta porte ${ttl > 1 ? `(valable ${ttl} minutes)` : "(valable 1 minute)"}`,
    body: code,
    warning: `Ce code expire dans <strong>${ttl} minutes</strong>.`,
    ignore: "Si ce n'est pas toi qui demandes à te connecter, ignore simplement ce mail — personne d'autre que toi ne peut accéder à ton compte sans ce code.",
  }),
  en: (code, ttl) => ({
    subject: `${code} · your BMD sign-in code`,
    hero: "Your sign-in code",
    subtitle: `Here are the 6 digits to open your door (valid for ${ttl} minutes)`,
    body: code,
    warning: `This code expires in <strong>${ttl} minutes</strong>.`,
    ignore: "If you didn't ask to sign in, just ignore this email — no one else can access your account without this code.",
  }),
  es: (code, ttl) => ({
    subject: `${code} · tu código BMD`,
    hero: "Tu código de acceso",
    subtitle: `Aquí tienes los 6 dígitos para abrir tu puerta (válido ${ttl} minutos)`,
    body: code,
    warning: `Este código expira en <strong>${ttl} minutos</strong>.`,
    ignore: "Si no fuiste tú, ignora este correo — nadie más puede entrar a tu cuenta sin este código.",
  }),
  pt: (code, ttl) => ({
    subject: `${code} · seu código BMD`,
    hero: "Seu código de acesso",
    subtitle: `Aqui estão os 6 dígitos para abrir sua porta (válido ${ttl} minutos)`,
    body: code,
    warning: `Este código expira em <strong>${ttl} minutos</strong>.`,
    ignore: "Se não foi você, ignore este email — ninguém mais pode entrar na sua conta sem este código.",
  }),
  ar: (code, ttl) => ({
    subject: `${code} · رمز BMD`,
    hero: "رمز تسجيل الدخول",
    subtitle: `إليك الأرقام الستة لفتح بابك (صالح ${ttl} دقيقة)`,
    body: code,
    warning: `ينتهي هذا الرمز خلال <strong>${ttl} دقيقة</strong>.`,
    ignore: "إذا لم تطلب الدخول، تجاهل هذا البريد — لا يمكن لأحد الوصول إلى حسابك دون هذا الرمز.",
  }),
  de: (code, ttl) => ({
    subject: `${code} · Ihr BMD-Code`,
    hero: "Ihr Anmeldecode",
    subtitle: `Hier sind die 6 Ziffern, um Ihre Tür zu öffnen (${ttl} Minuten gültig)`,
    body: code,
    warning: `Dieser Code läuft in <strong>${ttl} Minuten</strong> ab.`,
    ignore: "Wenn Sie sich nicht anmelden wollten, ignorieren Sie diese E-Mail einfach.",
  }),
  it: (code, ttl) => ({
    subject: `${code} · il tuo codice BMD`,
    hero: "Il tuo codice di accesso",
    subtitle: `Ecco le 6 cifre per aprire la porta (validità ${ttl} minuti)`,
    body: code,
    warning: `Questo codice scade tra <strong>${ttl} minuti</strong>.`,
    ignore: "Se non sei stato tu, ignora questa email — nessun altro può accedere al tuo account senza questo codice.",
  }),
  sw: (code, ttl) => ({
    subject: `${code} · msimbo wako wa BMD`,
    hero: "Msimbo wa kuingia",
    subtitle: `Hii ndio nambari 6 za kufungua mlango wako (halali ${ttl} dakika)`,
    body: code,
    warning: `Msimbo huu unaisha baada ya <strong>${ttl} dakika</strong>.`,
    ignore: "Ikiwa hukuomba kuingia, puuzia barua pepe hii.",
  }),
  wo: (code, ttl) => ({
    subject: `${code} · sa code BMD`,
    hero: "Sa code dugg",
    subtitle: `Lii nag 6 chiffres ngir ubbi sa bunt (yaag ${ttl} minit)`,
    body: code,
    warning: `Code bi day jeex <strong>${ttl} minit</strong> kanam.`,
    ignore: "Su laajul, gënë email bi fii.",
  }),
  ln: (code, ttl) => ({
    subject: `${code} · code na yo ya BMD`,
    hero: "Code ya kokota",
    subtitle: `Tala 6 nimero mpo na kofungola porte na yo (ezali na ngonga ${ttl})`,
    body: code,
    warning: `Code oyo ekosila na <strong>${ttl} miniti</strong>.`,
    ignore: "Soki osengaki te kokota, longola email oyo.",
  }),
  am: (code, ttl) => ({
    subject: `${code} · የእርስዎ BMD ኮድ`,
    hero: "የመግቢያ ኮድ",
    subtitle: `በሩን ለመክፈት 6 አሃዞች (${ttl} ደቂቃ ይሰራል)`,
    body: code,
    warning: `ይህ ኮድ በ<strong>${ttl} ደቂቃ</strong> ያበቃል።`,
    ignore: "እርስዎ ካልጠየቁ፣ ይህን ኢሜይል ይተውት።",
  }),
  ja: (code, ttl) => ({
    subject: `${code} · BMDサインインコード`,
    hero: "ログインコード",
    subtitle: `ドアを開ける6桁の番号です（${ttl}分間有効）`,
    body: code,
    warning: `このコードは<strong>${ttl}分</strong>で期限切れになります。`,
    ignore: "ログインを依頼していない場合、このメールは無視してください。",
  }),
  ko: (code, ttl) => ({
    subject: `${code} · BMD 로그인 코드`,
    hero: "로그인 코드",
    subtitle: `문을 여는 6자리 숫자입니다 (${ttl}분간 유효)`,
    body: code,
    warning: `이 코드는 <strong>${ttl}분</strong> 후 만료됩니다.`,
    ignore: "로그인을 요청하지 않았다면 이 이메일을 무시하세요.",
  }),
  zh: (code, ttl) => ({
    subject: `${code} · BMD 登录验证码`,
    hero: "登录验证码",
    subtitle: `打开您的门的6位数字（有效期${ttl}分钟）`,
    body: code,
    warning: `此验证码将在 <strong>${ttl} 分钟</strong>内过期。`,
    ignore: "如果不是您请求的，请忽略此邮件。",
  }),
};

function renderOtp(p: OtpEmailPayload, loc: EmailLocale, baseUrl: string) {
  // Sprint AC-5 · fallback intelligent : EN pour locales non-couvertes, FR sinon
  const fn =
    OTP_COPY[loc] ??
    (FALLBACK_TO_EN.has(loc) ? OTP_COPY.en : OTP_COPY.fr) ??
    OTP_COPY.fr!;
  const c = fn(p.code, p.ttlMinutes);
  // Pour OTP : pas de CTA bouton (le user doit copier le code), pas de quote
  const codeBlock = `
    <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:8px auto 24px">
      <tr><td style="padding:24px 36px;background:linear-gradient(135deg,rgba(232,163,61,0.18),rgba(181,70,46,0.10));border:1.5px dashed ${BRAND.saffron};border-radius:14px;text-align:center">
        <p style="font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:42px;letter-spacing:12px;color:${BRAND.saffron};font-weight:700;margin:0;line-height:1">
          ${htmlEscape(c.body)}
        </p>
      </td></tr>
    </table>
    <p style="font-size:13px;color:${BRAND.creamSoft};line-height:1.6;margin:0 0 12px;text-align:center">
      ${c.warning}
    </p>
    <p style="font-size:12px;color:${BRAND.muted};line-height:1.6;margin:16px 0 0">
      🛡️ ${htmlEscape(c.ignore)}
    </p>
  `;
  const r = renderLayout({
    preheader: c.subject,
    heroEmoji: "🔐",
    heroTitle: c.hero,
    heroSubtitle: c.subtitle,
    bodyHtml: codeBlock,
    locale: loc,
    baseUrl,
  });
  return { subject: c.subject, html: r.html, text: r.text };
}

// ============================================================
// GROUP INVITE · invitation chaleureuse à rejoindre un groupe
// ============================================================

function renderGroupInvite(p: GroupInvitePayload, loc: EmailLocale, baseUrl: string) {
  const C = {
    fr: {
      subject: `${p.inviterName} t'invite à rejoindre « ${p.groupName} » 💌`,
      hero: `${htmlEscape(p.inviterName)} pense à toi`,
      subtitle: `Tu es invité·e à rejoindre le groupe « ${htmlEscape(p.groupName)} »`,
      story: `<p>Bonne nouvelle ! <strong>${htmlEscape(p.inviterName)}</strong> vient de te tagguer dans son groupe BMD.</p>
<p>« ${htmlEscape(p.groupName)} » réunit des personnes qui partagent des dépenses ensemble — tu en fais partie. À l'intérieur, tu vas pouvoir voir qui doit quoi à qui, ajouter tes propres dépenses et régler en un tap quand vient le moment.</p>
<p style="opacity:0.85">Pas d'app à installer, pas de carte à donner, juste ton numéro ou ton email. C'est aussi simple que ça.</p>`,
      cta: "Rejoindre le groupe",
      quote: "Le partage devient plus léger quand chacun voit clair.",
      quoteAuthor: "Sagesse africaine",
    },
    en: {
      subject: `${p.inviterName} invited you to "${p.groupName}" 💌`,
      hero: `${htmlEscape(p.inviterName)} thought of you`,
      subtitle: `You're invited to join "${htmlEscape(p.groupName)}"`,
      story: `<p>Good news! <strong>${htmlEscape(p.inviterName)}</strong> just added you to their BMD group.</p>
<p>"${htmlEscape(p.groupName)}" brings together people who share expenses together — you're now one of them. Inside, you'll see who owes what to whom, add your own expenses, and settle up in one tap whenever needed.</p>
<p style="opacity:0.85">No app to install, no card to give — just your number or email. That's it.</p>`,
      cta: "Join the group",
      quote: "Sharing becomes lighter when everyone sees clearly.",
      quoteAuthor: "African wisdom",
    },
    es: {
      subject: `${p.inviterName} te invita a "${p.groupName}" 💌`,
      hero: `${htmlEscape(p.inviterName)} pensó en ti`,
      subtitle: `Estás invitado/a al grupo "${htmlEscape(p.groupName)}"`,
      story: `<p>¡Buena noticia! <strong>${htmlEscape(p.inviterName)}</strong> acaba de añadirte a su grupo BMD.</p>
<p>"${htmlEscape(p.groupName)}" reúne a las personas que comparten gastos juntas — ahora tú eres una de ellas. Dentro podrás ver quién debe qué a quién, añadir tus gastos y liquidar con un toque cuando sea el momento.</p>
<p style="opacity:0.85">Sin app que instalar, sin tarjeta — solo tu número o email. Así de simple.</p>`,
      cta: "Unirme al grupo",
      quote: "Compartir se vuelve más ligero cuando todos lo ven claro.",
      quoteAuthor: "Sabiduría africana",
    },
    pt: {
      subject: `${p.inviterName} te convidou para "${p.groupName}" 💌`,
      hero: `${htmlEscape(p.inviterName)} pensou em você`,
      subtitle: `Você foi convidado para "${htmlEscape(p.groupName)}"`,
      story: `<p>Boa notícia! <strong>${htmlEscape(p.inviterName)}</strong> acabou de te adicionar ao grupo BMD.</p>
<p>"${htmlEscape(p.groupName)}" reúne pessoas que dividem despesas juntas — agora você é uma delas. Lá dentro, você verá quem deve o que a quem, adicionará suas despesas e fará acertos com um toque.</p>
<p style="opacity:0.85">Sem app pra instalar, sem cartão — só seu número ou email.</p>`,
      cta: "Entrar no grupo",
      quote: "Dividir fica mais leve quando todos veem com clareza.",
      quoteAuthor: "Sabedoria africana",
    },
    ar: {
      subject: `${p.inviterName} يدعوك إلى «${p.groupName}» 💌`,
      hero: `${htmlEscape(p.inviterName)} يفكر بك`,
      subtitle: `أنت مدعوّ للانضمام إلى مجموعة «${htmlEscape(p.groupName)}»`,
      story: `<p>خبر جميل! <strong>${htmlEscape(p.inviterName)}</strong> أضافك للتو إلى مجموعته على BMD.</p>
<p>«${htmlEscape(p.groupName)}» تجمع أشخاصاً يتشاركون النفقات معاً — أنت الآن واحد منهم.</p>
<p style="opacity:0.85">لا تطبيق للتنزيل، لا بطاقة — فقط رقمك أو بريدك.</p>`,
      cta: "الانضمام للمجموعة",
      quote: "التشارك يصبح أخفّ عندما يرى الجميع بوضوح.",
      quoteAuthor: "حكمة إفريقية",
    },
    de: {
      subject: `${p.inviterName} lädt Sie zu „${p.groupName}" ein 💌`,
      hero: `${htmlEscape(p.inviterName)} denkt an Sie`,
      subtitle: `Sie sind eingeladen, der Gruppe „${htmlEscape(p.groupName)}" beizutreten`,
      story: `<p>Gute Nachricht! <strong>${htmlEscape(p.inviterName)}</strong> hat Sie zur BMD-Gruppe hinzugefügt.</p>
<p>„${htmlEscape(p.groupName)}" bringt Menschen zusammen, die Ausgaben teilen — Sie gehören jetzt dazu.</p>`,
      cta: "Gruppe beitreten",
      quote: "Teilen wird leichter, wenn alle klar sehen.",
      quoteAuthor: "Afrikanische Weisheit",
    },
    it: {
      subject: `${p.inviterName} ti ha invitato in "${p.groupName}" 💌`,
      hero: `${htmlEscape(p.inviterName)} ha pensato a te`,
      subtitle: `Sei invitato a "${htmlEscape(p.groupName)}"`,
      story: `<p>Buone notizie! <strong>${htmlEscape(p.inviterName)}</strong> ti ha appena aggiunto al suo gruppo BMD.</p>
<p>"${htmlEscape(p.groupName)}" riunisce persone che condividono spese — ora ne fai parte.</p>`,
      cta: "Unisciti al gruppo",
      quote: "Condividere diventa più leggero quando tutti vedono chiaro.",
      quoteAuthor: "Saggezza africana",
    },
    sw: {
      subject: `${p.inviterName} amekuomba ujiunge "${p.groupName}" 💌`,
      hero: `${htmlEscape(p.inviterName)} alikufikiria`,
      subtitle: `Umealikwa kwenye kikundi "${htmlEscape(p.groupName)}"`,
      story: `<p>Habari njema! <strong>${htmlEscape(p.inviterName)}</strong> amekuongeza kwenye kikundi cha BMD.</p>`,
      cta: "Jiunge na kikundi",
      quote: "Kushiriki kunakuwa rahisi pale wote wakionavyo waziwazi.",
      quoteAuthor: "Hekima ya Kiafrika",
    },
    wo: {
      subject: `${p.inviterName} a la woolu ci "${p.groupName}" 💌`,
      hero: `${htmlEscape(p.inviterName)} bëgg na ñu`,
      subtitle: `Ñu woolu la ngir bokk ci groupe "${htmlEscape(p.groupName)}"`,
      story: `<p>Mbir bu rafet ! <strong>${htmlEscape(p.inviterName)}</strong> moo la dolli ci groupe BMD bi.</p>`,
      cta: "Bokk ci groupe bi",
      quote: "Séddale dafay yomb soo gisul.",
      quoteAuthor: "Xame-xam afrik",
    },
    ln: {
      subject: `${p.inviterName} abengi yo na "${p.groupName}" 💌`,
      hero: `${htmlEscape(p.inviterName)} azali kokanisa yo`,
      subtitle: `Obengami na etuluku "${htmlEscape(p.groupName)}"`,
      story: `<p>Sango ya malamu ! <strong>${htmlEscape(p.inviterName)}</strong> abakisi yo na etuluku ya BMD.</p>`,
      cta: "Kota na etuluku",
      quote: "Kokabola ezalaka pete soki bato banso bamoni polele.",
      quoteAuthor: "Bwanya ya Afrika",
    },
    am: {
      subject: `${p.inviterName} ወደ "${p.groupName}" ጋበዝዎት 💌`,
      hero: `${htmlEscape(p.inviterName)} ስለ እርስዎ አስቧል`,
      subtitle: `"${htmlEscape(p.groupName)}" ቡድንን ለመቀላቀል ተጋብዘዋል`,
      story: `<p>መልካም ዜና! <strong>${htmlEscape(p.inviterName)}</strong> ወደ BMD ቡድኑ አክሎዎት።</p>`,
      cta: "ቡድኑን ይቀላቀሉ",
      quote: "መጋራት ሁሉም በግልፅ ሲያይ ቀላል ይሆናል።",
      quoteAuthor: "የአፍሪካ ጥበብ",
    },
    ja: {
      subject: `${p.inviterName}さんが「${p.groupName}」に招待しました 💌`,
      hero: `${htmlEscape(p.inviterName)}さんが思い出してくれました`,
      subtitle: `「${htmlEscape(p.groupName)}」グループへの招待`,
      story: `<p>嬉しいお知らせです！<strong>${htmlEscape(p.inviterName)}</strong>さんがあなたをBMDグループに追加しました。</p>`,
      cta: "グループに参加",
      quote: "皆が明確に見えると、分かち合いはより軽やかになります。",
      quoteAuthor: "アフリカの知恵",
    },
    ko: {
      subject: `${p.inviterName}님이 "${p.groupName}"에 초대했어요 💌`,
      hero: `${htmlEscape(p.inviterName)}님이 떠올렸어요`,
      subtitle: `"${htmlEscape(p.groupName)}" 그룹에 초대되었습니다`,
      story: `<p>좋은 소식이에요! <strong>${htmlEscape(p.inviterName)}</strong>님이 BMD 그룹에 추가했습니다.</p>`,
      cta: "그룹 참여",
      quote: "모두가 명확히 볼 때 나눔은 더 가벼워집니다.",
      quoteAuthor: "아프리카 지혜",
    },
    zh: {
      subject: `${p.inviterName}邀请你加入「${p.groupName}」💌`,
      hero: `${htmlEscape(p.inviterName)}想到了你`,
      subtitle: `你被邀请加入「${htmlEscape(p.groupName)}」`,
      story: `<p>好消息！<strong>${htmlEscape(p.inviterName)}</strong>刚把你加入了 BMD 群组。</p>`,
      cta: "加入群组",
      quote: "当大家都看清时，分享变得更轻松。",
      quoteAuthor: "非洲智慧",
    },
  };
  const c = (C as any)[loc] ?? C.fr;
  const r = renderLayout({
    preheader: c.subject,
    heroEmoji: "💌",
    heroTitle: c.hero,
    heroSubtitle: c.subtitle,
    bodyHtml: c.story,
    ctaLabel: c.cta,
    ctaHref: p.joinUrl,
    blockQuote: c.quote,
    blockQuoteAuthor: c.quoteAuthor,
    locale: loc,
    baseUrl,
  });
  return { subject: c.subject, html: r.html, text: r.text };
}

// ============================================================
// EXPENSE ADDED · notification de nouvelle dépense
// ============================================================
function renderExpenseAdded(p: ExpenseAddedPayload, loc: EmailLocale, baseUrl: string) {
  const C: any = {
    fr: {
      subject: `${p.payerName} a ajouté ${p.amount} ${p.currency} dans ${p.groupName}`,
      hero: `Nouvelle dépense ajoutée`,
      subtitle: `${htmlEscape(p.payerName)} vient d'enregistrer une dépense dans ${htmlEscape(p.groupName)}`,
      body: `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:rgba(232,163,61,0.06);border:1px solid rgba(232,163,61,0.18);border-radius:14px;padding:20px;margin:8px 0">
<tr><td>
<p style="font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-weight:700;color:${BRAND.saffron};margin:0;line-height:1">${htmlEscape(p.amount)} ${htmlEscape(p.currency)}</p>
<p style="font-size:14px;color:${BRAND.cream};margin:8px 0 0">${htmlEscape(p.description)}</p>
<p style="font-size:11px;color:${BRAND.gold};letter-spacing:1.5px;text-transform:uppercase;font-weight:600;margin:14px 0 0">Groupe · ${htmlEscape(p.groupName)}</p>
</td></tr></table>
<p>On a mis à jour ton solde. Si tu veux jeter un œil ou ajouter des détails, c'est par ici 👇</p>`,
      cta: "Voir le groupe",
    },
    en: {
      subject: `${p.payerName} added ${p.amount} ${p.currency} in ${p.groupName}`,
      hero: `New expense added`,
      subtitle: `${htmlEscape(p.payerName)} just logged an expense in ${htmlEscape(p.groupName)}`,
      body: `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:rgba(232,163,61,0.06);border:1px solid rgba(232,163,61,0.18);border-radius:14px;padding:20px;margin:8px 0">
<tr><td>
<p style="font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-weight:700;color:${BRAND.saffron};margin:0;line-height:1">${htmlEscape(p.amount)} ${htmlEscape(p.currency)}</p>
<p style="font-size:14px;color:${BRAND.cream};margin:8px 0 0">${htmlEscape(p.description)}</p>
<p style="font-size:11px;color:${BRAND.gold};letter-spacing:1.5px;text-transform:uppercase;font-weight:600;margin:14px 0 0">Group · ${htmlEscape(p.groupName)}</p>
</td></tr></table>
<p>Your balance has been updated. Take a peek if you want 👇</p>`,
      cta: "View group",
    },
  };
  const c = C[loc] ?? C.fr;
  const r = renderLayout({
    preheader: c.subject,
    heroEmoji: "💸",
    heroTitle: c.hero,
    heroSubtitle: c.subtitle,
    bodyHtml: c.body,
    ctaLabel: c.cta,
    ctaHref: p.groupUrl,
    locale: loc,
    baseUrl,
  });
  return { subject: c.subject, html: r.html, text: r.text };
}

// ============================================================
// SETTLEMENT PROPOSED · notification de règlement proposé
// ============================================================
function renderSettlementProposed(p: SettlementProposedPayload, loc: EmailLocale, baseUrl: string) {
  const C: any = {
    fr: {
      subject: `${p.fromName} veut te régler ${p.amount} ${p.currency} 🤝`,
      hero: `Un règlement t'attend`,
      subtitle: `${htmlEscape(p.fromName)} veut solder sa dette dans ${htmlEscape(p.groupName)}`,
      body: `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:rgba(63,125,92,0.10);border:1px solid rgba(63,125,92,0.30);border-radius:14px;padding:20px;margin:8px 0;text-align:center">
<tr><td>
<p style="font-size:11px;color:${BRAND.emerald};letter-spacing:2px;text-transform:uppercase;font-weight:700;margin:0">À recevoir</p>
<p style="font-family:'Cormorant Garamond',Georgia,serif;font-size:38px;font-weight:700;color:${BRAND.cream};margin:6px 0 0;line-height:1">+${htmlEscape(p.amount)} ${htmlEscape(p.currency)}</p>
<p style="font-size:12px;color:${BRAND.creamSoft};margin:8px 0 0">de la part de <strong>${htmlEscape(p.fromName)}</strong></p>
</td></tr></table>
<p>Quand tu auras reçu le paiement (Mobile Money, virement, espèces…), confirme la réception sur BMD pour clôturer le solde. Tout sera mis à jour automatiquement.</p>`,
      cta: "Confirmer la réception",
    },
    en: {
      subject: `${p.fromName} wants to settle ${p.amount} ${p.currency} with you 🤝`,
      hero: `A settlement is coming your way`,
      subtitle: `${htmlEscape(p.fromName)} wants to clear their debt in ${htmlEscape(p.groupName)}`,
      body: `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:rgba(63,125,92,0.10);border:1px solid rgba(63,125,92,0.30);border-radius:14px;padding:20px;margin:8px 0;text-align:center">
<tr><td>
<p style="font-size:11px;color:${BRAND.emerald};letter-spacing:2px;text-transform:uppercase;font-weight:700;margin:0">Incoming</p>
<p style="font-family:'Cormorant Garamond',Georgia,serif;font-size:38px;font-weight:700;color:${BRAND.cream};margin:6px 0 0;line-height:1">+${htmlEscape(p.amount)} ${htmlEscape(p.currency)}</p>
<p style="font-size:12px;color:${BRAND.creamSoft};margin:8px 0 0">from <strong>${htmlEscape(p.fromName)}</strong></p>
</td></tr></table>
<p>Once you receive the payment (Mobile Money, transfer, cash…), confirm receipt in BMD to close the balance. Everything updates automatically.</p>`,
      cta: "Confirm receipt",
    },
  };
  const c = C[loc] ?? C.fr;
  const r = renderLayout({
    preheader: c.subject,
    heroEmoji: "🤝",
    heroTitle: c.hero,
    heroSubtitle: c.subtitle,
    bodyHtml: c.body,
    ctaLabel: c.cta,
    ctaHref: p.confirmUrl,
    locale: loc,
    baseUrl,
  });
  return { subject: c.subject, html: r.html, text: r.text };
}

// ============================================================
// WEEKLY DIGEST · résumé hebdo
// ============================================================
function renderWeeklyDigest(p: WeeklyDigestPayload, loc: EmailLocale, baseUrl: string) {
  const C: any = {
    fr: {
      subject: `Ta semaine BMD · ${p.totalSpent} dépensé`,
      hero: `${htmlEscape(p.displayName)}, ta semaine en bref`,
      subtitle: `Voici ton récap depuis le ${htmlEscape(p.weekStart)}`,
      body: `<p>Une semaine ça passe vite — voici ce qui s'est passé sur BMD :</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:12px 0">
<tr>
<td style="padding:14px;background:rgba(232,163,61,0.08);border:1px solid rgba(232,163,61,0.2);border-radius:12px;width:48%;text-align:center;vertical-align:top">
  <p style="font-size:11px;color:${BRAND.gold};letter-spacing:1.5px;text-transform:uppercase;font-weight:700;margin:0">Dépensé</p>
  <p style="font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;font-weight:700;color:${BRAND.saffron};margin:6px 0 0">${htmlEscape(p.totalSpent)}</p>
</td>
<td style="width:4%">&nbsp;</td>
<td style="padding:14px;background:rgba(63,125,92,0.08);border:1px solid rgba(63,125,92,0.2);border-radius:12px;width:48%;text-align:center;vertical-align:top">
  <p style="font-size:11px;color:${BRAND.emerald};letter-spacing:1.5px;text-transform:uppercase;font-weight:700;margin:0">Top groupe</p>
  <p style="font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;font-weight:700;color:${BRAND.cream};margin:6px 0 0;line-height:1.2">${htmlEscape(p.topGroup)}</p>
</td>
</tr></table>
<p>On t'envoie ce récap chaque semaine pour que tu gardes l'œil — et que rien ne te surprenne en fin de mois.</p>`,
      cta: "Voir le détail",
    },
    en: {
      subject: `Your BMD week · ${p.totalSpent} spent`,
      hero: `${htmlEscape(p.displayName)}, your week in a glance`,
      subtitle: `Recap since ${htmlEscape(p.weekStart)}`,
      body: `<p>A week flies — here's what happened on BMD:</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:12px 0">
<tr>
<td style="padding:14px;background:rgba(232,163,61,0.08);border:1px solid rgba(232,163,61,0.2);border-radius:12px;width:48%;text-align:center;vertical-align:top">
  <p style="font-size:11px;color:${BRAND.gold};letter-spacing:1.5px;text-transform:uppercase;font-weight:700;margin:0">Spent</p>
  <p style="font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;font-weight:700;color:${BRAND.saffron};margin:6px 0 0">${htmlEscape(p.totalSpent)}</p>
</td>
<td style="width:4%">&nbsp;</td>
<td style="padding:14px;background:rgba(63,125,92,0.08);border:1px solid rgba(63,125,92,0.2);border-radius:12px;width:48%;text-align:center;vertical-align:top">
  <p style="font-size:11px;color:${BRAND.emerald};letter-spacing:1.5px;text-transform:uppercase;font-weight:700;margin:0">Top group</p>
  <p style="font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;font-weight:700;color:${BRAND.cream};margin:6px 0 0;line-height:1.2">${htmlEscape(p.topGroup)}</p>
</td>
</tr></table>
<p>We send this recap every week so you keep an eye — no surprises at month-end.</p>`,
      cta: "View details",
    },
  };
  const c = C[loc] ?? C.fr;
  const r = renderLayout({
    preheader: c.subject,
    heroEmoji: "📊",
    heroTitle: c.hero,
    heroSubtitle: c.subtitle,
    bodyHtml: c.body,
    ctaLabel: c.cta,
    ctaHref: p.dashboardUrl,
    locale: loc,
    baseUrl,
  });
  return { subject: c.subject, html: r.html, text: r.text };
}

// ============================================================
// V150.A6 · RECONNAISSANCES DE DETTE (RDD) · 4 templates
// ============================================================
//
// Ton : pro mais chaleureux ("la confiance qui s'écrit"). Le module RDD
// formalise un acte juridiquement structurant — l'email doit inspirer
// confiance ET solennité, sans être froid. On garde le ton tutoiement BMD
// (sauf DE = vouvoiement).
//
// Layout commun :
//  - hero gradient cocoa→saffron
//  - card du contrat avec amount Cormorant 36px
//  - bloc « ce que ça signifie » pour expliquer la portée
//  - CTA principal pointant vers /dashboard/debts/[id]
//  - micro-quote sur la confiance / l'amitié

/**
 * Helper interne : card RDD réutilisée dans les 4 templates.
 * Affiche montant, code, détails complémentaires en bloc visuel.
 */
function debtContractCard(opts: {
  amount: string;
  currency: string;
  lines: Array<{ label: string; value: string }>;
}): string {
  const rows = opts.lines
    .map(
      (l) => `<tr>
<td style="padding:6px 0;color:${BRAND.creamSoft};font-size:12px;letter-spacing:0.5px">${htmlEscape(l.label)}</td>
<td style="padding:6px 0;color:${BRAND.cream};font-size:13px;text-align:right">${htmlEscape(l.value)}</td>
</tr>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:rgba(232,163,61,0.08);border:1px solid rgba(232,163,61,0.22);border-radius:14px;padding:22px;margin:8px 0 18px">
<tr><td>
<p style="font-family:'Cormorant Garamond',Georgia,serif;font-size:36px;font-weight:700;color:${BRAND.saffron};margin:0 0 4px;line-height:1">${htmlEscape(opts.amount)} ${htmlEscape(opts.currency)}</p>
<p style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${BRAND.gold};margin:0 0 14px;font-weight:600">Reconnaissance de dette · BMD</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%">${rows}</table>
</td></tr></table>`;
}

// ------------------------------------------------------------
// DEBT_PROPOSED · le créancier envoie le contrat au débiteur
// ------------------------------------------------------------
function renderDebtProposed(
  p: DebtProposedPayload,
  loc: EmailLocale,
  baseUrl: string,
) {
  const C: Partial<Record<EmailLocale, {
    subject: string;
    hero: string;
    subtitle: string;
    storyTop: string;
    detailsAmount: string;
    detailsInstallments: string;
    detailsRate: string;
    detailsPurpose: string;
    detailsExpiry: string;
    storyBottom: string;
    cta: string;
    quote: string;
    quoteAuthor: string;
  }>> = {
    fr: {
      subject: `${p.creditorName} te propose une reconnaissance de dette · ${p.amount} ${p.currency}`,
      hero: `Une reconnaissance qui t'attend`,
      subtitle: `${htmlEscape(p.creditorName)} t'a préparé un contrat clair, traçable et signable en un tap`,
      storyTop: `<p>Bonjour ${htmlEscape(p.debtorName)},</p>
<p><strong>${htmlEscape(p.creditorName)}</strong> souhaite formaliser un prêt avec toi. Voici les conditions qu'iel propose — prends le temps de les lire, c'est important.</p>`,
      detailsAmount: "Montant",
      detailsInstallments: "Échéancier",
      detailsRate: "Taux d'intérêt",
      detailsPurpose: "Objet",
      detailsExpiry: "Réponse attendue avant le",
      storyBottom: `<p style="margin-top:14px">Tu peux <strong>accepter</strong>, <strong>refuser</strong>, ou <strong>négocier</strong> (proposer un montant, un taux ou un nombre d'échéances différents). L'historique sera enregistré et chacun gardera une trace propre.</p>
<p style="opacity:0.85;font-size:13px">Cette proposition expire dans 7 jours. Au-delà, ${htmlEscape(p.creditorName)} devra te la renvoyer.</p>`,
      cta: "Voir et répondre",
      quote: "Une promesse écrite vaut mille promesses parlées — la confiance, c'est aussi un acte de soin.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    en: {
      subject: `${p.creditorName} sent you a debt acknowledgment · ${p.amount} ${p.currency}`,
      hero: `A loan acknowledgment is waiting for you`,
      subtitle: `${htmlEscape(p.creditorName)} prepared a clear, traceable contract you can sign in one tap`,
      storyTop: `<p>Hi ${htmlEscape(p.debtorName)},</p>
<p><strong>${htmlEscape(p.creditorName)}</strong> would like to formalize a loan with you. Here are the terms they're proposing — take a moment to read them carefully.</p>`,
      detailsAmount: "Amount",
      detailsInstallments: "Schedule",
      detailsRate: "Interest rate",
      detailsPurpose: "Purpose",
      detailsExpiry: "Reply expected by",
      storyBottom: `<p style="margin-top:14px">You can <strong>accept</strong>, <strong>decline</strong>, or <strong>negotiate</strong> (propose a different amount, rate, or number of installments). Everything is logged so both of you keep a clean record.</p>
<p style="opacity:0.85;font-size:13px">This proposal expires in 7 days. After that, ${htmlEscape(p.creditorName)} will need to send it again.</p>`,
      cta: "View and respond",
      quote: "A written promise outweighs a thousand spoken ones — trust deserves the care of ink.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    es: {
      subject: `${p.creditorName} te propone un reconocimiento de deuda · ${p.amount} ${p.currency}`,
      hero: `Un reconocimiento te espera`,
      subtitle: `${htmlEscape(p.creditorName)} preparó un contrato claro, rastreable y firmable en un toque`,
      storyTop: `<p>Hola ${htmlEscape(p.debtorName)},</p>
<p><strong>${htmlEscape(p.creditorName)}</strong> desea formalizar un préstamo contigo. Aquí están las condiciones — tómate un momento para leerlas.</p>`,
      detailsAmount: "Monto",
      detailsInstallments: "Calendario",
      detailsRate: "Tasa de interés",
      detailsPurpose: "Objeto",
      detailsExpiry: "Responder antes del",
      storyBottom: `<p style="margin-top:14px">Puedes <strong>aceptar</strong>, <strong>rechazar</strong>, o <strong>negociar</strong> (proponer un monto, tasa o número de cuotas diferentes). Todo queda registrado.</p>
<p style="opacity:0.85;font-size:13px">Esta propuesta expira en 7 días.</p>`,
      cta: "Ver y responder",
      quote: "Una promesa escrita vale mil habladas.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    de: {
      subject: `${p.creditorName} schickt Ihnen eine Schuldanerkennung · ${p.amount} ${p.currency}`,
      hero: `Eine Schuldanerkennung wartet auf Sie`,
      subtitle: `${htmlEscape(p.creditorName)} hat einen klaren, nachvollziehbaren Vertrag vorbereitet`,
      storyTop: `<p>Hallo ${htmlEscape(p.debtorName)},</p>
<p><strong>${htmlEscape(p.creditorName)}</strong> möchte ein Darlehen mit Ihnen formalisieren. Hier sind die vorgeschlagenen Bedingungen — bitte lesen Sie sie aufmerksam.</p>`,
      detailsAmount: "Betrag",
      detailsInstallments: "Tilgungsplan",
      detailsRate: "Zinssatz",
      detailsPurpose: "Zweck",
      detailsExpiry: "Antwort erwartet bis",
      storyBottom: `<p style="margin-top:14px">Sie können <strong>annehmen</strong>, <strong>ablehnen</strong> oder <strong>verhandeln</strong>. Alles wird protokolliert.</p>
<p style="opacity:0.85;font-size:13px">Dieser Vorschlag läuft in 7 Tagen ab.</p>`,
      cta: "Ansehen und antworten",
      quote: "Ein geschriebenes Versprechen wiegt tausend gesprochene auf.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    pt: {
      subject: `${p.creditorName} te enviou um reconhecimento de dívida · ${p.amount} ${p.currency}`,
      hero: `Um reconhecimento te aguarda`,
      subtitle: `${htmlEscape(p.creditorName)} preparou um contrato claro, rastreável e assinável em um toque`,
      storyTop: `<p>Olá ${htmlEscape(p.debtorName)},</p>
<p><strong>${htmlEscape(p.creditorName)}</strong> quer formalizar um empréstimo contigo.</p>`,
      detailsAmount: "Valor",
      detailsInstallments: "Calendário",
      detailsRate: "Taxa de juros",
      detailsPurpose: "Objeto",
      detailsExpiry: "Resposta esperada até",
      storyBottom: `<p style="margin-top:14px">Podes <strong>aceitar</strong>, <strong>recusar</strong> ou <strong>negociar</strong>. Tudo fica registado.</p>
<p style="opacity:0.85;font-size:13px">Esta proposta expira em 7 dias.</p>`,
      cta: "Ver e responder",
      quote: "Uma promessa escrita vale mil faladas.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    it: {
      subject: `${p.creditorName} ti ha inviato un riconoscimento di debito · ${p.amount} ${p.currency}`,
      hero: `Un riconoscimento ti aspetta`,
      subtitle: `${htmlEscape(p.creditorName)} ha preparato un contratto chiaro, tracciabile e firmabile in un tocco`,
      storyTop: `<p>Ciao ${htmlEscape(p.debtorName)},</p>
<p><strong>${htmlEscape(p.creditorName)}</strong> vuole formalizzare un prestito con te.</p>`,
      detailsAmount: "Importo",
      detailsInstallments: "Calendario",
      detailsRate: "Tasso d'interesse",
      detailsPurpose: "Oggetto",
      detailsExpiry: "Risposta attesa entro il",
      storyBottom: `<p style="margin-top:14px">Puoi <strong>accettare</strong>, <strong>rifiutare</strong> o <strong>negoziare</strong>. Tutto viene registrato.</p>
<p style="opacity:0.85;font-size:13px">La proposta scade tra 7 giorni.</p>`,
      cta: "Visualizza e rispondi",
      quote: "Una promessa scritta vale mille promesse parlate.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    ar: {
      subject: `${p.creditorName} يقترح عليك إقرار دين · ${p.amount} ${p.currency}`,
      hero: `إقرار دين بانتظارك`,
      subtitle: `${htmlEscape(p.creditorName)} أعدّ لك عقداً واضحاً، قابلاً للتتبع، يمكن توقيعه بنقرة`,
      storyTop: `<p>مرحباً ${htmlEscape(p.debtorName)},</p>
<p>يريد <strong>${htmlEscape(p.creditorName)}</strong> توثيق قرض معك.</p>`,
      detailsAmount: "المبلغ",
      detailsInstallments: "جدول الأقساط",
      detailsRate: "نسبة الفائدة",
      detailsPurpose: "الغرض",
      detailsExpiry: "الرد قبل",
      storyBottom: `<p style="margin-top:14px">يمكنك <strong>القبول</strong>، <strong>الرفض</strong>، أو <strong>التفاوض</strong>.</p>
<p style="opacity:0.85;font-size:13px">ينتهي العرض خلال 7 أيام.</p>`,
      cta: "عرض والرد",
      quote: "وعد مكتوب يعادل ألف وعد منطوق.",
      quoteAuthor: "BMD · Back Mes Do",
    },
  };
  const c = pickCopy(C as any, loc, p) as NonNullable<(typeof C)["fr"]>;
  const lines: Array<{ label: string; value: string }> = [
    { label: c.detailsInstallments, value: p.installmentsLabel },
    { label: c.detailsRate, value: p.rateLabel },
  ];
  if (p.purpose) lines.push({ label: c.detailsPurpose, value: p.purpose });
  lines.push({ label: c.detailsExpiry, value: p.expiresAtLabel });
  const card = debtContractCard({
    amount: p.amount,
    currency: p.currency,
    lines,
  });
  const body = `${c.storyTop}${card}${c.storyBottom}`;
  const r = renderLayout({
    preheader: c.subject,
    heroEmoji: "📜",
    heroTitle: c.hero,
    heroSubtitle: c.subtitle,
    bodyHtml: body,
    ctaLabel: c.cta,
    ctaHref: p.contractUrl,
    blockQuote: c.quote,
    blockQuoteAuthor: c.quoteAuthor,
    locale: loc,
    baseUrl,
  });
  return { subject: c.subject, html: r.html, text: r.text };
}

// ------------------------------------------------------------
// DEBT_ACCEPTED · le débiteur accepte → créancier
// ------------------------------------------------------------
function renderDebtAccepted(
  p: DebtAcceptedPayload,
  loc: EmailLocale,
  baseUrl: string,
) {
  const C: Partial<Record<EmailLocale, {
    subject: string;
    hero: string;
    subtitle: string;
    storyTop: string;
    cardCode: string;
    cardStatus: string;
    storyBottom: string;
    cta: string;
    quote: string;
    quoteAuthor: string;
  }>> = {
    fr: {
      subject: `${p.debtorName} a accepté ta reconnaissance de dette ✓`,
      hero: `Excellente nouvelle`,
      subtitle: `${htmlEscape(p.debtorName)} vient d'accepter ton contrat`,
      storyTop: `<p>Bonjour ${htmlEscape(p.creditorName)},</p>
<p>Ta reconnaissance de dette est désormais ${htmlEscape(p.statusLabel)}. Tu peux dormir tranquille — ce qui était un accord oral est maintenant un engagement écrit, traçable, vérifiable.</p>`,
      cardCode: "Référence contrat",
      cardStatus: "Statut",
      storyBottom: `<p style="margin-top:14px">L'échéancier démarre automatiquement à la date prévue. Tu recevras une notification à chaque paiement reçu.</p>`,
      cta: "Voir le contrat signé",
      quote: "C'est dans la confiance écrite que les amitiés tiennent leur souffle.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    en: {
      subject: `${p.debtorName} accepted your debt acknowledgment ✓`,
      hero: `Wonderful news`,
      subtitle: `${htmlEscape(p.debtorName)} just accepted your contract`,
      storyTop: `<p>Hi ${htmlEscape(p.creditorName)},</p>
<p>Your debt acknowledgment is now ${htmlEscape(p.statusLabel)}. What used to be a verbal agreement is now a written, traceable, verifiable commitment.</p>`,
      cardCode: "Contract reference",
      cardStatus: "Status",
      storyBottom: `<p style="margin-top:14px">The schedule starts automatically on the planned date. You'll get a notification for every payment received.</p>`,
      cta: "View the signed contract",
      quote: "Friendships breathe better when trust is put in writing.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    es: {
      subject: `${p.debtorName} aceptó tu reconocimiento de deuda ✓`,
      hero: `¡Excelente noticia!`,
      subtitle: `${htmlEscape(p.debtorName)} acaba de aceptar tu contrato`,
      storyTop: `<p>Hola ${htmlEscape(p.creditorName)},</p>
<p>Tu reconocimiento de deuda ahora está ${htmlEscape(p.statusLabel)}.</p>`,
      cardCode: "Referencia",
      cardStatus: "Estado",
      storyBottom: `<p style="margin-top:14px">El calendario empieza automáticamente.</p>`,
      cta: "Ver contrato firmado",
      quote: "La confianza escrita es la que dura.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    de: {
      subject: `${p.debtorName} hat Ihre Schuldanerkennung angenommen ✓`,
      hero: `Wunderbare Nachricht`,
      subtitle: `${htmlEscape(p.debtorName)} hat Ihren Vertrag angenommen`,
      storyTop: `<p>Hallo ${htmlEscape(p.creditorName)},</p>
<p>Ihre Schuldanerkennung ist nun ${htmlEscape(p.statusLabel)}.</p>`,
      cardCode: "Vertragsreferenz",
      cardStatus: "Status",
      storyBottom: `<p style="margin-top:14px">Der Tilgungsplan startet automatisch.</p>`,
      cta: "Unterzeichneten Vertrag ansehen",
      quote: "Geschriebenes Vertrauen hält länger.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    pt: {
      subject: `${p.debtorName} aceitou o teu reconhecimento de dívida ✓`,
      hero: `Excelente notícia`,
      subtitle: `${htmlEscape(p.debtorName)} aceitou o teu contrato`,
      storyTop: `<p>Olá ${htmlEscape(p.creditorName)},</p>
<p>O teu reconhecimento de dívida está agora ${htmlEscape(p.statusLabel)}.</p>`,
      cardCode: "Referência",
      cardStatus: "Estado",
      storyBottom: `<p style="margin-top:14px">O calendário começa automaticamente.</p>`,
      cta: "Ver contrato assinado",
      quote: "A confiança escrita dura mais.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    it: {
      subject: `${p.debtorName} ha accettato il tuo riconoscimento di debito ✓`,
      hero: `Ottima notizia`,
      subtitle: `${htmlEscape(p.debtorName)} ha appena accettato il tuo contratto`,
      storyTop: `<p>Ciao ${htmlEscape(p.creditorName)},</p>
<p>Il tuo riconoscimento di debito è ora ${htmlEscape(p.statusLabel)}.</p>`,
      cardCode: "Riferimento",
      cardStatus: "Stato",
      storyBottom: `<p style="margin-top:14px">Il calendario parte automaticamente.</p>`,
      cta: "Vedi contratto firmato",
      quote: "La fiducia scritta è quella che dura.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    ar: {
      subject: `${p.debtorName} قبل إقرار الدين ✓`,
      hero: `خبر رائع`,
      subtitle: `${htmlEscape(p.debtorName)} قَبِل عقدك للتو`,
      storyTop: `<p>مرحباً ${htmlEscape(p.creditorName)},</p>
<p>إقرار الدين الخاص بك أصبح الآن ${htmlEscape(p.statusLabel)}.</p>`,
      cardCode: "مرجع العقد",
      cardStatus: "الحالة",
      storyBottom: `<p style="margin-top:14px">يبدأ جدول الأقساط تلقائياً.</p>`,
      cta: "عرض العقد الموقّع",
      quote: "الثقة المكتوبة هي التي تدوم.",
      quoteAuthor: "BMD · Back Mes Do",
    },
  };
  const c = pickCopy(C as any, loc, p) as NonNullable<(typeof C)["fr"]>;
  const card = debtContractCard({
    amount: p.amount,
    currency: p.currency,
    lines: [
      { label: c.cardCode, value: p.contractCode },
      { label: c.cardStatus, value: p.statusLabel },
    ],
  });
  const body = `${c.storyTop}${card}${c.storyBottom}`;
  const r = renderLayout({
    preheader: c.subject,
    heroEmoji: "✨",
    heroTitle: c.hero,
    heroSubtitle: c.subtitle,
    bodyHtml: body,
    ctaLabel: c.cta,
    ctaHref: p.contractUrl,
    blockQuote: c.quote,
    blockQuoteAuthor: c.quoteAuthor,
    locale: loc,
    baseUrl,
  });
  return { subject: c.subject, html: r.html, text: r.text };
}

// ------------------------------------------------------------
// DEBT_REJECTED · le débiteur refuse → créancier
// ------------------------------------------------------------
function renderDebtRejected(
  p: DebtRejectedPayload,
  loc: EmailLocale,
  baseUrl: string,
) {
  const C: Partial<Record<EmailLocale, {
    subject: string;
    hero: string;
    subtitle: string;
    storyTop: string;
    cardCode: string;
    storyBottom: string;
    cta: string;
    quote: string;
    quoteAuthor: string;
  }>> = {
    fr: {
      subject: `${p.debtorName} a décliné ta reconnaissance de dette`,
      hero: `Pas cette fois`,
      subtitle: `${htmlEscape(p.debtorName)} a préféré ne pas formaliser ce prêt`,
      storyTop: `<p>Bonjour ${htmlEscape(p.creditorName)},</p>
<p>${htmlEscape(p.debtorName)} a déclinié la reconnaissance de dette que tu lui avais envoyée. Ce n'est pas grave — il y a peut-être un sujet à éclaircir, ou simplement une autre voie à prendre.</p>`,
      cardCode: "Référence contrat",
      storyBottom: `<p style="margin-top:14px">Tu peux retravailler les conditions et renvoyer une nouvelle proposition. Ou simplement passer un coup de fil pour comprendre. BMD reste là pour formaliser quand vous serez tous deux prêts.</p>`,
      cta: "Voir le contrat refusé",
      quote: "Un refus n'est pas une rupture, c'est juste un autre chemin à trouver.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    en: {
      subject: `${p.debtorName} declined your debt acknowledgment`,
      hero: `Not this time`,
      subtitle: `${htmlEscape(p.debtorName)} chose not to formalize this loan`,
      storyTop: `<p>Hi ${htmlEscape(p.creditorName)},</p>
<p>${htmlEscape(p.debtorName)} declined the debt acknowledgment you sent. That's okay — maybe there's something to clarify, or a different path to take.</p>`,
      cardCode: "Contract reference",
      storyBottom: `<p style="margin-top:14px">You can rework the terms and send a new proposal. Or just give them a call to understand. BMD will be here whenever you're both ready.</p>`,
      cta: "View the declined contract",
      quote: "A 'no' isn't a break — it's just another path to find together.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    es: {
      subject: `${p.debtorName} rechazó tu reconocimiento de deuda`,
      hero: `Esta vez no`,
      subtitle: `${htmlEscape(p.debtorName)} prefirió no formalizar este préstamo`,
      storyTop: `<p>Hola ${htmlEscape(p.creditorName)},</p>
<p>${htmlEscape(p.debtorName)} rechazó el reconocimiento que enviaste.</p>`,
      cardCode: "Referencia",
      storyBottom: `<p style="margin-top:14px">Puedes ajustar las condiciones y enviar otra propuesta cuando quieras.</p>`,
      cta: "Ver el contrato",
      quote: "Un 'no' es solo otro camino por encontrar.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    de: {
      subject: `${p.debtorName} hat Ihre Schuldanerkennung abgelehnt`,
      hero: `Diesmal nicht`,
      subtitle: `${htmlEscape(p.debtorName)} hat entschieden, dieses Darlehen nicht zu formalisieren`,
      storyTop: `<p>Hallo ${htmlEscape(p.creditorName)},</p>
<p>${htmlEscape(p.debtorName)} hat Ihre Anerkennung abgelehnt.</p>`,
      cardCode: "Vertragsreferenz",
      storyBottom: `<p style="margin-top:14px">Sie können die Bedingungen anpassen und einen neuen Vorschlag senden.</p>`,
      cta: "Vertrag ansehen",
      quote: "Ein 'Nein' ist nur ein anderer Weg.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    pt: {
      subject: `${p.debtorName} recusou o teu reconhecimento de dívida`,
      hero: `Desta vez não`,
      subtitle: `${htmlEscape(p.debtorName)} preferiu não formalizar este empréstimo`,
      storyTop: `<p>Olá ${htmlEscape(p.creditorName)},</p>
<p>${htmlEscape(p.debtorName)} recusou o reconhecimento que enviaste.</p>`,
      cardCode: "Referência",
      storyBottom: `<p style="margin-top:14px">Podes ajustar as condições e enviar outra proposta.</p>`,
      cta: "Ver contrato",
      quote: "Um 'não' é apenas outro caminho a descobrir.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    it: {
      subject: `${p.debtorName} ha rifiutato il tuo riconoscimento di debito`,
      hero: `Non questa volta`,
      subtitle: `${htmlEscape(p.debtorName)} ha preferito non formalizzare questo prestito`,
      storyTop: `<p>Ciao ${htmlEscape(p.creditorName)},</p>
<p>${htmlEscape(p.debtorName)} ha rifiutato il riconoscimento.</p>`,
      cardCode: "Riferimento",
      storyBottom: `<p style="margin-top:14px">Puoi rivedere le condizioni e inviare un'altra proposta.</p>`,
      cta: "Vedi contratto",
      quote: "Un 'no' è solo un'altra strada da trovare.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    ar: {
      subject: `${p.debtorName} رفض إقرار الدين`,
      hero: `ليس هذه المرة`,
      subtitle: `${htmlEscape(p.debtorName)} اختار عدم توثيق هذا القرض`,
      storyTop: `<p>مرحباً ${htmlEscape(p.creditorName)},</p>
<p>${htmlEscape(p.debtorName)} رفض الإقرار الذي أرسلته.</p>`,
      cardCode: "مرجع العقد",
      storyBottom: `<p style="margin-top:14px">يمكنك تعديل الشروط وإرسال مقترح جديد.</p>`,
      cta: "عرض العقد",
      quote: "الرفض ليس قطيعة، بل طريق آخر.",
      quoteAuthor: "BMD · Back Mes Do",
    },
  };
  const c = pickCopy(C as any, loc, p) as NonNullable<(typeof C)["fr"]>;
  const card = debtContractCard({
    amount: p.amount,
    currency: p.currency,
    lines: [{ label: c.cardCode, value: p.contractCode }],
  });
  const body = `${c.storyTop}${card}${c.storyBottom}`;
  const r = renderLayout({
    preheader: c.subject,
    heroEmoji: "💭",
    heroTitle: c.hero,
    heroSubtitle: c.subtitle,
    bodyHtml: body,
    ctaLabel: c.cta,
    ctaHref: p.contractUrl,
    blockQuote: c.quote,
    blockQuoteAuthor: c.quoteAuthor,
    locale: loc,
    baseUrl,
  });
  return { subject: c.subject, html: r.html, text: r.text };
}

// ------------------------------------------------------------
// DEBT_COUNTER_PROPOSED · le débiteur fait une contre-proposition → créancier
// ------------------------------------------------------------
function renderDebtCounterProposed(
  p: DebtCounterProposedPayload,
  loc: EmailLocale,
  baseUrl: string,
) {
  const reasonHtml = p.reason
    ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:rgba(232,163,61,0.06);border-left:3px solid ${BRAND.saffron};border-radius:8px;padding:14px 18px;margin:6px 0 16px">
<tr><td>
<p style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${BRAND.gold};margin:0 0 6px;font-weight:600">Ce qu'iel propose</p>
<p style="font-style:italic;color:${BRAND.cream};margin:0;line-height:1.6">"${htmlEscape(p.reason)}"</p>
</td></tr></table>`
    : "";

  const C: Partial<Record<EmailLocale, {
    subject: string;
    hero: string;
    subtitle: string;
    storyTop: string;
    cardCode: string;
    storyBottom: string;
    cta: string;
    quote: string;
    quoteAuthor: string;
  }>> = {
    fr: {
      subject: `${p.debtorName} te fait une contre-proposition`,
      hero: `Place à la discussion`,
      subtitle: `${htmlEscape(p.debtorName)} souhaite renégocier quelques points`,
      storyTop: `<p>Bonjour ${htmlEscape(p.creditorName)},</p>
<p>${htmlEscape(p.debtorName)} a lu attentivement ta proposition et te suggère un aménagement. C'est plutôt bon signe — iel est engagé·e dans la conversation.</p>${reasonHtml}`,
      cardCode: "Référence contrat",
      storyBottom: `<p style="margin-top:14px">Ouvre le contrat pour voir le détail de sa contre-proposition. Tu pourras à ton tour accepter, refuser, ou ajuster encore une fois.</p>`,
      cta: "Voir la contre-proposition",
      quote: "Négocier n'est pas reculer — c'est ajuster la confiance pour qu'elle tienne sur la durée.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    en: {
      subject: `${p.debtorName} sent you a counter-proposal`,
      hero: `Time to chat`,
      subtitle: `${htmlEscape(p.debtorName)} would like to renegotiate a few terms`,
      storyTop: `<p>Hi ${htmlEscape(p.creditorName)},</p>
<p>${htmlEscape(p.debtorName)} read your proposal carefully and is suggesting an adjustment. That's actually a good sign — they're engaged in the conversation.</p>${reasonHtml}`,
      cardCode: "Contract reference",
      storyBottom: `<p style="margin-top:14px">Open the contract to see their counter-proposal in detail. You can accept, decline, or adjust further yourself.</p>`,
      cta: "View the counter-proposal",
      quote: "Negotiating isn't backing down — it's fine-tuning trust so it lasts.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    es: {
      subject: `${p.debtorName} te hizo una contrapropuesta`,
      hero: `Vamos a conversar`,
      subtitle: `${htmlEscape(p.debtorName)} quiere renegociar algunos términos`,
      storyTop: `<p>Hola ${htmlEscape(p.creditorName)},</p>
<p>${htmlEscape(p.debtorName)} leyó tu propuesta y sugiere un ajuste.</p>${reasonHtml}`,
      cardCode: "Referencia",
      storyBottom: `<p style="margin-top:14px">Abre el contrato para ver el detalle.</p>`,
      cta: "Ver contrapropuesta",
      quote: "Negociar es ajustar la confianza para que dure.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    de: {
      subject: `${p.debtorName} hat einen Gegenvorschlag gesendet`,
      hero: `Zeit für ein Gespräch`,
      subtitle: `${htmlEscape(p.debtorName)} möchte einige Bedingungen neu verhandeln`,
      storyTop: `<p>Hallo ${htmlEscape(p.creditorName)},</p>
<p>${htmlEscape(p.debtorName)} hat Ihren Vorschlag gelesen und schlägt eine Anpassung vor.</p>${reasonHtml}`,
      cardCode: "Vertragsreferenz",
      storyBottom: `<p style="margin-top:14px">Öffnen Sie den Vertrag, um die Details zu sehen.</p>`,
      cta: "Gegenvorschlag ansehen",
      quote: "Verhandeln ist kein Rückzug — es ist das Feinabstimmen von Vertrauen.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    pt: {
      subject: `${p.debtorName} fez uma contraproposta`,
      hero: `Tempo para conversar`,
      subtitle: `${htmlEscape(p.debtorName)} quer renegociar alguns termos`,
      storyTop: `<p>Olá ${htmlEscape(p.creditorName)},</p>
<p>${htmlEscape(p.debtorName)} leu a tua proposta e sugere um ajuste.</p>${reasonHtml}`,
      cardCode: "Referência",
      storyBottom: `<p style="margin-top:14px">Abre o contrato para ver o detalhe.</p>`,
      cta: "Ver contraproposta",
      quote: "Negociar é afinar a confiança para que dure.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    it: {
      subject: `${p.debtorName} ti ha fatto una controproposta`,
      hero: `È il momento di parlare`,
      subtitle: `${htmlEscape(p.debtorName)} vorrebbe rinegoziare alcuni termini`,
      storyTop: `<p>Ciao ${htmlEscape(p.creditorName)},</p>
<p>${htmlEscape(p.debtorName)} ha letto la tua proposta e suggerisce un aggiustamento.</p>${reasonHtml}`,
      cardCode: "Riferimento",
      storyBottom: `<p style="margin-top:14px">Apri il contratto per vedere il dettaglio.</p>`,
      cta: "Vedi controproposta",
      quote: "Negoziare è regolare la fiducia perché duri.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    ar: {
      subject: `${p.debtorName} أرسل لك عرضاً مضاداً`,
      hero: `حان وقت الحوار`,
      subtitle: `${htmlEscape(p.debtorName)} يرغب في إعادة التفاوض على بعض الشروط`,
      storyTop: `<p>مرحباً ${htmlEscape(p.creditorName)},</p>
<p>${htmlEscape(p.debtorName)} قرأ مقترحك ويقترح تعديلاً.</p>${reasonHtml}`,
      cardCode: "مرجع العقد",
      storyBottom: `<p style="margin-top:14px">افتح العقد لرؤية التفاصيل.</p>`,
      cta: "عرض المقابل",
      quote: "التفاوض هو ضبط الثقة لتدوم.",
      quoteAuthor: "BMD · Back Mes Do",
    },
  };
  const c = pickCopy(C as any, loc, p) as NonNullable<(typeof C)["fr"]>;
  const card = debtContractCard({
    amount: p.amount,
    currency: p.currency,
    lines: [{ label: c.cardCode, value: p.contractCode }],
  });
  const body = `${c.storyTop}${card}${c.storyBottom}`;
  const r = renderLayout({
    preheader: c.subject,
    heroEmoji: "💬",
    heroTitle: c.hero,
    heroSubtitle: c.subtitle,
    bodyHtml: body,
    ctaLabel: c.cta,
    ctaHref: p.contractUrl,
    blockQuote: c.quote,
    blockQuoteAuthor: c.quoteAuthor,
    locale: loc,
    baseUrl,
  });
  return { subject: c.subject, html: r.html, text: r.text };
}

// ============================================================
// V150.B · DEBT_WITNESS_ADDED · tu as été désigné(e) témoin sur une RDD
// ============================================================
function renderDebtWitnessAdded(
  p: DebtWitnessAddedPayload,
  loc: EmailLocale,
  baseUrl: string,
) {
  const C: Partial<Record<EmailLocale, {
    subject: string;
    hero: string;
    subtitle: string;
    storyTop: string;
    cardCode: string;
    cardCreditor: string;
    cardDebtor: string;
    cardPurpose: string;
    storyBottom: string;
    cta: string;
    quote: string;
    quoteAuthor: string;
  }>> = {
    fr: {
      subject: `Tu as été désigné(e) témoin · RDD ${p.contractCode}`,
      hero: `Ta présence sécurise un accord`,
      subtitle: `${htmlEscape(p.creditorName)} et ${htmlEscape(p.debtorName)} t'ont choisi(e) comme témoin`,
      storyTop: `<p>Bonjour ${htmlEscape(p.recipientName)},</p>
<p><strong>${htmlEscape(p.creditorName)}</strong> et <strong>${htmlEscape(p.debtorName)}</strong> finalisent une reconnaissance de dette et souhaitent que tu en sois témoin. Ton rôle est simple mais précieux : attester que l'accord a bien été conclu librement entre les deux parties.</p>`,
      cardCode: "Code du contrat",
      cardCreditor: "Prêteur",
      cardDebtor: "Emprunteur",
      cardPurpose: "Objet",
      storyBottom: `<p style="margin-top:14px">Tu pourras consulter le contrat à tout moment dans ton espace BMD. Aucun engagement financier n'est demandé — un témoin atteste, il ne paie pas.</p>
<p style="opacity:0.85;font-size:13px">Si tu ne souhaites pas tenir ce rôle, tu peux le décliner en un tap.</p>`,
      cta: "Voir le contrat",
      quote: "Un témoin n'efface pas le risque. Il honore la confiance.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    en: {
      subject: `You've been designated as a witness · RDD ${p.contractCode}`,
      hero: `Your presence secures an agreement`,
      subtitle: `${htmlEscape(p.creditorName)} and ${htmlEscape(p.debtorName)} chose you as a witness`,
      storyTop: `<p>Hi ${htmlEscape(p.recipientName)},</p>
<p><strong>${htmlEscape(p.creditorName)}</strong> and <strong>${htmlEscape(p.debtorName)}</strong> are finalizing a debt acknowledgment and want you to witness it. Your role is simple but valuable: attest that the agreement was freely made between both parties.</p>`,
      cardCode: "Contract code",
      cardCreditor: "Lender",
      cardDebtor: "Borrower",
      cardPurpose: "Purpose",
      storyBottom: `<p style="margin-top:14px">You can review the contract anytime in your BMD space. No financial commitment is required — a witness attests, they don't pay.</p>
<p style="opacity:0.85;font-size:13px">If you'd rather not take this role, you can decline it in one tap.</p>`,
      cta: "View contract",
      quote: "A witness doesn't erase the risk. They honor the trust.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    es: {
      subject: `Has sido designado(a) testigo · RDD ${p.contractCode}`,
      hero: `Tu presencia asegura un acuerdo`,
      subtitle: `${htmlEscape(p.creditorName)} y ${htmlEscape(p.debtorName)} te eligieron como testigo`,
      storyTop: `<p>Hola ${htmlEscape(p.recipientName)},</p>
<p><strong>${htmlEscape(p.creditorName)}</strong> y <strong>${htmlEscape(p.debtorName)}</strong> finalizan un reconocimiento de deuda y quieren que seas testigo.</p>`,
      cardCode: "Código del contrato",
      cardCreditor: "Prestamista",
      cardDebtor: "Prestatario",
      cardPurpose: "Objeto",
      storyBottom: `<p style="margin-top:14px">Puedes consultar el contrato en cualquier momento. No se requiere compromiso financiero.</p>`,
      cta: "Ver contrato",
      quote: "Un testigo no borra el riesgo. Honra la confianza.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    de: {
      subject: `Sie wurden als Zeuge benannt · RDD ${p.contractCode}`,
      hero: `Ihre Anwesenheit sichert eine Vereinbarung`,
      subtitle: `${htmlEscape(p.creditorName)} und ${htmlEscape(p.debtorName)} haben Sie als Zeugen ausgewählt`,
      storyTop: `<p>Hallo ${htmlEscape(p.recipientName)},</p>
<p><strong>${htmlEscape(p.creditorName)}</strong> und <strong>${htmlEscape(p.debtorName)}</strong> schließen eine Schuldanerkennung ab und möchten, dass Sie Zeuge sind.</p>`,
      cardCode: "Vertragscode",
      cardCreditor: "Darlehensgeber",
      cardDebtor: "Darlehensnehmer",
      cardPurpose: "Zweck",
      storyBottom: `<p style="margin-top:14px">Sie können den Vertrag jederzeit einsehen. Keine finanzielle Verpflichtung erforderlich.</p>`,
      cta: "Vertrag anzeigen",
      quote: "Ein Zeuge beseitigt das Risiko nicht. Er ehrt das Vertrauen.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    pt: {
      subject: `Foste designado(a) testemunha · RDD ${p.contractCode}`,
      hero: `A tua presença assegura um acordo`,
      subtitle: `${htmlEscape(p.creditorName)} e ${htmlEscape(p.debtorName)} escolheram-te como testemunha`,
      storyTop: `<p>Olá ${htmlEscape(p.recipientName)},</p>
<p><strong>${htmlEscape(p.creditorName)}</strong> e <strong>${htmlEscape(p.debtorName)}</strong> finalizam um reconhecimento de dívida e querem-te como testemunha.</p>`,
      cardCode: "Código do contrato",
      cardCreditor: "Credor",
      cardDebtor: "Devedor",
      cardPurpose: "Objeto",
      storyBottom: `<p style="margin-top:14px">Podes consultar o contrato a qualquer momento. Nenhum compromisso financeiro é exigido.</p>`,
      cta: "Ver contrato",
      quote: "Uma testemunha não apaga o risco. Honra a confiança.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    it: {
      subject: `Sei stato designato(a) testimone · RDD ${p.contractCode}`,
      hero: `La tua presenza protegge un accordo`,
      subtitle: `${htmlEscape(p.creditorName)} e ${htmlEscape(p.debtorName)} ti hanno scelto come testimone`,
      storyTop: `<p>Ciao ${htmlEscape(p.recipientName)},</p>
<p><strong>${htmlEscape(p.creditorName)}</strong> e <strong>${htmlEscape(p.debtorName)}</strong> stanno finalizzando un riconoscimento di debito e ti vogliono come testimone.</p>`,
      cardCode: "Codice contratto",
      cardCreditor: "Prestatore",
      cardDebtor: "Beneficiario",
      cardPurpose: "Oggetto",
      storyBottom: `<p style="margin-top:14px">Puoi consultare il contratto in ogni momento. Nessun impegno finanziario richiesto.</p>`,
      cta: "Visualizza contratto",
      quote: "Un testimone non cancella il rischio. Onora la fiducia.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    ar: {
      subject: `تم تعيينك شاهداً · إقرار دين ${p.contractCode}`,
      hero: `حضورك يحمي اتفاقاً`,
      subtitle: `اختارك ${htmlEscape(p.creditorName)} و ${htmlEscape(p.debtorName)} شاهداً`,
      storyTop: `<p>مرحباً ${htmlEscape(p.recipientName)},</p>
<p>يقوم <strong>${htmlEscape(p.creditorName)}</strong> و <strong>${htmlEscape(p.debtorName)}</strong> بإتمام إقرار دين ويرغبان في أن تكون شاهداً.</p>`,
      cardCode: "رمز العقد",
      cardCreditor: "المُقرض",
      cardDebtor: "المقترض",
      cardPurpose: "الغرض",
      storyBottom: `<p style="margin-top:14px">يمكنك مراجعة العقد في أي وقت. لا يُطلب أي التزام مالي.</p>`,
      cta: "عرض العقد",
      quote: "الشاهد لا يمحو المخاطر. يكرّم الثقة.",
      quoteAuthor: "BMD · Back Mes Do",
    },
  };
  const c = pickCopy(C as any, loc, p) as NonNullable<(typeof C)["fr"]>;
  const lines: Array<{ label: string; value: string }> = [
    { label: c.cardCode, value: p.contractCode },
    { label: c.cardCreditor, value: p.creditorName },
    { label: c.cardDebtor, value: p.debtorName },
  ];
  if (p.purpose) lines.push({ label: c.cardPurpose, value: p.purpose });
  const card = debtContractCard({
    amount: p.amount,
    currency: p.currency,
    lines,
  });
  const body = `${c.storyTop}${card}${c.storyBottom}`;
  const r = renderLayout({
    preheader: c.subject,
    heroEmoji: "🤝",
    heroTitle: c.hero,
    heroSubtitle: c.subtitle,
    bodyHtml: body,
    ctaLabel: c.cta,
    ctaHref: p.contractUrl,
    blockQuote: c.quote,
    blockQuoteAuthor: c.quoteAuthor,
    locale: loc,
    baseUrl,
  });
  return { subject: c.subject, html: r.html, text: r.text };
}

// ============================================================
// V150.B · DEBT_GUARANTOR_ADDED · tu as été désigné(e) garant sur une RDD
// ============================================================
function renderDebtGuarantorAdded(
  p: DebtGuarantorAddedPayload,
  loc: EmailLocale,
  baseUrl: string,
) {
  const C: Partial<Record<EmailLocale, {
    subject: string;
    hero: string;
    subtitle: string;
    storyTop: string;
    cardCode: string;
    cardCreditor: string;
    cardDebtor: string;
    cardCoverage: string;
    cardTrigger: string;
    cardPurpose: string;
    coverageValue: (n: number) => string;
    triggerValue: (n: number) => string;
    storyBottom: string;
    cta: string;
    quote: string;
    quoteAuthor: string;
  }>> = {
    fr: {
      subject: `Tu as été désigné(e) garant · RDD ${p.contractCode}`,
      hero: `Tu portes une promesse importante`,
      subtitle: `${htmlEscape(p.creditorName)} et ${htmlEscape(p.debtorName)} te confient leur garantie`,
      storyTop: `<p>Bonjour ${htmlEscape(p.recipientName)},</p>
<p><strong>${htmlEscape(p.creditorName)}</strong> et <strong>${htmlEscape(p.debtorName)}</strong> finalisent une reconnaissance de dette et souhaitent que tu en sois <strong>garant</strong>. C'est un rôle de confiance fort — prends le temps de lire les conditions.</p>`,
      cardCode: "Code du contrat",
      cardCreditor: "Prêteur",
      cardDebtor: "Emprunteur",
      cardCoverage: "Couverture",
      cardTrigger: "Délai d'activation",
      cardPurpose: "Objet",
      coverageValue: (n) => `${n} % du montant`,
      triggerValue: (n) => (n === 0 ? "immédiat après défaut" : `${n} jours après défaut`),
      storyBottom: `<p style="margin-top:14px">Concrètement : si <strong>${htmlEscape(p.debtorName)}</strong> ne rembourse pas selon le calendrier prévu, et qu'un délai de ${p.triggerDays} jours s'est écoulé après défaut, tu pourras être appelé(e) à honorer ${p.coverage}% du montant restant. Tu pourras refuser ce rôle en un tap si tu ne souhaites pas t'engager.</p>
<p style="opacity:0.85;font-size:13px">Avant d'accepter, BMD te recommande d'avoir une vraie conversation avec ${htmlEscape(p.debtorName)} sur sa capacité à rembourser.</p>`,
      cta: "Voir et décider",
      quote: "Garantir, c'est dire à voix haute : « je suis prêt(e) à porter ce qui pourrait tomber. »",
      quoteAuthor: "BMD · Back Mes Do",
    },
    en: {
      subject: `You've been designated as a guarantor · RDD ${p.contractCode}`,
      hero: `You carry an important promise`,
      subtitle: `${htmlEscape(p.creditorName)} and ${htmlEscape(p.debtorName)} entrust you with their guarantee`,
      storyTop: `<p>Hi ${htmlEscape(p.recipientName)},</p>
<p><strong>${htmlEscape(p.creditorName)}</strong> and <strong>${htmlEscape(p.debtorName)}</strong> are finalizing a debt acknowledgment and want you to be their <strong>guarantor</strong>. This is a strong role of trust — take the time to read the terms.</p>`,
      cardCode: "Contract code",
      cardCreditor: "Lender",
      cardDebtor: "Borrower",
      cardCoverage: "Coverage",
      cardTrigger: "Activation delay",
      cardPurpose: "Purpose",
      coverageValue: (n) => `${n}% of the amount`,
      triggerValue: (n) => (n === 0 ? "immediate after default" : `${n} days after default`),
      storyBottom: `<p style="margin-top:14px">In practice: if <strong>${htmlEscape(p.debtorName)}</strong> doesn't repay as scheduled, and ${p.triggerDays} days have passed after default, you may be called upon to honor ${p.coverage}% of the remaining amount. You can decline this role in one tap if you'd rather not commit.</p>
<p style="opacity:0.85;font-size:13px">Before accepting, BMD recommends a real conversation with ${htmlEscape(p.debtorName)} about their ability to repay.</p>`,
      cta: "View and decide",
      quote: "To guarantee is to say out loud: \"I'm willing to carry what might fall.\"",
      quoteAuthor: "BMD · Back Mes Do",
    },
    es: {
      subject: `Has sido designado(a) garante · RDD ${p.contractCode}`,
      hero: `Cargas una promesa importante`,
      subtitle: `${htmlEscape(p.creditorName)} y ${htmlEscape(p.debtorName)} te confían su garantía`,
      storyTop: `<p>Hola ${htmlEscape(p.recipientName)},</p>
<p><strong>${htmlEscape(p.creditorName)}</strong> y <strong>${htmlEscape(p.debtorName)}</strong> quieren que seas <strong>garante</strong>. Es un papel de confianza importante.</p>`,
      cardCode: "Código del contrato",
      cardCreditor: "Prestamista",
      cardDebtor: "Prestatario",
      cardCoverage: "Cobertura",
      cardTrigger: "Plazo de activación",
      cardPurpose: "Objeto",
      coverageValue: (n) => `${n}% del monto`,
      triggerValue: (n) => (n === 0 ? "inmediato tras incumplimiento" : `${n} días tras incumplimiento`),
      storyBottom: `<p style="margin-top:14px">Si <strong>${htmlEscape(p.debtorName)}</strong> no paga, después de ${p.triggerDays} días podrías ser llamado(a) a cubrir ${p.coverage}% del saldo. Puedes rechazar en un toque.</p>`,
      cta: "Ver y decidir",
      quote: "Garantizar es decir: «estoy dispuesto a sostener lo que pueda caer».",
      quoteAuthor: "BMD · Back Mes Do",
    },
    de: {
      subject: `Sie wurden als Bürge benannt · RDD ${p.contractCode}`,
      hero: `Sie tragen ein bedeutsames Versprechen`,
      subtitle: `${htmlEscape(p.creditorName)} und ${htmlEscape(p.debtorName)} vertrauen Ihnen ihre Bürgschaft an`,
      storyTop: `<p>Hallo ${htmlEscape(p.recipientName)},</p>
<p><strong>${htmlEscape(p.creditorName)}</strong> und <strong>${htmlEscape(p.debtorName)}</strong> möchten, dass Sie <strong>Bürge</strong> sind. Eine starke Vertrauensrolle.</p>`,
      cardCode: "Vertragscode",
      cardCreditor: "Darlehensgeber",
      cardDebtor: "Darlehensnehmer",
      cardCoverage: "Deckung",
      cardTrigger: "Aktivierungsfrist",
      cardPurpose: "Zweck",
      coverageValue: (n) => `${n}% des Betrags`,
      triggerValue: (n) => (n === 0 ? "sofort nach Ausfall" : `${n} Tage nach Ausfall`),
      storyBottom: `<p style="margin-top:14px">Falls <strong>${htmlEscape(p.debtorName)}</strong> nicht zahlt, könnten Sie nach ${p.triggerDays} Tagen Verzug für ${p.coverage}% des Restbetrags einstehen.</p>`,
      cta: "Ansehen und entscheiden",
      quote: "Bürgen heißt laut sagen: »Ich bin bereit zu tragen, was fallen könnte.«",
      quoteAuthor: "BMD · Back Mes Do",
    },
    pt: {
      subject: `Foste designado(a) fiador · RDD ${p.contractCode}`,
      hero: `Carregas uma promessa importante`,
      subtitle: `${htmlEscape(p.creditorName)} e ${htmlEscape(p.debtorName)} confiam-te a sua garantia`,
      storyTop: `<p>Olá ${htmlEscape(p.recipientName)},</p>
<p><strong>${htmlEscape(p.creditorName)}</strong> e <strong>${htmlEscape(p.debtorName)}</strong> querem-te como <strong>fiador</strong>.</p>`,
      cardCode: "Código do contrato",
      cardCreditor: "Credor",
      cardDebtor: "Devedor",
      cardCoverage: "Cobertura",
      cardTrigger: "Prazo de ativação",
      cardPurpose: "Objeto",
      coverageValue: (n) => `${n}% do montante`,
      triggerValue: (n) => (n === 0 ? "imediato após incumprimento" : `${n} dias após incumprimento`),
      storyBottom: `<p style="margin-top:14px">Se <strong>${htmlEscape(p.debtorName)}</strong> não pagar, após ${p.triggerDays} dias podes ser chamado a cobrir ${p.coverage}% do saldo.</p>`,
      cta: "Ver e decidir",
      quote: "Garantir é dizer em voz alta: «estou pronto a carregar o que possa cair».",
      quoteAuthor: "BMD · Back Mes Do",
    },
    it: {
      subject: `Sei stato designato(a) garante · RDD ${p.contractCode}`,
      hero: `Porti una promessa importante`,
      subtitle: `${htmlEscape(p.creditorName)} e ${htmlEscape(p.debtorName)} ti affidano la loro garanzia`,
      storyTop: `<p>Ciao ${htmlEscape(p.recipientName)},</p>
<p><strong>${htmlEscape(p.creditorName)}</strong> e <strong>${htmlEscape(p.debtorName)}</strong> vogliono che tu sia <strong>garante</strong>.</p>`,
      cardCode: "Codice contratto",
      cardCreditor: "Prestatore",
      cardDebtor: "Beneficiario",
      cardCoverage: "Copertura",
      cardTrigger: "Termine di attivazione",
      cardPurpose: "Oggetto",
      coverageValue: (n) => `${n}% dell'importo`,
      triggerValue: (n) => (n === 0 ? "immediato dopo inadempienza" : `${n} giorni dopo inadempienza`),
      storyBottom: `<p style="margin-top:14px">Se <strong>${htmlEscape(p.debtorName)}</strong> non paga, dopo ${p.triggerDays} giorni potresti dover coprire il ${p.coverage}% del saldo.</p>`,
      cta: "Visualizza e decidi",
      quote: "Garantire è dire ad alta voce: «sono pronto a portare ciò che potrebbe cadere».",
      quoteAuthor: "BMD · Back Mes Do",
    },
    ar: {
      subject: `تم تعيينك ضامناً · إقرار دين ${p.contractCode}`,
      hero: `أنت تحمل وعداً مهماً`,
      subtitle: `${htmlEscape(p.creditorName)} و ${htmlEscape(p.debtorName)} يعهدان إليك بضمانتهما`,
      storyTop: `<p>مرحباً ${htmlEscape(p.recipientName)},</p>
<p>يريد <strong>${htmlEscape(p.creditorName)}</strong> و <strong>${htmlEscape(p.debtorName)}</strong> أن تكون <strong>ضامناً</strong>. دور ثقة قوي — خذ وقتك لقراءة الشروط.</p>`,
      cardCode: "رمز العقد",
      cardCreditor: "المُقرض",
      cardDebtor: "المقترض",
      cardCoverage: "نسبة الضمان",
      cardTrigger: "مهلة التفعيل",
      cardPurpose: "الغرض",
      coverageValue: (n) => `${n}% من المبلغ`,
      triggerValue: (n) => (n === 0 ? "فوري بعد التخلف" : `${n} يوماً بعد التخلف`),
      storyBottom: `<p style="margin-top:14px">إذا لم يسدد <strong>${htmlEscape(p.debtorName)}</strong>، فبعد ${p.triggerDays} يوماً قد تُدعى لتغطية ${p.coverage}% من المتبقي.</p>`,
      cta: "عرض واتخاذ القرار",
      quote: "الضمان أن تقول بصوت عال: «أنا مستعد لحمل ما قد يسقط.»",
      quoteAuthor: "BMD · Back Mes Do",
    },
  };
  const c = pickCopy(C as any, loc, p) as NonNullable<(typeof C)["fr"]>;
  const lines: Array<{ label: string; value: string }> = [
    { label: c.cardCode, value: p.contractCode },
    { label: c.cardCreditor, value: p.creditorName },
    { label: c.cardDebtor, value: p.debtorName },
    { label: c.cardCoverage, value: c.coverageValue(p.coverage) },
    { label: c.cardTrigger, value: c.triggerValue(p.triggerDays) },
  ];
  if (p.purpose) lines.push({ label: c.cardPurpose, value: p.purpose });
  const card = debtContractCard({
    amount: p.amount,
    currency: p.currency,
    lines,
  });
  const body = `${c.storyTop}${card}${c.storyBottom}`;
  const r = renderLayout({
    preheader: c.subject,
    heroEmoji: "🛡️",
    heroTitle: c.hero,
    heroSubtitle: c.subtitle,
    bodyHtml: body,
    ctaLabel: c.cta,
    ctaHref: p.contractUrl,
    blockQuote: c.quote,
    blockQuoteAuthor: c.quoteAuthor,
    locale: loc,
    baseUrl,
  });
  return { subject: c.subject, html: r.html, text: r.text };
}

// ============================================================
// V150.D · DEBT_DISPUTED · l'autre partie signale un litige
// ============================================================
function renderDebtDisputed(
  p: DebtDisputedPayload,
  loc: EmailLocale,
  baseUrl: string,
) {
  const C: Partial<Record<EmailLocale, {
    subject: string;
    hero: string;
    subtitle: string;
    storyTop: string;
    cardCode: string;
    cardInitiator: string;
    cardCategory: string;
    reasonLabel: string;
    storyBottom: string;
    cta: string;
    quote: string;
    quoteAuthor: string;
  }>> = {
    fr: {
      subject: `${p.initiatorName} a signalé un point à clarifier · ${p.contractCode}`,
      hero: `Un point mérite d'être discuté`,
      subtitle: `${htmlEscape(p.initiatorName)} a soulevé une difficulté sur ton contrat`,
      storyTop: `<p>Bonjour ${htmlEscape(p.recipientName)},</p>
<p>Sur la reconnaissance de dette <strong>${htmlEscape(p.contractCode)}</strong>, <strong>${htmlEscape(p.initiatorName)}</strong> a signalé un litige. Ce n'est pas un drame — c'est un signal qui demande une vraie conversation entre vous.</p>`,
      cardCode: "Contrat",
      cardInitiator: "Signalé par",
      cardCategory: "Catégorie",
      reasonLabel: "Ce qui a été décrit",
      storyBottom: `<p style="margin-top:14px">Pendant que le contrat est en litige, les échéances restent visibles mais aucune relance automatique n'est envoyée. Prends contact avec ${htmlEscape(p.initiatorName)} pour échanger calmement. Une fois la situation clarifiée, n'importe lequel d'entre vous peut marquer le litige comme résolu en un tap.</p>
<p style="opacity:0.85;font-size:13px">Conseil : ouvrir l'app et lire ensemble la timeline du contrat peut aider à remettre les faits en place.</p>`,
      cta: "Voir le contrat",
      quote: "Un conflit nommé est déjà à moitié résolu — le silence, lui, abîme tout.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    en: {
      subject: `${p.initiatorName} raised a concern · ${p.contractCode}`,
      hero: `Something deserves a conversation`,
      subtitle: `${htmlEscape(p.initiatorName)} raised an issue about your contract`,
      storyTop: `<p>Hi ${htmlEscape(p.recipientName)},</p>
<p>On debt acknowledgment <strong>${htmlEscape(p.contractCode)}</strong>, <strong>${htmlEscape(p.initiatorName)}</strong> raised a dispute. This isn't a drama — it's a signal asking for a real conversation between you.</p>`,
      cardCode: "Contract",
      cardInitiator: "Raised by",
      cardCategory: "Category",
      reasonLabel: "What was described",
      storyBottom: `<p style="margin-top:14px">While the contract is in dispute, schedules remain visible but no automatic reminders are sent. Reach out to ${htmlEscape(p.initiatorName)} for a calm exchange. Once clarified, either of you can mark the dispute as resolved in one tap.</p>
<p style="opacity:0.85;font-size:13px">Tip: opening the app and reading the contract timeline together can help anchor the facts.</p>`,
      cta: "View contract",
      quote: "A named conflict is already half-resolved — silence, on the other hand, corrodes everything.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    es: {
      subject: `${p.initiatorName} señaló un punto a aclarar · ${p.contractCode}`,
      hero: `Algo merece una conversación`,
      subtitle: `${htmlEscape(p.initiatorName)} planteó una dificultad sobre tu contrato`,
      storyTop: `<p>Hola ${htmlEscape(p.recipientName)},</p>
<p>En el reconocimiento de deuda <strong>${htmlEscape(p.contractCode)}</strong>, <strong>${htmlEscape(p.initiatorName)}</strong> ha planteado una disputa.</p>`,
      cardCode: "Contrato",
      cardInitiator: "Planteado por",
      cardCategory: "Categoría",
      reasonLabel: "Lo que se describió",
      storyBottom: `<p style="margin-top:14px">Mientras el contrato está en disputa, los plazos siguen visibles pero no se envían recordatorios automáticos. Contacta a ${htmlEscape(p.initiatorName)} para una conversación tranquila.</p>`,
      cta: "Ver contrato",
      quote: "Un conflicto nombrado ya está medio resuelto.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    de: {
      subject: `${p.initiatorName} hat einen klärungsbedürftigen Punkt gemeldet · ${p.contractCode}`,
      hero: `Etwas verdient ein Gespräch`,
      subtitle: `${htmlEscape(p.initiatorName)} hat eine Schwierigkeit zu Ihrem Vertrag gemeldet`,
      storyTop: `<p>Hallo ${htmlEscape(p.recipientName)},</p>
<p>Bei der Schuldanerkennung <strong>${htmlEscape(p.contractCode)}</strong> hat <strong>${htmlEscape(p.initiatorName)}</strong> einen Streitfall gemeldet.</p>`,
      cardCode: "Vertrag",
      cardInitiator: "Gemeldet von",
      cardCategory: "Kategorie",
      reasonLabel: "Was beschrieben wurde",
      storyBottom: `<p style="margin-top:14px">Während der Streit anhängt, bleiben die Termine sichtbar, aber keine automatischen Erinnerungen werden versendet. Nehmen Sie ruhig Kontakt mit ${htmlEscape(p.initiatorName)} auf.</p>`,
      cta: "Vertrag ansehen",
      quote: "Ein benannter Konflikt ist schon halb gelöst.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    pt: {
      subject: `${p.initiatorName} sinalizou um ponto a esclarecer · ${p.contractCode}`,
      hero: `Algo merece uma conversa`,
      subtitle: `${htmlEscape(p.initiatorName)} levantou uma dificuldade no teu contrato`,
      storyTop: `<p>Olá ${htmlEscape(p.recipientName)},</p>
<p>No reconhecimento de dívida <strong>${htmlEscape(p.contractCode)}</strong>, <strong>${htmlEscape(p.initiatorName)}</strong> levantou um litígio.</p>`,
      cardCode: "Contrato",
      cardInitiator: "Levantado por",
      cardCategory: "Categoria",
      reasonLabel: "O que foi descrito",
      storyBottom: `<p style="margin-top:14px">Enquanto o contrato estiver em disputa, os prazos permanecem visíveis mas nenhum lembrete automático é enviado. Entra em contacto com ${htmlEscape(p.initiatorName)} para uma conversa calma.</p>`,
      cta: "Ver contrato",
      quote: "Um conflito nomeado já está meio resolvido.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    it: {
      subject: `${p.initiatorName} ha segnalato un punto da chiarire · ${p.contractCode}`,
      hero: `Qualcosa merita una conversazione`,
      subtitle: `${htmlEscape(p.initiatorName)} ha sollevato una difficoltà sul tuo contratto`,
      storyTop: `<p>Ciao ${htmlEscape(p.recipientName)},</p>
<p>Sul riconoscimento di debito <strong>${htmlEscape(p.contractCode)}</strong>, <strong>${htmlEscape(p.initiatorName)}</strong> ha sollevato una controversia.</p>`,
      cardCode: "Contratto",
      cardInitiator: "Sollevato da",
      cardCategory: "Categoria",
      reasonLabel: "Cosa è stato descritto",
      storyBottom: `<p style="margin-top:14px">Mentre il contratto è in controversia, le scadenze restano visibili ma nessun promemoria automatico viene inviato. Contatta ${htmlEscape(p.initiatorName)} per uno scambio sereno.</p>`,
      cta: "Visualizza contratto",
      quote: "Un conflitto nominato è già a metà risolto.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    ar: {
      subject: `${p.initiatorName} أشار إلى نقطة تستدعي التوضيح · ${p.contractCode}`,
      hero: `أمر يستحق المحادثة`,
      subtitle: `أثار ${htmlEscape(p.initiatorName)} صعوبة بخصوص عقدك`,
      storyTop: `<p>مرحباً ${htmlEscape(p.recipientName)},</p>
<p>على إقرار الدين <strong>${htmlEscape(p.contractCode)}</strong>، أثار <strong>${htmlEscape(p.initiatorName)}</strong> نزاعاً.</p>`,
      cardCode: "العقد",
      cardInitiator: "أثاره",
      cardCategory: "الفئة",
      reasonLabel: "ما تم وصفه",
      storyBottom: `<p style="margin-top:14px">طوال فترة النزاع، تظل المواعيد ظاهرة ولكن لا تُرسَل تذكيرات تلقائية. تواصل مع ${htmlEscape(p.initiatorName)} لحوار هادئ.</p>`,
      cta: "عرض العقد",
      quote: "النزاع المُسمَّى نصف محلول.",
      quoteAuthor: "BMD · Back Mes Do",
    },
  };
  const c = pickCopy(C as any, loc, p) as NonNullable<(typeof C)["fr"]>;
  const card = debtContractCard({
    amount: p.amount,
    currency: p.currency,
    lines: [
      { label: c.cardCode, value: p.contractCode },
      { label: c.cardInitiator, value: p.initiatorName },
      { label: c.cardCategory, value: p.categoryLabel },
    ],
  });
  // Bloc raison avec border-left saffron (factuel + lisible)
  const reasonBlock = `<div style="background:rgba(159,70,40,0.10);border-left:3px solid #9F4628;padding:14px 16px;margin:8px 0 18px;border-radius:6px;">
<p style="font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:#9F4628;margin:0 0 6px;font-weight:600;">${htmlEscape(c.reasonLabel)}</p>
<p style="font-size:14px;line-height:1.5;margin:0;color:${BRAND.cream};white-space:pre-wrap;">${htmlEscape(p.reason)}</p>
</div>`;
  const body = `${c.storyTop}${card}${reasonBlock}${c.storyBottom}`;
  const r = renderLayout({
    preheader: c.subject,
    heroEmoji: "⚖️",
    heroTitle: c.hero,
    heroSubtitle: c.subtitle,
    bodyHtml: body,
    ctaLabel: c.cta,
    ctaHref: p.contractUrl,
    blockQuote: c.quote,
    blockQuoteAuthor: c.quoteAuthor,
    locale: loc,
    baseUrl,
  });
  return { subject: c.subject, html: r.html, text: r.text };
}

// ============================================================
// V150.D · DEBT_DISPUTE_RESOLVED · le litige a été résolu amiablement
// ============================================================
function renderDebtDisputeResolved(
  p: DebtDisputeResolvedPayload,
  loc: EmailLocale,
  baseUrl: string,
) {
  const C: Partial<Record<EmailLocale, {
    subject: string;
    hero: string;
    subtitle: string;
    storyTop: string;
    cardCode: string;
    cardResolver: string;
    cardStatus: string;
    noteLabel: string;
    storyBottom: string;
    cta: string;
    quote: string;
    quoteAuthor: string;
  }>> = {
    fr: {
      subject: `Litige résolu · ${p.contractCode}`,
      hero: `Vous avez trouvé un terrain d'entente`,
      subtitle: `Le litige sur ton contrat a été marqué comme résolu`,
      storyTop: `<p>Bonjour ${htmlEscape(p.recipientName)},</p>
<p>Bonne nouvelle. <strong>${htmlEscape(p.resolverName)}</strong> a marqué le litige sur le contrat <strong>${htmlEscape(p.contractCode)}</strong> comme résolu amiablement.</p>`,
      cardCode: "Contrat",
      cardResolver: "Résolu par",
      cardStatus: "Statut restauré",
      noteLabel: "Note ajoutée",
      storyBottom: `<p style="margin-top:14px">Le contrat reprend son cours normal. Les échéances et les relances automatiques redeviennent actives. C'est exactement la maturité financière qu'on souhaite voir entre proches.</p>`,
      cta: "Voir le contrat",
      quote: "La confiance qui survit à un désaccord vaut dix fois celle qui n'a jamais été testée.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    en: {
      subject: `Dispute resolved · ${p.contractCode}`,
      hero: `You found common ground`,
      subtitle: `The dispute on your contract has been marked as resolved`,
      storyTop: `<p>Hi ${htmlEscape(p.recipientName)},</p>
<p>Good news. <strong>${htmlEscape(p.resolverName)}</strong> marked the dispute on contract <strong>${htmlEscape(p.contractCode)}</strong> as amicably resolved.</p>`,
      cardCode: "Contract",
      cardResolver: "Resolved by",
      cardStatus: "Restored status",
      noteLabel: "Note added",
      storyBottom: `<p style="margin-top:14px">The contract returns to its normal course. Schedules and automatic reminders are active again. That's exactly the financial maturity we want to see between close ones.</p>`,
      cta: "View contract",
      quote: "Trust that survives a disagreement is worth ten times trust that was never tested.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    es: {
      subject: `Disputa resuelta · ${p.contractCode}`,
      hero: `Encontraron un terreno común`,
      subtitle: `La disputa sobre tu contrato fue marcada como resuelta`,
      storyTop: `<p>Hola ${htmlEscape(p.recipientName)},</p>
<p>Buenas noticias. <strong>${htmlEscape(p.resolverName)}</strong> marcó la disputa del contrato <strong>${htmlEscape(p.contractCode)}</strong> como resuelta amistosamente.</p>`,
      cardCode: "Contrato",
      cardResolver: "Resuelto por",
      cardStatus: "Estado restaurado",
      noteLabel: "Nota añadida",
      storyBottom: `<p style="margin-top:14px">El contrato vuelve a su curso normal.</p>`,
      cta: "Ver contrato",
      quote: "La confianza que sobrevive a un desacuerdo vale diez veces más.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    de: {
      subject: `Streit beigelegt · ${p.contractCode}`,
      hero: `Sie haben einen gemeinsamen Nenner gefunden`,
      subtitle: `Der Streit zu Ihrem Vertrag wurde als beigelegt markiert`,
      storyTop: `<p>Hallo ${htmlEscape(p.recipientName)},</p>
<p>Gute Nachricht. <strong>${htmlEscape(p.resolverName)}</strong> hat den Streit zum Vertrag <strong>${htmlEscape(p.contractCode)}</strong> als gütlich beigelegt markiert.</p>`,
      cardCode: "Vertrag",
      cardResolver: "Beigelegt durch",
      cardStatus: "Wiederhergestellter Status",
      noteLabel: "Hinzugefügte Notiz",
      storyBottom: `<p style="margin-top:14px">Der Vertrag kehrt zu seinem normalen Verlauf zurück.</p>`,
      cta: "Vertrag ansehen",
      quote: "Vertrauen, das eine Meinungsverschiedenheit überlebt, ist zehnmal mehr wert.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    pt: {
      subject: `Litígio resolvido · ${p.contractCode}`,
      hero: `Encontraram um ponto em comum`,
      subtitle: `O litígio do teu contrato foi marcado como resolvido`,
      storyTop: `<p>Olá ${htmlEscape(p.recipientName)},</p>
<p>Boas notícias. <strong>${htmlEscape(p.resolverName)}</strong> marcou o litígio do contrato <strong>${htmlEscape(p.contractCode)}</strong> como resolvido amigavelmente.</p>`,
      cardCode: "Contrato",
      cardResolver: "Resolvido por",
      cardStatus: "Estado restaurado",
      noteLabel: "Nota adicionada",
      storyBottom: `<p style="margin-top:14px">O contrato retoma o seu curso normal.</p>`,
      cta: "Ver contrato",
      quote: "A confiança que sobrevive a um desacordo vale dez vezes mais.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    it: {
      subject: `Controversia risolta · ${p.contractCode}`,
      hero: `Avete trovato un terreno comune`,
      subtitle: `La controversia sul tuo contratto è stata segnata come risolta`,
      storyTop: `<p>Ciao ${htmlEscape(p.recipientName)},</p>
<p>Buone notizie. <strong>${htmlEscape(p.resolverName)}</strong> ha segnato la controversia sul contratto <strong>${htmlEscape(p.contractCode)}</strong> come risolta amichevolmente.</p>`,
      cardCode: "Contratto",
      cardResolver: "Risolto da",
      cardStatus: "Stato ripristinato",
      noteLabel: "Nota aggiunta",
      storyBottom: `<p style="margin-top:14px">Il contratto riprende il suo corso normale.</p>`,
      cta: "Visualizza contratto",
      quote: "La fiducia che sopravvive a un disaccordo vale dieci volte tanto.",
      quoteAuthor: "BMD · Back Mes Do",
    },
    ar: {
      subject: `النزاع تم حله · ${p.contractCode}`,
      hero: `لقد توصلتما إلى تفاهم`,
      subtitle: `تم وضع علامة على النزاع المتعلق بعقدك كمحلول`,
      storyTop: `<p>مرحباً ${htmlEscape(p.recipientName)},</p>
<p>خبر سار. وضع <strong>${htmlEscape(p.resolverName)}</strong> علامة على النزاع المتعلق بالعقد <strong>${htmlEscape(p.contractCode)}</strong> كمحلول ودياً.</p>`,
      cardCode: "العقد",
      cardResolver: "تم الحل بواسطة",
      cardStatus: "الحالة المستعادة",
      noteLabel: "ملاحظة مضافة",
      storyBottom: `<p style="margin-top:14px">يعود العقد إلى مساره الطبيعي.</p>`,
      cta: "عرض العقد",
      quote: "الثقة التي تنجو من خلاف تساوي عشرة أضعاف.",
      quoteAuthor: "BMD · Back Mes Do",
    },
  };
  const c = pickCopy(C as any, loc, p) as NonNullable<(typeof C)["fr"]>;
  const lines: Array<{ label: string; value: string }> = [
    { label: c.cardCode, value: p.contractCode },
    { label: c.cardResolver, value: p.resolverName },
    { label: c.cardStatus, value: p.restoredStatusLabel },
  ];
  const card = debtContractCard({
    amount: p.amount,
    currency: p.currency,
    lines,
  });
  let noteBlock = "";
  if (p.note && p.note.trim().length > 0) {
    noteBlock = `<div style="background:rgba(31,122,87,0.10);border-left:3px solid #1F7A57;padding:14px 16px;margin:8px 0 18px;border-radius:6px;">
<p style="font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:#0F6E56;margin:0 0 6px;font-weight:600;">${htmlEscape(c.noteLabel)}</p>
<p style="font-size:14px;line-height:1.5;margin:0;color:${BRAND.cream};white-space:pre-wrap;">${htmlEscape(p.note)}</p>
</div>`;
  }
  const body = `${c.storyTop}${card}${noteBlock}${c.storyBottom}`;
  const r = renderLayout({
    preheader: c.subject,
    heroEmoji: "🤝",
    heroTitle: c.hero,
    heroSubtitle: c.subtitle,
    bodyHtml: body,
    ctaLabel: c.cta,
    ctaHref: p.contractUrl,
    blockQuote: c.quote,
    blockQuoteAuthor: c.quoteAuthor,
    locale: loc,
    baseUrl,
  });
  return { subject: c.subject, html: r.html, text: r.text };
}
