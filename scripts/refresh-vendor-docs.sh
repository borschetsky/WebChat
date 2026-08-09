#!/bin/sh
#
# Refreshes the vendored upstream documentation in docs/vendor/.
#
# The snapshots go stale silently - nothing warns you that a page describes an API two
# versions old. This exists so re-taking them is one command rather than an afternoon of
# remembering which directories to copy.
#
# Review the diff before committing. An upstream restructure shows up as a large rename and
# is worth looking at rather than merging blind.
#
# Usage:  ./scripts/refresh-vendor-docs.sh
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
vendor="$root/docs/vendor"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# repo url | sparse path | destination | extra file to keep
fetch() {
  url=$1; sparse=$2; dest=$3; extra=$4

  echo "==> $url"
  git clone --depth 1 --filter=blob:none --sparse "$url" "$work/$dest" >/dev/null 2>&1
  (cd "$work/$dest" && git sparse-checkout set "$sparse" "$extra" >/dev/null 2>&1)

  sha=$(cd "$work/$dest" && git rev-parse HEAD)

  # Replaced wholesale rather than merged: a deleted upstream page must disappear here too,
  # or the snapshot grows pages that no longer exist anywhere.
  rm -rf "${vendor:?}/$dest"
  mkdir -p "$vendor/$dest"
  cp -R "$work/$dest/$sparse/." "$vendor/$dest/"
  [ -f "$work/$dest/$extra" ] && cp "$work/$dest/$extra" "$vendor/$dest/$(basename "$extra")"

  files=$(find "$vendor/$dest" -type f | wc -l | tr -d ' ')
  echo "    $sha"
  echo "    $files files"
}

fetch https://github.com/reduxjs/redux-toolkit.git docs        redux-toolkit LICENSE
fetch https://github.com/reactjs/react.dev.git     src/content react         LICENSE-DOCS.md

cat <<EOF

Done. Now update the SHA and date columns in docs/vendor/README.md - they are the only
signal of how stale a snapshot is, so a refresh that leaves them behind is worse than no
refresh at all.

Today: $(date -u +%Y-%m-%d)
EOF
