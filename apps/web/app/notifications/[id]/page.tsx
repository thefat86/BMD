"use client";

/**
 * Page /notifications/[id] · V98
 *
 * Page générique de détail/action pour TOUTES les notifications BMD.
 * Affiche le détail complet + propose les actions adaptées au `kind` :
 *
 *  Pour toutes les notifs (sauf NOTIF_RESPONSE) :
 *   - Réactions emoji rapides (👍 ❤️ 🔥 😬 🙏)
 *   - Réponse texte courte (max 280)
 *   - Accusé de réception simple ("Vu")
 *   - Bouton "Ouvrir le contexte" si link disponible
 *
 *  Actions spécifiques par kind (en plus des génériques) :
 *   - GROUP_INVITED       → Accepter/Refuser (renvoie sur /invite/[token])
 *   - SETTLEMENT_PROPOSED → "Confirmer le paiement" (renvoie sur règlement)
 *   - SWAP_PROPOSED       → "Valider le swap" / "Refuser"
 *   - DEBT_TRANSFER_*     → "Accepter le transfert" / "Refuser"
 *   - TONTINE_TURN_DUE    → "Cotiser maintenant"
 *   - MEETING_READY       → "Réviser & appliquer"
 *
 *  Pour NOTIF_RESPONSE (notif retour côté émetteur) :
 *   - Affiche qui a répondu quoi (emoji ou texte)
 *   - Bouton "Compris" qui acknowledge la notif
 *   - Lien vers la notif originale si applicable
 */

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { api, ApiError } from "../../../lib/api-client";

type ResponseKind = "ACK" | "EMOJI" | "TEXT";

interface NotificationDetail {
  id: string;
  userId: string;
  senderUserId: string | null;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  payload: any;
  readAt: string | null;
  createdAt: string;
  respondedAt: string | null;
  responseKind: ResponseKind | null;
  responseEmoji: string | null;
  responseText: string | null;
  acknowledgedAt: string | null;
  sender: { id: string; displayName: string; avatar: string | null } | null;
}

// Réactions emoji proposées (universelles, BMD-friendly)
const QUICK_REACTIONS = ["👍", "❤️", "🔥", "🙏", "😬", "👎"];

// Actions spécifiques par kind — chaque entry retourne un libellé et un
// path à pousser. Si null, on n'affiche pas le bouton spécifique
// (réactions génériques uniquement).
type SpecificAction = { label: string; path: string; tone: "primary" | "danger" };

function getSpecificActions(notif: NotificationDetail): SpecificAction[] {
  const p = notif.payload ?? {};
  switch (notif.kind) {
    case "GROUP_INVITED":
      if (p?.token) {
        return [
          {
            label: "Voir l'invitation",
            path: `/invite/${p.token}`,
            tone: "primary",
          },
        ];
      }
      if (p?.groupId) {
        return [
          {
            label: "Ouvrir le groupe",
            path: `/dashboard/groups/${p.groupId}`,
            tone: "primary",
          },
        ];
      }
      return [];
    case "SETTLEMENT_PROPOSED":
      // V172.D — Notifs RDD : actions inline gérées dans <DebtPaymentActionBlock>
      // ci-dessous. Ne pas renvoyer d'actions ici pour éviter le doublon visuel.
      if (p?.debtId && p?.scheduleId) return [];
      if (p?.groupId) {
        return [
          {
            label: "Confirmer le paiement",
            path: `/dashboard/groups/${p.groupId}?tab=settlements`,
            tone: "primary",
          },
        ];
      }
      return [];
    case "SETTLEMENT_CONFIRMED":
      if (p?.groupId) {
        return [
          {
            label: "Voir le règlement",
            path: `/dashboard/groups/${p.groupId}?tab=settlements`,
            tone: "primary",
          },
        ];
      }
      return [];
    case "SWAP_PROPOSED":
      if (p?.groupId) {
        return [
          {
            label: "Examiner le swap",
            path: `/dashboard/groups/${p.groupId}?tab=swaps`,
            tone: "primary",
          },
        ];
      }
      return [];
    case "DEBT_TRANSFER_PROPOSED":
      if (p?.groupId) {
        return [
          {
            label: "Voir le transfert",
            path: `/dashboard/groups/${p.groupId}?tab=transfers`,
            tone: "primary",
          },
        ];
      }
      return [];
    case "TONTINE_TURN_DUE":
    case "TONTINE_TURN_REMINDER":
      if (p?.groupId) {
        return [
          {
            label: "Cotiser maintenant",
            path: `/dashboard/groups/${p.groupId}?tab=tontine`,
            tone: "primary",
          },
        ];
      }
      return [];
    case "MEETING_READY":
      if (p?.groupId && p?.meetingId) {
        return [
          {
            label: "Réviser & appliquer",
            // V219.A — La route `/meetings/[meetingId]` n'existe pas en tant
            // que page dédiée. On envoie sur la page meetings du groupe avec
            // ?meetingId=... qui auto-sélectionne le meeting dans la liste
            // et ouvre le modal de revue.
            path: `/dashboard/groups/${p.groupId}/meetings?meetingId=${p.meetingId}`,
            tone: "primary",
          },
        ];
      }
      return [];
    default:
      // Pour les notifs informatives, on propose juste le link si défini.
      if (notif.link && notif.link.startsWith("/")) {
        return [{ label: "Ouvrir le contexte", path: notif.link, tone: "primary" }];
      }
      return [];
  }
}

