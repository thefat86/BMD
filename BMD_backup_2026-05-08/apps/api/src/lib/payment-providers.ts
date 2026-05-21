/**
 * Abstraction des providers de paiement (spec §5).
 *
 * Stratégie : interface unifiée `PaymentProvider` que chaque intégration
 * concrète (Lydia, Wave, Wero, M-Pesa…) implémente. Les routes settlements
 * appellent `dispatchPayment(provider, amount, ...)` qui route vers la bonne
 * implémentation.
 *
 * Aujourd'hui : tous les providers sont en mode "deep_link_only" :
 *   ils retournent une URL pré-remplie que l'utilisateur clique pour ouvrir
 *   l'app du provider. Pas de webhook de confirmation côté BMD —
 *   l'utilisateur revient et clique « j'ai payé » manuellement.
 *
 * Quand un partenariat sera signé avec un provider :
 *   on remplace la méthode `initiate()` par un vrai appel API + on enregistre
 *   un webhook `/webhooks/payments/<provider>` qui reçoit la confirmation.
 *
 * Pas de dépendance externe — uniquement l'infrastructure logique.
 */

export type PaymentProviderId =
  | "lydia"
  | "wave"
  | "wero"
  | "wise"
  | "revolut"
  | "paypal"
  | "orange_money"
  | "mtn_momo"
  | "moov_money"
  | "airtel_money"
  | "mpesa"
  | "flutterwave"
  | "paystack"
  | "opay"
  | "telebirr"
  | "instapay"
  | "wizall"
  | "bunq"
  | "twint"
  | "interac"
  | "payid"
  | "faster_payments"
  | "alipay"
  | "wechat_pay"
  | "bank_transfer"
  | "cash";

export interface PaymentProviderInfo {
  id: PaymentProviderId;
  /// Nom commercial affiché à l'utilisateur
  name: string;
  /// Émoji pour identification visuelle rapide
  emoji: string;
  /// Régions où ce provider est pertinent (codes ISO 3166)
  regions: string[];
  /// Devises supportées (ISO 4217). [] = toutes
  currencies: string[];
  /// Mode actuel : "deep_link" (lien à cliquer) | "api" (intégration native)
  mode: "deep_link" | "api" | "manual";
  /// URL d'aide / documentation officielle
  docUrl?: string;
}

export interface InitiatePaymentInput {
  fromUserId: string;
  toUserId: string;
  amount: string; // décimal en string
  currency: string;
  /// Référence libre pour identifier le règlement (ex: settlementId)
  reference: string;
  /// Numéro de téléphone du destinataire (E.164) — pour Mobile Money
  toPhone?: string;
  /// IBAN du destinataire — pour SEPA / Wero
  toIban?: string;
  /// Email du destinataire — pour PayPal
  toEmail?: string;
  /// Texte explicatif (qui rembourse quoi)
  memo?: string;
}

export interface InitiatePaymentResult {
  provider: PaymentProviderId;
  /// URL à ouvrir (mobile : deep link, desktop : page web du provider)
  url?: string;
  /// QR code à afficher (data URL ou texte à encoder)
  qrPayload?: string;
  /// ID interne BMD pour le suivi
  reference: string;
  /// Mode de finalisation
  mode: "deep_link" | "api" | "manual";
  /// Instruction texte pour l'utilisateur (ex: "Saisis 'BMD-abc' comme libellé")
  instruction?: string;
}

