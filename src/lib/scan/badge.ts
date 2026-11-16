import { encodeQr } from "./qr";

/** Blank margin around the symbol, in modules. Four is the smallest a reader may need. */
const QUIET_MODULES = 4;

/** Modules are drawn dark on a white ground so the badge prints and reads on cheap paper. */
const DARK_COLOUR = "#0f1712";
const LIGHT_COLOUR = "#ffffff";

/**
 * Renders the borrower badge as a QR symbol.
 *
 * The payload is the admission number exactly as the university issues it,
 * hyphen included. There is no URL, no email and no network round trip: a
 * scanner reads the number and the desk looks it up.
 *
 * @param officialId - Admission number, for example `23-1943`.
 * @returns A standalone SVG document for the symbol.
 * @throws When the identifier is empty or does not fit a QR code.
 */
export function borrowerBadgeSvg(officialId: string): string {
  const qr = encodeQr(officialId);
  const span = qr.size + QUIET_MODULES * 2;
  const pieces: string[] = [];

  for (let y = 0; y < qr.size; y += 1) {
    let x = 0;
    while (x < qr.size) {
      if (!qr.isDark(x, y)) {
        x += 1;
        continue;
      }
      let end = x + 1;
      while (end < qr.size && qr.isDark(end, y)) end += 1;
      const left = x + QUIET_MODULES;
      const top = y + QUIET_MODULES;
      pieces.push(`<rect x="${left}" y="${top}" width="${end - x}" height="1"/>`);
      x = end;
    }
  }

  const root =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${span} ${span}"` +
    ` width="${span}" height="${span}" shape-rendering="crispEdges" role="img">`;

  return [
    root,
    `<rect width="${span}" height="${span}" fill="${LIGHT_COLOUR}"/>`,
    `<g fill="${DARK_COLOUR}">`,
    pieces.join(""),
    `</g></svg>`,
  ].join("");
}
