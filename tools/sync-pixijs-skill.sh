#!/usr/bin/env bash
# Re-vendor the official PixiJS agent skill into .claude/skills/pixijs from pixijs/pixijs-skills.
#   tools/sync-pixijs-skill.sh            latest main
#   tools/sync-pixijs-skill.sh <commit>   a specific commit
# Bump pixi.js in package.json in the same change; the skill tracks PixiJS releases.
set -euo pipefail
cd "$(dirname "$0")/.."

ref="${1:-main}"
sha="$(curl -fsSL "https://api.github.com/repos/pixijs/pixijs-skills/commits/$ref" | sed -n 's/^  "sha": "\([0-9a-f]*\)".*/\1/p' | head -1)"
[ -n "$sha" ] || { echo "could not resolve $ref" >&2; exit 1; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -fsSL "https://github.com/pixijs/pixijs-skills/archive/$sha.tar.gz" | tar xz -C "$tmp"

rm -rf .claude/skills/pixijs
mkdir -p .claude/skills
cp -R "$tmp/pixijs-skills-$sha/skills/pixijs" .claude/skills/pixijs
cp "$tmp/pixijs-skills-$sha/LICENSE" .claude/skills/pixijs/LICENSE
echo "$sha" > .claude/skills/pixijs/VENDORED_FROM
echo "vendored pixijs-skills@$sha"
