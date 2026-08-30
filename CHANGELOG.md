# Changelog — Mistvale

All notable changes to the game are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · Versioning: pre-release `0.x` until **EA-0.1**.

## [Unreleased]

### Added — nobody is mandatory in the Arena, and it is measured (C29b)

The other half of gap G7, and the last of the two balance gates COMBAT_SYSTEM §14 has
documented since P2 and never enforced. `pnpm sim` now draws random four-champion comps at
**identical** level, rank, ascension and relics, fights them in arena mode, and fights every
pairing **twice with the sides swapped** — the attacker moves first and that is worth real
win rate, so scoring one direction only would credit the draw rather than the champions.

**Three things it is deliberately not, each ruled out by measurement.**

It is not the *>40% of winning comps* figure the doc names. That is arithmetic: a champion
fills 4 of 37 comp slots so it appears in **10.8%** of random comps, and every battle has
exactly one winner so half of all comps win — a champion winning *every fight it ever
appeared in* would still be in only **21.6%** of winning comps. The line could never be
crossed. It means what it means in a metagame where players choose their comps; here they
are drawn, so the same question is asked in the form drawn comps can answer.

It is not per-champion either, for the reason C29's benchmark has no lower bound: one
champion in four cannot escape the noise of its three random partners. Given **a hundred
times** its authored attack a champion tops the table at 76.5%, against an authored best of
76.3%; stripped to 1/1/1 it falls only to 20.6%, against an authored worst of 24.9%.

And there is no floor. A role can be pushed up but not down — every attack champion cut to a
*twentieth* of its attack moves the role from 42.5% to 38.5% and stops there, because a comp
holding a crippled attacker still holds three others who win it.

**What is gated is a role's ceiling.** Pooling six to fourteen champions over thousands of
battles takes the noise with them: a role moves **0.2–1.3 points** across disjoint seed
blocks. Shipped, the roles run attack 42.5% · defense 51.4% · hp 54.0% · support 56.9%, and
the bound is **62%** — five points clear of the maximum, five times the drift, and
demonstrably crossable, since every support at five times its attack reaches 65.9%. A second
gate checks the *draw* rather than the content: every champion must actually be fielded,
which is the one way this harness could silently go wrong and still print a plausible table.
Both are mutation-checked and each fires on its own mutation. **G7 is closed.**

The finding worth carrying: **the Arena inverts the stage benchmark.** Supports are the
strongest role in PvP and the slowest at clearing PvE; attackers are the reverse. Two modes
rewarding different champions is what a collection game wants.

### Changed — Q9 answered: the roster stands, the band stays unenforced

The owner took the recommended default (2026-08-30). A spread of 75–151% within a role is
not obviously wrong for a collection game — an auto-include and a niche pick are what make a
collection worth having — and the ten champions outside the documented 85–115% band are
doing what they were authored to do rather than misbehaving. The instrument and its report
ship; the tuning does not. Two observations are on the record for whenever a champion pass
happens: **Ugrim Pyrechant is authored `support` and out-damages half the `attack` roster**,
and **six of the ten supports neither heal nor shield**.

### Added — every champion, measured against its own role (C29)

COMBAT_SYSTEM §14 has asked for this since P2 and the repo could not answer it. The gate
wants every champion inside a band of its **role's** benchmark, and nothing here could
measure what one champion contributes — so the line sat in the doc reading *not yet
enforced* for eight phases. Two later passes quietly supplied both halves: `contributions()`
(C21) reads a champion's work off the event log, and `packages/sim` (C27) is where a
measurement CI and the Admin sandbox can both call belongs.

`pnpm sim` now fights **every champion** in the same team, on the same stage, at the same
investment — slot 0 under test, the other three the same trio every time — and prints what
each one did.

**The score is turns to clear, and that was settled by measuring rather than by arguing.**
The first cut scored the three fighting roles on damage and `support` on healing plus
shielding, and the roster says that is wrong: **six of Mistvale's ten supports neither heal
nor shield.** They buff, debuff and move the turn meter, so six of ten came out at zero and
the role's median at 3 — every ratio in the column was noise. Turns has none of that: it is
defined for every kit, it is the currency `bestTurns` and every three-star limit already use,
and it credits each role in its own coin — an attacker shortens the fight by killing, a tank
by keeping the party alive to keep killing, a support by making the other three better at it.

The bench is the last Brutal campaign stage, picked for what it **lacks**: no boss mechanic.
The Titan and the world boss are the obvious dummies — nobody kills them and both run to a
turn cap — and both carry a hit-counter shield, which would turn the whole table into "is
this champion a multi-hitter", a fact about that boss rather than about the champion.

**Three gates, each mutation-checked, and each fires on a different mutation:** the bench
fight is still winnable (or every turn count under it is meaningless); every champion deals
damage, heals or shields and survives some of the time; and no champion exceeds 200% of its
role's median. A champion given a hundred times its authored attack reaches 262% and trips
the third; one stripped to a single point of attack, health and defence trips the second; a
bench nobody can win trips the first.

**There is deliberately no lower bound**, and that is the finding worth keeping. The score
is what the *team* did and the other three carry the fight, so the measure saturates from
below: the champion stripped to 1/1/1, which dies on the first wave and does nothing at all,
still scores **66%** — against a roster whose own weakest is 75%. Any floor far enough from
75% to clear the six points of sampling noise would sit under 66% and could never fire, and
a guard that cannot be made to fail has not been checked.

**What is not enforced is the documented 85–115% band**, because ten of the thirty-seven sit
outside it — that is the champion pass the roadmap has always said this waits for, and a
balance decision about a live game is the owner's rather than a side effect of building the
instrument. The report is the input that pass needs, and it is **Q9**.

### Fixed — the fight was watched in a void with the room painted underneath it (C28b)

C23 put one of the owner's paintings behind every tab. The battle scene opened by clearing
its whole canvas to an opaque near-black and then laying the floor over the bottom of it —
written long before there was anything behind the canvas to hide, and never reconciled with
it. So the Combat painting was published, loaded, correctly stacked, and covered, in the one
room a player spends real time in.

**The tell was that the fallback renderer looked better.** `DomBattlefield` has drawn only
the floor since B2 — its stylesheet says "the same two colours at the same height" and it
never had a sky to draw — so the simple battlefield has been showing the room above the
horizon all along and the painted one has not. Two renderers meant to be the same fight,
disagreeing about the whole top half of it. Dropping the sky is what makes them agree; the
floor stays opaque in both, because it is what the champions stand on and a wash that let
the painting's own rocks through would put busy detail under their feet.

The horizon itself moved into `game/formation` beside `BASE_Y`, for the reason C28 moved the
formation there: it sat as a literal `230` in the scene and as `230 / 540` in the fallback's
stylesheet, and two renderers that disagree about where the ground is put one camp's feet in
the air.

Two guards, both mutation-checked. In a fight the painting is **87%** of the band between
the top bar and the horizon, against **0.79%** with the opaque sky put back. And the ground
guard was rewritten rather than retuned: it had compared two patches 70px apart at the
letterbox and asked for the lower one to be brighter, which only worked while the scene
painted a sky — both patches were the canvas then. It reads the canvas's own contribution
now: 51% and 60% at the two edges below the horizon (0.00% with the bleed taken off), and
0.00% above it (82% and 99% with the sky back).

### Fixed — a party stood in a heap (C28)

Four champions on the field overlapped by about two thirds and read as one shape with
several heads. `slotPosition` stepped 34 virtual pixels between slots against a champion
body about 65 wide, so the more of a party you fielded the less of it you could see — and
the same 34 applied to the enemy camp, so a four-wide wave was a pile too.

It survived every guard in the suite for one reason: **it needs more than one champion on a
side.** A fresh account fights 1-1 alone, and so did every browser spec — a formation cannot
overlap with itself. The cold open is the only battle a fresh account can reach with three
champions in it, and that is where the new guard asks the question.

The other half of the same function was the vertical one: the party stood at 300 of the
540-row canvas with nothing under it but floor, so the bottom two fifths of every fight in
the game were empty while the champions sat in the upper middle. They stand low now, where
the eye already is, and still clear the hotbar at every size measured.

`game/formation` is its own module because **four** things read it — the Pixi renderer, the
browser-drawn one, the pointable overlay and the damage floaters — and a fight has to look
like the same fight whichever is running. A unit's footprint moved there too: the pointable
box was a flat `96px`, which does not scale with the canvas, so on a 1920 window the hit
target was a third of the champion it belonged to and most of a click missed.

The arithmetic is pinned in `formation.test.ts` (slots clear each other, the camps mirror,
nobody is drawn off the canvas, the party stands low) and the fact that it *reaches the
screen* in `visible.spec.ts`. Both were mutation-checked against the old numbers: the unit
test fails on two assertions, and the browser guard fails with champion 2 starting 43 pixels
inside champion 1.

### Added — the balance sandbox: a retune you can check before you publish it (C27)

Until now, the only way to find out what a stage retune actually did was to publish it and
go and play the stage. `tools/balance-sim` had answered exactly that question in CI since
P2 — it just had no way in from the outside, which quietly made a balance *edit* a deploy
(ROADMAP item 13, gap G4).

`POST /admin/api/simulate/stage` fights a stage many times against a named bench team and
reports the win rate, the average and median turns across winning runs, the stage's own
three-star turn limit, and the share of runs that came in under it — which is usually the
figure an operator is really asking about, because a stage can be perfectly clearable and
still be mis-tuned if nobody can three-star it.

Three things make it worth trusting:

- **It is the same simulation CI runs.** The fighting half moved into `packages/sim` — pure,
  IO-free, depending on the engine and the content contracts and nothing else — and both the
  gates and the endpoint call its one `simulateStage` and its one definition of each bench
  team. A sandbox that answered a balance question differently from the gate guarding the
  same number would be worse than no sandbox. Every one of the 84 gates reports the same
  measurement, to the digit, as it did before the extraction.
- **It can read the drafts.** An operator retuning a stage wants to know what the *edit*
  does, not what the published version already did, so `source: 'draft'` layers the pending
  edits over live exactly as a publish would — `ContentCache.draftBundle()` builds the same
  snapshot a publish would produce, without publishing it or touching the live cache.
- **It writes nothing.** No player, no roster, no progress, no content — and deliberately no
  audit row either, because the audit log is the record of what an operator *changed*, and
  filling it with "somebody pressed Simulate" would bury the entries that matter. The test
  asserts all of that rather than trusting it.

The three bench teams are the shapes the gates already used, named so the two can be
compared: **fresh** (four Rares at 20 / ★3, no relics), **modest** (50 / ★5 / asc 2 with
relics) and **built** (60 / ★6 / asc 6, relics and a collection). They are picked by key
rather than by strength, deliberately — a benchmark whose baseline drifts when a champion is
retuned cannot be compared to yesterday's answer.

Runs are capped at 200 a press: a stage resolves headlessly in about a twentieth of a
millisecond, so that is a tenth of a second on the target box, and the cap is there because
this is a loop whose length the caller chooses on a machine that has a game to serve.

### Changed — the fight itself, laid out for the hands that play it (C26b)

The owner (2026-08-29), with a second Raid screenshot: *"fully rework the battle screen
itself… on the top you see the boss's health bar, below that on the right his skills
(hoverable), on the bottom left autobattle speed and auto mode, on the bottom right your own
spells"*. That is the layout now, on every fight rather than only on a boss one:

- **Auto, the speed ladder and the ways out are bottom-left**; **the acting champion and
  their hotbar are bottom-right**, and so is the hint or the spinner that stands in when
  there is no turn to take — the place the next decision is made never moves. They had been
  a top-right cluster and a centred row, which put the two things pressed most often as far
  apart as the screen allows.
- **Two bands of shade** sit behind the HUD, top and bottom, so white text and painted plates
  read over whatever the battlefield is doing. They are pseudo-elements of the frame rather
  than children, which keeps them out of the grid *and* out of `pointer-events: auto` — a
  click aimed at a sprite still reaches the sprite.

**And a boss gets a frame of its own.** Its health across the top, tinted with its element's
colour, and down the right a rail of **what it can do**: the `bossMechanics` sentences first,
then its own skills, both hoverable. None of that is new data — `isBoss` has been on the unit
since P3, an enemy's skills in the bundle since P1, `bossMechanics` since P6 — and none of it
had ever reached the fight. The mechanics in particular were stated in the team chooser (D8)
and vanished the moment the energy was spent, which is exactly when they decide what a player
does. The plate in the middle now skips the boss the bar already names, because the same name
and the same health in the two most prominent places on the screen is C12c's defect again; a
unit the player *clicked* still gets a plate, since a click is a question.

The bug found while building it is the one worth keeping: **the frame read the server's board
and gave the fight away.** Auto resolves several turns per response, so the server is
routinely two waves ahead of the animation — the first cut drew a full boss frame over wave
one already reading `0 / 235`, naming the warlord and reporting his death before the player
had met him. `VisualUnit` carries `isBoss` now and the whole frame is drawn from the
playback, which is P10a's rule in a new place. The browser guard walks a fresh account from
1-1 to 1-7 with C26a's own **Next** button and refuses a boss bar that appears before the
pips read the last wave; it fails against the old code with the pips on `2 / 3`.

Two smaller things came with it. The playing-out hint **stopped naming a button that is not
there** — a first clear is not skippable (C7), so on the one fight a player is most likely to
be impatient through, the line had been pointing at a Skip that was never drawn. And the
turn counter is legible now rather than muted grey on a painted field.

### Changed — the end of a fight, rebuilt to the reference (C26a)

The owner (2026-08-29), with a Raid screenshot: *"you will fully rework the End of Battle
Screen to look more similar to Raid Shadow Legends"*. It is a composition now rather than a
card with a table beside it. Reading down: **where the fight was and how long it took** in
one corner, the stars and the gold headline in the middle of the light, **the account's
energy** in the other corner, then the spoils as one strip, then **a card per champion**,
then the ways on. That is the order a player's own questions arrive in — *did I win, what
did I get, can I go again* — which is why this genre settled on it.

`ResultScreen` still paints the ground: the backdrop, the turning rays, the gold headline
and the three stars are the library's, which is chrome and holds no state React drives.
Everything below is Mistvale's, portalled into the library's own root so one column rule in
the screen's stylesheet lays the whole thing out. The pack's stat list, reward chips and
action row are no longer asked for — what the game has to say after a fight is a strip, a
party and a footer, and none of those is a `dl`.

- **Turns, never a clock.** The reference reads `Time 00:11 · Best 00:07`. Mistvale is
  turn-based and playback runs at ×1, ×2 or ×4, so a wall-clock figure would measure how
  fast somebody chose to *watch* rather than how well they fought. Turns is what the game
  already records, already scores Trials on and already prints on a chapter's stage rows.
  The record beside it is the one held **before** this run (`previousBest`), read in
  `recordClear` before the upsert folds this fight into it — otherwise the run that breaks
  a record prints the same number twice and "a new best" could never be true.
- **A card per champion**, replacing the C21 table: their face, the star rank and level the
  copy finished on, how far that level has left to run, and three bars for damage, shield
  and healing. Three figures and never a total; each bar scaled against the biggest figure
  **in its own column across the party**; a bar nobody filled is not drawn. It needed the
  battle view to carry its own **team** — the engine works in slots, the client works in
  roster copies, and slot *n* is `team[n]`.
- **Relics that dropped are shown as relics.** The screen used to say "Relics found · 2",
  which is the results screen telling a player to go and look in the vault. They are the
  same painted card the vault draws, tooltip and all.
- **Three ways on**, offered only where they work. *Again* and *Next* re-enter the fight
  with the same four; *Change team* opens the ordinary picker over the result, so every
  economy stays with the component that owns it. All three appear only on a stage paid for
  in **energy**, and that falls out of content rather than a list of mode names — every
  attempt-limited mode in the game is authored at zero energy, so a Titan key or an Arena
  token can never be spent from here. *Next* additionally waits on the server's own `open`
  flag and is offered only after a win.
- **"Par beaten" is finally said out loud.** It is the sentence the Trials mode exists for
  (C10d) and the results screen had never printed it — the par bonus arrived inside `bonus`
  and read as ordinary loot.
- The headline **stopped repeating the place the corner already names**, which is C12c's
  "a screen says its own name twice" on a fifth screen, and the browser guard now counts it.

The roster and the progress table re-sync when the player has *watched* the fight end,
alongside the wallet that already did — the party cards read levels that moved and *Next*
reads a stage the clear just opened, so both were stale by exactly one fight without it.

### Changed — an unlock is a banner, not a card in the way (C25)

The owner (2026-08-29): the celebration modal is *"very annoying while the tutorial is
ongoing and new players can get confused by it"*. It is gone, and what replaced it is the
small "Achievement Unlocked" banner this genre uses: it slides in under the top bar, holds
for four seconds with its own cue, and leaves. Nothing to dismiss, nothing to decide.

The modal's own note argued that an unlock "is worth a beat of the player's whole
attention", and that was the mistake in one sentence: it is true of the **feature** and
false of the **moment**, because the moment is never chosen by the player. A level arrives
out of a fight they were watching, or three at once out of a mission chain, or — worst —
in the middle of the tutorial while a new warden is being told to press something else. A
card with two buttons stops all of that to ask a question nobody asked.

Everything else about the system stays: unlocks are still derived from the level rather
than from watching flags flip, still remembered per account so a returning player is not
handed their whole history, and still **queued** — level 8 opens the Arena and the Hall
together, and the two banners play one after the other rather than one winning.

It is the library's own `AchievementPopup`, which is the D9 rule working as intended: the
banner queues and times itself and holds no state React must drive, so the component is
used rather than the art. Two things it needed from Mistvale:

- **It is anchored to the content frame, not the viewport.** The library pins itself at
  `top: 26px`, which here is *inside* the painted top bar. Mounted in the shell and
  re-anchored, it hangs under the bar at whatever height the bar happens to be — and that
  height is content, since the player chip grew with C15 and will again, so a hardcoded
  offset would be a guess about somebody else's layout (C17's lesson).
- **The badge is the destination's painted `art`, not its dock glyph.** A glyph is authored
  `fill="currentColor"` and the dock paints it by using it as a *mask*; loaded as a
  `background-image`, which is what the badge does, `currentColor` resolves against the
  SVG's own document and comes out black. The first cut drew an empty slot.

The paragraph each unlock used to carry went with the modal — a banner is one line, and
the place itself says what it is for. `dismissUnlocks` went too, from the ten specs that
called it: the banner is `pointer-events: none`, so there is nothing to get past.

### Added — the XP boost (C24)

A timer on the account that pays **+25% champion experience** in every fight that pays any
— the boost this genre has had for a decade, and the owner's request (2026-08-28). Three
rules make it the thing players recognise rather than a permanent buff wearing a clock:

- **It is a duration, not a charge.** Nothing is spent to use it; only the wall clock counts
  down. So the decision it creates is *when to play*, which is the whole point of an expiry.
- **It extends rather than replaces.** Claiming a second boost while the first is still
  running adds to it — the alternative punishes a player for claiming a reward at the wrong
  moment.
- **It is granted by content, not by code.** `xpBoostHours` is a reward scalar, so a quest,
  a mission, an event rung, a login day, a mail attachment or a shop offer grants one by
  writing `{ xpBoostHours: 24 }`. No mechanism of its own, nothing to add for the next
  source. As seeded a newcomer earns **96 hours** across their first week.

**A badge sits beside the player's name**, lit with a countdown while it runs and grey while
it does not — both states on screen, because a badge that only appeared when active would
teach nobody the boost exists. It reads the multiplier from the same `game_config` key the
server pays by, so it cannot promise a percentage the payout does not honour.

The multiplier is **read when the experience is paid**, not when the fight opened: a fight
that outlasts its own boost pays the plain figure, which is the only rule a countdown can
be true about. The result screen names what the server actually paid at rather than
re-deriving it from a clock that has moved on.

`grantChampionXp` takes the multiplier as a **required** argument, the way `assembleChampion`
takes its fifth: there is one call site today, and a boost the second one forgot would be a
feature that works everywhere except the mode somebody added last.

### Added — energy can go past its cap, and the first days are full of it (C24)

Two halves of one request. **The cap governs regeneration and nothing else**: the clock
stops filling at it, and a reward goes straight past it and stays. That was already true of
the derivation and had never been reachable, because **energy was not something content
could pay at all** — `energy` is a reward scalar now, granted uncapped, and `players.energy`
widened from `smallint` to `integer` to hold what the early game hands out.

