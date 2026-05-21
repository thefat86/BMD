"use client";

/**
 * <MobileQuickAddSheet> · V41.3 — GAME CHANGER de l'application.
 *
 * Le bouton "✨" du bottom-nav central est la signature de BMD. En 1 tap,
 * l'utilisateur peut créer une dépense via :
 *  - 📷 SCAN FACTURE — IA détecte montant + marchand + items
 *  - 🎙 PAROLE — IA transcrit + parse "60 euros pizza chez Carlo avec Léa"
 *
 * UX captivante pendant le scan/voice :
 *  - SCAN : preview caméra plein écran avec ligne laser animée + bulles IA
 *  - VOICE : waveform pulsant + texte transcrit en temps réel + halo signature
 *
 * Après la capture, BottomSheet de confirmation :
 *  - Montant + description (éditables, pré-remplis par IA)
 *  - Sélecteur de GROUPE (l'user choisit où la dépense sera créée)
 *  - Mode de split (4 options)
 *  - Bouton "Créer la dépense" → POST /groups/X/expenses
 *
 * Note : la création de GROUPE est volontairement EXCLUE de ce flow. Elle
 * se fait depuis l'onglet Groupes (FAB dédié). Le game-changer ne sert qu'à
 * créer des DÉPENSES en express.
 */

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { BottomSheet } from "./bottom-sheet";
import { api } from "../api-client";
import { useToast } from "./toast";
import { haptic } from "../platform";
import { useT } from "../i18n/app-strings";
import type { ParsedReceipt } from "./scan-receipt-modal";
// V52.C3 — SVG remplace EMOJI (icon registry V45)
import { Icon, type IconName } from "./icons";
import { SegmentedControl } from "./segmented-control";
// V130 — Le mode "review" du Quick Add délègue désormais au wizard complet
// (3 steps + confirm-before-close + ItemizedEditor + MultiPayersEditor)
// pour un parcours unifié partout dans l'app. Cf. mobile-add-expense-sheet.tsx.
import { MobileAddExpenseSheet } from "./mobile-add-expense-sheet";

// V41.4 — Lazy load. PremiumVoiceCapture utilise SYSTÉMATIQUEMENT le
// backend Whisper + OpenAI (qualité maximale, multilingue, dialectes).
const ScanReceiptModal = dynamic(
  () =>
    import("./scan-receipt-modal").then((m) => ({
      default: m.ScanReceiptModal,
    })),
  { ssr: false },
);
const PremiumVoiceCapture = dynamic(
  () =>
    import("./premium-voice-capture").then((m) => ({
      default: m.PremiumVoiceCapture,
    })),
  { ssr: false },
);

interface GroupLite {
  id: string;
  name: string;
  type?: string;
  defaultCurrency: string;
  members?: Array<{ user: { id: string; displayName: string }; role: string }>;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Optionnel : pré-sélectionne ce groupe si défini (cas où on ouvre le
   *  game-changer depuis la page d'un groupe). */
  defaultGroupId?: string;
}

// V62 — "manual" : mode saisie directe (l'utilisateur tape montant +
// description manuellement, peut attacher un PDF de justificatif optionnel).
// Le PDF n'est PAS scanné par IA — il est juste uploadé comme attachment
// après la création de la dépense (preuve / archivage).
type Mode = "chooser" | "voice" | "scan" | "manual" | "review";
type SplitMode = "EQUAL" | "UNEQUAL" | "PERCENTAGE" | "ITEMIZED";

// V52.C3 — SVG remplace EMOJI : map type → IconName du registry V45.
const GROUP_TYPE_ICON: Record<string, IconName> = {
  TONTINE: "coins", // 🪙
  COLOC: "home", // 🏠
  TRAVEL: "plane", // ✈️
  EVENT: "party-popper", // 🎉
  CLUB: "users", // ⚽
  PARISH: "users", // ⛪
  GENERIC: "users", // 👥
};

export function MobileQuickAddSheet({
  open,
  onClose,
  defaultGroupId,
}: Props) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();

  const [mode, setMode] = useState<Mode>("chooser");

  // Données captées
  const [parsedAmount, setParsedAmount] = useState("");
  const [parsedDescription, setParsedDescription] = useState("");
  const [parsedItems, setParsedItems] = useState<
    Array<{ description: string; quantity: number; unitPrice: string; totalPrice: string }>
  >([]);
  // V41.4 — Métadonnées IA pour feedback premium dans le review
  const [iaProvider, setIaProvider] = useState<
    "mindee" | "openai_vision" | "tesseract" | "whisper+openai" | null
  >(null);
  const [iaConfidence, setIaConfidence] = useState<number | null>(null);
  const [iaTranscript, setIaTranscript] = useState<string | null>(null);
  // V41.8 — File scanné conservé pour upload comme attachment après création
  const [scannedFile, setScannedFile] = useState<File | null>(null);
  // V42 — Hash SHA-256 du fichier scanné, propagé à createExpense pour
  // anti-doublon (stocké sur Expense.receiptHash).
  const [scannedHash, setScannedHash] = useState<string | null>(null);
  // V42 — Doublon potentiel détecté côté serveur (peut être null)
  const [duplicateOf, setDuplicateOf] = useState<{
    expenseId: string;
    description: string;
    amount: string;
    date: string;
  } | null>(null);

