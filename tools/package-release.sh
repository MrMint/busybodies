#!/bin/sh
# Checks a finished macOS build and lays out the release files.
#
#   tools/package-release.sh <version> <out-dir>
#
# Run after `hutch run build`. It unpacks the app from artifacts/, refuses it if any binary has
# no code signature (Apple Silicon won't run those) or the version is wrong, then writes into
# <out-dir>:
#   Busybodies-macos-arm64.tar.gz                 the app, for install.sh
#   Busybodies-macos-arm64.dmg                    the app, for a browser download
#   stable-macos-arm64-update.json, -checksum.json,
#   stable-macos-arm64-Busybodies.app.tar.zst     what the updater fetches (names fixed by Electrobun)
#   SHA256SUMS                                    checksums of all of the above
set -eu

VERSION="$1"
OUT="$2"
ARTIFACTS="${ARTIFACTS:-artifacts}"

die() {
	echo "package-release: $*" >&2
	exit 1
}

command -v zstd >/dev/null || die "needs zstd (brew install zstd)"
[ ! -e "$OUT" ] || die "$OUT already exists"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

zstd -dcq "$ARTIFACTS/stable-macos-arm64-Busybodies.app.tar.zst" | tar -x -C "$WORK"
APP="$WORK/Busybodies.app"
[ -d "$APP" ] || die "no Busybodies.app in the update bundle"

# Every Mach-O needs at least an ad-hoc signature.
find "$APP" -type f >"$WORK/files"
while read -r f; do
	file -b "$f" | grep -q '^Mach-O' || continue
	codesign -dv "$f" >/dev/null 2>&1 || die "unsigned binary: ${f#"$APP"/}"
	kind="$(codesign -dv "$f" 2>&1 | grep -q '^Signature=adhoc' && echo ad-hoc || echo signed)"
	echo "$kind: ${f#"$APP"/}"
done <"$WORK/files"
codesign -dv "$APP" >/dev/null 2>&1 || die "the app bundle has no signature"

built="$(plutil -extract CFBundleVersion raw "$APP/Contents/Info.plist")"
[ "$built" = "$VERSION" ] || die "built version $built, expected $VERSION"
lipo -archs "$APP/Contents/MacOS/launcher" | grep -qx arm64 || die "launcher isn't arm64"

mkdir -p "$OUT"
tar --no-mac-metadata -czf "$OUT/Busybodies-macos-arm64.tar.gz" -C "$WORK" Busybodies.app
if [ "${BUSYBODIES_CODESIGN:-}" = "1" ]; then
	cp "$ARTIFACTS"/*.dmg "$OUT/Busybodies-macos-arm64.dmg"
else
	# Electrobun signs only the launcher binary, so the bundle's signature is invalid ("code has
	# no resources"), and a quarantined copy is reported as "damaged" with no way to open it.
	# A full ad-hoc signature makes Gatekeeper treat it as an unverified app instead, which
	# System Settings > Privacy & Security > Open Anyway can let through.
	hdiutil attach -quiet -nobrowse -readonly -mountpoint "$WORK/mnt" "$ARTIFACTS"/*.dmg
	mkdir "$WORK/dmg"
	ditto "$WORK/mnt/Busybodies.app" "$WORK/dmg/Busybodies.app"
	hdiutil detach -quiet "$WORK/mnt"
	codesign --force --deep --sign - "$WORK/dmg/Busybodies.app"
	codesign --verify --deep --strict "$WORK/dmg/Busybodies.app" || die "the re-signed .dmg app doesn't verify"
	ln -s /Applications "$WORK/dmg/Applications"
	hdiutil create -quiet -volname Busybodies -srcfolder "$WORK/dmg" -format UDZO "$OUT/Busybodies-macos-arm64.dmg"
fi
cp "$ARTIFACTS/stable-macos-arm64-update.json" "$ARTIFACTS/stable-macos-arm64-checksum.json" \
	"$ARTIFACTS/stable-macos-arm64-Busybodies.app.tar.zst" "$OUT/"
(cd "$OUT" && shasum -a 256 -- * >SHA256SUMS)
cat "$OUT/SHA256SUMS"
