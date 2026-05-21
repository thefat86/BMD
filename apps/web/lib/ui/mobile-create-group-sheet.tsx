"use client";

/**
 * <MobileCreateGroupSheet> · V73.2 — Wizard nouveau groupe (maquette V45).
 *
 * Étape 1 — 5 types fusionnés en cards blanches (paper) :
 *   - Card par défaut : fond paper, bord ivory-2 → effet "carte premium"
 *   - Card sélectionnée : gradient saffron-pale + ✓ rond saffron (top-right)
 *   - Icône SVG outline stroke 1.5px, cocoa-soft → saffron quand sélectionné
 *   - Card « Autre » span 2 colonnes pour aérer la dernière ligne
 *
 * Étape 2 — détails :
 *   - Inputs sur fond ivory, border saffron au focus (state isolé par champ)
 *   - Card aperçu en paper avec tag indigo (couleur info de la maquette)
 *   - Récap visuel du type sélectionné en icône colorée + label
 */

import { useEffect, useState } from "react";
import { BottomSheet } from "./bottom-sheet";
import { Icon, type IconName } from "./icons";
import { useT } from "../i18n/app-strings";
// V91.C — Étape 3 invitation : on appelle l'API batch directement.
import { api, ApiError } from "../api-client";
import { validateContact } from "../validators";
// V96 — Carnet d'adresses natif (Capacitor iOS/Android + Web Contacts API)
import {
  MobileContactPickerSheet,
  type PickedContact,
} from "./mobile-contact-picker-sheet";
// V96.1 — SegmentedControl partagé avec le dashboard byGroup/byPerson
import { SegmentedControl } from "./segmented-control";

type GroupType = "TONTINE" | "COLOC" | "TRAVEL" | "EVENT" | "OTHER";

const TYPES: Array<{
  code: GroupType;
  iconName: IconName;
  label: string;
  hint: string;
  span2?: boolean;
}> = [
  {
    code: "TONTINE",
    iconName: "coins",
    label: "Tontine",
    hint: "Rotation d'épargne",
  },
  {
    code: "COLOC",
    iconName: "home",
    label: "Coloc",
    hint: "Vivre ensemble",
  },
  {
    code: "TRAVEL",
    iconName: "plane",
    label: "Voyage & sortie",
    hint: "Vacances, week-end",
  },
  {
    code: "EVENT",
    iconName: "users",
    label: "Vie quotidienne",
    hint: "Amis, famille, repas",
  },
  {
    code: "OTHER",
    iconName: "folder",
    label: "Autre",
    hint: "Cas particulier",
    span2: true,
  },
];

interface MobileCreateGroupSheetProps {
  open: boolean;
  onClose: () => void;
  /**
   * Callback création. V91.C — Doit maintenant retourner le `groupId` créé
   * (chaîne UUID) pour permettre l'étape 3 d'invitations directes. Si le
   * caller retourne `undefined` (ou rien), on saute l'étape 3 et on ferme
   * comme avant pour rester rétrocompatible.
   */
  onCreate: (data: {
    type: GroupType;
    name: string;
    memberCount?: number;
    location?: string;
    currency: string;
    /**
     * V111 · Cocher si le groupe doit pouvoir générer des reçus fiscaux
     * (associations / organismes à but non lucratif). Activera la page
     * /tax-receipt côté frontend et le bouton dans les réglages.
     */
    taxReceiptsEnabled?: boolean;
  }) => Promise<string | void> | string | void;
  initialType?: GroupType;
}

type Step = 1 | 2 | 3;

interface PendingInvite {
  contactType: "PHONE" | "EMAIL";
  contactValue: string;
}

