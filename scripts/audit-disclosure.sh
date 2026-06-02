#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Copyright (c) 2026 Geoffrey Oketwangwu (asatlabs.org)
# Author:  Geoffrey Oketwangwu <geoffreyoketwangwu@gmail.com>
#
# CONFIDENTIAL AND PROPRIETARY
#
# This source file is the original work of Geoffrey Oketwangwu and contains
# confidential, proprietary information protected under copyright and trade-
# secret law. No part may be reproduced, distributed, modified, reverse-
# engineered, or used — in source or compiled form — without the prior
# written permission of the author.
#
# All rights reserved.
# Sente Rails — framework disclosure audit
#
# Scans only USER-VISIBLE surfaces for framework-name leaks:
#   - .md docs (README, ARCHITECTURE, etc.)
#   - .yaml/.yml specs (OpenAPI, fixtures)
#   - .json DocType + workspace defs (field descriptions surface in API + admin)
#   - .html / .js / .css served pages (Clerk UI, Docs portal)
#
# Internal Python code is INTENTIONALLY skipped — `import frappe`,
# `frappe.db.X`, `@frappe.whitelist` are wire-format bindings, not
# disclosure leaks. They are not user-visible.
#
# Built artifacts under `*/dist/` are also skipped — they're regenerated
# from source on every build, and may legitimately contain third-party
# regex literals from third-party bot-detection lists.
# Audit the SOURCE; the dist is downstream of source cleanliness.
#
# Flagged terms: 'frappe' and 'erpnext' (case-insensitive). The audit
# does not flag generic words like 'bench' or 'DocType' to avoid false
# positives.
#
# Exit code:
#   0 — clean
#   1 — leaks found (report printed)
#
# Usage:
#   scripts/audit-disclosure.sh        # full report
#   scripts/audit-disclosure.sh -q     # exit code only (CI mode)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
QUIET="${1:-}"

# Patterns to flag. Whole-word, case-insensitive.
# Covers the underlying platform name and the upstream accounting module
# name. Both forbidden in any user-visible or in-repo doc surface.
PATTERN='\b(frappe|erpnext)\b'

# Secondary pattern: hardcoded references to the platform Desk
# (/app/* or /desk*). These should never appear in user-facing HTML/JS
# — they expose the underlying admin surface that the showcase
# explicitly does not promote. Matched only inside quote/href contexts
# so we don't false-positive on prose containing the word "app".
DESK_PATTERN='(href=|src=|action=|location[[:space:]]*=|window\.location|fetch\(|"|'"'"')[[:space:]]*"?'"'"'?/(app|desk)(/|"|'"'"'|\?|$)'

# Filenames that may legitimately contain the framework name (framework-
# imposed conventions; not user-visible). Skip these.
SKIP_BASENAMES=(
  'hooks.py'             # framework-required hooks file
  'modules.txt'          # framework-required modules list
  'patches.txt'
  'pyproject.toml'       # license metadata + dependencies
  'license.txt'
  'nginx.conf.example'   # disclosure-protection config — block patterns,
                         # upstream identifiers, and X-Frappe-Site-Name
                         # header set on proxy_set_header are wire-format
                         # by design. You can't BLOCK what you can't NAME.
)

cd "$ROOT"

total=0
declare -a hits

scan_file() {
  local file="$1"
  local rel="${file#./}"
  # Skip allowed framework-imposed files
  local base="$(basename "$file")"
  for sk in "${SKIP_BASENAMES[@]}"; do
    [[ "$base" == "$sk" ]] && return
  done
  # Scan, dropping any line carrying an explicit AUDIT-OK marker
  # (used for genuinely-required same-origin wire-format headers etc.)
  local out
  out=$(grep -nEi "$PATTERN" "$file" 2>/dev/null | grep -v "AUDIT-OK") || true
  if [[ -n "$out" ]]; then
    while IFS= read -r line; do
      hits+=("$rel|$line")
      ((total++)) || true
    done <<< "$out"
  fi

  # Secondary scan: only on user-facing HTML / JS / CSS surfaces. The
  # nginx config legitimately blocks the very same routes we're
  # flagging, so it's also skipped (the block IS the disclosure
  # mitigation, not a leak).
  case "$file" in
    *.html|*.js|*.css)
      local desk_out
      desk_out=$(grep -nEi "$DESK_PATTERN" "$file" 2>/dev/null | grep -v "AUDIT-OK") || true
      if [[ -n "$desk_out" ]]; then
        while IFS= read -r line; do
          hits+=("$rel|$line")
          ((total++)) || true
        done <<< "$desk_out"
      fi
      ;;
  esac
}

# Walk user-visible files only — .md/.yaml/.yml/.json/.html/.js/.css
while IFS= read -r -d '' file; do
  scan_file "$file"
done < <(find . \
  \( -path './.git' -o -path '*/__pycache__' -o -path '*/node_modules' \
     -o -path '*/dist' \) -prune -o \
  -type f \( -name '*.md' -o -name '*.yaml' -o -name '*.yml' -o -name '*.json' \
          -o -name '*.html' -o -name '*.js' -o -name '*.css' \
          -o -name '*.conf' -o -name '*.conf.example' \) \
  -print0)

if [[ "$QUIET" == "-q" ]]; then
  [[ $total -eq 0 ]] && exit 0 || exit 1
fi

if [[ $total -eq 0 ]]; then
  echo "✅ Audit clean — no framework-name leaks in user-visible surfaces."
  exit 0
fi

echo "─────────────────────────────────────────────────────────────────────"
echo "FRAMEWORK DISCLOSURE AUDIT — $total leak(s) in user-visible surfaces"
echo "─────────────────────────────────────────────────────────────────────"
prev=""
for hit in "${hits[@]}"; do
  file="${hit%%|*}"
  line="${hit#*|}"
  if [[ "$file" != "$prev" ]]; then
    echo ""
    echo "📄 $file"
    prev="$file"
  fi
  echo "    $line"
done
echo ""
echo "─────────────────────────────────────────────────────────────────────"
echo "Total: $total leak(s). Re-run after each cleanup pass."
echo "─────────────────────────────────────────────────────────────────────"
exit 1
