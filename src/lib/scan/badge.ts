import { encodeQr } from "./qr";

const QUIET_MODULES = 4;

const DARK_COLOUR = "#0f1712";
const LIGHT_COLOUR = "#ffffff";

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
