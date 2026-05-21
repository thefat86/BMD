"use client";

/**
 * Page /invite/[token] · V97
 *
 * Page d'acceptation/refus pour les invitations nominatives. Accessible
 * sans être connecté (lookup public via le token). Selon l'état :
 *
 *  - PENDING + non connecté → CTA « Accepter » envoie sur /login avec
 *    `next=/invite/{token}` ; CTA « Refuser » disponible direct.
 *  - PENDING + connecté → 2 boutons Accepter / Décliner. Si Décliner :
 *    on déplie un champ motif (15 chars min) avant confirmation.
 *  - ACCEPTED / DECLINED / EXPIRED / REVOKED → message clair adapté.
 *
 * Design : V45-light (saffron + cocoa + ivory).
 */

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { api, getToken, ApiError } from "../../../lib/api-client";

type Status = "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "REVOKED";

interface Invitation {
  id: string;
  status: Status;
  contactType: "PHONE" | "EMAIL";
  contactValue: string;
  displayName: string | null;
  expiresAt: string;
  declineReason: string | null;
  group: {
    id: string;
    name: string;
    type: string;
    defaultCurrency: string;
  };
  invitedBy: { displayName: string; avatar: string | null };
}

const DECLINE_REASON_MIN = 15;

export default function InvitePage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";

  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [accepting, setAccepting] = useState(false);
  const [showDeclineForm, setShowDeclineForm] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [declining, setDeclining] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Charge l'invitation au mount
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getInvitationByToken(token)
      .then((inv) => {
        if (cancelled) return;
        setInvitation(inv);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(
          e instanceof ApiError
            ? e.message
            : (e as Error)?.message ?? "Lien invalide ou expiré",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleAccept() {
    if (!invitation) return;
    setError(null);
    setActionFeedback(null);
    // Pas connecté → on envoie vers le login avec retour ici
    if (!getToken()) {
      const next = `/invite/${encodeURIComponent(token)}`;
      // On préfille le contact pour aider le user à se connecter avec le bon
      const prefill =
        invitation.contactType === "EMAIL"
          ? `&prefillEmail=${encodeURIComponent(invitation.contactValue)}`
          : `&prefillPhone=${encodeURIComponent(invitation.contactValue)}`;
      router.push(`/login?next=${encodeURIComponent(next)}${prefill}`);
      return;
    }
    setAccepting(true);
    try {
      const result = await api.acceptInvitation(token);
      setActionFeedback(
        result.alreadyMember
          ? `Tu fais déjà partie de « ${invitation.group.name} » ✨`
          : `Bienvenue dans « ${invitation.group.name} » 🎉`,
      );
      // Re-fetch pour mettre à jour le statut
      try {
        const updated = await api.getInvitationByToken(token);
        setInvitation(updated);
      } catch {
        // pas grave
      }
      // Redirection vers le groupe après 1.5s
      setTimeout(() => {
        router.push(`/dashboard/groups/${invitation.group.id}`);
      }, 1500);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.tip
            ? `${e.message}\n${e.tip}`
            : e.message
          : (e as Error)?.message;
      setError(msg ?? "Acceptation impossible");
    } finally {
      setAccepting(false);
    }
  }

  async function handleDecline() {
    if (!invitation) return;
    setError(null);
    if (declineReason.trim().length < DECLINE_REASON_MIN) {
      setError(
        `Merci d'expliquer brièvement pourquoi tu refuses (${DECLINE_REASON_MIN} caractères min).`,
      );
      return;
    }
    setDeclining(true);
    try {
      await api.declineInvitation(token, declineReason.trim());
      setActionFeedback("Merci, l'invitation a bien été déclinée.");
      // Refresh status
      try {
        const updated = await api.getInvitationByToken(token);
        setInvitation(updated);
      } catch {
        /* ignore */
      }
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.tip
            ? `${e.message}\n${e.tip}`
            : e.message
          : (e as Error)?.message;
      setError(msg ?? "Refus impossible");
    } finally {
      setDeclining(false);
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
        padding: "32px 20px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 460,
          background: "var(--paper, #FFFFFF)",
          border: "1px solid var(--v45-line, rgba(43,31,21,0.08))",
          borderRadius: 18,
          padding: "28px 22px",
          boxShadow: "0 10px 30px rgba(43,31,21,0.06)",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <header style={{ textAlign: "center", marginBottom: 18 }}>
          <div
            style={{
              fontFamily: "Cormorant Garamond, serif",
              fontSize: 26,
              fontWeight: 700,
              color: "var(--v45-saffron, #C58A2E)",
              letterSpacing: 0.5,
            }}
          >
            BMD
          </div>
          <div
            style={{
              fontSize: 10,
              color: "var(--cocoa-soft, #6B5A47)",
              letterSpacing: 2,
              textTransform: "uppercase",
              marginTop: 2,
            }}
          >
            Back Mes Do
          </div>
        </header>

        {loading && (
          <p
            style={{
              textAlign: "center",
              color: "var(--cocoa-soft, #6B5A47)",
              fontSize: 13,
              padding: "20px 0",
            }}
          >
            Chargement de l'invitation…
          </p>
        )}

        {!loading && error && !invitation && (
          <ErrorCard message={error} />
        )}

        {!loading && invitation && (
          <>
            {/* Hero "X t'invite à Y" */}
            <div style={{ textAlign: "center", marginBottom: 22 }}>
              <p
                style={{
                  fontSize: 13.5,
                  color: "var(--cocoa-soft, #6B5A47)",
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                <strong style={{ color: "var(--cocoa, #2B1F15)" }}>
                  {invitation.invitedBy.displayName}
                </strong>{" "}
                t'invite à rejoindre
              </p>
              <h1
                style={{
                  fontFamily: "Cormorant Garamond, serif",
                  fontSize: 28,
                  fontWeight: 700,
                  margin: "8px 0 4px",
                  lineHeight: 1.15,
                  color: "var(--cocoa, #2B1F15)",
                }}
              >
                {invitation.group.name}
              </h1>
              <p
                style={{
                  fontSize: 12,
                  color: "var(--cocoa-soft, #6B5A47)",
                  margin: 0,
                }}
              >
                Groupe {invitation.group.type.toLowerCase()} ·{" "}
                {invitation.group.defaultCurrency}
              </p>
            </div>

            {/* PENDING — actions */}
            {invitation.status === "PENDING" && (
              <>
                <p
                  style={{
                    fontSize: 13,
                    lineHeight: 1.6,
                    color: "var(--cocoa, #2B1F15)",
                    background: "var(--ivory, #FBF6EC)",
                    border:
                      "1px solid var(--v45-line, rgba(43,31,21,0.08))",
                    borderRadius: 12,
                    padding: "12px 14px",
                    margin: "0 0 18px",
                  }}
                >
                  Avec BMD, vous allez pouvoir gérer ensemble vos dépenses
                  partagées, tontines et règlements — sans prise de tête.
                  Acceptes-tu de rejoindre&nbsp;?
                </p>

                {error && <ErrorBanner message={error} />}
                {actionFeedback && <SuccessBanner message={actionFeedback} />}

                {!showDeclineForm && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 10,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setShowDeclineForm(true);
                        setError(null);
                      }}
                      disabled={accepting}
                      style={{
                        padding: "14px 14px",
                        borderRadius: 12,
                        border:
                          "1px solid var(--v45-line, rgba(43,31,21,0.15))",
                        background: "transparent",
                        color: "var(--cocoa, #2B1F15)",
                        fontWeight: 600,
                        fontSize: 14,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      Refuser
                    </button>
                    <button
                      type="button"
                      onClick={handleAccept}
                      disabled={accepting}
                      style={{
                        padding: "14px 14px",
                        borderRadius: 12,
                        border: "none",
                        background:
                          "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--terracotta, #B5462E))",
                        color: "#FFFFFF",
                        fontWeight: 700,
                        fontSize: 14,
                        cursor: accepting ? "wait" : "pointer",
                        fontFamily: "inherit",
                        boxShadow:
                          "0 4px 12px rgba(197,138,46,0.25)",
                        opacity: accepting ? 0.7 : 1,
                      }}
                    >
                      {accepting ? "Acceptation…" : "Accepter 🙌"}
                    </button>
                  </div>
                )}

                {showDeclineForm && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <label
                      style={{
                        fontSize: 12.5,
                        fontWeight: 700,
                        color: "var(--cocoa, #2B1F15)",
                      }}
                    >
                      Peux-tu expliquer brièvement pourquoi&nbsp;?
                    </label>
                    <textarea
                      value={declineReason}
                      onChange={(e) => {
                        setDeclineReason(e.target.value);
                        setError(null);
                      }}
                      rows={3}
                      placeholder={`Ex : « Pas le bon contact, c'est mon frère qui devait être invité » (${DECLINE_REASON_MIN} caractères min)`}
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
                        fontSize: 11,
                        color:
                          declineReason.trim().length >= DECLINE_REASON_MIN
                            ? "#7DC59E"
                            : "var(--cocoa-soft, #6B5A47)",
                        textAlign: "right",
                      }}
                    >
                      {declineReason.trim().length} / {DECLINE_REASON_MIN}
                    </div>

                    {error && <ErrorBanner message={error} />}

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 10,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setShowDeclineForm(false);
                          setDeclineReason("");
                          setError(null);
                        }}
                        disabled={declining}
                        style={{
                          padding: "12px 14px",
                          borderRadius: 11,
                          border:
                            "1px solid var(--v45-line, rgba(43,31,21,0.15))",
                          background: "transparent",
                          color: "var(--cocoa, #2B1F15)",
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        Annuler
                      </button>
                      <button
                        type="button"
                        onClick={handleDecline}
                        disabled={
                          declining ||
                          declineReason.trim().length < DECLINE_REASON_MIN
                        }
                        style={{
                          padding: "12px 14px",
                          borderRadius: 11,
                          border: "none",
                          background:
                            "linear-gradient(135deg, #C44A3E, #B5462E)",
                          color: "#FFFFFF",
                          fontWeight: 700,
                          fontSize: 13,
                          cursor:
                            declining ||
                            declineReason.trim().length < DECLINE_REASON_MIN
                              ? "not-allowed"
                              : "pointer",
                          fontFamily: "inherit",
                          opacity:
                            declining ||
                            declineReason.trim().length < DECLINE_REASON_MIN
                              ? 0.5
                              : 1,
                        }}
                      >
                        {declining ? "Envoi…" : "Confirmer le refus"}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* États terminaux */}
            {invitation.status === "ACCEPTED" && (
              <StatusCard
                tone="success"
                title="Tu fais partie du groupe 🎉"
                body={`Bienvenue dans « ${invitation.group.name} » ! Tu peux maintenant ajouter des dépenses, voir qui doit quoi et régler en un clic.`}
                ctaLabel="Ouvrir le groupe"
                onCta={() =>
                  router.push(`/dashboard/groups/${invitation.group.id}`)
                }
              />
            )}

            {invitation.status === "DECLINED" && (
              <StatusCard
                tone="info"
                title="Invitation déclinée"
                body={
                  invitation.declineReason
                    ? `Motif transmis à ${invitation.invitedBy.displayName} : « ${invitation.declineReason} »`
                    : "L'admin du groupe a été informé."
                }
              />
            )}

            {invitation.status === "EXPIRED" && (
              <StatusCard
                tone="warning"
                title="Cette invitation a expiré"
                body={`Plus de 30 jours se sont écoulés. Demande à ${invitation.invitedBy.displayName} de t'en renvoyer une nouvelle.`}
              />
            )}

            {invitation.status === "REVOKED" && (
              <StatusCard
                tone="warning"
                title="Invitation annulée"
                body={`${invitation.invitedBy.displayName} a annulé cette invitation. Si c'est une erreur, contacte-le directement.`}
              />
            )}
          </>
        )}

        {/* Footer / signature */}
        <p
          style={{
            marginTop: 22,
            textAlign: "center",
            fontSize: 10.5,
            color: "var(--cocoa-soft, #6B5A47)",
            opacity: 0.7,
            letterSpacing: 0.4,
          }}
        >
          L'argent partagé. L'amitié protégée.
        </p>
      </div>
    </main>
  );
}

// ============================================================
// Composants utilitaires (déclarés in-file pour simplicité)
// ============================================================

function ErrorCard({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: 16,
        background: "rgba(228,124,95,0.08)",
        border: "1px solid rgba(228,124,95,0.30)",
        borderRadius: 12,
        color: "#C44A3E",
        fontSize: 13,
        lineHeight: 1.5,
        textAlign: "center",
        whiteSpace: "pre-line",
      }}
    >
      <div style={{ fontSize: 24, marginBottom: 6 }}>⚠️</div>
      {message}
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        background: "rgba(228,124,95,0.08)",
        border: "1px solid rgba(228,124,95,0.25)",
        borderRadius: 10,
        color: "#C44A3E",
        fontSize: 12.5,
        lineHeight: 1.5,
        marginBottom: 10,
        whiteSpace: "pre-line",
      }}
    >
      {message}
    </div>
  );
}

