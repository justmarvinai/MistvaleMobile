# Mistvale — setting up a fresh Ubuntu VPS, step by step

A runbook for taking a box you have just bought and turning it into the live game, with the
server secured first. `DEPLOYMENT_OPERATIONS.md` is the reference for *what the topology is*;
this is the order you actually type things in.

Everything here targets **Ubuntu 24.04 LTS**. Budget **45–60 minutes**, most of which is the
first build compiling on one core.

**The short version**, once the box is secured and DNS points at it:

```bash
git clone https://github.com/justmarvinai/MistvaleMobile.git ~/mistvale-bootstrap
sudo ~/mistvale-bootstrap/scripts/DEPLOY.sh
```

Everything below is the safe way to get to those two lines, and what to do afterwards.

---

## Before you start

| You need | Notes |
|---|---|
| **A VPS** | Ubuntu 24.04 LTS, **1 vCPU / 4 GB RAM / 50 GB SSD** minimum. 2 vCPU is noticeably nicer for builds; the game itself runs fine on one. |
| **The root password or SSH key** | Whatever your provider e-mailed you. |
| **The box's public IP** | From your provider's panel. |
| **A domain** | The project's default is `play.pathlands.cc`. Any domain works — you pass it to the deploy script. |
| **Access to the domain's DNS** | You need to add one `A` record. |

Both repositories are **public**, so the box needs no GitHub credentials, no deploy key and no
token. It clones them over plain HTTPS.

> **A note on the order of this guide.** Stage 1 is done by you, by hand, because it is about
> *your* access to the box. Stage 3 is one script that does the rest — including the firewall
> and fail2ban. Do not install nginx, PostgreSQL or Node yourself first; the script installs
> versions it has been tested against and will work around a half-configured box rather than
> benefit from one.

---

## Stage 1 — Secure the box (~15 minutes, by hand)

### 1.1 Log in as root, the first and last time

```bash
ssh root@YOUR_SERVER_IP
```

Accept the host-key fingerprint. If your provider gave you a password, you will be asked for it
(some providers force a password change on first login — do it now).

### 1.2 Update everything

```bash
apt update && apt upgrade -y
```

If it tells you a reboot is required:

```bash
reboot
```

…then wait thirty seconds and SSH back in.

### 1.3 Set the hostname and timezone

Cosmetic, but it makes logs and backups readable later.

```bash
hostnamectl set-hostname mistvale
timedatectl set-timezone UTC
```

Keep the **system** clock on UTC. The game's daily reset is configured separately
(`RESET_TIMEZONE=Europe/Berlin` in the env file) and does not depend on the box's timezone.

### 1.4 Create your own user

Working as root full-time is how a typo becomes an outage. Make yourself an account with sudo:

```bash
adduser marvin              # asks for a password — pick a strong one
usermod -aG sudo marvin
```

*(Use whatever name you like; `marvin` is used throughout this guide.)*

### 1.5 Give that user your SSH key

**On your own computer**, not the server. If you have never made an SSH key:

```bash
ssh-keygen -t ed25519 -C "marvin@laptop"
```

Press Enter for the default path. **Use a passphrase** — it is the only thing protecting the key
if your laptop is stolen.

Then copy it to the server:

```bash
ssh-copy-id marvin@YOUR_SERVER_IP
```

If `ssh-copy-id` is not available (Windows without WSL), print your public key with
`type $env:USERPROFILE\.ssh\id_ed25519.pub` and, in the root SSH session:

```bash
mkdir -p /home/marvin/.ssh
nano /home/marvin/.ssh/authorized_keys      # paste the key, one line, then Ctrl+O, Enter, Ctrl+X
chown -R marvin:marvin /home/marvin/.ssh
chmod 700 /home/marvin/.ssh
chmod 600 /home/marvin/.ssh/authorized_keys
```

### 1.6 Test the new login **before** locking anything down

**Open a second terminal** and leave the root session running in the first one. This is the step
that saves you from locking yourself out.

```bash
ssh marvin@YOUR_SERVER_IP
sudo whoami          # should print: root
```

Only continue when that works.

### 1.7 Turn off root login and password authentication

