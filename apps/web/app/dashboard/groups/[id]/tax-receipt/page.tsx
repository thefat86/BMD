"use client";

/**
 * Reçu fiscal automatique pour un membre d'un groupe PARISH (spec §3.11).
 *
 * Format conforme aux mentions légales françaises (CERFA simplifié) :
 *  - En-tête : nom de l'organisme + adresse + n° association (à renseigner)
 *  - Bénéficiaire : prénom/nom + adresse
 *  - Total des dons sur l'année
 *  - Mention légale : "Article 200 du CGI"
 *  - Signature (à signer manuellement à l'impression)
 *
 * Note : un vrai CERFA 11580 nécessite SIRET + numéro de récépissé en
 * préfecture. Pour le MVP on génère un brouillon que le trésorier finalise.
 */
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { api, getToken, isUnauthorized } from "../../../../../lib/api-client";
// V108 — Barre d'actions sticky partagée (back + imprimer + PDF).
import { PrintActionBar } from "../../../../../lib/ui/print-action-bar";

export default function TaxReceiptPage() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const groupId = id as string;
  /** Année fiscale (par défaut année en cours). Exemple : ?year=2025 */
  const year = parseInt(
    searchParams?.get("year") ?? String(new Date().getFullYear()),
    10,
  );
  /** Membre cible (par défaut : moi). ?memberUserId=xxx pour un autre membre. */
  const targetUserId = searchParams?.get("memberUserId");

  const [group, setGroup] = useState<any>(null);
  const [me, setMe] = useState<any>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [target, setTarget] = useState<any>(null);

  // V108 — Plus d'auto-print : Fabrice veut LIRE le document d'abord puis
  // déclencher l'impression manuellement via la barre d'actions en haut.
  useEffect(() => {
    if (!getToken()) {
      window.location.href = "/login";
      return;
    }
    Promise.all([
      api.me(),
      api.getGroup(groupId),
      api.listExpenses(groupId),
    ])
      .then(([m, g, e]) => {
        setMe(m.user);
        setGroup(g);
        setExpenses(e);
        // Détermine le bénéficiaire du reçu
        const t = targetUserId
          ? g.members.find((mb: any) => mb.user.id === targetUserId)?.user
          : m.user;
        setTarget(t ?? m.user);
      })
      .catch((err) => {
        if (isUnauthorized(err)) window.location.href = "/login";
      });
  }, [groupId, targetUserId]);

  if (!group || !target) {
    return (
      <div style={{ padding: 40, fontFamily: "Inter, sans-serif" }}>
        Génération du reçu fiscal…
      </div>
    );
  }

  // V111 — Guard : la fonctionnalité « reçu fiscal » doit être explicitement
  // activée dans les réglages du groupe (réservée aux associations / asso
  // à but non lucratif). Sinon on affiche un message clair + lien vers
  // les réglages où l'admin peut activer.
  if (!group.taxReceiptsEnabled) {
    return (
      <div
        style={{
          maxWidth: 540,
          margin: "60px auto",
          padding: "32px 24px",
          background: "var(--paper, #FFFFFF)",
          border: "1px solid rgba(43,31,21,0.10)",
          borderRadius: 18,
          boxShadow: "0 4px 16px rgba(43,31,21,0.06)",
          textAlign: "center",
          color: "var(--cocoa, #2B1F15)",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <div
          aria-hidden
          style={{
            fontSize: 38,
            marginBottom: 14,
          }}
        >
          🚫
        </div>
        <h1
          style={{
            margin: "0 0 10px",
            fontFamily: "Cormorant Garamond, serif",
            fontSize: 24,
            fontWeight: 700,
            color: "var(--cocoa, #2B1F15)",
          }}
        >
          Reçus fiscaux non activés
        </h1>
        <p
          style={{
            margin: "0 0 18px",
            fontSize: 14,
            color: "var(--cocoa-soft, #6B5A47)",
            lineHeight: 1.5,
          }}
        >
          La fonction « reçu fiscal » n'est disponible que pour les groupes
          configurés comme <strong>association</strong> ou{" "}
          <strong>organisme à but non lucratif</strong>. Un admin peut
          l'activer dans les réglages du groupe.
        </p>
        <a
          href={`/dashboard/groups/${groupId}/settings`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "10px 20px",
            background:
              "linear-gradient(135deg, #C58A2E, #9F4628)",
            color: "#FFFFFF",
            textDecoration: "none",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          Ouvrir les réglages →
        </a>
      </div>
    );
  }

  // Calcul des dons : pour chaque dépense où le membre cible est payeur,
  // on additionne les montants. Cas typique : quête où la paroisse "paie"
  // (un membre crédit), et on émet le reçu pour son nom.
  const myContributions = expenses.filter((e: any) => {
    if (e.paidBy.id !== target.id) return false;
    const d = new Date(e.occurredAt);
    return d.getFullYear() === year;
  });
  const totalAmount = myContributions.reduce(
    (s, e) => s + parseFloat(e.amount),
    0,
  );

  return (
    <>
      <style jsx global>{`
        @media print {
          @page {
            margin: 18mm 18mm;
            size: A4;
          }
          body {
            background: #fff !important;
            color: #000 !important;
          }
          .no-print,
          .print-action-bar {
            display: none !important;
          }
          .bmd-print-doc {
            padding: 0 !important;
            max-width: none !important;
          }
        }
        body {
          background: #fff;
          color: #16111e;
          font-family: "Inter", system-ui, sans-serif;
          margin: 0;
        }
      `}</style>

      {/* V108 — Barre d'actions sticky (Back / Imprimer / PDF) */}
      <PrintActionBar
        title={`Reçu fiscal ${year}`}
        subtitle={`${target.displayName} · ${group.name}`}
        backHref={`/dashboard/groups/${groupId}`}
      />

      <div
        className="bmd-print-doc"
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "clamp(16px, 4vw, 32px)",
          color: "#16111e",
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        {/* En-tête organisme */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 16,
            borderBottom: "2px solid #E8A33D",
            paddingBottom: 18,
            marginBottom: 24,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/bmd-logo.svg" alt="" width={64} height={64} />
          <div style={{ flex: 1 }}>
            <h1
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 26,
                margin: 0,
                lineHeight: 1.1,
                color: "#16111e",
              }}
            >
              {group.name}
            </h1>
            <div
              style={{
                fontSize: 11,
                color: "#666",
                marginTop: 6,
                lineHeight: 1.5,
              }}
            >
              Association cultuelle / paroisse — à compléter par le
              trésorier :
              <br />
              <span style={{ fontStyle: "italic" }}>
                [Adresse complète] · [N° en préfecture] · [SIRET si applicable]
              </span>
            </div>
          </div>
          <div style={{ textAlign: "right", fontSize: 10, color: "#666" }}>
            <div>Reçu n°</div>
            <div
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 16,
                fontWeight: 700,
                color: "#16111e",
              }}
            >
              {/* Ref unique = groupId court + année + targetId court */}
              {groupId.slice(0, 4).toUpperCase()}-{year}-
              {target.id.slice(0, 4).toUpperCase()}
            </div>
          </div>
        </div>

        {/* Titre du document */}
        <div
          style={{
            background: "#F4E4C1",
            border: "1px solid #E8A33D",
            borderRadius: 10,
            padding: "12px 16px",
            textAlign: "center",
            marginBottom: 24,
          }}
        >
          <h2
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 22,
              margin: 0,
              color: "#16111e",
            }}
          >
            Reçu au titre des dons à certains organismes d'intérêt général
          </h2>
          <div
            style={{
              fontSize: 11,
              color: "#8E5A3B",
              marginTop: 4,
              letterSpacing: 1,
            }}
          >
            Article 200 du Code Général des Impôts · Année {year}
          </div>
        </div>

        {/* Bloc bénéficiaire */}
        <div style={{ marginBottom: 22 }}>
          <div
            style={{
              fontSize: 11,
              letterSpacing: 1.5,
              color: "#8E5A3B",
              textTransform: "uppercase",
              fontWeight: 700,
              marginBottom: 4,
            }}
          >
            Bénéficiaire du reçu
          </div>
          <div
            style={{
              fontSize: 18,
              fontFamily: "'Cormorant Garamond', serif",
              fontWeight: 600,
            }}
          >
            {target.displayName}
          </div>
          <div style={{ fontSize: 11, color: "#666", fontStyle: "italic" }}>
            [Adresse à compléter par le donateur]
          </div>
        </div>

        {/* Montant en gros */}
        <div
          style={{
            background: "#fbf7ee",
            border: "2px solid #E8A33D",
            borderRadius: 12,
            padding: 24,
            textAlign: "center",
            marginBottom: 24,
          }}
        >
          <div
            style={{
              fontSize: 11,
              letterSpacing: 2,
              color: "#8E5A3B",
              textTransform: "uppercase",
              fontWeight: 700,
            }}
          >
            Montant total des dons reçus
          </div>
          <div
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 42,
              fontWeight: 700,
              color: "#B5462E",
              marginTop: 6,
              lineHeight: 1,
            }}
          >
            {totalAmount.toFixed(2)}{" "}
            <span style={{ fontSize: 22, color: "#8E5A3B" }}>
              {group.defaultCurrency}
            </span>
          </div>
          <div style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
            ({myContributions.length} versement
            {myContributions.length > 1 ? "s" : ""} sur l'année {year})
          </div>
        </div>

        {/* Détail des versements */}
        {myContributions.length > 0 && (
          <>
            <h3
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 18,
                marginBottom: 12,
                borderBottom: "1px solid #E8D5B7",
                paddingBottom: 6,
              }}
            >
              Détail des versements
            </h3>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 12,
                marginBottom: 24,
              }}
            >
              <thead>
                <tr style={{ background: "#F4E4C1" }}>
                  <th style={cellHead}>Date</th>
                  <th style={cellHead}>Description</th>
                  <th style={{ ...cellHead, textAlign: "right" }}>
                    Montant
                  </th>
                </tr>
              </thead>
              <tbody>
                {myContributions.map((e: any, i: number) => (
                  <tr
                    key={e.id}
                    style={{ background: i % 2 ? "#FBF7EE" : "#fff" }}
                  >
                    <td style={cell}>
                      {new Date(e.occurredAt).toLocaleDateString("fr-FR")}
                    </td>
                    <td style={cell}>{e.description}</td>
                    <td style={{ ...cell, textAlign: "right", fontWeight: 600 }}>
                      {parseFloat(e.amount).toFixed(2)}{" "}
                      {e.currency ?? group.defaultCurrency}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* Mention légale */}
        <div
          style={{
            background: "#fff8e8",
            border: "1px solid #E8D5B7",
            borderRadius: 8,
            padding: 12,
            fontSize: 11,
            color: "#666",
            lineHeight: 1.7,
            marginBottom: 30,
          }}
        >
          <strong>Article 200 du CGI :</strong> les dons effectués à des
          organismes d'intérêt général ouvrent droit à une réduction d'impôt
          sur le revenu de 66 % (75 % pour les organismes d'aide aux personnes
          en difficulté), dans la limite de 20 % du revenu imposable.
          <br />
          <br />
          <em>
            Le bénéficiaire reconnaît avoir reçu de la part du donateur les
            sommes mentionnées ci-dessus, à titre de don manuel.
          </em>
        </div>

        {/* Signature */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 40,
            gap: 30,
          }}
        >
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 10,
                color: "#999",
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 4,
              }}
            >
              Lieu et date
            </div>
            <div
              style={{
                borderBottom: "1px solid #ccc",
                height: 30,
                fontSize: 11,
                color: "#16111e",
                paddingBottom: 4,
              }}
            >
              ........., le{" "}
              {new Date().toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 10,
                color: "#999",
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 4,
              }}
            >
              Signature & cachet du trésorier
            </div>
            <div
              style={{
                border: "1px solid #ccc",
                borderRadius: 6,
                height: 60,
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: 40,
            paddingTop: 12,
            borderTop: "1px solid #ddd",
            fontSize: 9,
            color: "#999",
            textAlign: "center",
          }}
        >
          Reçu généré par BMD · Back Mes Do · backmesdo.com
        </div>
      </div>
    </>
  );
}

const cellHead: React.CSSProperties = {
  padding: "8px 10px",
  textAlign: "left",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  borderBottom: "2px solid #E8A33D",
};

const cell: React.CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid #f0e6d8",
};
