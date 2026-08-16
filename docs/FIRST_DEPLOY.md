# First deploy — bare VPS to running Mistvale

> A step-by-step runbook for the very first deployment onto a freshly purchased
> Ubuntu 24.04 server. Everything after this one is just `UPDATE.sh`.
>
> Target box: 1 vCPU · 4 GB RAM · 50 GB SSD · Ubuntu 24.04 LTS.
> Expect **15–25 minutes**, most of it the client build on a single core.

---

## 0. Before you touch the server

Three things to have ready.

**1 — The VPS IP address and root access.** Your provider gives you both when the
server is created. Check you can get in:

```bash
ssh root@YOUR_VPS_IP
```

If the provider gave you a password, it may force a change on first login. If you
uploaded an SSH key at creation, this just works.

**2 — DNS pointed at the new box.** This matters: at the time of writing,
`play.pathlands.cc` resolves to `76.13.141.8`, which is *not* your new server. In
your DNS provider, set an **A record**:

| Type | Name   | Value          | TTL |
| ---- | ------ | -------------- | --- |
| A    | `play` | `YOUR_VPS_IP`  | 300 |

Then wait for it to take effect and confirm from your own machine:

```bash
dig +short play.pathlands.cc A     # must print YOUR_VPS_IP
```

Propagation is usually a few minutes with a low TTL. **Let's Encrypt will refuse
to issue a certificate until this resolves to the new server** — it proves you own
the domain by connecting to it over the public internet.

> In a hurry? You can deploy first with `--skip-certbot` and add TLS later; see
> §5 "No TLS yet".

**3 — Nothing else.** Both repositories are public, so the server needs no GitHub
credentials, no deploy keys, and no tokens.

---

## 1. Get the scripts onto the server

`DEPLOY.sh` installs everything else, but it needs `git` to fetch itself first.

```bash
ssh root@YOUR_VPS_IP

apt-get update
apt-get install -y git

git clone https://github.com/justmarvinai/MistvaleMobile.git /opt/mistvale-bootstrap
cd /opt/mistvale-bootstrap
```

This copy is only the launcher. `DEPLOY.sh` clones the real working checkout to
`/srv/mistvale/repo`, and from there on that is the copy that runs.

---

## 2. Run the deploy

```bash
sudo ./scripts/DEPLOY.sh
```

That is the whole command. Defaults are the `main` branch and
`play.pathlands.cc`, both of which are what you want.

### What it asks you

| Prompt              | Answer                                                            |
| ------------------- | ----------------------------------------------------------------- |
| Public domain       | press Enter for `play.pathlands.cc`                                |
| Admin account name  | your login name, 3–16 chars, letters/digits/`_`/`-` (e.g. `marvin`) |
| Profile name        | your in-game display name (defaults to the account name)           |
| Password            | typed twice, never echoed                                          |

The account it creates is a **normal player account promoted to `admin` rank** —
the same account you play with, and the only kind that can open the Admin Panel.

### What it does (16 steps)

1. System packages (`curl`, `jq`, build tools, `fail2ban`, `ufw`, `certbot`)
2. PostgreSQL 16 + the tuned config for a 4 GB box
3. Node.js 22 (NodeSource) + pnpm via corepack
4. A 2 GB swapfile and `vm.swappiness=10` — build headroom on 4 GB
5. The `mistvale` service user and the directory tree
6. `/srv/mistvale/.env`, with a generated database password and session pepper
7. The PostgreSQL role and database
8. Clones both repositories
9. A sudoers drop-in so `mistvale` may restart only its own service
10. The systemd unit
11. The nginx site (TLS, path routing, rate limits, caching)
12. Firewall (22/80/443 only) and fail2ban
13. The nightly backup cron entry (03:30)
14. **First build, migration and seed** — the slow part, several minutes
15. The TLS certificate via certbot
16. The first admin account

Every step reports `ok`, `skip` or a warning as it goes. **The script is safe to
re-run**: finished steps are skipped, and it never deletes data. If something
fails, fix the cause and run the same command again.

When it finishes it prints your URLs and then runs `STATUS.sh` automatically.

---

## 3. Verify it worked

```bash
/srv/mistvale/repo/scripts/STATUS.sh
```

You want `mistvale-server`, `nginx` and `postgresql` all active, the health probe
answering, and a certificate with ~90 days left.

Then open **https://play.pathlands.cc** in a browser and:

- the login screen appears with the Mistvale logo and drifting mist
- sign in with the account you just created
- you land in the Haven, showing your name, level 1, and 20/20 energy
- locked destinations (Arena, Depths, Bazaar…) show a lock and their unlock level

That is Phase P0 working end to end.

### What is *not* there yet (by design)

- **`/admin` returns 404.** The Admin Panel is a separate app that does not exist
  yet — it is built in Phase A0, alongside game Phase P1. The deploy notices the
  admin repository has no code and continues without it, which is expected.
