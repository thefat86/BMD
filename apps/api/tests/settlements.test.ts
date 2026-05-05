import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Decimal from "decimal.js";
import {
  getApp,
  quickSignup,
  startOtpCapture,
  stopOtpCapture,
} from "./helpers.js";
import { simplify } from "../src/modules/settlements/balance.service.js";

describe("M07 · Soldes · algo de simplification (pure logic)", () => {
  it("T40 · simplify · 3 dettes croisées → 2 transactions", () => {
    // A doit 50 à B, B doit 30 à C, C doit 20 à A
    // Net : A = -50 + 20 = -30 · B = +50 - 30 = +20 · C = +30 - 20 = +10
    const balances = [
      { userId: "a", displayName: "A", net: new Decimal("-30") },
      { userId: "b", displayName: "B", net: new Decimal("20") },
      { userId: "c", displayName: "C", net: new Decimal("10") },
    ];
    const out = simplify(balances, "EUR");
    expect(out).toHaveLength(2);
    // Plus gros débiteur (A=30) paie au plus gros créditeur (B=20) : 20€
    expect(out[0]).toMatchObject({
      fromUserId: "a",
      toUserId: "b",
      amount: new Decimal("20"),
    });
    // Reste : A doit 10 à C
    expect(out[1]).toMatchObject({
      fromUserId: "a",
      toUserId: "c",
      amount: new Decimal("10"),
    });
  });

  it("T41 · simplify · soldes équilibrés → 0 transaction", () => {
    const balances = [
      { userId: "a", displayName: "A", net: new Decimal("0") },
      { userId: "b", displayName: "B", net: new Decimal("0") },
    ];
    expect(simplify(balances, "EUR")).toHaveLength(0);
  });

  it("T42 · simplify · 1 débiteur, 1 créditeur → 1 transaction", () => {
    const balances = [
      { userId: "a", displayName: "A", net: new Decimal("-50") },
      { userId: "b", displayName: "B", net: new Decimal("50") },
    ];
    const out = simplify(balances, "EUR");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      fromUserId: "a",
      toUserId: "b",
      amount: new Decimal("50"),
    });
  });

  it("T43 · simplify · cas complexe à 5 personnes", () => {
    // A: -100, B: -50, C: +30, D: +70, E: +50
    // Total débit = 150 = total crédit ✓
    const balances = [
      { userId: "a", displayName: "A", net: new Decimal("-100") },
      { userId: "b", displayName: "B", net: new Decimal("-50") },
      { userId: "c", displayName: "C", net: new Decimal("30") },
      { userId: "d", displayName: "D", net: new Decimal("70") },
      { userId: "e", displayName: "E", net: new Decimal("50") },
    ];
    const out = simplify(balances, "EUR");

    // Au pire 4 transactions (n-1), notre algo devrait en faire 4 ou moins
    expect(out.length).toBeLessThanOrEqual(4);

    // Vérifier que tous les soldes sont bien apurés
    const after = new Map(balances.map((b) => [b.userId, b.net]));
    for (const t of out) {
      after.set(t.fromUserId, after.get(t.fromUserId)!.plus(t.amount));
      after.set(t.toUserId, after.get(t.toUserId)!.minus(t.amount));
    }
    for (const v of after.values()) {
      expect(v.abs().lessThanOrEqualTo(new Decimal("0.01"))).toBe(true);
    }
  });

  it("T44 · simplify · ignore micro-cents (< 0.01)", () => {
    const balances = [
      { userId: "a", displayName: "A", net: new Decimal("-0.005") },
      { userId: "b", displayName: "B", net: new Decimal("0.005") },
    ];
    expect(simplify(balances, "EUR")).toHaveLength(0);
  });
});

describe("M07 · Soldes · API end-to-end", () => {
  beforeEach(() => startOtpCapture());
  afterEach(() => stopOtpCapture());

  it("T45 · GET /groups/:id/balance après une dépense partagée", async () => {
    const app = await getApp();
    const aicha = await quickSignup(app, {
      displayName: "Aïcha",
      phone: "+33612370001",
    });

    const g = await app.inject({
      method: "POST",
      url: "/groups",
      headers: { authorization: `Bearer ${aicha.token}` },
      payload: { name: "Voyage Dakar", type: "TRAVEL" },
    });
    const gid = g.json().id;

    // Ajouter 3 amis
    const friendIds: string[] = [aicha.userId];
    for (let i = 0; i < 3; i++) {
      const r = await app.inject({
        method: "POST",
        url: `/groups/${gid}/members`,
        headers: { authorization: `Bearer ${aicha.token}` },
        payload: {
          contactType: "PHONE",
          contactValue: `+33612370${(200 + i).toString()}`,
        },
      });
      friendIds.push(r.json().user.id);
    }

    // Aïcha paye 60€ resto pour les 4
    await app.inject({
      method: "POST",
      url: `/groups/${gid}/expenses`,
      headers: { authorization: `Bearer ${aicha.token}` },
      payload: {
        description: "Resto",
        amount: "60.00",
        splitMode: "EQUAL",
        participants: friendIds.map((id) => ({ userId: id })),
      },
    });

    const balance = await app.inject({
      method: "GET",
      url: `/groups/${gid}/balance`,
      headers: { authorization: `Bearer ${aicha.token}` },
    });

    expect(balance.statusCode).toBe(200);
    const body = balance.json();
    expect(body.currency).toBe("EUR");

    const aichaBal = body.balances.find(
      (b: { userId: string }) => b.userId === aicha.userId,
    );
    // Aïcha a payé 60, doit 15 à elle-même → net = +45
    expect(parseFloat(aichaBal.net)).toBeCloseTo(45, 2);

    // 3 autres doivent 15 chacun
    const others = body.balances.filter(
      (b: { userId: string }) => b.userId !== aicha.userId,
    );
    for (const o of others) {
      expect(parseFloat(o.net)).toBeCloseTo(-15, 2);
    }

    // 3 suggestions : chaque ami → Aïcha 15€
    expect(body.suggestions).toHaveLength(3);
    for (const s of body.suggestions) {
      expect(s.toUserId).toBe(aicha.userId);
      expect(parseFloat(s.amount)).toBeCloseTo(15, 2);
    }
  });
});
