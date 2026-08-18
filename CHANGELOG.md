# Changelog — Mistvale

All notable changes to the game are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · Versioning: pre-release `0.x` until **EA-0.1**.

## [Unreleased]

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
