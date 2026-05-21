"use client";

/**
 * <LivePricingSection> · Section tarifs vitrine alimentée en LIVE par /plans.
 *
 * Avant : la vitrine affichait des tarifs en dur dans marketing-translations.ts,
 * pas synchro avec ce que l'admin avait configuré côté backend.
 *
 * Maintenant : on fetch la liste des plans actifs depuis l'endpoint public
 * /plans (cache 60s). Les tarifs affichés sont DONC strictement ceux que
 * l'admin a configurés. Toute modif côté admin est répercutée < 60s plus tard.
 *
 * Le composant gère :
 *  - Loading skeleton (pas de flash de "Gratuit")
 *  - Plan FREE en avant (highlight) avec CTA → /login
 *  - Plans payants désactivés visuellement si "À venir" (priceCents=0 mais pas FREE)
 *  - Limites converties en bullet points lisibles (mêmes labels que /dashboard/plans)
 *  - Multi-locale : i18n texte CTA selon la prop locale
 *  - Affichage prix mensuel + ligne secondaire annuel si défini
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../api-client";
import { detectCountry } from "../region-detect";

interface Plan {
  code: string;
  name: string;
  priceCents: number;
  priceCentsYearly: number | null;
  currency: string;
  isRegionalPrice: boolean;
  description: string | null;
  limits: Record<string, any>;
  displayOrder: number;
  isActive: boolean;
}

interface Props {
  /** Locale d'affichage pour les libellés UI (CTA, etc.).
   *  Si la locale n'est pas supportée par les libellés statiques, on tombe
   *  sur le français (lingua franca diaspora). */
  locale?: string;
  /** Couleur d'accent (défaut saffron) */
  accent?: string;
  /** href du CTA principal pour le plan gratuit (défaut /login) */
  freeCtaHref?: string;
}

const LABELS = {
  fr: {
    loading: "Chargement des tarifs…",
    perMonth: "/mois",
    perYear: "/an",
    yearlySave: "soit",
    economy: "économise",
    free: "Gratuit",
    soon: "À venir",
    signup: "Créer un compte",
    none: "Aucun forfait disponible pour le moment.",
    save: "économise",
  },
  en: {
    loading: "Loading pricing…",
    perMonth: "/month",
    perYear: "/year",
    yearlySave: "or",
    economy: "save",
    free: "Free",
    soon: "Coming soon",
    signup: "Sign up free",
    none: "No plans available right now.",
    save: "save",
  },
  es: {
    loading: "Cargando precios…",
    perMonth: "/mes",
    perYear: "/año",
    yearlySave: "o",
    economy: "ahorra",
    free: "Gratis",
    soon: "Próximamente",
    signup: "Crear cuenta",
    none: "Ningún plan disponible ahora mismo.",
    save: "ahorra",
  },
  pt: {
    loading: "A carregar tarifas…",
    perMonth: "/mês",
    perYear: "/ano",
    yearlySave: "ou",
    economy: "poupa",
    free: "Grátis",
    soon: "Em breve",
    signup: "Criar conta",
    none: "Nenhum plano disponível.",
    save: "poupa",
  },
  ar: {
    loading: "جارٍ التحميل…",
    perMonth: "/شهر",
    perYear: "/سنة",
    yearlySave: "أو",
    economy: "وفر",
    free: "مجاني",
    soon: "قريبًا",
    signup: "إنشاء حساب",
    none: "لا توجد خطط متاحة حاليًا.",
    save: "وفر",
  },
  de: {
    loading: "Preise laden…",
    perMonth: "/Monat",
    perYear: "/Jahr",
    yearlySave: "oder",
    economy: "spare",
    free: "Kostenlos",
    soon: "Demnächst",
    signup: "Konto erstellen",
    none: "Keine Tarife verfügbar.",
    save: "spare",
  },
  zh: {
    loading: "加载价格中…",
    perMonth: "/月",
    perYear: "/年",
    yearlySave: "或",
    economy: "节省",
    free: "免费",
    soon: "即将推出",
    signup: "免费注册",
    none: "目前没有可用方案。",
    save: "节省",
  },
  it: {
    loading: "Caricamento prezzi…",
    perMonth: "/mese",
    perYear: "/anno",
    yearlySave: "oppure",
    economy: "risparmia",
    free: "Gratuito",
    soon: "In arrivo",
    signup: "Crea account",
    none: "Nessun piano disponibile.",
    save: "risparmia",
  },
  lb: {
    loading: "Tariffer lueden…",
    perMonth: "/Mount",
    perYear: "/Joer",
    yearlySave: "oder",
    economy: "spuer",
    free: "Gratis",
    soon: "Geschwënn",
    signup: "Konto erstellen",
    none: "Keng Tariffer disponibel.",
    save: "spuer",
  },
  ru: {
    loading: "Загрузка цен…",
    perMonth: "/мес",
    perYear: "/год",
    yearlySave: "или",
    economy: "экономия",
    free: "Бесплатно",
    soon: "Скоро",
    signup: "Создать аккаунт",
    none: "Нет доступных планов.",
    save: "экономия",
  },
  ja: {
    loading: "料金を読み込み中…",
    perMonth: "/月",
    perYear: "/年",
    yearlySave: "または",
    economy: "節約",
    free: "無料",
    soon: "近日公開",
    signup: "アカウント作成",
    none: "現在利用可能なプランはありません。",
    save: "節約",
  },
  ko: {
    loading: "가격 로딩 중…",
    perMonth: "/월",
    perYear: "/년",
    yearlySave: "또는",
    economy: "절약",
    free: "무료",
    soon: "곧 출시",
    signup: "계정 만들기",
    none: "현재 사용 가능한 플랜이 없습니다.",
    save: "절약",
  },
  hi: {
    loading: "मूल्य लोड हो रहा है…",
    perMonth: "/माह",
    perYear: "/वर्ष",
    yearlySave: "या",
    economy: "बचत",
    free: "मुफ्त",
    soon: "जल्द आ रहा है",
    signup: "खाता बनाएँ",
    none: "अभी कोई योजना उपलब्ध नहीं है।",
    save: "बचत",
  },
  sw: {
    loading: "Inapakia bei…",
    perMonth: "/mwezi",
    perYear: "/mwaka",
    yearlySave: "au",
    economy: "okoa",
    free: "Bure",
    soon: "Inakuja hivi karibuni",
    signup: "Unda akaunti",
    none: "Hakuna mipango inayopatikana sasa hivi.",
    save: "okoa",
  },
  wo: {
    loading: "Njëg yi mu yor…",
    perMonth: "/weer",
    perYear: "/at",
    yearlySave: "wala",
    economy: "musil",
    free: "Free",
    soon: "Bët",
    signup: "Bind sa kont",
    none: "Amul forfait bu sax tey.",
    save: "musil",
  },
  am: {
    loading: "ዋጋዎች በመጫን ላይ…",
    perMonth: "/ወር",
    perYear: "/ዓመት",
    yearlySave: "ወይም",
    economy: "ቆጥብ",
    free: "ነጻ",
    soon: "በቅርብ",
    signup: "መለያ ፍጠር",
    none: "በአሁኑ ጊዜ የሚገኝ እቅድ የለም።",
    save: "ቆጥብ",
  },
  ln: {
    loading: "Mbongo ezo zwama…",
    perMonth: "/sanza",
    perYear: "/mobu",
    yearlySave: "to",
    economy: "kobomba",
    free: "Ofele",
    soon: "Eyei kala te",
    signup: "Salá compte na ngai",
    none: "Plan moko ezali te tango oyo.",
    save: "kobomba",
  },
  pcm: {
    loading: "Loading price…",
    perMonth: "/month",
    perYear: "/year",
    yearlySave: "or",
    economy: "save",
    free: "Free",
    soon: "Soon come",
    signup: "Make account",
    none: "No plan dey now.",
    save: "save",
  },
  "fr-cm": {
    loading: "Chargement des tarifs…",
    perMonth: "/mois",
    perYear: "/an",
    yearlySave: "ou",
    economy: "économise",
    free: "Gratos",
    soon: "Bientôt",
    signup: "Créer le compte",
    none: "Pas de forfait dispo.",
    save: "économise",
  },
  "fr-ci": {
    loading: "Chargement des tarifs…",
    perMonth: "/mois",
    perYear: "/an",
    yearlySave: "ou",
    economy: "économise",
    free: "Gratos",
    soon: "Bientôt",
    signup: "Faire le compte",
    none: "Aucun forfait dispo.",
    save: "économise",
  },
};

