"use client";

/**
 * V202.F — Page publique read-only d'une Caisse Projet.
 * =============================================================================
 * Route : /funds/public/[code]
 *
 * Pas d'authentification requise. L'objectif est de permettre au créateur /
 * trésorier de partager un lien avec des contributeurs externes au groupe
 * (membres de la famille élargie, donateurs ponctuels, etc.) qui pourront :
 *   - Voir le nom, la description, le template, la devise
 *   - Voir la jauge de progression (collecté / objectif)
 *   - Voir le nombre de contributeurs (anonymisés en prénoms)
 *   - Comprendre que BMD est un registre — pas une banque
 *
 * Sans s'inscrire, ils peuvent cliquer sur « Rejoindre BMD pour cotiser »
 * (CTA qui les amène sur /login).
 *
 * Bannière légale TOUJOURS visible.
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "../../../../lib/api-client";

type PublicFund = Awaited<ReturnType<typeof api.getPublicProjectFund>>;

export default function PublicFundPage() {
  const params = useParams();
  const code = params.code as string;
  const [data, setData] = useState<PublicFund | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getPublicProjectFund(code)
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, [code]);

  if (error) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#FBF6EC",
          padding: "60px 20px",
          textAlign: "center",
          fontFamily: "'Helvetica Neue', Arial, sans-serif",
        }}
      >
        <h1 style={{ color: "#9F4628" }}>Caisse introuvable</h1>
        <p style={{ color: "#7a7164" }}>{error}</p>
        <Link href="/" style={{ color: "#C58A2E" }}>
          Retour à l'accueil BMD
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#FBF6EC",
          padding: "60px 20px",
          textAlign: "center",
        }}
      >
        Chargement…
      </div>
    );
  }

  const { fund, balance, contributors } = data;
  const target = fund.targetAmount ? parseFloat(fund.targetAmount) : null;
  const progress =
    target && target > 0
      ? Math.min(100, Math.round((balance.contributed / target) * 100))
      : null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#FBF6EC",
        padding: "20px 16px 60px",
        fontFamily: "'Helvetica Neue', Arial, sans-serif",
        color: "#2B1F15",
      }}
    >
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        {/* Logo BMD */}
        <div
          style={{
            textAlign: "center",
            marginBottom: 24,
            paddingTop: 12,
          }}
        >
          <span
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 28,
              fontWeight: 700,
              color: "#C58A2E",
            }}
          >
            BMD
          </span>
          <div
            style={{
              fontSize: 11,
              color: "#7a7164",
              letterSpacing: 1.2,
              textTransform: "uppercase",
              marginTop: 2,
            }}
          >
            L'argent partagé. L'amitié protégée.
          </div>
        </div>

        {/* HERO */}
        <section
          style={{
            background:
              "linear-gradient(135deg, rgba(197,138,46,0.10), rgba(31,122,87,0.06))",
            border: "1px solid rgba(197,138,46,0.24)",
            borderRadius: 18,
            padding: "20px",
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: "#C58A2E",
              letterSpacing: 1.4,
              fontWeight: 700,
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            Caisse projet · {fund.template}
          </div>
          <h1
            style={{
              margin: 0,
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 28,
              fontWeight: 700,
              lineHeight: 1.2,
            }}
          >
            {fund.name}
          </h1>
          {fund.description && (
            <p
              style={{
                margin: "10px 0 0",
                fontSize: 14,
                color: "#5a4b3a",
                lineHeight: 1.55,
              }}
            >
              {fund.description}
            </p>
          )}

          {/* Jauge */}
          <div style={{ marginTop: 18 }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: 32,
                  fontWeight: 700,
                }}
              >
                {balance.contributed.toFixed(0)}
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#7a7164",
                    marginLeft: 6,
                    fontFamily: "inherit",
                  }}
                >
                  {fund.currency}
                </span>
              </span>
              {target && (
                <span style={{ fontSize: 12, color: "#7a7164" }}>
                  / {target.toFixed(0)} {fund.currency}
                  {progress !== null && ` (${progress}%)`}
                </span>
              )}
            </div>
            {progress !== null && (
              <div
                style={{
                  height: 8,
                  background: "rgba(197,138,46,0.15)",
                  borderRadius: 999,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${progress}%`,
                    background:
                      "linear-gradient(90deg, #C58A2E, #9F4628)",
                  }}
                />
              </div>
            )}
          </div>

          <p
            style={{
              margin: "16px 0 0",
              fontSize: 12,
              color: "#7a7164",
            }}
          >
            {balance.contributorsCount} contributeur
            {balance.contributorsCount > 1 ? "s" : ""}
            {fund.treasurer && (
              <>
                {" · Trésorier : "}
                <strong style={{ color: "#2B1F15" }}>
                  {fund.treasurer.displayName}
                </strong>
              </>
            )}
          </p>
        </section>

        {/* CONTRIBUTEURS ANONYMISÉS */}
        {contributors.length > 0 && (
          <section
            style={{
              marginTop: 18,
              background: "#fff",
              border: "1px solid rgba(244,228,193,0.30)",
              borderRadius: 14,
              padding: "16px",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#7a7164",
                letterSpacing: 0.8,
                textTransform: "uppercase",
                marginBottom: 10,
              }}
            >
              Ont déjà contribué
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
              }}
            >
              {contributors.map((c, i) => (
                <span
                  key={i}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 999,
                    background: "rgba(197,138,46,0.10)",
                    color: "#2B1F15",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {c.firstName}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* CTA REJOINDRE BMD */}
        <section
          style={{
            marginTop: 18,
            textAlign: "center",
          }}
        >
          <Link
            href="/login"
            style={{
              display: "inline-block",
              padding: "14px 28px",
              background:
                "linear-gradient(135deg, #C58A2E, #9F4628)",
              color: "#FBF6EC",
              borderRadius: 999,
              textDecoration: "none",
              fontWeight: 800,
              fontSize: 15,
              letterSpacing: 0.3,
              boxShadow: "0 8px 24px -8px rgba(197,138,46,0.50)",
            }}
          >
            Rejoindre BMD pour cotiser →
          </Link>
        </section>

        {/* BANNIÈRE LÉGALE */}
        <section
          style={{
            marginTop: 24,
            padding: "14px 16px",
            borderLeft: "3px solid #1F7A57",
            background: "rgba(31,122,87,0.06)",
            borderRadius: 8,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#1F7A57",
              letterSpacing: 0.5,
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            BMD est un registre, pas une banque
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: "#5a4b3a",
              lineHeight: 1.55,
            }}
          >
            L'argent n'est jamais détenu par BMD. Le trésorier nommé est seul
            responsable de la garde des fonds. BMD enregistre les
            déclarations pour assurer la transparence entre contributeurs.
          </p>
        </section>

        {/* Footer */}
        <p
          style={{
            marginTop: 36,
            textAlign: "center",
            fontSize: 11,
            color: "#7a7164",
          }}
        >
          Code public : <code>{fund.publicCode}</code> ·{" "}
          <Link href="/" style={{ color: "#C58A2E" }}>
            backmesdo.com
          </Link>
        </p>
      </div>
    </div>
  );
}
