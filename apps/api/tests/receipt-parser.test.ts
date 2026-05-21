import { describe, it, expect } from "vitest";
import {
  extractAmount,
  extractMerchant,
  extractDate,
  guessCategory,
  parseReceipt,
} from "../src/modules/ocr/receipt-parser.js";

/**
 * Tests du parser de tickets — pure logique, sans Postgres ni Tesseract.
 * Couvre les cas typiques rencontrés sur de vrais tickets de caisse.
 */

describe("M14 · receipt-parser · extractAmount", () => {
  it("T80 · trouve TOTAL TTC suivi du montant en euros", () => {
    const text = `
      MONOPRIX
      Ticket #12345
      Pain          1.20
      Lait          0.95
      TOTAL TTC     2.15 €
    `;
    const r = extractAmount(text);
    expect(r.amount).toBe("2.15");
    expect(r.currency).toBe("EUR");
    expect(r.confidence).toBeGreaterThan(0.8);
  });

  it("T81 · supporte la virgule décimale (format français)", () => {
    const text = `
      LE PETIT MBOA
      Poulet DG    18,00
      Bissap        3,00
      TOTAL        21,00 €
    `;
    const r = extractAmount(text);
    expect(r.amount).toBe("21.00");
  });

  it("T82 · détecte XAF / FCFA pour les tickets africains", () => {
    const text = `
      RESTAURANT YAOUNDE
      Plat du jour 5000
      Boisson      1500
      TOTAL        6500 FCFA
    `;
    const r = extractAmount(text);
    expect(r.currency).toBe("XAF");
  });

  it("T83 · ignore les codes postaux et numéros de ticket", () => {
    const text = `
      CARREFOUR
      Magasin 75011 Paris
      Ticket 99999
      Pain 1.20
      Total 1.20 €
    `;
    const r = extractAmount(text);
    expect(r.amount).toBe("1.20");
  });

  it("T84 · fallback sur le plus grand nombre si pas de TOTAL explicite", () => {
    const text = `
      Item A 5.50
      Item B 12.00
      Item C 3.20
    `;
    const r = extractAmount(text);
    expect(r.amount).toBe("12.00");
    expect(r.confidence).toBeLessThan(0.7); // moins fiable
  });

  it("T85 · retourne null si aucun nombre détectable", () => {
    const text = `Texte sans aucune valeur numérique cohérente`;
    const r = extractAmount(text);
    expect(r.amount).toBeNull();
  });

  it("T86 · supporte 'À PAYER' (variante)", () => {
    const text = `Hôtel La Pointe\nNuitée\nÀ PAYER : 89.00 €`;
    const r = extractAmount(text);
    expect(r.amount).toBe("89.00");
  });

  it("T87 · supporte les dirhams marocains (MAD)", () => {
    const text = `RIAD CASA\nCouscous\nTotal 250.00 MAD`;
    const r = extractAmount(text);
    expect(r.currency).toBe("MAD");
    expect(r.amount).toBe("250.00");
  });
});

describe("M14 · receipt-parser · extractMerchant", () => {
  it("T88 · prend la première ligne signifiante", () => {
    const text = `
      LE PETIT MBOA
      75011 Paris
      Tel: 01 23 45 67 89
      Pain 1.20
    `;
    expect(extractMerchant(text)).toBe("Le Petit Mboa");
  });

  it("T89 · ignore les lignes de bruit (numéros, dates)", () => {
    const text = `
      ====================
      12345
      14/05/2026
      MONOPRIX
      Pain 1.20
    `;
    expect(extractMerchant(text)).toBe("Monoprix");
  });

  it("T90 · retourne null si rien d'exploitable", () => {
    expect(extractMerchant("12345\n9999\n----")).toBeNull();
  });
});

