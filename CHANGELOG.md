# Changelog — Mistvale

All notable changes to the game are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · Versioning: pre-release `0.x` until **EA-0.1**.

## [Unreleased]

### Added — quests (P8b)

The checklist is playable: eight dailies, six weeklies, five monthlies, a chest for finishing the day, and a bonus for the day's first win in each mode.

- **One read draws the screen.** Every period, every meter and every boundary the screen counts down to arrive together, because they all hang off the same daily reset and three requests would be three chances to straddle it. Both claims answer with the whole screen again rather than only what they paid — a claim moves the chest meter, the dock pip and sometimes the account level, so a follow-up read would render a screen one claim out of date.
- **Claiming is idempotent in the way that matters.** A retried claim — the dropped response on a phone — replays what it paid and pays nothing again. A genuine second click is refused. The two are told apart by the action id the client generates, not guessed at from timing.
- **The chest counts quests *claimed*, not finished.** The chest is the reward for finishing the list, and a list you have not collected is a list you have not finished. It re-opens at the reset with nothing to reset it: the row records which period instance it was taken for, so a new day is a different instance rather than a flag somebody has to clear. Only the daily has a chest — a period the config leaves out has none at all, rather than an empty meter nobody can fill.
- **The day's first win in each mode pays automatically.** No claim, no button: it lands with the victory, because it is a reason to open the game rather than one more thing to remember to collect. Campaign, the relic keeps, the springs, the Proving Grounds and the Arena each pay their own; practice is deliberately left out, since a bonus on a free sandbox would make it the cheapest silver in the game.
- **Progress is tracked from level 1, claimable from level 4.** The screen opens with the rest of the meta layer, but a player's first day is not thrown away by a gate they could not see — the day they arrive, the quests they already finished are waiting.

### Fixed — a reward that named an item paid nothing

Content pays in a flat map — `{silver: 5000, sigil_gleaming: 1}` — and the payout folded that map into a currency bundle, **silently discarding every key it did not recognise**. A stage first-clear reward or a star chest that promised a sigil would validate, publish, and hand over air. Nothing shipped had hit it, because nothing had yet paid an item that way; the quests in this release pay eight of them.

Both ends are closed now. There is one payout path for reward maps, which splits currencies from items and pays both, and publish validation resolves every non-currency key against the item catalogue — so `sigil_gleeming` is a red line in the publish diff instead of a hole in somebody's reward. The same check now covers goals that name content: a weekly asking for fifteen floors of a keep that was renamed is a quest nobody can finish, which is worse than one nobody was offered.

### Fixed — a release's content and config never reached a live server

Found by the browser suite rather than by a test, which is the only reason it was found at all. `SEED.sh` on an install that already had content did *nothing*, on the sound principle that after the first deploy the database is the source of truth. The unsound consequence: a release that added content could never deliver it. Quests would have arrived as an empty screen on a live server, and — far more often — the handful of `game_config` keys every new feature brings never landed, so the feature ran on whatever the code falls back to. The only escape was `--force-content`, which throws away an operator's tuning to deliver rows they never had.

A plain seed now **adds what is absent and changes nothing that is present**. The insert is `on conflict do nothing`, so "cannot overwrite an edit" is a property of the statement rather than of the logic around it, and every addition is printed and recorded as its own revision. The development database turned out to be **21 config rows behind** — including the Arena's, which had been quietly running on code defaults since P7.

### Added — the goal engine (P8a)

The foundation the whole retention layer sits on. Nothing player-visible yet — quests get their screen and their claim button in P8b — but the machinery underneath is finished rather than sketched.

- **One fan-out, and nothing knows what a quest is.** `ProgressService.track` is the single place the game reports what a player did: the battle module says a battle was won, the Arena says an attack was fought, and whatever is listening advances. The alternative — every module importing the quest service, then the mission service, then the event service — is how a codebase stops being able to add a fourth thing. Missions, events and the tutorial subscribe here in the phases after this one, and they are deliberately absent rather than stubbed.
- **A goal is data**: `{type, target, filters}` over a registry of twenty report types. A new daily is an edit in the Admin Suite, not a deploy — which is the hard rule this exists to serve. **Quests are now the eighteenth content type**, so they arrive with the draft → validate → diff → publish flow already around them.
- **The two classic quest bugs are ruled out once rather than per-goal.** How a goal accumulates is a property of its type — `count` sums reports, `highest` keeps a high-water mark — so "reach +12 on a relic" can never be satisfied by upgrading twelve relics to +1. And publish validation refuses a filter the goal's type does not declare, which stops `{type:'summon', mode:'campaign'}`: a goal that looks perfectly reasonable in the editor and silently never completes.
- **No reset job.** A quest instance is stamped with the period it belongs to — the game-day for a daily, the Monday for a weekly, the first for a monthly — so yesterday's row simply stops matching and nothing goes round at 04:00 deleting things. A player who finishes their dailies at 03:50 still has last night's row to claim at 04:10, which a job would have thrown away.
- **Reports cannot be lost, in either direction.** `track` is typed to accept a transaction rather than a database, so "inside the transaction that did the thing" is a rule the compiler keeps: a rolled-back fight leaves no quest credit, and a paid fight always leaves its credit. It also locks the player row before reading progress — without that, a battle settling at the same instant as a purchase would have both read `3`, both write `4`, and one of the two things the player did would simply not have happened. Eight concurrent reports of three energy record 24; before the lock they recorded 6.
- **The 19 quests of ECONOMY §11** are seeded: eight dailies across eight *different* systems, so the checklist reads as "play the game today" rather than "grind one thing", six weeklies, five monthlies — and the completion chest worth more than any single line, which is what makes the eighth quest worth doing when the first seven have already paid.

### Added — the Arena (P7, server side)

Asynchronous 4v4 against a snapshot of somebody else's defence team. The defender is never online, never consulted, and never has to be — which is the only way a ladder works when there may be four people playing.