/**
 * Traduction client-side du nom + description de chaque plan.
 *
 * Pourquoi : le backend stocke `Plan.name` et `Plan.description` dans une
 * seule langue (FR). Pour avoir le même niveau d'info sur le site vitrine
 * dans les 27 locales, on mappe ici par `plan.code`. Si le plan n'a pas
 * de traduction pour la locale, on tombe sur la valeur EN ; à défaut, sur
 * la valeur retournée par le backend (FR).
 *
 * Couvre les 5 plans seeds : FREE, PREMIUM, COMMUNITY, PARISH, EVENT.
 * Les locales mineures retombent sur la traduction EN (acceptable et
 * pleinement compréhensible pour ces marchés secondaires).
 */
type PlanTrans = { name: string; description: string };
type PlanCode = "FREE" | "PREMIUM" | "COMMUNITY" | "PARISH" | "EVENT";

const PLAN_TRANSLATIONS: Partial<Record<string, Partial<Record<PlanCode, PlanTrans>>>> = {
  fr: {
    FREE: { name: "Découverte", description: "Pour démarrer · 2 groupes, 8 membres/groupe, OCR limité" },
    PREMIUM: { name: "Premium", description: "Tout illimité, sans pub, swap de dettes, 25 devises" },
    COMMUNITY: { name: "Communauté", description: "Pour clubs et associations · dashboard admin + rôles custom" },
    PARISH: { name: "Paroisse", description: "Pour paroisses & associations cultuelles · reçus fiscaux automatiques" },
    EVENT: { name: "Événement", description: "Mariage, voyage, événement · paiement unique, valable 30 jours" },
  },
  en: {
    FREE: { name: "Discover", description: "Get started · 2 groups, 8 members/group, limited OCR" },
    PREMIUM: { name: "Premium", description: "Unlimited everything, ad-free, debt swaps, 25 currencies" },
    COMMUNITY: { name: "Community", description: "For clubs & associations · admin dashboard + custom roles" },
    PARISH: { name: "Parish", description: "For parishes & non-profits · automatic tax receipts" },
    EVENT: { name: "Event", description: "Wedding, trip, party · one-time payment, valid 30 days" },
  },
  es: {
    FREE: { name: "Descubrir", description: "Empezar · 2 grupos, 8 miembros/grupo, OCR limitado" },
    PREMIUM: { name: "Premium", description: "Todo ilimitado, sin anuncios, swap deudas, 25 monedas" },
    COMMUNITY: { name: "Comunidad", description: "Para clubes y asociaciones · panel admin + roles" },
    PARISH: { name: "Parroquia", description: "Para parroquias y ONG · recibos fiscales automáticos" },
    EVENT: { name: "Evento", description: "Boda, viaje, fiesta · pago único, válido 30 días" },
  },
  pt: {
    FREE: { name: "Descobrir", description: "Para começar · 2 grupos, 8 membros/grupo, OCR limitado" },
    PREMIUM: { name: "Premium", description: "Tudo ilimitado, sem publicidade, swap de dívidas" },
    COMMUNITY: { name: "Comunidade", description: "Para clubes e associações · painel admin + papéis" },
    PARISH: { name: "Paróquia", description: "Para paróquias e ONGs · recibos fiscais automáticos" },
    EVENT: { name: "Evento", description: "Casamento, viagem, festa · pagamento único, válido 30 dias" },
  },
  de: {
    FREE: { name: "Entdecken", description: "Zum Starten · 2 Gruppen, 8 Mitglieder/Gruppe, begrenztes OCR" },
    PREMIUM: { name: "Premium", description: "Alles unbegrenzt, werbefrei, Schuldentausch, 25 Währungen" },
    COMMUNITY: { name: "Gemeinschaft", description: "Für Vereine & Verbände · Admin-Dashboard + Rollen" },
    PARISH: { name: "Pfarrei", description: "Für Pfarreien & gemeinnützige Vereine · automatische Spendenquittungen" },
    EVENT: { name: "Event", description: "Hochzeit, Reise, Feier · Einmalzahlung, 30 Tage gültig" },
  },
  it: {
    FREE: { name: "Scoperta", description: "Per iniziare · 2 gruppi, 8 membri/gruppo, OCR limitato" },
    PREMIUM: { name: "Premium", description: "Tutto illimitato, senza pubblicità, swap debiti, 25 valute" },
    COMMUNITY: { name: "Comunità", description: "Per club e associazioni · dashboard admin + ruoli" },
    PARISH: { name: "Parrocchia", description: "Per parrocchie e onlus · ricevute fiscali automatiche" },
    EVENT: { name: "Evento", description: "Matrimonio, viaggio, festa · pagamento unico, valido 30 giorni" },
  },
  lb: {
    FREE: { name: "Entdecken", description: "Fir unzefänken · 2 Gruppen, 8 Memberen/Grupp, limitéiert OCR" },
    PREMIUM: { name: "Premium", description: "Alles onlimitéiert, ouni Reklamm, Schold-Tausch, 25 Währungen" },
    COMMUNITY: { name: "Gemeinschaft", description: "Fir Veräiner & Verbänn · Admin-Dashboard + Rollen" },
    PARISH: { name: "Päir", description: "Fir Päiren & gemeinnëtzeg Veräiner · automatesch Steierquittungen" },
    EVENT: { name: "Event", description: "Hochzäit, Rees, Fest · Eemolzuelung, 30 Deeg gëlteg" },
  },
  ru: {
    FREE: { name: "Знакомство", description: "Для начала · 2 группы, 8 участников/группа, ограниченный OCR" },
    PREMIUM: { name: "Premium", description: "Безлимит, без рекламы, обмен долгами, 25 валют" },
    COMMUNITY: { name: "Сообщество", description: "Для клубов и ассоциаций · админ-панель + роли" },
    PARISH: { name: "Приход", description: "Для приходов и НКО · автоматические налоговые квитанции" },
    EVENT: { name: "Событие", description: "Свадьба, поездка, праздник · разовый платёж, действует 30 дней" },
  },
  ja: {
    FREE: { name: "発見", description: "はじめる · 2グループ、8メンバー/グループ、OCR制限あり" },
    PREMIUM: { name: "プレミアム", description: "すべて無制限、広告なし、債務スワップ、25通貨" },
    COMMUNITY: { name: "コミュニティ", description: "クラブと協会向け · 管理ダッシュボード + ロール" },
    PARISH: { name: "教会", description: "教会と非営利団体向け · 税務領収書自動発行" },
    EVENT: { name: "イベント", description: "結婚式、旅行、パーティー · 一括払い、30日間有効" },
  },
  ko: {
    FREE: { name: "발견", description: "시작하기 · 2개 그룹, 그룹당 8명, OCR 제한" },
    PREMIUM: { name: "프리미엄", description: "모든 것 무제한, 광고 없음, 부채 스왑, 25개 통화" },
    COMMUNITY: { name: "커뮤니티", description: "클럽 및 협회용 · 관리자 대시보드 + 역할" },
    PARISH: { name: "교구", description: "교구 및 비영리 단체용 · 자동 세무 영수증" },
    EVENT: { name: "이벤트", description: "결혼식, 여행, 파티 · 일회성 결제, 30일 유효" },
  },
  hi: {
    FREE: { name: "खोज", description: "शुरू करें · 2 समूह, प्रति समूह 8 सदस्य, सीमित OCR" },
    PREMIUM: { name: "प्रीमियम", description: "सब कुछ असीमित, बिना विज्ञापन, ऋण स्वैप, 25 मुद्राएँ" },
    COMMUNITY: { name: "समुदाय", description: "क्लबों और संघों के लिए · व्यवस्थापक डैशबोर्ड + भूमिकाएँ" },
    PARISH: { name: "चर्च", description: "चर्चों और गैर-लाभकारी संस्थाओं के लिए · स्वचालित कर रसीदें" },
    EVENT: { name: "इवेंट", description: "शादी, यात्रा, पार्टी · एकमुश्त भुगतान, 30 दिन वैध" },
  },
  ar: {
    FREE: { name: "اكتشاف", description: "للبدء · مجموعتان، 8 أعضاء/مجموعة، OCR محدود" },
    PREMIUM: { name: "بريميوم", description: "كل شيء غير محدود، بدون إعلانات، تبادل ديون، 25 عملة" },
    COMMUNITY: { name: "مجتمع", description: "للنوادي والجمعيات · لوحة تحكم إدارية + أدوار" },
    PARISH: { name: "كنيسة", description: "للكنائس والجمعيات الخيرية · إيصالات ضريبية تلقائية" },
    EVENT: { name: "حدث", description: "زفاف، سفر، حفلة · دفعة واحدة، صالحة لـ 30 يومًا" },
  },
  zh: {
    FREE: { name: "探索", description: "开始 · 2 个组, 每组 8 名成员, 有限 OCR" },
    PREMIUM: { name: "高级版", description: "一切无限, 无广告, 债务交换, 25 种货币" },
    COMMUNITY: { name: "社区", description: "适合俱乐部和协会 · 管理仪表板 + 角色" },
    PARISH: { name: "教区", description: "适合教区和非营利组织 · 自动税务收据" },
    EVENT: { name: "活动", description: "婚礼、旅行、聚会 · 一次性付款, 有效期 30 天" },
  },
  sw: {
    FREE: { name: "Gundua", description: "Anza · vikundi 2, washiriki 8/kikundi, OCR mdogo" },
    PREMIUM: { name: "Premium", description: "Yote isiyo na kikomo, bila matangazo, swap madeni, sarafu 25" },
    COMMUNITY: { name: "Jamii", description: "Kwa klabu na vyama · dashibodi msimamizi + majukumu" },
    PARISH: { name: "Kanisa", description: "Kwa makanisa na NGOs · stakabadhi za kodi otomatiki" },
    EVENT: { name: "Tukio", description: "Harusi, safari, sherehe · malipo moja, halali siku 30" },
  },
  wo: {
    FREE: { name: "Gis-gis", description: "Tàmbali · 2 kër, 8 way ci kër, OCR muñ" },
    PREMIUM: { name: "Premium", description: "Lépp sax, du jëkkër, swap bor, 25 xaalis" },
    COMMUNITY: { name: "Mbokk", description: "Klub ak asosiyaasioon · tableau admin" },
    PARISH: { name: "Parouwas", description: "Parouwas ak ONG · resu fiskal auto" },
    EVENT: { name: "Xewu", description: "Séyu, tukki · fey benn benn, 30 fan" },
  },
  am: {
    FREE: { name: "ግኝት", description: "ይጀምሩ · 2 ቡድኖች፣ 8 አባላት/ቡድን" },
    PREMIUM: { name: "ፕሪሚየም", description: "ሁሉም ያልተገደበ፣ ያለ ማስታወቂያ" },
    COMMUNITY: { name: "ማህበረሰብ", description: "ለክለቦች እና ማህበራት" },
    PARISH: { name: "ቤተክርስቲያን", description: "ለአብያተ ክርስቲያናት እና ለግብረ ሰናይ" },
    EVENT: { name: "ዝግጅት", description: "ሰርግ፣ ጉዞ · አንድ ጊዜ ክፍያ" },
  },
  ln: {
    FREE: { name: "Bobongisi", description: "Banda · groupe 2, 8 bato/groupe" },
    PREMIUM: { name: "Premium", description: "Nyonso te suka, sans pub, swap bor" },
    COMMUNITY: { name: "Lisanga", description: "Mpo na ba club mpe associations" },
    PARISH: { name: "Paroisse", description: "Mpo na paroisses · reseepi fiscaux auto" },
    EVENT: { name: "Likita", description: "Libala, mobembo · bofuti moko, mikolo 30" },
  },
  pcm: {
    FREE: { name: "Discover", description: "Start · 2 groups, 8 member/group" },
    PREMIUM: { name: "Premium", description: "Everything no limit, no advert" },
    COMMUNITY: { name: "Community", description: "For club and association · admin dashboard" },
    PARISH: { name: "Parish", description: "For church and NGO · automatic tax receipt" },
    EVENT: { name: "Event", description: "Wedding, trip · one-time pay, 30 days" },
  },
  ha: {
    FREE: { name: "Gano", description: "Fara · 2 rukuni, 8 mambobi/rukuni" },
    PREMIUM: { name: "Premium", description: "Komai mara iyaka, babu talla, musayar bashi" },
    COMMUNITY: { name: "Al'umma", description: "Don kungiyoyi · daskbod admin" },
    PARISH: { name: "Coci", description: "Don coci da ƙungiyoyin agaji · rasit haraji" },
    EVENT: { name: "Taro", description: "Aure, tafiya · biyan kuɗi sau ɗaya" },
  },
  yo: {
    FREE: { name: "Ìṣàwárí", description: "Bẹ̀rẹ̀ · ẹgbẹ́ 2, ọmọ 8/ẹgbẹ́" },
    PREMIUM: { name: "Premium", description: "Gbogbo ohun kò ní opin, kò sí ìpolówó" },
    COMMUNITY: { name: "Àwùjọ", description: "Fún ẹgbẹ́ àti àjọ · dáṣíbóòdù alábàójú" },
    PARISH: { name: "Ṣọ́ọ̀ṣì", description: "Fún ṣọ́ọ̀ṣì àti àjọ · ìwé ìpamọ́ owó orí" },
    EVENT: { name: "Ìṣẹ̀lẹ̀", description: "Ìgbéyàwó, ìrìnàjò · sísanwó ẹ̀ẹ̀kan" },
  },
  om: {
    FREE: { name: "Argaa", description: "Jalqabi · garee 2, miseensa 8/garee" },
    PREMIUM: { name: "Premium", description: "Hundi daangaa hin qabne, beeksisa hin qabne" },
    COMMUNITY: { name: "Hawaasa", description: "Klabootaaf · daashboordii admin" },
    PARISH: { name: "Mana sagadaa", description: "Manneen sagadaaf · beessisa gibira" },
    EVENT: { name: "Taateewwan", description: "Cidha, imala · kaffaltii al-tokko" },
  },
  ig: {
    FREE: { name: "Nchọpụta", description: "Bido · òtù 2, ndị òtù 8/òtù" },
    PREMIUM: { name: "Premium", description: "Ihe niile enweghị oke, mgbasa ozi enweghị" },
    COMMUNITY: { name: "Obodo", description: "Maka klọb na nzukọ · daashboodu nchịkwa" },
    PARISH: { name: "Ụka", description: "Maka ụka na NGO · akwụkwọ azụmaahịa ụtụ" },
    EVENT: { name: "Mmemme", description: "Agbamakwụkwọ, njem · ịkwụ ụgwọ otu mgbe" },
  },
  ff: {
    FREE: { name: "Yiyitir", description: "Fuɗɗo · goolle 2, mbeydaaji 8/goolol" },
    PREMIUM: { name: "Premium", description: "Fof ngalaa keerol, alaa publiyaa" },
    COMMUNITY: { name: "Renndo", description: "Fii klubuuji e fedde · ɓesngu admin" },
    PARISH: { name: "Galle dewgol", description: "Fii galleeji e fedde · resu fiskal" },
    EVENT: { name: "Hiisngo", description: "Dewgal, jaɓɓingol · yoɓtugol gootol" },
  },
  zu: {
    FREE: { name: "Tholile", description: "Qala · amaqembu 2, amalungu 8/iqembu" },
    PREMIUM: { name: "Premium", description: "Konke akunamkhawulo, akukho kukhangisa" },
    COMMUNITY: { name: "Umphakathi", description: "Kumaklabhu · ideshibhodi yomlawuli" },
    PARISH: { name: "Iparishi", description: "Kumapharishi · iziqinisekiso zentela" },
    EVENT: { name: "Umcimbi", description: "Umshado, uhambo · inkokhelo eyodwa" },
  },
  ak: {
    FREE: { name: "Hu", description: "Hyɛ ase · akuw 2, akuwfo 8/kuw" },
    PREMIUM: { name: "Premium", description: "Biribiara nni anohyeto, dawubɔ nni" },
    COMMUNITY: { name: "Mpɔtam", description: "Akuw ne nkabom · daashboodi" },
    PARISH: { name: "Asɔredan", description: "Asɔredan ne ahyehyɛde · tax PDF" },
    EVENT: { name: "Adwumadie", description: "Ayɛforɔhyia, akwantu · pɛnkoro" },
  },
  "fr-cm": {
    FREE: { name: "Découverte", description: "Pour démarrer · 2 groupes, 8 guys/groupe, OCR muñ" },
    PREMIUM: { name: "Premium", description: "Tout illimité, sans pub, swap dette, 25 devises" },
    COMMUNITY: { name: "Communauté", description: "Pour les clubs et associations · dashboard admin" },
    PARISH: { name: "Paroisse", description: "Pour les paroisses · reçus fiscaux auto" },
    EVENT: { name: "Événement", description: "Mariage, voyage · paiement unique, 30 jours" },
  },
  "fr-ci": {
    FREE: { name: "Découverte", description: "Pour démarrer · 2 groupes, 8 gars/groupe, OCR limité" },
    PREMIUM: { name: "Premium", description: "Tout enjaillé, sans pub, swap dette, 25 devises" },
    COMMUNITY: { name: "Communauté", description: "Pour les clubs et associations · dashboard admin" },
    PARISH: { name: "Paroisse", description: "Pour les paroisses · reçus fiscaux auto" },
    EVENT: { name: "Événement", description: "Mariage, voyage · paiement unique, 30 jours" },
  },
};

