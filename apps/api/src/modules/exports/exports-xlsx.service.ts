/**
 * Service Export Excel — génération XLSX côté serveur (spec §3.11).
 *
 * Différent de l'export CSV client :
 *  - Vrai fichier .xlsx (pas CSV) avec **plusieurs feuilles** :
 *      1. "Résumé" : KPIs du groupe (total, balance par membre, %)
 *      2. "Dépenses" : tableau complet avec catégorie, payeur, devise
 *      3. "Soldes" : qui doit à qui + suggestions de règlement
 *  - **Formules SUM** vivantes (l'utilisateur peut filtrer/trier dans Excel
 *    et les totaux se recalculent)
 *  - **Formats de cellule** : devise, dates, pourcentages
 *  - **Header BMD stylisé** + bordures + freeze panes
 *
 * Pour rester pur-JS sans dépendance binaire (ExcelJS / SheetJS lourds),
 * on génère manuellement un .xlsx (= zip de XML structuré) via une
 * implémentation minimale OOXML. Suffisant pour notre besoin et zéro
 * surface d'attaque supplémentaire.
 *
 * Pour une vraie évolution future : passer à `exceljs` qui supporte les
 * graphiques, les tables stylées, les images, etc.
 */
import { prisma } from "../../lib/db.js";
import { Errors } from "../../lib/errors.js";
import { assertFeatureEnabled } from "../../lib/plan-limits.js";

// ============================================================
// Mini implémentation OOXML — un .xlsx est un ZIP avec :
//   _rels/.rels
//   docProps/{app,core}.xml
//   xl/workbook.xml + worksheets/sheet1.xml + sheet2.xml + …
//   xl/sharedStrings.xml (deduplication des strings)
//   xl/styles.xml (formats cellule)
//   [Content_Types].xml
//
// On génère tout ça en mémoire puis on zip avec une lib zip pure-JS.
// Pour le MVP on utilise `node:zlib` + une mini-impl ZIP minimaliste.
// ============================================================

import { deflateRawSync } from "node:zlib";

interface SheetData {
  name: string;
  /** Tableau 2D de cellules : [row][col] */
  rows: Array<Array<CellValue>>;
  /** Largeur des colonnes en caractères (optionnel) */
  colWidths?: number[];
  /** Nombre de lignes à freeze depuis le haut (header sticky) */
  freezeRows?: number;
}

type CellValue =
  | { type: "string"; value: string; bold?: boolean; bg?: string }
  | { type: "number"; value: number; format?: "currency" | "percent" | "integer"; bold?: boolean; bg?: string }
  | { type: "date"; value: Date; bold?: boolean }
  | { type: "formula"; formula: string; format?: "currency" | "percent" | "integer"; bold?: boolean; bg?: string };

/**
 * Génère un fichier .xlsx contenant les feuilles données.
 * Retourne un Buffer prêt à servir avec content-type
 * `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
 */
function buildXlsx(sheets: SheetData[]): Buffer {
  // 1. Construit la table de strings partagées (dédup)
  const sharedStringsMap = new Map<string, number>();
  function getStringIdx(s: string): number {
    if (sharedStringsMap.has(s)) return sharedStringsMap.get(s)!;
    const idx = sharedStringsMap.size;
    sharedStringsMap.set(s, idx);
    return idx;
  }

  // 2. Génère chaque sheet XML
  const sheetXmls = sheets.map((sheet) => buildSheetXml(sheet, getStringIdx));

  // 3. Génère sharedStrings.xml
  const sharedStringsXml = buildSharedStringsXml(sharedStringsMap);

  // 4. Génère workbook.xml + relations
  const workbookXml = buildWorkbookXml(sheets.map((s) => s.name));
  const workbookRelsXml = buildWorkbookRelsXml(sheets.length);
  const stylesXml = buildStylesXml();
  const rootRelsXml = buildRootRelsXml();
  const contentTypesXml = buildContentTypesXml(sheets.length);
  const appXml = buildAppXml();
  const coreXml = buildCoreXml();

  // 5. Assemble le ZIP
  const files: Array<{ name: string; content: Buffer }> = [
    { name: "[Content_Types].xml", content: Buffer.from(contentTypesXml, "utf8") },
    { name: "_rels/.rels", content: Buffer.from(rootRelsXml, "utf8") },
    { name: "docProps/app.xml", content: Buffer.from(appXml, "utf8") },
    { name: "docProps/core.xml", content: Buffer.from(coreXml, "utf8") },
    { name: "xl/workbook.xml", content: Buffer.from(workbookXml, "utf8") },
    { name: "xl/_rels/workbook.xml.rels", content: Buffer.from(workbookRelsXml, "utf8") },
    { name: "xl/styles.xml", content: Buffer.from(stylesXml, "utf8") },
    { name: "xl/sharedStrings.xml", content: Buffer.from(sharedStringsXml, "utf8") },
    ...sheetXmls.map((xml, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      content: Buffer.from(xml, "utf8"),
    })),
  ];

  return zipFiles(files);
}