- **The ladder.** Elo-lite: the swing is `K × (actual − expected)` off the rating gap, so beating somebody far above you is worth most of K and beating somebody far below is worth almost nothing. That is the whole thing stopping a Platinum account farming Bronze for medals all week. Both sides move from one fight — a defence team that loses while its owner sleeps has still lost — so a rating means the same at the top of the board as at the bottom. Bronze has a loss floor: a new account on a losing streak would otherwise slide to zero and meet nobody it could beat.
- **Ten rungs, Bronze I to Platinum**, paying 1–4 Valor Medals a win by band, at the tier the win *landed* in.
- **Ten attack tokens, one an hour**, derived from the clock the way energy is — an account that has been away for a month is current the instant it comes back, and there is no job that can fall behind.
- **An offer list** drawn from a widening rating band, shuffled rather than sorted (a list that always leads with the weakest opponent turns the choice into a formality), each entry showing the team, its power and what the fight is worth either way. Five free refreshes a day, then crystals.
- **An attack** spends a token and opens an ordinary battle, played through the same endpoint as everything else — the Arena adds a cost and a payout, not a second way to fight. It settles inside the same transaction as its result, so a fight can never be recorded without its rating change. Unlike every other mode it settles on a **loss** too, and a retreat counts as a loss rather than an escape: otherwise losing rating would be opt-in.
- **The weekly chest** is sealed at the Monday reset against the *best* rating held that week — falling out of Gold on Sunday evening must not cost a week of Gold, or the last day of every week becomes a day nobody dares to play. An unclaimed chest is not thrown away: the better of it and the new one survives, so three weeks away costs the collection but never the best week in it. Ratings decay towards their tier floor at the same moment, enough that an abandoned Platinum account drifts out of the way and never enough to demote anybody.
- **The Hall of Valor** — 24 tracks (4 elements × 6 stats), ten levels each, bought with medals. 2,500 medals finishes one track and 60,000 finishes the Hall: a year-scale sink by design, and the ladder's only one. What it grants is account-wide and unconditional, so it is folded into a champion's numbers *before* the fight, alongside relics and unconditional masteries — a player who reads their champion screen sees it, rather than discovering it in a battle log.

### Added — the bot ladder

At Early Access there may be four real players, and an Arena whose offer list is empty is not a feature that needs more players — it is a feature nobody comes back to. So the ladder is seeded with sixty opponents, weighted to the bottom where a small ladder's traffic actually is: Bronze 24 · Silver 20 · Gold 12 · Platinum 4.

- They hold real champions in real relics and defend with teams the engine fights exactly as it fights a person's. Names are natural and carry no marker, drawn from two multiplied pools (960 combinations) — a ladder that labels half its rungs "not a real person" is a ladder nobody climbs.
- **A bot is an ordinary player row** with a flag, not a second table: matchmaking, the leaderboard, the engine and the settle path need no special case. Its account password is CSPRNG bytes hashed and discarded, so nobody can log into one.
- **A bot is economically inert** — no balances, nothing through `RewardService`, no row in `economy_log`. A bot in the economy reports would make every faucet and sink number a lie, so it is pinned by a test rather than left to care.
- **A bot is synthesised, never authored.** Champions, relics, level and rating all come from live content and a per-band recipe in `game_config`, so sixty opponents cost zero rows of hand-maintained content and a balance change reaches them without a deploy. Rebuilt nightly with a ±5% rating drift, because a ladder whose teams never change is a solved puzzle by the second week.
- **A band is a ramp, not a step.** A bot's champions and relics are built along its rating inside the band — the weakest opponent in Bronze fields level-15 champions in half-upgraded relics, the strongest level-25 in full ones. Without that every bot in a band hits equally hard, and the `+13 / +23` the hub shows would be decoration rather than a guide to which fight is easier.
- **Bots yield the top ten** at the weekly reset. The visible top of the board belongs to people.

### Added — the Arena, in the game

- **The hub** draws from one read, because every panel on it is a view of the same standing and two requests would eventually disagree. Left: five opponents, each with the team it fields and what beating it is worth either way — the choice a player actually makes. Right: the defence that earns while they are away, the chest, and the Hall the medals go into.
- **The defence editor and the attack picker are one component**, because they are the same act with different stakes, and two pickers would drift apart the first time one gained a feature. Slot one is the leader, whose aura applies — which is why the order is the player's to choose.
- **The Hall of Valor** is laid out as elements against stats rather than a list of twenty-four rows, because that is the shape of the decision: a player picks the element their best champions share and pushes one column.
- **The results panel knows the Arena pays differently** — rating and medals, on a loss as well as a win — so it shows the swing and the promotion rather than a silver line reading zero. A retreat says plainly that walking out is a loss, not an escape.
- **The ladder** shows the top twenty-five plus the reader's own neighbourhood, because "you are 41st" means nothing without the four people you could overtake.

### Fixed — the deploy no longer depends on where it was started

Two bugs of the same shape, both found on a real update rather than in tests: an ops script inherited something from the caller's shell and broke on it.

- **`pnpm install` downloaded the wrong pnpm and refused to run.** Every invocation was `pnpm --dir /srv/mistvale/repo install`, but `--dir` is pnpm's own flag and corepack never sees it — corepack reads the `packageManager` pin from the package.json it finds walking up from the *current working directory*. Started from `/srv/mistvale` (or `/root`), there is no package.json above it, so corepack had nothing to pin to, fell back to the latest pnpm, downloaded it, and pnpm 11 then refused to act for a project pinned to 10.33.0. Every pnpm call now runs *in* its project, which is what makes the pin authoritative whatever corepack's ambient default happens to be.
- **The corepack download prompt appeared during an unattended deploy**, because `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` was only set on the branch that drops from root. `sudo -u mistvale UPDATE.sh` is already the app user and took the other branch. Both branches set it now.

### Fixed — ops scripts run from anywhere

`sudo -u mistvale /srv/mistvale/repo/scripts/UPDATE.sh`, typed from a root shell, failed *after* the database backup had already succeeded: the summary line counts backup days with `find`, and `find` chdirs away and then back to the directory it started in. That directory was `/root`, which the app user cannot read, so it exited 1 — and `set -e` took the whole update down over a line that only formats a message.

Every ops script now moves to a readable directory when the one it inherited is not, at source time. `reexec_as_app_user` could not have covered this: with `sudo -u` the script is *already* the app user, so the re-exec never runs. A normal invocation is untouched — every path in these scripts is absolute, and the guard only fires when the working directory is genuinely unusable.

### Added — the support desk (Admin A5, pulled forward)

Mistvale has no e-mail addresses. That was always a deliberate simplification, and it has one binding consequence that had gone unbuilt: **an operator is the only password reset there is** — and there was no operator endpoint. A warden who forgot their password could not be helped except by hand-writing an argon2id hash into the database, which breaks the no-direct-DB rule the whole Admin Suite exists to uphold. Pulled forward out of A5 because it is a hard-rule violation rather than a missing convenience.

