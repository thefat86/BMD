/**
 * Stub declaration for `pdf-parse`.
 *
 * Le package n'a pas de @types officiels. On déclare juste le minimum
 * utilisé par BMD : la fonction par défaut qui prend un Buffer et
 * renvoie le texte extrait.
 */
declare module "pdf-parse" {
  interface PDFData {
    text: string;
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: Record<string, unknown> | null;
    version: string;
  }

  function pdfParse(
    dataBuffer: Buffer | Uint8Array,
    options?: Record<string, unknown>,
  ): Promise<PDFData>;

  export = pdfParse;
}