/**
 * Renvoie le {name, description} traduits pour un plan dans la locale
 * demandée. Fallback : EN puis valeur backend.
 */
function translatePlan(
  plan: Plan,
  lang: string,
): { name: string; description: string | null } {
  const code = plan.code as PlanCode;
  const map = PLAN_TRANSLATIONS[lang]?.[code];
  if (map) return { name: map.name, description: map.description };
  // Fallback EN si la locale n'a pas de traduction
  const en = PLAN_TRANSLATIONS.en?.[code];
  if (en) return { name: en.name, description: en.description };
  // Fallback ultime : valeurs du backend
  return { name: plan.name, description: plan.description };
}

/**
 * Labels par locale pour chaque ligne de bullet du plan.
 * Pour chaque clé, deux variantes : "unlimited" et "count" (avec {n}).
 * Pour les booléens, simple string.
 *
 * Couvre les 27 locales BMD. Les locales non présentes retombent sur EN
 * via translateBullet() ci-dessous.
 */
const BULLET_LABELS: Partial<Record<string, {
  groupsUnl: string; groupsCount: string;
  membersUnl: string; membersCount: string;
  ocrUnl: string; ocrCount: string;
  whatsappBot: string;
  multiCurrency: string;
  debtSwap: string;
  exportPdfExcel: string;
  taxReceipts: string;
  prioritySupport: string;
  adFree: string;
}>> = {
  fr: { groupsUnl: "Groupes illimités", groupsCount: "{n} groupes maximum", membersUnl: "Membres illimités par groupe", membersCount: "{n} membres par groupe", ocrUnl: "Scan IA des tickets illimité", ocrCount: "{n} scans IA / mois", whatsappBot: "Bot WhatsApp / SMS", multiCurrency: "Multi-devises avec FX live", debtSwap: "Transferts de dettes", exportPdfExcel: "Export PDF + Excel", taxReceipts: "Reçus fiscaux automatiques", prioritySupport: "Support prioritaire", adFree: "Sans publicité" },
  en: { groupsUnl: "Unlimited groups", groupsCount: "Up to {n} groups", membersUnl: "Unlimited members per group", membersCount: "{n} members per group", ocrUnl: "Unlimited AI receipt scanning", ocrCount: "{n} AI scans / month", whatsappBot: "WhatsApp / SMS bot", multiCurrency: "Multi-currency with live FX", debtSwap: "Debt transfers", exportPdfExcel: "PDF + Excel export", taxReceipts: "Automatic tax receipts", prioritySupport: "Priority support", adFree: "Ad-free" },
  es: { groupsUnl: "Grupos ilimitados", groupsCount: "Hasta {n} grupos", membersUnl: "Miembros ilimitados por grupo", membersCount: "{n} miembros por grupo", ocrUnl: "Escaneo IA ilimitado", ocrCount: "{n} escaneos IA / mes", whatsappBot: "Bot WhatsApp / SMS", multiCurrency: "Multi-divisa con FX en vivo", debtSwap: "Transferencias de deuda", exportPdfExcel: "Exportar PDF + Excel", taxReceipts: "Recibos fiscales automáticos", prioritySupport: "Soporte prioritario", adFree: "Sin anuncios" },
  pt: { groupsUnl: "Grupos ilimitados", groupsCount: "Até {n} grupos", membersUnl: "Membros ilimitados por grupo", membersCount: "{n} membros por grupo", ocrUnl: "Scan IA ilimitado", ocrCount: "{n} scans IA / mês", whatsappBot: "Bot WhatsApp / SMS", multiCurrency: "Multi-moeda com FX ao vivo", debtSwap: "Transferências de dívida", exportPdfExcel: "Exportar PDF + Excel", taxReceipts: "Recibos fiscais automáticos", prioritySupport: "Suporte prioritário", adFree: "Sem publicidade" },
  de: { groupsUnl: "Unbegrenzte Gruppen", groupsCount: "Bis zu {n} Gruppen", membersUnl: "Unbegrenzte Mitglieder pro Gruppe", membersCount: "{n} Mitglieder pro Gruppe", ocrUnl: "Unbegrenztes KI-Scannen", ocrCount: "{n} KI-Scans / Monat", whatsappBot: "WhatsApp / SMS Bot", multiCurrency: "Mehrere Währungen mit Live-FX", debtSwap: "Schuldentausch", exportPdfExcel: "PDF + Excel Export", taxReceipts: "Automatische Spendenquittungen", prioritySupport: "Vorrangiger Support", adFree: "Werbefrei" },
  it: { groupsUnl: "Gruppi illimitati", groupsCount: "Fino a {n} gruppi", membersUnl: "Membri illimitati per gruppo", membersCount: "{n} membri per gruppo", ocrUnl: "Scansione IA illimitata", ocrCount: "{n} scansioni IA / mese", whatsappBot: "Bot WhatsApp / SMS", multiCurrency: "Multi-valuta con FX live", debtSwap: "Trasferimento debiti", exportPdfExcel: "Esportazione PDF + Excel", taxReceipts: "Ricevute fiscali automatiche", prioritySupport: "Supporto prioritario", adFree: "Senza pubblicità" },
  lb: { groupsUnl: "Onlimitéiert Gruppen", groupsCount: "Bis zu {n} Gruppen", membersUnl: "Onlimitéiert Memberen pro Grupp", membersCount: "{n} Memberen pro Grupp", ocrUnl: "Onlimitéiert KI-Scanning", ocrCount: "{n} KI-Scannen / Mount", whatsappBot: "WhatsApp / SMS Bot", multiCurrency: "Multi-Währung mat Live-FX", debtSwap: "Schold-Tausch", exportPdfExcel: "PDF + Excel Export", taxReceipts: "Automatesch Steierquittungen", prioritySupport: "Prioritéitssupport", adFree: "Ouni Reklamm" },
  ru: { groupsUnl: "Безлимитные группы", groupsCount: "До {n} групп", membersUnl: "Безлимит участников в группе", membersCount: "{n} участников в группе", ocrUnl: "Безлимитное ИИ-сканирование", ocrCount: "{n} ИИ-сканов / мес", whatsappBot: "Бот WhatsApp / SMS", multiCurrency: "Мультивалюта с live FX", debtSwap: "Обмен долгами", exportPdfExcel: "Экспорт PDF + Excel", taxReceipts: "Автоматические налоговые квитанции", prioritySupport: "Приоритетная поддержка", adFree: "Без рекламы" },
  ja: { groupsUnl: "グループ無制限", groupsCount: "最大 {n} グループ", membersUnl: "グループあたり無制限メンバー", membersCount: "グループあたり {n} メンバー", ocrUnl: "AI スキャン無制限", ocrCount: "AI スキャン {n} 回/月", whatsappBot: "WhatsApp / SMS ボット", multiCurrency: "ライブ FX 多通貨対応", debtSwap: "債務スワップ", exportPdfExcel: "PDF + Excel エクスポート", taxReceipts: "自動税務領収書", prioritySupport: "優先サポート", adFree: "広告なし" },
  ko: { groupsUnl: "무제한 그룹", groupsCount: "최대 {n}개 그룹", membersUnl: "그룹당 무제한 멤버", membersCount: "그룹당 {n}명 멤버", ocrUnl: "무제한 AI 영수증 스캔", ocrCount: "월 {n}회 AI 스캔", whatsappBot: "WhatsApp / SMS 봇", multiCurrency: "실시간 FX 다중 통화", debtSwap: "부채 스왑", exportPdfExcel: "PDF + Excel 내보내기", taxReceipts: "자동 세무 영수증", prioritySupport: "우선 지원", adFree: "광고 없음" },
  hi: { groupsUnl: "असीमित समूह", groupsCount: "{n} समूह तक", membersUnl: "प्रति समूह असीमित सदस्य", membersCount: "प्रति समूह {n} सदस्य", ocrUnl: "असीमित AI रसीद स्कैन", ocrCount: "{n} AI स्कैन / माह", whatsappBot: "WhatsApp / SMS बॉट", multiCurrency: "लाइव FX के साथ बहु-मुद्रा", debtSwap: "ऋण स्वैप", exportPdfExcel: "PDF + Excel निर्यात", taxReceipts: "स्वचालित कर रसीदें", prioritySupport: "प्राथमिकता समर्थन", adFree: "बिना विज्ञापन" },
  ar: { groupsUnl: "مجموعات غير محدودة", groupsCount: "حتى {n} مجموعات", membersUnl: "أعضاء غير محدودين لكل مجموعة", membersCount: "{n} أعضاء لكل مجموعة", ocrUnl: "مسح إيصالات بالذكاء الاصطناعي بلا حدود", ocrCount: "{n} عمليات مسح / شهر", whatsappBot: "روبوت WhatsApp / SMS", multiCurrency: "متعدد العملات مع FX مباشر", debtSwap: "تبادل الديون", exportPdfExcel: "تصدير PDF + Excel", taxReceipts: "إيصالات ضريبية تلقائية", prioritySupport: "دعم ذو أولوية", adFree: "بدون إعلانات" },
  zh: { groupsUnl: "无限组", groupsCount: "最多 {n} 组", membersUnl: "每组无限成员", membersCount: "每组 {n} 名成员", ocrUnl: "无限 AI 票据扫描", ocrCount: "每月 {n} 次 AI 扫描", whatsappBot: "WhatsApp / SMS 机器人", multiCurrency: "多币种实时汇率", debtSwap: "债务交换", exportPdfExcel: "PDF + Excel 导出", taxReceipts: "自动税务收据", prioritySupport: "优先支持", adFree: "无广告" },
  sw: { groupsUnl: "Vikundi visivyo na kikomo", groupsCount: "Hadi vikundi {n}", membersUnl: "Washiriki wasio na kikomo kwa kikundi", membersCount: "Washiriki {n} kwa kikundi", ocrUnl: "Skanning AI bila kikomo", ocrCount: "Skanning AI {n} / mwezi", whatsappBot: "Boti WhatsApp / SMS", multiCurrency: "Sarafu nyingi na FX moja kwa moja", debtSwap: "Kubadilisha madeni", exportPdfExcel: "Pakua PDF + Excel", taxReceipts: "Stakabadhi za kodi otomatiki", prioritySupport: "Msaada wa kipaumbele", adFree: "Bila matangazo" },
  wo: { groupsUnl: "Kër yu amul yoon", groupsCount: "{n} kër", membersUnl: "Way yu amul yoon ci kër", membersCount: "{n} way ci kër", ocrUnl: "Skan IA amul yoon", ocrCount: "{n} skan IA ci weer", whatsappBot: "Bot WhatsApp / SMS", multiCurrency: "Xaalis yu bari ak FX", debtSwap: "Wecceeku bor", exportPdfExcel: "Génn PDF + Excel", taxReceipts: "Resu fiskal auto", prioritySupport: "Ndimbal jëkk", adFree: "Du am pub" },
  am: { groupsUnl: "ያልተገደቡ ቡድኖች", groupsCount: "እስከ {n} ቡድኖች", membersUnl: "በቡድን ውስጥ ያልተገደቡ አባላት", membersCount: "በቡድን {n} አባላት", ocrUnl: "ያልተገደበ AI ስካን", ocrCount: "በወር {n} AI ስካን", whatsappBot: "የWhatsApp / SMS ቦት", multiCurrency: "ብዙ ምንዛሬ ከቀጥታ FX ጋር", debtSwap: "የዕዳ መለዋወጥ", exportPdfExcel: "PDF + Excel ኤክስፖርት", taxReceipts: "ራስ-ሰር የግብር ደረሰኝ", prioritySupport: "ቅድሚያ ድጋፍ", adFree: "ያለ ማስታወቂያ" },
  ln: { groupsUnl: "Ba groupe ezanga ndelo", groupsCount: "Tii na ba groupe {n}", membersUnl: "Ba bato ezanga ndelo na groupe", membersCount: "Bato {n} na groupe", ocrUnl: "Skan IA ezanga ndelo", ocrCount: "Skan IA {n} / sanza", whatsappBot: "Bot WhatsApp / SMS", multiCurrency: "Mbongo ndenge na ndenge na FX live", debtSwap: "Bobongoli ya nyongo", exportPdfExcel: "Bobimisi PDF + Excel", taxReceipts: "Ba reçu ya impôt auto", prioritySupport: "Lisalisi ya liboso", adFree: "Te na publicité" },
  pcm: { groupsUnl: "No limit groups", groupsCount: "Up to {n} groups", membersUnl: "No limit members per group", membersCount: "{n} members per group", ocrUnl: "AI scan no get limit", ocrCount: "{n} AI scans / month", whatsappBot: "WhatsApp / SMS bot", multiCurrency: "Plenty currency wit live FX", debtSwap: "Debt swap", exportPdfExcel: "PDF + Excel export", taxReceipts: "Auto tax receipt", prioritySupport: "Priority support", adFree: "No ads" },
  ha: { groupsUnl: "Rukuni mara iyaka", groupsCount: "Har rukuni {n}", membersUnl: "Mambobi mara iyaka kowane rukuni", membersCount: "Mambobi {n} kowane rukuni", ocrUnl: "Bincike AI mara iyaka", ocrCount: "Binciken AI {n} / wata", whatsappBot: "Bot na WhatsApp / SMS", multiCurrency: "Kuɗi da yawa tare da FX", debtSwap: "Musayar bashi", exportPdfExcel: "Fitar da PDF + Excel", taxReceipts: "Rasit haraji ta atomatik", prioritySupport: "Tallafi mai fifiko", adFree: "Babu talla" },
  yo: { groupsUnl: "Ẹgbẹ́ àìlópin", groupsCount: "Tó {n} ẹgbẹ́", membersUnl: "Ọmọ ẹgbẹ́ àìlópin", membersCount: "Ọmọ {n} ní ẹgbẹ́", ocrUnl: "Ìṣe AI àìlópin", ocrCount: "Ìṣe AI {n} / oṣù", whatsappBot: "Bot WhatsApp / SMS", multiCurrency: "Owó ọ̀pọ̀lọpọ̀ pẹ̀lú FX laaye", debtSwap: "Pàṣípààrọ̀ àwọn gbèsè", exportPdfExcel: "Sí PDF + Excel", taxReceipts: "Ìwé orí àdáṣe", prioritySupport: "Àtìlẹ́yìn àkọ́kọ́", adFree: "Láì sí ìpolówó" },
  om: { groupsUnl: "Garee daangaa hin qabne", groupsCount: "Hanga garee {n}", membersUnl: "Miseensa daangaa hin qabne tokkoof tokko", membersCount: "Miseensa {n} tokkoof tokko", ocrUnl: "Skaaniin AI daangaa hin qabne", ocrCount: "Skaanii AI {n} / ji'a", whatsappBot: "Bot WhatsApp / SMS", multiCurrency: "Maallaqa hedduu kallattii FX", debtSwap: "Idaa walitti jijjiiruu", exportPdfExcel: "Baasuu PDF + Excel", taxReceipts: "Beessisa gibira otomaatii", prioritySupport: "Deeggarsa dursaa", adFree: "Beeksisa kan hin qabne" },
  ig: { groupsUnl: "Òtù enweghị oke", groupsCount: "Ruo {n} òtù", membersUnl: "Ndị òtù enweghị oke kwa òtù", membersCount: "Ndị òtù {n} kwa òtù", ocrUnl: "Nyocha AI enweghị oke", ocrCount: "Nyocha AI {n} / ọnwa", whatsappBot: "Bot WhatsApp / SMS", multiCurrency: "Mkpuchi ọtụtụ ụgwọ na FX ndụ", debtSwap: "Mgbanwe ụgwọ", exportPdfExcel: "Bupụ PDF + Excel", taxReceipts: "Akwụkwọ ụtụ akpaaka", prioritySupport: "Nkwado mbụ", adFree: "Enweghị mgbasa ozi" },
  ff: { groupsUnl: "Goolle keerol alaa", groupsCount: "Haa goolle {n}", membersUnl: "Mbeydaaji keerol alaa fii goolol", membersCount: "Mbeydaaji {n} fii goolol", ocrUnl: "Iwde AI keerol alaa", ocrCount: "Iwde AI {n} / lewru", whatsappBot: "Bot WhatsApp / SMS", multiCurrency: "Kaalisaaji keewɗi e FX", debtSwap: "Wattit ñamaale", exportPdfExcel: "Yaltinde PDF + Excel", taxReceipts: "Risuuji impo otomaatik", prioritySupport: "Wallin gadan", adFree: "Alaa publiyaa" },
  zu: { groupsUnl: "Amaqembu angenamkhawulo", groupsCount: "Kuze kufike kumaqembu angu-{n}", membersUnl: "Amalungu angenamkhawulo eqenjini ngalinye", membersCount: "Amalungu angu-{n} eqenjini ngalinye", ocrUnl: "Ukuskena kwe-AI okungenamkhawulo", ocrCount: "Ukuskena kwe-AI okungu-{n} / inyanga", whatsappBot: "I-bot ye-WhatsApp / SMS", multiCurrency: "Izimali eziningi ne-FX bukhoma", debtSwap: "Ukushintshanisa izikweletu", exportPdfExcel: "Thumela ku-PDF + Excel", taxReceipts: "Izimakhrofu zentela ezizenzakalelayo", prioritySupport: "Ukusekelwa okubalulekile", adFree: "Akukho izikhangiso" },
  ak: { groupsUnl: "Akuw a ɛnni anohyeto", groupsCount: "Kɔsi akuw {n}", membersUnl: "Akuwfo a ɛnni anohyeto kuw biara mu", membersCount: "Akuwfo {n} kuw biara mu", ocrUnl: "AI nhwehwɛmu a ɛnni anohyeto", ocrCount: "AI nhwehwɛmu {n} / bosome", whatsappBot: "WhatsApp / SMS bot", multiCurrency: "Sika ahodoɔ pii ne FX a ɛkɔ so", debtSwap: "Ɛka mu sesa", exportPdfExcel: "Yi PDF + Excel firi mu", taxReceipts: "Tow ho nkrataa a ɛyɛ ankasa", prioritySupport: "Mmoa a edi kan", adFree: "Dawubɔ nni" },
  "fr-cm": { groupsUnl: "Groupes illimités", groupsCount: "Jusqu'à {n} groupes", membersUnl: "Guys illimités par groupe", membersCount: "{n} guys par groupe", ocrUnl: "Scan IA illimité", ocrCount: "{n} scans / mois", whatsappBot: "Bot WhatsApp / SMS", multiCurrency: "Multi-devises FX live", debtSwap: "Swap dette", exportPdfExcel: "Export PDF + Excel", taxReceipts: "Reçus fiscaux auto", prioritySupport: "Support priorité", adFree: "Sans pub" },
  "fr-ci": { groupsUnl: "Groupes illimités", groupsCount: "Jusqu'à {n} groupes", membersUnl: "Gars illimités par groupe", membersCount: "{n} gars par groupe", ocrUnl: "Scan IA illimité", ocrCount: "{n} scans / mois", whatsappBot: "Bot WhatsApp / SMS", multiCurrency: "Multi-devises FX live", debtSwap: "Swap dette", exportPdfExcel: "Export PDF + Excel", taxReceipts: "Reçus fiscaux auto", prioritySupport: "Support enjaillé", adFree: "Sans pub" },
};