- **Reset a password.** Generated, not chosen: the operator reads a temporary password out once — the server keeps only its hash — every session is signed out, and the account must replace it before doing anything else. Choosing the password would make "the operator knows your password" a lasting state instead of a thirty-second one.
- **`force_password_change` is now enforced**, not merely recorded. It has been stored and surfaced since P0 while nothing checked it, so a reset was a suggestion. Until the flag clears, the account can change its password, read who it is, or sign out — and nothing else, the Admin API included, so an admin who has been reset cannot administer their way around it.
- **Find an account** by either name. A support request says "I'm Rattledagger" or "my login is rattle_d" and almost never says which, so both are searched. Bots are hidden by default and one switch away.
- **See an account**: wallet, live energy, holdings as counts, progress and deepest floors, every live session, and the tail of the economy ledger — enough to answer "did my relic vanish" without reading 143 relics.
- **Rank, ban, rename, grant, sign-out-everywhere.** A ban needs a reason and signs the account out immediately; a grant goes through `RewardService`, so an operator hand-out lands in `economy_log` beside the battle payouts rather than being invisible in exactly the audit it most needs to appear in. Every action is audited with before/after — and never with the password in it.
- **Two guards refuse the caller's own account**: an admin cannot change their own rank or ban themselves. The first is how a suite locks itself out of its last admin; the second is how it locks everyone out. Recovery from either is a shell on the VPS — the situation the suite exists to avoid.
- The two irreversible actions confirm by **typing the account name**, which is the one thing an operator with the wrong account open would get wrong.
- **Tests** — 16 server cases against a real database (the whole reset round trip, both self-guards, ban-with-reason, rename collisions, grants landing in the ledger, rank-gating) and 8 in the suite over the screen's refusal to act.

### Changed — Phase P6 close-out

The sweep at the end of a phase, where every document is checked against what actually shipped.

- **Two new balance gates for the XP farm**, and they are the composition-honest kind: Brutal 12-6 has to fall to *one* maxed carry and three level-1 food units — not to four good champions, which is a team nobody fields to farm. It does, every time. `pnpm sim` also gained a distribution measure (`winsWithin`), because "usually fast" is no comfort if one run in twenty grinds toward the turn cap.
- The documented "≤14 sim-turns" farm target was written against an unstated four-strong team. A four-strong maxed team does clear 12-6 in ~16 turns; a solo carry through four waves of elites takes ~120 by construction, and nobody watches it — that is what multi-battle is for. The gate now bounds distance from the 300-turn cap instead of speed, and COMBAT_SYSTEM §14 says why.
- **Three §14 gates that read as enforced were not.** The per-champion role benchmark and the Arena diversity check are now marked *not yet enforced*, with the phase each belongs to (P10 and P7). A gate document that overstates itself is worse than one that admits a gap.
- Corrected the Depths floor count in two docs: **120**, not 130 (4×15 + 10 + 5×10).
- `AGENTS.md` said "planning docs only — implementation begins with P0" and told agents never to push to `main`. Both were wrong: P0–P6 are complete, and pushing to `main` is the owner's standing instruction. A contradiction between the two agent-facing files is the one kind of stale doc that actively causes damage.
- The known-gaps table in `USER_QUESTIONS.md` had phase labels three phases out of date (a shallow publish diff and the missing balance-sim endpoint were both still marked P2). Re-dated against reality, with two gaps added: the Depths and Masteries still have no purpose-built Admin editors (A4, and the generic browser covers every field meanwhile), and the two unenforced gates above.

### Added — Phase P6: the whole campaign

Nine more chapters, two more difficulties, and twelve warlords who each fight differently.

- **252 stages.** Twelve chapters of seven, on Normal, Hard and Brutal, generated from twelve plan entries — so a thirteenth chapter is one entry and a publish rather than an afternoon.
- **Twelve warlords, twelve fights.** Every chapter boss now has a signature of its own instead of borrowing the Coilmother's: Hessk drags a team to a halt in the marsh, Vyss strips what you put up and scatters the line, Korrash burns through healing, Tszar's quake scales off its own health so stacking defence stops helping. Four of them carry a Depths mechanic in a gentler form — Hissrad a six-hit ward where the Ashpriest asks twelve, Mama Fenwrack a retaliation every eighth of her bar where the Sentinel answers every tenth, Ryssa a twelve-hit ward behind a Reflect, and the Coilmother her own brood — so nothing in the Depths is learned for the first time at full price.
- **The chapters are different places.** Each has a theme archetype that shows up in most of its waves, and waves widen as the campaign goes on — two abreast in the Veilwood, four by the Coilstone Terraces. That, rather than a bigger number, is why a late stage is harder than an early one at the same level.
- **Hard and Brutal are second and third passes.** A difficulty opens on clearing 12-7 of the one below, source-faithful, so Hard is the whole vale again rather than an alternative to the chapter you are on — and the level bands can assume a levelled account instead of hedging.
- **Star chests count everything.** 7 / 21 / 42 / 63 stars per chapter across all three difficulties: 21 is Normal cleared cleanly, 42 adds Hard, 63 is everything. Chapter 12's last chest pays Valor Medals on top.
- **The campaign map folds.** Twelve chapters laid flat is 84 buttons and no orientation, so chapters collapse and the one you are actually in opens on arrival — with its star count, its region, and the next chest it owes.
- **Four new balance gates**, two of them walls: 12-7 Normal has to turn back a chapter-1 team, and Brutal 12-7 a team fresh off Normal. A ladder nobody can fall off is a ramp, and without those two a rebalance could flatten twelve chapters into one with every other gate still green.

### Changed
- The third star's turn limit now grows with the chapter — 16 → 44 on a warlord, 12 → 20 elsewhere. A chapter-12 warlord has four times chapter 1's health and takes about four times as long to fell; against a fixed limit the third star quietly stopped existing, which also put the 63-star chest out of reach of exactly the players who had earned it.
- Chapters 2 and 3 now farm Wolfsfang and Stoneguard rather than Stormcoil and Gravebind, and their level bands drop to the planned ramp. The two 4-piece sets move to chapters 10 and 11 where they belong — a Provoke-on-hit set was never an early-chapter farm, and the twelve-chapter set ladder now runs basic-stat sets first and the exotic ones last.
- Warlord health tops out below the shallowest keep-boss. The campaign is the on-ramp to the Depths; a chapter-12 boss with more health than the Broodwyrm had the two the wrong way round, and made a late campaign clear a twenty-minute slog on a stage meant to be farmed.

