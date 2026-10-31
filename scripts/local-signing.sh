#!/bin/bash
# Explicit opt-in only. Does not change trust settings or privacy permissions.
set -euo pipefail
# Do not allow inherited shell tracing to expose temporary credentials.
set +x
umask 077
ROOT=$(cd "$(dirname "$0")/.." && pwd)
STATE="$HOME/Library/Application Support/HandsFree Local Signing"
CERT="$STATE/certificate.pem"
KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"
NAME='HandsFree Local Development (com.handsfree.local)'
fail() { printf '%s\n' "$*" >&2; exit 1; }
fingerprint() { /usr/bin/openssl x509 -in "$CERT" -noout -fingerprint -sha1 | cut -d= -f2 | tr -d ':'; }

case "${1:-}" in
  --init)
    [[ ! -e "$STATE" ]] || fail "Signing state already exists: $STATE. Refusing to replace its identity."
    if /usr/bin/security find-certificate -c "$NAME" "$KEYCHAIN" >/dev/null 2>&1; then
      fail "Dedicated certificate already exists in login keychain; refusing to create a replacement."
    fi
    TEMP=$(mktemp -d "${TMPDIR:-/tmp}/handsfree-signing.XXXXXX")
    trap 'rm -rf -- "$TEMP"' EXIT
    /usr/bin/openssl rand -hex 32 > "$TEMP/password"
    cp "$TEMP/password" "$TEMP/export-password"
    cat > "$TEMP/certificate.cnf" <<'CONFIG'
[req]
distinguished_name = subject
x509_extensions = extensions
prompt = no
[subject]
CN = HandsFree Local Development (com.handsfree.local)
[extensions]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
subjectKeyIdentifier = hash
CONFIG
    /usr/bin/openssl req -new -x509 -newkey rsa:3072 -sha256 -days 3650 \
      -config "$TEMP/certificate.cnf" -keyout "$TEMP/key.pem" \
      -out "$TEMP/certificate.pem" -passout "file:$TEMP/password" 2> "$TEMP/openssl.log"
    /usr/bin/openssl pkcs12 -export -name "$NAME" -inkey "$TEMP/key.pem" \
      -in "$TEMP/certificate.pem" -out "$TEMP/identity.p12" \
      -passin "file:$TEMP/password" -passout "file:$TEMP/export-password"
    SDK=$(/usr/bin/xcrun --show-sdk-path)
    /usr/bin/swift -sdk "$SDK" -Xcc "-I$SDK/usr/include" \
      "$ROOT/scripts/import-local-signing.swift" "$TEMP/identity.p12" "$TEMP/password" "$KEYCHAIN"
    mkdir -m 700 "$STATE"
    cp "$TEMP/certificate.pem" "$CERT"
    printf 'Public certificate saved: %s\n' "$CERT"
    printf 'Identity SHA-1: %s\n' "$(fingerprint)"
    ;;
  --sign)
    [[ $# == 2 && -d "$2" && -f "$CERT" ]] || fail "Usage: $0 --sign /path/to/HandsFree.app (run --init explicitly first)"
    APP="$2"
    [[ $(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Contents/Info.plist") == com.handsfree.local ]] || fail 'Refusing to sign an unrelated app.'
    HASH=$(fingerprint)
    [[ "$HASH" =~ ^[[:xdigit:]]{40}$ ]] || fail 'Invalid certificate fingerprint.'
    # Pin the dedicated certificate, not just the publicly reproducible bundle ID.
    REQUIREMENT="designated => identifier \"com.handsfree.local\" and certificate leaf = H\"$HASH\""
    /usr/bin/codesign --force --sign "$HASH" --keychain "$KEYCHAIN" --timestamp=none \
      --entitlements "$ROOT/src-tauri/Entitlements.plist" --requirements "=$REQUIREMENT" "$APP"
    /usr/bin/codesign --verify --deep --strict "$APP"
    /usr/bin/codesign --verify --strict -R="identifier \"com.handsfree.local\" and certificate leaf = H\"$HASH\"" "$APP"
    /usr/bin/codesign -d -r- "$APP"
    ;;
  --build)
    [[ $# == 1 && -f "$CERT" ]] || fail 'Run --init explicitly before a locally signed build.'
    cd "$ROOT"
    npm run tauri build -- --bundles app
    exec /bin/bash "$0" --sign "$ROOT/src-tauri/target/release/bundle/macos/HandsFree.app"
    ;;
  *) fail "Usage: $0 --init | --build | --sign /path/to/HandsFree.app" ;;
esac