function bullets(lang: string) {
  return BULLET_LABELS[lang] ?? BULLET_LABELS.en!;
}

function limitsToBullets(limits: Record<string, any>, lang: string): string[] {
  const out: string[] = [];
  const L = bullets(lang);
  if (typeof limits.maxGroups === "number") {
    out.push(
      limits.maxGroups === -1
        ? L.groupsUnl
        : L.groupsCount.replace("{n}", String(limits.maxGroups)),
    );
  }
  if (typeof limits.maxMembersPerGroup === "number") {
    out.push(
      limits.maxMembersPerGroup === -1
        ? L.membersUnl
        : L.membersCount.replace("{n}", String(limits.maxMembersPerGroup)),
    );
  }
  if (typeof limits.ocrPerMonth === "number" && limits.ocrPerMonth !== 0) {
    out.push(
      limits.ocrPerMonth === -1
        ? L.ocrUnl
        : L.ocrCount.replace("{n}", String(limits.ocrPerMonth)),
    );
  }
  if (limits.whatsappBot) out.push(L.whatsappBot);
  if (limits.multiCurrency) out.push(L.multiCurrency);
  if (limits.debtSwap) out.push(L.debtSwap);
  if (limits.exportPdfExcel) out.push(L.exportPdfExcel);
  if (limits.taxReceipts) out.push(L.taxReceipts);
  if (limits.prioritySupport) out.push(L.prioritySupport);
  if (limits.adsEnabled === false) out.push(L.adFree);
  return out;
}

