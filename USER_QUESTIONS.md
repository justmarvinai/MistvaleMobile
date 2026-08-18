# USER_QUESTIONS.md — Open decisions for Marvin

> Every question gets a **recommended default** so nothing blocks development: unanswered = I proceed with the default. Answer inline, in chat, or at phase checkpoints. Answered items are folded into the docs and moved to the decision record below.

## Open questions

**Q4. What should Mistvale actually sound like at EA?** — *default active, work not blocked*

Audio is P10c and the mixer is being built either way. The question is where the sounds come from, and it needs deciding because I cannot fetch the CC0 packs myself: this build environment's network policy refuses everything outside the package registries, so Kenney Audio and OpenGameArt are both unreachable from here. Nothing about that changes what the game *can* do — it changes who does one step of it.

- **A — synthesised, and a sample beats it whenever one exists (recommended).** Every cue is a `soundCue` content entry naming a bus and either a sample or a handful of synth parameters — a short envelope over an oscillator or a noise burst, which is what a pixel game's clicks, coin clinks and forge clangs are anyway. Nothing to license, nothing to credit, nothing to download, and every cue is retunable in the Admin config without a deploy. When you drop a pack into `assets/`, pointing a cue at a file overrides the synth for that cue alone — one field, no code.
- **B — you pick a CC0 pack and I wire it.** Drop the files into `assets/audio/` (or name the pack and I will write the manifest); I register them, credit them in `CREDITS.md`, and the same `soundCue` entries point at samples from the start. Better-sounding, and it costs one round trip through you.
- **C — silence at EA.** The sliders in Settings stay, and stay inert. I would rather not: they are on screen now and connected to nothing, which is exactly the placeholder the brief rules out.

**Music is a separate answer.** Procedural ambient is a much bigger swing and much likelier to sound bad, so under any option above the music bus ships with volume control and no track until you choose one. That is a bus with nothing on it rather than a broken feature — but say if you would rather I attempt a loop.

*Proceeding with **A** unless you say otherwise; B remains a drop-in afterwards, since the cue is the thing that names the sound.*

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
