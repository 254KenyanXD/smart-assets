#!/bin/sh
# Raster the Pen Custody mark. The paths are not redrawn.
# The maskable file insets that same artwork by 10% on the plate colour.
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
brand="$root/public/brand/custody-bright.svg"
out="$root/public/icons"
tmp=$(mktemp)
mkdir -p "$out"
rsvg-convert -w 192 -h 192 "$brand" -o "$out/icon-192.png"
rsvg-convert -w 512 -h 512 "$brand" -o "$out/icon-512.png"
rsvg-convert -w 180 -h 180 "$brand" -o "$out/apple-touch-icon.png"
{
  printf '%s\n' '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#dfe1c7"/>'
  printf '%s\n' '<svg x="51.2" y="51.2" width="409.6" height="409.6" viewBox="0 0 512 512">'
  sed -e 's/^<svg[^>]*>//' -e 's/<\/svg>[[:space:]]*$//' "$brand"
  printf '%s\n' '</svg></svg>'
} > "$tmp"
rsvg-convert -w 512 -h 512 "$tmp" -o "$out/maskable-512.png"
rm -f "$tmp"
