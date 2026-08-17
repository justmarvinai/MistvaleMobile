#!/usr/bin/env bash
# =============================================================================
# RESTORE.sh — restore the database (+ uploads) from a BACKUP.sh backup
# =============================================================================
# Per DEPLOYMENT_OPERATIONS.md §2/§4:
#   list backups → typed confirmation → stop server → restore DB (+uploads)
#   → start server → health check
#
# Disaster recovery on a new box is: DEPLOY.sh, then this script pointed at an
# offsite copy (≈30 min end to end).
#
# Safety rails (features, not polish):
#   • a safety dump of the CURRENT database is taken before anything is dropped
#   • the typed phrase RESTORE is required (no y/n slip)
#   • the existing uploads directory is moved aside, never deleted
#   • every destructive path goes through safe_rm_rf's guards
# -----------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
enable_error_trap

usage() {
	cat <<EOF
${C_BOLD}RESTORE.sh${C_RESET} — restore database + uploads from a backup

  Usage: RESTORE.sh [options] [<YYYY-MM-DD> | <path to .dump> | <backup dir>]

  With no argument the available backups are listed and you pick one.

  Options:
    --list                 list backups and exit
    --db-only              restore the database, leave uploads untouched
    --uploads-only         restore uploads, leave the database untouched
    --no-safety-backup     skip the pre-restore dump of the current database
                           (NOT recommended — that dump is your undo button)
    --migrate              run pending migrations after the restore
                           (needed when restoring an older dump onto newer code)
    --yes                  skip the typed confirmation (automation only)
    -h, --help             show this help

  Examples:
    sudo ${SCRIPTS_DIR}/RESTORE.sh --list
    sudo ${SCRIPTS_DIR}/RESTORE.sh 2026-08-15
    sudo ${SCRIPTS_DIR}/RESTORE.sh ${BACKUP_DIR}/2026-08-15/db-20260815T033001Z.dump

  This script must run as root: it stops/starts ${SERVICE} and rewrites
  ${UPLOADS}.
EOF
}

SELECTION=""
DO_DB=1
DO_UPLOADS=1
SAFETY_BACKUP=1
DO_MIGRATE=0
LIST_ONLY=0

while (($# > 0)); do
	case "$1" in
	-h | --help)
		usage
		exit 0
		;;
	--list)
		LIST_ONLY=1
		shift
		;;
	--db-only)
		DO_UPLOADS=0
		shift
		;;
	--uploads-only)
		DO_DB=0
		shift
		;;
	--no-safety-backup)
		SAFETY_BACKUP=0
		shift
		;;
	--migrate)
		DO_MIGRATE=1
		shift
		;;
	--yes)
		MISTVALE_ASSUME_YES=1
		shift
		;;
	-*)
		usage >&2
		die "unknown option: $1"
		;;
	*)
		[[ -z "${SELECTION}" ]] || die "only one backup can be selected (got '${SELECTION}' and '$1')"
		SELECTION="$1"
		shift
		;;
	esac
done

load_env --required
require_env DATABASE_URL DB_NAME DB_USER
need_cmd pg_restore psql tar

# Listing is harmless; everything else stops the service and rewrites data.
((LIST_ONLY == 1)) || require_root

# libpq: lift the 60s statement_timeout for the (potentially long) restore.
export PGOPTIONS="${PGOPTIONS:-} -c statement_timeout=0"

# -----------------------------------------------------------------------------
# 1. Discover backups
# -----------------------------------------------------------------------------
# BACKUP_DAYS holds one entry per backup directory that contains a dump.
mapfile -t BACKUP_DAYS < <(
	find "${BACKUP_DIR}" -mindepth 1 -maxdepth 1 -type d -name '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' -printf '%f\n' 2>/dev/null | sort -r
)

