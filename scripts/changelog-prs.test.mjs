// scripts/changelog-prs.mjs (run: node --test scripts/*.test.mjs): which CHANGELOG.md lines get a PR link, and how.
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.GITHUB_REPOSITORY = 'horse-homelab/hots-dash';
const { linesToFill, pickPr, withPr } = await import('./changelog-prs.mjs');

const sha = 'ece7b9a0dcb23435887bc34e2e80f9347fa45be2';
const entry = `* **admin:** joined and last game ([ece7b9a](https://github.com/horse-homelab/hots-dash/commit/${sha}))`;
const linked = `* **maps:** names ([#626](https://github.com/horse-homelab/hots-dash/issues/626)) ([8b5f2a7](https://github.com/horse-homelab/hots-dash/commit/${sha}))`;

test('linesToFill skips entries that already name a PR or have no commit', () => {
  const text = ['# Changelog', '## [1.2.0](x) (2026-11-14)', '### New', entry, linked, '* Plain line', '## [1.1.0](x)', entry].join('\n');
  assert.deepEqual(linesToFill(text).map((t) => t.i), [3, 7]);
  assert.deepEqual(linesToFill(text, true), [{ i: 3, sha }]);
});

test('withPr puts the PR in front of the commit link', () => {
  assert.equal(
    withPr(entry, 627),
    `* **admin:** joined and last game ([#627](https://github.com/horse-homelab/hots-dash/pull/627)) ([ece7b9a](https://github.com/horse-homelab/hots-dash/commit/${sha}))`,
  );
});

test('pickPr prefers the merged PR into main', () => {
  const pr = (number, ref, merged_at) => ({ number, base: { ref }, merged_at });
  assert.equal(pickPr([pr(5, 'feat/a', '2026-11-01T10:00:00Z'), pr(6, 'main', '2026-11-02T10:00:00Z')]), 6);
  assert.equal(pickPr([pr(9, 'feat/b', '2026-11-03T10:00:00Z'), pr(8, 'feat/a', '2026-11-01T10:00:00Z')]), 8);
  assert.equal(pickPr([pr(7, 'main', null)]), null);
  assert.equal(pickPr([]), null);
});
