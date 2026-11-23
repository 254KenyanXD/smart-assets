import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const TOP = 28;
const FOOTER_Y = 28;
const DAYSTAR_UNIVERSITY = "Daystar University";
const EAST_AFRICA_OFFSET_MS = 3 * 60 * 60 * 1000;
const FOOTNOTE_AFTER = 140;

const INK = rgb(0x1b / 255, 0x3a / 255, 0x28 / 255);
const MUTED = rgb(0x4a / 255, 0x6b / 255, 0x52 / 255);
const LINE = rgb(0xdd / 255, 0xe6 / 255, 0xd6 / 255);
const BAND = rgb(0xe8 / 255, 0xf0 / 255, 0xe2 / 255);
const ACCENT = rgb(0x2d / 255, 0x5e / 255, 0x3a / 255);

export function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

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

export function winAnsi(value: string): string {
  return value
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2022]/g, "*")
    .replace(/[\u2026]/g, "...")
    .replace(/[^\x00-\xFF]/g, "?");
}

export interface LetterheadInput {
  readonly universityName: string;

  readonly department: string;

  readonly title: string;

  readonly period: string;

  readonly generatedBy: string;

  readonly generatedAt: string;

  readonly notes: readonly string[];

  readonly header: readonly string[];

  readonly rows: readonly (readonly string[])[];
}

export interface LetterheadPdf {
  readonly bytes: Uint8Array;

  readonly pageCount: number;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function wrapToWidth(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const words = winAnsi(text)
    .split(/\s+/)
    .filter((word) => word.length > 0);
  if (words.length === 0) {
    return [""];
  }
  const lines: string[] = [];
  let line = "";
  const push = (word: string) => {
    if (font.widthOfTextAtSize(word, size) > maxWidth) {
      if (line.length > 0) {
        lines.push(line);
        line = "";
      }
      let chunk = "";
      for (const char of word) {
        const next = chunk + char;
        if (font.widthOfTextAtSize(next, size) > maxWidth && chunk.length > 0) {
          lines.push(chunk);
          chunk = char;
        } else {
          chunk = next;
        }
      }
      line = chunk;
      return;
    }
    if (line.length === 0) {
      line = word;
      return;
    }
    const next = `${line} ${word}`;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      line = next;
      return;
    }
    lines.push(line);
    line = word;
  };
  for (const word of words) {
    push(word);
  }
  if (line.length > 0) {
    lines.push(line);
  }
  return lines;
}

function eastAfricaStamp(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    return iso;
  }
  const eat = new Date(parsed + EAST_AFRICA_OFFSET_MS);
  const month = MONTHS[eat.getUTCMonth()] ?? "";
  const hours = String(eat.getUTCHours()).padStart(2, "0");
  const minutes = String(eat.getUTCMinutes()).padStart(2, "0");
  return `${eat.getUTCDate()} ${month} ${eat.getUTCFullYear()}, ${hours}:${minutes} EAT`;
}

function columnWidths(
  header: readonly string[],
  rows: readonly (readonly string[])[],
  bold: PDFFont,
  regular: PDFFont,
  contentW: number,
): number[] {
  const headerSize = 7.5;
  const bodySize = 8.5;
  const natural = header.map((cell, index) => {
    const headW = bold.widthOfTextAtSize(
      winAnsi(cell).toUpperCase(),
      headerSize,
    );
    const bodyW = Math.max(
      0,
      ...rows.map((row) =>
        regular.widthOfTextAtSize(winAnsi(row[index] ?? ""), bodySize),
      ),
    );
    return Math.max(headW, Math.min(bodyW, 108)) + 12;
  });
  const sum = natural.reduce((total, width) => total + width, 0);
  if (natural.length === 0 || sum <= 0) {
    return natural;
  }
  if (sum <= contentW) {
    const extra = contentW - sum;
    return natural.map((width) => width + (extra * width) / sum);
  }
  return natural.map((width) => (width * contentW) / sum);
}

function readLetterheadPng(name: string): Uint8Array {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "letterhead");
  return readFileSync(join(dir, name));
}

