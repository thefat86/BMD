"use client";

/**
 * V223.A+E — GroupDebtSidebar (refonte fonds clairs + relance locale)
 * ============================================================================
 * Panneau gauche fixe (280px) sur la page Dépenses desktop. Toujours visible
 * quels que soient les onglets droite. Contenu :
 *
 *   1. Ton solde · ce groupe (XL monospace, sage si +, terracotta si -)
 *   2. "X personnes te doivent · Tu dois à Y personnes"
 *   3. Section "À encaisser" (créanciers de toi)
 *   4. Section "À payer" (tu dois à eux)
 *   5. Bouton "Relancer N personnes" saffron
 *   6. Bloc sable "Swap possible" si compensation triangulaire détectée
 *
 * V223.A — Tous les fonds passent en clair (cocoa #2B1F15 → cream/sable/white).
 *   - Bloc swap CTA : saffron sur fond clair au lieu de cocoa.
 * V223.E — Le bouton "Relancer N personnes" ouvre une vraie sheet locale
 *   (DesktopRemindSheet) au lieu de naviguer vers le dashboard.
 */

import { useMemo, useState } from "react";
import { AvatarColored } from "./avatar-colored";
import { DesktopRemindSheet, type RemindDebtor } from "./desktop-remind-sheet";
import { useT } from "../i18n/app-strings";
import { useLocale } from "../locale-provider";

export interface SidebarMember {
  id: string;
  displayName: string;
  photoUrl?: string | null;
}

