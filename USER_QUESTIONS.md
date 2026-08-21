# USER_QUESTIONS.md — Open decisions for Marvin

> Every question gets a **recommended default** so nothing blocks development: unanswered = I proceed with the default. Answer inline, in chat, or at phase checkpoints. Answered items are folded into the docs and moved to the decision record below.

## Open questions

**Q7 — the Haven backdrops that landed mid-batch.** Three images arrived on `main` while the
Haven was being rebuilt: `assets/ui/backgrounds/haven_bgs/haven_{arena,campaign,depths}.jpg`.
They look exactly like art for the new station boards, and they are not wired in yet, for two
reasons worth your call rather than mine:

- **Three of thirteen.** Wiring them now gives three painted boards and ten crest icons, which
  reads as broken rather than as partial. Are the other ten coming?
- **Size.** They are ~3 MB JPEGs each. Thirteen of those is ~39 MB of Haven, against a budget
  written for a 1-core/4 GB box. They need publishing at something like 900px wide as WebP
  (~120 KB each) — the same native-image-module question Q6 is parked on, so answering one
  probably answers both.

**Recommended default:** hold until the set is complete, then publish them downscaled through
`tools/asset-sync` and use them as the board art, keeping the current crest icon as the
fallback for any station without a picture. Say the word and it is a short pass.

Q4 and Q5 were both answered on 2026-08-18 and are in the decision record below.

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

## Q6 — Champion avatars ship at full resolution (raised 2026-08-19, D9)

**The measurement.** The eight published avatars are 1.3–2.2 MB each, 1254×1254, and the
game draws them at 150px on a champion card and 44px on an arena portrait. `pnpm assets`
copies them from `assets/` byte-for-byte, so opening the roster pulls roughly **9 MB**. On
the 1-core/4 GB target box that is the largest single thing a player downloads, by an order
of magnitude, and it grows with every champion that gets art.

**Why it is not already fixed.** Downscaling at publish time needs an image library, and
there is none in the toolchain — no `sharp`, no ImageMagick, no PIL. Adding `sharp` means a
native module that has to build on the VPS, which is a locked-stack decision rather than
mine to take quietly.

**Recommended default:** add `sharp` to `tools/asset-sync` and have `pnpm assets` publish
each avatar at 320px (2× the largest place it is drawn), leaving `assets/` untouched as the
master. That is ~40 KB per avatar instead of ~2 MB, needs no change to any screen, and the
source art stays exactly as delivered.

**Alternatives if a native dep is unwelcome:** downscale once by hand and commit the smaller
files to `assets/` (simple, but the master is then the display size); or serve them through
nginx's `image_filter` (no build dep, but it costs CPU on the box the budget is about).

Nothing is blocked either way — the game works today, it is only heavier than it should be.
