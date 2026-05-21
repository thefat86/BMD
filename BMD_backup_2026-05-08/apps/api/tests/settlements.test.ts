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

describe("V26-1 · Settlements CONFIRMED affectent computeBalances", () => {
  beforeEach(() => startOtpCapture());
  afterEach(() => stopOtpCapture());

  it("V26-1A · Un Settlement CONFIRMED ramène le solde à zéro", async () => {
    const app = await getApp();
    // Setup : Karim paye 60€ pour 2 personnes (lui + Linda)
    const karim = await quickSignup({
      displayName: "Karim",
      phone: "+33612260100",
    });
    const g = await app.inject({
      method: "POST",
      url: "/groups",
      headers: { authorization: `Bearer ${karim.token}` },
      payload: { name: "V26 test", type: "GENERIC" },
    });
    const gid = g.json().id;
    const lindaRes = await app.inject({
      method: "POST",
      url: `/groups/${gid}/members`,
      headers: { authorization: `Bearer ${karim.token}` },
      payload: { contactType: "PHONE", contactValue: "+33612260101" },
    });
    const lindaId = lindaRes.json().user.id;

    // Karim paye 60€ partagé entre lui et Linda → Linda lui doit 30€
    await app.inject({
      method: "POST",
      url: `/groups/${gid}/expenses`,
      headers: { authorization: `Bearer ${karim.token}` },
      payload: {
        description: "Course",
        amount: "60.00",
        splitMode: "EQUAL",
        participants: [{ userId: karim.userId }, { userId: lindaId }],
      },
    });

    // Solde initial : Karim +30, Linda −30
    let balance = await app.inject({
      method: "GET",
      url: `/groups/${gid}/balance`,
      headers: { authorization: `Bearer ${karim.token}` },
    });
    let karimNet = parseFloat(
      balance
        .json()
        .balances.find((b: { userId: string }) => b.userId === karim.userId)
        .net,
    );
    expect(karimNet).toBeCloseTo(30, 2);

    // Linda crée un Settlement (PROPOSED) puis le débiteur déclare avoir payé.
    // Ici on simule directement la transition vers PAID puis CONFIRMED par Karim.
    const settlementRes = await app.inject({
      method: "POST",
      url: `/groups/${gid}/settlements`,
      headers: { authorization: `Bearer ${karim.token}` },
      payload: {
        fromUserId: lindaId,
        toUserId: karim.userId,
        amount: "30.00",
      },
    });
    const settlementId = settlementRes.json().id;

    // Force PROPOSED → PAID (normalement fait via /pay-confirm/:token)
    const { prisma } = await import("../src/lib/db.js");
    await prisma.settlement.update({
      where: { id: settlementId },
      data: { status: "PAID" },
    });

    // Karim confirme la réception → CONFIRMED
    const confirmRes = await app.inject({
      method: "POST",
      url: `/settlements/${settlementId}/confirm`,
      headers: { authorization: `Bearer ${karim.token}` },
    });
    expect(confirmRes.statusCode).toBe(200);

    // Solde après confirmation : tous deux à zéro (ou très proche)
    balance = await app.inject({
      method: "GET",
      url: `/groups/${gid}/balance`,
      headers: { authorization: `Bearer ${karim.token}` },
    });
    karimNet = parseFloat(
      balance
        .json()
        .balances.find((b: { userId: string }) => b.userId === karim.userId)
        .net,
    );
    const lindaNet = parseFloat(
      balance
        .json()
        .balances.find((b: { userId: string }) => b.userId === lindaId).net,
    );
    expect(karimNet).toBeCloseTo(0, 2);
    expect(lindaNet).toBeCloseTo(0, 2);
  });
});