In the **new** session:

```bash
sudo nano /etc/ssh/sshd_config.d/01-hardening.conf
```

Paste:

```
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
```

A drop-in file rather than editing `sshd_config` itself — and the **`01-` prefix is
load-bearing**. OpenSSH uses *the first value it finds* for each keyword, not the last, which is
the opposite of most config systems. Ubuntu's cloud images ship
`/etc/ssh/sshd_config.d/50-cloud-init.conf`, which on most providers contains
`PasswordAuthentication yes`, and `Include` expands that directory in alphabetical order — so a
file named `99-hardening.conf` would be read *after* cloud-init's and lose. `01-` is read first
and wins.

Check the config parses, then **confirm what it actually resolved to**:

```bash
sudo sshd -t                                                      # silence means valid
sudo sshd -T | grep -Ei 'permitrootlogin|passwordauthentication|pubkeyauthentication'
```

`sshd -T` prints the *effective* configuration after every include and override, so this is the
answer rather than a guess. You want exactly:

```
permitrootlogin no
passwordauthentication no
pubkeyauthentication yes
```

If `passwordauthentication` still says `yes`, something later in the load order is setting it —
find it with `sudo grep -ri passwordauthentication /etc/ssh/` and comment it out there.

Only once the output is right, apply it:

```bash
sudo systemctl restart ssh
```

Now — still keeping this session open — open a **third** terminal and confirm you can still get
in:

```bash
ssh marvin@YOUR_SERVER_IP
```

Works? Close the root session. It is no longer usable.

> **About changing the SSH port.** Moving SSH off 22 stops log noise and nothing else — a
> key-only login is not brute-forceable at any port number. If you do it anyway, you **must**
> add the new port to the firewall before Stage 3: the deploy script enables `ufw` with
> **22, 80 and 443 open and everything else closed**, and will otherwise lock you out of your
> own server. Run `sudo ufw allow 2222/tcp` (or whichever port) first. Ubuntu 24.04 also uses
> socket activation for SSH, so a port change needs
> `sudo systemctl edit ssh.socket` rather than `sshd_config` alone. The simplest safe choice is
> to stay on 22.

### 1.8 Automatic security updates

