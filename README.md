# workflows

Shared GitHub Actions workflows and scripts for chorsnell's repos.

| Path | What it is |
|---|---|
| `.github/workflows/release.yml` | Reusable release job: semver from conventional commits → `CHANGELOG.md` (each line linked to its PR) → `vX.Y.Z` tag → GitHub release (with build assets if any) → starts the repo's deploy |
| `.github/workflows/deploy.yml` | Reusable build-and-deploy for Docker apps: builds the image to `ghcr.io/<repo>`, then SSHes to the Docker host to redeploy `/srv/apps/<app>` |
| `templates/release.yml` | A repo's `.github/workflows/release.yml`, calling the shared one |
| `templates/versionrc-go.json`, `templates/versionrc-node.json` | A repo's `.versionrc.json`: which file holds the version, changelog sections, release commit message |
| `templates/deploy-docker.yml` | A Docker app's `.github/workflows/deploy.yml`, calling the shared one |
| `scripts/changelog-prs.mjs` | Puts the pull request link on every `CHANGELOG.md` line (the release job runs it) |
| `scripts/shoot.mjs` | Takes a PR's screenshots from `docs/mockups/<slug>/shots.json` with Playwright |

## How a release goes

The owner runs it by hand from main: **Actions → release → Run workflow**.

- **Preview only** shows the next version and the changelog it would write, in the run summary. Nothing changes.
- **Version bump** `auto` works it out from the commits since the last `vX.Y.Z` tag: `feat` → minor, `fix`/`perf` →
  patch, `feat!:` or a `BREAKING CHANGE:` footer → major. On 0.x each lands one place lower (a `feat` is a patch, a
  breaking change is a minor). `docs`, `chore`, `refactor`, `test`, `ci`, `build` and `style` don't count and stay out
  of the changelog. Pick `patch`/`minor`/`major` to force it.

Then the job runs the repo's tests, bumps the version file, writes the changelog section and links each line to its
PR, commits `chore(release): vX.Y.Z` to main, tags it, builds the assets with `VERSION=X.Y.Z` set, publishes the
GitHub release with those assets and the changelog section as notes, and starts the repo's deploy workflow on the tag
with `version: X.Y.Z`.

PRs are squash-merged with the PR title as the commit message, so **the PR title is the changelog line**.

A repo with no `vX.Y.Z` tag yet starts its history at the commit that added `.versionrc.json`, tagged as the version
in its version file. The first changelog lists only what came after the setup, not the repo's whole past.

## Adding a repo

From the repo's root, with this repo cloned to `/tmp/shared-workflows`:

1. **Release workflow.** Copy `templates/release.yml` to `.github/workflows/release.yml`. Keep the block for the
   repo's kind and delete the others:
   - Go binary: `go_version_file`, `test`, `build` (fill in the real `./cmd/...` path and binary name; `$VERSION` is
     the release version), `assets`.
   - Docker app: `test`, `deploy_workflow: deploy.yml`.
   - Node: `node_version`, `test`, plus `build`/`assets` if it ships files.

   Set `runs_on` if the repo's runner needs a specific label.
2. **Version file.** Copy `templates/versionrc-go.json` or `templates/versionrc-node.json` to `.versionrc.json`.
   Go repos also get a `VERSION` file containing `0.0.0`. Node repos keep the version in `package.json` (and
   `package-lock.json` if there is one). Monorepos add their other `package.json` files to `bumpFiles`.
3. **Changelog.** Make `CHANGELOG.md` with the `header` from `.versionrc.json`:
   `node -e "process.stdout.write(require('./.versionrc.json').header)" > CHANGELOG.md`
4. **Deploy (Docker apps on the Docker host).** Copy `templates/deploy-docker.yml` to `.github/workflows/deploy.yml`
   and set `app` to the app's folder under `/srv/apps`.
5. **Ship it** as one PR titled `ci: release workflow and session rules`.

### Settings the owner changes by hand

- Settings → General → Pull requests: allow **squash merging only**, default commit message **Pull request title**;
  tick **Automatically delete head branches**.
- Stacked pull requests turned on (preview).
- A self-hosted runner that serves the repo. Personal-account repos need their own registration; `horse-homelab` repos
  use the org runner.
- If `main` has a ruleset that requires PRs: add **GitHub Actions** to its bypass list, so the release commit can be
  pushed.
- Secrets/variables the deploy needs: `DEPLOY_SSH_KEY` (and `DEPLOY_HOST`, `DOCKER_BUILD_SECRETS`,
  `TS_OAUTH_CLIENT_ID`/`TS_OAUTH_SECRET` if used) for Docker apps.

### First release

After the setup PR is merged: **Actions → release** with *Preview only*, then for real. Pick **minor** for the first
one to get `v0.1.0` on a 0.x repo.

## Screenshots for PRs

```sh
git clone --depth 1 https://github.com/chorsnell/workflows /tmp/shared-workflows   # once
BASE_URL=http://localhost:8080 node /tmp/shared-workflows/scripts/shoot.mjs <slug>   # from the repo root
```

It reads `docs/mockups/<slug>/shots.json` and writes `<name>.png` next to it. Each entry: `name` (required), `path`
(page under `BASE_URL`) or `file` (a local HTML file in the folder, e.g. `mockup.html`), `width` (1440), `height`
(900), `theme` (`dark`/`light`), `full` (whole page), `waitFor` (selector), `click` (selector or list), `selector`
(shoot one element), `wait` (ms). The file can be a list, or `{"defaults": {...}, "shots": [...]}`.

```json
{
  "defaults": { "path": "/devices", "waitFor": "table" },
  "shots": [
    { "name": "built-desktop", "theme": "dark" },
    { "name": "built-desktop-light", "theme": "light" },
    { "name": "built-phone", "width": 390, "height": 844, "theme": "dark", "full": true },
    { "name": "built-menu", "click": "#more", "selector": ".menu" }
  ]
}
```

It flags pages that scroll sideways and PNGs over 400 KB, and exits non-zero if there are any. It uses the repo's
Playwright if it has one, else a global install, else fetches one into a temp folder the first time.

## Tests

```sh
node --test scripts/*.test.mjs
```
