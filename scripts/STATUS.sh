#!/usr/bin/env bash
# =============================================================================
# STATUS.sh — one screen of "is Mistvale healthy?"
# =============================================================================
# Per DEPLOYMENT_OPERATIONS.md §2/§4 this prints, in one pass:
#   • systemd states (mistvale-server, nginx, postgresql)
#   • the health endpoint JSON (RSS, event-loop lag, DB pool, content rev,
#     active battles) — pretty-printed
#   • disk + RAM + swap
#   • TLS certificate expiry in days
#   • age of the last backup
#   • error count in the last hour
#   • the running release and the git sha of both repos
#
# Health data sources, in order of preference:
#   1. GET /api/health with `Authorization: Bearer $OPS_SESSION_TOKEN` — the full
#      admin-gated payload. The token is an ordinary admin session token (the API
#      accepts the Bearer header alongside the session cookie); create one with
#      curl against /api/auth/login and park it in ${ENV_FILE}.
#   2. GET /api/health-lite — the public liveness probe (no DB round-trip)
#   3. direct SQL for the numbers that live in the database anyway
#
# Exit code: 0 all good · 1 something is degraded (safe for cron/monitoring).
# -----------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
enable_error_trap

usage() {
	cat <<EOF
${C_BOLD}STATUS.sh${C_RESET} — health overview of the Mistvale box

  Usage: STATUS.sh [options]

  Options:
    --json          print the raw health JSON only (for piping into jq)
    --short         one-line summary (handy for MOTD / monitoring)
    -h, --help      show this help

  Exit code: 0 = healthy, 1 = degraded (a check below failed).
EOF
}

MODE="full"
while (($# > 0)); do
	case "$1" in
	-h | --help)
		usage
		exit 0
		;;
	--json)
		MODE="json"
		shift
		;;
	--short)
		MODE="short"
		shift
		;;
	*)
		usage >&2
		die "unknown argument: $1"
		;;
	esac
done

load_env
DEGRADED=0
mark_degraded() { DEGRADED=1; }

# state_str <unit> — coloured "active/inactive/failed" plus enabled flag.
# Pure formatting: it runs inside $( ), so it cannot set DEGRADED itself —
# check_unit below does that in the parent shell.
state_str() {
	local unit="$1" state enabled
	state="$(svc_state "${unit}")"
	[[ -n "${state}" ]] || state="not-installed"
	enabled="$(systemctl is-enabled "${unit}" 2>/dev/null || true)"
	[[ -n "${enabled}" ]] || enabled="-"
	case "${state}" in
	active) printf '%sactive%s (%s)' "${C_GREEN}" "${C_RESET}" "${enabled}" ;;
	activating | reloading) printf '%s%s%s (%s)' "${C_YELLOW}" "${state}" "${C_RESET}" "${enabled}" ;;
	*) printf '%s%s%s (%s)' "${C_RED}" "${state}" "${C_RESET}" "${enabled}" ;;
	esac
}

# check_unit <unit> — flags the run as degraded when the unit is not active.
check_unit() {
	if ! svc_active "$1"; then
		mark_degraded
	fi
}

# The postgresql unit is a wrapper; the real work happens in postgresql@16-main.
PG_UNIT="postgresql"
if svc_exists "postgresql@${PG_MAJOR}-main"; then
	PG_UNIT="postgresql@${PG_MAJOR}-main"
fi

for _unit in "${SERVICE}" nginx "${PG_UNIT}"; do
	check_unit "${_unit}"
done
unset _unit

# -----------------------------------------------------------------------------
# Health payload
# -----------------------------------------------------------------------------
HEALTH_JSON=""
HEALTH_SOURCE="none"

if [[ -n "${OPS_SESSION_TOKEN:-}" ]]; then
	HEALTH_JSON="$(http_get "${HEALTH_FULL_URL}" -H "Authorization: Bearer ${OPS_SESSION_TOKEN}")"
	[[ -n "${HEALTH_JSON}" ]] && HEALTH_SOURCE="/api/health"
fi
if [[ -z "${HEALTH_JSON}" ]]; then
	HEALTH_JSON="$(http_get "${HEALTH_LITE_URL}")"
	[[ -n "${HEALTH_JSON}" ]] && HEALTH_SOURCE="/api/health-lite"
fi

