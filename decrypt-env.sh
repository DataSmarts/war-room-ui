#!/bin/bash
# Decrypt every .enc env file back to plaintext, backing up local edits first.
# Self-contained: drop into any repo with a .sops.yaml whose rules match .env* files.
set -euo pipefail

root=$(git rev-parse --show-toplevel 2>/dev/null) || root=$(cd "$(dirname "$0")" && pwd)
cd "$root"

if ! command -v sops >/dev/null 2>&1; then
  echo "sops is not installed: brew install sops" >&2
  exit 1
fi

for enc in .env*.enc; do
  [ -e "$enc" ] || continue
  plain=${enc%.enc}

  tmp=$(mktemp "${TMPDIR:-/tmp}/sops-env.XXXXXX")
  if ! sops -d --input-type dotenv --output-type dotenv "$enc" >"$tmp" 2>/dev/null; then
    rm -f "$tmp"
    echo "Could not decrypt $enc — is your age key present?" >&2
    continue
  fi

  if [ -e "$plain" ]; then
    # sops drops blank lines on a dotenv round-trip, so compare ignoring them and
    # leave an unchanged file alone rather than churning it.
    if diff -q -B "$plain" "$tmp" >/dev/null 2>&1; then
      rm -f "$tmp"
      continue
    fi
    cp "$plain" "$plain.bak"
    echo "$plain had local changes — saved them to $plain.bak" >&2
  fi

  mv "$tmp" "$plain"
  echo "Decrypted $enc -> $plain"
done