  // Liste des groupes pour le sélecteur
  const [groups, setGroups] = useState<GroupLite[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(
    defaultGroupId ?? null,
  );
  const [splitMode, setSplitMode] = useState<SplitMode>("EQUAL");
  const [submitting, setSubmitting] = useState(false);
  // V62 — Erreur inline dans le sheet (en plus du toast qui peut être caché
  // sous la BottomSheet sur certains viewports iOS).
  const [submitError, setSubmitError] = useState<string | null>(null);
  // V67 — Date de la dépense (par défaut aujourd'hui, format YYYY-MM-DD).
  const [expenseDate, setExpenseDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  );
  // V70 — Membres du groupe sélectionné (chargés via api.getGroup quand
  // l'utilisateur choisit un groupe). Utilisés par l'éditeur de shares.
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<
    Array<{ userId: string; displayName: string }>
  >([]);
  // V70 — Shares saisis pour UNEQUAL (montant) / PERCENTAGE (% 0-100).
  // Clé = userId, valeur = string brut input.
  const [shareValues, setShareValues] = useState<Record<string, string>>({});

  // Reset à l'ouverture
  useEffect(() => {
    if (!open) return;
    setMode("chooser");
    setParsedAmount("");
    setParsedDescription("");
    setParsedItems([]);
    setSelectedGroupId(defaultGroupId ?? null);
    setSplitMode("EQUAL");
    setIaProvider(null);
    setIaConfidence(null);
    setIaTranscript(null);
    setScannedFile(null);
    setScannedHash(null);
    setDuplicateOf(null);
    setSubmitError(null);
    setExpenseDate(new Date().toISOString().slice(0, 10));
    setSelectedGroupMembers([]);
    setShareValues({});
  }, [open, defaultGroupId]);

  // V70 — Charge les membres du groupe sélectionné dès qu'il change,
  // pour pouvoir afficher l'éditeur de shares (UNEQUAL / PERCENTAGE).
  useEffect(() => {
    if (!selectedGroupId) {
      setSelectedGroupMembers([]);
      return;
    }
    let cancelled = false;
    api
      .getGroup(selectedGroupId)
      .then((g) => {
        if (cancelled) return;
        const members = ((g?.members ?? []) as Array<{
          user: { id: string; displayName: string };
        }>).map((m) => ({
          userId: m.user.id,
          displayName: m.user.displayName,
        }));
        setSelectedGroupMembers(members);
        // V70 — Init shares à vide pour ce groupe (l'utilisateur saisira)
        setShareValues((prev) => {
          // Garde les valeurs déjà saisies si on revient sur le même groupe
          const next: Record<string, string> = {};
          for (const m of members) {
            next[m.userId] = prev[m.userId] ?? "";
          }
          return next;
        });
      })
      .catch(() => {
        if (!cancelled) setSelectedGroupMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedGroupId]);

  // Charge les groupes au passage en review
  useEffect(() => {
    if (mode !== "review" || groups.length > 0) return;
    setGroupsLoading(true);
    api
      .listGroups()
      .then((g) => {
        const list = g as GroupLite[];
        setGroups(list);
        // Si on n'a pas encore de groupe sélectionné, on prend le 1er
        if (!selectedGroupId && list[0]) {
          setSelectedGroupId(list[0].id);
        }
      })
      .catch(() => {
        toast.error(
          t("quickAdd.loadGroupsFailed") || "Chargement des groupes impossible",
        );
      })
      .finally(() => setGroupsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Quand l'OCR retourne
  function handleScanConfirm(
    receipt: ParsedReceipt & { provider?: string },
    file: File | null,
  ) {
    if (receipt.amount) setParsedAmount(receipt.amount);
    if (receipt.merchant) setParsedDescription(receipt.merchant);
    if (receipt.items && receipt.items.length > 0) {
      setParsedItems(receipt.items);
    }
    // V41.4 — Capture les métadonnées IA pour les afficher au review
    setIaProvider((receipt.provider as typeof iaProvider) ?? null);
    setIaConfidence(receipt.confidence ?? null);
    // V41.8 — Conserve le file scanné pour l'uploader comme attachment
    // après création réussie de la dépense (preuve facture).
    setScannedFile(file);
    // V42 — Hash & doublon potentiel renvoyés par le backend
    if ((receipt as any).receiptHash) {
      setScannedHash((receipt as any).receiptHash);
    }
    if ((receipt as any).potentialDuplicateOf) {
      setDuplicateOf((receipt as any).potentialDuplicateOf);
      // V52.C3 — SVG remplace EMOJI (⚠) : les toasts sont en texte brut,
      // on supprime l'emoji du fallback.
      toast.info(
        t("quickAdd.duplicateWarning") ||
          "Doublon possible — vérifie avant de valider.",
      );
    }
    haptic("success");
    setMode("review");
  }

  // V62 — Saisie manuelle : ouvre direct le review sans IA.
  // L'utilisateur tape montant + description, peut attacher un PDF
  // (stocké dans scannedFile pour upload après création de la dépense).
  function handlePickManual() {
    // Reset des champs IA pour partir clean
    setParsedAmount("");
    setParsedDescription("");
    setParsedItems([]);
    setIaProvider(null);
    setIaConfidence(null);
    setIaTranscript(null);
    // (on garde scannedFile/scannedHash si l'user vient de scanner avant)
    haptic("tap");
    setMode("review");
  }

  // V41.4 — Quand le Premium voice (Whisper + OpenAI) retourne
  function handleVoiceResult(result: {
    transcript: string;
    amount: string | null;
    description: string | null;
    confidence: number;
    source: "llm" | "heuristic";
    splitMode?: "EQUAL" | "UNEQUAL" | "PERCENTAGE" | "ITEMIZED" | null;
  }) {
    if (result.amount) setParsedAmount(result.amount);
    if (result.description) setParsedDescription(result.description);
    if (result.splitMode) setSplitMode(result.splitMode);
    setIaProvider("whisper+openai");
    setIaConfidence(result.confidence);
    setIaTranscript(result.transcript);
    haptic("success");
    setMode("review");
  }

  async function submit() {
    if (submitting) return;
    setSubmitError(null);
    if (!selectedGroupId) {
      const msg =
        t("quickAdd.pickGroupFirst") || "Choisis d'abord un groupe";
      setSubmitError(msg);
      toast.info(msg);
      return;
    }
    const amount = parseFloat(parsedAmount.replace(",", ".")) || 0;
    if (amount <= 0) {
      const msg =
        t("quickAdd.amountRequired") || "Saisis un montant valide";
      setSubmitError(msg);
      toast.info(msg);
      return;
    }
    setSubmitting(true);
    try {
      // V41.6 FIX — `api.listGroups()` ne retourne PAS la liste des membres
      // (seulement `membersCount`). Donc on doit explicitement charger le
      // détail du groupe avec `api.getGroup(id)` pour récupérer les
      // `members[].user.id` à envoyer dans `participants`. Sinon le backend
      // reçoit `participants: []` et rejette la création.
      const groupDetail = await api.getGroup(selectedGroupId);
      const members = (groupDetail?.members ?? []) as Array<{
        user: { id: string };
      }>;
      if (members.length === 0) {
        throw new Error(
          t("quickAdd.noMembers") ||
            "Ce groupe n'a aucun membre — impossible de créer une dépense.",
        );
      }
      // V70 — Construit les participants selon le splitMode.
      // EQUAL : tous les membres, pas de share saisi.
      // UNEQUAL : share = montant en devise saisi pour chaque membre.
      // PERCENTAGE : share = % saisi (0-100) pour chaque membre.
      // ITEMIZED : tous les membres, items éditables après création.
      let participants: Array<{ userId: string; share?: number }>;
      if (splitMode === "UNEQUAL" || splitMode === "PERCENTAGE") {
        // Ne garde que les membres avec une valeur > 0 saisie
        participants = members
          .map((m) => {
            const raw = (shareValues[m.user.id] ?? "")
              .toString()
              .replace(",", ".");
            const v = parseFloat(raw);
            return Number.isFinite(v) && v > 0
              ? { userId: m.user.id, share: v }
              : null;
          })
          .filter(
            (p): p is { userId: string; share: number } => p !== null,
          );
        if (participants.length === 0) {
          throw new Error(
            t("quickAdd.noShareInputs") ||
              "Saisis au moins un montant ou pourcentage par membre.",
          );
        }
        if (splitMode === "PERCENTAGE") {
          const totalPct = participants.reduce(
            (acc, p) => acc + p.share!,
            0,
          );
          if (Math.abs(totalPct - 100) > 0.5) {
            throw new Error(
              t("quickAdd.percentMustBe100") ||
                `La somme des pourcentages doit faire 100% (actuellement ${totalPct.toFixed(1)}%).`,
            );
          }
        } else {
          // UNEQUAL : la somme des montants doit matcher le total
          const totalShares = participants.reduce(
            (acc, p) => acc + p.share!,
            0,
          );
          if (Math.abs(totalShares - amount) > 0.01) {
            throw new Error(
              t("quickAdd.amountsMustMatch") ||
                `La somme des montants (${totalShares.toFixed(2)}) doit égaler le total (${amount.toFixed(2)}).`,
            );
          }
        }
      } else {
        // EQUAL ou ITEMIZED : tous les membres participent, parts égales calculées backend
        participants = members.map((m) => ({ userId: m.user.id }));
      }
      const expense = await api.createExpense(selectedGroupId, {
        description: parsedDescription.trim() || "Dépense",
        amount: amount.toFixed(2),
        splitMode,
        participants,
        // V42 — Hash facture scannée pour anti-doublon
        ...(scannedHash ? { receiptHash: scannedHash } : {}),
        // V67 — Date saisie par l'utilisateur (format ISO complet attendu)
        ...(expenseDate
          ? { occurredAt: new Date(expenseDate + "T12:00:00").toISOString() }
          : {}),
      });
      // Si ITEMIZED + items détectés par OCR : persister
      if (splitMode === "ITEMIZED" && parsedItems.length > 0 && expense?.id) {
        await api.setExpenseItems(expense.id, parsedItems).catch(() => {
          /* best-effort — la dépense est déjà créée */
        });
      }

      // V41.8 — Si l'utilisateur a SCANNÉ une facture, on l'upload comme
      // attachment kind=RECEIPT pour qu'elle soit conservée comme preuve.
      // Best-effort : si l'upload échoue (quota plein, fichier trop gros),
      // la dépense reste créée et l'utilisateur peut ré-ajouter la facture
      // manuellement depuis la page de la dépense.
      if (scannedFile && expense?.id) {
        await api
          .uploadAttachment(expense.id, scannedFile, { kind: "RECEIPT" })
          .catch((e) => {
            // eslint-disable-next-line no-console
            console.warn("[quick-add] upload facture échoué", e);
            toast.info(
              t("quickAdd.receiptUploadFailed") ||
                "Dépense créée, mais la facture n'a pas pu être attachée.",
            );
          });
      }

      haptic("success");
      toast.success(
        t("quickAdd.expenseCreated") || "Dépense créée — bravo !",
      );
      onClose();
      // Redirige vers le groupe pour voir la nouvelle dépense en haut du feed
      router.push(`/dashboard/groups/${selectedGroupId}`);
    } catch (e) {
      haptic("error");
      // V41.6 FIX — `toast.error(e)` reçoit un Error. Si c'est un ApiError
      // avec message structuré, on l'affiche tel quel.
      const msg =
        e instanceof Error
          ? e.message
          : t("quickAdd.createFailed") || "Création impossible";
      // V62 — Affiche AUSSI inline (les toasts iOS peuvent être cachés sous
      // la BottomSheet selon le viewport).
      setSubmitError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  // === RENDER ===
  return (
    <>
      {/* V63 — CHOOSER PLEIN ÉCRAN FUTURISTE :
          Au lieu d'un BottomSheet, on rend un overlay plein écran avec :
          - Fond ivory + halo radial qui pulse
          - Orb central animé (rotation lente + glow saffron)
          - 3 cards qui apparaissent en stagger avec un effet "lift"
          - Backdrop blur derrière les cards (glassmorphism)
          - Animation d'entrée slide-up smooth
          Le BottomSheet est conservé pour les autres modes (voice/review/scan). */}
      {open && mode === "chooser" && (
        <ChooserOverlay
          onClose={() => {
            if (submitting) return;
            onClose();
          }}
          onPickVoice={() => setMode("voice")}
          onPickScan={() => setMode("scan")}
          onPickManual={handlePickManual}
          t={t}
        />
      )}

      {/* V130 — Mode "voice" : le BottomSheet du Quick Add reste pour la
          capture vocale (Whisper). Une fois la voix transcrite, on passe
          en mode "review" qui DÉLÈGUE désormais au wizard complet
          (MobileAddExpenseSheet) rendu ci-dessous. */}
      <BottomSheet
        open={open && mode === "voice"}
        onClose={() => {
          if (submitting) return;
          onClose();
        }}
        title={t("quickAdd.voiceTitle") || "Parle, j'écoute…"}
      >
        {mode === "voice" && (
          <PremiumVoiceCapture
            language="fr"
            groupId={selectedGroupId ?? defaultGroupId}
            onResult={handleVoiceResult}
            onCancel={() => setMode("chooser")}
          />
        )}
      </BottomSheet>

      {/* V130 — Mode "review" délégué au wizard complet partagé. Au lieu
          d'un mini-formulaire ReviewContent, on rend MobileAddExpenseSheet
          avec :
            - groupId={defaultGroupId ?? null} → step 0 picker si pas de
              groupe pré-sélectionné
            - initial={...} avec les valeurs IA pré-remplies (montant,
              description, items pour ITEMIZED, scannedFile/Hash pour
              upload + anti-doublon, splitMode déduit du voice).
          Bénéfices : confirm-before-close (V124), ItemizedEditor inline,
          MultiPayersEditor, 4 splitModes, sélection multi-payeurs, date
          d'occurrence, catégorie. UX 100 % unifié avec le wizard du
          groupe. */}
      <MobileAddExpenseSheet
        open={open && mode === "review"}
        onClose={() => {
          // Le wizard gère son propre confirm-before-close ; ici on
          // ferme aussi le Quick Add pour repartir au chooser au
          // prochain ouvrage.
          if (submitting) return;
          onClose();
        }}
        groupId={defaultGroupId ?? null}
        onCreated={() => {
          // Wizard a réussi → on ferme tout et on laisse le router
          // décider (la page courante refetch via SSE / refresh).
          onClose();
        }}
        initial={{
          amount: parsedAmount,
          description: parsedDescription,
          splitMode: parsedItems.length > 0 ? "ITEMIZED" : splitMode,
          items:
            parsedItems.length > 0
              ? parsedItems.map((it) => ({
                  description: it.description,
                  quantity: it.quantity,
                  unitPrice: it.unitPrice,
                  totalPrice: it.totalPrice,
                }))
              : undefined,
          scannedFile,
          scannedHash,
        }}
      />

      {/* Le scan modal prend tout l'écran avec caméra → on le rend
          séparément, hors BottomSheet */}
      <ScanReceiptModal
        open={open && mode === "scan"}
        onClose={() => setMode("chooser")}
        onConfirm={handleScanConfirm}
        scanFn={async (file, hash) => {
          // On scanne sans groupId (général) — backend acceptera null
          // V42 — Hash SHA-256 propagé pour anti-doublon backend
          const r = await api.scanReceipt(file, undefined, hash);
          return r as ParsedReceipt;
        }}
      />
    </>
  );
}

// ============ CHOOSER V63 : OVERLAY PLEIN ÉCRAN FUTURISTE ============
//
// Refonte radicale : au lieu d'un BottomSheet listé, c'est maintenant une
// expérience IMMERSIVE plein écran avec :
//  - Backdrop ivory + grain texture + 3 halos radials colorés qui pulsent
//  - Orb central "BMD AI" qui rotation lente + glow saffron
//  - 3 cards glassmorphism qui apparaissent en cascade staggered
//  - Effet "lift" : les cards remontent quand on les survole
//  - Bouton close orbital en haut à droite
//  - Tagline poétique au-dessus de l'orb
//
// L'utilisateur ressent : "BMD est un cerveau IA qui m'attend, je choisis
// comment je veux lui parler". Effet WOW garanti.

/**
 * V64 — RADIAL ORBITAL MENU MAGIQUE
 *
 * Pas de plein écran : juste un backdrop semi-transparent flou avec :
 *  - 1 boule BMD centrale (saffron + sparkle, rotation lente + pulse)
 *  - 3 satellites (camera/mic/pencil) qui orbitent autour à 110-130px du centre
 *  - Anneau orbital dashed qui tourne en arrière-plan
 *  - Chaque satellite oscille légèrement (mouvement organique "respiration")
 *
 * Au tap sur un satellite :
 *  - Le détail (titre + description) apparaît dans une carte sous l'orbite
 *  - Bouton "Continuer" pour lancer scan/voice/manuel
 *  - Bouton "Retour" pour revenir à l'orbite
 *
 * Tap sur le backdrop ou le bouton close ferme l'overlay.
 */

type OrbitOption = "scan" | "voice" | "manual";

interface OrbitConfig {
  key: OrbitOption;
  iconName: IconName;
  /** Angle de départ en degrés (12h = -90, 4h = 30, 8h = 150) */
  angle: number;
  color: string;
  gradient: string;
  glow: string;
  delay: string;
  titleKey: string;
  titleFallback: string;
  subtitleKey: string;
  subtitleFallback: string;
  ctaKey: string;
  ctaFallback: string;
}

function ChooserOverlay({
  onClose,
  onPickVoice,
  onPickScan,
  onPickManual,
  t,
}: {
  onClose: () => void;
  onPickVoice: () => void;
  onPickScan: () => void;
  onPickManual: () => void;
  t: ReturnType<typeof useT>;
}) {
  const [selected, setSelected] = useState<OrbitOption | null>(null);

  const orbits: OrbitConfig[] = [
    {
      key: "scan",
      iconName: "camera",
      angle: -90, // 12h
      color: "#C58A2E",
      gradient: "linear-gradient(135deg, #E8A33D 0%, #C58A2E 100%)",
      glow: "0 8px 24px rgba(197,138,46,0.45)",
      delay: "0.20s",
      titleKey: "quickAdd.scanCardTitle",
      titleFallback: "Scanner une facture",
      subtitleKey: "quickAdd.scanCardBody",
      subtitleFallback:
        "L'IA lit montant, marchand et chaque article",
      ctaKey: "quickAdd.scanCta",
      ctaFallback: "Ouvrir la caméra",
    },
    {
      key: "voice",
      iconName: "mic",
      angle: 30, // 4h
      color: "#4458B5",
      gradient: "linear-gradient(135deg, #5B6CFF 0%, #4458B5 100%)",
      glow: "0 8px 24px rgba(91,108,255,0.40)",
      delay: "0.30s",
      titleKey: "quickAdd.voiceCardTitle",
      titleFallback: "Parler à BMD",
      subtitleKey: "quickAdd.voiceCardBody",
      subtitleFallback:
        "« 25 € pizza chez Mario avec Léa et Hugo »",
      ctaKey: "quickAdd.voiceCta",
      ctaFallback: "Activer le micro",
    },
    {
      key: "manual",
      iconName: "pencil",
      angle: 150, // 8h
      color: "#1F7A57",
      gradient: "linear-gradient(135deg, #4F8E6E 0%, #1F7A57 100%)",
      glow: "0 8px 24px rgba(31,122,87,0.40)",
      delay: "0.40s",
      titleKey: "quickAdd.manualCardTitle",
      titleFallback: "Saisie manuelle",
      subtitleKey: "quickAdd.manualCardBody",
      subtitleFallback:
        "Tape les infos ou attache un PDF de justificatif",
      ctaKey: "quickAdd.manualCta",
      ctaFallback: "Commencer",
    },
  ];

  const RADIUS = 120; // distance satellites au centre
  const SAT_SIZE = 64; // taille du bouton satellite

  function handleSatTap(key: OrbitOption) {
    haptic("tap");
    setSelected(key);
  }

  function handleConfirm() {
    if (selected === "scan") onPickScan();
    else if (selected === "voice") onPickVoice();
    else if (selected === "manual") onPickManual();
  }

  const selectedConf = orbits.find((o) => o.key === selected);

  // V65 — Les 3 satellites sont placés à 0°, 120°, 240° dans un container
  // qui rotation. Pour qu'ils gravitent VRAIMENT, on calcule leur position
  // via `transform: rotate(angle) translateX(R)` sur le container, et
  // on contre-rotation chaque satellite pour qu'il reste droit.
  const ORBIT_ANGLES = [0, 120, 240]; // 3 satellites espacés à 120°

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("quickAdd.title") || "Ajout express"}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          haptic("tap");
          onClose();
        }
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        // V65 — Pas de gris/blur opaque. Juste un halo radial subtil qui
        // émane du centre, comme un "champ magnétique" sans bloquer la vue.
        background:
          "radial-gradient(circle at 50% 40%, rgba(232,163,61,0.18) 0%, rgba(91,108,255,0.10) 30%, transparent 65%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        animation: "bmd-magic-fadein 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
        paddingTop: "env(safe-area-inset-top, 0px)",
        overflow: "hidden",
      }}
    >
      <style jsx global>{`
        @keyframes bmd-magic-fadein {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        /* Orbites en gravitation réelle : le container tourne, les satellites
           sont dedans à une position fixe et contre-tournent pour rester droits. */
        @keyframes bmd-gravitate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes bmd-gravitate-counter {
          from { transform: rotate(0deg); }
          to { transform: rotate(-360deg); }
        }
        @keyframes bmd-orb-pulse {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.06);
          }
        }
        @keyframes bmd-orb-shine {
          0%, 100% {
            box-shadow:
              0 0 60px 10px rgba(232, 163, 61, 0.55),
              0 0 30px rgba(232, 163, 61, 0.45),
              0 14px 36px rgba(197, 138, 46, 0.45),
              inset 0 2px 14px rgba(255, 255, 255, 0.55);
          }
          50% {
            box-shadow:
              0 0 100px 18px rgba(232, 163, 61, 0.75),
              0 0 50px rgba(232, 163, 61, 0.65),
              0 16px 40px rgba(197, 138, 46, 0.55),
              inset 0 2px 14px rgba(255, 255, 255, 0.65);
          }
        }
        @keyframes bmd-orb-wobble {
          0%, 100% { transform: translate(0, 0); }
          25% { transform: translate(4px, -3px); }
          50% { transform: translate(-3px, 4px); }
          75% { transform: translate(2px, 2px); }
        }
        @keyframes bmd-aura {
          0%, 100% {
            opacity: 0.35;
            transform: translate(-50%, -50%) scale(1);
          }
          50% {
            opacity: 0.6;
            transform: translate(-50%, -50%) scale(1.15);
          }
        }
        @keyframes bmd-aura-slow {
          0%, 100% {
            opacity: 0.20;
            transform: translate(-50%, -50%) scale(1.2);
          }
          50% {
            opacity: 0.45;
            transform: translate(-50%, -50%) scale(1);
          }
        }
        @keyframes bmd-spark-twinkle {
          0%, 100% { opacity: 0; transform: scale(0.6); }
          50% { opacity: 1; transform: scale(1); }
        }
        @keyframes bmd-trail {
          0%, 100% { opacity: 0; }
          50% { opacity: 0.45; }
        }
        @keyframes bmd-satellite-pop {
          from {
            opacity: 0;
            scale: 0;
          }
          to {
            opacity: 1;
            scale: 1;
          }
        }
        @keyframes bmd-detail-pop {
          from {
            opacity: 0;
            transform: translateY(16px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .bmd-orbit-arm {
          animation: bmd-gravitate 16s linear infinite;
          transform-origin: center center;
        }
        .bmd-orbit-arm-counter {
          animation: bmd-gravitate-counter 16s linear infinite;
          transform-origin: center center;
        }
        .bmd-satellite-pop {
          opacity: 0;
          scale: 0;
          animation: bmd-satellite-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)
            forwards;
        }
      `}</style>

      {/* === 1. PARTICULES MAGIQUES (étoiles scintillantes) === */}
      {Array.from({ length: 14 }).map((_, i) => {
        const seed = (i * 37) % 100;
        const top = 5 + ((i * 7) % 65); // 5-70% top
        const left = (i * 13.7) % 95; // 0-95% left
        const dur = 2.5 + (seed % 25) / 10; // 2.5-5s
        const delay = (seed % 30) / 10; // 0-3s
        const size = 3 + (i % 4); // 3-6px
        return (
          <div
            key={i}
            aria-hidden
            style={{
              position: "absolute",
              top: `${top}%`,
              left: `${left}%`,
              width: size,
              height: size,
              borderRadius: "50%",
              background:
                i % 3 === 0
                  ? "radial-gradient(circle, #FFE6A8, transparent)"
                  : i % 3 === 1
                    ? "radial-gradient(circle, #C9D3FF, transparent)"
                    : "radial-gradient(circle, #FFFFFF, transparent)",
              animation: `bmd-spark-twinkle ${dur}s ease-in-out infinite`,
              animationDelay: `${delay}s`,
              pointerEvents: "none",
              filter: "blur(0.3px)",
            }}
          />
        );
      })}

      {/* === 2. CLOSE BUTTON top-right === */}
      <button
        type="button"
        onClick={() => {
          haptic("tap");
          onClose();
        }}
        aria-label={t("common.close") || "Fermer"}
        style={{
          position: "absolute",
          top: "calc(env(safe-area-inset-top, 0px) + 14px)",
          right: 14,
          zIndex: 20,
          width: 38,
          height: 38,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(197,138,46,0.25)",
          color: "#2B1F15",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          fontFamily: "inherit",
          touchAction: "manipulation",
          WebkitTapHighlightColor: "transparent",
          boxShadow: "0 6px 20px rgba(197,138,46,0.30)",
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>

      {/* === 3. ZONE ORBITALE (centrée au tiers supérieur) === */}
      <div
        style={{
          position: "relative",
          marginTop: "calc(env(safe-area-inset-top, 0px) + 18vh)",
          width: 340,
          height: 340,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Aura externe pulsante (la plus large, la plus douce) */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: 320,
            height: 320,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(232,163,61,0.20) 0%, transparent 60%)",
            filter: "blur(8px)",
            animation: "bmd-aura-slow 4.5s ease-in-out infinite",
            pointerEvents: "none",
          }}
        />
        {/* Aura interne */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: 200,
            height: 200,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(232,163,61,0.30) 0%, transparent 65%)",
            filter: "blur(4px)",
            animation: "bmd-aura 3s ease-in-out infinite",
            pointerEvents: "none",
          }}
        />

        {/* Anneau orbital décoratif (statique car les satellites tournent dessus) */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            width: RADIUS * 2 + 24,
            height: RADIUS * 2 + 24,
            borderRadius: "50%",
            border: "1px dashed rgba(197,138,46,0.30)",
            pointerEvents: "none",
          }}
        />

        {/* V66 — Approche fiable : chaque satellite a sa propre animation
            keyframe qui combine ROTATION sur l'orbite + position de départ
            à 120° d'écart. Pas de wrapper rotation = pas de conflit de
            transform composé. Le satellite tourne sur lui-même mais l'icône
            est dans un sub-wrapper qui contre-rotation pour rester droite. */}
        {orbits.map((o, idx) => {
          const isSelected = selected === o.key;
          const isOther = selected !== null && !isSelected;
          // Animation unique par satellite (delay négatif pour démarrer à
          // l'angle souhaité dans le cycle 16s).
          const animName = `bmd-orbit-sat-${idx}`;
          const counterName = `bmd-orbit-sat-counter-${idx}`;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => handleSatTap(o.key)}
              aria-label={t(o.titleKey) || o.titleFallback}
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: SAT_SIZE,
                height: SAT_SIZE,
                marginTop: -SAT_SIZE / 2,
                marginLeft: -SAT_SIZE / 2,
                borderRadius: "50%",
                background: o.gradient,
                border: `2px solid rgba(255,255,255,0.90)`,
                boxShadow: `${o.glow}, 0 0 24px ${o.color}66`,
                color: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                fontFamily: "inherit",
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
                opacity: isOther ? 0.4 : 1,
                transition: "opacity 0.3s ease, box-shadow 0.3s ease",
                outline: isSelected
                  ? `3px solid rgba(255,255,255,0.75)`
                  : "none",
                outlineOffset: isSelected ? 4 : 0,
                padding: 0,
                pointerEvents: "auto",
                zIndex: 2,
                // Animation orbitale UNIQUE par satellite (la keyframe
                // contient déjà le décalage angulaire de départ).
                animation: selected
                  ? "none"
                  : `${animName} 16s linear infinite`,
                // En mode sélectionné : on fige le satellite à son angle
                // initial (pour qu'il ne disparaisse pas)
                transform: selected
                  ? `rotate(${ORBIT_ANGLES[idx]}deg) translateY(-${RADIUS}px) rotate(-${ORBIT_ANGLES[idx]}deg)`
                  : undefined,
              }}
            >
              {/* Sub-wrapper qui contre-rotation : l'icône reste droite */}
              <span
                aria-hidden
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "100%",
                  height: "100%",
                  animation: selected
                    ? "none"
                    : `${counterName} 16s linear infinite`,
                }}
              >
                <Icon
                  name={o.iconName}
                  size={26}
                  color="currentColor"
                  strokeWidth={1.8}
                />
              </span>
            </button>
          );
        })}

        {/* Keyframes générées dynamiquement pour les 3 satellites */}
        <style>{`
          @keyframes bmd-orbit-sat-0 {
            from { transform: rotate(0deg) translateY(-${RADIUS}px) rotate(0deg); }
            to   { transform: rotate(360deg) translateY(-${RADIUS}px) rotate(-360deg); }
          }
          @keyframes bmd-orbit-sat-counter-0 {
            from { transform: rotate(0deg); }
            to   { transform: rotate(-360deg); }
          }
          @keyframes bmd-orbit-sat-1 {
            from { transform: rotate(120deg) translateY(-${RADIUS}px) rotate(-120deg); }
            to   { transform: rotate(480deg) translateY(-${RADIUS}px) rotate(-480deg); }
          }
          @keyframes bmd-orbit-sat-counter-1 {
            from { transform: rotate(-120deg); }
            to   { transform: rotate(-480deg); }
          }
          @keyframes bmd-orbit-sat-2 {
            from { transform: rotate(240deg) translateY(-${RADIUS}px) rotate(-240deg); }
            to   { transform: rotate(600deg) translateY(-${RADIUS}px) rotate(-600deg); }
          }
          @keyframes bmd-orbit-sat-counter-2 {
            from { transform: rotate(-240deg); }
            to   { transform: rotate(-600deg); }
          }
        `}</style>

        {/* === BOULE BMD CENTRALE (par-dessus tout) === */}
        <div
          style={{
            position: "relative",
            zIndex: 2,
            width: 104,
            height: 104,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Wobble outer wrapper */}
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              animation: "bmd-orb-wobble 6s ease-in-out infinite",
            }}
          >
            {/* Pulse inner wrapper */}
            <div
              style={{
                width: 92,
                height: 92,
                borderRadius: "50%",
                background:
                  "radial-gradient(circle at 30% 28%, #FFEFC8 0%, #FFD680 25%, #E8A33D 55%, #C58A2E 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#FFFFFF",
                animation:
                  "bmd-orb-pulse 2.8s ease-in-out infinite, bmd-orb-shine 3.2s ease-in-out infinite",
              }}
            >
              <Icon
                name="sparkles"
                size={38}
                color="currentColor"
                strokeWidth={1.8}
              />
            </div>
          </div>
        </div>
      </div>

      {/* === 4. TAGLINE FLOTTANTE — chip glassmorphism lisible === */}
      {!selected && (
        <div
          style={{
            position: "relative",
            marginTop: 24,
            display: "flex",
            justifyContent: "center",
            padding: "0 20px",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              padding: "12px 22px 14px",
              borderRadius: 18,
              background: "rgba(255,255,255,0.92)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              boxShadow:
                "0 10px 24px rgba(43,31,21,0.10), 0 0 0 1px rgba(197,138,46,0.18)",
              maxWidth: 340,
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                letterSpacing: 2.5,
                textTransform: "uppercase",
                color: "#C58A2E",
                fontWeight: 800,
                marginBottom: 4,
              }}
            >
              BMD · AI
            </div>
            <div
              style={{
                fontFamily: "Cormorant Garamond, serif",
                fontSize: 22,
                fontWeight: 700,
                color: "#2B1F15",
                lineHeight: 1.2,
              }}
            >
              {t("quickAdd.heroTitle") || "Crée ta dépense"}
            </div>
            <div
              style={{
                fontSize: 12.5,
                color: "#6B5A47",
                marginTop: 6,
                fontWeight: 500,
                lineHeight: 1.5,
              }}
            >
              {t("quickAdd.orbHint") ||
                "Touche un satellite pour choisir"}
            </div>
          </div>
        </div>
      )}

      {/* === 5. CARTE DÉTAIL (si satellite sélectionné) === */}
      {selected && selectedConf && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 30px)",
            left: 18,
            right: 18,
            zIndex: 15,
            display: "flex",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 360,
              width: "100%",
              padding: "16px 18px 18px",
              borderRadius: 20,
              background: "rgba(255,255,255,0.97)",
              backdropFilter: "blur(18px)",
              boxShadow: `0 16px 40px rgba(43,31,21,0.18), 0 0 0 1px ${selectedConf.color}33`,
              animation:
                "bmd-detail-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
              pointerEvents: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontFamily: "Cormorant Garamond, serif",
                fontSize: 22,
                fontWeight: 700,
                color: "#2B1F15",
                lineHeight: 1.15,
              }}
            >
              {t(selectedConf.titleKey) || selectedConf.titleFallback}
            </div>
            <div
              style={{
                fontSize: 13,
                color: "#6B5A47",
                lineHeight: 1.5,
              }}
            >
              {t(selectedConf.subtitleKey) || selectedConf.subtitleFallback}
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 6,
              }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  haptic("tap");
                  setSelected(null);
                }}
                style={{
                  flex: 1,
                  padding: "12px",
                  background: "transparent",
                  border: "1px solid rgba(43,31,21,0.16)",
                  color: "#6B5A47",
                  borderRadius: 12,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  touchAction: "manipulation",
                  WebkitTapHighlightColor: "transparent",
                  minHeight: 44,
                }}
              >
                {t("common.back") || "Retour"}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  haptic("tap");
                  handleConfirm();
                }}
                style={{
                  flex: 2,
                  padding: "12px",
                  background: selectedConf.gradient,
                  border: "none",
                  color: "#FFFFFF",
                  borderRadius: 12,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  touchAction: "manipulation",
                  WebkitTapHighlightColor: "transparent",
                  boxShadow: selectedConf.glow,
                  minHeight: 44,
                }}
              >
                {t(selectedConf.ctaKey) || selectedConf.ctaFallback}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ (Ancien chooser BottomSheet conservé pour rétrocompat) ============