if [[ "${MODE}" == "json" ]]; then
	if [[ -z "${HEALTH_JSON}" ]]; then
		die "no health response from ${HEALTH_LITE_URL}"
	fi
	if have_cmd jq; then
		printf '%s' "${HEALTH_JSON}" | jq .
	else
		printf '%s\n' "${HEALTH_JSON}"
	fi
	exit 0
fi

[[ -n "${HEALTH_JSON}" ]] || mark_degraded

# -----------------------------------------------------------------------------
# Values that are cheap to read straight from the database — these work even
# when the server process is down, which is exactly when they matter.
# -----------------------------------------------------------------------------
DB_OK=0
CONTENT_REV="?"
ACTIVE_BATTLES="?"
ACCOUNTS="?"
PLAYERS="?"
DB_SIZE="?"
if db_reachable; then
	DB_OK=1
	CONTENT_REV="$(db_scalar "SELECT coalesce(max(rev)::text, '-') FROM content_revisions")"
	ACTIVE_BATTLES="$(db_scalar "SELECT count(*) FROM battles WHERE state = 'active'")"
	ACCOUNTS="$(db_scalar "SELECT count(*) FROM accounts")"
	PLAYERS="$(db_scalar "SELECT count(*) FROM players WHERE is_bot = false")"
	DB_SIZE="$(db_scalar "SELECT pg_size_pretty(pg_database_size(current_database()))")"
else
	mark_degraded
fi
: "${CONTENT_REV:=?}" "${ACTIVE_BATTLES:=?}" "${ACCOUNTS:=?}" "${PLAYERS:=?}" "${DB_SIZE:=?}"

# -----------------------------------------------------------------------------
# TLS expiry
# -----------------------------------------------------------------------------
CERT_DAYS="n/a"
CERT_FILE="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
if [[ -r "${CERT_FILE}" ]] && have_cmd openssl; then
	CERT_END="$(openssl x509 -enddate -noout -in "${CERT_FILE}" 2>/dev/null | cut -d= -f2 || true)"
	if [[ -n "${CERT_END}" ]]; then
		CERT_EPOCH="$(date -d "${CERT_END}" +%s 2>/dev/null || echo 0)"
		if ((CERT_EPOCH > 0)); then
			CERT_DAYS="$(((CERT_EPOCH - $(date +%s)) / 86400))"
			# certbot renews at 30 days; below 10 something is broken.
			if ((CERT_DAYS < 10)); then
				mark_degraded
			fi
		fi
	fi
fi

# -----------------------------------------------------------------------------
# Last backup
# -----------------------------------------------------------------------------
LAST_BACKUP="none"
BACKUP_AGE_H="-"
NEWEST_DUMP="$(find "${BACKUP_DIR}" -type f -name 'db-*.dump' -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -n1 | cut -d' ' -f2- || true)"
if [[ -n "${NEWEST_DUMP}" ]]; then
	LAST_BACKUP="$(basename -- "${NEWEST_DUMP}") ($(human_size "${NEWEST_DUMP}"))"
	BACKUP_AGE_H="$((($(date +%s) - $(stat -c %Y "${NEWEST_DUMP}")) / 3600))"
	# The cron job runs daily at 03:30; older than 36 h means it stopped working.
	if ((BACKUP_AGE_H > 36)); then
		mark_degraded
	fi
else
	mark_degraded
fi

# -----------------------------------------------------------------------------
# Errors in the last hour (pino level >= 50), file log first, journal fallback
# -----------------------------------------------------------------------------
count_errors_last_hour() {
	local since_epoch file
	since_epoch=$(($(date +%s) - 3600))
	file="${LOG_DIR}/server.log"
	if [[ -r "${file}" ]] && have_cmd jq; then
		# pino writes epoch milliseconds in `time`; levels: 50 error, 60 fatal.
		jq -r --argjson since "$((since_epoch * 1000))" \
			'select((.time // 0) >= $since and (.level // 0) >= 50) | 1' \
			"${file}" 2>/dev/null | wc -l | tr -d ' '
		return 0
	fi
	if have_cmd journalctl; then
		journalctl -u "${SERVICE}" --since '1 hour ago' --no-pager -o cat 2>/dev/null |
			grep -c -E '"level":(50|60)|level=(error|fatal)' | tr -d ' ' || true
		return 0
	fi
	printf '?'
}
ERRORS_1H="$(count_errors_last_hour)"
if [[ "${ERRORS_1H}" =~ ^[0-9]+$ ]] && ((ERRORS_1H > 50)); then
	mark_degraded
