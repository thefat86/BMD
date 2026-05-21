"use client";

/**
 * <MobileInviteSheet> · V39.1 — BottomSheet ajout de membres (mobile-first).
 *
 * 3 modes accessibles via pills en haut :
 *  1. PARTAGE — QR code + lien à copier + Web Share API natif
 *  2. CONTACT — saisie tel/email manuelle, envoie invitation directe
 *  3. RÉPERTOIRE — Contact Picker natif (navigator.contacts) avec
 *     consentement RGPD explicite, batch invitations.
 *
 * Le Contact Picker n'est dispo que sur Chrome/Edge Android (Web Contacts API)
 * et via le plugin Capacitor sur iOS/Android natif. Sur Safari iOS / desktop,
 * on affiche un message clair invitant à utiliser le mode "Partage".
 *
 * Conformité RGPD :
 *  - Le composant N'ACCÈDE PAS aux contacts avant un consentement explicite.
 *  - Texte de consentement : explique pourquoi on lit les contacts, ce qu'on
 *    en fait (= construire des invitations, sans stockage), et qu'on
 *    n'envoie RIEN à l'API tant que l'utilisateur n'a pas validé sa sélection.
 *  - Aucun champ "address", "photo" ou autre n'est demandé — uniquement
 *    `name`, `tel`, `email` (le strict nécessaire).
 *  - La sélection est revue par l'utilisateur (preview) avant envoi.
 */

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { BottomSheet } from "./bottom-sheet";
import { api } from "../api-client";
import { useToast } from "./toast";
import { useDialog } from "./dialog-provider";
import { haptic } from "../platform";
import { useT } from "../i18n/app-strings";
import { validateContact } from "../validators";
import { useNative } from "../use-native";
// V96 — Picker carnet d'adresses (Capacitor + Web Contacts API).
// V175.I — Lazy load : ne charge le code que quand mode === "phonebook".
import type { PickedContact } from "./mobile-contact-picker-sheet";
const MobileContactPickerSheet = dynamic(
  () => import("./mobile-contact-picker-sheet").then((m) => m.MobileContactPickerSheet),
  { ssr: false },
);
// V100 — SegmentedControl partagé avec le dashboard pour cohérence des toggles
import { SegmentedControl } from "./segmented-control";
// V117 — Wrapper QR marqué BMD au centre (cf. branded-qr.tsx).
// V175.I — Lazy : la lib qrcode-svg + branding ne charge qu'en mode "share".
const BrandedQR = dynamic(
  () => import("./branded-qr").then((m) => m.BrandedQR),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          width: 200,
          height: 200,
          background: "rgba(43,31,21,0.04)",
          borderRadius: 14,
        }}
      />
    ),
  },
);

interface Props {
  open: boolean;
  onClose: () => void;
  groupId: string;
  groupName: string;
  isAdmin: boolean;
  onInvited: () => void;
}

type Mode = "share" | "whatsapp" | "contact" | "phonebook" | "tracking";

/**
 * Type Web Contacts API (Chromium-only). On garde `any` non-strict pour
 * ne pas casser la compile sur les TS lib qui ne déclarent pas ContactsManager.
 */
interface SelectedContact {
  name?: string[];
  tel?: string[];
  email?: string[];
}

