# Mistvale — Asset Guide

> Status: **Planning.** Inventory of what exists today, conventions for everything added later, and how assets flow into the game. The `assets/` folder is the source of truth for repo art; the Admin Suite handles post-deploy additions.

## 1. Current inventory (as of planning)

### Champions — `assets/champions/epic_<key>/`
7 champions, each: `still/<key>_still.png` (64×64 RGBA), `idle/frame_000..008.png` (9 frames, 64×64) + preview gif. Starters additionally have `<key>_avatar.png` (1254×1254 painted portrait).

| Key | Sprite read (visual) | Planned identity (GAME_DESIGN.md §champions) |
|---|---|---|
| `anuria` | White-haired woman, dark armor, greatsword on back | Starter · Vale Sentinels · Tide · Attack duelist |
| `thordakk` | Bulky rust-armored warrior, huge axe | Starter · Emberclan · Ember · Attack bruiser (AoE) |
| `maruan` | Hooded wanderer, teal cloak & cape | Starter · Wayfarers · Verdant · Support (heal/DoT) |
| `darius` | Grey wizard: pointed hat, staff, tome | Wayfarers · Mist · Attack mage (AoE debuffer) |
| `khazgor` | Skull-faced heavy knight, red blade | Hollowborn · Ember · Defense tank (provoke/counter) |
| `rattledagger` | Small hooded skeletal rogue, dark cloak | Hollowborn · Mist · Attack assassin (speed/TM control) |
| `sethlurias` | Upright serpent-folk, crystal-tipped spear | Sskarn (exile) · Tide · Support/HP (shields, ward) |

Avatar art pending for the 4 non-starters → UI falls back to a framed, zoomed still (avatar slot in `asset_defs` makes the swap automatic later).

### Enemies — `assets/enemies/teritorial_lizard/`
One model (64×64 still + 9-frame idle). **All EA enemies use it**, differentiated by name/stats/skills/tint (variant tint defined per `enemy_defs` archetype: Skirmisher, Spearman, Shaman, Brute, Broodguard, Warchief, boss variants — see CONTENT_PLAN_EA01.md). Folder name keeps the original `teritorial_` spelling; the asset key normalizes to `enemy_lizard`.

### UI — `assets/ui/Kenney Fantasy UI Borders/`
Panels/borders/dividers (Default + Double styles, 32 variants each + transparent variants, SVG source, CC0 license file included). Used as 9-slice frames per UI_UX_DESIGN.md — selectively, not for everything.

## 2. Gaps to fill during development (sourcing plan)
| Need | EA source |
|---|---|
| Icons (items, stats, nav, status effects) | game-icons.net exclusively (CC BY 3.0, attributed in-game); fetched + tinted by `tools/icon-fetch`; if site unreachable → GitHub mirror `game-icons/icons` |
| Battle/scene backgrounds | Mist-layered gradient + silhouette compositions built from tinted shapes/particles in Pixi (art-free, moody) until real backdrops are provided; slot exists in `campaign_chapter_defs.background_asset` |
| Gear item art | game-icons.net placeholders (per-slot icon + set-color frame + rank pips) — explicitly placeholder until custom icons arrive |
| Audio (SFX + music) | None in repo → CC0 packs (Kenney Audio, OpenGameArt CC0) as placeholders, registered in `asset_defs`, listed in CREDITS.md — pending approval in USER_QUESTIONS.md |
| VFX (slashes, sparks, mist) | Hand-built Pixi particle presets + tiny hand-drawn pixel overlay strips (authored during P3, kept in `assets/vfx/`) |
| Summon portal, Haven vista | Composited from tinted Kenney frames + particles + our pixel ornaments in P5; upgrade path via admin upload |

## 3. Conventions (for all future art — binding)
- Unit sprites: 64×64 RGBA PNG, transparent background, feet baseline at y=58, facing **right** (engine mirrors for enemy side), pixel grid locked (no partial-pixel AA).
- Animation tracks per unit: `idle` (loop, 9f @ 9 fps standard), later `attack` (non-loop), `hit` (non-loop, ≤4f), `death` (non-loop), `cast` (optional). Frame files `frame_000.png…`; any frame count allowed — fps + loop declared in `asset_defs.tracks`.
- Missing tracks auto-fallback procedurally (ARCHITECTURE §4.3) — art can arrive incrementally, per-champion, via Admin upload with zero code changes.
- Naming: folders `champions/<rarity>_<key>` mirrors current layout; keys lowercase snake, stable forever (DB references them).
- Avatars: square ≥512×512, PNG/JPG; UI crops circle + frame.
- Licensing: everything in `assets/` is rights-cleared by the owner (per project brief). Third-party sources tracked in `CREDITS.md` (Kenney CC0 noted, game-icons CC BY with author list, audio packs when added). No other external art sources without an entry there.

## 4. Pipeline recap
Build: `tools/atlas-pack` packs frames → hashed atlases in `apps/client/public/atlases/` + manifest. Runtime additions: Admin upload → server-side pack → `/uploads` → `asset_defs` row → content publish → clients pick it up on next bundle fetch. GIFs in the repo are previews only — the game always renders from frame PNGs/atlases, never GIFs.
