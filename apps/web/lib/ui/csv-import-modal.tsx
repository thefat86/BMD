"use client";

/**
 * Modal d'import CSV en lot pour un groupe (spec §8.4).
 *
 * Format attendu :
 *   description,amount,occurredAt,category
 *   Resto Le Petit Mboa,67.40,2026-04-15,Restaurant
 *   Plein essence,42.50,15/04/2026,Transport
 *
 * Comportement :
 *  - Parse côté client (gestion virgule/point décimale, dates flexibles)
 *  - POST /groups/:id/expenses/import-csv qui crée chaque dépense en EQUAL
 *  - Affichage du rapport d'import (succès / échecs ligne par ligne)
 *  - L'utilisateur peut ensuite éditer chaque dépense pour ajuster mode/parts
 */
import { useRef, useState } from "react";
import { api } from "../api-client";
import { useToast } from "./toast";

interface ParsedRow {
  description: string;
  amount: string;
  occurredAt?: string;
  category?: string;
}

interface Props {
  open: boolean;
  groupId: string;
  onClose: () => void;
  onImported: () => void;
}

export function CsvImportModal({
  open,
  groupId,
  onClose,
  onImported,
}: Props): JSX.Element | null {
  const toast = useToast();
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<any | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) ?? "";
      try {
        const parsed = parseCsv(text);
        setRows(parsed);
        setReport(null);
      } catch (err) {
        toast.error(`Erreur de parsing : ${(err as Error).message}`);
      }
    };
    reader.readAsText(file, "UTF-8");
  }

  async function doImport() {
    if (rows.length === 0) return;
    setImporting(true);
    try {
      const r = await api.importCsvExpenses(groupId, rows);
      setReport(r);
      if (r.success > 0) {
        toast.success(
          `${r.success}/${r.total} dépenses importées${r.failed > 0 ? ` (${r.failed} échec)` : ""}`,
        );
        onImported();
      }
      if (r.failed === r.total) {
        toast.error("Aucune dépense n'a pu être importée. Vérifie le format.");
      }
    } catch (e) {
      toast.error(e);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(14,11,20,0.85)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        zIndex: 9990,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding:
          "calc(env(safe-area-inset-top, 0) + 16px) 16px calc(env(safe-area-inset-bottom, 0) + 16px)",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          background: "linear-gradient(180deg, #16111E 0%, #1F1429 100%)",
          border: "1px solid rgba(232,163,61,0.18)",
          borderRadius: 18,
          maxWidth: 560,
          width: "100%",
          padding: 20,
          color: "#F4E4C1",
          maxHeight: "calc(100dvh - 32px)",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <h2
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 22,
              margin: 0,
            }}
          >
            📥 Importer depuis CSV
          </h2>
          <button
            onClick={onClose}
            aria-label="Fermer"
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.05)",
              border: "none",
              color: "#F4E4C1",
              cursor: "pointer",
              fontSize: 16,
            }}
          >
            ✕
          </button>
        </div>

        <p style={{ fontSize: 12, color: "#E8D5B7", marginBottom: 12 }}>
          Format : <code>description,amount,occurredAt,category</code>
          <br />
          Une ligne par dépense. Les dépenses seront créées en mode{" "}
          <strong>égal entre tous les membres</strong> avec toi comme payeur.
          Tu pourras ensuite ajuster chacune.
        </p>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
          style={{ display: "none" }}
        />

        {rows.length === 0 && !report && (
          <button
            onClick={() => fileRef.current?.click()}
            type="button"
            style={{
              padding: "12px 16px",
              background: "rgba(232,163,61,0.08)",
              color: "var(--saffron, #E8A33D)",
              border: "1.5px dashed var(--saffron, #E8A33D)",
              borderRadius: 12,
              cursor: "pointer",
              fontSize: 14,
              width: "100%",
              fontFamily: "inherit",
              minHeight: 50,
            }}
          >
            🖼 Choisir un fichier CSV
          </button>
        )}

        {rows.length > 0 && !report && (
          <>
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                color: "var(--gold, #C9A24A)",
                marginBottom: 8,
              }}
            >
              ✓ {rows.length} ligne{rows.length > 1 ? "s" : ""} parsée
              {rows.length > 1 ? "s" : ""}
            </div>
            <div
              style={{
                background: "rgba(0,0,0,0.3)",
                border: "1px solid rgba(244,228,193,0.08)",
                borderRadius: 8,
                padding: 8,
                maxHeight: 200,
                overflowY: "auto",
                fontSize: 11,
                fontFamily: "monospace",
                marginBottom: 12,
              }}
            >
              {rows.slice(0, 20).map((r, i) => (
                <div key={i} style={{ padding: "2px 0", color: "#E8D5B7" }}>
                  {r.description.slice(0, 40)} · {r.amount}€
                  {r.occurredAt && ` · ${r.occurredAt}`}
                  {r.category && ` · ${r.category}`}
                </div>
              ))}
              {rows.length > 20 && (
                <div style={{ color: "#8A7B6B" }}>
                  ... et {rows.length - 20} autres
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => {
                  setRows([]);
                  if (fileRef.current) fileRef.current.value = "";
                }}
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  background: "rgba(255,255,255,0.04)",
                  color: "#F4E4C1",
                  border: "1px solid rgba(244,228,193,0.08)",
                  borderRadius: 10,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  minHeight: 46,
                }}
              >
                Annuler
              </button>
              <button
                onClick={doImport}
                disabled={importing}
                style={{
                  flex: 2,
                  padding: "12px 16px",
                  background:
                    "linear-gradient(135deg, #E8A33D, #B5462E)",
                  color: "#16111E",
                  border: "none",
                  borderRadius: 10,
                  cursor: importing ? "wait" : "pointer",
                  fontWeight: 700,
                  fontFamily: "inherit",
                  minHeight: 46,
                }}
              >
                {importing
                  ? "Import en cours…"
                  : `✓ Importer ${rows.length} dépense${rows.length > 1 ? "s" : ""}`}
              </button>
            </div>
          </>
        )}

        {report && (
          <>
            <div
              style={{
                background:
                  report.failed === 0
                    ? "rgba(63,125,92,0.1)"
                    : "rgba(232,163,61,0.1)",
                border:
                  report.failed === 0
                    ? "1px solid rgba(63,125,92,0.3)"
                    : "1px solid rgba(232,163,61,0.3)",
                borderRadius: 10,
                padding: 12,
                marginBottom: 12,
                fontSize: 13,
              }}
            >
              <strong>
                {report.success}/{report.total} importées
              </strong>
              {report.failed > 0 && ` · ${report.failed} échec(s)`}
            </div>
            {report.failed > 0 && (
              <div
                style={{
                  background: "rgba(0,0,0,0.3)",
                  borderRadius: 8,
                  padding: 8,
                  fontSize: 11,
                  fontFamily: "monospace",
                  maxHeight: 180,
                  overflowY: "auto",
                }}
              >
                {report.results
                  .filter((r: any) => !r.ok)
                  .map((r: any, i: number) => (
                    <div
                      key={i}
                      style={{
                        color: "#D9714A",
                        padding: "2px 0",
                      }}
                    >
                      ✕ {r.description.slice(0, 30)} : {r.error}
                    </div>
                  ))}
              </div>
            )}
            <button
              onClick={onClose}
              style={{
                marginTop: 12,
                padding: "12px 16px",
                background: "linear-gradient(135deg, #E8A33D, #B5462E)",
                color: "#16111E",
                border: "none",
                borderRadius: 10,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
                width: "100%",
                minHeight: 46,
              }}
            >
              ✓ Fermer
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Parser CSV minimal mais tolérant : gère
 *  - séparateur virgule (par défaut)
 *  - guillemets pour les valeurs avec virgules : "A, B",10.50
 *  - première ligne header optionnelle (détectée si "description" et "amount")
 *  - lignes vides ignorées
 */
function parseCsv(text: string): ParsedRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) throw new Error("Fichier vide");

  // Détection header
  let startIdx = 0;
  const firstLower = lines[0].toLowerCase();
  if (firstLower.includes("description") && firstLower.includes("amount")) {
    startIdx = 1;
  }

  const rows: ParsedRow[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    if (cells.length < 2) continue;
    const description = cells[0]?.trim();
    const amount = cells[1]?.trim().replace(/[€$£¥\s]/g, "");
    if (!description || !amount) continue;
    if (!/^\d+([,.]\d{1,4})?$/.test(amount)) continue;
    rows.push({
      description,
      amount,
      occurredAt: cells[2]?.trim() || undefined,
      category: cells[3]?.trim() || undefined,
    });
  }
  if (rows.length === 0) {
    throw new Error("Aucune ligne valide trouvée");
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Échappement double-quote
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += c;
    }
  }
  cells.push(current);
  return cells;
}
