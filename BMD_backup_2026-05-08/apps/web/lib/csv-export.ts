/**
 * Générateur CSV compatible Excel / Numbers / Google Sheets.
 *
 * Spécificités importantes pour ouvrir dans Excel sans souci :
 *  - BOM UTF-8 en début de fichier (sinon Excel mange les accents en latin-1)
 *  - Séparateur point-virgule pour les locales FR (Excel-FR utilise ; par défaut)
 *  - Quote uniquement les cellules contenant ", ; ou \n
 *  - Décimales avec virgule (locale française)
 *
 * Format produit : RFC 4180 + BOM, encoding UTF-8.
 *
 * Pas de dépendance npm — pure fonction. Le fichier .csv s'ouvre nativement
 * dans Excel via "Données → À partir du texte/CSV" ou simplement double-clic.
 */

const BOM = "\ufeff";

export interface CsvColumn<T> {
  /** En-tête affiché (ex: "Date", "Montant", "Payeur") */
  header: string;
  /** Extrait la valeur depuis un objet du dataset */
  get: (row: T) => string | number | Date | null | undefined;
  /**
   * Format optionnel. Par défaut :
   *  - Date → ISO YYYY-MM-DD
   *  - number → toString avec virgule décimale (FR)
   *  - string → tel quel
   */
  format?: (value: string | number | Date | null | undefined) => string;
}

function defaultFormat(v: string | number | Date | null | undefined): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    // ISO court : YYYY-MM-DD HH:MM (compact, lisible Excel)
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())} ${pad(v.getHours())}:${pad(v.getMinutes())}`;
  }
  if (typeof v === "number") {
    // Virgule décimale FR
    return v.toString().replace(".", ",");
  }
  return String(v);
}

function escapeCell(value: string, separator: string): string {
  // Si la cellule contient le séparateur, des guillemets ou un saut de ligne → on quote
  if (
    value.includes(separator) ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Génère le contenu CSV en string.
 */
export function buildCsv<T>(
  rows: T[],
  columns: CsvColumn<T>[],
  opts?: { separator?: ";" | "," },
): string {
  const sep = opts?.separator ?? ";";
  const lines: string[] = [];

  // En-tête
  lines.push(columns.map((c) => escapeCell(c.header, sep)).join(sep));

  // Données
  for (const row of rows) {
    const cells = columns.map((c) => {
      const raw = c.get(row);
      const formatted = c.format ? c.format(raw) : defaultFormat(raw);
      return escapeCell(formatted, sep);
    });
    lines.push(cells.join(sep));
  }

  // \r\n pour compat Excel-Windows
  return BOM + lines.join("\r\n");
}

/**
 * Déclenche le téléchargement d'un CSV depuis le navigateur.
 * Pratique : aucun upload serveur, tout se passe localement.
 */
export function downloadCsv<T>(
  filename: string,
  rows: T[],
  columns: CsvColumn<T>[],
  opts?: { separator?: ";" | "," },
): void {
  const content = buildCsv(rows, columns, opts);
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  // Force le suffixe .csv et inclut la date pour éviter les écrasements
  const safeName = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Nettoie après un court délai (sinon Safari peut couper le download)
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Helper : nom de fichier datestampé (ex: "depenses-coloc-2026-05-06").
 */
export function dateStampedFilename(prefix: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${prefix}-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