fi

# -----------------------------------------------------------------------------
# Release + repo state
# -----------------------------------------------------------------------------
RELEASE="$(link_target "${CURRENT_LINK}")"
RELEASE="${RELEASE:-none}"
GAME_SHA="$(repo_sha "${REPO_DIR}")"
GAME_BRANCH="$(repo_branch "${REPO_DIR}")"
ADMIN_SHA="$(repo_sha "${ADMIN_REPO_DIR}")"
ADMIN_BRANCH="$(repo_branch "${ADMIN_REPO_DIR}")"

# -----------------------------------------------------------------------------
# Short mode
# -----------------------------------------------------------------------------
if [[ "${MODE}" == "short" ]]; then
	printf 'mistvale: server=%s nginx=%s pg=%s rev=%s battles=%s errors1h=%s backup=%sh cert=%sd release=%s\n' \
		"$(svc_state "${SERVICE}")" "$(svc_state nginx)" "$(svc_state "${PG_UNIT}")" \
		"${CONTENT_REV}" "${ACTIVE_BATTLES}" "${ERRORS_1H}" "${BACKUP_AGE_H}" "${CERT_DAYS}" \
		"$(basename -- "${RELEASE}")"
	exit "${DEGRADED}"
fi

# -----------------------------------------------------------------------------
# Full report
# -----------------------------------------------------------------------------
printf '\n%s┌ Mistvale — %s ─ %s%s\n' "${C_BOLD}" "${DOMAIN}" "$(date -u +'%Y-%m-%d %H:%M:%SZ')" "${C_RESET}"
hr

printf '%sServices%s\n' "${C_BOLD}" "${C_RESET}"
printf '  %-22s %s\n' "${SERVICE}" "$(state_str "${SERVICE}")"
printf '  %-22s %s\n' "nginx" "$(state_str nginx)"
printf '  %-22s %s\n' "${PG_UNIT}" "$(state_str "${PG_UNIT}")"
if svc_exists "${SERVICE}"; then
	printf '  %-22s %s\n' "running since" "$(svc_show "${SERVICE}" ActiveEnterTimestamp)"
	printf '  %-22s %s\n' "restarts (NRestarts)" "$(svc_show "${SERVICE}" NRestarts)"
	if [[ -s "${LOG_DIR}/crash.log" ]]; then
		printf '  %-22s %s%s%s\n' "last crash marker" "${C_YELLOW}" "$(tail -n1 "${LOG_DIR}/crash.log")" "${C_RESET}"
	fi
fi
hr

printf '%sHealth%s  %s(source: %s)%s\n' "${C_BOLD}" "${C_RESET}" "${C_DIM}" "${HEALTH_SOURCE}" "${C_RESET}"
if [[ -n "${HEALTH_JSON}" ]]; then
	PRETTY=""
	if have_cmd jq; then
		PRETTY="$(printf '%s' "${HEALTH_JSON}" | jq . 2>/dev/null || true)"
	fi
	if [[ -n "${PRETTY}" ]]; then
		printf '%s\n' "${PRETTY}" | sed 's/^/  /'
	else
		printf '  %s\n' "${HEALTH_JSON}"
	fi
	if [[ "${HEALTH_SOURCE}" == "/api/health-lite" && -z "${OPS_SESSION_TOKEN:-}" ]]; then
		printf '  %sset OPS_SESSION_TOKEN in %s for the full payload (RSS, event-loop lag, DB pool)%s\n' \
			"${C_DIM}" "${ENV_FILE}" "${C_RESET}"
	fi
else
	printf '  %sno response from %s%s\n' "${C_RED}" "${HEALTH_LITE_URL}" "${C_RESET}"
fi
hr

printf '%sDatabase%s\n' "${C_BOLD}" "${C_RESET}"
if ((DB_OK == 1)); then
	printf '  %-22s %s\n' "reachable" "yes ($(mask_db_url "${DATABASE_URL:-unset}"))"
	printf '  %-22s %s\n' "size" "${DB_SIZE}"
	printf '  %-22s %s\n' "content revision" "${CONTENT_REV}"
	printf '  %-22s %s\n' "active battles" "${ACTIVE_BATTLES}"
	printf '  %-22s %s / %s\n' "accounts / players" "${ACCOUNTS}" "${PLAYERS}"
	printf '  %-22s %s of %s\n' "connections" \
		"$(db_scalar "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()")" \
		"$(db_scalar "SHOW max_connections")"
