import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { SplitMode } from "@prisma/client";
import {
  createPreset,
  deletePreset,
  listPresets,
} from "./split-presets.service.js";

const createSchema = z.object({
  name: z.string().min(1).max(80),
  splitMode: z.nativeEnum(SplitMode),
  config: z.object({
    participants: z
      .array(
        z.object({
          userId: z.string().uuid(),
          share: z.number().nonnegative().optional(),
        }),
      )
      .min(1),
    paidByUserId: z.string().uuid().optional(),
  }),
});

export async function splitPresetsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", app.authenticate);

  app.get("/groups/:groupId/split-presets", async (req) => {
    const { groupId } = z
      .object({ groupId: z.string().uuid() })
      .parse(req.params);
    const presets = await listPresets({
      groupId,
      actorUserId: req.user.sub,
    });
    return presets.map((p) => ({
      id: p.id,
      name: p.name,
      splitMode: p.splitMode,
      config: p.config,
      createdAt: p.createdAt.toISOString(),
    }));
  });

  app.post("/groups/:groupId/split-presets", async (req, reply) => {
    const { groupId } = z
      .object({ groupId: z.string().uuid() })
      .parse(req.params);
    const body = createSchema.parse(req.body);
    const preset = await createPreset({
      groupId,
      actorUserId: req.user.sub,
      name: body.name,
      splitMode: body.splitMode,
      config: body.config,
    });
    return reply.code(201).send({
      id: preset.id,
      name: preset.name,
      splitMode: preset.splitMode,
      config: preset.config,
      createdAt: preset.createdAt.toISOString(),
    });
  });

  app.delete("/split-presets/:presetId", async (req, reply) => {
    const { presetId } = z
      .object({ presetId: z.string().uuid() })
      .parse(req.params);
    await deletePreset({ presetId, actorUserId: req.user.sub });
    return reply.code(204).send();
  });
}
