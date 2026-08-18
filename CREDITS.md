# CREDITS

Third-party assets used by Mistvale. Everything in `assets/` not listed here is original work owned by the project owner (all commercial rights held). This file is binding: no third-party asset enters the game without an entry here (see `docs/ASSET_GUIDE.md §3`).

| Asset | Source | License | Status |
|---|---|---|---|
| Fantasy UI Borders (panels, borders, dividers) | [Kenney](https://kenney.nl) — `assets/ui/Kenney Fantasy UI Borders/` | CC0 (license file included in folder) | In repo |
| UI icons (items, stats, navigation, status effects, champion placeholder) — 84 icons from 7 authors | [game-icons.net](https://game-icons.net) — fetched via `tools/icon-fetch` (`pnpm icons`) | CC BY 3.0 — per-icon authors listed in the generated `apps/client/public/icons/ATTRIBUTION.md`, surfaced in-game under Settings → Credits | In use (P0) |
| **FantasyUIs** — 104 UI components and 464 art files (dark-ember, deco-frames, line-glyphs, spell-icons, plus the seven Stone & Vine files Dark Ember's theme references) | [justmarvinai/FantasyUIs](https://github.com/justmarvinai/FantasyUIs) — the owner's own library, vendored by `pnpm fui:vendor` into `apps/client/src/fui/` and `public/fui/` | Owner's own work (all rights held); the underlying art packs are the CC0 and CC-BY sets that library credits | In use (design rework, 2026-08-18) |
| Fonts: Pixelify Sans, Inter | Google Fonts (self-hosted) | OFL 1.1 | Planned (P0) |
| Placeholder SFX & music | Kenney Audio packs / OpenGameArt CC0 (exact packs listed when added) | CC0 | Planned (P10, owner-approved) |
