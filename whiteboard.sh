#!/usr/bin/env bash
# Reads the agent whiteboard (whiteboard/README.md).
#   ./whiteboard.sh                  cards and open threads
#   ./whiteboard.sh @ethan           ...plus the threads waiting on @ethan
#   ./whiteboard.sh @ethan/claude-2  ...the same, but posts by @ethan's other agents count as not yours
#   ./whiteboard.sh new <slug> "<title>" [@asked ...]   start a thread
set -euo pipefail
cd "$(dirname "$0")/whiteboard"

# "12m ago" from a file's last commit, or its mtime if it isn't committed yet.
age() {
  local t
  t=$(git log -1 --format=%ct -- "$1" 2>/dev/null || true)
  if [ -z "$t" ] || [ -n "$(git status --porcelain -- "$1")" ]; then
    t=$(stat -f %m "$1" 2>/dev/null || stat -c %Y "$1")
  fi
  local m=$(( ($(date +%s) - t) / 60 ))
  if [ "$m" -lt 60 ]; then echo "${m}m ago"; else echo "$((m / 60))h$((m % 60))m ago"; fi
}

if [ "${1:-}" = new ]; then
  slug=${2:?usage: ./whiteboard.sh new <slug> "<title>" [@asked ...]}
  title=${3:?usage: ./whiteboard.sh new <slug> "<title>" [@asked ...]}
  shift 3
  f="threads/$(date +%Y-%m-%d)-$slug.md"
  [ -e "$f" ] && { echo "$f already exists" >&2; exit 1; }
  printf '# %s\nStatus: open\nAsks: %s\n\n### %s @<human>/<agent>\n\n' "$title" "${*:-—}" "$(date +%H:%M)" > "$f"
  echo "whiteboard/$f: write your post under the ### line (put your own @<human>/<agent> in it)"
  exit 0
fi

me=${1:-}
me=${me#@}
human=${me%%/*}

echo "NOW: who's doing what"
found=
for f in now/*.md; do
  [ -e "$f" ] || continue
  found=1
  who=$(sed -n '1s/^# *//p' "$f")
  doing=$(sed -n 's/^Doing: *//p' "$f" | head -1)
  want=$(sed -n 's/^Want input on: *//p' "$f" | head -1)
  printf '  %-26s %-10s %s\n' "$who" "($(age "$f"))" "$doing"
  case "$want" in ''|—|-|none) ;; *) printf '  %-26s %-10s wants input on: %s\n' '' '' "$want" ;; esac
done
[ -n "$found" ] || echo "  (no cards; add yours in whiteboard/now/)"

echo
echo "OPEN THREADS"
found=
waiting=()
for f in threads/*.md; do
  [ -e "$f" ] || continue
  grep -qi '^Status: *open' "$f" || continue
  found=1
  title=$(sed -n '1s/^# *//p' "$f")
  asks=$(sed -n 's/^Asks: *//p' "$f" | head -1)
  last=$(grep '^### ' "$f" | tail -1 | awk '{print $3}')
  posts=$(grep -c '^### ' "$f" || true)
  printf '  %s\n    %s · %s posts · last %s, %s · asks %s\n' "$title" "whiteboard/$f" "$posts" "${last:-nobody}" "$(age "$f")" "${asks:-—}"
  # Waiting when your human is asked or mentioned and the last post isn't yours.
  if [ "$me" = "$human" ]; then mine="${last%%/*}"; else mine="$last"; fi
  if [ -n "$me" ] && grep -q "@$human\b" "$f" && [ "$mine" != "@$me" ]; then
    waiting+=("$title (whiteboard/$f)")
  fi
done
[ -n "$found" ] || echo "  (none; start one with ./whiteboard.sh new <slug> \"<title>\")"

if [ -n "$me" ]; then
  echo
  echo "WAITING ON YOU (@$me)"
  if [ ${#waiting[@]} -eq 0 ]; then echo "  (nothing)"; else printf '  %s\n' "${waiting[@]}"; fi
fi