function SuccessBanner({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        background: "rgba(125,197,158,0.12)",
        border: "1px solid rgba(125,197,158,0.35)",
        borderRadius: 10,
        color: "#3F8F65",
        fontSize: 12.5,
        lineHeight: 1.5,
        marginBottom: 10,
      }}
    >
      ✓ {message}
    </div>
  );
}

function StatusCard({
  tone,
  title,
  body,
  ctaLabel,
  onCta,
}: {
  tone: "success" | "info" | "warning";
  title: string;
  body: string;
  ctaLabel?: string;
  onCta?: () => void;
}) {
  const colors =
    tone === "success"
      ? { bg: "rgba(125,197,158,0.10)", border: "rgba(125,197,158,0.35)", text: "#3F8F65" }
      : tone === "warning"
        ? { bg: "rgba(232,163,61,0.10)", border: "rgba(232,163,61,0.35)", text: "#C58A2E" }
        : { bg: "var(--ivory, #FBF6EC)", border: "rgba(43,31,21,0.10)", text: "var(--cocoa, #2B1F15)" };
  return (
    <div
      style={{
        padding: "18px 16px",
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: 14,
        color: colors.text,
        textAlign: "center",
      }}
    >
      <h2
        style={{
          fontFamily: "Cormorant Garamond, serif",
          fontSize: 20,
          fontWeight: 700,
          margin: "0 0 6px",
        }}
      >
        {title}
      </h2>
      <p style={{ fontSize: 13, lineHeight: 1.55, margin: 0 }}>{body}</p>
      {ctaLabel && onCta && (
        <button
          type="button"
          onClick={onCta}
          style={{
            marginTop: 14,
            padding: "11px 18px",
            borderRadius: 11,
            border: "none",
            background:
              "linear-gradient(135deg, var(--v45-saffron, #C58A2E), var(--terracotta, #B5462E))",
            color: "#FFFFFF",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {ctaLabel}
        </button>
      )}
    </div>
  );
}