describe("V26-2 · /me/balances/by-person · vue par personne", () => {
  beforeEach(() => startOtpCapture());
  afterEach(() => stopOtpCapture());

  it("V26-2A · Agrégation pair-à-pair sur 2 groupes partagés", async () => {
    const app = await getApp();
    const alice = await quickSignup({
      displayName: "Alice",
      phone: "+33612260200",
    });
    // Crée 2 groupes avec Bob dans les deux
    const bob = await quickSignup({
      displayName: "Bob",
      phone: "+33612260201",
    });

    async function createGroupWithBob(name: string) {
      const g = await app.inject({
        method: "POST",
        url: "/groups",
        headers: { authorization: `Bearer ${alice.token}` },
        payload: { name, type: "GENERIC" },
      });
      const gid = g.json().id;
      await app.inject({
        method: "POST",
        url: `/groups/${gid}/members`,
        headers: { authorization: `Bearer ${alice.token}` },
        payload: { contactType: "PHONE", contactValue: "+33612260201" },
      });
      return gid;
    }

    const g1 = await createGroupWithBob("Voyage");
    const g2 = await createGroupWithBob("Coloc");

    // G1 : Alice paye 100€, partagé 2 → Bob lui doit 50€
    await app.inject({
      method: "POST",
      url: `/groups/${g1}/expenses`,
      headers: { authorization: `Bearer ${alice.token}` },
      payload: {
        description: "Hotel",
        amount: "100.00",
        splitMode: "EQUAL",
        participants: [{ userId: alice.userId }, { userId: bob.userId }],
      },
    });

    // G2 : Bob paye 40€, partagé 2 → Alice lui doit 20€
    await app.inject({
      method: "POST",
      url: `/groups/${g2}/expenses`,
      headers: { authorization: `Bearer ${bob.token}` },
      payload: {
        description: "Courses",
        amount: "40.00",
        splitMode: "EQUAL",
        participants: [{ userId: alice.userId }, { userId: bob.userId }],
      },
    });

    // Alice consulte sa vue par personne — net Bob attendu = +50 - 20 = +30
    const res = await app.inject({
      method: "GET",
      url: "/me/balances/by-person",
      headers: { authorization: `Bearer ${alice.token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const bobEntry = body.people.find(
      (p: { counterpartyUserId: string }) =>
        p.counterpartyUserId === bob.userId,
    );
    expect(bobEntry).toBeTruthy();
    expect(parseFloat(bobEntry.net)).toBeCloseTo(30, 2);
    expect(bobEntry.sharedGroups).toBe(2);
    expect(bobEntry.byGroup).toHaveLength(2);
  });
});

describe("V30 · Cross-group settlement (règlement multi-groupe)", () => {
  beforeEach(() => startOtpCapture());
  afterEach(() => stopOtpCapture());

  it("V30-A · Cross-settlement avec 3 groupes : tous passent à 0 après confirm", async () => {
    const app = await getApp();
    // Karim (créancier net) + Linda (débiteur net) sur 3 groupes
    const karim = await quickSignup({
      displayName: "Karim",
      phone: "+33612300100",
    });
    const linda = await quickSignup({
      displayName: "Linda",
      phone: "+33612300101",
    });

    // 3 groupes partagés
    async function createGroup(name: string) {
      const g = await app.inject({
        method: "POST",
        url: "/groups",
        headers: { authorization: `Bearer ${karim.token}` },
        payload: { name, type: "GENERIC" },
      });
      const gid = g.json().id;
      await app.inject({
        method: "POST",
        url: `/groups/${gid}/members`,
        headers: { authorization: `Bearer ${karim.token}` },
        payload: { contactType: "PHONE", contactValue: "+33612300101" },
      });
      return gid;
    }
    const g1 = await createGroup("Voyage Lisbonne");
    const g2 = await createGroup("Coloc Bordeaux");
    const g3 = await createGroup("Tontine Noël");

    // G1 : Karim paye 160€ partagé 2 → Linda lui doit 80€
    await app.inject({
      method: "POST",
      url: `/groups/${g1}/expenses`,
      headers: { authorization: `Bearer ${karim.token}` },
      payload: {
        description: "Hôtel",
        amount: "160.00",
        splitMode: "EQUAL",
        participants: [{ userId: karim.userId }, { userId: linda.userId }],
      },
    });
    // G2 : Karim paye 200€ partagé 2 → Linda lui doit 100€
    await app.inject({
      method: "POST",
      url: `/groups/${g2}/expenses`,
      headers: { authorization: `Bearer ${karim.token}` },
      payload: {
        description: "Loyer",
        amount: "200.00",
        splitMode: "EQUAL",
        participants: [{ userId: karim.userId }, { userId: linda.userId }],
      },
    });
    // G3 : Linda paye 75€ partagé 2 → Karim lui doit 37,50€
    await app.inject({
      method: "POST",
      url: `/groups/${g3}/expenses`,
      headers: { authorization: `Bearer ${linda.token}` },
      payload: {
        description: "Cadeaux",
        amount: "75.00",
        splitMode: "EQUAL",
        participants: [{ userId: karim.userId }, { userId: linda.userId }],
      },
    });

    // Karim consulte sa vue par personne — net Linda attendu = 80 + 100 - 37,50 = +142,50
    const balRes = await app.inject({
      method: "GET",
      url: "/me/balances/by-person",
      headers: { authorization: `Bearer ${karim.token}` },
    });
    const lindaEntry = balRes
      .json()
      .people.find(
        (p: { counterpartyUserId: string }) =>
          p.counterpartyUserId === linda.userId,
      );
    expect(parseFloat(lindaEntry.net)).toBeCloseTo(142.5, 2);

    // Karim crée un cross-settlement de 142,50€ avec 3 children
    const createRes = await app.inject({
      method: "POST",
      url: "/me/cross-settlements",
      headers: { authorization: `Bearer ${karim.token}` },
      payload: {
        counterpartyUserId: linda.userId,
        netDirection: "actorReceives", // Karim reçoit le net
        totalAmount: "142.50",
        currency: "EUR",
        memo: "Test V30",
        children: [
          // Sur G1+G2 : Linda paye Karim (actorReceives)
          {
            groupId: g1,
            direction: "actorReceives",
            amount: "80.00",
            currency: "EUR",
          },
          {
            groupId: g2,
            direction: "actorReceives",
            amount: "100.00",
            currency: "EUR",
          },
          // Sur G3 : Karim "paye" Linda — il l'inclut pour solder G3 aussi
          {
            groupId: g3,
            direction: "actorPays",
            amount: "37.50",
            currency: "EUR",
          },
        ],
      },
    });
    expect(createRes.statusCode).toBe(200);
    const crossId = createRes.json().id;
    expect(crossId).toBeTruthy();
    expect(createRes.json().childrenIds).toHaveLength(3);

    // Karim confirme la réception (lui = créancier net)
    const confirmRes = await app.inject({
      method: "POST",
      url: `/cross-settlements/${crossId}/confirm`,
      headers: { authorization: `Bearer ${karim.token}` },
    });
    expect(confirmRes.statusCode).toBe(200);

    // Vérification : les 3 soldes de groupes doivent être à 0
    for (const gid of [g1, g2, g3]) {
      const b = await app.inject({
        method: "GET",
        url: `/groups/${gid}/balance`,
        headers: { authorization: `Bearer ${karim.token}` },
      });
      const karimNet = parseFloat(
        b.json().balances.find(
          (x: { userId: string }) => x.userId === karim.userId,
        ).net,
      );
      expect(karimNet).toBeCloseTo(0, 2);
    }

    // Et la vue par personne doit aussi montrer Linda à 0 (badge "à jour")
    const balRes2 = await app.inject({
      method: "GET",
      url: "/me/balances/by-person",
      headers: { authorization: `Bearer ${karim.token}` },
    });
    const lindaAfter = balRes2
      .json()
      .people.find(
        (p: { counterpartyUserId: string }) =>
          p.counterpartyUserId === linda.userId,
      );
    expect(parseFloat(lindaAfter.net)).toBeCloseTo(0, 2);
  });

  it("V30-B · Seul le créancier net peut confirmer la réception", async () => {
    const app = await getApp();
    const a = await quickSignup({
      displayName: "Alice",
      phone: "+33612300200",
    });
    const b = await quickSignup({
      displayName: "Bob",
      phone: "+33612300201",
    });
    const g = await app.inject({
      method: "POST",
      url: "/groups",
      headers: { authorization: `Bearer ${a.token}` },
      payload: { name: "G", type: "GENERIC" },
    });
    const gid = g.json().id;
    await app.inject({
      method: "POST",
      url: `/groups/${gid}/members`,
      headers: { authorization: `Bearer ${a.token}` },
      payload: { contactType: "PHONE", contactValue: "+33612300201" },
    });
    await app.inject({
      method: "POST",
      url: `/groups/${gid}/expenses`,
      headers: { authorization: `Bearer ${a.token}` },
      payload: {
        description: "X",
        amount: "20.00",
        splitMode: "EQUAL",
        participants: [{ userId: a.userId }, { userId: b.userId }],
      },
    });
    const create = await app.inject({
      method: "POST",
      url: "/me/cross-settlements",
      headers: { authorization: `Bearer ${a.token}` },
      payload: {
        counterpartyUserId: b.userId,
        netDirection: "actorReceives",
        totalAmount: "10.00",
        currency: "EUR",
        children: [
          {
            groupId: gid,
            direction: "actorReceives",
            amount: "10.00",
            currency: "EUR",
          },
        ],
      },
    });
    const crossId = create.json().id;

    // Bob (le débiteur) tente de confirmer → doit échouer
    const bobConfirm = await app.inject({
      method: "POST",
      url: `/cross-settlements/${crossId}/confirm`,
      headers: { authorization: `Bearer ${b.token}` },
    });
    expect(bobConfirm.statusCode).toBeGreaterThanOrEqual(400);
  });
});