// ============================================================
// Catalogue (spec §5)
// ============================================================
export const PAYMENT_PROVIDERS: PaymentProviderInfo[] = [
  // === Mobile Money Afrique ===
  {
    id: "orange_money",
    name: "Orange Money",
    emoji: "🟠",
    regions: ["CM", "CI", "SN", "ML", "BF", "MG"],
    currencies: ["XAF", "XOF"],
    mode: "deep_link",
    docUrl: "https://developer.orange.com/apis/om-webpay",
  },
  {
    id: "mtn_momo",
    name: "MTN MoMo",
    emoji: "🟡",
    regions: ["CM", "GH", "UG", "CD", "CI"],
    currencies: ["XAF", "GHS", "UGX", "CDF", "XOF"],
    mode: "deep_link",
    docUrl: "https://momodeveloper.mtn.com",
  },
  {
    id: "wave",
    name: "Wave",
    emoji: "🌊",
    regions: ["SN", "CI", "ML"],
    currencies: ["XOF"],
    mode: "deep_link",
    docUrl: "https://docs.wave.com",
  },
  {
    id: "mpesa",
    name: "M-Pesa",
    emoji: "📱",
    regions: ["KE", "TZ", "CD"],
    currencies: ["KES", "TZS", "CDF"],
    mode: "deep_link",
    docUrl: "https://developer.safaricom.co.ke",
  },
  {
    id: "moov_money",
    name: "Moov Money",
    emoji: "🟢",
    regions: ["BJ", "TG", "BF", "NE", "CI"],
    currencies: ["XOF"],
    mode: "deep_link",
    docUrl: "https://moov-africa.com",
  },
  {
    id: "airtel_money",
    name: "Airtel Money",
    emoji: "🔴",
    regions: ["UG", "TZ", "MG", "MW", "ZM", "RW"],
    currencies: ["UGX", "TZS", "RWF"],
    mode: "deep_link",
    docUrl: "https://developers.airtel.africa",
  },
  {
    id: "flutterwave",
    name: "Flutterwave",
    emoji: "🦋",
    regions: ["NG", "GH", "KE", "ZA", "UG", "TZ"],
    currencies: ["NGN", "GHS", "KES", "ZAR", "UGX", "TZS", "USD"],
    mode: "deep_link",
    docUrl: "https://developer.flutterwave.com",
  },
  {
    id: "paystack",
    name: "Paystack",
    emoji: "💳",
    regions: ["NG", "GH", "ZA"],
    currencies: ["NGN", "GHS", "ZAR"],
    mode: "deep_link",
    docUrl: "https://paystack.com/docs",
  },
  {
    id: "opay",
    name: "Opay",
    emoji: "🇳🇬",
    regions: ["NG"],
    currencies: ["NGN"],
    mode: "deep_link",
    docUrl: "https://documentation.opaycheckout.com",
  },
  {
    id: "telebirr",
    name: "TeleBirr",
    emoji: "🇪🇹",
    regions: ["ET"],
    currencies: ["ETB"],
    mode: "deep_link",
    docUrl: "https://developer.ethiotelecom.et",
  },
  {
    id: "instapay",
    name: "InstaPay",
    emoji: "🇪🇬",
    regions: ["EG"],
    currencies: ["EGP"],
    mode: "manual",
    docUrl: "https://www.cbe.org.eg/en/payment-systems-instapay",
  },
  {
    id: "wizall",
    name: "Wizall Money",
    emoji: "💼",
    regions: ["SN", "CI", "BF"],
    currencies: ["XOF"],
    mode: "deep_link",
    docUrl: "https://wizall.com",
  },
  // === Europe ===
  {
    id: "lydia",
    name: "Lydia",
    emoji: "💙",
    regions: ["FR"],
    currencies: ["EUR"],
    mode: "deep_link",
    docUrl: "https://homologation.lydia-app.com/doc/api",
  },
  {
    id: "wero",
    name: "Wero (SEPA Instant)",
    emoji: "💶",
    regions: ["FR", "DE", "BE", "NL", "LU"],
    currencies: ["EUR"],
    mode: "manual",
    docUrl: "https://www.wero-wallet.eu",
  },
  {
    id: "wise",
    name: "Wise",
    emoji: "🌍",
    regions: [],
    currencies: [],
    mode: "deep_link",
    docUrl: "https://wise.com/help/articles/2929870/how-can-i-create-a-payment-link",
  },
  {
    id: "revolut",
    name: "Revolut",
    emoji: "🟣",
    regions: [],
    currencies: [],
    mode: "deep_link",
  },
  {
    id: "paypal",
    name: "PayPal",
    emoji: "🅿️",
    regions: [],
    currencies: [],
    mode: "deep_link",
    docUrl: "https://developer.paypal.com",
  },
  {
    id: "twint",
    name: "TWINT",
    emoji: "🇨🇭",
    regions: ["CH"],
    currencies: ["CHF"],
    mode: "deep_link",
  },
  {
    id: "interac",
    name: "Interac e-Transfer",
    emoji: "🇨🇦",
    regions: ["CA"],
    currencies: ["CAD"],
    mode: "manual",
  },
  {
    id: "bunq",
    name: "Bunq",
    emoji: "🌈",
    regions: ["NL", "DE", "FR", "BE", "ES", "IT", "AT", "IE"],
    currencies: ["EUR"],
    mode: "manual",
    docUrl: "https://doc.bunq.com",
  },
  {
    id: "payid",
    name: "PayID / OSKO",
    emoji: "🇦🇺",
    regions: ["AU"],
    currencies: ["AUD"],
    mode: "manual",
    docUrl: "https://payid.com.au",
  },
  {
    id: "faster_payments",
    name: "Faster Payments",
    emoji: "🇬🇧",
    regions: ["GB"],
    currencies: ["GBP"],
    mode: "manual",
    docUrl: "https://www.fasterpayments.org.uk",
  },
  {
    id: "alipay",
    name: "Alipay",
    emoji: "🇨🇳",
    regions: ["CN", "HK", "SG", "MO"],
    currencies: ["CNY", "USD", "HKD", "SGD"],
    mode: "deep_link",
    docUrl: "https://global.alipay.com/docs",
  },
  {
    id: "wechat_pay",
    name: "WeChat Pay",
    emoji: "💬",
    regions: ["CN", "HK", "SG", "MO"],
    currencies: ["CNY", "USD", "HKD", "SGD"],
    mode: "deep_link",
    docUrl: "https://pay.weixin.qq.com/index.php/public/wechatpay",
  },
  // === Universels ===
  {
    id: "bank_transfer",
    name: "Virement bancaire",
    emoji: "🏦",
    regions: [],
    currencies: [],
    mode: "manual",
  },
  {
    id: "cash",
    name: "Espèces",
    emoji: "💵",
    regions: [],
    currencies: [],
    mode: "manual",
  },
];

