"use client";

/**
 * Page publique d'acceptation d'invitation : /join/[token]
 *
 * Flow :
 *  1. On récupère les infos publiques du token (no auth) : nom du groupe, type
 *  2. Si pas connecté, on stocke le token en localStorage et on redirige vers /login
 *  3. Si connecté, on affiche un bouton "Rejoindre" qui appelle l'API
 *  4. Au retour de /login, on détecte le token stocké et on revient ici
 *
 * Robustesse :
 *  - Token invalide / expiré / révoqué → message clair
 *  - Token déjà utilisé par cet user → idempotent (l'API renvoie le membership existant)
 */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  api,
  getToken,
  isUnauthorized,
} from "../../../lib/api-client";
import { useToast } from "../../../lib/ui/toast";
import { useT } from "../../../lib/i18n/app-strings";

const PENDING_INVITE_KEY = "bmd_pending_invite_token";

export default function JoinPage(): JSX.Element {
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;
  const toast = useToast();
  const t = useT();

  const [info, setInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    api
      .getInviteInfo(token)
      .then((data) => {
        setInfo(data);
        if (!data.valid) {
          setError(data.reason ?? t("join.linkInvalidOrExpired"));
        }
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : t("join.linkInvalid"));
      })
      .finally(() => setLoading(false));
  }, [token]);

  async function performJoin() {
    if (!token) return;
    if (!getToken()) {
      // Pas connecté → stocke le token et bascule sur /login
      try {
        localStorage.setItem(PENDING_INVITE_KEY, token);
      } catch {
        // localStorage indispo (mode privé) → on transmet via query
      }
      router.push(`/login?next=/join/${token}`);
      return;
    }
    setJoining(true);
    setError(null);
    try {
      await api.joinViaInviteToken(token);
      toast.success(t("join.successMessage", { name: info?.group?.name ?? "" }));
      try {
        localStorage.removeItem(PENDING_INVITE_KEY);
      } catch {
        /* ignore */
      }
      router.replace(`/dashboard/groups/${info.group.id}`);
    } catch (e) {
      if (isUnauthorized(e)) {
        try {
          localStorage.setItem(PENDING_INVITE_KEY, token);
        } catch {
          /* ignore */
        }
        router.push(`/login?next=/join/${token}`);
        return;
      }
      const msg = e instanceof Error ? e.message : t("common.networkError");
      setError(msg);
      toast.error(msg);
    } finally {
      setJoining(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        background:
          "radial-gradient(900px 600px at 50% -10%, rgba(232,163,61,0.12), transparent 60%), " +
          "linear-gradient(180deg, #16111E 0%, #0E0B14 100%)",
        color: "var(--cream, #f4e4c1)",
        padding:
          "calc(env(safe-area-inset-top, 0px) + 32px) 20px calc(env(safe-area-inset-bottom, 0px) + 24px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(180deg, #2A2244 0%, #1E1830 100%)",
          border: "1px solid rgba(232, 163, 61, 0.18)",
          color: "var(--cream)",
          maxWidth: 440,
          width: "100%",
          padding: "32px 24px 28px",
          borderRadius: 22,
          boxShadow:
            "0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(232,163,61,0.08)",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 0,
        }}
      >
        {/* Logo BMD circulaire */}
        <div
          aria-hidden
          style={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            background:
              "linear-gradient(135deg, #E8A33D 0%, #B5462E 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "Cormorant Garamond, Georgia, serif",
            fontSize: 42,
            fontWeight: 600,
            color: "#0E0B14",
            boxShadow: "0 8px 24px rgba(232, 163, 61, 0.32)",
            marginBottom: 14,
          }}
        >
          B
        </div>
        <p
          style={{
            color: "var(--cream-soft, #e8d5b7)",
            fontSize: 12,
            marginTop: 0,
            marginBottom: 26,
            letterSpacing: 0.3,
            opacity: 0.7,
          }}
        >
          Back Mes Do · {t("app.tagline")}
        </p>

        {loading && (
          <p
            style={{
              color: "var(--muted, #8a7b6b)",
              fontSize: 14,
              margin: "16px 0 8px",
            }}
          >
            {t("common.verifyingLink")}
          </p>
        )}

        {!loading && error && (
          <>
            <div
              aria-hidden
              style={{
                fontSize: 56,
                marginBottom: 14,
                filter: "drop-shadow(0 4px 12px rgba(181,70,46,0.4))",
              }}
            >
              🚫
            </div>
            <h2
              style={{
                fontFamily: "Cormorant Garamond, serif",
                fontSize: 24,
                fontWeight: 700,
                margin: "0 0 10px",
                color: "var(--cream)",
              }}
            >
              {t("join.linkInvalid")}
            </h2>
            <p
              style={{
                color: "var(--cream-soft)",
                fontSize: 14,
                lineHeight: 1.5,
                margin: "0 0 8px",
              }}
            >
              {error}
            </p>
            <p
              style={{
                fontSize: 12,
                color: "var(--muted, #8a7b6b)",
                lineHeight: 1.55,
                margin: "0 0 20px",
              }}
            >
              {t("join.generateNewLinkInstruction")}
            </p>
            <Link
              href="/"
              className="bmd-join-cta-ghost"
            >
              {t("common.homeLink")}
            </Link>
          </>
        )}

        {!loading && !error && info?.valid && (
          <>
            <div
              aria-hidden
              style={{
                fontSize: 56,
                marginBottom: 12,
                filter: "drop-shadow(0 4px 12px rgba(232,163,61,0.3))",
                animation: "bmd-join-wave 2.6s ease-in-out infinite",
              }}
            >
              👋
            </div>
            <h2
              style={{
                fontFamily: "Cormorant Garamond, serif",
                fontSize: 26,
                fontWeight: 700,
                margin: "0 0 6px",
                color: "var(--cream)",
                lineHeight: 1.2,
              }}
            >
              {t("join.youAreInvited")}
            </h2>
            <p
              style={{
                fontSize: 14,
                color: "var(--cream-soft)",
                lineHeight: 1.5,
                margin: "0 0 4px",
              }}
            >
              {t("join.toJoinGroup")}
            </p>
            <p
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: "var(--saffron, #E8A33D)",
                fontFamily: "Cormorant Garamond, serif",
                margin: "8px 0 24px",
                lineHeight: 1.2,
              }}
            >
              {info.group.name}
            </p>
            <button
              onClick={performJoin}
              disabled={joining}
              className="bmd-join-cta"
            >
              {joining
                ? t("common.connectingInProgress")
                : getToken()
                  ? t("join.joinGroupButton")
                  : t("join.signInToJoinButton")}
            </button>
            <p
              style={{
                fontSize: 11,
                color: "var(--muted, #8a7b6b)",
                marginTop: 18,
                lineHeight: 1.5,
              }}
            >
              En rejoignant, tu acceptes la{" "}
              <Link
                href="/legal/privacy"
                style={{ color: "var(--cream-soft)", textDecoration: "underline" }}
              >
                {t("common.privacyPolicy")}
              </Link>
              .
            </p>
          </>
        )}
      </div>

      <style jsx>{`
        @keyframes bmd-join-wave {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(12deg); }
          75% { transform: rotate(-12deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="bmd-join-wave"] { animation: none !important; }
        }
        .bmd-join-cta {
          padding: 16px 28px;
          background: linear-gradient(135deg, #E8A33D 0%, #B5462E 100%);
          color: #0E0B14;
          border: none;
          border-radius: 999px;
          font-weight: 700;
          font-size: 16px;
          font-family: inherit;
          width: 100%;
          min-height: 54px;
          cursor: pointer;
          box-shadow: 0 6px 20px rgba(232, 163, 61, 0.3);
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          transition: transform 0.1s, box-shadow 0.2s, opacity 0.2s;
        }
        .bmd-join-cta:not(:disabled):active {
          transform: scale(0.97);
          box-shadow: 0 3px 12px rgba(232, 163, 61, 0.25);
        }
        .bmd-join-cta:disabled {
          opacity: 0.6;
          cursor: wait;
        }
        @media (hover: hover) and (pointer: fine) {
          .bmd-join-cta:not(:disabled):hover {
            box-shadow: 0 8px 26px rgba(232, 163, 61, 0.4);
          }
        }
        .bmd-join-cta-ghost {
          display: inline-block;
          padding: 14px 28px;
          background: transparent;
          border: 1px solid rgba(232, 163, 61, 0.3);
          color: var(--cream, #f4e4c1);
          text-decoration: none;
          border-radius: 999px;
          font-weight: 600;
          font-size: 14px;
          font-family: inherit;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          transition: background 0.2s, border-color 0.2s;
        }
        .bmd-join-cta-ghost:active {
          background: rgba(232, 163, 61, 0.08);
          border-color: rgba(232, 163, 61, 0.5);
        }
      `}</style>
    </main>
  );
}
