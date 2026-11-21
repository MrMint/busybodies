#!/usr/bin/env bash
# tools/profile.sh <label> [fake-home args...]: launch the dev app against a fake agent home and print
# the % of one core used by its Bun and WebContent processes between t=20s and t=60s.
# Build first (hutch run build or vite build): it runs the bundled scene. Examples:
#   tools/profile.sh idle --busy 0 --rate 0
#   tools/profile.sh heavy --sessions 12 --agents 8 --busy 0.75 --rate 20
#   BUSYBODIES_SCENE_QUERY=blank tools/profile.sh blank --busy 0 --rate 0
set -u
S="${TMPDIR:-/tmp}/busybodies-profile"; mkdir -p "$S"
label=$1; shift
cd "$(dirname "$0")/.."
pkill -f "Busybodies-dev.app/Contents/MacOS" 2>/dev/null; pkill -f "tools/fake-home.ts" 2>/dev/null; sleep 1
rm -rf "$S/fh"
bun tools/fake-home.ts --dir "$S/fh" "$@" > "$S/fh-$label.log" 2>&1 &
FH=$!
sleep 1
before=$(pgrep -f "com.apple.WebKit.WebContent" | sort -n | tr '\n' ' ')
BUSYBODIES_AGENT_HOME="$S/fh" BUSYBODIES_DESKTOP_INDEX= ~/.hutch/bin/hutch electrobun dev > "$S/app-$label.log" 2>&1 &
for i in $(seq 1 120); do APP=$(pgrep -f "Busybodies-dev.app/Contents/MacOS/bun" | head -1); [ -n "$APP" ] && break; sleep 0.5; done
sleep 3
WC=""
for p in $(pgrep -f "com.apple.WebKit.WebContent" | sort -n); do case " $before " in *" $p "*) ;; *) WC=$p;; esac; done
secs() { ps -o time= -p "$1" 2>/dev/null | awk -F'[:.]' '{ if (NF==3) print $1*60+$2+$3/100; else print $1*3600+$2*60+$3+$4/100 }'; }
sleep 17
b0=$(secs "$APP"); w0=$(secs "$WC")
sleep 40
b1=$(secs "$APP"); w1=$(secs "$WC")
awk -v l="$label" -v b0="$b0" -v b1="$b1" -v w0="$w0" -v w1="$w1" 'BEGIN { printf "%-14s bun %5.1f%%   webcontent %5.1f%%\n", l, (b1-b0)/40*100, (w1-w0)/40*100 }'
grep -m1 "watching" "$S/app-$label.log" | sed 's|watching .*/fh|watching <fake home>|'
pkill -f "Busybodies-dev.app/Contents/MacOS"; kill $FH 2>/dev/null; sleep 1
