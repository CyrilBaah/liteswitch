#!/usr/bin/env bash
# Builds every file in public/media from the SVG sources in scripts/media.
# Run with: npm run media   (needs ffmpeg with libx264, and rsvg-convert)
#
# The FULL files are encoded the way a typical lesson site would ship them
# (1080p video, retina PNGs). The LITE files are what a data-aware site ships
# (360p video that only loads on tap, small JPEGs). We don't pad or shrink
# anything artificially: the receipt in the page shows the real bytes.
set -euo pipefail
cd "$(dirname "$0")/media"
OUT=../../public/media
TMP=$(mktemp -d)
mkdir -p "$OUT"

# 1) Slides: SVG -> 1920x1080 PNG frames for the video.
for i in 1 2 3 4; do rsvg-convert -w 1920 -h 1080 "slide$i.svg" -o "$TMP/slide$i.png"; done

# 2) The lesson video: 4 slides x 8 s, plus a small moving "presenter camera"
#    box in the corner (an animated test pattern with camera-like grain), so the
#    video has the motion a real talking-head lesson has.
ffmpeg -y -loglevel error \
  -loop 1 -t 8 -i "$TMP/slide1.png" -loop 1 -t 8 -i "$TMP/slide2.png" \
  -loop 1 -t 8 -i "$TMP/slide3.png" -loop 1 -t 8 -i "$TMP/slide4.png" \
  -f lavfi -t 32 -i "testsrc2=size=480x270:rate=30" \
  -filter_complex "[0][1][2][3]concat=n=4:v=1:a=0,fps=30[slides];[4]noise=alls=20:allf=t[cam];[slides][cam]overlay=W-w-60:H-h-60,format=yuv420p[v]" \
  -map "[v]" "$TMP/master.mp4"

# FULL: 1080p, quality-based encode capped at 1.5 Mbit/s (a modest HD bitrate).
ffmpeg -y -loglevel error -i "$TMP/master.mp4" -c:v libx264 -preset medium -crf 23 \
  -maxrate 1500k -bufsize 3000k -movflags +faststart "$OUT/git-intro-1080p.mp4"

# LITE: 360p, capped at 280 kbit/s. Only downloaded if the visitor taps play.
ffmpeg -y -loglevel error -i "$TMP/master.mp4" -vf scale=640:360 -c:v libx264 -preset medium -crf 28 \
  -maxrate 280k -bufsize 560k -movflags +faststart "$OUT/git-intro-360p.mp4"

# LITE poster: one small JPEG frame shown instead of the video.
ffmpeg -y -loglevel error -ss 1 -i "$TMP/master.mp4" -frames:v 1 -vf scale=640:360 -q:v 12 "$OUT/git-intro-poster.jpg"

# 3) Lesson images. FULL = retina PNG (2x). LITE = 640px-wide JPEG.
rsvg-convert -z 2 diagram.svg -o "$OUT/diagram-hd.png"
rsvg-convert -z 2 terminal.svg -o "$OUT/terminal-hd.png"
rsvg-convert -w 640 diagram.svg -o "$TMP/diagram-640.png"
rsvg-convert -w 640 terminal.svg -o "$TMP/terminal-640.png"
ffmpeg -y -loglevel error -i "$TMP/diagram-640.png" -q:v 8 "$OUT/diagram-low.jpg"
ffmpeg -y -loglevel error -i "$TMP/terminal-640.png" -q:v 8 "$OUT/terminal-low.jpg"

rm -r "$TMP"

# 4) Record the exact video file sizes for the data-cost receipt (see lib/liteswitch/bytes.ts).
size() { wc -c < "$OUT/$1" | tr -d ' '; }
cat > ../../app/lesson/media-sizes.json <<EOF
{
  "git-intro-1080p.mp4": $(size git-intro-1080p.mp4),
  "git-intro-360p.mp4": $(size git-intro-360p.mp4)
}
EOF
ls -l "$OUT"
