# AGENTS.md — MistvaleMobile

Instructions for AI coding agents working in this repository.

**Read `CLAUDE.md` first** — it is the authoritative working agreement (project state, hard rules, locked stack, conventions, doc reading order). It applies to every agent, not only Claude.

Quick facts:
- Mistvale = 2D pixel-art turn-based champion-collection RPG; authoritative server; content lives in PostgreSQL; Admin Suite lives in the sibling repo `MistvaleMobile-Admin` (frontend for this server's `/admin/api`).
- **Status: phases P0–P6 complete; P7 (Arena & bots) is next** — `CLAUDE.md` carries the current state in full, `ROADMAP.md` the phase plan. Do not invent structure that contradicts `docs/ARCHITECTURE.md` / `docs/DATA_MODEL.md`.
- Sacred constraints: no serif fonts; no generic component-library UI in the game client; icons only from game-icons.net; assets only from `assets/` + documented CC0/CC-BY sources; no client-side game math; production quality only (no skeletons/MVPs).
- Check `USER_QUESTIONS.md` before implementing anything it lists as undecided; work to the stated recommended default if unanswered.
- **Work on `main` and push there directly** — the owner's standing instruction; there is no feature branch and nothing sits in front of `main`, so every push must leave `pnpm verify` and `pnpm sim` green. Keep `CHANGELOG.md` and affected docs updated in the same change.
