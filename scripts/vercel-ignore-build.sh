#!/usr/bin/env bash
# Vercel "Ignored Build Step" for the web project (root directory apps/web):
#   bash ../../scripts/vercel-ignore-build.sh
# Exit 0 skips the build, exit 1 builds. It skips only when every changed file
# is under scripts/ or docs/, or a Markdown file at the repository root
# (CLAUDE.md, AGENTS.md, WORK_LOG_*.md), and none of them is used by the web build
# (build-crawler-bundles.mjs, notice-fact-normalizer.js). When unsure, it builds.
# Note: the web build bundles the crawler for /api/admin/crawler/run, so a
# skipped deployment keeps the previous crawler bundle in the admin run.
BASE="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -z "$BASE" ] || ! git cat-file -e "$BASE^{commit}" 2>/dev/null; then BASE="HEAD^1"; fi
if ! git cat-file -e "$BASE^{commit}" 2>/dev/null; then echo "build: nothing to compare with"; exit 1; fi
CHANGED=$(git diff --name-only "$BASE" HEAD) || { echo "build: diff failed"; exit 1; }
if [ -z "$CHANGED" ]; then echo "build: no file changes (redeploy)"; exit 1; fi
if printf '%s\n' "$CHANGED" | grep -vqE '^(scripts/|docs/|[^/]+\.md$)'; then echo "build: files outside scripts/docs changed"; exit 1; fi
if printf '%s\n' "$CHANGED" | grep -qxE 'scripts/build-crawler-bundles\.mjs|scripts/crawler/src/notice-fact-normalizer\.js'; then echo "build: a file the web app imports changed"; exit 1; fi
echo "skip: only crawler scripts and docs changed"; exit 0