/**
 * Symbole d'affichage pour chaque devise. Pour les devises sans symbole
 * universel, on retombe sur le code ISO (ex: "1 200 XAF" au lieu de "1 200 F").
 */
const CURRENCY_SYMBOL: Record<string, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
  CHF: "CHF",
  CAD: "$CA",
  XAF: "FCFA",
  XOF: "FCFA",
  MAD: "DH",
  DZD: "DA",
  TND: "DT",
  NGN: "₦",
  KES: "Ksh",
  GHS: "GH₵",
  ZAR: "R",
  UGX: "USh",
  TZS: "TSh",
  CNY: "¥",
  INR: "₹",
  IDR: "Rp",
  PHP: "₱",
  VND: "₫",
};

/** Devises sans décimales (XAF/XOF/JPY/KRW etc.) — on stocke priceCents
 *  comme entier dans la même unité que la devise. Pour ces devises,
 *  priceCents = unités, pas centimes. Idem pour NGN au seed (priceCents
 *  en kobo = centiemes mais on affiche en NGN entiers ci-dessous). */
const ZERO_DECIMAL: Set<string> = new Set([
  "XAF",
  "XOF",
  "JPY",
  "KRW",
  "VND",
  "CLP",
  "PYG",
  "RWF",
  "UGX",
  "BIF",
  "DJF",
  "GNF",
  "KMF",
  "MGA",
  "MWK",
  "PGK",
  "TZS",
]);

