import { describe, it, expect } from "vitest";
import {
  EXPENSE_CATEGORY_VALUES,
  EXPENSE_CATEGORY_KEYWORDS,
  normalizeExpenseCategory,
  normalizeExpenseCategoryOrAutres,
} from "@bmd/shared-types";

/**
 * V83 · Source unique des 6 catégories canoniques BMD.
 *
 * Ces tests verrouillent le contrat de `normalizeExpenseCategory()` :
 *  - Les 6 valeurs canoniques sont stables (un renommage casse l'app).
 *  - Les alias usuels (EN, titre case, anciens labels OCR pré-V83)
 *    sont mappés vers les valeurs canoniques.
 *  - Le helper tolère null/undefined/garbage sans throw.
 *
 * Référence : packages/shared-types/src/index.ts (section V83 catégories).
 */

describe("V83 · @bmd/shared-types · catégories de dépense", () => {
  describe("constantes", () => {
    it("expose exactement 6 valeurs canoniques", () => {
      expect(EXPENSE_CATEGORY_VALUES).toEqual([
        "resto",
        "courses",
        "transport",
        "logement",
        "loisirs",
        "autres",
      ]);
      expect(EXPENSE_CATEGORY_VALUES.length).toBe(6);
    });

    it("EXPENSE_CATEGORY_KEYWORDS couvre les 6 catégories", () => {
      for (const cat of EXPENSE_CATEGORY_VALUES) {
        expect(EXPENSE_CATEGORY_KEYWORDS[cat]).toBeDefined();
      }
    });

    it("'autres' n'a pas de keywords positifs (bucket fallback)", () => {
      expect(EXPENSE_CATEGORY_KEYWORDS.autres).toEqual([]);
    });
  });

  describe("normalizeExpenseCategory · match canonique direct", () => {
    it("renvoie la valeur si déjà canonique (lowercase)", () => {
      for (const cat of EXPENSE_CATEGORY_VALUES) {
        expect(normalizeExpenseCategory(cat)).toBe(cat);
      }
    });

    it("trim + lowercase tolérés", () => {
      expect(normalizeExpenseCategory("  RESTO  ")).toBe("resto");
      expect(normalizeExpenseCategory("Courses")).toBe("courses");
      expect(normalizeExpenseCategory("TRANSPORT")).toBe("transport");
    });
  });

  describe("normalizeExpenseCategory · alias usuels", () => {
    it("anciens labels OCR titre case (pré-V83)", () => {
      // Avant V83, le receipt-parser sortait "Restaurant" et "Voyage".
      // Le helper doit normaliser ces legacy sans casser les anciennes données.
      expect(normalizeExpenseCategory("Restaurant")).toBe("resto");
      expect(normalizeExpenseCategory("restaurants")).toBe("resto");
      expect(normalizeExpenseCategory("Voyage")).toBe("loisirs");
      expect(normalizeExpenseCategory("voyages")).toBe("loisirs");
    });

    it("alias anglais courants", () => {
      expect(normalizeExpenseCategory("food")).toBe("resto");
      expect(normalizeExpenseCategory("meal")).toBe("resto");
      expect(normalizeExpenseCategory("groceries")).toBe("courses");
      expect(normalizeExpenseCategory("shopping")).toBe("courses");
      expect(normalizeExpenseCategory("travel")).toBe("loisirs");
      expect(normalizeExpenseCategory("hotel")).toBe("loisirs");
      expect(normalizeExpenseCategory("rent")).toBe("logement");
      expect(normalizeExpenseCategory("housing")).toBe("logement");
      expect(normalizeExpenseCategory("utilities")).toBe("logement");
      expect(normalizeExpenseCategory("other")).toBe("autres");
      expect(normalizeExpenseCategory("misc")).toBe("autres");
    });

    it("variantes uncategorized → autres", () => {
      expect(normalizeExpenseCategory("uncategorized")).toBe("autres");
      expect(normalizeExpenseCategory("sans-categorie")).toBe("autres");
      expect(normalizeExpenseCategory("sans catégorie")).toBe("autres");
    });
  });

  describe("normalizeExpenseCategory · match par contains keywords", () => {
    it("un libellé long contenant un keyword est rattrapé", () => {
      // Cas réel : Mindee renvoie parfois "Carrefour Market 75011" ou
      // "Restaurant chinois — Le Bambou". Le helper doit faire un
      // includes sur EXPENSE_CATEGORY_KEYWORDS pour les rattraper.
      expect(normalizeExpenseCategory("Carrefour Market Paris")).toBe("courses");
      expect(normalizeExpenseCategory("Le Bambou - restaurant chinois")).toBe(
        "resto",
      );
      expect(normalizeExpenseCategory("Uber trip Paris")).toBe("transport");
      expect(normalizeExpenseCategory("EDF facture mai 2026")).toBe("logement");
    });

    it("ne matche jamais 'autres' par keyword (les keywords sont vides)", () => {
      expect(normalizeExpenseCategory("quelque chose bizarre")).toBeNull();
    });
  });

  describe("normalizeExpenseCategory · entrées invalides", () => {
    it("renvoie null pour null/undefined/empty/whitespace", () => {
      expect(normalizeExpenseCategory(null)).toBeNull();
      expect(normalizeExpenseCategory(undefined)).toBeNull();
      expect(normalizeExpenseCategory("")).toBeNull();
      expect(normalizeExpenseCategory("   ")).toBeNull();
    });

    it("renvoie null pour garbage sans keyword", () => {
      expect(normalizeExpenseCategory("xyzqwerty")).toBeNull();
      expect(normalizeExpenseCategory("123")).toBeNull();
    });
  });

  describe("normalizeExpenseCategoryOrAutres · variante stricte", () => {
    it("renvoie 'autres' au lieu de null", () => {
      expect(normalizeExpenseCategoryOrAutres(null)).toBe("autres");
      expect(normalizeExpenseCategoryOrAutres(undefined)).toBe("autres");
      expect(normalizeExpenseCategoryOrAutres("")).toBe("autres");
      expect(normalizeExpenseCategoryOrAutres("xyzqwerty")).toBe("autres");
    });

    it("préserve les valeurs canoniques", () => {
      expect(normalizeExpenseCategoryOrAutres("resto")).toBe("resto");
      expect(normalizeExpenseCategoryOrAutres("Restaurant")).toBe("resto");
    });
  });
});