So the box patches itself between your visits:

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades      # answer "Yes"
```

### 1.9 What you are *not* doing here

The deploy script installs and configures these in Stage 3 — do not set them up now, or you will
have two configurations disagreeing with each other:

- **ufw** — enabled with 22/80/443 open, everything else closed
- **fail2ban** — jails on `sshd` and on nginx's rate-limit log
- **2 GB swap** + `vm.swappiness=10` — build headroom on a 4 GB box
- **nginx, PostgreSQL 16, Node 22, pnpm, certbot**

---

## Stage 2 — Point your domain at the box

In your DNS provider's panel, add one record:

| Type | Name | Value | TTL |
|---|---|---|---|
| `A` | `play` (for `play.pathlands.cc`) | `YOUR_SERVER_IP` | 300 |

Then **wait for it to resolve** — the TLS certificate in Stage 3 fails without it. Check from
your own machine:

```bash
dig +short play.pathlands.cc
```

When that prints your server's IP, carry on. It is usually a minute or two; it can be an hour.

> Not ready yet, or no domain? Run the deploy with `--skip-certbot`, and add TLS later:
> `sudo certbot --nginx -d your.domain` followed by a second `DEPLOY.sh` run, which flips the
> site to HTTPS and restarts the server. The game is fully playable over plain HTTP in the
> meantime.

---

## Stage 3 — Deploy Mistvale (one command)

### 3.1 Fetch the repository

```bash
git clone https://github.com/justmarvinai/MistvaleMobile.git ~/mistvale-bootstrap
```

This copy is only the bootstrap. The script clones its own working copies into
`/srv/mistvale/` and never uses this one again — you can delete it afterwards.

### 3.2 Run the deploy

```bash
sudo ~/mistvale-bootstrap/scripts/DEPLOY.sh
```

It runs sixteen steps and prints each one. **It will ask you four things:**

| Prompt | What to answer |
|---|---|
| `Public domain` | `play.pathlands.cc` — or your own. Press Enter for the default. |
| `Admin account name` | The account **you** will sign into the Admin Panel with. 3–16 characters, letters/digits/`_`/`-`. |
| `Profile name` | Your in-game display name. Enter accepts the account name. |
| `Password` (twice) | Your admin password. There is **no e-mail in this game and no password reset** — a lost admin password is recovered by SSHing in and running `SET_RANK.sh`. Use a password manager. |

Everything else is automatic: the database password and the session pepper are generated with
`openssl` and written to `/srv/mistvale/.env`, which is `0640` and owned by the `mistvale` user.
You never type a secret that the script could have made itself.

The account it creates is a **normal player account promoted to `admin` rank** — the same account
you play the game with, and the only kind that can open the Admin Panel.

<details>
<summary>The sixteen steps, so you know what it is doing</summary>

1. System packages — `curl`, `jq`, build tools, `nginx`, `ufw`, `fail2ban`, `certbot`
2. PostgreSQL 16, with the tuned config for a 4 GB box
3. Node.js 22 and pnpm via corepack
4. The 2 GB swapfile and `vm.swappiness=10`
5. The `mistvale` service user and the directory tree
6. `/srv/mistvale/.env`, with a generated database password and session pepper
7. The PostgreSQL role and database
8. Clones both repositories
9. A sudoers drop-in so `mistvale` may restart only its own service
10. The systemd unit
11. The nginx site — TLS, path routing, rate limits, caching
12. Firewall (22/80/443 only) and fail2ban
13. The nightly backup cron entry, 03:30
14. **First build, migration and seed** — the slow one
15. The TLS certificate, via certbot
16. The first admin account

Each step prints `ok`, `(already done)` or a warning as it goes, and the script runs `STATUS.sh`
itself when it finishes.

</details>

The long step is **14/16**, the first build — TypeScript, two Vite bundles and the asset
pipeline on one core. Ten to twenty minutes. It is not stuck.

**If something fails, just run it again.** Every step checks the real state of the box first, so
a re-run skips what is done and resumes where it broke. It never deletes data.

### 3.3 What you end up with

```
/srv/mistvale/
  ├── .env              the one file holding every secret (0640, mistvale:mistvale)
  ├── repo/             the game repo
  ├── admin-repo/       the Admin Suite repo
  ├── releases/         timestamped builds, last 5 kept
  ├── client/  admin/   symlinks to the live build — swapped atomically on update
/var/lib/mistvale/uploads    art uploaded through Admin
/var/backups/mistvale        nightly pg_dump + uploads tarball
/var/log/mistvale            server log + one log per ops script
```

Services: `mistvale-server.service` (Node, on `127.0.0.1:3001`), `postgresql@16` (localhost
only), `nginx` (the only thing listening publicly). Nightly backup at **03:30**, the game's daily
reset at **04:00 Europe/Berlin**.

---

## Stage 4 — Check it actually works

### 4.1 Ask the box

```bash
sudo /srv/mistvale/repo/scripts/STATUS.sh
```

One screen: service states, the health endpoint, RSS and event-loop lag, the DB pool, active
battles, the content revision, disk and RAM, certificate expiry, last backup age and the error
count for the last hour. Everything should be green.

Without a token it reads the public `/api/health-lite` probe, which answers the service questions
and not the internal ones. For the full payload — memory, event-loop lag, the database pool — give
it an admin session token once:

```bash
curl -s -i -X POST https://play.pathlands.cc/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"accountName":"YOUR_ADMIN","password":"YOUR_PASSWORD"}' | grep -i set-cookie
```

Put the `mv_session` value into `OPS_SESSION_TOKEN=` in `/srv/mistvale/.env`. Tokens last 30 days,
so this is a thing you redo occasionally rather than a thing you automate.

### 4.2 Ask a browser

Open `https://play.pathlands.cc` and play the first five minutes:

1. **Register** an account → the tutorial's cold-open fight starts
2. **Pick a starter** champion
3. **Fight stage 1-1** and win it
4. **Pull once** at the Mistgate
5. Open `https://play.pathlands.cc/admin` and sign in with the admin account from step 3.2

