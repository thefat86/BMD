"use client";

/**
 * <DesktopGroupSettingsV241View> · V241 — Refonte « épurée » des réglages
 * de groupe (validée maquette Option A).
 *
 * Layout 2-colonnes (max 1100px, gap 24px) :
 *  - GAUCHE (340px sticky) : « Aperçu vivant ». Logo squircle, nom Cormorant,
 *    rôle, 3 mini-stats, bar charte couleur du groupe. Donne au regard un
 *    point d'ancrage pendant qu'on navigue les sections.
 *  - DROITE : 5 blocs accordéon. **Un seul ouvert à la fois** — ouvrir une
 *    section referme automatiquement l'autre. Première section « Identité »
 *    ouverte par défaut.
 *
 * Sections :
 *   1. Identité       — nom, devise, charte couleur, logo personnalisé PDF
 *   2. Membres & rôles — liste membres + Catégories auto (CategoryRulesBlock)
 *   3. Modules        — Ne pas déranger (perso), Reçus fiscaux, Confirmation paiement
 *   4. Invitations    — Stats + générer + liste + révoquer + QR
 *   5. Zone dangereuse — supprimer le groupe (admin only, double confirm)
 *
 * Hérite la palette V45-light : cocoa #2B1F15, saffron #C58A2E, cream
 * #FAF6EE, sable #F4ECD9, terracotta #9F4628, sage #1F7A57, lignes #EAD9B8.
 *
 * Toutes les libellés passent par useT() avec single-brace {var} (cf. V225.B).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  api,
  clearToken,
  getToken,
  isUnauthorized,
} from "../api-client";
import { useToast } from "./toast";
import { useDialog } from "./dialog-provider";
import { useT } from "../i18n/app-strings";
import { Icon, type IconName } from "./icons";
import { GroupThemeBlock } from "./group-theme-block";
import { CustomLogoSettings } from "./custom-logo-settings";
import { CategoryRulesBlock } from "./category-rules-block";
import { BrandedQR } from "./branded-qr";
import { BottomSheet } from "./bottom-sheet";

// ============ TYPES ============

const ROLES = ["ADMIN", "TREASURER", "MEMBER", "OBSERVER"] as const;
type Role = (typeof ROLES)[number];

const CURRENCIES = ["EUR", "USD", "XAF", "XOF", "CDF", "GBP", "CAD"];

type SectionKey =
  | "identity"
  | "members"
  | "modules"
  | "invitations"
  | "danger";

// ============ PALETTE LOCALE V45-light ============

const C = {
  cocoa: "#2B1F15",
  cocoaSoft: "#6B5A47",
  cocoaMute: "#A99580",
  cream: "#FAF6EE",
  sable: "#F4ECD9",
  ivory: "#FBF6EC",
  paper: "#FFFFFF",
  line: "#EAD9B8",
  lineSoft: "#D9C8A6",
  saffron: "#C58A2E",
  saffronPale: "#F6E8C5",
  terracotta: "#9F4628",
  sage: "#1F7A57",
};

// ============ COMPOSANT PRINCIPAL ============

export function DesktopGroupSettingsV241View({
  groupId,
}: {
  groupId: string;
}): JSX.Element {
  const router = useRouter();
  const t = useT();
  const toast = useToast();
  const dialog = useDialog();

  const [group, setGroup] = useState<any>(null);
  const [me, setMe] = useState<any>(null);
  const [tokens, setTokens] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form drafts
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [savingBasics, setSavingBasics] = useState(false);

  // Accordion — un seul ouvert à la fois. Démarre TOUT FERMÉ (V241.5,
  // demande Fabrice) pour une vue d'arrivée 100 % épurée. L'utilisateur
  // ouvre la section qu'il veut.
  const [openSection, setOpenSection] = useState<SectionKey | null>(null);
  const toggleSection = useCallback((key: SectionKey) => {
    setOpenSection((cur) => (cur === key ? null : key));
  }, []);

  // Danger zone
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  // QR modal
  const [qrToken, setQrToken] = useState<string | null>(null);

  // ===== LOAD =====
  const load = useCallback(async () => {
    try {
      const [m, g, tk] = await Promise.all([
        api.me(),
        api.getGroup(groupId),
        api.listInviteTokens(groupId).catch(() => []),
      ]);
      setMe(m.user);
      setGroup(g);
      setName(g.name);
      setCurrency(g.defaultCurrency);
      setTokens(tk);
    } catch (e) {
      if (isUnauthorized(e)) {
        clearToken();
        router.replace("/login");
        return;
      }
      toast.error(e);
    } finally {
      setLoading(false);
    }
  }, [groupId, router, toast]);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    void load();
  }, [groupId, load, router]);

  // ===== PERMISSIONS =====
  const myMember = useMemo(() => {
    if (!group || !me) return null;
    return group.members.find((x: any) => x.user.id === me.id) ?? null;
  }, [group, me]);

  const myRole = (myMember?.role as Role | undefined) ?? null;
  const canManage = myRole === "ADMIN" || myRole === "TREASURER";
  const isAdmin = myRole === "ADMIN";

  // ===== ACTIONS =====
  async function saveBasics() {
    if (!canManage || !group) return;
    const changes: { name?: string; defaultCurrency?: string } = {};
    if (name.trim() !== group.name) changes.name = name.trim();
    if (currency !== group.defaultCurrency)
      changes.defaultCurrency = currency;
    if (Object.keys(changes).length === 0) {
      toast.info(t("settingsV241.nothingToSave") || "Aucune modification");
      return;
    }
    setSavingBasics(true);
    try {
      await api.updateGroup(groupId, changes);
      toast.success(t("settings.saved"));
      await load();
    } catch (e) {
      toast.error(e);
    } finally {
      setSavingBasics(false);
    }
  }

  async function toggleDnd() {
    if (!myMember) return;
    try {
      await api.setGroupDND(groupId, !myMember.doNotDisturb);
      await load();
    } catch (e) {
      toast.error(e);
    }
  }

  async function toggleTaxReceipts(next: boolean) {
    if (!isAdmin) return;
    try {
      await api.updateGroup(groupId, { taxReceiptsEnabled: next });
      toast.success(t("settings.saved"));
      await load();
    } catch (e) {
      toast.error(e);
    }
  }

  async function togglePaymentConfirmation(next: boolean) {
    if (!isAdmin) return;
    try {
      await api.updateGroup(groupId, { paymentConfirmationRequired: next });
      toast.success(t("settings.saved"));
      await load();
    } catch (e) {
      toast.error(e);
    }
  }

  async function changeRole(memberId: string, newRole: Role) {
    if (!canManage) return;
    try {
      await api.changeMemberRole(groupId, memberId, newRole);
      toast.success(t("settings.roleUpdated"));
      await load();
    } catch (e) {
      toast.error(e);
    }
  }

  async function removeMember(memberId: string, memberName: string) {
    if (!canManage) return;
    const ok = await dialog.confirm(
      t("settings.removeMemberConfirm", { name: memberName }),
      {
        variant: "danger",
        title: t("settings.removeMember"),
        confirmLabel: t("settings.removeMember"),
      },
    );
    if (!ok) return;
    try {
      await api.removeMember(groupId, memberId);
      toast.success(t("settings.memberRemoved", { name: memberName }));
      await load();
    } catch (e) {
      toast.error(e);
    }
  }

  async function generateInvite() {
    if (!canManage) return;
    try {
      const tk = await api.createInviteToken(groupId, {
        expiresInHours: 24 * 7,
      });
      toast.success(t("settings.generateInvite"));
      setQrToken(tk.token);
      await load();
    } catch (e) {
      toast.error(e);
    }
  }

  async function revokeInvite(tokenId: string) {
    if (!canManage) return;
    const ok = await dialog.confirm(t("settings.revokeInvite") + " ?", {
      variant: "warning",
      title: t("settings.revokeInvite"),
      confirmLabel: t("settings.revokeInvite"),
    });
    if (!ok) return;
    try {
      await api.revokeInviteToken(tokenId);
      toast.success(t("settings.revokeInvite"));
      await load();
    } catch (e) {
      toast.error(e);
    }
  }

  async function copyLink(token: string) {
    const url = `${window.location.origin}/join/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("settings.copyInviteLink"));
    } catch {
      await dialog.alert(url, {
        title: t("settings.copyInviteLink"),
        okLabel: t("common.close") || "OK",
      });
    }
  }

  async function shareLink(token: string) {
    const url = `${window.location.origin}/join/${token}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: t("settingsV241.share.title", { name: group?.name ?? "" }),
          text: t("settingsV241.share.text", { name: group?.name ?? "" }),
          url,
        });
        return;
      } catch {
        return;
      }
    }
    void copyLink(token);
  }

  async function deleteGroupConfirmed() {
    if (!isAdmin || !group) return;
    if (confirmText !== group.name) {
      toast.error(t("settings.typeNameToConfirm", { name: group.name }));
      return;
    }
    try {
      await api.deleteGroup(groupId);
      toast.success(t("settings.groupDeleted"));
      router.replace("/dashboard");
    } catch (e) {
      toast.error(e);
    }
  }

  // ===== LOADING =====
  if (loading || !group) {
    return (
      <div
        style={{
          padding: 40,
          color: C.cocoaSoft,
          textAlign: "center",
        }}
      >
        {t("common.loading")}
      </div>
    );
  }

  // ===== RENDER =====
  const memberCount = group.members.length;
  const createdAtLabel = new Date(group.createdAt).toLocaleDateString(
    "fr-FR",
    { day: "numeric", month: "short", year: "numeric" },
  );

  return (
    <div
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: "0 20px 40px",
      }}
    >
      {/* Sous-titre éditorial */}
      <p
        style={{
          margin: "0 0 24px",
          fontSize: 13,
          color: C.cocoaSoft,
          lineHeight: 1.5,
          maxWidth: 640,
        }}
      >
        {t("settingsV241.pageHint")}
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "340px 1fr",
          gap: 24,
          alignItems: "start",
        }}
      >
        {/* ====== COLONNE GAUCHE — APERÇU VIVANT (sticky) ====== */}
        <aside
          style={{
            position: "sticky",
            top: 88,
            alignSelf: "start",
          }}
        >
          <LivePreviewCard
            group={group}
            myRole={myRole}
            memberCount={memberCount}
            currency={currency}
            createdAtLabel={createdAtLabel}
            t={t}
          />

          {/* Petit indicateur d'aide */}
          <div
            style={{
              marginTop: 14,
              padding: "10px 12px",
              background: C.sable,
              border: `1px dashed ${C.lineSoft}`,
              borderRadius: 12,
              fontSize: 11.5,
              color: C.cocoaSoft,
              lineHeight: 1.5,
            }}
          >
            <span style={{ fontWeight: 700, color: C.cocoa }}>
              {t("settingsV241.previewBadge")}
            </span>{" "}
            {t("settingsV241.previewHint")}
          </div>
        </aside>

        {/* ====== COLONNE DROITE — 5 BLOCS ACCORDÉON ====== */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* 1. IDENTITÉ (fermé par défaut V241.5) */}
          <AccordionBlock
            index={1}
            icon="settings"
            title={t("settingsV241.section.identity")}
            subtitle={t("settingsV241.section.identityHint")}
            open={openSection === "identity"}
            onToggle={() => toggleSection("identity")}
          >
            <Field label={t("settings.groupName")}>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!canManage}
                style={inputStyle()}
              />
            </Field>
            <Field label={t("settings.defaultCurrency")}>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                disabled={!canManage}
                style={inputStyle()}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>

            {canManage && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  marginTop: 12,
                }}
              >
                <PrimaryBtn onClick={saveBasics} busy={savingBasics}>
                  <Icon name="check" size={14} strokeWidth={2.2} />
                  {t("settings.save")}
                </PrimaryBtn>
              </div>
            )}

            {/* Charte couleur — admin only */}
            {isAdmin && (
              <div style={{ marginTop: 18 }}>
                <GroupThemeBlock groupId={group.id} />
              </div>
            )}

            {/* Logo PDF — admin only */}
            {isAdmin && (
              <div style={{ marginTop: 12 }}>
                <CustomLogoSettings
                  groupId={group.id}
                  isSuperAdmin={!!me?.isSuperAdmin}
                />
              </div>
            )}
          </AccordionBlock>

          {/* 2. MEMBRES & RÔLES */}
          <AccordionBlock
            index={2}
            icon="users"
            title={t("settingsV241.section.members")}
            subtitle={t("settingsV241.section.membersHint", {
              n: String(memberCount),
            })}
            open={openSection === "members"}
            onToggle={() => toggleSection("members")}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              {group.members.map((m: any) => {
                const isMe = m.user.id === me?.id;
                return (
                  <div
                    key={m.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 12px",
                      background: isMe ? C.saffronPale : C.ivory,
                      border: `1px solid ${isMe ? C.line : "rgba(43,31,21,0.06)"}`,
                      borderRadius: 12,
                    }}
                  >
                    <Avatar
                      letter={(m.user.displayName?.[0] ?? "?").toUpperCase()}
                      photo={m.user.photoUrl}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13.5,
                          fontWeight: 700,
                          color: C.cocoa,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {m.user.displayName}
                        {isMe && (
                          <span
                            style={{
                              marginLeft: 8,
                              fontSize: 9,
                              color: C.saffron,
                              letterSpacing: 1.2,
                              fontWeight: 800,
                            }}
                          >
                            {t("settingsV241.youBadge")}
                          </span>
                        )}
                      </div>
                    </div>
                    {canManage ? (
                      <select
                        value={m.role}
                        onChange={(e) =>
                          changeRole(m.id, e.target.value as Role)
                        }
                        disabled={isMe && myRole === "ADMIN"}
                        title={t("settings.changeRole")}
                        style={{
                          padding: "6px 10px",
                          fontSize: 12,
                          fontWeight: 600,
                          color: C.cocoa,
                          background: C.paper,
                          border: `1px solid ${C.lineSoft}`,
                          borderRadius: 8,
                          fontFamily: "inherit",
                          cursor:
                            isMe && myRole === "ADMIN"
                              ? "not-allowed"
                              : "pointer",
                        }}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {t(`settingsV241.role.${r.toLowerCase()}` as any) ||
                              r.toLowerCase()}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span
                        style={{
                          fontSize: 11.5,
                          color: C.cocoaSoft,
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: 0.8,
                        }}
                      >
                        {t(
                          `settingsV241.role.${m.role.toLowerCase()}` as any,
                        ) || m.role.toLowerCase()}
                      </span>
                    )}
                    {canManage && !isMe && (
                      <button
                        onClick={() =>
                          removeMember(m.id, m.user.displayName)
                        }
                        title={t("settings.removeMember")}
                        aria-label={t("settings.removeMember")}
                        style={iconBtn()}
                      >
                        <Icon
                          name="trash-2"
                          size={14}
                          strokeWidth={1.8}
                          color={C.terracotta}
                        />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Règles auto par catégorie */}
            <div style={{ marginTop: 18 }}>
              <CategoryRulesBlock
                groupId={group.id}
                members={group.members}
                canEdit={canManage}
              />
            </div>
          </AccordionBlock>

          {/* 3. MODULES ACTIVÉS */}
          <AccordionBlock
            index={3}
            icon="sliders"
            title={t("settingsV241.section.modules")}
            subtitle={t("settingsV241.section.modulesHint")}
            open={openSection === "modules"}
            onToggle={() => toggleSection("modules")}
          >
            <ToggleRow
              icon="bell"
              title={t("settings.dnd")}
              description={t("settings.dndDescription")}
              checked={!!myMember?.doNotDisturb}
              onChange={toggleDnd}
              meta={t("settingsV241.modules.perUser")}
              accent={C.saffron}
            />

            {isAdmin && (
              <ToggleRow
                icon="file-text"
                title={t("settingsV241.modules.taxReceipts")}
                description={t("settingsV241.modules.taxReceiptsHint")}
                checked={!!group.taxReceiptsEnabled}
                onChange={() =>
                  toggleTaxReceipts(!group.taxReceiptsEnabled)
                }
                meta={t("settingsV241.modules.adminOnly")}
                accent={C.sage}
              />
            )}

            {isAdmin && (
              <ToggleRow
                icon="check-circle"
                title={t("settingsV241.modules.paymentConfirm")}
                description={t("settingsV241.modules.paymentConfirmHint")}
                checked={!!group.paymentConfirmationRequired}
                onChange={() =>
                  togglePaymentConfirmation(
                    !group.paymentConfirmationRequired,
                  )
                }
                meta={t("settingsV241.modules.adminOnly")}
                accent={C.saffron}
              />
            )}
          </AccordionBlock>

          {/* 4. INVITATIONS */}
          {canManage && (
            <AccordionBlock
              index={4}
              icon="link"
              title={t("settings.invitations")}
              subtitle={t("settingsV241.section.invitationsHint")}
              open={openSection === "invitations"}
              onToggle={() => toggleSection("invitations")}
            >
              {/* Mini stats */}
              {tokens.length > 0 && (
                <InviteStats tokens={tokens} t={t} />
              )}

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  marginTop: tokens.length > 0 ? 12 : 0,
                }}
              >
                <PrimaryBtn onClick={generateInvite}>
                  <Icon name="plus" size={14} strokeWidth={2.4} />
                  {t("settings.generateInvite")}
                </PrimaryBtn>
              </div>

              {tokens.length > 0 && (
                <div
                  style={{
                    marginTop: 16,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {tokens.map((tk: any) => (
                    <InviteTokenRow
                      key={tk.id}
                      tk={tk}
                      onCopy={copyLink}
                      onShare={shareLink}
                      onShowQR={(v) => setQrToken(v)}
                      onRevoke={revokeInvite}
                      t={t}
                    />
                  ))}
                </div>
              )}
            </AccordionBlock>
          )}

          {/* 5. ZONE DANGEREUSE */}
          {isAdmin && (
            <AccordionBlock
              index={5}
              icon="alert-triangle"
              title={t("settings.dangerZone")}
              subtitle={t("settingsV241.section.dangerHint")}
              open={openSection === "danger"}
              onToggle={() => toggleSection("danger")}
              danger
            >
              {!confirmDeleteGroup ? (
                <button
                  onClick={() => setConfirmDeleteGroup(true)}
                  style={dangerBtn()}
                >
                  <Icon name="trash-2" size={14} strokeWidth={1.9} />
                  {t("settings.deleteGroup")}
                </button>
              ) : (
                <div
                  style={{
                    background: "rgba(159,70,40,0.04)",
                    border: `1px solid rgba(159,70,40,0.20)`,
                    borderRadius: 12,
                    padding: 14,
                  }}
                >
                  <p
                    style={{
                      margin: "0 0 10px",
                      fontSize: 13,
                      color: C.terracotta,
                      fontWeight: 600,
                      lineHeight: 1.5,
                    }}
                  >
                    {t("settings.deleteWarning")}
                  </p>
                  <p
                    style={{
                      margin: "0 0 10px",
                      fontSize: 12.5,
                      color: C.cocoaSoft,
                    }}
                  >
                    {t("settings.typeNameToConfirm", { name: group.name })}
                  </p>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={group.name}
                    style={inputStyle("rgba(159,70,40,0.30)")}
                  />
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      marginTop: 12,
                      justifyContent: "flex-end",
                    }}
                  >
                    <button
                      onClick={() => {
                        setConfirmDeleteGroup(false);
                        setConfirmText("");
                      }}
                      style={ghostBtn()}
                    >
                      {t("common.cancel")}
                    </button>
                    <button
                      onClick={deleteGroupConfirmed}
                      disabled={confirmText !== group.name}
                      style={{
                        ...dangerBtn(),
                        opacity: confirmText === group.name ? 1 : 0.5,
                        cursor:
                          confirmText === group.name
                            ? "pointer"
                            : "not-allowed",
                      }}
                    >
                      <Icon name="trash-2" size={14} strokeWidth={1.9} />
                      {t("common.delete")}
                    </button>
                  </div>
                </div>
              )}
            </AccordionBlock>
          )}
        </div>
      </div>

      {/* ===== QR MODAL ===== */}
      <BottomSheet
        open={qrToken !== null}
        onClose={() => setQrToken(null)}
        title={t("settings.qrScanToJoin")}
      >
        <div style={{ textAlign: "center" }}>
          <p
            style={{
              fontSize: 14,
              color: C.cocoaSoft,
              margin: "0 0 14px",
            }}
          >
            {group.name}
          </p>
          <div
            style={{
              margin: "10px auto 16px",
              width: 256,
              maxWidth: "100%",
              aspectRatio: "1 / 1",
              background: C.paper,
              padding: 12,
              borderRadius: 14,
              boxShadow: `0 6px 24px ${C.saffron}33`,
            }}
          >
            <BrandedQR
              value={`${typeof window !== "undefined" ? window.location.origin : ""}/join/${qrToken ?? ""}`}
              size={300}
              alt="QR code d'invitation BMD"
            />
          </div>
          <p
            style={{
              fontSize: 11,
              color: C.cocoaMute,
              wordBreak: "break-all",
              margin: "0 0 18px",
            }}
          >
            {`${typeof window !== "undefined" ? window.location.origin : ""}/join/${qrToken ?? ""}`}
          </p>
          <button
            type="button"
            onClick={() => setQrToken(null)}
            style={{
              width: "100%",
              padding: "14px 22px",
              background: `linear-gradient(135deg, ${C.saffron}, ${C.terracotta})`,
              color: C.paper,
              border: "none",
              borderRadius: 999,
              fontWeight: 700,
              fontSize: 15,
              fontFamily: "inherit",
              cursor: "pointer",
              boxShadow: `0 6px 20px ${C.saffron}55`,
            }}
          >
            {t("common.close")}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}

// ============ SUB-COMPONENTS ============

function LivePreviewCard({
  group,
  myRole,
  memberCount,
  currency,
  createdAtLabel,
  t,
}: {
  group: any;
  myRole: Role | null;
  memberCount: number;
  currency: string;
  createdAtLabel: string;
  t: ReturnType<typeof useT>;
}) {
  const primary = group.theme?.primaryColor || C.saffron;
  const accent = group.theme?.accentColor || C.terracotta;
  const initial = (group.name?.[0] ?? "?").toUpperCase();
  const customLogo = group.customLogoUrl as string | undefined;

  return (
    <div
      style={{
        background: C.paper,
        border: `1px solid ${C.line}`,
        borderRadius: 20,
        padding: 22,
        boxShadow: "0 8px 24px rgba(43,31,21,0.06)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Bar charte couleur en haut */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          background: `linear-gradient(90deg, ${primary}, ${accent})`,
        }}
      />

      {/* Squircle logo */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            width: 60,
            height: 60,
            borderRadius: 18,
            background: customLogo
              ? `center / cover no-repeat url(${customLogo})`
              : `linear-gradient(135deg, ${primary}, ${accent})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: C.paper,
            fontSize: 26,
            fontWeight: 700,
            fontFamily: "Cormorant Garamond, serif",
            boxShadow: `0 8px 20px ${primary}44`,
            flexShrink: 0,
          }}
        >
          {!customLogo && initial}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: "Cormorant Garamond, serif",
              fontSize: 22,
              fontWeight: 600,
              color: C.cocoa,
              lineHeight: 1.15,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {group.name}
          </div>
          {myRole && (
            <div
              style={{
                marginTop: 4,
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "3px 9px",
                background: C.saffronPale,
                color: C.cocoa,
                borderRadius: 999,
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              {t(`settingsV241.role.${myRole.toLowerCase()}` as any) ||
                myRole.toLowerCase()}
            </div>
          )}
        </div>
      </div>

      {/* 3 mini-stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
          marginTop: 6,
        }}
      >
        <MiniStat
          value={String(memberCount)}
          label={t("settingsV241.stats.members")}
        />
        <MiniStat value={currency} label={t("settingsV241.stats.currency")} />
        <MiniStat
          value={createdAtLabel}
          label={t("settingsV241.stats.created")}
          smallValue
        />
      </div>

      {/* Bar charte (texte) */}
      <div
        style={{
          marginTop: 16,
          padding: "10px 12px",
          background: C.ivory,
          border: `1px solid ${C.line}`,
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", gap: 4 }}>
          <span
            style={{
              width: 14,
              height: 14,
              borderRadius: 4,
              background: primary,
              border: `1px solid rgba(43,31,21,0.15)`,
            }}
          />
          <span
            style={{
              width: 14,
              height: 14,
              borderRadius: 4,
              background: accent,
              border: `1px solid rgba(43,31,21,0.15)`,
            }}
          />
        </div>
        <span
          style={{
            fontSize: 11,
            color: C.cocoaSoft,
            fontWeight: 600,
          }}
        >
          {t("settingsV241.preview.charterLabel")}
        </span>
      </div>
    </div>
  );
}

function MiniStat({
  value,
  label,
  smallValue,
}: {
  value: string;
  label: string;
  smallValue?: boolean;
}) {
  return (
    <div
      style={{
        background: C.sable,
        border: `1px solid ${C.line}`,
        borderRadius: 10,
        padding: "8px 6px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: "Cormorant Garamond, serif",
          fontSize: smallValue ? 13 : 18,
          fontWeight: 700,
          color: C.cocoa,
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 9,
          color: C.cocoaSoft,
          textTransform: "uppercase",
          letterSpacing: 0.8,
          marginTop: 3,
          fontWeight: 700,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function AccordionBlock({
  index,
  icon,
  title,
  subtitle,
  open,
  onToggle,
  children,
  danger,
}: {
  index: number;
  icon: IconName;
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <section
      style={{
        background: C.paper,
        border: `1px solid ${danger ? "rgba(159,70,40,0.25)" : C.line}`,
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: open
          ? "0 6px 22px rgba(43,31,21,0.07)"
          : "0 2px 8px rgba(43,31,21,0.03)",
        transition: "box-shadow 0.18s ease",
      }}
    >
      {/* HEADER */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "16px 18px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: "inherit",
        }}
      >
        {/* Index circle */}
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: 10,
            background: danger
              ? "rgba(159,70,40,0.10)"
              : open
              ? C.saffronPale
              : C.sable,
            color: danger ? C.terracotta : C.cocoa,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 800,
            fontFamily: "Cormorant Garamond, serif",
            flexShrink: 0,
            border: `1px solid ${danger ? "rgba(159,70,40,0.30)" : C.lineSoft}`,
          }}
        >
          {index}
        </span>
        {/* Icon + title */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: danger ? C.terracotta : C.cocoaSoft,
            flexShrink: 0,
          }}
        >
          <Icon name={icon} size={18} strokeWidth={1.7} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: "block",
              fontSize: 15,
              fontWeight: 700,
              color: danger ? C.terracotta : C.cocoa,
              fontFamily: "Cormorant Garamond, serif",
              letterSpacing: 0.2,
            }}
          >
            {title}
          </span>
          {subtitle && (
            <span
              style={{
                display: "block",
                fontSize: 11.5,
                color: C.cocoaSoft,
                marginTop: 2,
                lineHeight: 1.4,
              }}
            >
              {subtitle}
            </span>
          )}
        </span>
        <span
          aria-hidden
          style={{
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
            color: C.cocoaSoft,
            flexShrink: 0,
          }}
        >
          <Icon name="chevron-down" size={18} strokeWidth={1.8} />
        </span>
      </button>

      {/* BODY */}
      {open && (
        <div
          style={{
            padding: "0 20px 20px",
            borderTop: `1px solid ${danger ? "rgba(159,70,40,0.15)" : "rgba(43,31,21,0.06)"}`,
            paddingTop: 16,
          }}
        >
          {children}
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label
      style={{
        display: "block",
        marginBottom: 12,
        fontSize: 11,
        color: C.cocoaSoft,
        fontWeight: 800,
        textTransform: "uppercase",
        letterSpacing: 1,
      }}
    >
      {label}
      <div style={{ marginTop: 6 }}>{children}</div>
    </label>
  );
}

function inputStyle(borderColor?: string): CSSProperties {
  return {
    display: "block",
    width: "100%",
    padding: "10px 12px",
    fontSize: 14,
    color: C.cocoa,
    background: C.ivory,
    border: `1px solid ${borderColor ?? C.lineSoft}`,
    borderRadius: 10,
    boxSizing: "border-box",
    fontFamily: "inherit",
    fontWeight: 500,
    outline: "none",
    transition: "border-color 0.15s ease",
  };
}

function PrimaryBtn({
  onClick,
  busy,
  children,
}: {
  onClick: () => void;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "10px 18px",
        background: `linear-gradient(135deg, ${C.saffron}, ${C.terracotta})`,
        color: C.paper,
        border: "none",
        borderRadius: 10,
        fontSize: 13,
        fontWeight: 700,
        cursor: busy ? "wait" : "pointer",
        fontFamily: "inherit",
        boxShadow: `0 4px 12px ${C.saffron}55`,
      }}
    >
      {children}
    </button>
  );
}

function ghostBtn(): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "9px 14px",
    background: "transparent",
    color: C.cocoaSoft,
    border: `1px solid ${C.lineSoft}`,
    borderRadius: 10,
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  };
}

function dangerBtn(): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "10px 16px",
    background: "rgba(159,70,40,0.08)",
    color: C.terracotta,
    border: `1px solid rgba(159,70,40,0.30)`,
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  };
}

function iconBtn(): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 30,
    background: "transparent",
    border: `1px solid transparent`,
    borderRadius: 8,
    cursor: "pointer",
    flexShrink: 0,
  };
}

function Avatar({
  letter,
  photo,
}: {
  letter: string;
  photo?: string | null;
}) {
  if (photo) {
    return (
      <span
        style={{
          width: 34,
          height: 34,
          borderRadius: "50%",
          background: `center / cover no-repeat url(${photo})`,
          flexShrink: 0,
          border: `1px solid ${C.lineSoft}`,
        }}
        aria-hidden
      />
    );
  }
  return (
    <span
      style={{
        width: 34,
        height: 34,
        borderRadius: "50%",
        background: `linear-gradient(135deg, ${C.saffron}, ${C.terracotta})`,
        color: C.paper,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 13,
        fontWeight: 700,
        fontFamily: "Cormorant Garamond, serif",
        flexShrink: 0,
      }}
    >
      {letter}
    </span>
  );
}

function ToggleRow({
  icon,
  title,
  description,
  checked,
  onChange,
  meta,
  accent,
}: {
  icon: IconName;
  title: string;
  description?: string;
  checked: boolean;
  onChange: () => void;
  meta?: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 14px",
        background: C.ivory,
        border: `1px solid ${C.line}`,
        borderRadius: 12,
        marginBottom: 8,
      }}
    >
      <span
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          background: checked
            ? `${accent ?? C.saffron}1A`
            : "rgba(43,31,21,0.05)",
          color: checked ? accent ?? C.saffron : C.cocoaSoft,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          transition: "all 0.18s ease",
        }}
      >
        <Icon name={icon} size={16} strokeWidth={1.7} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 700,
            color: C.cocoa,
            lineHeight: 1.2,
          }}
        >
          {title}
        </div>
        {description && (
          <div
            style={{
              fontSize: 11.5,
              color: C.cocoaSoft,
              marginTop: 3,
              lineHeight: 1.4,
            }}
          >
            {description}
          </div>
        )}
        {meta && (
          <div
            style={{
              fontSize: 9.5,
              color: C.cocoaMute,
              marginTop: 4,
              textTransform: "uppercase",
              letterSpacing: 0.7,
              fontWeight: 700,
            }}
          >
            {meta}
          </div>
        )}
      </div>
      <Switch
        on={checked}
        onChange={onChange}
        accent={accent ?? C.saffron}
      />
    </div>
  );
}

function Switch({
  on,
  onChange,
  accent,
}: {
  on: boolean;
  onChange: () => void;
  accent: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onChange}
      style={{
        position: "relative",
        width: 44,
        height: 24,
        background: on ? accent : "rgba(43,31,21,0.18)",
        border: "none",
        borderRadius: 999,
        cursor: "pointer",
        padding: 2,
        flexShrink: 0,
        transition: "background 0.18s ease",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: on ? 22 : 2,
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: C.paper,
          boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
          transition: "left 0.18s ease",
        }}
      />
    </button>
  );
}

function InviteStats({
  tokens,
  t,
}: {
  tokens: any[];
  t: ReturnType<typeof useT>;
}) {
  const totalUses = tokens.reduce(
    (acc: number, tk: any) => acc + (tk.uses ?? 0),
    0,
  );
  const activeCount = tokens.filter((tk: any) => tk.status === "active")
    .length;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 8,
      }}
    >
      <StatTile
        value={String(tokens.length)}
        label={t("settings.linksCreatedLabel")}
      />
      <StatTile value={String(activeCount)} label={t("settings.activeLinks")} />
      <StatTile
        value={String(totalUses)}
        label={t("settingsV241.invites.entries")}
      />
    </div>
  );
}

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div
      style={{
        padding: "10px 8px",
        background: C.sable,
        border: `1px solid ${C.line}`,
        borderRadius: 10,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: "Cormorant Garamond, serif",
          fontSize: 22,
          fontWeight: 700,
          color: C.saffron,
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 9.5,
          color: C.cocoaSoft,
          textTransform: "uppercase",
          letterSpacing: 0.8,
          marginTop: 4,
          fontWeight: 700,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function InviteTokenRow({
  tk,
  onCopy,
  onShare,
  onShowQR,
  onRevoke,
  t,
}: {
  tk: any;
  onCopy: (token: string) => void;
  onShare: (token: string) => void;
  onShowQR: (token: string) => void;
  onRevoke: (id: string) => void;
  t: ReturnType<typeof useT>;
}) {
  const status = tk.status as
    | "active"
    | "exhausted"
    | "expired"
    | "revoked";
  const isInactive = status !== "active";

  const statusBadge = (() => {
    if (status === "active")
      return { bg: "rgba(31,122,87,0.10)", color: C.sage, label: t("settingsV241.invites.statusActive") };
    if (status === "exhausted")
      return { bg: C.saffronPale, color: C.saffron, label: t("settingsV241.invites.statusExhausted") };
    if (status === "expired")
      return { bg: "rgba(159,70,40,0.10)", color: C.terracotta, label: t("settingsV241.invites.statusExpired") };
    return { bg: "rgba(43,31,21,0.06)", color: C.cocoaSoft, label: t("settingsV241.invites.statusRevoked") };
  })();

  const usesText = tk.maxUses
    ? t("settings.usesLabel", {
        used: String(tk.uses),
        max: String(tk.maxUses),
      })
    : t("settings.usesLabelAlt", {
        count: String(tk.uses),
        plural: tk.uses > 1 ? "s" : "",
      });

  return (
    <div
      style={{
        padding: 12,
        background: C.ivory,
        border: `1px solid ${C.line}`,
        borderRadius: 12,
        opacity: isInactive ? 0.65 : 1,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 8,
          fontSize: 10.5,
          color: C.cocoaSoft,
        }}
      >
        <span
          style={{
            background: statusBadge.bg,
            color: statusBadge.color,
            padding: "3px 9px",
            borderRadius: 999,
            fontWeight: 700,
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: 0.7,
          }}
        >
          {statusBadge.label}
        </span>
        <span>{usesText}</span>
        {tk.expiresAt && (
          <span>
            ·{" "}
            {status === "expired"
              ? t("settings.expiredLabel")
              : t("settings.expiresLabel")}{" "}
            {new Date(tk.expiresAt).toLocaleDateString("fr-FR")}
          </span>
        )}
      </div>
      <code
        style={{
          display: "block",
          fontSize: 11,
          background: C.sable,
          color: C.cocoa,
          padding: "6px 9px",
          borderRadius: 6,
          marginBottom: 8,
          wordBreak: "break-all",
          fontFamily: "ui-monospace, monospace",
        }}
      >{`/join/${tk.token}`}</code>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {!isInactive && (
          <>
            <SmallBtn onClick={() => onCopy(tk.token)} icon="copy">
              {t("common.copy")}
            </SmallBtn>
            <SmallBtn onClick={() => onShare(tk.token)} icon="share-2">
              {t("common.share")}
            </SmallBtn>
            <SmallBtn onClick={() => onShowQR(tk.token)} icon="qr-code">
              QR
            </SmallBtn>
          </>
        )}
        {!tk.revokedAt && (
          <SmallBtn
            onClick={() => onRevoke(tk.id)}
            icon="x"
            danger
          >
            {t("settings.revokeInvite")}
          </SmallBtn>
        )}
      </div>
    </div>
  );
}

function SmallBtn({
  onClick,
  icon,
  children,
  danger,
}: {
  onClick: () => void;
  icon: IconName;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "7px 11px",
        background: danger ? "rgba(159,70,40,0.06)" : C.paper,
        color: danger ? C.terracotta : C.cocoa,
        border: `1px solid ${danger ? "rgba(159,70,40,0.25)" : C.lineSoft}`,
        borderRadius: 8,
        fontSize: 11.5,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      <Icon name={icon} size={12} strokeWidth={1.8} />
      {children}
    </button>
  );
}
