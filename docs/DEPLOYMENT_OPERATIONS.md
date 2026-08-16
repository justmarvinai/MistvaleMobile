# Mistvale — Deployment & Operations

> Status: **Planning.** Target: single VPS — Ubuntu 24.04 LTS, 1 vCPU, 4 GB RAM, 50 GB SSD. No dev/staging instance: `main` (game repo) + Admin Suite edits are production. The scripts below are deliverables of Phase P0 (v1) and hardened through P10.

## 1. Topology

```
                    ┌────────────────────────── VPS ──────────────────────────┐
 players ── HTTPS ──►  nginx (TLS, gzip/brotli, static, proxy)                │
 admin   ── HTTPS ──►    ├─ game.<domain>       → /srv/mistvale/client (SPA)  │
                    │    ├─ game.<domain>/api   → 127.0.0.1:3001 (Fastify)    │
                    │    ├─ admin.<domain>      → /srv/mistvale/admin (SPA)   │
                    │    ├─ admin.<domain>/admin/api → 127.0.0.1:3001         │
                    │    └─ /assets, /atlases, /uploads  (immutable caching)  │
                    │  mistvale-server.service (Node 22, systemd)             │
                    │  postgresql@16 (localhost only)                          │
                    │  cron-in-process (server) + system cron (backups)        │
                    └──────────────────────────────────────────────────────────┘
```
- Everything binds localhost except nginx 80/443. UFW: allow 22/80/443 only. fail2ban on sshd + nginx auth endpoints. Admin subdomain can additionally be IP-allowlisted in nginx (`ADMIN_ALLOWLIST` in deploy env).
- Directory layout: `/srv/mistvale/{repo,admin-repo,client,admin,releases}` (builds symlink-swapped), `/var/lib/mistvale/uploads`, `/var/backups/mistvale`.

## 2. Scripts (in `scripts/`, all idempotent, `set -euo pipefail`, logged to `/var/log/mistvale/`)

| Script | What it does |
|---|---|
| `DEPLOY.sh` | Fresh-VPS bootstrap: apt update; install nginx, PostgreSQL 16, Node 22 (NodeSource), pnpm, certbot, ufw, fail2ban; create `mistvale` system user; clone both repos; write `.env` interactively (domains, DB password, session pepper — generated); create DB + role; run migrations + `SEED.sh`; build client/admin/server; install systemd unit + nginx sites + certbot certs; enable firewall; start everything; run `STATUS.sh`. Safe to re-run (skips done steps). |
| `UPDATE.sh` | Zero-drama updates: `git fetch/pull` both repos (target branch configurable); `pnpm install --frozen-lockfile`; build server+client+admin into `releases/<ts>` (nice/ionice so the live server stays responsive on 1 core); **backup DB first**; run migrations; symlink-swap static dirs; `systemctl restart mistvale-server` (downtime ≈ 2–5 s; client shows reconnect toast); post-check health endpoint, auto-rollback symlinks + restore previous build if health fails. `--content-only` flag: reseed content defs without rebuild. |
| `BACKUP.sh` | `pg_dump -Fc` + tar of `/var/lib/mistvale/uploads` → `/var/backups/mistvale/<date>/`; keep 14 daily + 8 weekly; optional `RCLONE_REMOTE` offsite push. Installed as system cron (03:30). |
| `RESTORE.sh` | Interactive: list backups → confirm phrase → stop server → restore DB (+uploads) → start → health check. |
| `STATUS.sh` | One screen: systemd states, health endpoint JSON (RSS, event-loop lag, DB pool, active battles, content rev), disk/RAM, cert expiry, last backup age, error count last hour. |
| `LOGS.sh` | Tail/filter server logs (`-e` errors only, `-p <playerName>` by player, `-r <requestId>`). |
| `SEED.sh` | Load content seeds into empty content tables; `--force-content` = full content refresh (player data untouched, auto-backup first). |

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
- **Monitoring (EA-appropriate):** `STATUS.sh` on demand; optional free UptimeRobot ping to `/api/health-lite`; server emails/log-marks on crash-loop (systemd `OnFailure` → log flag surfaced on Admin dashboard).
- **Content workflow reminder:** git seeds bootstrap; after that the DB is content truth. Admin "Export content" downloads JSON for git-committing back when you want content in version control (recommended after big authoring sessions — makes content reviewable + disaster-proof).
- **Disaster recovery:** VPS dies → new VPS + `DEPLOY.sh` + `RESTORE.sh` from offsite backup ≈ 30 min. Documented drill in P10 checklist.
- **TLS:** certbot auto-renew (systemd timer) for both subdomains.

## 5. Release process (per phase / content drop)
1. Merge to `main` (CI green: lint, typecheck, engine goldens, build).
2. SSH → `sudo -u mistvale /srv/mistvale/repo/scripts/UPDATE.sh`.
3. Script prints health + new content rev; smoke: login, one battle, one summon.
4. Tag release `ea-0.1.x`; CHANGELOG entry (script reminds).
Rollback = `UPDATE.sh --rollback` (previous release dir + DB restore only if a migration was destructive — script warns).

## 6. Open items (tracked in USER_QUESTIONS.md)
- Final domain names (+ whether admin gets IP allowlist), VPS provider/SSH details, offsite backup remote (rclone target), reset timezone confirmation.