If all five work, the deployment is sound.

### 4.3 Ask the config (any time, including before a deploy)

```bash
/srv/mistvale/repo/scripts/CHECK_DEPLOY.sh
```

This one is a **pre-flight check on the deploy machinery itself**, not on the live site: it
parses and lints every ops script, renders the nginx site from its template and hands it to
nginx's own parser, then starts a *throwaway* nginx on a loopback port and asks it twenty-one
routing questions — that the SPA is served, that `/api` and `/admin/api` proxy, that a missing
file does not answer `200` with the game's HTML.

It touches no service, no database and nothing outside a temporary directory, so it is safe to
run on your laptop, in CI, or on the box before an update. Run it whenever you have edited the
nginx template or an ops script; it is the part of a deploy rehearsal that can be automated.

---

## Day two and after — the runbook

Every script lives in `/srv/mistvale/repo/scripts/` and is safe to re-run. `UPDATE.sh`,
`BACKUP.sh`, `SEED.sh` and `SET_RANK.sh` re-exec themselves as the `mistvale` user when you
start them with plain `sudo`, so you cannot leave root-owned files behind for the next run to
trip over.

### Shipping a new version

```bash
sudo /srv/mistvale/repo/scripts/UPDATE.sh
```

Pulls both repos, installs, builds into a new `releases/<timestamp>`, **backs the database up
first**, migrates, swaps the symlinks and restarts. Downtime is two to five seconds and the
client shows a reconnect notice. If the health check fails afterwards it rolls the symlinks back
by itself.

```bash
sudo /srv/mistvale/repo/scripts/UPDATE.sh --rollback     # go back to the previous release
```

> **Content releases need one extra step.** A plain seed only *adds* what is missing — it never
> reaches inside content that is already published. So a release that rewrites something
> existing needs to say so:
>
> ```bash
> sudo /srv/mistvale/repo/scripts/SEED.sh --replace item
> ```
>
> The current `[Unreleased]` entry needs `--replace soundCue` (C51, the sound rework) and
> `--replace item` (C50, the item descriptions) — both are top-level fields on content that is
> already published.
>
> The release's CHANGELOG entry names which families to replace. Skipping it is quiet rather
> than loud: the new code ships and the old content keeps being served, with nothing anywhere
> reporting a problem.

### Everyday commands

`STATUS.sh` and `LOGS.sh` only read, so they are safe to run at any time.

```bash
sudo /srv/mistvale/repo/scripts/STATUS.sh                     # how is it
sudo /srv/mistvale/repo/scripts/LOGS.sh -e                    # errors only
sudo /srv/mistvale/repo/scripts/LOGS.sh -e -f                 # …and keep streaming
sudo /srv/mistvale/repo/scripts/LOGS.sh -p Marvin             # one player's requests
sudo /srv/mistvale/repo/scripts/LOGS.sh -r <requestId>        # one request, end to end
sudo /srv/mistvale/repo/scripts/BACKUP.sh                     # back up now
sudo /srv/mistvale/repo/scripts/RESTORE.sh --list             # what backups exist
sudo /srv/mistvale/repo/scripts/RESTORE.sh                    # …restore one of them
sudo /srv/mistvale/repo/scripts/SET_RANK.sh <account> admin   # promote someone
sudo /srv/mistvale/repo/scripts/SET_RANK.sh <account> player  # and demote
```

### Backups

Nightly at 03:30: `pg_dump -Fc` plus a tarball of the uploads, into `/var/backups/mistvale/`,
keeping 14 daily and 8 weekly.

**They are on the same disk as the thing they are backing up**, which protects you from a bad
migration and not from losing the VPS. For offsite copies, set `RCLONE_REMOTE` in
`/srv/mistvale/.env` to any rclone target (Backblaze B2, S3, a Hetzner Storage Box) and the
nightly job pushes to it. Worth doing before you have players.

**Check they are really running** the morning after the first night — `ls -la /var/backups/mistvale/`
— and that they are readable with `RESTORE.sh --list`. A backup nobody has ever listed is a guess.

