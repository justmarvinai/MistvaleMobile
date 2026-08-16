#!/usr/bin/env bash
# =============================================================================
# BACKUP.sh — database + uploads backup (cron-safe)
# =============================================================================
# Per DEPLOYMENT_OPERATIONS.md §2:
#   • pg_dump -Fc of the game database
#   • tar.gz of /var/lib/mistvale/uploads (admin-uploaded art)
#   → /var/backups/mistvale/<UTC date>/
#   • retention: 14 daily + 8 weekly (the weekday configured as the weekly
#     anchor survives for 8 weeks, everything else for 14 days)
#   • optional offsite push with `rclone copy` when RCLONE_REMOTE is set
#
# Installed by DEPLOY.sh as a system cron job at 03:30 (before the 04:00
# in-process daily reset, so the dump captures a clean pre-reset state).
#
# The script is safe to run at any time: it never stops the service — pg_dump
# takes a consistent MVCC snapshot, and uploads are content-hashed write-once
# files, so a concurrent upload can only be missing from the tarball, never
# corrupt it.
# -----------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
enable_error_trap

usage() {
	cat <<EOF
${C_BOLD}BACKUP.sh${C_RESET} — pg_dump + uploads tarball with retention

  Usage: BACKUP.sh [options]

  Options:
    --label <name>    tag this backup (e.g. pre-reseed, pre-update); the label
                      becomes part of the filenames and the backup is exempt
                      from daily pruning for 14 days like any other
    --no-uploads      skip the uploads tarball (database only)
    --no-offsite      skip the rclone copy even when RCLONE_REMOTE is set
    --no-prune        keep every existing backup (no retention pass)
    -q, --quiet       cron mode: only warnings and errors
    -h, --help        show this help

  Layout:
    ${BACKUP_DIR}/<YYYY-MM-DD>/db-<UTC ts>[-label].dump      (pg_dump -Fc)
    ${BACKUP_DIR}/<YYYY-MM-DD>/uploads-<UTC ts>[-label].tar.gz
    ${BACKUP_DIR}/<YYYY-MM-DD>/manifest-<UTC ts>[-label].txt

  Retention (from ${ENV_FILE}):
    BACKUP_RETAIN_DAILY=${BACKUP_RETAIN_DAILY:-14} days
    BACKUP_RETAIN_WEEKLY=${BACKUP_RETAIN_WEEKLY:-8} weeks (anchor weekday ${BACKUP_WEEKLY_DOW:-7})

  Cron (installed by DEPLOY.sh):
    30 3 * * * ${APP_USER} ${SCRIPTS_DIR}/BACKUP.sh --quiet
EOF
}

LABEL=""
DO_UPLOADS=1
DO_OFFSITE=1
DO_PRUNE=1

while (($# > 0)); do
	case "$1" in
	-h | --help)
		usage
		exit 0
		;;
	--label)
		LABEL="${2:-}"
		[[ -n "${LABEL}" ]] || die "--label needs a value"
		# keep filenames boring and predictable
		LABEL="$(printf '%s' "${LABEL}" | tr -c 'A-Za-z0-9._-' '-')"
		shift 2
		;;
	--no-uploads)
		DO_UPLOADS=0
		shift
		;;
	--no-offsite)
		DO_OFFSITE=0
		shift
		;;
	--no-prune)
		DO_PRUNE=0
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
need_cmd pg_dump tar

: "${BACKUP_RETAIN_DAILY:=14}"
: "${BACKUP_RETAIN_WEEKLY:=8}"
: "${BACKUP_WEEKLY_DOW:=7}"

# Long-running maintenance overrides the 60s statement_timeout from
# scripts/deploy-assets/postgres-mistvale.conf (libpq reads PGOPTIONS).
export PGOPTIONS="${PGOPTIONS:-} -c statement_timeout=0"

# -----------------------------------------------------------------------------
# Single-instance guard: cron must never stack backups on a 1-core box.
# -----------------------------------------------------------------------------
LOCK_FILE="${BACKUP_DIR}/.backup.lock"
ensure_dir "${BACKUP_DIR}" "" 0750
if have_cmd flock; then
	exec 9>"${LOCK_FILE}"
	if ! flock -n 9; then
		warn "another BACKUP.sh is already running (lock: ${LOCK_FILE}) — exiting"
		exit 0
	fi