### Added — Phase P6: multi-battle and the practice sandbox

Two ways to fight a stage you were not going to watch anyway: ten times at once, or once for free.

- **Multi-battle**, from account level 6. Pick a team, pick a number, and the whole batch resolves server-side. Each run is an ordinary battle — same engine, its own fresh seed, the same energy and the same payout as fighting it by hand — so nothing about it is a shortcut except that nobody watched. What comes back is a run-by-run summary instead of ten event logs, which is the point: at thirty runs the logs would be megabytes.
- **The server decides how many.** The number you ask for is trimmed to the smallest of the per-press cap, today's allowance and what your energy actually covers, and the summary names which one bit — "that was all the energy would cover" rather than a silently shorter list. **A lost run ends the batch** and keeps everything the earlier runs earned; throwing a losing team at a stage nine more times is a way to spend energy on nothing.
- **Thirty runs a day**, resetting at the operator's daily reset hour rather than at midnight — the same game-day the Essence Springs rotation keeps. All three numbers are `game_config`, so the cap, the press size and the unlock level are Admin decisions.
- **The practice sandbox.** Re-fight any stage you have already cleared for no energy and no reward at all — no silver, no experience, no drops, and no clear recorded. The stars still show, because "would this team have held?" is the only question a sandbox exists to answer. A stage nobody has beaten cannot be practised: free reconnaissance on every boss in the game is not a sandbox.
- **Team select now holds all three ways in.** Into the mist, farm ×N with a stepper that will not offer a number the server would refuse, and practise — the last two appearing only when they apply, on the server's answer rather than a guess.
- **Tests** — 12 server cases over the batch, the trims, the allowance, the retry and the sandbox's two promises (costs nothing, pays nothing, recorded nowhere), 10 over the game-day and daily-counter rules, and a browser run of clearing a stage and then practising it.

### Changed
- `players` gained `daily_counters` + `daily_counters_day` — every per-day allowance in one map stamped with the game-day it belongs to, rather than a column per allowance. There is deliberately **no reset job**: a stale stamp reads as zero, so an account away for a month is current the moment it comes back, and the eight quest counters P8 needs are a key each rather than a migration each.
- `players` gained `last_multi_battle`, holding the last batch whole. A multi-battle writes no `battle_sessions` rows — thirty states and thirty logs per farm is megabytes, and a batch has nothing to resume — so the summary is the record, and a retried request replays it instead of farming the stage twice.
- `lib/game-day` moved out of the Depths module: the springs rotation and the multi-battle allowance now read one answer to "when is today" rather than two that could drift.

### Added — Phase P6: masteries

Forty-eight of them, three trees, and the emblems the Proving Grounds has been paying out with nothing to spend them on.

- **Three trees, fifteen picks, two of the three.** Onslaught is what a champion does to the enemy, Bulwark is what it survives, Insight is what it knows. A champion may open two of them; a tier opens once enough has been learned below it, and exactly one capstone is ever taken. The rules live in `packages/shared` and are evaluated by both sides, so a node the tree screen greys out is a node the server refuses, with the same sentence.
- **Every node is engine-backed.** Nodes compose from a vocabulary of twenty-one typed effects — the same contract skills use — so adding a mastery is an Admin edit and only a genuinely new *kind* of effect is a deploy. Publish validation refuses a node that promises anything else, and refuses a tree with a hole in its ladder.
- **What can be settled early, is.** An unconditional `+75 ATK` becomes part of the champion's stats before the fight, exactly as a relic does, and shows in its own column on the champion screen next to Relics. Only the conditional effects and the procs ride into the battle — which is what keeps the number a player reads and the number the engine fights with the same number.
- **The capstones do what they say.** Deathmark adds a share of the target's own health bar and far less of it against a boss; Last Bastion survives one lethal blow a battle and cannot be dispelled off, because nobody cast it; Veilbinder stretches a champion's own debuffs but never a stun.
- **Emblems and crystals.** Tier prices are `game_config`, so the tree screen shows the price the server charges rather than a second copy of it. A node refuses in order — trainer level, node exists, build rules, then affordability — so nothing is ever charged for a refusal. The first reset on each champion is free; later ones cost crystals.
- **Tests** — 15 engine cases over the conditions and procs (including a determinism replay of a mastery-heavy fight), 17 server cases over the rules, the resolution split and the spending.

### Changed
- The mastery tier gate counts picks across the **whole build** rather than per tree. Per-tree counting reads as more source-faithful and is unshippable at fifteen picks: split your two Tier-1 picks between two trees and neither would ever reach Tier 2, stranding the champion at 2/15 permanently. `COMBAT_SYSTEM §9` now says so, and a test pins the case.
- `COMBAT_SYSTEM §9` said 45 nodes across 15-node trees; the content plan has said 48 across 16 for some time. The content is 48.

### Added — Phase P6: the Depths

Below the vale are keeps the Sskarn moved into rather than built. Ten of them open at once: four for relics, one pit for mastery emblems, and five springs that keep their own hours.

- **Four relic keeps**, fifteen floors each, and every one of them a farm for something specific — Wyrm's Hollow for speed and crit damage, the Frostgrave Vault for guard and resistance, the Cinderspire for accuracy and crit rate, the Silkmire Depths for lifesteal and regeneration, plus rings, amulets and banners below its tenth floor. A run always pays a relic; how good a relic is how deep you went.
- **The Proving Grounds**, ten floors of bronze, silver and gold emblems, waiting for the masteries that spend them.
- **Five Essence Springs** on a rotation that gives the week a shape: the Pure Spring every day, each breath two days, and Mist on Sunday alone. The rotation is read against the operator's own reset hour and timezone, so a run at half past three in the morning is still yesterday's spring. A new account sees **every** spring open for its first seven days, because a first week should not be spent waiting for a Tuesday.
- **Bosses that are puzzles, not walls.** Four behaviours the content schema has promised since P1 and the engine had never run:
  - the **Ashpriest**'s hit-counter ward, which counts blows rather than damage and keeps its count between turns. Reach its turn with the ward standing and the whole team loses turn meter; break it first and the Ashpriest forfeits a turn and stays hurtable through it. Poison chips through without ever touching the counter — the slow way in, next to the fast one.
  - the **Rimebound Sentinel**, which answers every tenth of its health bar with a free strike at whoever took it, and owes one answer per band when a single blow crosses several.
  - **Broodmother Ssarethi**, who calls two of the brood at the start of every turn until six of them are standing.
  - and an **enrage** ramp on every boss in the game, chapter warlords included, so no fight can be stalled to the turn cap. Pitmaster Drazhak's starts on turn twelve.
