# Mistvale — UI / UX Design

> Status: **Planning.** Desktop-first (mouse + keyboard), landscape-mobile-ready layout rules. This is the contract for the hand-built pixel UI kit — **no component library, no default-rounded generic panels**. Every screen below ships in EA-0.1 (features unlock progressively in-game, but the full UI exists).

---

## 1. Design language — "Forged in mist"

**Mood:** weathered dark-fantasy warcamp seen through drifting mist — heavy iron, old wood, ember light in the dark. NOT clean/flat/rounded "app" design; NOT neon mobile-gacha plastic.

> **Superseded in the 2026-08-18 design rework.** The client is built on **FantasyUIs** (Dark Ember) since D0, and the hand-built pixel kit below is retired. What survives verbatim is the *rules*: no serif, no generic rounded app design, every action acknowledged inside 100 ms, `prefers-reduced-motion` honoured. What changed is who draws the chrome. The palette section is rewritten below; §1.1's panel and button paragraphs are kept as the record of what was there before and are marked.

### 1.1 Foundations
- **Palette (design tokens, `styles/_tokens.scss`) — Dark Ember, one palette for the whole client:**
  - Ground: warm near-black `#0c0a09`, panels `#191612`, raised `#221d18`, wells `#0e0c0a`
  - Accent: ember bronze `#c2764a` (interactive glow, links, active states), soft `#e5b184`
  - Text: parchment `#e6dccb` (primary), `#9c9382` (secondary)
  - Element colors: Ember `#e5533d` · Tide `#3f8fd4` · Verdant `#57b35c` · Mist `#a06bd8` — **unchanged**, because an affinity colour is content, not chrome
  - Rarity colors: Common `#9d9d9d` · Uncommon `#38d13c` · Rare `#3b8ae0` · Epic `#a335ee` · Legendary `#ff8000` — the library's ramp, the one this genre's players already read without being taught
  - Danger `#c8412f`, Success `#38d13c`, Gold/currency `#c9a227`, the pack's glossy red `#7d1f1a`
  - **The values are `theme-dark-ember.css`'s own**, so a Sass module and a vendored component asked for "the accent" get the same colour to the byte. `fui/mistvale.css` overrides no colour at all — it binds the fonts and the rarity ramp and stops. The first cut of the rework did the opposite, bending the pack toward the old teal, and the result stopped looking like the library's own example screens; the direction is now art-first, and that is the rule.
  - Dark UI only at EA (games don't theme-flip); tokens make a later light/colorblind variant cheap.
- **Typography (NO serif fonts anywhere, ever):**
  - Display/headers: a chunky pixel font — **"Jacquard"-style is serif-risky, so: `Pixelify Sans`** (Google, OFL) for headers/logo flavor
  - Body/UI: **`Inter`** (variable, self-hosted) — pixel fonts at body sizes destroy readability; Inter keeps menus crisp and modern
  - Numbers in battle floaters: pixel display font, outlined
  - All fonts self-hosted (no external requests), `font-display: swap`
- **Panel system (superseded — see the note above; kept as the record of the pre-rework kit):** Kenney Fantasy UI Borders as 9-slice `border-image` (Default set for standard panels, Double set for modal/hero panels). We recolor/tint via CSS filters + our own overlay textures (subtle noise + vignette) so it reads "Mistvale", not "asset pack". Custom-drawn pixel corner ornaments added in P10 polish.
- **Buttons (superseded — the library paints all four variants now):** 3 tiers — Primary (embossed iron + teal glow edge), Secondary (flat iron), Tertiary/text. Pressed = 1px downshift + darker bevel (pixel-authentic), disabled = desaturate + no glow. Focus ring (keyboard) = 2px teal dashed — accessibility is not optional.
- **Iconography:** exclusively **game-icons.net** (CC BY 3.0) for EA — flat white SVGs tinted by token colors, on pixel-frame chips. Full icon map §6. Attribution page in Settings → Credits (license-compliant), plus `CREDITS.md`.

### 1.2 Motion principles ("highly animated, feeling alive")
- Ambient life on every screen: mist drift shader layer (Pixi) behind Haven + battle; torch/ember particle accents on key panels; idle loops always playing wherever a unit is shown (roster cards use the 9-frame idle, not stills).
- UI micro-motion: panels slide+fade in 120–180 ms staggered 30 ms; number count-ups on resources; reward chests burst with particle + easing pop; button hover = glow pulse; tab underline slides.
- Feedback rule: **every** player action gets sub-100 ms visual+audio acknowledgment (press SFX, coin clink, forge clang, summon whoosh). The audio half lives in the `Button` and `Modal` primitives rather than in screens, so it is a property of the kit: a press is a press wherever it happens, and a screen that forgets to make a noise cannot exist.
- **Sound is content.** Each cue is a `soundCue` entry naming a bus and either a recording or a few synth parameters, so what the game sounds like is retunable by an operator and a dropped-in pack replaces a voice one field at a time. Screens name *what happened* (`CUE.relic`, `CUE.denied`) and never how it is produced. Battle cues ride the **playback** clock, so a fight resolved thirty seconds ago is heard as it is watched.
- Restraint rule: durations ≤ 250 ms for navigation; long celebratory moments (summon reveal, victory) are skippable by click. `prefers-reduced-motion` honored.

## 2. App frame & navigation

```
┌──────────────────────────────────────────────────────────────┐
│ TOP BAR: [Profile chip: avatar·name·lvl·xp] [Energy ▮▮▮ 42/60]│
│          [Silver 12.4k] [Crystals 230] [+]      [Mail][News][⚙]│
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                    SCREEN CONTENT (Haven = animated          │
│                    warcamp vista with location "doors")      │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ BOTTOM DOCK: [Haven][Campaign][Depths][Arena][Champions]     │
│              [Mistgate][Bazaar][Quests][Events]              │
└──────────────────────────────────────────────────────────────┘
```
- **Haven** (home) is an illustrated animated camp: clickable stations (Mistgate portal glow, Bazaar stall, Depths cave mouth, Arena banner, Hall of Valor statue, Crystal Mine, Training Yard) — doubling the dock for flavor; dock is the fast path. Locked features show as mist-shrouded silhouettes with unlock level tooltip (visible ambition = retention).
- Screen transitions: quick mist-wipe, 200 ms — **DOM rather than the Pixi overlay first imagined**. A full-screen gradient is one composited layer the GPU handles for free, where the Pixi route would contend with the battle ticker for the single core the production box has, and this way `prefers-reduced-motion` switches it off with nothing in JavaScript asking. It is drawn *over* a navigation that has already happened and never gates one: the new screen is live underneath, `pointer-events: none`, so pressing two dock tiles quickly is as fast as it ever was.
- **Reduce motion means the game's setting, not only the machine's.** The stylesheet honours `prefers-reduced-motion` and a `data-mv-motion="reduced"` attribute the setting sets, identically. Sprite idle loops are untouched by either: they are the game being alive rather than the interface being busy, and the brief asks for them always.
- Keyboard: 1-9 dock hotkeys, ESC = back/close-modal everywhere, Enter confirms default action. Every modal is also fully mouse-operable. Breadcrumb-free — max depth 3 with persistent back.
- **One overlay owns the keyboard at a time.** Dialogs register as they open (`ui/Modal/stack.ts`) and the last one in takes Escape, the backdrop and the focus trap; its depth is added to the modal layer so two on screen stack in the order the player opened them rather than in mount order. Before P10b every open dialog listened on `document`, so one Escape closed the relic picker *and* the champion sheet behind it. Any full-screen overlay outside the `Modal` primitive — the Mistgate reveal — joins the same stack.
- Badging: red pips on dock items (claimable quest, free summon, mail, arena tokens full) — computed from `/player` snapshot flags, not polled.
- **A library component that shows changing state needs `apply`.** FantasyUIs components take their options at construction and paint from their own fields afterwards, so a value passed once is a value frozen forever. The wave counter sat on "1 / 3" for whole fights this way. Anything whose displayed value moves — a meter, a counter, a toggle — either gets an `apply` that calls the component's own setter, or a `key` that remounts it.
- **A bare number gets a tooltip, and it is a painted one.** `ui/Tooltip/useTooltip` attaches the library's own leather card to any element — including one the library owns, like a currency cell inside `TopBar`, which is why it takes a node rather than wrapping a React child. It binds focus as well as hover so a keyboard reaches it, and clears the native `title` while attached so the browser's grey box does not land on top of it.
- **The game remembers how you play.** The last team **per battle mode**, the playback speed and whether Auto is engaged are kept per account in local storage (`state/loadoutStore.ts`) and pre-fill every picker. Filtered to champions still owned on the way out, so a suggestion is never one the server would refuse. Deliberately not server state: the server decides outcomes and re-checks the team; this is one player's habit.
- **A screen is the feature, not the feature and a column about it.** Every screen used to keep a right-hand column of prose explaining itself, and pay a fifth of its width for it permanently to a reader who needed it once. That prose lives behind an **i** button in the screen's own title bar now (`ui/ScreenInfo`), and the feature takes the whole frame. The rule for what moves and what stays: *words* go into the dialog; anything the player can **act on** stays on the screen and finds a home in the layout — a toolbar over the grid, a bar across its foot, a strip along the top. Published gacha odds are the one thing that gets a worded button rather than the icon, because nobody should have to guess which icon hides the rates.
- **The title bar is quiet, and it is where screen-level controls go.** One line, left, at reading size, with the tagline beside it rather than beneath and no divider under it — a screen's name says which screen you are on, it does not announce itself. Its trailing `actions` slot carries the info button and anything that is true of the whole screen rather than of one thing on it: the campaign's difficulty tabs, the Arena's Hall of Valor and ladder, the Mistgate's odds.

## 3. Screen inventory (all built for EA-0.1)

| # | Screen | Core content (details per screen in phase specs) |
|---|---|---|
| 1 | Boot/Loading | Logo, tip carousel, asset preload bar, content-rev check |
| 2 | Login / Register | Two-panel pixel frame; account name + password (+ profile name on register); error toasts; "password resets are handled by admins" note |
| 3 | Tutorial overlay system — **shipped P9c** | Dimmed screen + highlighted target + parchment dialogue from the Wardenmaster; step-driven from the `tutorialStep` content type. The dim is four panes with a hole cut in them rather than a tint, so the target keeps its own colours and stays clickable; the overlay never blocks input, because the *server* is what enforces order. An element becomes pointable by carrying `data-mv-highlight="<key>"` — chosen over a ref registry because half the worthwhile targets live inside a `map`, where a hook cannot go. |
| 4 | Starter choice | The RSL moment: 3 pedestals (Anuria/Thordakk/Maruan), idle anims, kit preview cards, confirm-with-warning |
| 5 | Haven | Animated camp, stations, event banners. The stations are the screen — larger sockets, centred, with no column beside them; the dispatches and the account's standing are behind the title bar's info button |
| 6 | Campaign map | 12-chapter journey as a **serpentine map that fills the screen** — one marker per chapter, its state, its stars and its region, with the road drawn between them; the map takes every pixel the chapter dock under it does not. 252 stages laid flat is a wall, not a map, so a marker opens *one* chapter into the dock: its lore, its warlord, the next star-chest tier and its seven stages on a path. Difficulty tabs (Normal/Hard/Brutal) live in the title bar, greyed only when a difficulty has no published stages; a shut chapter carries the server's own reason on its marker ("Clear 12-7 first"). Star chests pay automatically on crossing a tier — there is nothing to claim |
| 7 | Team select (pre-battle) — **opens on the team you last sent into this mode** | 4 slots, roster picker w/ filters/sort, saved presets per mode, power sum, drag or click-assign, energy cost line, and the three ways to fight it: **into the mist** (watch it), **farm ×N** (a stepper bounded by energy/allowance/per-press cap, then a run-by-run summary instead of playback) and **practise** (only on a stage already cleared). The last two only render when they apply — the server's answer, read off `/player` and `/player/progress`, never re-derived here |
| 8 | **Battle** | See §4 |
| 9 | Battle results | Victory/defeat art, star rating, loot reveal (staggered), champ XP bars filling, buttons: replay/next/multi-continue |
| 10 | Champions (roster) | Grid of animated cards; filter element/faction/rarity/role; sort level/power/recent; food-select mode; capacity meter |
| 11 | Champion detail | Left: big idle stage w/ element ring; right tabs: **Stats** (base+gear breakdown), **Gear** (9 slots visual), **Skills** (tome UI), **Masteries** (3 trees), **Lore**; actions: level-up (food), rank-up, ascend, lock |
| 12 | Gear inventory | Grid w/ slot/set/rank filters, compare tooltip vs equipped, upgrade forge modal (cost, success %, animated attempt), bulk-sell w/ rarity guardrails |
| 13 | Mistgate (summon) | Portal centerpiece; sigil selector w/ counts; x1/x10; reveal sequence w/ rarity color burst (skippable); pity/rates panel ("Odds & Mercy" — transparent) |
| 14 | Chronicle | Collection book: all champions, owned/unseen states, filters; entry = model + lore + kit |
| 15 | The Depths hub | Cave map with 4 gear dungeons + Proving Grounds + Essence Springs (today's open springs highlighted); floor picker w/ best-floor marker |
| 16 | Arena | Defense team editor, opponent offers (profile, power, tier, medal preview), refresh timer/cost, token meter, tier ladder w/ weekly chest, leaderboard tab |
| 17 | Hall of Valor | 4 element statues; per-stat upgrade tracks (10 pips), medal balance, next-cost |
| 18 | Bazaar | Rotating stock cards w/ refresh timer, crystal shop tab (energy/silver/slots), confirm modals |
| 19 | Quests | Daily/Weekly/Monthly tabs, progress bars, claim-all, daily chest meter |
| 20 | Missions | "Valewarden's Path" chapter list w/ chain progress + big final reward tease |
| 21 | Events | Active event pages: banner, point rules, milestone track, time left |
| 22 | Login calendar | 30-day grid + 7-day welcome strip, today glow, claim animation |
| 23 | Mail | List + detail, claim attachments, claim-all |
| 24 | Profile & Settings | Public card preview, audio sliders (music/SFX), battle speed default, reduced motion, language (EN at EA), credits, logout, change password |
| 25 | Error/Maintenance | Friendly mist-ghost mascot + request-id display |

## 4. Battle screen (the crown jewel)

```
┌──────────────────────────────────────────────────────────────┐
│ [Wave 2/3]  [Turn order strip: ▣▣▣▣▣▣ portraits w/ TM bars]  │
│                                                    [⏩ x2][A]│
│   ALLIES (left, 4 slots)          ENEMIES (right, ≤4 slots)  │
│      ▲ idle anims 64px @ 2-3x       lizard variants          │
│   [hp bar][buff icons]            [hp bar][debuff icons]     │
│         ~~~ parallax mist + stage backdrop (Pixi) ~~~        │
├──────────────────────────────────────────────────────────────┤
│ ACTIVE CHAMPION PANEL: portrait · [A1] [A2 cd:2] [A3 cd:—]   │
│ skill tooltips on hover (full text + numbers) · [Retreat]    │
└──────────────────────────────────────────────────────────────┘
```
- Diagonal-line formation per side (RSL-style stagger) so 4 units don't overlap; slight camera drift + parallax layers for depth.
- Turn order strip = upcoming order computed from server events (client never simulates — it renders the event log with local playback timing).
- Targeting: hover-highlight + click enemy (or ally for ally-target skills); default target auto-highlighted; AoE skills glow all targets. Keyboard: 1-4 skills, tab targets, space = confirm/auto.
- Buff/debuff icons: 16px chips with turn-count pips, hover = tooltip with exact effect; stacks numbered.
- Floaters: damage (element-tinted, crit = bigger + shake char), heal green, RESIST steel-grey, WEAK/STRONG hit markers.
- Speed x1/x2 (persisted), Auto toggle (server resolves ahead; playback continues at speed), **Skip** appears for already-resolved autos.
- **The results wait for the playback, never for the response.** Auto settles the whole fight in one call, so a screen keyed on the server's answer shows the outcome about three seconds in, over a HUD reading "Turn 0" — which is what shipped until P10a. Two rules follow: anything that gives the outcome away (results, the closing line, the wallet re-sync) waits for the event log to be played out; anything that *sends* something (Auto, Retreat) goes dark as soon as the session closes. Skip is the deliberate way past the rest, and the only one.
- Death: dissolve + slot dims; wave clear: banner sweep + next wave slides in; victory: standstill → banner → results.

## 5. UX guardrails
- Destructive/irreversible actions (release champions, sell gear, spend crystals) = typed confirm modals with itemized consequences; locked/favorite champions are un-releasable and un-feedable.
- Empty states everywhere teach the loop ("No gear yet — the Wyrm's Hollow drops Swiftwind pieces").
- All costs shown *before* action with after-balance preview; insufficient = button disabled with reason tooltip, deep-link to the source (e.g. "Get more in Bazaar").
- Latency: any action > 150 ms shows inline spinner in the pressed button; no full-screen blockers except battle start.
- Text scale safe: layouts survive 125% OS scaling; min hit target 40×40 px (mobile-ready).

## 6. Icon map (game-icons.net, initial set — fetched by `tools/icon-fetch`)
Currencies/resources: `two-coins` (silver), `cut-diamond` (crystals), `lightning-arc` (energy), `laurels-trophy` (valor medals), `rune-stone` (sigils base), `potion-ball` (essences), `book-cover` (tomes), `rank-3` (emblems).
Stats: `health-normal` (HP), `broadsword` (ATK), `shield` (DEF), `wingfoot` (SPD), `on-target` (C.RATE), `explosion-rays` (C.DMG), `magic-shield` (RES), `bullseye` (ACC).
Elements: `small-fire` (Ember), `waves` (Tide), `oak-leaf` (Verdant), `fog` (Mist).
Slots: `crossed-swords`, `visored-helm`, `round-shield`, `gauntlet`, `breastplate`, `boots`, `ring`, `gem-pendant`, `flying-flag`.
Nav/systems: `castle` (Haven), `treasure-map` (Campaign), `cave-entrance` (Depths), `crossed-sabres` (Arena), `portal` (Mistgate), `shop` (Bazaar), `scroll-quill` (Quests), `stairs-goal` (Missions), `party-popper` (Events), `envelope` (Mail), `cog` (Settings), `padlock` (locked), `open-book` (Chronicle), `stone-stack` (Hall of Valor).
Status effects get a curated ~30-icon set at P2 (listed in COMBAT_SYSTEM.md per effect). Exact final names verified against the site during P0 fetch (fallback: their GitHub mirror `game-icons/icons`).

## 7. Layout & scaling strategy
- Design canvas 1600×900 fluid, min supported 1280×720; UI scales via `rem` tokens; Pixi stage letterboxes at integer zoom.
- Landscape-mobile (post-EA activation, planned now): dock collapses to icons, top bar condenses, hit targets already sized; PWA manifest + orientation lock shipped in EA (installable but "beta").
- No horizontal page scrolling anywhere; long content scrolls in panels (custom pixel scrollbar).
