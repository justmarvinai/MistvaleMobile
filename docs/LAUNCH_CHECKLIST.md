# Launch checklist — EA-0.1

> The list to work down on the day. Everything on it is either a command to run or a thing to look at; nothing here is "consider" or "review". Where a step can be wrong in a way that is hard to see afterwards, it says what "right" looks like.
>
> Written for the first launch. `docs/DEPLOYMENT_OPERATIONS.md §5` covers ordinary releases afterwards.

## Before the day

- [ ] **CI is green on `main`.** Format, lint, typecheck, 1100+ tests, balance gates, deploy assets, build, and the fifty-case browser suite. Nothing sits in front of `main`, so a red `main` is a broken launch.
- [ ] **A DNS `A` record for `play.pathlands.cc` points at the VPS**, and has propagated. Certbot fails on a domain that does not resolve to the box it is running on, and it fails *after* installing an nginx site, which is a confusing state to debug at midnight.
- [ ] **The VPS is reachable over SSH as a sudoer**, and has at least 15 GB free. `DEPLOY.sh` installs PostgreSQL, Node and both builds.
- [ ] **Decide the first admin account name.** `DEPLOY.sh` prompts for it and creates it. There is no e-mail in Mistvale, so this account is the only way into the Admin Panel — and `SET_RANK.sh` on the box is the only way to make another one.
- [ ] **Decide whether `/admin` is IP-allowlisted** (USER_QUESTIONS O1). Default is off. If you want it on, have the addresses ready: it is one snippet file, and adding it later locks you out of your own panel if you get it wrong remotely.
- [ ] **Decide the offsite backup target** (USER_QUESTIONS O2). Default is local dumps only, which survive everything except losing the box — the one failure backups exist for.

## Deploy

- [ ] `scripts/CHECK_DEPLOY.sh` on the repo, locally. Parses and lints every operations script and hands the rendered nginx site to nginx's own parser. CI runs it too; running it once by hand is how you learn what it prints.
- [ ] `sudo scripts/DEPLOY.sh` on the VPS. It is idempotent — if it stops, fix and re-run rather than picking up by hand.
- [ ] **`STATUS.sh` is green**: both services active, health endpoint answering, cert valid, disk and RAM inside budget.
- [ ] **`https://play.pathlands.cc` loads the login screen**, over TLS, with no mixed-content warnings.
- [ ] **`https://play.pathlands.cc/admin` refuses an ordinary account** and accepts the admin one. A `player`-rank account reaching the panel is the one security failure that matters most here.

## Prove the game, on the real box

Not a substitute for the browser suite — a check that this *deployment* is wired up, which the suite cannot know.

- [ ] **Register a throwaway account.** The cold open should start on its own.
- [ ] **Fight it, on ×1, and watch it.** The results modal must appear when the fight ends rather than three seconds in. It should be audible.
- [ ] **Take a starter, clear 1-1, equip whatever drops.** Silver moves, the relic appears in the vault, the champion's stats change.
- [ ] **Pull once at the Mistgate.** The reveal plays and the Chronicle records it.
- [ ] **Sign out and back in.** The session survives; progress is where you left it.
- [ ] **Install it.** On a phone, from the browser menu — the manifest and the worker are shipped, and this is the one thing no automated check here can confirm end to end.
- [ ] **Publish a trivial content change from Admin** (a news post is ideal) and see it in the game without a deploy. That is the whole content-as-data promise, and it either works on this box or it does not.

## Prove the safety net, before anybody needs it

The most commonly skipped part of a launch, and the only one whose absence is discovered at the worst possible time.

- [ ] **`BACKUP.sh`**, and confirm a dump lands in `/var/backups/mistvale/<date>/` with a plausible size.
- [ ] **`RESTORE.sh` from that backup**, on the live box, before there are real players on it. Restoring a backup nobody has ever restored is not a recovery plan. Right now the only account it can lose is your throwaway one.
- [ ] **`STATUS.sh` again** afterwards — the restore must leave the box in the same state it found it.
- [ ] **`pnpm content:export` and commit `content-snapshot/`.** The content in version control, at the revision that launched.

## Open the doors

- [ ] **Tag the release**: `git tag -a ea-0.1.0 -m "EA-0.1"` and push the tag. Do it *after* the deploy is proven, not before — a tag is a claim that this commit is what is running.
- [ ] **CHANGELOG `[Unreleased]` becomes `[0.1.0] — <date>`.**
- [ ] **Send the link to the first players.** They will need account names and passwords; there is no e-mail, so a forgotten password is a message to you and a `Reset password` in Admin.
- [ ] **Watch `LOGS.sh -e` for the first hour.** Errors are rare enough that any of them is worth reading.

## Day one, and after

- [ ] **`STATUS.sh` each morning for the first week.** Error count, RAM, disk, backup age.
- [ ] **Confirm the daily reset ran** — quests rotated, the Bazaar restocked, the bot ladder refreshed. It is in-process rather than cron, so a server that was down at 04:00 does its catch-up on the next start; check rather than assume.
- [ ] **Confirm the nightly backup ran** on day two. A cron that never fires looks exactly like a cron that fires successfully until you look.
- [ ] **Answer USER_QUESTIONS Q4** (what the game sounds like) once you have heard it on a real machine.