export function MobileInviteSheet({
  open,
  onClose,
  groupId,
  groupName,
  isAdmin,
  onInvited,
}: Props) {
  const t = useT();
  const toast = useToast();
  const dialog = useDialog();

  const [mode, setMode] = useState<Mode>("share");
  const [token, setToken] = useState<string | null>(null);
  const [loadingToken, setLoadingToken] = useState(false);

  // Contact form
  const [contactType, setContactType] = useState<"PHONE" | "EMAIL">("PHONE");
  const [contactValue, setContactValue] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [sending, setSending] = useState(false);

  // V174.I — Lookup BMD debounce 600ms (parité avec wizard RDD V155).
  // Si le contact tapé correspond à un user BMD existant, on auto-fill
  // le displayName et on affiche un badge emerald "Membre BMD trouvé".
  const [lookupLoading, setLookupLoading] = useState(false);
  const [matchedUserId, setMatchedUserId] = useState<string | null>(null);
  const [matchedDisplayName, setMatchedDisplayName] = useState<string | null>(
    null,
  );
  const [manualOverride, setManualOverride] = useState(false);

  useEffect(() => {
    const trimmed = contactValue.trim();
    if (trimmed.length < 4) {
      setLookupLoading(false);
      setMatchedUserId(null);
      setMatchedDisplayName(null);
      return;
    }
    setLookupLoading(true);
    const timer = setTimeout(() => {
      void api
        .lookupUserByContact(trimmed)
        .then((r) => {
          if (r.found) {
            setMatchedUserId(r.userId);
            setMatchedDisplayName(r.displayName);
            if (!manualOverride) {
              setDisplayName(r.displayName);
            }
          } else {
            setMatchedUserId(null);
            setMatchedDisplayName(null);
          }
        })
        .catch(() => {
          setMatchedUserId(null);
          setMatchedDisplayName(null);
        })
        .finally(() => setLookupLoading(false));
    }, 600);
    return () => {
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactValue, contactType]);

  // Reset à l'ouverture + crée un token de partage si admin
  useEffect(() => {
    if (!open) return;
    setMode("share");
    setContactValue("");
    setDisplayName("");
    if (isAdmin && !token) {
      void createToken();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isAdmin]);

  async function createToken() {
    setLoadingToken(true);
    try {
      const r = await api.createInviteToken(groupId, {
        expiresInHours: 168, // 7 jours
      });
      setToken(r.token);
    } catch (e) {
      toast.info((e as Error).message);
    } finally {
      setLoadingToken(false);
    }
  }

  const inviteUrl =
    typeof window !== "undefined" && token
      ? `${window.location.origin}/join/${token}`
      : "";

  async function copyLink() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      haptic("success");
      toast.info(t("group.linkCopied") || "Lien copié !");
    } catch {
      toast.info(t("common.copyFailed") || "Échec de la copie");
    }
  }

  async function shareLink() {
    if (!inviteUrl) return;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title:
            t("group.shareTitle", { name: groupName }) ||
            `Rejoins ${groupName} sur BMD`,
          text:
            t("group.shareText", { name: groupName }) ||
            `Je t'invite à rejoindre ${groupName} sur BMD pour partager nos dépenses ensemble.`,
          url: inviteUrl,
        });
        haptic("success");
      } catch {
        // Annulé par l'user — silent
      }
    } else {
      // Fallback : juste copier
      await copyLink();
    }
  }

  async function sendInvite() {
    const trimmed = contactValue.trim();
    if (!trimmed) {
      toast.info(t("group.contactRequired") || "Saisis un contact");
      return;
    }
    const validation = validateContact(contactType, trimmed);
    if (!validation.ok) {
      toast.info(
        validation.message ?? (t("common.invalidInput") || "Format invalide"),
      );
      return;
    }
    setSending(true);
    try {
      await api.inviteMember(
        groupId,
        contactType,
        trimmed,
        displayName.trim() || undefined,
      );
      haptic("success");
      // V97 — Wording explicite : l'invité doit accepter via email (30j)
      toast.info(
        t("group.invitationSent") ||
          "Invitation envoyée par e-mail — 30 jours pour accepter 📬",
      );
      setContactValue("");
      setDisplayName("");
      onInvited();
    } catch (e) {
      haptic("error");
      toast.info((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t("group.inviteMembers") || "Inviter des membres"}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* V100 — SegmentedControl partagé avec le dashboard.
            Labels courts pour tenir sur 360px avec 4 ou 5 segments. */}
        <SegmentedControl<Mode>
          value={mode}
          onChange={setMode}
          ariaLabel={t("group.inviteMembers") || "Inviter des membres"}
          size="sm"
          segments={[
            {
              value: "share",
              label: t("group.invitePillShare") || "Lien",
            },
            {
              value: "whatsapp",
              label: t("group.invitePillWhatsapp") || "WhatsApp",
            },
            {
              value: "phonebook",
              label: t("group.invitePillPhonebook") || "Carnet",
            },
            {
              value: "contact",
              label: t("group.invitePillContact") || "Manuel",
            },
            ...(isAdmin
              ? [
                  {
                    value: "tracking" as const,
                    label: t("group.invitePillTracking") || "Suivi",
                  },
                ]
              : []),
          ]}
        />

        {mode === "share" && (
          <ShareMode
            inviteUrl={inviteUrl}
            loading={loadingToken}
            isAdmin={isAdmin}
            onCopy={copyLink}
            onShare={shareLink}
            t={t}
          />
        )}

        {mode === "whatsapp" && (
          <WhatsappBroadcastMode
            groupId={groupId}
            groupName={groupName}
            isAdmin={isAdmin}
            toast={toast}
            t={t}
          />
        )}

        {mode === "tracking" && (
          <InvitationsTrackingMode
            groupId={groupId}
            isAdmin={isAdmin}
            toast={toast}
            t={t}
          />
        )}

        {mode === "phonebook" && (
          <PhonebookMode
            groupId={groupId}
            dialog={dialog}
            toast={toast}
            onInvited={onInvited}
            onFallbackToManual={() => setMode("contact")}
            t={t}
          />
        )}

        {mode === "contact" && (
          <ContactMode
            contactType={contactType}
            setContactType={setContactType}
            contactValue={contactValue}
            setContactValue={setContactValue}
            displayName={displayName}
            setDisplayName={(v: string) => {
              setManualOverride(true);
              setDisplayName(v);
            }}
            sending={sending}
            onSend={sendInvite}
            t={t}
            lookupLoading={lookupLoading}
            matchedUserId={matchedUserId}
            matchedDisplayName={matchedDisplayName}
          />
        )}
      </div>
    </BottomSheet>
  );
}

