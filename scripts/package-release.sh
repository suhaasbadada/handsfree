#!/bin/bash
# Produces a candidate only; see docs/RELEASING.md for publication gates.
set -euo pipefail
umask 022
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
[[ $(uname -s) == Darwin && $(uname -m) == arm64 ]] || { echo 'Apple Silicon macOS required.' >&2; exit 1; }
NAME=HandsFree-0.1.0-beta.1-macos-arm64
OUT="$ROOT/release"
mkdir -p "$OUT"
[[ ! -e "$OUT/$NAME.zip" ]] || { echo 'Candidate ZIP already exists; move it aside explicitly first.' >&2; exit 1; }
STAGE=$(mktemp -d "$OUT/.package.XXXXXX")
trap 'rm -rf -- "$STAGE"' EXIT
APP="$ROOT/src-tauri/target/release/bundle/macos/HandsFree.app"
npm run build:local
verify_app() {
  local app="$1" plist="$1/Contents/Info.plist"
  /usr/bin/codesign --verify --deep --strict "$app"
  [[ $(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$plist") == com.handsfree.local ]]
  [[ $(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$plist") == 0.1.0 ]]
  [[ $(/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "$plist") == 14.0 ]]
  local executable
  executable=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$plist")
  [[ $(/usr/bin/lipo -archs "$app/Contents/MacOS/$executable") == arm64 ]]
}
verify_app "$APP"
mkdir "$STAGE/$NAME"
/usr/bin/ditto "$APP" "$STAGE/$NAME/HandsFree.app"
cp README.md "$STAGE/$NAME/INSTALL.md"
# INSTALL.md links are repository-relative, so include their exact targets.
mkdir -p "$STAGE/$NAME/docs/releases"
cp docs/DEVELOPMENT.md docs/RELEASING.md "$STAGE/$NAME/docs/"
cp docs/releases/v0.1.0-beta.1.md "$STAGE/$NAME/docs/releases/"
cp README.md "$STAGE/$NAME/README.md"
cp LICENSE "$STAGE/$NAME/LICENSE"
cp docs/WEBSITE.md "$STAGE/$NAME/docs/"
python3 scripts/release-notices.py "$STAGE/$NAME"
printf '%s\n' 'CANDIDATE ONLY — PUBLICATION BLOCKED: see THIRD_PARTY_NOTICES/README.txt and docs/RELEASING.md.' > "$STAGE/$NAME/PUBLICATION-BLOCKED.txt"
# Reject unexpected bundle payloads; do not silently omit signed resources.
python3 - "$STAGE/$NAME" <<'PY'
import pathlib, sys
root = pathlib.Path(sys.argv[1])
for file in root.rglob('*'):
    if file.is_symlink():
        if not file.resolve().is_relative_to(root):
            raise SystemExit(f'External symlink: {file}')
    if file.is_file():
        name = file.name.lower()
        if (name.endswith(('.p12', '.pfx', '.key', '.pem', '.wav', '.bin'))
                or name in ('usage.json', 'diagnostics.json', '.env', 'certificate.cer')):
            raise SystemExit(f'Forbidden release file: {file}')
        if file.stat().st_size < 5_000_000 and b'-----BEGIN PRIVATE KEY-----' in file.read_bytes():
            raise SystemExit(f'Private key content: {file}')
PY
/usr/bin/ditto -c -k --sequesterRsrc --keepParent "$STAGE/$NAME" "$STAGE/$NAME.zip"
mkdir "$STAGE/extracted"
/usr/bin/ditto -x -k "$STAGE/$NAME.zip" "$STAGE/extracted"
verify_app "$STAGE/extracted/$NAME/HandsFree.app"
mv "$STAGE/$NAME.zip" "$OUT/$NAME.zip"
(cd "$OUT" && /usr/bin/shasum -a 256 "$NAME.zip" > SHA256SUMS && /usr/bin/shasum -a 256 -c SHA256SUMS)
printf '\nCandidate: %s/%s.zip\n' "$OUT" "$NAME"
echo 'PUBLICATION BLOCKED pending licensing clarification; no upload or installation performed.'
