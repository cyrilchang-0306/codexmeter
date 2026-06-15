#!/bin/zsh
set -euo pipefail

iconset="/private/tmp/CodexMeter.iconset"
preview="/private/tmp/codex-meter-icon-preview"

rm -rf "$iconset" "$preview"
mkdir -p "$iconset" "$preview"
qlmanage -t -s 1024 -o "$preview" assets/icon.svg >/dev/null

source_png="$preview/icon.svg.png"
cp "$source_png" "$iconset/icon_512x512@2x.png"

for spec in \
  "16 16 icon_16x16.png" \
  "32 32 icon_16x16@2x.png" \
  "32 32 icon_32x32.png" \
  "64 64 icon_32x32@2x.png" \
  "128 128 icon_128x128.png" \
  "256 256 icon_128x128@2x.png" \
  "256 256 icon_256x256.png" \
  "512 512 icon_256x256@2x.png" \
  "512 512 icon_512x512.png"; do
  read -r height width filename <<< "$spec"
  sips -z "$height" "$width" "$source_png" --out "$iconset/$filename" >/dev/null
done

iconutil -c icns "$iconset" -o assets/icon.icns
echo "Generated assets/icon.icns"