- **The Depths hub** groups the keeps by what they are for, marks how deep you have been in each, and says plainly when a shut spring next opens. The floor picker is the ladder, with your best floor marked on it.
- **A dungeon is content.** Floors, energy curve, sets, rotation days and account level are all editable in Admin; adding an eleventh keep is ten fields and a publish.
- **New balance gates**, per dungeon and enforced in CI: floor 1 falls to a team at the unlock level, the deepest floor falls to a team that has actually farmed for it — and the deepest floor turns an entry-level team back. Without that third gate a rebalance could flatten fifteen floors into one and nothing would notice.

### Fixed
- The battle route accepted only `campaign`, `tutorial` and `practice`, so no Depths mode could ever have been started through it.
- Chapter bosses have carried an `enrage` block since P1 that the engine ignored entirely; the ramp is real now.
- **Content published before a field existed now reads back complete.** Content is normalised when it is written, which leaves every row complete as of the schema it was written under — and short a field the moment a later release adds one. That is a real deploy, not a hypothetical: new code goes live and runs against the last published revision until somebody publishes again. The snapshot now parses each entity through its schema on the way into memory, so the promise the contracts already make — that anything read out of the bundle is a complete definition — holds by construction. A row that cannot be parsed at all is passed through rather than taking the whole snapshot down with it.
- A manual target could only name battlefield slots 0–3, which a summoning boss can outgrow.

### Added — Phase P6: progress, unlocks and star chests

The campaign becomes a journey with a shape: stages open in order, clears are remembered, and pushing forward pays.

- **Stage progress** — one table across every mode, recording stars, clears and the best turn count. Stars are the *best* ever, never the latest, so a sloppy re-farm can never cost a star already earned. Dungeon floors will chain through the same rules, so the Depths needs no second implementation of any of it.
- **Unlocks are enforced.** The chain has been authored in content since P1 but was never checked — a fresh account could walk into a chapter-3 boss. The campaign map now greys out exactly the stages the server will refuse, and says why: "Clear 1-6 first."
- **First clears** pay their bonus once, and **chapter star chests** pay when the total crosses a tier — both recorded rather than recomputed, so re-farming a stage cannot re-earn either.
- The campaign map shows stars per stage and per chapter, and the results screen names the first-clear bonus, the relics found and any chest claimed rather than folding them silently into the silver total.

### Added — Phase P5: Summoning & the Chronicle

The Mistgate opens. Four sigils, real odds, and a mercy clock you can watch.

- **The roll** is a pure, injectable module, held to the battle engine's standard, because summoning is the system a player is most entitled to distrust. Rarity comes from the published table plus whatever mercy has accrued; the champion is then a weighted pick *within* that rarity. Keeping those two steps apart is what makes the advertised rate honest as the roster grows — a new Epic dilutes the other Epics, never the chance of getting an Epic at all.
- **Mercy** is source-faithful and visible: after 20 pulls without an Epic the chance climbs 2% per summon, and a Legendary satisfies the Epic counter too, because mercy promises "at least this good". The bonus is taken off the *commonest* rarity, so the table always sums to one — being owed an Epic costs you Rares, not other Epics.
- **Odds & Mercy** sits on the same screen as the button, showing the effective chance the next pull will actually roll against, the mercy clock, and — one click away — every champion in the pool. There is nothing to gain by hiding numbers that are honest.
- **Four pools** (Faded, Gleaming, Mistwoven, Radiant) generated from the roster rather than listed by hand, so a champion added in Admin joins the pools it belongs to by construction, and one flagged unsummonable stays out of all of them.
- **Publish validation** refuses a pool whose rates do not sum to 1, or that advertises a rarity it holds no champion for — the odds panel cannot show a rate a player can never hit.
- **A pull is atomic.** The sigil leaves and the champion arrives in one transaction under the player lock, with `actionId` idempotency: a dropped response on a phone cannot cost ten sigils twice. Every pull is written to `summon_history` with the counters as they stood.
- **The reveal** turns cards one at a time, rarest lingering longest, with a NEW badge, a mercy mark, and a full-screen flare for a Legendary — and a Skip button, because nobody should sit through their ninth ×10 of the evening.
- **The Chronicle** records champions met as well as owned: a champion you fought registers even if you never pulled it, so the collection reads as a record of the world rather than a list of receipts. Brood-kin are listed but excluded from the count.
- **A welcome grant** — ten Faded Sigils and three Gleaming, both `game_config` — so a new warden reaches the gate on their first evening instead of farming towards it. The pull is the hook; a player who has never seen it has not really met the game.
- **Tests** — 27 over the roll, including bulk-distribution checks across 40,000 pulls and a bound on the worst drought; 16 integration cases over the transaction; three browser runs covering the odds panel, a real ×10, and the Chronicle.

### Changed
- Summon rates and mercy moved out of `game_config` and onto the pools themselves, where DATA_MODEL always said they belonged. Radiant's mercy is not Gleaming's, and a rate-up weekend on one banner must not touch the other three — two sources of truth was one too many.

### Added — Phase P4: Champions & relics

The management loop closes. What you farm now goes somewhere: onto a champion, into the forge, or back out as silver for the next attempt.

