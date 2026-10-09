#!/usr/bin/env bash
# Prints the CHANGELOG.md section for a version (without its heading), for the GitHub Release.
# Usage: .github/release-notes.sh 1.0.0   — exits non-zero if the section is missing or empty.
set -euo pipefail
version="${1#v}"
notes=$(awk -v v="$version" '
    $0 ~ "^## \\[" v "\\]" { found = 1; next }
    found && /^## \[/ { exit }
    found { print }
' CHANGELOG.md | sed -e '/./,$!d')
if [ -z "${notes//[[:space:]]/}" ]; then
    echo "CHANGELOG.md has no section for $version — add '## [$version] — YYYY-MM-DD' before tagging." >&2
    exit 1
fi
printf '%s\n' "$notes"
