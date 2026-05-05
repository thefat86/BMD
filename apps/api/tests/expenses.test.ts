import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Decimal from "decimal.js";
import {
  getApp,
  quickSignup,
  startOtpCapture,
  stopOtpCapture,
} from "./helpers.js";
import { computeShares } from "../src/modules/expenses/expenses.service.js";

describe("M06 · Expenses · split modes (pure logic)", () => {
  it("T30 · EQUAL split divides exactly · last share absorbs the rounding", () => {
    const shares = computeShares(
      new Decimal("100"),
      "EQUAL",
      [{ userId: "a" }, { userId: "b" }, { userId: "c" }],
    );
    expect(shares).toHaveLength(3);
    const sum = shares.reduce((acc, s) => acc.plus(s.amountOwed), new Decimal(0));
    expect(sum.toString()).toBe("100");
    expect(shares[0]!.amountOwed.toString()).toBe("33.33");
    expect(shares[1]!.amountOwed.toString()).toBe("33.33");
    expect(shares[2]!.amountOwed.toString()).toBe("33.34");
  });

  it("T31 · PERCENTAGE split sums exactly to amount", () => {
    const shares = computeShares(
      new Decimal("200"),
      "PERCENTAGE",
      [
        { userId: "a", share: 60 },
        { userId: "b", share: 30 },
        { userId: "c", share: 10 },
      ],
    );
    const sum = shares.reduce((acc, s) => acc.plus(s.amountOwed), new Decimal(0));
    expect(sum.toString()).toBe("200");
  });

  it("T32 · PERCENTAGE that does not sum to 100 throws", () => {
    expect(() =>
      computeShares(
        new Decimal("100"),
        "PERCENTAGE",
        [
          { userId: "a", share: 50 },
          { userId: "b", share: 30 },
        ],
      ),
    ).toThrowError(/Percentages must sum to 100/);
  });

  it("T33 · UNEQUAL : sum of shares must equal amount", () => {
    const shares = computeShares(
      new Decimal("90"),
      "UNEQUAL",
      [
        { userId: "a", share: 60 },
        { userId: "b", share: 30 },
      ],
    );
    expect(shares[0]!.amountOwed.toString()).toBe("60");
    expect(shares[1]!.amountOwed.toString()).toBe("30");
  });

  it("T34 · UNEQUAL with mismatching sum throws", () => {
    expect(() =>
      computeShares(
        new Decimal("100"),
        "UNEQUAL",
        [
          { userId: "a", share: 60 },
          { userId: "b", share: 30 },
        ],
      ),
    ).toThrowError(/Sum of shares.*must equal/);
  });
});

describe("M06 · Expenses · API end-to-end", () => {
  beforeEach(() => startOtpCapture());
  afterEach(() => stopOtpCapture());

  it("T35 · POST + GET expenses for a group · solde correct", async () => {
    const app = await getApp();
    const owner = await quickSignup(app, { displayName: "Owner", phone: "+33612360001" });

    const g = await app.inject({
      method: "POST",
      url: "/groups",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: "Resto soir", type: "EVENT" },
    });
    const gid = g.json().id;

    // Add 3 more members
    const memberIds: string[] = [g.json().members[0].user.id];
    for (let i = 0; i < 3; i++) {
      const r = await app.inject({
        method: "POST",
        url: `/groups/${gid}/members`,
        headers: { authorization: `Bearer ${owner.token}` },
        payload: {
          contactType: "PHONE",
          contactValue: `+33612360${(100 + i).toString()}`,
        },
      });
      memberIds.push(r.json().user.id);
    }

    // Owner pays 100 € split equally between 4
    const created = await app.inject({
      method: "POST",
      url: `/groups/${gid}/expenses`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {
        description: "Resto",
        amount: "100.00",
        splitMode: "EQUAL",
        participants: memberIds.map((id) => ({ userId: id })),
      },
    });
    expect(created.statusCode).toBe(201);
    const exp = created.json();
    expect(exp.shares).toHaveLength(4);
    const sum = exp.shares.reduce(
      (acc: number, s: { amountOwed: string }) => acc + parseFloat(s.amountOwed),
      0,
    );
    expect(sum).toBeCloseTo(100, 2);

    // List
    const list = await app.inject({
      method: "GET",
      url: `/groups/${gid}/expenses`,
      headers: { authorization: `Bearer ${owner.token}` },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toHaveLength(1);
  });
});
