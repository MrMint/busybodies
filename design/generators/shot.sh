#!/bin/bash
# usage: shot.sh <file-in-preview> <w> <h> [virtual-ms]
P="$(cd "$(dirname "$0")/.." && pwd)"  # design/: boards/ in, renders/ out
n=$(echo "$1" | sed 's/\.dc\.html//')
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --allow-file-access-from-files --hide-scrollbars --window-size=$2,$3 --virtual-time-budget=${4:-2500} --screenshot="$P/renders/$n.png" "file://$P/preview/$1" 2>&1 | grep -v 'ERROR\|allocator' | sed 's/ to file.*//'
