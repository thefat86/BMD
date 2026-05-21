/**
 * Service CMS (spec §6.7).
 *
 * Workflow d'édition :
 *  1. Admin crée une page (slug + title)
 *  2. Édite les blocs en `draftBlocks` (sauvegarde fréquente, atomique)
 *  3. Publie → `publishedBlocks = draftBlocks` + crée une `CmsPageVersion`
 *  4. Si problème → rollback vers une version précédente
 *
 * Validation des blocs :
 *  - Chaque bloc DOIT avoir un id (uuid) stable et un type connu
 *  - Le texte FR est obligatoire (langue de référence)
 *  - Les URLs (image src, button href) sont validées (pas de javascript:)
 *
 * Aucune dépendance npm — pure logique métier.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";

const KNOWN_TYPES = new Set([
  "heading",
  "paragraph",
  "image",
  "button",
  "divider",
  "quote",
]);

/**
 * Valide et normalise un tableau de blocs avant stockage.
 *
 * Mode `lenient` : utilisé pour les sauvegardes de DRAFT. On ne lève pas
 * d'erreur si un texte est vide ou une URL invalide — l'utilisateur est en
 * train de taper, on ne doit pas bloquer son auto-save toutes les 1.5s.
 * On nettoie juste les types inconnus et on garde les autres tels quels.
 *
 * Mode `strict` (par défaut) : utilisé à la PUBLICATION. Là on rejette
 * tout contenu invalide (texte FR vide, URL non sécurisée, etc.) — c'est
 * normal qu'on bloque la mise en ligne d'un truc cassé.
 *
 * Cette distinction règle un bug critique : avant, l'auto-save plantait
 * dès qu'on ajoutait un bloc heading vide (le user n'avait pas encore tapé
 * son texte) → la modif n'était jamais sauvegardée et le user était bloqué.
 */
export function validateBlocks(
  input: unknown,
  opts: { lenient?: boolean } = {},
): unknown[] {
  const lenient = opts.lenient === true;
  if (!Array.isArray(input)) {
    if (lenient) return [];
    throw Errors.invalidFormula({
      what: "le contenu de la page",
      why: "Les blocs doivent être un tableau JSON.",
      fix: "Réessaie l'enregistrement — si le souci persiste, contacte le support.",
    });
  }
  if (input.length > 200) {
    throw Errors.badRequest(
      "Une page CMS est limitée à 200 blocs (sécurité).",
      { tip: "Découpe en plusieurs pages si tu as plus de contenu." },
    );
  }

  const seenIds = new Set<string>();
  const out: any[] = [];
  for (let i = 0; i < input.length; i++) {
    const b = input[i];
    if (!b || typeof b !== "object") {
      if (lenient) continue; // On ignore les blocs cassés en draft
      throw Errors.invalidFormula({
        what: `le bloc #${i + 1}`,
        why: "Format invalide.",
        fix: "Recharge la page et réessaie.",
      });
    }
    const block = b as any;
    const id =
      typeof block.id === "string" && block.id.length > 0
        ? block.id
        : randomUUID();
    if (seenIds.has(id)) {
      if (lenient) continue; // Ignore le doublon en draft
      throw Errors.invalidFormula({
        what: `le bloc #${i + 1}`,
        why: "Identifiant dupliqué — probablement un copier-coller.",
        fix: "Supprime le doublon et réessaie.",
      });
    }
    seenIds.add(id);

    const type = String(block.type ?? "").toLowerCase();
    if (!KNOWN_TYPES.has(type)) {
      if (lenient) continue; // Ignore type inconnu en draft
      throw Errors.invalidFormula({
        what: `le bloc #${i + 1}`,
        why: `Type "${block.type}" non reconnu.`,
        fix: "Types disponibles : heading, paragraph, image, button, divider, quote.",
      });
    }

    // Validation par type. En mode lenient, on passe `allowEmpty=true` à
    // sanitizeLocalized pour que les textes vides soient OK le temps que
    // l'utilisateur tape. Et on tolère les URLs vides/invalides.
    const cleaned: any = { id, type };
    switch (type) {
      case "heading": {
        const lvl = Number(block.level);
        cleaned.level = lvl === 1 || lvl === 2 || lvl === 3 ? lvl : 2;
        cleaned.text = sanitizeLocalized(
          block.text,
          `bloc #${i + 1}`,
          lenient,
        );
        if (block.align) cleaned.align = block.align;
        break;
      }
      case "paragraph": {
        cleaned.text = sanitizeLocalized(
          block.text,
          `bloc #${i + 1}`,
          lenient,
        );
        if (block.align) cleaned.align = block.align;
        break;
      }
      case "image": {
        const src = String(block.src ?? "").trim();
        if (!lenient && !isSafeUrl(src)) {
          throw Errors.invalidFormula({
            what: `l'image du bloc #${i + 1}`,
            why: "URL invalide ou non sécurisée.",
            fix: "Utilise une URL https:// ou un chemin relatif (ex: /img/...).",
          });
        }
        cleaned.src = src;
        cleaned.alt = sanitizeLocalized(
          block.alt ?? { fr: "" },
          `alt du bloc #${i + 1}`,
          true,
        );
        if (block.caption) {
          cleaned.caption = sanitizeLocalized(
            block.caption,
            `légende du bloc #${i + 1}`,
            true,
          );
        }
        if (block.maxWidthPct) {
          const n = Number(block.maxWidthPct);
          cleaned.maxWidthPct =
            Number.isFinite(n) && n > 0 && n <= 100 ? Math.round(n) : 100;
        }
        break;
      }
      case "button": {
        const href = String(block.href ?? "").trim();
        if (!lenient && !isSafeUrl(href, true)) {
          throw Errors.invalidFormula({
            what: `le bouton du bloc #${i + 1}`,
            why: "URL de destination invalide ou non sécurisée.",
            fix: "Utilise https://, mailto: ou un chemin relatif (/contact).",
          });
        }
        cleaned.href = href;
        cleaned.label = sanitizeLocalized(
          block.label,
          `bouton du bloc #${i + 1}`,
          lenient,
        );
        cleaned.variant =
          block.variant === "ghost" || block.variant === "subtle"
            ? block.variant
            : "primary";
        if (block.newTab) cleaned.newTab = true;
        break;
      }
      case "divider": {
        cleaned.style =
          block.style === "dotted" || block.style === "stars"
            ? block.style
            : "solid";
        break;
      }
      case "quote": {
        cleaned.text = sanitizeLocalized(
          block.text,
          `citation du bloc #${i + 1}`,
          lenient,
        );
        if (block.author) cleaned.author = String(block.author).slice(0, 80);
        break;
      }
    }
    out.push(cleaned);
  }
  return out;
}