- **Roster** — a grid of everything you own, sorted by power with favourites floating, food filterable away, and six pips per card showing how much of a champion's relic kit is filled.
- **Champion screen** — stats split into base and relic contribution side by side (which is how a player learns a percentage main stat on a low-base champion is wasted), nine relic slots with the accessory ones gated by ascension, skills with their tome levels, lore, and every ladder's cost stated by the server rather than guessed by the UI.
- **The four ladders** — levels from food, star rank from same-rank champions plus a silver fee, ascension paid in element-matched essences, and skill upgrades from either a tome or a duplicate. Each refuses before it spends, and none will eat a champion that is locked, favourited or still wearing relics.
- **Relics** — nine slots, sixteen sets, ranks ★1–6 and upgrades to +16 with substats rolling at every fourth level. A relic's numbers are rolled when it drops and frozen in: retuning the stat tables changes what *future* relics are worth, never what somebody already farmed.
- **The vault and the forge** — filters by slot, mass-sell with locks as the guard rail and a one-tap "select unupgraded fodder", and an upgrade forge that resolves a whole run server-side and plays the attempts back one at a time. A bulk run is one request, so a dropped response on a phone cannot leave you unsure what you spent.
- **Equip previews** — asking to equip something returns the real before and after, set bonuses appearing and vanishing included. The client shows the difference; it never derives it.
- **Champions fight in their relics.** The battle route resolves gear into the engine's stat bonuses, so the number on the champion screen is the number the simulation uses.
- **Drops** — campaign stages drop relics and essences. The chapter decides the set and the stage number decides the slot, so a chapter is a farm for something specific rather than a lottery.
- **The Bazaar** — rotating stock on an hour's timer, rolled per player and stored, with crystal refresh and unlockable shelves. Relics on offer are the exact pieces shown, already rolled.
- **New content** — relic stat tables and shops became content types, and stage rewards gained a drop band, so the entire relic economy is editable in Admin with no SQL-only knobs.
- **Tests** — 31 unit cases over the gear maths, 32 integration cases over the whole management loop against real seeded content and a real database, and a browser run that farms a relic, equips it and watches the stats move.

### Fixed — found while building P4
- The roster list endpoint returned a bare database row while the champion screen returned an assembled one, so power and worn relics were missing wherever the list was read. There is one representation now.
- `routePattern()` in shared: the route builders percent-encode their argument, so registering a route with `':id'` produced `%3Aid` and served a path nothing could reach. Registrations and callers come from one definition again — including the battle routes, which had worked around it by writing their paths out twice.
- The relic vault was gated behind the level-3 `relicUpgrading` unlock, which would have hidden drops for roughly the first eighteen campaign runs. The vault is open from the start; the *forge* inside it is what the flag actually names.

### Fixed — ops scripts run as root broke the next run as the app user

`sudo -u mistvale UPDATE.sh` failed on a box where an earlier update had been run with plain `sudo`: the ops log and the backup lock had been created root-owned inside app-user-owned directories, so the app user could no longer write its own log or take the lock, and the update refused to proceed.

- `UPDATE.sh`, `BACKUP.sh`, `SEED.sh` and `SET_RANK.sh` now re-exec themselves as the app user when started as root, so the two ways of invoking them cannot diverge. `DEPLOY.sh` and `RESTORE.sh` genuinely need root and are unchanged.
- The ops logger checked that the *directory* was writable and then wrote to a *file* — and `cmd >>file 2>/dev/null` does not silence a failed redirect, because the shell reports that before the command exists to have its stderr redirected. It now checks the file and redirects inside a subshell, so an unwritable log stays silent instead of printing on every line.
- `DEPLOY.sh` repairs ownership of the log and backup directory *contents*, not just the directories, so re-running it fixes a box already in this state.

### Added — Phase P3: The battle experience

The game is now something you can look at. A fresh account picks a champion, walks the campaign map, fights a stage watching it happen, and reads what it paid.

