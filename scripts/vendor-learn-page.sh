#!/bin/sh
#
# Vendors one Microsoft Learn page into docs/vendor/dotnet/ as markdown.
#
# learn.microsoft.com serves a plain-markdown variant of every page under content
# negotiation - `Accept: text/markdown`. That variant is what this fetches, and it is not
# the same document as the .md file in dotnet/docs on GitHub: Learn has already resolved
# the `:::code source="..."` transclusions (which are the code samples - they live in a
# *different* repo and are simply absent from the raw source), the `[!INCLUDE]` directives
# and the `<xref:>` links. Fetching the GitHub source instead gets you an article with the
# code cut out of it.
#
# What Learn does NOT do is honour `?view=`. The markdown is byte-identical for every
# moniker - verified - so the document is the union of every version it has ever applied
# to, with `::: moniker range="..."` blocks marking which is which. Pruning those to one
# version is this script's job and the whole reason it exists.
#
# Usage:
#   ./scripts/vendor-learn-page.sh <learn-url> <moniker> <dest-path> [pivot]
#
# Example:
#   ./scripts/vendor-learn-page.sh \
#     https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.dependencyinjection.entityframeworkservicecollectionextensions.configuredbcontext \
#     efcore-10.0 \
#     api/microsoft.extensions.dependencyinjection.entityframeworkservicecollectionextensions.configuredbcontext.md
#
# <dest-path> is relative to docs/vendor/dotnet/ and should mirror the Learn URL path after
# the locale, so the path round-trips back to the page it came from and so `ls | grep` on a
# type name lands on the file without opening anything.
set -eu

[ $# -ge 3 ] || { echo "usage: $0 <learn-url> <moniker> <dest-path> [pivot]" >&2; exit 2; }

url=$1
moniker=$2
dest=$3
pivot=${4:-}

root=$(cd "$(dirname "$0")/.." && pwd)
out="$root/docs/vendor/dotnet/$dest"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

echo "==> $url"
curl -sSfL -H "Accept: text/markdown" "$url" -o "$tmp/raw.md"

# Learn's own frontmatter runs to the second `---`. Everything after it is the body.
fm_end=$(awk 'NR>1 && /^---$/ {print NR; exit}' "$tmp/raw.md")
[ -n "$fm_end" ] || { echo "no frontmatter - is this a Learn page?" >&2; exit 1; }
sed -n "1,${fm_end}p" "$tmp/raw.md" > "$tmp/fm.yml"
sed -n "$((fm_end + 1)),\$p" "$tmp/raw.md" > "$tmp/body.md"

field() { sed -n "s/^$1: *//p" "$tmp/fm.yml" | head -1 | sed "s/^'//;s/'$//"; }

commit=$(field git_commit_id)
giturl=$(field original_content_git_url)
canonical=$(field canonicalUrl)
title=$(field title | sed 's/ | Microsoft Learn$//')
uid=$(field uid)
msdate=$(field ms.date | cut -c1-10)
updated=$(field updated_at | cut -c1-10)
defmoniker=$(field defaultMoniker)
monikers=$(awk '/^monikers:$/{f=1;next} f&&/^- /{printf "%s ", $2; next} f{exit}' "$tmp/fm.yml")

[ -n "$commit" ] || { echo "no git_commit_id in frontmatter - refusing to vendor without provenance" >&2; exit 1; }

before=$(wc -l < "$tmp/body.md")

# Prune moniker and zone blocks. A block is kept when its range names the target moniker;
# blocks with no range marker at all are unversioned and always kept. Only whole blocks are
# ever removed - no sentence is ever rewritten, so the diff against a re-fetch is readable.
awk -v m="$moniker" -v pv="$pivot" '
  /^::: moniker range=/ { keep = (index($0, m) > 0); inmon = 1; next }
  /^::: moniker-end/    { inmon = 0; keep = 1; next }
  /^::: zone pivot=/    { zkeep = (pv == "" || index($0, "\"" pv "\"") > 0); inzone = 1; next }
  /^::: zone-end/       { inzone = 0; zkeep = 1; next }
  (!inmon || keep) && (!inzone || zkeep) { print }
' "$tmp/body.md" > "$tmp/pruned.md"

# Root-relative Learn links are dead in a local file. Absolutising them is the only edit
# made to link text; sibling-relative links resolve against the canonical URL's directory.
sed 's|](/en-us/|](https://learn.microsoft.com/en-us/|g' "$tmp/pruned.md" > "$tmp/final.md"

after=$(wc -l < "$tmp/final.md")
fences=$(grep -c '^```' "$tmp/final.md" || true)

emit() { [ -n "$2" ] && echo "$1: $2"; return 0; }

mkdir -p "$(dirname "$out")"
{
  echo "---"
  emit title "$title"
  emit source-url "$canonical"
  emit applies-to-version "$moniker"
  emit upstream-repo-url "$giturl"
  emit upstream-commit "$commit"
  emit upstream-last-edited "$msdate"
  emit learn-page-updated "$updated"
  emit fetched-on "$(date -u +%Y-%m-%d)"
  emit learn-default-moniker "$defmoniker"
  emit learn-all-monikers "$(echo "$monikers" | sed 's/ *$//')"
  emit learn-uid "$uid"
  echo "vendored-by: scripts/vendor-learn-page.sh"
  echo "transform: |"
  echo "  Fetched with 'Accept: text/markdown', so Learn had already inlined the"
  echo "  ':::code source=' samples, the '[!INCLUDE]' files and the '<xref:>' links."
  echo "  Dropped whole '::: moniker' blocks not naming $moniker (${before} -> ${after} lines)."
  [ -n "$pivot" ] && echo "  Dropped whole '::: zone pivot' blocks other than '$pivot'."
  echo "  Absolutised root-relative links to learn.microsoft.com. No prose was rewritten."
  echo "---"
  echo
  sed '/./,$!d' "$tmp/final.md"
} > "$out"

echo "    commit  $commit"
echo "    lines   $before -> $after"
echo "    samples $((fences / 2)) fenced code blocks"
echo "    wrote   docs/vendor/dotnet/$dest"
echo
echo "Now add a row to docs/vendor/dotnet/README.md naming the APIs this page covers -"
echo "that table is how an agent finds the file, and an unindexed page is an unfound one."
