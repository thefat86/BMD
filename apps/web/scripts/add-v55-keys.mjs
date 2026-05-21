#!/usr/bin/env node
// V55 — Ajoute 5 nouvelles clés i18n dans les 27 locales.
// Anchor : insère après la clé existante "dashboard.referrals".
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = resolve(__dirname, "..", "lib/i18n/locales");

// Traductions natives par locale — pas de fallback FR (règle Fabrice).
// EN sert de fallback pour les locales que je ne maîtrise pas natively.
const T = {
  fr: {
    "dashboard.createGroup": "Créer groupe",
    "dashboard.settleDebts": "Régler dettes",
    "dashboard.inviteFriends": "Inviter amis",
    "dashboard.inviteShareText":
      "Hey ! Avec BMD on règle nos dépenses de groupe et tontines sans prise de tête. Essaie :",
    "dashboard.inviteCopied": "Lien copié dans le presse-papier !",
  },
  fr_ci: {
    "dashboard.createGroup": "Créer groupe",
    "dashboard.settleDebts": "Régler dettes",
    "dashboard.inviteFriends": "Inviter amis",
    "dashboard.inviteShareText":
      "Hey ! Avec BMD on règle nos dépenses et tontines sans soucis. Essaie :",
    "dashboard.inviteCopied": "Lien copié !",
  },
  fr_cm: {
    "dashboard.createGroup": "Créer groupe",
    "dashboard.settleDebts": "Régler dettes",
    "dashboard.inviteFriends": "Inviter amis",
    "dashboard.inviteShareText":
      "Hey ! Avec BMD on gère les dépenses du djo sans embrouille. Essaie :",
    "dashboard.inviteCopied": "Lien copié !",
  },
  en: {
    "dashboard.createGroup": "New group",
    "dashboard.settleDebts": "Settle debts",
    "dashboard.inviteFriends": "Invite friends",
    "dashboard.inviteShareText":
      "Hey! With BMD we handle group expenses and tontines hassle-free. Try it:",
    "dashboard.inviteCopied": "Link copied to clipboard!",
  },
  es: {
    "dashboard.createGroup": "Nuevo grupo",
    "dashboard.settleDebts": "Saldar deudas",
    "dashboard.inviteFriends": "Invitar amigos",
    "dashboard.inviteShareText":
      "¡Hey! Con BMD gestionamos los gastos del grupo y tontinas sin líos. Pruébalo:",
    "dashboard.inviteCopied": "¡Enlace copiado!",
  },
  pt: {
    "dashboard.createGroup": "Novo grupo",
    "dashboard.settleDebts": "Acertar contas",
    "dashboard.inviteFriends": "Convidar amigos",
    "dashboard.inviteShareText":
      "Olá! Com a BMD gerimos as despesas do grupo e tontinas sem complicações. Experimenta:",
    "dashboard.inviteCopied": "Link copiado!",
  },
  ar: {
    "dashboard.createGroup": "مجموعة جديدة",
    "dashboard.settleDebts": "تسوية الديون",
    "dashboard.inviteFriends": "دعوة الأصدقاء",
    "dashboard.inviteShareText":
      "مرحبًا! مع BMD ندير مصاريف المجموعة والتونتين بدون متاعب. جربه:",
    "dashboard.inviteCopied": "تم نسخ الرابط!",
  },
  de: {
    "dashboard.createGroup": "Neue Gruppe",
    "dashboard.settleDebts": "Schulden begleichen",
    "dashboard.inviteFriends": "Freunde einladen",
    "dashboard.inviteShareText":
      "Hey! Mit BMD verwalten wir Gruppenausgaben und Tontinen stressfrei. Probier's:",
    "dashboard.inviteCopied": "Link kopiert!",
  },
  it: {
    "dashboard.createGroup": "Nuovo gruppo",
    "dashboard.settleDebts": "Saldare debiti",
    "dashboard.inviteFriends": "Invita amici",
    "dashboard.inviteShareText":
      "Ehi! Con BMD gestiamo le spese di gruppo e tontine senza problemi. Provalo:",
    "dashboard.inviteCopied": "Link copiato!",
  },
  lb: {
    "dashboard.createGroup": "Nei Grupp",
    "dashboard.settleDebts": "Scholden bezuelen",
    "dashboard.inviteFriends": "Frënn invitéieren",
    "dashboard.inviteShareText":
      "Hey! Mat BMD verwalte mir Gruppausgaben an Tontinen ouni Stress. Probéier:",
    "dashboard.inviteCopied": "Link kopéiert!",
  },
  ru: {
    "dashboard.createGroup": "Новая группа",
    "dashboard.settleDebts": "Погасить долги",
    "dashboard.inviteFriends": "Пригласить друзей",
    "dashboard.inviteShareText":
      "Привет! С BMD мы управляем групповыми расходами и тонтинами без хлопот. Попробуй:",
    "dashboard.inviteCopied": "Ссылка скопирована!",
  },
  ja: {
    "dashboard.createGroup": "新しいグループ",
    "dashboard.settleDebts": "債務を清算",
    "dashboard.inviteFriends": "友達を招待",
    "dashboard.inviteShareText":
      "ねえ！BMDなら、グループの出費とトンチンを楽々管理。試してみて:",
    "dashboard.inviteCopied": "リンクをコピーしました!",
  },
  ko: {
    "dashboard.createGroup": "새 그룹",
    "dashboard.settleDebts": "빚 정산",
    "dashboard.inviteFriends": "친구 초대",
    "dashboard.inviteShareText":
      "안녕! BMD로 그룹 비용과 톤틴을 스트레스 없이 관리해. 한번 써봐:",
    "dashboard.inviteCopied": "링크가 복사되었습니다!",
  },
  hi: {
    "dashboard.createGroup": "नया समूह",
    "dashboard.settleDebts": "ऋण चुकाएँ",
    "dashboard.inviteFriends": "मित्रों को आमंत्रित करें",
    "dashboard.inviteShareText":
      "हे! BMD से हम समूह खर्च और तोंतीन को बिना झंझट संभालते हैं। इसे आज़माएँ:",
    "dashboard.inviteCopied": "लिंक कॉपी हो गया!",
  },
  zh: {
    "dashboard.createGroup": "新建群组",
    "dashboard.settleDebts": "结清债务",
    "dashboard.inviteFriends": "邀请好友",
    "dashboard.inviteShareText":
      "嘿！用BMD轻松管理团体开支和会钱。来试试：",
    "dashboard.inviteCopied": "链接已复制!",
  },
  sw: {
    "dashboard.createGroup": "Kikundi kipya",
    "dashboard.settleDebts": "Lipia madeni",
    "dashboard.inviteFriends": "Alika marafiki",
    "dashboard.inviteShareText":
      "Habari! Na BMD tunashughulikia gharama za kikundi na tontine bila usumbufu. Jaribu:",
    "dashboard.inviteCopied": "Kiungo kimenakiliwa!",
  },
  wo: {
    "dashboard.createGroup": "Kurel bu bees",
    "dashboard.settleDebts": "Faye bor",
    "dashboard.inviteFriends": "Wooy xarit",
    "dashboard.inviteShareText":
      "Salaam! Ak BMD ñoo jëfandikoo dépenses ak tontines bu metti. Jangal:",
    "dashboard.inviteCopied": "Link bi yeggal na!",
  },
  ln: {
    "dashboard.createGroup": "Etuluku ya sika",
    "dashboard.settleDebts": "Kofuta nyongo",
    "dashboard.inviteFriends": "Kobyanga baninga",
    "dashboard.inviteShareText":
      "Mbote! Na BMD tosalaka mbongo ya etuluku na tontines kozanga mpasi. Meka:",
    "dashboard.inviteCopied": "Lien ekomi kopié!",
  },
  am: {
    "dashboard.createGroup": "አዲስ ቡድን",
    "dashboard.settleDebts": "ዕዳዎችን ለመክፈል",
    "dashboard.inviteFriends": "ጓደኞችን ጋብዝ",
    "dashboard.inviteShareText":
      "ሰላም! በBMD የቡድን ወጪዎችን እና ቶንቲንን ያለ ጭንቀት እናስተዳድራለን። ሞክር:",
    "dashboard.inviteCopied": "አገናኝ ተቀዳ!",
  },
  ha: {
    "dashboard.createGroup": "Sabuwar ƙungiya",
    "dashboard.settleDebts": "Biya basussuka",
    "dashboard.inviteFriends": "Gayyaci abokai",
    "dashboard.inviteShareText":
      "Sannu! Da BMD muna sarrafa kuɗin ƙungiya da tontines ba tare da damuwa ba. Gwada:",
    "dashboard.inviteCopied": "An kwafa hanya!",
  },
  yo: {
    "dashboard.createGroup": "Ẹgbẹ́ tuntun",
    "dashboard.settleDebts": "San gbèsè",
    "dashboard.inviteFriends": "Pe àwọn ọ̀rẹ́",
    "dashboard.inviteShareText":
      "Pẹ̀lẹ́! Pẹlu BMD a ń ṣakoso ìnáwó ẹgbẹ́ àti tontines láìnídààmú. Gbiyànjú:",
    "dashboard.inviteCopied": "Ọna ti dakọ!",
  },
  om: {
    "dashboard.createGroup": "Garee haaraa",
    "dashboard.settleDebts": "Idaa kafali",
    "dashboard.inviteFriends": "Hiriyoota afeeri",
    "dashboard.inviteShareText":
      "Akkam! BMD waliin baasii garee fi tontine yaaddoo malee bulchina. Yaali:",
    "dashboard.inviteCopied": "Geessituun garagalfameera!",
  },
  ig: {
    "dashboard.createGroup": "Otu ọhụrụ",
    "dashboard.settleDebts": "Kwụọ ụgwọ",
    "dashboard.inviteFriends": "Kpọọ ndị enyi",
    "dashboard.inviteShareText":
      "Ndewo! Site na BMD anyị na-elekọta mmefu otu na tontines n'enweghị nsogbu. Nwaa ya:",
    "dashboard.inviteCopied": "Edebanyela njikọ!",
  },
  ff: {
    "dashboard.createGroup": "Goomu kesu",
    "dashboard.settleDebts": "Yo'be ñamaale",
    "dashboard.inviteFriends": "Noddu sehilaaɓe",
    "dashboard.inviteShareText":
      "Jam ! Hokkita BMD ko en yowani huɓɓe goomu e tontines walaa caɗeele. Etee:",
    "dashboard.inviteCopied": "Tigginirde nde fottiraama!",
  },
  zu: {
    "dashboard.createGroup": "Iqembu elisha",
    "dashboard.settleDebts": "Khokha izikweletu",
    "dashboard.inviteFriends": "Mema abangani",
    "dashboard.inviteShareText":
      "Sawubona! Nge-BMD silawula izindleko zeqembu kanye nama-tontines ngaphandle kwenkinga. Zama:",
    "dashboard.inviteCopied": "Isixhumanisi sikopishelwe!",
  },
  ak: {
    "dashboard.createGroup": "Kuw foforɔ",
    "dashboard.settleDebts": "Tua aka",
    "dashboard.inviteFriends": "To nsamufoɔ frɛ",
    "dashboard.inviteShareText":
      "Akwaaba! BMD mu yɛhwɛ kuw ho ka ne tontines a ɔhaw biara nni mu. Sɔ hwɛ:",
    "dashboard.inviteCopied": "Wɔakɔpe linki no!",
  },
  pcm: {
    "dashboard.createGroup": "New group",
    "dashboard.settleDebts": "Pay debt",
    "dashboard.inviteFriends": "Invite paddy",
    "dashboard.inviteShareText":
      "Hey! With BMD we dey handle group expenses and tontines wey no go give wahala. Try am:",
    "dashboard.inviteCopied": "Don copy link!",
  },
};

