# USER_QUESTIONS.md — Open decisions for Marvin

> Every question gets a **recommended default** so nothing blocks development: unanswered = I proceed with the default. Answer inline, in chat, or at phase checkpoints. Answered items are folded into the docs and moved to the decision record below.

## Open questions

**None.** Q6 and Q8 were answered on 2026-08-27 and 2026-08-26, Q7 on 2026-08-21, Q4 and Q5 on
2026-08-18; all of them are in the decision record below.

Two small **operational** items remain open but non-blocking (defaults active):
- **O1. `/admin` IP allowlist** — optional hardening; default: off until you provide IP(s). (DEPLOYMENT_OPERATIONS §1)
- **O2. Offsite backup target** — BACKUP.sh keeps local dumps; give an rclone remote anytime for offsite copies. (DEPLOYMENT_OPERATIONS §2)

## Known gaps, scheduled (no answer needed)

Each has a phase and a default, so none of them blocks anything. Listed here so they are not rediscovered later. **Reviewed at the P6 checkpoint** — the phase labels below are current as of then.

| # | Gap | Plan |
|---|---|---|
| G1 | **Audit visibility is thin.** Only the 10 most recent entries, via `/stats/overview`; ADMIN_SUITE_DESIGN §2.17 wants a searchable log and per-entity history. | Paginated `/admin/api/audit` with entity/actor/date filters — **P8**, when the audit volume justifies it. Still open. |
| G2 | **The publish diff is shallow.** `diffFields` compares top-level keys only, so changing one champion stat renders the entire `baseStats` on both sides. Readable, but noisier than it should be — and noticeably so now that a stage's `waves` is a nested array of four-wide waves. | Deep field-level diff, done **server-side** so the diff stays the single source of truth — **Admin A2**, alongside the campaign editor that will lean on it hardest. (Was labelled P2; the balance work landed without needing it.) |
| G3 | **Dashboard counters are thin** versus ADMIN_SUITE_DESIGN §2.1 — no battle, summon or economy figures. | No longer "those systems do not exist": battles, summons and `economy_log` are all live as of P6, so the data is there to chart. **Admin A2–A3**, whenever the dashboard is next opened. |
| G4 | **No balance-sim endpoint**, so the champion Balance tab and stage Simulate are absent. | `tools/balance-sim` exists and gates CI; what is missing is the HTTP surface for it. **Admin A2** (the balance sandbox). Still open. |
| G5 | **`/api/health` sits on the player prefix**, so the Admin dashboard needs a second proxy rule and a prefix override. | Deliberate — `STATUS.sh` reads the same endpoint. No change planned. |
| G6 | **The Depths and Masteries have no purpose-built Admin editors.** Both content families are fully editable through the generic entity browser — no field is SQL-only — but a floor-band view and a mastery tree canvas were promised. | **Admin A4**, as planned. Authoring is not blocked in the meantime. |
| G7 | **Two documented balance gates are not enforced.** The per-champion role benchmark (85–115% of its role) and the Arena diversity check (COMBAT_SYSTEM §14). | The Arena one needs an Arena — **P7**. The role benchmark wants the champion pass — **P10**. Both are now marked *not yet enforced* in §14 rather than reading as live. |
| G8 | **The Admin Suite has no Playwright harness**, though A0 lists one. Editor logic is covered by 86 Vitest/RTL cases; the login→edit→validate→publish smoke run is not. | **Admin A2**, alongside the campaign editor — the first editor complex enough that a browser run earns its keep. |

---

## Decision record (owner answers, 2026-08-16 — folded into docs)