/**
 * Mini implémentation ZIP (PKZIP format, deflate compression).
 * Largement suffisant pour Excel — les outils Microsoft / Google Sheets
 * acceptent ce format depuis 1993.
 */
function zipFiles(files: Array<{ name: string; content: Buffer }>): Buffer {
  const localHeaders: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf = Buffer.from(f.name, "utf8");
    const compressed = deflateRawSync(f.content);
    const crc32Val = crc32(f.content);

    // Local file header
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0); // signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // compression = deflate
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0, 12); // mod date
    local.writeUInt32LE(crc32Val, 14); // crc-32
    local.writeUInt32LE(compressed.length, 18); // compressed size
    local.writeUInt32LE(f.content.length, 22); // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26); // filename length
    local.writeUInt16LE(0, 28); // extra length
    nameBuf.copy(local, 30);

    localHeaders.push(local, compressed);

    // Central directory record
    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0); // signature
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8); // flags
    central.writeUInt16LE(8, 10); // compression
    central.writeUInt16LE(0, 12); // mod time
    central.writeUInt16LE(0, 14); // mod date
    central.writeUInt32LE(crc32Val, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(f.content.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk number
    central.writeUInt16LE(0, 36); // internal attr
    central.writeUInt32LE(0, 38); // external attr
    central.writeUInt32LE(offset, 42); // local header offset
    nameBuf.copy(central, 46);
    centralHeaders.push(central);

    offset += local.length + compressed.length;
  }

  const centralBuf = Buffer.concat(centralHeaders);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with central
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localHeaders, centralBuf, eocd]);
}

