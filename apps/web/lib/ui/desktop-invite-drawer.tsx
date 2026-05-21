"use client";

/**
 * V215.D1 + D2 + D3 — Drawer slide-over « Inviter un membre » desktop.
 * =============================================================================
 * Même UX que <DesktopAddExpenseDrawer> : overlay 70% à droite avec backdrop
 * flouté, tout se fait inline (pas de redirection vers une vieille page).
 *
 * Flux :
 *  1. L'inviteur tape un email ou un téléphone.
 *  2. Lookup BMD debouncé 400ms (V155) → indique si le contact a déjà un compte.
 *  3. Si trouvé → affichage du vrai nom + avatar (l'invité sera reconnu).
 *  4. Si pas trouvé → champ "nom temporaire" pour personnaliser l'affichage
 *     dans le groupe jusqu'à ce qu'il s'inscrive (V215.D2).
 *  5. Permet d'empiler plusieurs invitations dans la même session (chips).
 *  6. À l'envoi, batch POST /groups/:id/members/batch — le backend déclenche
 *     email + SMS + push native simultanément (V215.D3).
 *
 * V216.G — Refonte multi-canal :
 *  - Card haut : Lien magique (copier), WhatsApp, QR code (broadcast invite).
 *  - Card bas : Email/Téléphone nominatif (lookup BMD + batch send) — flux existant.
 *  Les deux coexistent : l'utilisateur choisit selon le contexte.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { api } from "../api-client";
import { useT } from "../i18n/app-strings";
import { useToast } from "./toast";
import { SegmentedControl } from "./segmented-control";

// V216.G — Lazy-load du QR pour ne pas alourdir le bundle desktop.
const BrandedQR = dynamic(
  () => import("./branded-qr").then((m) => m.BrandedQR),
  { ssr: false, loading: () => <div style={{ width: 180, height: 180 }} /> },
);

type ContactKind = "EMAIL" | "PHONE";

interface PendingInvite {
  contactType: ContactKind;
  contactValue: string;
  /** Nom temporaire saisi par l'inviteur (pour les non-users) ou nom retrouvé via lookup. */
  displayName?: string;
  /** Si l'invité a déjà un compte BMD, son userId trouvé via lookup. */
  matchedUserId?: string;
}

interface LookupResult {
  found: boolean;
  displayName?: string;
  avatar?: string | null;
  userId?: string;
}