function sanitizeLocalized(
  raw: unknown,
  contextLabel: string,
  allowEmpty = false,
): { fr: string } & Record<string, string> {
  if (!raw || typeof raw !== "object") {
    if (allowEmpty) return { fr: "" };
    throw Errors.invalidFormula({
      what: contextLabel,
      why: "Le texte est manquant.",
      fix: "Au minimum la version française est requise.",
    });
  }
  const obj = raw as Record<string, unknown>;
  const fr = typeof obj.fr === "string" ? obj.fr : "";
  if (!fr && !allowEmpty) {
    throw Errors.invalidFormula({
      what: contextLabel,
      why: "Le texte français est obligatoire (c'est la langue de référence).",
      fix: 'Remplis au moins le champ "fr" avant de sauvegarder.',
    });
  }
  const cleaned: { fr: string } & Record<string, string> = { fr: fr.slice(0, 5000) };
  for (const [k, v] of Object.entries(obj)) {
    if (k === "fr") continue;
    if (typeof v === "string" && k.length <= 10) {
      cleaned[k] = v.slice(0, 5000);
    }
  }
  return cleaned;
}

function isSafeUrl(url: string, allowMailto = false): boolean {
  if (!url) return false;
  // Chemin relatif OK (commence par /)
  if (url.startsWith("/")) return true;
  // Anchor #
  if (url.startsWith("#")) return true;
  // mailto: si autorisé
  if (allowMailto && url.startsWith("mailto:")) return true;
  // tel: si autorisé
  if (allowMailto && url.startsWith("tel:")) return true;
  // https:// uniquement (refus http://, javascript:, data:, vbscript:…)
  if (url.startsWith("https://")) return true;
  return false;
}

// ============================================================
// CRUD pages
// ============================================================