function ChooserContent({
  onPickVoice,
  onPickScan,
  onPickManual,
  t,
}: {
  onPickVoice: () => void;
  onPickScan: () => void;
  onPickManual: () => void;
  t: ReturnType<typeof useT>;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Hero magique : sparkle pulsant + tagline */}
      <div
        style={{
          position: "relative",
          padding: "16px 18px 14px",
          borderRadius: 18,
          background:
            "linear-gradient(135deg, #FBF6EC 0%, #F6E8C5 60%, #F4ECD8 100%)",
          border: "1px solid rgba(197,138,46,0.25)",
          overflow: "hidden",
          textAlign: "center",
        }}
      >
        {/* Halo radial saffron qui pulse en boucle */}
        <div
          aria-hidden
          className="bmd-quickadd-halo"
          style={{
            position: "absolute",
            top: -50,
            left: "50%",
            transform: "translateX(-50%)",
            width: 200,
            height: 200,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(197,138,46,0.30), transparent 65%)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "relative",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <span
            aria-hidden
            className="bmd-quickadd-sparkle"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              color: "#C58A2E",
            }}
          >
            <Icon name="sparkles" size={22} color="currentColor" strokeWidth={2} />
          </span>
          <span
            style={{
              fontFamily: "Cormorant Garamond, serif",
              fontSize: 22,
              fontWeight: 700,
              color: "#2B1F15",
              letterSpacing: 0.2,
            }}
          >
            {t("quickAdd.heroTitle") || "Crée ta dépense"}
          </span>
        </div>
        <p
          style={{
            position: "relative",
            margin: "4px 0 0",
            fontSize: 12.5,
            color: "#6B5A47",
            lineHeight: 1.5,
          }}
        >
          {t("quickAdd.hint") ||
            "3 manières d'ajouter — l'IA fait le reste."}
        </p>
      </div>

      {/* Style global du composant : halo pulse + sparkle wiggle + scale tap */}
      <style jsx global>{`
        @keyframes bmd-halo-pulse {
          0%,
          100% {
            opacity: 0.55;
            transform: translateX(-50%) scale(0.9);
          }
          50% {
            opacity: 1;
            transform: translateX(-50%) scale(1.1);
          }
        }
        @keyframes bmd-sparkle-twinkle {
          0%,
          100% {
            transform: rotate(0deg) scale(1);
            opacity: 0.9;
          }
          25% {
            transform: rotate(8deg) scale(1.05);
            opacity: 1;
          }
          75% {
            transform: rotate(-6deg) scale(0.95);
            opacity: 0.85;
          }
        }
        .bmd-quickadd-halo {
          animation: bmd-halo-pulse 3.5s ease-in-out infinite;
        }
        .bmd-quickadd-sparkle {
          animation: bmd-sparkle-twinkle 2.4s ease-in-out infinite;
        }
        .bmd-quickadd-card {
          transition:
            transform 0.18s cubic-bezier(0.4, 0, 0.2, 1),
            box-shadow 0.18s ease;
        }
        .bmd-quickadd-card:active {
          transform: scale(0.97);
        }
        .bmd-quickadd-card-shimmer::before {
          content: "";
          position: absolute;
          top: 0;
          left: -120%;
          width: 60%;
          height: 100%;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.35),
            transparent
          );
          transform: skewX(-20deg);
          animation: bmd-shimmer 4.5s ease-in-out infinite;
          pointer-events: none;
        }
        @keyframes bmd-shimmer {
          0% {
            left: -120%;
          }
          60%,
          100% {
            left: 120%;
          }
        }
      `}</style>

      {/* Carte SCAN — saffron */}
      <MagicCard
        onClick={onPickScan}
        iconName="camera"
        iconBg="linear-gradient(135deg, #E8A33D 0%, #C58A2E 100%)"
        haloColor="rgba(197,138,46,0.32)"
        glowShadow="0 6px 22px rgba(197,138,46,0.30)"
        title={t("quickAdd.scanCardTitle") || "Scanner une facture"}
        subtitle={
          t("quickAdd.scanCardBody") ||
          "L'IA lit montant, marchand et chaque article"
        }
        accent="#C58A2E"
        shimmer
      />

      {/* Carte VOIX — indigo */}
      <MagicCard
        onClick={onPickVoice}
        iconName="mic"
        iconBg="linear-gradient(135deg, #5B6CFF 0%, #4458B5 100%)"
        haloColor="rgba(91,108,255,0.28)"
        glowShadow="0 6px 22px rgba(91,108,255,0.25)"
        title={t("quickAdd.voiceCardTitle") || "Parler à BMD"}
        subtitle={
          t("quickAdd.voiceCardBody") ||
          "« 25 € pizza chez Mario avec Léa et Hugo »"
        }
        accent="#4458B5"
      />

      {/* V62 — Carte SAISIE MANUELLE / PDF — emerald */}
      <MagicCard
        onClick={onPickManual}
        iconName="pencil"
        iconBg="linear-gradient(135deg, #4F8E6E 0%, #1F7A57 100%)"
        haloColor="rgba(31,122,87,0.28)"
        glowShadow="0 6px 22px rgba(31,122,87,0.25)"
        title={t("quickAdd.manualCardTitle") || "Saisie manuelle"}
        subtitle={
          t("quickAdd.manualCardBody") ||
          "Tape les infos ou attache un PDF de justificatif"
        }
        accent="#1F7A57"
      />

      <p
        style={{
          fontSize: 11,
          color: "#6B5A47",
          textAlign: "center",
          margin: 0,
          lineHeight: 1.5,
          opacity: 0.85,
        }}
      >
        {t("quickAdd.footerHint") ||
          "Pour créer un nouveau groupe, va dans l'onglet Groupes."}
      </p>
    </div>
  );
}

