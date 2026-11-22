#!/usr/bin/env bash
# Refuses tracked files that carry private data: real home paths, email addresses, raw agent
# transcript records, and any word listed in the gitignored .private-words file (one per line;
# put your own username and real project names there). This repo is public, and a pushed
# object can't be taken back.
#   tools/scan-private.sh          scan every tracked file
#   tools/scan-private.sh FILE...  scan just these files (say, the text drawn in a GIF's frames)
# Runs as the pre-push hook (.githooks/pre-push) and in CI.
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0
report() { echo "scan-private: $1" >&2; echo "$2" | sed 's/^/  /' >&2; fail=1; }

if [ $# -gt 0 ]; then
	files=$(printf '%s\n' "$@")
else
	files=$(git ls-files -z | xargs -0 grep -IlE . 2>/dev/null | grep -vE '^tools/scan-private\.sh$' || true)
fi
[ -n "$files" ] || exit 0

hits=$(echo "$files" | xargs grep -InE '/(Users|home)/[A-Za-z0-9._-]+/' 2>/dev/null \
	| grep -vE '/(Users|home)/(you|me|example|user|runner|USER|\$USER|<[a-z]+>)/' || true)
[ -z "$hits" ] || report "a real home path (use /Users/you/ in examples)" "$hits"

hits=$(echo "$files" | xargs grep -InoE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' 2>/dev/null \
	| grep -viE '@(example\.(com|org|net)|users\.noreply\.github\.com|anthropic\.com)$|noreply@' || true)
[ -z "$hits" ] || report "an email address (use someone@example.com)" "$hits"

hits=$(echo "$files" | xargs grep -InE '"(parentUuid|toolUseResult|sessionId|cwd)"[[:space:]]*:[[:space:]]*"[^"]*[0-9a-f]{8}-[0-9a-f]{4}-' 2>/dev/null || true)
[ -z "$hits" ] || report "what looks like a raw transcript record (fixtures must be invented)" "$hits"

if [ -f .private-words ]; then
	while IFS= read -r word; do
		[ -n "$word" ] && [ "${word#\#}" = "$word" ] || continue
		hits=$(echo "$files" | xargs grep -Inil -F -- "$word" 2>/dev/null || true)
		[ -z "$hits" ] || report "a word from .private-words" "$hits"
	done < .private-words
fi

[ "$fail" = 0 ] && echo "scan-private: clean"
exit "$fail"
