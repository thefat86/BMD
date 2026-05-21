"use client";

/**
 * <MobileExpenseDetailSheet> — V127 popup détails complets d'une dépense.
 *
 * Spec V127 (demande Fabrice 2026-05-14) :
 *  - Au tap sur une ligne dans la timeline groupe, ouvre une popup mobile
 *    qui affiche TOUS les détails de la dépense :
 *      • Description + montant + catégorie + date d'occurrence
 *      • Payeur(s) — single OU multi-payers avec breakdown €/%
 *      • Mode de partage + liste des parts par participant
 *      • Pièce(s) jointe(s) : lien cliquable vers le viewer attachment
 *        existant (preuve de paiement / facture scannée).
 *
 * Le composant fetche les attachments à l'ouverture (`hasReceipt = true`)
 * pour pouvoir présenter le lien. Best-effort : si listAttachments échoue,
 * on cache la section et on log le warn.
 *
 * Pattern : réutilise `<BottomSheet>` (sheet mobile fullbleed), Icon
 * registry V52.A2, AvatarColored V112 (plan-aware), et le viewer
 * `<MobileAttachmentViewer>` portalisé sur body (déjà monté côté parent).
 *
 * Note design — la lecture se fait toujours en mode V45-light cohérent
 * avec le reste de l'app (paper card, cocoa text, saffron accent). Tous
 * les libellés sont i18n-clés (toutes les langues BMD, cf. règle stricte
 * mémoire "feedback_i18n_strict_translation").
 */

import { useEffect, useMemo, useState } from "react";
import { BottomSheet } from "./bottom-sheet";
import { api } from "../api-client";
import { useT } from "../i18n/app-strings";
import { Icon } from "./icons";
import { AvatarColored } from "./avatar-colored";
import type { ViewerAttachment } from "./mobile-attachment-viewer";

/** Forme partielle d'une dépense — ce qu'on lit pour l'affichage. */
export interface DetailExpense {
  id: string;
  description: string;
  amount: string;
  currency: string;
  occurredAt: string;
  category?: string;
  splitMode?: string;
  paidById?: string;
  paidByName?: string;
  paidBy?: {
    id: string;
    displayName: string;
    avatar?: string | null;
  } | null;
  shares?: Array<{
    userId: string;
    displayName?: string;
    amountOwed: string;
  }>;
  payers?: Array<{
    userId: string;
    amount?: string | null;
    percent?: number | null;
  }>;
  hasReceipt?: boolean;
}

interface Member {
  id: string;
  user: { id: string; displayName: string; avatar?: string | null };
}

interface Props {
  open: boolean;
  onClose: () => void;
  expense: DetailExpense | null;
  members: Member[];
  meId?: string;
  /**
   * Callback appelé quand l'utilisateur tape « Voir la pièce jointe ». Le
   * parent (mobile-group-view) ouvre alors son `<MobileAttachmentViewer>`
   * qui est déjà monté pour le badge timeline (réutilisation logique).
   */
  onOpenAttachment: (attachment: ViewerAttachment) => void;
  formatAmount: (a: number | string, c: string) => string;
}

/** Petit row label/value (gauche/droite) — pattern banking. */
function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        padding: "10px 0",
        borderBottom: "1px solid var(--v45-line, rgba(43,31,21,0.06))",
        minHeight: 36,
      }}
    >
      <span
        style={{
          fontSize: 12,
          color: "var(--cocoa-mute, #A99580)",
          fontWeight: 600,
          letterSpacing: 0.3,
          textTransform: "uppercase",
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 14,
          color: "var(--cocoa, #2B1F15)",
          fontWeight: 600,
          textAlign: "right",
          minWidth: 0,
          wordBreak: "break-word",
        }}
      >
        {children}
      </span>
    </div>
  );
}

/** Formate une date ISO → date longue locale ("mardi 14 mai 2026"). */
function formatLongDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