fi

TS="$(ts_utc)"
DAY="$(date_utc)"
SUFFIX=""
[[ -n "${LABEL}" ]] && SUFFIX="-${LABEL}"

DEST="${BACKUP_DIR}/${DAY}"
ensure_dir "${DEST}" "" 0750

DB_FILE="${DEST}/db-${TS}${SUFFIX}.dump"
UPLOADS_FILE="${DEST}/uploads-${TS}${SUFFIX}.tar.gz"
MANIFEST="${DEST}/manifest-${TS}${SUFFIX}.txt"

step "Backup ${TS}${SUFFIX:+ (${LABEL})}"

# -----------------------------------------------------------------------------
# 1. Database — custom format (-Fc): compressed, parallel-restorable, selective.
#    Written to a .part file first so a crashed run never leaves a dump that
#    looks complete.
# -----------------------------------------------------------------------------
log "pg_dump → $(basename -- "${DB_FILE}")"
if ! nice -n 10 pg_dump -Fc --no-owner --no-privileges -d "${DATABASE_URL}" -f "${DB_FILE}.part"; then
	rm -f -- "${DB_FILE}.part"
	die "pg_dump failed — no backup written"
fi
mv -f -- "${DB_FILE}.part" "${DB_FILE}"
chmod 0640 "${DB_FILE}"

# Verify the dump is readable before we claim success (catches truncation and
# a wrong/rotated password far earlier than restore day does).
if have_cmd pg_restore; then
	if ! pg_restore --list "${DB_FILE}" >/dev/null 2>&1; then
		die "the dump ${DB_FILE} is not readable by pg_restore — treating this backup as failed"
	fi
fi
DB_SIZE="$(human_size "${DB_FILE}")"
ok "database dump ok (${DB_SIZE})"

# -----------------------------------------------------------------------------
# 2. Uploads — admin-uploaded art. Missing/empty is normal on a fresh box.
# -----------------------------------------------------------------------------
UPLOADS_SIZE="-"
if ((DO_UPLOADS == 1)); then
	if [[ -d "${UPLOADS}" ]]; then
		log "tar → $(basename -- "${UPLOADS_FILE}")"
		# -C so the archive holds relative paths (uploads/...), which makes
		# RESTORE.sh's extraction target explicit and safe.
		if ! nice -n 10 tar -czf "${UPLOADS_FILE}.part" \
			-C "$(dirname -- "${UPLOADS}")" "$(basename -- "${UPLOADS}")"; then
			rm -f -- "${UPLOADS_FILE}.part"
			die "uploads tarball failed"
		fi
		mv -f -- "${UPLOADS_FILE}.part" "${UPLOADS_FILE}"
		chmod 0640 "${UPLOADS_FILE}"
		UPLOADS_SIZE="$(human_size "${UPLOADS_FILE}")"
		ok "uploads archive ok (${UPLOADS_SIZE})"
	else
		warn "uploads directory ${UPLOADS} does not exist — skipping (nothing uploaded yet?)"
	fi
else
	log "--no-uploads: database only"
fi

# -----------------------------------------------------------------------------
# 3. Manifest — what this backup contains and how to restore it.
# -----------------------------------------------------------------------------
{
	echo "mistvale backup manifest"
	echo "created_utc:   $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
	echo "label:         ${LABEL:-none}"
	echo "host:          $(hostname -f 2>/dev/null || hostname)"
	echo "database:      $(mask_db_url "${DATABASE_URL}")"
	echo "db_dump:       $(basename -- "${DB_FILE}") (${DB_SIZE})"
	echo "uploads:       $(if [[ -f "${UPLOADS_FILE}" ]]; then basename -- "${UPLOADS_FILE}"; else echo none; fi) (${UPLOADS_SIZE})"
	echo "content_rev:   $(db_scalar "SELECT max(rev) FROM content_revisions")"
	echo "accounts:      $(db_scalar "SELECT count(*) FROM accounts")"
	echo "players:       $(db_scalar "SELECT count(*) FROM players")"
	echo "release:       $(link_target "${CURRENT_LINK}")"
	echo "game_sha:      $(repo_sha "${REPO_DIR}")"
	echo "admin_sha:     $(repo_sha "${ADMIN_REPO_DIR}")"
	echo "restore_with:  ${SCRIPTS_DIR}/RESTORE.sh ${DAY}"
} >"${MANIFEST}"
chmod 0640 "${MANIFEST}"

