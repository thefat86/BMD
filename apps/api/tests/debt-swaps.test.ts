import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getApp,
  quickSignup,
  startOtpCapture,
  stopOtpCapture,
} from "./helpers.js";

/**
 * Hélper : créer un groupe avec 4 membres + ajouter une dépense pour générer des dettes.
 */
async function setupGroupWithDebts() {
  const app = await getApp();
  const owner = await quickSignup(app, {
    displayName: "Aïcha",
    phone: `+33614${Math.floor(Math.random() * 10000000)
      .toString()
      .padStart(7, "0")}`,
  });

  const g = await app.inject({
    method: "POST",
    url: "/groups",
    headers: { authorization: `Bearer ${owner.token}` },
    payload: { name: "Coloc Belleville", type: "COLOC" },
  });
  const groupId = g.json().id;

  const memberIds: string[] = [g.json().members[0].user.id];
  for (let i = 0; i < 3; i++) {
    const r = await app.inject({
      method: "POST",
      url: `/groups/${groupId}/members`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {
        contactType: "PHONE",
        contactValue: `+33615${Math.floor(Math.random() * 10000000)
          .toString()
          .padStart(7, "0")}`,
      },
    });
    memberIds.push(r.json().user.id);
  }

  // Owner paie 100€ partagé entre 4 → owner net = +75, autres = -25
  await app.inject({
    method: "POST",
    url: `/groups/${groupId}/expenses`,
    headers: { authorization: `Bearer ${owner.token}` },
    payload: {
      description: "Resto",
      amount: "100.00",
      splitMode: "EQUAL",
      participants: memberIds.map((id) => ({ userId: id })),
    },
  });

  return { app, owner, groupId, memberIds };
}

describe("M09 · Debt Swaps · proposition & cycle de vie", () => {
  beforeEach(() => startOtpCapture());
  afterEach(() => stopOtpCapture());

  it("T70 · propose un swap basé sur les balances actuelles", async () => {
    const { app, owner, groupId, memberIds } = await setupGroupWithDebts();
    const r = await app.inject({
      method: "POST",
      url: `/groups/${groupId}/debt-swaps`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { description: "Compensation des dettes du resto" },
    });
    expect(r.statusCode).toBe(201);
    const swap = r.json();
    expect(swap.status).toBe("PROPOSED");
    expect(swap.legs).toHaveLength(3); // 3 amis doivent payer owner
    expect(swap.participants).toHaveLength(memberIds.length); // tous concernés
    // Owner s'auto-accepte
    const ownerPart = swap.participants.find(
      (p: { userId: string }) => p.userId === memberIds[0],
    );
    expect(ownerPart.acceptedAt).not.toBeNull();
  });

  it("T71 · refuse un nouveau swap si un est déjà en cours", async () => {
    const { app, owner, groupId } = await setupGroupWithDebts();
    await app.inject({
      method: "POST",
      url: `/groups/${groupId}/debt-swaps`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {},
    });
    const r2 = await app.inject({
      method: "POST",
      url: `/groups/${groupId}/debt-swaps`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {},
    });
    expect(r2.statusCode).toBe(409);
  });

  it("T72 · refuse un swap si les balances sont équilibrées", async () => {
    const app = await getApp();
    const owner = await quickSignup(app, {
      displayName: "X",
      phone: "+33614000099",
    });
    const g = await app.inject({
      method: "POST",
      url: "/groups",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: "Empty group", type: "GENERIC" },
    });
    // Pas de dépense → pas de dettes
    const r = await app.inject({
      method: "POST",
      url: `/groups/${g.json().id}/debt-swaps`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {},
    });
    expect(r.statusCode).toBe(400);
  });

  it("T73 · proposeur peut annuler son swap", async () => {
    const { app, owner, groupId } = await setupGroupWithDebts();
    const r = await app.inject({
      method: "POST",
      url: `/groups/${groupId}/debt-swaps`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {},
    });
    const swapId = r.json().id;
    const c = await app.inject({
      method: "POST",
      url: `/debt-swaps/${swapId}/cancel`,
      headers: { authorization: `Bearer ${owner.token}` },
    });
    expect(c.statusCode).toBe(200);
    expect(c.json().status).toBe("CANCELLED");
  });

  it("T74 · liste les swaps actifs (PROPOSED non expirés)", async () => {
    const { app, owner, groupId } = await setupGroupWithDebts();
    await app.inject({
      method: "POST",
      url: `/groups/${groupId}/debt-swaps`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {},
    });
    const list = await app.inject({
      method: "GET",
      url: `/groups/${groupId}/debt-swaps`,
      headers: { authorization: `Bearer ${owner.token}` },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toHaveLength(1);
    expect(list.json()[0].status).toBe("PROPOSED");
  });

  it("T75 · serialisation correcte (legs + participants)", async () => {
    const { app, owner, groupId, memberIds } = await setupGroupWithDebts();
    const r = await app.inject({
      method: "POST",
      url: `/groups/${groupId}/debt-swaps`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {},
    });
    const swap = r.json();
    // Toutes les jambes doivent aller VERS owner (qui est créditeur)
    swap.legs.forEach((leg: { toUserId: string; amount: string }) => {
      expect(leg.toUserId).toBe(memberIds[0]); // owner
      expect(parseFloat(leg.amount)).toBeCloseTo(25, 2); // 100/4 = 25 par personne
    });
  });
});