**Test a restore once, on purpose, before you need one.** Losing a VPS is a new box plus
`DEPLOY.sh` plus `RESTORE.sh` — about thirty minutes, but only if you know the restore works.
`RESTORE.sh` takes a safety dump of the current database before it drops anything, moves the
existing uploads aside rather than deleting them, and requires you to type the word `RESTORE` —
there is no y/n to slip on.

### Making someone an admin

Only accounts with rank `admin` can reach `/admin`. Ranks are `player` / `gamemaster` / `admin`.

```bash
sudo /srv/mistvale/repo/scripts/SET_RANK.sh SomeAccount admin
```

This is also the recovery path if every admin loses their password: you have SSH, and SSH is
enough.

---

## If something goes wrong

**The site does not load at all**
```bash
sudo systemctl status nginx mistvale-server
sudo /srv/mistvale/repo/scripts/LOGS.sh -e
```

**`certbot` failed during the deploy** — nearly always DNS not resolving yet. Confirm with
`dig +short your.domain`, then:
```bash
sudo certbot --nginx -d your.domain
sudo ~/mistvale-bootstrap/scripts/DEPLOY.sh     # flips the site to https and restarts
```

**Login appears to do nothing** — the session cookie is `Secure` only when `PUBLIC_ORIGIN` is an
`https://` URL, and a browser silently drops a `Secure` cookie sent over plain HTTP. Check that
`PUBLIC_ORIGIN` in `/srv/mistvale/.env` matches how you are actually reaching the site, then
`sudo systemctl restart mistvale-server`.

**Every battle is an empty field** — the sprite tree did not ship. `UPDATE.sh` refuses a release
without it, but if you built by hand:
```bash
cd /srv/mistvale/repo && sudo -u mistvale pnpm assets && sudo /srv/mistvale/repo/scripts/UPDATE.sh
```

**The build ran out of memory** — the 2 GB swapfile should prevent it. Confirm with
`swapon --show`; if it is empty, re-run `DEPLOY.sh`, which creates it.

**You locked yourself out of SSH** — use your provider's web console or rescue mode, then
`ufw allow <your port>/tcp`. This is what Stage 1.6 and 1.7's "keep the other session open"
advice exists to prevent.

**The server will not start at all** — a missing or invalid variable in `/srv/mistvale/.env`
stops the process on purpose rather than letting it serve errors, and says which one:
```bash
sudo /srv/mistvale/repo/scripts/LOGS.sh -e
```

**The database is unreachable**
```bash
sudo systemctl status postgresql
sudo -u postgres psql -c 'SELECT 1'
```

---

## What is actually on the box

Handy when you come back to this in six months.

| | |
|---|---|
| **Listening publicly** | nginx on 80 and 443, plus SSH on 22. Nothing else — PostgreSQL and the game server are bound to `127.0.0.1`. |
| **Firewall** | `ufw`, default deny inbound, 22/80/443 allowed |
| **Intrusion blocking** | `fail2ban` on `sshd` and on nginx's rate-limit log — 5 failures in 10 minutes is a 1-hour ban |
| **TLS** | Let's Encrypt via certbot, renewed by a systemd timer |
| **App user** | `mistvale`, no login shell, owns everything under `/srv/mistvale` |
| **Secrets** | `/srv/mistvale/.env` only, `0640`, never in git. It holds the database password and the session pepper — rotating the pepper signs every player out. |
| **Memory guard** | `MemoryMax=1536M` on the service; it restarts rather than taking the box down |
| **Restart policy** | `Restart=always`, `RestartSec=3`, starts after PostgreSQL |

### Optional extra hardening

- **IP-allowlist the Admin Panel.** Set `ADMIN_ALLOWLIST` in `/srv/mistvale/.env` to your own
  IP or CIDR and re-run `DEPLOY.sh`; nginx then refuses `/admin` from anywhere else. Worth it if
  your home IP is stable.
- **Uptime monitoring.** Point a free UptimeRobot check at `https://your.domain/api/health-lite`
  — it answers without authentication and is exactly what `STATUS.sh` reads.
- **Offsite backups.** `RCLONE_REMOTE`, as above. The single most valuable thing on this list.