describe("M14 · receipt-parser · extractDate", () => {
  it("T91 · parse DD/MM/YYYY", () => {
    const r = extractDate("Date: 14/05/2026");
    expect(r).not.toBeNull();
    expect(new Date(r!).getUTCFullYear()).toBe(2026);
    expect(new Date(r!).getUTCMonth()).toBe(4); // mai = index 4
    expect(new Date(r!).getUTCDate()).toBe(14);
  });

  it("T92 · parse DD/MM/YY (année courte)", () => {
    const r = extractDate("Le 03/06/26");
    expect(r).not.toBeNull();
    expect(new Date(r!).getUTCFullYear()).toBe(2026);
  });

  it("T93 · parse format ISO YYYY-MM-DD", () => {
    const r = extractDate("Le 2026-05-14 à 12h30");
    expect(r).not.toBeNull();
    expect(new Date(r!).getUTCDate()).toBe(14);
  });

  it("T94 · retourne null si pas de date détectable", () => {
    expect(extractDate("Pas de date ici")).toBeNull();
  });
});

describe("M14 · receipt-parser · guessCategory", () => {
  // V83 · Valeurs canoniques shared-types (lowercase) — avant V83 ces tests
  // attendaient "Restaurant" / "Courses" / "Transport" titre case.
  it("T95 · catégorise correctement un restaurant", () => {
    expect(guessCategory("Le Petit Mboa Restaurant", "")).toBe("resto");
  });

  it("T96 · catégorise un supermarché", () => {
    expect(guessCategory("MONOPRIX", "Pain Lait Beurre")).toBe("courses");
    expect(guessCategory(null, "Carrefour Market")).toBe("courses");
  });

  it("T97 · catégorise un transport", () => {
    expect(guessCategory("UBER Trip", "")).toBe("transport");
    expect(guessCategory("SNCF", "TGV Paris-Lyon")).toBe("transport");
  });

  it("T98 · catégorise une charge de logement", () => {
    expect(guessCategory("EDF facture", "")).toBe("logement");
  });

  it("T99 · retourne null si rien ne matche", () => {
    expect(guessCategory("Boutique inconnue", "produit XYZ")).toBeNull();
  });

  // V83 · Voyage/hôtel sont désormais classés en "loisirs" (dépense
  // partagée typique BMD : weekends, vacances entre amis).
  it("T95b · classe un voyage / hôtel sous loisirs", () => {
    expect(guessCategory("Airbnb Lisbonne", "")).toBe("loisirs");
    expect(guessCategory("Hôtel Royal", "")).toBe("loisirs");
    expect(guessCategory(null, "Ryanair Paris-Faro")).toBe("loisirs");
  });

  // V83 · "autres" n'est jamais retourné par guessCategory (pas de
  // keywords positifs — c'est un bucket de fallback côté UI).
  it("T95c · ne retourne JAMAIS 'autres' (fallback UI uniquement)", () => {
    expect(guessCategory("Random thing", "qwerty zzz")).toBeNull();
  });
});

describe("M14 · receipt-parser · pipeline complet (parseReceipt)", () => {
  it("T100 · ticket de restaurant complet", () => {
    const text = `
      LE PETIT MBOA
      75011 Paris
      Tel: 01 23 45 67 89
      Date: 04/05/2026

      Poulet DG       18.00
      Bissap maison    3.00
      Plantain frit    4.50
      Service          2.00

      TOTAL TTC      27.50 €

      Merci de votre visite
    `;
    const r = parseReceipt(text);
    expect(r.merchant).toBe("Le Petit Mboa");
    expect(r.amount).toBe("27.50");
    expect(r.currency).toBe("EUR");
    // V83 · valeur canonique shared-types (avant : "Restaurant" titre case)
    expect(r.category).toBe("resto");
    expect(r.date).not.toBeNull();
    expect(r.confidence).toBeGreaterThan(0.7);
  });

  it("T101 · ticket courses Monoprix", () => {
    const text = `
      MONOPRIX
      14/05/2026
      Pain          1.20
      Lait demi-écrémé 0.95
      Œufs x6       3.40
      TOTAL TTC     5.55 €
    `;
    const r = parseReceipt(text);
    expect(r.merchant).toBe("Monoprix");
    expect(r.amount).toBe("5.55");
    // V83 · valeur canonique shared-types
    expect(r.category).toBe("courses");
  });

  it("T102 · texte vide ou pourri retourne quand même un objet structuré", () => {
    const r = parseReceipt("XXXXXX YYYY ZZZZ");
    expect(r.amount).toBeNull();
    expect(r.merchant).toBe("Xxxxxx Yyyy Zzzz"); // accepte n'importe quoi de signifiant
    expect(r.confidence).toBeLessThanOrEqual(0.3);
  });
});
