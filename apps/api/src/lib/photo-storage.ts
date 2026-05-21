/**
 * Photo storage abstraction — base64 inline (MVP) ou Cloudinary (prod).
 * --------------------------------------------------------------
 * Stratégie :
 *  - Mode "inline" (par défaut, MVP) : on stocke la data URL directement
 *    en BDD dans User.avatar. Simple, zéro dépendance externe, mais ne
 *    scale pas (DB row 200-500 KB par user avec photo).
 *  - Mode "cloudinary" (prod recommandé) : on upload l'image binaire chez
 *    Cloudinary, on stocke uniquement l'URL HTTPS retournée en BDD. Scale
 *    infini, CDN intégré, transformations à la volée (resize, format).
 *
 * Activation Cloudinary :
 *   1. Créer un compte gratuit sur cloudinary.com (10 GB stockage / 25 GB
 *      bande passante / mois inclus dans le free tier)
 *   2. Récupérer le `CLOUDINARY_URL` depuis le dashboard (format
 *      `cloudinary://api_key:api_secret@cloud_name`)
 *   3. Ajouter dans `.env` : CLOUDINARY_URL=cloudinary://...
 *   4. `npm install cloudinary --workspace=apps/api`
 *   5. Restart l'API : `storePhoto()` basculera auto sur Cloudinary
 *
 * Sécurité :
 *  - On limite la taille à 1 Mo (déjà vérifié côté Zod dans auth.routes.ts)
 *  - On vérifie le content-type côté serveur avant upload
 *  - Les URLs Cloudinary sont signées (pas d'upload public anonyme)
 */

const PHOTO_MAX_BYTES = 1_000_000;
const ALLOWED_MIMES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Stocke une photo et retourne l'URL/ressource à persister en BDD.
 *
 * @param dataUrl  String au format `data:image/jpeg;base64,xxx` OU URL HTTPS
 *                 (si déjà hébergée ailleurs, on ne re-upload pas)
 * @param userId   ID de l'utilisateur (utilisé comme tag/public_id Cloudinary)
 * @returns        URL HTTPS finale (Cloudinary) ou data URL (mode inline)
 */
export async function storePhoto(
  dataUrl: string,
  userId: string,
): Promise<string> {
  // Si c'est déjà une URL HTTPS (réupload d'une photo existante), on garde
  // tel quel — on ne re-télécharge pas inutilement.
  if (dataUrl.startsWith("http://") || dataUrl.startsWith("https://")) {
    return dataUrl;
  }

  // Vérif format data URL
  const match = dataUrl.match(/^data:(image\/(jpeg|png|webp));base64,(.+)$/);
  if (!match) {
    throw new Error(
      "Format de photo invalide (attendu data:image/jpeg;base64,...)",
    );
  }
  const mime = match[1]!;
  const base64 = match[3]!;

  if (!ALLOWED_MIMES.includes(mime)) {
    throw new Error(`Type MIME non supporté : ${mime}`);
  }

  // Estimation taille à partir du base64 (≈ 75% du raw binaire)
  const estimatedBytes = (base64.length * 3) / 4;
  if (estimatedBytes > PHOTO_MAX_BYTES) {
    throw new Error(
      `Photo trop lourde (~${Math.round(estimatedBytes / 1024)} KB, max ${PHOTO_MAX_BYTES / 1024} KB)`,
    );
  }

  // Si Cloudinary configuré → upload distant
  if (process.env.CLOUDINARY_URL) {
    return uploadToCloudinary(dataUrl, userId);
  }

  // Sinon → mode inline (on retourne la data URL telle quelle pour stockage BDD)
  return dataUrl;
}

/**
 * Supprime une photo du stockage distant (Cloudinary).
 * No-op en mode inline (la data URL est juste retirée de la BDD par le caller).
 */
export async function deletePhoto(currentUrl: string | null): Promise<void> {
  if (!currentUrl) return;
  if (!currentUrl.startsWith("http")) return; // mode inline → rien à faire côté serveur
  if (!process.env.CLOUDINARY_URL) return;
  // Extrait le public_id depuis l'URL Cloudinary :
  // https://res.cloudinary.com/{cloud}/image/upload/v123/bmd/avatars/{userId}.jpg
  try {
    const m = currentUrl.match(/\/upload\/(?:v\d+\/)?(.+?)\.(jpg|jpeg|png|webp)$/);
    if (!m) return;
    const publicId = m[1]!;
    const cloudinary = (await import("cloudinary")).v2;
    await cloudinary.uploader.destroy(publicId);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[photo-storage] delete failed:", e);
  }
}

async function uploadToCloudinary(dataUrl: string, userId: string): Promise<string> {
  try {
    const cloudinary = (await import("cloudinary")).v2;
    // L'init se fait via la variable d'env CLOUDINARY_URL (lue auto)
    const result = await cloudinary.uploader.upload(dataUrl, {
      folder: "bmd/avatars",
      public_id: userId,
      overwrite: true,
      resource_type: "image",
      // Transformation à l'upload : carré 512×512, qualité auto
      transformation: [
        { width: 512, height: 512, crop: "fill", gravity: "face" },
        { quality: "auto:good", fetch_format: "auto" },
      ],
      // Tags pour retrouver / clean / analytics
      tags: ["avatar", "user"],
    });
    return result.secure_url as string;
  } catch (err) {
    // Fallback gracieux : si Cloudinary down, on stocke en inline.
    // L'admin verra l'erreur dans les logs Sentry / pino.
    // eslint-disable-next-line no-console
    console.warn(
      "[photo-storage] Cloudinary upload failed, fallback inline:",
      err,
    );
    return dataUrl;
  }
}
