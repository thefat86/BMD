#!/usr/bin/env node
// V58 — Clés i18n du sheet "Inviter amis".
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = resolve(__dirname, "..", "lib/i18n/locales");

const FR = {
  "invite.title": "Inviter des amis sur BMD",
  "invite.heroTitle": "Partage BMD avec tes proches",
  "invite.heroSubtitle":
    "Plus on est nombreux, plus c'est facile de gérer les dépenses partagées sans prise de tête.",
  "invite.messageLabel": "Message d'invitation",
  "invite.linkLabel": "Lien BMD",
  "invite.copyLink": "Copier le lien",
  "invite.copied": "Lien copié dans le presse-papier",
  "invite.shareCta": "Partager via…",
  "invite.disclaimer":
    "Le partage utilise WhatsApp, SMS, Mail ou n'importe quelle app installée sur ton téléphone.",
};
const EN = {
  "invite.title": "Invite friends to BMD",
  "invite.heroTitle": "Share BMD with your friends",
  "invite.heroSubtitle":
    "The more we are, the easier it gets to manage shared expenses without headaches.",
  "invite.messageLabel": "Invitation message",
  "invite.linkLabel": "BMD link",
  "invite.copyLink": "Copy link",
  "invite.copied": "Link copied to clipboard",
  "invite.shareCta": "Share via…",
  "invite.disclaimer":
    "Sharing uses WhatsApp, SMS, Mail or any app installed on your phone.",
};
const ES = {
  "invite.title": "Invitar amigos a BMD",
  "invite.heroTitle": "Comparte BMD con tus amigos",
  "invite.heroSubtitle":
    "Cuantos más somos, más fácil es gestionar los gastos compartidos sin líos.",
  "invite.messageLabel": "Mensaje de invitación",
  "invite.linkLabel": "Enlace BMD",
  "invite.copyLink": "Copiar enlace",
  "invite.copied": "Enlace copiado al portapapeles",
  "invite.shareCta": "Compartir vía…",
  "invite.disclaimer":
    "El uso compartido utiliza WhatsApp, SMS, correo o cualquier aplicación instalada.",
};
const PT = {
  "invite.title": "Convidar amigos para BMD",
  "invite.heroTitle": "Partilha o BMD com os teus amigos",
  "invite.heroSubtitle":
    "Quanto mais somos, mais fácil é gerir despesas partilhadas sem stress.",
  "invite.messageLabel": "Mensagem de convite",
  "invite.linkLabel": "Link BMD",
  "invite.copyLink": "Copiar link",
  "invite.copied": "Link copiado",
  "invite.shareCta": "Partilhar via…",
  "invite.disclaimer":
    "A partilha usa WhatsApp, SMS, Email ou qualquer app instalada.",
};
const AR = {
  "invite.title": "ادعُ أصدقاءك إلى BMD",
  "invite.heroTitle": "شارك BMD مع أصدقائك",
  "invite.heroSubtitle":
    "كلما زاد عددنا، أصبح من الأسهل إدارة المصاريف المشتركة دون متاعب.",
  "invite.messageLabel": "رسالة الدعوة",
  "invite.linkLabel": "رابط BMD",
  "invite.copyLink": "نسخ الرابط",
  "invite.copied": "تم نسخ الرابط",
  "invite.shareCta": "مشاركة عبر…",
  "invite.disclaimer":
    "تستخدم المشاركة WhatsApp أو SMS أو البريد أو أي تطبيق مثبت.",
};
const DE = {
  "invite.title": "Freunde zu BMD einladen",
  "invite.heroTitle": "Teile BMD mit deinen Freunden",
  "invite.heroSubtitle":
    "Je mehr wir sind, desto einfacher wird die Verwaltung gemeinsamer Ausgaben.",
  "invite.messageLabel": "Einladungstext",
  "invite.linkLabel": "BMD Link",
  "invite.copyLink": "Link kopieren",
  "invite.copied": "Link kopiert",
  "invite.shareCta": "Teilen über…",
  "invite.disclaimer":
    "Das Teilen nutzt WhatsApp, SMS, Mail oder eine andere installierte App.",
};
const IT = {
  "invite.title": "Invita amici su BMD",
  "invite.heroTitle": "Condividi BMD con i tuoi amici",
  "invite.heroSubtitle":
    "Più siamo, più è facile gestire le spese condivise senza stress.",
  "invite.messageLabel": "Messaggio d'invito",
  "invite.linkLabel": "Link BMD",
  "invite.copyLink": "Copia link",
  "invite.copied": "Link copiato",
  "invite.shareCta": "Condividi via…",
  "invite.disclaimer":
    "La condivisione usa WhatsApp, SMS, Mail o qualunque app installata.",
};

const ALL = {
  fr: FR,
  fr_ci: FR,
  fr_cm: FR,
  en: EN,
  es: ES,
  pt: PT,
  ar: AR,
  de: DE,
  it: IT,
  lb: EN,
  ru: EN,
  ja: EN,
  ko: EN,
  hi: EN,
  zh: EN,
  sw: EN,
  wo: EN,
  ln: EN,
  am: EN,
  ha: EN,
  yo: EN,
  om: EN,
  ig: EN,
  ff: EN,
  zu: EN,
  ak: EN,
  pcm: EN,
};

const ANCHOR = '"reminder.copied":';
let total = 0;
for (const file of readdirSync(LOCALES_DIR).filter((f) => f.endsWith(".ts"))) {
  const code = file.replace(/\.ts$/, "");
  const dict = ALL[code] ?? EN;
  const path = resolve(LOCALES_DIR, file);
  let src = readFileSync(path, "utf8");
  const idx = src.indexOf(ANCHOR);
  if (idx === -1) {
    console.log(`⤴  ${file} : ancre absente → skip`);
    continue;
  }
  if (src.includes('"invite.title":')) {
    console.log(`✓  ${file} : déjà présent`);
    continue;
  }
  const lineEnd = src.indexOf("\n", idx);
  const insertion =
    "\n" +
    Object.entries(dict)
      .map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
      .join("\n");
  src = src.slice(0, lineEnd) + insertion + src.slice(lineEnd);
  writeFileSync(path, src, "utf8");
  total += 1;
  console.log(`✅ ${file} : ${Object.keys(dict).length} clés ajoutées`);
}
console.log(`\n✨ ${total} locales mises à jour.`);
