# Mistvale — Asset Guide

> Status: **Planning.** Inventory of what exists today, conventions for everything added later, and how assets flow into the game. The `assets/` folder is the source of truth for repo art; the Admin Suite handles post-deploy additions.

## 1. Current inventory (as of planning)

### Champions — `assets/champions/epic_<key>/`
7 champions, each: `still/<key>_still.png` (64×64 RGBA), `idle/frame_000..008.png` (9 frames, 64×64) + preview gif. Starters additionally have `<key>_avatar.png` (1254×1254 painted portrait).

| Key | Sprite read (visual) | Planned identity (GAME_DESIGN.md §champions) |
|---|---|---|
| `anuria` | White-haired woman, dark armor, bow across her back | Starter · Vale Sentinels · Tide · Attack **archer/ranger** (owner-confirmed; battles render her ranged with arrow projectiles) |
| `thordakk` | Bulky rust-armored warrior, huge axe | Starter · Emberclan · Ember · Attack bruiser (AoE) |
| `maruan` | Hooded wanderer, teal cloak & cape | Starter · Wayfarers · Verdant · Support (heal/DoT) |
| `darius` | Grey wizard: pointed hat, staff, tome | Wayfarers · Mist · Attack mage (AoE debuffer) |
| `khazgor` | Skull-faced heavy knight, red blade | Hollowborn · Ember · Defense tank (provoke/counter) |
| `rattledagger` | Small hooded skeletal rogue, dark cloak | Hollowborn · Mist · Attack assassin (speed/TM control) |
| `sethlurias` | Upright serpent-folk, crystal-tipped spear | Sskarn (exile) · Tide · Support/HP (shields, ward) |

Avatar art pending for the 4 non-starters → UI falls back to a framed, zoomed still (avatar slot in `asset_defs` makes the swap automatic later).

### Enemies — `assets/enemies/teritorial_lizard/`
One model (64×64 still + 9-frame idle). **All EA enemies use it**, differentiated by name/stats/skills/tint (variant tint defined per `enemy_defs` archetype: Skirmisher, Spearman, Shaman, Brute, Broodguard, Warchief, boss variants — see CONTENT_PLAN_EA01.md). Folder name keeps the original `teritorial_` spelling; the asset key normalizes to `enemy_lizard`.

### Placeholder champions (owner-approved convention)
The 30 art-pending roster champions + 6 food units (CONTENT_PLAN §1b) **also use `enemy_lizard`** with a per-champion tint and a framed, tinted still as their avatar (distinct rarity frame so cards still read correctly). When Marvin uploads a champion's real sprite/avatar through the Admin asset manager, the asset-registry reference swaps and every screen updates — no code, no redeploy. This convention applies to all future champions authored before their art exists.

### UI — `assets/ui/Kenney Fantasy UI Borders/`
Panels/borders/dividers (Default + Double styles, 32 variants each + transparent variants, SVG source, CC0 license file included). Used as 9-slice frames per UI_UX_DESIGN.md — selectively, not for everything.

## 2. Gaps to fill during development (sourcing plan)
| Need | EA source |
|---|---|
| Icons (items, stats, nav, status effects) | game-icons.net exclusively (CC BY 3.0, attributed in-game); fetched + tinted by `tools/icon-fetch`; if site unreachable → GitHub mirror `game-icons/icons` |
| Battle/scene backgrounds | Mist-layered gradient + silhouette compositions built from tinted shapes/particles in Pixi (art-free, moody) until real backdrops are provided; slot exists in `campaign_chapter_defs.background_asset` |
| Gear item art | game-icons.net placeholders (per-slot icon + set-color frame + rank pips) — explicitly placeholder until custom icons arrive |
| Audio (SFX) | **Synthesised, no files** — each cue is a `soundCue` content entry naming a bus and a handful of envelope/oscillator parameters, rendered in the browser (P10c). Nothing to licence, nothing to credit, nothing to download, and every cue retunable in Admin. A `sample` field on the same entry takes a recording instead: publish a file under `apps/client/public/`, name its path in the cue, and the synth stops being used for that cue alone. **Confirmed by the owner on 2026-08-18** (USER_QUESTIONS Q4): synthesised stays the voice for *interface* sound at EA. |
| Audio (music) | **The owner's own, two tracks.** `background_music_outside_combat.mp3` everywhere that is not a fight, `combat_campaign_depths_arena.mp3` in one. Each is a `soundCue` on the `music` bus with a `sample` and `loop: true`, so swapping either is an edit in Admin. Which plays follows the screen and nothing else. |
| Audio (narration) | **The owner's own, twelve of fifteen tutorial steps.** `tutorial_step_<n>.mp3`, numbered for the step it belongs to; a step with no file is read rather than heard, which is the design and not a gap. On the `sfx` bus, because somebody who muted the soundtrack still wants to be told what to do. |
| Portraits | `assets/ui/misc_avatars/` — photographic rather than pixel art, and the one place in the game with smoothing left on. `wardenmaster_avatar.jpg` is the only one so far; a `tutorialStep.portrait` names it, so a second speaker is content. |
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
Build: `tools/asset-sync` (`pnpm assets`) copies `assets/champions|enemies/<unit>/` into `apps/client/public/sprites/<kind>/<unit>/` with names the client can build a URL from (`idle/frame_000.png…`, `still.png`, `avatar.png`) plus a `manifest.json` recording each unit's real frame count — so the client reads how many frames a unit *has* rather than trusting a content field that could drift. It runs from the client's own `dev` and `build`, and the published tree is gitignored: it is generated output, not a second copy of the art. `--check` (`pnpm assets:check`) answers "is my published tree current?" without rewriting it.

The same tool publishes three folders of **finished media**, and does the opposite of what it does to sprites: it copies them under their own filenames, because content points at them *by name*. `assets/music_and_sounds/background_music/` → `public/audio/music/`, `assets/music_and_sounds/tutorial_sounds/` → `public/audio/tutorial/`, `assets/ui/misc_avatars/` → `public/portraits/`. All three targets are gitignored for the reason the sprites are, only more so: the two music tracks alone are 16 MB, and a second copy of them in git would be 16 MB nobody can edit. A source folder that is not there publishes nothing and says so — silence is a supported state, not an error path, because three tutorial steps have no recording on purpose. Later, `tools/atlas-pack` packs frames → hashed atlases in `apps/client/public/atlases/` + manifest. Runtime additions: Admin upload → server-side pack → `/uploads` → `asset_defs` row → content publish → clients pick it up on next bundle fetch. GIFs in the repo are previews only — the game always renders from frame PNGs/atlases, never GIFs.
