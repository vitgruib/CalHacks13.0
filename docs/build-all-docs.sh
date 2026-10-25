#!/usr/bin/env bash
# Builds docs/ALL-DOCS.md: every project doc in one file, for pasting into an AI.
# Run from anywhere: ./docs/build-all-docs.sh
set -euo pipefail
cd "$(dirname "$0")/.."
out=docs/ALL-DOCS.md

# Reading order: overview, plan, design, research, submission, then component READMEs.
# Left out: TASKS.md, PROGRESS.md and whiteboard/ (work logs, not docs),
# AGENTS.md/CLAUDE.md (rules for coding agents), docs/research/sources/ (raw text).
files=(
  README.md
  docs/MASTER-PLAN.md
  docs/ARCHITECTURE.md
  docs/AGENTS-AT-A-GLANCE.md
  docs/REQUEST-STATES.md
  docs/DATA-SOURCES.md
  docs/EDGE-TESTING.md
  DECISIONS.md
  docs/HYPHENATE.md
  docs/TRACKS.md
  docs/research/README.md
  docs/research/approval-loop.md
  docs/research/money-cycle.md
  docs/research/agent-purchasing.md
)
files+=(docs/research/pain-points/*.md)
files+=(docs/submission/*.md)
files+=(agents/README.md agents/src/sources/papers.md sim/README.md scrapers/README.md hero/README.md)

# Pick up any doc added later that the list above doesn't name yet.
while IFS= read -r f; do
  [[ " ${files[*]} " == *" $f "* ]] || files+=("$f")
done < <(git ls-files 'docs/*.md' | grep -v '^docs/ALL-DOCS.md$' | grep -v '^docs/research/sources/')

{
  echo "# Grant Test Auto: all documentation in one file"
  echo
  echo "Generated $(date '+%Y-%m-%d %H:%M %Z') from commit $(git rev-parse --short HEAD) by \`docs/build-all-docs.sh\`. Don't edit this file; edit the source docs and rerun the script."
  echo
  echo "Each source file is wrapped in \`<document path=\"...\">\` ... \`</document>\`. Relative links inside a document are relative to its own path. Left out: TASKS.md, PROGRESS.md, whiteboard/ (work logs), AGENTS.md and CLAUDE.md (rules for coding agents), and raw sources in docs/research/sources/."
  echo
  echo "## Contents"
  echo
  for f in "${files[@]}"; do
    echo "- \`$f\`: $(grep -m1 '^# ' "$f" | sed 's/^# //')"
  done
  for f in "${files[@]}"; do
    echo
    echo "<document path=\"$f\">"
    echo
    cat "$f"
    echo
    echo "</document>"
  done
} > "$out"
echo "wrote $out: ${#files[@]} files, $(wc -c < "$out" | tr -d ' ') bytes"
