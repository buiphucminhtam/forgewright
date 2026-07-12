#!/usr/bin/env bash
set -euo pipefail

version="1.11.7"
archive="oasdiff_${version}_linux_amd64.tar.gz"
expected="97f1052365f74e6fd6f4d8fa108606e09391aebb8ecbf3b5e7a4059d54327224"
url="https://github.com/oasdiff/oasdiff/releases/download/v${version}/${archive}"
temp="$(mktemp -d)"
trap 'rm -rf "$temp"' EXIT

curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 "$url" --output "$temp/$archive"
actual=$(sha256sum "$temp/$archive" 2>/dev/null | awk '{print $1}' || shasum -a 256 "$temp/$archive" | awk '{print $1}')
test "$actual" = "$expected"
tar -xzf "$temp/$archive" -C "$temp" oasdiff
install -m 0755 "$temp/oasdiff" "${RUNNER_TEMP:-/tmp}/oasdiff"
printf '%s\n' "${RUNNER_TEMP:-/tmp}" >> "$GITHUB_PATH"