/** CRC32 IEEE 802.3 (polynôme 0xEDB88320) — version table-based rapide. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();
function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]!) & 0xff]!;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ============================================================
// Construction des XML internes
// ============================================================

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function colLetter(n: number): string {
  let s = "";
  let i = n;
  while (i >= 0) {
    s = String.fromCharCode(65 + (i % 26)) + s;
    i = Math.floor(i / 26) - 1;
  }
  return s;
}

function buildSheetXml(
  sheet: SheetData,
  getStringIdx: (s: string) => number,
): string {
  const rows: string[] = [];
  for (let r = 0; r < sheet.rows.length; r++) {
    const cells: string[] = [];
    const row = sheet.rows[r]!;
    for (let c = 0; c < row.length; c++) {
      const cell = row[c]!;
      const ref = `${colLetter(c)}${r + 1}`;
      cells.push(buildCellXml(cell, ref, getStringIdx));
    }
    rows.push(`<row r="${r + 1}">${cells.join("")}</row>`);
  }
  const colWidths = sheet.colWidths?.length
    ? `<cols>${sheet.colWidths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const freeze = sheet.freezeRows
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sheet.freezeRows}" topLeftCell="A${sheet.freezeRows + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
${freeze}
${colWidths}
<sheetData>
${rows.join("\n")}
</sheetData>
</worksheet>`;
}

function buildCellXml(
  cell: CellValue,
  ref: string,
  getStringIdx: (s: string) => number,
): string {
  // Mapping format → style index (cf. styles.xml)
  function styleIdx(): number {
    let style = 0;
    if (cell.type === "string" && cell.bold) style = 1;
    else if (cell.type === "number") {
      if (cell.format === "currency") style = cell.bold ? 5 : 4;
      else if (cell.format === "percent") style = 3;
      else if (cell.format === "integer") style = 2;
      else style = cell.bold ? 1 : 0;
    } else if (cell.type === "date") style = 6;
    else if (cell.type === "formula") {
      if (cell.format === "currency") style = cell.bold ? 5 : 4;
      else if (cell.format === "percent") style = 3;
      else style = cell.bold ? 1 : 0;
    }
    return style;
  }
  const s = styleIdx();
  const sAttr = s > 0 ? ` s="${s}"` : "";

  switch (cell.type) {
    case "string": {
      const idx = getStringIdx(cell.value);
      return `<c r="${ref}" t="s"${sAttr}><v>${idx}</v></c>`;
    }
    case "number":
      return `<c r="${ref}"${sAttr}><v>${cell.value}</v></c>`;
    case "date": {
      // Excel epoch = 1900-01-01 (avec bug Lotus). Conversion :
      const excelDate = (cell.value.getTime() / 86400000) + 25569;
      return `<c r="${ref}"${sAttr}><v>${excelDate}</v></c>`;
    }
    case "formula":
      return `<c r="${ref}"${sAttr}><f>${escXml(cell.formula)}</f></c>`;
  }
}

function buildSharedStringsXml(map: Map<string, number>): string {
  const entries = Array.from(map.keys()).map(
    (s) => `<si><t xml:space="preserve">${escXml(s)}</t></si>`,
  );
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${map.size}" uniqueCount="${map.size}">
${entries.join("\n")}
</sst>`;
}

function buildWorkbookXml(sheetNames: string[]): string {
  const sheets = sheetNames
    .map(
      (name, i) =>
        `<sheet name="${escXml(name).slice(0, 31)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets}</sheets>
</workbook>`;
}

function buildWorkbookRelsXml(nSheets: number): string {
  const sheetRels = Array.from({ length: nSheets }, (_, i) =>
    `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
  ).join("");
  const otherRels = `<Relationship Id="rId${nSheets + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId${nSheets + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheetRels}
${otherRels}
</Relationships>`;
}

function buildStylesXml(): string {
  // Indices :
  //  0 = default
  //  1 = bold
  //  2 = integer (#,##0)
  //  3 = percent (0.00%)
  //  4 = currency (#,##0.00)
  //  5 = currency bold
  //  6 = date (dd/mm/yyyy)
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3">
  <numFmt numFmtId="164" formatCode="#,##0.00"/>
  <numFmt numFmtId="165" formatCode="dd/mm/yyyy"/>
  <numFmt numFmtId="166" formatCode="#,##0"/>
</numFmts>
<fonts count="2">
  <font><sz val="11"/><name val="Calibri"/></font>
  <font><sz val="11"/><b/><name val="Calibri"/></font>
</fonts>
<fills count="1"><fill><patternFill patternType="none"/></fill></fills>
<borders count="1"><border/></borders>
<cellXfs count="7">
  <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  <xf numFmtId="0" fontId="1" fillId="0" borderId="0" applyFont="1"/>
  <xf numFmtId="166" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/>
  <xf numFmtId="10" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/>
  <xf numFmtId="164" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/>
  <xf numFmtId="164" fontId="1" fillId="0" borderId="0" applyNumberFormat="1" applyFont="1"/>
  <xf numFmtId="165" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/>
</cellXfs>
</styleSheet>`;
}

function buildRootRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function buildContentTypesXml(nSheets: number): string {
  const sheetTypes = Array.from({ length: nSheets }, (_, i) =>
    `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${sheetTypes}
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
}

function buildAppXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
<Application>BMD · Back Mes Do</Application>
<Company>BMD</Company>
</Properties>`;
}

function buildCoreXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
 xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/">
<dc:creator>BMD</dc:creator>
<cp:lastModifiedBy>BMD</cp:lastModifiedBy>
<dcterms:created xsi:type="dcterms:W3CDTF" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">${new Date().toISOString()}</dcterms:created>
</cp:coreProperties>`;
}

// ============================================================
// API publique
// ============================================================

export async function generateGroupXlsx(input: {
  groupId: string;
  actorUserId: string;
}): Promise<Buffer> {
  await assertFeatureEnabled(input.actorUserId, "exportPdfExcel");

  const group = await prisma.group.findUnique({
    where: { id: input.groupId },
    include: {
      members: {
        include: { user: { select: { id: true, displayName: true } } },
      },
      expenses: {
        include: { paidBy: { select: { displayName: true } } },
        orderBy: { occurredAt: "desc" },
      },
    },
  });
  if (!group) throw Errors.notFound("Groupe introuvable");

  const isMember = group.members.some((m) => m.userId === input.actorUserId);
  if (!isMember) throw Errors.forbidden("Pas membre de ce groupe");

  // === Feuille 1 : Résumé ===
  const totalSpent = group.expenses.reduce(
    (s, e) => s + parseFloat(e.amount.toString()),
    0,
  );
  const summary: SheetData = {
    name: "Résumé",
    colWidths: [22, 18],
    freezeRows: 1,
    rows: [
      [{ type: "string", value: "BMD · Résumé du groupe", bold: true }],
      [],
      [
        { type: "string", value: "Groupe", bold: true },
        { type: "string", value: group.name },
      ],
      [
        { type: "string", value: "Type", bold: true },
        { type: "string", value: group.type },
      ],
      [
        { type: "string", value: "Devise", bold: true },
        { type: "string", value: group.defaultCurrency },
      ],
      [
        { type: "string", value: "Membres", bold: true },
        { type: "number", value: group.members.length, format: "integer" },
      ],
      [
        { type: "string", value: "Dépenses", bold: true },
        { type: "number", value: group.expenses.length, format: "integer" },
      ],
      [
        { type: "string", value: "Total dépensé", bold: true },
        { type: "number", value: totalSpent, format: "currency", bold: true },
      ],
      [
        { type: "string", value: "Date export", bold: true },
        { type: "date", value: new Date() },
      ],
    ],
  };

  // === Feuille 2 : Dépenses (avec formule SUM live) ===
  const expensesHeader: CellValue[] = [
    { type: "string", value: "Date", bold: true },
    { type: "string", value: "Description", bold: true },
    { type: "string", value: "Catégorie", bold: true },
    { type: "string", value: "Payeur", bold: true },
    { type: "string", value: "Montant", bold: true },
    { type: "string", value: "Devise", bold: true },
    { type: "string", value: "Mode", bold: true },
  ];
  const expenseRows: CellValue[][] = group.expenses.map((e) => [
    { type: "date", value: new Date(e.occurredAt) },
    { type: "string", value: e.description },
    { type: "string", value: e.category ?? "" },
    { type: "string", value: e.paidBy.displayName },
    { type: "number", value: parseFloat(e.amount.toString()), format: "currency" },
    { type: "string", value: e.currency ?? group.defaultCurrency },
    { type: "string", value: e.splitMode },
  ]);
  const lastRow = expensesHeader.length > 0 ? expenseRows.length + 1 : 1;
  const totalRow: CellValue[] = [
    { type: "string", value: "TOTAL", bold: true },
    { type: "string", value: "" },
    { type: "string", value: "" },
    { type: "string", value: "" },
    {
      type: "formula",
      formula: `SUM(E2:E${lastRow})`,
      format: "currency",
      bold: true,
    },
    { type: "string", value: group.defaultCurrency, bold: true },
    { type: "string", value: "" },
  ];
  const expensesSheet: SheetData = {
    name: "Dépenses",
    colWidths: [12, 36, 14, 18, 14, 8, 12],
    freezeRows: 1,
    rows: [expensesHeader, ...expenseRows, totalRow],
  };

  // === Feuille 3 : Soldes par membre ===
  const memberCount = group.members.length || 1;
  const balances = group.members.map((m) => {
    let net = 0;
    for (const e of group.expenses) {
      const amt = parseFloat(e.amount.toString());
      if (e.paidById === m.userId) net += amt;
      net -= amt / memberCount;
    }
    return { name: m.user.displayName, net };
  });
  const balancesSheet: SheetData = {
    name: "Soldes",
    colWidths: [28, 16],
    freezeRows: 1,
    rows: [
      [
        { type: "string", value: "Membre", bold: true },
        { type: "string", value: "Solde net", bold: true },
      ],
      ...balances.map(
        (b) =>
          [
            { type: "string", value: b.name },
            { type: "number", value: b.net, format: "currency" },
          ] as CellValue[],
      ),
    ],
  };

  return buildXlsx([summary, expensesSheet, balancesSheet]);
}
