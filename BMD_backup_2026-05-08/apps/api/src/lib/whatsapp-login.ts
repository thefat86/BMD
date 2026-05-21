/**
 * WhatsApp Login via deep-link (spec §7.2 — "WhatsApp natif").
 *
 * Approche pragmatique : pas besoin de OAuth Meta complet (qui exige une
 * approbation business 2-4 semaines + WABA + Embedded Signup). On implémente
 * un flow plus simple :
 *
 *   1. Le user clique « Se connecter avec WhatsApp »
 *   2. Backend génère un code aléatoire 8 caractères + URL wa.me préformulée
 *      → `https://wa.me/{BMD_BUSINESS_NUMBER}?text=BMD-LOGIN-<code>`
 *   3. Le user clique → WhatsApp s'ouvre avec le message pré-rempli → il send
 *   4. Notre webhook WhatsApp reconnaît "BMD-LOGIN-<code>" et :
 *      - vérifie que le code existe et n'est pas expiré (5 min TTL)
 *      - lie le numéro de téléphone (msg.from) au code
 *      - marque le code comme "ready"
 *   5. Le frontend poll `/auth/whatsapp/check?code=<code>` toutes les 2s.
 *      Quand status === "ready" + phone connu → on émet un JWT pour ce user
 *      (ou on crée le user à la volée si numéro inconnu).
 *
 * Sécurité :
 *  - Code 8 caractères [A-Z0-9] = 36^8 ≈ 2.8 trillions, anti-brute-force
 *  - TTL 5 min strict
 *  - 1 seul check par code (consume after success)
 *  - Le user ne tape jamais son numéro — on le récupère depuis WhatsApp directement
 *
 * Stockage : In-memory Map pour MVP. À déplacer en Redis si multi-instance.
 */
import { randomBytes } from "node:crypto";

interface WhatsAppLoginCode {
  code: string;
  /** Numéro E.164 (avec +) lié après envoi du message — null tant que pas encore. */
  phoneE164: string | null;
  status: "pending" | "ready" | "consumed";
  createdAt: number;
  /** IP de la machine qui a démarré le flow (pour audit) */
  initiatorIp?: string;
}

const codes = new Map<string, WhatsAppLoginCode>();
const CODE_TTL_MS = 5 * 60 * 1000;

// GC opportuniste (toutes les 5 minutes, drop les codes expirés)
setInterval(() => {
  const now = Date.now();
  for (const [k, c] of codes) {
    if (now - c.createdAt > CODE_TTL_MS) codes.delete(k);
  }
}, 5 * 60 * 1000).unref();

export function generateLoginCode(opts: { initiatorIp?: string } = {}): {
  code: string;
  expiresAt: Date;
} {
  // 8 caractères [A-Z2-9] pour éviter confusion (pas de 0/O ni 1/I)
  const bytes = randomBytes(8);
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += alphabet[bytes[i] % alphabet.length];
  }
  codes.set(code, {
    code,
    phoneE164: null,
    status: "pending",
    createdAt: Date.now(),
    initiatorIp: opts.initiatorIp,
  });
  return {
    code,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  };
}

/**
 * Appelé par le webhook WhatsApp quand un message reçu commence par "BMD-LOGIN-<code>".
 * Lie le numéro de téléphone au code et le marque "ready".
 */
export function bindPhoneToLoginCode(input: {
  code: string;
  phoneE164: string;
}): { ok: true } | { ok: false; reason: string } {
  const c = codes.get(input.code);
  if (!c) return { ok: false, reason: "code_unknown_or_expired" };
  if (Date.now() - c.createdAt > CODE_TTL_MS) {
    codes.delete(input.code);
    return { ok: false, reason: "code_expired" };
  }
  if (c.status !== "pending") {
    return { ok: false, reason: "already_used" };
  }
  c.phoneE164 = input.phoneE164;
  c.status = "ready";
  return { ok: true };
}

/**
 * Appelé par le frontend en polling. Si status === "ready", on consume le
 * code (un seul check accepté) et on retourne le numéro pour que le caller
 * puisse créer/récupérer le user et émettre un JWT.
 */
export function consumeReadyCode(code: string):
  | { ready: true; phoneE164: string }
  | { ready: false } {
  const c = codes.get(code);
  if (!c) return { ready: false };
  if (Date.now() - c.createdAt > CODE_TTL_MS) {
    codes.delete(code);
    return { ready: false };
  }
  if (c.status === "ready" && c.phoneE164) {
    const phone = c.phoneE164;
    c.status = "consumed";
    codes.delete(code);
    return { ready: true, phoneE164: phone };
  }
  return { ready: false };
}
