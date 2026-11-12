import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 56;
const FOOTER_GAP = 40;

const INK = rgb(0x1b / 255, 0x3a / 255, 0x28 / 255);
const MUTED = rgb(0x4a / 255, 0x6b / 255, 0x52 / 255);
const LINE = rgb(0xdd / 255, 0xe6 / 255, 0xd6 / 255);
const BAND = rgb(0xe8 / 255, 0xf0 / 255, 0xe2 / 255);
const ACCENT = rgb(0x2d / 255, 0x5e / 255, 0x3a / 255);

/**
 * Escape one cell for RFC 4180.
 * A caller that wants spreadsheet-formula guarding does that before this step.
 *
 * @param value - Cell text. Null and undefined become an empty cell.
 */
export function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * Whether a text cell would be executed as a formula by a spreadsheet.
 * A leading minus that is only an integer is left alone, so a negative book value stays a number.
 *
 * @param value - Cell text before RFC 4180 escaping.
 */
function needsFormulaGuard(value: string): boolean {
  if (value.length === 0) {
    return false;
  }
  const first = value[0];
  if (first === "=" || first === "+" || first === "@" || first === "\t" || first === "\r") {
    return true;
  }
  return first === "-" && !/^-\d+$/.test(value);
}

/**
 * Serialize a table as UTF-8 CSV with a byte order mark and CRLF rows.
 * Text that a spreadsheet would treat as a formula is prefixed with a quote mark.
 *
 * @param header - Column names. This row is not a data row.
 * @param rows - Data rows. Each row should have one cell per header column.
 */
export function csvDocument(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const lines = [header, ...rows].map((row) =>
    row
      .map((cell) => {
        const guarded = needsFormulaGuard(cell) ? `'${cell}` : cell;
        return csvCell(guarded);
      })
      .join(","),
  );
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

/**
 * Map characters that Helvetica cannot encode onto ASCII.
 * Standard PDF fonts have no em dash, smart quotes, or bullet.
 *
 * @param value - Text that may contain those characters.
 */
export function winAnsi(value: string): string {
  return value
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2022]/g, "*")
    .replace(/[\u2026]/g, "...")
    .replace(/[^\x00-\xFF]/g, "?");
}

/** One letterhead PDF and the table it was built from. */
export interface LetterheadInput {
  /** University name in the letterhead and the footer. */
  readonly universityName: string;
  /** Department line. "Whole university" when assets are not cut by department. */
  readonly department: string;
  /** Report title. */
  readonly title: string;
  /** Period and filter summary. */
  readonly period: string;
  /** Person who downloaded the file. */
  readonly generatedBy: string;
  /** Clock reading, ISO UTC. */
  readonly generatedAt: string;
  /** Sentences under the header. They are not data rows. */
  readonly notes: readonly string[];
  /** Column names. */
  readonly header: readonly string[];
  /** Data rows, already labelled. */
  readonly rows: readonly (readonly string[])[];
}

/** Bytes of one PDF and how many pages it used. */
export interface LetterheadPdf {
  /** PDF bytes. */
  readonly bytes: Uint8Array;
  /** Page count after the table has flowed. */
  readonly pageCount: number;
}

/**
 * Break text into lines that fit a character budget.
 * A word longer than the budget is split, so a long tag cannot run off the page.
 *
 * @param text - Already passed through `winAnsi` when it will be drawn.
 * @param maxChars - Maximum characters on one line. At least 1.
 */
function wrapText(text: string, maxChars: number): string[] {
  const limit = Math.max(1, maxChars);
  if (text.length <= limit) {
    return [text];
  }
  const out: string[] = [];
  let line = "";
  const pushWord = (word: string) => {
    if (word.length > limit) {
      if (line.length > 0) {
        out.push(line);
        line = "";
      }
      for (let index = 0; index < word.length; index += limit) {
        const slice = word.slice(index, index + limit);
        if (index + limit < word.length) {
          out.push(slice);
        } else {
          line = slice;
        }
      }
      return;
    }
    if (line.length === 0) {
      line = word;
      return;
    }
    if (line.length + 1 + word.length <= limit) {
      line = `${line} ${word}`;
      return;
    }
    out.push(line);
    line = word;
  };
  for (const word of text.split(/\s+/)) {
    if (word.length > 0) {
      pushWord(word);
    }
  }
  if (line.length > 0) {
    out.push(line);
  }
  return out.length > 0 ? out : [""];
}

/**
 * Build the letterhead PDF for one report table.
 * The footer is drawn after the page count is known: university name on the left, `Page n of m` on the right.
 *
 * @param input - Header fields and the same rows the CSV uses.
 */