function ShareMode({
  inviteUrl,
  loading,
  isAdmin,
  onCopy,
  onShare,
  t,
}: {
  inviteUrl: string;
  loading: boolean;
  isAdmin: boolean;
  onCopy: () => void;
  onShare: () => void;
  t: ReturnType<typeof useT>;
}) {
  if (!isAdmin) {
    return (
      <div
        style={{
          padding: 16,
          borderRadius: 12,
          background: "rgba(244,228,193,0.04)",
          border: "1px solid rgba(244,228,193,0.10)",
          color: "var(--cream-soft)",
          fontSize: 13,
          lineHeight: 1.5,
          textAlign: "center",
        }}
      >
        {t("group.notAdminInvite") ||
          "Seuls les admins du groupe peuvent générer un lien d'invitation."}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* QR code */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          padding: 14,
        }}
      >
        {loading || !inviteUrl ? (
          <div
            style={{
              width: 200,
              height: 200,
              borderRadius: 12,
              background: "rgba(244,228,193,0.04)",
              border: "1px dashed rgba(244,228,193,0.18)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--cream-soft)",
              fontSize: 12,
            }}
          >
            {loading
              ? t("common.generating") || "Génération…"
              : t("common.error") || "Erreur"}
          </div>
        ) : (
          <QrSvg value={inviteUrl} size={200} />
        )}
      </div>

      <p
        style={{
          margin: 0,
          fontSize: 12,
          color: "var(--cream-soft)",
          textAlign: "center",
          lineHeight: 1.5,
        }}
      >
        {t("group.scanQrHint") ||
          "Demande aux invités de scanner ce QR avec leur appareil photo."}
      </p>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={onCopy}
          disabled={loading || !inviteUrl}
          style={{
            flex: 1,
            padding: "12px 14px",
            background: "rgba(244,228,193,0.04)",
            border: "1px solid rgba(244,228,193,0.18)",
            borderRadius: 12,
            color: "var(--cream)",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            touchAction: "manipulation",
          }}
        >
          <IconCopy />
          {t("common.copyLink") || "Copier le lien"}
        </button>
        <button
          type="button"
          onClick={onShare}
          disabled={loading || !inviteUrl}
          style={{
            flex: 1,
            padding: "12px 14px",
            background:
              "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))",
            border: "none",
            borderRadius: 12,
            color: "#16111E",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            touchAction: "manipulation",
          }}
        >
          <IconShare />
          {t("common.share") || "Partager"}
        </button>
      </div>
    </div>
  );
}

