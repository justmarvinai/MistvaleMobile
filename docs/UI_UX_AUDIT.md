# UI/UX audit — 2026-09-05

A read of every screen against a running box at 1920×1080 (and the Haven and roster at
1440×900), on an account with a filled roster, a vault, currencies, sigils, a fought stage and
claimable errands — the state a player is actually in rather than the empty state a fresh
account gives a screenshot. The owner's brief for the pass (2026-09-05): *too much text, too
small text, too much information, frames that do not look good, an interface that feels
outdated rather than like a modern fantasy RPG* — and above all **negative space**: screens
that leave most of a desktop display empty and make the game feel thin.

Findings are ranked by how much they cost the player, not by how hard they are to fix. Each
names the screen, what is wrong, and the fix — **✔** where it has shipped, **○** while it is
still owed, so this table is the plan as well as the record. The screenshots the audit was made
from are not committed (49 PNGs at 1920×1080, taken by a throwaway browser walk that is not
kept, since a screenshot walk is not a test); the walk is a developed account pressing every
card in every hub, and repeating it is an afternoon rather than a tool.

## The systemic cause

Most of what follows has one root: **the game is laid out and typeset for a phone and played on
a desktop.** The library it is dressed in (FantasyUIs) ships phone defaults — 10–12px labels,
17px coins, 30px buttons, 108–150px cards — and a great deal of Mistvale's own chrome inherited
those numbers. On a 1920px display everything reads as small, the small things leave gaps, and
the gaps read as emptiness. The fixes below are therefore of two kinds: **scale** (type, targets,
cards) and **composition** (what a screen does with the room it has).

## CRITICAL

| # | Screen | Problem | Fix (✔ shipped · ○ owed) |
|---|---|---|---|
| C1 | **Mistgate** | The gate is a flat opaque panel covering the painting, with a 180px rune in the middle of 1,460×780px of nothing. The summon cinematic is a radial glow, two thin rings and twelve dots in a black void; the break is a flash; the cards turn at 150px in the same void; an epic's herald is a sprite that falls back to the enemy lizard. No build-up, no anticipation, no place. | ✔ Rebuilt: the painting is the gate (no panel), the rail stays, controls sit on a plinth strip, and the cinematic is a six-beat sequence — camera into the portal, mist, a rarity climb the whole scene answers to, a shatter, cards dealt from the gate at 220px, a hero card for an epic or better, gold rain for a legendary. |
| C2 | **Haven** | Half the screen is empty: a 120px band above the rail and 110px below, boards 220×430 on a 1920px display, blurbs clamped and cut mid-sentence, 10px ENTER buttons, and a caps-lock instruction telling the player to drag. | ✔ Boards fill the rail's height (368×750 at 1080p) and the camp is full width; blurbs whole at 14.5px; 22px names; a real Enter plate; the hint is gone. |
| C3 | **Battle** | The field below the horizon is a flat near-black plane — no ground, no light, no depth — so the champions float on a stage and the bottom 60% of the fight is dark. | ✔ The floor is lit in both renderers from one set of numbers (`campLight`): a plate lightest at the horizon, a haze carrying the painting's ember down, a cast of light under each camp. The lit-field guard reads against 64 rather than 42, and a missing-art silhouette is tinted in a lightened element colour so it is not a shadow on a lit floor. |
| C4 | **Every screen** | Phone-scale type: 10–12px labels, 11.5px blurbs, 9px names on cards, 16px currency figures, 13px table numbers. It is the single biggest reason the interface reads as dated. | ✔ 344 declarations in 73 stylesheets moved up a step (0.62–0.7rem → 0.78, 0.72–0.76 → 0.84, 0.78–0.82 → 0.9, 0.85–0.88 → 0.95; 9–12.5px → 11–14px); body 15px, labels 12.5px, titles 24px. |

## VERY HIGH

