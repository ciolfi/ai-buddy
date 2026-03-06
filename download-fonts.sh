#!/usr/bin/env bash
# ============================================================
# download-fonts.sh
# Run this ONCE to fetch all required woff2 font files from
# Google Fonts and save them locally in the fonts/ directory.
#
# Usage:  bash download-fonts.sh
# Requires: curl
# ============================================================

set -e

FONTS_DIR="$(dirname "$0")/fonts"
mkdir -p "$FONTS_DIR"

# Modern browser UA — tells Google to return woff2 (not ttf/woff)
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

echo "NEURON — Local font downloader"
echo "================================"

fetch_font() {
  local label="$1"
  local css_url="$2"
  local out_file="$3"

  local css
  css=$(curl -sL -A "$UA" "$css_url")
  local url
  url=$(echo "$css" | grep -oP "url\(\Khttps://[^\)]+\.woff2" | head -1)

  if [ -z "$url" ]; then
    echo "  ✗ Failed to resolve: $label"
    return 1
  fi

  echo "  ↓ $out_file"
  curl -sL -A "$UA" "$url" -o "$FONTS_DIR/$out_file"
}

echo ""
echo "[1/2] Syne"
fetch_font "Syne 400" \
  "https://fonts.googleapis.com/css2?family=Syne:wght@400&display=swap" \
  "Syne-Regular.woff2"

fetch_font "Syne 600" \
  "https://fonts.googleapis.com/css2?family=Syne:wght@600&display=swap" \
  "Syne-SemiBold.woff2"

fetch_font "Syne 700" \
  "https://fonts.googleapis.com/css2?family=Syne:wght@700&display=swap" \
  "Syne-Bold.woff2"

fetch_font "Syne 800" \
  "https://fonts.googleapis.com/css2?family=Syne:wght@800&display=swap" \
  "Syne-ExtraBold.woff2"

echo ""
echo "[2/2] DM Mono"
fetch_font "DM Mono 300 normal" \
  "https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300&display=swap" \
  "DMMono-Light.woff2"

fetch_font "DM Mono 400 normal" \
  "https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,400&display=swap" \
  "DMMono-Regular.woff2"

fetch_font "DM Mono 300 italic" \
  "https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@1,300&display=swap" \
  "DMMono-LightItalic.woff2"

echo ""
echo "✓ All fonts saved to: $FONTS_DIR"
echo ""
ls -lh "$FONTS_DIR"
