/**
 * A/B testing helpers (spec §6.9).
 *
 * Module léger pour assigner des users à des variants de manière sticky
 * (déterministe) et tracker les conversions. Utilisable depuis le scheduler
 * (weeklySummary, tontineReminder…) ou n'importe quelle route métier.
 *
 * Usage type :
 *   const variant = await assignVariant({
 *     testCode: "weekly_summary_subject_2026_05",
 *     userId,
 *   });
 *   if (variant?.payload.subject) emailSubject = variant.payload.subject as string;
 *
 *   // Plus tard, si l'user clique le CTA :
 *   await recordConversion({ testCode, userId });
 *
 * Stratégie d'assignation :
 *  - Si l'user est déjà assigné à ce test → retourne le variant existant
 *    (sticky, garantit cohérence sur plusieurs envois)
 *  - Sinon, hash(testCode + userId) % poidsTotal → variant déterministe
 *  - Tests draft/paused/completed → retourne null (pas de variant appliqué)
 */
import { createHash } from "node:crypto";
import { prisma } from "./db.js";

interface AssignedVariant {
  variantId: string;
  code: string;
  payload: Record<string, unknown>;
}

export async function assignVariant(input: {
  testCode: string;
  userId: string;
}): Promise<AssignedVariant | null> {
  const test = await prisma.abTest.findUnique({
    where: { code: input.testCode },
    include: { variants: { orderBy: { code: "asc" } } },
  });
  if (!test || test.status !== "running") return null;
  if (test.variants.length === 0) return null;

  // Already assigned ?
  const existing = await prisma.abTestAssignment.findUnique({
    where: { testId_userId: { testId: test.id, userId: input.userId } },
    include: { variant: true },
  });
  if (existing) {
    return {
      variantId: existing.variantId,
      code: existing.variant.code,
      payload:
        (existing.variant.payload as Record<string, unknown>) ?? {},
    };
  }

  // Hash deterministic → pick variant pondéré
  const hashHex = createHash("sha256")
    .update(`${test.id}:${input.userId}`)
    .digest("hex");
  const bucket = parseInt(hashHex.slice(0, 8), 16); // 32 bits unsigned
  const totalWeight = test.variants.reduce((s, v) => s + (v.weight || 1), 0);
  const target = bucket % totalWeight;
  let acc = 0;
  let chosen = test.variants[0];
  for (const v of test.variants) {
    acc += v.weight || 1;
    if (target < acc) {
      chosen = v;
      break;
    }
  }

  // Persiste l'assignation (idempotent grâce à @@unique)
  try {
    await prisma.abTestAssignment.create({
      data: {
        testId: test.id,
        variantId: chosen.id,
        userId: input.userId,
      },
    });
  } catch {
    // Race : une autre session a inseré entre temps — on relit
    const recheck = await prisma.abTestAssignment.findUnique({
      where: { testId_userId: { testId: test.id, userId: input.userId } },
      include: { variant: true },
    });
    if (recheck) {
      return {
        variantId: recheck.variantId,
        code: recheck.variant.code,
        payload: (recheck.variant.payload as Record<string, unknown>) ?? {},
      };
    }
  }

  return {
    variantId: chosen.id,
    code: chosen.code,
    payload: (chosen.payload as Record<string, unknown>) ?? {},
  };
}

/**
 * Marque un user comme ayant converti (cliqué le CTA, ouvert l'email, etc.)
 * Idempotent : 2e appel ne re-incrémente pas.
 */
export async function recordConversion(input: {
  testCode: string;
  userId: string;
}): Promise<void> {
  const test = await prisma.abTest.findUnique({
    where: { code: input.testCode },
    select: { id: true },
  });
  if (!test) return;
  const assignment = await prisma.abTestAssignment.findUnique({
    where: { testId_userId: { testId: test.id, userId: input.userId } },
  });
  if (!assignment || assignment.converted) return;
  await prisma.$transaction([
    prisma.abTestAssignment.update({
      where: { id: assignment.id },
      data: { converted: true, convertedAt: new Date() },
    }),
    prisma.abTestVariant.update({
      where: { id: assignment.variantId },
      data: { conversions: { increment: 1 } },
    }),
  ]);
}
