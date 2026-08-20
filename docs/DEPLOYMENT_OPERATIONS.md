# Mistvale — Deployment & Operations

> Status: **Planning.** Target: single VPS — Ubuntu 24.04 LTS, 1 vCPU, 4 GB RAM, 50 GB SSD. No dev/staging instance: `main` (game repo) + Admin Suite edits are production. The scripts below are deliverables of Phase P0 (v1) and hardened through P10.

## 1. Topology

**Domain (owner-provided): `play.pathlands.cc`** — single domain, path-based routing; DNS already points at the VPS. Admin Panel lives at `play.pathlands.cc/admin`, reachable only by accounts with `admin` rank (see ARCHITECTURE §5.6).

```
                    ┌────────────────────────── VPS ──────────────────────────┐
 players ── HTTPS ──►  nginx (TLS, gzip/brotli, static, proxy)                │
 admins  ── HTTPS ──►    play.pathlands.cc                                    │
                    │    ├─ /              → /srv/mistvale/client (game SPA)  │
                    │    ├─ /api           → 127.0.0.1:3001 (Fastify)         │
                    │    ├─ /admin/api     → 127.0.0.1:3001 (rank-gated)      │
                    │    ├─ /admin         → /srv/mistvale/admin (admin SPA)  │
                    │    ├─ /assets /atlases /uploads (immutable caching)     │
                    │    └─ /sprites /icons (unhashed art, daily revalidate)  │
                    │  mistvale-server.service (Node 22, systemd)             │
                    │  postgresql@16 (localhost only)                          │
                    │  cron-in-process (server) + system cron (backups)        │
                    └──────────────────────────────────────────────────────────┘
```
- nginx location order: `/admin/api` (proxy) before `/admin` (static, SPA fallback to `/admin/index.html`) before `/api` (proxy) before `/` (static). Admin SPA builds with Vite `base: '/admin/'`.
- **The SPA fallback answers routes, never files.** `try_files $uri $uri/ /index.html` is right for a bookmark and a lie about a missing asset: a sprite dropped by a half-finished sync came back as an HTML document with a 200, so the `<img>` drew a torn page, `fetch(…manifest.json)` failed with a parse error about `<`, and nothing in the network tab said "missing". A final regex location 404s anything whose path names a file (`^/.+\.[A-Za-z0-9]+$`), written last so the dotfile deny and the font, audio and home-screen-icon rules keep their say. Safe because the game client has no URL routing — every screen is a value in a store, all of it at `/`. **`scripts/CHECK_DEPLOY.sh` starts the rendered site on a loopback port and asks it**, twenty-one paths of routes, files and absences, so this cannot regress into a config that merely parses.
- Everything binds localhost except nginx 80/443. UFW: allow 22/80/443 only. fail2ban on sshd + nginx auth endpoints. `location /admin` can additionally be IP-allowlisted (`ADMIN_ALLOWLIST` in deploy env, optional).
- Single certbot cert for `play.pathlands.cc`.
- Directory layout: `/srv/mistvale/{repo,admin-repo,client,admin,releases}` (builds symlink-swapped), `/var/lib/mistvale/uploads`, `/var/backups/mistvale`.

## 2. Scripts (in `scripts/`, all idempotent, `set -euo pipefail`, logged to `/var/log/mistvale/`)

