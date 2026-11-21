#!/usr/bin/env node
// Adds the pull request to every CHANGELOG.md entry that only links its commit, so each line says where the change
// came from (the PR has the description and pictures). The shared release workflow runs it on the new section
// (`--latest`), so GitHub release notes get the links too. Run it with no flag to fill in the whole file. From the
// repo's root:
//
//   node /path/to/workflows/scripts/changelog-prs.mjs [--latest] [--file CHANGELOG.md]
//
// The repo is GITHUB_REPOSITORY (set in Actions), else the current checkout's GitHub repo. Needs `gh` signed in
// (GH_TOKEN in Actions). A commit with no merged PR (pushed straight to main) is left as it is.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let REPO = process.env.GITHUB_REPOSITORY || '';
const prUrl = (n) => `https://github.com/${REPO}/pull/${n}`;

function currentRepo() {
  return execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], { encoding: 'utf8' }).trim();
}

/** The merged PR a commit landed in: the one into main if there is one, else the earliest merged. */
export function pickPr(prs) {
  const merged = (prs || []).filter((p) => p.merged_at);
  if (!merged.length) return null;
  const main = merged.filter((p) => p.base?.ref === 'main');
  return (main.length ? main : merged).sort((a, b) => a.merged_at.localeCompare(b.merged_at) || a.number - b.number)[0].number;
}

/** Entry lines (in the newest section only, with `latest`) that link a commit but no PR or issue yet. */
export function linesToFill(text, latest = false) {
  const lines = text.split('\n');
  const out = [];
  let section = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) section++;
    if (latest && section > 1) break;
    const l = lines[i];
    if (!/^\* /.test(l) || /\/(pull|issues)\/\d+\)/.test(l)) continue;
    const m = l.match(/\(\[[0-9a-f]{7,}\]\([^)]*\/commit\/([0-9a-f]{40})\)\)\s*$/);
    if (m) out.push({ i, sha: m[1] });
  }
  return out;
}

/** The line with the PR link put in front of its commit link, the way the release tool writes `(#123)` itself. */
export function withPr(line, n) {
  return line.replace(/ (\(\[[0-9a-f]{7,}\]\([^)]*\/commit\/[0-9a-f]{40}\)\))\s*$/, ` ([#${n}](${prUrl(n)})) $1`);
}

function prsFor(sha) {
  const json = execFileSync('gh', ['api', `repos/${REPO}/commits/${sha}/pulls`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(json);
}

function main() {
  const args = process.argv.slice(2);
  if (process.env.DRY_RUN === 'true') return console.log('changelog-prs: preview only, nothing changed');
  if (!REPO) REPO = currentRepo();
  const fi = args.indexOf('--file');
  const file = fi >= 0 ? args[fi + 1] : 'CHANGELOG.md';
  const text = readFileSync(file, 'utf8');
  const todo = linesToFill(text, args.includes('--latest'));
  const lines = text.split('\n');
  const cache = new Map();
  let added = 0, none = 0, failed = 0;
  for (const { i, sha } of todo) {
    let n = cache.get(sha);
    if (n === undefined) {
      try { n = pickPr(prsFor(sha)); } catch (e) { failed++; console.warn(`changelog-prs: ${sha.slice(0, 7)}: ${String(e.stderr || e.message).trim()}`); continue; }
      cache.set(sha, n);
    }
    if (n) { lines[i] = withPr(lines[i], n); added++; } else none++;
  }
  writeFileSync(file, lines.join('\n'));
  console.log(`changelog-prs: ${todo.length} entries without a PR; linked ${added}, no merged PR ${none}, lookup failed ${failed}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
