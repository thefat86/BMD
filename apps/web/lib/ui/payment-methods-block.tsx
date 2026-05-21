"use client";

/**
 * <PaymentMethodsBlock> · Vault de moyens de paiement (spec §9.1).
 *
 * Bloc à insérer dans le profil. Permet à l'utilisateur de :
 *  - Voir ses moyens sauvegardés (avec last4 uniquement)
 *  - Ajouter un moyen (chiffré côté serveur AES-256-GCM)
 *  - Révéler un moyen (avec <SecretField> anti-shoulder surfing)
 *  - Renommer / supprimer
 *
 * Le composant n'apparaît PAS si le serveur n'a pas configuré le vault
 * (PAYMENT_VAULT_KEY absente).
 *
 * UX multi-culturelle :
 *  - Catalogue de types adapté à chaque région (Mobile Money africains,
 *    options européennes, etc.)
 *  - Labels custom par l'utilisateur ("Mon Wave Sénégal" plutôt que "Wave 1")
 *  - Suggestions "Test rapide" : si l'user tape un IBAN, on devine, etc.
 */

import { useEffect, useRef, useState } from "react";
import { api } from "../api-client";
import { ApiErrorAlert } from "./api-error-alert";
import { SecretField } from "./secret-field";
import { useDialog } from "./dialog-provider";
import { useT } from "../i18n/app-strings";
// V52.C3 — SVG remplace EMOJI (icon registry V45)
import { Icon } from "./icons";

interface Method {
  id: string;
  type: string;
  typeLabel: string;
  typeEmoji: string;
  label: string;
  last4: string;
  defaultCurrency: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

// V52.C3 — SVG remplace EMOJI : on retire les emojis des labels d'options
// (les <option> HTML ne peuvent pas contenir de SVG, donc on garde du texte
// pur). Les marques de paiement restent reconnaissables par leur nom.
const TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "WAVE", label: "Wave" },
  { value: "ORANGE_MONEY", label: "Orange Money" },
  { value: "MTN_MOMO", label: "MTN MoMo" },
  { value: "MPESA", label: "M-Pesa" },
  { value: "AIRTEL_MONEY", label: "Airtel Money" },
  { value: "MOOV_MONEY", label: "Moov Money" },
  { value: "LYDIA", label: "Lydia" },
  { value: "WERO", label: "Wero" },
  { value: "WISE", label: "Wise" },
  { value: "REVOLUT", label: "Revolut" },
  { value: "PAYPAL", label: "PayPal" },
  { value: "TWINT", label: "TWINT" },
  { value: "INTERAC", label: "Interac" },
  { value: "IBAN", label: "IBAN / Virement" },
  { value: "OTHER", label: "Autre" },
];