| # | Screen | Problem | Fix (✔ shipped · ○ owed) |
|---|---|---|---|
| V1 | **Dock** | Six entries spread edge to edge across 1920px with 30px glyphs, a permanent `1 2 3 4 5 6` hotkey digit in every corner, and a 2px underline as the whole active state. | ✔ A centred cluster of six 152px tabs, 36px glyphs, 15px display-face labels, a lit plate under the active tab; the digits are gone (the keys still work, the tooltip names them). The centring rule had been written since C12 and never applied. |
| V2 | **Team chooser (Lineup)** | A 1,680px dialog laid out like a phone inventory: 108px roster cards with 9px names, four dashed empty rectangles for the slots, enemy waves as 60px generic hood icons. | ✔ Slots are 150px faces in the pack's bevel frame (an empty one is the frame with a faint figure), roster cards 128px, enemy tiles 72px faces with the level; the opposition's ceiling rose so a third wave is not cut. |
| V3 | **Vale Pass** | Two tracks of thirty 36px tiles: reward labels overlap each other and the tier numbers are 9px — the screen is unreadable. | ✔ `PassLadder`: one column per tier — number, favour, free tile, season tile — on a `Rail` that brings the next tier into view; ready tiles gold and breathing, collected ticked, season rewards padlocked until taken up. |
| V4 | **Starter choice** | The first decision in the game is three ~60px sprites in plain dark boxes. | ✔ Three hero panels: the painted face filling each, the element as the library's badge and the role beside it, the name at 26px, the title and rarity under it, the chosen one lifted and lit. |
| V5 | **Results** | The victory sits in a black void: a small spoils strip, one 200px champion card, four buttons and 600px of nothing. | ✔ The pack's leather ground is gone and the wash is lighter, so the fight and the painting show through; spoils, notes and champion cards at desktop size. |
| V6 | **Roster** | The most-used screen is the most cramped: 108px rail cards, a 100px idle in a 300px box, a 12px mono stat table, 80px relic sockets. | ✔ Rail cards 128px in a 444px rail, sockets 104px, the idle at 440px (it needed `flex: none` as well as a height — the portrait column is a capped flex column and the idle had been shrunk to a quarter of its size). Found on the way: the stat table drew under the set-bonus panel at 1440×900, because the row split at a window width rather than at the column’s own; it splits on `auto-fit` now. |
| V7 | **Top bar** | 16px currency figures on 26px coins, 38px tool buttons, an "A" initial in a box where the portrait goes. | ✔ Coins 30px, figures 18px, buttons 44px; the empty portrait draws the Haven's crest rather than an initial, on the chip and the card. |

## HIGH

