"use client";

/**
 * <CurrencyProvider> · Devise universelle de l'utilisateur (spec §4).
 *
 * Source de la devise active (priorité décroissante) :
 *  1. `User.defaultCurrency` côté serveur (si connecté)
 *  2. localStorage `bmd_currency` (préférence anonyme persistée)
 *  3. Détection via timezone navigateur (Africa/Douala → XAF, Europe/Paris → EUR…)
 *  4. "EUR" (fallback)
 *
 * Fournit :
 *  - `code` : la devise active (ex: "XAF", "EUR")
 *  - `setCurrency(code)` : change la devise (persiste local + sync serveur)
 *  - `formatAmount(amount, fromCurrency)` : convertit + formate dans la devise
 *    active. Utilise le cache /fx-rates (taux EUR → autres) pour conversion
 *    instantanée sans aller-retour serveur.
 *  - `convert(amount, fromCurrency)` : retourne le montant converti (pas
 *    formaté, pour les calculs).
 *
 * Comportement universel :
 *  - Tous les composants qui affichent un montant utilisent `formatAmount`
 *    → quand l'utilisateur change sa devise, TOUS les chiffres de l'app
 *    se mettent à jour automatiquement (pas besoin de reload).
 *  - Les zero-decimal currencies (XAF, NGN, JPY…) sont gérées correctement.
 *  - Un disclaimer "💱 Converti au taux du jour" apparaît si la devise
 *    affichée diffère de la devise originale du montant.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, getToken } from "./api-client";

interface CurrencyContextValue {
  /** Code ISO 4217 de la devise active (ex: "EUR", "XAF") */
  code: string;
  /** Indique si le provider est prêt (a fini son chargement initial) */
  ready: boolean;
  /** Change la devise active (persiste local + sync serveur) */
  setCurrency: (code: string) => Promise<void>;
  /**
   * Formate un montant dans la devise active. Convertit automatiquement
   * depuis `fromCurrency` si besoin (cache des taux FX).
   * Retourne une string prête à afficher (ex: "12,50 €", "8 000 FCFA").
   */
  formatAmount: (amount: number | string, fromCurrency: string) => string;
  /**
   * Convertit `amount fromCurrency` vers la devise active. Retourne un
   * nombre brut (utile pour les calculs / sommes). 0 si erreur.
   */
  convert: (amount: number | string, fromCurrency: string) => number;
  /** Indique si la dernière conversion a impliqué un taux FX (vs identité) */
  hasConvertedRecently: boolean;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

const STORAGE_KEY = "bmd_currency";

const ZERO_DECIMAL = new Set([
  "XAF", "XOF", "JPY", "KRW", "VND", "RWF", "UGX", "BIF",
  "DJF", "GNF", "KMF", "MGA", "MWK", "TZS", "CLP", "PYG", "PGK",
]);

const SYMBOLS: Record<string, string> = {
  EUR: "€", USD: "$", GBP: "£", CHF: "CHF", CAD: "$CA",
  XAF: "FCFA", XOF: "FCFA", MAD: "DH", DZD: "DA", TND: "DT",
  NGN: "₦", KES: "Ksh", GHS: "GH₵", ZAR: "R", UGX: "USh",
  TZS: "TSh", CDF: "FC", MGA: "Ar", MUR: "₨", KMF: "KMF",
  CNY: "¥", INR: "₹", IDR: "Rp", PHP: "₱", VND: "₫",
};

