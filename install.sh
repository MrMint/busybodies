#!/bin/sh
# Installs Busybodies on an Apple Silicon Mac.
#
#   curl -fsSL https://raw.githubusercontent.com/MrMint/busybodies/main/install.sh | sh
#   curl -fsSL https://raw.githubusercontent.com/MrMint/busybodies/main/install.sh | sh -s -- 0.1.0
#
# It downloads the release archive from GitHub, checks it against the release's SHA256SUMS,
# and copies Busybodies.app into /Applications, or ~/Applications if that isn't writable.
# It never uses sudo and never touches your coding agent's files or settings.
set -eu

REPO="MrMint/busybodies"
ARCHIVE="Busybodies-macos-arm64.tar.gz"
VERSION="${1:-latest}"

die() {
	echo "busybodies: $*" >&2
	exit 1
}

[ "$(uname -s)" = "Darwin" ] || die "Busybodies runs on macOS only."
# hw.optional.arm64 is 1 on Apple Silicon, even in a shell running under Rosetta.
[ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = "1" ] ||
	die "Busybodies is Apple Silicon only for now; Intel Macs aren't supported yet."

if [ -n "${BUSYBODIES_DOWNLOAD_URL:-}" ]; then
	BASE="$BUSYBODIES_DOWNLOAD_URL" # for testing a build before it's published
elif [ "$VERSION" = "latest" ]; then
	BASE="https://github.com/$REPO/releases/latest/download"
else
	BASE="https://github.com/$REPO/releases/download/v${VERSION#v}"
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Downloading $BASE/$ARCHIVE"
curl -fL --progress-bar -o "$TMP/$ARCHIVE" "$BASE/$ARCHIVE" || die "download failed. Is that version released?"
curl -fsSL -o "$TMP/SHA256SUMS" "$BASE/SHA256SUMS" || die "couldn't download SHA256SUMS."

# Check the archive against its line in SHA256SUMS, and refuse anything that doesn't match.
grep "  $ARCHIVE\$" "$TMP/SHA256SUMS" >"$TMP/expected" || die "SHA256SUMS has no entry for $ARCHIVE."
(cd "$TMP" && shasum -a 256 -c expected >/dev/null 2>&1) ||
	die "checksum mismatch for $ARCHIVE; refusing to install it."
echo "Checksum OK"

tar -xzf "$TMP/$ARCHIVE" -C "$TMP"
[ -d "$TMP/Busybodies.app" ] || die "the archive doesn't contain Busybodies.app."

if [ -w /Applications ]; then
	DEST="/Applications"
else
	DEST="$HOME/Applications"
	mkdir -p "$DEST"
fi

if pgrep -qf "$DEST/Busybodies.app/Contents/MacOS/" 2>/dev/null; then
	echo "Quitting the running Busybodies"
	osascript -e 'quit app "Busybodies"' >/dev/null 2>&1 || true
	sleep 2
fi
rm -rf "$DEST/Busybodies.app"
mv "$TMP/Busybodies.app" "$DEST/Busybodies.app"

INSTALLED="$(plutil -extract CFBundleVersion raw "$DEST/Busybodies.app/Contents/Info.plist" 2>/dev/null || echo "?")"
echo
echo "Installed Busybodies $INSTALLED to $DEST/Busybodies.app"
echo "Open it with:   open \"$DEST/Busybodies.app\""
echo "Uninstall with: rm -rf \"$DEST/Busybodies.app\" ~/Library/Application\\ Support/app.busybodies ~/Library/WebKit/app.busybodies"