/** Report PDF with the custody mark, the university name, and one table. */
export async function letterheadPdf(
  input: LetterheadInput,
): Promise<LetterheadPdf> {
  const doc = await PDFDocument.create();
  doc.setTitle(winAnsi(input.title));
  doc.setAuthor(winAnsi(input.universityName));
  doc.setCreator("University Smart-Assets");
  doc.setProducer("University Smart-Assets");

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const custody = await doc.embedPng(readLetterheadPng("custody-mark.png"));
  const crest =
    input.universityName === DAYSTAR_UNIVERSITY
      ? await doc.embedPng(readLetterheadPng("daystar-wordmark.png"))
      : null;
  const contentW = PAGE_W - MARGIN * 2;
  const noteText = input.notes.join(" ");
  const noteIsFoot = noteText.length > FOOTNOTE_AFTER;
  const footLines = noteIsFoot
    ? wrapToWidth(noteText, regular, 8, contentW)
    : [];
  const footBlock = noteIsFoot ? 26 + footLines.length * 11 : 0;
  const tableFloor = FOOTER_Y + 16 + footBlock;
  const tableLimit = PAGE_H - tableFloor;

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = TOP;

  const textAt = (
    target: PDFPage,
    text: string,
    x: number,
    yTop: number,
    size: number,
    font: PDFFont,
    color = INK,
  ) => {
    target.drawText(winAnsi(text), {
      x,
      y: PAGE_H - yTop - size,
      size,
      font,
      color,
    });
  };

  const paintIdentity = () => {
    const logoH = 36;
    if (crest) {
      const logoW = logoH * (crest.width / crest.height);
      page.drawImage(crest, {
        x: MARGIN,
        y: PAGE_H - y - logoH,
        width: logoW,
        height: logoH,
      });
    } else {
      paintUniversityName(page, input.universityName, y, logoH, bold, contentW);
    }
    paintProduct(page, y, logoH, bold, custody);
    y += logoH + 12;
    textAt(page, input.title, MARGIN, y, 16, bold);
    const when = eastAfricaStamp(input.generatedAt);
    const whenW = regular.widthOfTextAtSize(when, 9);
    textAt(page, when, PAGE_W - MARGIN - whenW, y + 5, 9, regular, MUTED);
    y += 22;
    page.drawLine({
      start: { x: MARGIN, y: PAGE_H - y },
      end: { x: PAGE_W - MARGIN, y: PAGE_H - y },
      thickness: 1.1,
      color: ACCENT,
    });
    y += 12;
    y += paintFacts(page, y, contentW, bold, regular, input);
    if (!noteIsFoot && noteText.length > 0) {
      for (const line of wrapToWidth(noteText, regular, 8, contentW)) {
        textAt(page, line, MARGIN, y, 8, regular, MUTED);
        y += 11;
      }
      y += 6;
    }
  };

  paintIdentity();

  const headerSize = 7.5;
  const bodySize = 8.5;
  const widths = columnWidths(
    input.header,
    input.rows,
    bold,
    regular,
    contentW,
  );

  const paintHeader = () => {
    if (widths.length === 0) {
      return;
    }
    const wrapped = input.header.map((cell, index) =>
      wrapToWidth(
        cell.toUpperCase(),
        bold,
        headerSize,
        Math.max(8, (widths[index] ?? 40) - 8),
      ),
    );
    const lines = Math.max(1, ...wrapped.map((cell) => cell.length));
    const band = lines * 10 + 8;
    page.drawRectangle({
      x: MARGIN,
      y: PAGE_H - y - band,
      width: contentW,
      height: band,
      color: BAND,
    });
    let x = MARGIN;
    wrapped.forEach((cellLines, index) => {
      cellLines.forEach((line, lineIndex) => {
        textAt(
          page,
          line,
          x + 4,
          y + 4 + lineIndex * 10,
          headerSize,
          bold,
          MUTED,
        );
      });
      x += widths[index] ?? 0;
    });
    y += band;
  };

  paintHeader();
  if (input.rows.length === 0 && widths.length > 0) {
    textAt(page, "No rows.", MARGIN, y + 4, 9, regular, MUTED);
  }

  let rowTop = y;
  for (const row of input.rows) {
    const cells = input.header.map((_, index) =>
      wrapToWidth(
        row[index] ?? "",
        regular,
        bodySize,
        Math.max(8, (widths[index] ?? 40) - 8),
      ),
    );
    const lineCount = Math.max(1, ...cells.map((cell) => cell.length));
    const rowH = lineCount * 11 + 7;
    if (y + rowH > tableLimit && y > rowTop) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = TOP;
      paintIdentity();
      paintHeader();
      rowTop = y;
    }
    let x = MARGIN;
    cells.forEach((cellLines, index) => {
      cellLines.forEach((line, lineIndex) => {
        textAt(page, line, x + 4, y + 4 + lineIndex * 11, bodySize, regular);
      });
      x += widths[index] ?? 0;
    });
    y += rowH;
    page.drawLine({
      start: { x: MARGIN, y: PAGE_H - y },
      end: { x: PAGE_W - MARGIN, y: PAGE_H - y },
      thickness: 0.4,
      color: LINE,
    });
  }

  const pages = doc.getPages();
  pages.forEach((target, index) => {
    if (noteIsFoot && index === pages.length - 1) {
      paintFootnote(target, footLines, regular);
    }
    paintFooter(
      target,
      regular,
      winAnsi(input.universityName),
      index + 1,
      pages.length,
    );
  });
  const bytes = await doc.save();
  return { bytes, pageCount: pages.length };
}

