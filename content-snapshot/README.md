# content-snapshot

The live content of Mistvale, exported as JSON. Regenerate with `pnpm content:export`, then commit.

## What this is for

Content is data: champions, skills, stages, quests, sound cues and the tuning constants all live in PostgreSQL and are edited through the Admin Suite. That is the right design and it has one consequence worth answering — the whole game's balance, copy and structure lives somewhere `git log` cannot see. An operator retunes a drop table on a Sunday evening and there is no record anybody can read, no diff to review, and nothing to restore from but a database dump that also carries every player account.

So this directory is two things, and the smaller one is the backup:

- **A review.** `git diff content-snapshot/` after an operator's evening says exactly what changed, in the words the content uses, sitting next to the code that reads it.
- **A way back that is content-only.** `RESTORE.sh` returns the whole database. This returns the content at a revision somebody chose, and leaves accounts alone.

## What is in it

One file per content type, plus `manifest.json` carrying the revision and the counts. Entities are sorted by key and every object's fields are sorted too, so two exports of identical content are byte-identical — without that the snapshot would churn on every run and the diff would be worthless within a week. There is a test for exactly that.

Only **live** content is exported. An operator halfway through an edit does not get their draft committed on their behalf.

## What it is not

Not the seed. `apps/server/src/db/seed/` is the committed starting point a fresh install gets and the reference an operator edits away from; this is a photograph of what a running install actually holds. They agree on a new install and drift apart the moment somebody publishes — which is the whole point of having both.