function formatPrice(plan: Plan, lang: keyof typeof LABELS): string {
  const labels = LABELS[lang];
  if (plan.priceCents === 0) return labels.free;
  const cur = plan.currency || "EUR";
  const symbol = CURRENCY_SYMBOL[cur] ?? cur;
  // Si zero-decimal currency, priceCents EST déjà l'unité monétaire
  const value = ZERO_DECIMAL.has(cur)
    ? plan.priceCents
    : plan.priceCents / 100;
  const useCommaSeparator =
    lang === "fr" || lang === "es" || lang === "pt" || lang === "de";
  const formatted = ZERO_DECIMAL.has(cur)
    ? value.toLocaleString(useCommaSeparator ? "fr-FR" : "en-US", {
        maximumFractionDigits: 0,
      })
    : useCommaSeparator
      ? value.toFixed(value % 1 === 0 ? 0 : 2).replace(".", ",")
      : value.toFixed(value % 1 === 0 ? 0 : 2);
  // Symbole avant pour € $ £, après pour FCFA / DH / etc.
  const symbolBefore = ["€", "$", "£", "$CA", "¥", "₦", "₹", "₱", "₫"].includes(
    symbol,
  );
  return symbolBefore ? `${symbol}${formatted}` : `${formatted} ${symbol}`;
}