const ANCHOR_KEY = '"dashboard.referrals":';
let total = 0;
const files = readdirSync(LOCALES_DIR).filter((f) => f.endsWith(".ts"));
for (const file of files) {
  const code = file.replace(/\.ts$/, "");
  const dict = T[code];
  if (!dict) {
    console.warn(`⚠️  Pas de traduction pour ${code} — fallback EN`);
  }
  const useDict = dict ?? T.en;
  const path = resolve(LOCALES_DIR, file);
  let src = readFileSync(path, "utf8");
  const anchorIdx = src.indexOf(ANCHOR_KEY);
  if (anchorIdx === -1) {
    console.error(`❌ ${file} : ancre "dashboard.referrals" introuvable`);
    continue;
  }
  // Cherche la fin de la ligne après l'ancre
  const lineEnd = src.indexOf("\n", anchorIdx);
  if (lineEnd === -1) {
    console.error(`❌ ${file} : EOL après ancre introuvable`);
    continue;
  }
  // Skip si déjà présent (idempotence)
  if (src.includes('"dashboard.createGroup":')) {
    console.log(`✓  ${file} : déjà présent, skip`);
    continue;
  }
  const insertion =
    "\n" +
    Object.entries(useDict)
      .map(
        ([k, v]) =>
          `    ${JSON.stringify(k)}: ${JSON.stringify(v)},`,
      )
      .join("\n");
  src = src.slice(0, lineEnd) + insertion + src.slice(lineEnd);
  writeFileSync(path, src, "utf8");
  total += 1;
  console.log(`✅ ${file} : 5 clés ajoutées`);
}
console.log(`\n✨ ${total} locales mises à jour.`);