/**
 * V62 — Carte tactile V45-light premium avec :
 *  - Icône SVG dans un badge gradient solide
 *  - Halo radial coloré derrière (parsing visuel)
 *  - Optionnel shimmer animé (passage de lumière diagonal)
 *  - Active state scale(0.97) instantané
 *  - Fond paper avec accent border
 */
function MagicCard({
  onClick,
  iconName,
  iconBg,
  haloColor,
  glowShadow,
  title,
  subtitle,
  accent,
  shimmer,
  className,
}: {
  onClick: () => void;
  iconName: IconName;
  iconBg: string;
  haloColor: string;
  glowShadow: string;
  title: string;
  subtitle: string;
  accent: string;
  shimmer?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        haptic("tap");
        onClick();
      }}
      className={[
        "bmd-quickadd-card",
        shimmer ? "bmd-quickadd-card-shimmer" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        padding: "18px 16px",
        borderRadius: 18,
        background: "#FFFFFF",
        border: `1px solid ${accent}33`,
        color: "#2B1F15",
        textAlign: "left",
        cursor: "pointer",
        fontFamily: "inherit",
        position: "relative",
        overflow: "hidden",
        minHeight: 96,
        WebkitTapHighlightColor: "transparent",
        touchAction: "manipulation",
        boxShadow: glowShadow,
      }}
    >
      {/* Halo radial coloré derrière */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -50,
          right: -50,
          width: 160,
          height: 160,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${haloColor}, transparent 70%)`,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 52,
            height: 52,
            borderRadius: 16,
            background: iconBg,
            border: `1px solid ${accent}55`,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            color: "#FFFFFF",
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.25), 0 4px 12px ${accent}40`,
          }}
        >
          <Icon name={iconName} size={26} color="currentColor" strokeWidth={1.7} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: "Cormorant Garamond, serif",
              fontSize: 19,
              fontWeight: 700,
              lineHeight: 1.15,
              marginBottom: 4,
              color: "#2B1F15",
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "#6B5A47",
              lineHeight: 1.4,
            }}
          >
            {subtitle}
          </div>
        </div>
        {/* Chevron droit pour signaler l'action */}
        <span
          aria-hidden
          style={{
            color: accent,
            opacity: 0.7,
            flexShrink: 0,
            display: "inline-flex",
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </span>
      </div>
    </button>
  );
}