function paintUniversityName(
  page: PDFPage,
  name: string,
  y: number,
  logoH: number,
  bold: PDFFont,
  contentW: number,
): void {
  const size = 12;
  const productW = bold.widthOfTextAtSize("University Smart-Assets", 10);
  const maxWidth = Math.max(120, contentW - 36 - productW - 24);
  const lines = wrapToWidth(name, bold, size, maxWidth);
  const block = Math.max(1, lines.length) * 14;
  const top = y + Math.max(0, (logoH - block) / 2);
  lines.forEach((line, index) => {
    page.drawText(winAnsi(line), {
      x: MARGIN,
      y: PAGE_H - (top + index * 14) - size,
      size,
      font: bold,
      color: ACCENT,
    });
  });
}

function paintProduct(
  page: PDFPage,
  y: number,
  logoH: number,
  bold: PDFFont,
  custody: PDFImage,
): void {
  const badge = 36;
  const badgeX = PAGE_W - MARGIN - badge;
  page.drawImage(custody, {
    x: badgeX,
    y: PAGE_H - y - badge,
    width: badge,
    height: badge,
  });
  const product = "University Smart-Assets";
  const productSize = 10;
  const productW = bold.widthOfTextAtSize(product, productSize);
  page.drawText(product, {
    x: badgeX - 8 - productW,
    y: PAGE_H - y - (logoH + productSize) / 2,
    size: productSize,
    font: bold,
    color: ACCENT,
  });
}

function paintFacts(
  page: PDFPage,
  y: number,
  contentW: number,
  bold: PDFFont,
  regular: PDFFont,
  input: LetterheadInput,
): number {
  const colW = (contentW - 16) / 2;
  const left: readonly (readonly [string, string])[] = [
    ["Department", input.department],
    ["Period", input.period],
  ];
  const right: readonly (readonly [string, string])[] = [
    ["Prepared by", input.generatedBy],
  ];
  const height = (facts: readonly (readonly [string, string])[]) =>
    facts.reduce((sum, [label, value]) => {
      const labelW = bold.widthOfTextAtSize(label, 8) + 8;
      return (
        sum +
        Math.max(1, wrapToWidth(value, regular, 9, colW - labelW).length) * 12
      );
    }, 0);
  const blockH = Math.max(height(left), height(right));
  const draw = (facts: readonly (readonly [string, string])[], x: number) => {
    let cursor = y;
    for (const [label, value] of facts) {
      page.drawText(winAnsi(label), {
        x,
        y: PAGE_H - (cursor + 1) - 8,
        size: 8,
        font: bold,
        color: MUTED,
      });
      const labelW = bold.widthOfTextAtSize(label, 8) + 8;
      const lines = wrapToWidth(value, regular, 9, colW - labelW);
      lines.forEach((line, index) => {
        page.drawText(winAnsi(line), {
          x: x + labelW,
          y: PAGE_H - (cursor + index * 12) - 9,
          size: 9,
          font: regular,
          color: INK,
        });
      });
      cursor += Math.max(1, lines.length) * 12;
    }
  };
  draw(left, MARGIN);
  draw(right, MARGIN + colW + 16);
  return blockH + 8;
}

function paintFootnote(
  page: PDFPage,
  lines: readonly string[],
  font: PDFFont,
): void {
  const blockTop = FOOTER_Y + 36 + lines.length * 11;
  page.drawLine({
    start: { x: MARGIN, y: blockTop + 6 },
    end: { x: PAGE_W - MARGIN, y: blockTop + 6 },
    thickness: 0.4,
    color: LINE,
  });
  lines.forEach((line, lineIndex) => {
    page.drawText(winAnsi(line), {
      x: MARGIN,
      y: blockTop - lineIndex * 11 - 8,
      size: 8,
      font,
      color: MUTED,
    });
  });
}

function paintFooter(
  page: PDFPage,
  font: PDFFont,
  universityName: string,
  index: number,
  total: number,
): void {
  page.drawText(universityName, {
    x: MARGIN,
    y: FOOTER_Y,
    size: 8,
    font,
    color: MUTED,
  });
  const label = `Page ${index} of ${total}`;
  const width = font.widthOfTextAtSize(label, 8);
  page.drawText(label, {
    x: PAGE_W - MARGIN - width,
    y: FOOTER_Y,
    size: 8,
    font,
    color: MUTED,
  });
}