export async function listPages(): Promise<
  Array<{
    id: string;
    slug: string;
    title: string;
    isActive: boolean;
    publishedAt: string | null;
    hasUnpublishedChanges: boolean;
    createdAt: string;
    updatedAt: string;
  }>
> {
  const pages = await prisma.cmsPage.findMany({
    orderBy: { updatedAt: "desc" },
  });
  return pages.map((p) => {
    const draft = JSON.stringify(p.draftBlocks ?? []);
    const pub = JSON.stringify(p.publishedBlocks ?? []);
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      isActive: p.isActive,
      publishedAt: p.publishedAt?.toISOString() ?? null,
      hasUnpublishedChanges: draft !== pub,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  });
}

export async function createPage(input: {
  slug: string;
  title: string;
}): Promise<{ id: string; slug: string; title: string }> {
  const slug = input.slug.toLowerCase().trim();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?$/.test(slug)) {
    throw Errors.invalidFormula({
      what: "le slug",
      why: "Le slug doit contenir uniquement des lettres minuscules, chiffres et tirets (3-42 caractères).",
      fix: 'Exemples valides : "about", "help", "terms-of-service".',
    });
  }
  const title = input.title.trim().slice(0, 120);
  if (title.length < 2) {
    throw Errors.badRequest("Le titre doit faire au moins 2 caractères.");
  }
  const existing = await prisma.cmsPage.findUnique({ where: { slug } });
  if (existing) {
    throw Errors.alreadyExists({
      what: `Une page avec le slug "${slug}"`,
      tip: "Choisis un autre slug ou édite la page existante.",
    });
  }
  const created = await prisma.cmsPage.create({
    data: {
      slug,
      title,
      draftBlocks: [],
      publishedBlocks: [],
    },
  });
  return { id: created.id, slug: created.slug, title: created.title };
}

export async function getPageForEdit(pageId: string): Promise<{
  id: string;
  slug: string;
  title: string;
  draftBlocks: unknown;
  publishedBlocks: unknown;
  publishedAt: string | null;
  isActive: boolean;
  hasUnpublishedChanges: boolean;
}> {
  const p = await prisma.cmsPage.findUnique({ where: { id: pageId } });
  if (!p) throw Errors.notFound("Cette page CMS est introuvable 🔍");
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    draftBlocks: p.draftBlocks,
    publishedBlocks: p.publishedBlocks,
    publishedAt: p.publishedAt?.toISOString() ?? null,
    isActive: p.isActive,
    hasUnpublishedChanges:
      JSON.stringify(p.draftBlocks) !== JSON.stringify(p.publishedBlocks),
  };
}

export async function saveDraft(input: {
  pageId: string;
  blocks: unknown;
  title?: string;
}): Promise<{ id: string; updatedAt: string }> {
  // Mode lenient : un draft peut contenir des champs vides — l'utilisateur
  // est en train d'éditer, on ne doit pas bloquer son auto-save toutes les
  // 1.5s. La validation stricte se fait à la PUBLICATION uniquement.
  const cleaned = validateBlocks(input.blocks, { lenient: true });
  const data: any = { draftBlocks: cleaned };
  if (input.title !== undefined) {
    data.title = input.title.trim().slice(0, 120);
  }
  const updated = await prisma.cmsPage.update({
    where: { id: input.pageId },
    data,
  });
  return { id: updated.id, updatedAt: updated.updatedAt.toISOString() };
}