// Libellés humains par kind (pour le hero)
const KIND_LABELS: Record<string, string> = {
  GROUP_INVITED: "Invitation à un groupe",
  MEMBER_JOINED: "Nouveau membre",
  EXPENSE_ADDED: "Nouvelle dépense",
  EXPENSE_UPDATED: "Dépense modifiée",
  EXPENSE_DELETED: "Dépense supprimée",
  SETTLEMENT_PROPOSED: "Règlement proposé",
  SETTLEMENT_CONFIRMED: "Règlement confirmé",
  TONTINE_CREATED: "Tontine créée",
  TONTINE_ACTIVATED: "Tontine activée",
  TONTINE_TURN_DUE: "Cotisation à faire",
  TONTINE_TURN_DISTRIBUTED: "Tour distribué",
  TONTINE_TURN_REMINDER: "Rappel de cotisation",
  SWAP_PROPOSED: "Swap proposé",
  SWAP_ACCEPTED: "Swap accepté",
  SWAP_REJECTED: "Swap refusé",
  DEBT_TRANSFER_PROPOSED: "Transfert de dette",
  DEBT_TRANSFER_ACCEPTED: "Transfert accepté",
  DEBT_TRANSFER_REJECTED: "Transfert refusé",
  ROLE_CHANGED: "Rôle modifié",
  GROUP_DELETED: "Groupe supprimé",
  ATTACHMENT_ADDED: "Pièce jointe ajoutée",
  NEW_DEVICE_LOGIN: "Nouvelle connexion",
  WEEKLY_SUMMARY: "Résumé hebdomadaire",
  MEETING_READY: "Réunion à valider",
  MEETING_APPLIED: "Décisions appliquées",
  NOTIF_RESPONSE: "Réponse reçue",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("fr-FR", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function NotificationDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";

  const [notif, setNotif] = useState<NotificationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [replyText, setReplyText] = useState("");
  const [showReply, setShowReply] = useState(false);
  const [sending, setSending] = useState<ResponseKind | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await api.getNotificationDetail(id);
      setNotif(r as NotificationDetail);
      // Auto mark as read au mount (sans bloquer le rendu)
      if (!r.readAt) {
        api.markNotificationRead(id).catch(() => {});
      }
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : (e as Error)?.message ?? "Notification introuvable";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function react(kind: ResponseKind, payload?: { emoji?: string; text?: string }) {
    if (!notif) return;
    setSending(kind);
    setFeedback(null);
    try {
      await api.respondToNotification(notif.id, {
        kind,
        emoji: payload?.emoji,
        text: payload?.text,
      });
      const human =
        kind === "EMOJI"
          ? `Réaction ${payload?.emoji} envoyée`
          : kind === "TEXT"
            ? "Réponse envoyée"
            : "Accusé de réception envoyé";
      setFeedback(`✓ ${human} — ${notif.sender?.displayName ?? "l'émetteur"} sera notifié.`);
      setReplyText("");
      setShowReply(false);
      await load();
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : (e as Error)?.message ?? "Échec";
      setFeedback(`❌ ${msg}`);
    } finally {
      setSending(null);
    }
  }

  async function ack() {
    if (!notif) return;
    setSending("ACK");
    setFeedback(null);
    try {
      await api.acknowledgeNotification(notif.id);
      setFeedback("✓ Notification fermée. Tu peux revenir aux autres.");
      await load();
      // Auto-back après 1s
      setTimeout(() => router.back(), 1000);
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : (e as Error)?.message ?? "Échec";
      setFeedback(`❌ ${msg}`);
    } finally {
      setSending(null);
    }
  }

  // === Rendu ===

  return (
    <main
      data-theme="v45-light"
      style={{
        minHeight: "100dvh",
        background:
          "linear-gradient(180deg, var(--paper, #FFFFFF) 0%, var(--ivory, #FBF6EC) 100%)",
        color: "var(--cocoa, #2B1F15)",
        padding: "20px 16px 40px",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div style={{ width: "100%", maxWidth: 540, margin: "0 auto" }}>
        {/* Header back */}
        <button
          type="button"
          onClick={() => router.back()}
          style={{
            padding: "8px 12px 8px 6px",
            borderRadius: 10,
            border: "none",
            background: "transparent",
            color: "var(--cocoa-soft, #6B5A47)",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            marginBottom: 12,
          }}
        >
          ← Retour
        </button>

        {loading && (
          <p
            style={{
              padding: "40px 0",
              textAlign: "center",
              color: "var(--cocoa-soft, #6B5A47)",
              fontSize: 13,
            }}
          >
            Chargement…
          </p>
        )}

        {!loading && error && (
          <div
            style={{
              padding: 16,
              background: "rgba(228,124,95,0.08)",
              border: "1px solid rgba(228,124,95,0.30)",
              borderRadius: 12,
              color: "#C44A3E",
              fontSize: 13,
              textAlign: "center",
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {!loading && notif && (
          <>
            {/* Hero */}
            <div
              style={{
                background: "var(--paper, #FFFFFF)",
                border: "1px solid var(--v45-line, rgba(43,31,21,0.08))",
                borderRadius: 18,
                padding: "22px 20px",
                boxShadow: "0 6px 20px rgba(43,31,21,0.05)",
                marginBottom: 14,
              }}
            >
              {/* Sender + kind label */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 12,
                }}
              >
                {notif.sender ? (
                  <span
                    aria-hidden
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 12,
                      background: "rgba(232,163,61,0.18)",
                      color: "var(--v45-saffron, #C58A2E)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 16,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {notif.sender.displayName.charAt(0).toUpperCase()}
                  </span>
                ) : (
                  <span
                    aria-hidden
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 12,
                      background: "rgba(43,31,21,0.06)",
                      color: "var(--cocoa-soft, #6B5A47)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 18,
                      flexShrink: 0,
                    }}
                  >
                    🔔
                  </span>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: 1.2,
                      color: "var(--v45-saffron, #C58A2E)",
                    }}
                  >
                    {KIND_LABELS[notif.kind] ?? notif.kind}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--cocoa-soft, #6B5A47)",
                      marginTop: 1,
                    }}
                  >
                    {notif.sender ? `De ${notif.sender.displayName} · ` : ""}
                    {formatDate(notif.createdAt)}
                  </div>
                </div>
              </div>

              {/* Titre + body */}
              <h1
                style={{
                  fontFamily: "Cormorant Garamond, serif",
                  fontSize: 24,
                  fontWeight: 700,
                  margin: "0 0 8px",
                  lineHeight: 1.2,
                  color: "var(--cocoa, #2B1F15)",
                }}
              >
                {notif.title}
              </h1>
              {notif.body && (
                <p
                  style={{
                    fontSize: 14,
                    lineHeight: 1.55,
                    margin: 0,
                    color: "var(--cocoa, #2B1F15)",
                    whiteSpace: "pre-line",
                  }}
                >
                  {notif.body}
                </p>
              )}
            </div>

            {/* Si c'est une NOTIF_RESPONSE, on affiche le contenu de la réponse + bouton Compris */}
            {notif.kind === "NOTIF_RESPONSE" ? (
              <NotifResponseSection
                notif={notif}
                acknowledgedAt={notif.acknowledgedAt}
                onAcknowledge={ack}
                acknowledging={sending === "ACK"}
                feedback={feedback}
                router={router}
              />
            ) : (
              <>
                {/* Si déjà répondu : afficher la réponse en lecture seule */}
                {notif.respondedAt && (
                  <div
                    style={{
                      padding: "12px 14px",
                      background: "rgba(125,197,158,0.10)",
                      border: "1px solid rgba(125,197,158,0.30)",
                      borderRadius: 12,
                      marginBottom: 14,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: 1,
                        color: "#3F8F65",
                        marginBottom: 4,
                      }}
                    >
                      ✓ Ta réponse — {formatDate(notif.respondedAt)}
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        color: "var(--cocoa, #2B1F15)",
                      }}
                    >
                      {notif.responseKind === "EMOJI" && (
                        <span style={{ fontSize: 24 }}>
                          {notif.responseEmoji}
                        </span>
                      )}
                      {notif.responseKind === "TEXT" && (
                        <span style={{ fontStyle: "italic" }}>
                          « {notif.responseText} »
                        </span>
                      )}
                      {notif.responseKind === "ACK" && (
                        <span style={{ color: "var(--cocoa-soft, #6B5A47)" }}>
                          Accusé de réception envoyé
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {feedback && (
                  <div
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      background: feedback.startsWith("✓")
                        ? "rgba(125,197,158,0.12)"
                        : "rgba(228,124,95,0.10)",
                      color: feedback.startsWith("✓") ? "#3F8F65" : "#C44A3E",
                      fontSize: 12.5,
                      lineHeight: 1.5,
                      marginBottom: 12,
                    }}
                  >
                    {feedback}
                  </div>
                )}

                {/* V172.D — Bloc d'actions inline pour notifs RDD paiement.
                    Permet au créancier de confirmer/refuser sans naviguer. */}
                <DebtPaymentActionBlock
                  notif={notif}
                  onDone={() => {
                    setFeedback(null);
                    void load();
                  }}
                />

                {/* Section actions spécifiques au kind */}
                {(() => {
                  const specificActions = getSpecificActions(notif);
                  if (specificActions.length === 0) return null;
                  return (
                    <div style={{ marginBottom: 18 }}>
                      <SectionTitle>Action recommandée</SectionTitle>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                        }}
                      >
                        {specificActions.map((a) => (
                          <button
                            key={a.path}
                            type="button"
                            onClick={() => router.push(a.path)}
                            style={{
                              padding: "13px 16px",
                              borderRadius: 12,
                              border: "none",
                              background:
                                a.tone === "danger"
                                  ? "linear-gradient(135deg, #C44A3E, #B5462E)"
                                  : "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--terracotta, #B5462E))",
                              color: "#FFFFFF",
                              fontWeight: 700,
                              fontSize: 14,
                              cursor: "pointer",
                              fontFamily: "inherit",
                              boxShadow:
                                "0 4px 12px rgba(197,138,46,0.20)",
                            }}
                          >
                            {a.label} →
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Réactions emoji rapides — disponibles sur toutes les notifs */}
                {notif.senderUserId && (
                  <div style={{ marginBottom: 18 }}>
                    <SectionTitle>Réagir</SectionTitle>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(6, 1fr)",
                        gap: 6,
                      }}
                    >
                      {QUICK_REACTIONS.map((emoji) => {
                        const isCurrent =
                          notif.responseKind === "EMOJI" &&
                          notif.responseEmoji === emoji;
                        const isSending =
                          sending === "EMOJI" && replyText === emoji; // approximation
                        return (
                          <button
                            key={emoji}
                            type="button"
                            disabled={sending !== null}
                            onClick={() => {
                              setReplyText(emoji);
                              void react("EMOJI", { emoji });
                            }}
                            style={{
                              padding: "12px 0",
                              borderRadius: 12,
                              border: isCurrent
                                ? "2px solid var(--v45-saffron, #C58A2E)"
                                : "1px solid var(--v45-line, rgba(43,31,21,0.10))",
                              background: isCurrent
                                ? "rgba(232,163,61,0.14)"
                                : "var(--paper, #FFFFFF)",
                              fontSize: 22,
                              cursor: sending !== null ? "wait" : "pointer",
                              fontFamily: "inherit",
                              opacity: isSending ? 0.5 : 1,
                              touchAction: "manipulation",
                            }}
                          >
                            {emoji}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Réponse texte — disponible si sender connu */}
                {notif.senderUserId && (
                  <div style={{ marginBottom: 18 }}>
                    <SectionTitle>Répondre par un message</SectionTitle>
                    {!showReply ? (
                      <button
                        type="button"
                        onClick={() => setShowReply(true)}
                        style={{
                          width: "100%",
                          padding: "12px 14px",
                          borderRadius: 12,
                          border:
                            "1px dashed var(--v45-line, rgba(43,31,21,0.15))",
                          background: "transparent",
                          color: "var(--cocoa-soft, #6B5A47)",
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          textAlign: "left",
                        }}
                      >
                        💬 Écrire une réponse…
                      </button>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <textarea
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value.slice(0, 280))}
                          rows={3}
                          placeholder="Ta réponse en quelques mots…"
                          style={{
                            width: "100%",
                            padding: "12px 14px",
                            background: "var(--ivory, #FBF6EC)",
                            border:
                              "1px solid var(--v45-line, rgba(43,31,21,0.12))",
                            borderRadius: 11,
                            fontSize: 14,
                            fontFamily: "inherit",
                            color: "var(--cocoa, #2B1F15)",
                            resize: "vertical",
                            outline: "none",
                            minHeight: 80,
                          }}
                        />
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            alignItems: "center",
                          }}
                        >
                          <span
                            style={{
                              fontSize: 11,
                              color: "var(--cocoa-soft, #6B5A47)",
                              flex: 1,
                            }}
                          >
                            {replyText.length} / 280
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setShowReply(false);
                              setReplyText("");
                            }}
                            disabled={sending !== null}
                            style={{
                              padding: "8px 14px",
                              borderRadius: 10,
                              border:
                                "1px solid var(--v45-line, rgba(43,31,21,0.15))",
                              background: "transparent",
                              color: "var(--cocoa, #2B1F15)",
                              fontSize: 12.5,
                              fontWeight: 600,
                              cursor: "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            Annuler
                          </button>
                          <button
                            type="button"
                            disabled={
                              sending !== null || replyText.trim().length === 0
                            }
                            onClick={() =>
                              void react("TEXT", { text: replyText.trim() })
                            }
                            style={{
                              padding: "8px 16px",
                              borderRadius: 10,
                              border: "none",
                              background:
                                replyText.trim().length === 0
                                  ? "var(--ivory, #FBF6EC)"
                                  : "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--terracotta, #B5462E))",
                              color:
                                replyText.trim().length === 0
                                  ? "var(--cocoa-soft, #6B5A47)"
                                  : "#FFFFFF",
                              fontSize: 12.5,
                              fontWeight: 700,
                              cursor:
                                sending !== null ||
                                replyText.trim().length === 0
                                  ? "not-allowed"
                                  : "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            {sending === "TEXT" ? "Envoi…" : "Envoyer"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Bouton ACK simple (« Vu, merci ») */}
                {notif.senderUserId && !notif.respondedAt && (
                  <button
                    type="button"
                    onClick={() => void react("ACK")}
                    disabled={sending !== null}
                    style={{
                      width: "100%",
                      padding: "11px 14px",
                      borderRadius: 11,
                      border: "1px solid var(--v45-line, rgba(43,31,21,0.15))",
                      background: "var(--paper, #FFFFFF)",
                      color: "var(--cocoa, #2B1F15)",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: sending !== null ? "wait" : "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {sending === "ACK"
                      ? "Envoi…"
                      : "👁 Marquer comme vu (envoie un accusé)"}
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 1.3,
        color: "var(--v45-saffron, #C58A2E)",
        marginBottom: 8,
        paddingLeft: 4,
      }}
    >
      {children}
    </div>
  );
}

// ============================================================
// Section dédiée pour NOTIF_RESPONSE (notif retour côté émetteur)
// ============================================================

function NotifResponseSection({
  notif,
  acknowledgedAt,
  onAcknowledge,
  acknowledging,
  feedback,
  router,
}: {
  notif: NotificationDetail;
  acknowledgedAt: string | null;
  onAcknowledge: () => void | Promise<void>;
  acknowledging: boolean;
  feedback: string | null;
  router: ReturnType<typeof useRouter>;
}) {
  const p = notif.payload ?? {};
  const responder = p?.responder;
  const responseKind = p?.responseKind as ResponseKind | undefined;
  const emoji = p?.responseEmoji as string | undefined;
  const text = p?.responseText as string | undefined;
  const originalLink = p?.originalLink as string | undefined;

  return (
    <>
      {/* Carte de la réponse */}
      <div
        style={{
          padding: "16px 18px",
          background:
            "linear-gradient(135deg, rgba(232,163,61,0.06), rgba(125,197,158,0.04))",
          border: "1px solid rgba(232,163,61,0.20)",
          borderRadius: 14,
          marginBottom: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 10,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              background: "var(--v45-saffron, #C58A2E)",
              color: "#FFFFFF",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {(responder?.displayName ?? "?").charAt(0).toUpperCase()}
          </span>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "var(--cocoa, #2B1F15)",
              }}
            >
              {responder?.displayName ?? "Quelqu'un"}
            </div>
            <div
              style={{
                fontSize: 11.5,
                color: "var(--cocoa-soft, #6B5A47)",
              }}
            >
              a répondu à ton message
            </div>
          </div>
        </div>

        {/* Contenu de la réponse */}
        <div
          style={{
            padding: "14px 16px",
            background: "var(--paper, #FFFFFF)",
            border: "1px solid var(--v45-line, rgba(43,31,21,0.08))",
            borderRadius: 12,
            textAlign: "center",
          }}
        >
          {responseKind === "EMOJI" && (
            <div style={{ fontSize: 48, lineHeight: 1 }}>{emoji}</div>
          )}
          {responseKind === "TEXT" && (
            <div
              style={{
                fontSize: 15,
                lineHeight: 1.55,
                fontStyle: "italic",
                color: "var(--cocoa, #2B1F15)",
              }}
            >
              « {text} »
            </div>
          )}
          {responseKind === "ACK" && (
            <div
              style={{
                fontSize: 14,
                color: "var(--cocoa-soft, #6B5A47)",
              }}
            >
              👁 Accusé de réception · « Vu, merci »
            </div>
          )}
        </div>
      </div>

      {feedback && (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            background: feedback.startsWith("✓")
              ? "rgba(125,197,158,0.12)"
              : "rgba(228,124,95,0.10)",
            color: feedback.startsWith("✓") ? "#3F8F65" : "#C44A3E",
            fontSize: 12.5,
            lineHeight: 1.5,
            marginBottom: 12,
          }}
        >
          {feedback}
        </div>
      )}

      {acknowledgedAt ? (
        <div
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            background: "var(--ivory, #FBF6EC)",
            border: "1px solid var(--v45-line, rgba(43,31,21,0.08))",
            color: "var(--cocoa-soft, #6B5A47)",
            fontSize: 13,
            textAlign: "center",
          }}
        >
          ✓ Fermé le {formatDate(acknowledgedAt)}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void onAcknowledge()}
          disabled={acknowledging}
          style={{
            width: "100%",
            padding: "14px 16px",
            borderRadius: 12,
            border: "none",
            background:
              "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--terracotta, #B5462E))",
            color: "#FFFFFF",
            fontWeight: 700,
            fontSize: 14,
            cursor: acknowledging ? "wait" : "pointer",
            fontFamily: "inherit",
            boxShadow: "0 4px 12px rgba(197,138,46,0.25)",
            opacity: acknowledging ? 0.7 : 1,
          }}
        >
          {acknowledging ? "Fermeture…" : "Compris ✓"}
        </button>
      )}

      {originalLink && originalLink.startsWith("/") && (
        <button
          type="button"
          onClick={() => router.push(originalLink)}
          style={{
            width: "100%",
            marginTop: 10,
            padding: "11px 14px",
            borderRadius: 11,
            border: "1px solid var(--v45-line, rgba(43,31,21,0.15))",
            background: "var(--paper, #FFFFFF)",
            color: "var(--cocoa, #2B1F15)",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Voir le contexte original →
        </button>
      )}
    </>
  );
}

/**
 * V172.D — Bloc d'actions inline pour les notifications RDD paiement.
 *
 * Détecte les notifs SETTLEMENT_PROPOSED avec payload {debtId, scheduleId}
 * et affiche des boutons d'action directs adaptés au scénario :
 *
 *  - direction "DEBTOR_DECLARED_PAYMENT" : le créancier voit
 *    "J'ai bien reçu" (vert) + "Je n'ai pas reçu" (rouge, soft)
 *  - direction "CREDITOR_REJECTED_DECLARATION" : le débiteur voit
 *    un bandeau + lien "Ouvrir la RDD" pour redéclarer.
 *  - directions "CREDITOR_CONFIRMED_*" : juste un bandeau de feedback,
 *    pas d'action requise.
 */
function DebtPaymentActionBlock({
  notif,
  onDone,
}: {
  notif: NotificationDetail;
  onDone: () => void;
}): JSX.Element | null {
  const router = useRouter();
  const p = notif.payload ?? {};
  const [loading, setLoading] = useState<null | "CONFIRM" | "REJECT">(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  if (notif.kind !== "SETTLEMENT_PROPOSED") return null;
  if (!p?.debtId || !p?.scheduleId) return null;

  const debtId = String(p.debtId);
  const scheduleId = String(p.scheduleId);
  const direction = String(p.direction ?? "DEBTOR_DECLARED_PAYMENT");
  const amount = Number(p.amount ?? 0);
  const currency = String(p.currency ?? "EUR");
  const amountStr = amount > 0
    ? `${amount.toFixed(2).replace(".", ",")} ${currency === "EUR" ? "€" : currency}`
    : "";

  // Si l'action a déjà été acquittée, on masque le bloc.
  if (notif.acknowledgedAt) {
    return (
      <div
        style={{
          marginBottom: 18,
          padding: 12,
          background: "rgba(31,122,87,0.10)",
          border: "1px solid rgba(31,122,87,0.30)",
          borderRadius: 12,
          color: "#0F6E56",
          fontSize: 12.5,
          textAlign: "center",
        }}
      >
        ✓ Action déjà effectuée
      </div>
    );
  }

  async function handleConfirm() {
    setLoading("CONFIRM");
    setError(null);
    try {
      await api.confirmDebtSchedulePayment(debtId, scheduleId);
      await api.acknowledgeNotification(notif.id).catch(() => undefined);
      setSuccess("✓ Paiement confirmé. L'échéance est soldée et le débiteur est notifié.");
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  }

  async function handleReject() {
    setLoading("REJECT");
    setError(null);
    try {
      await api.rejectDebtSchedulePayment(debtId, scheduleId, {
        reason: rejectReason.trim() || undefined,
      });
      await api.acknowledgeNotification(notif.id).catch(() => undefined);
      setSuccess(
        "Déclaration rejetée. Le débiteur sera notifié pour clarifier la situation.",
      );
      setShowRejectForm(false);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  }

  // Scénario 1 : débiteur a déclaré → créancier voit 2 boutons (confirm / reject)
  if (direction === "DEBTOR_DECLARED_PAYMENT") {
    return (
      <div style={{ marginBottom: 18 }}>
        <SectionTitle>Que veux-tu faire ?</SectionTitle>
        <div
          style={{
            padding: 14,
            background:
              "linear-gradient(135deg, rgba(197,138,46,0.10), rgba(197,138,46,0.04))",
            border: "1px solid rgba(197,138,46,0.30)",
            borderRadius: 14,
            marginBottom: 10,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "#854F0B",
              letterSpacing: 1.2,
              textTransform: "uppercase",
              fontWeight: 700,
              marginBottom: 4,
            }}
          >
            Paiement en attente de confirmation
          </div>
          <div
            style={{
              fontSize: 13,
              color: "#2B1F15",
              lineHeight: 1.5,
            }}
          >
            {notif.sender?.displayName ?? "Le débiteur"} déclare avoir
            payé{amountStr ? ` ${amountStr}` : ""}. Confirme uniquement
            si tu as bien reçu les fonds. En cas de doute, refuse pour
            demander une clarification.
          </div>
        </div>

        {success && (
          <div
            style={{
              marginBottom: 10,
              padding: 10,
              background: "rgba(31,122,87,0.10)",
              border: "1px solid rgba(31,122,87,0.30)",
              borderRadius: 10,
              color: "#0F6E56",
              fontSize: 12.5,
            }}
          >
            {success}
          </div>
        )}

        {error && (
          <div
            style={{
              marginBottom: 10,
              padding: 10,
              background: "rgba(159,70,40,0.10)",
              border: "1px solid rgba(159,70,40,0.30)",
              borderRadius: 10,
              color: "#9F4628",
              fontSize: 12.5,
            }}
          >
            {error}
          </div>
        )}

        {!showRejectForm ? (
          <div style={{ display: "grid", gap: 8 }}>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading !== null}
              style={{
                width: "100%",
                padding: "13px 16px",
                borderRadius: 12,
                border: "none",
                background:
                  loading === "CONFIRM"
                    ? "rgba(31,122,87,0.45)"
                    : "linear-gradient(135deg, #1F7A57, #0F6E56)",
                color: "#FFFFFF",
                fontSize: 14.5,
                fontWeight: 700,
                cursor: loading !== null ? "wait" : "pointer",
                fontFamily: "inherit",
                boxShadow: "0 4px 12px rgba(31,122,87,0.25)",
              }}
            >
              {loading === "CONFIRM"
                ? "Confirmation…"
                : `✓ J'ai bien reçu${amountStr ? " · " + amountStr : ""}`}
            </button>
            <button
              type="button"
              onClick={() => setShowRejectForm(true)}
              disabled={loading !== null}
              style={{
                width: "100%",
                padding: "11px 16px",
                borderRadius: 12,
                border: "1px solid rgba(159,70,40,0.35)",
                background: "rgba(159,70,40,0.06)",
                color: "#9F4628",
                fontSize: 13.5,
                fontWeight: 600,
                cursor: loading !== null ? "wait" : "pointer",
                fontFamily: "inherit",
              }}
            >
              Je n'ai pas reçu ce paiement
            </button>
          </div>
        ) : (
          <div
            style={{
              padding: 12,
              background: "rgba(159,70,40,0.06)",
              border: "1px solid rgba(159,70,40,0.20)",
              borderRadius: 12,
            }}
          >
            <div
              style={{
                fontSize: 12,
                color: "#6B5A47",
                marginBottom: 6,
                fontWeight: 600,
              }}
            >
              Précise le motif (optionnel)
            </div>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Ex : Aucun virement reçu sur mon compte, montant incorrect, etc."
              rows={3}
              style={{
                width: "100%",
                padding: 10,
                fontSize: 13,
                border: "1px solid rgba(43,31,21,0.18)",
                borderRadius: 10,
                background: "#FFFFFF",
                fontFamily: "inherit",
                color: "#2B1F15",
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button
                type="button"
                onClick={handleReject}
                disabled={loading !== null}
                style={{
                  flex: 1,
                  padding: "11px 14px",
                  borderRadius: 11,
                  border: "none",
                  background:
                    loading === "REJECT"
                      ? "rgba(159,70,40,0.45)"
                      : "#9F4628",
                  color: "#FFFFFF",
                  fontSize: 13.5,
                  fontWeight: 700,
                  cursor: loading !== null ? "wait" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                {loading === "REJECT"
                  ? "Envoi…"
                  : "Envoyer le refus"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowRejectForm(false);
                  setRejectReason("");
                }}
                disabled={loading !== null}
                style={{
                  padding: "11px 14px",
                  borderRadius: 11,
                  border: "1px solid rgba(43,31,21,0.18)",
                  background: "transparent",
                  color: "#6B5A47",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: loading !== null ? "wait" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => router.push(`/dashboard/debts/${debtId}`)}
          style={{
            width: "100%",
            marginTop: 10,
            padding: "10px 14px",
            borderRadius: 11,
            border: "1px solid rgba(43,31,21,0.12)",
            background: "transparent",
            color: "#6B5A47",
            fontSize: 12.5,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Voir le détail de la RDD →
        </button>
      </div>
    );
  }

  // Scénario 2 : créancier a rejeté → débiteur doit redéclarer
  if (direction === "CREDITOR_REJECTED_DECLARATION") {
    return (
      <div style={{ marginBottom: 18 }}>
        <SectionTitle>Action à prendre</SectionTitle>
        <div
          style={{
            padding: 14,
            background:
              "linear-gradient(135deg, rgba(159,70,40,0.10), rgba(159,70,40,0.04))",
            border: "1px solid rgba(159,70,40,0.30)",
            borderRadius: 14,
            marginBottom: 10,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "#9F4628",
              letterSpacing: 1.2,
              textTransform: "uppercase",
              fontWeight: 700,
              marginBottom: 4,
            }}
          >
            Paiement non confirmé
          </div>
          <div
            style={{
              fontSize: 13,
              color: "#2B1F15",
              lineHeight: 1.5,
            }}
          >
            Le créancier n'a pas confirmé ta déclaration. Vérifie ton
            paiement (référence, montant, date) puis redéclare ou
            contacte-le pour clarifier.
            {p.reason ? (
              <div
                style={{
                  marginTop: 6,
                  padding: 8,
                  background: "#FFFFFF",
                  borderRadius: 8,
                  fontSize: 12,
                  fontStyle: "italic",
                  color: "#6B5A47",
                }}
              >
                « {String(p.reason)} »
              </div>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => router.push(`/dashboard/debts/${debtId}`)}
          style={{
            width: "100%",
            padding: "13px 16px",
            borderRadius: 12,
            border: "none",
            background:
              "linear-gradient(135deg, var(--v45-saffron, #C58A2E), #B5462E)",
            color: "#FFFFFF",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Ouvrir la RDD pour clarifier →
        </button>
      </div>
    );
  }

  // Scénario 3 : confirmations (le destinataire est informé, pas d'action)
  return (
    <div style={{ marginBottom: 18 }}>
      <div
        style={{
          padding: 12,
          background: "rgba(31,122,87,0.10)",
          border: "1px solid rgba(31,122,87,0.30)",
          borderRadius: 12,
          color: "#0F6E56",
          fontSize: 12.5,
          lineHeight: 1.5,
        }}
      >
        ✓ {direction === "CREDITOR_CONFIRMED_RECEIPT"
          ? "Réception confirmée par le créancier. L'échéance est soldée."
          : "Ta déclaration a été validée. L'échéance est soldée."}
      </div>
      <button
        type="button"
        onClick={() => router.push(`/dashboard/debts/${debtId}`)}
        style={{
          width: "100%",
          marginTop: 10,
          padding: "10px 14px",
          borderRadius: 11,
          border: "1px solid rgba(43,31,21,0.12)",
          background: "transparent",
          color: "#6B5A47",
          fontSize: 12.5,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        Voir le détail de la RDD →
      </button>
    </div>
  );
}