/** Map splitMode → libellé i18n. */
function splitModeLabel(
  mode: string | undefined,
  t: ReturnType<typeof useT>,
): string {
  switch (mode) {
    case "EQUAL":
      return t("expense.splitEqual") || "Parts égales";
    case "UNEQUAL":
      return t("expense.splitUnequal") || "Montants personnalisés";
    case "PERCENTAGE":
      return t("expense.splitPercent") || "Pourcentages";
    case "ITEMIZED":
      return t("expense.splitItemized") || "Par articles";
    default:
      return mode || "—";
  }
}

export function MobileExpenseDetailSheet({
  open,
  onClose,
  expense,
  members,
  meId,
  onOpenAttachment,
  formatAmount,
}: Props) {
  const t = useT();
  const [attachments, setAttachments] = useState<
    Array<{
      id: string;
      fileName: string;
      mimeType: string;
      kind?: ViewerAttachment["kind"];
      transcript?: string | null;
    }>
  >([]);
  const [attLoading, setAttLoading] = useState(false);
  const [attError, setAttError] = useState<string | null>(null);

  // Map id → membre pour fallback displayName/avatar.
  const memberById = useMemo(() => {
    const m = new Map<
      string,
      { displayName: string; avatar: string | null }
    >();
    for (const mem of members) {
      m.set(mem.user.id, {
        displayName: mem.user.displayName,
        avatar: mem.user.avatar ?? null,
      });
    }
    return m;
  }, [members]);

  // Fetch attachments à l'ouverture si la dépense en a (hasReceipt).
  useEffect(() => {
    if (!open || !expense) {
      setAttachments([]);
      setAttError(null);
      return;
    }
    if (!expense.hasReceipt) {
      setAttachments([]);
      return;
    }
    let aborted = false;
    setAttLoading(true);
    setAttError(null);
    api
      .listAttachments(expense.id)
      .then((list) => {
        if (aborted) return;
        if (Array.isArray(list)) setAttachments(list);
      })
      .catch((err) => {
        if (aborted) return;
        console.warn("[expense-detail] listAttachments failed", err);
        setAttError(
          t("expense.attachmentsLoadFailed") ||
            "Impossible de charger les pièces jointes",
        );
      })
      .finally(() => {
        if (!aborted) setAttLoading(false);
      });
    return () => {
      aborted = true;
    };
  }, [open, expense, t]);

  if (!expense) return null;

  const amountNum = parseFloat(expense.amount);

  // Payeur affiché : priorité paidBy.displayName > paidByName > memberById.
  const payerName =
    expense.paidBy?.displayName ??
    expense.paidByName ??
    (expense.paidById
      ? memberById.get(expense.paidById)?.displayName
      : null) ??
    "?";
  const payerAvatar =
    expense.paidBy?.avatar ??
    (expense.paidById
      ? memberById.get(expense.paidById)?.avatar
      : null) ??
    null;
  const isMyExpense = expense.paidById === meId;

  // Multi-payers exposé par le backend (sprint AC-3).
  const hasMultiPayers = (expense.payers?.length ?? 0) > 1;

  // Shares (liste des parts). Si vide ou null → ne pas afficher la section.
  const shares = expense.shares ?? [];

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t("expense.detailTitle") || "Détails de la dépense"}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          paddingBottom: 8,
        }}
      >
        {/* === HERO : description + montant + date === */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: "14px 16px",
            background:
              "linear-gradient(135deg, var(--v45-saffron-pale, #F6E8C5) 0%, var(--paper, #FFFFFF) 100%)",
            border: "1px solid var(--v45-saffron-soft, #E8C988)",
            borderRadius: 16,
          }}
        >
          <div
            style={{
              fontSize: 11,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: "var(--v45-saffron, #C58A2E)",
              fontWeight: 700,
            }}
          >
            {expense.category ||
              t("expense.categoryNone") ||
              "Sans catégorie"}
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "var(--cocoa, #2B1F15)",
              lineHeight: 1.3,
            }}
          >
            {expense.description || (t("expense.noDescription") || "(sans description)")}
          </div>
          <div
            className="bmd-num"
            style={{
              fontFamily: "Cormorant Garamond, serif",
              fontSize: 32,
              fontWeight: 700,
              color: "var(--cocoa, #2B1F15)",
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1.1,
              marginTop: 4,
            }}
          >
            {formatAmount(amountNum, expense.currency)}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--cocoa-soft, #6B5B47)",
              marginTop: 2,
            }}
          >
            {formatLongDate(expense.occurredAt)}
          </div>
        </div>

        {/* === INFO META : split mode === */}
        <div
          style={{
            padding: "0 4px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <InfoRow label={t("expense.splitMode") || "Partage"}>
            {splitModeLabel(expense.splitMode, t)}
          </InfoRow>
        </div>

        {/* === PAYEUR(S) === */}
        <section>
          <div
            style={{
              fontSize: 11,
              letterSpacing: 1,
              textTransform: "uppercase",
              color: "var(--cocoa-mute, #A99580)",
              fontWeight: 700,
              marginBottom: 8,
              paddingLeft: 4,
            }}
          >
            {hasMultiPayers
              ? t("expense.payers") || "Payeurs"
              : t("expense.payer") || "Payeur"}
          </div>
          {hasMultiPayers ? (
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              {(expense.payers ?? []).map((p) => {
                const info = memberById.get(p.userId);
                const name = info?.displayName ?? "?";
                const isMe = p.userId === meId;
                const amountStr =
                  p.amount != null
                    ? formatAmount(p.amount, expense.currency)
                    : p.percent != null
                      ? `${p.percent.toFixed(1)} %`
                      : "—";
                return (
                  <li
                    key={p.userId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      background: "var(--paper, #FFFFFF)",
                      border:
                        "1px solid var(--v45-line, rgba(43,31,21,0.08))",
                      borderRadius: 12,
                    }}
                  >
                    <AvatarColored
                      userId={p.userId}
                      initials={name}
                      photoUrl={info?.avatar ?? null}
                      size={28}
                      paletteOverride={isMe ? "emerald" : undefined}
                    />
                    <span
                      style={{
                        flex: 1,
                        fontSize: 13,
                        color: "var(--cocoa, #2B1F15)",
                        fontWeight: 600,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {isMe ? t("group.youPaid") || "Toi" : name}
                    </span>
                    <span
                      className="bmd-num"
                      style={{
                        fontFamily: "Cormorant Garamond, serif",
                        fontSize: 15,
                        fontWeight: 700,
                        color: "var(--cocoa, #2B1F15)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {amountStr}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                background: "var(--paper, #FFFFFF)",
                border: "1px solid var(--v45-line, rgba(43,31,21,0.08))",
                borderRadius: 12,
              }}
            >
              <AvatarColored
                userId={expense.paidById ?? "__"}
                initials={payerName}
                photoUrl={payerAvatar}
                size={32}
                paletteOverride={isMyExpense ? "emerald" : undefined}
              />
              <span
                style={{
                  flex: 1,
                  fontSize: 14,
                  color: "var(--cocoa, #2B1F15)",
                  fontWeight: 600,
                }}
              >
                {isMyExpense ? t("group.youPaid") || "Toi" : payerName}
              </span>
              <span
                className="bmd-num"
                style={{
                  fontFamily: "Cormorant Garamond, serif",
                  fontSize: 15,
                  fontWeight: 700,
                  color: "var(--cocoa, #2B1F15)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatAmount(amountNum, expense.currency)}
              </span>
            </div>
          )}
        </section>

        {/* === PARTICIPANTS / PARTS === */}
        {shares.length > 0 && (
          <section>
            <div
              style={{
                fontSize: 11,
                letterSpacing: 1,
                textTransform: "uppercase",
                color: "var(--cocoa-mute, #A99580)",
                fontWeight: 700,
                marginBottom: 8,
                paddingLeft: 4,
              }}
            >
              {t("expense.participants") || "Participants"} (
              {shares.length})
            </div>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              {shares.map((s) => {
                const info = memberById.get(s.userId);
                const name = s.displayName ?? info?.displayName ?? "?";
                const isMe = s.userId === meId;
                return (
                  <li
                    key={s.userId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      background: "var(--paper, #FFFFFF)",
                      border:
                        "1px solid var(--v45-line, rgba(43,31,21,0.08))",
                      borderRadius: 12,
                    }}
                  >
                    <AvatarColored
                      userId={s.userId}
                      initials={name}
                      photoUrl={info?.avatar ?? null}
                      size={28}
                      paletteOverride={isMe ? "emerald" : undefined}
                    />
                    <span
                      style={{
                        flex: 1,
                        fontSize: 13,
                        color: "var(--cocoa, #2B1F15)",
                        fontWeight: 600,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {isMe ? t("expense.you") || "Toi" : name}
                    </span>
                    <span
                      className="bmd-num"
                      style={{
                        fontFamily: "Cormorant Garamond, serif",
                        fontSize: 14,
                        fontWeight: 700,
                        color: "var(--cocoa-soft, #6B5B47)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatAmount(s.amountOwed, expense.currency)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* === PIÈCES JOINTES (preuve de paiement) === */}
        <section>
          <div
            style={{
              fontSize: 11,
              letterSpacing: 1,
              textTransform: "uppercase",
              color: "var(--cocoa-mute, #A99580)",
              fontWeight: 700,
              marginBottom: 8,
              paddingLeft: 4,
            }}
          >
            {t("expense.attachments") || "Pièces jointes"}
          </div>
          {attLoading && (
            <div
              style={{
                padding: "12px 14px",
                fontSize: 13,
                color: "var(--cocoa-mute, #A99580)",
                fontStyle: "italic",
              }}
            >
              {t("common.loading") || "Chargement…"}
            </div>
          )}
          {!attLoading && attError && (
            <div
              style={{
                padding: "10px 12px",
                background:
                  "var(--v45-saffron-pale, rgba(232,163,61,0.08))",
                border: "1px solid var(--v45-saffron-soft, #E8C988)",
                borderRadius: 12,
                fontSize: 12,
                color: "var(--cocoa, #2B1F15)",
              }}
            >
              {attError}
            </div>
          )}
          {!attLoading && !attError && attachments.length === 0 && (
            <div
              style={{
                padding: "12px 14px",
                fontSize: 13,
                color: "var(--cocoa-mute, #A99580)",
                fontStyle: "italic",
                background: "var(--paper, #FFFFFF)",
                border:
                  "1px dashed var(--v45-line, rgba(43,31,21,0.12))",
                borderRadius: 12,
              }}
            >
              {t("expense.noAttachments") ||
                "Aucune preuve de paiement attachée."}
            </div>
          )}
          {!attLoading && !attError && attachments.length > 0 && (
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              {attachments.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenAttachment({
                        id: a.id,
                        fileName: a.fileName,
                        mimeType: a.mimeType,
                        kind: a.kind,
                        amount: expense.amount,
                        currency: expense.currency,
                        description: expense.description,
                        transcript: a.transcript ?? null,
                      })
                    }
                    className="bmd-tap"
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 12px",
                      background: "var(--paper, #FFFFFF)",
                      border:
                        "1px solid var(--v45-saffron-soft, #E8C988)",
                      borderRadius: 12,
                      cursor: "pointer",
                      textAlign: "left",
                      fontFamily: "inherit",
                      color: "var(--cocoa, #2B1F15)",
                      WebkitTapHighlightColor: "transparent",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 32,
                        height: 32,
                        borderRadius: 10,
                        background:
                          "var(--v45-saffron-pale, #F6E8C5)",
                        color: "var(--v45-saffron, #C58A2E)",
                        flexShrink: 0,
                      }}
                    >
                      <Icon
                        name={a.kind === "AUDIO_PROOF" ? "mic" : "paperclip"}
                        size={16}
                        strokeWidth={1.8}
                      />
                    </span>
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: "var(--cocoa, #2B1F15)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {a.fileName || t("expense.viewAttachment") || "Voir la pièce jointe"}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          color: "var(--v45-saffron, #C58A2E)",
                          fontWeight: 600,
                        }}
                      >
                        {t("expense.tapToOpen") || "Toucher pour ouvrir"}
                      </span>
                    </span>
                    <Icon
                      name="chevron-right"
                      size={16}
                      color="var(--cocoa-mute, #A99580)"
                      strokeWidth={1.8}
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </BottomSheet>
  );
}