// ============ V41.4 — CONFIDENCE BADGE ============

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color =
    pct >= 80 ? "#7DC59E" : pct >= 50 ? "var(--saffron)" : "#FFB89A";
  const label = pct >= 80 ? "Excellent" : pct >= 50 ? "Bon" : "Faible";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 999,
        background: `${color}1A`,
        border: `1px solid ${color}40`,
        color,
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <span aria-hidden>●</span>
      <span>{label} · {pct}%</span>
    </span>
  );
}

// ============ V42 · Old VoiceCapture removed ============
// La V41.4 a migré sur <PremiumVoiceCapture /> (Whisper officiel OpenAI +
// GPT-4o-mini parsing). L'ancien `_DeprecatedVoiceCapture` qui appelait
// `<VoiceInput />` (Web Speech API) a été supprimé pour passer tsc clean —
// le composant VoiceInput n'existe plus dans le codebase. Pour la signature
// d'animation pulsante du micro, voir <PremiumVoiceCapture /> directement.

// ============ REVIEW : validation + groupe + split ============

function ReviewContent({
  amount,
  setAmount,
  description,
  setDescription,
  groups,
  groupsLoading,
  selectedGroupId,
  setSelectedGroupId,
  splitMode,
  setSplitMode,
  hasItems,
  itemCount,
  submitting,
  onBack,
  onSubmit,
  iaProvider,
  iaConfidence,
  iaTranscript,
  attachedFile,
  onAttachFile,
  submitError,
  expenseDate,
  setExpenseDate,
  groupMembers,
  shareValues,
  setShareValues,
  t,
}: {
  amount: string;
  setAmount: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  groups: GroupLite[];
  groupsLoading: boolean;
  selectedGroupId: string | null;
  setSelectedGroupId: (id: string | null) => void;
  splitMode: SplitMode;
  setSplitMode: (m: SplitMode) => void;
  hasItems: boolean;
  itemCount: number;
  submitting: boolean;
  onBack: () => void;
  onSubmit: () => void;
  iaProvider:
    | "mindee"
    | "openai_vision"
    | "tesseract"
    | "whisper+openai"
    | null;
  iaConfidence: number | null;
  iaTranscript: string | null;
  // V62 — Fichier attaché (PDF/image) : si l'user vient du mode "manual",
  // il peut attacher un justificatif ; si vient du scan, c'est l'image scannée.
  attachedFile: File | null;
  onAttachFile: (f: File | null) => void;
  // V62 — Erreur de submit affichée inline (toast peut être caché sous sheet)
  submitError: string | null;
  // V67 — Date d'occurrence de la dépense (YYYY-MM-DD, default = aujourd'hui)
  expenseDate: string;
  setExpenseDate: (d: string) => void;
  // V70 — Membres du groupe sélectionné (pour le ShareEditor UNEQUAL/%)
  groupMembers: Array<{ userId: string; displayName: string }>;
  shareValues: Record<string, string>;
  setShareValues: (
    v:
      | Record<string, string>
      | ((prev: Record<string, string>) => Record<string, string>),
  ) => void;
  t: ReturnType<typeof useT>;
}) {
  const selectedGroup = groups.find((g) => g.id === selectedGroupId);
  const currency = selectedGroup?.defaultCurrency ?? "EUR";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* V41.4 — Badge IA premium : provider + confidence + transcript */}
      {iaProvider && (
        <div
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            background:
              "linear-gradient(135deg, rgba(91,108,255,0.10), rgba(232,163,61,0.05))",
            border: "1px solid rgba(91,108,255,0.30)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                color: "#9eabff",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span aria-hidden>⬢</span>
              {iaProvider === "whisper+openai"
                ? "Whisper + OpenAI"
                : iaProvider === "mindee"
                  ? "Mindee OCR"
                  : iaProvider === "openai_vision"
                    ? "OpenAI Vision"
                    : "Tesseract"}
            </span>
            {iaConfidence !== null && (
              <ConfidenceBadge confidence={iaConfidence} />
            )}
          </div>
          {iaTranscript && (
            <p
              style={{
                fontSize: 12,
                color: "var(--cream-soft)",
                margin: 0,
                lineHeight: 1.5,
                fontStyle: "italic",
              }}
            >
              « {iaTranscript} »
            </p>
          )}
          {hasItems && (
            <div
              style={{
                fontSize: 11,
                color: "var(--cream-soft)",
                opacity: 0.85,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {/* V52.C3 — SVG remplace EMOJI (🤖). Pas d'icône robot au
                  registry, on utilise sparkles (sens "magique/IA"). */}
              <Icon
                name="sparkles"
                size={12}
                color="currentColor"
                strokeWidth={1.6}
              />
              <span>
                {t("quickAdd.iaDetected", { n: String(itemCount) }) ||
                  `IA a détecté ${itemCount} article${itemCount > 1 ? "s" : ""}`}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Montant */}
      <div>
        <label
          style={{
            display: "block",
            fontSize: 10,
            color: "var(--saffron)",
            textTransform: "uppercase",
            letterSpacing: 1.4,
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          {t("quickAdd.amount") || "Montant"}
        </label>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 8,
            padding: "14px 14px",
            background: "rgba(244,228,193,0.04)",
            border: "1px solid rgba(232,163,61,0.25)",
            borderRadius: 14,
            minWidth: 0,
          }}
        >
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
            placeholder="0"
            className="bmd-num"
            style={{
              flex: 1,
              fontSize: "clamp(24px, 8vw, 32px)",
              fontWeight: 800,
              color: "var(--cream)",
              background: "transparent",
              border: "none",
              outline: "none",
              padding: 0,
              minWidth: 0,
              letterSpacing: -0.5,
            }}
          />
          <span style={{ fontSize: 16, color: "var(--saffron)", fontWeight: 600 }}>
            {currency}
          </span>
        </div>
      </div>

      {/* Description */}
      <div>
        <label
          style={{
            display: "block",
            fontSize: 10,
            color: "var(--saffron)",
            textTransform: "uppercase",
            letterSpacing: 1.4,
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          {t("quickAdd.description") || "Description"}
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("quickAdd.descriptionPlaceholder") || "Ex : Pizza"}
          style={{
            width: "100%",
            padding: "12px 14px",
            background: "rgba(244,228,193,0.04)",
            border: "1px solid rgba(244,228,193,0.10)",
            borderRadius: 12,
            color: "var(--cream)",
            fontSize: 14,
            fontFamily: "inherit",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* V67 — Date d'occurrence (par défaut aujourd'hui, modifiable) */}
      <div>
        <label
          style={{
            display: "block",
            fontSize: 10,
            color: "var(--saffron)",
            textTransform: "uppercase",
            letterSpacing: 1.4,
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          {t("quickAdd.date") || "Date de la dépense"}
        </label>
        <input
          type="date"
          value={expenseDate}
          onChange={(e) => setExpenseDate(e.target.value)}
          max={new Date().toISOString().slice(0, 10)}
          className="bmd-num"
          style={{
            width: "100%",
            padding: "12px 14px",
            background: "rgba(244,228,193,0.04)",
            border: "1px solid rgba(244,228,193,0.10)",
            borderRadius: 12,
            color: "var(--cream)",
            fontSize: 14,
            fontFamily: "inherit",
            outline: "none",
            boxSizing: "border-box",
            colorScheme: "light",
          }}
        />
      </div>

      {/* Groupe cible — V67 avec recherche si > 5 groupes (UX innovante) */}
      <div>
        <label
          style={{
            display: "block",
            fontSize: 10,
            color: "var(--saffron)",
            textTransform: "uppercase",
            letterSpacing: 1.4,
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          {t("quickAdd.targetGroup") || "Pour quel groupe ?"}
        </label>
        {groupsLoading ? (
          <div
            style={{
              padding: 14,
              textAlign: "center",
              color: "var(--cream-soft)",
              fontSize: 13,
            }}
          >
            …
          </div>
        ) : groups.length === 0 ? (
          <div
            style={{
              padding: 14,
              borderRadius: 12,
              background: "rgba(217,113,74,0.10)",
              border: "1px solid rgba(217,113,74,0.30)",
              color: "#FFB89A",
              fontSize: 12.5,
              textAlign: "center",
            }}
          >
            {t("quickAdd.noGroupsHint") ||
              "Tu n'as pas encore de groupe. Crée-en un depuis l'onglet Groupes."}
          </div>
        ) : (
          <GroupSelector
            groups={groups}
            selectedGroupId={selectedGroupId}
            onSelect={setSelectedGroupId}
            t={t}
          />
        )}
        {false ? (
          <>
            {groups.map((g) => {
              const iconName = GROUP_TYPE_ICON[g.type ?? "GENERIC"] ?? "users";
              const isSelected = g.id === selectedGroupId;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setSelectedGroupId(g.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    background: isSelected
                      ? "linear-gradient(135deg, rgba(232,163,61,0.12), rgba(181,70,46,0.06))"
                      : "rgba(244,228,193,0.03)",
                    border: isSelected
                      ? "1px solid rgba(232,163,61,0.40)"
                      : "1px solid rgba(244,228,193,0.08)",
                    borderRadius: 11,
                    color: "var(--cream)",
                    fontFamily: "inherit",
                    fontSize: 13,
                    cursor: "pointer",
                    width: "100%",
                    textAlign: "left",
                    minWidth: 0,
                  }}
                >
                  {/* V52.C3 — SVG remplace EMOJI */}
                  <span
                    style={{
                      flexShrink: 0,
                      display: "inline-flex",
                      color: "var(--saffron, #e8a33d)",
                    }}
                    aria-hidden
                  >
                    <Icon
                      name={iconName}
                      size={18}
                      color="currentColor"
                      strokeWidth={1.6}
                    />
                  </span>
                  <span
                    style={{
                      flex: 1,
                      fontWeight: isSelected ? 700 : 500,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {g.name}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      color: "var(--muted)",
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    {g.defaultCurrency}
                  </span>
                  {isSelected && (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--saffron)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M5 12l5 5L20 7" />
                    </svg>
                  )}
                </button>
              );
            })}
          </>
        ) : null}
      </div>

      {/* V62 — Pièce jointe optionnelle (PDF / image facture).
          Si vient du scan, le file est déjà rempli — on affiche un badge "joint".
          En mode manuel, l'user peut cliquer pour attacher un PDF justificatif. */}
      <div>
        <label
          style={{
            display: "block",
            fontSize: 10,
            color: "var(--saffron)",
            textTransform: "uppercase",
            letterSpacing: 1.4,
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          {t("quickAdd.attachment") || "Justificatif (optionnel)"}
        </label>
        {attachedFile ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              background: "rgba(31,122,87,0.08)",
              border: "1px solid rgba(31,122,87,0.30)",
              borderRadius: 12,
            }}
          >
            <Icon
              name="paperclip"
              size={16}
              color="#1F7A57"
              strokeWidth={1.8}
            />
            <span
              style={{
                flex: 1,
                fontSize: 12.5,
                color: "#2B1F15",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {attachedFile.name}
            </span>
            <button
              type="button"
              onClick={() => onAttachFile(null)}
              aria-label={t("common.remove") || "Retirer"}
              style={{
                background: "transparent",
                border: "none",
                color: "#9F4628",
                cursor: "pointer",
                fontSize: 18,
                lineHeight: 1,
                padding: 4,
                fontFamily: "inherit",
              }}
            >
              ×
            </button>
          </div>
        ) : (
          <label
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "12px",
              background: "rgba(244,228,193,0.04)",
              border: "1px dashed rgba(43,31,21,0.18)",
              borderRadius: 12,
              cursor: "pointer",
              color: "#6B5A47",
              fontSize: 12.5,
              fontWeight: 600,
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <Icon
              name="paperclip"
              size={14}
              color="currentColor"
              strokeWidth={1.8}
            />
            <span>{t("quickAdd.attachCta") || "Joindre un PDF ou une image"}</span>
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                if (f) {
                  onAttachFile(f);
                  haptic("tap");
                }
              }}
              style={{ display: "none" }}
            />
          </label>
        )}
      </div>

      {/* Split mode */}
      <div>
        <label
          style={{
            display: "block",
            fontSize: 10,
            color: "var(--saffron)",
            textTransform: "uppercase",
            letterSpacing: 1.4,
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          {t("quickAdd.split") || "Partage"}
        </label>
        {/* V67 — Split mode en SegmentedControl V45 (pill saffron qui glisse,
            invariant XOR, mêmes garanties que les autres toggles de l'app). */}
        <SegmentedControl<SplitMode>
          value={splitMode}
          onChange={setSplitMode}
          ariaLabel="Mode de partage"
          size="sm"
          segments={[
            { value: "EQUAL", label: "= Égal" },
            { value: "UNEQUAL", label: "€ Montant" },
            { value: "PERCENTAGE", label: "% Percent" },
            { value: "ITEMIZED", label: "▦ Articles" },
          ]}
        />

        {/* V70 — ShareEditor pour UNEQUAL / PERCENTAGE : liste des membres
            du groupe avec inputs pour saisir le montant ou pourcentage. */}
        {(splitMode === "UNEQUAL" || splitMode === "PERCENTAGE") && (
          <ShareEditor
            mode={splitMode}
            members={groupMembers}
            totalAmount={parseFloat(amount.replace(",", ".")) || 0}
            currency={currency}
            shareValues={shareValues}
            setShareValues={setShareValues}
            t={t}
          />
        )}

        {/* V70 — Pour ITEMIZED : message d'info, l'utilisateur édite les
            articles depuis la page de la dépense après création. */}
        {splitMode === "ITEMIZED" && (
          <div
            style={{
              padding: "10px 14px",
              background: "rgba(91,108,255,0.10)",
              border: "1px solid rgba(91,108,255,0.30)",
              borderRadius: 12,
              color: "#9eabff",
              fontSize: 12.5,
              lineHeight: 1.5,
            }}
          >
            {t("quickAdd.itemizedHint") ||
              "Crée d'abord la dépense, puis ouvre-la pour ajouter chaque article et qui le consomme."}
          </div>
        )}
      </div>

      {/* V62 — Erreur inline visible (en plus du toast). */}
      {submitError && (
        <div
          role="alert"
          style={{
            padding: "10px 14px",
            background: "rgba(159,70,40,0.10)",
            border: "1px solid rgba(159,70,40,0.30)",
            borderRadius: 12,
            color: "#9F2A24",
            fontSize: 12.5,
            lineHeight: 1.5,
          }}
        >
          <strong>⚠ </strong>
          {submitError}
        </div>
      )}

      {/* Footer actions */}
      <div
        style={{
          display: "flex",
          gap: 8,
          paddingTop: 8,
          borderTop: "1px solid rgba(244,228,193,0.06)",
        }}
      >
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          style={{
            flex: 1,
            padding: "14px 18px",
            background: "transparent",
            color: "var(--cream-soft)",
            border: "1px solid rgba(244,228,193,0.18)",
            borderRadius: 14,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {t("common.back") || "Retour"}
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting || !selectedGroupId}
          style={{
            flex: 2,
            padding: "14px 18px",
            background:
              !selectedGroupId || submitting
                ? "rgba(244,228,193,0.10)"
                : "linear-gradient(135deg, var(--saffron), var(--terracotta))",
            color:
              !selectedGroupId || submitting ? "var(--muted)" : "#16111E",
            border: "none",
            borderRadius: 14,
            fontSize: 14,
            fontWeight: 700,
            cursor: submitting ? "wait" : "pointer",
            fontFamily: "inherit",
            opacity: submitting ? 0.7 : 1,
            boxShadow:
              !selectedGroupId || submitting
                ? "none"
                : "0 8px 22px rgba(232,163,61,0.30)",
          }}
        >
          {/* V52.C3 — SVG remplace EMOJI (✨) : fallback texte sans emoji.
              Si la clé i18n contient encore un emoji, c'est l'i18n qui le
              fournit (séparé de ce composant). */}
          {submitting
            ? t("common.sending") || "Création…"
            : t("quickAdd.createCta") || "Créer la dépense"}
        </button>
      </div>
    </div>
  );
}

/**
 * V67 — Sélecteur de groupe intelligent.
 *
 * - Si ≤ 5 groupes : liste verticale classique (tous visibles)
 * - Si > 5 groupes : barre de recherche en haut + liste filtrée scrollable +
 *   compteur "X sur Y" → UX scalable pour utilisateurs avec beaucoup de groupes
 *
 * Cohérence V45-light : icônes SVG outline, accent saffron, bord cocoa.
 */
/**
 * V70 — ShareEditor : éditeur de parts par membre pour UNEQUAL / PERCENTAGE.
 *
 * - Liste compacte des membres du groupe sélectionné
 * - Input numérique par membre (montant en devise OU pourcentage 0-100)
 * - Total affiché en bas + indicateur visuel ✓ (vert si OK) ou ⚠ (orange si écart)
 * - Bouton "répartir équitablement" pour pré-remplir
 *
 * Validation déléguée au submit() qui rejette si total != amount (ou 100%).
 */
function ShareEditor({
  mode,
  members,
  totalAmount,
  currency,
  shareValues,
  setShareValues,
  t,
}: {
  mode: "UNEQUAL" | "PERCENTAGE";
  members: Array<{ userId: string; displayName: string }>;
  totalAmount: number;
  currency: string;
  shareValues: Record<string, string>;
  setShareValues: (
    v:
      | Record<string, string>
      | ((prev: Record<string, string>) => Record<string, string>),
  ) => void;
  t: ReturnType<typeof useT>;
}) {
  if (members.length === 0) {
    return (
      <div
        style={{
          padding: "10px 14px",
          background: "rgba(244,228,193,0.04)",
          border: "1px solid rgba(244,228,193,0.10)",
          borderRadius: 12,
          color: "var(--cream-soft)",
          fontSize: 12.5,
          textAlign: "center",
        }}
      >
        {t("quickAdd.pickGroupForShares") ||
          "Choisis d'abord un groupe pour répartir."}
      </div>
    );
  }

  const sumShares = members.reduce((acc, m) => {
    const v = parseFloat((shareValues[m.userId] ?? "").replace(",", ".")) || 0;
    return acc + v;
  }, 0);
  const targetTotal = mode === "PERCENTAGE" ? 100 : totalAmount;
  const diff = sumShares - targetTotal;
  const isOk = Math.abs(diff) < (mode === "PERCENTAGE" ? 0.5 : 0.01);

  function splitEqually() {
    if (members.length === 0) return;
    const equalValue =
      mode === "PERCENTAGE"
        ? (100 / members.length).toFixed(2)
        : (totalAmount / members.length).toFixed(2);
    const next: Record<string, string> = {};
    for (const m of members) next[m.userId] = equalValue;
    setShareValues(next);
  }

  function clearAll() {
    const next: Record<string, string> = {};
    for (const m of members) next[m.userId] = "";
    setShareValues(next);
  }

  const unit = mode === "PERCENTAGE" ? "%" : currency;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 12,
        background: "rgba(244,228,193,0.03)",
        border: "1px solid rgba(244,228,193,0.10)",
        borderRadius: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: "var(--saffron)",
            textTransform: "uppercase",
            letterSpacing: 1.2,
            fontWeight: 700,
          }}
        >
          {mode === "PERCENTAGE"
            ? t("quickAdd.sharesPercentLabel") || "Part de chacun (%)"
            : t("quickAdd.sharesAmountLabel") || "Part de chacun"}
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            onClick={splitEqually}
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "5px 10px",
              borderRadius: 8,
              border: "1px solid rgba(232,163,61,0.30)",
              background: "rgba(232,163,61,0.10)",
              color: "var(--saffron)",
              cursor: "pointer",
              fontFamily: "inherit",
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {t("quickAdd.splitEqually") || "Équitable"}
          </button>
          <button
            type="button"
            onClick={clearAll}
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "5px 10px",
              borderRadius: 8,
              border: "1px solid rgba(244,228,193,0.18)",
              background: "transparent",
              color: "var(--cream-soft)",
              cursor: "pointer",
              fontFamily: "inherit",
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {t("common.clear") || "Effacer"}
          </button>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          maxHeight: 220,
          overflowY: "auto",
        }}
      >
        {members.map((m) => (
          <div
            key={m.userId}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 10px",
              background: "rgba(244,228,193,0.03)",
              border: "1px solid rgba(244,228,193,0.06)",
              borderRadius: 9,
            }}
          >
            <span
              style={{
                flex: 1,
                fontSize: 13,
                color: "var(--cream)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {m.displayName}
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={shareValues[m.userId] ?? ""}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/[^\d.,]/g, "");
                setShareValues((prev) => ({ ...prev, [m.userId]: cleaned }));
              }}
              placeholder="0"
              className="bmd-num"
              style={{
                width: 80,
                padding: "6px 8px",
                background: "rgba(244,228,193,0.06)",
                border: "1px solid rgba(244,228,193,0.12)",
                borderRadius: 8,
                color: "var(--cream)",
                fontSize: 13,
                fontWeight: 700,
                outline: "none",
                fontFamily: "inherit",
                textAlign: "right",
              }}
            />
            <span
              style={{
                fontSize: 11,
                color: "var(--cream-soft)",
                width: 28,
                textAlign: "left",
                flexShrink: 0,
              }}
            >
              {unit}
            </span>
          </div>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 10px",
          background: isOk
            ? "rgba(125,197,158,0.10)"
            : "rgba(232,163,61,0.10)",
          border: `1px solid ${isOk ? "rgba(125,197,158,0.30)" : "rgba(232,163,61,0.30)"}`,
          borderRadius: 9,
          fontSize: 12,
        }}
      >
        <span style={{ color: "var(--cream-soft)" }}>
          {t("quickAdd.totalLabel") || "Total"}
        </span>
        <span
          className="bmd-num"
          style={{
            fontWeight: 800,
            color: isOk ? "#7DC59E" : "#E8A33D",
          }}
        >
          {sumShares.toFixed(2)} {unit}
          {!isOk && (
            <span style={{ fontSize: 11, marginLeft: 6, opacity: 0.85 }}>
              ({t("quickAdd.expected") || "attendu"}: {targetTotal.toFixed(2)})
            </span>
          )}
          {isOk && <span style={{ marginLeft: 6 }}>✓</span>}
        </span>
      </div>
    </div>
  );
}

function GroupSelector({
  groups,
  selectedGroupId,
  onSelect,
  t,
}: {
  groups: GroupLite[];
  selectedGroupId: string | null;
  onSelect: (id: string) => void;
  t: ReturnType<typeof useT>;
}) {
  const [query, setQuery] = useState("");
  const showSearch = groups.length > 5;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) =>
      g.name.toLowerCase().includes(q),
    );
  }, [groups, query]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {showSearch && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            background: "rgba(244,228,193,0.04)",
            border: "1px solid rgba(244,228,193,0.10)",
            borderRadius: 12,
          }}
        >
          <Icon
            name="search"
            size={14}
            color="var(--cream-soft)"
            strokeWidth={1.8}
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              t("quickAdd.searchGroup") || `Chercher parmi ${groups.length} groupes…`
            }
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--cream)",
              fontSize: 13,
              fontFamily: "inherit",
            }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t("common.clear") || "Effacer"}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--cream-soft)",
                fontSize: 16,
                cursor: "pointer",
                fontFamily: "inherit",
                padding: 2,
              }}
            >
              ×
            </button>
          )}
        </div>
      )}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          maxHeight: showSearch ? 260 : 220,
          overflowY: "auto",
          padding: 2,
        }}
      >
        {filtered.length === 0 ? (
          <div
            style={{
              padding: "16px 12px",
              textAlign: "center",
              fontSize: 12.5,
              color: "var(--cream-soft)",
              fontStyle: "italic",
            }}
          >
            {t("quickAdd.noGroupMatch") || "Aucun groupe ne correspond"}
          </div>
        ) : (
          filtered.map((g) => {
            const iconName = GROUP_TYPE_ICON[g.type ?? "GENERIC"] ?? "users";
            const isSelected = g.id === selectedGroupId;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => onSelect(g.id)}
                className="bmd-tap bmd-no-scale"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  background: isSelected
                    ? "linear-gradient(135deg, rgba(232,163,61,0.12), rgba(181,70,46,0.06))"
                    : "rgba(244,228,193,0.03)",
                  border: isSelected
                    ? "1px solid rgba(232,163,61,0.40)"
                    : "1px solid rgba(244,228,193,0.08)",
                  borderRadius: 11,
                  color: "var(--cream)",
                  fontFamily: "inherit",
                  fontSize: 13,
                  cursor: "pointer",
                  width: "100%",
                  textAlign: "left",
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    display: "inline-flex",
                    color: "var(--saffron, #e8a33d)",
                  }}
                  aria-hidden
                >
                  <Icon
                    name={iconName}
                    size={18}
                    color="currentColor"
                    strokeWidth={1.6}
                  />
                </span>
                <span
                  style={{
                    flex: 1,
                    fontWeight: isSelected ? 700 : 500,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {g.name}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--muted)",
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  {g.defaultCurrency}
                </span>
                {isSelected && (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--saffron)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                )}
              </button>
            );
          })
        )}
      </div>
      {showSearch && query && (
        <div
          style={{
            fontSize: 11,
            color: "var(--cream-soft)",
            textAlign: "center",
            opacity: 0.8,
          }}
        >
          {filtered.length}/{groups.length}
        </div>
      )}
    </div>
  );
}
