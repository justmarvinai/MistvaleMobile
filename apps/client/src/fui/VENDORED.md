# Vendored from FantasyUIs

<!-- Written by tools/fui-vendor. Do not edit these files by hand: the next
     `pnpm fui:vendor` overwrites them, and a local fix would vanish with it.
     Mistvale-specific changes belong in ../ui/ or in the theme. -->

Source: [justmarvinai/FantasyUIs](https://github.com/justmarvinai/FantasyUIs) — `ref: refs/heads/main`

- **99 components**, 204 files, resolved through the
  library's own `/r/<Name>.json` records (the `copy` field is the transitive closure
  of real import statements).
- **4 art packs** — dark-ember, deco-frames, line-glyphs, spell-icons — 457 files,
  5.1 MB, in `apps/client/public/fui/`.

Re-vendor with `pnpm fui:vendor --from <path to a FantasyUIs checkout>`; CI runs
`--check` and fails when a vendored file has drifted from the library.
