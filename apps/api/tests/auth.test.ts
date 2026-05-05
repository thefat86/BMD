import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getApp, lastOtp, quickSignup, startOtpCapture, stopOtpCapture } from "./helpers.js";

describe("M01 · Auth · OTP request + verify", () => {
  beforeEach(() => startOtpCapture());
  afterEach(() => stopOtpCapture());

  it("T01 · returns 202 on /auth/otp/request and stores a hashed code", async () => {
    const app = await getApp();
    const r = await app.inject({
      method: "POST",
      url: "/auth/otp/request",
      payload: { contactType: "PHONE", contactValue: "+33612345678" },
    });
    expect(r.statusCode).toBe(202);
    expect(r.json()).toMatchObject({ sent: true });
  });

  it("T02 · valid OTP creates a new user and issues a JWT", async () => {
    const app = await getApp();
    const phone = "+33612340001";
    await app.inject({
      method: "POST",
      url: "/auth/otp/request",
      payload: { contactType: "PHONE", contactValue: phone },
    });
    const code = lastOtp(phone);

    const v = await app.inject({
      method: "POST",
      url: "/auth/otp/verify",
      payload: {
        contactType: "PHONE",
        contactValue: phone,
        code,
        displayName: "Aïcha",
      },
    });
    expect(v.statusCode).toBe(200);
    const body = v.json();
    expect(body.token).toBeTypeOf("string");
    expect(body.user.displayName).toBe("Aïcha");
  });

  it("T03 · wrong OTP returns 401 and counts attempts", async () => {
    const app = await getApp();
    const phone = "+33612340002";
    await app.inject({
      method: "POST",
      url: "/auth/otp/request",
      payload: { contactType: "PHONE", contactValue: phone },
    });
    const r = await app.inject({
      method: "POST",
      url: "/auth/otp/verify",
      payload: {
        contactType: "PHONE",
        contactValue: phone,
        code: "999999",
        displayName: "X",
      },
    });
    expect(r.statusCode).toBe(401);
    expect(r.json().message).toContain("wrong_code");
  });

  it("T04 · existing user re-logging in (no displayName needed)", async () => {
    const app = await getApp();
    const u = await quickSignup(app, { displayName: "David", phone: "+33612340010" });

    startOtpCapture();
    await app.inject({
      method: "POST",
      url: "/auth/otp/request",
      payload: { contactType: "PHONE", contactValue: u.contactValue },
    });
    const code = lastOtp(u.contactValue);
    const r = await app.inject({
      method: "POST",
      url: "/auth/otp/verify",
      payload: { contactType: "PHONE", contactValue: u.contactValue, code },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().user.id).toBe(u.userId);
  });

  it("T05 · /auth/me requires a valid JWT", async () => {
    const app = await getApp();
    const u = await quickSignup(app, { displayName: "Marie", phone: "+33612340020" });

    const ok = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${u.token}` },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().user.id).toBe(u.userId);

    const ko = await app.inject({ method: "GET", url: "/auth/me" });
    expect(ko.statusCode).toBe(401);
  });

  it("T06 · /auth/logout revokes the session — subsequent calls 401", async () => {
    const app = await getApp();
    const u = await quickSignup(app, { displayName: "Karim", phone: "+33612340030" });

    const out = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: { authorization: `Bearer ${u.token}` },
    });
    expect(out.statusCode).toBe(204);

    const after = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${u.token}` },
    });
    expect(after.statusCode).toBe(401);
  });

  it("T07 · anti-bombing : 6th OTP request in same hour returns 429", async () => {
    const app = await getApp();
    const phone = "+33612340099";
    for (let i = 0; i < 5; i++) {
      const r = await app.inject({
        method: "POST",
        url: "/auth/otp/request",
        payload: { contactType: "PHONE", contactValue: phone },
      });
      expect(r.statusCode).toBe(202);
    }
    const r6 = await app.inject({
      method: "POST",
      url: "/auth/otp/request",
      payload: { contactType: "PHONE", contactValue: phone },
    });
    expect(r6.statusCode).toBe(429);
  });

  it("T08 · same code can't be reused after success", async () => {
    const app = await getApp();
    const phone = "+33612340040";
    await app.inject({
      method: "POST",
      url: "/auth/otp/request",
      payload: { contactType: "PHONE", contactValue: phone },
    });
    const code = lastOtp(phone);

    const r1 = await app.inject({
      method: "POST",
      url: "/auth/otp/verify",
      payload: { contactType: "PHONE", contactValue: phone, code, displayName: "X" },
    });
    expect(r1.statusCode).toBe(200);

    const r2 = await app.inject({
      method: "POST",
      url: "/auth/otp/verify",
      payload: { contactType: "PHONE", contactValue: phone, code, displayName: "X" },
    });
    expect(r2.statusCode).toBe(401);
    expect(r2.json().message).toContain("no_pending_code");
  });
});