- **Starter choice** — the first real decision, offered whenever the roster is empty. Pedestals come from content, so changing who is on offer is an Admin edit.
- **Campaign map** — chapters in order with their stages, difficulty tabs that disable themselves when a difficulty has no content, energy cost and payout shown before you commit.
- **Team select** — four slots, leader first because the leader's aura is what applies, with the energy cost and your balance stated before the button does anything.
- **Battle screen** — a Pixi stage with staggered formations, always-running idle loops, drifting mist, health bars, status pips, hit shake, crit emphasis and damage floaters; over it a DOM HUD with the turn-order strip, wave and turn counters, the skill bar with cooldowns, and speed ×1/×2, auto, skip and retreat.
- **The playback engine** — the client's "player piano". It applies the server's event log to a view model and nothing else: every number on screen is read off an event field, never recomputed. An ESLint rule now enforces that the client may import engine *types* only, so game math cannot drift onto the client by accident.
- **Results** — outcome, stars, and the loot the server actually granted.
- **Sprite pipeline** — `pnpm assets` publishes the owner's `assets/` tree into the client with normalised names and a manifest that records real frame counts, so the client reads how many frames a unit *has* rather than trusting a content field that could drift. The client's own `dev` and `build` republish first, so the tree is generated output, not a second copy of the art in git.
- **Seeds** — chapters 2 and 3 (The Drowned Road, Silkmire Hollow) with their own bosses, and the campaign generator is now driven by a per-chapter plan, so adding chapter 4 is one entry. 366 entities. The balance gates now cover every published chapter boss.
- **Tests** — 18 cases over the playback reducer (the client's one piece of real logic), plus a browser end-to-end run of the whole loop: register, choose a starter, fight 1-1, collect.

### Added — Phase P2: The game becomes playable

A fresh account can now pick a starter, walk into chapter 1-1 and fight it, and come out with silver and XP. Everything below the client is in place; the battle screen is next.

- **Roster** — `player_champions` holds owned champions as *instances* (level, rank, ascension, XP, lock, favourite) that reference a champion definition rather than copying its stats, so a balance publish reaches every copy at once. Roster capacity is enforced in one place, so summoning, quest rewards and the tutorial grant cannot get it subtly different.
- **Starters** — `GET /api/player/starters` lists whatever content flags `starter`, and `POST /api/player/starter` grants the chosen one. Adding or changing a starter is an Admin edit. The grant is idempotent: a retried tutorial step cannot mint a second roster.
- **Battles** — start, act, auto-resolve, retreat, resume. `battle_sessions` stores the engine's whole state as JSONB, so a fight survives a server restart and resumes on exactly the turn it paused at. A unique partial index enforces one active battle per player, which is what stops a second start from stranding the first one's energy.
- **Idempotency** — every action carries a client-generated `actionId`; replaying one returns the recorded state instead of taking another turn, and cannot pay out twice. That makes a dropped response safe on a phone.
- **RewardService** — the one path resources move by. It enforces the floors, rolls a stage's silver from the battle's own seed (so a replay reports the same loot), and writes every movement to `economy_log`. A route touching a wallet column directly is a bug.
- **Stars** — one for the win, one for finishing inside the turn limit, one for finishing with everyone alive.
- **Tests** — 18 integration cases against the real seeded content and a real database: the starter flow, energy spend, the one-battle-at-a-time guard, a full auto-resolved fight paying out exactly once, retry safety, manual play, retreat, and the check that another player cannot read your battle.

### Added — Phase P2: Battle engine

The fight itself. `packages/engine` is a pure, deterministic simulation: give it content and a seed and it returns state plus an event log, which is the only thing the client ever renders from.

- **Turn meter** — SPD × 0.07 per tick, solved analytically rather than looped, with the documented tie-breaks (highest meter, then the priority side, then the lower slot) and overflow carried so speed compounds. `projectTurnOrder` re-derives the same order for the turn-order strip, so what a player sees is what happens.
- **Damage** — the element wheel with roll-based STRONG/WEAK hits, crit (weak hits never crit; advantage lends crit chance), `K/(K+DEF)` mitigation, ignore-DEF, Weaken/Strengthen, and a configurable spread. Roll order is normative and pinned by tests.
- **Accuracy versus resistance** — the ~90%-parity curve, capped above and floored below, with "cannot be resisted" and the Arena's anti-perma-stun rule.
- **All fifteen status behaviours** — stat modifiers, damage and heal over time, shields, the three turn-skips, Provoke, buff and debuff blocks, counterattack, ally protection, reflect, lifesteal both ways, heal reduction and unkillable. Families make a stronger member replace a weaker one and an equal one refresh it; Poison is the one stacking family; durations tick at the end of the holder's turn.
- **Skills as data** — all nine effect components execute from the published DSL, with per-component conditions, chance and targeting. Adding a skill needs no code.
- **Waves** — both effect bars clear, cooldowns tick, survivors heal, meters reset; HP and deaths persist.
- **AI** — deterministic and hint-driven, shared by enemies and auto-battle, with manual play overriding it.
- **Tests** — 132 engine cases: per-mechanic units, property tests over 60 randomised battles (termination, HP bounds, one death event per casualty), and two committed golden replays that make any behaviour change deliberate.
- **`tools/balance-sim`** — batch simulation over the shipped seeds with the tuning gates from COMBAT_SYSTEM §14, wired into CI. Deterministic: 2,000 fixed seeds per scenario, so the measurement is reproducible rather than flaky.

### Fixed — found by the balance simulator
- Enemy stats were scaled from level 1 while the seeds authored them at a reference level, so chapter 1-1 fought level-60-scale lizards: a fresh account lost 100% of the time. Enemies now carry an explicit `anchorLevel` (default 60, editable in Admin) and scale by `growth ^ (level − anchorLevel)`, the same convention champions already used.
- Anuria cleared chapter 1 on auto only 84% of the time against a 95% target. Twinshot moved from ×0.95 to ×1.1 per arrow — the top of the documented A1 band — which is the pressure her archer identity promises.
- Manual play paused for an action *before* checking whether the unit could act, so a stunned champion would have left the client showing a skill bar it could not use. A turn now opens (meter spent, damage-over-time resolved, crowd control checked) before the battle waits on anyone.
- Prettier reformatted the committed golden replays after the generator wrote them, so they could never match a fresh generation — the same failure mode as the OpenAPI artifact, now fixed the same way.

### Added — Phase P1: Content backbone

Content becomes data. Champions, skills, enemies, stages and every balance constant now live in the database, are edited through the Admin Suite, and reach players on publish — without a deploy.

- **Content contracts** (`packages/shared/src/content/`) — the effect-component DSL every skill is assembled from (damage, applyStatus, heal, shield, turnMeter, cleanse, dispel, extraTurn, cooldown, with conditions and targeting), Zod schemas for all twelve content families, and a type registry the CRUD routes, validation, seeds and client bundle all iterate rather than hard-code.
- **Storage** — `content_entries` holds a live and a draft state per entity; `content_revisions` keeps a full snapshot per publish, which is what makes one-click revert possible.
- **ContentCache** — live content is loaded once into an immutable snapshot and served from memory; publishing swaps the whole snapshot atomically, so no request can ever see half the old content and half the new.
- **Validation in three layers** — schema, then cross-references (a champion cannot go live naming a skill that does not exist), then the engine registry (no status or effect that no code implements). Errors block a publish; warnings do not.
- **Admin API** — draft-only writes for every content type, validate, a field-level diff with risk flags on rate/balance/economy changes, publish with a note, revert, revision history, and discard. Every mutation is audited; the whole surface requires the `admin` rank.
- **Content delivery** — public `GET /api/content` serving the pre-serialised bundle with ETag/304, and a client store that caches it in IndexedDB keyed by revision and re-fetches when a publish moves it.
- **Published API contract** — every Admin endpoint and the public content bundle are described once in Zod and generated into `docs/openapi/admin-api.json` (`pnpm openapi`). The Admin Suite generates its client types from that artifact instead of hand-mirroring DTOs, CI fails when the committed artifact drifts from the schemas, and a contract test calls each endpoint for real and parses the response with the schema the document was generated from — so the document cannot describe an API the server does not serve.
- **Seeds** — 36 status effects, 8 factions, the relic system (9 slots, 16 sets), 17 items, the full **37-champion roster + 6 food units** (the seven showcase kits transcribed from the design doc, the other thirty built from the §1b kit-hook table on the placeholder model), 136 skills, the Sskarn enemy roster with chapter 1's boss, chapter 1 across three difficulties, and every tunable constant from the economy and combat docs — 338 entities, validated in CI.

### Added — Phase P0: Foundation

First working code. A visitor can create an account, sign in, and reach the Haven; the shell, database, and deployment path around that are production-shaped rather than sketched.

- **Monorepo & tooling** — pnpm workspace (`apps/client`, `apps/server`, `packages/shared`, `packages/engine`, `tools/*`), TypeScript strict throughout, ESLint 9 flat config (with React hooks rules), Prettier, Vitest, Playwright. `pnpm verify` runs the same gate as CI.
- **CI** (GitHub Actions) — format → lint → typecheck → migrate → test → build, plus a committed-migration drift check, and a second job running the browser end-to-end suite. Tests run against a real PostgreSQL 16 service, never a mock.
- **Database** — Drizzle schema and first migration for `accounts`, `sessions`, `players`, `audit_log`, `economy_log`, including the Player/GameMaster/Admin rank model, case-insensitive unique account and profile names (`citext`), and CHECK constraints on enums, level and currency ranges.
- **Server** — Fastify 5 with validated environment config, pino logging (credential redaction, sampled success logs), the `{ok,data|error,rev}` envelope with a closed error-code set, per-route rate limiting, request ids echoed on every response, and rank-gated health endpoints. Scheduled maintenance runs in-process.
- **Authentication** — register, login, logout, logout-everywhere, session probe, and change-password. argon2id hashing tuned for the target VPS, session tokens stored only as peppered hashes, httpOnly cookie with a Bearer fallback, sliding expiry, and constant-time behaviour so an unknown account is indistinguishable from a wrong password.
- **Engine foundation** — seeded xoshiro128** RNG with state snapshots and derived streams, the determinism the battle simulation will be built on in P2.
- **Client shell** — React 18 + Vite + PixiJS v8. Hand-built pixel UI kit (Button, Panel, TextField, Modal with focus trap, Toasts), design tokens, the persistent Pixi stage with an animated mist backdrop, screen registry with level-gated destinations shown as mist-shrouded teasers, the Haven, resource top bar with locally-animated energy, dock with keyboard shortcuts, and settings (audio, reduced motion, colour-blind glyphs, battle speed, password change).
- **Tools** — `tools/icon-fetch` fetches, normalises and attributes 79 game-icons.net icons into a sprite sheet (`pnpm icons`).
- **Operations** — `DEPLOY.sh`, `UPDATE.sh` (with automatic rollback), `BACKUP.sh`, `RESTORE.sh`, `STATUS.sh`, `LOGS.sh`, `SEED.sh`, `SET_RANK.sh`, plus nginx, systemd and PostgreSQL configs for `play.pathlands.cc` with the Admin Panel under `/admin`.

### Changed
- Zod upgraded 3 → 4, matching the stack decision the docs already recorded. `z.toJSONSchema` is what generates the OpenAPI artifact, so the contract needs no extra dependency.

### Fixed
- The committed OpenAPI artifact could never match a fresh generation: Prettier reformatted `docs/openapi/admin-api.json` after `pnpm openapi` wrote it, so `pnpm openapi:check` failed on a file nobody had edited. The generator owns that file's formatting now.
- `UPDATE.sh` only seeded on a fresh install, so a release that introduces a new content family migrated the tables in and then left them empty — no champions in game and nothing to edit in Admin. It now runs `SEED.sh` on every update; that mode fills only empty tables and never touches authored content, which is what the script was already documented to do. Replacing live content still requires an explicit `--force-content`.
- `docs/GAME_DESIGN.md` §3 listed Vale Sentinels as "Anuria + 4"; the roster in `CONTENT_PLAN_EA01.md` §1b has five more, and the seeded faction counts agree with §1b.
- Seeded content and Admin-published content were stored in different shapes: the Admin write path persisted the parsed entity (schema defaults filled in) while the seed persisted the file as written, so a hand-authored skill could reach the database without the `hits` an Admin-authored one carried. Validation now normalises once at the persistence boundary and both paths store the parsed result, so how content was authored can never change what the engine reads. Input-shaped `…DefInput` types make the distinction explicit for authors.
- Rate-limited requests returned a 500 "Something went wrong on our end" instead of a 429: the custom response builder returned a plain object that Fastify treated as an unhandled error. Formatting now happens once, in the global error handler. Caught by the end-to-end run; pinned by a regression test.

### Changed
- **Planning updated after owner review (all USER_QUESTIONS answered):** Anuria reworked to archer/ranger (kit + ranged battle visuals) · EA roster expanded from 7 to **37 champions + 6 food units** — 30 new champions across all 8 factions and rarities up to Legendary using the territorial-lizard placeholder model until real art arrives via Admin (Broodling food economy approved; Mistbound-Cache workaround removed; missions finale now awards exclusive Legendary **Aureleth, Voice of the Vale**) · account model switched to **ranks (Player / GameMaster / Admin)** on one account system — Admin Panel at `play.pathlands.cc/admin`, admin-rank-only, first admin bootstrapped by DEPLOY.sh/SET_RANK.sh · deployment locked to single domain `play.pathlands.cc` with path-based routing, bare-metal · all eight suggested QoL additions approved and scheduled (choice tomes, multi-battle, replays + share links, Odds & Mercy, team presets, first-win bonuses, practice sandbox, colorblind glyphs) · new binding design rule **GDD §1.1 "Depth budget"**: RSL-scale grind & content with reduced entry complexity.

### Added
- **Complete EA-0.1 planning package** (no code yet — Phase P0 starts next):
  - `docs/GAME_DESIGN.md` — master GDD: the Mistvale world (Worldmist, Sskarn invasion, 8 factions), the four elements, the 7 existing champions with full identities, all EA systems (campaign, Depths, Arena + Hall of Valor, Mistgate summoning with visible mercy, quests/missions/events/login, Bazaar), post-EA parking lot, suggested-additions list.
  - `docs/COMBAT_SYSTEM.md` — engine contract: SPD×0.07 turn-meter ticks, roll-based element hits, DEF/(DEF+600) mitigation, ~90%-parity ACC/RES curve, 28 shipped status effects with source-faithful timing, boss mechanic flags, 2-of-3-tree masteries, deterministic seeded replay design.
  - `docs/ECONOMY_BALANCE.md` — every currency/faucet/sink with initial numbers: energy, XP/rank/ascension costs, relic upgrade ladder, verified-rate summoning + mercy, Hall of Valor costs, crystal economy, bot isolation rules.
  - `docs/CONTENT_PLAN_EA01.md` — full EA inventory: 7 champion kits with multipliers, lizard enemy archetypes + 12 chapter bosses + 5 dungeon bosses, 12 campaign chapters × 3 difficulties, 6 Depths dungeons, 16 relic sets, 48 mastery nodes, 80 missions, tutorial script, arena bot seed.
  - `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/API_DESIGN.md`, `docs/UI_UX_DESIGN.md`, `docs/DEPLOYMENT_OPERATIONS.md`, `docs/ASSET_GUIDE.md` — locked stack (React+Pixi / Fastify+Drizzle+Postgres / pure engine package), full schema draft, endpoint inventory, 25-screen UI spec with icon map, VPS ops runbook with script specs, asset inventory + conventions.
  - `docs/research/RAID_REFERENCE.md` — three-part verified research on the source game (combat math, content structure, economy) with per-fact confidence tags and sources.
  - `ROADMAP.md` (phases P0–P10 with exit criteria + owner checkpoints), `CLAUDE.md`, `AGENTS.md`, `USER_QUESTIONS.md`, `README.md`.