| Script | What it does |
|---|---|
| `DEPLOY.sh` | Fresh-VPS bootstrap: apt update; install nginx, PostgreSQL 16, Node 22 (NodeSource), pnpm, certbot, ufw, fail2ban; create `mistvale` system user; clone both repos; write `.env` interactively (`DOMAIN=play.pathlands.cc` default, DB password + session pepper generated); create DB + role; run migrations + `SEED.sh`; build client/admin/server; install systemd unit + nginx site + certbot cert; enable firewall; start everything; **bootstrap the first admin: prompts for an account name → creates it (or finds it) and sets `rank=admin` via `SET_RANK.sh`**; run `STATUS.sh`. Safe to re-run (skips done steps). |
| `SET_RANK.sh` | `SET_RANK.sh <accountName> <player\|gamemaster\|admin>` — rank management from the CLI (audited as `admin:cli`); how the first admin account is created and the recovery path if all admins lock themselves out. |
| `UPDATE.sh` | Zero-drama updates: `git fetch/pull` both repos (target branch configurable); `pnpm install --frozen-lockfile`; build server+client+admin into `releases/<ts>` (nice/ionice so the live server stays responsive on 1 core); **backup DB first**; run migrations; symlink-swap static dirs; `systemctl restart mistvale-server` (downtime ≈ 2–5 s; client shows reconnect toast); post-check health endpoint, auto-rollback symlinks + restore previous build if health fails. `--content-only` flag: reseed content defs without rebuild. |
| `BACKUP.sh` | `pg_dump -Fc` + tar of `/var/lib/mistvale/uploads` → `/var/backups/mistvale/<date>/`; keep 14 daily + 8 weekly; optional `RCLONE_REMOTE` offsite push. Installed as system cron (03:30). |
| `RESTORE.sh` | Interactive: list backups → confirm phrase → stop server → restore DB (+uploads) → start → health check. |
| `STATUS.sh` | One screen: systemd states, health endpoint JSON (RSS, event-loop lag, DB pool, active battles, content rev), disk/RAM, cert expiry, last backup age, error count last hour. |
| `LOGS.sh` | Tail/filter server logs (`-e` errors only, `-p <playerName>` by player, `-r <requestId>`). |
| `SEED.sh` | Load content seeds. On an empty install that is everything; on an install that already has content it **adds what is missing and changes nothing that is present** — the new content types and `game_config` keys a release brought, recorded as their own revision and printed line by line. That is what makes a release's tunables actually reach a live server instead of the feature silently running on code fallbacks. `--force-content` = full content refresh, replacing operator edits (player data untouched, auto-backup first). Content an operator *deleted* returns on the next seed; retiring content is what the `active` flag is for. Then fills the Arena's bot ladder — a separate step because bots are *player* data and the content seeder never writes any; idempotent, and a failure is a warning rather than a failed deploy since the nightly job retries. |

All scripts read one `/srv/mistvale/.env`; no secrets in git; `.env.example` documents every variable.

## 3. Tuning for 1 core / 4 GB
- **PostgreSQL** (`/etc/postgresql/16/main/conf.d/mistvale.conf`): `shared_buffers=256MB`, `effective_cache_size=1GB`, `work_mem=8MB`, `maintenance_work_mem=64MB`, `max_connections=20`, `wal_compression=on`, `random_page_cost=1.1` (SSD), autovacuum on defaults. Server pool: max 10.
- **Node**: `--max-old-space-size=1024`, pino to file (async), `NODE_ENV=production`.
- **nginx**: brotli/gzip static + JSON, `expires max` on hashed assets, `no-store` on API, HTTP/2, rate-limit zones on `/api/auth/*`.
- **systemd unit**: `Restart=always`, `RestartSec=3`, `MemoryMax=1536M` (OOM guard), `After=postgresql.service`, journal + file logging.
- Swap: 2 GB swapfile (build headroom safety), `vm.swappiness=10`.
- Build memory: client+admin Vite builds run sequentially in UPDATE.sh with `NODE_OPTIONS=--max-old-space-size=1536` — verified fit within 4 GB alongside the running game (worst case: builds run before restart, game stays up).