- **No gameplay.** No champions, battles, campaign or summoning. P0 is the
  foundation: accounts, sessions, the shell, and the deployment path. Everything
  else lands in the phases after it.

---

## 4. Day-to-day operations

All of these live in `/srv/mistvale/repo/scripts/`.

| Task                        | Command                                                                  |
| --------------------------- | ------------------------------------------------------------------------ |
| Deploy new code             | `sudo -u mistvale /srv/mistvale/repo/scripts/UPDATE.sh`                  |
| Health at a glance          | `/srv/mistvale/repo/scripts/STATUS.sh`                                   |
| Tail the logs               | `/srv/mistvale/repo/scripts/LOGS.sh -f`                                  |
| Errors only                 | `/srv/mistvale/repo/scripts/LOGS.sh -e`                                  |
| Trace one player's requests | `/srv/mistvale/repo/scripts/LOGS.sh -p WardenName`                       |
| Look up an error code       | `/srv/mistvale/repo/scripts/LOGS.sh -r X7F2K`                            |
| Back up now                 | `sudo /srv/mistvale/repo/scripts/BACKUP.sh`                              |
| Restore a backup            | `sudo /srv/mistvale/repo/scripts/RESTORE.sh --list`, then without `--list` |
| Promote/demote an account   | `sudo -u mistvale /srv/mistvale/repo/scripts/SET_RANK.sh NAME admin`     |

`UPDATE.sh` backs the database up first, builds into a timestamped release,
migrates, swaps symlinks, restarts, and health-checks — and **rolls itself back
automatically** if the new release fails that check. Backups run nightly at 03:30
and keep 14 daily plus 8 weekly copies.

### Optional: full health output

`STATUS.sh` reads the public probe by default. For the detailed payload (memory,
event-loop lag, database pool) give it an admin session token:

```bash
curl -s -X POST https://play.pathlands.cc/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"accountName":"YOUR_ADMIN","password":"YOUR_PASSWORD"}' -i | grep -i set-cookie
```

Put the `mv_session` value into `OPS_SESSION_TOKEN=` in `/srv/mistvale/.env`.
Tokens last 30 days.

### Optional: lock the Admin Panel to your IP

In `/srv/mistvale/.env`:

```bash
ADMIN_ALLOWLIST="YOUR_HOME_IP"
```

Then re-run `sudo /srv/mistvale/repo/scripts/DEPLOY.sh` to re-render nginx. Leave
it empty for no restriction — the rank check already gates access; this is a
second layer.

---

## 5. When something goes wrong

**Certbot fails ("challenge failed", "DNS problem").** The A record is not
pointing at this server yet. Confirm with `dig +short play.pathlands.cc A` from
your own machine, then re-run `sudo ./scripts/DEPLOY.sh` once it is correct.

**No TLS yet, want the game up anyway.** Run
`sudo ./scripts/DEPLOY.sh --skip-certbot`. The site serves over plain HTTP and
`PUBLIC_ORIGIN` stays `http://`, which correctly turns off Secure cookies. When
DNS is ready, re-run without the flag and it will fetch the certificate and flip
the origin to `https://`.

**The build is killed / runs out of memory.** Step 4 creates a 2 GB swapfile
precisely for this. If you skipped ahead or the swapfile failed, check
`swapon --show` and re-run the deploy.

**The service will not start.** `LOGS.sh -e` shows the reason; configuration
problems are reported clearly at boot (a missing or invalid variable in
`/srv/mistvale/.env` stops the process on purpose rather than serving errors).

**You locked yourself out of the Admin Panel.** From the server:
`sudo -u mistvale /srv/mistvale/repo/scripts/SET_RANK.sh YOUR_ACCOUNT admin`.

**A player forgot their password.** Until the Admin Panel exists, reset it by
having them register a new account, or restore from backup. Password reset lands
with the Admin Suite in Phase A0/A5.

**Start over completely.** The deploy is idempotent, so you rarely need to. If you
truly want a clean slate, rebuild the VPS from the provider's panel and run this
runbook again — it takes the same 20 minutes.

---

## 6. Security notes

What the deploy sets up for you: the firewall allows only SSH, HTTP and HTTPS;
PostgreSQL listens on localhost only; fail2ban watches SSH and the auth endpoints;
the service runs as an unprivileged user under a hardened systemd unit with a
memory ceiling; nginx rate-limits login and registration; and the `mistvale` user
may restart only its own service.

Worth doing yourself, in your provider's panel or over SSH:

- **Use SSH keys, not passwords**, and set `PasswordAuthentication no` in
  `/etc/ssh/sshd_config` once your key works.
- **Keep `/srv/mistvale/.env` private.** It holds the database password and the
  session pepper; rotating the pepper signs everyone out.
- **Check backups are really running** after the first night:
  `ls -la /var/backups/mistvale/`. A backup you have never restored is a guess —
  `RESTORE.sh --list` at least proves they are readable.
