"use client";

/**
 * Vue imprimable d'un groupe — sert d'export PDF (Cmd+P → Enregistrer en PDF).
 *
 * Spec §3.11 : Export PDF (mise en page premium).
 *
 * Pourquoi pas pdfkit/jsPDF ?
 *  - Zéro dépendance ajoutée
 *  - Le navigateur fait un PDF de qualité native, multi-page automatique
 *  - L'utilisateur peut prévisualiser avant d'enregistrer
 *
 * Layout : style "rapport comptable"
 *  - En-tête : logo BMD + nom du groupe + période
 *  - Section soldes (tableau)
 *  - Section dépenses (tableau chronologique)
 *  - Pied de page : généré le ...
 */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, getToken, isUnauthorized } from "../../../../../lib/api-client";
import { useT } from "../../../../../lib/i18n/app-strings";
// V108 — Barre d'actions sticky (back + imprimer + enregistrer PDF).
import { PrintActionBar } from "../../../../../lib/ui/print-action-bar";

export default function PrintGroupPage() {
  const t = useT();
  const { id } = useParams();
  const groupId = id as string;
  const [group, setGroup] = useState<any>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [balance, setBalance] = useState<any>(null);

  // V108 — Plus d'auto-print : l'utilisateur a le temps de lire le document
  // et déclenche l'impression manuellement via la barre d'actions en haut.
  useEffect(() => {
    if (!getToken()) {
      window.location.href = "/login";
      return;
    }
    Promise.all([
      api.getGroup(groupId),
      api.listExpenses(groupId),
      api.getBalance(groupId),
    ])
      .then(([g, e, b]) => {
        setGroup(g);
        setExpenses(e);
        setBalance(b);
      })
      .catch((err) => {
        if (isUnauthorized(err)) window.location.href = "/login";
      });
  }, [groupId]);

  if (!group || !balance) {
    return (
      <div style={{ padding: 40, fontFamily: "Inter, sans-serif" }}>
        Génération du document…
      </div>
    );
  }

  const totalAmount = expenses.reduce(
    (s, e) => s + parseFloat(e.amount),
    0,
  );

  return (
    <>
      <style jsx global>{`
        @media print {
          @page {
            margin: 18mm 15mm;
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
          font-family:
            "Inter", system-ui, -apple-system, sans-serif;
          margin: 0;
        }
      `}</style>

      {/* V108 — Barre d'actions sticky en haut (Back / Imprimer / PDF).
          Masquée à l'impression via la classe print-action-bar. */}
      <PrintActionBar
        title={t("print.recapTitle") || "Récap du groupe"}
        subtitle={group.name}
        backHref={`/dashboard/groups/${groupId}`}
      />

      {/* Conteneur responsive : padding réduit sur mobile, max-width A4 sur
          desktop. À l'impression on retire padding et max-width pour laisser
          le navigateur gérer les marges via @page. */}
      <div
        className="bmd-print-doc"
        style={{
          maxWidth: 780,
          margin: "0 auto",
          padding: "clamp(16px, 4vw, 32px)",
          color: "#16111e",
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        {/* En-tête : logo + meta */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            borderBottom: "2px solid #E8A33D",
            paddingBottom: 16,
            marginBottom: 24,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/bmd-logo.svg" alt="" width={56} height={56} />
          <div>
            <div
              style={{
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontSize: 28,
                fontWeight: 700,
                color: "#16111e",
                lineHeight: 1.1,
              }}
            >
              BMD<span style={{ color: "#E8A33D" }}>·</span>
            </div>
            <div
              style={{
                fontSize: 10,
                letterSpacing: 3,
                color: "#8E5A3B",
                textTransform: "uppercase",
                fontWeight: 700,
              }}
            >
              Back · Mes · Do
            </div>
          </div>
          <div style={{ marginLeft: "auto", textAlign: "right", fontSize: 11, color: "#666" }}>
            <div>{t("print.documentGeneratedOn")}</div>
            <div style={{ fontWeight: 600, color: "#16111e" }}>
              {new Date().toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </div>
          </div>
        </div>

        {/* Titre du rapport */}
        <h1
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: 32,
            fontWeight: 600,
            margin: "0 0 4px 0",
          }}
        >
          {group.name}
        </h1>
        <div style={{ color: "#666", fontSize: 13, marginBottom: 28 }}>
          {group.type.toLowerCase()} · {group.members.length} membre
          {group.members.length > 1 ? "s" : ""} · {group.defaultCurrency}
        </div>

        {/* Récap chiffres clés */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
            marginBottom: 28,
          }}
        >
          <Stat
            label={t("print.totalSpent")}
            value={`${totalAmount.toFixed(2)} ${group.defaultCurrency}`}
          />
          <Stat label={t("print.expenses")} value={String(expenses.length)} />
          <Stat
            label={t("print.settlementsToPerform")}
            value={String(balance.suggestions.length)}
          />
        </div>

        {/* Soldes par membre */}
        <h2
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: 22,
            marginBottom: 12,
            borderBottom: "1px solid #E8D5B7",
            paddingBottom: 6,
          }}
        >
          Soldes par membre
        </h2>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
            marginBottom: 28,
          }}
        >
          <thead>
            <tr
              style={{
                background: "#F4E4C1",
                color: "#16111e",
              }}
            >
              <th style={cellHeader}>Membre</th>
              <th style={{ ...cellHeader, textAlign: "right" }}>
                Solde net ({group.defaultCurrency})
              </th>
            </tr>
          </thead>
          <tbody>
            {balance.balances.map((b: any, i: number) => {
              const v = parseFloat(b.net);
              return (
                <tr
                  key={b.userId}
                  style={{
                    background: i % 2 ? "#FBF7EE" : "#fff",
                  }}
                >
                  <td style={cell}>{b.displayName}</td>
                  <td
                    style={{
                      ...cell,
                      textAlign: "right",
                      color: v > 0 ? "#3F7D5C" : v < 0 ? "#B5462E" : "#666",
                      fontWeight: 600,
                    }}
                  >
                    {v > 0 ? "+" : ""}
                    {v.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Règlements suggérés */}
        {balance.suggestions.length > 0 && (
          <>
            <h2
              style={{
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontSize: 22,
                marginBottom: 12,
                borderBottom: "1px solid #E8D5B7",
                paddingBottom: 6,
              }}
            >
              Règlements suggérés
            </h2>
            <ol
              style={{
                fontSize: 13,
                lineHeight: 2,
                marginBottom: 28,
                paddingLeft: 20,
              }}
            >
              {balance.suggestions.map((s: any, i: number) => (
                <li key={i}>
                  <strong>{s.fromName}</strong> doit{" "}
                  <strong style={{ color: "#B5462E" }}>
                    {parseFloat(s.amount).toFixed(2)} {s.currency}
                  </strong>{" "}
                  à <strong>{s.toName}</strong>
                </li>
              ))}
            </ol>
          </>
        )}

        {/* Liste des dépenses */}
        <h2
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: 22,
            marginBottom: 12,
            borderBottom: "1px solid #E8D5B7",
            paddingBottom: 6,
          }}
        >
          Détail des dépenses
        </h2>
        {expenses.length === 0 ? (
          <p style={{ fontStyle: "italic", color: "#666" }}>
            Aucune dépense enregistrée.
          </p>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 12,
            }}
          >
            <thead>
              <tr style={{ background: "#F4E4C1", color: "#16111e" }}>
                <th style={cellHeader}>Date</th>
                <th style={cellHeader}>Description</th>
                <th style={cellHeader}>Payé par</th>
                <th style={cellHeader}>Mode</th>
                <th style={{ ...cellHeader, textAlign: "right" }}>Montant</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e: any, i: number) => (
                <tr
                  key={e.id}
                  style={{ background: i % 2 ? "#FBF7EE" : "#fff" }}
                >
                  <td style={cell}>
                    {new Date(e.occurredAt).toLocaleDateString("fr-FR")}
                  </td>
                  <td style={cell}>{e.description}</td>
                  <td style={cell}>{e.paidBy.displayName}</td>
                  <td style={{ ...cell, fontSize: 10, color: "#666" }}>
                    {e.splitMode}
                  </td>
                  <td
                    style={{
                      ...cell,
                      textAlign: "right",
                      fontWeight: 600,
                    }}
                  >
                    {parseFloat(e.amount).toFixed(2)}{" "}
                    {e.currency ?? group.defaultCurrency}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: "#16111e", color: "#F4E4C1" }}>
                <td
                  colSpan={4}
                  style={{
                    ...cell,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                  }}
                >
                  Total
                </td>
                <td
                  style={{
                    ...cell,
                    textAlign: "right",
                    fontWeight: 700,
                    color: "#E8A33D",
                  }}
                >
                  {totalAmount.toFixed(2)} {group.defaultCurrency}
                </td>
              </tr>
            </tfoot>
          </table>
        )}

        {/* Pied de page */}
        <div
          style={{
            marginTop: 40,
            borderTop: "1px solid #ddd",
            paddingTop: 12,
            fontSize: 10,
            color: "#999",
            textAlign: "center",
          }}
        >
          Document généré par BMD · L'argent partagé. L'amitié protégée. ·
          backmesdo.com
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "#F4E4C1",
        border: "1px solid #E8A33D",
        borderRadius: 10,
        padding: "12px 14px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "#8E5A3B",
          textTransform: "uppercase",
          letterSpacing: 1.5,
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontSize: 22,
          fontWeight: 700,
          color: "#16111e",
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

const cellHeader: React.CSSProperties = {
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