## 4. Operational routines
- **Daily reset** (in-process cron, default 04:00 Europe/Berlin, configurable in `game_config`): quest/shop/arena-token-bonus rotation, event activation/expiry, bot ladder nightly refresh, battle-log pruning, economy-log pruning (90 d).
- **Monitoring (EA-appropriate):** `STATUS.sh` on demand (reads `/api/health-lite`, and the full `/api/health` payload when `OPS_SESSION_TOKEN` holds an admin session token); optional free UptimeRobot ping to `/api/health-lite`; systemd `OnFailure` writes a crash marker that `STATUS.sh` and the Admin dashboard surface.
- **Content workflow reminder:** git seeds bootstrap; after that the DB is content truth. `pnpm content:export` writes it back into `content-snapshot/` for committing (recommended after big authoring sessions — makes content reviewable + disaster-proof).
- **Disaster recovery:** VPS dies → new VPS + `DEPLOY.sh` + `RESTORE.sh` from offsite backup ≈ 30 min. The drill is in `docs/LAUNCH_CHECKLIST.md`, and it is on the launch list rather than in a folder: a backup nobody has ever restored is not a recovery plan, and the only day it is cheap to prove that is the day before there are players.
- **Deploy assets are checked in CI.** `scripts/CHECK_DEPLOY.sh` parses and lints every operations script and hands the rendered nginx site to nginx's own parser — the least-exercised code in the repository, checked on every push instead of first thing on a deploy.
- **The Content-Security-Policy is part of the client's contract, and only the browser can check it.** `script-src 'self'` — no `unsafe-eval`, and it stays that way. Pixi builds its shaders with `new Function`, so `game/stage.ts` imports `pixi.js/unsafe-eval`; without it `Application.init` rejects and every battle is a correct fight over a black rectangle. That shipped and survived five rounds of debugging, because **the Vite dev server sends no CSP**, so the one environment nobody could test was the only one where it happened. `e2e/csp.spec.ts` closes that hole: it serves the real build under the policy parsed out of this repo's own nginx config, so a future dependency that wants `eval` — or a policy edit — fails in CI rather than on the owner's screen.
- **A release without unit art is not a release.** The sprite tree under `apps/client/public/sprites/` is a build artifact — generated from `assets/` by the client's own build (`pnpm run sprites` → `tools/asset-sync`) and gitignored — and its absence is the quietest failure this box has: the game boots, the HUD paints, the server resolves every fight correctly, and every battle draws an empty field, because each champion and each enemy is a texture that 404s. Nothing else on a status screen moves. So `UPDATE.sh` refuses to collect a client build with no `sprites/manifest.json`, or one that lists no units, naming the fix in the error; and `STATUS.sh` counts the units in the release that is actually running and marks the box degraded when there are none. The client also draws a silhouette for a unit whose art will not load, so even a broken box is a legible fight rather than an empty one — but the deploy is where this is supposed to be caught.
- **Content in git:** `pnpm content:export` writes the live content to `content-snapshot/` as sorted, byte-stable JSON. Commit after an authoring session and `git diff` says what the operator changed.
- **TLS:** certbot auto-renew (systemd timer) for both subdomains.

## 5. Release process (per phase / content drop)
1. Merge to `main` (CI green: lint, typecheck, engine goldens, build).
2. SSH → `sudo -u mistvale /srv/mistvale/repo/scripts/UPDATE.sh`. Plain `sudo` works too: `UPDATE.sh`, `BACKUP.sh`, `SEED.sh` and `SET_RANK.sh` re-exec themselves as the app user when started as root, so neither form can leave root-owned files in `/var/log/mistvale` or `/var/backups/mistvale` for the next run to trip over. (`DEPLOY.sh` and `RESTORE.sh` genuinely need root and stay root.)
3. Script prints health + new content rev; smoke: login, one battle, one summon.
4. Tag release `ea-0.1.x`; CHANGELOG entry (script reminds).
Rollback = `UPDATE.sh --rollback` (previous release dir + DB restore only if a migration was destructive — script warns).

## 6. Resolved decisions (owner, 2026-08-16)
- Domain: `play.pathlands.cc` (game) + `/admin` path (Admin Panel) — DNS already pointed at the VPS. Bare-metal systemd deployment (no Docker). Daily reset default Europe/Berlin. Still open operationally (non-blocking): optional IP allowlist for `/admin`, optional rclone offsite backup target.