| # | Decision | Where it lives now |
|---|---|---|
| A1–A6 | Defaults confirmed by silence: 2D pixel-art (the "3D MMORPG" brief line was a leftover) · no payments in EA · English-only, i18n-ready · daily reset Europe/Berlin · CC0 audio placeholders · 9 fps idles + procedural animation fallbacks | GDD, ECONOMY, DEPLOYMENT, ASSET_GUIDE |
| D1 | **The whole game is redressed in FantasyUIs** (2026-08-18). Two standing rules were superseded by the owner in the same breath: the game client may now use a component library, and the hand-built pixel kit is retired. Two answers given with it: **sans-serif only** — the library's Cinzel and Spectral are rebound to Mistvale's own faces in `fui/mistvale.css`; and **the Admin Panel is not touched** ("Leave it alone, no changes to the Admin Panel in terms of Design"), so it stays Mantine. Base theme: dark-ember. | CLAUDE.md hard rules, `apps/client/src/fui/`, UI_UX_DESIGN |
| Q7 | **The Haven's painted boards wait for the whole set** (2026-08-21, "Hold until I uploaded all"). Three of the twelve station backdrops arrived — `haven_{arena,campaign,depths}.jpg` — and wiring them now would put three painted boards next to nine crest icons, which reads as broken rather than as partial. So the boards keep the FantasyUIs crest each station already draws until every station has a picture. The convention the three set is `assets/ui/backgrounds/haven_bgs/haven_<screenId>.jpg`, and the nine still wanted are champions, relics, mistgate, chronicle, bazaar, quests, missions, events and calendar. When they land they are published downscaled through `tools/asset-sync` — at ~3 MB each, twelve full-size JPEGs would be ~36 MB of Haven against a budget written for a 1-core box, which is the same native-image-module question Q6 is parked on. | ASSET_GUIDE §1, ROADMAP backlog, `apps/client/src/app/screens.ts` |
| Q5 | **The relic vault is capped, and the cap is bought up with silver** (2026-08-18, "yes there should be a cap which can gradually be increased (up until a maximum or something) with ingame currency"). 250 loose relics to start, 50 more per purchase, 1,000 at the ceiling; the first slab is 25,000 silver and each one after costs 1.3× the last, so the whole ceiling is about 4.2M. **Only loose relics count** — a relic on a champion is not in the vault, which makes equipping a way to make room. A drop that will not fit is **not lost**: it is sold on the road for its value and the results screen says so, because farming ten runs is one press and a player who came back to nine relics and no explanation has been punished for a cap they never saw themselves hit. All five numbers are `game_config`, so an operator retunes the whole thing without a deploy. | ECONOMY_BALANCE §vault, DATA_MODEL `players.vault_slots`, API_DESIGN §gear, `db/seed/data/config.ts` |
| Q4 | **Synthesised sound cues stay the voice of the game at EA** (2026-08-18, "as you recommend"). Each cue is a `soundCue` content entry naming a bus and either a recording or a handful of synth parameters; twenty-seven ship, none of them a file. A CC0 pack remains a drop-in whenever one is picked — one field per cue, no code. **Music is a bus with no track**, and the Settings slider says so rather than pretending. | ASSET_GUIDE §audio, UI_UX §1.2, `db/seed/data/sounds.ts` |
| A7 | Champion identities approved, **except Anuria = archer/ranger** (kit + visuals reworked to ranged) | GDD §6, CONTENT_PLAN §1, ASSET_GUIDE |
| A8 | World/system names approved | — |
| B1 | **Broodlings approved**; many more champions/food designs coming later; art-pending champions use the `teritorial_lizard` model until sprites are swapped via Admin | GDD §5, CONTENT_PLAN §1b, ASSET_GUIDE §placeholder |
| B2 | **Expanded roster approved incl. Legendaries** on placeholder art → EA ships 37 champions + 6 food units; Legendary pulls award real champions (Mistbound Cache workaround dropped); missions finale = exclusive Legendary **Aureleth** | GDD §5/§10/§11, CONTENT_PLAN §1b |
| B3 | Domain **play.pathlands.cc** (game) + **/admin** path (Admin Panel); DNS already on the VPS. **Account ranks: Player / GameMaster / Admin** — one account system; only Admin rank can log into the Admin Panel; GameMaster reserved for future moderation tools | DEPLOYMENT §1, DATA_MODEL §accounts, ARCHITECTURE §5.6/§8, API §2 |
| B4 | Bare-metal systemd deployment (no Docker) | DEPLOYMENT |
| B5 | Bots: natural names, no marker | GDD §9.3, CONTENT_PLAN §7 |
| B6 | Skill tomes: player-choice | COMBAT §11 |
| B7 | 3-star rule: win / no deaths / ≤12 turns | CONTENT_PLAN §3 |
| B8 | Profile names: no filter; admin rename is the fix | DATA_MODEL, ADMIN_SUITE_DESIGN |
| C1–C8 | **All suggested additions approved**: choice tomes, multi-battle, Odds & Mercy panel, team presets, daily first-win bonuses, practice sandbox, colorblind glyphs. 〔Replays + share links were approved here and **dropped on 2026-08-17** at the owner's request — see GDD §15.〕 | GDD §15, ROADMAP P3/P6/P8 |
| — | **Complexity stance:** keep RSL-scale content & grind, simplify entry complexity; deepen systems later | GDD §1.1 (binding design rule) |