export function DesktopInviteDrawer({
  groupId,
  groupName,
  onClose,
  onSent,
}: {
  groupId: string;
  groupName: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const [kind, setKind] = useState<ContactKind>("EMAIL");
  const [contactValue, setContactValue] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [queue, setQueue] = useState<PendingInvite[]>([]);
  const [sending, setSending] = useState(false);
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // V216.G — État pour le lien d'invitation broadcast (multi-canal).
  // Récupéré au montage du drawer pour avoir le QR + l'URL prête.
  const [broadcast, setBroadcast] = useState<{
    joinUrl: string;
    message: string;
    whatsappUrl: string;
  } | null>(null);
  const [broadcastBusy, setBroadcastBusy] = useState(true);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setBroadcastBusy(true);
    api
      .generateBroadcastInvite(groupId, { tone: "chaleureux" })
      .then((r) => {
        if (cancelled) return;
        setBroadcast({
          joinUrl: r.joinUrl,
          message: r.message,
          whatsappUrl: r.whatsappUrl,
        });
      })
      .catch(() => {
        // Silent fail — le QR/lien ne s'affiche juste pas, le flow nominatif marche toujours.
      })
      .finally(() => {
        if (!cancelled) setBroadcastBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  function copyLink() {
    if (!broadcast?.joinUrl) return;
    void navigator.clipboard
      .writeText(broadcast.joinUrl)
      .then(() => {
        setLinkCopied(true);
        toast.success(t("invite.linkCopied") || "Lien copié");
        setTimeout(() => setLinkCopied(false), 2000);
      })
      .catch(() => {
        toast.error(t("invite.linkCopyError") || "Copie impossible");
      });
  }

  // ESC pour fermer
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Lookup BMD debounced 400ms quand le contact change
  useEffect(() => {
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    const value = contactValue.trim();
    if (value.length < 3) {
      setLookup(null);
      return;
    }
    lookupTimer.current = setTimeout(() => {
      void (async () => {
        setLookupBusy(true);
        try {
          const r = await api.lookupUserByContact(value);
          // r peut être {found:false} ou {found:true, userId, displayName, ...}
          if (r && (r as any).found === true) {
            const rr = r as {
              found: true;
              userId: string;
              displayName: string;
              avatar: string | null;
            };
            setLookup({
              found: true,
              displayName: rr.displayName,
              avatar: rr.avatar,
              userId: rr.userId,
            });
            // Pré-remplit le champ displayName avec le vrai nom (pour info,
            // pas envoyé — l'invité gardera son nom réel après acceptation)
            setDisplayName(rr.displayName);
          } else {
            setLookup({ found: false });
          }
        } catch {
          setLookup(null);
        } finally {
          setLookupBusy(false);
        }
      })();
    }, 400);
    return () => {
      if (lookupTimer.current) clearTimeout(lookupTimer.current);
    };
  }, [contactValue]);

  function addToQueue() {
    const v = contactValue.trim();
    if (v.length < 3) return;
    // Doublon ? On ignore.
    if (queue.some((q) => q.contactValue.toLowerCase() === v.toLowerCase())) {
      toast.info?.(t("invite.duplicate") || "Déjà dans la liste");
      return;
    }
    setQueue((prev) => [
      ...prev,
      {
        contactType: kind,
        contactValue: v,
        // Si le lookup a trouvé → displayName est juste informatif, on l'envoie
        // quand même pour que le backend l'utilise comme placeholder si jamais
        // le compte n'avait pas encore de displayName.
        displayName: displayName.trim() || undefined,
        matchedUserId: lookup?.found ? lookup.userId : undefined,
      },
    ]);
    setContactValue("");
    setDisplayName("");
    setLookup(null);
  }

  function removeFromQueue(index: number) {
    setQueue((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSend() {
    if (sending) return;
    // Si l'utilisateur a saisi quelque chose mais pas encore ajouté, on l'ajoute.
    let finalQueue = queue;
    if (contactValue.trim().length >= 3) {
      finalQueue = [
        ...queue,
        {
          contactType: kind,
          contactValue: contactValue.trim(),
          displayName: displayName.trim() || undefined,
          matchedUserId: lookup?.found ? lookup.userId : undefined,
        },
      ];
    }
    if (finalQueue.length === 0) {
      toast.error(t("invite.empty") || "Renseigne au moins un contact");
      return;
    }
    setSending(true);
    try {
      const result = await api.batchInviteMembers(
        groupId,
        finalQueue.map((q) => ({
          contactType: q.contactType,
          contactValue: q.contactValue,
          displayName: q.displayName,
        })),
      );
      const okCount = result.added?.length ?? 0;
      const failCount = result.failed?.length ?? 0;
      if (okCount > 0) {
        toast.success(
          t("invite.notification.sent", { n: okCount } as any) ||
            `${okCount} invitation${okCount > 1 ? "s" : ""} envoyée${okCount > 1 ? "s" : ""} par email${kind === "PHONE" ? ", SMS" : ""} et notification push.`,
        );
      }
      if (failCount > 0) {
        toast.error(
          t("invite.someFail", { n: failCount } as any) ||
            `${failCount} invitation${failCount > 1 ? "s" : ""} ont échoué.`,
        );
      }
      onSent();
      onClose();
    } catch (e) {
      toast.error((e as Error).message || "Erreur");
    } finally {
      setSending(false);
    }
  }

  const canAdd = contactValue.trim().length >= 3;
  const canSend = queue.length > 0 || contactValue.trim().length >= 3;

  const placeholder = useMemo(
    () =>
      kind === "EMAIL"
        ? t("invite.placeholderEmail") || "ami@exemple.com"
        : t("invite.placeholderPhone") || "+33 6 12 34 56 78",
    [kind, t],
  );

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 80, display: "flex" }}
      aria-modal="true"
      role="dialog"
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(43,31,21,0.45)",
          backdropFilter: "blur(2px)",
        }}
      />

      {/* Panneau droit */}
      <aside
        style={{
          position: "relative",
          marginLeft: "auto",
          width: "min(760px, 68vw)",
          height: "100vh",
          background: "#FAF6EE",
          color: "#2B1F15",
          borderLeft: "0.5px solid #D9C8A6",
          overflowY: "auto",
          boxShadow: "-4px 0 24px rgba(43,31,21,0.10)",
          padding: "18px 24px 24px",
          animation: "slideInRight 0.18s ease-out",
        }}
      >
        <style>{`@keyframes slideInRight { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>

        {/* Header */}
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 6,
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>
            {t("invite.sheet.title", { groupName } as any) ||
              `Inviter dans « ${groupName} »`}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            style={{
              background: "transparent",
              border: "none",
              color: "#8B6F47",
              fontSize: 18,
              cursor: "pointer",
              padding: "2px 8px",
              fontFamily: "inherit",
            }}
          >
            ✕
          </button>
        </header>
        <p style={{ fontSize: 12, color: "#8B6F47", margin: "0 0 18px" }}>
          {t("invite.subtitle") ||
            "Email, SMS et notification push envoyés simultanément. L'invité reçoit un lien d'acceptation."}
        </p>

        {/* V216.G — Card "Partager via lien magique" : QR + copier lien + WhatsApp.
            Utile quand on est en face de la personne ou qu'on veut partager
            sur un canal non géré nativement (WhatsApp, Telegram, etc.).
            Le lien est un broadcast invite (multi-usage, expire dans 30j). */}
        <section
          style={{
            background: "#F4ECD9",
            border: "0.5px solid #D9C8A6",
            borderRadius: 12,
            padding: 16,
            marginBottom: 18,
            display: "grid",
            gridTemplateColumns: "180px 1fr",
            gap: 16,
            alignItems: "center",
          }}
        >
          <div
            style={{
              background: "#FFFFFF",
              borderRadius: 9,
              padding: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 180,
            }}
          >
            {broadcastBusy || !broadcast ? (
              <span style={{ fontSize: 11, color: "#8B6F47" }}>
                {t("invite.broadcast.loading") || "Génération…"}
              </span>
            ) : (
              <BrandedQR value={broadcast.joinUrl} size={164} />
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div
              style={{
                fontSize: 11,
                color: "#8B6F47",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {t("invite.broadcast.title") || "Partager le lien d'invitation"}
            </div>
            <div style={{ fontSize: 12, color: "#2B1F15" }}>
              {t("invite.broadcast.subtitle") ||
                "Scanne le QR ou copie le lien — utilisable par plusieurs personnes."}
            </div>
            {broadcast?.joinUrl && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: "#FFFFFF",
                  border: "0.5px solid #D9C8A6",
                  borderRadius: 9,
                  padding: "6px 10px",
                  gap: 8,
                  marginTop: 4,
                }}
              >
                <input
                  readOnly
                  value={broadcast.joinUrl}
                  style={{
                    flex: 1,
                    border: "none",
                    background: "transparent",
                    fontSize: 11,
                    fontFamily: "inherit",
                    color: "#2B1F15",
                    outline: "none",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  onFocus={(e) => e.target.select()}
                />
                <button
                  type="button"
                  onClick={copyLink}
                  style={{
                    padding: "5px 11px",
                    background: linkCopied ? "#1F7A57" : "#C58A2E",
                    color: linkCopied ? "#FFFFFF" : "#2B1F15",
                    border: "none",
                    borderRadius: 7,
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {linkCopied
                    ? t("invite.copied") || "Copié ✓"
                    : t("invite.copyLink") || "Copier"}
                </button>
              </div>
            )}
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              {broadcast?.whatsappUrl && (
                <a
                  href={broadcast.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: "7px 12px",
                    background: "#25D366",
                    color: "#FFFFFF",
                    border: "none",
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  WhatsApp
                </a>
              )}
              {broadcast?.message && (
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(broadcast.message)
                      .then(() =>
                        toast.success(
                          t("invite.messageCopied") || "Message copié",
                        ),
                      )
                      .catch(() => {});
                  }}
                  style={{
                    padding: "7px 12px",
                    background: "transparent",
                    color: "#8B6F47",
                    border: "0.5px solid #D9C8A6",
                    borderRadius: 8,
                    fontSize: 11,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {t("invite.copyMessage") || "Copier le message"}
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Divider + label "OU envoi nominatif" */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            margin: "0 0 14px",
            color: "#8B6F47",
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          <div style={{ flex: 1, height: 0, borderTop: "0.5px solid #D9C8A6" }} />
          <span>{t("invite.orNominatif") || "Ou invitation nominative"}</span>
          <div style={{ flex: 1, height: 0, borderTop: "0.5px solid #D9C8A6" }} />
        </div>

        {/* Toggle Email / Téléphone */}
        <SegmentedControl<ContactKind>
          value={kind}
          onChange={(v) => {
            setKind(v);
            setContactValue("");
            setLookup(null);
          }}
          segments={[
            { value: "EMAIL", label: t("invite.kindEmail") || "Email" },
            { value: "PHONE", label: t("invite.kindPhone") || "Téléphone" },
          ]}
          size="sm"
        />

        {/* Champ contact */}
        <label
          style={{
            display: "block",
            fontSize: 10,
            color: "#8B6F47",
            textTransform: "lowercase",
            letterSpacing: "0.04em",
            marginTop: 16,
            marginBottom: 4,
          }}
        >
          {kind === "EMAIL"
            ? t("invite.fieldEmail") || "Email de l'invité"
            : t("invite.fieldPhone") || "Numéro de téléphone (E.164)"}
        </label>
        <input
          autoFocus
          type={kind === "EMAIL" ? "email" : "tel"}
          value={contactValue}
          onChange={(e) => setContactValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canAdd) {
              e.preventDefault();
              addToQueue();
            }
          }}
          placeholder={placeholder}
          style={{
            width: "100%",
            padding: "10px 12px",
            background: "#FFFFFF",
            border: "0.5px solid #D9C8A6",
            borderRadius: 9,
            fontSize: 14,
            color: "#2B1F15",
            fontFamily: "inherit",
            outline: "none",
          }}
        />

        {/* Résultat du lookup BMD */}
        {contactValue.trim().length >= 3 && (
          <div
            style={{
              marginTop: 10,
              padding: "10px 12px",
              background: lookup?.found
                ? "rgba(31,122,87,0.08)"
                : "rgba(197,138,46,0.08)",
              border: `0.5px solid ${
                lookup?.found ? "rgba(31,122,87,0.35)" : "rgba(197,138,46,0.35)"
              }`,
              borderRadius: 9,
              fontSize: 12,
              color: "#2B1F15",
              minHeight: 38,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            {lookupBusy && !lookup ? (
              <>
                <span
                  style={{
                    display: "inline-block",
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    border: "1.5px solid #D9C8A6",
                    borderTopColor: "#C58A2E",
                    animation: "bmdSpin 0.9s linear infinite",
                  }}
                />
                <span>{t("invite.lookupBusy") || "Recherche dans BMD…"}</span>
                <style>{`@keyframes bmdSpin { to { transform: rotate(360deg); } }`}</style>
              </>
            ) : lookup?.found ? (
              <>
                <span style={{ color: "#1F7A57", fontWeight: 600 }}>✓</span>
                <span>
                  <strong>{lookup.displayName}</strong>{" "}
                  {t("invite.lookup.foundSuffix") ||
                    "a déjà un compte BMD. Il sera reconnu automatiquement."}
                </span>
              </>
            ) : (
              <>
                <span style={{ color: "#C58A2E", fontWeight: 600 }}>ℹ︎</span>
                <span>
                  {t("invite.lookup.notFound") ||
                    "Pas encore sur BMD — donne-lui un nom (modifiable par lui-même après son inscription)."}
                </span>
              </>
            )}
          </div>
        )}

        {/* Champ nom temporaire (toujours visible mais le hint change selon le lookup) */}
        {contactValue.trim().length >= 3 && (
          <>
            <label
              style={{
                display: "block",
                fontSize: 10,
                color: "#8B6F47",
                textTransform: "lowercase",
                letterSpacing: "0.04em",
                marginTop: 14,
                marginBottom: 4,
              }}
            >
              {lookup?.found
                ? t("invite.nameLabelKnown") || "Nom affiché (modifiable)"
                : t("invite.nameLabelPlaceholder") ||
                  "Nom à afficher dans le groupe"}
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t("invite.namePlaceholder") || "Ex. Tonton Paul"}
              maxLength={60}
              style={{
                width: "100%",
                padding: "10px 12px",
                background: "#FFFFFF",
                border: "0.5px solid #D9C8A6",
                borderRadius: 9,
                fontSize: 14,
                color: "#2B1F15",
                fontFamily: "inherit",
                outline: "none",
              }}
            />
          </>
        )}

        {/* Bouton "Ajouter à la liste" */}
        <div style={{ display: "flex", marginTop: 10, gap: 8 }}>
          <button
            type="button"
            onClick={addToQueue}
            disabled={!canAdd}
            style={{
              padding: "8px 14px",
              background: canAdd ? "#F4ECD9" : "rgba(197,138,46,0.12)",
              color: "#2B1F15",
              border: "0.5px solid #D9C8A6",
              borderRadius: 9,
              fontSize: 12,
              cursor: canAdd ? "pointer" : "not-allowed",
              fontFamily: "inherit",
            }}
          >
            ＋ {t("invite.addToList") || "Ajouter à la liste"}
          </button>
          {queue.length > 0 && (
            <span style={{ fontSize: 11, color: "#8B6F47", alignSelf: "center" }}>
              {queue.length}{" "}
              {queue.length > 1
                ? t("invite.queuedPlural") || "personnes dans la liste"
                : t("invite.queuedSingular") || "personne dans la liste"}
            </span>
          )}
        </div>

        {/* Liste des invitations en attente d'envoi */}
        {queue.length > 0 && (
          <div
            style={{
              marginTop: 16,
              background: "#FFFFFF",
              border: "0.5px solid #D9C8A6",
              borderRadius: 11,
              padding: "8px 0",
            }}
          >
            {queue.map((q, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 14px",
                  borderBottom:
                    i === queue.length - 1
                      ? "none"
                      : "0.5px dashed rgba(139,111,71,0.18)",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "#2B1F15",
                    }}
                  >
                    {q.displayName || q.contactValue}
                  </div>
                  <div style={{ fontSize: 10, color: "#8B6F47" }}>
                    {q.contactType === "EMAIL" ? "📧" : "📱"} {q.contactValue}
                    {q.matchedUserId && (
                      <span style={{ color: "#1F7A57", marginLeft: 6 }}>
                        ✓ {t("invite.alreadyBmd") || "déjà sur BMD"}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeFromQueue(i)}
                  aria-label="Retirer"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#8B6F47",
                    fontSize: 16,
                    cursor: "pointer",
                    padding: "2px 8px",
                    fontFamily: "inherit",
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Info canaux */}
        <div
          style={{
            marginTop: 22,
            padding: "12px 14px",
            background: "#F4ECD9",
            border: "0.5px solid #D9C8A6",
            borderRadius: 11,
            fontSize: 11,
            color: "#8B6F47",
            lineHeight: 1.55,
          }}
        >
          <strong style={{ color: "#2B1F15" }}>
            {t("invite.channelsTitle") || "Notifications envoyées :"}
          </strong>{" "}
          {t("invite.channelsBody") ||
            "email avec lien magique pour les contacts e-mail · SMS pour les numéros de téléphone · notification push BMD si l'invité a déjà l'app."}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 22,
            alignItems: "center",
            position: "sticky",
            bottom: 0,
            paddingTop: 14,
            paddingBottom: 4,
            background:
              "linear-gradient(to top, #FAF6EE 70%, rgba(250,246,238,0))",
          }}
        >
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "9px 14px",
                background: "transparent",
                color: "#8B6F47",
                border: "none",
                borderRadius: 9,
                fontSize: 12,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {t("common.cancel") || "Annuler"}
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend || sending}
              style={{
                padding: "10px 22px",
                background: !canSend || sending ? "#D9C8A6" : "#C58A2E",
                color: "#2B1F15",
                border: "none",
                borderRadius: 9,
                fontSize: 13,
                fontWeight: 600,
                cursor: !canSend || sending ? "not-allowed" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {sending
                ? "…"
                : t("invite.sendButton") || "Envoyer les invitations"}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
