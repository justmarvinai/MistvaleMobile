# USER_QUESTIONS.md — Open decisions for Marvin

> Every question has a **recommended default** so nothing blocks development: unanswered = I proceed with the default and it stays cheap to change later. Answer inline (edit this file), in chat, or per-phase at checkpoints. Answered items get folded into the relevant doc and removed here.

## A. Confirmations (assumptions I've already planned around)

**A1. "3D Low-Poly Browser MMORPG" line.** Your brief's Technical Infrastructure section mentions a *3D low-poly MMORPG* once — everything else says 2D pixel-art turn-based RPG. I treated that line as a copy-paste leftover from another project and planned a **2D pixel-art game**. Correct?
*Default: yes, 2D pixel-art.*

**A2. No payments in EA-0.1.** Crystals are fully earnable, no real-money shop anywhere (it's you + friends). The economy is still priced as if Crystals were premium, so a later shop wouldn't need rebalancing.
*Default: no payments.*

**A3. English-only at EA**, with all strings centralized for later localization.
*Default: yes.*

**A4. Daily reset timezone.** Quests/shops/springs rotate at a fixed hour; I picked **04:00 Europe/Berlin** (admin-changeable).
*Default: Europe/Berlin.*

**A5. Audio placeholders.** The repo has no audio. I plan CC0 packs (Kenney Audio / OpenGameArt) as placeholder SFX+music, tracked in CREDITS.md, swappable via the asset registry.
*Default: yes, CC0 placeholders.*

**A6. Idle animation timing.** Your idle GIFs have 9 frames; I standardized playback at **9 fps looped** and will support per-champion `attack/hit/death/cast` tracks whenever you upload them later (until then: procedural attack/hit/death fallbacks — lunge, flash, dissolve — so battles look alive with idle-only art). OK?
*Default: yes.*

**A7. Champion identities.** I assigned elements/factions/roles/kits to your 7 champions from their sprites (`docs/GAME_DESIGN.md §6`, kits in `docs/CONTENT_PLAN_EA01.md §1`) — e.g. Darius = Mist mage, Khazgor = Hollowborn tank, Rattledagger = skeletal turn-meter assassin, Sethlurias = Sskarn exile warder. Veto/rename anything freely — names, lore, elements, kits are all content-table data.
*Default: as designed.*

**A8. World/system names.** Elements (Ember/Tide/Verdant/Mist), currencies (Silver/Crystals/Valor Medals/Emblems), sigils (Faded/Gleaming/Mistwoven/Radiant), places (the Haven, Mistgate, Bazaar, the Depths, Hall of Valor), the Sskarn villain arc. All renameable — flag anything that doesn't land.
*Default: as designed.*

## B. Real decisions (please answer when you can)

**B1. Broodlings (food champions) — the one structural question.** The source game's leveling/rank-up economy runs on Common/Uncommon "food" champions. You said champion models = only your 7 (all Epic). Two options:
- **(a) Recommended:** add **Sskarn Broodlings** — Common/Uncommon food units using the *existing lizard model* with element tints. Source-faithful economy (summon fodder from Faded Sigils, campaign food drops, rank-up chains), lore-justified (captured broodlings), excluded from collection-completeness. No new art needed.
- **(b)** Strictly 7 collectible units: rank-ups consume a stackable item ("Soul Ember") instead of champions; Faded Sigils grant items, dupes stay the only "food". Cleaner collection, less RSL-like.
*Default: (a) Broodlings.*

**B2. Legendary pulls before Legendary art exists.** All 7 champions are Epic, but pools/rates include Legendary. Until you draw Legendary champions, a Legendary hit awards a clearly-labeled **"Mistbound Cache"** (big choice-chest: tomes/essences/relic + Epic selector) and the pity counter still resets. Alternative: cap pools at Epic (no Legendary hits at all) until art exists.
*Default: Mistbound Cache.*

**B3. Domains & VPS.** What domain(s) should nginx/certbot be configured for (e.g. `play.yourdomain.tld` + `admin.yourdomain.tld`)? Is the VPS already provisioned (IP/SSH), and should the admin subdomain be IP-allowlisted to you? Scripts read these from `.env` — needed by end of Phase P0.
*Default: placeholder `mistvale.example` config until provided.*

**B4. Deployment style.** I planned **bare-metal systemd + nginx + native PostgreSQL** (no Docker) to maximize the 4 GB/1-core box; DEPLOY.sh automates everything either way. Fine, or do you prefer Docker Compose despite the overhead?
*Default: bare-metal.*

**B5. Arena bots disclosure.** Bots carry natural names (indistinguishable from players) but auto-yield top-10 weekly spots. Should they instead carry a subtle marker (e.g. grey "wanderer" tag)?
*Default: natural names, no marker.*

**B6. Choice-based skill tomes.** Source game books a *random* skill; I planned **player-chooses-the-skill** (friendlier at small scale). Keep choice, or go source-faithful random?
*Default: choice.*

**B7. Campaign 3-star rule.** Source: "≤2 champions + under 10 min + no deaths". I planned **win / no deaths / ≤12 turns** (better fit for a 7-champion roster; turn limits per stage tunable). OK?
*Default: as planned.*

**B8. Profile-name policy.** 3–16 chars, letters/digits/space/`-`/`_`, uniqueness case-insensitive, rename only via Admin. Any profanity filtering wanted (friends-only suggests no)?
*Default: no filter, admin rename as the fix.*

## C. Approvals for suggested additions (GAME_DESIGN §15)
Each is small, planned-for, and cuttable — say no to any:
1. Multi-battle (30/day cap) — *default: in.*
2. Battle replays + shareable battle-log links — *default: in (P8).*
3. "Odds & Mercy" transparency panel — *default: in.*
4. Team presets per mode — *default: in.*
5. Daily first-win bonuses per mode — *default: in (P8).*
6. Practice sandbox (zero-energy, zero-reward re-fight of cleared stages) — *default: in (P6).*
7. Colorblind-safe element glyphs — *default: in.*