## Decision record (owner answers, 2026-08-17)

| # | Question | Answer | Where it lives now |
|---|---|---|---|
| Q1 | Where a new account enters the Arena ladder | **Recommendation taken: leave `arena.startingRating` at 900.** A level-8 account arrives having had the welcome grant, thirteen sigils and thirty-odd clears, so mid-Bronze is a fair fight rather than a gift — and the Bronze loss floor means a bad run cannot strand anybody. It stays a Game-config edit if real accounts say otherwise, and G7's `pnpm sim` arena gate is what would settle it with numbers instead of guesses. | ECONOMY_BALANCE §12, `arena.startingRating` |
| Q2 | Whether the Summon Surge ladder is sized right | **Recommendation taken: leave the point weights as seeded.** One Radiant pull tops the ladder outright, and that is the point — "the Radiant I finally pulled finished the event" is a good evening, and sizing the top rung to a Radiant instead would put it out of reach of everyone who never sees one, which at EA is most people. | `db/seed/data/events.ts`, ECONOMY_BALANCE §11 |
| Q3 | How much the cold-open battle should borrow | **Recommendation taken: a `tutorial`-mode stage carrying a preset team.** The battle mode already existed in the enum and nothing used it; a stage now carries the roster it is fought with, so the opening fight is content like every other fight. No energy, no rewards, no stage progress, and nothing minted into the roster to be taken back afterwards. | GAME_DESIGN §9.4, CONTENT_PLAN §7, DATA_MODEL §stage |

## Decision record (owner answers, 2026-08-27)

| # | Question | Answer | Where it lives now |
|---|---|---|---|
| Q6 | Whether to downscale the champion avatars at publish | **Recommendation taken** ("do all the things you still have in plan, how you recommend"), **and the recommendation turned out to be wrong about the hard part.** Q6 said this needed `sharp` — a native module that has to build on the VPS, which is why it sat open for eight days. The avatars are **PNG**, Node ships zlib, and a PNG is a zlib stream with five per-row filters in front of it: `tools/asset-sync/src/png.ts` decodes, area-averages and re-encodes one in about 130 ms with **nothing installed**. The sprite tree went from **15 MB to 2.0 MB** and `pnpm assets` still finishes in 2.4 seconds. Two encoder choices were measured rather than assumed, and the first cut guessed one of them wrong: row filters are worth **17%** on a shrunk painting, not the "couple of percent" the comment claimed, while trying all five per row and keeping the best buys a further 0.4 KB — so every row is Paeth and none of them shop around. Dropping the alpha channel on a fully opaque avatar is another 20 KB, checked per file rather than assumed. Downscaling is **alpha-weighted**, because averaging colour straight across a transparent edge drags black into the fringe and outlines a cut-out champion. `assets/` keeps the masters untouched; only avatars are resized, since an idle frame is 4 KB and drawn at its own size. | ASSET_GUIDE §1, `tools/asset-sync/src/png.ts` + `png.test.ts` |

## Decision record (owner answers, 2026-08-26)

| # | Question | Answer | Where it lives now |
|---|---|---|---|
| Q8 | Whether an enemy's `stars` should decide anything | **Recommendation taken: honour it, and re-tune against `pnpm sim`** ("As you recommend"). `scaleEnemyStats` scales HP/ATK/DEF by the same `champion.rankMultipliers` ladder a champion's rank climbs, so ★6 is 1.00 and an enemy's authored `base_stats` *are* its six-star stats. SPD, crit and RES stay flat at every rung — speed decides turn order before anything else resolves, and every boss in the game is built on a turn count. Making the field real exposed a second fault it had been hiding: **the campaign was the only content in the game not authored on the ★1–6 ladder**, running 1/2/3 for Normal/Hard/Brutal while the Depths, the Spire, the Deep Run and the tutorial all already ran 3→6 — so read literally it meant "the whole campaign at 42–68% of what it was tuned to be", and `brutal-wall` was the gate that said so (89.6% of teams fresh off Normal walked through Brutal 12-7). The scale moved to 4/5/6 and the shape did not: Brutal is the full-strength creature, Hard and Normal are its lesser versions, which is what that seed's own comment had said since P2. All 89 gates pass. The wave-line default moved from ★1 to ★6 in the same commit, because an unset rating has to mean "as authored" and ★1 would hand out a 58% nerf for leaving a box empty in Admin. | COMBAT_SYSTEM §2, `packages/engine/src/setup.ts` + `setup.test.ts`, `db/seed/data/campaign.ts` |