export function GroupDebtSidebar({
  groupId: _groupId,
  groupName,
  meId,
  members,
  balances,
  transfers,
  currency,
  formatAmount,
  onChange: _onChange,
  // i18n
  yourBalanceLabel,
  toCollectLabel,
  toPayLabel,
  remindLabel,
  remindTemplate,
  swapTitleLabel,
  swapBodyTemplate,
  swapCtaLabel,
  zeroStateLabel,
  oweYouCountLabel,
  youOweCountLabel,
}: {
  groupId: string;
  /** V223.E — Nom du groupe pour l'IA de relance */
  groupName?: string;
  meId: string;
  members: SidebarMember[];
  balances: Map<string, number>;
  transfers: Array<{ fromUserId: string; toUserId: string; amount: number }>;
  currency: string;
  formatAmount: (amount: number, currency: string) => string;
  onChange?: () => void;
  yourBalanceLabel: string;
  toCollectLabel: string;
  toPayLabel: string;
  remindLabel: string;
  remindTemplate: string;
  swapTitleLabel: string;
  swapBodyTemplate: string;
  swapCtaLabel: string;
  zeroStateLabel: string;
  oweYouCountLabel: string;
  youOweCountLabel: string;
}): JSX.Element {
  // V223.E — Sheet de relance locale, plus de router.push dashboard
  const [remindOpen, setRemindOpen] = useState(false);
  const t = useT();
  const { code: localeCode } = useLocale();

  const myBalance = balances.get(meId) ?? 0;

  const owesMe = useMemo(
    () =>
      transfers
        .filter((tx) => tx.toUserId === meId)
        .map((tx) => ({
          userId: tx.fromUserId,
          amount: tx.amount,
          name:
            members.find((m) => m.id === tx.fromUserId)?.displayName ?? "—",
          photoUrl:
            members.find((m) => m.id === tx.fromUserId)?.photoUrl ?? null,
        }))
        .sort((a, b) => b.amount - a.amount),
    [transfers, meId, members],
  );
  const iOwe = useMemo(
    () =>
      transfers
        .filter((tx) => tx.fromUserId === meId)
        .map((tx) => ({
          userId: tx.toUserId,
          amount: tx.amount,
          name:
            members.find((m) => m.id === tx.toUserId)?.displayName ?? "—",
          photoUrl:
            members.find((m) => m.id === tx.toUserId)?.photoUrl ?? null,
        }))
        .sort((a, b) => b.amount - a.amount),
    [transfers, meId, members],
  );

  // V222.F — Détection swap triangulaire simple
  const swapSuggestion = useMemo(() => {
    if (owesMe.length === 0 || iOwe.length === 0) return null;
    let best: {
      from: (typeof owesMe)[number];
      to: (typeof iOwe)[number];
      savable: number;
    } | null = null;
    for (const f of owesMe) {
      for (const tx of iOwe) {
        if (f.userId === tx.userId) continue;
        const savable = Math.min(f.amount, tx.amount);
        if (savable < 0.01) continue;
        if (!best || savable > best.savable) {
          best = { from: f, to: tx, savable };
        }
      }
    }
    return best;
  }, [owesMe, iOwe]);

  // V225.B — single-brace `{x}` (= ce que les i18n locales utilisent côté
  // BMD `t()`). Fallback double-brace pour rétro-compat. Les call-sites
  // peuvent donc passer juste `t("key")` sans wrap `{x: "{{x}}"}`.
  function fillTemplate(
    template: string,
    values: Record<string, string | number>,
  ): string {
    let s = template;
    for (const [k, v] of Object.entries(values)) {
      s = s.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g"), String(v));
      s = s.replace(new RegExp(`\\{\\s*${k}\\s*\\}`, "g"), String(v));
    }
    return s;
  }

  const totalReminders = owesMe.length;

  // V223.E — Construit la liste pour la sheet de relance
  const remindDebtors: RemindDebtor[] = useMemo(
    () =>
      owesMe.map((p) => ({
        userId: p.userId,
        name: p.name,
        amount: p.amount,
        currency,
      })),
    [owesMe, currency],
  );

  return (
    <>
      <aside
        style={{
          background: "#FAF6EE",
          borderRight: "0.5px solid #D9C8A6",
          padding: "16px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          minWidth: 0,
        }}
      >
        {/* Bloc 1 : Mon solde */}
        <div>
          <div
            style={{
              fontSize: 10,
              color: "#8B6F47",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 4,
            }}
          >
            {yourBalanceLabel}
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 600,
              color:
                Math.abs(myBalance) < 0.005
                  ? "#2B1F15"
                  : myBalance > 0
                    ? "#1F7A57"
                    : "#9F4628",
              fontFamily: "ui-monospace, Menlo, monospace",
              letterSpacing: "-0.5px",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {myBalance > 0 ? "+" : ""}
            {formatAmount(myBalance, currency)}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "#8B6F47",
              marginTop: 4,
              lineHeight: 1.4,
            }}
          >
            {fillTemplate(oweYouCountLabel, { n: owesMe.length })}
            <br />
            {fillTemplate(youOweCountLabel, { n: iOwe.length })}
          </div>
        </div>

        {/* À encaisser */}
        {owesMe.length > 0 && (
          <section>
            <div
              style={{
                fontSize: 10,
                color: "#8B6F47",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 6,
              }}
            >
              {toCollectLabel}
            </div>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: 5,
              }}
            >
              {owesMe.map((p) => (
                <li
                  key={p.userId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 8px",
                    background: "#FFFFFF",
                    border: "0.5px solid #EEE4CC",
                    borderRadius: 8,
                  }}
                >
                  <AvatarColored
                    userId={p.userId}
                    initials={p.name}
                    size={24}
                    photoUrl={p.photoUrl}
                  />
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 12,
                      color: "#2B1F15",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.name}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#1F7A57",
                      fontFamily: "ui-monospace, Menlo, monospace",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatAmount(p.amount, currency)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* À payer */}
        {iOwe.length > 0 && (
          <section>
            <div
              style={{
                fontSize: 10,
                color: "#8B6F47",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 6,
              }}
            >
              {toPayLabel}
            </div>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: 5,
              }}
            >
              {iOwe.map((p) => (
                <li
                  key={p.userId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 8px",
                    background: "#FFFFFF",
                    border: "0.5px solid #EEE4CC",
                    borderRadius: 8,
                  }}
                >
                  <AvatarColored
                    userId={p.userId}
                    initials={p.name}
                    size={24}
                    photoUrl={p.photoUrl}
                  />
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 12,
                      color: "#2B1F15",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.name}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#9F4628",
                      fontFamily: "ui-monospace, Menlo, monospace",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatAmount(p.amount, currency)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Empty state si pas de dette */}
        {owesMe.length === 0 && iOwe.length === 0 && (
          <div
            style={{
              fontSize: 12,
              color: "#1F7A57",
              background: "#EBF5F0",
              padding: "10px 12px",
              borderRadius: 8,
              textAlign: "center",
            }}
          >
            ✓ {zeroStateLabel}
          </div>
        )}

        {/* V223.E — Bouton Relancer ouvre sheet locale */}
        {totalReminders > 0 && (
          <button
            type="button"
            onClick={() => setRemindOpen(true)}
            style={{
              padding: "10px 14px",
              background: "#C58A2E",
              color: "#FFFFFF",
              border: "none",
              borderRadius: 9,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {fillTemplate(remindTemplate, { count: totalReminders }) ||
              remindLabel}
          </button>
        )}

        {/* V223.A — Bloc Swap possible : fond sable clair + CTA saffron clair */}
        {swapSuggestion && (
          <div
            style={{
              background: "#F4ECD9",
              border: "0.5px solid #D9C8A6",
              borderRadius: 10,
              padding: 12,
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: "#8B6F47",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 4,
                fontWeight: 600,
              }}
            >
              ↗ {swapTitleLabel}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "#2B1F15",
                lineHeight: 1.4,
              }}
            >
              {fillTemplate(swapBodyTemplate, {
                them: swapSuggestion.from.name,
                amount: formatAmount(swapSuggestion.from.amount, currency),
                amount2: formatAmount(swapSuggestion.to.amount, currency),
                otherPerson: swapSuggestion.to.name,
              })}
            </div>
            <div
              style={{
                marginTop: 8,
                fontSize: 11,
                color: "#8B6F47",
              }}
            >
              {/* V223.D — Le CTA réel est dans OptimalSettlementPlan : on
                  affiche juste un texte informatif ici (pas de duplication
                  de bouton). Le swap se confirme via le panneau droite. */}
              {swapCtaLabel}
            </div>
          </div>
        )}
      </aside>

      {/* V223.E — Sheet relance locale */}
      <DesktopRemindSheet
        open={remindOpen}
        onClose={() => setRemindOpen(false)}
        debtors={remindDebtors}
        groupName={groupName ?? ""}
        locale={localeCode}
        titleTemplate={remindTemplate}
        emptyLabel={t("group.debts.empty") || "Aucune relance à envoyer"}
        toneLabel={t("reminder.toneLabel") || "Tonalité"}
        toneSympaLabel={t("reminder.toneSympa") || "Sympa"}
        toneFermeLabel={t("reminder.toneFerme") || "Ferme"}
        toneHumourLabel={t("reminder.toneHumour") || "Humour"}
        toneProLabel={t("reminder.tonePro") || "Pro"}
        generateLabel={t("reminder.generateCta") || "Générer le message"}
        generatingLabel={t("reminder.generating") || "Génération…"}
        draftLabel={t("reminder.draftLabel") || "Message"}
        copyLabel={t("group.debts.remindCopy") || "Copier"}
        whatsAppLabel={
          t("group.debts.remindWhatsApp") || "Ouvrir dans WhatsApp"
        }
        emailLabel={t("group.debts.remindEmail") || "Envoyer par email"}
        closeLabel={t("common.close") || "Fermer"}
        // V225.B — Single-brace `{name}` raw, DesktopRemindSheet fait
        // l'interpolation (avec son propre fillTemplate compatible).
        fallbackTemplate={
          t("group.debts.remindFallback") ||
          "Hello {name}, n'oublie pas que tu me dois {amount} sur le groupe {group}."
        }
      />
    </>
  );
}
