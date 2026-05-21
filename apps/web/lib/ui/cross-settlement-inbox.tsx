"use client";

/**
 * X4 · `<CrossSettlementInbox>` — Liste des règlements multi-groupe en attente.
 *
 * Affiche les `CrossGroupSettlement` où l'utilisateur est impliqué (débiteur
 * ou créancier) et dont le statut est `PROPOSED` ou `PAID` (= action
 * attendue de l'utilisateur). Ne montre pas les `CONFIRMED` (terminés) ni
 * les `CANCELLED`.
 *
 * Pour chaque règlement :
 *  - Si l'user est créancier net (`toUserId === me`) → bouton "✓ J'ai reçu"
 *    qui confirme la réception et solde tous les groupes en cascade.
 *  - Si l'user est débiteur net (`fromUserId === me`) → infos sur ce qu'il
 *    doit payer + bouton "Annuler" si la counterparty n'a pas encore confirmé.
 *
 * Le composant écoute les events SSE `cross-settlement.*` pour rafraîchir
 * automatiquement (apparition d'un nouveau règlement, confirmation, annulation).
 *
 * Inséré sous le bandeau hero du dashboard (desktop + mobile) — visible dès
 * l'arrivée si une action est attendue de l'utilisateur. Caché si rien en
 * attente (pas de pollution visuelle pour les utilisateurs sans dette croisée).
 */

import { useEffect, useState } from "react";
import {
  api,
  ApiError,
  isUnauthorized,
  clearToken,
} from "../api-client";
import { useRouter } from "next/navigation";
import { useMyEvents } from "../use-realtime";
import { useT } from "../i18n/app-strings";
import { useLocale } from "../locale-provider";
import { haptic } from "../platform";
import { useDialog } from "./dialog-provider";

/** Mêmes mappings que person-balance-list — DRY à factoriser dans une util commune si réutilisé. */
function mapToIntlLocale(code: string): string {
  const map: Record<string, string> = {
    "fr-cm": "fr-CM",
    "fr-ci": "fr-CI",
    pcm: "en",
    ln: "fr-CD",
    wo: "fr-SN",
    sw: "sw-KE",
    am: "am-ET",
    ha: "ha-NG",
    yo: "yo-NG",
    om: "fr-ET",
    ig: "ig-NG",
    ff: "fr-SN",
    zu: "zu-ZA",
    ak: "fr-GH",
    lb: "lb-LU",
  };
  return map[code] ?? code;
}

