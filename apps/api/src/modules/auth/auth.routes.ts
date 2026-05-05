import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ContactType } from "@prisma/client";
import { prisma } from "../../lib/db.js";
import { requestOtp, verifyOtp } from "./otp.service.js";
import { verifyAndIssue } from "./auth.service.js";
import { revokeSession } from "./jwt.service.js";
import { Errors } from "../../lib/errors.js";
import { validateContact } from "../../lib/validators.js";

/**
 * Refine Zod : on appelle nos validators partagés (E.164, RFC 5322 simplifié)
 * et on stocke la valeur normalisée pour l'utiliser ensuite. Ainsi,
 *   - "+33 6 12 34 56 78" → "+33612345678"
 *   - "  Foo@Bar.COM " → "foo@bar.com"
 * sont les seules valeurs qui atteignent la couche service.
 */
function refineContactValue(
  schema: z.ZodObject<any>,
): z.ZodEffects<typeof schema> {
  return schema.superRefine((data, ctx) => {
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
   * POST /auth/otp/verify
   * Body: { contactType, contactValue, code, displayName? }
   * Response: 200 { token, expiresAt, user }
   */
  app.post("/auth/otp/verify", async (req, reply) => {
    const body = verifyOtpSchema.parse(req.body);
    const result = await verifyAndIssue(app, {
      ...body,
      device: req.headers["user-agent"] ?? undefined,
    });

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: result.userId },
      select: {
        id: true,
        displayName: true,
        avatar: true,
        defaultCurrency: true,
        defaultLocale: true,
      },
    });

    return reply.send({
      token: result.token,
      expiresAt: result.expiresAt.toISOString(),
      user,
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
    return { user };
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
          throw Errors.conflict("Tu as déjà ce contact dans ton profil");
        }
        throw Errors.conflict("Ce contact appartient déjà à un autre utilisateur");
      }

      // Limites : 3 contacts max de chaque type par compte
      const sameTypeCount = await prisma.userContact.count({
        where: { userId: req.user.sub, type: body.contactType },
      });
      if (sameTypeCount >= 3) {
        throw Errors.badRequest(
          `Maximum 3 ${body.contactType === "PHONE" ? "numéros" : "emails"} par compte`,
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
        throw Errors.unauthorized(`OTP invalide : ${otpResult.reason}`);
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
        throw Errors.notFound("Contact introuvable");
      }

      // Empêche de supprimer le dernier contact vérifié
      const verifiedCount = await prisma.userContact.count({
        where: { userId: req.user.sub, isVerified: true },
      });
      if (contact.isVerified && verifiedCount <= 1) {
        throw Errors.badRequest(
          "Tu ne peux pas supprimer ton seul contact vérifié",
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
        throw Errors.notFound("Contact introuvable");
      }
      if (!contact.isVerified) {
        throw Errors.badRequest(
          "Vérifie d'abord ce contact avant de le marquer principal",
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
}