export function MobileCreateGroupSheet({
  open,
  onClose,
  onCreate,
  initialType,
}: MobileCreateGroupSheetProps) {
  const t = useT();
  const [step, setStep] = useState<Step>(initialType ? 2 : 1);
  const [selectedType, setSelectedType] = useState<GroupType | null>(
    initialType ?? null,
  );
  const [name, setName] = useState("");
  const [memberCount, setMemberCount] = useState<string>("");
  const [location, setLocation] = useState("");
  const [currency, setCurrency] = useState("EUR");
  // V111 · Coche reçu fiscal — opt-in pour les associations / asso à but
  // non lucratif. Par défaut désactivé.
  const [taxReceiptsEnabled, setTaxReceiptsEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  // V73.2 — focus tracking pour border saffron au focus
  const [focusedField, setFocusedField] = useState<
    "name" | "members" | "location" | "invite" | null
  >(null);
  // V58 — Gestion erreur : si l'API throw, on affiche le message au lieu
  // d'un silent fail (avant : bouton restait inactif sans feedback).
  const [error, setError] = useState<string | null>(null);

  // V91.C — État de l'étape 3 (invitations). Le groupId est récupéré après
  // l'appel onCreate à l'étape 2 et permet d'appeler batchInviteMembers.
  const [createdGroupId, setCreatedGroupId] = useState<string | null>(null);
  const [inviteType, setInviteType] = useState<"PHONE" | "EMAIL">("PHONE");
  const [inviteValue, setInviteValue] = useState<string>("+33");
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{
    added: number;
    failed: number;
  } | null>(null);
  // V96 — Picker carnet d'adresses
  const [contactPickerOpen, setContactPickerOpen] = useState(false);

  // V73.4 — À chaque ouverture du sheet, on garantit un état NEUF (étape 1,
  // tous les champs vides, pas d'erreur). Sans ça, un user qui ferme à
  // l'étape 2 et rouvre depuis un autre bouton tomberait sur l'étape 2
  // avec son ancien nom encore tapé. Le flow doit être identique partout :
  // « pourquoi tu crées ce groupe ? » → détails → créer.
  useEffect(() => {
    if (open) {
      setStep(initialType ? 2 : 1);
      setSelectedType(initialType ?? null);
      setName("");
      setMemberCount("");
      setLocation("");
      setTaxReceiptsEnabled(false);
      setFocusedField(null);
      setError(null);
      setCreatedGroupId(null);
      setInviteType("PHONE");
      setInviteValue("+33");
      setPendingInvites([]);
      setInviteSubmitting(false);
      setInviteResult(null);
    }
    // On ne dépend que de `open` pour ne pas réinitialiser pendant la
    // saisie. `initialType` est gelé au moment de l'ouverture (cohérent
    // avec le comportement du useState d'init initial).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selectedTypeMeta = TYPES.find((tp) => tp.code === selectedType);

  async function submit() {
    setError(null);
    if (!selectedType) {
      setError(t("createGroup.errorPickType") || "Sélectionne un type de groupe.");
      setStep(1);
      return;
    }
    if (!name.trim()) {
      setError(t("createGroup.errorName") || "Donne un nom à ton groupe.");
      return;
    }
    setBusy(true);
    try {
      // V91.C — `onCreate` peut maintenant retourner le `groupId` du nouveau
      // groupe. Si oui → on passe à l'étape 3 (invitations) au lieu de
      // fermer. Si caller renvoie void → comportement legacy (fermeture).
      const result = await onCreate({
        type: selectedType,
        name: name.trim(),
        memberCount: memberCount ? parseInt(memberCount, 10) : undefined,
        location: location.trim() || undefined,
        currency,
        taxReceiptsEnabled,
      });
      if (typeof result === "string" && /^[0-9a-f-]{36}$/i.test(result)) {
        setCreatedGroupId(result);
        setStep(3);
      } else {
        // Comportement legacy : reset + fermeture implicite par le caller
        setStep(1);
        setSelectedType(null);
        setName("");
        setMemberCount("");
        setLocation("");
      }
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Création échouée. Réessaie.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  // V91.C — Helpers étape 3 (invitations).
  function addInviteToQueue() {
    setError(null);
    const trimmed = inviteValue.trim();
    if (!trimmed || trimmed === "+33") return;
    const r = validateContact(inviteType, trimmed);
    if (!r.ok) {
      setError(r.message ?? "Contact invalide");
      return;
    }
    const normalized = r.value!;
    // Anti-doublon
    if (
      pendingInvites.some(
        (p) => p.contactType === inviteType && p.contactValue === normalized,
      )
    ) {
      setError("Ce contact est déjà dans la liste.");
      return;
    }
    setPendingInvites((prev) => [
      ...prev,
      { contactType: inviteType, contactValue: normalized },
    ]);
    // Reset input
    setInviteValue(inviteType === "PHONE" ? "+33" : "");
  }

  function removeInviteFromQueue(idx: number) {
    setPendingInvites((prev) => prev.filter((_, i) => i !== idx));
  }

  // V96 — Ajoute les contacts choisis depuis le carnet d'adresses natif
  function addFromPhoneBook(contacts: PickedContact[]) {
    setError(null);
    const additions: PendingInvite[] = [];
    for (const c of contacts) {
      // Priorité au téléphone (canal préféré BMD), email en backup
      const phone = c.phones[0];
      const email = c.emails[0];
      let contactType: "PHONE" | "EMAIL" | null = null;
      let raw: string | null = null;
      if (phone) {
        contactType = "PHONE";
        raw = phone;
      } else if (email) {
        contactType = "EMAIL";
        raw = email;
      }
      if (!contactType || !raw) continue;
      const v = validateContact(contactType, raw);
      if (!v.ok || !v.value) continue;
      const normalized = v.value;
      // Anti-doublon vs la queue existante + ajouts en cours
      const dupQueue = pendingInvites.some(
        (p) =>
          p.contactType === contactType && p.contactValue === normalized,
      );
      const dupAddition = additions.some(
        (p) =>
          p.contactType === contactType && p.contactValue === normalized,
      );
      if (dupQueue || dupAddition) continue;
      additions.push({ contactType, contactValue: normalized });
    }
    if (additions.length === 0) {
      setError(
        "Aucun contact exploitable dans la sélection (téléphone ou email valide manquant).",
      );
      return;
    }
    setPendingInvites((prev) => [...prev, ...additions]);
  }

  async function sendInvitations() {
    if (!createdGroupId || pendingInvites.length === 0) return;
    setError(null);
    setInviteResult(null);
    setInviteSubmitting(true);
    try {
      const res = await api.batchInviteMembers(
        createdGroupId,
        pendingInvites.map((p) => ({
          contactType: p.contactType,
          contactValue: p.contactValue,
        })),
      );
      setInviteResult({ added: res.added.length, failed: res.failed.length });
      // Si toutes ok, on ferme automatiquement après 1.2s pour laisser voir
      // le feedback « X invités »
      if (res.failed.length === 0) {
        setTimeout(() => onClose(), 1200);
      }
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.tip
            ? `${e.message}\n${e.tip}`
            : e.message
          : e instanceof Error
            ? e.message
            : "Envoi des invitations échoué.";
      setError(msg);
    } finally {
      setInviteSubmitting(false);
    }
  }

  // === Styles inputs (fond ivory, border saffron au focus) ===
  function inputStyle(focused: boolean): React.CSSProperties {
    return {
      width: "100%",
      padding: "13px 14px",
      background: "var(--ivory, #FBF6EC)",
      border: focused
        ? "1.5px solid var(--v45-saffron, #C58A2E)"
        : "1px solid var(--v45-line, rgba(43,31,21,0.12))",
      borderRadius: 12,
      color: "var(--cocoa, #2B1F15)",
      fontSize: 15,
      fontFamily: "inherit",
      outline: "none",
      boxShadow: focused
        ? "0 0 0 3px rgba(232,201,136,0.22)"
        : "none",
      transition: "border-color 140ms ease, box-shadow 140ms ease",
    };
  }

  function labelStyle(): React.CSSProperties {
    return {
      fontSize: 10,
      color: "var(--v45-saffron, #C58A2E)",
      letterSpacing: 1.3,
      textTransform: "uppercase",
      fontWeight: 800,
    };
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t("createGroup.title") || "Nouveau groupe"}
    >
      {/* Stepper-mini : 2 dots, saffron quand actif */}
      <div
        style={{
          display: "flex",
          gap: 6,
          margin: "0 auto 18px",
          width: "fit-content",
          alignItems: "center",
        }}
      >
        {[1, 2].map((s) => (
          <span
            key={s}
            style={{
              width: s === step ? 22 : 8,
              height: 8,
              borderRadius: 999,
              background:
                s <= step
                  ? "var(--v45-saffron, #C58A2E)"
                  : "var(--v45-line-strong, rgba(43,31,21,0.16))",
              transition: "width 220ms ease, background 220ms ease",
            }}
          />
        ))}
      </div>

      {/* ============ ÉTAPE 1 — Choix du type ============ */}
      {step === 1 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <header style={{ textAlign: "center" }}>
            <h2
              style={{
                fontFamily: "Cormorant Garamond, serif",
                fontSize: 24,
                fontWeight: 700,
                margin: 0,
                color: "var(--cocoa, #2B1F15)",
                lineHeight: 1.15,
              }}
            >
              Pour quoi tu crées ce groupe&nbsp;?
            </h2>
            <p
              style={{
                fontSize: 12.5,
                color: "var(--cocoa-soft, #6B5A47)",
                margin: "4px 0 0",
                lineHeight: 1.4,
              }}
            >
              Choisis ce qui ressemble le plus à ton projet.
            </p>
          </header>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
            }}
          >
            {TYPES.map((tp) => {
              const isSelected = selectedType === tp.code;
              return (
                <button
                  key={tp.code}
                  type="button"
                  onClick={() => setSelectedType(tp.code)}
                  aria-pressed={isSelected}
                  aria-label={tp.label}
                  style={{
                    position: "relative",
                    gridColumn: tp.span2 ? "1 / -1" : undefined,
                    padding: "18px 14px 16px",
                    display: "flex",
                    flexDirection: tp.span2 ? "row" : "column",
                    alignItems: "center",
                    justifyContent: tp.span2 ? "flex-start" : "center",
                    gap: tp.span2 ? 14 : 10,
                    background: isSelected
                      ? "linear-gradient(140deg, var(--v45-saffron-pale, #F6E8C5) 0%, var(--paper, #FFFFFF) 100%)"
                      : "var(--paper, #FFFFFF)",
                    border: isSelected
                      ? "1.5px solid var(--v45-saffron, #C58A2E)"
                      : "1px solid var(--v45-line, rgba(43,31,21,0.10))",
                    borderRadius: 16,
                    color: "var(--cocoa, #2B1F15)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition:
                      "transform 140ms ease, box-shadow 180ms ease, border-color 180ms ease, background 180ms ease",
                    boxShadow: isSelected
                      ? "0 8px 22px rgba(197,138,46,0.22), 0 1px 2px rgba(43,31,21,0.04)"
                      : "0 1px 2px rgba(43,31,21,0.05)",
                    minHeight: 110,
                    textAlign: tp.span2 ? "left" : "center",
                    transform: isSelected ? "translateY(-1px)" : "none",
                    WebkitTapHighlightColor: "transparent",
                    touchAction: "manipulation",
                  }}
                >
                  {/* Icône dans un cercle de fond ivory-2 ou saffron-pale */}
                  <span
                    aria-hidden
                    style={{
                      width: tp.span2 ? 48 : 52,
                      height: tp.span2 ? 48 : 52,
                      borderRadius: tp.span2 ? 12 : "50%",
                      background: isSelected
                        ? "rgba(197,138,46,0.18)"
                        : "var(--ivory-2, #F4ECD8)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      color: isSelected
                        ? "var(--v45-saffron, #C58A2E)"
                        : "var(--cocoa-soft, #6B5A47)",
                      transition: "background 180ms ease, color 180ms ease",
                    }}
                  >
                    <Icon
                      name={tp.iconName}
                      size={tp.span2 ? 22 : 26}
                      color="currentColor"
                      strokeWidth={1.5}
                    />
                  </span>

                  <span
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                      alignItems: tp.span2 ? "flex-start" : "center",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13.5,
                        fontWeight: isSelected ? 700 : 600,
                        color: "var(--cocoa, #2B1F15)",
                        lineHeight: 1.2,
                      }}
                    >
                      {tp.label}
                    </span>
                    <span
                      style={{
                        fontSize: 10.5,
                        color: "var(--cocoa-soft, #6B5A47)",
                        lineHeight: 1.3,
                        fontWeight: 500,
                      }}
                    >
                      {tp.hint}
                    </span>
                  </span>

                  {/* ✓ rond saffron en top-right */}
                  {isSelected && (
                    <span
                      aria-hidden
                      style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        background: "var(--v45-saffron, #C58A2E)",
                        color: "var(--paper, #FFFFFF)",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 4px 10px rgba(197,138,46,0.45)",
                        animation: "bmd-check-pop 220ms ease-out",
                      }}
                    >
                      <Icon
                        name="check"
                        size={14}
                        strokeWidth={2.5}
                        color="currentColor"
                      />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => selectedType && setStep(2)}
            disabled={!selectedType}
            style={{
              marginTop: 6,
              padding: "14px 18px",
              background: selectedType
                ? "linear-gradient(135deg, var(--v45-saffron, #C58A2E) 0%, var(--v45-terracotta, #9F4628) 100%)"
                : "var(--ivory-2, #F4ECD8)",
              color: selectedType ? "#FFFFFF" : "var(--cocoa-mute, #A99580)",
              border: "none",
              borderRadius: 14,
              fontWeight: 700,
              fontSize: 14,
              cursor: selectedType ? "pointer" : "not-allowed",
              fontFamily: "inherit",
              minHeight: 52,
              boxShadow: selectedType
                ? "0 8px 22px rgba(197,138,46,0.30)"
                : "none",
              transition: "all 180ms ease",
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {t("common.continue") || "Continuer"} →
          </button>
        </div>
      )}

      {/* ============ ÉTAPE 2 — Détails ============ */}
      {step === 2 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <header style={{ textAlign: "center" }}>
            <h2
              style={{
                fontFamily: "Cormorant Garamond, serif",
                fontSize: 24,
                fontWeight: 700,
                margin: 0,
                color: "var(--cocoa, #2B1F15)",
                lineHeight: 1.15,
              }}
            >
              Détails du groupe
            </h2>
            <p
              style={{
                fontSize: 12.5,
                color: "var(--cocoa-soft, #6B5A47)",
                margin: "4px 0 0",
              }}
            >
              {selectedTypeMeta?.label} · {selectedTypeMeta?.hint}
            </p>
          </header>

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={labelStyle()}>Nom du groupe</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onFocus={() => setFocusedField("name")}
              onBlur={() => setFocusedField(null)}
              placeholder="Ex: Famille Tsakou"
              autoFocus
              style={inputStyle(focusedField === "name")}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={labelStyle()}>
              Nombre de personnes{" "}
              <span
                style={{
                  fontWeight: 500,
                  color: "var(--cocoa-mute, #A99580)",
                  textTransform: "none",
                  letterSpacing: 0,
                }}
              >
                (optionnel)
              </span>
            </span>
            <input
              type="number"
              inputMode="numeric"
              value={memberCount}
              onChange={(e) => setMemberCount(e.target.value)}
              onFocus={() => setFocusedField("members")}
              onBlur={() => setFocusedField(null)}
              placeholder="7"
              className="bmd-num"
              style={inputStyle(focusedField === "members")}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={labelStyle()}>
              Lieu{" "}
              <span
                style={{
                  fontWeight: 500,
                  color: "var(--cocoa-mute, #A99580)",
                  textTransform: "none",
                  letterSpacing: 0,
                }}
              >
                (optionnel)
              </span>
            </span>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              onFocus={() => setFocusedField("location")}
              onBlur={() => setFocusedField(null)}
              placeholder="Luxembourg"
              style={inputStyle(focusedField === "location")}
            />
          </label>

          {/* === APERÇU CARD PAPER avec TAG INDIGO === */}
          <div
            style={{
              marginTop: 4,
              padding: 14,
              background: "var(--paper, #FFFFFF)",
              border: "1px solid var(--v45-line, rgba(43,31,21,0.10))",
              borderRadius: 14,
              boxShadow: "0 1px 3px rgba(43,31,21,0.04)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 10,
              }}
            >
              <span
                style={{
                  padding: "3px 9px",
                  background: "var(--v45-indigo, #4458B5)",
                  color: "#FFFFFF",
                  borderRadius: 999,
                  fontSize: 9.5,
                  fontWeight: 800,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                }}
              >
                Aperçu
              </span>
              <span
                style={{
                  fontSize: 10.5,
                  color: "var(--cocoa-mute, #A99580)",
                  fontWeight: 500,
                }}
              >
                Ce qui sera créé
              </span>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  background: "var(--v45-saffron-pale, #F6E8C5)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--v45-saffron, #C58A2E)",
                  flexShrink: 0,
                }}
              >
                {selectedTypeMeta && (
                  <Icon
                    name={selectedTypeMeta.iconName}
                    size={22}
                    color="currentColor"
                    strokeWidth={1.5}
                  />
                )}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: "var(--cocoa, #2B1F15)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {name.trim() || (
                    <span
                      style={{
                        color: "var(--cocoa-mute, #A99580)",
                        fontWeight: 500,
                        fontStyle: "italic",
                      }}
                    >
                      Nom à définir
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: "var(--cocoa-soft, #6B5A47)",
                    marginTop: 2,
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <span>{selectedTypeMeta?.label}</span>
                  {memberCount && (
                    <>
                      <span aria-hidden style={{ opacity: 0.5 }}>
                        ·
                      </span>
                      <span className="bmd-num">
                        {memberCount}{" "}
                        {parseInt(memberCount, 10) > 1
                          ? "personnes"
                          : "personne"}
                      </span>
                    </>
                  )}
                  {location.trim() && (
                    <>
                      <span aria-hidden style={{ opacity: 0.5 }}>
                        ·
                      </span>
                      <span>{location.trim()}</span>
                    </>
                  )}
                  <span aria-hidden style={{ opacity: 0.5 }}>
                    ·
                  </span>
                  <span>{currency}</span>
                </div>
              </div>
            </div>
          </div>

          {/* V111 — Question "Reçu fiscal" : opt-in pour les associations
              ou organismes à but non lucratif. Cocher active la fonction
              "Imprimer le reçu fiscal" dans les réglages. Désactivable
              plus tard. */}
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              padding: "14px 16px",
              background: taxReceiptsEnabled
                ? "var(--v45-saffron-pale, #F6E8C5)"
                : "var(--ivory, #FBF6EC)",
              border: taxReceiptsEnabled
                ? "1px solid var(--v45-saffron, #C58A2E)"
                : "1px solid rgba(43,31,21,0.10)",
              borderRadius: 14,
              cursor: "pointer",
              transition: "background 0.18s, border-color 0.18s",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <input
              type="checkbox"
              checked={taxReceiptsEnabled}
              onChange={(e) => setTaxReceiptsEnabled(e.target.checked)}
              style={{
                width: 20,
                height: 20,
                marginTop: 2,
                accentColor: "var(--v45-saffron, #C58A2E)",
                flexShrink: 0,
                cursor: "pointer",
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13.5,
                  fontWeight: 700,
                  color: "var(--cocoa, #2B1F15)",
                  lineHeight: 1.3,
                }}
              >
                {t("createGroup.taxReceiptsLabel") ||
                  "Émettre des reçus fiscaux pour les membres"}
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: "var(--cocoa-soft, #6B5A47)",
                  marginTop: 4,
                  lineHeight: 1.5,
                }}
              >
                {t("createGroup.taxReceiptsHint") ||
                  "Coche si ce groupe est une association ou un organisme à but non lucratif (article 200 du CGI). Tu pourras le modifier plus tard."}
              </div>
            </div>
          </label>

          {/* Erreur (V58) */}
          {error && (
            <div
              role="alert"
              style={{
                padding: "11px 13px",
                background: "rgba(159,42,36,0.08)",
                border: "1px solid rgba(159,42,36,0.30)",
                borderRadius: 11,
                color: "var(--v45-terracotta, #9F4628)",
                fontSize: 12.5,
                lineHeight: 1.4,
              }}
            >
              <strong style={{ marginRight: 6 }}>⚠</strong>
              {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep(1);
              }}
              style={{
                flex: 1,
                padding: "13px 16px",
                background: "transparent",
                color: "var(--cocoa-soft, #6B5A47)",
                border: "1px solid var(--v45-line-strong, rgba(43,31,21,0.16))",
                borderRadius: 12,
                fontWeight: 600,
                fontSize: 13.5,
                cursor: "pointer",
                fontFamily: "inherit",
                minHeight: 50,
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              ← Retour
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!name.trim() || busy}
              style={{
                flex: 2,
                padding: "13px 16px",
                background:
                  name.trim() && !busy
                    ? "linear-gradient(135deg, var(--v45-saffron, #C58A2E) 0%, var(--v45-terracotta, #9F4628) 100%)"
                    : "var(--ivory-2, #F4ECD8)",
                color:
                  name.trim() && !busy
                    ? "#FFFFFF"
                    : "var(--cocoa-mute, #A99580)",
                border: "none",
                borderRadius: 12,
                fontWeight: 700,
                fontSize: 14,
                cursor: name.trim() && !busy ? "pointer" : "not-allowed",
                fontFamily: "inherit",
                minHeight: 50,
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
                opacity: busy ? 0.75 : 1,
                boxShadow:
                  name.trim() && !busy
                    ? "0 8px 22px rgba(197,138,46,0.30)"
                    : "none",
                transition: "all 180ms ease",
              }}
            >
              {busy
                ? t("common.creating") || "Création…"
                : t("createGroup.cta") || "Créer le groupe"}
            </button>
          </div>
        </div>
      )}

      {/* ============ ÉTAPE 3 — Invitations initiales (V91.C) ============
          Apparaît si onCreate a retourné un groupId UUID. L'utilisateur peut
          ajouter des contacts (téléphone E.164 ou email) à inviter directement,
          ou passer pour finir plus tard via le bouton « Inviter » de la vue
          groupe. */}
      {step === 3 && createdGroupId && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <header style={{ textAlign: "center" }}>
            <h2
              style={{
                fontFamily: "Cormorant Garamond, serif",
                fontSize: 24,
                fontWeight: 700,
                margin: 0,
                color: "var(--cocoa, #2B1F15)",
                lineHeight: 1.15,
              }}
            >
              Groupe créé&nbsp;!
            </h2>
            <p
              style={{
                fontSize: 12.5,
                color: "var(--cocoa-soft, #6B5A47)",
                margin: "4px 0 0",
              }}
            >
              {name.trim()} · {selectedTypeMeta?.label}
            </p>
            <p
              style={{
                fontSize: 13,
                color: "var(--cocoa, #2B1F15)",
                margin: "10px 0 0",
                lineHeight: 1.4,
              }}
            >
              Tu peux inviter quelques personnes maintenant, ou plus tard
              depuis la page du groupe.
            </p>
          </header>

          {/* V96.1 — Toggle PHONE / EMAIL : on réutilise le composant
              SegmentedControl partagé avec le dashboard (byGroup/byPerson).
              Pill saffron solide animé, invariant XOR garanti, min 44 px iOS,
              jamais d'état « rien sélectionné ». */}
          <SegmentedControl<"PHONE" | "EMAIL">
            value={inviteType}
            onChange={(next) => {
              if (next === inviteType) return;
              setInviteType(next);
              // Reset valeur saisie pour éviter de garder un email dans le champ
              // téléphone (ou inversement) après bascule.
              setInviteValue(next === "PHONE" ? "+33" : "");
              setError(null);
            }}
            ariaLabel="Type de contact"
            segments={[
              { value: "PHONE", label: "Téléphone" },
              { value: "EMAIL", label: "Email" },
            ]}
          />

          {/* V96 — Bouton carnet d'adresses (Capacitor natif + Web Contacts) */}
          <button
            type="button"
            onClick={() => {
              setError(null);
              setContactPickerOpen(true);
            }}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px dashed var(--v45-saffron, #C58A2E)",
              background:
                "linear-gradient(135deg, var(--v45-saffron-pale, #F6E8C5), rgba(255,255,255,0.4))",
              color: "var(--v45-saffron, #C58A2E)",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              touchAction: "manipulation",
            }}
          >
            <Icon name="users" size={16} />
            Choisir dans mon répertoire
          </button>

          {/* Champ saisie contact + bouton + */}
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type={inviteType === "EMAIL" ? "email" : "tel"}
              inputMode={inviteType === "EMAIL" ? "email" : "tel"}
              autoCapitalize="off"
              spellCheck={false}
              value={inviteValue}
              onChange={(e) => setInviteValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addInviteToQueue();
                }
              }}
              onFocus={() => setFocusedField("invite")}
              onBlur={() => setFocusedField(null)}
              placeholder={
                inviteType === "PHONE"
                  ? "+33 6 12 34 56 78"
                  : "ami@exemple.com"
              }
              style={{
                ...inputStyle(focusedField === "invite"),
                flex: 1,
              }}
            />
            <button
              type="button"
              onClick={addInviteToQueue}
              disabled={
                !inviteValue.trim() ||
                inviteValue.trim() === "+33"
              }
              style={{
                padding: "0 18px",
                borderRadius: 12,
                background: "var(--v45-saffron-pale, #F6E8C5)",
                border: "1px solid var(--v45-saffron, #C58A2E)",
                color: "var(--v45-saffron, #C58A2E)",
                fontWeight: 700,
                fontSize: 18,
                cursor:
                  !inviteValue.trim() || inviteValue.trim() === "+33"
                    ? "not-allowed"
                    : "pointer",
                opacity:
                  !inviteValue.trim() || inviteValue.trim() === "+33"
                    ? 0.4
                    : 1,
                fontFamily: "inherit",
                minWidth: 48,
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
              }}
              aria-label={t("group.addToList") || "Ajouter à la liste"}
            >
              +
            </button>
          </div>

          {/* Liste pendingInvites */}
          {pendingInvites.length > 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                padding: 10,
                background: "var(--paper, #FFFFFF)",
                border: "1px solid var(--v45-line, rgba(43,31,21,0.10))",
                borderRadius: 12,
                maxHeight: 200,
                overflowY: "auto",
              }}
            >
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: "var(--v45-saffron, #C58A2E)",
                  textTransform: "uppercase",
                  letterSpacing: 1.3,
                  marginBottom: 4,
                }}
              >
                À inviter ({pendingInvites.length})
              </div>
              {pendingInvites.map((inv, idx) => (
                <div
                  key={`${inv.contactType}-${inv.contactValue}-${idx}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    background: "var(--ivory, #FBF6EC)",
                    borderRadius: 10,
                  }}
                >
                  <Icon
                    name={inv.contactType === "PHONE" ? "phone" : "mail"}
                    size={14}
                    color="var(--cocoa-soft, #6B5A47)"
                    strokeWidth={2}
                  />
                  <span
                    style={{
                      flex: 1,
                      fontSize: 13,
                      color: "var(--cocoa, #2B1F15)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {inv.contactValue}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeInviteFromQueue(idx)}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 13,
                      background: "transparent",
                      border: "1px solid var(--v45-line-strong, rgba(43,31,21,0.16))",
                      color: "var(--cocoa-soft, #6B5A47)",
                      cursor: "pointer",
                      fontSize: 14,
                      lineHeight: 1,
                      fontFamily: "inherit",
                      touchAction: "manipulation",
                      WebkitTapHighlightColor: "transparent",
                    }}
                    aria-label="Retirer"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Erreur */}
          {error && (
            <div
              role="alert"
              style={{
                padding: "11px 13px",
                background: "rgba(159,42,36,0.08)",
                border: "1px solid rgba(159,42,36,0.30)",
                borderRadius: 11,
                color: "var(--v45-terracotta, #9F4628)",
                fontSize: 12.5,
                lineHeight: 1.4,
              }}
            >
              <strong style={{ marginRight: 6 }}>⚠</strong>
              {error}
            </div>
          )}

          {/* Résultat de l'envoi */}
          {inviteResult && (
            <div
              role="status"
              style={{
                padding: "11px 13px",
                background: "rgba(63,125,92,0.10)",
                border: "1px solid rgba(63,125,92,0.30)",
                borderRadius: 11,
                color: "#3F7D5C",
                fontSize: 12.5,
                lineHeight: 1.4,
              }}
            >
              ✓ {inviteResult.added} invitation
              {inviteResult.added > 1 ? "s" : ""} envoyée
              {inviteResult.added > 1 ? "s" : ""} par e-mail
              {inviteResult.failed > 0 && (
                <>
                  {" "}
                  · {inviteResult.failed} échec
                  {inviteResult.failed > 1 ? "s" : ""}
                </>
              )}
              <div
                style={{
                  marginTop: 4,
                  fontSize: 11,
                  opacity: 0.85,
                  fontWeight: 500,
                }}
              >
                Tes invités ont 30&nbsp;jours pour accepter 📬
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: "13px 16px",
                background: "transparent",
                color: "var(--cocoa-soft, #6B5A47)",
                border: "1px solid var(--v45-line-strong, rgba(43,31,21,0.16))",
                borderRadius: 12,
                fontWeight: 600,
                fontSize: 13.5,
                cursor: "pointer",
                fontFamily: "inherit",
                minHeight: 50,
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              {pendingInvites.length === 0 ? "Passer" : "Plus tard"}
            </button>
            <button
              type="button"
              onClick={sendInvitations}
              disabled={pendingInvites.length === 0 || inviteSubmitting}
              style={{
                flex: 2,
                padding: "13px 16px",
                background:
                  pendingInvites.length > 0 && !inviteSubmitting
                    ? "linear-gradient(135deg, var(--v45-saffron, #C58A2E) 0%, var(--v45-terracotta, #9F4628) 100%)"
                    : "var(--ivory-2, #F4ECD8)",
                color:
                  pendingInvites.length > 0 && !inviteSubmitting
                    ? "#FFFFFF"
                    : "var(--cocoa-mute, #A99580)",
                border: "none",
                borderRadius: 12,
                fontWeight: 700,
                fontSize: 14,
                cursor:
                  pendingInvites.length > 0 && !inviteSubmitting
                    ? "pointer"
                    : "not-allowed",
                fontFamily: "inherit",
                minHeight: 50,
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
                opacity: inviteSubmitting ? 0.75 : 1,
                boxShadow:
                  pendingInvites.length > 0 && !inviteSubmitting
                    ? "0 8px 22px rgba(197,138,46,0.30)"
                    : "none",
                transition: "all 180ms ease",
              }}
            >
              {inviteSubmitting
                ? "Envoi…"
                : pendingInvites.length === 0
                  ? "Inviter…"
                  : `Inviter ${pendingInvites.length} personne${pendingInvites.length > 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes bmd-check-pop {
          0% {
            transform: scale(0.4);
            opacity: 0;
          }
          60% {
            transform: scale(1.1);
            opacity: 1;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>

      {/* V96 — Picker carnet d'adresses (Capacitor natif + Web Contacts API) */}
      <MobileContactPickerSheet
        open={contactPickerOpen}
        onClose={() => setContactPickerOpen(false)}
        onConfirm={addFromPhoneBook}
        intro={
          t("group.contactsIntroCreate") ||
          "Sélectionne les amis à inviter dans ce nouveau groupe. Tu pourras toujours ajuster avant l'envoi."
        }
      />
    </BottomSheet>
  );
}
