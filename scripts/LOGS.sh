#!/usr/bin/env bash
# =============================================================================
# LOGS.sh — read and filter the Mistvale server logs
# =============================================================================
# The server logs structured pino JSON to stdout, which systemd captures into the
# journal (apps/server/src/lib/logger.ts, ARCHITECTURE §10). Successful requests
# are sampled, errors are always logged in full.
#
# Source order: ${LOG_DIR}/server.log when a file sink exists (it survives journal
# vacuuming), otherwise `journalctl -u mistvale-server` — the production default.
#
# Filters (DEPLOYMENT_OPERATIONS §2):
#   -e            errors only        (pino level >= 50)
#   -p <name>     one player         (matches profileName / accountName / playerId)
#   -r <id>       one request        (reqId — the code shown in the client toast)
#   -n <lines>    how much history   (default 200)
#   -f            follow
#
# jq is used when available (exact field matching + readable output); without
# jq the same filters degrade to grep on the raw JSON.
# -----------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
enable_error_trap

usage() {
	cat <<EOF
${C_BOLD}LOGS.sh${C_RESET} — tail/filter the ${SERVICE} logs (pino JSON)

  Usage: LOGS.sh [options]

  Options:
    -e, --errors            errors only (pino level >= 50)
    -p, --player <name>     only lines mentioning this profile/account/player id
    -r, --request <id>      only lines for this requestId (reqId)
    -n, --lines <n>         history to read (default 200, 'all' for everything)
    -f, --follow            keep streaming new lines
    -g, --grep <pattern>    additional case-insensitive pattern filter
        --raw               print raw JSON instead of the formatted view
        --journal           force reading journald instead of the file log
        --since <when>      journald only: e.g. '1 hour ago', '2026-08-16'
    -h, --help              show this help

  Examples:
    ${SCRIPTS_DIR}/LOGS.sh -f                    # live tail, formatted
    ${SCRIPTS_DIR}/LOGS.sh -e -n 500             # last 500 lines, errors only
    ${SCRIPTS_DIR}/LOGS.sh -p Marvin -n all      # everything about one player
    ${SCRIPTS_DIR}/LOGS.sh -r X7F2K              # the request behind a bug report
    ${SCRIPTS_DIR}/LOGS.sh --raw -e | jq .       # pipe raw JSON somewhere else

  Sources: journalctl -u ${SERVICE} (production default)
           ${LOG_DIR}/server.log (used when a file sink exists)
  Times are shown in UTC, matching the API's timestamps.
EOF
}

ERRORS_ONLY=0
PLAYER=""
REQUEST=""
LINES="200"
FOLLOW=0
PATTERN=""
RAW=0
FORCE_JOURNAL=0
SINCE=""

while (($# > 0)); do
	case "$1" in
	-h | --help)
		usage
		exit 0
		;;
	-e | --errors)
		ERRORS_ONLY=1
		shift
		;;
	-p | --player)
		PLAYER="${2:-}"
		[[ -n "${PLAYER}" ]] || die "-p needs a player name"
		shift 2
		;;
	-r | --request)
		REQUEST="${2:-}"
		[[ -n "${REQUEST}" ]] || die "-r needs a request id"
		shift 2
		;;
	-n | --lines)
		LINES="${2:-}"
		[[ -n "${LINES}" ]] || die "-n needs a number (or 'all')"
		shift 2
		;;
	-f | --follow)
		FOLLOW=1
		shift
		;;
	-g | --grep)
		PATTERN="${2:-}"
		[[ -n "${PATTERN}" ]] || die "-g needs a pattern"
		shift 2
		;;
	--raw)
		RAW=1
		shift
		;;
	--journal)
		FORCE_JOURNAL=1
		shift
		;;
	--since)
		SINCE="${2:-}"
		[[ -n "${SINCE}" ]] || die "--since needs a time expression"
		shift 2
		;;
	*)
		usage >&2
		die "unknown argument: $1"
		;;
	esac
done

load_env

LOG_FILE="${LOG_DIR}/server.log"
USE_FILE=0
if ((FORCE_JOURNAL == 0)) && [[ -r "${LOG_FILE}" ]]; then
	USE_FILE=1
fi

if ((USE_FILE == 0)); then
	have_cmd journalctl ||
		die "no log source: ${LOG_FILE} is not readable and journalctl is unavailable"
fi

