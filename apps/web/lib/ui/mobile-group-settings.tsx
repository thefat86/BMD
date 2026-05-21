"use client";

/**
 * <MobileGroupSettings> · V40 — refonte settings groupe mobile.
 *
 * Innovation visuelle :
 *  1. HERO "ADN DU GROUPE" — grand emoji du type + nom éditable inline
 *     (tap → mini form) + chips (devise, nb membres, date création).
 *  2. SECTIONS ACCORDÉON iOS — chaque section (Général, Membres, Notifications,
 *     Permissions, Danger Zone) est repliable avec animation. Icône à gauche.
 *  3. DANGER ZONE séparée visuellement (gradient rouge subtil) en bas, avec
 *     warning explicite avant suppression.
 *  4. ROLE PILL — chaque membre montre son rôle en pill colorée (admin saffron,
 *     trésorier emerald, observateur muted).
 *
 * Lecture seule pour non-admin : tout est visible mais non-éditable, le
 * danger zone est caché.
 */

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, clearToken, isUnauthorized } from "../api-client";
import { useToast } from "./toast";
import { useDialog } from "./dialog-provider";
import { useT } from "../i18n/app-strings";
import { BottomSheet } from "./bottom-sheet";
import { haptic } from "../platform";
import { CategoryRulesBlock } from "./category-rules-block";
import { GroupThemeBlock } from "./group-theme-block";
// V52.C2 — SVG remplace EMOJI : icon registry V52.A2
import { Icon, GroupTypeIcon, type IconName } from "./icons";

interface Member {
  id: string;
  role: "ADMIN" | "TREASURER" | "MEMBER" | "OBSERVER";
  joinedAt?: string;
  doNotDisturb?: boolean;
  user: { id: string; displayName: string; avatar?: string | null };
}
interface Group {
  id: string;
  name: string;
  type?: string;
  defaultCurrency: string;
  createdAt: string;
  members: Member[];
  /** V111 · Active la fonction « reçu fiscal » pour ce groupe. */
  taxReceiptsEnabled?: boolean;
  /** V141 · Exige la confirmation receveur après déclaration paiement. */
  paymentConfirmationRequired?: boolean;
}

// V52.C2 — SVG remplace EMOJI : GroupTypeIcon gère TONTINE/COLOC/TRAVEL/EVENT/CLUB/PARISH/GENERIC

type Section = "general" | "members" | "notifications" | "categories" | "theme" | "danger";

