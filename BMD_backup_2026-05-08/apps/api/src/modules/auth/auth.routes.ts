import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ContactType } from "@prisma/client";
import { prisma } from "../../lib/db.js";
import { requestOtp, verifyOtp, getLastDevOtp } from "./otp.service.js";
import { loadEnv } from "../../lib/env.js";
import { verifyAndIssue } from "./auth.service.js";
import { issueToken, revokeSession } from "./jwt.service.js";
import { Errors } from "../../lib/errors.js";
import { validateContact } from "../../lib/validators.js";
import {
  buildOtpauthUri,
  generateTotpSecret,
  verifyTotpCode,
} from "../../lib/totp.js";
import { assertFeatureEnabled } from "../../lib/plan-limits.js";
import {
  buildAuthorizationUrl,
  buildState,
  exchangeCodeForClaims,
  isGoogleSsoConfigured,
  verifyState,
} from "../../lib/google-oauth.js";
import {
  buildAppleAuthorizationUrl,
  buildAppleState,
  exchangeAppleCodeForClaims,
  isAppleSsoConfigured,
  verifyAppleState,
} from "../../lib/apple-oauth.js";
import { extractCountryFromHeaders } from "../../lib/ua-parser.js";
import { markContactsChanged } from "../sim-swap/sim-swap.service.js";

/**
 * Refine Zod : on appelle nos validators partagés (E.164, RFC 5322 simplifié)
 * et on stocke la valeur normalisée pour l'utiliser ensuite. Ainsi,
 *   - "+33 6 12 34 56 78" → "+33612345678"
 *   - "  Foo@Bar.COM " → "foo@bar.com"
 * sont les seules valeurs qui atteignent la couche service.
 */
function refineContactValue<T extends z.ZodObject<any>>(
  schema: T,
): z.ZodEffects<T> {
  return schema.superRefine((data: any, ctx) => {
    const r = validateContact(data.contactType, data.contactValue);
    if (!r.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contactValue"],
        message: r.message ?? "Contact invalide",
      });
    } else if (r.value) {
      // Mutation in-place de l'objet validé (Zod préserve les refs)
      data.contactValue = r.value;
    }
  });
}

const requestOtpSchema = refineContactValue(
  z.object({
    contactType: z.nativeEnum(ContactType),
    contactValue: z.string().min(3),
    channel: z.enum(["SMS", "WHATSAPP", "EMAIL"]).optional(),
  }),
);

const verifyOtpSchema = refineContactValue(
  z.object({
    contactType: z.nativeEnum(ContactType),
    contactValue: z.string().min(3),
    code: z.string().regex(/^\d{4,8}$/),
    displayName: z.string().min(1).max(80).optional(),
  }),
);

const updateMeSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  defaultCurrency: z.string().length(3).optional(),
  defaultLocale: z.string().min(2).max(8).optional(),
  avatar: z.string().url().nullable().optional(),
  /// Tonalité des rappels (spec §3.8) : sympa | ferme | humour | pro
  reminderTone: z.enum(["sympa", "ferme", "humour", "pro"]).optional(),
});

const addContactSchema = refineContactValue(
  z.object({
    contactType: z.nativeEnum(ContactType),
    contactValue: z.string().min(3),
  }),
);

const verifyContactSchema = refineContactValue(
  z.object({
    contactType: z.nativeEnum(ContactType),
    contactValue: z.string().min(3),
    code: z.string().regex(/^\d{4,8}$/),
  }),
);