# manifest_for <dump path> — the manifest BACKUP.sh wrote next to a dump:
#   db-<ts>[-label].dump  →  manifest-<ts>[-label].txt
manifest_for() {
	local dump="$1" dir base rest
	dir="$(dirname -- "${dump}")"
	base="$(basename -- "${dump}")"
	rest="${base#db-}"
	printf '%s/manifest-%s.txt' "${dir}" "${rest%.dump}"
}

list_backups() {
	local day dir dump man label count=0
	if ((${#BACKUP_DAYS[@]} == 0)); then
		warn "no backups found in ${BACKUP_DIR}"
		return 0
	fi
	printf '%s%-4s %-12s %-36s %-8s %s%s\n' "${C_BOLD}" "#" "DAY" "DUMP" "SIZE" "LABEL" "${C_RESET}"
	for day in "${BACKUP_DAYS[@]}"; do
		dir="${BACKUP_DIR}/${day}"
		while IFS= read -r dump; do
			[[ -n "${dump}" ]] || continue
			count=$((count + 1))
			man="$(manifest_for "${dump}")"
			label=""
			[[ -f "${man}" ]] && label="$(sed -n 's/^label:[[:space:]]*//p' "${man}" | head -n1)"
			printf '%-4s %-12s %-36s %-8s %s\n' \
				"${count}" "${day}" "$(basename -- "${dump}")" \
				"$(human_size "${dump}")" "${label}"
		done < <(find "${dir}" -maxdepth 1 -type f -name 'db-*.dump' | sort -r)
	done
	printf '\n%sTotal: %s in %s%s\n' "${C_DIM}" "$(human_size "${BACKUP_DIR}")" "${BACKUP_DIR}" "${C_RESET}"
}

if ((LIST_ONLY == 1)); then
	list_backups
	exit 0
fi

((${#BACKUP_DAYS[@]} > 0)) || die "no backups found in ${BACKUP_DIR} — nothing to restore"

# -----------------------------------------------------------------------------
# 2. Resolve the selection to a dump file (+ matching uploads archive)
# -----------------------------------------------------------------------------
DUMP_FILE=""
UPLOADS_ARCHIVE=""

resolve_dir() { # newest dump inside a backup day directory
	local dir="$1" newest
	newest="$(find "${dir}" -maxdepth 1 -type f -name 'db-*.dump' | sort -r | head -n1)"
	[[ -n "${newest}" ]] || die "no db-*.dump file in ${dir}"
	printf '%s' "${newest}"
}

if [[ -z "${SELECTION}" ]]; then
	# Interactive picker.
	list_backups
	echo
	SELECTION="$(ask "Backup to restore (YYYY-MM-DD, or full path to a .dump)" "${BACKUP_DAYS[0]}")"
	[[ -n "${SELECTION}" ]] || die "nothing selected"
fi

if [[ -f "${SELECTION}" ]]; then
	DUMP_FILE="$(readlink -f -- "${SELECTION}")"
elif [[ -d "${SELECTION}" ]]; then
	DUMP_FILE="$(resolve_dir "${SELECTION}")"
elif [[ -d "${BACKUP_DIR}/${SELECTION}" ]]; then
	DUMP_FILE="$(resolve_dir "${BACKUP_DIR}/${SELECTION}")"
else
	die "cannot find a backup for '${SELECTION}' (try: RESTORE.sh --list)"
fi

[[ -r "${DUMP_FILE}" ]] || die "dump not readable: ${DUMP_FILE}"

# The uploads archive that shares the dump's timestamp, else the newest in the
# same directory (a --no-uploads run leaves none at all).
DUMP_DIR="$(dirname -- "${DUMP_FILE}")"
DUMP_BASE="$(basename -- "${DUMP_FILE}")"
CANDIDATE="${DUMP_DIR}/uploads-${DUMP_BASE#db-}"
CANDIDATE="${CANDIDATE%.dump}.tar.gz"
if [[ -f "${CANDIDATE}" ]]; then
	UPLOADS_ARCHIVE="${CANDIDATE}"
else
	UPLOADS_ARCHIVE="$(find "${DUMP_DIR}" -maxdepth 1 -type f -name 'uploads-*.tar.gz' | sort -r | head -n1 || true)"
fi

# -----------------------------------------------------------------------------
# 3. Show exactly what is about to happen, then demand the typed phrase.
# -----------------------------------------------------------------------------
step "Restore plan"
MANIFEST="$(manifest_for "${DUMP_FILE}")"
printf '  database dump : %s (%s)\n' "${DUMP_FILE}" "$(human_size "${DUMP_FILE}")"
if ((DO_UPLOADS == 1)); then
	if [[ -n "${UPLOADS_ARCHIVE}" ]]; then
		printf '  uploads       : %s (%s)\n' "${UPLOADS_ARCHIVE}" "$(human_size "${UPLOADS_ARCHIVE}")"
	else
		printf '  uploads       : %s\n' "none in this backup — ${UPLOADS} will be left as is"
	fi
else
	printf '  uploads       : skipped (--db-only)\n'
fi
printf '  target db     : %s\n' "$(mask_db_url "${DATABASE_URL}")"
printf '  service       : %s (will be stopped and restarted)\n' "${SERVICE}"
if [[ -f "${MANIFEST}" ]]; then
	printf '  manifest      :\n'
	sed 's/^/      /' "${MANIFEST}"
fi
hr

((DO_DB == 1 || DO_UPLOADS == 1)) || die "--db-only and --uploads-only cancel each other out"

WHAT="the live database"
if ((DO_DB == 0)); then
	WHAT="the uploads directory"
elif ((DO_UPLOADS == 1)) && [[ -n "${UPLOADS_ARCHIVE}" ]]; then
	WHAT="the live database and the uploads directory"
fi
confirm "RESTORE" \
	"This REPLACES ${WHAT} with the backup above. Everything created since that backup (accounts, progress, summons, content edits) is lost."

# -----------------------------------------------------------------------------
# 4. Safety dump of the current state — the undo button.
# -----------------------------------------------------------------------------
if ((SAFETY_BACKUP == 1)); then
	step "Safety backup of the CURRENT database"
	if "${SCRIPTS_DIR}/BACKUP.sh" --label pre-restore --no-prune --no-offsite; then
		ok "safety backup written (restore it the same way if this goes wrong)"
	else
		warn "safety backup failed"
		confirm "CONTINUE-WITHOUT-BACKUP" "There is no fresh dump of the current state."
	fi
else
	warn "--no-safety-backup: proceeding without an undo point"
fi

# -----------------------------------------------------------------------------
# 5. Stop the server (no writes during the swap).
# -----------------------------------------------------------------------------
SERVICE_WAS_ACTIVE=0
if svc_exists "${SERVICE}" && svc_active "${SERVICE}"; then
	SERVICE_WAS_ACTIVE=1
	step "Stopping ${SERVICE}"
	systemctl_do stop "${SERVICE}"
	ok "${SERVICE} stopped"
fi

# -----------------------------------------------------------------------------
# 6. Database: drop + recreate + pg_restore.
#    Dropping/creating needs a superuser connection; the restore itself runs as
#    the app role so every object ends up owned by ${DB_USER}.
#    (citext is a trusted extension since PG13, so the app role can create it.)
# -----------------------------------------------------------------------------
if ((DO_DB == 1)); then
	step "Restoring database ${DB_NAME}"

	# `cd /` first: the postgres user cannot read root's cwd and sudo would warn.
	psql_super() { (cd / && sudo -u postgres psql -X -v ON_ERROR_STOP=1 --no-psqlrc -d postgres "$@"); }
	id -u postgres >/dev/null 2>&1 || die "the 'postgres' system user is missing — cannot drop/create the database"

	log "dropping and recreating ${DB_NAME} (existing connections are terminated)"
	psql_super -v db="${DB_NAME}" -v owner="${DB_USER}" <<'SQL'
-- WITH (FORCE) terminates leftover connections (PG13+); the service is already
-- stopped, this only catches stray psql sessions.
DROP DATABASE IF EXISTS :"db" WITH (FORCE);
CREATE DATABASE :"db" OWNER :"owner";
SQL

	log "pg_restore → ${DB_NAME} (this is the slow part)"
	# --no-owner/--no-privileges: the dump was taken the same way; every object
	# becomes owned by the connecting role (${DB_USER}).
	# Single job: one core, and -j on a custom dump would only add contention.
	if ! nice -n 5 pg_restore --no-owner --no-privileges --exit-on-error \
		-d "${DATABASE_URL}" "${DUMP_FILE}"; then
		err "pg_restore failed — the database is in a partial state"
		die "restore aborted; the pre-restore safety dump in ${BACKUP_DIR} is your way back"
	fi

	psql -X -tA -q --no-psqlrc -d "${DATABASE_URL}" -c 'ANALYZE' >/dev/null 2>&1 || true
	ok "database restored"
fi

# -----------------------------------------------------------------------------
# 7. Uploads: move the current directory aside, extract the archive.
#    Never deleted — a stale uploads dir is cheap, a lost one is not.
# -----------------------------------------------------------------------------
if ((DO_UPLOADS == 1)) && [[ -n "${UPLOADS_ARCHIVE}" ]]; then
	step "Restoring uploads"
	UPLOADS_PARENT="$(dirname -- "${UPLOADS}")"
	ensure_dir "${UPLOADS_PARENT}"

	if [[ -d "${UPLOADS}" ]]; then
		ASIDE="${UPLOADS}.pre-restore.$(ts_utc)"
		mv -T -- "${UPLOADS}" "${ASIDE}"
		log "previous uploads moved to ${ASIDE} (delete it yourself once happy)"
	fi

	# The archive stores the directory with its own basename, so extracting into
	# the parent recreates ${UPLOADS} exactly.
	tar -xzf "${UPLOADS_ARCHIVE}" -C "${UPLOADS_PARENT}"
	chown -R "${APP_USER}:${APP_GROUP}" "${UPLOADS}"
	chmod 0755 "${UPLOADS}"
	ok "uploads restored ($(human_size "${UPLOADS}"))"
fi

# -----------------------------------------------------------------------------
# 8. Optional migrations (older dump + newer code).
# -----------------------------------------------------------------------------
if ((DO_MIGRATE == 1)); then
	step "Running migrations"
	need_cmd pnpm
	run_in_dir "${REPO_DIR}" pnpm --filter "${SERVER_PKG}" migrate
	ok "migrations applied"
fi

# -----------------------------------------------------------------------------
# 9. Start + health check.
# -----------------------------------------------------------------------------
if svc_exists "${SERVICE}"; then
	step "Starting ${SERVICE}"
	systemctl_do start "${SERVICE}"
	if health_check "${HEALTH_LITE_URL}" 20 2 >/dev/null; then
		ok "${SERVICE} is healthy"
	else
		err "${SERVICE} did not become healthy after the restore"
		err "check: ${SCRIPTS_DIR}/LOGS.sh -e   |   systemctl status ${SERVICE}"
		exit 1
	fi
elif ((SERVICE_WAS_ACTIVE == 1)); then
	warn "systemd unit ${SERVICE} disappeared — start the server manually"
fi

step "Restore complete"
printf '  restored from : %s\n' "${DUMP_FILE}"
printf '  content rev   : %s\n' "$(db_scalar "SELECT max(rev) FROM content_revisions")"
printf '  accounts      : %s\n' "$(db_scalar "SELECT count(*) FROM accounts")"
printf '  players       : %s\n' "$(db_scalar "SELECT count(*) FROM players")"
hr
log "smoke-test now: log in, run one battle, open ${DOMAIN}/admin"
if ((DO_MIGRATE == 0)); then
	log "if this dump predates the deployed code, run: ${SCRIPTS_DIR}/UPDATE.sh (applies pending migrations)"
fi