export async function publishPage(input: {
  pageId: string;
  publisherId: string;
  note?: string;
}): Promise<{
  id: string;
  publishedAt: string;
  versionNumber: number;
}> {
  const page = await prisma.cmsPage.findUnique({
    where: { id: input.pageId },
  });
  if (!page) throw Errors.notFound("Cette page CMS est introuvable 🔍");

  // Valide STRICTEMENT avant publication (mode non-lenient = textes FR
  // requis, URLs sécurisées, etc.) — on ne met pas en ligne du contenu
  // cassé même si on l'a accepté en draft pendant l'édition.
  const cleaned = validateBlocks(page.draftBlocks);

  // Calcule le prochain numéro de version
  const last = await prisma.cmsPageVersion.findFirst({
    where: { pageId: input.pageId },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });
  const versionNumber = (last?.versionNumber ?? 0) + 1;

  const now = new Date();
  // Cast en `any` pour Prisma : les types Json générés sont stricts
  // (InputJsonObject n'accepte pas un Array directement) mais en pratique
  // Postgres jsonb accepte tableau ou objet. validateBlocks() garantit la
  // forme — on shortcut ici pour éviter une cascade de casts internes.
  const blocksJson = cleaned as any;
  await prisma.$transaction([
    prisma.cmsPage.update({
      where: { id: input.pageId },
      data: {
        publishedBlocks: blocksJson,
        draftBlocks: blocksJson, // garde draft = published après publish
        publishedAt: now,
        publishedById: input.publisherId,
      },
    }),
    prisma.cmsPageVersion.create({
      data: {
        pageId: input.pageId,
        versionNumber,
        blocks: blocksJson,
        note: input.note?.slice(0, 500),
        publishedById: input.publisherId,
        publishedAt: now,
      },
    }),
  ]);

  // Garde-fou : on ne conserve que les 30 dernières versions par page (purge soft)
  const all = await prisma.cmsPageVersion.findMany({
    where: { pageId: input.pageId },
    orderBy: { versionNumber: "desc" },
    select: { id: true, versionNumber: true },
  });
  if (all.length > 30) {
    const toDelete = all.slice(30).map((v) => v.id);
    await prisma.cmsPageVersion.deleteMany({
      where: { id: { in: toDelete } },
    });
  }

  return {
    id: input.pageId,
    publishedAt: now.toISOString(),
    versionNumber,
  };
}

export async function listVersions(pageId: string): Promise<
  Array<{
    id: string;
    versionNumber: number;
    note: string | null;
    publishedAt: string;
  }>
> {
  const versions = await prisma.cmsPageVersion.findMany({
    where: { pageId },
    orderBy: { versionNumber: "desc" },
    take: 30,
  });
  return versions.map((v) => ({
    id: v.id,
    versionNumber: v.versionNumber,
    note: v.note,
    publishedAt: v.publishedAt.toISOString(),
  }));
}

export async function revertToVersion(input: {
  pageId: string;
  versionId: string;
  publisherId: string;
}): Promise<{ id: string; restoredVersion: number; newVersionNumber: number }> {
  const v = await prisma.cmsPageVersion.findUnique({
    where: { id: input.versionId },
  });
  if (!v || v.pageId !== input.pageId) {
    throw Errors.notFound("Cette version est introuvable 🔍");
  }
  // On crée une NOUVELLE version (pas d'écrasement) : c'est le principe du
  // versioning. La version restaurée devient la dernière publiée.
  const last = await prisma.cmsPageVersion.findFirst({
    where: { pageId: input.pageId },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });
  const newVersionNumber = (last?.versionNumber ?? 0) + 1;
  const now = new Date();

  await prisma.$transaction([
    prisma.cmsPage.update({
      where: { id: input.pageId },
      data: {
        publishedBlocks: v.blocks as any,
        draftBlocks: v.blocks as any,
        publishedAt: now,
        publishedById: input.publisherId,
      },
    }),
    prisma.cmsPageVersion.create({
      data: {
        pageId: input.pageId,
        versionNumber: newVersionNumber,
        blocks: v.blocks as any,
        note: `Rollback vers v${v.versionNumber}`,
        publishedById: input.publisherId,
        publishedAt: now,
      },
    }),
  ]);

  return {
    id: input.pageId,
    restoredVersion: v.versionNumber,
    newVersionNumber,
  };
}

export async function deletePage(pageId: string): Promise<void> {
  // Cascade : versions liées supprimées via onDelete
  await prisma.cmsPage.delete({ where: { id: pageId } });
}

export async function setPageActive(input: {
  pageId: string;
  isActive: boolean;
}): Promise<void> {
  await prisma.cmsPage.update({
    where: { id: input.pageId },
    data: { isActive: input.isActive },
  });
}

// ============================================================
// Récupération publique
// ============================================================

export async function getPublishedPage(slug: string): Promise<{
  slug: string;
  title: string;
  blocks: unknown;
  publishedAt: string | null;
} | null> {
  const p = await prisma.cmsPage.findUnique({
    where: { slug: slug.toLowerCase().trim() },
  });
  if (!p) return null;
  if (!p.isActive) return null;
  if (!p.publishedAt) return null; // jamais publié
  return {
    slug: p.slug,
    title: p.title,
    blocks: p.publishedBlocks,
    publishedAt: p.publishedAt.toISOString(),
  };
}
