#!/usr/bin/env bash
# =============================================================================
# SEED.sh — load the content seeds into the database
# =============================================================================
# Content is data (CLAUDE.md hard rule): the git seeds only BOOTSTRAP a fresh
# database — after that the DB is content truth and the Admin Suite is the
# editor. Therefore:
#
#   default          load seeds only into EMPTY content tables (safe, idempotent,
#                    run on every deploy — never overwrites authored content)
#   --force-content  full content refresh from the seeds: takes a backup first,
#                    requires a typed confirmation, and NEVER touches player data
#
# The actual work happens in the server package's seed entrypoint — the built
# bundle `dist/db/seed.js` on the VPS, or `pnpm --filter @mistvale/server run seed`
# in a source checkout. That code owns the schema, the validation and the content
# revision bump; this script is the safety wrapper around it.
# -----------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
enable_error_trap

usage() {
	cat <<EOF
${C_BOLD}SEED.sh${C_RESET} — load content seeds (empty tables only, unless forced)

  Usage: SEED.sh [options]

  Options:
    --force-content   re-seed ALL content definition tables from git seeds.
                      Takes a database backup first and asks for a typed
                      confirmation. Player data is never touched.
    --skip-backup     with --force-content: do not run BACKUP.sh first
                      (only sensible when a fresh backup already exists)
    --yes             skip the typed confirmation (for automation)
    --restart         restart ${SERVICE} afterwards so the in-memory
                      ContentCache reloads (implied by --force-content when the
                      service is running)
    -q, --quiet       less output
    -h, --help        show this help

  Examples:
    sudo -u ${APP_USER} ${SCRIPTS_DIR}/SEED.sh
    sudo ${SCRIPTS_DIR}/SEED.sh --force-content

  Notes:
    • Wraps the server's seed entrypoint: dist/db/seed.js (built release) or
      pnpm --filter ${SERVER_PKG} run seed (source checkout).
    • Content lives in the database after the first seed — the Admin Suite is the
      editor from then on. That is why the default never overwrites.
EOF
}

FORCE_CONTENT=0
SKIP_BACKUP=0
RESTART=0

while (($# > 0)); do
	case "$1" in
	-h | --help)
		usage
		exit 0
		;;
	--force-content)
		FORCE_CONTENT=1
		shift
		;;
	--skip-backup)
		SKIP_BACKUP=1
		shift
		;;
	--yes)
		MISTVALE_ASSUME_YES=1
		shift
		;;
	--restart)
		RESTART=1
		shift
		;;
	-q | --quiet)
		QUIET=1
		shift
		;;
	*)
		usage >&2
		die "unknown argument: $1"
		;;
	esac
done

load_env --required
require_env DATABASE_URL

db_reachable || die "cannot reach the database ($(mask_db_url "${DATABASE_URL}")) — is PostgreSQL running?"

# -----------------------------------------------------------------------------
# Forced re-seed: back up, confirm, then hand over to the server command.
# -----------------------------------------------------------------------------
if ((FORCE_CONTENT == 1)); then
	step "Forced content re-seed"

	confirm "RESEED" \
		"This replaces every *_defs (content) table with the git seeds. Content authored in the Admin Suite since the last export WILL BE LOST. Player accounts, rosters, gear and progress are untouched."

	if ((SKIP_BACKUP == 0)); then
		log "taking a safety backup first (BACKUP.sh)"
		BACKUP_ARGS=(--label pre-reseed)
		((QUIET == 1)) && BACKUP_ARGS+=(--quiet)
		"${SCRIPTS_DIR}/BACKUP.sh" "${BACKUP_ARGS[@]}" ||
			die "backup failed — refusing to re-seed content without a fresh backup (override with --skip-backup)"
	else
		warn "--skip-backup given: re-seeding without a fresh backup"
	fi

	# A running server keeps the old content in its in-memory cache, so a
	# restart is part of the operation, not an afterthought.
	if svc_active "${SERVICE}"; then
		RESTART=1
	fi
fi

# -----------------------------------------------------------------------------
# Run the seeder.
# -----------------------------------------------------------------------------
step "Seeding content"
SEED_ARGS=()
((FORCE_CONTENT == 1)) && SEED_ARGS+=(--force-content)

if ((${#SEED_ARGS[@]} > 0)); then
	run_server_entry "${ENTRY_SEED}" "${SCRIPT_SEED}" "${SEED_ARGS[@]}" || die "seeding failed"
else
	run_server_entry "${ENTRY_SEED}" "${SCRIPT_SEED}" || die "seeding failed"
fi
ok "seed command finished"

# -----------------------------------------------------------------------------
# Reload the running server so the ContentCache picks the new revision up.
# -----------------------------------------------------------------------------
if ((RESTART == 1)); then
	if svc_exists "${SERVICE}"; then
		step "Restarting ${SERVICE} (ContentCache reload)"
		systemctl_do restart "${SERVICE}"
		if health_check "${HEALTH_LITE_URL}" 15 2 >/dev/null; then
			ok "${SERVICE} healthy again"
		else
			die "${SERVICE} did not come back healthy after the re-seed — check: LOGS.sh -e"
		fi
	else
		warn "systemd unit ${SERVICE} not installed — skipping restart"
	fi
fi

REV="$(db_scalar "SELECT max(rev) FROM content_revisions")"
[[ -n "${REV}" ]] && log "content revision is now: ${REV}"
ok "content seeding complete"
