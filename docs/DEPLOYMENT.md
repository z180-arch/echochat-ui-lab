# EchoChat Deployment

This file is the deployment source of truth. Other files only point here.

## Production Platform

EchoChat production deployment uses **Cloudflare Pages**.

GitHub Pages is **NOT** used.

Do not migrate this project to GitHub Pages unless the product owner explicitly requests it.

## Source Repository

GitHub repository: https://github.com/z180-arch/echochat-ui-lab

Default branch (verified via GitHub API): `main`

## Deployment Relationship

```text
GitHub main
  → Cloudflare Pages
  → Production
```

There must be only this production path. Do not add GitHub Pages, `gh-pages`, or `actions/deploy-pages`. Do not keep a second host in parallel.

## Production URL

Verified HTTP 200 from this environment (2026-09-16):

https://echochat-f4j.pages.dev/

The Pages project name is **inferred** from that `*.pages.dev` hostname (`echochat-f4j`). The Cloudflare Dashboard project id / account were **not** readable from this environment.

The GitHub repository `homepage` field still points at an old Vercel URL. That is GitHub metadata, not the production host.

## Production Branch

Recorded production branch: **`main`**

Evidence in-repo: GitHub `default_branch` is `main`; [CURRENT_STATE.md](CURRENT_STATE.md) canonical line is GitHub `main`.

Cloudflare Dashboard “Production branch” could not be read. Do not change it without product-owner approval.

## Project Structure

```text
/        marketing landing (index.html, landing-v3.html)
/app/    application PWA (app/index.html → src/main.js)
```

Cloudflare Pages publishes the **repository root**, not `/app/` as the Pages root.

`/app/` is an entry path on that site. `app/index.html` sets `<base href="/" />` and loads `/src/...`. If Pages root were set to `/app/`, the app would break.

Keep that layout. Do not “fix” hosting by moving the Pages root to `/app/`.

## Build Configuration

There is **no application bundler**. `package.json` only defines `npm test`. There is no `wrangler.toml` / `wrangler.jsonc` in the repository.

In-repo static hosting files (commit `3e05bba`):

| File | Role |
|------|------|
| `_headers` | `Cache-Control: no-cache` on `/sw.js`, `/app/`, `/app/index.html` |
| `_redirects` | `/app` → `/app/` (301) |
| `.assetsignore` | Wrangler Direct Upload exclude list (`tests/`, `scripts/`, `docs/`, `.github/`, secrets) |

Live check (2026-09-16): `GET /app/` returned `Cache-Control: no-cache`, matching `_headers`. That is evidence the current Pages project serves this repo as **static assets from the repository root**.

Dashboard fields that are **not** in git and could not be read:

| Field | Status |
|-------|--------|
| Build command | Not in repo. Zero-build; do not invent one. |
| Build output directory | Not in repo. Inferred: repository root / `.` |
| Root directory | Not in repo. Inferred: `/` (repo root) |
| Node version | Not a Pages runtime requirement for this static PWA. CI uses Node 20 for `npm test` only. |
| Environment variables | None in repo. Do not record secrets. Dashboard env names were not listed. |

Do not add a build command, Wrangler production config, or GitHub Actions deploy workflow unless the product owner asks.

## Automatic Deployment

**Intended:** pushes to `main` trigger Cloudflare Pages production when GitHub is connected to that Pages project.

**Confirmed from this environment:** no.

- No Cloudflare API / Wrangler login / Dashboard access here.
- GitHub Pages API is 404 (`has_pages: false`). GitHub Actions contains only `.github/workflows/ci.yml` (tests + Chrome verifies). No deploy workflow.
- Live `https://echochat-f4j.pages.dev/` on 2026-09-16 still served pre-grammar landing copy (`打开即用`). `GET /src/domain/witness.js` returned `text/html` (the landing), so that file was not on the published asset set. GitHub `main` at the same time was `b26b769` (`feat: establish companion interaction grammar`), which includes `witness.js`.

So: the Pages project exists and serves this static tree, but **Git → Pages automatic production deploy is not verified**. Historical repo signals (`.assetsignore`, gitignored `.wrangler/`, `chore(deploy): configure Cloudflare Pages static hosting`) match Wrangler Direct Upload more than a confirmed Git integration.

If Dashboard Git integration is already on for `main`, `git push origin main` is the normal update. If the project is still Direct Upload only, a push will not refresh production until Git is connected or an authorized Wrangler upload is run. Connecting Git, or running a production upload, is infrastructure — product-owner approval.

## Local Development

No bundler. Serve the repository root as static files.

```bash
python3 -m http.server 8080
```

- Landing: http://127.0.0.1:8080/
- App: http://127.0.0.1:8080/app/

Windows landing helper: `preview-landing.bat`.

Local tests (only entry):

```bash
npm test
```

There is no `npm run build`, lint, or typecheck script. Browser verifies are CI-only (`scripts/*_verify.mjs`).

## Deployment Verification

| Item | Value |
|------|--------|
| Date | 2026-09-16 |
| GitHub `main` | `b26b769` — feat: establish companion interaction grammar |
| Local `HEAD` | same; working tree was clean before this documentation commit |
| GitHub Pages | Disabled (`has_pages: false`; `/pages` API 404) |
| Live Pages URL | https://echochat-f4j.pages.dev/ — HTTP 200, `Server: cloudflare` |
| Live vs `main` | **Not the same snapshot** (see Automatic Deployment) |
| Cloudflare Dashboard | Could not be queried |

Cloudflare deployment status could not be directly verified from this development environment. No deployment ID is recorded here.

## Important Rules

- Do not migrate deployment to GitHub Pages.
- Do not create a second deployment platform.
- Do not change the production deployment configuration without need.
- Do not expose API keys or secrets.
- Do not commit `.env` secrets, Cloudflare API tokens, or `.echochat.local.json`.
- Deployment configuration changes require explicit product-owner approval if they affect production infrastructure.
- Normal application changes should continue to flow through Git → Cloudflare Pages.
- Do not treat the stale GitHub `homepage` Vercel URL as production.
