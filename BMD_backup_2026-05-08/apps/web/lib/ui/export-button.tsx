"use client";

/**
 * <ExportButton> · Bouton "Exporter en Excel" générique.
 *
 * Génère un CSV UTF-8 BOM + séparateur ; (qui s'ouvre tel quel dans Excel,
 * Numbers et Google Sheets — pas besoin de Power Query). Téléchargement
 * immédiat côté client, aucun appel serveur.
 *
 * Usage :
 *   <ExportButton
 *     filename="depenses-coloc-pigalle"
 *     rows={expenses}
 *     columns={[
 *       { header: "Date", get: (e) => new Date(e.occurredAt) },
 *       { header: "Libellé", get: (e) => e.description },
 *       { header: "Montant", get: (e) => parseFloat(e.amount) },
 *       { header: "Devise", get: (e) => e.currency },
 *       { header: "Payeur", get: (e) => e.paidBy.displayName },
 *     ]}
 *   />
 */

import { downloadCsv, dateStampedFilename, type CsvColumn } from "../csv-export";

interface Props<T> {
  /** Nom du fichier (sans extension — sera datestampé automatiquement). */
  filename: string;
  rows: T[];
  columns: CsvColumn<T>[];
  /** Texte du bouton (défaut "📊 Exporter en Excel"). */
  label?: string;
  className?: string;
  style?: React.CSSProperties;
  /** Désactive le bouton si la liste est vide ou en chargement. */
  disabled?: boolean;
}

export function ExportButton<T>({
  filename,
  rows,
  columns,
  label = "📊 Exporter en Excel",
  className,
  style,
  disabled,
}: Props<T>) {
  function handleClick() {
    if (rows.length === 0) return;
    downloadCsv(dateStampedFilename(filename), rows, columns);
  }
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || rows.length === 0}
      className={className ?? "btn-ghost btn-sm"}
      title={
        rows.length === 0
          ? "Rien à exporter pour l'instant"
          : `Télécharger ${rows.length} ligne${rows.length > 1 ? "s" : ""} au format CSV (Excel, Numbers, Sheets)`
      }
      style={{
        padding: "6px 12px",
        fontSize: 12,
        ...style,
      }}
    >
      {label}
    </button>
  );
}