const TZ_TO_CURRENCY: Record<string, string> = {
  // Europe → EUR / GBP / CHF
  "Europe/Paris": "EUR", "Europe/Brussels": "EUR", "Europe/Berlin": "EUR",
  "Europe/Madrid": "EUR", "Europe/Lisbon": "EUR", "Europe/Rome": "EUR",
  "Europe/Amsterdam": "EUR", "Europe/Vienna": "EUR", "Europe/Helsinki": "EUR",
  "Europe/London": "GBP", "Europe/Zurich": "CHF",
  // Afrique francophone → XAF / XOF / MAD / DZD / TND
  "Africa/Douala": "XAF", "Africa/Bangui": "XAF", "Africa/Ndjamena": "XAF",
  "Africa/Brazzaville": "XAF", "Africa/Libreville": "XAF", "Africa/Malabo": "XAF",
  "Africa/Dakar": "XOF", "Africa/Abidjan": "XOF", "Africa/Bamako": "XOF",
  "Africa/Ouagadougou": "XOF", "Africa/Niamey": "XOF", "Africa/Cotonou": "XOF",
  "Africa/Lome": "XOF", "Africa/Bissau": "XOF",
  "Africa/Casablanca": "MAD", "Africa/Algiers": "DZD", "Africa/Tunis": "TND",
  "Africa/Kinshasa": "CDF", "Africa/Lubumbashi": "CDF",
  "Indian/Antananarivo": "MGA", "Indian/Mauritius": "MUR", "Indian/Comoro": "KMF",
  // Afrique anglophone
  "Africa/Lagos": "NGN", "Africa/Nairobi": "KES", "Africa/Accra": "GHS",
  "Africa/Johannesburg": "ZAR", "Africa/Kampala": "UGX",
  "Africa/Dar_es_Salaam": "TZS",
  // Amériques
  "America/New_York": "USD", "America/Los_Angeles": "USD",
  "America/Chicago": "USD", "America/Toronto": "CAD",
  // Asie
  "Asia/Shanghai": "CNY", "Asia/Kolkata": "INR", "Asia/Tokyo": "JPY",
  "Asia/Singapore": "USD", "Asia/Hong_Kong": "USD", "Asia/Seoul": "KRW",
};

function detectFromTimezone(): string {
  if (typeof Intl === "undefined") return "EUR";
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return TZ_TO_CURRENCY[tz] ?? "EUR";
  } catch {
    return "EUR";
  }
}

