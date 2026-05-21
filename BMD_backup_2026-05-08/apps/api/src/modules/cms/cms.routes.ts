/**
 * Routes CMS Pages (spec §6.7).
 *
 * Public :
 *   GET /cms/:slug                        → page publiée (cache court)
 *
 * Admin (super admin only) :
 *   GET    /admin/cms-pages
 *   POST   /admin/cms-pages
 *   GET    /admin/cms-pages/:id
 *   PATCH  /admin/cms-pages/:id           → save draft
 *   POST   /admin/cms-pages/:id/publish
 *   POST   /admin/cms-pages/:id/active    → toggle isActive
 *   GET    /admin/cms-pages/:id/versions
 *   POST   /admin/cms-pages/:id/revert/:versionId
 *   DELETE /admin/cms-pages/:id
 *
 * Architecture :
 *   - La route publique est définie sur l'app parent
 *   - Les routes admin sont dans un sub-plugin avec hooks d'auth dédiés
 *     (pattern le plus fiable pour partager des hooks dans Fastify).
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Errors } from "../../lib/errors.js";
import { assertSuperAdmin } from "../admin/admin.service.js";
import {
  createPage,
  deletePage,
  getPageForEdit,
  getPublishedPage,
  listPages,
  listVersions,
  publishPage,
  revertToVersion,
  saveDraft,
  setPageActive,
} from "./cms.service.js";

export async function cmsRoutes(app: FastifyInstance): Promise<void> {
  // === Route publique (en dehors du sub-plugin admin) ===
  app.get(
    "/cms/:slug",
    { config: { skipAuth: true } as any },
    async (req, reply) => {
      const { slug } = z
        .object({ slug: z.string().min(1).max(60) })
        .parse(req.params);
      const page = await getPublishedPage(slug);
      if (!page) {
        throw Errors.notFound(
          "Cette page n'existe pas (ou pas encore publiée).",
          {
            tip: "Vérifie l'orthographe ou explore le menu principal.",
          },
        );
      }
      // Cache 60s côté client / CDN
      reply.header(
        "cache-control",
        "public, max-age=60, stale-while-revalidate=300",
      );
      return page;
    },
  );

  // === Sub-plugin pour les routes admin (auth + super admin partagés) ===
  await app.register(async (admin) => {
    // Hook 1 : auth JWT (réutilise app.authenticate du parent)
    admin.addHook("onRequest", admin.authenticate);
    // Hook 2 : super admin uniquement
    admin.addHook("onRequest", async (req) => {
      await assertSuperAdmin((req.user as any).sub);
    });

    // Liste / création
    admin.get("/admin/cms-pages", async () => listPages());

    admin.post("/admin/cms-pages", async (req, reply) => {
      const body = z
        .object({
          slug: z.string().min(1).max(50),
          title: z.string().min(1).max(120),
        })
        .parse(req.body);
      const created = await createPage(body);
      return reply.code(201).send(created);
    });

    // Lecture / édition d'une page
    admin.get("/admin/cms-pages/:id", async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      return getPageForEdit(id);
    });

    admin.patch("/admin/cms-pages/:id", async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z
        .object({
          blocks: z.array(z.any()),
          title: z.string().min(1).max(120).optional(),
        })
        .parse(req.body);
      return saveDraft({ pageId: id, blocks: body.blocks, title: body.title });
    });

    admin.post("/admin/cms-pages/:id/publish", async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z
        .object({ note: z.string().max(500).optional() })
        .parse(req.body ?? {});
      return publishPage({
        pageId: id,
        publisherId: req.user.sub,
        note: body.note,
      });
    });

    admin.post("/admin/cms-pages/:id/active", async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z.object({ isActive: z.boolean() }).parse(req.body);
      await setPageActive({ pageId: id, isActive: body.isActive });
      return { ok: true };
    });

    admin.get("/admin/cms-pages/:id/versions", async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      return listVersions(id);
    });

    admin.post(
      "/admin/cms-pages/:id/revert/:versionId",
      async (req) => {
        const { id, versionId } = z
          .object({ id: z.string().uuid(), versionId: z.string().uuid() })
          .parse(req.params);
        return revertToVersion({
          pageId: id,
          versionId,
          publisherId: req.user.sub,
        });
      },
    );

    admin.delete("/admin/cms-pages/:id", async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await deletePage(id);
      return reply.code(204).send();
    });
  });
}