**The first hours and days are deliberately generous** (the owner: *"at least 2-3k energy
overflow in the first couple of hours/days, so the early game is enjoyable and they have low
downtimes"*). Measured rather than guessed, and pinned by a test: a first session banks
**~1,830**, a first week **~4,160** — several hundred fights at 4–9 energy each. Then it
tapers, which is the other half of the instruction: Path arc 3 pays 220 against arc 1's
1,370, and the whole thirty-day calendar pays 420 against the welcome week's 2,250. The
guard checks the floor *and* the taper, because either alone can be satisfied by a mistake.

A grant **settles the bar before adding to it** and carries the unfinished part of the
current tick, so a reward never quietly costs a player the three minutes they were part-way
through. The top bar reads `2,437 / 20` above the cap — what is held against the line it
passed — rather than substituting the value for the cap and calling a bank a full bar.

### Fixed — a shop offer kind that took the payment and granted nothing (C24)

`currency` has been a published offer kind since P4 with **no payout branch**: an offer
authored with it in Admin would charge the crystals and hand over nothing. Nothing in the
seeds used it, so nobody was ever charged — it was a trap waiting for the first operator to
find it. It pays through `payRewards` now, which is also what lets the Bazaar sell energy
with no further code, and publish refuses a `currency` offer naming something unpayable.

### Changed — the two rations are retired (C24)

`energy_pack_small` and `energy_pack_large` were consumables the game could never consume:
the login calendar, the Path, quests, events and the Bazaar all handed them out, and no
screen lists them and no route spends them. Every one of those payouts pays **energy
directly** now, at the same worth or better, and the Bazaar's ration stall sells energy
rather than an item that did nothing. The two items stay published for anybody still holding
one — deleting a published item orphans their rows — and a test refuses any content that
starts paying one again.

### Fixed — and then the paintings were behind an opaque sheet (C23b)

Putting the canvas in front of the paintings (C23a, below) revealed the other half of the
same mistake: the Pixi stage cleared to `0x0c0a09`, an **opaque** colour, so the moment it
was correctly stacked in front of the wallpapers it covered every one of them. The tabs
went back to the bare ground they had before C23 — the layering was right and the room was
still invisible.

The stage clears to nothing now (`backgroundAlpha: 0`). Nothing is lost by dropping the
colour: `.stageWrap` paints `$ground-deep`, which is the very colour it used to clear to,
one layer further down — so a tab with no painting looks exactly as it always did.

**And `e2e/wallpaper.spec.ts` had passed through all of it.** It asked whether the layer
carried the right URL, which is a question about the document rather than about the screen,
and an element with a perfect `background-image` behind an opaque canvas satisfies it
completely. It measures the painting's own contribution now, the same way the battlefield
guard measures the canvas's: shoot the window, hide the painting, shoot it again. Measured
at 1440×900 — 31% of the window on the Haven, 25% on Champions and Errands, 17% at the
Mistgate, against 4.6% with the opaque clear colour put back.

The two layers have now each covered the other exactly once, and each of them shipped past
a guard that was looking at the DOM instead of at the picture.

### Fixed — the champions were painted over (C23a)

The tab paintings covered the battlefield. Every fight in the game — campaign, Arena, the
Depths, the Valewurm, all of them — drew a full HUD, party frames, a turn counter and
floating damage numbers over an empty field, because the two layers C23 added *behind* the
shared canvas were painted **in front of** it.

The cause is one line that was never written. Both new layers are `position: absolute`, and
the canvas was `position: static` — and CSS paints positioned descendants above
non-positioned in-flow content **whatever the source order says**. Putting the paintings
before the canvas in the markup looks like "behind it" and is not. The canvas is
`position: relative` now, which puts all four layers in one painting step where source
order decides: wallpaper, wash, canvas, vignette.

Two guards came out of it, and the second one matters more than the first:

- **`the battlefield is not painted over by the room behind it`** shoots the field, hides
  the canvas, and shoots it again — what changed is the canvas's own contribution, and a
  covered canvas contributes nothing. Measured: **86% as shipped, 0.00% with the canvas back
  to `static`.** Nothing else can ask this. `expectOnTop` cannot, because every layer of the
  backdrop is `pointer-events: none` and `elementFromPoint` skips those (C18's lesson); and
  reading pixels off the canvas cannot either, because an element screenshot captures the
  region the element occupies **including whatever covers it** — which is exactly how a
  wallpaper passes for a battlefield.
- **The existing "the battlefield has bodies on it" went blind on the same day**, for that
  second reason: it screenshots a band of the viewport and asks how much of it is brighter
  than the ground, and a painting is bright everywhere. It hides the layers behind the
  canvas before measuring now, so it answers about the canvas again rather than about the
  room. Confirmed by mutation: with the canvas drawing nothing it reports 1 part in a
  thousand against a bar of 4.

### Added — every tab has a room of its own (C23)

The owner's six paintings (2026-08-28), one per dock tab: Combat, the Haven, Champions, the
Mistgate, the Bazaar and Errands. Each is drawn full-bleed behind everything, with **a dark
wash over it** so painted panels and white text still read over a lit night market, and
**the drifting fog on top of it** — the same fog the game has always had, now **tinted to
the painting it is drifting over**. The owner's own list: Combat, Champions and the Bazaar
keep the ember brown the fog shipped in; the Haven drifts blue, the Mistgate violet and
Errands green.

**One entry per dock slot rather than one per screen**, which is what keeps the map six
lines long instead of twenty-four: a player standing in the Depths is inside the Battle tab,
so `dockSlotFor` decides the backdrop. It also means stepping from the Mistspire to Trials
does not repaint the room — and `setPalette` **re-tints the fog already drifting** rather
than building a second scene, because rebuilding one restarts the drift from zero and reads
as the backdrop flinching every time somebody presses the dock.

Two screens are painted despite reaching no tab of their own, because "no tab" is not the
same as "no room": a **fight** is Combat (the cold open is a mostly empty screen by design,
and would otherwise be the one place in the game that went back to a bare wall), and the
**mailbox** is an errand — a list of things to claim, reached from the top bar only because
it carries a pip. Both were found by a test asking whether *every* screen in the game
resolves to a painting rather than only the six on the owner's list.

The **title and boot screens keep their own art**: the title screen paints its key art
full-bleed already (C18), so a wallpaper under it would be a second picture nobody asked
for.

### Changed — the asset pipeline publishes a set as JPEG (C23)

`pnpm assets` gained one option, and the numbers are why it is worth a special case: the six
wallpapers arrive as PNG and come to **12.9 MB** published at 1600px, against **1.45 MB** as
JPEG. A painted scene with thousands of colours and no flat regions is precisely the case
PNG is worst at — the same finding C18's backdrop pass wrote down, applied in the other
direction. The extension is rewritten with the format, because a `.png` that is really a
JPEG is a name somebody debugs twice.

A source with **real transparency is refused** rather than flattened onto black, which is
`png.ts`'s own rule about producing a wrong picture quietly. `isOpaque` is exported from
`png.ts` for it rather than written a second time in the publisher — the encoder has asked
the same question since C16 to decide whether the alpha channel earns its byte.

**A release must run `pnpm assets`** for the paintings to exist at all; the published tree is
gitignored, like the sprites and the scenery. A missing one fails quietly by design — the
game simply shows the ground it always did — so `e2e/wallpaper.spec.ts` asks by **decoding**
each file rather than fetching it, since a missing file answers 200 with the game's own HTML.

### Changed — setting a lineup is a confrontation, not a column (C22)

The owner's reference (2026-08-28, Raid's Classic Arena screen): **your four on the left,
what you are walking into on the right, the roster underneath.** Every place in the game
that asks for a lineup draws it now — a campaign stage, a Depths floor, the Titan, the
Wurm, a Mistspire floor, an Arena attack and the Arena defence — because they are one
component (`screens/Battle/Lineup`) rather than the two pickers they were.

What that fixes is not decoration. The picker was a single column — a line of summary, the
opposition, the boss, four empty slots, thirty cards, the button — so **the two things a
player is actually comparing were four hundred pixels apart and never on screen at once.**
A team choice is a comparison, and a layout that cannot hold both sides is asking somebody
to keep one of them in their head.

Three things arrived with the layout, each of them data the game already had:

- **The leader's aura, in words.** Content has carried one on every champion since P1 and
  the engine has applied it on every fight since P3 — and no screen has ever said what it
  was. So the whole reason slot one is the player's to choose has been invisible: the
  champion standing there has been changing the team's stats silently, and the only way to
  find out which one to put there was to read the seed. It is on both banners now, and an
  aura that does **nothing in this fight** says so rather than being hidden, because an
  Arena aura on a Depths floor is the exact mistake the line exists to prevent.
- **Team power on each side**, so the two are comparable at all.
- **The roster narrows**, with the roster screen's own controls (`rosterFilter`, C19) rather
  than a second set of dropdowns that would drift — thirty cards and "who can I bring" is
  the same question that screen already answers.

**The Arena is the case the shape was invented for**, because it is the one fight where the
other side is a real team rather than a wave: the defender's own four, their power beside
yours, and **their leader's aura**. An attack is decided by whose aura is bigger about as
often as by whose champions are, and the screen had never said either.

`auraCoversMode` moved into `packages/shared` so the engine and the screen read one rule.
They were the same rule written twice for about ten minutes, and the copy was **already
wrong**: an aura scoped to the campaign also covers the tutorial and the sandbox, which
nothing about the word "campaign" says — a client reading the enum literally would have
told a player their leader's aura was dead in a fight that applied it.

Two smaller things: **Start on auto** is on the footer beside the cost, reading the standing
preference the fight screen's own toggle already uses (`loadoutStore`, B2), and a filled
slot shows the champion's face, level and star rank where it used to show a name.

### Added — the result screen says what your champions did (C21)

Every fight in Mistvale ends the same way: four champions, a wall of numbers that scrolls
past in three seconds, and a screen that says whether the wall fell over. What it never
said was **which of the four was carrying it** — which is the question a player retunes a
team on, and the one the event log has been able to answer since P3 with nothing asking it.

Beside the result card there is a table now: one row per champion you fielded, with
**damage, healing and shielding**. It is drawn on every mode and on every ending — a
campaign clear, an Arena loss, a Depths floor, a Valewurm run, a fight walked out of.

**Three figures and never a total.** They are three different kinds of work, and adding
them produces a number that means nothing. Each column's bar is scaled against the biggest
figure **in its own column**, so 40,000 damage and 4,000 healing are both a full bar — they
are answering different questions. A column nobody filled is not drawn at all.

**Shielding is there because leaving it out would have been a lie about nine champions.**
Mistvale has nine who shield and never heal, and a two-column table would have reported a
third of the support roster as having done nothing all fight. That needed one engine
change: `shieldGained` carries a `source` now, the way `heal` always has, because a table
cannot attribute what the log does not say.

**Your side only** — the owner's rule. The fold takes a side and the Admin battle inspector
will want the other one, but this is a report on the team you brought rather than a
breakdown of the enemy's health bar.

The rules about what counts are the interesting part, and they are the Titan's rules
because it is the same question asked once per champion instead of once per run:

- A blow a **shield ate** still counts. The shield is the target's answer to the hit, not
  grounds for pretending it missed — and a boss hit-shield reports the whole blow as
  `absorbed` with `amount: 0`, which would otherwise read as a champion doing nothing.
- **Overkill stays on the striker**, which is the engine's own figure and the rule the
  world boss states out loud.
- Damage that came **back onto your own side** — a reflect, a retaliation, a poison you are
  wearing — is not work the party did, and counting it would credit whoever happened to be
  standing in front of it.
- **Healing is what was actually restored**; the engine has already clamped an overheal
  away, so it never claims more than it did.

It is folded out of the event log **by the engine, on the server** (`contributions` in
`packages/engine`), and only once the fight is finished. The browser holds the same log and
could add it up, which is exactly why it does not: the numbers a player is shown about a
fight are the engine's numbers, the way loot and stars and rating are. Nothing is stored —
the log on the row *is* the record, and a second copy could only ever go stale.

`battle.contributionTable` is the one place that decides when the table appears, because
five different places build a `BattleView` — `start`, `step`, `retreat`, `toView` and the
Arena's own attack — and each of them was otherwise free to disagree.

### Changed — the Mistgate is a place, and the pull says what it was worth (C20)

**The gate.** Four pools is the one real choice this screen offers, and it was answered
with four 40px text tabs carrying a name and a count. They are **painted boards** now —
each with its own rune, its count at a size worth reading, and the line that actually
decides the choice, which is **how good the pool gets**. That line is a *range* rather
than a ceiling, and the reason is the seed's own rates: three of the four pools can
produce a Legendary, so "up to Legendary" is true on three boards and separates nothing.
The floor is the half that does — the Radiant sigil cannot give you a Rare, which is the
whole reason to save one. Gleaming and Mistwoven still read alike, correctly: their rates
are identical and only the champions behind them differ.

Both halves are **derived from the published rates** (`ui/sigilArt`'s `poolRange`) rather
than authored, so a hand-written tier can never disagree with the odds panel one press
away, and a fifth pool added in Admin gets a range without a code change.

The gate itself is the sigil's **own art**, lit and breathing, with the rings turning
around it. They used to turn around a radial gradient, which at any size reads as a
spinner that has stopped. Its glow, its rim and the rail's selected board all take the
pool's colour from one custom property.

**Mercy is on every gate.** The clock was filtered to epic and legendary — right for the
Radiant sigil, and it left the other three with no clock at all. The Faded pool tops out
at Rare, and rare mercy is exactly what somebody pulling on it is counting; the pool's own
best two are watched now (`clockRarities`).

**The summon buttons say what they cost.** They read "Summon ×1" with the price in a
sentence underneath, which is the wrong way round — the count is the obvious half and the
price is the decision. It is on the plate now, with the ×10's guarantee beside it.

**The reveal.** The room stays lit for the payoff: the tint went out the moment the gate
broke, so ten cards landed on a flat near-black void and the colour the whole wind-up had
been building to was spent on the wind-up. Champion **names wrap** rather than truncating
— the library clamps a card's name to one line with an ellipsis, which is right in a
roster, where the card is a way in to a sheet that says the name in full, and wrong here,
where the card is the whole answer and half a ×10 came back as "Sskarn Broodli…". And the
summary is the **news** rather than the receipt: what happened, at the size it happened,
with the counts underneath. A ×10 of brood-kin is still a ×10 of brood-kin — the headline
never claims otherwise.

The **Again** button is drawn only when it can be pressed. A permanently disabled "No
sigils left" reads as something broken; the sentence that replaces it says which of the
two reasons it is.

**The odds dialog stopped saying its own name twice** — "Faded Sigil — odds & mercy" over
a panel headed "Odds & Mercy", which is the fault C12c cleared out of four other screens
and this one had kept.

`ui/labels.ts` (was `statLabels.ts`) is where a rarity is named now, alongside the stats.
The Mistgate alone kept two private copies of that map; they agreed, which is the argument
rather than against it — hand-kept copies agreeing is luck, and a sixth rarity is what
would break it.

### Changed — the roster is the screen this genre actually uses (C19)

The owner's six, from a batch of Raid screenshots.

**The roster is three panes.** The roll down the left, the champion selected out of it
filling the rest — their idle loop and their facts in the middle, their relics, skills,
masteries and ladders to the right. **The first champion is selected when the screen
opens**, so the roster is a place a player *is* rather than a menu they click through: it
was a grid of cards that opened a full-screen dialog, which made looking at two champions
four presses and comparing them impossible. Sortable by rank, level, rarity, power or name
— and two of those were one: the old "Level" sort put star rank first, which is the
reference game's *By Rank* and not what anybody asking for level wants.

The rail draws the **same painted card** every picker in the game does, at 108px rather
than 150 — the library scales a card from one number, so a smaller card is the same card
and not a second, plainer component.

**The Arena is a list.** One opponent to a row, four columns that line up down the page, and
the width bought back spent on the things being compared: the rung 40→56px, the four faces
44→72px, the name and the stake half again as large. It was a grid of `minmax(21rem, 1fr)`
cards, which on a desktop is four across, and every part of the decision was drawn at the
size four columns leave.

**The vault is shelved by set** — sticky headers carrying the set's name, how much of it is
in hand, and *what it does*, which a relic card has never been able to say. Ordered by pile
size, so the set you are nearly finished with is at the top.

**The Mistspire and Trials have their own art.** The small dock glyphs were already
different (a falling tower against a maze); both screens carried `art: 'icon-rune-stone'`,
and the hub card's art is the thing anybody looks at. A rock spire and a rune arch now, and
Expeditions takes a compass rather than sharing the Arena's crown. The registry refuses two
places sharing a picture.

**Scrollbars are painted everywhere**, rather than the browser's own on every screen that
was not one of the three using the `pixel-scrollbar` mixin.

**The Chronicle's faces are one size and a readable one.** Its grid stretched its tiles to
about 300px around a fixed 56px portrait, so every champion was a small icon adrift in a
large box — and the handful with real art were all different sizes, because a still frame is
64px and an avatar is 320.

### Fixed — every champion grid in the game overlapped its own rows (C19)

Found while building the roster's rail, and it is everywhere: `ChampionCard` is a `<button>`
sized `width: var(--fui-champ-w); aspect-ratio: 3 / 4` with every part of its content
absolutely positioned, so its *in-flow* contribution is about a third of the height it
paints at. A grid stretches its items by default, the row track sized itself to that
contribution, and **each row covered the bottom ninety pixels of the one above it** — the
star rank, the champion's name and the power figure, on every row but the last.

Eight grids: the roster, the food picker, both team pickers, the Deep Run, Expeditions, the
profile showcase and the calendar. It survived because it needs *two rows* — a picker
showing four champions is one row and looks perfect.

### Changed — the title screen (C18)

The first thing anybody sees was a 420px form floating in a dark brown void: correct,
accessible, and unmistakably a web page. It is the shape this genre settled on for a reason
now — the owner's own painted key art across the whole window, the game's name over it at a
size that means something, and the form as a panel low in the composition. The art does the
work; the panel only has to be legible on top of it.

Three things went with it, and none of them are decoration on a game with **no e-mail
address**: the last account name is remembered (it is the only handle a returning player
has), the password can be **shown** (typing one blind with no reset link is a trap), and
**Caps Lock** says so. The build number is on the screen, which is where every game in this
genre puts it and what an operator asks for first.

### Added — `pnpm assets` resizes JPEGs (C18)

The backdrop is the owner's `haven_campaign.jpg`: **2752×1536 and 2.7 MB**, drawn behind a
vignette on a window no wider than 1920. C16 solved exactly this for the champion avatars and
could not help here — a JPEG is a quantised DCT bitstream rather than a filtered zlib one, and
nothing about the two formats is shared below the pixel buffer. Re-encoding to PNG is not the
way out either: these are painted scenes, thousands of distinct colours with no flat regions,
which is the case PNG is worst at — the same picture costs about three times as much as a PNG
at *half* the resolution.

So `tools/asset-sync/src/jpeg.ts` is a baseline JPEG codec, decode and encode, with **no
dependencies** — the same answer C16 found for PNG, and Node ships zlib for neither half of
this one. The three painted backdrops go from **8.4 MB to 764 KB**, and the Wardenmaster's
portrait — delivered at 2048² and drawn at 260px — from 578 KB to 68 KB.

Progressive, arithmetic-coded, 12-bit and CMYK files are refused **by name** rather than
mis-decoded, which is `png.ts`'s rule and the one that matters: a resizer that silently
produces a wrong picture is worse than one that stops.

### Fixed — the tutorial covered the one button it was asking for (C17)

The cold open is the only battle in Mistvale with no map behind it, so the empty battle
screen offers it: a title, a line, and **Meet them on the road**. That panel centred itself
in the screen — and for the whole of that step the Wardenmaster's card is fixed across the
bottom of the viewport, so the panel put its only button underneath him.

It was never a near miss. A click lands on an element's *centre*, so the button stayed
half-visible and completely unpressable, and the very first thing a new account is told to
do was the one thing the tutorial was covering.

The panel is anchored **high** now rather than centred — top-anchored rather than lifted by
some fraction of the viewport, because the card's height is content: an operator rewriting
the step's body in Admin makes it taller, and below 720px the portrait goes and it grows
again, so any number reserving room for it would be a guess about text somebody else owns.
Measured at six window sizes from 1920×1080 down to 430×932, the button is topmost at its
own centre in all of them.

With it, the same blank screen stopped drawing two states at once: an offer to start the
opening fight and a notice that no fight is running are different things, and stacking them
put "Back" — the way *out* of the tutorial — under the tutorial's own card as well.

`expectOnTop` takes a locator as well as a selector now, which is what the guard needed:
the thing most likely to be covered is a button, buttons are found by their name rather
than by a class, and a covered button otherwise announces itself as a thirty-second click
timeout with the offending element named only in the trace. It now fails in one sentence —
*covered by `<span class="_who_…">`* — at the line that cares.

### Changed — the champion avatars are a tenth of the download (C16, Q6)

The eight painted avatars are delivered at 1254×1254 and the game draws them at 150px on a
champion card and 44px on an arena portrait. Published byte-for-byte, they were **14 MB of
the 15 MB sprite tree** — on the 1-core target box, the largest single thing a player
downloads by an order of magnitude, and growing with every champion that gets a face.

They go out at **320px** now, twice the largest place any of them is drawn, and the tree is
**2.0 MB**. `assets/` keeps the masters exactly as delivered.

**The interesting part is that it needed nothing installed.** Q6 sat open for eight days
because the obvious fix was `sharp`, and a native module that has to build on the VPS is a
locked-stack decision rather than a tidy-up. The avatars are PNG, Node ships zlib, and a PNG
is a zlib stream with five per-row filters in front of it — `tools/asset-sync/src/png.ts`
decodes, area-averages and re-encodes one in about 130 ms, and the whole `pnpm assets` run
still finishes in 2.4 seconds.

Two encoder choices are measured rather than assumed, and the first cut guessed one of them
wrong: row filters are worth **17%** on a shrunk painting, not the "couple of percent" the
comment claimed — while trying all five per row and keeping the best, which is what a real
encoder does, buys a further **0.4 KB**. So every row is Paeth and none of them shop around.
Dropping the alpha channel on a fully opaque avatar is another 20 KB, checked per file
because the next avatar delivered may have a soft edge.

Downscaling is **alpha-weighted**, which is the defect that would otherwise have shipped:
averaging colour straight across a transparent edge drags the black stored in the invisible
pixels into the fringe, and a cut-out champion comes out with a dark outline.


### Changed — the player's card, rebuilt to the owner's reference (C15)

The owner's second reference (2026-08-27) is the panel this genre puts in the corner of its
main screen, and it moves three things Mistvale had arranged differently:

- **The level is a disc on the portrait's corner**, half on the art and half off, rather
  than a boxed tag tucked under the frame. Round, because a level is one figure and a disc
  stays balanced whether it holds 1 or 60 — the tag it replaces grew sideways with the
  number and pulled the corner out of true.
- **The experience readout is a percentage inside the bar.** C5 put the figures outside for
  a good reason and wrote it down: *"a readout drawn inside a 14px track is two figures
  nobody can read"*. Both halves of that change here — the track is 26px now, and `81%` is
  one short token rather than `124,491 / 124,491`. The exact figures moved to the tooltip,
  which is where a number you want occasionally belongs. It never rounds up to 100 short of
  the cap: a bar that reads finished when the level has not turned over is the one thing a
  progress readout must never do.
- **Power is a line of its own** — labelled, with the figure carrying the colour — instead
  of an icon and a number crowding the name.

The portrait is 88px rather than 64, the name is 26px rather than 20, and the bar is the
pack's own blue rather than the `xp` kind's magenta. That last one is a *theme* choice
rather than a component edit: the library builds its experience bar by hue-rotating the
stamina art 255°, and the kind stays `xp` because that is what the bar is — only the fill
art is Mistvale's, taken from the pack's own palette rather than invented.

**The profile card behind the chip got the same treatment**, and lost two duplications on
the way: it printed the warden's name four lines under the dialog title that already said
it, and printed the level in a facts row under a portrait that should have been wearing it.
The facts moved up into the identity row, which had a hand's width of nothing across the
middle of it.

`ui/LevelDisc` is the shared mark, because it belongs to two portraits in two folders and
two copies is how the two stop agreeing. Whether it is *announced* is the caller's business
and that turned out to matter: on the chip the level is already in the button's accessible
name, so a disc that also spoke would say it twice — and the first cut hid it on the card
as well, which took the level off that card for a screen reader entirely. A browser spec
caught it by asking the dialog for its level and finding none.


### Added — a swap says what it costs, not just what it changes (C14)

Selecting a candidate relic has always shown the real stat difference, server-computed, set
bonuses included in the arithmetic. What it never said is **why** the numbers moved — and
the reason is usually a set. Take the second Ironroot piece off and the champion loses a
bonus neither relic mentions; on the screen that read as `C.RATE −2`, which looks like a
rounding error and is actually a whole set bonus gone.

The preview names it now: **Breaks Hawkeye · C.RATE +12%**, in red, under the deltas it
explains — and *"Takes off Hawkeye · Weapon +16"*, because equipping is really swapping and
by the time a candidate is selected the worn piece is out of eye-line. Counted in **complete
copies** rather than pieces, which is the only honest way to describe a six-piece set going
from two copies to one: "you still have Truestrike" is true and useless.

Nothing new is fetched — `replaces` and both sides' `setBonuses` have been on the preview
response since P4 and no screen had ever drawn them. `ui/setChange` is the pure diff and has
six cases; the server test that had promised "set bonus included" in its title since P4 now
actually asserts it, on both sides of a swap that breaks a copy.


### Fixed — the frame scrolls, not the shell (C12c)

**Two game modes could not be clicked.** On the Battle hub at 1920×1080 the top bar scrolled
off the top of the window and the dock came to rest across the middle of the page, in front
of the Mistspire and Trials cards — which were then behind the navigation and unreachable.

The cause is one line that was never written: `main` is the frame every screen is drawn in,
and nothing said what should happen when a screen was taller than it. So the overflow went
to the *document*, and the document scrolls the whole shell. It survived C12 because it
needs a screen taller than the frame, and a hub is the first screen in the game that grows
freely with its content rather than managing its own scrolling. The frame owns the scroll
now, and `e2e/visible.spec.ts` fails against the old stylesheet by 628 pixels.

**The hubs fit and fill.** Battle holds eight cards, which at the default page ceiling is
three columns and three rows — the last one past the bottom of the frame. Hubs are wide now,
so eight is four columns and two rows on one screen. Cards in a row are one height rather
than ragged, the blurb clamp went from three lines to four because two of the registry's own
sentences did not fit in three, and a hub with fewer cards than the frame is tall centres
them instead of drawing one row against the top with six hundred pixels of nothing under it.

**A screen is titled what the card that opens it says.** Pressing **Roster** landed on a page
headed "Your Champions", and pressing **Quests** landed on one headed "Errands" — which is
also the name of the hub holding it. Both now agree with their card.

### Fixed — four screens said their own name twice (C12c)

The Bazaar, the Valewurm, the Wurm Wakes and the Sunken Stair each printed their name and
their tagline as the screen title, and again on the panel a hundred pixels below it — on the
Sunken Stair the identical sentence, word for word. B1's rule is that a screen is the
feature and not the feature and a column about it; this was the feature and a second copy of
its own heading.

Three of them are structurally a **list** whose title is the registry's label, which today is
the name of the only entry published — so the card names itself only when there is more than
one to tell apart, and a second Titan or a second descent makes the names load-bearing again
without anything being re-cut. The Bazaar has exactly one shop, so its title reads the shop's
own name and description straight from content, the way the Mistspire's does: an operator who
renames it has renamed the screen, in one place.

The Bazaar's stalls also **sit in the middle of the room rather than against the top of it**.
Four offers were a 240px row at the top of a 1080px window with six hundred pixels of nothing
under it. The first attempt grew the rows to fill that space and all it did was move the
emptiness *inside* the cards — a relic preview with a hundred and fifty pixels of bare panel
under it looks worse than a short card with room around it. A shop with four things in it is
a shop with four things in it; what it should not look like is a page that forgot to finish.

### Fixed — the Haven is a place again (C12c)

**Pressing Haven showed you the navigation you had just pressed.** The camp's rail was
`DOCK_SCREENS` minus the Haven itself — which was the whole game while the dock held
nineteen destinations, and became the dock's own six the moment C12 made them hubs. Nothing
said so, because the filter stayed correct and only its input moved underneath it.

The two are different views on purpose now: **the dock is the index and the Haven is the
place**. `PLACES` is the registry's own answer to "somewhere a player goes" — a hub's
member, or a dock entry that is not a hub — so the camp is one press from any of the
eighteen destinations while the dock stays six wide. A unit test refuses a camp that offers
nothing the dock does not.

With it, two things the restored rail turned up:

- **A shrouded card says why as well as when.** A locked place traded its sentence for
  "Opens at level 16", which says when and never why — and why is the whole reason a
  shrouded card is still on the screen. It keeps both now.
- **The drag hint landed on the dock.** `ui/Rail` hung it at `bottom: -1.4rem`, outside its
  own box, which is fine while something sits below and wrong when the rail is the last
  thing in a full-height column. The room is reserved inside the rail now, and only when
  there is a hint to put in it.

### Fixed — a card announces its name before its badge (C12c)

A hub card rendered its "n waiting" pip before its body, so the one card that always has a
claim on it announced itself as *"2 waiting Calendar A reward for every day…"*. The pip is
absolutely positioned, so moving it after the body changes nothing on screen and puts the
place's name back at the front of what a screen reader says.

### Fixed — a test name that was not unique (C12c)

`unique('Lanternbearer')` appended a timestamp and let the field truncate whatever hung
over. A profile name is capped at 16 characters, so thirteen of those were the readable
prefix and three were the slowest-moving digits of the timestamp — two runs a few minutes
apart produced the same name, and the world-boss spec failed as *"that profile name is
already taken"* thirty seconds in. The entropy is what survives now and the prefix is what
gets trimmed. Thirteen specs had their own copy of the helper; they share the one in
`support.ts`.

### Fixed — the browser suite runs again (C12c)

C12a replaced the Haven's twelve per-mode station boards with the six hubs, and about thirty
call sites across twenty specs still pressed "Campaign", "Arena", "Calendar" as if they were
stations. The suite had been red from that commit onward and nothing said so, because
`pnpm verify` does not run Playwright — the gate that was green is not the gate that covers
navigation. Every one of them goes through `goToScreen` or `dockEntry` + `placeCard` now, so
a future rearrangement is one edit to `HUB_OF` rather than thirty.

### Changed — an enemy's star rating decides something (C13, Q8)

**⚠ Release step: run `SEED.sh --replace stage` (DEPLOYMENT_OPERATIONS §5).** This changes a
*nested* field — `stage.waves[].stars` — on 252 already-published campaign stages, and a plain
seed only ever adds. Without the replace the code ships and every live campaign stage keeps
the rating it was published with, which is the wrong one.

Every enemy line on every stage has carried a `stars` value since P2 — 3,452 of them across
409 stages. The seed authored it, publish validation accepted it, the Admin editor showed it,
and **the engine never read it**: `scaleEnemyStats` took a def and a level and computed from
`baseStats`, `growth` and `anchorLevel` alone. So an operator had one difficulty lever where
the editor promised two, and eighty-nine balance gates and 176 engine tests all passed over the
top of it. Raised as Q8 rather than fixed on the spot, because 90% of the corpus is authored
below ★6 and honouring the field would have made most of the game easier in one commit — a
balance decision about the whole game rather than a side effect of adding a tower.

It is honoured now, on **the same `champion.rankMultipliers` ladder a champion's rank climbs**,
so ★6 is 1.00 and an enemy's authored `baseStats` *are* its six-star stats. Only HP, ATK and
DEF move: **speed, crit and resistance are flat at every rung by design**, because speed decides
turn order before anything else resolves and every boss in the game is built on a turn count —
a hit shield's window, a mender's cooldown, the Titan's fifty-turn cap. A rating that also moved
speed would have retuned all of it at once.

**The campaign was on the wrong scale, and the sim is what said so.** It was the only content in
the game not authored on the ★1–6 ladder — 1/2/3 for Normal/Hard/Brutal, chosen while the field
was inert, where the Depths, the Spire, the Deep Run and the tutorial all already ran 3→6. Read
literally that meant *the whole campaign at 42–68% of what it was tuned to be*, and `brutal-wall`
failed exactly as it should have: 89.6% of teams fresh off Normal walked straight through Brutal
12-7. The scale moved to **4/5/6** and the shape did not — Brutal is the full-strength creature,
Hard and Normal are its lesser versions, which is what that seed's own comment has said since P2.
Brutal is byte-for-byte what it was; Normal and Hard are 0.79× and 0.90×. All 89 gates pass.

**An omitted rating now reads as ★6, not ★1.** The schema default was ★1, which cost nothing
while the field was inert and would now hand out a 58% nerf for leaving a box empty in Admin.
An unset rating has to mean "as authored".

The guard is `packages/engine/src/setup.test.ts`: ten cases that fail if the argument is ever
dropped again. Nothing existing would have caught it — the golden replays build their units
directly rather than through a stage's waves, which is why five goldens and 176 tests were
green over an inert field for eight phases.

### Changed — the shell, restructured (C12)

The owner's brief: *"make menus, frames and infos not so overwhelming — restructure the UI,
cleaner, modern, less overcrowded"*, with Raid's Game Modes screen as the reference, the
Expeditions screen as the example of wasted space, and **desktop-first while keeping the
gacha-RPG feel**.

**Nineteen dock entries became six.** Every fighting mode is behind **Battle**, every
champion screen behind **Champions**, every claimable list behind **Errands**; the Haven,
the Mistgate and the Bazaar stay one press away. A hub is one page of large painted cards —
art, a name, and the sentence saying what the place is *for*, which on a 20px dock glyph
lived only in a tooltip a phone could never open. One component serves all three, because a
hub is entirely a view of the registry: a screen names the hub it belongs to and that is the
only place the grouping is written, so adding a mode is still one registry entry.

The registry now refuses to let a screen be reachable twice or not at all — the first is a
destination a player must be told about twice, and the second is how `settings` sat
unreachable in the registry for nine phases.

**Screens are laid out for the display they are played on.** Mistvale is a desktop game
dressed like a phone game and it was *laid out* like one: a screen grew to the window and
then stopped filling, so a 1920px display drew three 270px cards against the left edge with
a third of the screen empty beside them. Content now has a ceiling and centres, and which
ceiling comes off the registry — `wide` for the vault and the roster, `full` for the vale
and the battlefield, which are pictures rather than columns.

**And ten card grids were quietly broken in the same way.** They were written
`repeat(auto-fill, minmax(19rem, 1fr))` — but `auto-fill` keeps the empty tracks a row could
hold, so the `1fr` written right beside it, the instruction to *stretch*, was shared out
among columns that do not exist. Three expedition cards in a wide window stayed at their
minimum with the leftover space parked in phantom tracks. `auto-fit` collapses them, and the
Expeditions cards went from 270px to 470px with no other change. A test reads the
stylesheets and refuses the pattern, and the four grids of *fixed-width* library cards use
fixed tracks now — stretching those would reintroduce the bug D9 spent four attempts on.

**The dock is sized for a desktop.** It was the library's phone defaults — a 20px glyph
under an 11px label, cut so nine fit across a handset — and Mistvale put nineteen through
it. With six there is room for a real target and a readable word: 30px glyphs, 0.95rem
labels, 60px rows, all behind a `min-width: 900px` so the landscape-phone PWA still gets the
pack's own numbers.

**Mobile still works, and two things stopping it were found by looking.** The owner asked
for desktop-first *while still supporting mobile*, so the restructure was driven at 430px as
well as 1920px — and at 430px a new account could not start the game. The starter dialog
carried `min-width: 26rem`, wider than the phone, so the modal overflowed and its confirm
button ended up **underneath a champion card**; five other dialogs had the same line. And the
top bar's nine controls took the *document* with them, which is the one thing a narrow window
must never do. Dialog widths are `min(Nrem, 100%)` now — a preference rather than a floor —
the top bar scrolls itself instead of the page, and the profile chip is a portrait alone
below 560px, where its name and experience bar were drawing on top of the currency rail.
Both patterns are guarded: a unit test refuses a dialog floor wider than a phone, and the
browser suite measures horizontal overflow on every hub at three widths.

### Fixed

- A tutorial step pointing at `dock:depths` follows the screen into the hub that now holds
  it, rather than the script being re-cut — so the same key keeps meaning "the way to the
  Depths" however the navigation is arranged later.
- The Haven stopped telling players to *"drag the camp sideways to see every place in the
  vale"* under a row with nothing off the edge of it. `ui/Rail` owns the hint now and shows
  it only when the track overflows, because an instruction that is false is worse than none.
- `App` picks its screen from a lookup rather than a chain of twenty ternaries — the thing
  the "adding content stays cheap" rule was written against, and how an unbranched screen
  silently showed the placeholder.

### Added — the Mistspire (C11)

Thirty floors, and the first thing in Mistvale that pays for a **broad** roster rather than
a deep one. Every other mode is won by one good team — the campaign is, the Arena is, a
Depths keep is one good team per element — so the honest answer to "is this thirty-eighth
champion worth keeping" has been *no* for most of the roster.

A **warded floor** is the answer. Nine of the thirty name an element, a faction, a role or a
rarity floor, and the only team allowed up is four champions who meet it. One excellent
ember team reaches floor nine and stops; the Tide support nearly fed away last week is the
way past it. The ward is on the floor, on the team chooser, and enforced at the start of the
fight, and all three read the same sentence out of `teamRestrictionFailure`.

Two rules make it a tower rather than a long dungeon. **A key is spent on a clear, not on an
attempt** — the source game's Faction Wars rule rather than its tower's — so a warded floor
can be attacked all evening with a different four each time and cost nothing until it falls;
a floor that has to be solved should be free to fail at. And **the climb resets with the
month**: the anchor is the game-day's `YYYY-MM`, so there is no job and nothing to clear —
next month simply finds no row.

Publish validation gained the rule that could not have been reasoned out: a ward is checked
against the **whole roster**, and one fewer than four champions could satisfy is refused.
That is not hypothetical — Mistvale has 37 champions over eight factions and three of those
factions hold two or three, so a floor warded to the Drowned Choir would publish cleanly,
look right in the editor, and be unclearable by every account forever.

The tower is **measured, not guessed**. `pnpm sim` fights every warded floor with the best
four champions that ward allows, at the floor's own level, and gates that each one falls —
because "can a good team clear floor 27" is not the question; "can the four best hp-role
champions in the game clear floor 27" is. It also gates that the tower climbs: 36 turns near
the top against 5 near the bottom. Two content faults came out of those measurements — the
keepers were ordered weakest-at-the-top, and a lone boss is one target focused fire deletes,
so floor 30 fell in four turns. Keepers climb by weight now and bring escorts, as the
Depths' deepest floors do.

### Fixed

- **Six defects a browser found and 1,665 tests did not**, all in the Mistspire's own client
  half: pressing **Climb** jumped straight to an empty battle screen reading "No battle in
  progress" (`enterFrom` *navigates*, and `setScreen` already records where it came from, so
  the call was both unnecessary and the bug); the one floor carrying a button opened thirty
  rows below the fold, because the tower is drawn top-floor-first and nothing scrolled to
  the climbable one; scrolling to it with `scrollIntoView` then took the **page** with it,
  since it bubbles to every scrollable ancestor; a failed read said "No tower is published.
  An operator adds one", which is a wrong diagnosis rather than a vague one; the team chooser
  told a player a floor was "paid for the damage you do" — the Titan's sentence on a stage
  scored by clearing; and a ward read "Only **Hp** champions may climb" where the roster
  screen two clicks away has always said "Health".
- Role names moved into shared (`ROLE_NAMES`, `ELEMENT_NAMES`, `RARITY_NAMES`) so the ward's
  sentence, the roster's filter and the champion card's tooltip are one table. That also
  fixed a pre-existing one: **every champion card in the game** showed "Role: Hp" on hover.
- `/battles/multi` refuses a Mistspire floor, which is stated once in `multiBattleRefusal`
  beside the Titan and the world boss.
- The Depths hub excludes the tower. Thirty floors and a boss at the bottom is exactly what
  a keep looks like, so the hub would have offered a descent the spire's own key and
  floor-order rules refuse.

### Added — The Sunken Stair: a descent your relics do not come on

Last of the seven. Every other mode in Mistvale measures what an account has assembled; this
one takes the assembly away. Four champions go twelve floors down at their own levels and
ranks with **no relics**, and the build that gets them deep is put together inside the run
out of whatever the Stair offers — one boon after each room, chosen from three.

Two rules do the work, and both are about cost rather than difficulty:

- **Damage carries between floors.** A fight won badly is still a wound, which is what makes
  a quiet landing worth as much as a reliquary, and what makes attrition rather than any one
  room the thing that ends a descent.
- **A champion who falls stays fallen** for the rest of the run. Nothing is lost outside it —
  your roster is untouched — but the party thins, and the last floors are fought with
  whatever is still standing.

A third is why it needed no engine work at all: a boon is a bag of stat bonuses and **mastery
effects**, the same vocabulary the mastery trees already speak. Anything a mastery can do, a
boon can do. Seventeen ship, from a flat +2,500 health to *The Stair Remembers* — twenty per
cent off everything that hits you and twenty per cent onto everything you throw.

- **Offers cannot be re-rolled.** Doors and boons are drawn from the run's own seed with a
  nonce that moves only when something is *taken*, so refusing an offer and asking again
  returns the same three.
- **A descent pays for the depth it reached**, once, however it ended — so walking out on
  floor nine is worth exactly what dying on floor nine is worth, and there is never a reason
  to throw a party away rather than retire it.
- **A run survives a reload.** Everything a descent is made of lives on one row, because it
  spans battles and somebody who closes the tab on floor 7 has to find floor 7.

`deepRun` is a twenty-sixth content type: the Sunken Stair ships with eleven rooms across
three depth bands, seventeen boons and a four-rung depth ladder, all of it an Admin edit.

### Added — The Wurm Wakes: one health bar, the whole Vale

Fifth of the seven, and the first thing in Mistvale that two accounts can touch at once.

It is the **same creature** as the Solo Titan. All week the Valewurm is a wall you go down to
alone to find out how far you get. At the weekend it comes up, and the question becomes how
far *we* get: one health pool shared by everybody on the server, everyone's damage on the
same bar, and whatever you take off stays off. What you manage on Friday is still gone when
somebody else arrives on Sunday — nobody has to be online at the same time as anybody.

- **The contribution ladder is counted across the whole wake**, not per strike, and each
  rung is collected once. That is the reliable payout, and what it rewards is turning up.
- **If the Vale gets through the bar, everybody who struck it takes the same chest** — the
  last blow and one Friday strike are worth exactly the same. Anything scaled would turn
  "did we get it?" back into "did I do enough?", which every other mode already asks. It is a
  bonus rather than the point, so a quiet week is still worth turning up to.
- **Overkill stays on the striker's total.** Capping it would dock precisely the run that did
  the most for everybody.
- **Three strikes a day**, spent when the fight opens. The resource the mode limits is
  attempts: a shared bar farmable with a big enough energy bar would make felling it a
  question of who had the most energy.
- **Your battle is not the kill.** A strike is fifty turns against something authored to
  outlast anybody, so it is still standing in your fight at the end. What falls is the shared
  bar, and the screen says so.

There is **no guild, no chat, no raid group and nothing to schedule** — the only social act
is turning up, and the only evidence anybody else exists is the bar moving while you were
away and ten names on a board. And **no bots strike it**: a fabricated line would be a lie
about who was here. If the Vale is too small to fell it, it is not felled, and the ladder does
not care; the pool is content an operator raises as the population grows.

There is no cron either. The wake is derived from the clock by the scheduler timed events
already used, and the shared row is created by whoever gets there first — so a server down
all weekend comes back correct, and last week's contribution stops counting the moment the
anchor moves.

### Fixed — a Titan could be farmed through multi-battle

`/battles/multi` refused practice runs and the cold open and had never been told about the
Titan, whose keys are only spent when a fight *opens* — so a batch ran Titan stages without
touching the allowance at all, at zero energy, reporting a won battle to the goal engine every
time. Which modes may not be batched is now stated once, in `multiBattleRefusal`, and read by
both the server and the team picker, so the button a player does not see and the request the
server refuses are the same rule.

### Added — Trials: the same fight for everybody

Fourth of the seven, and the only mode in Mistvale where **what you own does not matter**.

A trial hands you four champions you do not have, at a level you may not have reached, in
relics you did not roll, against a fixed enemy — and the same dice. The battle seed is the
stage's own key, so every attempt by every account opens the identical fight. What separates
a good attempt from a bad one is the play: which skill, on which target, on which turn.

- **Par, not a clear.** Clearing a trial is the easy half. Every trial carries a turn count
  to beat, and beating it pays **once** — the first attempt that comes in at or under it.
  A re-run that also lands inside par pays nothing, because the puzzle was already solved.
- **Nothing is spent.** No energy, no keys, no attempt limit. A trial cannot be farmed —
  multi-battle refuses it outright — and it cannot be lost, only not yet solved.
- **Four puzzles, four lessons**, each built on a boss mechanic the engine has had since P6
  and the game had never made anybody use. *The Warded Coil* counts blows rather than damage,
  and leaves a window when it is broken. *The Mending Fen* hands back everything you spend
  anywhere but on the mender. *The Brood Crown* calls two more every turn and will always
  out-call you. *The Standing Stone* answers every wound it feels, and a poison is not a
  wound.
- **The pars are measured rather than guessed.** `pnpm sim` fights every trial twice — once
  on the engine's own auto-battle, once on the line the puzzle is authored around — and
  gates both halves: the line comes in inside par, and Auto does not. Two further puzzles
  were designed, measured and cut for failing the second gate.

A trial is an ordinary stage of a new `trial` mode, so playback, Auto, the speed ladder and
a reload mid-fight all work with no second implementation of any of them, and a fifth trial
is an Admin edit rather than a release. Trials open at account level 9 — deliberately early,
since it is the one mode a small account can do *well*.

### Added — Expeditions: work that is not a fight

Third of the seven. Every other system in Mistvale asks about four champions; this is the
one that asks about the fifth and sixth.

Send a party somewhere for four, eight or twelve hours and they bring back silver, dust,
essence and brews. **They are unavailable while they are gone** — that is not a side effect,
it is the feature. A party that leaves cannot be sent into a battle, set as an arena
defence, fed away as food or released, so sending two costs you two you cannot field, and
owning eight good champions becomes better than owning four.

- **Away means unavailable, not untouchable.** An away champion can still be levelled,
  ranked, ascended and re-geared. They are working, not gone, and blocking investment would
  be friction with no design behind it.
- **Favours make it a puzzle rather than a timer.** Each expedition asks for a faction, a
  breath, a role or a rarity, and every one the party meets raises the whole yield. The
  party that meets the most is rarely the party you would field — the Long Survey asks for
  all four breaths at once, which only a broad roster can staff.
- **The reward is deterministic**, and fixed at dispatch rather than computed at claim: a
  timer whose payout is a dice roll is a timer nobody can price, and the favours a party met
  were true when it left.
- **Recall brings them back early for nothing**, because a misclick should not cost twelve
  hours of a champion — but a *finished* run cannot be recalled, since that would throw away
  what it earned.

The picker prices the party as it is being chosen, running the same two pure functions the
server dispatches with. An away champion is drawn greyed with an "Away" tag rather than
hidden, because a picker that quietly omitted a champion would look like the roster had lost
one.

Three expeditions ship, `expedition` is a twenty-fifth content type, and every number —
hours, party size, rewards, favours, how many may run at once — is editable in Admin.

### Added — Imprint and Standing: what a collection is worth

Two of the seven, and one pass because both answer the same question — what does a
*collection* do for the four champions you field?

**Imprint** answers the worst moment in a gacha game: pulling a Legendary you already own.
Mistvale's only use for a duplicate was rank-up food, which makes the best pull in the game
arrive as a consumable. A second copy now also leaves a permanent mark on every copy of that
champion — up to +21% HP, ATK and DEF at the fifth mark.

- **Copies are counted as they arrive, never as they are held.** Feeding the duplicate away
  is the correct play — it is how a champion ranks up — and a mechanic that undid the imprint
  for doing the correct thing would be a trap rather than a decision.
- **Every ladder starts at the second copy.** The first is the champion; the second is the
  first mark.
- Thresholds are rarity-scaled and the bonus curve is shared, because "a second copy" is an
  afternoon for an Uncommon and a month for a Legendary.

**Standing** answers the other one: thirty-seven champions and a game that only ever asks
about four. Holding a broad collection pays a little to everything, so the Chronicle's grey
tiles are a target rather than a shelf — +1% at five champions up to +8% at all thirty-seven.
It counts what an account **holds**, not what it has seen, which is what keeps "is this
Bracken Puck worth more as food" a real decision. Food is excluded from both sides.

Both are percentages of a champion's **base** stats, added to the same block and resolved the
way relic percentages already are — so they never compound with each other or with a relic.
**Neither grants speed**, and the three-field shape enforces that rather than documenting it:
speed decides turn order before anything else in the engine, and an account-wide speed bonus
would silently retune every boss mechanic built around a turn count.

The champion sheet gains a **Collection** column beside base, relics and masteries — drawn
only when there is something in it — because this is the one contribution a player cannot see
by looking at the champion, and an unexplained number in a total is worse than no column.

`pnpm sim`'s maxed teams now carry the collection bonus, since a finished account has
duplicates of what it built and holds most of the roster. All 29 gates still pass, though the
Titan's ceiling tightened from 200k to 224k against its 250k top rung — the one to watch.

### Added — Reforge, and a use for the relics the vault makes you get rid of

First of the seven the owner picked on 2026-08-24. The vault fills with relics that are one
bad roll from good, and the only thing to do with them was press sell.

**Reforge rerolls one substat into a different one, keeping the rolls that went into it.**
A line deepened four times comes back as four fresh rolls of the new stat — the honest middle
between carrying the old *value* across (nonsense between stats of different scales) and
dropping to a single roll (a punishment for having invested). What is gambled is which stat,
and how well those rolls land.

- **It always comes back different.** The line's own form is excluded, so a player who paid
  to move off flat SPD is never handed flat SPD back. Flat DEF may become DEF%, which at
  Mistvale's numbers is a real change and not a technicality.
- **The pool is published before anything is spent** — every stat the line could turn into,
  with its per-roll range at that relic's rank. The Mistgate's odds rule, applied to relics.
- **The price climbs per relic, not per account**, and stops at six rerolls. Months of work
  on an old piece never price a player out of fixing a new drop.
- A stale screen is refused rather than charged: the request names the line it thought it
  was rerolling.

**It is paid for in Reliquary Dust, which only comes from dismantling relics.** No drop table
of its own — that is the design. The vault's ceiling already obliges a player to get rid of
relics, so this makes what they get rid of into the currency that fixes what they kept, and
reforging is self-limiting without a second faucet to balance. The selection bar shows both
prices side by side, because the decision is between them and nobody should have to press one
to find out what the other was worth. One ★6 legendary's worth of overflow buys one reroll of
the keeper — measured against the real curves rather than guessed, and pinned by a test.

Dust lives on the vault screen rather than in the currency rail: it is a material, and this is
the one screen that both earns it and spends it.

### Added — a roster you can search, and a Haven that says what is waiting

Two of the five things on the owner's list (2026-08-22), both about finding what you came for.

**The roster narrows.** Thirty-seven champions past a flat grid, and the two jobs the screen
has — find somebody to invest in, find food to feed them — are both searches. Name, faction,
element, rarity and role, plus the two that answer a question rather than describe a champion:
**Not at cap** (below their *rank's* ceiling, so a ★4 at 40 is finished until it ranks up —
the ones food would help) and **Wearing nothing** (the ones a loadout is for). Food hides
behind its own switch. The pickers offer only what the account holds, in the grid's own
rarity order — a dropdown that says Common first while the grid puts Legendary first is two
answers to one question — and the count says "9 of 37" so a filter can never be mistaken for
an empty roster. A champion whose definition has gone stale is kept in the grid — it is a
copy the player owns — but cannot satisfy a filter about its definition.

**The Haven says what is waiting.** A warden coming back after a day wants four or five
things answered before they decide anything, and every one of them was already computed
somewhere the Haven could not see it: the day's gift, errands and Path steps and event rungs
to claim, arena tokens, unspent Titan keys, which spring is open, farm runs left. It rides on
the snapshot the shell already re-fetches, so the card costs no round trips and cannot
disagree with the pip on the tile it points at.

- **A row appears only when it is actionable.** A card that says "0 quests, 0 keys, 0 runs"
  every morning is one a player stops reading by the second week. With nothing waiting the
  card is not drawn at all — and "actionable" means the *unlock*, not the number: the farm
  allowance is counted from the day an account registers, so reading it without the unlock
  offered a brand-new warden thirty runs of a feature five levels away.
- **Collecting comes before spending**, because collecting is free and instant.
- **A full token bar is marked urgent** — it is the one thing on the card that gets *worse*
  while it is ignored, having stopped regenerating.
- A new account has every spring open at once, so during the grace period the row says the
  grace is running rather than reciting five names. The **server** says whether one is —
  a client counting "every spring I know of is open" would promise a deadline forever to an
  operator who simply authored them open every day.

### Added — relic loadouts, and acting on a filter instead of a click per relic

Moving a build was nine unequips, nine equips and nine things to remember — the small change
felt most often. A **loadout** is a named list of relic ids on the account, saved from
whoever is wearing them and applied to anybody:

- **It belongs to the account, not to a champion.** That is the shape that serves both of
  the things players want: one good set moved between champions as content demands, and two
  builds for one champion.
- **Each row says what applying it would do before it is pressed** — how many go on, how
  many come off, and what is skipped. The preview is `planLoadout`, the same pure function
  the server applies with, so it cannot promise something the server will refuse.
- **A sold relic is skipped, not fatal.** A loadout naming a piece fed away is the ordinary
  state of the world months after saving it; refusing the whole apply would make loadouts
  rot. So is an accessory the champion has not ascended to, which says which ascension it
  wants.
- **A full vault refuses before anything moves**, on the *net* change — a set arriving from
  another champion costs no room at all, and one arriving from the vault frees some.
- Saving over a name replaces it. "Save my gear as Speed set" said twice in a week means
  the second one.

And the vault can act on a **filter** rather than on a click per relic. Rarity, set and
"unforged only" narrow the grid; **Select these N** takes exactly what is on screen; and a
selection can now be **forged to a level in one run** — the same cost curve, the same chance
per level, the same substat roll every four levels, run per relic, stopping cleanly when the
silver runs out and saying so. Equipped relics are welcome in a forge run and refused in a
sell, because a worn piece is exactly the one worth forging.

Two goal types the fan-out already had do the reporting: applying a set reports each piece as
a `gearEquip`, so a daily asking for one is satisfied by doing it the fast way.

### Added — the Valewurm, a fight nobody wins

Every other mode in Mistvale asks *can you beat this*. The Valewurm asks **how far can you
get**, which is a different question and the one the loop was missing: a wall that does not
move, a team that does, and a number afterwards that says whether the last thing you changed
helped. It is the source game's Clan Boss with the clan taken out — the puzzle never needed
a guild, only an opponent nobody clears.

- **A run ends on the turn cap**, not on a victory. Fifty turns for the Valewurm, with an
  enrage from turn thirty that makes the back half the dangerous half.
- **Paid on damage, on any ending.** Victory, defeat, the cap and a retreat all score at the
  highest rung the run reached. A retreat is scored rather than voided because damage only
  accumulates — stopping early can only lower the number, so a mis-click does not cost a
  whole attempt.
- **Keys, not energy.** Two a day, spent when the fight opens and never refunded, and no
  multi-battle. The resource the mode limits is *attempts*, which is what stops a fixed wall
  being brute-forced with a big enough energy bar.
- **The mechanics are the puzzle.** The hit-counter shield wants five hits between its turns
  — reachable with a multi-hit attack on the team, out of reach with four big single ones —
  and turn-meter manipulation is deliberately left open. Both are stated on the boss card
  before the key is spent.

The screen is the record and the ladder: your best run, what the last key did beside it, every
rung with what it pays and which you have reached, and what it does about being fought. A
run's result reads *Measured* rather than *Defeat*, because calling a good run a loss is the
screen arguing with the mode.

**The ladder is measured rather than guessed.** `pnpm sim` fights the Valewurm with a fresh,
a middling and a fully-built team and gates four things about the spread: nobody kills it, a
fresh account clears the bottom rung, a built one is an order of magnitude past that, and the
top rung is still above what a built team typically manages — so there is something left to
chase. Two goal types (`titanRun`, `titanDamage`) come with it, so a quest or a mission can
ask for a run or for a damage figure.

A Titan is a `dungeon` of kind `titan` carrying a `titan` block — the cap, the keys and the
ladder — plus one `titan`-mode stage. A second one is an Admin edit, not a release.

### Fixed — three boss mechanics that content carried and no screen said

`BossCard` was written in D8 to turn a boss's flags into the sentences that change what a
player does, and it stated two of the five. The hit-counter shield, the threshold retaliation
and the add-summoning had been in content since P6 and appeared nowhere — so a keep that is
meant to be a puzzle was still a wall you lost to before guessing. All five are stated now,
and a test counts them, so a sixth mechanic added to the schema fails the build rather than
being silently left off the card.

### Added — a fight that moves

Battles were static: bodies idled, numbers changed, and nothing in between said a blow had
been struck or landed (owner, 2026-08-23). The event log already carried everything needed —
who swung, at whom, how hard, what element, what was shrugged off — and none of it reached
the screen.

It does now, as a layer of motion derived from the same events the numbers come from:

- **A swing leans.** An attacker steps a third of the way toward whoever it is hitting and
  springs back — a swing, not a charge, because a body that crosses the field fights the
  formation the screen spends the rest of its time teaching.
- **A landing shakes and flashes.** The body that took the blow jitters where it stands and
  takes a brief colour flash, sharper and longer for a crit, and a flash with no shake at all
  for a glancing hit — that absence *is* the information. The flash is capped short of the
  whole way: a body mixed fully into white is a silhouette, not a champion being hit.
- **A ring opens where it arrived**, at chest height rather than at the feet, in the
  element's own colour — pale gold for a crit, grey for a glance, green for a heal, blue for
  a ward, red for a death. A cast blooms *inward* instead, so a wind-up reads as gathering
  rather than as another blow landing.
- **A shrugged-off debuff sidesteps.** Attacks in Mistvale never miss — ACC and RES gate
  statuses, not damage — so a resist is the one defensive beat the engine's events can
  honestly describe, and it steps the defender away from whoever threw it.
- **A death slumps.** The body leans and sinks over about half a second instead of switching
  to its dimmed state between one frame and the next.

All of it is decided once, in `game/playback`, and drawn twice: the painted battlefield
composes it in Pixi, the simple one in CSS, and both read the same `PlaybackView`. Nothing
about it is a second source of truth — an effect is a consequence of an event the server
sent, it never changes an outcome, and Skip clears the lot rather than replaying it.

### Changed — the vale is the screen, not a window on it

The campaign map arrived in its own box: a border down every side and a second scene inside
it, lit brighter than the game around it, so the road read as a separate window floating on
the game rather than as part of it (owner, 2026-08-22). And its markers were the library's
phone-sized defaults on a desktop window — a 30px disc under an 11px name, which is the same
fault C5 found on the top bar.

The frame is gone, the ground is gone, and the vale's art stays only as far as it can fade
out before the pane's edge — the first cut left a faint vertical line down both sides, which
is what a mask wider than its box always leaves. Markers are 52px (68px for a warlord) with
16px names, the road under them is drawn heavier now that it competes with the game's own
backdrop, and the chapters step down the pane rather than crowding the region title.

All of it lives in the campaign screen's own stylesheet, scoped inside the map's pane:
`WorldMap.css` is vendored and the next `pnpm fui:vendor` would overwrite an edit to it.

### Changed — the speed ladder is ×1 · ×2 · ×4, and you can see the rung you have not earned

The ladder stops at ×4. It was cut twice on the way — ×8 to ×6 and then ×6 away entirely —
because each top rung in turn was judged too fast to watch. ×4 opens on finishing the
campaign on Normal, the condition it has had throughout.

**Finishing Brutal now opens no speed.** The rung it used to open is gone and ×4's condition
did not move, which is what "same unlock criteria" means when the ladder loses a rung. It is
one value in `battle.speedUnlocks` if Brutal should take ×4 instead.

**And the locked rung is visible now**, which it was not: the library's control draws speed
as one button that steps to the next *unlocked* multiplier, so a rung an account had not
earned was not merely unpressable but invisible — the earned speeds existed with nothing in
the game to say so. `ui/SpeedLadder` draws all three, strikes through the one not yet earned
and says which campaign opens it. An unlock nobody can see is a feature that does not exist.

It is Mistvale's control rather than the library's for the reason that decides every one of
these calls: the state is React's and the library's component cannot express it. Only its
speed button is hidden — the row it sits in is one painted piece of art and forking it to
drop a button would fork the art too.

**`battle.speedUnlocks` changed value**, so a box that already has it needs the new pairing:
edit the one key in Game config, or `SEED.sh --replace gameConfig` where nothing else has
been tuned. A plain seed will not touch a key that is already published.


### Changed — the first walk down a road is one you watch

**Skip is offered only on a stage this account has already beaten** (owner, 2026-08-22).
It is decided when the fight opens and carried on the battle, which is the part that had to
be got right: by the time a fight's last turn resolves the clear has already been recorded,
so an answer worked out at the end would say every first attempt was skippable the moment
it was over. The Arena is exempt — its "stage key" is an opponent rather than a place, so no
arena fight is ever a repeat and gating it would mean never skipping one at all. The cold
open is not exempt, and since it records no clear it is the one fight in the game that can
never earn its way past the rule — deliberately, because the tutorial's own *Skip tutorial*
is the way past the tutorial and it takes the opening fight with it.

**Playback runs ×1 to ×4 now.** ×1 and ×2 are there from the first fight, ×3 opens on
finishing the campaign on Normal and ×4 on finishing it on Brutal — every stage of that
difficulty cleared at least once, checked against published content rather than a stored
counter, so a republished chapter cannot leave a stale flag behind. The pairing is
`battle.speedUnlocks` in Game config, and a speed it does not name is open to everybody,
which is how the two starting rungs are expressed without a special case.

Both gates are the server's word and the client obeys them; neither is refused at the
mutation. Nothing about skipping or speed touches an outcome, a roll or a timer — the
engine resolves the same fight either way, and a multiplier only divides the delay between
events that were already decided — so there is nothing for a refusal to protect, and
refusing the unbounded auto that Skip sends would also block the legitimate "resolve this
in one answer" that farming tools and the suite rely on. Anyone who defeats either check
watches less animation and gains nothing.


### Changed — a champion's rarity decides which ladders it has

Champion progression is the source game's now, with one deliberate difference: **the star
track belongs to the rarity, not to the champion** (owner, 2026-08-22). A Common keeps the
star it was called at — one or two — and can never move; an Uncommon is called at ★2 or ★3
and climbs to ★5; a Rare is called at ★3 and climbs to ★5; an Epic at ★4 and a Legendary at
★5, both to ★6, which is the ceiling in the game. Rare and above ascend and awaken; nothing
below them does. Every champion now enters play at its rarity's called rank rather than at
★1, and `0027_awakening` moved the ones already in players' hands up to theirs.

**The level cap follows the star**: ★1 and ★2 stop at 20, ★3 at 30, ★4 at 40, ★5 at 50 and
★6 at 60, and 60 is the end of the road for anybody. **A rank-up resets the champion to
level 1** against its new cap, and every ladder above level requires the champion to be
standing at its current cap first — a star is a commitment rather than an upgrade.

Where the ceilings live matters: `RANK_RANGE_BY_RARITY` is a *rule* in shared code rather
than a tunable, so a Common cannot be authored into a six-star. What is content is where a
champion is **called** — `champion.baseRank`, defaulting to the bottom of its rarity's band,
so a Rare is ★3 and a Legendary ★5 without anybody typing it.

### Added — Mistbrew, and the fourth ladder

**Mistbrew** is the one experience consumable — not one per element, because the source
game's four-way split turns levelling into inventory sorting and adds nothing to the
decision. It is worth 1,500 champion XP, falls off campaign stages and sells at the Bazaar,
and it is poured on the same dialog that chooses food, because "a few brews and one
broodling" is one decision rather than two errands.

**Awakening** is the fourth ladder and the last thing left to do to a champion: six levels,
Rare and above, gated on the rarity's star ceiling, that rank's level cap and a full
ascension — in that order, so the sentence a player is shown is always the next thing they
can actually go and do. It is paid in **Waking Shards**, which fall in the back half of the
Depths and nowhere else. One material and one source is the simplification: the source game
funds awakening from a second summoning economy with its own currency and its own pity, and
Mistvale puts the depth in reaching the shard instead.

### Changed — the champion sheet says what each ladder wants

The three ladders that existed were three buttons whose real content lived in a native
`title`: what a rank-up cost, why an ascension was greyed out and how far either could go
were all a hover away on a mouse and unreachable on a phone. They are four rows now, one
shape drawn four times — what it is and where it stands, its track, then the sentence and
the button. A ladder the rarity never had is drawn too, dashed and grey-tracked and with no
button at all, because there is nothing to press now or ever and "Commons keep the star they
were called at" is a rule better learned from the screen than from a refusal.

### Fixed — the champion sheet never read what you were holding

Every material cost on the sheet is priced against the inventory store, and nothing on the
way to the sheet ever filled it: the store was loaded by the relic screens alone. A player
who came straight from the Haven was told they were short the whole amount of everything —
ascension essences they had farmed, and brews they had won in the fight before. It has been
wrong since ascension costs shipped and only became visible when levelling started spending
items. The sheet loads what is held when it opens, the way the relic picker always has.

### Fixed — a broken roster took the whole frame down, not just the room

The screen-level boundary's own comment promises that a screen which throws "leaves the
dock and the top bar alive". C5 quietly broke that: it gave the top bar the account's
power — the four strongest champions added together — so the bar reads the same roster the
screens do, and the bar sits *outside* the boundary. One malformed roster response then
spread a non-array in the chip and took the frame down with the room, dock and all, which
is the exact failure the boundary exists to prevent.

The chrome has its own net now: quiet rather than a full-page alert, because a second
`role="alert"` in a 60px strip shouts over the real one the screen is already showing, and
reset by navigation rather than keyed to it, so walking to another room clears it without
rebuilding the bar every time a player changes screens.

`e2e/resilience.spec.ts` had been failing on this and is green again — the value of a test
that breaks the app from outside is that it does not care which commit caused the break.

### Operations — a release that changes nested content needs `--replace`

The seed adds missing entities and backfills missing **top-level** fields; it never reaches
inside one that is already published. So C6's brew and shard published cleanly as new items
and then dropped nowhere at all, because the drops that pay them live inside
`stage.rewards.drops`, `dungeon` floor loot and `shop.offers` — all of which already
existed. `SEED.sh --replace stage,dungeon,shop` is part of this release, and
DEPLOYMENT_OPERATIONS §5 now says so for the next one.


### Changed — the top bar is a place you are, and the face on it is yours

The bar was the library's defaults on a desktop window: 12px text, 17px coins, 30px
buttons and a 38px disc with an initial in it. That reads as a browser toolbar rather than
as the top of a game (the owner's note, 2026-08-21). Everything on it is bigger, and the
player chip is Mistvale's own now — the library keeps the ground, the currency rail and the
tool buttons, which is chrome it is good at, and the chip is ours because every part of it
is state React drives.

**The chip is a framed portrait with the level on its corner**, the name at a size worth
reading, what the account is worth, and the experience bar with both numbers beside it. The
same shape the owner's references use, in Mistvale's kit.

**And the portrait is a champion you own.** Choose it on your own profile card — one press,
because a face is a cosmetic choice with nothing to weigh — and it shows in the bar above
every screen and on the card other wardens see. Every champion is offered once however many
copies are held, the strongest of them drawn; food is refused, on the client for politeness
and on the server for real. "No portrait" sits beside the faces as the way back, because a
player who tried one and disliked it needs somewhere to press that is not another champion.

It is stored as a champion **key** rather than a roster id, which is the difference between
this and the showcase beside it. The showcase presents a particular copy at its level and
rank, so it names the instance; a face is a face. Feeding away one Anuria of three does not
blank your portrait, and a rank-up that mints a new row does not either.

**Power** is the four strongest champions added together — a team you could field rather
than a total that rewards hoarding — abbreviated to three significant figures, because the
number moves every time a relic is forged and nobody reads the tenth of a thousand.


### Changed — the campaign is three screens, and the last of them shows you what you are fighting

A map with a seven-disc strip bolted underneath gave the map 55% of a screen and the strip
no room to say anything at all. A disc holds a number and a padlock; every question a
player actually has before spending energy — what drops here, how many waves, what beat me
last time — had nowhere to go. The owner's call is the reference game's shape, and that is
what it is now:

- **The vale** is the whole screen. Twelve chapter markers, the road between them, and
  nothing else on it.
- **A chapter** is a page of its own, opened by its marker. The seven stages are rows, and
  a row says its stars, the relic set the chapter farms, the slots that stage drops, how
  many waves it is, what it costs, and the best turn count ever managed on it. Beside them
  the chapter's brief: where this is, who holds the last stage, and the star-chest track,
  counting every difficulty.
- **The team screen** now shows **the enemy line-up, wave by wave** — every unit, its
  level, its affinity, and on the hover its role and what a boss does about being fought.
  Content has named every enemy of every stage since P2 and the only screen that ever read
  them was the fight itself, by which point the energy is spent and the team is locked.

**Which chapter is open survives a fight.** It used to be local state, so every victory
dropped the player back on the world map, several clicks from the stage they had just
cleared and were about to run again — a tax on every lap of the loop the game is made of.

The tutorial's fourth step can finally point at stage 1-1: a stage row carries its own
highlight key, where a library-drawn disc never could.


### Changed — the Haven is a rail of painted places, not a grid of icons

Twelve 64px sockets in a wrapped grid is a toolbar: every place in the game the same
size as every other, none of them worth looking at, and the whole camp readable in one
glance that told you nothing. The owner's call is a row of tall boards you drag along
(2026-08-21), and that is what it is now — each with its own artwork, its name, and the
one line saying what a player goes there **for**, which used to live only on a hover and
so was unreachable on a phone.

The row runs off the side of the window on purpose. Dragging is the gesture: a finger on a
phone, a mouse anywhere, plus two arrows, the wheel and the arrow keys for a player who
never thinks to drag. **Touch is the browser's job and the mouse is ours** — the track is
an ordinary scroller, so a finger gets the platform's own inertia and snap rather than a
hand-rolled imitation that would have to fight it.

A shrouded place keeps its board and takes a seal, greyed art and the line saying when it
opens, because seeing what is coming is part of the pull forward.

The rail itself is `ui/Rail`, kept general: the next row that outgrows its window gets the
drag, the arrows, the wheel, the keys, the flick and the snap without writing any of them
again.


### Changed — the Chronicle is a faction index, and it hides nothing

Two hundred faces in one flat grid could not answer the question a collector actually
asks, which is "which of the Sacred Order am I still missing". It is a shelf per faction
now, in content's own order, each with its own `owned/total` — the shape the genre uses,
and the reference the owner pointed at.

The per-faction tally counts the whole faction rather than what the filter left showing.
"Vale Sentinels 1/6" has to mean the same thing whether or not "Still missing" is pressed;
filtering the tiles and filtering the tally are different questions and only one of them
was asked.

**Nothing is hidden any more** (the owner's call). A champion never encountered drew a
question mark and the word `???`, on the theory that a gap should be visible without
spoiling what fills it. In practice a wall of question marks is a wall of nothing: it
cannot be planned against, and the whole point of a collection tracker is to show what
exists. Every champion is drawn with their real face and real name; the ones you do not
hold are simply grey.

And the tile says more than a face and a name without becoming a card. The **rarity** is
its frame — it is what a summon is judged by, and it is now on every tile rather than only
the owned ones — and the **affinity** is a corner pip, because that is what a team is built
around. The rest is on the hover: role, faction, the champion's title, their lore, how many
copies are held and the best rank among them.

The grouping rules moved into `screens/Chronicle/shelves.ts` and are tested, because each
of them is a way the index could go quietly wrong and be believed.

### Changed — the tutorial says what to do

Fifteen steps of the Wardenmaster's voice with the actual instruction buried somewhere
inside it. The atmosphere was doing its job and nothing else was: "put it on somebody" does
not say which screen, and "take one piece to +1" does not say which button.

Every step is the same shape now — a line of the Wardenmaster, then a bolded **What to do:**
and a plain sentence naming the screen and the control. The voice is intact and shorter; the
steps, their order, what they point at, the goals that close them and everything they pay
are untouched. `tutorial.test.ts` holds the shape: every step has an instruction, it comes
last, and the voice before it stays inside four lines.

One instruction was corrected rather than reworded. The equip step points at the vault, and
a relic cannot be equipped from the vault — it goes on from the champion. The text says so
now. **The step itself still points at the vault**, since that was not mine to change; if
that highlight should move to the champion sheet, say so and it is one field in Admin.

### Added — `pnpm seed --replace <type>`, for content that is rewritten rather than added

A plain seed adds what is absent and changes nothing that is present, which is the right
default and means a *rewrite* can never reach an install that already has the rows — the
tutorial's script being exactly that case. The only way through was `--force-content`, which
delivers the change by discarding every other tuning an operator has done since launch.

`--replace tutorialStep` overwrites one named family and nothing else. It prints what it
overwrote and records a revision with the types in the note, so it is revertable from Admin
like any other publish.

It runs **after** the fill, not before, which is the whole of the bug that made the first
version silently do nothing: the fill plans against the snapshot read at the start of the
run and rebuilds each patched row as `{...missingFields, ...stored}` — so a replace that
ran first was undone by a backfill writing the pre-replace row back over it.

### Fixed — a tooltip inside a dialog was drawn behind the dialog

The shared tooltip sat at `z-index: 900` and `$z-modal` is 1000, so every painted tooltip
opened inside a dialog rendered *underneath* it. The three that worked were the three on
the shell — the currency cells and the hotbar. Every one added since would have been
invisible, which is most of them: the champion sheet, the relic slot, the food picker, the
team choosers. It is above the toasts as well now, on the same reasoning — a tooltip
belongs to the pointer, and nothing the pointer is on should be able to cover it.

### Added — the game explains itself on hover

`ui/Tooltip/tips.ts` is the wording, kept out of React the way the combat tips already are,
because these sentences are the game teaching its own rules and a sentence written inside a
component is a sentence nobody checks again. One builder per kind of thing, so a relic
answers the same question wherever it is hovered.

- **Relics** — which set, what the set does, and **how far off complete it is**. That last
  one is the question a player actually has while looking at a socket, and the only place
  it was answered was a panel two tabs away.
- **Rewards** — every chip in the game, which is the most repeated element there is:
  quests, missions, events, the calendar, mail, the shop, and the results screen the owner
  named. "1 Gleaming Sigil" is complete information to somebody who has played a week and
  nothing at all to somebody on their first evening, which is exactly who is reading it.
  Items carry their own published description and rarity.
- **Champions** — the two facts a 150px card has no room for and a player picking a team is
  asking: which affinity this one brings, and how much of its kit is actually on.
- **Stats** — four of the eight cannot be guessed. Speed decides how often a champion acts
  and is what most fights are settled by; accuracy and resistance are a pair and neither
  means anything alone; critical damage does nothing without a rate to trigger it. The row
  also breaks its total into base, relics and masteries.
- **Mastery nodes** — where the *refusal* goes. A node you cannot take yet had its reason
  in a native `title`: the browser's grey box, three seconds late, in the operating
  system's font. That sentence is the whole of what the player needs.
- **The Haven's stations** — what you go there *for*, which nine icons and nine words could
  never say. `ScreenDefinition.blurb` is where those live.

`Fui` and `FuiSlotted` take a `tip` now, so any library-painted component can carry one in
a line — which is what made the champion cards and the relic cards cheap.

### Changed — equipped relics carry their rarity

The champion sheet drew a painted icon, the slot's name and "+20 · +1" in the same grey for
a common relic and a legendary one — so the single fact that decides whether a piece is
worth forging was the one fact the sheet did not show. The library's socket does tint
itself, but as a four-pixel glow behind a 64px icon, which is legible on a bare square and
invisible in a row with a name beside it.

The cell carries it now: the border, a wash of the colour behind it, and **the set's name
in that colour** — because the set is what a player calls the piece and it is what the
colour is about. One `--mv-relic` per rarity drives all three.

### Changed — the Mistgate is worth going to, and the pull is worth watching

The gate was a 9rem circle above two buttons, and the reveal was ten cards turning over
on a timer. Both are the best moment the game has and neither looked like it.

**The gate.** The portal is 16rem with two counter-rotating rings, the rate-up champions
are faces rather than a line of names that asks a player to already know who those are,
and the epic and legendary mercy clocks run on the gate itself. A pity counter is
anticipation you can read, and it was behind a click.

**The pull** is six beats, and each one exists because the one before it earned it.

*Charge* — the gate winds up the instant the button is pressed, which is also what the
network round trip now happens under: the wait is the show rather than a disabled button
and a spinner.

*The climb* — the mist takes a colour, then a better one, then a better one. It climbs to
**rare on every pull however bad**, so the wind-up never leaks the answer early; a ladder
that stopped where the pull stopped would be a tell, and a player who has learned to read
it is watching a countdown to a disappointment they have already had. Above rare the climb
*is* the news, and a mist that does not stop at blue is the moment the whole system is
built around.

*The break* — a flash in the colour it reached, a shockwave, the gate collapses.

*The cards* — turned one at a time, **the best held to last**. Ten cards that end on a grey
one is a pull that felt worse than it was: the same ten champions, told backwards.

*The herald* — an epic or better gets the champion themself, full height and breathing, in
a wheel of light with their name under it, before their card lands. Once per pull, on the
best card, because four heralds in a ten-pull would be four interruptions and no drama.

*Again* — the one press a player wants at the end of a pull is the same press. It is on the
cinematic rather than three clicks behind it, still a real pull through the same endpoint
spending the same sigils, and it goes quiet rather than lying when there is nothing left.

Everything shown was decided by the server before the first frame; the only thing the
client chooses is the order (`screens/Mistgate/drama.ts`, whose two load-bearing claims —
"the best card is last" and "the wind-up never leaks a bad pull" — are tested). Skippable
from the first frame, and under reduced motion the whole wind-up is skipped rather than
played invisibly: the setting is now asked in JavaScript as well as honoured in CSS.

Four new sound cues come with it — `summon_charge`, `summon_tease`, `summon_burst`, and an
`summon_epic` of its own, because the moment a player learns to want is the one where a
purple turns gold and that is only legible if purple already sounded different. All four
are ordinary content: seeded with synth voices and retunable in Admin like every other cue.

### Changed — every champion picker draws the same card

Choosing who to send used to look nothing like choosing who to level. The campaign
stage dialog and the Arena's team picker drew a name and a line of text; the Depths
inherits the campaign's. Rarity, affinity, role and power — the four things the choice
actually turns on — were visible only on the Champions tab, so a player picking a team
was picking from a list of strings they had to remember the meaning of.

`ChampionCard` moved out of `screens/Champions` into `ui/` and is now what every picker
draws. Same frame, same stars, same affinity badge, same power, and the same selected
state, so a picker shows what is chosen without inventing a second visual language for
it.

Two more that a first pass missed. **The profile showcase** — where a warden picks the
four they want to be *known by* — was a list of names and star counts, which is the one
view in the game that has to show the champions and was showing none of them. It draws
the card now, with the pick's position on it, because the order is the whole point of that
picker. And **the day-30 calendar choice**, where "take the one your roster is missing" is
unanswerable from four strings: the painted card, carrying only what is true of a champion
nobody owns yet — who, how rare, what affinity — and no level, stars or power it would
have to invent.

### Changed — dialogs that do something get the room to do it

Every modal in the game was 480px wide on a 1920px screen, which put a nine-column
relic vault and a forty-champion roster inside a phone-width column with the rest of
the display empty around it. Modals name what they are now rather than a number:
`info` (560) for something to read, `work` (900) for something to do, `wide` (1240)
for choosing among many things, `full` (1480) for a sheet. Seventeen call sites say
which they are; informational dialogs deliberately did not grow, because a sentence
does not read better at 1240px.

They also cap at the viewport height and scroll their body rather than drawing their
footer off the bottom of a laptop screen — which is what the relic slot was doing.

### Fixed — the relic slot dialog is laid out, full or empty

At 1240 it puts the worn piece beside the vault instead of above it, so comparing a
candidate against what is on no longer means scrolling between them, and the vault
scrolls on its own while the worn piece and its two buttons stay put. The title says
which slot it is rather than interpolating the raw key in lower case.

The empty case was its own bug: with nothing worn the "worn" column was not rendered at
all, so the vault squeezed into the 20rem track and the dialog drew as a wide, short
letterbox with two sentences in it. The slot is always drawn now — its own glyph in an
empty socket when it is bare — and the vault's empty message fills the space it owns.

### Fixed — a fight the browser left no longer bricks the account

Closing or reloading the tab mid-battle made an account unplayable until an operator
reset it. The guard is right — one fight at a time — but nothing could clear the
fight: which screen you are on is a value in a store rather than a URL, so a reload
always lands on the Haven, and the battle screen is the only thing that asks to
resume. After a reload it never mounted, so nothing ever asked.

The shell asks once per sign-in now and takes the player back into the fight —
resuming rather than discarding, because the energy is spent and the board is stored.
A start refused with `ALREADY_EXISTS` also resumes and walks into the fight rather
than reporting a dead end.

### Fixed — the screen shows what changed, without a reload

Two reports, one defect in the React bridge and a family of call sites that never
pushed their changes through.

`liveCallbacks` wraps every function in a component's options so it calls whatever is
current rather than whatever it was built with — but the ref behind that was only
refreshed when a *shallow key* changed, and that key deliberately skips functions. A
render that changed only a closure never refreshed it. That is the feed bug exactly:
the Feed button's one other moving prop is `disabled`, which flips on the first pick,
so every later pick left the handler behind and pressing Feed spent whatever had been
chosen when the button stopped being disabled. Always exactly one champion.

With it, the call sites that never pushed a change: the top bar's level numeral (the
XP bar had one, the numeral beside it did not), the champion sheet's relic sockets,
and — for the whole of a fight — the party's health bars, the unit plates and the
hotbar's cooldowns. Three components the library gives no setters at all now rebuild
on exactly what moves: a forged relic's level, the set bonuses a relic completes, and
the collection tally a summon changes.

### Added — forge a relic without taking it off

The server never cared whether a relic was worn; the only Forge button in the game
lived in the vault, whose default filter excludes everything a champion is wearing.
Levelling the piece you actually use meant unequipping it, finding it among the loose
ones, forging it and putting it back. The slot's own panel offers it now, where the
player is already looking at the piece.

### Changed — the champion sheet has room in it, and the champion in it

736px for four ladders, nine relic sockets and a four-column stat table meant every
row wrapped and the sheet read as a stack of squeezed fragments. It is 1680 and two
columns now: the champion down the left — **their own idle animation**, at the size
the genre draws it, sticky so it does not scroll away from the work — and everything
you can do to them on the right. One column again under 900px, where the instructions
matter more than the illustration.

The left column carries the three ladders as well. Levelling, ranking and ascending are
what the sheet is *for* — everything on the right is inspection — and they used to sit
under the relic grid, which meant scrolling past nine sockets to reach "Feed for
experience". They stand under the champion they raise now, in the order a champion is
raised in, and the column is sticky, so they are in reach the whole way down. The
result line follows them, instead of appearing a relic grid away from the press that
earned it.

The width bought two more things. Set bonuses moved out of the Relics tab and up beside
the stat table: what a player's relics add up to is exactly as true while they are
reading skills, and a champion wearing nothing now gets told what a set *is* rather than
an empty panel. And each relic socket reads left to right — the socket, then what is in
it — because a column layout put a 64px icon at the top of a 400px cell and left the
rest blank.

`ui/ChampionIdle` is the third place in the game that plays an idle loop and the first
outside a fight. DOM rather than a third Pixi surface: a sheet is a modal over the
shell, and standing up a graphics context inside one costs a context the battlefield
may want back.

### Fixed — a release could add a content *field* and never deliver it

The Wardenmaster had no face and no voice on the owner's install, and the two music
tracks were fine. One cause: a plain seed adds missing **entities** and never touches
existing ones, so the two new music cues arrived (new entities) while `portrait` and
`sound` — new **fields** on the fifteen tutorial steps that were already there — stayed
empty forever.

It failed in complete silence, which is the part worth fixing. The schema defaults a
missing key to `''`, so every step parsed cleanly, the client asked for nothing, and
nothing anywhere said why. The seeder backfills now: for an entity that is already live,
any key the seed has and the stored row does not. Safe for the same reason the insert is
— a key that is *absent* has never been authored, because everything written through
Admin comes back with every key the schema knows. Top level only, so a `rewards: {}` an
operator deliberately emptied stays empty. The run log names the keys and the count, and
the revision records it as a modification rather than an addition.

`e2e/tutorial.spec.ts` now asserts at the network that the browser actually asks for
`tutorial_step_1.mp3` and gets audio rather than the SPA's HTML — the only place the whole
chain is visible at once, since an `Audio` element is never in the DOM to query.

### Added — a Voice fader, and a quieter opening

- **Voice** is its own slider in Settings. It rode the effects fader, which is wrong in
  both directions: turning the interface down should not silence the narrator, and turning
  the narrator up should not make every button click shout. It is also the control somebody
  reaches for the moment a narrator starts talking, and under "sound effects" it is the one
  they never find.
- **A new warden starts with music at 5%** and voice at 50%. A soundtrack that starts on
  its own at half volume is the fastest way to make somebody mute the tab; 5% is audible
  enough to be discovered and turned up. Existing accounts keep the levels they have.
- `UPDATE.sh` reports how much audio and how many portraits a release is carrying. Counted
  rather than required — a track still being mixed should not block a deploy — but said out
  loud, because the whole lesson of the empty battlefield is that a silent absence is the
  kind nobody finds.

### Added — the game has a soundtrack, and the Wardenmaster has a voice

The owner's audio pack: two music tracks and twelve of the tutorial's fifteen lines,
plus his portrait. All of it is content — `soundCue.sample` and `.loop` for the
music, `tutorialStep.portrait` and `.sound` for the tutorial — so swapping any of it
is an edit in Admin rather than a deploy.

- **Music follows the screen.** One theme everywhere that is not a fight, another in
  one, crossfaded rather than cut, looping, and dropped entirely when the fader
  reaches zero — a muted eight-megabyte track that keeps streaming is bandwidth and
  battery spent on silence.
- **The Wardenmaster speaks his line** while the step it belongs to is open, and
  stops mid-sentence the moment it closes. Three steps have no recording and are
  simply read, which is the design and not a gap.
- **And has a face** — a full-height panel attached to the left of the tutorial card, to
  the owner's own layout. It began as a 48px square in the header, which is a favicon;
  the point of putting a face on a tutorial is that somebody is talking to you. The card
  is two columns now, and Skip and Continue sit at opposite ends of the foot.
- Both obey the sliders that already existed: music on the music bus, the
  Wardenmaster on effects, since somebody who muted the soundtrack to play their own
  still wants to be told what to do. The Settings panel no longer says there is no
  soundtrack, because there is one.

`audio/tracks.ts` is where the split lives: `mixer.ts` renders cues from parameters,
this streams files. One is fired and forgotten a thousand times; the other is one
file at a time, replaced rather than layered.

### Changed — the tutorial stops dimming the game

It pointed by cutting a hole in a scrim, so everything except the target went dark.
That shows one small target well and lives badly on top of a game: the art the player
came for greys out with it, and a fight being narrated is watched through a filter.
The ring was doing the work anyway — it is heavier now so it wins on a lit screen —
and the four panes are gone. The overlay still never blocks input; the server is what
enforces order.

### Added — the tutorial card can be dragged out of the way

It points at things, so sooner or later it points at something underneath itself. The
title row is the handle, arrow keys nudge it (Shift for a bigger step), double-click
puts it back, and every move is clamped inside the window — a panel dragged off-screen
would have no scrollbar to bring it back. `ui/useDraggable.ts`, kept general: a battle
log or a comparison sheet will want the same thing.

### Changed — `pnpm assets` publishes finished media, not just sprites

Sprites are transformed on the way through — renumbered, counted into a manifest —
because the client builds their URLs from an index. Music, narration and portraits are
the opposite: content points at them by filename, so they are copied under their own
names into `public/audio/{music,tutorial}` and `public/portraits`. All three are
gitignored for the reason the sprites are, only more so: the two tracks alone are
16 MB, and a second copy in git would be 16 MB nobody can edit. A source folder that is
not there publishes nothing and says so.

### Added — a fight you can make decisions in

Everything here has been in the engine's contract since P3 and none of it had ever reached
the screen: `BattleAction.target`, every skill's `targeting` and `cooldown`, every status's
`kind` and `description`. A hotbar slot was an icon, a status was a four-pixel pip, and who a
skill landed on was the AI's business.

- **Skills say what they do.** Hovering a slot opens a painted tooltip with who it lands on
  (one enemy, all enemies, the lowest-health ally, three at random), what it costs in turns,
  when it comes back if it is cooling down, whether the target is the player's to choose, and
  the skill's own description.
- **Buffs and debuffs are chips.** Blue for a buff, red for a debuff, each carrying its turn
  count, each hoverable for what it actually does. They live in a DOM layer over the
  battlefield so both renderers get them and a keyboard can reach them.
- **The player picks the target.** Clicking an enemy chooses who this turn's skill lands on;
  clicking the same one again gives the choice back to the AI.
- **And the same click tells auto-battle where to concentrate.** The focus is a preference,
  not an order: the engine honours it when the skill leaves a choice and ignores it for
  everything else, so it can never make a heal hit an enemy or reach something already dead.

### Fixed — Auto could be switched on and never off

`auto: true` meant "resolve the whole fight", so by the time the button was pressed again the
battle was already decided on the server and only the playback was left — the control said
off and the fight carried on. The engine takes an `autoTurns` bound now, the button asks for
eight turns at a time, and the screen re-asks only while Auto is still engaged. Switch it off
and control comes back at the very next decision. Multi-battle and the Arena still resolve in
one call; they are not this button.

Both extremes of the re-asking are bugs, and the middle is the fix. Pace the requests to the
animation and Auto is exactly as slow as watching; let them run unbounded and the fight is
decided before the button can be pressed a second time, which is the original bug in a new
coat. So Auto asks for more only while the playback queue is short — forty events, a few
turns — which keeps the animation fed without ever getting far enough ahead to be
uncancellable. And **Skip now means the fight is over**: it is offered for the whole of an
auto-battle rather than only once the server has finished, and pressing it asks for whatever
is left of the battle in one call rather than jumping two seconds forward and leaving the
same button sitting there. Auto is the reversible one; Skip is the commitment.

### Fixed — the ground stopped in the middle of the screen

The scene *contains* its 960×540 design canvas rather than cropping it — the right call for a
composition with a side at each edge — which left the floor ending at the letterbox with
black either side. Scenery does not have to obey the composition: the ground bleeds past the
canvas in both renderers and reaches the edge of any window the fight is watched in.

Guarded in `e2e/visible.spec.ts`, in a deliberately wide window because at the suite's usual
1440×900 the field fits exactly and there is nothing to see. The painted floor is read as
pixels — the horizon step at the edge itself, since the field is lit with a lateral falloff
and an edge-against-centre comparison would fail on a fix that works — and the browser-drawn
one is measured as the element it is, because with the simple battlefield on there is no
battle scene behind it and the ambient mist would answer the question for it.

### Fixed — the empty battlefield was our own Content-Security-Policy

Five rounds, and the answer was in Mistvale's nginx config the whole time. Pixi builds its
shader programs with `new Function`; the site sends `script-src 'self'`, which refuses that.
`Application.init` rejected with *"Current environment does not allow unsafe-eval"*, every
scene was held pending forever, and the DOM half of the game carried on perfectly — a correct
fight, a correct HUD, and a black rectangle where the champions should be. It never once
reproduced in development because **the Vite dev server sends no CSP at all**, so the single
environment nobody could test was the only one where it happened. Nothing to do with the
owner's graphics card, browser or machine.

`pixi.js/unsafe-eval` — Pixi's own CSP-safe shader system — is imported by `game/stage.ts`,
the module that owns the only `Application` in the game, so it cannot be separated from the
thing it makes work. Adding `unsafe-eval` to the policy instead would have traded a real
security boundary for a one-line import; it was never on the table.

**`e2e/csp.spec.ts` is the test that would have caught it on day one.** It serves the real
production build over a throwaway static server with the policy read straight out of
`scripts/deploy-assets/nginx-mistvale.conf` — the file that is actually deployed, so the test
cannot drift from the header — and fights a stage under it. Removing the import turns it red.

### Fixed — enemies were turned to face away from the fight

The rule was "mirror everything on the enemy side", which is right only if every sprite in
the game is drawn facing the same way. It is not: champion art is authored facing right, and
the enemy art is authored facing *left*, already turned toward the party. Mirroring it on top
of that spun the Sskarn round to face the back wall.

`game/facing.ts` asks about the art instead of the side, and both renderers ask it — so a
champion borrowed as an Arena defender is turned round, an enemy is left alone, and the Pixi
scene and the DOM battlefield cannot drift apart on it again.

### Changed — damage numbers use the library's `FloatingText`

At the owner's suggestion, and it fixes the two things wrong with the first pass: numbers
landed *inside* the champion who took the hit, and simultaneous hits stacked on one another.
`FloatingText` manages a whole layer — jitter, rise, fade, and its own cleanup — which is
what it was written for.

### Changed — the simple battlefield idles

"Highly animated — idle loops always play" is in the brief, and a still field reads as a
broken one whichever half of the game drew it. The same nine frames at the same nine frames a
second, on one clock for the whole field. It needed the sprite manifest, which nothing on
that path had been asking for — which is why every unit had been holding on its still image.

### Added — a battlefield for the machines the graphics card fails on

The battlefield is the one part of Mistvale that needs a graphics context, and a machine can
fail to give it a working one in more ways than "it has none". Running the game against a
browser with 3D disabled shows the shape of it: the allies draw, the enemies come out as
near-invisible ghosts, and their health bars go black. Acceleration switched off, a
blocklisted driver, a software renderer that gets half the frame right — all of them arrive
as the same thing, a correct fight over a black rectangle, and none of them can be told apart
from inside the page.

So there is a switch: **Settings → Simple battlefield**. On, the fight is drawn as ordinary
DOM — every champion where they stand, mirrored to face each other, health bars under their
feet, a ring on whoever is acting, damage numbers where they land — reading the same
`PlaybackView` and standing in the same formation as the Pixi scene, and building no scene at
all. No idle loops and no fog, because those are the parts that cost a GPU. The client turns
it on by itself when there is provably no context; the switch is for when there is one and it
does not work.

### Fixed — the blank-field notice showed the wrong sentence

The message that names *which* of four things went wrong shipped computed but not rendered:
the JSX still held the old hardcoded line, so every cause read as "the champions' art did not
load" — which was the one thing it demonstrably was not. A find-and-replace that was written
without an assertion and silently matched nothing.

### Fixed — the wave counter never left wave one

`WaveTracker` takes `current` at construction and paints from its own field afterwards, and
nothing was pushing the fight's wave into it — so a three-wave stage showed "1 / 3" from the
first turn to the last. The same construction-time trap the `Fui` bridge's `apply` exists
for. Pushed in silently, because `set` otherwise emits `wave:change` and `wave:clear`, and
this is the fight telling the pips where it got to rather than the pips announcing a
decision. `visible.spec.ts` fights a three-wave stage and watches the label move; removing
the fix turns it red.

### Removed — the turn-order strip

The queue of upcoming portraits across the top of a battle, at the owner's request. The
information it carried is in the fight itself.

### Changed — the "battlefield could not be drawn" notice names its cause

The first version said *that* the field was blank, which was enough to rule out the art and
not enough to say what had gone wrong instead — and cost a round finding out. It now
distinguishes four causes, each a different thing to go and fix: no graphics context (with
the browser's own reason, and what to change), a scene that threw while drawing, a stage
something else took over, and a field that is genuinely empty. A screenshot can tell them
apart.

`sync` is also no longer called with a bare `void`. It is async, so anything it threw became
an unhandled rejection and the battlefield simply stayed empty in silence; a failure is now
caught, logged, and named on screen.

### Fixed — twenty-eight build warnings on every production build

`UPDATE.sh` ended every client build with a wall of "`/fui/stone-vine/…png` didn't resolve at
build time". The vendored `assets.css` declares `--fui-img-*` for every asset in the
FantasyUIs library, including the packs Mistvale does not ship. That was thought to be free —
a custom property nothing reads is never fetched — which is true at runtime and false at
build time, where Vite resolves every `url()` it can see. Twenty-eight warnings on every
build is the kind of standing noise that hides the warning that matters, and each one is also
a slot a component can point at to render nothing at all.

`tools/fui-vendor` now prunes the stylesheet to the art it actually vendored, companion
declarations and all, matching on the asset id so `bar-track-stone` and `bar-track-stone-1`
cannot be confused. The client build is warning-free.

### Fixed — the empty battlefield, for real this time

The owner's fights rendered a perfect HUD over a black rectangle: turn order moving, health
bars moving, outcome correct, and not one champion, enemy, ground plate or wisp of fog on
the field. It never reproduced in development. The on-screen notice added in the previous
change is what finally pinned it — it fires only when the stage has nothing on it, and it
fired, which ruled out the art and pointed straight at the stage.

**`initStage` did not check which canvas an application belonged to.** It answered `if (app)
return app;` — "there is an application, have it". `PixiStage` mounts a fresh `<canvas>`
whenever it remounts and `Application.init` is asynchronous, so a remount that landed while
a previous init was still coming up left the finished application bound to a node that had
already left the document. Every frame after that was drawn into a canvas nobody could see,
while the DOM half of the game carried on perfectly — which is exactly why it looked like an
art problem. Whether it happened at all was a race between the graphics context starting and
the session resolving, so one machine saw it every time and another never did.

Four more faults in the same file, each able to blank the stage on its own:

- **Concurrent calls built two applications** for one canvas.
- **A teardown could not cancel an in-flight init**, leaving a zombie application to install
  itself over the live one.
- **`destroyStage` destroyed the application with `removeView: true`** — which takes React's
  `<canvas>` out of the document. Found by doing it: the page filled with "WebGL context may
  be lost" and went blank.
- **An init failure was an unhandled rejection.** A browser with WebGL switched off got a
  black rectangle, permanently, with nothing in the console. `initStage` now resolves to null
  and records why (`stageFailure`), and the battle screen already says so on screen.

And an unmount is no longer taken at face value: React unmounts and immediately remounts
against the *same* canvas — every time under StrictMode — so the teardown is deferred by a
task and cancelled if the canvas comes straight back. `destroyStage` also takes the canvas
asking, so the old backdrop leaving cannot tear down the new one's stage.

`game/stage.test.ts` covers all of it against a faked Pixi, because the rules being checked
are this module's own: which canvas owns the stage, what happens to a scene handed over too
early, who may tear it down, and that the view is never removed. Each fix was confirmed by
putting the old line back and watching the suite go red.

### Fixed — the Auto button stopped looking engaged

Auto worked; it just no longer showed it. `BattleControls` sets `aria-pressed` from its
`auto` option at construction but adds the `is-on` class only inside its own `setAuto` — so
a control *built* engaged is correct to a screen reader and looks identical to one that is
off. That never mattered before, because Auto could only be turned on by clicking it. Now
that it is a remembered choice, the control is often built already on, and the remount that
follows a change wiped the class the click had added. Painted in Mistvale's own layer, not
in `src/fui`, which the next vendor sync would overwrite.

### Fixed — two more ways the battlefield could go blank

Neither of these needed the art to be missing; both left a correct fight playing over an
empty field, which is the failure with no symptom anywhere.

- **The scene was rebuilt whenever the content bundle changed identity, and the effect that
  fills it ran only when the playback view changed.** A bundle arriving on a commit where
  the view did not move left a brand-new, empty scene that nothing ever drew into — and a
  fight waiting on the player never moves the view. The art lookup is read through a ref
  now, so new content is simply picked up by the next lookup and the scene is never thrown
  away.
- **Nothing re-attached the scene if something else took the stage.** `PixiStage`
  re-initialising destroys the stage and then attaches the ambient mist, which is right
  when nothing else wants it and silently fatal during a battle. The screen now checks
  `isSceneAttached` after every commit and re-attaches — an identity comparison, so it
  costs nothing.

### Added — the battle screen says when it cannot draw

Twice now the only signal that a fight was rendering nothing has been a screenshot from the
owner: the HUD correct, the turn order moving, the field black. So the screen checks its own
work — if the fight has units and the scene has drawn none of them a moment later, it says
so under the hotbar instead of leaving somebody to guess, and says plainly that the fight
itself is unaffected because the outcome is the server's. The decision lives in
`blindStage.ts` with its own tests: a safety net nobody can test is not a safety net.

### Fixed — the champions were not on the battlefield (Batch 2)

The owner's screenshots: a full HUD, a turn order, health bars moving, skills to press — and
an empty field. The fight was running correctly the whole time. What was missing was every
sprite in it.

Two independent faults, and both are fixed:

- **`attachSprite` gave up when no frame loaded.** A unit whose art would not load got a
  health bar and a turn ring hovering over nothing. Any art problem at all — a release
  built without the sprite tree, a path the web server does not hand out, a champion whose
  frames were never drawn — arrived as an *invisible battle* rather than a plain-looking
  one. There is now a ladder: the unit's own idle loop, then the shared silhouette, then a
  figure drawn in code. The last rung needs no network and no theme, so no state of the
  world leaves a slot empty.
- **Nothing in the deploy checked that the art shipped.** `UPDATE.sh` now refuses to cut a
  release whose client carries no `sprites/manifest.json`, naming the fix; `STATUS.sh`
  counts the units in the release that is actually running and flags the box as degraded
  when there are none. Its absence was completely silent: the game boots, the HUD paints,
  every fight resolves, and the battlefield is empty.

**And the suite can see the battlefield now.** Everything else in the browser suite drives
the game through roles and text, which is blind to a WebGL canvas — that is how a fight
could render nothing at all with sixty-odd tests green. `e2e/pixels.ts` decodes a
screenshot (zlib and the five PNG line filters, about eighty lines) so a test can ask how
much of the field is not the ground it is drawn on. Two cases: with art, and with **every
sprite request refused**, which is the broken box exactly. Both must have bodies on the
field.

### Fixed — the stage dialog drew outside its own frame

`Modal` caps at 480px and the team chooser's body asked for a 30rem minimum — the same
number — so the painted panel's border and padding had nowhere to go and the three action
rows drew straight through the ornament. The dialog is 720 wide, the body no longer forces
a width, and each action row is a sentence that yields (`min-width: 0`) beside a 9-sliced
button that does not — the same shape of bug D9 fixed under the relic cards. An empty slot
now draws as an empty slot rather than as a hooded figure.

### Added — the game remembers your team, your speed and your Auto

Every fight started from four blank slots, on every stage of every evening, while the four
champions a player actually uses change about once a week. `state/loadoutStore.ts` keeps the
last team **per battle mode** — a campaign squad and a Depths squad are different decisions;
stage 4-3 and 4-4 are not — filtered on the way out to champions still owned, so it can
suggest a stale team but never an impossible one. The Arena's challenge picker opens on it
too; the *defence* is deliberately not remembered here, because that one is the server's.

Speed and Auto are standing choices now rather than per-fight ones: ×2 survives the next
fight and the next sign-in, and a player who turned Auto on gets the next fight fought for
them without pressing it again. Auto also became a real toggle — the handler ignored the
control's payload and ran the fight out whichever way the button was pressed, so it could
be turned on and never off.

Kept client-side on purpose. None of it is game state: the server still decides every
outcome and re-checks the team on the way in. It is the shape of one player's habit, which
belongs in the browser they play in rather than in a column and a write on the hot path of
starting a battle.

### Changed — one placeholder for every champion without a face

`championArt` used to hand out a different painted library hero per faction — an emberknight
for the Emberclan, a brute for the Sskarn. In practice it read as what it was: unrelated art
borrowed from a component library, so a roster looked like eight different games. Every
faceless champion now gets the same hooded silhouette, on its card and on the battlefield
alike. A silhouette says *art pending*; a borrowed emberknight quietly claims to be a
portrait.

### Added — painted tooltips

The top bar was three bare numbers. `19/63` beside a flame is an energy bar to somebody who
already knows the game and a riddle to everybody else — it does not say what energy is spent
on, that it returns on its own, or when the bar will be full. Hovering a currency now opens
the library's own leather-and-bronze tooltip with the numbers and a line about what the
thing is for. `ui/Tooltip/useTooltip` adds two things over the library's `attach`: focus and
blur, so a keyboard reaches them, and it clears the native `title` while attached, so the
browser's grey box does not land on top of the painted one a beat later.

### Fixed — one day claimed shows one day claimed

Collecting a login reward ticked **all thirty** tiles of the calendar as collected. The
library's grid draws each tile from `currentDay` and `claimedToday`, where `currentDay` is
the tile's position in the grid — and the screen was handing it `next?.day ?? days.length + 1`.
Once today's claim is spent the server marks *no* day `next`, so the fallback fired,
`currentDay` became 31, and every tile read as "before the current one". A walked-out welcome
track had the same shape of bug from the other end: no `next` there either, so its last tile
sat glowing as though it were still claimable.

Both fall out once the two states are named separately, which is what `trackTiles` does — the
tile the cycle stands on, and whether that tile is already spent — derived from the server's
own per-day flags rather than from arithmetic on `claimsMade`, so the grid cannot disagree
with the list it was drawn from. Six unit tests cover every state `standingOf` produces;
four of them fail against the old expression.

### Changed — screens are the screen (Batch 1)

Every screen in the game was giving about a fifth of its width to a column of prose, and a
sixth of its height to a title with a painted vine under it, before the feature it exists for
drew a pixel. The owner's note was that the features need the space. So:

- **Headings are quiet.** One line, left, at reading size, with the tagline beside it rather
  than beneath and the divider gone. A screen's name should say which screen you are on, not
  announce itself.
- **The right-hand columns are an info button.** Eight screens — the Haven, the Campaign,
  Champions, the Chronicle, the Depths, Errands, the Bazaar, the Vault and the Arena — keep
  every word they had, now behind an **i** beside the title. The Mistgate's odds are the one
  exception to the icon: published rates get a worded **Odds & mercy** button, because nobody
  should have to guess which icon hides the numbers.
- **What was actually a control moved rather than hid.** The Bazaar's refresh and shelf
  buttons sit with the restock clock; the Vault's meter, worn count and two actions are a
  toolbar over the grid, and its selection is a bar across the foot; the Arena's defence and
  weekly chest joined the standing strip, with the Hall of Valor and the ladder in the title
  bar; the first-win rail runs across the top of Errands; the springs' week sits with the
  springs, and each group's own footnote sits over the tiles it is about.
- **The campaign map is the campaign screen.** It was 420px of map computed from a row count,
  with the rest of the window empty under it. It now fills the pane — the chapter's path docks
  beneath it and takes only what it needs — and the difficulty control moved into the title
  bar. The Haven's stations grew and centred; the Mistgate's portal sits in the middle of its
  panel rather than at the top of an empty one.

### Changed — the profile chip says how far, in numbers

The account's level progress was a thin arc drawn around the avatar: a shape that can say
"some of the way" and nothing else. It is a real bar under the name now, with the two numbers
a player is actually counting — `151 / 2,443 · 2,292 to Lv 25` — and the ring is a plain rim.
The bar is the library's own `StatBar` on its `xp` artwork, kept live through its setters
rather than rebuilt, so it animates forward instead of restarting from empty at the moment it
advances.

### Fixed — the design rework's last pass (D9)

Two layout bugs the owner found, and they were the same bug wearing two faces. The library's
`ArtifactCard` is a fixed 236px and its `ChampionCard` a fixed 150px — everything inside them,
down to the font sizes, is derived from that number, so neither can be stretched to fill a
column.

- **The Forge and Lock buttons under a relic were wider than the relic.** The entry holding
  the card filled its grid cell while the card sat at 236px inside it, so the buttons —
  laid out beside the card, not inside it — took the cell's width instead.
- **The four champions on a profile card stacked one per row.** The tile around each card
  was `width: 100%`, and a full-width flex item never wraps, so `flex-wrap` had nothing to do.

Both are now sized from `$card-artifact` and `$card-champion` in the tokens, which is where a
number the layout depends on belongs.

**And the guard, which took four attempts to make honest.** A test that measures overflow
found neither bug — both are a card *narrower* than its neighbours, which overflows nothing.
The first version measured the React bridge, which is `display: contents` and has no box, so
it passed against the very bug it was written for. The second flagged every grid in the game,
because a grid of cards is legitimately wider than one card. What survives is narrow and
true: a holder that lays out a card **and something else** must be the card's width. It fails
on the relic bug and passes with it fixed, and it refuses to pass at all if it measured no
cards — a green run that measured nothing is not a green run.

### Changed — the §9 budgets, re-measured with the art in

The design rework's whole component layer, its theme and the twenty-odd Mistvale primitives
built on it cost **20 KB gzipped**: 302 KB → 322 KB of JS against a 1.5 MB budget. The
library's painted art is 1.2 MB on the login screen and 1.9 MB after four screens, which is
reasonable and now written down.

The champion avatars are not. Eight of them are **14 MB published** — 1.3–2.2 MB each, at
1254×1254, drawn at 150px — so opening the roster pulls about 9 MB. `pnpm assets` copies them
from `assets/` byte-for-byte and there is no image library in the toolchain to downscale with.
Raised as **Q6** with a recommended default rather than fixed quietly, because the fix means
adding a native module to the build on the box the budget is about.

### Fixed — a gate that was a coin toss

`bots.test.ts` — "can be fought and settled like anybody else" — failed **five times in
twenty**, and had done since P7. Not flakiness to be re-run away: the test was asserting
something untrue about the game.

An arena attack can be decided before the attacker ever acts. `attack` runs the opening
advance so the board is handed over on a real decision rather than with `awaiting` null, and
that advance runs the *defence's* turns — a lone starter against a full bot band does not
always survive them. The service has always handled it, and handled it carefully: the
session is written `finished`, the arena rewards are settled there, and the view comes back
with the rating on it, because "an `active` battle whose state says `finished` is one nobody
can act in or be paid for". The 400 the test tripped over — "That battle is already over" —
was the right answer.

So the test now covers both endings, including the branch the service's own comment
describes and nothing had ever exercised: when the fight settles at the opening, the rating
is read off the view and a late action is checked to be refused; when it does not, it is
played out as before. Twelve consecutive runs green, against a 25% failure rate.

### Added — three things only Mistvale can say (design rework, D8)

Seven phases of dressing the game in the library, and what was left over is the part the
library has no component for and no reason to: rules that belong to this game. Each of the
three is backed by data the server has been sending all along and no screen had ever shown.

- **`ui/BossCard` — who waits at the end, and what it does about being fought.** Every boss
  in the game carries `bossMechanics` in content and **not one screen had ever said what was
  in it**. The Depths are described as puzzles; a puzzle whose rules are secret is a wall you
  lose to twice before guessing. The card turns the flags into the sentences that change what
  a player does — "Stun, freeze and sleep do not land. Bring damage, not control." — and it
  sits in the team chooser, where the energy is about to be spent. `bossRules` is separate
  from the component so the wording is testable, and `stageBoss` finds the boss in a stage's
  last wave so a stage re-cut in Admin points at its new one with no client change.
- **`ui/VaultMeter` — how much room is left, and what happens when there is none.** The
  vault has been a real economy since Q5 and was showing as "218 / 250" in a definition list.
  Three states now, each of which changes what to do next, and the rule that makes equipping
  a way to clear space said out loud rather than left to be discovered.
- **`ui/SpringDial` — which spring runs on which day.** Five springs each announced their own
  hours on their own tile, which answers "is this open now" and never answers the question a
  player actually has: *when do I come back for Verdant essence*. The week, once, with the
  springs on it and today marked from the server's clock rather than the browser's.

And **the campaign names its warlord**. The screen's tagline has promised "a warlord waiting
at the end of each" chapter since P6 and never said who — while content has known all along,
in the last wave of the last stage.

Two of the six components the roadmap sketched are deliberately not built. `DepthsKeep` was
answered in D6 by the library's own `EventBanner`, and `MistScene` would be decoration over a
backdrop that already exists — neither would have said anything the game does not already
say.

### Changed — the ladder looks like a ladder (design rework, D7)

The Arena, the Hall of Valor and the public profile card, dressed. The rung a player holds
was two words of text; the opponents were bordered boxes with their teams written out as a
list of names; the ladder was a hand-built `<ol>`; and a warden's four chosen champions —
the whole point of a profile card — were three lines of text each.

- **A rung is an emblem.** `TierBadge` for the reader's own standing, for each opponent's,
  and on a profile card. `ui/arenaTier` is the split that makes it possible: Mistvale's ten
  rungs are a metal and a numeral (`bronze_2`), which is exactly what the badge is built
  from — done once so the three places that draw a rung can never disagree.
- **An opponent is four faces.** What a player is deciding is whether they can beat this
  team, and five cards of written names side by side is the one shape that cannot be
  compared at a glance. Portraits now, with each champion's level and star rank under them.
- **The ladder is the library's `Leaderboard`** — the rank column, gold/silver/bronze on the
  top three, and the highlight on your own row all come with it. Two tables rather than one,
  because Mistvale's board is the summit *and* your neighbourhood, and merging them would
  put rank 41 between rank 25 and rank 39 with nothing to say why.
- **The Hall's four elements are a painted strip**, each wearing the same affinity glyph it
  wears on a champion card and in a fight — which is what registering Mistvale's elements
  into the library's own table in D4 was for.
- **A showcase champion is a champion card.** The four a warden chose to be known by are
  the same painted cards the roster draws, read-only.

The defect the owner spotted is fixed with them: **the rating stake overlapped the Challenge
button** on every opponent card. The footer was a two-item row with no minimum on either
side, so the painted button — a 9-sliced asset with a width of its own — pushed the
"+19 / −13" underneath itself. The stake is a stacked column now and the card is wide enough
for the button it contains; the same narrowness had been clipping the fourth champion off
every team.

### Fixed — feeding a champion

Reported from the owner's box: the food picker could not select anything. Every card left
the count at "0 selected", the Feed button never enabled, and the tutorial stopped dead at
step 11 of 15 — the step that asks a player to level a champion three times, which is the
one thing feeding is for. Two separate defects, bisected against a cold server.

- **One press was counted twice.** The library's `ChampionCard` emits `champion:select`
  *and* `champion:click` for a single click on a selectable card, and the wrapper was wired
  to both — so every card selected itself and immediately deselected itself. It now listens
  to whichever event matches the mode it is in.
- **The picker did not fit inside its own frame.** The painted card is a fixed 150px, and
  the grid's tracks were 128px; the picker's body also set its own 44rem width inside a
  dialog capped at 480. Every row drew out through the ornament, the dialog grew a
  horizontal scrollbar, and the roster grid behind it had the same 6px-per-column overflow.
  Tracks are sized from the card now, and the modal owns its width — the same mistake the
  champion sheet made in D5, in the same shape.

Two things came out of the fix and are worth having on their own. `Fui` and `FuiSlotted`
now accept an **`apply`**, which `useFui` always had and neither element wrapper exposed —
so a component with real setters can be updated in place instead of remounted on a key
digest. The champion card uses it to put its selection ring back where the state says,
which matters when a press is *refused* — the rank-up picker takes exactly N champions and
the library had already drawn the ring before React could decline.

And **`e2e/feeding.spec.ts`**, because none of the sixty-four browser tests had ever opened
this picker. It fails on the old wiring and passes on the new one, and it checks the grid
stays inside its dialog while it is there.

### Changed — the world is a world (design rework, D6)

The campaign was an accordion of twelve fold-out rows. The Depths were a grid of bordered
`<div>`s. Quests, missions and events were three hand-built lists of the same thing that
had already drifted apart — one drew a bar, one drew a tick, one drew neither. The whole of
the game's world and progression is the library's now, and it is nine hundred fewer lines
of Mistvale's own CSS.

- **The campaign is a map.** `WorldMap` with the vale's twelve chapters on it — cleared,
  current, open or shut, each wearing its region's mark, joined by the road between them —
  and the chosen chapter's seven stages snaking below in `StageSelect`, warlord at the end.
  Where a marker *sits* is derived from the chapter's own number rather than authored, so a
  thirteenth chapter added in Admin lands somewhere sensible without anybody placing it.
- **A keep is key art.** The Depths' ten places are `EventBanner`s — a picture, a name, how
  deep this warden has been, and whether it is open today — and a floor ladder is a
  `StageSelect` grid rather than fifteen bordered rectangles. `dungeonArt` gives each keep
  its own face and each of the three groups its own colour.
- **One ledger for every claimable thing.** `ui/Ledger` wraps `AchievementList`, and the
  daily checklist, the eighty steps of the Valewarden's Path and — through the same helper —
  every objective the game ever adds are drawn by it. `goalArt` gives each of the twenty-two
  goal types its own mark, so "win seven battles" and "spend fifty energy" stop looking like
  the same afternoon. Rewards become a line through the same `describeRewards` the toasts
  use; a quest with two goals is summed with each goal's own count said out loud, so the
  aggregate hides nothing.
- **The event ladder is a rail.** `RewardTrack` puts each rung at the score it is worth, so
  "how far to the next" is a distance rather than a subtraction. Both it and the login
  calendar tick optimistically on click — the one thing this game does not do — so both are
  remounted while a claim is in flight and the tile goes back where the server has it.
- **The login calendar is a calendar.** `DailyRewards` for both tracks, with the days that
  hand over a champion drawn as milestones, which is the weight day thirty has always
  deserved.
- **Two clocks came from the library.** The quests' daily reset and an event's last day are
  `CountdownTimer`, anchored to the server's own end time rather than counting ticks, so a
  tab left open overnight is not an hour out when it is looked at again.
- **Empty states stopped being a sentence in the dark.** `ui/Empty` wraps `EmptyState`, and
  an empty mailbox, a quiet news wall, a calendar between tracks and an unpublished campaign
  all say what they are and what would fill them.
- **Mail keeps its own shape, deliberately.** `MailInbox` is a single-column inbox with no
  reading pane, and Mistvale's letters have bodies, an expiry and a way to throw one away.
  Same call as the mastery board and the stat table: where the structure encodes something
  the library's component cannot say, the structure stays and takes the paint.

Two smaller things came out of the browser suite, and both are worth having. **A shut
chapter now says why on its own marker** — it cannot be opened, so the prose under the map,
which explains the chapter you *are* in, never gets the chance; the marker carries "Clear
1-7 first." where an open one carries its region and its stars. And **a difficulty is a tab
rather than a button**, because the library's segmented strip is a `tablist` and that is
what a one-of-three switch is.

One defect fixed, and it was not on any of these screens — it was under all of them.
**A panel stacked in a scrolling column was squashed to its header**, and everything below
drew *behind the next panel*. The library's panel body carries `min-height: 0`, which is
right for a panel that scrolls inside itself and wrong for one in a stack: a flex item's
automatic minimum is its content unless its content says it has none. The events screen was
losing its entire reward ladder to it and the calendar was losing the button that collects
the day — on nineteen scrolling columns across the game. One rule, in the panel.

### Changed — the relics look like relics (design rework, D5)

The vault was a grid of bordered `<div>`s with the substats as a definition list, the
paperdoll was six dashed rectangles, and a ×10 pull turned over ten cards with nothing on
them. Relics and the economy around them are the library's now.

- **A relic is an `ArtifactCard`** — rarity frame, slot pip, upgrade level and roll pips on
  each substat, which is the card an equipment screen in this genre is made of. The roll
  pips matter more than they look: a relic's whole value is usually one lucky line among
  four, and pips are how that becomes visible instead of arithmetic. A relic has no name of
  its own in Mistvale, so the card is titled by its set and subtitled by its slot — inventing
  a name would be content.
- **Every slot has a face.** `relicArt` maps the nine slots to a painted icon and a line
  glyph, kept in one place so the vault, the paperdoll, the picker and the Bazaar all draw a
  boot the same way. Typed on `GearSlot`, so a tenth slot cannot be added without somebody
  drawing it.
- **The paperdoll is nine painted sockets**, filled ones wearing their piece's rarity and
  empty ones the slot's silhouette, with the accessories dimmed until the ascension that
  opens them.
- **What the pieces add up to** is on the sheet at last, as `ArtifactSet`'s bonus list:
  every set with a piece on this champion, complete ones first, incomplete ones greyed and
  counted so a player can see they are one boot from a bonus rather than working it out. A
  set that is *paying* says so in the server's own words, because bonuses stack in complete
  copies — six pieces of a two-piece set is the bonus three times, and no client-side count
  is allowed to claim otherwise.
- **The forge's ×1/×5/×10 strip** is the library's segmented control, and the Bazaar's
  non-relic stalls are painted sockets with a quantity badge rather than a line of body text.
- **Champion art has one answer everywhere.** `championArt` returns a drawn avatar when the
  champion's asset declares one and a painted stand-in when it does not — by faction first,
  role second, so thirty-six art-pending champions read as eight recognisable houses rather
  than one anonymous crowd. The gate is the asset's `avatarPath`, which is content an
  operator fills in through the Admin Suite; the *existence* of an asset record answers
  nothing, since nearly every champion points at the shared art-pending model.
- **One stat vocabulary.** `statLabel` replaces three private copies of the same map and two
  raw `toUpperCase()` calls, so a relic never rolls `CRITRATE` in one place and `C.RATE` in
  another.
- **Screen padding moved to the shell.** Three of seventeen screens remembered to set it,
  which is why the vault's first column sat against the window edge.

Three defects fixed. **A ×10 pull turned over ten empty frames**: the library's
`ChampionCard` draws nothing at all when the image it is handed fails to load, and the
portrait URL was being built for any champion with an asset record — which is all of them,
because the art-pending ones share one model that has no face. **The set-bonus list
under-counted every stacked set**: it now reads the server's copy-aware description rather
than restating the set's content definition. **And `pnpm assets` silently broke every
sprite in the running dev server**, which is what made the first of those so hard to see.
It rebuilt the published tree from scratch on every run — including the one that runs
before `pnpm dev` and `pnpm build` — and Vite indexes its public directory once at start-up
and maintains it from the watcher, so the wipe took all 89 paths out of that index and the
re-adds did not put them back. Every `/sprites/**` request then answered **200 with the
game's own HTML**: no error in the console, no failure in the network tab, just cards with
nothing on them. It publishes in place now, writing only files whose bytes changed and
pruning what it did not write, so a deleted unit still disappears.

The coverage that would have caught it, because a fix without one is a promise: `every
champion has a face` swept `document.images`, and since the design rework a champion's face
is a **CSS background** on the library's card — so the sweep reported a clean page while
every card on it was empty. It now reads each card's computed background, and loads it.

The owner's avatar art for the four remaining Epics landed in the same pass, so Darius,
Khazgor, Rattledagger and Sethlurias have faces; the asset records now declare them. The
seed only ever fills in what is *missing*, so a database that already holds those four rows
keeps its old ones — on an existing box the four `avatarPath` fields are an Admin edit, which
is the same path any other art upload takes.

### Changed — the collection is a collection (design rework, D4)

The roster was a grid of flat rectangles with a portrait in each and the champion sheet
listed its skills as bullet points. Both are the library's now, and the owner's new
avatar art landed in the same pass — so a card finally shows a face rather than a
silhouette.

- **The champion card is `ChampionCard`** — the rarity frame, the star track, the affinity
  badge, the role pip and the power line in one tap target, which is the shape this genre
  has used since the first squad RPG and the reason a Legendary reads as one from across
  the screen. Ascension rides the second, hotter star track it already draws for exactly
  that. The two things Mistvale's own card carried and the library has no notion of — the
  favourite mark and the six relic pips — are portalled onto it rather than lost.
- **Mistvale's four elements are registered with the library.** Its components take an
  affinity by *key* and draw nothing for one they do not know, and ember, tide, verdant
  and mist are not among its nine. `AFFINITIES` is an exported record and the library's own
  docs offer a custom `def`, so this is the intended extension rather than a workaround —
  done once at startup so every card, badge and battle frame agrees.
- **Skills are `SkillCard`s** — art, frame, level track and cooldown line, with the gold
  treatment on the champion's heaviest active. Which one that is comes from the skills the
  champion actually has, so a three-skill champion's a3 gets it and a four-skill
  champion's a4 does.
- **The roster says what is left to chase.** `CollectionProgress` replaces an owned count
  with owned-against-published split by rarity, which is the only breakdown that answers
  the question a collection screen exists to raise. Food is excluded from both sides: it
  is a consumable that happens to be a champion, and folding it in would tell a player
  they had collected eleven Commons when they had farmed eleven meals.
- **The sort strip and the food filter** are the library's segmented control and toggle.
- **The mastery board keeps its own structure, deliberately.** `MasteryGrid` gates a node
  on one rule — every id in `requires` has a rank — where Mistvale has three, and it takes
  its nodes once at construction with no setter. Bending it would mean re-deriving the
  rules in its vocabulary or rebuilding the board on every learn. So the board keeps the
  part that encodes the rules and takes the paint. The rework's rule still holds — the
  library owns chrome, React owns behaviour — it just falls the other way here.
- **The stat table stays too**, for the same reason: four columns showing base, relics,
  masteries and total teach the first real piece of build literacy this genre has, and
  `StatsPanel`'s label-value-bonus cannot say it.

One defect fixed: **the champion sheet spilled out through its own frame.** `Modal` takes
a `width` and defaults to 480; the sheet set 736 on its *body* instead, so the dialog
stayed narrow while its content insisted otherwise and the stat table's last column and
every skill row's button rendered outside the painted panel. The width belongs to the
modal, and the sheet asks for it there now.

And a flaky server test, root-caused rather than re-run: `pauses for input in manual mode`
assumed the fight would survive the single advance that pause performs. A battle's seed
comes from the process CSPRNG on purpose — a player must not be able to predict the roll —
so one starter against 1-1 sometimes clears the whole stage in that advance and leaves no
turn to take. Not a defect, just a fight going well; the test starts fights until one is
still standing, which is the same shape `practice.spec.ts` already uses for the same
reason. Five consecutive runs green.

And a gap in the test setup, found by the first client test that needed it: Vitest reads
the root config rather than the client's Vite config, so a test importing `@/fui/...` —
the way every client *source* file has since the design rework — could not resolve it
while the same import built fine. The alias is mirrored into `vitest.config.ts`.

### Changed — the fight looks like a fight (design rework, D3)

The battle screen carried the whole game's weight and showed a line of text for the wave,
five word-pips for the turn order, four plain buttons for the controls and a row of
labelled rectangles for the skills. It is the library's own battle widgets now, arranged
the way this genre arranges them.

- **The HUD is a frame over the stage.** Wave pips top-left, the turn queue across the top
  with each unit's portrait and meter, the controls at the right, the party down the left,
  whoever is under consideration in the middle, and the acting champion with their hotbar
  along the bottom. `pointer-events: none` on the frame and `auto` on each widget is
  load-bearing: the HUD covers the whole stage, and the stage is where a player clicks an
  enemy to target it.
- **Every frame carries its portrait.** The turn queue, the party, the enemy plate and the
  acting champion all draw the unit's own sprite still — the same art the fight itself is
  drawn with, so the frame and the figure on the field are recognisably the same creature.
- **The turn queue does not animate.** The library will fill meters on its own at a rate
  set by each unit's speed; that is off, because the server moves turn meters and a queue
  filling by itself would be the client guessing at the fight.
- **The results screen is `ResultScreen`** — the gold headline with its rays, the three
  stars, the ornament, the right-aligned stat table and the reward chips. All five outcomes
  read through it: a victory with its stars and its stage, a defeat, a withdrawal that says
  the energy stays spent, a practice run that pays nothing on purpose, and an Arena result
  that pays in rating and medals and pays on a loss too. It is no longer a `Modal` but it
  joins the same overlay stack (P10b), so an unlock celebration still opens correctly on
  top of it.
- **A reward key knows what it looks like.** `ui/Rewards/art.ts` maps a payout key to a
  painted icon — the wallet keys by name, everything else by family prefix, with a real
  fallback rather than a blank. An operator adding `sigil_umbral` in Admin tomorrow gets an
  icon without anybody touching the client, which is what content-as-data has to mean.
- **The stage says where it was.** "Veilwood Fringe 1-1" under the headline, built from the
  chapter and the stage's place in it, read off the content bundle the client already
  holds — no server change, because this rework does not touch the game.

Three defects fixed on the way, all three found by the browser suite asking what a player
can actually reach:

- **The tutorial's parchment swallowed the victory screen's only button.** A `z-index`
  only competes inside its own stacking context, and the battle screen is one — so a
  result rendered in place sat underneath the tutorial overlay however high its z-index
  went. It is portalled to the body now, like every other overlay in the game.
- **The result stopped being a dialog.** `ResultScreen` is a plain `<div>`; a full-screen
  overlay that covers the game and holds the only way forward has to announce itself as a
  dialog, take focus, keep Tab inside itself and answer Escape. `Modal` owned all of that
  privately, which was right while it was the only such overlay; it is `ui/Modal/dialog.ts`
  now and both use it. The result names itself by its outcome, so a screen reader says
  "Victory" rather than "Results".
- **A ref was written during render** — twice, caught by lint. Both moved into layout
  effects.

And the third instance of one bug, now fixed at the root: **every victory in the game showed
no stars at all.** `ResultScreen.css` draws its three clear-stars from a Stone & Vine file,
and the vendor step only followed the *theme's* art references — so the file was never
copied and an unset `background-image` is not a broken image, it is nothing. `pnpm
fui:vendor` now scans each vendored component's own stylesheet as well as the theme. Two
more files, and the class of bug is closed rather than patched a third time.

### Changed — the shell is a game's shell (design rework, D2)

The top bar, the dock and the home screen are the three things a player sees on every
screen, and all three were flat rectangles on a black field. They are painted now, and
the whole game gained a sense of place with them.

- **The top bar is the library's `TopBar`.** The avatar with its level ring, the currency
  rail's engraved cells and the tool buttons with their badges are all its work; what
  stays Mistvale's is what moves. Energy still counts up locally between server responses
  — the server sends the value and the next tick, the client animates towards it and never
  credits energy on its own — and the projection is unchanged. Mistvale has no avatar art
  (an account is a name and a password), so the profile's initial goes into the ring.
- **The dock is the library's `BottomNav`.** The three things it has no notion of are
  written onto its own buttons afterwards: the tutorial's highlight hook, the tooltip that
  says when a locked destination opens, and the 1-9 hotkey hint. Locked entries keep their
  place behind the shroud — seeing what is coming is part of the pull forward.
- **The Haven's stations are painted sockets**, each with its place's own icon in it — a
  war banner for the campaign, a gate down for the Depths, a crown for the Arena, a
  swirling void for the Mistgate. A locked one keeps its socket and takes the mist. This
  is what a home screen is supposed to look like: a camp you can see, not a list of
  destinations you can read.
- **Every screen opens with a `Heading` now** — thirteen of them had no title at all, which
  is a large part of why the game read as values on a page rather than as places. Each one
  says where you are and what happens there, over the pack's painted vine.
- **The backdrop is visible.** The drifting mist was three near-black layers on a
  near-black ground, which is to say invisible; it is warm and lit now, and the ember glow
  near the horizon actually reaches the screen.
- **Panels lift off the ground.** The library's example pages sit on a mid-dark page where
  Dark Ember's leather panel reads on its own; Mistvale's ground is near-black, and on that
  a panel is very nearly the value of what surrounds it — the Haven's two sidebar panels
  shipped for an afternoon with one visible and one apparently absent. A shadow and a
  hairline, in the theme layer, and no art touched.

Four defects fixed on the way, three of them things the browser suite caught because the
suite asks what a *player* can reach rather than what the markup says:

- **The energy countdown read `Date.now()` during render** — impure, and it would have let
  the bar and the counter disagree about *when* inside a single frame. Caught by lint. The
  file already had the answer: a cached clock behind `useSyncExternalStore`, added in P0
  for exactly this, so both readings come off it now.
- **Locked dock entries stopped being reachable.** The library's `disabled` sets the HTML
  attribute, which takes a button out of the tab order — and a locked destination whose
  entire job is to say "opens at level 8" is then a thing a keyboard user cannot reach to
  be told. It is `aria-disabled` and a refusal in the handler instead.
- **Each Haven station was a button inside a button.** `Slot` is built to be a control —
  an inventory cell you click — so used as a picture it brought a focusable
  `role="button"` into the middle of the station's own button: two controls announced for
  one place, and one of them does nothing. The socket is presentational now.
- **The profile chip stopped saying what it does, and the level stopped being announced.**
  The library labels the chip with the player's name, and draws the level as a bare
  numeral on the avatar ring — the right shape visually, and meaningless to a screen
  reader. Both go into the chip's accessible name.

### Changed — the game looks like the examples now (design rework, D1: the primitives)

The owner looked at D0's result beside the library's own example screens and said it did
not look like them. It did not, and the cause was a decision made in D0: the theme layer
had pulled the accent to Mistvale's pale teal and cooled the grounds, on the theory that a
game with "mist" in its name wants a cool light. That is backwards. The painted art is what
makes the screens read as a game, and bronze filigree over a blue-grey panel reads as a
texture pasted onto an app — which is exactly what the owner saw.

- **One palette for the whole client, and it is the art pack's.** `fui/mistvale.css` no
  longer overrides the palette at all, and `styles/_tokens.scss` was moved onto Dark
  Ember's own values instead — warm near-black grounds, ember bronze, gold, the pack's
  glossy red. The Sass variable that named the teal is renamed with it: `$mist` is
  `$accent`, because a variable called mist holding bronze is a trap for the next reader.
  The Pixi backdrop, the battle ground and the floating combat text moved too, so the
  canvas layer and the DOM layer are lit by the same fire rather than arguing across the
  seam. Affinity colours did not move — they name a champion's element and mean the same
  thing on a card, in a log and on a threat line.
- **`Button` and `TextField` are painted.** The button is the library's own `<button>`
  element, so focus, tab order and form semantics are native; what Mistvale's wrapper still
  owns is the press cue (which is how "every action acknowledges within 100 ms" stays a
  property of the kit rather than of forty screens), the loading state, React children
  through a portal, and attribute passthrough. The field keeps React's `<input>` — a
  controlled value and a forwarded ref are things a wrapped component would have to
  re-earn — and takes the well's 9-slice art. That is the rule for the whole rework:
  **the library owns chrome, React owns behaviour.**
- **`Heading`, Mistvale's own.** Sixteen screens each opened with a plain `<h1>` in a
  screen-local module, which is how sixteen screens ended up with sixteen title
  treatments and none of them looked like a game. There is one now, lifted from the
  library's own title screen: large and widely letterspaced, lit from behind by the accent,
  an italic tagline in soft gold, and the pack's painted vine under it.
- **Five components added** where an existing feature already wanted one: `DialogueBox`
  for the tutorial's Wardenmaster, `ActionBar` for the battle skill bar, `AchievementPopup`
  for the unlock celebrations, `PatchNotes` for the News screen, `LoadingDots` for the
  short waits. No component was vendored to invent a feature — the rework is a rework of
  the design, and the game's content and mechanics are untouched.

Two bugs fixed in the same pass, both found by looking at the screen rather than at a test:

- **The ornament under every title was 40px of nothing, and every modal's close button was
  a blank square.** Dark Ember reaches across packs: its divider, three icon buttons, two
  bar fills and one panel are Stone & Vine files. D0 vendored art *by pack* and left Stone
  & Vine out to save 3.4 MB, so those seven slots pointed at 404s — and a missing
  `border-image` is not a broken image, it is an absent one, which is why nothing looked
  wrong enough to chase. `pnpm fui:vendor` now resolves what the vendored themes actually
  reference and copies that too: seven files, 0.3 MB, and a theme growing a reference comes
  out right on the next run with nobody maintaining a list.
- **A component with a required options bag could not be typed at all.** The bridge's
  constructor type took an optional parameter, which every defaulted component satisfies
  and `SegmentedControl` — whose `segments` is genuinely required — does not. The parameter
  is required now and the constraint admits the `| undefined` that the defaulted shape
  drags in; callers still see the real bag.

### Added — the game is dressed (design rework, D0: the foundation)

Commissioned by the owner on 2026-08-18: *"I want you to FULLY rework the Design of the
whole Game"*, using **FantasyUIs** — their own component library of painted 9-sliced
panels, ornament frames, unit frames and turn meters. This is the groundwork the other
nine phases stand on; the screens follow.

Two standing rules were superseded in the same breath and are recorded as such: the game
client may now use a component library, and the hand-built pixel kit is retired. Two
answers came with it — **sans-serif only**, and **the Admin Panel is not touched**.

- **99 components vendored**, resolved through the library's own `/r/<Name>.json` records:
  the `copy` field is the transitive closure of real import statements, so a component that
  grows a dependency upstream brings it along without anyone maintaining a list for it.
  `pnpm fui:vendor` does the copy and `pnpm fui:check` fails when a vendored file has
  drifted. The copies are byte-identical to upstream, which is what keeps a newer library a
  clean overwrite rather than a merge — and why the tree is excluded from this repo's
  linting and formatting, and carries a `@ts-nocheck` banner rather than being patched to
  satisfy a stricter config than its own.
- **The art is self-hosted** — 457 files, 6.4 MB, in `public/fui/`. Not a preference: nginx
  sends `img-src 'self' data: blob:`, so a component streaming its panel fill from the
  library's CDN renders nothing in production. `setAssetBase('/fui')` is the library's own
  answer to exactly this.
- **A theme layer rather than a fork.** The library's indirection is assets → themes →
  components, and a component only ever reads a semantic slot — so making it look like
  Mistvale is a matter of rebinding slots, and no vendored file is touched.
  `fui/mistvale.css` rebinds the display and body faces — **Cinzel and Spectral are serif
  and the brief has forbidden serif since P0**, so both point at Mistvale's own
  `--mv-font-*`, where the game's type has always been decided — and binds the rarity ramp
  to the game's five tiers. It first also pulled the palette off bronze toward the game's
  pale teal; D1 reversed that, for the reason recorded there.
- **One React bridge for all of them.** The library is vanilla TypeScript by design and
  names "a React ref" as a host; `useFui`/`Fui`/`FuiSlotted` are that host. A component is
  constructed once and updated through its own `update()` — never rebuilt, which would
  restart every animation and drop focus mid-interaction — and content goes in through a
  portal, because the library's containers take DOM nodes and React cannot supply those.
- **`Panel` is the first primitive swapped**, and the signature did not change, so thirty
  call sites across sixteen screens got painted leather, a bronze rule and corner filigree
  without one of them being edited. That is the whole reason the swap happens in the kit.

Two bugs found and fixed in the bridge on the way, both only visible in a browser: a
callback ref with a fresh identity each render, which React tears down and re-attaches —
an infinite loop; and an effect cleanup destroying the component during StrictMode's
simulated unmount, after which the ref never re-ran to rebuild it, so every panel
constructed successfully and then vanished. Teardown belongs to the ref alone.


### Added — the relic vault has a ceiling, and room is something you buy (Q5)

Answered by the owner on 2026-08-18: *"yes there should be a cap which can gradually be
increased (up until a maximum or something) with ingame currency."*

Without a cap nothing is ever sold. Relics drop from nearly every fight and ~95% of them
are designed as sell-fodder — that is the silver faucet — but a faucet with no drain means
the sell button is never pressed, the forge is never fed, and the query that lists the
vault grows for the life of the account.

- **250 loose relics to start, 50 more per purchase, 1,000 at the ceiling.** The first slab
  is 25,000 silver and each one after costs 1.3× the last, so buying all the way to the
  top is about 4.2M — expensive on purpose, since the alternative to buying room is
  pressing sell. All five numbers are `game_config`, retunable in Admin without a deploy,
  and the last purchase sells the *remainder* rather than being refused: a button that can
  never be pressed again is a worse last step than ten slots for the price of fifty.
- **Only loose relics count.** A relic on a champion lives there, not in the vault — so
  equipping is a legitimate way to make room, the pressure lands on hoarding rather than on
  collecting, and the Arena can still synthesise a bot's nine slots without a cap it has no
  business having.
- **A drop that does not fit is sold on the road, not lost**, and the results screen says
  so in a line. Losing it outright is the obvious alternative and the wrong one: farming
  ten runs is a single press, and a player who comes back to nine relics and no explanation
  has been punished for a cap they never watched themselves hit. Buying one in the Bazaar
  is refused up front instead — being handed silver back for a relic you paid for is
  nonsense.
- **Taking a relic off is refused when there is nowhere to put it**, in the sentence that
  says what to do about it.
- One gate, inside the one function relics are created by, rather than a check remembered
  at six call sites. Idempotent through `actionId` like every other spend.


### Fixed — a battle nobody could take a turn in, and a tutorial that greyed out the game

Both reported by the owner against the running box, and the first one is the worst bug
found in this pass.

- **Manual play had never worked.** `createBattle` builds the board, emits `battleStart`
  and stops: no turn meter has moved and `awaiting` is null. `start` handed that straight
  to the client — and the skill bar is keyed on `awaiting` naming an ally, so there was
  nobody to act with. The battle screen showed "Wave 1 · Turn 0" and **"Waiting for the
  server…"** for as long as the player was willing to look at it. The only ways forward
  were Auto and Retreat. It has been like that since P3, and nothing caught it because
  every test either pressed Auto, pressed Skip, or posted an action straight to the API —
  where a supplied action is applied to whoever acts first and `awaiting` is never read.
  A battle now opens by running the engine to the first decision the player actually has:
  meters filling, anything faster than the whole team taking its turn, and then the bar.
  The Arena opened fights the same way and is fixed with it; both guard the vanishing case
  where the opening itself ends the fight, rather than leaving a session marked active
  whose state says finished — one nobody could act in or be paid for.
- **The tutorial dimmed the entire game.** The overlay is a signpost rather than a fence —
  `pointer-events: none`, with the server enforcing order — and when it has something to
  circle it cuts a hole in the dim, which is the design. When it has *nothing* to circle it
  fell back to a single full-viewport pane at 72% black: the whole game greyed out and
  apparently untouchable, while every click went straight through it. Steps 1 and 2 are
  both like that, so it was the first thing a new account saw, and step 1 is a fight — so
  it dimmed the battle it was asking the player to win. With nothing to point at there is
  now no dim at all; the parchment says the line and the game stays lit.

Covered by two browser cases that fail without the fixes: a fight must hand the player a
turn and take it (pressing a *skill*, not the two buttons that skip the game), and no pane
may ever cover the whole viewport while the Wardenmaster is talking.


### Fixed — signing out left the last account behind, and four more from the QA pass

The rest of the ranked list, and the first one is the one worth reading twice.

- **Signing out forgot three stores out of eighteen.** Sign out on a shared machine, sign
  back in as somebody else without reloading, and the first paint of the roster was the
  previous player's champions, the mailbox was their mail, and `resume()` — which only asks
  the server when it is holding no battle — showed their fight. Every screen re-fetches on
  mount, so the wrong data was replaced within a second or two, which is exactly why nobody
  caught it. There is one place that forgets an account now, and a test that fails when a
  store with a `reset` is missing from it — because the failure mode of the alternative is
  silence, in a later phase, by somebody who did not know the list existed.
- **The playback clock outlived its screen.** A fight's playback is one `setTimeout`
  chained into the next, owned by the store rather than by the battle screen, and nothing
  stopped it when that screen went away — so signing out mid-fight left health bars moving
  and hit cues playing over the sign-in form. Paused on the way out, picked up on the way
  in, and the fight itself untouched either way.
- **A retried start was told it was already in a battle.** An `actionId` has covered every
  other mutation since P0; opening a fight had none. So a dropped response — a phone on a
  train, which is the whole reason idempotency exists — left the player holding "You are
  already in a battle. Finish or retreat first." about a fight they could not see and had
  paid the energy for, with nothing to do but retreat out of it. Both entry points carry
  one now, campaign and Arena, and the id survives the retry it exists for: it is kept
  until a start succeeds and reused for as long as the request is the same one, rather than
  minted fresh per call, which would have made the retry a *second* request and changed
  nothing.
- **The mailbox had no ceiling.** Mail without an expiry is never pruned and an operator
  batch-send adds a row to every account at once, so reading "all of it" was a query that
  grew for the life of the account — and the top bar's unread pip was hydrating every
  message's title, body and attachments on every player snapshot in order to count them.
  The list is the newest hundred and says when it is capped; the counts are two integers
  off an index, over the whole mailbox, so a capped list never makes the pip lie.
- **A missing sprite failed silently, and a missing manifest failed forever.** The manifest
  latch that stops eight units racing for the same file kept the *rejected* promise too, so
  one blocked request at boot meant no sprites for the rest of the session with no request
  ever made again. And every texture load ended in `.catch(() => null)`: an enemy that
  never appeared left nothing anywhere to say why. The latch clears on failure, a manifest
  that cannot be read degrades to static sprites rather than to nothing, and a missing path
  is named in the console once — once, because a battle asks for the same eight units on
  every frame of playback.
- **Settings was a screen that did not exist.** It has been a modal since P8, deliberately,
  so it opens over a fight as well as over the Haven — but it kept a row in the screen
  registry that nothing navigated to and the shell had no branch for, so reaching it would
  have shown the "not built yet" placeholder.

One finding is deliberately **not** fixed here: the relic vault has no cap, and
`GET /player/gear` returns all of it. That is a design decision rather than a bug — a cap
is what makes selling and dismantling matter — so it is **Q5** in `USER_QUESTIONS.md` with
a recommended default, not a change made on the owner's behalf.

### Fixed — a missing file answered 200, and handed back the game

The SPA fallback has been `try_files $uri $uri/ /index.html` since P0, which is correct for
a route and a lie about a file. Every asset the deploy did not ship came back as an HTML
document with a 200: an `<img>` drew the browser's torn page, `fetch('/sprites/manifest.json')`
died with a JSON parse error about `<`, Pixi got a texture it could not decode — and nothing
in the network tab said *missing*, because every one of them was a success. The half-finished
asset sync this pass started from was invisible for exactly that reason.

- **Anything naming a file is a file.** A last regex location 404s any path ending in an
  extension. It is written last on purpose: nginx tries regex locations in the order they
  appear, so the dotfile deny and the font, audio and home-screen-icon rules above all keep
  their say, and only what nothing else claimed reaches it. Safe because the game client has
  no URL routing at all — every screen is a value in a store, all of it at `/` — so nothing
  below `/` is a route.
- **`/sprites` and `/icons` are locations of their own now**, rather than whatever `location /`
  did with them. They are unhashed paths — a redrawn champion reuses
  `champions/<key>/idle/frame_000.png` — so they revalidate daily instead of being immutable
  like the hashed bundles, and the sprite manifest is `no-cache` so art that shipped this
  morning is drawn this morning. Before this they carried no cache policy at all and browsers
  guessed.
- **And the check that would have caught it starts the server.** "The nginx site parses" is a
  much weaker claim than it reads as: this config parsed perfectly for ten phases while doing
  the wrong thing. `scripts/CHECK_DEPLOY.sh` now renders the site onto a free loopback port,
  starts nginx against a tree of fixture files, and asks it twenty-one questions — routes that
  must fall back, files that must be served, absences that must 404, and the `.env` that must
  never be either.

### Fixed — the QA pass: the battle screen was invisible, and nobody could have known

A full read of the game against a running box, ranked, and then fixed. The three findings
below share one cause, and it is the interesting part: **nothing in this repository could
see what the game looked like.** Forty browser tests drive it through roles and text — the
right way to test behaviour, and completely blind to paint. The battle screen shipped with
an opaque full-viewport overlay across it: every control present, every assertion green,
and nothing on screen but the top bar.

- **The battle screen rendered nothing.** `BattleScreen` mounted a second `<PixiStage>` on
  top of the one the shell already keeps for the session. That wrapper is `position: fixed;
  inset: 0` with an opaque background, and being later in the DOM at the same layer it
  painted over the HUD, the turn order, ×1/Skip/Auto/Retreat and the whole skill bar. Now:
  one stage, mounted once outside every auth branch; the shell's default scene never
  replaces one a screen has already attached; and the battle's `.stage` is a transparent
  window onto the shared canvas rather than a second one. `BattleScene` also had no
  `resize` — `Scene.resize` is optional and nobody had noticed, because this screen was
  never visible — so the fight drew at its 960×540 design size in a corner of the window.
- **34 of 37 champions had no face.** Only three of the eight sprite units ship an
  `avatar.png`; the art-pending champions share a placeholder asset that has none, and
  `ChampionCard` rendered a bare `<img>` with no `onError`. The roster, the Chronicle and
  the card a Mistgate pull turns over were full of the browser's torn-page glyph. A
  portrait is now either a loaded image or a hooded silhouette from game-icons.net, and
  never a broken one. The dock's seventeen hand-typed emoji glyphs went the same way — the
  brief has said icons come from game-icons.net since P0, and the navigation was the one
  place still drawing its own.
- **One bad render blanked the whole game.** There was no error boundary anywhere, over
  sixteen screens whose content comes from a database an operator edits live — a malformed
  entity reaching a render path is the failure this design makes *most* likely, and React's
  answer to an uncaught one is to unmount everything: a white page, no dock, and no way
  back but a manual reload. Two boundaries now, at two depths. Around a screen, so the dock
  and the top bar survive and the player walks out of the broken room; around the shell, for
  a failure with nothing left to preserve, where the honest offer is a reload.

And the coverage that would have caught all three on its own, because a fix without one is
a promise: `e2e/visible.spec.ts` asserts that the things a player must be able to see are
the topmost elements at their own centres — not how they look, which would fail on a font
hint and teach everyone to ignore it — and that the page holds exactly one canvas, that no
image is broken, and that the icon sprite is inlined. `e2e/resilience.spec.ts` breaks a
screen from outside the app, by answering one endpoint with a shape the client does not
expect, and watches the game stay standing around it.


### Fixed — one root-owned file could stop the box updating itself

Found on the real VPS, on the first update after P10. Five files in the checkout belonged to root rather than to the app user — left by a deploy that once ran git as root, months earlier. `git checkout` wrote most of the release, reached them, could not unlink them, and stopped; the retried `git pull` then reported the half-applied tree as eighty files of "local changes" and a hundred untracked ones, five times over. Two hundred lines of git output for a `chown`, and no way forward without resetting the checkout by hand.

- **Ownership is checked before git is touched**, and the failure is one line naming the command that fixes it.
- **A deployment checkout is reset, not merged.** Nothing is ever authored there and every build is copied into `releases/`, so the only correct outcome is "exactly what origin says" — `pull --ff-only` was the wrong verb, and it failed on any drift at all. The update now recovers from a partially-applied checkout by itself.
- **The dirty-tree warning shows what it found** instead of asking about files it will not name, and says plainly that they will be discarded.
- **`--content-only` shares the same implementation.** It carried its own copy of the fragile pull, so a checkout one mode could not recover from was one the other mode could.
- **And the script no longer rewrites itself while running.** `UPDATE.sh` lives in the checkout it resets, and bash reads a script incrementally by file offset — so replacing the file mid-run can splice the new content onto the old at whatever byte it had reached. It re-runs itself from a throwaway copy of the whole `scripts/` directory first, and deletes it on the way out. This has been latent since the first deploy; a release that changes the deploy scripts is what makes it bite.

### Added — the mist closes between screens, and Reduce motion means something (P10f)

Two more controls that looked connected and were not.

- **A 200 ms mist wipe on every navigation.** Without it a dock press swaps one dense screen for another in a single frame and the eye has to re-find everything; a beat of mist gives the change somewhere to happen. It is drawn *over* a navigation that has already happened rather than gating one — the new screen is live underneath and the wipe never takes a click — so pressing two dock tiles quickly is exactly as fast as it was. DOM rather than the Pixi overlay the design doc first imagined: a full-screen gradient is one composited layer the GPU handles for free, where Pixi would contend with the battle ticker for the single core the production box has.
- **Reduce motion is the game's setting now, not only the machine's.** It has been in Settings since P8, writing to the server and changing nothing anybody could see: the stylesheet honoured `prefers-reduced-motion`, which is the operating system's answer, so a player who wanted a calmer interface had to change it for their whole computer. Both answers are now honoured identically.
- **Sprite idle loops are untouched by either.** They are the game being alive rather than the interface being busy, and the brief asks for them always — so the setting's line now reads "Champions keep breathing" rather than promising something it should not deliver.

### Added — installable, snapshot-able, and checked before the deploy (P10e)

- **Mistvale installs.** A manifest, a service worker, and home-screen icons at every size a browser asks for — exported from the one mark the repo already holds (`pnpm icons:pwa`) rather than drawn again, so redrawing the gate redraws every icon. Landscape-locked, standalone, and a maskable variant so Android does not crop the arch.
- **The worker leaves the server alone.** Mistvale is server-authoritative, so a cached API response would be a lie about an account that a player could act on: `/api` is untouched under every strategy. What it does cache is the shell (network-first, so a deploy lands on the next load) and the content-hashed assets (cache-first, because those URLs are immutable). Registered in production builds only — one that claims the page in development intercepts Vite's modules and its HMR socket.
- **`pnpm content:export` puts the live content in git.** Content is data and the database is its truth, which means the whole game's balance and copy lives somewhere `git log` cannot see. The snapshot is sorted and byte-stable, so two exports of identical content are identical files and `git diff content-snapshot/` after an operator's evening says exactly what they changed. Only live content — nobody's half-finished draft gets committed on their behalf.
- **`scripts/CHECK_DEPLOY.sh`, in CI.** The operations scripts and the nginx site are the least-exercised code here — nothing runs them until a deploy, which is when a typo costs most. Every script is parsed and shellchecked, the nginx site is rendered and handed to nginx's own parser, and every `__PLACEHOLDER__` in a template is checked against the ones `render_template` actually substitutes.
- **`docs/LAUNCH_CHECKLIST.md`** — the list for the day, including the step most often skipped: restoring a backup *before* there are players, while the only account it can lose is a throwaway one.

### Added — Mistvale makes a noise (P10c)

The volume sliders in Settings have been on screen since P8 and connected to nothing. They are connected now.

- **Sound is content.** `soundCue` is the twenty-fourth content type: a key, a bus, and either a recording or a handful of envelope-and-oscillator numbers. What the game sounds like is retunable by an operator in Admin without a deploy, and a dropped-in audio pack replaces a synth voice one field at a time rather than in a commit.
- **Twenty-seven cues, and no audio files.** This build environment cannot reach Kenney or OpenGameArt, and rather than ship inert sliders the cues are synthesised: short shaped tones and filtered noise bursts, which is what a pixel game's interface has always been made of. Nothing to licence, nothing to credit, nothing to download. **Confirmed by the owner (Q4, 2026-08-18): synthesised stays the voice at EA.** A CC0 pack remains a drop-in whenever one is picked — one field per cue, no code.
- **The vocabulary is small on purpose.** A distinct noise per control sounds like a switchboard. What a player learns is a handful of meanings — something happened, you spent, you gained, no, something rare — and each is one cue used everywhere it applies.
- **A press is a property of the kit.** `Button` and `Modal` make the sound, so a press is a press wherever it happens and a screen cannot forget. A `danger` button answers with the spend cue rather than the press — releasing a champion is giving something up — and never with the refusal, which belongs to an action the server turned down.
- **Battle rides the playback clock**, like everything else that gives a fight away: hits, the ones that crit, healing, a death, a wave turning, and how it ended. Multi-hit skills announce the first landing only, and a throttle catches what that does not — five hits inside a third of a second is five hits, not a buzz.
- **Nothing plays before the player has touched the page.** Browsers refuse audio started without a gesture and a refused context stays refused, so a cue asked for too early is dropped rather than queued: a click nobody made must not arrive late.
- **A missing cue is silence, never an error.** A client older than the bundle, or a cue an operator switched off, makes the game quieter and nothing else.
- **Music is a bus with no track**, and the slider says so instead of pretending. The setting is kept for when there is one.

### Fixed — a level-up never refilled the energy bar (P10d)

ECONOMY_BALANCE has said since P0 that a level-up fills the bar and allows overfill; it is one of the three listed sources of energy, and it is what paces a new account's first evening — level, and keep playing. The reward path wrote the new level and left the energy column alone, so the only energy anybody ever got was the twenty they registered with and the clock. Nothing had ever asked, which is why it survived nine phases.

- **Filled to the new cap**, which is larger than the old one, and the regeneration clock is restamped so the refill does not read as hours old on the next request.
- **An overfilled bar is left alone.** Refill items and event payouts can push a bar past its cap, and a level is good news — it must not be the thing that trims it back.
- **A grant with no level in it still changes no energy.** The common case by far is silver from a cleared stage, and a payout is not a refill.
- Four levels arriving in one bundle — a mission milestone can do that — fill once, to the cap of the level actually reached.

### Fixed — a mistyped id said the server was broken (P10d)

`GET /api/profiles/not-a-uuid` answered **500 "Something went wrong on our end."** Seven routes did, on paths reachable from every player name in the game. Nothing was actually wrong: the id went to a `uuid` column, PostgreSQL raised 22P02, and the error handler — correctly refusing to guess — called it ours. A typo'd or stale profile link therefore told the player the game was down and paged whoever was on call.

- **Path and query are caller input, and are now checked like one.** Bodies have always gone through Zod; parameters went through a cast (`request.params as { id: string }`) that asserted something nobody had verified. Twenty-nine of those are now `idParam` / `keyParam` / `uuidQuery` (`lib/params.ts`).
- **A malformed id answers exactly as a missing one does** — `NOT_FOUND`, same code, same message. Telling the two apart hands anyone who asks twice the shape of our keys.
- **The error handler maps 22P02 as a backstop**, so a route written next month without the helper still cannot claim the server broke.
- **Page sizes are clamped rather than trusted.** `?limit=999999` reached the database intact and `?limit=-5` became a `LIMIT` PostgreSQL refuses outright; both now land inside 1–200.
- A sweep test walks every parameterised route with a garbage id and fails if any of them answers 500 — adding a route and forgetting the check fails in CI rather than at three in the morning.

### Fixed — everyone behind one address shared a rate limit (P10d)

The global limiter is documented as bucketing authenticated traffic per account. It never did: at Fastify's default `onRequest` hook `request.account` has not been resolved yet — a route's own `preHandler` does that — so the key fell through to the IP and 300 requests a minute was the whole allowance for a household, a student flat, or anyone testing two accounts side by side. Counted at `preHandler` now, with a test that fails if it slips back.

### Verified — the box, measured rather than assumed (P10d)

Every budget in ARCHITECTURE §9 now has a measured figure beside it, and all of them are an order of magnitude inside: 6–22 ms p95 across the hot reads against a target of 100 ms, 199 MB of Node against 1.2 GB, 302 KB of gzipped JS against 1.5 MB. Two things worth knowing:

- **The content bundle is only small over the wire.** 708 KB of JSON leaves the origin uncompressed and nginx is what makes it 80 KB. A deploy that bypasses nginx, or drops `application/json` from `gzip_types`, is nine times over budget with nothing looking broken.
- **The sequential scans on `stage_progress` are the planner being right**, not a missing index — at fourteen rows a scan beats an index, and both composite indexes are there for when it is not.

### Fixed — every fight in the game was spoiled before it was watched (P10a)

Auto-battle asks the server to resolve the whole fight in one response, and the results modal was keyed on *that response* rather than on the playback that follows it. So it opened about three seconds in — victory banner, stars, reward list — on top of a HUD still reading "Wave 1 · Turn 0". The fight then played out underneath a modal announcing how it ended.

- **A battle runs on two clocks, and they are now named.** The server's, which decides when there is nothing left to send it, and the playback's, which decides when the player has seen the fight. Commands read the first: Auto and Retreat go dark the moment the session closes, because pressing either would earn an error rather than an action. Everything that gives the outcome away reads the second: the results, the "fight is over" line, and the wallet refresh.
- **The wallet moved with them.** The top bar is on screen throughout a battle, and silver climbing at turn three announces a win as plainly as the modal did. It re-syncs when the player reaches the end.
- **Skip is the way past a fight you would rather not watch**, and it is now the only one, which it should always have been. While the server is still thinking the bar says "Resolving…"; once the fight on screen is a recording, it says so and names the button.
- The cold open's near-death beat — tuned in P9b, gated by `pnpm sim`, and never once visible — is visible.
- Retreating mid-playback used to re-apply the whole event log on top of a view that already held part of it, landing every blow a second time on the way out. It now applies only what the player had not yet watched.

### Fixed — one keystroke closed two dialogs (P10b)

Every modal portals to the same layer, so which of two was "on top" was whichever mounted first — a detail nobody chose and nothing tested. Open the relic picker over a champion sheet and press Escape and both closed, dropping the player back on the roster; Tab wandered out of the top dialog into the one behind it, because that one's focus trap was still running.

- **Overlays register when they open, and the last one in owns the keyboard.** Escape and backdrop clicks belong to it alone, and its depth is added to the modal layer so two dialogs stack in the order the player opened them. The Mistgate's reveal cinematic joins the same stack, so a card landing over it lands on top of it rather than behind it.
- **Focus follows the dialog rather than the stack.** Opening one over another remembers the element inside the lower one and gives it back on close, so a picker dismissed over a champion sheet returns the caret to the slot it was opened from — and no longer yanks focus back to the first button on every re-render of the screen underneath.

### Added — something opened (P9d)

Features have always unlocked on account level, and until now they did it in silence: a dock tile shrouded on Tuesday was simply lit on Wednesday. That is the moment the whole gating structure exists to create.

- **One card per unlock, at the moment it opens**, with a line about what the thing is and a way straight to it. Level 8 hands over the Arena *and* the Hall of Valor, so they queue rather than merge — "2 things unlocked" would be worth less than either.
- **Derived from the level, not from watching the flags flip.** A flag diff cannot tell "just unlocked" from "unlocked before this tab was open", so the first load of every session would have celebrated everything the account ever earned. The last celebrated level is remembered per account, seeded silently the first time a browser sees it: somebody returning at level 30 is not owed a parade for last month.
- **A level-up that arrives four levels at once celebrates all four gates.** A mission milestone can pay that much, and every gate it crossed is one the player earned.
- The copy is written by hand but the levels are not — they come from the server's own `UNLOCK_LEVELS`, so a gate moved there moves the celebration with it, and a new flag added without copy fails the build rather than opening a silent feature.
- **Never over a fight.** A level-up almost always arrives *from* one, and the results are already a modal — a second stacked on top would bury the loot somebody is reading under news about a screen they have not asked for. The queue waits until they leave the battle, which is a better moment for it anyway.

### Changed — the tutorial's rewards stopped being a gate

What a step paid used to appear behind its own acknowledge button. It now rides along on the *next* step's card. The second click was a stage the player could not always reach: a step that opens a modal — the starter choice does — puts it on top of the parchment, and a reward card nobody can dismiss is worse than one nobody was asked to.

### Verified — the first evening, on every screen

The zero-content pass. A brand-new account — no champions, no relics, no clears, nothing farmed — now has a browser test that opens every screen it is allowed into and checks the shrouded ones say when they open. Every screen renders, none reports an error, and every locked station names its level.

One thing the pass established rather than fixed: **an empty roster is unreachable.** The starter choice is a modal with no dismiss, so an account with no champions is always looking at the one screen that fixes that. The Champions screen keeps its "No champions yet" copy as a guard rather than a state.

### Added — the Wardenmaster, on screen (P9c)

The fifteen steps existed and were invisible. Now there is an overlay for them.

- **A dim with a hole cut in it.** The thing a step points at keeps its own colours and stays clickable; everything around it is scrimmed. Four panes rather than a giant box-shadow, so the target really is untouched rather than tinted.
- **The overlay is a signpost, not a fence.** It never blocks input, and it never traps anybody in a modal until they press the right button. It can afford that because the *server* is what enforces order — a step closes when its goal is met and not before.
- **It takes you there once.** A step names a screen; if the player is elsewhere, the overlay navigates — once, when the step opens. A player who then wanders off is exploring, which is the thing the tutorial is trying to teach, so it does not drag them back.
- **The cold open finally has a door.** It is the only battle in the game not started from a map, because there is no map yet and no team to bring, so the empty battle screen offers it — and only while the tutorial is actually waiting on it. The check is the step's own goal naming a `tutorial` stage, so re-cutting the script moves the button with it.
- **Continue is dark until the server says otherwise**, and says which of the two reasons it is dark: "Not yet" when the player is in the right place with the thing undone, "Go and do it" when they have wandered.
- **Skipping asks once and means it.** The confirmation says it is final, because it is. The button says "Skip tutorial" rather than "Skip", because a battle has a Skip of its own for jumping past playback and during the cold open both are on screen at once.
- **The starter choice waits for its step.** It used to open on any empty roster, which during the opening two steps meant a modal on top of the Wardenmaster blocking the very button that leads to it. It now appears when the script reaches it — or, outside the script, whenever the roster is empty, exactly as before.
- **The overlay re-reads while a step is open and unfinished.** The shell asks again on every screen change, which covers most of the script but not a step *completed where it was opened* — the cold open starts and finishes on the battle screen, so nothing navigates and nothing would have said the fight was won. A three-second poll bounded to "open and waiting" is a handful of requests across the first hour and none ever again.
- **Pointing is an attribute, not a wiring diagram.** An element carries `data-mv-highlight="dock:campaign"` and the overlay finds it. The Dock does not import the tutorial and the tutorial does not know what a Dock is — and half the things worth pointing at live inside a `map`, where a ref-and-hook registry would have needed a component extracted per call site. Eleven targets are marked: every dock tile, each campaign stage by key, the Mistgate's pull, the relic vault, the forge, the day's quest list, feeding a champion, the Bazaar's stock and the starter choice.
- Content deliberately is **not** validated against that list. Client and content deploy separately, so a step pointing at something this build does not have degrades to a centred dialogue rather than failing to publish.

### Fixed

- **A Depths test counted the cold open as a dungeon floor.** It filtered stages by "not campaign", which was true of every Depths floor until a `tutorial` stage existed. It now names the three modes that *are* the Depths.

### Added — the cold open (P9b)

The game now opens on a fight nobody earned. Three starters, borrowed at a strength a new account will not reach for weeks, against a Sskarn ambush on the Sunken Road — and then the Mistgate flickers and only one of them stays.

- **The stage carries the team.** `tutorial` was a battle mode that had sat unused in the enum since P0; a stage in that mode now names the champions it is fought with, how grown they are and what they are wearing. Nothing is minted into the roster, so nothing has to be confiscated a minute later when the starter choice happens — which was the alternative, and it would have made the first real decision in the game feel like a repossession.
- **It is the same fight for everybody.** The borrowed relics are rolled from the *stage key* rather than the battle's seed, so a beat tuned once stays tuned. The battle itself still runs on a fresh seed like every other fight.
- **The near-loss is authored, not scripted, and it is measured.** No outcome is forced anywhere in the engine — the third wave is simply built to hurt: Gorrakh the Broodtyrant, a chapter-3 warlord with no business this far west, flanked by two spitters. `pnpm sim` now fights the stage with the borrowed team and gates on *both* halves of the beat: that it is never lost, and that somebody is driven to about 57% health along the way. The first version of this fight was won at full health in eight turns, which is how the gate earned its place.
- **The measurement had to be taken mid-fight, not at the end.** A team with a healer finishes topped up, so the closing frame said "untouched" about a battle that had been close. The gate steps the fight and records the lowest health anybody *reached*, which is what the drama beat actually is.
- **It costs nothing and pays nothing**: no energy, no silver, no champion XP, no stage clear. It cannot be run in a batch. It does still *report the win* — the tutorial step that opened it is listening for exactly that, and a free fight once per account is not a farm.
- Publish validation refuses a borrowed team on any stage that is not a tutorial one — it would be a roster the player never chose, silently replacing the one they did — and refuses a tutorial stage that carries nobody.
- The script is **fifteen steps** now, with the cold open at the front. Nobody's progress moved: it is stored as a position, which is what that decision was for.

### Added — the tutorial engine, and the script it runs (P9a)

The Wardenmaster now walks a new warden from the first mist to the point the Valewarden's Path takes over. Fourteen steps, all of them content.

- **A step's completion condition is an ordinary goal** — the same `{type, target, filters}` a daily quest uses. So the tutorial is a *subscriber* to the one fan-out everything already reports to, and no module changed to gain it: the battle module still only knows that a battle was won. It is the fourth listener, and the goal DSL named it by name a phase before it existed.
- **A step with no goal is a beat** — the Wardenmaster says something and the player presses on. Most of the script is pointing at things.
- **`grantsBefore` pays for the step it belongs to, as that step opens**, so "here are two sigils, now go and pull" is one step rather than two, and the ledger still says which step handed the sigils over. A step can hand over a **relic** the same way, rolled on arrival — the step that says "put a piece on somebody" cannot depend on a drop, and chapter 1's trash stages part with one about two runs in five.
- **The XP along the way is sized against the level curve**, on purpose: features open on account level, and a step pointing at a screen the player cannot reach is a step nobody finishes. The script clears each gate before the step that needs it — the calendar by step 2, the forge by 4, quests by 6, the Bazaar by 8.
- **Progress is a position, not a step key.** An operator who renumbers the script does not strand everybody halfway through it on a number that no longer exists — which is also what lets the cold-open battle become step 1 later without moving any player state.
- **Skipping means it.** Nothing already earned is taken back and nothing further is paid; a tutorial that could be re-entered would have to decide what to do about the steps it already paid for, and the honest answer is that nobody wants it back.
- **Two new things the game reports**, because two steps needed them and neither existed: a relic being equipped, and a single quest being claimed. Both are ordinary goal types now, so a daily or an event can ask for either without a deploy.
- **Choosing a starter reports a champion obtained.** It always should have — the goal type says "however it arrived" — and the tutorial's second step is the one that noticed.
- **`tutorialStep` is the twenty-third content type**, editable in the Admin Suite like everything else. Publish validation refuses duplicate numbers, a gap in 1…n, a reward naming an item that does not exist, and a goal filter its type does not declare.
- An account reset now clears the whole tutorial rather than just the cursor — a fresh account that came back still marked "skipped" would be one the script refuses to greet.

### Added — the nightly prune, and a button for it (P8i)

The scheduled pass now clears what has gone stale. Worth saying plainly what it is *not*: **it resets nothing.**

- **The job is about disk, never about state.** Energy, arena tokens, quest periods, event windows, mail expiry and the login calendar are all worked out against the clock when they are read, so a night the job does not run costs storage and nothing a player could notice. That is the design and not a happy accident — the moment something needs this job to have run, an hour of downtime becomes a bug report.
- **What it clears:** finished battles with the event logs they carry, mail that expired a while ago, the economy trail past its window, and quest and event rows whose period is long gone. Quest instances are the volume — eight a day per active account, forever — so they are the reason this exists at all.
- **What it must never clear, enforced rather than commented.** The login calendar's position *is* `count(*)` over its claim rows: a prune that swept them would walk every player backwards through the month, with no symptom that pointed at the prune. There is now a named list of protected tables and a test that runs the job at its most destructive legal setting and fails if any of them loses a row. An active battle is protected the same way — somebody who left a fight open over a weekend comes back to it.
- **Every retention window is a config key**, so an operator on a filling box can shorten one without a deploy, and lengthen one before an investigation.
- **An operator can run either job now** rather than waiting for 04:00 — useful right after changing a window or publishing content the bot ladder should pick up. It is a closed list of two, not a name that reaches anything callable, and every run is audited.

### Removed — battle replays and shareable battle-log links

Dropped from the plan at the owner's request. It had been approved in the 2026-08-16 review as one of eight suggested additions and scheduled into P8; no part of it was built, so nothing is being taken away from anybody.

Worth recording what remains, because it is not nothing: the engine is deterministic and seeded, the seed is stored per battle, and the event log is persisted. A replay was always going to be *a seed and a log* rather than new machinery, and both are still there — serving the client's own battle rendering and the Admin inspector. What is gone is the plan to build a viewer on them and, more to the point, the share link: a public unauthenticated surface, with its own privacy questions and its own abuse surface, for a game whose entire audience is signed in.

### Added — the public profile card (P8g)

Every warden now has a card, and every name in the game leads to one.

- **What the card shows is what the account did**: level, arena tier and where that sits on the ladder, how much of the roster it has met, how far into the campaign it has been — "7-4 Hard", with a harder stage counting as further than a deeper one, because the difficulty is the wall that gates everything after it.
- **What it leaves out is the point of it.** No silver, no crystals, no account name, and nothing that would say whether a card belongs to a bot. A card that led with a wallet would make the game about the wrong number, and a card that leaked one would be a privacy bug rather than a design choice — so a test fails if any of them ever appears on it.
- **Four champions, chosen or not.** A player picks up to four to be known by, in the order they pick them. Anybody who has never chosen gets their strongest instead, so a card is never blank and the picker is something to reach for rather than something to get past. A champion released after being chosen simply drops off the card.
- **Names lead somewhere.** The chip in the top bar opens your own card — the same one everybody else sees, which is what makes choosing your four a decision rather than a form — and the Arena's ladder rows and opponent offers open theirs.

### Fixed

- **The Haven camp had a "Battle" tile.** It built its station list from "every screen except the Haven and Settings", so it had quietly adopted every screen added since — including the battle screen, which a player could walk into with no battle behind it. It now uses the same predicate the dock does.
- **The energy counter could spin the interface.** It handed `Date.now` to React as its snapshot of the clock — a value that is different every time it is read, so there was no fixed point to settle on. It had been latent since the first build and only surfaced when the top bar gained a second thing to watch. The instant is now cached per tick, which also means one shared timer rather than one per component, and two things animating against the same moment rather than two slightly different ones.

### Added — mail, news, and the operator's composer (P8f)

The game can talk to a player directly now, and hand them something while it does.

- **A mailbox.** Gifts, apologies, and the occasional word from the Vale. Attachments are the same reward map everything else pays in, so an operator can send anything the game already knows how to give — and it lands in the player's economy log like every other grant. **Collect all** is one act: one transaction, one payout, one ledger row, rather than twenty separate gifts arriving one at a time.
- **A message cannot pay twice.** A retried claim replays what it already paid; a second one is refused; an expired message says so. This is the only surface in the game where an operator hands out currency directly, which is exactly why it is the one where "collected once" had to be structural rather than careful.
- **Nothing expires on a schedule.** A message is gone when its moment has passed, worked out when the inbox is read — so a server that was down for a week comes back with precisely the right inbox and nothing to catch up on. Sweeping the rows afterwards is about disk space, not correctness.
- **The composer sends to one player or to everybody**, and to everybody means *everybody at once*: the fan-out happens inside a single transaction, so a send either reaches the whole game or none of it. Bots are never recipients. Attachments are checked against the live item catalogue **before** anything is written, because unlike content there is no publish step between an operator typing a key and a thousand players opening a message that pays nothing. Every send is audited and carries the operator's own name, so a player who asks about it can be answered.
- **The send log answers the question that actually gets asked** — not "what did row 412 do" but "did they take it": one line per send, with how many it reached, how many opened it and how many collected.
- **News posts are content with a window.** Write Friday's patch note on Tuesday, publish once, and it appears by itself — the same trick the events use, and the reason news is not a table with a scheduler bolted to it. A seeded welcome post explains the loop to somebody who has just arrived; a patch-note template ships alongside it, deliberately switched off.
- **A post can never inject markup into a player's browser.** Bodies are markdown-lite and are rendered as text — no HTML, no sanitiser to keep current, nothing to get wrong. "We trust our own operators" is not an argument that survives one compromised session, and a feed reaches everybody at once.

### Added — the login calendar and the welcome track (P8e)

A reason to open the game that costs nothing to keep, and a first week that hands a newcomer the things the campaign is slowest to give.

- **Two tracks.** The **calendar** is thirty days and comes round forever: sigils on 7 / 14 / 21 / 28, crystals on the fives, and day 30 an **Epic selector** — a choice of four, one per role, not a roll. Thirty days of turning up should end in the champion you wanted rather than the one the game picked for you. The **welcome track** is seven days walked once, ending in two Gleaming Sigils and a relic set: four Ironroot and two Swiftwind, which is two copies of the health bonus and one of the speed bonus, so it teaches that sets stack and that two can be worn at once — and leaves the three accessory slots to earn.
- **A day is given on the Nth claim, not the Nth of the month.** Miss a Tuesday and you lose that Tuesday, not your place in the track. This is the whole design: a calendar that rewards showing up rather than punishing a holiday. It also means a track's entire state is "how many claims, and was one of them today" — so there is nothing here for the daily reset to do, and no counter that can drift away from the ledger that produced it.
- **No Radiant Sigil on the calendar.** The monthly quest set already pays one, and a second guaranteed Radiant every thirty days would turn the rarest pull in the game into a subscription. The track climbs to Mistwoven ×2 and stops.
- **The calendar is content, not code.** `loginTrack` is the twenty-first content type, and one entity holds a whole track rather than one holding a day — because a track is only ever read whole, and "re-cut the calendar for August" should be a single draft to review and publish rather than thirty. Publish validation refuses a gap or a duplicate in the day numbers, a second active track of the same kind, and any champion, item or relic set that does not resolve.
- **Arriving late costs nothing.** The screen opens at account level 2, and a player who gets there on their third evening still starts at day one — which falls out of the claim-counted rule rather than needing a rule of its own.

### Added — timed events (P8d)

Three things are running most of the week now, and adding a fourth is a row in a table rather than a feature.

- **Champion Training** (Mon–Fri) pays for levels, ranks, ascensions and mastery nodes. **Depths Delve** (Fri–Sun) pays for floors, floor bosses and energy spent below the Vale. **Summon Surge** (Sat–Sun) pays for pulls, weighted by sigil the way the source game weights them — a Radiant pull is worth five hundred Faded ones, which is roughly what it costs to get one.
- **The ladders are sized against real faucet budgets, not vibes.** My first pass had them two to three times too expensive, and Summon Surge sixty times: the source game's version assumes hundreds of pulls a weekend, and Mistvale's sigil faucet is about ten. Each ladder now puts a typical player at rung 4–5 of 6, with the budget it was derived from written next to it so a retune has something to argue with. Summon Surge's top rung is deliberately low enough that a single Radiant pull tops it — that is worth a second opinion once somebody has played a weekend of it (USER_QUESTIONS Q2).
- **An event's point rules are goals with a rate attached.** That is the whole framework: the same DSL a quest uses, plus "how many points per unit". So an event can count anything a quest can, a report type added later serves both at once, and Champion Training and Summon Surge are two rows rather than two features.
- **There is no scheduler.** The planning draft had a cron activating and expiring events; it does not exist and should not. A window is derived from the clock every time it is asked for, exactly like energy and arena tokens — so a server that was down all weekend comes back with precisely the right events live and nothing to catch up on.
- **Recurring, not a two-week calendar.** The plan was three staggered absolute windows re-cut every fortnight. At EA there is nobody running live-ops, and a calendar that has to be re-cut by hand is a calendar that stops being cut — so all three presets repeat weekly and the game always has something on. The absolute form is still there, and is what an operator schedules for a one-off.
- **Next week's ladder starts over, with nothing to reset.** A score belongs to an *occurrence* — the day its window opened — so last week's row simply stops matching, the same trick the daily quests use.
- **A ladder finished on Sunday evening is still collectable on Monday.** Points stop when the window shuts, but milestones already earned stay claimable for a few days after. Taking back something a player earned over a scheduling boundary is how you teach people not to bother next time.

**Worth knowing when you update the server:** the additive seed from P8b delivers content an install is *missing*, and deliberately never changes content it already has. That is the right default — it is what stops a deploy overwriting your tuning — but it means the three event ladders below arrive at whatever numbers your server first seeded. If you want the retuned ones, edit them in the Admin Suite or re-seed with `--force-content` (which replaces everything, so take the backup `UPDATE.sh` already takes).

### Added — the Valewarden's Path (P8c)

Eighty missions in ten arcs of eight, from the first battle in the Vale to the Coilmother's court. The chain is a *teacher*: each arc introduces one system and then asks the player to use it properly, so somebody who follows the Path never meets a wall they have no tool for.

- **Arcs open in order; the eight inside one are open together.** Strictly sequential would be a wall the day somebody cannot do step 43, and an entirely open list of eighty would not be a path.
- **Progress accrues on every arc, whatever is open.** Clearing two hundred Depths floors while arc 4 is in front of you leaves arc 8's "clear one hundred" already done — the floors happened, and a chain that pretended otherwise would punish playing well. The arc gate decides what you may *claim*, and nothing else.
- **The end of the chain hands over Aureleth, Voice of the Vale** — an exclusive Legendary the Mistgate will never roll, so eighty steps is the only way she exists — and the title **"Warden of the Reclamation"**, shown beside the profile name. The grant happens inside the claim's transaction: a claim that paid the crystals and lost the champion would be the worst bug in the game.
- **Publish validation covers the chain's own failure modes**: a goal filtered on a keep that was renamed, a reward naming a deleted item, a granted champion that no longer exists, two steps numbered the same, and a *gap* in the arc numbering — which would silently strand every arc past it.

### Fixed — four of the eight dailies could never be completed

Shipped broken in P8b, and my own tests hid it. They fabricated events and reported them straight to the goal engine, which proved the engine worked and proved nothing about whether the game ever sends anything. Four dailies — summon three champions, level a champion three times, four relic upgrade attempts, one Bazaar purchase — asked for events **no module emitted**. They could never complete, and the daily chest that needs all eight could never be opened.

Every remaining reporter is now wired: the Mistgate reports pulls and the champions they produced, the roster reports levels, ranks and ascensions, the forge reports attempts and the level reached, the Bazaar reports purchases, and the mastery trees report nodes learned. Account level and chapter stars are reported as *thresholds* — a goal asking to "reach level 20" is satisfied by the standing rather than by having watched the level arrive.

Two guards so it cannot happen again: a test asserting that **no shipped quest asks for an event nothing reports**, and two tests that complete a daily through the real endpoints rather than through a fabricated event.

### Fixed — a flaky Bazaar test

The one intermittent failure flagged during P8b, found and fixed. The Bazaar's window is rolled from a fresh seed each time, so which slots appear and what they cost differs per run; the test bought slot zero and assumed it was affordable. It now picks a slot the server says is actually buyable.

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