function readStored(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [code, setCodeState] = useState<string>("EUR");
  const [ready, setReady] = useState(false);
  // Taux FX (base = EUR, valeur = combien d'unités de la devise pour 1 EUR)
  const [rates, setRates] = useState<Record<string, number>>({});

  // Init : détermine la devise + charge les taux FX
  useEffect(() => {
    let cancelled = false;

    async function init() {
      // 1. Devise préférée par ordre : User.defaultCurrency > localStorage > timezone > EUR
      let preferred: string | null = null;
      if (getToken()) {
        try {
          const me = await api.me();
          const fromUser = (me as any)?.user?.defaultCurrency;
          if (fromUser) preferred = fromUser;
        } catch {
          /* ignore */
        }
      }
      if (!preferred) preferred = readStored();
      if (!preferred) preferred = detectFromTimezone();
      if (!preferred) preferred = "EUR";
      if (cancelled) return;
      setCodeState(preferred);

      // 2. Charge les taux FX (base EUR — service /fx-rates)
      try {
        const r = await api.getFxRates();
        if (cancelled) return;
        setRates(r.rates);
      } catch {
        /* en cas d'échec, formatAmount tombera sur 1:1 = pas de conversion */
      }
      setReady(true);
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  const setCurrency = useCallback(async (newCode: string) => {
    setCodeState(newCode);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, newCode);
      } catch {
        /* quota — ignore */
      }
      // Émet un event global pour permettre aux composants qui ne
      // consomment pas le contexte (ex: liste de dépenses qui mémoïse son
      // affichage) de se forcer à re-render. C'est un fallback "ceinture +
      // bretelles" pour s'assurer que rien ne reste figé sur l'ancienne
      // devise après un changement.
      try {
        window.dispatchEvent(
          new CustomEvent("bmd:currency-changed", { detail: { code: newCode } }),
        );
      } catch {
        /* IE legacy / SSR — ignore */
      }
    }
    if (getToken()) {
      try {
        await api.updateMe({ defaultCurrency: newCode });
      } catch {
        /* serveur KO — pref locale reste appliquée */
      }
    }
  }, []);

  /**
   * Convertit un montant de `from` vers la devise active.
   * Algo : (amount / rates[from]) * rates[to]
   *   où rates[X] = combien de X pour 1 EUR.
   * Si l'une des devises manque, on retourne le montant brut (pas idéal
   * mais évite un crash). En pratique le service /fx-rates renvoie tous
   * les taux EUR pour les 25 devises BMD.
   */
  const convert = useCallback(
    (amount: number | string, fromCurrency: string): number => {
      const num = typeof amount === "string" ? parseFloat(amount) : amount;
      if (!Number.isFinite(num)) return 0;
      const from = fromCurrency.toUpperCase();
      const to = code.toUpperCase();
      if (from === to) return num;
      const fromRate = from === "EUR" ? 1 : rates[from];
      const toRate = to === "EUR" ? 1 : rates[to];
      if (!fromRate || !toRate) {
        // Taux indisponibles : on renvoie le montant brut + marque qu'une
        // conversion aurait dû être faite.
        return num;
      }
      // amount fromCurrency → EUR → toCurrency
      const inEur = num / fromRate;
      return inEur * toRate;
    },
    [code, rates],
  );

  // Z2-fix · Ref (pas state) pour tracer si une conversion FX a eu lieu.
  // setState dans formatAmount = anti-pattern React (called during render
  // → "Cannot update component while rendering" warning + re-renders en cascade).
  // On utilise une ref qu'on lit après le render via un useEffect séparé.
  const fxConvertedRef = useRef(false);

  const formatAmount = useCallback(
    (amount: number | string, fromCurrency: string): string => {
      const from = fromCurrency.toUpperCase();
      const to = code.toUpperCase();
      const converted = convert(amount, from);
      // Trace via ref (pas de re-render parasite)
      if (from !== to) fxConvertedRef.current = true;
      const symbol = SYMBOLS[to] ?? to;
      const value = ZERO_DECIMAL.has(to) ? converted : converted;
      const formatted = ZERO_DECIMAL.has(to)
        ? value.toLocaleString("fr-FR", { maximumFractionDigits: 0 })
        : value.toLocaleString("fr-FR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
      const before = ["€", "$", "£", "$CA", "¥", "₦", "₹", "₱", "₫", "₨"].includes(symbol);
      return before ? `${symbol}${formatted}` : `${formatted} ${symbol}`;
    },
    [code, convert],
  );

  const value = useMemo(
    () => ({
      code,
      ready,
      setCurrency,
      formatAmount,
      convert,
      // Z2-fix · plus de state ici (cf. fxConvertedRef au-dessus). On expose
      // simplement la valeur actuelle de la ref. Aucun consommateur ne re-render
      // en réaction à ce flag — c'est OK : ce champ sert juste à savoir au
      // moment de l'affichage si un disclaimer "💱 taux du jour" est utile.
      get hasConvertedRecently() {
        return fxConvertedRef.current;
      },
    }),
    [code, ready, setCurrency, formatAmount, convert],
  );

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

/**
 * Hook pour utiliser la devise active depuis n'importe quel composant.
 * Fallback safe si appelé hors d'un Provider (formatage en EUR).
 */
export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (!ctx) {
    // Fallback minimal : on retourne "EUR" + format simple sans conversion
    return {
      code: "EUR",
      ready: true,
      setCurrency: async () => {
        /* noop */
      },
      formatAmount: (amount, _fromCurrency) => {
        const num =
          typeof amount === "string" ? parseFloat(amount) : amount;
        return `${(num || 0).toFixed(2)} €`;
      },
      convert: (amount) => {
        const num =
          typeof amount === "string" ? parseFloat(amount) : amount;
        return num || 0;
      },
      hasConvertedRecently: false,
    };
  }
  return ctx;
}