export async function letterheadPdf(input: LetterheadInput): Promise<LetterheadPdf> {
  const doc = await PDFDocument.create();
  doc.setTitle(winAnsi(input.title));
  doc.setAuthor(winAnsi(input.universityName));
  doc.setCreator("University Smart-Assets");
  doc.setProducer("University Smart-Assets");

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const contentW = PAGE_W - MARGIN * 2;
  const limit = PAGE_H - MARGIN - FOOTER_GAP;

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = 0;

  const drawLeft = (text: string, size: number, font: PDFFont, yTop: number, color = INK, x = MARGIN) => {
    page.drawText(winAnsi(text), {
      x,
      y: PAGE_H - yTop - size,
      size,
      font,
      color,
    });
  };

  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = 0;
  };

  const ensure = (needed: number): boolean => {
    if (y > 0 && y + needed > limit) {
      newPage();
      return true;
    }
    return false;
  };

  const drawWrapped = (text: string, size: number, font: PDFFont, color = INK) => {
    const maxChars = Math.max(8, Math.floor(contentW / font.widthOfTextAtSize("n", size)));
    for (const line of wrapText(winAnsi(text), maxChars)) {
      ensure(size + 5);
      drawLeft(line, size, font, y, color);
      y += size + 5;
    }
  };

  drawWrapped(input.universityName, 16, bold, ACCENT);
  y += 4;
  page.drawLine({
    start: { x: MARGIN, y: PAGE_H - y },
    end: { x: PAGE_W - MARGIN, y: PAGE_H - y },
    thickness: 1.2,
    color: ACCENT,
  });
  y += 16;
  drawWrapped(input.title, 18, bold);
  y += 6;
  drawWrapped(`Department: ${input.department}`, 9.5, regular, MUTED);
  drawWrapped(`Period: ${input.period}`, 9.5, regular, MUTED);
  drawWrapped(`Generated by ${input.generatedBy}`, 9.5, regular, MUTED);
  drawWrapped(`Generated at ${input.generatedAt}`, 9.5, regular, MUTED);
  for (const note of input.notes) {
    drawWrapped(note, 9.5, regular, MUTED);
  }
  y += 8;

  const drawTable = (header: readonly string[], rows: readonly (readonly string[])[]) => {
    const cols = header.length;
    if (cols === 0) {
      return;
    }
    const colW = contentW / cols;
    const cellChars = Math.max(4, Math.floor((colW - 8) / regular.widthOfTextAtSize("n", 8)));

    const paintHeader = () => {
      const wrapped = header.map((cell) => wrapText(winAnsi(cell).toUpperCase(), cellChars));
      const lines = Math.max(1, ...wrapped.map((cell) => cell.length));
      const band = lines * 11 + 8;
      ensure(band + 4);
      page.drawRectangle({
        x: MARGIN,
        y: PAGE_H - y - band,
        width: contentW,
        height: band,
        color: BAND,
      });
      wrapped.forEach((cellLines, index) => {
        cellLines.forEach((line, lineIndex) => {
          drawLeft(line, 8, bold, y + 4 + lineIndex * 11, MUTED, MARGIN + index * colW + 3);
        });
      });
      y += band + 4;
    };

    paintHeader();
    if (rows.length === 0) {
      ensure(16);
      drawLeft("No rows.", 9.5, regular, y, MUTED);
      y += 16;
      return;
    }

    for (const row of rows) {
      const cells = header.map((_, index) => wrapText(winAnsi(row[index] ?? ""), cellChars));
      const lineCount = Math.max(1, ...cells.map((cell) => cell.length));
      const rowH = lineCount * 12 + 6;
      if (ensure(rowH + 4)) {
        paintHeader();
      }
      cells.forEach((cellLines, index) => {
        cellLines.forEach((line, lineIndex) => {
          drawLeft(line, 8.5, regular, y + lineIndex * 12, INK, MARGIN + index * colW + 3);
        });
      });
      y += rowH;
      page.drawLine({
        start: { x: MARGIN, y: PAGE_H - y },
        end: { x: PAGE_W - MARGIN, y: PAGE_H - y },
        thickness: 0.4,
        color: LINE,
      });
      y += 3;
    }
  };

  drawTable(input.header, input.rows);

  const pages = doc.getPages();
  pages.forEach((target, index) => {
    footerOn(target, regular, winAnsi(input.universityName), index + 1, pages.length);
  });
  const bytes = await doc.save();
  return { bytes, pageCount: pages.length };
}

function footerOn(page: PDFPage, font: PDFFont, universityName: string, index: number, total: number): void {
  page.drawText(universityName, {
    x: MARGIN,
    y: 28,
    size: 8,
    font,
    color: MUTED,
  });
  const label = `Page ${index} of ${total}`;
  const width = font.widthOfTextAtSize(label, 8);
  page.drawText(label, {
    x: PAGE_W - MARGIN - width,
    y: 28,
    size: 8,
    font,
    color: MUTED,
  });
}
