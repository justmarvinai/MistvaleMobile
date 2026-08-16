# AGENTS.md — MistvaleMobile

Instructions for AI coding agents working in this repository.

**Read `CLAUDE.md` first** — it is the authoritative working agreement (project state, hard rules, locked stack, conventions, doc reading order). It applies to every agent, not only Claude.

Quick facts:
- Mistvale = 2D pixel-art turn-based champion-collection RPG; authoritative server; content lives in PostgreSQL; Admin Suite lives in the sibling repo `MistvaleMobile-Admin` (frontend for this server's `/admin/api`).
- **Status: planning docs only — implementation begins with ROADMAP.md Phase P0.** Do not invent structure that contradicts `docs/ARCHITECTURE.md` / `docs/DATA_MODEL.md`.
- Sacred constraints: no serif fonts; no generic component-library UI in the game client; icons only from game-icons.net; assets only from `assets/` + documented CC0/CC-BY sources; no client-side game math; production quality only (no skeletons/MVPs).
- Check `USER_QUESTIONS.md` before implementing anything it lists as undecided; work to the stated recommended default if unanswered.
- Never push to `main`; work on the designated feature branch; keep `CHANGELOG.md` and affected docs updated in the same change.