function formatYearlyPrice(plan: Plan, lang: keyof typeof LABELS): string {
  const cents = plan.priceCentsYearly;
  if (!cents) return "";
  const cur = plan.currency || "EUR";
  const symbol = CURRENCY_SYMBOL[cur] ?? cur;
  const value = ZERO_DECIMAL.has(cur) ? cents : cents / 100;
  const useCommaSeparator =
    lang === "fr" || lang === "es" || lang === "pt" || lang === "de";
  const formatted = ZERO_DECIMAL.has(cur)
    ? value.toLocaleString(useCommaSeparator ? "fr-FR" : "en-US", {
        maximumFractionDigits: 0,
      })
    : useCommaSeparator
      ? value.toFixed(value % 1 === 0 ? 0 : 2).replace(".", ",")
      : value.toFixed(value % 1 === 0 ? 0 : 2);
  const symbolBefore = ["€", "$", "£", "$CA", "¥", "₦", "₹", "₱", "₫"].includes(
    symbol,
  );
  return symbolBefore ? `${symbol}${formatted}` : `${formatted} ${symbol}`;
}

export function LivePricingSection({
  locale = "fr",
  accent = "#E8A33D",
  freeCtaHref = "/login",
}: Props) {
  // Coerce vers les locales supportées par les libellés statiques
  const lang = (
    locale && Object.keys(LABELS).includes(locale) ? locale : "fr"
  ) as keyof typeof LABELS;
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [regionName, setRegionName] = useState<string>("");
  const [isRegionalPricing, setIsRegionalPricing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Détection pays côté client + appel API avec ?country=XX. Si la
    // détection échoue (server-side render initial, navigator absent), on
    // passe undefined → le serveur fait sa propre détection via header CF.
    const country = detectCountry();
    api
      .listPlans(country ?? undefined)
      .then((res) => {
        if (cancelled) return;
        setPlans(
          res.plans
            .filter((p) => p.isActive)
            .sort((a, b) => a.displayOrder - b.displayOrder),
        );
        setRegionName(res.regionName);
        // On considère "tarifs régionaux" appliqués si AU MOINS un plan
        // a un prix tier-spécifique (sinon tous viennent du fallback EUR).
        setIsRegionalPricing(res.plans.some((p) => p.isRegionalPrice));
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setPlans([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const labels = LABELS[lang];

  if (loading) {
    return (
      <div
        style={{
          padding: "60px 24px",
          textAlign: "center",
          color: "#8A7B6B",
          fontSize: 14,
        }}
      >
        {labels.loading}
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <div
        style={{
          padding: "40px 24px",
          textAlign: "center",
          color: "#8A7B6B",
          fontSize: 14,
        }}
      >
        {labels.none}
      </div>
    );
  }

  // Le plan gratuit (FREE) est mis en highlight et reçoit un CTA actif vers
  // /login. Les autres plans sont affichés tels quels — le CTA renvoie vers
  // /dashboard/plans (page de comparaison + souscription) si l'utilisateur
  // est connecté, sinon /login pour s'inscrire d'abord.
  return (
    <div>
      {/* Disclaimer région — affiché si pricing PPA actif (ex: visiteur
          détecté en Afrique francophone, on lui montre des prix XAF). */}
      {isRegionalPricing && regionName && (
        <div
          style={{
            background:
              "linear-gradient(135deg, rgba(232,163,61,0.10), rgba(181,70,46,0.04))",
            border: "1px solid rgba(232,163,61,0.25)",
            borderRadius: 14,
            padding: "12px 16px",
            marginBottom: 18,
            fontSize: 13,
            color: "#E8D5B7",
            lineHeight: 1.5,
            textAlign: "center",
          }}
        >
          🌍 Tarifs adaptés à ta région —{" "}
          <strong style={{ color: "#E8A33D" }}>{regionName}</strong>. Le prix
          sera prélevé dans la devise locale au moment du paiement.
        </div>
      )}
      <div
        className="bmd-pricing-row"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${plans.length}, minmax(0, 1fr))`,
          gap: 14,
        }}
      >
        {/* V17 : layout pricing strict 1 ligne sur desktop, ce quel que soit
            le nombre de plans (2, 3, 4) ou la longueur du texte. Sur mobile
            ≤ 768px on passe en colonne pour la lisibilité. */}
        <style jsx>{`
          @media (max-width: 900px) {
            .bmd-pricing-row {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      {plans.map((plan) => {
        const isFree = plan.priceCents === 0;
        const bullets = limitsToBullets(plan.limits, lang);
        const yearly = plan.priceCentsYearly;
        const yearlyDiscount =
          yearly && plan.priceCents > 0
            ? Math.round((1 - yearly / (plan.priceCents * 12)) * 100)
            : 0;
        // V20 — traduction client-side du nom + description par locale
        const tr = translatePlan(plan, lang);
        return (
          <div
            key={plan.code}
            style={{
              background:
                "linear-gradient(180deg, rgba(42,34,68,0.4), rgba(22,17,30,0.6))",
              border: isFree
                ? `1.5px solid ${accent}`
                : "1px solid rgba(244,228,193,0.08)",
              borderRadius: 16,
              padding: "20px 18px",
              position: "relative",
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: isFree ? accent : "#8A7B6B",
                fontWeight: 700,
                marginBottom: 6,
                letterSpacing: 2,
                textTransform: "uppercase",
              }}
            >
              {tr.name}
            </div>
            <div
              style={{
                fontSize: isFree ? 36 : 28,
                fontFamily: "'Cormorant Garamond', serif",
                fontWeight: 700,
                marginBottom: 4,
                color: "#F4E4C1",
                lineHeight: 1.05,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {formatPrice(plan, lang)}
              {plan.priceCents > 0 && (
                <span
                  style={{
                    fontSize: 14,
                    color: "#8A7B6B",
                    fontWeight: 500,
                    marginLeft: 6,
                  }}
                >
                  {labels.perMonth}
                </span>
              )}
            </div>
            {yearly && yearly > 0 && (
              <div
                style={{
                  fontSize: 11,
                  color: accent,
                  marginBottom: 14,
                }}
              >
                {labels.yearlySave} {formatYearlyPrice(plan, lang)}
                {labels.perYear}
                {yearlyDiscount > 0 && ` · ${labels.economy} ${yearlyDiscount}%`}
              </div>
            )}
            {tr.description && (
              <p
                style={{
                  fontSize: 12.5,
                  color: "#A89A85",
                  margin: "10px 0 14px",
                  lineHeight: 1.5,
                }}
              >
                {tr.description}
              </p>
            )}
            {bullets.length > 0 && (
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: "0 0 20px",
                  fontSize: 13,
                  lineHeight: 1.9,
                  color: "#E8D5B7",
                }}
              >
                {bullets.map((f, i) => (
                  <li key={i}>
                    <span style={{ color: accent, marginRight: 6 }}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>
            )}
            <Link
              href={isFree ? freeCtaHref : "/dashboard/plans"}
              style={{
                display: "block",
                background: isFree
                  ? `linear-gradient(135deg, ${accent}, #B5462E)`
                  : "rgba(255,255,255,0.05)",
                color: isFree ? "#16111E" : "#E8D5B7",
                padding: "14px",
                borderRadius: 10,
                textDecoration: "none",
                textAlign: "center",
                fontWeight: 700,
                minHeight: 48,
                border: isFree
                  ? "none"
                  : "1px solid rgba(244,228,193,0.12)",
              }}
            >
              {isFree ? labels.signup : `${tr.name} →`}
            </Link>
          </div>
        );
      })}
      </div>
    </div>
  );
}