# -----------------------------------------------------------------------------
# Source stage: emit raw JSON lines on stdout.
# -----------------------------------------------------------------------------
emit_source() {
	if ((USE_FILE == 1)); then
		# pino-roll rotates to server.log.1, .2 … — read them oldest-first when a
		# large history is requested, otherwise just tail the active file.
		if [[ "${LINES}" == "all" ]]; then
			local rotated=()
			mapfile -t rotated < <(find "${LOG_DIR}" -maxdepth 1 -type f -name 'server.log.*' | sort -V)
			if ((${#rotated[@]} > 0)); then
				cat -- "${rotated[@]}"
			fi
			if ((FOLLOW == 1)); then
				tail -n +1 -F -- "${LOG_FILE}"
			else
				cat -- "${LOG_FILE}"
			fi
		elif ((FOLLOW == 1)); then
			tail -n "${LINES}" -F -- "${LOG_FILE}"
		else
			tail -n "${LINES}" -- "${LOG_FILE}"
		fi
	else
		local args=(-u "${SERVICE}" --no-pager -o cat)
		[[ -n "${SINCE}" ]] && args+=(--since "${SINCE}")
		if [[ "${LINES}" == "all" ]]; then
			args+=(-n all)
		else
			args+=(-n "${LINES}")
		fi
		((FOLLOW == 1)) && args+=(-f)
		journalctl "${args[@]}"
	fi
}

# -----------------------------------------------------------------------------
# Filter + format stage.
# -----------------------------------------------------------------------------
ANY_FILTER=0
if ((ERRORS_ONLY == 1)) || [[ -n "${PLAYER}${REQUEST}${PATTERN}" ]]; then
	ANY_FILTER=1
fi

# shellcheck disable=SC2016  # the single quotes are deliberate: $player, $request,
#                              $pattern and $l are jq variables, not shell ones.
if have_cmd jq; then
	# --- jq path: exact field matching --------------------------------------
	# JQ_PIPE is applied to each parsed log object.
	JQ_PIPE='.'
	if ((ERRORS_ONLY == 1)); then
		JQ_PIPE+=' | select((.level // 0) >= 50)'
	fi
	if [[ -n "${PLAYER}" ]]; then
		JQ_PIPE+=' | select( (((.profileName // "") | tostring | ascii_downcase) == ($player | ascii_downcase))
		                  or (((.accountName // "") | tostring | ascii_downcase) == ($player | ascii_downcase))
		                  or (((.player       // "") | tostring | ascii_downcase) == ($player | ascii_downcase))
		                  or (((.playerId     // "") | tostring)                  == $player) )'
	fi
	if [[ -n "${REQUEST}" ]]; then
		JQ_PIPE+=' | select(((.reqId // .requestId // "") | tostring) == $request)'
	fi
	if [[ -n "${PATTERN}" ]]; then
		JQ_PIPE+=' | select((tojson | ascii_downcase) | test($pattern | ascii_downcase))'
	fi

	if ((RAW == 1)); then
		JQ_PIPE+=' | tojson'
	else
		# Compact human line: "HH:MM:SS LEVEL [reqId] msg METHOD /url → 200 12ms @player"
		# pino levels: 10 trace, 20 debug, 30 info, 40 warn, 50 error, 60 fatal.
		# Timestamps are pino epoch milliseconds, rendered in UTC.
		JQ_PIPE+=' | . as $l
		  | (($l.level // 30) | if . >= 60 then "FATAL" elif . >= 50 then "ERROR"
		       elif . >= 40 then "WARN " elif . >= 30 then "INFO "
		       elif . >= 20 then "DEBUG" else "TRACE" end) as $lvl
		  | ((($l.time // 0) / 1000 | floor) | strftime("%H:%M:%S")) as $t
		  | [ $t, $lvl,
		      (if $l.reqId then "[" + ($l.reqId | tostring) + "]" else "" end),
		      ($l.msg // $l.err.message // ""),
		      (if $l.req then (($l.req.method // "") + " " + ($l.req.url // "")) else "" end),
		      (if $l.res then "-> " + ($l.res.statusCode | tostring) else "" end),
		      (if $l.responseTime then (($l.responseTime | tostring) + "ms") else "" end),
		      (if $l.profileName then "@" + $l.profileName else "" end) ]
		    | map(select(. != "")) | join(" ")'
	fi

	# Read line-wise (-R) so a non-JSON line (a raw stack trace, systemd noise)
	# never aborts the stream: it is passed through when no filter is active and
	# dropped when the operator asked for a specific subset.
	JQ_PROGRAM='. as $raw
	  | (fromjson? // null) as $j
	  | if ($j | type) != "object"
	    then (if $filtered == 1 then empty else $raw end)
	    else ($j | '"${JQ_PIPE}"')
	    end'

	emit_source | jq -r --unbuffered -R \
		--arg player "${PLAYER}" \
		--arg request "${REQUEST}" \
		--arg pattern "${PATTERN:-.}" \
		--argjson filtered "${ANY_FILTER}" \
		"${JQ_PROGRAM}" || true
else
	# --- grep fallback: no jq on the box ------------------------------------
	warn "jq is not installed — falling back to grep (install jq for exact field filters)"

	# Fixed-length pipeline: each stage is a no-op (cat) when its filter is unset,
	# which keeps this free of eval and safe with arbitrary user input.
	filter_regex() { if [[ -n "$1" ]]; then grep --line-buffered -i -E -- "$1"; else cat; fi; }
	filter_fixed() { if [[ -n "$1" ]]; then grep --line-buffered -i -F -- "$1"; else cat; fi; }

	LEVEL_PATTERN=""
	if ((ERRORS_ONLY == 1)); then
		LEVEL_PATTERN='"level":(50|60)'
	fi

	emit_source |
		filter_regex "${LEVEL_PATTERN}" |
		filter_fixed "${PLAYER}" |
		filter_fixed "${REQUEST}" |
		filter_regex "${PATTERN}" || true
fi