function formatCurrency(
  amount: number,
  currency: string,
  localeCode: string,
): string {
  const intlLocale = mapToIntlLocale(localeCode);
  const noDecimals = ["XAF", "XOF", "BIF", "RWF", "KMF", "JPY", "KRW"].includes(
    currency.toUpperCase(),
  );
  try {
    return new Intl.NumberFormat(intlLocale, {
      style: "currency",
      currency,
      minimumFractionDigits: noDecimals ? 0 : 2,
      maximumFractionDigits: noDecimals ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(noDecimals ? 0 : 2)} ${currency}`;
  }
}

interface CrossSettlement {
  id: string;
  fromUser: { id: string; displayName: string };
  toUser: { id: string; displayName: string };
  totalAmount: string;
  currency: string;
  status: "PROPOSED" | "PAID" | "CONFIRMED" | "CANCELLED";
  proposedAt: string;
  confirmedByPayerAt: string | null;
  confirmedByPayeeAt: string | null;
  memo: string | null;
  children: Array<{
    id: string;
    groupId: string;
    groupName: string;
    amount: string;
    currency: string;
    status: "PROPOSED" | "PAID" | "CONFIRMED" | "CANCELLED";
  }>;
}

interface Props {
  /** Mode d'affichage : "card" pour desktop dashboard, "compact" pour mobile. */
  variant?: "card" | "compact";
}

export function CrossSettlementInbox({ variant = "card" }: Props): JSX.Element | null {
  const router = useRouter();
  const t = useT();
  const dialog = useDialog();
  const { code: localeCode } = useLocale();
  const [items, setItems] = useState<CrossSettlement[] | null>(null);
  const [me, setMe] = useState<{ id: string } | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    // Defensive : si le bundle est antérieur à V30 (cache stale après
    // déploiement), `api.listMyCrossSettlements` peut être undefined.
    // On masque alors silencieusement l'inbox plutôt que crasher le dashboard.
    if (typeof api.listMyCrossSettlements !== "function") {
      setItems([]);
      return;
    }
    Promise.all([api.me().catch(() => null), api.listMyCrossSettlements()])
      .then(([meRes, list]) => {
        if (meRes?.user) setMe({ id: meRes.user.id });
        // Garde uniquement PROPOSED + PAID (action attendue).
        // CONFIRMED et CANCELLED disparaissent de l'inbox automatiquement.
        const pending = list.filter(
          (c) => c.status === "PROPOSED" || c.status === "PAID",
        );
        setItems(pending);
      })
      .catch((e) => {
        if (isUnauthorized(e)) {
          clearToken();
          router.replace("/login");
          return;
        }
        setError((e as Error).message);
      });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // X3 — Réagit aux events SSE pour rafraîchir l'inbox en temps réel
  useMyEvents((event) => {
    if (
      event.kind === "cross-settlement.created" ||
      event.kind === "cross-settlement.confirmed" ||
      event.kind === "cross-settlement.cancelled"
    ) {
      load();
    }
  });

  async function handleConfirm(c: CrossSettlement) {
    setActingId(c.id);
    setError(null);
    try {
      await api.confirmCrossSettlement(c.id);
      haptic("success");
      load();
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : (e as Error).message ?? "Erreur",
      );
      haptic("error");
    } finally {
      setActingId(null);
    }
  }

  async function handleCancel(c: CrossSettlement) {
    const ok = await dialog.confirm(
      t("crossSettle.cancel"),
      {
        variant: "warning",
        title: t("crossSettle.cancel"),
        confirmLabel: t("crossSettle.cancel"),
        cancelLabel: t("personDetail.close"),
      },
    );
    if (!ok) return;
    setActingId(c.id);
    setError(null);
    try {
      await api.cancelCrossSettlement(c.id);
      haptic("tap");
      load();
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : (e as Error).message ?? "Erreur",
      );
      haptic("error");
    } finally {
      setActingId(null);
    }
  }

  // Pas chargé encore, ou aucun en attente → on ne rend rien (zéro pollution
  // visuelle pour les utilisateurs sans cross-settlement en cours).
  if (items === null || items.length === 0) return null;

  return (
    <div
      style={{
        background:
          "linear-gradient(135deg, rgba(232,163,61,0.12), rgba(181,70,46,0.06))",
        border: "1px solid rgba(232,163,61,0.35)",
        borderRadius: variant === "compact" ? 12 : 16,
        padding: variant === "compact" ? 12 : 16,
        marginBottom: variant === "compact" ? 12 : 18,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <h3
          style={{
            fontSize: 11,
            color: "var(--saffron)",
            letterSpacing: 1.4,
            textTransform: "uppercase",
            fontWeight: 700,
            margin: 0,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          🤝 {t("crossInbox.title")}
        </h3>
        <span
          aria-label={t("crossInbox.countAria")}
          style={{
            fontSize: 11,
            fontWeight: 700,
            background: "var(--saffron)",
            color: "var(--night-2, #16111E)",
            padding: "2px 8px",
            borderRadius: 999,
            minWidth: 22,
            textAlign: "center",
          }}
        >
          {items.length}
        </span>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            background: "rgba(239,68,68,0.10)",
            border: "1px solid rgba(239,68,68,0.35)",
            color: "#fca5a5",
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 12,
            marginBottom: 10,
          }}
        >
          <strong>{t("personDetail.errorPrefix")}</strong> {error}
        </div>
      )}

      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {items.map((c) => {
          const isCreditor = me?.id === c.toUser.id;
          const counterpartyName = isCreditor
            ? c.fromUser.displayName
            : c.toUser.displayName;
          const formatted = formatCurrency(
            parseFloat(c.totalAmount),
            c.currency,
            localeCode,
          );
          const groupCount = c.children.length;
          const isActing = actingId === c.id;
          return (
            <li
              key={c.id}
              style={{
                background: "rgba(244,228,193,0.04)",
                border: "1px solid rgba(244,228,193,0.10)",
                borderRadius: 12,
                padding: 12,
                display: "flex",
                flexDirection: variant === "compact" ? "column" : "row",
                alignItems: variant === "compact" ? "stretch" : "center",
                gap: 10,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 14,
                    color: "var(--cream)",
                    marginBottom: 2,
                  }}
                >
                  {isCreditor
                    ? t("crossInbox.someoneOwesYou", {
                        name: counterpartyName,
                        amount: formatted,
                      })
                    : t("crossInbox.youOwe", {
                        name: counterpartyName,
                        amount: formatted,
                      })}
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: "var(--cream-soft)",
                    opacity: 0.85,
                  }}
                >
                  {t("crossInbox.acrossGroups", {
                    count: String(groupCount),
                  })}
                  {c.memo ? ` · ${c.memo}` : ""}
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  flexShrink: 0,
                  flexWrap: "wrap",
                }}
              >
                {isCreditor ? (
                  <button
                    type="button"
                    onClick={() => handleConfirm(c)}
                    disabled={isActing}
                    style={{
                      background:
                        "linear-gradient(135deg, rgba(63,125,92,0.95), rgba(45,95,70,0.95))",
                      color: "white",
                      fontWeight: 700,
                      fontSize: 12,
                      border: "none",
                      borderRadius: 8,
                      padding: "8px 12px",
                      cursor: isActing ? "wait" : "pointer",
                      fontFamily: "inherit",
                      opacity: isActing ? 0.7 : 1,
                      WebkitTapHighlightColor: "transparent",
                      minHeight: 36,
                    }}
                  >
                    {isActing
                      ? t("crossSettle.confirming")
                      : t("crossInbox.confirmReceived")}
                  </button>
                ) : (
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--cream-soft)",
                      padding: "8px 10px",
                      opacity: 0.85,
                    }}
                  >
                    {t("crossInbox.awaiting")}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleCancel(c)}
                  disabled={isActing}
                  style={{
                    background: "transparent",
                    color: "var(--cream-soft)",
                    fontWeight: 500,
                    fontSize: 12,
                    border: "1px solid rgba(244,228,193,0.18)",
                    borderRadius: 8,
                    padding: "8px 12px",
                    cursor: isActing ? "wait" : "pointer",
                    fontFamily: "inherit",
                    WebkitTapHighlightColor: "transparent",
                    minHeight: 36,
                  }}
                  aria-label={t("crossSettle.cancel")}
                >
                  ✕
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
