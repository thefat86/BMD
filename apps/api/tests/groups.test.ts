import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getApp, quickSignup, startOtpCapture, stopOtpCapture } from "./helpers.js";

describe("M05 · Groups · creation, membership, invitations", () => {
  beforeEach(() => startOtpCapture());
  afterEach(() => stopOtpCapture());

  it("T20 · creates a group with the creator as ADMIN", async () => {
    const app = await getApp();
    const u = await quickSignup(app, { displayName: "Patricia", phone: "+33612350001" });

    const r = await app.inject({
      method: "POST",
      url: "/groups",
      headers: { authorization: `Bearer ${u.token}` },
      payload: { name: "Tontine Bamiléké", type: "TONTINE", defaultCurrency: "EUR" },
    });
    expect(r.statusCode).toBe(201);
    const g = r.json();
    expect(g.name).toBe("Tontine Bamiléké");
    expect(g.members).toHaveLength(1);
    expect(g.members[0].role).toBe("ADMIN");
    expect(g.members[0].user.id).toBe(u.userId);
  });

  it("T21 · /groups lists only my groups", async () => {
    const app = await getApp();
    const a = await quickSignup(app, { displayName: "A", phone: "+33612350010" });
    const b = await quickSignup(app, { displayName: "B", phone: "+33612350011" });

    await app.inject({
      method: "POST",
      url: "/groups",
      headers: { authorization: `Bearer ${a.token}` },
      payload: { name: "Coloc A", type: "COLOC" },
    });
    await app.inject({
      method: "POST",
      url: "/groups",
      headers: { authorization: `Bearer ${b.token}` },
      payload: { name: "Voyage B", type: "TRAVEL" },
    });

    const listA = await app.inject({
      method: "GET",
      url: "/groups",
      headers: { authorization: `Bearer ${a.token}` },
    });
    const namesA = listA.json().map((g: { name: string }) => g.name);
    expect(namesA).toEqual(["Coloc A"]);
  });

  it("T22 · invite by phone creates a shadow user and adds them as MEMBER", async () => {
    const app = await getApp();
    const u = await quickSignup(app, { displayName: "Marie", phone: "+33612350020" });

    const groupResp = await app.inject({
      method: "POST",
      url: "/groups",
      headers: { authorization: `Bearer ${u.token}` },
      payload: { name: "Coloc Bell", type: "COLOC" },
    });
    const groupId = groupResp.json().id;

    const inv = await app.inject({
      method: "POST",
      url: `/groups/${groupId}/members`,
      headers: { authorization: `Bearer ${u.token}` },
      payload: { contactType: "PHONE", contactValue: "+33612350021" },
    });
    expect(inv.statusCode).toBe(201);
    expect(inv.json().role).toBe("MEMBER");
    expect(inv.json().user.displayName).toContain("33612350021");
  });

  it("T23 · invite same person twice returns 409", async () => {
    const app = await getApp();
    const u = await quickSignup(app, { displayName: "Karim", phone: "+33612350030" });
    const g = await app.inject({
      method: "POST",
      url: "/groups",
      headers: { authorization: `Bearer ${u.token}` },
      payload: { name: "G", type: "GENERIC" },
    });
    const gid = g.json().id;

    await app.inject({
      method: "POST",
      url: `/groups/${gid}/members`,
      headers: { authorization: `Bearer ${u.token}` },
      payload: { contactType: "PHONE", contactValue: "+33612350031" },
    });
    const second = await app.inject({
      method: "POST",
      url: `/groups/${gid}/members`,
      headers: { authorization: `Bearer ${u.token}` },
      payload: { contactType: "PHONE", contactValue: "+33612350031" },
    });
    expect(second.statusCode).toBe(409);
  });

  it("T24 · GET /groups/:id forbidden for non-members", async () => {
    const app = await getApp();
    const owner = await quickSignup(app, { displayName: "O", phone: "+33612350040" });
    const stranger = await quickSignup(app, { displayName: "S", phone: "+33612350041" });

    const g = await app.inject({
      method: "POST",
      url: "/groups",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: "Private", type: "GENERIC" },
    });
    const gid = g.json().id;

    const r = await app.inject({
      method: "GET",
      url: `/groups/${gid}`,
      headers: { authorization: `Bearer ${stranger.token}` },
    });
    expect(r.statusCode).toBe(403);
  });

  it("T25 · only ADMIN/TREASURER can invite members", async () => {
    const app = await getApp();
    const owner = await quickSignup(app, { displayName: "O", phone: "+33612350050" });
    const member = await quickSignup(app, { displayName: "M", phone: "+33612350051" });

    const g = await app.inject({
      method: "POST",
      url: "/groups",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: "G", type: "GENERIC" },
    });
    const gid = g.json().id;

    // Owner adds member as MEMBER role
    await app.inject({
      method: "POST",
      url: `/groups/${gid}/members`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { contactType: "PHONE", contactValue: member.contactValue },
    });

    // Member tries to invite someone else
    const r = await app.inject({
      method: "POST",
      url: `/groups/${gid}/members`,
      headers: { authorization: `Bearer ${member.token}` },
      payload: { contactType: "PHONE", contactValue: "+33612350099" },
    });
    expect(r.statusCode).toBe(403);
  });
});
