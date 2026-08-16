# USER_QUESTIONS.md — Open decisions for Marvin

> Every question gets a **recommended default** so nothing blocks development: unanswered = I proceed with the default. Answer inline, in chat, or at phase checkpoints. Answered items are folded into the docs and moved to the decision record below.

## Open questions

*None right now.* New questions will appear here (numbered, with defaults) as implementation raises them.

Two small **operational** items remain open but non-blocking (defaults active):
- **O1. `/admin` IP allowlist** — optional hardening; default: off until you provide IP(s). (DEPLOYMENT_OPERATIONS §1)
- **O2. Offsite backup target** — BACKUP.sh keeps local dumps; give an rclone remote anytime for offsite copies. (DEPLOYMENT_OPERATIONS §2)

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
