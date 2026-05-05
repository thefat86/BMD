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

const PENDING_INVITE_KEY = "bmd_pending_invite_token";

export default function JoinPage(): JSX.Element {
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;
  const toast = useToast();

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
          setError(data.reason ?? "Lien invalide ou expiré");
        }
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Lien invalide");
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
      toast.success(`Tu as rejoint « ${info?.group?.name} »`);
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
      const msg = e instanceof Error ? e.message : "Erreur réseau";
      setError(msg);
      toast.error(msg);
    } finally {
      setJoining(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0E0B14 0%, #1F1429 100%)",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          background: "#fff",
          color: "#111827",
          maxWidth: 440,
          width: "100%",
          padding: 32,
          borderRadius: 20,
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 32,
            fontWeight: 700,
            marginBottom: 8,
            color: "#0E0B14",
          }}
        >
          BMD<span style={{ color: "#E8A33D" }}>·</span>
        </div>
        <p
          style={{
            color: "#6b7280",
            fontSize: 13,
            marginTop: 0,
            marginBottom: 24,
          }}
        >
          Back Mes Do · L'argent partagé sans drama
        </p>

        {loading && <p>Vérification du lien…</p>}

        {!loading && error && (
          <>
            <div style={{ fontSize: 56, marginBottom: 12 }}>🚫</div>
            <h2 style={{ marginTop: 0 }}>Lien invalide</h2>
            <p style={{ color: "#6b7280" }}>{error}</p>
            <p style={{ fontSize: 13, color: "#6b7280" }}>
              Demande à la personne qui t'a invité·e de générer un nouveau
              lien depuis les paramètres du groupe.
            </p>
            <Link
              href="/"
              style={{
                display: "inline-block",
                marginTop: 16,
                padding: "12px 24px",
                background: "#0E0B14",
                color: "#fff",
                textDecoration: "none",
                borderRadius: 10,
                fontWeight: 600,
              }}
            >
              Retour à l'accueil
            </Link>
          </>
        )}

        {!loading && !error && info?.valid && (
          <>
            <div style={{ fontSize: 56, marginBottom: 12 }}>👋</div>
            <h2 style={{ marginTop: 0 }}>Tu es invité·e</h2>
            <p style={{ fontSize: 16, color: "#374151" }}>
              à rejoindre le groupe
            </p>
            <p
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: "#0E0B14",
                margin: "8px 0 24px",
              }}
            >
              {info.group.name}
            </p>
            <button
              onClick={performJoin}
              disabled={joining}
              style={{
                padding: "16px 32px",
                background: "#E8A33D",
                color: "#0E0B14",
                border: "none",
                borderRadius: 12,
                fontWeight: 700,
                fontSize: 16,
                cursor: joining ? "wait" : "pointer",
                width: "100%",
                minHeight: 52,
              }}
            >
              {joining
                ? "Connexion en cours…"
                : getToken()
                  ? "Rejoindre le groupe →"
                  : "Se connecter pour rejoindre →"}
            </button>
            <p
              style={{
                fontSize: 11,
                color: "#9ca3af",
                marginTop: 16,
              }}
            >
              En rejoignant, tu acceptes la{" "}
              <Link href="/legal/privacy" style={{ color: "#6b7280" }}>
                politique de confidentialité
              </Link>
              .
            </p>
          </>
        )}
      </div>
    </div>
  );
}