/**
 * Filtre les providers pertinents pour une devise donnée et/ou un pays.
 */
export function getRelevantProviders(opts: {
  currency?: string;
  region?: string;
}): PaymentProviderInfo[] {
  return PAYMENT_PROVIDERS.filter((p) => {
    if (opts.currency && p.currencies.length > 0) {
      if (!p.currencies.includes(opts.currency.toUpperCase())) return false;
    }
    if (opts.region && p.regions.length > 0) {
      if (!p.regions.includes(opts.region.toUpperCase())) return false;
    }
    return true;
  });
}

/**
 * Initie un paiement via le provider donné.
 * Pour l'instant, tous retournent un deep-link / instruction manuelle.
 * À remplacer par les vraies intégrations API quand les partenariats seront signés.
 */
export function initiatePayment(
  providerId: PaymentProviderId,
  input: InitiatePaymentInput,
): InitiatePaymentResult {
  const info = PAYMENT_PROVIDERS.find((p) => p.id === providerId);
  if (!info) {
    return {
      provider: providerId,
      reference: input.reference,
      mode: "manual",
      instruction: "Provider inconnu — utilise un autre moyen.",
    };
  }

  switch (providerId) {
    case "lydia":
      return {
        provider: providerId,
        reference: input.reference,
        mode: "deep_link",
        // Lydia a un schème de deep link "lydia://request" mais nécessite l'API
        url: input.toPhone
          ? `https://lydia-app.com/phone/${encodeURIComponent(input.toPhone)}?amount=${input.amount}&message=${encodeURIComponent(input.memo ?? "")}`
          : undefined,
        instruction: input.toPhone
          ? `Ouvre Lydia → envoie ${input.amount} ${input.currency} au ${input.toPhone}`
          : `Ouvre Lydia → envoie ${input.amount} ${input.currency}. Mentionne « ${input.reference} » comme commentaire.`,
      };

    case "wave":
      return {
        provider: providerId,
        reference: input.reference,
        mode: "deep_link",
        url: input.toPhone
          ? `https://pay.wave.com/m/${input.toPhone.replace("+", "")}`
          : undefined,
        instruction: input.toPhone
          ? `Ouvre Wave → tape le ${input.toPhone} → ${input.amount} ${input.currency}`
          : `Demande à ${"ton créancier"} son numéro Wave puis envoie ${input.amount} ${input.currency}.`,
      };

    case "orange_money":
    case "mtn_momo":
      return {
        provider: providerId,
        reference: input.reference,
        mode: "deep_link",
        instruction: input.toPhone
          ? `Compose le code USSD de ${info.name} et envoie ${input.amount} ${input.currency} au ${input.toPhone}`
          : `Demande son numéro ${info.name}, puis envoie ${input.amount} ${input.currency}.`,
      };

    case "mpesa":
      return {
        provider: providerId,
        reference: input.reference,
        mode: "deep_link",
        instruction: `Ouvre M-Pesa → Send Money → ${input.toPhone ?? "demande le numéro"} → ${input.amount} ${input.currency}`,
      };

    case "wero":
      return {
        provider: providerId,
        reference: input.reference,
        mode: "manual",
        instruction: input.toPhone
          ? `Ouvre ton appli bancaire → Wero → envoie ${input.amount} EUR au ${input.toPhone}`
          : `Ouvre ton appli bancaire → Wero → envoie ${input.amount} EUR. Référence : ${input.reference}`,
      };

    case "wise":
      return {
        provider: providerId,
        reference: input.reference,
        mode: "deep_link",
        url: input.toEmail
          ? `https://wise.com/pay/me/${encodeURIComponent(input.toEmail)}/${input.amount}${input.currency.toUpperCase()}`
          : undefined,
        instruction: `Wise → Send → ${input.amount} ${input.currency} à ${input.toEmail ?? "ton créancier"}`,
      };

    case "paypal":
      return {
        provider: providerId,
        reference: input.reference,
        mode: "deep_link",
        url: input.toEmail
          ? `https://www.paypal.com/paypalme/${encodeURIComponent(input.toEmail)}/${input.amount}${input.currency.toUpperCase()}`
          : undefined,
        instruction: `PayPal → ${input.amount} ${input.currency} à ${input.toEmail ?? "l'email de ton créancier"}`,
      };

    case "bank_transfer":
      return {
        provider: providerId,
        reference: input.reference,
        mode: "manual",
        instruction: input.toIban
          ? `Virement SEPA vers ${input.toIban} — montant ${input.amount} ${input.currency}, libellé « ${input.reference} »`
          : `Demande son IBAN, puis fais un virement de ${input.amount} ${input.currency} avec le libellé « ${input.reference} »`,
      };

    case "cash":
      return {
        provider: providerId,
        reference: input.reference,
        mode: "manual",
        instruction: `Remets ${input.amount} ${input.currency} en espèces. Demande à l'autre partie de confirmer dans BMD.`,
      };

    default:
      return {
        provider: providerId,
        reference: input.reference,
        mode: "manual",
        instruction: `Utilise ${info.name} pour envoyer ${input.amount} ${input.currency}, puis confirme ici.`,
      };
  }
}
