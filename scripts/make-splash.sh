#!/usr/bin/env bash
# Generates iOS home-screen launch images (dark canvas + centered app icon).
# Without these, iOS shows a white screen while a home-screen app starts.
# Usage: scripts/make-splash.sh   (needs ImageMagick)
set -euo pipefail
cd "$(dirname "$0")/.."
BG="#0b0c10"
# CSS width x height x device pixel ratio
DEVICES="440x956x3 430x932x3 428x926x3 420x912x3 414x896x3 414x896x2 414x736x3 402x874x3 393x852x3 390x844x3 375x812x3 375x667x2 360x780x3 320x568x2 1032x1376x2 1024x1366x2 834x1210x2 834x1194x2 820x1180x2 810x1080x2 768x1024x2 744x1133x2"
mkdir -p public/splash
for d in $DEVICES; do
	IFS=x read -r w h r <<<"$d"
	for orient in portrait landscape; do
		if [ "$orient" = portrait ]; then pw=$((w * r)); ph=$((h * r)); else pw=$((h * r)); ph=$((w * r)); fi
		short=$((pw < ph ? pw : ph))
		icon=$((short / 4))
		magick -size "${pw}x${ph}" "xc:$BG" \
			\( public/icon-512.png -resize "${icon}x${icon}" \) -gravity center -composite \
			-strip -depth 8 -define png:compression-level=9 "public/splash/${pw}x${ph}.png"
	done
done
echo "wrote $(ls public/splash | wc -l) images"
