/**
 * Camera — capture photo (caméra) ou choix dans la galerie.
 *
 * Usage principal BMD : scan de tickets pour l'OCR (M14). L'utilisateur
 * tape sur le bouton "+", choisit "Scanner un ticket", l'app demande la
 * permission caméra, prend la photo, l'envoie en base64 à `/ocr/scan`.
 *
 * Permissions natives Phase 3 :
 *  iOS — `Info.plist` :
 *    NSCameraUsageDescription = "BMD utilise la caméra pour scanner tes tickets de caisse"
 *    NSPhotoLibraryUsageDescription = "BMD accède à tes photos pour importer un ticket existant"
 *
 *  Android — `AndroidManifest.xml` :
 *    <uses-permission android:name="android.permission.CAMERA" />
 *  (les permissions Photos sont gérées par le sélecteur natif Android 13+ sans
 *   permission explicite — Photo Picker)
 */

import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";

export interface CameraPhoto {
  /** Image en base64 (sans le préfixe `data:image/...`). À envoyer à l'API. */
  base64: string;
  /** Format détecté par le système. */
  format: "jpeg" | "png" | "webp";
  /** Dimensions originales (avant compression côté serveur). */
  width: number;
  height: number;
}

export const camera = {
  async capture(options?: { source?: "camera" | "gallery" }): Promise<CameraPhoto> {
    const source =
      options?.source === "gallery" ? CameraSource.Photos : CameraSource.Camera;

    const photo = await Camera.getPhoto({
      quality: 80,             // Compression côté natif pour réduire l'upload
      allowEditing: false,     // Pas de cropper natif — l'OCR backend gère
      resultType: CameraResultType.Base64,
      source,
      // Pour iOS : limite à 2048px max sur le côté le plus long, suffisant
      // pour un ticket lisible et économise la bande passante diaspora.
      width: 2048,
      correctOrientation: true,
      // En cas de refus, on remonte une erreur claire côté UI plutôt que de
      // crash. Le composant `<ScanReceiptModal>` doit catch et afficher
      // un message chaleureux ("Active la caméra dans Réglages › BMD").
      promptLabelHeader: "Scanner un ticket",
      promptLabelCancel: "Annuler",
      promptLabelPhoto: "Choisir dans la galerie",
      promptLabelPicture: "Prendre une photo",
    });

    return {
      base64: photo.base64String ?? "",
      format: (photo.format as "jpeg" | "png" | "webp") ?? "jpeg",
      // Dimensions exactes pas toujours fournies — défaut prudent.
      width: 0,
      height: 0,
    };
  },
};
