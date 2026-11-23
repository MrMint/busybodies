#!/usr/bin/env bash
# tools/soak.sh [minutes] [fake-home args...]: run the dev app against a busy, noisy fake home for a
# while and watch its memory. Samples the resident size of the app's Bun process and its webview
# every 30 s into a CSV, then prints the start, the peak, the end, and the growth after a 5-minute
# warm-up. Memory growth is meaningful on a loaded machine; CPU % is not (use tools/profile.sh on
# a quiet one). Build first (vite build). It stops only the processes it started.
#   tools/soak.sh 30 --sessions 8 --agents 4 --busy 0.5 --rate 5 --noise 20 --churn 20
# SOAK_APP=/path/to/Busybodies-canary.app soaks a built app instead of the dev one (and quits it
# through AppKit at the end, the way the Dock's Quit does, timing how long the exit takes).
set -u
minutes=${1:-30}; shift || true
[ $# -gt 0 ] || set -- --sessions 8 --agents 4 --busy 0.5 --rate 5 --noise 20 --churn 20
APP_BUNDLE=${SOAK_APP:-}
S="${TMPDIR:-/tmp}/busybodies-soak"; rm -rf "$S"; mkdir -p "$S"
cd "$(dirname "$0")/.."
ROOT=$(pwd)

bun tools/fake-home.ts --dir "$S/fh" "$@" > "$S/fake-home.log" 2>&1 &
FH=$!
sleep 1
before=$(pgrep -f "com.apple.WebKit.WebContent" | sort -n | tr '\n' ' ')
if [ -n "$APP_BUNDLE" ]; then
	MACOS="$APP_BUNDLE/Contents/MacOS"
	open -n --env BUSYBODIES_AGENT_HOME="$S/fh" --env BUSYBODIES_DESKTOP_INDEX= --env BUSYBODIES_NO_UPDATE=1 --stdout "$S/app.log" --stderr "$S/app.log" "$APP_BUNDLE"
	DEV=""
else
	MACOS="$ROOT/build/dev-macos-arm64/Busybodies-dev.app/Contents/MacOS"
	BUSYBODIES_AGENT_HOME="$S/fh" BUSYBODIES_DESKTOP_INDEX= BUSYBODIES_NO_UPDATE=1 ~/.hutch/bin/hutch electrobun dev > "$S/app.log" 2>&1 &
	DEV=$!
fi
# The app is the bun running Resources/main.js under that build.
for i in $(seq 1 240); do APP=$(pgrep -f "$MACOS/../Resources/main.js" | head -1); [ -n "$APP" ] && break; sleep 0.5; done
[ -n "${APP:-}" ] || { echo "soak: the app didn't start; see $S/app.log"; kill $FH $DEV 2>/dev/null; exit 1; }
sleep 5
WC=""
for p in $(pgrep -f "com.apple.WebKit.WebContent" | sort -n); do case " $before " in *" $p "*) ;; *) WC=$p;; esac; done

stop() {
	for p in $(pgrep -f "$MACOS"); do kill "$p" 2>/dev/null; done
	kill $DEV $FH 2>/dev/null
}
trap stop EXIT

rss() { ps -o rss= -p "$1" 2>/dev/null | tr -d ' '; }
cpu() { ps -o time= -p "$1" 2>/dev/null | awk -F'[:.]' '{ if (NF==3) print $1*60+$2+$3/100; else print $1*3600+$2*60+$3+$4/100 }'; }
echo "seconds,bun_rss_kb,webcontent_rss_kb,bun_cpu_s,webcontent_cpu_s" > "$S/memory.csv"
end=$(( $(date +%s) + minutes * 60 ))
t0=$(date +%s)
while [ "$(date +%s)" -lt "$end" ]; do
	b=$(rss "$APP"); w=$( [ -n "$WC" ] && rss "$WC" || echo "")
	[ -n "$b" ] || { echo "soak: the app exited after $(( $(date +%s) - t0 )) s; see $S/app.log"; exit 1; }
	echo "$(( $(date +%s) - t0 )),$b,$w,$(cpu "$APP"),$( [ -n "$WC" ] && cpu "$WC" || echo "")" >> "$S/memory.csv"
	sleep 30
done

awk -F, 'NR==1 { next }
	{ t=$1; b=$2; w=$3; if (NR==2) { b0=b; w0=w } if (t >= 300 && !wb) { wb=b; ww=w } if (b>bm) bm=b; if (w>wm) wm=w; bl=b; wl=w; n++ }
	END {
		printf "samples %d over %d min\n", n, t/60
		printf "bun        start %6.1f MB  peak %6.1f MB  end %6.1f MB  growth after warm-up %+6.1f MB\n", b0/1024, bm/1024, bl/1024, (bl-wb)/1024
		if (w0) printf "webcontent start %6.1f MB  peak %6.1f MB  end %6.1f MB  growth after warm-up %+6.1f MB\n", w0/1024, wm/1024, wl/1024, (wl-ww)/1024
	}' "$S/memory.csv"
awk -F, 'NR==1 { next } { if (!t0) { t0=$1; b0=$4; w0=$5 } t=$1; b=$4; w=$5 }
	END { if (t > t0) printf "cpu        bun %5.1f%%  webcontent %5.1f%% of a core, on average (a loaded machine inflates these)\n", (b-b0)/(t-t0)*100, (w-w0)/(t-t0)*100 }' "$S/memory.csv"
echo "csv: $S/memory.csv"
if [ -n "$APP_BUNDLE" ]; then
	# Quit the way the Dock does (an AppKit terminate), and time until the app and its webview are gone.
	cat > "$S/quit.swift" <<'SWIFT'
import AppKit
if let app = NSRunningApplication(processIdentifier: pid_t(CommandLine.arguments[1])!) { _ = app.terminate() }
SWIFT
	swiftc -O "$S/quit.swift" -o "$S/quit" 2>/dev/null && {
		q0=$(perl -MTime::HiRes=time -e 'printf "%.2f", time')
		"$S/quit" "$APP"
		for i in $(seq 1 100); do left=""; for p in $APP $WC; do kill -0 "$p" 2>/dev/null && left="$left $p"; done; [ -z "$left" ] && break; sleep 0.1; done
		q1=$(perl -MTime::HiRes=time -e 'printf "%.2f", time')
		echo "quit: $( [ -z "$left" ] && echo "gone in $(echo "$q1 - $q0" | bc) s" || echo "still running after 10 s:$left")"
	}
	grep -m1 "shut down" "$S/app.log"
fi
grep -m1 "watching" "$S/app.log" | sed 's|watching .*/fh|watching <fake home>|'