else
	printf '  %-22s %sno%s\n' "reachable" "${C_RED}" "${C_RESET}"
fi
hr

printf '%sResources%s\n' "${C_BOLD}" "${C_RESET}"
if have_cmd free; then
	# shellcheck disable=SC2016  # awk program, not a shell expansion
	free -m | awk 'NR==2{printf "  %-22s %s MB used / %s MB total (%.0f%%)\n","RAM",$3,$2,$3*100/$2}
	               NR==3{if($2>0) printf "  %-22s %s MB used / %s MB total\n","swap",$3,$2}'
fi
df -h / "$(dirname -- "${BACKUP_DIR}")" 2>/dev/null | awk 'NR>1{printf "  %-22s %s used of %s (%s) on %s\n","disk "$6,$3,$2,$5,$1}' | sort -u
if [[ -r /proc/loadavg ]]; then
	printf '  %-22s %s\n' "load (1/5/15m)" "$(cut -d' ' -f1-3 /proc/loadavg)"
fi
if svc_active "${SERVICE}"; then
	MEM="$(svc_show "${SERVICE}" MemoryCurrent)"
	if [[ "${MEM}" =~ ^[0-9]+$ ]]; then
		printf '  %-22s %s MB (MemoryMax 1536 MB)\n' "server RSS (cgroup)" "$((MEM / 1024 / 1024))"
	fi
fi
hr

printf '%sDeployment%s\n' "${C_BOLD}" "${C_RESET}"
printf '  %-22s %s\n' "release" "${RELEASE}"
printf '  %-22s %s @ %s\n' "game repo" "${GAME_BRANCH}" "${GAME_SHA}"
printf '  %-22s %s @ %s\n' "admin repo" "${ADMIN_BRANCH}" "${ADMIN_SHA}"
printf '  %-22s %s\n' "client symlink" "$(link_target "${CLIENT_LINK}" || true)"
printf '  %-22s %s\n' "admin symlink" "$(link_target "${ADMIN_LINK}" || true)"
printf '  %-22s %s\n' "server symlink" "$(link_target "${SERVER_LINK}" || true)"

# The unit art, counted off the live client root.
#
# Its absence is the quietest failure this box has: the game boots, the HUD paints, the
# server resolves every fight correctly, and the battlefield is empty because every sprite
# is a 404. Nothing else on this screen would move. UPDATE.sh refuses to cut a release
# without it now; this says whether the release actually running has it.
SPRITE_MANIFEST="$(link_target "${CLIENT_LINK}" 2>/dev/null || true)/sprites/manifest.json"
if [[ -f "${SPRITE_MANIFEST}" ]]; then
	SPRITE_UNITS="$(grep -c '"basePath"' "${SPRITE_MANIFEST}" 2>/dev/null || echo 0)"
	if [[ "${SPRITE_UNITS}" -gt 0 ]]; then
		printf '  %-22s %s unit(s)\n' "unit art" "${SPRITE_UNITS}"
	else
		warn "the sprite manifest lists no units — battles will draw an empty field"
		DEGRADED=1
	fi
else
	warn "no unit art in the running client (sprites/manifest.json) — battles will draw an empty field; re-run UPDATE.sh"
	DEGRADED=1
fi
hr

printf '%sOps%s\n' "${C_BOLD}" "${C_RESET}"
printf '  %-22s %s\n' "TLS expires in" "${CERT_DAYS} day(s)"
printf '  %-22s %s\n' "last backup" "${LAST_BACKUP}"
printf '  %-22s %s\n' "backup age" "${BACKUP_AGE_H} hour(s)"
printf '  %-22s %s\n' "errors (last hour)" "${ERRORS_1H}"
hr

if ((DEGRADED == 0)); then
	ok "everything looks healthy"
else
	err "one or more checks are degraded — see the red entries above"
	printf '  %stry: %s/LOGS.sh -e   ·   journalctl -u %s -n 100%s\n' \
		"${C_DIM}" "${SCRIPTS_DIR}" "${SERVICE}" "${C_RESET}"
fi
exit "${DEGRADED}"
