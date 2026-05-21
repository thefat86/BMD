/**
 * <image-preprocessor> · V42 — Optimisation image client-side avant scan OCR.
 *
 * Le scan facture restait lent (3-5 MB par image en 4G = 6s d'upload). Cette
 * couche fait 3 choses AVANT d'envoyer au backend :
 *  1. Auto-orientation EXIF (sinon les photos prises en mode portrait sortent
 *     pivotées à 90° et Mindee a du mal à les lire).
 *  2. Resize max 1600px sur le côté le plus long (les providers OCR
 *     downscalent eux-mêmes au-dessus de 1600px → aucune perte de précision).
 *  3. Re-compression JPEG quality 0.78 → divise le poids par 5-8x sans
 *     impact OCR perceptible.
 *
 * Résultat typique :
 *   - Input : photo iPhone 4032×3024, ~4.5 MB
 *   - Output : 1600×1200, ~420 KB, EXIF corrigé
 *   - Latence upload 4G : 6s → 0.8s (gain ~85%)
 *
 * On calcule aussi un **SHA-256 hash** du buffer optimisé pour l'anti-doublon
 * côté backend (deux photos identiques = même hash = doublon).
 *
 * Les PDF passent sans transformation (le pré-traitement image n'a pas de
 * sens, et `pdf-parse` côté serveur sait extraire le texte directement).
 */

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.78;
const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export interface PreprocessResult {
  /** Fichier optimisé (ou original si PDF / pas d'optimisation possible). */
  file: File;
  /** SHA-256 hex du buffer final — pour anti-doublon backend. */
  hash: string;
  /** Poids original en bytes. */
  originalSize: number;
  /** Poids final en bytes (post-compression). */
  finalSize: number;
  /** % de réduction (0-100). */
  reductionPct: number;
  /** True si on a effectivement compressé/redimensionné. */
  wasOptimized: boolean;
}

/**
 * Calcule SHA-256 hex d'un ArrayBuffer via Web Crypto API (dispo partout
 * sur les navigateurs modernes + Capacitor WebView).
 */
async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Charge une image et applique l'orientation EXIF si nécessaire. Utilise
 * `createImageBitmap` qui gère EXIF nativement depuis Safari 13.1, Chrome 90,
 * Firefox 77. Sur les vieux navigateurs, fallback `<img>` (sans EXIF, mais
 * la plupart des téléphones modernes n'écrivent plus l'EXIF de toute façon
 * — ils baked la rotation dans les pixels).
 */
async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(new Error("Image illisible: " + String(e)));
      };
      img.src = url;
    });
  }
}

function computeTargetSize(srcW: number, srcH: number) {
  const longSide = Math.max(srcW, srcH);
  if (longSide <= MAX_DIMENSION) return { w: srcW, h: srcH, scaled: false };
  const ratio = MAX_DIMENSION / longSide;
  return {
    w: Math.round(srcW * ratio),
    h: Math.round(srcH * ratio),
    scaled: true,
  };
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error("Canvas → Blob conversion échouée"));
      },
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

/**
 * Pipeline de pré-traitement complet. Retourne le fichier optimisé + son
 * hash SHA-256 pour anti-doublon. PDF et fichiers non-image passent tels
 * quels (mais on calcule quand même le hash).
 */
export async function preprocessReceiptFile(
  file: File,
): Promise<PreprocessResult> {
  const originalSize = file.size;
  const mime = file.type.toLowerCase();

  // PDF ou type inconnu → on laisse passer, on calcule juste le hash.
  if (!ALLOWED_IMAGE_MIMES.has(mime)) {
    const buf = await file.arrayBuffer();
    const hash = await sha256Hex(buf);
    return {
      file,
      hash,
      originalSize,
      finalSize: originalSize,
      reductionPct: 0,
      wasOptimized: false,
    };
  }

  // Charge l'image avec auto-EXIF
  const img = await loadImage(file);
  const srcW = "width" in img ? img.width : (img as HTMLImageElement).naturalWidth;
  const srcH =
    "height" in img ? img.height : (img as HTMLImageElement).naturalHeight;

  // Si très petit fichier (<300 KB) ET déjà <= 1600px → pas la peine de
  // re-compresser, on retourne tel quel mais on calcule le hash.
  if (originalSize < 300_000 && Math.max(srcW, srcH) <= MAX_DIMENSION) {
    const buf = await file.arrayBuffer();
    const hash = await sha256Hex(buf);
    return {
      file,
      hash,
      originalSize,
      finalSize: originalSize,
      reductionPct: 0,
      wasOptimized: false,
    };
  }

  const target = computeTargetSize(srcW, srcH);
  const canvas = document.createElement("canvas");
  canvas.width = target.w;
  canvas.height = target.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context indisponible");
  // Bonne qualité d'interpolation pour le downscale
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img as CanvasImageSource, 0, 0, target.w, target.h);

  // Libère le bitmap si on en a un
  if ("close" in img && typeof (img as ImageBitmap).close === "function") {
    (img as ImageBitmap).close();
  }

  const blob = await canvasToBlob(canvas);
  const buf = await blob.arrayBuffer();
  const hash = await sha256Hex(buf);

  // Renomme proprement (extension .jpg) pour que le backend détecte image/jpeg
  const cleanName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  const optimized = new File([blob], cleanName, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });

  const finalSize = optimized.size;
  const reductionPct =
    originalSize > 0
      ? Math.max(0, Math.round((1 - finalSize / originalSize) * 100))
      : 0;

  return {
    file: optimized,
    hash,
    originalSize,
    finalSize,
    reductionPct,
    wasOptimized: true,
  };
}

/**
 * Helper : formatage humain d'une taille (KB / MB).
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