export async function authRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /auth/otp/request
   * Body: { contactType, contactValue, channel? }
   * Response: 202 { sent: true, expiresAt }
   * Toujours répond 202 même si le contact n'existe pas (anti-énumération).
   */
  app.post("/auth/otp/request", async (req, reply) => {
    const body = requestOtpSchema.parse(req.body);
    const result = await requestOtp(body);
    return reply.code(202).send(result);
  });

  /**
   * GET /auth/dev/last-otp?contact=xxx
   *
   * DEV ONLY — récupère le dernier code OTP en clair émis pour un contact.
   * Utilisé EXCLUSIVEMENT par les tests E2E Playwright qui ont besoin de
   * compléter le flow login sans dépendre d'un vrai canal SMS/email.
   *
   * Sécurité : refuse en mode production (renvoie 404 silencieux pour ne
   * pas divulguer l'existence de la route).
   */
  app.get(
    "/auth/dev/last-otp",
    { config: { skipAuth: true } as any },
    async (req, reply) => {
      const env = loadEnv();
      if (env.NODE_ENV !== "development") {
        return reply.code(404).send({ error: "not_found" });
      }
      const q = z
        .object({ contact: z.string().min(1).max(200) })
        .parse(req.query);
      const result = getLastDevOtp(q.contact);
      if (!result) {
        return reply
          .code(404)
          .send({ error: "no_otp_for_contact", contact: q.contact });
      }
      return result;
    },
  );

  // ============================================================
  // WhatsApp Login (spec §7.2 — "WhatsApp natif · zéro friction")
  // ============================================================

  /**
   * POST /auth/whatsapp/start
   * Génère un code de login + URL wa.me préformulée. L'utilisateur
   * touche le lien → WhatsApp s'ouvre avec un message pré-rempli
   * "BMD-LOGIN-XXXX" → il send → notre webhook reconnaît + lie le numéro.
   *
   * Réponse : { code, waUrl, expiresAt }
   * Si WHATSAPP_BUSINESS_NUMBER non configuré → 503 (méthode désactivée).
   */
  app.post(
    "/auth/whatsapp/start",
    { config: { skipAuth: true } as any },
    async (req, reply) => {
      const env = await import("../../lib/env.js").then((m) => m.loadEnv());
      if (!env.WHATSAPP_BUSINESS_NUMBER) {
        return reply
          .code(503)
          .send({ error: "whatsapp_login_disabled", message: "WhatsApp Business non configuré côté serveur." });
      }
      const { generateLoginCode } = await import(
        "../../lib/whatsapp-login.js"
      );
      const ip =
        (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
        req.ip;
      const { code, expiresAt } = generateLoginCode({ initiatorIp: ip });
      const waUrl = `https://wa.me/${env.WHATSAPP_BUSINESS_NUMBER}?text=${encodeURIComponent(`BMD-LOGIN-${code}`)}`;
      return {
        code,
        waUrl,
        expiresAt: expiresAt.toISOString(),
      };
    },
  );

  /**
   * GET /auth/whatsapp/check?code=XXXX
   * Polling du frontend pour savoir si le user a envoyé le message.
   * Si ready → on récupère son numéro, crée/retrouve le user, et émet un JWT.
   * Sinon : { ready: false }.
   */
  app.get(
    "/auth/whatsapp/check",
    { config: { skipAuth: true } as any },
    async (req, reply) => {
      const { code } = z
        .object({ code: z.string().length(8) })
        .parse(req.query);
      const { consumeReadyCode } = await import(
        "../../lib/whatsapp-login.js"
      );
      const r = consumeReadyCode(code);
      if (!r.ready) {
        return reply.send({ ready: false });
      }
      // Trouve ou crée l'utilisateur via le numéro WhatsApp (bind UserContact)
      const phone = r.phoneE164;
      const contact = await prisma.userContact.findUnique({
        where: { type_value: { type: "PHONE", value: phone } },
      });
      let userId: string;
      if (contact) {
        userId = contact.userId;
      } else {
        // Création à la volée — pas de displayName demandé (l'utilisateur
        // pourra le compléter ensuite dans son profil).
        const created = await prisma.user.create({
          data: {
            displayName: `Nouveau ·${phone.slice(-4)}`,
            contacts: {
              create: {
                type: "PHONE",
                value: phone,
                isVerified: true,
                isPrimary: true,
                verifiedAt: new Date(),
              },
            },
          },
        });
        userId = created.id;
      }
      // Émet un JWT comme pour OTP
      const ua = req.headers["user-agent"] ?? undefined;
      const country = (
        (req.headers["cf-ipcountry"] as string | undefined) ?? "??"
      )
        .slice(0, 2)
        .toUpperCase();
      const { issueToken } = await import("./jwt.service.js");
      const tokenIssued = await issueToken(app, userId, ua, country, {
        contactType: "PHONE",
        contactValue: phone,
      });
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          id: true,
          displayName: true,
          avatar: true,
          defaultCurrency: true,
          defaultLocale: true,
          createdAt: true,
        },
      });
      return reply.send({
        ready: true,
        token: tokenIssued.token,
        expiresAt: tokenIssued.expiresAt.toISOString(),
        user: { ...user, createdAt: user.createdAt.toISOString() },
      });
    },
  );

  /**
   * POST /auth/magic-link/request (spec §7.2)
   * Body: { email }
   * Génère un lien à usage unique, signé via le code OTP existant.
   * En mode dev : le lien est loggé en console (comme l'OTP).
   * En prod : il sera envoyé par email via SMTP transactionnel.
   *
   * Le lien : /login?ml={contactType}|{contactValue}|{code}
   * Au clic, le frontend pré-remplit les champs et appelle verifyOtp,
   * créant la session sans saisie supplémentaire.
   */
  app.post("/auth/magic-link/request", async (req, reply) => {
    const body = z
      .object({ email: z.string().email() })
      .parse(req.body);
    // On déclenche un OTP email standard (validité 15 min côté magic link)
    const result = await requestOtp({
      contactType: "EMAIL" as any,
      contactValue: body.email,
      channel: "EMAIL",
    });
    // Note : le code OTP est déjà loggé par otp.service.ts.
    // En mode dev, l'utilisateur voit aussi le lien complet en console :
    console.log(
      `\n🔗 [MAGIC-LINK] Pour ${body.email}, lien :\n` +
        `   http://localhost:3000/login?ml_email=${encodeURIComponent(body.email)}\n` +
        `   (Demande à l'utilisateur de saisir le code OTP affiché ci-dessus)\n`,
    );
    return reply.code(202).send({
      sent: true,
      // L'utilisateur reçoit un email contenant le lien en prod
      mode: "dev_console",
      hint: "Ouvre la console serveur pour voir le code OTP à 6 chiffres",
    });
  });

  /**
   * POST /auth/otp/verify
   * Body: { contactType, contactValue, code, displayName? }
   * Response: 200 { token, expiresAt, user }
   */
  app.post("/auth/otp/verify", async (req, reply) => {
    const body = verifyOtpSchema.parse(req.body);
    const result = await verifyAndIssue(app, {
      ...body,
      device: req.headers["user-agent"] ?? undefined,
      country: extractCountryFromHeaders(req.headers as any),
    });

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: result.userId },
      select: {
        id: true,
        displayName: true,
        avatar: true,
        defaultCurrency: true,
        defaultLocale: true,
        createdAt: true,
      },
    });

    return reply.send({
      token: result.token,
      expiresAt: result.expiresAt.toISOString(),
      user: {
        ...user,
        createdAt: user.createdAt.toISOString(),
      },
    });
  });

  /**
   * GET /auth/me
   * Headers: Authorization: Bearer <token>
   * Response: 200 { user, contacts }
   */
  app.get("/auth/me", { onRequest: [app.authenticate] }, async (req) => {
    const userId = req.user.sub;
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        contacts: {
          select: {
            id: true,
            type: true,
            value: true,
            isVerified: true,
            isPrimary: true,
            verifiedAt: true,
          },
        },
      },
    });
    // Spec §7.3 : flag de "fraîcheur" de la vérification — > 6 mois = stale.
    // Le frontend affiche un badge ⚠ à côté pour inciter à re-vérifier.
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const contactsWithStale = user.contacts.map((c) => ({
      ...c,
      stale:
        c.isVerified &&
        c.verifiedAt !== null &&
        c.verifiedAt < sixMonthsAgo,
    }));
    return { user: { ...user, contacts: contactsWithStale } };
  });

  /**
   * PATCH /auth/me
   * Met à jour le profil de l'utilisateur courant (nom, devise, locale, avatar).
   */
  app.patch("/auth/me", { onRequest: [app.authenticate] }, async (req) => {
    const body = updateMeSchema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.user.sub },
      data: {
        ...(body.displayName && { displayName: body.displayName.trim() }),
        ...(body.defaultCurrency && { defaultCurrency: body.defaultCurrency.toUpperCase() }),
        ...(body.defaultLocale && { defaultLocale: body.defaultLocale.toLowerCase() }),
        ...(body.avatar !== undefined && { avatar: body.avatar }),
      },
      select: {
        id: true,
        displayName: true,
        avatar: true,
        defaultCurrency: true,
        defaultLocale: true,
      },
    });
    return { user };
  });

  /**
   * POST /auth/me/plan
   * Change le forfait de l'utilisateur courant.
   *
   * MVP : pas de paiement réel. On valide juste que le plan demandé existe
   * et est actif, puis on met à jour User.planCode. L'intégration Stripe
   * (spec §6.3) sera branchée plus tard ; à ce moment-là on remplacera ce
   * handler par un POST qui crée une session de checkout et qui ne
   * change le planCode qu'au webhook `invoice.payment_succeeded`.
   *
   * Pour l'instant on permet le changement direct pour pouvoir tester
   * tout le gating (limites, dialogs d'upgrade) en local.
   */
  app.post(
    "/auth/me/plan",
    { onRequest: [app.authenticate] },
    async (req) => {
      const body = z
        .object({ planCode: z.string().min(1).max(40) })
        .parse(req.body);
      const code = body.planCode.toUpperCase();

      const plan = await prisma.plan.findUnique({ where: { code } });
      if (!plan || !plan.isActive) {
        throw Errors.notFound("Ce forfait n'existe pas ou n'est plus actif.");
      }

      const user = await prisma.user.update({
        where: { id: req.user.sub },
        data: { planCode: code },
        select: {
          id: true,
          displayName: true,
          planCode: true,
        },
      });
      return { user, plan: { code: plan.code, name: plan.name } };
    },
  );

  /**
   * POST /auth/contacts/add
   * Ajoute un nouveau contact (téléphone ou email) et envoie un OTP de vérification.
   * L'utilisateur doit ensuite appeler /auth/contacts/verify avec le code reçu.
   */
  app.post(
    "/auth/contacts/add",
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const body = addContactSchema.parse(req.body);
      const value = body.contactValue.trim();

      // Vérifier que ce contact n'appartient pas déjà à un autre utilisateur
      const existing = await prisma.userContact.findUnique({
        where: { type_value: { type: body.contactType, value } },
      });
      if (existing) {
        if (existing.userId === req.user.sub) {
          throw Errors.alreadyExists({
            what: "Ce contact est déjà sur ton profil",
            tip: "Tu peux le retrouver dans la liste de tes contacts vérifiés.",
          });
        }
        throw Errors.conflict(
          "Ce contact est déjà rattaché à un autre compte 🤔",
          {
            tip: "Si c'est toi, connecte-toi avec ce contact-là — sinon, utilise un autre email/numéro.",
          },
        );
      }

      // Limites : 3 contacts max de chaque type par compte
      const sameTypeCount = await prisma.userContact.count({
        where: { userId: req.user.sub, type: body.contactType },
      });
      if (sameTypeCount >= 3) {
        throw Errors.badRequest(
          `Tu as déjà 3 ${body.contactType === "PHONE" ? "numéros" : "emails"} sur ton compte 📱`,
          {
            tip: `On limite à 3 par compte pour la sécurité. Supprime-en un avant d'en ajouter un nouveau.`,
            actionHref: "/dashboard/profile",
            action: "Voir mes contacts",
          },
        );
      }

      // Demander un OTP (réutilise le service existant)
      const otpResult = await requestOtp({
        contactType: body.contactType,
        contactValue: value,
      });

      return reply.code(202).send({
        sent: true,
        expiresAt: otpResult.expiresAt.toISOString(),
        message: "Code envoyé. Vérifie-le via /auth/contacts/verify.",
      });
    },
  );

  /**
   * POST /auth/contacts/verify
   * Vérifie l'OTP d'un nouveau contact et l'attache au compte utilisateur.
   */
  app.post(
    "/auth/contacts/verify",
    { onRequest: [app.authenticate] },
    async (req) => {
      const body = verifyContactSchema.parse(req.body);
      const value = body.contactValue.trim();

      const otpResult = await verifyOtp({
        contactType: body.contactType,
        contactValue: value,
        code: body.code,
      });
      if (!otpResult.valid) {
        const niceReason =
          otpResult.reason === "expired"
            ? "Ce code a expiré ⏰ — demande-en un nouveau."
            : otpResult.reason === "max_attempts"
              ? "Trop de tentatives 🚫 — demande un nouveau code."
              : otpResult.reason === "invalid_code"
                ? "Le code ne correspond pas — vérifie et retente."
                : "Code invalide.";
        throw Errors.unauthorized(niceReason);
      }

      // Créer le contact attaché au user
      const contact = await prisma.userContact.create({
        data: {
          userId: req.user.sub,
          type: body.contactType,
          value,
          isVerified: true,
          isPrimary: false,
          verifiedAt: new Date(),
        },
        select: {
          id: true,
          type: true,
          value: true,
          isVerified: true,
          isPrimary: true,
          verifiedAt: true,
        },
      });
      // Track la modif pour le scoring SIM swap (spec §7.5)
      void markContactsChanged(req.user.sub);
      return { contact };
    },
  );

  /**
   * DELETE /auth/contacts/:id
   * Supprime un contact (ne peut pas supprimer le dernier vérifié).
   */
  app.delete(
    "/auth/contacts/:id",
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);

      const contact = await prisma.userContact.findUnique({ where: { id } });
      if (!contact || contact.userId !== req.user.sub) {
        throw Errors.notFound("Ce contact est introuvable 🔍");
      }

      // Empêche de supprimer le dernier contact vérifié
      const verifiedCount = await prisma.userContact.count({
        where: { userId: req.user.sub, isVerified: true },
      });
      if (contact.isVerified && verifiedCount <= 1) {
        throw Errors.badRequest(
          "Impossible de supprimer ton dernier contact vérifié 🔒",
          {
            tip: "Sans contact vérifié, tu ne pourrais plus te reconnecter ! Ajoute-en un autre d'abord, puis tu pourras supprimer celui-ci.",
          },
        );
      }

      // Si c'était le contact principal, en désigner un autre
      if (contact.isPrimary) {
        const fallback = await prisma.userContact.findFirst({
          where: {
            userId: req.user.sub,
            id: { not: id },
            isVerified: true,
          },
        });
        if (fallback) {
          await prisma.userContact.update({
            where: { id: fallback.id },
            data: { isPrimary: true },
          });
        }
      }

      await prisma.userContact.delete({ where: { id } });
      void markContactsChanged(req.user.sub);
      return reply.code(204).send();
    },
  );

  /**
   * PUT /auth/contacts/:id/primary
   * Définit ce contact comme principal (pour les notifications par défaut).
   */
  app.put(
    "/auth/contacts/:id/primary",
    { onRequest: [app.authenticate] },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);

      const contact = await prisma.userContact.findUnique({ where: { id } });
      if (!contact || contact.userId !== req.user.sub) {
        throw Errors.notFound("Ce contact est introuvable 🔍");
      }
      if (!contact.isVerified) {
        throw Errors.badRequest(
          "Ce contact n'est pas encore vérifié 🔐",
          {
            tip: "Pour le passer en principal, vérifie-le d'abord avec le code reçu.",
          },
        );
      }

      // En transaction : désactiver l'ancien primary + activer celui-ci
      await prisma.$transaction([
        prisma.userContact.updateMany({
          where: { userId: req.user.sub, isPrimary: true },
          data: { isPrimary: false },
        }),
        prisma.userContact.update({
          where: { id },
          data: { isPrimary: true },
        }),
      ]);
      void markContactsChanged(req.user.sub);
      return { ok: true };
    },
  );

  /**
   * POST /auth/logout
   * Révoque la session courante.
   */
  app.post("/auth/logout", { onRequest: [app.authenticate] }, async (req, reply) => {
    await revokeSession(req.user.sid);
    return reply.code(204).send();
  });

  /**
   * GET /auth/sessions
   * Liste les sessions actives de l'utilisateur (spec §7.5).
   * Retourne id, device (user-agent), createdAt, expiresAt, current (booléen).
   */
  app.get("/auth/sessions", { onRequest: [app.authenticate] }, async (req) => {
    const sessions = await prisma.session.findMany({
      where: {
        userId: req.user.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        device: true,
        createdAt: true,
        expiresAt: true,
      },
    });
    return sessions.map((s) => ({
      ...s,
      // Le client utilise sid (jwt) pour comparer ; on l'expose ici
      isCurrent: s.id === req.user.sid,
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
    }));
  });

  /**
   * DELETE /auth/sessions/:id
   * Révoque une session à distance (spec §7.5 — déconnexion à distance).
   */
  app.delete(
    "/auth/sessions/:id",
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      // On révoque uniquement les sessions de cet utilisateur (sécurité)
      const r = await prisma.session.updateMany({
        where: {
          id,
          userId: req.user.sub,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      if (r.count === 0) {
        return reply.code(404).send({
          error: "not_found",
          message: "Session introuvable ou déjà révoquée",
        });
      }
      return reply.code(204).send();
    },
  );

  /* =================================================================
   * 2FA TOTP (spec §7.5)
   * =================================================================
   * Workflow :
   *  1. POST /auth/2fa/setup → génère un secret + URI otpauth, RENVOIE-LE
   *     (mais ne l'enregistre pas tant que l'utilisateur n'a pas confirmé)
   *  2. L'utilisateur scanne le QR avec son app TOTP (Google Auth, etc.)
   *  3. POST /auth/2fa/enable {secret, code} → vérifie le code et active
   *  4. POST /auth/2fa/disable {code} → désactive (requiert code)
   *
   * Une fois activée : à la connexion, après l'OTP, l'API renvoie
   *   { needsTwoFactor: true, tempToken } et l'utilisateur doit
   *   POST /auth/2fa/verify-login {tempToken, code} pour finaliser.
   *
   * Note : pour le MVP, on STOCKE le secret en clair dans la DB.
   * En production, à chiffrer avec une clé KMS (variable env).
   */

  /**
   * POST /auth/2fa/setup
   * Génère un nouveau secret et retourne le QR (URI otpauth) à scanner.
   * Le secret n'est PAS persisté tant que /enable n'est pas appelé.
   */
  app.post(
    "/auth/2fa/setup",
    { onRequest: [app.authenticate] },
    async (req) => {
      // Spec §7.5 : 2FA réservée Premium / Communauté
      await assertFeatureEnabled(req.user.sub, "twoFactor");
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: req.user.sub },
        select: {
          displayName: true,
          twoFactorEnabledAt: true,
          contacts: {
            where: { isPrimary: true },
            select: { type: true, value: true },
            take: 1,
          },
        },
      });
      if (user.twoFactorEnabledAt) {
        throw Errors.alreadyExists({
          what: "La double authentification est déjà active sur ton compte 🔐",
          tip: "Pour générer un nouveau secret, désactive-la d'abord depuis ton profil — un nouveau QR sera alors disponible.",
        });
      }
      const secret = generateTotpSecret();
      // Le label est l'identifiant principal (téléphone ou email)
      const label = user.contacts[0]?.value ?? user.displayName;
      const uri = buildOtpauthUri({
        label,
        issuer: "BMD",
        secret,
      });
      // On retourne le secret en clair pour que le frontend l'affiche
      // en backup manuel + génère le QR. À NE JAMAIS faire fuiter en log.
      return { secret, uri };
    },
  );

  /**
   * POST /auth/2fa/enable
   * Body: { secret, code } — vérifie le code, active 2FA si OK.
   */
  app.post(
    "/auth/2fa/enable",
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      // Spec §7.5 : 2FA réservée Premium / Communauté
      await assertFeatureEnabled(req.user.sub, "twoFactor");
      const body = z
        .object({
          secret: z.string().min(16).max(64),
          code: z.string().regex(/^\d{6}$/),
        })
        .parse(req.body);
      if (!verifyTotpCode(body.secret, body.code)) {
        return reply.code(400).send({
          error: "invalid_code",
          message: "Ce code à 6 chiffres ne correspond pas ⌛",
          details: {
            severity: "warning",
            tip: "Vérifie que l'horloge de ton téléphone est synchronisée — un décalage suffit à invalider le code. Attends le prochain code et retente.",
          },
        });
      }
      await prisma.user.update({
        where: { id: req.user.sub },
        data: {
          twoFactorSecret: body.secret,
          twoFactorEnabledAt: new Date(),
        },
      });
      return { enabled: true };
    },
  );

  /**
   * POST /auth/2fa/disable
   * Body: { code } — désactive 2FA après vérification du code.
   */
  app.post(
    "/auth/2fa/disable",
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const body = z
        .object({ code: z.string().regex(/^\d{6}$/) })
        .parse(req.body);
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: req.user.sub },
        select: { twoFactorSecret: true },
      });
      if (!user.twoFactorSecret) {
        throw Errors.invalidState({
          what: "La double authentification",
          currentState: "déjà désactivée",
          tip: "Tu peux la réactiver depuis ton profil quand tu veux 🔐",
        });
      }
      if (!verifyTotpCode(user.twoFactorSecret, body.code)) {
        return reply.code(400).send({
          error: "invalid_code",
          message: "Le code à 6 chiffres ne correspond pas à ce moment-ci ⌛",
          details: {
            severity: "warning",
            tip: "Vérifie que l'horloge de ton téléphone est synchronisée — un décalage de 30 secondes suffit à invalider le code. Sinon, attends le prochain code (toutes les 30s).",
          },
        });
      }
      await prisma.user.update({
        where: { id: req.user.sub },
        data: {
          twoFactorSecret: null,
          twoFactorEnabledAt: null,
        },
      });
      return { disabled: true };
    },
  );

  /**
   * GET /auth/2fa/status
   * Retourne si la 2FA est active pour l'utilisateur courant.
   */
  app.get(
    "/auth/2fa/status",
    { onRequest: [app.authenticate] },
    async (req) => {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: req.user.sub },
        select: { twoFactorEnabledAt: true },
      });
      return {
        enabled: user.twoFactorEnabledAt !== null,
        enabledAt: user.twoFactorEnabledAt?.toISOString() ?? null,
      };
    },
  );

  /* =================================================================
   * QR LOGIN — connexion par scan QR depuis le mobile (spec §8.5)
   * =================================================================
   * Workflow :
   *  Desktop : POST /auth/qr-login/start  → { token, expiresAt }
   *            Affiche un QR code avec ce token (URL bmd.app/qr-login/{token})
   *            Poll GET /auth/qr-login/status/{token} jusqu'à status=APPROVED
   *            Reçoit le JWT, login auto.
   *  Mobile  : Scanne le QR → ouvre /qr-login/{token} dans l'app
   *            POST /auth/qr-login/approve {token} (auth requise)
   *            Le request passe à APPROVED.
   */

  /**
   * POST /auth/qr-login/start (PAS d'auth — appelé par un browser non connecté)
   * Crée une demande de QR login. TTL 90s. Retourne le token à inclure
   * dans le QR code.
   *
   * Configuration :
   *  - skipAuth : oui (pas de JWT, par design — c'est l'étape avant login)
   *  - body parsing : on ignore le body (rien à valider) pour éviter les
   *    400 "Body cannot be empty when content-type is application/json".
   */
  app.post(
    "/auth/qr-login/start",
    {
      config: { skipAuth: true } as any,
      // Schema vide → pas de validation body requise
      schema: { body: { type: "object", additionalProperties: true } as any },
    },
    async (req, reply) => {
      try {
        const { randomBytes } = await import("crypto");
        const token = randomBytes(24).toString("base64url");
        const expiresAt = new Date(Date.now() + 90_000);
        await prisma.qrLoginRequest.create({
          data: {
            token,
            expiresAt,
            device: (req.headers["user-agent"] as string | undefined) ?? null,
          },
        });
        return {
          token,
          expiresAt: expiresAt.toISOString(),
        };
      } catch (err) {
        // Si le schema Prisma n'a pas encore la table QrLoginRequest, on
        // renvoie une erreur explicite plutôt qu'un crash silencieux.
        // eslint-disable-next-line no-console
        console.error("[qr-login/start] prisma error:", err);
        return reply.code(500).send({
          error: "qr_login_unavailable",
          message:
            "La connexion par QR n'est pas encore disponible — relance une migration de base de données.",
          details: {
            tip: "Côté serveur : `npx prisma migrate dev` pour créer la table QrLoginRequest.",
          },
        });
      }
    },
  );

  /**
   * GET /auth/qr-login/status/:token (PAS d'auth)
   * Le desktop poll cette route. Quand status=APPROVED, on émet un JWT
   * pour l'utilisateur qui a scanné le QR (et on marque le request USED).
   */
  app.get("/auth/qr-login/status/:token", async (req, reply) => {
    const { token } = z
      .object({ token: z.string().min(20).max(80) })
      .parse(req.params);
    const r = await prisma.qrLoginRequest.findUnique({ where: { token } });
    if (!r) return reply.code(404).send({ error: "not_found" });
    if (r.expiresAt < new Date()) {
      return { status: "EXPIRED" };
    }
    if (r.status === "PENDING") return { status: "PENDING" };
    if (r.status === "USED") {
      // Le request a déjà été échangé, on ne peut plus le réutiliser
      return reply.code(410).send({ error: "already_used" });
    }
    if (r.status === "APPROVED" && r.userId) {
      // Émission du JWT et marquage USED (one-shot)
      const { issueToken } = await import("./jwt.service.js");
      const country = extractCountryFromHeaders(req.headers as any);
      const { token: jwt, expiresAt } = await issueToken(
        app,
        r.userId,
        r.device ?? undefined,
        country,
      );
      await prisma.qrLoginRequest.update({
        where: { id: r.id },
        data: { status: "USED", usedAt: new Date() },
      });
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: r.userId },
        select: { id: true, displayName: true, avatar: true },
      });
      return {
        status: "APPROVED",
        token: jwt,
        expiresAt: expiresAt.toISOString(),
        user,
      };
    }
    return { status: r.status };
  });

  /**
   * POST /auth/qr-login/approve (AUTH requise — depuis le mobile)
   * Body: { token } — l'utilisateur scanne le QR et confirme.
   */
  app.post(
    "/auth/qr-login/approve",
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const body = z
        .object({ token: z.string().min(20).max(80) })
        .parse(req.body);
      const r = await prisma.qrLoginRequest.findUnique({
        where: { token: body.token },
      });
      if (!r) return reply.code(404).send({ error: "not_found" });
      if (r.expiresAt < new Date()) {
        return reply.code(410).send({ error: "expired" });
      }
      if (r.status !== "PENDING") {
        return reply.code(409).send({
          error: "not_pending",
          message: `Request status is ${r.status}`,
        });
      }
      await prisma.qrLoginRequest.update({
        where: { id: r.id },
        data: {
          userId: req.user.sub,
          status: "APPROVED",
          approvedAt: new Date(),
        },
      });
      return { approved: true };
    },
  );

  // ============================================================
  // SSO Google (spec §7.2)
  //
  // /auth/google/config  → public · indique au front si le SSO est activé
  // /auth/google/start   → public · retourne l'URL d'autorisation + state
  // /auth/google/callback → public · échange le code, crée/connecte le user,
  //                          retourne un JWT BMD
  // ============================================================

  app.get("/auth/google/config", async () => ({
    enabled: isGoogleSsoConfigured(),
  }));

  app.post("/auth/google/start", async () => {
    const state = buildState();
    const url = await buildAuthorizationUrl(state);
    return { url, state };
  });

  app.post("/auth/google/callback", async (req) => {
    const body = z
      .object({
        code: z.string().min(10),
        state: z.string().min(10),
      })
      .parse(req.body);

    if (!verifyState(body.state)) {
      throw Errors.unauthorized(
        "La connexion Google a expiré ou a été altérée 🛡️",
        {
          tip: "Reclique sur « Se connecter avec Google » pour repartir d'une nouvelle session sécurisée.",
        },
      );
    }

    const claims = await exchangeCodeForClaims(body.code);
    const email = claims.email.toLowerCase().trim();

    // Cherche un contact email déjà rattaché à un user
    let userId: string;
    const existingContact = await prisma.userContact.findUnique({
      where: { type_value: { type: "EMAIL", value: email } },
      include: { user: true },
    });

    if (existingContact) {
      userId = existingContact.userId;
      // Si le compte est suspendu, on bloque proprement
      if (existingContact.user.suspendedAt) throw Errors.suspended();
      // Marque le contact comme vérifié si pas déjà
      if (!existingContact.isVerified) {
        await prisma.userContact.update({
          where: { id: existingContact.id },
          data: { isVerified: true, verifiedAt: new Date() },
        });
      }
    } else {
      // Création d'un nouveau compte BMD à partir des infos Google
      const displayName =
        (claims.name?.trim() ?? "") ||
        email.split("@")[0]!.replace(/[._-]+/g, " ");
      const created = await prisma.user.create({
        data: {
          displayName,
          avatar: claims.picture ?? null,
          contacts: {
            create: {
              type: "EMAIL",
              value: email,
              isVerified: true,
              isPrimary: true,
              verifiedAt: new Date(),
            },
          },
        },
      });
      userId = created.id;
    }

    const ua = req.headers["user-agent"];
    const country = extractCountryFromHeaders(req.headers as any);
    const session = await issueToken(
      app,
      userId,
      typeof ua === "string" ? ua.slice(0, 200) : undefined,
      country,
    );
    return {
      token: session.token,
      expiresAt: session.expiresAt.toISOString(),
      userId,
    };
  });

  // ============================================================
  // SSO Apple Sign In (spec §7.2)
  //
  // Apple impose `response_mode=form_post` → le callback est POSTé par Apple.
  // On accepte aussi GET pour le développement local.
  // Le user/name n'est envoyé QU'À LA PREMIÈRE connexion (Apple ne le
  // renvoie plus jamais après) — le frontend doit donc le repasser au
  // backend dans le body POST /auth/apple/callback s'il est dispo.
  // ============================================================

  app.get("/auth/apple/config", async () => ({
    enabled: isAppleSsoConfigured(),
  }));

  app.post("/auth/apple/start", async () => {
    const state = buildAppleState();
    const url = buildAppleAuthorizationUrl(state);
    return { url, state };
  });

  app.post("/auth/apple/callback", async (req) => {
    const body = z
      .object({
        code: z.string().min(10),
        state: z.string().min(10),
        // user.name (optionnel) — Apple ne le renvoie qu'à la 1ère connexion
        userName: z.string().max(80).optional(),
      })
      .parse(req.body);

    if (!verifyAppleState(body.state)) {
      throw Errors.unauthorized(
        "La connexion Apple a expiré ou a été altérée 🛡️",
        {
          tip: "Reclique sur « Se connecter avec Apple » pour repartir d'une nouvelle session sécurisée.",
        },
      );
    }

    const claims = await exchangeAppleCodeForClaims(body.code);
    const email = claims.email?.toLowerCase().trim();

    let userId: string;
    if (email) {
      const existingContact = await prisma.userContact.findUnique({
        where: { type_value: { type: "EMAIL", value: email } },
        include: { user: true },
      });
      if (existingContact) {
        userId = existingContact.userId;
        if (existingContact.user.suspendedAt) throw Errors.suspended();
        if (!existingContact.isVerified) {
          await prisma.userContact.update({
            where: { id: existingContact.id },
            data: { isVerified: true, verifiedAt: new Date() },
          });
        }
      } else {
        const displayName =
          (body.userName?.trim() || "") ||
          email.split("@")[0]!.replace(/[._-]+/g, " ");
        const created = await prisma.user.create({
          data: {
            displayName,
            contacts: {
              create: {
                type: "EMAIL",
                value: email,
                isVerified: true,
                isPrimary: true,
                verifiedAt: new Date(),
              },
            },
          },
        });
        userId = created.id;
      }
    } else {
      // Apple Hide My Email avec relais opaque + on n'a pas (ou plus) accès à l'email
      // → on identifie l'utilisateur par le `sub` Apple stocké dans User.contacts ?
      // Pour l'instant on bloque proprement avec un message explicite.
      throw Errors.unauthorized(
        "Apple n'a pas partagé d'email cette fois 🤔",
        {
          tip: "Lors de la connexion avec Apple, choisis « Partager mon adresse email » plutôt que « Masquer mon adresse ».",
        },
      );
    }

    const ua = req.headers["user-agent"];
    const country = extractCountryFromHeaders(req.headers as any);
    const session = await issueToken(
      app,
      userId,
      typeof ua === "string" ? ua.slice(0, 200) : undefined,
      country,
    );
    return {
      token: session.token,
      expiresAt: session.expiresAt.toISOString(),
      userId,
    };
  });
}
