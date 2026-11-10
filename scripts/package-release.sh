#!/bin/bash
# Candidate only. Never installs, publishes, or initializes signing identities.
set -euo pipefail
umask 022
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
fail() { printf '%s\n' "$*" >&2; exit 1; }
[[ $# == 0 ]] || fail 'Usage: bash scripts/package-release.sh (no arguments)'
[[ $(uname -s) == Darwin && $(uname -m) == arm64 ]] || fail 'Apple Silicon macOS required.'
NAME=HandsFree-0.1.1-beta.11-macos-arm64
OUT="$ROOT/release"
mkdir -p "$OUT"
[[ ! -L "$OUT" && $(cd "$OUT" && pwd -P) == "$OUT" ]] || fail 'Refusing symlinked output directory.'
for file in "$NAME.dmg" SHA256SUMS PROVENANCE.txt "$NAME.app.tar.gz" "$NAME.app.tar.gz.sig" UPDATER-PROVENANCE.txt macos-arm64.json; do
  [[ ! -e "$OUT/$file" && ! -L "$OUT/$file" ]] || fail 'Candidate output exists; move it aside explicitly first.'
done
STAGE=$(mktemp -d "$OUT/.package.XXXXXX")
MOUNT="$STAGE/mounted"
MOUNTED=false
cleanup() {
  local result=$?
  trap - EXIT
  if $MOUNTED; then
    if ! /usr/bin/hdiutil detach "$MOUNT"; then
      echo "Detach failed; preserving staging directory for recovery: $STAGE" >&2
      exit 1
    fi
  fi
  rm -rf -- "$STAGE"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
APP="$OUT/updater/HandsFree.app"
SOURCE_COMMIT=$(git rev-parse HEAD)
SOURCE_TREE=$(git rev-parse 'HEAD^{tree}')
SOURCE_STATUS=$(git status --short --untracked-files=normal)
[[ -z "$SOURCE_STATUS" ]] || fail 'Commit reviewed source before packaging.'
# Owns build:local, stable signing, notices, source restoration and receipt recovery.
node scripts/package-updater.mjs "$OUT/updater"
node scripts/check-macos-assets.mjs "$APP"
verify_app() {
  local app="$1" plist="$1/Contents/Info.plist"
  /usr/bin/codesign --verify --deep --strict "$app"
  [[ $(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$plist") == com.handsfree.local ]]
  [[ $(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$plist") == 0.1.1 ]]
  [[ $(/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "$plist") == 14.0 ]]
  local executable
  executable=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$plist")
  [[ $(/usr/bin/lipo -archs "$app/Contents/MacOS/$executable") == arm64 ]]
}
verify_app "$APP"
PAYLOAD="$STAGE/payload"
mkdir "$PAYLOAD"
/usr/bin/ditto "$APP" "$PAYLOAD/HandsFree.app"
ln -s /Applications "$PAYLOAD/Applications"
cp docs/INSTALL.md "$PAYLOAD/Install HandsFree.txt"
mkdir -p "$PAYLOAD/Licenses/Documentation/releases"
cp LICENSE "$PAYLOAD/Licenses/LICENSE"
cp README.md CONTRIBUTING.md SECURITY.md "$PAYLOAD/Licenses/Documentation/"
cp docs/DEVELOPMENT.md docs/RELEASING.md docs/WEBSITE.md docs/INSTALL.md docs/release-readiness.md "$PAYLOAD/Licenses/Documentation/"
cp docs/PUSH-TO-TALK.md docs/practice.md docs/COMPATIBILITY-PASTE.md "$PAYLOAD/Licenses/Documentation/"
cp docs/releases/v0.1.1-beta.11.md "$PAYLOAD/Licenses/Documentation/releases/"
python3 scripts/release-notices.py "$PAYLOAD/Licenses"
printf '%s\n' 'Experimental Mac beta — self-signed, not Developer ID signed or notarized.' 'No Apple approval or legal certification. Separate-Mac QA remains unverified.' 'Upstream notices, license texts and historical SDK caveat are preserved.' 'See THIRD_PARTY_NOTICES/README.txt and Documentation/release-readiness.md.' > "$PAYLOAD/Licenses/PUBLICATION-NOTES.txt"
# No Finder/AppleScript automation or new dependencies. The named volume and
# Applications shortcut provide drag-to-install without Automation permission.
python3 - "$PAYLOAD" "$ROOT" <<'PY'
import pathlib, sys
root = pathlib.Path(sys.argv[1])
source = pathlib.Path(sys.argv[2]) / 'src-tauri/native/assets/sounds'
approved_cues = {root / 'HandsFree.app/Contents/Resources/sounds' / f'{profile}-{role}.wav':
                 source / f'{profile}-{role}.wav'
                 for profile in ('clean', 'warm') for role in ('start', 'end')}
for file in root.rglob('*'):
    if file.is_symlink():
        if file == root / 'Applications' and file.readlink() == pathlib.Path('/Applications'):
            continue
        if not file.resolve().is_relative_to(root):
            raise SystemExit(f'External symlink: {file}')
    if file.is_file():
        if file in approved_cues and file.read_bytes() == approved_cues[file].read_bytes():
            continue
        name = file.name.lower()
        if (name.endswith(('.p12', '.pfx', '.key', '.pem', '.wav', '.bin'))
                or name in ('usage.json', 'diagnostics.json', '.env', 'certificate.cer')):
            raise SystemExit(f'Forbidden release file: {file}')
        if file.stat().st_size < 5_000_000 and b'-----BEGIN PRIVATE KEY-----' in file.read_bytes():
            raise SystemExit(f'Private key content: {file}')
PY
/usr/bin/hdiutil create -quiet -volname 'HandsFree Beta — drag to Applications' -srcfolder "$PAYLOAD" \
  -format UDZO -fs HFS+ "$STAGE/$NAME.dmg"
bash scripts/local-signing.sh --sign-dmg "$STAGE/$NAME.dmg"
/usr/bin/hdiutil verify "$STAGE/$NAME.dmg"
mkdir "$MOUNT"
# Set before attach: a signal/partial attach still triggers scoped detach cleanup.
MOUNTED=true
/usr/bin/hdiutil attach -readonly -nobrowse -noautoopen -mountpoint "$MOUNT" "$STAGE/$NAME.dmg"
verify_app "$MOUNT/HandsFree.app"
node scripts/check-macos-assets.mjs "$MOUNT/HandsFree.app"
[[ -L "$MOUNT/Applications" && $(readlink "$MOUNT/Applications") == /Applications ]]
for required in 'Install HandsFree.txt' Licenses/LICENSE Licenses/Documentation/README.md Licenses/Documentation/RELEASING.md Licenses/Documentation/practice.md Licenses/Documentation/COMPATIBILITY-PASTE.md Licenses/Documentation/releases/v0.1.1-beta.11.md Licenses/THIRD_PARTY_NOTICES/inventory.json Licenses/THIRD_PARTY_SOURCES.tar.gz Licenses/PUBLICATION-NOTES.txt; do
  [[ -s "$MOUNT/$required" ]] || fail "Missing disk-image payload: $required"
done
/usr/bin/hdiutil detach "$MOUNT"
MOUNTED=false
{
  [[ $(git rev-parse HEAD) == "$SOURCE_COMMIT" ]] || fail 'HEAD changed during packaging; rebuild from a stable commit.'
  [[ $(git rev-parse 'HEAD^{tree}') == "$SOURCE_TREE" && -z $(git status --short --untracked-files=normal) ]] || fail 'Source changed during packaging; rebuild from clean source.'
  printf 'Candidate: %s.dmg\nSource commit: %s\nSource tree: %s\n' "$NAME" "$SOURCE_COMMIT" "$SOURCE_TREE"
  printf 'Working tree status at packaging (empty means clean):\n'
  [[ -z "$SOURCE_STATUS" ]] || printf '%s\n' "$SOURCE_STATUS"
  printf '\nWorking tree status after packaging (empty means clean):\n'
  git status --short --untracked-files=normal
  printf '\nBuilt on: '; sw_vers -productVersion
  printf 'Architecture: '; uname -m
  printf 'Rust: '; rustc --version
  printf 'Node: '; node --version
  printf '\nExperimental beta candidate. Self-signed; not Developer ID or notarized.\n'
} > "$STAGE/PROVENANCE.txt"
python3 - "$OUT/updater" "$STAGE" <<'PY'
import pathlib, shutil, sys
source, destination = map(pathlib.Path, sys.argv[1:])
for name in ('HandsFree-0.1.1-beta.11-macos-arm64.app.tar.gz', 'HandsFree-0.1.1-beta.11-macos-arm64.app.tar.gz.sig', 'macos-arm64.json', 'PROVENANCE.txt'):
    target = 'UPDATER-PROVENANCE.txt' if name == 'PROVENANCE.txt' else name
    with (source / name).open('rb') as src, (destination / target).open('xb') as dst:
        shutil.copyfileobj(src, dst)
PY
(cd "$STAGE" && /usr/bin/shasum -a 256 "$NAME.dmg" PROVENANCE.txt "$NAME.app.tar.gz" "$NAME.app.tar.gz.sig" UPDATER-PROVENANCE.txt macos-arm64.json > SHA256SUMS && /usr/bin/shasum -a 256 -c SHA256SUMS)
python3 - "$STAGE" "$OUT" "$NAME" <<'PY'
import pathlib, shutil, sys
source, destination = map(pathlib.Path, sys.argv[1:3])
name = sys.argv[3]
for file in (name + '.dmg', 'PROVENANCE.txt', 'SHA256SUMS', name + '.app.tar.gz', name + '.app.tar.gz.sig', 'UPDATER-PROVENANCE.txt', 'macos-arm64.json'):
    with (source / file).open('rb') as src, (destination / file).open('xb') as dst:
        shutil.copyfileobj(src, dst)
PY
printf '\nCandidate: %s/%s.dmg\n' "$OUT" "$NAME"
echo 'Beta candidate packaged; no upload or installation performed. See included publication notes.'
