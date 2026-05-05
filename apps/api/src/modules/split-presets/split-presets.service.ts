import { Prisma, SplitMode } from "@prisma/client";
import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";
import { getGroupForMember } from "../groups/groups.service.js";

/**
 * MODULE M10 · SPLIT PRESETS
 *
 * Templates de partage réutilisables par groupe (mariages, comités...).
 * Exemples :
 *  - "Couple seul" → seuls les 2 mariés paient (50/50)
 *  - "Comité salle" → 8 personnes désignées
 *  - "Famille 60% / amis 30% / couple 10%" → pourcentages personnalisés
 */

export interface PresetConfig {
  participants: Array<{ userId: string; share?: number }>;
  paidByUserId?: string;
}

export interface CreatePresetInput {
  groupId: string;
  actorUserId: string;
  name: string;
  splitMode: SplitMode;
  config: PresetConfig;
}

export async function createPreset(input: CreatePresetInput) {
  const group = await getGroupForMember(input.groupId, input.actorUserId);

  // Valider que tous les userIds sont membres du groupe
  const memberIds = new Set(group.members.map((m) => m.userId));
  for (const p of input.config.participants) {
    if (!memberIds.has(p.userId)) {
      throw Errors.badRequest(`User ${p.userId} n'est pas membre du groupe`);
    }
  }
  if (input.config.paidByUserId && !memberIds.has(input.config.paidByUserId)) {
    throw Errors.badRequest(
      `Le payeur désigné n'est pas membre du groupe`,
    );
  }

  const name = input.name.trim();
  if (!name) throw Errors.badRequest("Nom du preset requis");

  return prisma.splitPreset.create({
    data: {
      groupId: input.groupId,
      name,
      splitMode: input.splitMode,
      config: input.config as unknown as Prisma.JsonObject,
    },
  });
}

export async function listPresets(input: {
  groupId: string;
  actorUserId: string;
}) {
  await getGroupForMember(input.groupId, input.actorUserId);
  return prisma.splitPreset.findMany({
    where: { groupId: input.groupId },
    orderBy: { createdAt: "desc" },
  });
}

export async function deletePreset(input: {
  presetId: string;
  actorUserId: string;
}) {
  const preset = await prisma.splitPreset.findUnique({
    where: { id: input.presetId },
  });
  if (!preset) throw Errors.notFound("Preset introuvable");
  await getGroupForMember(preset.groupId, input.actorUserId);

  await prisma.splitPreset.delete({ where: { id: input.presetId } });
  return { id: input.presetId };
}