export function MobileGroupSettings({ groupId }: { groupId: string }) {
  const router = useRouter();
  const t = useT();
  const toast = useToast();
  const dialog = useDialog();

  const [group, setGroup] = useState<Group | null>(null);
  const [me, setMe] = useState<{ id: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sections ouvertes — par défaut "general" ouvert
  const [openSections, setOpenSections] = useState<Set<Section>>(
    new Set(["general"]),
  );

  // Edition inline
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [saving, setSaving] = useState(false);

  // BottomSheets
  const [memberSheet, setMemberSheet] = useState<Member | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [meRes, g] = await Promise.all([
        api.me(),
        api.getGroup(groupId),
      ]);
      setMe(meRes.user);
      setGroup(g);
      setDraftName(g.name);
      setError(null);
    } catch (e) {
      if (isUnauthorized(e)) {
        clearToken();
        router.replace("/login");
        return;
      }
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [groupId, router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const myMember = group?.members.find((m) => m.user.id === me?.id);
  const isAdmin = myMember?.role === "ADMIN";

  function toggleSection(s: Section) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
    haptic("tap");
  }

  async function saveName() {
    if (!group || draftName.trim() === group.name) {
      setEditingName(false);
      return;
    }
    setSaving(true);
    try {
      await api.updateGroup(groupId, { name: draftName.trim() });
      haptic("success");
      toast.success(t("groupSettings.nameSaved") || "Nom mis à jour");
      setEditingName(false);
      void refresh();
    } catch (e) {
      haptic("error");
      toast.error(e);
    } finally {
      setSaving(false);
    }
  }

  async function changeCurrency() {
    if (!group) return;
    const next = await dialog.prompt(
      t("groupSettings.currencyPromptBody") ||
        "Saisis le code ISO 4217 (3 lettres). Ex : EUR, USD, XAF, NGN.",
      {
        title: t("groupSettings.currencyPromptTitle") || "Devise par défaut",
        defaultValue: group.defaultCurrency,
        confirmLabel: t("common.save") || "Enregistrer",
        cancelLabel: t("common.cancel") || "Annuler",
        validate: (v) =>
          v.trim().length === 3
            ? null
            : t("groupSettings.currencyInvalid") || "3 lettres attendues",
      },
    );
    if (!next || next.trim().length !== 3) return;
    try {
      await api.updateGroup(groupId, {
        defaultCurrency: next.trim().toUpperCase(),
      });
      haptic("success");
      toast.success(t("groupSettings.currencySaved") || "Devise mise à jour");
      void refresh();
    } catch (e) {
      haptic("error");
      toast.error(e);
    }
  }

  async function setMemberRole(member: Member, role: Member["role"]) {
    try {
      await api.changeMemberRole(groupId, member.id, role);
      haptic("success");
      toast.success(t("groupSettings.roleChanged") || "Rôle mis à jour");
      setMemberSheet(null);
      void refresh();
    } catch (e) {
      haptic("error");
      toast.error(e);
    }
  }

  async function removeMember(member: Member) {
    const ok = await dialog.confirm(
      t("groupSettings.removeMemberBody", {
        name: member.user.displayName,
      }) ||
        `Retirer ${member.user.displayName} du groupe ?\nLes dépenses passées resteront, mais cette personne ne pourra plus en ajouter.`,
      {
        title: t("groupSettings.removeMemberTitle") || "Retirer ce membre ?",
        variant: "danger",
        confirmLabel: t("groupSettings.removeMemberCta") || "Retirer",
        cancelLabel: t("common.cancel") || "Annuler",
      },
    );
    if (!ok) return;
    try {
      await api.removeMember(groupId, member.id);
      haptic("success");
      toast.success(t("groupSettings.memberRemoved") || "Membre retiré");
      setMemberSheet(null);
      void refresh();
    } catch (e) {
      haptic("error");
      toast.error(e);
    }
  }

  async function toggleDnd() {
    if (!myMember) return;
    try {
      await api.setGroupDND(groupId, !myMember.doNotDisturb);
      haptic("tap");
      toast.info(
        !myMember.doNotDisturb
          ? t("groupSettings.dndOn") || "Notifications coupées pour ce groupe"
          : t("groupSettings.dndOff") || "Notifications réactivées",
      );
      void refresh();
    } catch (e) {
      toast.error(e);
    }
  }

  async function deleteGroup() {
    if (!group) return;
    const phrase = group.name.toUpperCase();
    const typed = await dialog.prompt(
      t("groupSettings.deleteBody", { name: group.name, phrase }) ||
        `Cette action est IRRÉVERSIBLE. Toutes les dépenses, balances, tontines et invitations seront supprimées.\n\nTape exactement ${phrase} pour confirmer.`,
      {
        title: t("groupSettings.deleteTitle") || "Supprimer le groupe ?",
        variant: "danger",
        confirmLabel: t("groupSettings.deleteConfirm") || "Supprimer définitivement",
        cancelLabel: t("common.cancel") || "Annuler",
        defaultValue: "",
        placeholder: phrase,
      },
    );
    if (typed === null) return;
    if (typed.trim().toUpperCase() !== phrase) {
      toast.warning(
        t("groupSettings.deletePhraseMismatch") ||
          "Texte de confirmation incorrect. Suppression annulée.",
      );
      return;
    }
    try {
      await api.deleteGroup(groupId);
      haptic("success");
      toast.info(t("groupSettings.groupDeleted") || "Groupe supprimé");
      router.replace("/dashboard");
    } catch (e) {
      haptic("error");
      toast.error(e);
    }
  }

  // ============ RENDER ============

  if (loading) return <SettingsSkeleton />;
  if (error || !group) {
    return (
      <div style={{ padding: "20px 16px", color: "var(--cream-soft)" }}>
        <div
          style={{
            padding: 16,
            borderRadius: 14,
            background: "rgba(217,113,74,0.10)",
            border: "1px solid rgba(217,113,74,0.30)",
            color: "#FFB89A",
            fontSize: 13,
          }}
        >
          {error || t("common.notFound") || "Groupe introuvable"}
        </div>
      </div>
    );
  }

  // V52.C2 — SVG remplace EMOJI
  const groupTypeKey = group.type ?? "GENERIC";

  return (
    <div
      style={{
        padding: "0 16px 80px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {/* HERO ADN du groupe — V109 : migré V45-light (gradient indigo →
          ivory chaud, texte cream → cocoa). Garde la même identité visuelle
          (avatar coloré gauche + nom éditable + chips métadata) mais lisible
          sur le shell V45 du reste de l'app. */}
      <section
        style={{
          padding: "20px 18px",
          borderRadius: 22,
          background:
            "linear-gradient(135deg, #FBF6EC 0%, #F6E8C5 60%, #F4ECD8 100%)",
          border: "1px solid rgba(197,138,46,0.22)",
          position: "relative",
          overflow: "hidden",
          boxShadow:
            "0 6px 20px rgba(43,31,21,0.08), 0 1px 2px rgba(43,31,21,0.06)",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: -60,
            right: -60,
            width: 180,
            height: 180,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(197,138,46,0.20), transparent 70%)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginBottom: 10,
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background:
                "linear-gradient(135deg, rgba(197,138,46,0.18), rgba(232,201,136,0.10))",
              border: "1px solid rgba(197,138,46,0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--v45-saffron, #C58A2E)",
              flexShrink: 0,
              boxShadow: "0 8px 22px rgba(197,138,46,0.16)",
            }}
          >
            {/* V52.C2 — SVG remplace EMOJI */}
            <GroupTypeIcon type={groupTypeKey} size={32} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {editingName ? (
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  autoFocus
                  style={{
                    flex: 1,
                    fontFamily: "Cormorant Garamond, serif",
                    fontSize: 20,
                    fontWeight: 700,
                    color: "var(--cocoa, #2B1F15)",
                    background: "var(--paper, #FFFFFF)",
                    border: "1px solid rgba(197,138,46,0.40)",
                    borderRadius: 10,
                    padding: "6px 10px",
                    minWidth: 0,
                    outline: "none",
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveName();
                    if (e.key === "Escape") {
                      setEditingName(false);
                      setDraftName(group.name);
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => void saveName()}
                  disabled={saving}
                  aria-label="OK"
                  style={{
                    padding: "6px 12px",
                    background:
                      "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--v45-terracotta, #9F4628))",
                    color: "#FFFFFF",
                    border: "none",
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {/* V52.C2 — SVG remplace EMOJI */}
                  <Icon name="check" size={14} strokeWidth={2} color="#FFFFFF" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => isAdmin && setEditingName(true)}
                disabled={!isAdmin}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  textAlign: "left",
                  cursor: isAdmin ? "pointer" : "default",
                  color: "var(--cocoa, #2B1F15)",
                  fontFamily: "Cormorant Garamond, serif",
                  fontSize: 24,
                  fontWeight: 700,
                  lineHeight: 1.1,
                  width: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {group.name}
                </span>
                {isAdmin && (
                  <span
                    aria-hidden
                    style={{
                      color: "var(--v45-saffron, #C58A2E)",
                      opacity: 0.7,
                      display: "inline-flex",
                    }}
                  >
                    {/* V52.C2 — SVG remplace EMOJI */}
                    <Icon name="pencil" size={14} strokeWidth={1.6} />
                  </span>
                )}
              </button>
            )}
            <div
              style={{
                fontSize: 11,
                color: "var(--v45-saffron, #C58A2E)",
                letterSpacing: 1.2,
                marginTop: 2,
                textTransform: "uppercase",
                fontWeight: 700,
              }}
            >
              {(group.type ?? "GENERIC").toLowerCase()}
            </div>
          </div>
        </div>
        <div
          style={{
            position: "relative",
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
          }}
        >
          <Chip label={`${group.members.length} membre${group.members.length > 1 ? "s" : ""}`} />
          <Chip label={group.defaultCurrency} />
          <Chip
            label={new Date(group.createdAt).toLocaleDateString("fr-FR", {
              month: "short",
              year: "numeric",
            })}
          />
        </div>
      </section>

      {/* SECTIONS */}
      <SectionPanel
        title={t("groupSettings.sectionGeneral") || "Général"}
        // V52.C2 — SVG remplace EMOJI
        iconName="settings"
        open={openSections.has("general")}
        onToggle={() => toggleSection("general")}
      >
        <Row
          label={t("groupSettings.fieldName") || "Nom"}
          value={group.name}
          onTap={isAdmin ? () => setEditingName(true) : undefined}
        />
        <Row
          label={t("groupSettings.fieldCurrency") || "Devise"}
          value={group.defaultCurrency}
          onTap={isAdmin ? changeCurrency : undefined}
        />
        <Row
          label={t("groupSettings.fieldType") || "Type"}
          value={(group.type ?? "GENERIC").toLowerCase()}
        />
      </SectionPanel>

      <SectionPanel
        title={t("groupSettings.sectionMembers") || "Membres"}
        // V52.C2 — SVG remplace EMOJI
        iconName="users"
        open={openSections.has("members")}
        onToggle={() => toggleSection("members")}
        badge={String(group.members.length)}
      >
        {group.members.map((m) => (
          <MemberRow
            key={m.id}
            member={m}
            isMe={m.user.id === me?.id}
            isAdminViewer={isAdmin}
            onTap={() => isAdmin && m.user.id !== me?.id && setMemberSheet(m)}
            t={t}
          />
        ))}
      </SectionPanel>

      <SectionPanel
        title={t("groupSettings.sectionNotifications") || "Notifications"}
        // V52.C2 — SVG remplace EMOJI
        iconName="bell"
        open={openSections.has("notifications")}
        onToggle={() => toggleSection("notifications")}
      >
        <ToggleRow
          label={t("groupSettings.dnd") || "Ne pas déranger"}
          subtitle={
            t("groupSettings.dndHint") ||
            "Coupe toutes les notifs push de ce groupe. Les notifications restent visibles dans l'app."
          }
          checked={!!myMember?.doNotDisturb}
          onChange={toggleDnd}
        />
      </SectionPanel>

      {/* V41.2 — Section Catégories : règles d'auto-catégorisation pour
          les dépenses (ex: "Carrefour" → COURSES, split EQUAL). Réutilise
          le composant desktop CategoryRulesBlock (compatibilité totale). */}
      <SectionPanel
        title={t("groupSettings.sectionCategories") || "Catégories & règles"}
        // V52.C2 — SVG remplace EMOJI
        iconName="tag"
        open={openSections.has("categories")}
        onToggle={() => toggleSection("categories")}
      >
        <CategoryRulesBlock
          groupId={groupId}
          // CategoryRulesBlock attend une shape `{ user: {id, displayName}, role }`
          // qu'on a déjà — on passe directement la liste members du groupe.
          members={group.members.map((m) => ({
            user: { id: m.user.id, displayName: m.user.displayName },
            role: m.role,
          }))}
          canEdit={isAdmin || myMember?.role === "TREASURER"}
        />
      </SectionPanel>

      {/* V41.2 — Section Thème : emoji + couleur du groupe (visuel). */}
      <SectionPanel
        title={t("groupSettings.sectionTheme") || "Thème & visuel"}
        // V52.C2 — SVG remplace EMOJI : palette
        iconName="palette"
        open={openSections.has("theme")}
        onToggle={() => toggleSection("theme")}
      >
        <GroupThemeBlock groupId={groupId} />
      </SectionPanel>

      {/* Liens secondaires */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          marginTop: 4,
        }}
      >
        {/* V52.C2 — SVG remplace EMOJI */}
        <SecondaryLink
          href={`/dashboard/groups/${groupId}/print`}
          iconName="printer"
          label={t("groupSettings.print") || "Imprimer le récap"}
        />
        {/* V111 — Bouton "Reçu fiscal" : visible uniquement pour les groupes
            association / à but non lucratif (flag opt-in coché à la création
            ou activé plus tard via le toggle "Reçus fiscaux" plus bas). */}
        {group.taxReceiptsEnabled && (
          <SecondaryLink
            href={`/dashboard/groups/${groupId}/tax-receipt`}
            iconName="file-text"
            label={t("groupSettings.taxReceipt") || "Reçu fiscal"}
          />
        )}
      </div>

      {/* V111 — Toggle admin pour activer/désactiver les reçus fiscaux.
          Visible uniquement pour les admins. Quand activé, la fonction
          "Reçu fiscal" apparaît ci-dessus et la page /tax-receipt devient
          accessible aux membres. */}
      {isAdmin && (
        <TaxReceiptsToggle
          groupId={groupId}
          enabled={group.taxReceiptsEnabled ?? false}
          onChanged={refresh}
        />
      )}

      {/* V141 — Toggle confirmation paiement (admin only). Quand désactivé,
          les déclarations de paiement (cotisations tontine, settlements)
          passent directement à CONFIRMED sans étape de validation du receveur.
          Utile pour les petits groupes très confiants ou pour tests internes.
          Par défaut : activé (confirmation requise). */}
      {isAdmin && (
        <PaymentConfirmationToggle
          groupId={groupId}
          enabled={group.paymentConfirmationRequired ?? true}
          onChanged={refresh}
        />
      )}

      {/* DANGER ZONE (admin only) */}
      {/* V52.G5 — Polish V45 écran 20 : danger zone refonte avec 2 boutons distincts (quitter + supprimer) */}
      {isAdmin && (
        <section style={{ marginTop: 14 }}>
          <div
            style={{
              marginTop: 24,
              padding: 14,
              background: "rgba(159,70,40,0.06)",
              border: "1px solid rgba(159,70,40,0.25)",
              borderRadius: 12,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <h4
              style={{
                margin: 0,
                fontSize: 13,
                color: "var(--v45-terracotta, #9F4628)",
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Icon
                name="alert-triangle"
                size={14}
                color="currentColor"
                strokeWidth={2}
              />
              {t("groupSettings.dangerZone") || "Zone sensible"}
            </h4>
            <button
              type="button"
              onClick={() => {
                // V52.G5 — handler quitter à câbler ultérieurement
              }}
              style={{
                padding: "10px 14px",
                background: "transparent",
                color: "var(--v45-terracotta, #9F4628)",
                border: "1px solid var(--v45-terracotta, #9F4628)",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                textAlign: "left",
              }}
            >
              {t("groupSettings.leaveGroupCta") || "Quitter ce groupe"}
            </button>
            <button
              type="button"
              onClick={deleteGroup}
              style={{
                padding: "10px 14px",
                background: "var(--v45-terracotta, #9F4628)",
                color: "var(--paper, #FFFFFF)",
                border: "none",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
                textAlign: "left",
              }}
            >
              {t("groupSettings.deleteGroupCta") || "Supprimer ce groupe"}
            </button>
            <p
              style={{
                fontSize: 11,
                color: "var(--muted)",
                margin: "4px 0 0",
                lineHeight: 1.5,
                opacity: 0.85,
              }}
            >
              {t("groupSettings.deleteGroupHint") ||
                "Action irréversible. Toutes les données seront perdues."}
            </p>
          </div>
        </section>
      )}

      {/* ===== BOTTOM SHEET membre (admin) ===== */}
      <BottomSheet
        open={!!memberSheet}
        onClose={() => setMemberSheet(null)}
        title={memberSheet?.user.displayName ?? ""}
      >
        {memberSheet && (
          <MemberActionContent
            member={memberSheet}
            onChangeRole={(role) => setMemberRole(memberSheet, role)}
            onRemove={() => removeMember(memberSheet)}
            onCancel={() => setMemberSheet(null)}
            t={t}
          />
        )}
      </BottomSheet>
    </div>
  );
}

// ============ UI bricks ============

function Chip({ label }: { label: string }) {
  // V109 — Chip V45-light : paper translucide sur le hero ivory, texte cocoa.
  return (
    <span
      style={{
        fontSize: 11,
        padding: "4px 10px",
        borderRadius: 999,
        background: "rgba(255,255,255,0.62)",
        border: "1px solid rgba(43,31,21,0.12)",
        color: "var(--cocoa, #2B1F15)",
        fontWeight: 600,
        letterSpacing: 0.3,
      }}
    >
      {label}
    </span>
  );
}

function SectionPanel({
  title,
  iconName,
  open,
  onToggle,
  children,
  badge,
}: {
  title: string;
  // V52.C2 — SVG remplace EMOJI : on passe maintenant un IconName
  iconName: IconName;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  badge?: string;
}) {
  return (
    <section
      style={{
        background: "rgba(244,228,193,0.03)",
        border: "1px solid rgba(244,228,193,0.06)",
        borderRadius: 14,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          width: "100%",
          padding: "14px 16px",
          background: "transparent",
          border: "none",
          color: "var(--cream)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
          WebkitTapHighlightColor: "transparent",
          touchAction: "manipulation",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 28,
            height: 28,
            borderRadius: 9,
            background: "rgba(232,163,61,0.12)",
            border: "1px solid rgba(232,163,61,0.20)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--saffron)",
            flexShrink: 0,
          }}
        >
          {/* V52.C2 — SVG remplace EMOJI */}
          <Icon name={iconName} size={14} strokeWidth={1.6} />
        </span>
        <span
          style={{
            flex: 1,
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: 0.2,
          }}
        >
          {title}
        </span>
        {badge && (
          <span
            style={{
              fontSize: 10,
              padding: "2px 8px",
              borderRadius: 999,
              background: "rgba(232,163,61,0.15)",
              color: "var(--saffron)",
              fontWeight: 800,
              letterSpacing: 0.5,
              flexShrink: 0,
            }}
          >
            {badge}
          </span>
        )}
        <span
          aria-hidden
          style={{
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
            color: "var(--muted)",
            flexShrink: 0,
            display: "inline-flex",
          }}
        >
          {/* V52.C2 — SVG remplace EMOJI : chevron-down (rotation = up quand open) */}
          <Icon name="chevron-down" size={14} strokeWidth={1.6} />
        </span>
      </button>
      {open && (
        <div
          style={{
            padding: "0 14px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {children}
        </div>
      )}
    </section>
  );
}

function Row({
  label,
  value,
  onTap,
}: {
  label: string;
  value: string;
  onTap?: () => void;
}) {
  const Comp: any = onTap ? "button" : "div";
  return (
    <Comp
      type={onTap ? "button" : undefined}
      onClick={onTap}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 4px",
        background: "transparent",
        border: "none",
        color: "var(--cream)",
        cursor: onTap ? "pointer" : "default",
        fontFamily: "inherit",
        fontSize: 13.5,
        textAlign: "left",
        width: "100%",
        WebkitTapHighlightColor: "transparent",
        touchAction: "manipulation",
      }}
    >
      <span
        style={{
          fontSize: 12,
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: 0.8,
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontWeight: 600,
          color: "var(--cream)",
          fontVariantNumeric: "tabular-nums",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {value}
        {onTap && (
          <span aria-hidden style={{ color: "var(--saffron)", display: "inline-flex" }}>
            {/* V52.C2 — SVG remplace EMOJI (› chevron) */}
            <Icon name="chevron-right" size={12} strokeWidth={1.6} />
          </span>
        )}
      </span>
    </Comp>
  );
}

function ToggleRow({
  label,
  subtitle,
  checked,
  onChange,
}: {
  label: string;
  subtitle?: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 4px",
        cursor: "pointer",
        touchAction: "manipulation",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 600,
            color: "var(--cream)",
          }}
        >
          {label}
        </div>
        {subtitle && (
          <div
            style={{
              fontSize: 11,
              color: "var(--muted)",
              marginTop: 2,
              lineHeight: 1.5,
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        style={{
          width: 22,
          height: 22,
          accentColor: "var(--saffron, #e8a33d)",
          cursor: "pointer",
          flexShrink: 0,
        }}
      />
    </label>
  );
}

function MemberRow({
  member,
  isMe,
  isAdminViewer,
  onTap,
  t,
}: {
  member: Member;
  isMe: boolean;
  isAdminViewer: boolean;
  onTap?: () => void;
  t: ReturnType<typeof useT>;
}) {
  const role = member.role;
  const roleColor =
    role === "ADMIN"
      ? "var(--saffron)"
      : role === "TREASURER"
        ? "#7DC59E"
        : role === "OBSERVER"
          ? "var(--muted)"
          : "var(--cream-soft)";
  const roleBg =
    role === "ADMIN"
      ? "rgba(232,163,61,0.16)"
      : role === "TREASURER"
        ? "rgba(125,197,158,0.16)"
        : role === "OBSERVER"
          ? "rgba(244,228,193,0.06)"
          : "rgba(244,228,193,0.06)";
  const roleLabel =
    role === "ADMIN"
      ? t("role.admin") || "Admin"
      : role === "TREASURER"
        ? t("role.treasurer") || "Trésorier"
        : role === "OBSERVER"
          ? t("role.observer") || "Observateur"
          : t("role.member") || "Membre";

  const tappable = !!onTap && !isMe && isAdminViewer;

  return (
    <button
      type="button"
      onClick={onTap}
      disabled={!tappable}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 4px",
        background: "transparent",
        border: "none",
        color: "var(--cream)",
        cursor: tappable ? "pointer" : "default",
        fontFamily: "inherit",
        textAlign: "left",
        width: "100%",
        WebkitTapHighlightColor: "transparent",
        touchAction: "manipulation",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          background: "rgba(232,163,61,0.15)",
          color: "var(--saffron)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {member.user.displayName.charAt(0).toUpperCase()}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 600,
            color: "var(--cream)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {member.user.displayName}
          {isMe && (
            <span
              style={{
                fontSize: 10,
                color: "var(--saffron)",
                marginLeft: 8,
                fontWeight: 700,
                letterSpacing: 0.5,
                textTransform: "uppercase",
              }}
            >
              {t("common.you") || "Toi"}
            </span>
          )}
        </div>
      </div>
      <span
        style={{
          fontSize: 10,
          padding: "2px 8px",
          borderRadius: 6,
          background: roleBg,
          color: roleColor,
          fontWeight: 800,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          flexShrink: 0,
        }}
      >
        {roleLabel}
      </span>
      {tappable && (
        <span
          aria-hidden
          style={{ color: "var(--muted)", flexShrink: 0, display: "inline-flex" }}
        >
          {/* V52.C2 — SVG remplace EMOJI (› chevron) */}
          <Icon name="chevron-right" size={14} strokeWidth={1.6} />
        </span>
      )}
    </button>
  );
}

function SecondaryLink({
  href,
  iconName,
  label,
}: {
  href: string;
  // V52.C2 — SVG remplace EMOJI
  iconName: IconName;
  label: string;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        background: "rgba(244,228,193,0.03)",
        border: "1px solid rgba(244,228,193,0.06)",
        borderRadius: 12,
        color: "var(--cream-soft)",
        textDecoration: "none",
        fontSize: 13,
        fontWeight: 600,
        WebkitTapHighlightColor: "transparent",
        touchAction: "manipulation",
      }}
    >
      <span aria-hidden style={{ display: "inline-flex", color: "var(--saffron)" }}>
        {/* V52.C2 — SVG remplace EMOJI */}
        <Icon name={iconName} size={14} strokeWidth={1.6} />
      </span>
      <span style={{ flex: 1 }}>{label}</span>
      <span aria-hidden style={{ color: "var(--muted)", display: "inline-flex" }}>
        {/* V52.C2 — SVG remplace EMOJI (› chevron) */}
        <Icon name="chevron-right" size={14} strokeWidth={1.6} />
      </span>
    </Link>
  );
}

// ============ Bottom sheet member actions ============

function MemberActionContent({
  member,
  onChangeRole,
  onRemove,
  onCancel,
  t,
}: {
  member: Member;
  onChangeRole: (role: Member["role"]) => void;
  onRemove: () => void;
  onCancel: () => void;
  t: ReturnType<typeof useT>;
}) {
  const roles: Member["role"][] = ["ADMIN", "TREASURER", "MEMBER", "OBSERVER"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p
        style={{
          fontSize: 12,
          color: "var(--cream-soft)",
          margin: 0,
          textAlign: "center",
          lineHeight: 1.5,
        }}
      >
        {t("groupSettings.memberActionsHint") ||
          "Change le rôle ou retire ce membre du groupe."}
      </p>
      <div>
        <div
          style={{
            fontSize: 10,
            color: "var(--saffron)",
            textTransform: "uppercase",
            letterSpacing: 1.4,
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          {t("groupSettings.changeRole") || "Rôle"}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {roles.map((role) => {
            const active = member.role === role;
            return (
              <button
                key={role}
                type="button"
                onClick={() => !active && onChangeRole(role)}
                disabled={active}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  background: active
                    ? "linear-gradient(135deg, rgba(232,163,61,0.12), rgba(181,70,46,0.06))"
                    : "rgba(244,228,193,0.03)",
                  border: active
                    ? "1px solid rgba(232,163,61,0.40)"
                    : "1px solid rgba(244,228,193,0.08)",
                  borderRadius: 11,
                  color: "var(--cream)",
                  fontFamily: "inherit",
                  fontSize: 13,
                  cursor: active ? "default" : "pointer",
                  textAlign: "left",
                  width: "100%",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <span style={{ flex: 1, fontWeight: active ? 700 : 500 }}>
                  {role === "ADMIN"
                    ? t("role.admin") || "Admin"
                    : role === "TREASURER"
                      ? t("role.treasurer") || "Trésorier"
                      : role === "OBSERVER"
                        ? t("role.observer") || "Observateur"
                        : t("role.member") || "Membre"}
                </span>
                {active && (
                  <span style={{ color: "var(--saffron)", display: "inline-flex" }}>
                    {/* V52.C2 — SVG remplace EMOJI */}
                    <Icon name="check" size={14} strokeWidth={2} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        style={{
          padding: "12px 18px",
          background: "rgba(217,113,74,0.10)",
          color: "#FFB89A",
          border: "1px solid rgba(217,113,74,0.30)",
          borderRadius: 12,
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          fontFamily: "inherit",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        {/* V52.C2 — SVG remplace EMOJI */}
        <Icon name="trash-2" size={14} strokeWidth={1.6} />
        {t("groupSettings.removeMember") || "Retirer du groupe"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        style={{
          padding: "12px 20px",
          background: "transparent",
          color: "var(--cream-soft)",
          border: "1px solid rgba(244,228,193,0.18)",
          borderRadius: 14,
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        {t("common.cancel") || "Annuler"}
      </button>
    </div>
  );
}

// ============ Skeleton ============

function SettingsSkeleton() {
  return (
    <div
      style={{
        padding: "0 16px 80px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div
        style={{
          height: 140,
          borderRadius: 22,
          background: "rgba(244,228,193,0.04)",
          animation: "bmd-gs-skel 1.2s infinite ease-in-out",
        }}
      />
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            height: 60,
            borderRadius: 14,
            background: "rgba(244,228,193,0.04)",
            animation: `bmd-gs-skel 1.2s infinite ease-in-out ${0.1 + i * 0.06}s`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes bmd-gs-skel {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.85; }
        }
      `}</style>
    </div>
  );
}

// ============================================================================
// V111 — Toggle "Reçus fiscaux" (admin only)
// ============================================================================

function TaxReceiptsToggle({
  groupId,
  enabled,
  onChanged,
}: {
  groupId: string;
  enabled: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      await api.updateGroup(groupId, { taxReceiptsEnabled: !enabled });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      style={{
        marginTop: 14,
        padding: 16,
        background: enabled
          ? "var(--v45-saffron-pale, #F6E8C5)"
          : "var(--paper, #FFFFFF)",
        border: enabled
          ? "1px solid var(--v45-saffron, #C58A2E)"
          : "1px solid rgba(43,31,21,0.08)",
        borderRadius: 14,
        boxShadow: "0 2px 6px rgba(43,31,21,0.04)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            background: enabled
              ? "rgba(197,138,46,0.20)"
              : "var(--ivory-2, #F4ECD8)",
            color: enabled
              ? "var(--v45-saffron, #C58A2E)"
              : "var(--cocoa-soft, #6B5A47)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon name="file-text" size={16} strokeWidth={1.7} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--cocoa, #2B1F15)",
              lineHeight: 1.3,
            }}
          >
            Reçus fiscaux
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--cocoa-soft, #6B5A47)",
              marginTop: 4,
              lineHeight: 1.5,
            }}
          >
            {enabled
              ? "Activé · Les membres peuvent télécharger leur reçu fiscal annuel (article 200 CGI)."
              : "Active si ce groupe est une association ou un organisme à but non lucratif."}
          </div>
        </div>
        {/* Toggle pill — switch iOS-style */}
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={enabled ? "Désactiver les reçus fiscaux" : "Activer les reçus fiscaux"}
          onClick={toggle}
          disabled={busy}
          style={{
            position: "relative",
            width: 48,
            height: 28,
            borderRadius: 999,
            background: enabled
              ? "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--v45-terracotta, #9F4628))"
              : "rgba(43,31,21,0.18)",
            border: "none",
            cursor: busy ? "wait" : "pointer",
            transition: "background 0.22s",
            flexShrink: 0,
            opacity: busy ? 0.6 : 1,
            padding: 0,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: 2,
              left: enabled ? 22 : 2,
              width: 24,
              height: 24,
              borderRadius: "50%",
              background: "#FFFFFF",
              boxShadow: "0 2px 6px rgba(43,31,21,0.18)",
              transition: "left 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
        </button>
      </div>
      {error && (
        <div
          role="alert"
          style={{
            marginTop: 10,
            padding: "8px 12px",
            background: "rgba(159,70,40,0.08)",
            border: "1px solid rgba(159,70,40,0.30)",
            borderRadius: 8,
            color: "var(--v45-terracotta, #9F4628)",
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}
    </section>
  );
}

// ============================================================================
// V141 — Toggle « Confirmation paiement requise » (admin only)
// ============================================================================
//
// Quand activé (défaut) : workflow en 2 étapes. Le payeur déclare → push +
// email au receveur → receveur confirme → CONFIRMED.
// Quand désactivé : la déclaration du payeur passe direct à CONFIRMED, push
// informatif au receveur, pas d'email.

function PaymentConfirmationToggle({
  groupId,
  enabled,
  onChanged,
}: {
  groupId: string;
  enabled: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      await api.updateGroup(groupId, {
        paymentConfirmationRequired: !enabled,
      });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      style={{
        marginTop: 14,
        padding: 16,
        background: enabled
          ? "var(--v45-saffron-pale, #F6E8C5)"
          : "var(--paper, #FFFFFF)",
        border: enabled
          ? "1px solid var(--v45-saffron, #C58A2E)"
          : "1px solid rgba(43,31,21,0.08)",
        borderRadius: 14,
        boxShadow: "0 2px 6px rgba(43,31,21,0.04)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <span
          aria-hidden
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            background: enabled
              ? "rgba(197,138,46,0.20)"
              : "var(--ivory-2, #F4ECD8)",
            color: enabled
              ? "var(--v45-saffron, #C58A2E)"
              : "var(--cocoa-soft, #6B5A47)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon name="check" size={16} strokeWidth={2} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--cocoa, #2B1F15)",
              lineHeight: 1.3,
            }}
          >
            Confirmation des paiements
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--cocoa-soft, #6B5A47)",
              marginTop: 4,
              lineHeight: 1.5,
            }}
          >
            {enabled
              ? "Activé · Le receveur doit confirmer chaque paiement déclaré (push + email). Sécurise les transactions."
              : "Désactivé · Les déclarations passent direct à « confirmé ». Plus rapide mais moins traçable."}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={
            enabled
              ? "Désactiver la confirmation de paiement"
              : "Activer la confirmation de paiement"
          }
          onClick={toggle}
          disabled={busy}
          style={{
            position: "relative",
            width: 48,
            height: 28,
            borderRadius: 999,
            background: enabled
              ? "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--v45-terracotta, #9F4628))"
              : "rgba(43,31,21,0.18)",
            border: "none",
            cursor: busy ? "wait" : "pointer",
            transition: "background 0.22s",
            flexShrink: 0,
            opacity: busy ? 0.6 : 1,
            padding: 0,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: 2,
              left: enabled ? 22 : 2,
              width: 24,
              height: 24,
              borderRadius: "50%",
              background: "#FFFFFF",
              boxShadow: "0 2px 6px rgba(43,31,21,0.18)",
              transition: "left 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
        </button>
      </div>
      {error && (
        <div
          role="alert"
          style={{
            marginTop: 10,
            padding: "8px 12px",
            background: "rgba(159,70,40,0.08)",
            border: "1px solid rgba(159,70,40,0.30)",
            borderRadius: 8,
            color: "var(--v45-terracotta, #9F4628)",
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}
    </section>
  );
}