export function PaymentMethodsBlock() {
  const t = useT();
  const dialog = useDialog();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [methods, setMethods] = useState<Method[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  // Add form
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState("WAVE");
  const [newValue, setNewValue] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [busy, setBusy] = useState(false);

  // Reveal cache (par méthode)
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState<string | null>(null);

  // Rename
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameLabel, setRenameLabel] = useState("");

  // V137 — Scan RIB OCR
  const [scanning, setScanning] = useState(false);
  const [scanWarning, setScanWarning] = useState<string | null>(null);
  // V137.F — UN SEUL bouton "Scanner mon RIB" qui révèle un mini-chooser
  // inline avec deux options : Caméra (capture) ou Importer (image/PDF).
  const [sourceChooserOpen, setSourceChooserOpen] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function load() {
    try {
      const cfg = await api.paymentMethodsConfig();
      setEnabled(cfg.enabled);
      if (cfg.enabled) {
        const r = await api.listMyPaymentMethods();
        setMethods(r);
      }
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function add() {
    setError(null);
    if (!newValue.trim() || !newLabel.trim()) {
      setError(
        new Error("Renseigne un nom et une valeur pour ce moyen de paiement."),
      );
      return;
    }
    setBusy(true);
    try {
      const created = await api.addPaymentMethod({
        type: newType,
        value: newValue,
        label: newLabel,
      });
      setMethods((prev) => [created, ...prev]);
      setAdding(false);
      setNewValue("");
      setNewLabel("");
      setNewType("WAVE");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  /**
   * V137.F — Rasterise la page 1 d'un PDF en image JPEG via pdfjs-dist.
   * pdfjs-dist est importé dynamiquement (≈300 KB) pour ne pas grossir le
   * bundle initial. Le worker est chargé depuis le CDN officiel Mozilla.
   *
   * Renvoie un dataURL JPEG prêt à être réutilisé par le flow image.
   */
  async function rasterizePdfFirstPage(file: File): Promise<string> {
    // V137.F.1 — Compat default-export ESM : Next.js peut wrapper le module
    // dans `.default`, ce qui rend getDocument/GlobalWorkerOptions invisibles.
    const mod = await import("pdfjs-dist");
    const pdfjs: any = (mod as any).default ?? mod;
    // Pointer le worker vers la même version (CDN unpkg).
    try {
      pdfjs.GlobalWorkerOptions.workerSrc = pdfjs.version
        ? `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
        : `https://unpkg.com/pdfjs-dist/build/pdf.worker.min.mjs`;
    } catch {
      /* certaines versions pdfjs n'exposent pas .version — on tente sans */
    }
    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buf }).promise;
    try {
      const page = await doc.getPage(1);
      // Scale 2x pour avoir une bonne résolution OCR (≈ 1600 px de large
      // pour un A4, ce qui correspond à la cible de compression image)
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D non disponible");
      // V137.F.1 — REMPLIR EN BLANC avant le rendu PDF. Sinon, pdfjs rend
      // avec transparence et JPEG ne supporte pas l'alpha → image NOIRE
      // qu'OpenAI ne sait pas lire. C'est LE bug principal qui faisait
      // passer tous les PDF en "image floue / pas un RIB".
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // V137.F.1 — l'API de render varie selon la version : depuis pdfjs v4
      // certaines builds attendent `canvas` au lieu de `canvasContext`. On
      // tente d'abord la signature historique, fallback sur la nouvelle.
      try {
        await page.render({ canvasContext: ctx, viewport }).promise;
      } catch (e) {
        await page.render({ canvas, viewport } as any).promise;
      }
      return canvas.toDataURL("image/jpeg", 0.92);
    } finally {
      try {
        doc.destroy?.();
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * V137 — Compresse une image client-side avant l'envoi à l'OCR.
   * Cible : ≤1600px côté max, JPEG q=0.85 → typiquement <500 KB.
   * Préserve l'orientation EXIF en passant par <img>.decode().
   */
  async function resizeImageToBase64(file: File): Promise<{
    base64: string;
    mimeType: "image/jpeg";
  }> {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error("Lecture image impossible"));
      reader.readAsDataURL(file);
    });
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const MAX = 1600;
    let { width, height } = img;
    if (width > MAX || height > MAX) {
      const ratio = Math.min(MAX / width, MAX / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D non disponible");
    ctx.drawImage(img, 0, 0, width, height);
    const jpeg = canvas.toDataURL("image/jpeg", 0.85);
    return {
      base64: jpeg.replace(/^data:image\/jpeg;base64,/, ""),
      mimeType: "image/jpeg",
    };
  }

  /**
   * V137.F — Conversion d'un dataURL JPEG en base64 + redimensionnement.
   * Utilisé après la rasterisation d'un PDF, qui produit déjà un dataURL.
   */
  async function resizeDataUrlToBase64(dataUrl: string): Promise<{
    base64: string;
    mimeType: "image/jpeg";
  }> {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const MAX = 1600;
    let { width, height } = img;
    if (width > MAX || height > MAX) {
      const ratio = Math.min(MAX / width, MAX / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D non disponible");
    ctx.drawImage(img, 0, 0, width, height);
    const jpeg = canvas.toDataURL("image/jpeg", 0.85);
    return {
      base64: jpeg.replace(/^data:image\/jpeg;base64,/, ""),
      mimeType: "image/jpeg",
    };
  }

  async function handleScanFile(file: File) {
    setError(null);
    setScanWarning(null);
    setSourceChooserOpen(false);

    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");
    const isImage = file.type.startsWith("image/");

    if (!isPdf && !isImage) {
      setError(
        new Error(
          t("paymentMethods.scanRib.errorNotImage") ||
            "Choisis une image (JPEG/PNG/WebP/HEIC) ou un PDF.",
        ),
      );
      return;
    }

    setScanning(true);
    try {
      // Route PDF → rasterisation page 1 puis flow image normal
      let base64: string;
      let mimeType: "image/jpeg";
      if (isPdf) {
        try {
          const dataUrl = await rasterizePdfFirstPage(file);
          ({ base64, mimeType } = await resizeDataUrlToBase64(dataUrl));
        } catch (pdfErr) {
          // pdfjs-dist pas installé ou PDF protégé/corrompu
          setError(
            new Error(
              t("paymentMethods.scanRib.pdfFailed") ||
                "Impossible de lire ce PDF. Essaie en prenant une photo ou un screenshot du document.",
            ),
          );
          return;
        }
      } else {
        ({ base64, mimeType } = await resizeImageToBase64(file));
      }

      // V137.F.1 — Garde-fou anti-canvas vide : si l'image générée fait
      // moins de ~3 KB, c'est très probablement un canvas blanc (PDF mal
      // rasterisé ou polices non embarquées). On alerte sans gaspiller un
      // appel OpenAI.
      // V181 — Log conditionné au dev (économise CPU + bruit Sentry en prod).
      if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.log("[ScanRIB] base64 size (chars):", base64.length, "mime:", mimeType, "isPdf:", isPdf);
      }
      if (base64.length < 3000) {
        setScanWarning(
          t("paymentMethods.scanRib.pdfFailed") ||
            "Impossible de lire ce PDF (page vide). Essaie en prenant une photo ou un screenshot du document.",
        );
        return;
      }

      const r = await api.ocrPaymentMethodRib({
        imageBase64: base64,
        mimeType,
      });

      // V137.F.1 — Trace en console pour faciliter le debug si l'OCR rate.
      // L'image n'est jamais loggée (RGPD), uniquement le résultat structuré.
      // V181 — Log conditionné au dev (économise CPU + bruit Sentry en prod).
      if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.log("[ScanRIB] OCR result:", r);
      }

      // V137.F.1 — On n'ouvre PAS le formulaire UNIQUEMENT si l'OCR n'a
      // rien trouvé d'exploitable. La confiance basse seule ne doit PAS
      // bloquer : si gpt-4o-mini retourne un IBAN avec confidence=0.4,
      // c'est mieux de l'afficher pré-rempli avec un warning que de
      // forcer l'user à tout retaper.
      const hasAny =
        r.iban || r.bic || r.holder || r.bank || r.phone || r.email;
      if (!hasAny) {
        setScanWarning(
          t("paymentMethods.scanRib.lowConfidence") ||
            "L'image ne ressemble pas à un RIB ou la photo est floue. Réessaie avec un cliché net du document complet.",
        );
        return;
      }

      // On ouvre/garde le form d'ajout et on pré-remplit
      setAdding(true);
      setNewType(r.type || "OTHER");
      // Valeur principale du PaymentMethod : on privilégie IBAN > phone > email > bic
      const primaryValue =
        r.iban ?? r.phone ?? r.email ?? r.bic ?? "";
      setNewValue(primaryValue);
      setNewLabel(r.suggestedLabel || "");

      // Si la validation modulo 97 a échoué, on prévient l'user
      if (r.type === "IBAN" && r.ibanValid === false) {
        setScanWarning(
          t("paymentMethods.scanRib.ibanInvalid") ||
            "L'IBAN détecté ne semble pas valide (clé de contrôle KO). Vérifie chaque chiffre avant de sauvegarder.",
        );
      } else if (r.confidence < 0.7) {
        setScanWarning(
          t("paymentMethods.scanRib.checkBeforeSave") ||
            "Vérifie les informations détectées avant de sauvegarder — la confiance OCR est moyenne.",
        );
      }
    } catch (e) {
      setError(e);
    } finally {
      setScanning(false);
      // Reset les inputs pour permettre de re-sélectionner le même fichier
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  }

  async function reveal(id: string) {
    if (revealed[id]) {
      // Re-cache (l'utilisateur veut re-masquer)
      const next = { ...revealed };
      delete next[id];
      setRevealed(next);
      return;
    }
    setRevealing(id);
    try {
      const r = await api.revealPaymentMethod(id);
      setRevealed((prev) => ({ ...prev, [id]: r.value }));
      // Auto-hide après 30 secondes pour ne pas laisser exposé
      setTimeout(() => {
        setRevealed((prev) => {
          const copy = { ...prev };
          delete copy[id];
          return copy;
        });
      }, 30_000);
    } catch (e) {
      setError(e);
    } finally {
      setRevealing(null);
    }
  }

  async function deleteOne(id: string, label: string) {
    const ok = await dialog.confirm(
      `Supprimer le moyen de paiement "${label}" ? Cette action est définitive.`,
      {
        variant: "danger",
        title: "Supprimer un moyen de paiement",
        confirmLabel: "Supprimer",
      },
    );
    if (!ok) return;
    try {
      await api.deletePaymentMethod(id);
      setMethods((prev) => prev.filter((m) => m.id !== id));
    } catch (e) {
      setError(e);
    }
  }

  async function rename(id: string) {
    if (!renameLabel.trim()) return;
    try {
      await api.renamePaymentMethod(id, renameLabel.trim());
      setMethods((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, label: renameLabel.trim() } : m,
        ),
      );
      setRenamingId(null);
      setRenameLabel("");
    } catch (e) {
      setError(e);
    }
  }

  if (loading || enabled === null) {
    return null; // pas la peine d'afficher quoi que ce soit pendant le chargement
  }

  if (!enabled) {
    return null; // masqué si vault non configuré côté serveur
  }

  return (
    <div className="card" style={{ marginTop: 20 }}>
      {/* V52.C3 — SVG remplace EMOJI (💳) */}
      <h2
        style={{
          marginTop: 0,
          fontSize: 16,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Icon
          name="credit-card"
          size={18}
          color="var(--saffron, #e8a33d)"
          strokeWidth={1.6}
        />
        <span>Mes moyens de paiement</span>
      </h2>
      <p className="muted" style={{ fontSize: 13 }}>
        Sauvegarde tes numéros de Mobile Money, IBAN ou comptes en ligne pour
        les retrouver rapidement lors des règlements. Tout est chiffré
        (AES-256-GCM) — seul toi peux voir la valeur en clair.
      </p>

      {error ? (
        <ApiErrorAlert error={error} onClose={() => setError(null)} />
      ) : null}

      {/* Liste des méthodes */}
      {methods.length > 0 && (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: "12px 0 0",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {methods.map((m) => (
            <li
              key={m.id}
              style={{
                padding: 12,
                background: "var(--overlay-2)",
                border: "1px solid var(--line-soft)",
                borderRadius: 10,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                  marginBottom: 6,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {/* V52.C3 — SVG remplace EMOJI : le backend renvoie un
                      `typeEmoji` lié au type de moyen de paiement. Côté UI
                      V45 on standardise sur l'icône credit-card pour rester
                      cohérent avec le reste de la palette outline. */}
                  <span
                    aria-hidden
                    style={{
                      display: "inline-flex",
                      color: "var(--saffron, #e8a33d)",
                    }}
                  >
                    <Icon
                      name="credit-card"
                      size={22}
                      color="currentColor"
                      strokeWidth={1.6}
                    />
                  </span>
                  <div>
                    {renamingId === m.id ? (
                      <div style={{ display: "flex", gap: 4 }}>
                        <input
                          value={renameLabel}
                          onChange={(e) => setRenameLabel(e.target.value)}
                          autoFocus
                          style={{
                            padding: "4px 8px",
                            fontSize: 12,
                            borderRadius: 6,
                            border: "1px solid var(--saffron)",
                            background: "var(--overlay-2)",
                            color: "var(--cream)",
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => rename(m.id)}
                          className="btn btn-sm"
                          style={{
                            padding: "4px 8px",
                            fontSize: 11,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                          aria-label="Valider"
                        >
                          {/* V52.C3 — SVG remplace EMOJI (✓) */}
                          <Icon
                            name="check"
                            size={14}
                            color="currentColor"
                            strokeWidth={2}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingId(null);
                            setRenameLabel("");
                          }}
                          className="btn-ghost btn-sm"
                          style={{
                            padding: "4px 8px",
                            fontSize: 11,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                          aria-label="Annuler"
                        >
                          {/* V52.C3 — SVG remplace EMOJI (✕) */}
                          <Icon
                            name="x"
                            size={14}
                            color="currentColor"
                            strokeWidth={2}
                          />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 13,
                            color: "var(--cream)",
                          }}
                        >
                          {m.label}
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            color: "var(--muted)",
                            letterSpacing: 1,
                          }}
                        >
                          {m.typeLabel}
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setRenamingId(m.id);
                      setRenameLabel(m.label);
                    }}
                    aria-label="Renommer"
                    title="Renommer"
                    className="btn-ghost btn-sm"
                    style={{
                      padding: "4px 8px",
                      fontSize: 11,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {/* V52.C3 — SVG remplace EMOJI (✏️) */}
                    <Icon
                      name="pencil"
                      size={14}
                      color="currentColor"
                      strokeWidth={1.6}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteOne(m.id, m.label)}
                    aria-label="Supprimer"
                    title="Supprimer"
                    className="btn-ghost btn-sm"
                    style={{
                      padding: "4px 8px",
                      fontSize: 11,
                      color: "#ef4444",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {/* V52.C3 — SVG remplace EMOJI (🗑️) */}
                    <Icon
                      name="trash-2"
                      size={14}
                      color="currentColor"
                      strokeWidth={1.6}
                    />
                  </button>
                </div>
              </div>

              {/* Affichage : last4 par défaut, valeur complète après reveal */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                {revealed[m.id] ? (
                  <SecretField value={revealed[m.id]!} copyable monospace />
                ) : (
                  <code
                    style={{
                      fontFamily: "ui-monospace, monospace",
                      fontSize: 14,
                      letterSpacing: 2,
                      padding: "4px 10px",
                      background: "rgba(232,163,61,0.06)",
                      borderRadius: 6,
                      color: "var(--cream-soft)",
                    }}
                  >
                    •••• {m.last4}
                  </code>
                )}
                <button
                  type="button"
                  onClick={() => reveal(m.id)}
                  disabled={revealing === m.id}
                  className="btn-ghost btn-sm"
                  style={{ padding: "4px 10px", fontSize: 11 }}
                  title={
                    revealed[m.id]
                      ? "Re-masquer"
                      : "Afficher la valeur complète (auto-masque après 30s)"
                  }
                >
                  {/* V52.C3 — SVG remplace EMOJI (🙈 / 👁️). Pas d'icône
                      eye au registry, on utilise lock (visible/masqué) */}
                  {revealing === m.id ? (
                    "…"
                  ) : (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Icon
                        name="lock"
                        size={12}
                        color="currentColor"
                        strokeWidth={1.6}
                      />
                      <span>
                        {revealed[m.id] ? t("common.hide") : t("common.show")}
                      </span>
                    </span>
                  )}
                </button>
                {m.lastUsedAt && (
                  <span
                    style={{
                      fontSize: 10,
                      color: "var(--muted)",
                      marginLeft: "auto",
                    }}
                  >
                    Dernière utilisation :{" "}
                    {new Date(m.lastUsedAt).toLocaleDateString("fr-FR")}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* V137.F — Deux inputs cachés : un pour la caméra (capture), un
          pour le file picker du téléphone/PC (image OU PDF). Le user clique
          sur un seul bouton "Scanner mon RIB" qui révèle un mini-chooser. */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleScanFile(f);
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleScanFile(f);
        }}
      />

      {/* V137 — Bannière d'alerte si scan dégradé. */}
      {scanWarning ? (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            background: "rgba(232,163,61,0.08)",
            border: "1px solid rgba(232,163,61,0.3)",
            borderRadius: 10,
            fontSize: 12,
            color: "var(--cream)",
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
          }}
        >
          <Icon
            name="sparkles"
            size={14}
            color="var(--saffron, #e8a33d)"
            strokeWidth={1.6}
          />
          <span style={{ flex: 1 }}>{scanWarning}</span>
          <button
            type="button"
            onClick={() => setScanWarning(null)}
            className="btn-ghost btn-sm"
            style={{ padding: 2, lineHeight: 0 }}
            aria-label="Fermer"
          >
            <Icon name="x" size={12} color="currentColor" strokeWidth={2} />
          </button>
        </div>
      ) : null}

      {/* Ajout */}
      {!adding ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              onClick={() => setSourceChooserOpen((v) => !v)}
              disabled={scanning}
              aria-expanded={sourceChooserOpen}
              className="btn btn-sm"
              style={{
                padding: "6px 14px",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background:
                  "linear-gradient(135deg, var(--saffron, #e8a33d), #c97a1a)",
                color: "#fff",
                border: "none",
              }}
              title={
                t("paymentMethods.scanRib.cta") ||
                "Scanner mon RIB pour pré-remplir automatiquement"
              }
            >
              {scanning ? (
                <>
                  <span
                    aria-hidden
                    style={{
                      width: 12,
                      height: 12,
                      border: "2px solid rgba(255,255,255,0.4)",
                      borderTopColor: "#fff",
                      borderRadius: "50%",
                      animation: "spin 0.8s linear infinite",
                    }}
                  />
                  <span>
                    {t("paymentMethods.scanRib.scanning") || "Analyse en cours…"}
                  </span>
                </>
              ) : (
                <>
                  <Icon
                    name="camera"
                    size={14}
                    color="currentColor"
                    strokeWidth={1.8}
                  />
                  <span>
                    {t("paymentMethods.scanRib.cta") || "Scanner mon RIB"}
                  </span>
                  {/* Petit chevron pour indiquer qu'un menu se déploie. */}
                  <span
                    aria-hidden
                    style={{
                      marginLeft: 2,
                      fontSize: 9,
                      transform: sourceChooserOpen
                        ? "rotate(180deg)"
                        : "rotate(0deg)",
                      transition: "transform 0.18s ease",
                      lineHeight: 1,
                    }}
                  >
                    ▾
                  </span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setAdding(true)}
              disabled={scanning}
              className="btn-ghost btn-sm"
              style={{ padding: "6px 14px" }}
            >
              ＋ {t("paymentMethods.addManual") || "Ajouter manuellement"}
            </button>
          </div>

          {/* V137.F — Mini-chooser inline révélé au clic sur "Scanner mon RIB" :
              deux cards (Caméra / Importer un fichier) sur la même ligne. */}
          {sourceChooserOpen && !scanning ? (
            <div
              role="menu"
              style={{
                marginTop: 8,
                padding: 10,
                background: "rgba(232,163,61,0.06)",
                border: "1px solid rgba(232,163,61,0.25)",
                borderRadius: 12,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
              }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setSourceChooserOpen(false);
                  cameraInputRef.current?.click();
                }}
                style={{
                  padding: 10,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  background: "var(--overlay-2)",
                  border: "1px solid var(--line-soft)",
                  borderRadius: 10,
                  color: "var(--cream)",
                  cursor: "pointer",
                  textAlign: "center",
                }}
                title={
                  t("paymentMethods.scanRib.takePhotoHint") ||
                  "Ouvre la caméra arrière pour photographier le RIB"
                }
              >
                <Icon
                  name="camera"
                  size={20}
                  color="var(--saffron, #e8a33d)"
                  strokeWidth={1.7}
                />
                <span style={{ fontSize: 12, fontWeight: 600 }}>
                  {t("paymentMethods.scanRib.takePhoto") || "Prendre en photo"}
                </span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setSourceChooserOpen(false);
                  fileInputRef.current?.click();
                }}
                style={{
                  padding: 10,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  background: "var(--overlay-2)",
                  border: "1px solid var(--line-soft)",
                  borderRadius: 10,
                  color: "var(--cream)",
                  cursor: "pointer",
                  textAlign: "center",
                }}
                title={
                  t("paymentMethods.scanRib.chooseFileHint") ||
                  "Sélectionne une image ou un PDF déjà sur ton appareil"
                }
              >
                <Icon
                  name="folder"
                  size={20}
                  color="var(--saffron, #e8a33d)"
                  strokeWidth={1.7}
                />
                <span style={{ fontSize: 12, fontWeight: 600 }}>
                  {t("paymentMethods.scanRib.chooseFile") ||
                    "Importer un fichier"}
                </span>
                <span style={{ fontSize: 9, color: "var(--muted)" }}>
                  {t("paymentMethods.scanRib.chooseFileSub") ||
                    "Image ou PDF"}
                </span>
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div
          style={{
            marginTop: 12,
            padding: 14,
            background: "rgba(232,163,61,0.05)",
            border: "1px solid rgba(232,163,61,0.2)",
            borderRadius: 10,
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 600,
              color: "var(--cream)",
              marginBottom: 10,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {/* V52.C3 — SVG remplace EMOJI (➕) */}
            <Icon
              name="plus"
              size={14}
              color="currentColor"
              strokeWidth={1.8}
            />
            <span>Nouveau moyen de paiement</span>
          </h3>

          {/* V137.F — Action rapide "Re-scanner" en haut du form d'ajout :
              ouvre le même mini-chooser (Caméra / Importer) pour cohérence. */}
          <div style={{ marginBottom: 10 }}>
            <button
              type="button"
              onClick={() => setSourceChooserOpen((v) => !v)}
              disabled={scanning}
              aria-expanded={sourceChooserOpen}
              className="btn-ghost btn-sm"
              style={{
                padding: "6px 12px",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
                border: "1px dashed var(--saffron, #e8a33d)",
                color: "var(--saffron, #e8a33d)",
                borderRadius: 8,
                background: "transparent",
              }}
              title={
                t("paymentMethods.scanRib.cta") ||
                "Scanner mon RIB pour pré-remplir"
              }
            >
              {scanning ? (
                <>
                  <span
                    aria-hidden
                    style={{
                      width: 10,
                      height: 10,
                      border: "2px solid var(--saffron, #e8a33d)",
                      borderTopColor: "transparent",
                      borderRadius: "50%",
                      animation: "spin 0.8s linear infinite",
                    }}
                  />
                  <span>
                    {t("paymentMethods.scanRib.scanning") || "Analyse en cours…"}
                  </span>
                </>
              ) : (
                <>
                  <Icon
                    name="camera"
                    size={12}
                    color="currentColor"
                    strokeWidth={1.8}
                  />
                  <span>
                    {t("paymentMethods.scanRib.cta") || "Scanner mon RIB"}
                  </span>
                  <span
                    aria-hidden
                    style={{
                      marginLeft: 2,
                      fontSize: 9,
                      transform: sourceChooserOpen
                        ? "rotate(180deg)"
                        : "rotate(0deg)",
                      transition: "transform 0.18s ease",
                      lineHeight: 1,
                    }}
                  >
                    ▾
                  </span>
                </>
              )}
            </button>

            {sourceChooserOpen && !scanning ? (
              <div
                role="menu"
                style={{
                  marginTop: 8,
                  padding: 8,
                  background: "rgba(232,163,61,0.05)",
                  border: "1px solid rgba(232,163,61,0.2)",
                  borderRadius: 10,
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 6,
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setSourceChooserOpen(false);
                    cameraInputRef.current?.click();
                  }}
                  style={{
                    padding: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    background: "var(--overlay-2)",
                    border: "1px solid var(--line-soft)",
                    borderRadius: 8,
                    color: "var(--cream)",
                    cursor: "pointer",
                    fontSize: 11,
                  }}
                >
                  <Icon
                    name="camera"
                    size={14}
                    color="var(--saffron, #e8a33d)"
                    strokeWidth={1.7}
                  />
                  <span>
                    {t("paymentMethods.scanRib.takePhoto") || "Prendre en photo"}
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setSourceChooserOpen(false);
                    fileInputRef.current?.click();
                  }}
                  style={{
                    padding: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    background: "var(--overlay-2)",
                    border: "1px solid var(--line-soft)",
                    borderRadius: 8,
                    color: "var(--cream)",
                    cursor: "pointer",
                    fontSize: 11,
                  }}
                >
                  <Icon
                    name="folder"
                    size={14}
                    color="var(--saffron, #e8a33d)"
                    strokeWidth={1.7}
                  />
                  <span>
                    {t("paymentMethods.scanRib.chooseFile") ||
                      "Importer un fichier"}
                  </span>
                </button>
              </div>
            ) : null}
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <label style={{ fontSize: 11, color: "var(--cream-soft)" }}>
              Type
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                style={{
                  display: "block",
                  marginTop: 4,
                  padding: "6px 10px",
                  width: "100%",
                  fontSize: 13,
                  background: "var(--overlay-2)",
                  border: "1px solid var(--line-soft)",
                  borderRadius: 8,
                  color: "var(--cream)",
                }}
              >
                {/* V52.C3 — SVG remplace EMOJI : <option> ne supportant pas le
                    rendu d'icônes SVG, on garde uniquement le label. */}
                {TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ fontSize: 11, color: "var(--cream-soft)" }}>
              Petit nom
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder='Ex: "Mon Wave Sénégal", "PayPal pro"…'
                maxLength={80}
                style={{
                  display: "block",
                  marginTop: 4,
                  padding: "6px 10px",
                  width: "100%",
                  fontSize: 13,
                  background: "var(--overlay-2)",
                  border: "1px solid var(--line-soft)",
                  borderRadius: 8,
                  color: "var(--cream)",
                }}
              />
            </label>

            <label style={{ fontSize: 11, color: "var(--cream-soft)" }}>
              Numéro / IBAN / Email
              <input
                type="text"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder={
                  newType === "IBAN"
                    ? "FR76 3000 4000…"
                    : newType === "PAYPAL"
                      ? "moi@exemple.com"
                      : "+221 77 123 45 67"
                }
                maxLength={120}
                style={{
                  display: "block",
                  marginTop: 4,
                  padding: "6px 10px",
                  width: "100%",
                  fontSize: 13,
                  fontFamily: "ui-monospace, monospace",
                  background: "var(--overlay-2)",
                  border: "1px solid var(--line-soft)",
                  borderRadius: 8,
                  color: "var(--cream)",
                }}
              />
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  marginTop: 4,
                  fontSize: 10,
                  color: "var(--muted)",
                  fontStyle: "italic",
                }}
              >
                {/* V52.C3 — SVG remplace EMOJI (🔒) */}
                <Icon
                  name="lock"
                  size={11}
                  color="currentColor"
                  strokeWidth={1.6}
                />
                <span>Cette valeur sera chiffrée (AES-256) avant d'être stockée</span>
              </span>
            </label>

            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={add}
                disabled={busy || !newValue || !newLabel}
                className="btn btn-sm"
                style={{
                  padding: "6px 14px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {/* V52.C3 — SVG remplace EMOJI (🔐) */}
                {!busy && (
                  <Icon
                    name="lock"
                    size={13}
                    color="currentColor"
                    strokeWidth={1.6}
                  />
                )}
                <span>{busy ? "Chiffrement…" : "Sauvegarder"}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setNewValue("");
                  setNewLabel("");
                  setError(null);
                }}
                className="btn-ghost btn-sm"
                style={{ padding: "6px 14px" }}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