# -----------------------------------------------------------------------------
# 4. Retention — 14 daily + 8 weekly (DEPLOYMENT_OPERATIONS §2).
#    Backups live in flat <YYYY-MM-DD> directories; a directory survives when
#      • it is younger than BACKUP_RETAIN_DAILY days, or
#      • it falls on the weekly anchor weekday and is younger than
#        BACKUP_RETAIN_WEEKLY weeks.
#    Everything else is deleted through safe_rm_rf (path-guarded).
# -----------------------------------------------------------------------------
prune_backups() {
	local today_epoch dir day dir_epoch age_days dow removed=0
	# Midnight-anchored so retention counts whole days, not hours: a backup is
	# "14 days old" for the whole of that day, whatever time the cron ran.
	today_epoch="$(date -u -d "$(date_utc)" +%s)"

	shopt -s nullglob
	for dir in "${BACKUP_DIR}"/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]; do
		[[ -d "${dir}" ]] || continue
		day="$(basename -- "${dir}")"

		# An unparsable name is left alone rather than guessed at.
		if ! dir_epoch="$(date -u -d "${day}" +%s 2>/dev/null)"; then
			warn "skipping unparsable backup directory: ${dir}"
			continue
		fi
		age_days=$(((today_epoch - dir_epoch) / 86400))

		# Rule 1: everything from the last N days stays.
		((age_days < BACKUP_RETAIN_DAILY)) && continue

		# Rule 2: the weekly-anchor weekday stays for N weeks.
		dow="$(date -u -d "${day}" +%u)"
		if [[ "${dow}" == "${BACKUP_WEEKLY_DOW}" ]] && ((age_days <= BACKUP_RETAIN_WEEKLY * 7)); then
			continue
		fi

		log "pruning old backup ${day} ($(human_size "${dir}"))"
		safe_rm_rf "${dir}"
		removed=$((removed + 1))
	done
	shopt -u nullglob
	((removed > 0)) && ok "pruned ${removed} expired backup director$([[ ${removed} -eq 1 ]] && echo y || echo ies)"
	return 0
}

if ((DO_PRUNE == 1)); then
	prune_backups
else
	log "--no-prune: retention pass skipped"
fi

# -----------------------------------------------------------------------------
# 5. Offsite (optional, USER_QUESTIONS O2).
# -----------------------------------------------------------------------------
if ((DO_OFFSITE == 1)) && [[ -n "${RCLONE_REMOTE:-}" ]]; then
	if have_cmd rclone; then
		step "Offsite copy → ${RCLONE_REMOTE}"
		RCLONE_ARGS=(copy "${BACKUP_DIR}" "${RCLONE_REMOTE}" --checksum --transfers 2 --checkers 4)
		[[ -n "${RCLONE_CONFIG:-}" ]] && RCLONE_ARGS+=(--config "${RCLONE_CONFIG}")
		((QUIET == 1)) || RCLONE_ARGS+=(--stats-one-line --stats 30s)
		if retry 3 nice -n 10 rclone "${RCLONE_ARGS[@]}"; then
			ok "offsite copy complete"
		else
			# Offsite failure must not mark the local backup as failed, but it
			# must be loud: STATUS.sh reads the ops log.
			warn "offsite copy to ${RCLONE_REMOTE} FAILED — local backup is intact"
		fi
	else
		warn "RCLONE_REMOTE is set but rclone is not installed — skipping offsite copy"
	fi
fi

# -----------------------------------------------------------------------------
# 6. Report
# -----------------------------------------------------------------------------
TOTAL="$(human_size "${BACKUP_DIR}")"
COUNT="$(find "${BACKUP_DIR}" -mindepth 1 -maxdepth 1 -type d -name '[0-9]*' | wc -l)"
ok "backup complete: ${DEST} (db ${DB_SIZE}, uploads ${UPLOADS_SIZE}) — ${COUNT} backup day(s), ${TOTAL} total"