function ContactMode({
  contactType,
  setContactType,
  contactValue,
  setContactValue,
  displayName,
  setDisplayName,
  sending,
  onSend,
  t,
  // V174.I — props lookup BMD
  lookupLoading,
  matchedUserId,
  matchedDisplayName,
}: {
  contactType: "PHONE" | "EMAIL";
  setContactType: (t: "PHONE" | "EMAIL") => void;
  contactValue: string;
  setContactValue: (v: string) => void;
  displayName: string;
  setDisplayName: (v: string) => void;
  sending: boolean;
  onSend: () => void;
  t: ReturnType<typeof useT>;
  lookupLoading?: boolean;
  matchedUserId?: string | null;
  matchedDisplayName?: string | null;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* V100 — Toggle PHONE/EMAIL = SegmentedControl partagé (cohérence dashboard) */}
      <SegmentedControl<"PHONE" | "EMAIL">
        value={contactType}
        onChange={setContactType}
        ariaLabel={t("group.contactType") || "Type de contact"}
        segments={[
          {
            value: "PHONE",
            label: t("group.contactPhone") || "Téléphone",
          },
          {
            value: "EMAIL",
            label: t("group.contactEmail") || "Email",
          },
        ]}
      />

      {/* Inputs */}
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
          {contactType === "PHONE"
            ? t("group.phoneLabel") || "Téléphone"
            : t("group.emailLabel") || "Email"}
        </label>
        <input
          type={contactType === "PHONE" ? "tel" : "email"}
          inputMode={contactType === "PHONE" ? "tel" : "email"}
          value={contactValue}
          onChange={(e) => setContactValue(e.target.value)}
          placeholder={contactType === "PHONE" ? "+33 6 12 34 56 78" : "ami@exemple.com"}
          style={{
            width: "100%",
            padding: "12px 14px",
            background: "rgba(244,228,193,0.04)",
            border: matchedUserId
              ? "1px solid #10b981"
              : "1px solid rgba(244,228,193,0.10)",
            borderRadius: 12,
            color: "var(--cream)",
            fontSize: 14,
            fontFamily: "inherit",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
        {/* V174.I — Badge lookup BMD (parité V155) */}
        {lookupLoading && (
          <div
            style={{
              marginTop: 6,
              fontSize: 11,
              color: "var(--cream-soft, rgba(244,228,193,0.55))",
              fontStyle: "italic",
            }}
          >
            {t("group.lookupInProgress") || "Recherche…"}
          </div>
        )}
        {!lookupLoading && matchedUserId && matchedDisplayName && (
          <div
            style={{
              marginTop: 8,
              padding: "8px 10px",
              borderRadius: 10,
              background: "rgba(16,185,129,0.12)",
              border: "1px solid rgba(16,185,129,0.35)",
              color: "#10b981",
              fontSize: 12,
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span aria-hidden>✓</span>
            <span>
              {t("group.bmdMemberFound", { name: matchedDisplayName }) ||
                `Membre BMD trouvé · ${matchedDisplayName} — infos auto-complétées`}
            </span>
          </div>
        )}
      </div>

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
          {t("group.displayNameOptional") || "Nom affiché (optionnel)"}
        </label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={t("group.displayNamePlaceholder") || "Maman, Frère, Jean…"}
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

      <button
        type="button"
        onClick={onSend}
        disabled={sending || !contactValue.trim()}
        style={{
          padding: "14px 20px",
          background:
            sending || !contactValue.trim()
              ? "rgba(244,228,193,0.10)"
              : "linear-gradient(135deg, var(--saffron), var(--terracotta))",
          color:
            sending || !contactValue.trim() ? "var(--muted)" : "#16111E",
          border: "none",
          borderRadius: 14,
          fontSize: 14,
          fontWeight: 700,
          cursor:
            sending || !contactValue.trim() ? "not-allowed" : "pointer",
          fontFamily: "inherit",
          touchAction: "manipulation",
        }}
      >
        {sending
          ? t("common.sending") || "Envoi…"
          : t("group.sendInvite") || "Envoyer l'invitation"}
      </button>
    </div>
  );
}

// ============ PHONEBOOK MODE (Contact Picker natif RGPD) ============

/**
 * Mode "Répertoire" : utilise navigator.contacts.select() pour piocher
 * dans le carnet d'adresses du téléphone, avec un workflow RGPD strict.
 *
 * Étapes :
 *  1. Au mount : on vérifie la disponibilité de l'API.
 *  2. L'utilisateur tape "Choisir mes contacts" → on affiche un dialog de
 *     consentement RGPD (BMD ne stocke aucun contact, ne lit que ce que
 *     l'utilisateur sélectionne, ne demande que name/tel/email).
 *  3. Si consenti : on appelle navigator.contacts.select({ multiple: true }).
 *     Le navigateur affiche son propre picker système — c'est lui qui filtre
 *     les contacts visibles (encore une couche de protection RGPD).
 *  4. L'utilisateur revoit la sélection dans BMD avant envoi.
 *  5. Envoi batch via api.batchInviteMembers.
 */
function PhonebookMode({
  groupId,
  dialog,
  toast,
  onInvited,
  onFallbackToManual,
  t,
}: {
  groupId: string;
  dialog: ReturnType<typeof useDialog>;
  toast: ReturnType<typeof useToast>;
  onInvited: () => void;
  /** V100 — Si le répertoire n'est pas dispo, bascule sur le mode "Manuel" */
  onFallbackToManual: () => void;
  t: ReturnType<typeof useT>;
}) {
  // V96 — Détection plateforme :
  //   - Capacitor natif (iOS/Android) → MobileContactPickerSheet (BMD)
  //   - Web Contacts API (Chrome Android) → idem, fallback automatique
  //   - Safari iOS / desktop → message d'indispo dans le picker
  const native = useNative();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [selected, setSelected] = useState<SelectedContact[]>([]);
  const [sending, setSending] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      setSupported(false);
      return;
    }
    // Disponible si Capacitor natif (plugin contacts) OU Web Contacts API
    const hasNative = Boolean(native);
    const hasWebApi =
      typeof (navigator as any).contacts === "object" &&
      typeof (navigator as any).contacts?.select === "function";
    setSupported(hasNative || hasWebApi);
  }, [native]);

  async function pickContacts() {
    // 1. Consentement RGPD AVANT d'ouvrir le picker système (rappel
    // utilisateur, même si on en fait à nouveau dans la picker sheet).
    const ok = await dialog.confirm(
      t("group.contactsConsentBody") ||
        "BMD aimerait accéder à ton répertoire pour t'aider à inviter tes proches.\n\n" +
          "• Les contacts NE SONT PAS sauvegardés sur nos serveurs.\n" +
          "• Tu choisis manuellement qui inviter — rien n'est envoyé sans ton accord.\n" +
          "• On ne lit que le nom, le téléphone et l'email — rien d'autre.\n" +
          "• Tu peux retirer ton consentement à tout moment.",
      {
        title: t("group.contactsConsentTitle") || "Accès au répertoire (RGPD)",
        variant: "info",
        confirmLabel: t("group.contactsConsentAccept") || "Autoriser",
        cancelLabel: t("common.cancel") || "Annuler",
      },
    );
    if (!ok) return;
    // 2. Ouvre le picker BMD (Capacitor natif ou Web Contacts API)
    setPickerOpen(true);
  }

  function handlePickerConfirm(contacts: PickedContact[]) {
    // Convertit PickedContact (nouveau format V96) en SelectedContact (legacy)
    // pour réutiliser la UI/sendAll existante sans tout refactorer.
    const mapped: SelectedContact[] = contacts.map((c) => ({
      name: c.displayName ? [c.displayName] : undefined,
      tel: c.phones.length > 0 ? c.phones : undefined,
      email: c.emails.length > 0 ? c.emails : undefined,
    }));
    setSelected(mapped);
    haptic("tap");
  }

  async function sendAll() {
    if (selected.length === 0) return;
    setSending(true);
    try {
      // Construit la liste d'invitations : pour chaque contact, on prend
      // tous les téléphones et emails (un contact peut avoir plusieurs).
      const invitations: Array<{
        contactType: "PHONE" | "EMAIL";
        contactValue: string;
        displayName?: string;
      }> = [];
      for (const c of selected) {
        const displayName = c.name?.[0];
        for (const phone of c.tel ?? []) {
          if (!phone) continue;
          invitations.push({
            contactType: "PHONE",
            contactValue: phone,
            displayName,
          });
        }
        for (const email of c.email ?? []) {
          if (!email) continue;
          invitations.push({
            contactType: "EMAIL",
            contactValue: email,
            displayName,
          });
        }
      }
      if (invitations.length === 0) {
        toast.info(
          t("group.noContactInfo") ||
            "Aucun téléphone ni email dans les contacts sélectionnés.",
        );
        return;
      }
      const r = await api.batchInviteMembers(groupId, invitations);
      const added = r.added?.length ?? 0;
      const failed = r.failed?.length ?? 0;
      haptic("success");
      if (added > 0 && failed === 0) {
        // V97 — Wording explicite : email envoyé + délai d'acceptation
        toast.success(
          t("group.batchAllSent", { count: String(added) }) ||
            `${added} invitation${added > 1 ? "s" : ""} envoyée${added > 1 ? "s" : ""} par e-mail · 30 jours pour accepter 📬`,
        );
      } else if (added > 0) {
        toast.info(
          t("group.batchPartial", {
            added: String(added),
            failed: String(failed),
          }) ||
            `${added} envoyée${added > 1 ? "s" : ""}, ${failed} échec${failed > 1 ? "s" : ""}`,
        );
      } else {
        toast.warning(
          t("group.batchAllFailed") ||
            "Aucune invitation n'a pu être envoyée.",
        );
      }
      setSelected([]);
      onInvited();
    } catch (e) {
      haptic("error");
      toast.error(e);
    } finally {
      setSending(false);
    }
  }

  if (supported === null) {
    return (
      <div
        style={{
          padding: 16,
          textAlign: "center",
          color: "var(--cream-soft)",
          fontSize: 13,
        }}
      >
        …
      </div>
    );
  }

  if (!supported) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          padding: 16,
          borderRadius: 12,
          background: "rgba(244,228,193,0.04)",
          border: "1px solid rgba(244,228,193,0.10)",
        }}
      >
        <div style={{ fontSize: 32, textAlign: "center" }}>📕</div>
        <p
          style={{
            fontSize: 13,
            color: "var(--cream)",
            margin: 0,
            lineHeight: 1.5,
            textAlign: "center",
          }}
        >
          <strong>
            {t("group.phonebookUnsupportedTitle") ||
              "Répertoire indisponible"}
          </strong>
        </p>
        <p
          style={{
            fontSize: 12,
            color: "var(--cream-soft)",
            margin: 0,
            lineHeight: 1.5,
            textAlign: "center",
          }}
        >
          {t("group.phonebookUnsupportedHint") ||
            "Ton navigateur ne permet pas l'accès au répertoire. Utilise plutôt le mode Partage (QR + lien) ou saisis un contact manuellement."}
        </p>
        {/* V100 — CTA primaire : bascule directe vers le mode "Manuel" */}
        <button
          type="button"
          onClick={onFallbackToManual}
          style={{
            padding: "12px 16px",
            background:
              "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))",
            color: "#16111E",
            border: "none",
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
            touchAction: "manipulation",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <IconUser />
          {t("group.phonebookFallbackManual") || "Saisir manuellement"}
          <span aria-hidden style={{ fontSize: 14 }}>→</span>
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* V96 — Picker carnet d'adresses cross-platform */}
      <MobileContactPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onConfirm={handlePickerConfirm}
      />

      {/* Encart RGPD permanent */}
      <div
        style={{
          padding: "10px 12px",
          background: "rgba(91,108,255,0.06)",
          border: "1px solid rgba(91,108,255,0.20)",
          borderRadius: 10,
          fontSize: 11.5,
          color: "var(--cream-soft)",
          lineHeight: 1.5,
        }}
      >
        🛡 <strong>{t("group.rgpdShield") || "Conforme RGPD"}</strong> ·{" "}
        {t("group.rgpdShortText") ||
          "Aucun contact n'est stocké. Tu valides la sélection avant l'envoi."}
      </div>

      {selected.length === 0 ? (
        <>
          <button
            type="button"
            onClick={pickContacts}
            style={{
              padding: "14px 18px",
              background:
                "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))",
              color: "#16111E",
              border: "none",
              borderRadius: 14,
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
              touchAction: "manipulation",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <IconBook />
            {t("group.pickContactsCta") || "Choisir mes contacts"}
          </button>
          <p
            style={{
              fontSize: 11,
              color: "var(--cream-soft)",
              textAlign: "center",
              margin: 0,
              lineHeight: 1.5,
              opacity: 0.8,
            }}
          >
            {t("group.pickContactsHint") ||
              "Le système t'ouvrira ton répertoire pour choisir manuellement les personnes à inviter."}
          </p>
        </>
      ) : (
        <>
          <div
            style={{
              fontSize: 11,
              color: "var(--saffron)",
              textTransform: "uppercase",
              letterSpacing: 1.4,
              fontWeight: 700,
              paddingLeft: 4,
            }}
          >
            {t("group.selectedToInvite", {
              count: String(selected.length),
            }) || `${selected.length} contact${selected.length > 1 ? "s" : ""} prêt${selected.length > 1 ? "s" : ""} à inviter`}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {selected.map((c, i) => {
              const name = c.name?.[0] || "(sans nom)";
              const phone = c.tel?.[0];
              const email = c.email?.[0];
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    background: "rgba(244,228,193,0.04)",
                    border: "1px solid rgba(244,228,193,0.08)",
                    borderRadius: 11,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 10,
                      background: "rgba(232,163,61,0.18)",
                      color: "var(--saffron)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {name.charAt(0).toUpperCase()}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--cream)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {name}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--muted)",
                        marginTop: 1,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {phone ?? email ?? "(sans contact)"}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Retirer"
                    onClick={() =>
                      setSelected(selected.filter((_, j) => j !== i))
                    }
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 8,
                      background: "transparent",
                      border: "none",
                      color: "var(--muted)",
                      cursor: "pointer",
                      fontSize: 16,
                      flexShrink: 0,
                    }}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={pickContacts}
              disabled={sending}
              style={{
                flex: 1,
                padding: "12px 14px",
                background: "rgba(244,228,193,0.04)",
                border: "1px solid rgba(244,228,193,0.18)",
                borderRadius: 12,
                color: "var(--cream-soft)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {t("group.pickMoreContacts") || "+ Ajouter"}
            </button>
            <button
              type="button"
              onClick={sendAll}
              disabled={sending}
              style={{
                flex: 2,
                padding: "12px 14px",
                background:
                  "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))",
                color: "#16111E",
                border: "none",
                borderRadius: 12,
                fontSize: 13,
                fontWeight: 700,
                cursor: sending ? "wait" : "pointer",
                fontFamily: "inherit",
                opacity: sending ? 0.7 : 1,
                touchAction: "manipulation",
              }}
            >
              {sending
                ? t("common.sending") || "Envoi…"
                : t("group.sendAllInvites", {
                    count: String(selected.length),
                  }) || `Envoyer ${selected.length} invitation${selected.length > 1 ? "s" : ""}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ============ V97.E — Mode Suivi (liste invitations + motifs refus) ============
//
// Visible uniquement aux admins. Liste toutes les invitations nominatives
// envoyées avec leur statut (PENDING / ACCEPTED / DECLINED / EXPIRED /
// REVOKED) et le motif de refus quand DECLINED. Bouton revoke pour les
// invitations PENDING.

type InvitationStatus =
  | "PENDING"
  | "ACCEPTED"
  | "DECLINED"
  | "EXPIRED"
  | "REVOKED";

interface InvitationItem {
  id: string;
  status: InvitationStatus;
  contactType: "PHONE" | "EMAIL";
  contactValue: string;
  displayName: string | null;
  createdAt: string;
  expiresAt: string;
  respondedAt: string | null;
  declineReason: string | null;
  invitedBy: { id: string; displayName: string };
  invitee: { id: string; displayName: string } | null;
}

const STATUS_META: Record<
  InvitationStatus,
  { label: string; color: string; bg: string }
> = {
  PENDING: { label: "En attente", color: "#C58A2E", bg: "rgba(197,138,46,0.14)" },
  ACCEPTED: { label: "Acceptée", color: "#3F8F65", bg: "rgba(63,143,101,0.14)" },
  DECLINED: { label: "Refusée", color: "#C44A3E", bg: "rgba(196,74,62,0.14)" },
  EXPIRED: { label: "Expirée", color: "#8A7C66", bg: "rgba(138,124,102,0.14)" },
  REVOKED: { label: "Annulée", color: "#8A7C66", bg: "rgba(138,124,102,0.14)" },
};

function InvitationsTrackingMode({
  groupId,
  isAdmin,
  toast,
  t,
}: {
  groupId: string;
  isAdmin: boolean;
  toast: ReturnType<typeof useToast>;
  t: ReturnType<typeof useT>;
}) {
  const [items, setItems] = useState<InvitationItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  async function load() {
    if (!isAdmin) return;
    setError(null);
    try {
      const r = await api.listGroupInvitations(groupId);
      setItems(r.items);
    } catch (e) {
      setError((e as Error)?.message ?? "Impossible de charger les invitations");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, isAdmin]);

  async function handleRevoke(id: string) {
    setRevokingId(id);
    try {
      await api.revokeInvitation(groupId, id);
      haptic("success");
      toast.info(t("group.invitationRevoked") || "Invitation annulée");
      await load();
    } catch (e) {
      toast.info((e as Error)?.message ?? "Annulation impossible");
    } finally {
      setRevokingId(null);
    }
  }

  if (!isAdmin) {
    return (
      <div
        style={{
          padding: 16,
          borderRadius: 12,
          background: "rgba(244,228,193,0.04)",
          border: "1px solid rgba(244,228,193,0.10)",
          color: "var(--cream-soft)",
          fontSize: 13,
          lineHeight: 1.5,
          textAlign: "center",
        }}
      >
        {t("group.notAdminInvite") ||
          "Seuls les admins peuvent voir le suivi des invitations."}
      </div>
    );
  }

  if (items === null && !error) {
    return (
      <div
        style={{
          padding: 14,
          textAlign: "center",
          color: "var(--cream-soft)",
          fontSize: 13,
        }}
      >
        Chargement…
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          padding: 12,
          background: "rgba(228,124,95,0.08)",
          border: "1px solid rgba(228,124,95,0.25)",
          borderRadius: 10,
          color: "#E47C5F",
          fontSize: 12.5,
          lineHeight: 1.5,
        }}
      >
        {error}
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div
        style={{
          padding: 18,
          borderRadius: 12,
          background: "rgba(244,228,193,0.04)",
          border: "1px solid rgba(244,228,193,0.10)",
          color: "var(--cream-soft)",
          fontSize: 13,
          textAlign: "center",
          lineHeight: 1.5,
        }}
      >
        Aucune invitation envoyée pour l'instant. Bascule sur « Contact » ou
        « Répertoire » pour en envoyer.
      </div>
    );
  }

  // Tri : PENDING en premier, puis par date desc
  const sorted = [...items].sort((a, b) => {
    if (a.status === "PENDING" && b.status !== "PENDING") return -1;
    if (b.status === "PENDING" && a.status !== "PENDING") return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          fontSize: 11,
          color: "var(--cream-soft)",
          textTransform: "uppercase",
          letterSpacing: 1.3,
          fontWeight: 700,
          paddingLeft: 4,
        }}
      >
        {items.length} invitation{items.length > 1 ? "s" : ""}
      </div>

      {sorted.map((inv) => {
        const meta = STATUS_META[inv.status];
        const createdDate = new Date(inv.createdAt).toLocaleDateString(
          "fr-FR",
          { day: "numeric", month: "short" },
        );
        const respondedDate = inv.respondedAt
          ? new Date(inv.respondedAt).toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "short",
            })
          : null;
        return (
          <div
            key={inv.id}
            style={{
              padding: "12px 13px",
              background: "rgba(244,228,193,0.04)",
              border: "1px solid rgba(244,228,193,0.08)",
              borderRadius: 12,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                minWidth: 0,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: "rgba(232,163,61,0.18)",
                  color: "var(--saffron)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {(inv.displayName ?? inv.contactValue)
                  .charAt(0)
                  .toUpperCase()}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--cream)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {inv.displayName ?? inv.contactValue}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--cream-soft)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {inv.contactValue} · envoyée le {createdDate}
                </div>
              </div>
              <span
                style={{
                  padding: "3px 8px",
                  borderRadius: 999,
                  background: meta.bg,
                  color: meta.color,
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: 0.3,
                  flexShrink: 0,
                }}
              >
                {meta.label}
              </span>
            </div>

            {/* Motif de refus si DECLINED */}
            {inv.status === "DECLINED" && inv.declineReason && (
              <div
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "rgba(196,74,62,0.06)",
                  border: "1px solid rgba(196,74,62,0.20)",
                  fontSize: 11.5,
                  lineHeight: 1.5,
                  color: "var(--cream)",
                }}
              >
                <span
                  style={{
                    fontWeight: 700,
                    color: "#C44A3E",
                    fontSize: 10.5,
                    textTransform: "uppercase",
                    letterSpacing: 0.8,
                    marginRight: 4,
                  }}
                >
                  Motif&nbsp;:
                </span>
                {inv.declineReason}
                {respondedDate && (
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--cream-soft)",
                      marginTop: 3,
                      opacity: 0.85,
                    }}
                  >
                    Reçu le {respondedDate}
                  </div>
                )}
              </div>
            )}

            {/* Bouton revoke pour les PENDING */}
            {inv.status === "PENDING" && (
              <button
                type="button"
                onClick={() => void handleRevoke(inv.id)}
                disabled={revokingId === inv.id}
                style={{
                  padding: "7px 10px",
                  borderRadius: 8,
                  border: "1px solid rgba(244,228,193,0.18)",
                  background: "transparent",
                  color: "var(--cream-soft)",
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: revokingId === inv.id ? "wait" : "pointer",
                  fontFamily: "inherit",
                  alignSelf: "flex-end",
                  opacity: revokingId === inv.id ? 0.6 : 1,
                }}
              >
                {revokingId === inv.id ? "Annulation…" : "Annuler l'invitation"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============ V97.D — Mode WhatsApp broadcast ============
//
// Génère un message + lien magique à coller dans un groupe WhatsApp.
// 3 tonalités proposées : chaleureux (default) / fun / pro.
// Bouton « Copier le message » + bouton « Ouvrir WhatsApp » (deeplink).

function WhatsappBroadcastMode({
  groupId,
  groupName,
  isAdmin,
  toast,
  t,
}: {
  groupId: string;
  groupName: string;
  isAdmin: boolean;
  toast: ReturnType<typeof useToast>;
  t: ReturnType<typeof useT>;
}) {
  const [tone, setTone] = useState<"chaleureux" | "fun" | "pro">(
    "chaleureux",
  );
  const [data, setData] = useState<{
    joinUrl: string;
    message: string;
    whatsappUrl: string;
    smsUrl: string;
    mailtoUrl: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Charge le message au mount (et à chaque changement de tonalité)
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .generateBroadcastInvite(groupId, { tone })
      .then((r) => {
        if (cancelled) return;
        setData({
          joinUrl: r.joinUrl,
          message: r.message,
          whatsappUrl: r.whatsappUrl,
          smsUrl: r.smsUrl,
          mailtoUrl: r.mailtoUrl,
        });
      })
      .catch((e) => {
        if (cancelled) return;
        setError((e as Error)?.message ?? "Impossible de générer le message");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId, tone, isAdmin]);

  async function copyMessage() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.message);
      haptic("success");
      toast.info(
        t("group.broadcastCopied") ||
          "Message copié — colle-le dans ton groupe WhatsApp 📋",
      );
    } catch {
      toast.info(t("common.copyFailed") || "Échec de la copie");
    }
  }

  if (!isAdmin) {
    return (
      <div
        style={{
          padding: 16,
          borderRadius: 12,
          background: "rgba(244,228,193,0.04)",
          border: "1px solid rgba(244,228,193,0.10)",
          color: "var(--cream-soft)",
          fontSize: 13,
          lineHeight: 1.5,
          textAlign: "center",
        }}
      >
        {t("group.notAdminInvite") ||
          "Seuls les admins du groupe peuvent générer un message d'invitation."}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Mini-intro */}
      <p
        style={{
          fontSize: 12.5,
          color: "var(--cream-soft)",
          margin: 0,
          lineHeight: 1.55,
        }}
      >
        Copie le message et colle-le dans ton groupe WhatsApp existant pour
        inviter tout le monde d'un coup à rejoindre <strong>{groupName}</strong>.
      </p>

      {/* Toggle tonalité */}
      <div
        role="tablist"
        aria-label="Tonalité du message"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 6,
          padding: 4,
          background: "rgba(244,228,193,0.04)",
          border: "1px solid rgba(244,228,193,0.06)",
          borderRadius: 11,
        }}
      >
        {(["chaleureux", "fun", "pro"] as const).map((opt) => {
          const active = tone === opt;
          return (
            <button
              key={opt}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTone(opt)}
              style={{
                padding: "8px 6px",
                borderRadius: 9,
                background: active
                  ? "linear-gradient(135deg, var(--saffron, #e8a33d), var(--terracotta, #b54732))"
                  : "transparent",
                color: active ? "#16111E" : "var(--cream-soft)",
                border: "none",
                fontWeight: active ? 700 : 600,
                fontSize: 12,
                cursor: "pointer",
                fontFamily: "inherit",
                textTransform: "capitalize",
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              {opt === "chaleureux"
                ? "Chaleureux"
                : opt === "fun"
                  ? "Fun"
                  : "Pro"}
            </button>
          );
        })}
      </div>

      {loading && (
        <p
          style={{
            padding: 14,
            textAlign: "center",
            color: "var(--cream-soft)",
            fontSize: 13,
            margin: 0,
          }}
        >
          Génération du message…
        </p>
      )}

      {error && !loading && (
        <div
          style={{
            padding: 12,
            background: "rgba(228,124,95,0.08)",
            border: "1px solid rgba(228,124,95,0.25)",
            borderRadius: 10,
            color: "#E47C5F",
            fontSize: 12.5,
            lineHeight: 1.5,
          }}
        >
          {error}
        </div>
      )}

      {data && !loading && (
        <>
          {/* Aperçu du message (lecture seule) */}
          <div
            style={{
              padding: "14px 14px",
              background: "rgba(244,228,193,0.04)",
              border: "1px solid rgba(244,228,193,0.10)",
              borderRadius: 12,
              fontSize: 13,
              lineHeight: 1.55,
              color: "var(--cream)",
              whiteSpace: "pre-line",
              maxHeight: 220,
              overflowY: "auto",
            }}
          >
            {data.message}
          </div>

          {/* Actions principales */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
            }}
          >
            <button
              type="button"
              onClick={copyMessage}
              style={{
                padding: "12px 12px",
                borderRadius: 12,
                border: "1px solid rgba(244,228,193,0.18)",
                background: "rgba(244,228,193,0.04)",
                color: "var(--cream)",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                touchAction: "manipulation",
              }}
            >
              <IconCopy />
              {t("group.broadcastCopy") || "Copier"}
            </button>
            <a
              href={data.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => haptic("tap")}
              style={{
                padding: "12px 12px",
                borderRadius: 12,
                border: "none",
                background: "#25D366",
                color: "#FFFFFF",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
                textDecoration: "none",
                textAlign: "center",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                boxShadow: "0 4px 12px rgba(37,211,102,0.25)",
              }}
            >
              <IconWhatsapp />
              {t("group.broadcastOpenWhatsapp") || "Ouvrir WhatsApp"}
            </a>
          </div>

          {/* Actions secondaires : SMS + mail */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
            }}
          >
            <a
              href={data.smsUrl}
              onClick={() => haptic("tap")}
              style={{
                padding: "10px 10px",
                borderRadius: 10,
                border: "1px solid rgba(244,228,193,0.12)",
                background: "transparent",
                color: "var(--cream-soft)",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                textDecoration: "none",
                textAlign: "center",
              }}
            >
              📱 SMS
            </a>
            <a
              href={data.mailtoUrl}
              onClick={() => haptic("tap")}
              style={{
                padding: "10px 10px",
                borderRadius: 10,
                border: "1px solid rgba(244,228,193,0.12)",
                background: "transparent",
                color: "var(--cream-soft)",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                textDecoration: "none",
                textAlign: "center",
              }}
            >
              ✉ Email
            </a>
          </div>

          {/* Hint */}
          <p
            style={{
              fontSize: 11,
              color: "var(--cream-soft)",
              textAlign: "center",
              margin: 0,
              lineHeight: 1.5,
              opacity: 0.7,
            }}
          >
            Le lien expire dans 14 jours. Tu peux générer un nouveau lien à
            tout moment en changeant la tonalité.
          </p>
        </>
      )}
    </div>
  );
}

// ============ QR (service externe — pas de dep npm) ============

/**
 * V117 — Wrapper qui délègue à `BrandedQR` (cf. `branded-qr.tsx`) pour
 * que TOUS les QR générés par BMD aient le même branding au centre.
 * Le fallback "…" reste géré localement pour rendre quelque chose tant
 * que le token n'est pas chargé.
 */
function QrSvg({
  value,
  size,
}: {
  value: string;
  size: number;
}) {
  if (!value) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 12,
          background: "#F4E4C1",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#16111E",
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        …
      </div>
    );
  }
  return <BrandedQR value={value} size={size} alt="QR code d'invitation" />;
}

// ============ ICONS ============

function IconShare() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}
function IconUser() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="7" r="4" />
      <path d="M4 21v-2a4 4 0 014-4h8a4 4 0 014 4v2" />
    </svg>
  );
}
function IconBook() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}
// V97.D — Icône WhatsApp simplifiée (filled glyph)
function IconWhatsapp() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 2a10 10 0 0 0-8.5 15.3L2 22l4.8-1.4A10 10 0 1 0 12 2zm5.4 14.1c-.2.6-1.3 1.2-1.8 1.2s-1.4.1-2.2-.2c-2.4-.9-4.5-3-5-3.8a4 4 0 0 1-.8-2c0-.6.3-1.1.6-1.4.3-.2.6-.4.9-.4h.5c.2 0 .4 0 .6.5l.7 1.6c.1.2.1.3 0 .5l-.3.4c-.2.2-.4.4-.2.7.2.4.9 1.4 1.9 2.3 1.2.9 2.2 1.2 2.5 1.4.2 0 .4 0 .5-.2l.8-.9c.2-.2.4-.2.6-.1l1.6.7c.4.2.5.2.5.4 0 .2 0 .8-.2 1.4z" />
    </svg>
  );
}
function IconCopy() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}
