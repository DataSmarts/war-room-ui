#!/bin/bash
# Encrypt every plaintext env file to its .enc counterpart.
# Self-contained: drop into any repo with a .sops.yaml whose rules match .env* files.
set -euo pipefail

root=$(git rev-parse --show-toplevel 2>/dev/null) || root=$(cd "$(dirname "$0")" && pwd)
cd "$root"

if ! command -v sops >/dev/null 2>&1; then
  echo "sops is not installed: brew install sops" >&2
  exit 1
fi

encrypted=0
for plain in .env .env.*; do
  [ -e "$plain" ] || continue
  case "$plain" in
    *.enc | *.bak | .env.example) continue ;;
  esac
  # Only names a .sops.yaml creation rule can match, so a stray .env.local.orig
  # from a merge does not fail the whole run.
  [[ $plain =~ ^\.env(\.[a-zA-Z0-9_-]+)?$ ]] || continue

  # sops resolves creation rules against the input path, so the plaintext keeps its
  # real name and only the output is staged through a temp file — a bare redirect
  # would leave empty ciphertext behind if sops failed.
  tmp=$(mktemp "${TMPDIR:-/tmp}/sops-env.XXXXXX")
  if sops -e --input-type dotenv --output-type dotenv "$plain" >"$tmp" 2>/dev/null; then
    mv "$tmp" "$plain.enc"
    echo "Encrypted $plain -> $plain.enc"
    encrypted=$((encrypted + 1))
  else
    rm -f "$tmp"
    echo "Failed to encrypt $plain — check .sops.yaml and your age key." >&2
    exit 1
  fi
done

[ "$encrypted" -gt 0 ] || echo "No plaintext env files to encrypt."
