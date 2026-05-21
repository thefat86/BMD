"use client";

/**
 * V211.C — Vue Membres dédiée desktop.
 * =============================================================================
 * Tableau dense 5 colonnes (Nom / Contact / Solde coloré / Rôle / ⋯ actions).
 * Bouton « ⊕ Inviter » primaire qui ouvre le sheet existant (réutilise la
 * route ?action=invite gérée par le hub).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../api-client";
import { useT } from "../i18n/app-strings";
import { useCurrency } from "../currency-provider";
import { useToast } from "./toast";
import { AvatarColored } from "./avatar-colored";
import { DesktopGroupSectionShell } from "./group-desktop-shell";
// V228 — Helper unifié pour calculer le triplet (dépenses + tontine + caisses)
// par membre. Mêmes règles que le hero du hub (V227).
import {
  computeMemberSolde,
  type FundDetail,
  type TontineSnapshot,
} from "../group-soldes";

type Member = {
  id: string;
  userId?: string;
  role?: string;
  user?: {
    id: string;
    displayName: string;
    photoUrl?: string | null;
    contacts?: Array<{ type: string; value: string }>;
  };
};

// V228 — On accepte le payload brut de `api.getBalance` (balances[] +
// suggestions[]). Le helper `computeExpensesSolde` dérive le net par user
// à partir de balances[].
type Balance =
  | {
      currency?: string;
      balances?: Array<{
        userId: string;
        displayName?: string;
        net: string | number;
      }>;
      suggestions?: Array<{
        fromUserId: string;
        toUserId: string;
        amount: string | number;
        currency?: string;
      }>;
    }
  | null;

type Group = {
  id: string;
  name: string;
  defaultCurrency: string;
  ownerId?: string;
  members: Member[];
};

export function DesktopGroupMembersView({
  group,
  balance,
  meId,
  tontine = null,
  fundDetails = [],
}: {
  group: Group;
  balance: Balance;
  meId?: string;
  // V228 — Snapshots optionnels. Si non fournis, on tombe gracieusement sur
  // "—" pour Tontine / Caisses.
  tontine?: TontineSnapshot;
  fundDetails?: FundDetail[];
}) {
  const router = useRouter();
  const t = useT();
  const { formatAmount } = useCurrency();
  const toast = useToast();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // V212 — Mode test (ajout direct membre fictif). Gate sur SiteConfig.
  const [testModeEnabled, setTestModeEnabled] = useState(false);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testName, setTestName] = useState("");
  const [testContactType, setTestContactType] = useState<"EMAIL" | "PHONE">("EMAIL");
  const [testContact, setTestContact] = useState("");
  const [testSaving, setTestSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await api.testModeGate();
        if (!cancelled) setTestModeEnabled(Boolean(r?.enabled));
      } catch {
        // silent
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAddTestMember() {
    if (!testName.trim()) return;
    setTestSaving(true);
    try {
      await api.addTestMember(group.id, {
        displayName: testName.trim(),
        ...(testContact.trim()
          ? { contactType: testContactType, contactValue: testContact.trim() }
          : {}),
      });
      toast.success(t("group.members.testAddedToast") || "Membre test ajouté");
      setTestDialogOpen(false);
      setTestName("");
      setTestContact("");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message || "Erreur");
    } finally {
      setTestSaving(false);
    }
  }

  // V228 — On ne s'appuie plus sur `balance.byPerson` (n'existait pas dans
  // le vrai payload). Le helper `computeMemberSolde` fait le calcul propre
  // par user à partir de `balance.balances[]`.

  const contactOf = (m: Member): string => {
    const email = m.user?.contacts?.find((c) => c.type === "EMAIL")?.value;
    if (email) return email;
    const phone = m.user?.contacts?.find((c) => c.type === "PHONE")?.value;
    if (phone) return phone;
    return "—";
  };

  const roleOf = (m: Member): string => {
    if (m.user?.id === group.ownerId) return t("group.members.roleCreator") || "Créateur";
    if (m.role === "ADMIN") return t("group.members.roleAdmin") || "Admin";
    return t("group.members.roleMember") || "Membre";
  };

  return (
    <DesktopGroupSectionShell
      groupId={group.id}
      groupName={group.name}
      sectionLabel={t("group.hub.members") || "Membres"}
      subtitle={`${group.members.length} ${group.members.length > 1 ? (t("group.hub.peoplePlural") || "personnes") : (t("group.hub.peopleSingular") || "personne")}`}
      primaryAction={
        <div style={{ display: "inline-flex", gap: 6 }}>
          {testModeEnabled && (
            <button
              type="button"
              onClick={() => setTestDialogOpen(true)}
              style={{
                padding: "8px 13px",
                background: "#F4E4C1",
                color: "#6B4A1A",
                border: "0.5px solid #C58A2E",
                borderRadius: 9,
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
              title="Mode test : ajoute un membre directement sans email ni approbation"
            >
              + {t("group.members.testAdd") || "Membre test"}
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              router.push(
                `/dashboard/groups/${group.id}/members?action=invite`,
              )
            }
            style={{
              padding: "8px 14px",
              background: "#2B1F15",
              color: "#FAF6EE",
              border: "none",
              borderRadius: 9,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            ⊕ {t("group.hub.invite") || "Inviter"}
          </button>
        </div>
      }
    >
      {testModeEnabled && (
        <div
          style={{
            background: "#FFF3D6",
            border: "0.5px solid #C58A2E",
            borderLeft: "3px solid #C58A2E",
            borderRadius: 9,
            padding: "9px 14px",
            marginBottom: 12,
            fontSize: 12,
            color: "#6B4A1A",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 14 }}>⚠️</span>
          <span>
            <b style={{ fontWeight: 500 }}>Mode test actif</b> — l'ajout direct
            de membres sans approbation est autorisé. À désactiver dans{" "}
            <span style={{ fontFamily: "monospace", fontSize: 11 }}>
              /admin/feature-flags
            </span>{" "}
            avant la prod.
          </span>
        </div>
      )}

      {/* V228 — Mini-légende couleurs créditeur/débiteur. */}
      <div
        style={{
          fontSize: 11,
          color: "#8B6F47",
          marginBottom: 10,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: 10,
            height: 10,
            borderRadius: 3,
            background: "#1F7A57",
          }}
          aria-hidden
        />
        <span style={{ marginRight: 6 }}>
          {t("group.members.solde.legend") ||
            "Sage : créditeur · Terracotta : débiteur"}
        </span>
        <span
          style={{
            display: "inline-block",
            width: 10,
            height: 10,
            borderRadius: 3,
            background: "#9F4628",
          }}
          aria-hidden
        />
      </div>
      <div
        style={{
          background: "#FFFFFF",
          border: "0.5px solid #D9C8A6",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        {/* Header tableau — V228 : 3 colonnes de solde (Dépenses / Tontine / Caisses) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "1.3fr 1.2fr 0.85fr 0.85fr 0.85fr 0.6fr 44px",
            gap: 0,
            padding: "10px 16px",
            background: "#F4ECD9",
            fontSize: 10,
            color: "#8B6F47",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontWeight: 500,
          }}
        >
          <span>{t("group.members.name") || "Nom"}</span>
          <span>{t("group.members.contact") || "Contact"}</span>
          <span style={{ textAlign: "right" }}>
            {t("group.members.solde.expenses") || "Dépenses"}
          </span>
          <span style={{ textAlign: "right" }}>
            {t("group.members.solde.tontine") || "Tontine"}
          </span>
          <span style={{ textAlign: "right" }}>
            {t("group.members.solde.funds") || "Caisses"}
          </span>
          <span>{t("group.members.role") || "Rôle"}</span>
          <span></span>
        </div>

        {/* Lignes — V228 : calcul triplet (expenses / tontine / funds) par user */}
        {group.members.map((m, idx) => {
          const userId = m.user?.id || m.userId || m.id;
          const isMe = userId === meId;
          const displayName = isMe
            ? t("group.members.you") || "Toi"
            : m.user?.displayName || "—";

          // V228 — Triplet via le helper unifié. La couleur de chaque badge
          // suit la convention sage = créditeur / terracotta = débiteur,
          // muted (#8B6F47) si pas de donnée (— affiché).
          const solde = computeMemberSolde(userId, {
            balance,
            tontine,
            fundDetails,
          });

          const expensesNet = solde.expenses.net;
          const expensesCurrency =
            solde.expenses.currency || group.defaultCurrency;

          const tontineActive = solde.tontine.net != null;
          const tontineNet = solde.tontine.net ?? 0;
          const tontineCurrency =
            solde.tontine.currency || group.defaultCurrency;

          const fundsHasAny = solde.funds.breakdown.length > 0;
          const fundsNet = solde.funds.net;
          const fundsCurrency =
            solde.funds.currency || group.defaultCurrency;
          // Tooltip : détail par caisse, ligne par ligne.
          const fundsTooltip = fundsHasAny
            ? (t("group.members.solde.tooltip") ||
                "Détail par caisse : {breakdown}").replace(
                "{breakdown}",
                solde.funds.breakdown
                  .map(
                    (b) =>
                      `${b.fundName} : ${formatAmount(b.amount, b.currency)}`,
                  )
                  .join(" + "),
              )
            : undefined;

          return (
            <div
              key={m.id}
              style={{
                display: "grid",
                gridTemplateColumns:
                  "1.3fr 1.2fr 0.85fr 0.85fr 0.85fr 0.6fr 44px",
                gap: 0,
                padding: "12px 16px",
                borderBottom:
                  idx === group.members.length - 1
                    ? "none"
                    : "0.5px solid #EEE4CC",
                fontSize: 12,
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                <AvatarColored
                  userId={userId}
                  initials={m.user?.displayName || ""}
                  size={26}
                  photoUrl={m.user?.photoUrl || undefined}
                />
                <span style={{ fontWeight: 500, color: "#2B1F15", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {displayName}
                </span>
              </div>
              <span
                style={{
                  color: "#8B6F47",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  paddingRight: 8,
                }}
              >
                {contactOf(m)}
              </span>
              <SoldeBadge
                amount={expensesNet}
                currency={expensesCurrency}
                formatAmount={formatAmount}
              />
              <SoldeBadge
                amount={tontineActive ? tontineNet : null}
                currency={tontineCurrency}
                formatAmount={formatAmount}
                placeholderTitle={
                  !tontineActive
                    ? t("group.members.solde.noTontine") || "—"
                    : undefined
                }
              />
              <SoldeBadge
                amount={fundsHasAny ? fundsNet : null}
                currency={fundsCurrency}
                formatAmount={formatAmount}
                tooltip={fundsTooltip}
                placeholderTitle={
                  !fundsHasAny
                    ? t("group.members.solde.noFunds") || "—"
                    : undefined
                }
              />
              <span style={{ color: "#8B6F47" }}>{roleOf(m)}</span>
              <div style={{ position: "relative", textAlign: "right" }}>
                <button
                  type="button"
                  onClick={() => setOpenMenuId(openMenuId === m.id ? null : m.id)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#8B6F47",
                    fontSize: 14,
                    cursor: "pointer",
                    padding: "2px 6px",
                    fontFamily: "inherit",
                  }}
                  aria-label="Actions"
                >
                  ⋯
                </button>
                {openMenuId === m.id && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      right: 0,
                      background: "#FFFFFF",
                      border: "0.5px solid #D9C8A6",
                      borderRadius: 8,
                      padding: 4,
                      minWidth: 140,
                      zIndex: 10,
                      boxShadow: "0 2px 8px rgba(43,31,21,0.08)",
                    }}
                  >
                    {!isMe && (
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenuId(null);
                          router.push(
                            `/dashboard/groups/${group.id}?view=expenses&action=settle&counterpartId=${userId}`,
                          );
                        }}
                        style={{
                          display: "block",
                          width: "100%",
                          padding: "6px 10px",
                          background: "transparent",
                          border: "none",
                          color: "#2B1F15",
                          fontSize: 11,
                          textAlign: "left",
                          cursor: "pointer",
                          borderRadius: 5,
                          fontFamily: "inherit",
                        }}
                      >
                        {t("group.members.settle") || "Régler"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setOpenMenuId(null);
                        router.push(`/dashboard/groups/${group.id}/settings`);
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "6px 10px",
                        background: "transparent",
                        border: "none",
                        color: "#2B1F15",
                        fontSize: 11,
                        textAlign: "left",
                        cursor: "pointer",
                        borderRadius: 5,
                        fontFamily: "inherit",
                      }}
                    >
                      {t("group.members.viewProfile") || "Voir le profil"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* V212 — Dialog ajout membre test */}
      {testDialogOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 90,
            background: "rgba(43,31,21,0.45)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={() => setTestDialogOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#FAF6EE",
              color: "#2B1F15",
              borderRadius: 14,
              maxWidth: 460,
              width: "100%",
              padding: "20px 22px",
              boxShadow: "0 8px 32px rgba(43,31,21,0.18)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <h3 style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>
                {t("group.members.testDialogTitle") || "Ajouter un membre test"}
              </h3>
              <button
                type="button"
                onClick={() => setTestDialogOpen(false)}
                aria-label="Fermer"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#8B6F47",
                  fontSize: 17,
                  cursor: "pointer",
                  padding: "2px 6px",
                  fontFamily: "inherit",
                }}
              >
                ✕
              </button>
            </div>
            <div
              style={{
                fontSize: 11,
                color: "#8B6F47",
                marginBottom: 14,
                lineHeight: 1.5,
              }}
            >
              {t("group.members.testDialogHint") ||
                "Le membre est créé directement, sans email ni OTP. À utiliser uniquement pour les tests internes."}
            </div>

            <label style={{ fontSize: 10, color: "#8B6F47", textTransform: "lowercase" }}>
              {t("group.members.testNameLabel") || "Nom du membre"}
            </label>
            <input
              autoFocus
              value={testName}
              onChange={(e) => setTestName(e.target.value)}
              placeholder="ex. Jean Dupont"
              style={{
                width: "100%",
                padding: "8px 11px",
                marginTop: 3,
                background: "#FFFFFF",
                border: "0.5px solid #D9C8A6",
                borderRadius: 8,
                fontSize: 13,
                color: "#2B1F15",
                fontFamily: "inherit",
                outline: "none",
              }}
            />

            <label style={{ fontSize: 10, color: "#8B6F47", textTransform: "lowercase", display: "block", marginTop: 12 }}>
              {t("group.members.testContactOptional") || "Contact (optionnel)"}
            </label>
            <div style={{ display: "flex", gap: 5, marginTop: 3 }}>
              <select
                value={testContactType}
                onChange={(e) => setTestContactType(e.target.value as "EMAIL" | "PHONE")}
                style={{
                  width: 100,
                  padding: "8px 9px",
                  background: "#FFFFFF",
                  border: "0.5px solid #D9C8A6",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "#2B1F15",
                  fontFamily: "inherit",
                  cursor: "pointer",
                }}
              >
                <option value="EMAIL">Email</option>
                <option value="PHONE">Téléphone</option>
              </select>
              <input
                value={testContact}
                onChange={(e) => setTestContact(e.target.value)}
                placeholder={testContactType === "EMAIL" ? "jean@exemple.com" : "+33 6 12…"}
                style={{
                  flex: 1,
                  padding: "8px 11px",
                  background: "#FFFFFF",
                  border: "0.5px solid #D9C8A6",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "#2B1F15",
                  fontFamily: "inherit",
                  outline: "none",
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
              <button
                type="button"
                onClick={() => setTestDialogOpen(false)}
                style={{
                  padding: "8px 14px",
                  background: "transparent",
                  color: "#8B6F47",
                  border: "none",
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {t("common.cancel") || "Annuler"}
              </button>
              <button
                type="button"
                onClick={handleAddTestMember}
                disabled={!testName.trim() || testSaving}
                style={{
                  padding: "8px 16px",
                  background: !testName.trim() || testSaving ? "#D9C8A6" : "#C58A2E",
                  color: "#2B1F15",
                  border: "none",
                  borderRadius: 9,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: !testName.trim() || testSaving ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                {testSaving ? "…" : t("group.members.testAddCta") || "Ajouter ce membre"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DesktopGroupSectionShell>
  );
}

/**
 * V228 — Petit badge montant coloré pour les colonnes Dépenses / Tontine /
 * Caisses du tableau Membres. Convention couleurs :
 *   - montant > 0 → sage (#1F7A57) : créditeur
 *   - montant < 0 → terracotta (#9F4628) : débiteur
 *   - montant === 0 → muted (#8B6F47)
 *   - montant === null → "—" (placeholder, optionnellement avec tooltip)
 *
 * Le tooltip est utilisé pour les Caisses (détail par caisse en break-down).
 */
function SoldeBadge({
  amount,
  currency,
  formatAmount,
  tooltip,
  placeholderTitle,
}: {
  amount: number | null;
  currency: string;
  formatAmount: (amount: number, currency: string) => string;
  tooltip?: string;
  placeholderTitle?: string;
}) {
  if (amount == null) {
    return (
      <span
        title={placeholderTitle}
        style={{
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
          color: "#8B6F47",
          fontWeight: 500,
        }}
      >
        —
      </span>
    );
  }
  const color =
    amount > 0 ? "#1F7A57" : amount < 0 ? "#9F4628" : "#8B6F47";
  return (
    <span
      title={tooltip}
      style={{
        textAlign: "right",
        fontVariantNumeric: "tabular-nums",
        fontWeight: 500,
        color,
        cursor: tooltip ? "help" : "default",
      }}
    >
      {amount > 0 ? "+" : ""}
      {formatAmount(amount, currency)}
    </span>
  );
}