| # | Screen | Problem | Fix (✔ shipped · ○ owed) |
|---|---|---|---|
| H1 | **Campaign map** | Twelve identical 52px grey discs on faint lines with the bottom third of the map empty; no chapter art, no progress on a node. | ✔ 72px markers carrying their region’s painting (`regionArt`, two or three per region so the road never repeats), the glyph as a seal on the corner, the current chapter ringed in gold and breathing, a shut one drained, the last a squarer red marker rather than a rotated painting; three rows across the whole pane. |
| H2 | **Campaign chapter** | Seven thin rows across 1,500px, each carrying 12px text and a 60px button, ending at 60% of the frame. | ✔ Rows 96px with the first wave’s faces beside the number, 20px names and stars, the way in as a plate; the brief column widened to 18–24rem. |
| H3 | **Single-panel screens** — Sunken Stair, Wurm Wakes, Valewurm, Expeditions, Bazaar, Trials | One panel in the middle of the frame and nothing else: a 1,300px-wide GO DOWN button under a two-line lore paragraph; a Valewurm panel holding one sentence; three expedition cards over 600px of nothing; four Bazaar stalls with 90px art; a fourth trial orphaned on its own row. | ○ Each composed for the frame: hero art where the mode has it (the Wurm, the Stair), the ladder as a rail, cards sized to fill a row, buttons at their natural width. |
| H4 | **Ledger rows** (Quests, Missions) | 1,300px-long 6px progress bars, 60px CLAIM buttons, 12px reward text; the day's chest is a 170px panel around one line. | ✔ `Ledger.module.scss`: 56px badge, 17px name, 14px sentence, the bar sized to its sentence (36rem), the reward and a 13.5px button as a right-hand column; the chest is one row — words, spoils, meter, button. |
| H5 | **Calendar** | 76px tiles with 9px day labels and 10px amounts; a "Day N is waiting — COLLECT" strip repeating what the lit tile already says. | ✔ 108px tiles (day 12.5, reward 56, count 14) stretched across the row, today lit further; the strip moved into the panel’s title bar beside the count, its button kept for the keyboard. |
| H6 | **Events** | Ladder rungs are 36px icons with 9px labels on a hairline. | ✔ The pass’s ladder, shared: `ui/Ladder` draws 88px tiles with the score under each, the next rung centred, ready ones gold, collected ones ticked, a painted tooltip on every tile; six rungs spread across the panel rather than huddling at its left. |
| H7 | **Hub with one row** (Champions) | Four cards centred in the frame with 300px empty above and below. | ○ Cards carry a live line — roster count, vault fill, chronicle progress — and grow to the row they are given. |
| H8 | **Text volume** | Every screen has a tagline *and* section sentences: the Depths says three sentences before its first button, the Stair opens with a lore paragraph, the Pass and both calendars explain themselves in prose above the thing they are. | ◐ The Depths’ section sentences are gone; the Pass’s and both calendar tracks’ descriptions are behind the **i**. The Stair’s lore paragraph goes with H3. |
| H9 | **Depths springs** | A seven-row table beside five spring cards that scroll off the frame, under two sentences of section prose. | ✔ `SpringDial` is a strip of seven across the section, today lit, the springs as chips under each day; the cards sit beneath it. |

## MEDIUM

| # | Screen | Problem | Fix (✔ shipped · ○ owed) |
|---|---|---|---|
| M1 | **Battle HUD** | Wave pips, turn counter, a 200px party frame, a 30px Auto and a 80px hotbar — phone sizes over a 1920px fight. | ○ Scaled for the display. |
| M2 | **Arena** | Rows carry an opponent's team as 70px hood icons and 1,000px of empty width before the button. | ○ The team as four cards with power, the row's slack given to them. |
| M3 | **Chronicle** | Six 180px tiles per shelf with 700px of empty shelf beside them. | ○ Tiles 210px, nine to a shelf. |
| M4 | **Bazaar** | Item art at 90px, prices at 13px. | ○ Art 150px, price and button as one plate. |
| M5 | **Placeholders** | Three different stand-ins for a champion with no art — the silhouette card, the hood icon, the enemy lizard — on the same screens. | ○ One: the silhouette, everywhere a face is missing. (The art itself is content and the owner's; the *consistency* is UI.) |
| M6 | **Mistspire** | Floors are text rows; the keeper is a word. | ○ The keeper's portrait on its row. |
| M7 | **Profile card** | "Warden since" at 11px; the portrait box shows an initial. | ○ Same treatment as the top bar. |

## LOW

| # | Screen | Problem | Fix (✔ shipped · ○ owed) |
|---|---|---|---|
| L1 | Title screen | "SHOW" at 10px in the password field. | ○ 12px. |
| L2 | Odds dialog | 13px mono table. | ○ 14px. |
| L3 | Settings | Fine. Slider labels 12px. | ○ 13px. |
| L4 | Achievement banner | Fine. | ○ — |

## Not UI, but seen

- **30 of 37 champions and every enemy are placeholders.** It is the largest single reason a
  screenshot reads as unfinished, and it is content the owner supplies (`assets/`), not chrome.
  Noted so it is not mistaken for a layout fault.
- The audit account reached level 34 from 23 in six fights of 1-1, which is C24's front-loading
  working as designed.
