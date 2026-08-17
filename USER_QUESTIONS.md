# USER_QUESTIONS.md — Open decisions for Marvin

> Every question gets a **recommended default** so nothing blocks development: unanswered = I proceed with the default. Answer inline, in chat, or at phase checkpoints. Answered items are folded into the docs and moved to the decision record below.

## Open questions

**Q1. Where should a new account enter the Arena ladder?**
It unlocks at account level 8 and starts everybody at rating **900**, which sits in the middle of Bronze — so a warden's first five opponents are mid-Bronze bots (champions around level 19 in rank-3 relics), not the weakest ones. Whether that is a fair first evening depends on what a real level-8 roster looks like, which nobody has measured yet: my own check used an artificially levelled account holding one un-geared starter, so it proves nothing either way.

Three ways to go, all one config edit and no deploy:
- **(a) Leave it at 900 〔recommended〕.** A level-8 account has had the welcome grant, ten Faded and three Gleaming sigils, and thirty-odd clears — probably a rank-2/3 team of three or four. Mid-Bronze is then a fair fight rather than a gift, and the Bronze loss floor means a bad run cannot strand anybody. Revisit with real numbers rather than guesses.
- **(b) Start at 400** (`arena.startingRating`), the Bronze floor, so the first opponents are the weakest on the ladder and the first week is a climb. Costs a little of the ladder's meaning: everybody starts joint-last.
- **(c) Soften the Bronze recipe** (`arena.botBands.bronze.championLevelMin/Max`), making the whole band easier rather than moving where players enter it.

Not blocking: whichever way it goes is a number in the Game config editor. What P7 fixed is the thing that *was* structural — a band's bots are now built along a ramp, so a bot's rating predicts how hard it hits and the +13/+23 the hub shows is a real guide rather than decoration. **The honest next step is a `pnpm sim` arena gate** (a modelled level-8 roster against each band's floor), which G7 already schedules.

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
| C1–C8 | **All suggested additions approved**: choice tomes, multi-battle, replays + share links, Odds & Mercy panel, team presets, daily first-win bonuses, practice sandbox, colorblind glyphs | GDD §15, ROADMAP P3/P6/P8 |
| — | **Complexity stance:** keep RSL-scale content & grind, simplify entry complexity; deepen systems later | GDD §1.1 (binding design rule) |
