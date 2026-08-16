#!/usr/bin/env bash
# =============================================================================
# scripts/lib/common.sh — shared helpers for every Mistvale ops script
# =============================================================================
# This file is *sourced*, never executed. It provides:
#   • constants for the on-VPS layout (paths, users, service names)
#   • coloured, timestamped logging that also appends to /var/log/mistvale/
#   • guards: require_root / require_env / need_cmd / confirm "<PHRASE>"
#   • retry with exponential backoff (2s, 4s, 8s, 16s …)
#   • .env loading (/srv/mistvale/.env, falling back to the repo checkout)
#   • small, safe primitives: safe_rm_rf, swap_symlink, run_as_app_user,
#     render_template, health_check, systemd/psql wrappers
#
# Every constant can be overridden from the environment (or /srv/mistvale/.env)
# — the defaults below are the documented production layout
# (docs/DEPLOYMENT_OPERATIONS.md §1).
#
# Style: shellcheck-clean, bash 4+, no external deps beyond coreutils.
# -----------------------------------------------------------------------------
# shellcheck shell=bash
# shellcheck disable=SC2034  # this is a library: most constants are used by the
#                              scripts that source it, not in this file itself.

# Guard against double-sourcing (scripts call each other).
if [[ -n "${MISTVALE_COMMON_SH_LOADED:-}" ]]; then
	return 0
fi
MISTVALE_COMMON_SH_LOADED=1

# -----------------------------------------------------------------------------
# 0. Paths of *this* checkout — never assume the caller's cwd.
# -----------------------------------------------------------------------------
# LIB_DIR = <checkout>/scripts/lib, SCRIPTS_DIR = <checkout>/scripts,
# REPO_ROOT = <checkout>. Works when called through a symlink or from cron.
MISTVALE_LIB_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
SCRIPTS_DIR="$(cd -- "${MISTVALE_LIB_DIR}/.." && pwd -P)"
REPO_ROOT="$(cd -- "${SCRIPTS_DIR}/.." && pwd -P)"
DEPLOY_ASSETS_DIR="${SCRIPTS_DIR}/deploy-assets"
export MISTVALE_LIB_DIR SCRIPTS_DIR REPO_ROOT DEPLOY_ASSETS_DIR

# -----------------------------------------------------------------------------
# 1. Constants — the production layout (override via env or /srv/mistvale/.env)
# -----------------------------------------------------------------------------
: "${APP_USER:=mistvale}"                       # system user that owns/runs everything
: "${APP_GROUP:=mistvale}"
: "${APP_ROOT:=/srv/mistvale}"                  # code, builds, .env
: "${DB_NAME:=mistvale}"                        # PostgreSQL database
: "${DB_USER:=mistvale}"                        # PostgreSQL role
: "${UPLOADS:=/var/lib/mistvale/uploads}"       # admin-uploaded art (served by nginx)
: "${BACKUP_DIR:=/var/backups/mistvale}"        # pg_dump + uploads tarballs
: "${LOG_DIR:=/var/log/mistvale}"               # pino file log + ops script logs
: "${SERVICE:=mistvale-server}"                 # systemd unit name (without .service)
: "${NODE_MAJOR:=22}"                           # Node.js LTS major (ARCHITECTURE §2)
: "${PG_MAJOR:=16}"                             # PostgreSQL major (ARCHITECTURE §2)
: "${PNPM_VERSION:=10}"                         # pnpm major (root package.json pins the
#                                                 exact version via packageManager)

# Public identity + process binding (DEPLOYMENT_OPERATIONS §1).
: "${DOMAIN:=play.pathlands.cc}"
: "${HOST:=127.0.0.1}"
: "${PORT:=3001}"

# Git origins for the two repos DEPLOY.sh clones.
: "${REPO_URL:=https://github.com/justmarvinai/MistvaleMobile.git}"
: "${ADMIN_REPO_URL:=https://github.com/justmarvinai/MistvaleMobile-Admin.git}"
: "${DEPLOY_BRANCH:=main}"

# Derived layout — keep in sync with docs/DEPLOYMENT_OPERATIONS.md §1.
# ENV_FILE honours a caller-provided value (ENV_FILE=/path/to/other.env …) so a
# second deployment or a scratch database can be targeted deliberately; the rest
# follow APP_ROOT, which the env file itself may override.
: "${ENV_FILE:=${APP_ROOT}/.env}"               # the single runtime env file
REPO_DIR="${APP_ROOT}/repo"                     # game repo checkout
ADMIN_REPO_DIR="${APP_ROOT}/admin-repo"         # admin SPA repo checkout
RELEASES_DIR="${APP_ROOT}/releases"             # releases/<UTC timestamp>/
CURRENT_LINK="${APP_ROOT}/current"              # → releases/<ts>
CLIENT_LINK="${APP_ROOT}/client"                # → releases/<ts>/client  (nginx root)
ADMIN_LINK="${APP_ROOT}/admin"                  # → releases/<ts>/admin   (nginx root)
SERVER_LINK="${APP_ROOT}/server"                # → releases/<ts>/server  (systemd WD)
: "${KEEP_RELEASES:=5}"                         # how many release dirs to retain

# Package filters / build outputs (see apps/server/build.js, apps/client/vite.config).
SERVER_PKG="@mistvale/server"
CLIENT_PKG="@mistvale/client"
SERVER_DIST_REL="apps/server/dist"   # esbuild bundles: index.js + the one-shots below
CLIENT_DIST_REL="apps/client/dist"   # vite build output (hashed assets + atlases)
ADMIN_DIST_REL="dist"                # admin repo vite build (base '/admin/')
# drizzle-kit writes migrations here; the built migrator resolves them relative to
# its own location (<server dir>/drizzle), so a release must carry this folder.
DRIZZLE_DIR_REL="apps/server/drizzle"

# Built one-shot entrypoints (apps/server/build.js ENTRYPOINTS) and the pnpm script
# that produces the same effect from a source checkout.
ENTRY_MIGRATE="db/migrate.js"
ENTRY_SEED="db/seed.js"
ENTRY_SET_RANK="scripts/set-rank.js"
SCRIPT_MIGRATE="db:migrate"
SCRIPT_SEED="seed"
SCRIPT_SET_RANK="set-rank"

# Health endpoints (packages/shared ROUTES.health, ARCHITECTURE §10).
# The full payload is admin-gated; STATUS.sh sends an admin session token when
# OPS_SESSION_TOKEN is set (the API accepts `Authorization: Bearer <token>`).
HEALTH_LITE_URL="http://${HOST}:${PORT}/api/health-lite"
HEALTH_FULL_URL="http://${HOST}:${PORT}/api/health"

# Name of the running script — used for log prefixes and the ops log file.
SCRIPT_NAME="$(basename -- "${0}")"
export SCRIPT_NAME

# -----------------------------------------------------------------------------
# 2. Colour + logging
# -----------------------------------------------------------------------------
# Colours are enabled only for a real terminal and when NO_COLOR is unset
# (https://no-color.org). Cron output therefore stays clean.
if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
	C_RESET=$'\033[0m'
	C_DIM=$'\033[2m'
	C_RED=$'\033[1;31m'
	C_GREEN=$'\033[1;32m'
	C_YELLOW=$'\033[1;33m'
	C_BLUE=$'\033[1;34m'
	C_CYAN=$'\033[1;36m'
	C_BOLD=$'\033[1m'
else
	C_RESET='' C_DIM='' C_RED='' C_GREEN='' C_YELLOW='' C_BLUE='' C_CYAN='' C_BOLD=''
fi

# QUIET=1 silences log/ok/step on stdout (warnings and errors always print).
: "${QUIET:=0}"

# _log_file — append a plain (colour-free) copy of every log line to
# ${LOG_DIR}/ops-<script>.log when that file is writable. Failures are ignored
# on purpose: an unwritable log must never abort an ops script, nor say so on
# every line.
#
# Two subtleties, both learned the hard way:
#   • a writable *directory* does not mean a writable *file* — one root-run of
#     an ops script leaves an ops-<script>.log the app user cannot append to;
#   • `cmd >>file 2>/dev/null` does NOT silence a failed redirect, because the
#     shell reports that before cmd exists to have its stderr redirected. Doing
#     it inside a subshell puts the message on stderr the outer redirect owns.
_log_file() {
	local level="$1" msg="$2" file="${LOG_DIR}/ops-${SCRIPT_NAME%.sh}.log"
	if [[ -e "${file}" ]]; then
		[[ -w "${file}" ]] || return 0
	else
		[[ -d "${LOG_DIR}" && -w "${LOG_DIR}" ]] || return 0
	fi
	(printf '%s [%s] %s: %s\n' \
		"$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "${SCRIPT_NAME}" "${level}" "${msg}" \
		>>"${file}") 2>/dev/null || true
}

log() { # informational
	[[ "${QUIET}" == "1" ]] || printf '%s•%s %s\n' "${C_BLUE}" "${C_RESET}" "$*"
	_log_file INFO "$*"
}

ok() { # success
	[[ "${QUIET}" == "1" ]] || printf '%s✓%s %s\n' "${C_GREEN}" "${C_RESET}" "$*"
	_log_file OK "$*"
}

warn() { # non-fatal problem — always shown, goes to stderr
	printf '%s!%s %s\n' "${C_YELLOW}" "${C_RESET}" "$*" >&2
	_log_file WARN "$*"
}

err() { # fatal-ish problem — always shown, goes to stderr
	printf '%s✗%s %s\n' "${C_RED}" "${C_RESET}" "$*" >&2
	_log_file ERROR "$*"
}

die() { # print and exit 1 (or $2 when given)
	err "$1"
	exit "${2:-1}"
}

step() { # section header, keeps long scripts readable
	[[ "${QUIET}" == "1" ]] || printf '\n%s══ %s %s\n' "${C_CYAN}${C_BOLD}" "$*" "${C_RESET}"
	_log_file STEP "$*"
}

skip() { # idempotency notice ("already done")
	[[ "${QUIET}" == "1" ]] || printf '%s· %s (already done)%s\n' "${C_DIM}" "$*" "${C_RESET}"
	_log_file SKIP "$*"
}

hr() { # horizontal rule for STATUS-style output
	[[ "${QUIET}" == "1" ]] || printf '%s%s%s\n' "${C_DIM}" "$(printf '─%.0s' {1..72})" "${C_RESET}"
}

# enable_error_trap — report the exact line that failed. Call right after
# `set -euo pipefail` in every script.
enable_error_trap() {
	trap '_on_error $? $LINENO' ERR
}
_on_error() {
	local code="$1" line="$2"
	err "${SCRIPT_NAME}: failed at line ${line} (exit ${code})"
}

# -----------------------------------------------------------------------------
# 3. Guards
# -----------------------------------------------------------------------------
require_root() {
	[[ "${EUID}" -eq 0 ]] || die "this script must run as root (try: sudo ${SCRIPT_NAME} ...)"
}

# require_env VAR [VAR...] — die when a variable is unset or empty.
require_env() {
	local missing=() name
	for name in "$@"; do
		if [[ -z "${!name:-}" ]]; then
			missing+=("${name}")
		fi
	done
	if ((${#missing[@]} > 0)); then
		die "missing required environment variable(s): ${missing[*]} (set them in ${ENV_FILE})"
	fi
}

have_cmd() { command -v "$1" >/dev/null 2>&1; }

need_cmd() {
	local c
	for c in "$@"; do
		have_cmd "${c}" || die "required command not found: ${c}"
	done
}

# confirm "<PHRASE>" ["<extra explanation>"]
# Typed confirmation for destructive operations. The operator must type the
# phrase exactly. MISTVALE_ASSUME_YES=1 (set only by an explicit --yes flag)
# bypasses the prompt but is logged loudly. Never auto-confirms just because
# stdin is not a terminal.
confirm() {
	local phrase="$1" explanation="${2:-}" answer
	if [[ -n "${explanation}" ]]; then
		printf '%s%s%s\n' "${C_YELLOW}" "${explanation}" "${C_RESET}" >&2
	fi
	if [[ "${MISTVALE_ASSUME_YES:-0}" == "1" ]]; then
		warn "confirmation '${phrase}' auto-accepted (--yes)"
		return 0
	fi
	if [[ ! -t 0 ]]; then
		die "confirmation '${phrase}' required but stdin is not a terminal (re-run interactively, or pass --yes if the script offers it)"
	fi
	printf '%sType %s%s%s to continue: %s' \
		"${C_YELLOW}" "${C_BOLD}" "${phrase}" "${C_RESET}${C_YELLOW}" "${C_RESET}" >&2
	IFS= read -r answer || answer=""
	if [[ "${answer}" != "${phrase}" ]]; then
		die "aborted (typed '${answer}', expected '${phrase}')"
	fi
	return 0
}

# ask "<question>" "<default>" — free-form prompt with default, echoes answer.
ask() {
	local question="$1" default="${2:-}" reply
	if [[ ! -t 0 ]]; then
		printf '%s' "${default}"
		return 0
	fi
	if [[ -n "${default}" ]]; then
		printf '%s%s%s [%s]: ' "${C_CYAN}" "${question}" "${C_RESET}" "${default}" >&2
	else
		printf '%s%s%s: ' "${C_CYAN}" "${question}" "${C_RESET}" >&2
	fi
	IFS= read -r reply || reply=""
	printf '%s' "${reply:-${default}}"
}

# ask_secret "<question>" — hidden prompt (passwords), echoes the answer.
ask_secret() {
	local question="$1" reply
	[[ -t 0 ]] || die "cannot prompt for '${question}': stdin is not a terminal"
	printf '%s%s%s: ' "${C_CYAN}" "${question}" "${C_RESET}" >&2
	IFS= read -rs reply || reply=""
	printf '\n' >&2
	printf '%s' "${reply}"
}

# -----------------------------------------------------------------------------
# 4. retry — exponential backoff 2s, 4s, 8s, 16s …
# -----------------------------------------------------------------------------
# usage: retry <attempts> <command> [args...]
retry() {
	local -i attempts="$1"
	shift
	local -i n=1 delay=2
	while true; do
		if "$@"; then
			return 0
		fi
		if ((n >= attempts)); then
			err "command failed after ${attempts} attempt(s): $*"
			return 1
		fi
		warn "attempt ${n}/${attempts} failed: $* — retrying in ${delay}s"
		sleep "${delay}"
		n=$((n + 1))
		delay=$((delay * 2))
	done
}

# -----------------------------------------------------------------------------
# 5. Environment file
# -----------------------------------------------------------------------------
# load_env [--required]
# Sources /srv/mistvale/.env when present, otherwise the repo checkout's .env
# (handy for developer machines). The file format is deliberately restricted to
# `KEY=value` so systemd's EnvironmentFile= can read the very same file.
load_env() {
	local required=0
	[[ "${1:-}" == "--required" ]] && required=1

	local candidate found=""
	for candidate in "${ENV_FILE}" "${REPO_ROOT}/.env"; do
		if [[ -f "${candidate}" ]]; then
			found="${candidate}"
			break
		fi
	done

	if [[ -z "${found}" ]]; then
		if ((required == 1)); then
			die "no env file found (looked for ${ENV_FILE} and ${REPO_ROOT}/.env) — copy .env.example and fill it in"
		fi
		return 0
	fi

	# Secrets hygiene for the deployed file only — a .env inside a developer's
	# checkout holds dev credentials and is the developer's business.
	if [[ "${found}" == "${ENV_FILE}" ]]; then
		local mode
		mode="$(stat -c '%a' "${found}" 2>/dev/null || echo '')"
		if [[ -n "${mode}" && "${mode}" != "600" && "${mode}" != "640" && "${mode}" != "660" ]]; then
			warn "${found} has permissions ${mode}; it holds production secrets — fix with: chmod 640 ${found} && chown ${APP_USER}:${APP_GROUP} ${found}"
		fi
	fi

	# The env file is authoritative — it is what systemd hands the server, so the
	# ops scripts must see exactly the same values. Point them at a different
	# deployment with ENV_FILE=/path/to/other.env, not with ad-hoc exports.
	local caller_db="${DATABASE_URL:-}"

	set -a
	# shellcheck disable=SC1090  # path is resolved at runtime by design
	source "${found}"
	set +a

	if [[ -n "${caller_db}" && "${caller_db}" != "${DATABASE_URL:-}" ]]; then
		warn "DATABASE_URL from your environment was overridden by ${found} — use ENV_FILE=<path> to target another deployment"
	fi
	MISTVALE_ENV_FILE_LOADED="${found}"
	export MISTVALE_ENV_FILE_LOADED

	# Re-derive everything that depends on env-provided settings, so overriding
	# APP_ROOT/HOST/PORT in the env file actually moves the whole layout.
	# (ENV_FILE itself cannot be derived this way — it is where APP_ROOT is read
	# from — so a relocated install must export APP_ROOT/ENV_FILE beforehand.)
	REPO_DIR="${APP_ROOT}/repo"
	ADMIN_REPO_DIR="${APP_ROOT}/admin-repo"
	RELEASES_DIR="${APP_ROOT}/releases"
	CURRENT_LINK="${APP_ROOT}/current"
	CLIENT_LINK="${APP_ROOT}/client"
	ADMIN_LINK="${APP_ROOT}/admin"
	SERVER_LINK="${APP_ROOT}/server"
	HEALTH_LITE_URL="http://${HOST}:${PORT}/api/health-lite"
	HEALTH_FULL_URL="http://${HOST}:${PORT}/api/health"
}

# mask_db_url <url> — hide the password when printing a connection string.
mask_db_url() {
	printf '%s' "${1}" | sed -E 's#(://[^:/@]+):[^@]*@#\1:****@#'
}

# -----------------------------------------------------------------------------
# 6. Database helpers (all use DATABASE_URL from the env file)
# -----------------------------------------------------------------------------
# db_psql [psql args...] — non-interactive psql that stops on the first error.
db_psql() {
	require_env DATABASE_URL
	psql -X -v ON_ERROR_STOP=1 --no-psqlrc -d "${DATABASE_URL}" "$@"
}

# db_scalar "<sql>" — single value, empty string when the query fails
# (e.g. the table does not exist yet during early P0). Never aborts the caller.
db_scalar() {
	local sql="$1" out
	if ! out="$(psql -X -tA -v ON_ERROR_STOP=1 --no-psqlrc -d "${DATABASE_URL:-}" -c "${sql}" 2>/dev/null)"; then
		printf ''
		return 0
	fi
	printf '%s' "${out}"
}

# db_reachable — true when the configured database accepts a trivial query.
db_reachable() {
	[[ -n "${DATABASE_URL:-}" ]] || return 1
	psql -X -tA -q --no-psqlrc -d "${DATABASE_URL}" -c 'SELECT 1' >/dev/null 2>&1
}

# -----------------------------------------------------------------------------
# 7. systemd helpers
# -----------------------------------------------------------------------------
# All of these stay quiet when systemd is absent (containers, dev laptops).
svc_exists() { systemctl list-unit-files --no-legend "$1.service" 2>/dev/null | grep -q .; }
svc_active() { systemctl is-active --quiet "$1" 2>/dev/null; }
svc_enabled() { systemctl is-enabled --quiet "$1" 2>/dev/null; }
svc_state() { systemctl is-active "$1" 2>/dev/null || true; }
svc_show() { systemctl show "$1" -p "$2" --value 2>/dev/null || true; }

# systemctl_do <verb> [args...] — privileged systemctl call.
# The documented release flow is `sudo -u mistvale .../UPDATE.sh`
# (DEPLOYMENT_OPERATIONS §5), so the app user must be able to restart the
# service. DEPLOY.sh installs /etc/sudoers.d/mistvale granting exactly that.
systemctl_do() {
	if ((EUID == 0)); then
		systemctl "$@"
		return
	fi
	if have_cmd sudo && sudo -n systemctl "$@"; then
		return 0
	fi
	die "need root privileges for: systemctl $* (re-run with sudo, or check /etc/sudoers.d/${APP_USER})"
}

# -----------------------------------------------------------------------------
# 8. Filesystem primitives
# -----------------------------------------------------------------------------
# safe_rm_rf <path> — refuses anything that is not clearly ours:
#   • empty / relative paths, or paths with fewer than 3 components
#   • paths outside APP_ROOT, BACKUP_DIR, LOG_DIR or /tmp
#   • symlinks (removed with `rm -f`, never followed)
# This is the ONLY place in the ops scripts allowed to run `rm -rf`.
safe_rm_rf() {
	local target="${1:-}"
	[[ -n "${target}" ]] || die "safe_rm_rf: empty path refused"
	[[ "${target}" == /* ]] || die "safe_rm_rf: relative path refused: ${target}"
	[[ "${target}" != *".."* ]] || die "safe_rm_rf: path traversal refused: ${target}"

	# Never touch a symlink's target — unlink the link itself.
	if [[ -L "${target}" ]]; then
		rm -f -- "${target}"
		return 0
	fi
	[[ -e "${target}" ]] || return 0

	# Require at least three path components (/a/b/c) — kills /, /srv, /var typos.
	local depth
	depth="$(printf '%s' "${target#/}" | awk -F/ '{print NF}')"
	((depth >= 3)) || die "safe_rm_rf: path too shallow, refused: ${target}"

	# Must live under a directory this project owns.
	local root allowed=0
	for root in "${APP_ROOT}" "${BACKUP_DIR}" "${LOG_DIR}" "/tmp"; do
		if [[ "${target}" == "${root}/"* ]]; then
			allowed=1
			break
		fi
	done
	((allowed == 1)) || die "safe_rm_rf: path outside managed roots, refused: ${target}"

	rm -rf -- "${target}"
}

# swap_symlink <target> <link> — atomically (re)point <link> at <target>.
# `ln -sfn` on an existing directory symlink is not atomic; the temp+rename
# dance below is (rename(2) on the same filesystem).
swap_symlink() {
	local target="$1" link="$2" tmp
	[[ -e "${target}" ]] || die "swap_symlink: target does not exist: ${target}"

	# A real (non-symlink) directory at the link path can only be a leftover
	# placeholder; rmdir removes it only when empty, so real content is never
	# silently destroyed.
	if [[ -d "${link}" && ! -L "${link}" ]]; then
		rmdir -- "${link}" 2>/dev/null ||
			die "swap_symlink: ${link} is a non-empty directory, not a release symlink — move it aside first"
	fi

	tmp="${link}.tmp.$$"
	ln -sfn -- "${target}" "${tmp}"
	mv -Tf -- "${tmp}" "${link}"
}

# link_target <link> — resolved target of a symlink, empty when not a link.
link_target() {
	[[ -L "$1" ]] || return 0
	readlink -f -- "$1" 2>/dev/null || true
}

# ensure_dir <path> [owner] [mode] — idempotent mkdir + chown + chmod.
# The chown is skipped when not running as root (a non-root caller cannot give
# a directory away, and on a developer box APP_USER may not even exist).
ensure_dir() {
	local path="$1" owner="${2:-}" mode="${3:-}"
	[[ -d "${path}" ]] || mkdir -p -- "${path}"
	if [[ -n "${owner}" && "${EUID}" -eq 0 ]]; then
		chown "${owner}" "${path}"
	fi
	[[ -z "${mode}" ]] || chmod "${mode}" "${path}"
}

# ts_utc — release/backup timestamps are always UTC, sortable, filename-safe.
ts_utc() { date -u +'%Y%m%dT%H%M%SZ'; }
date_utc() { date -u +'%Y-%m-%d'; }

# human_size <path> — `du -sh` without the trailing path column.
human_size() { du -sh -- "$1" 2>/dev/null | awk '{print $1}'; }

# -----------------------------------------------------------------------------
# 9. Running things as the app user
# -----------------------------------------------------------------------------
# run_as_app_user <command> [args...]
# When running as root, drop to APP_USER (so builds never leave root-owned files
# in /srv/mistvale). When already the app user (or when the user does not exist,
# e.g. a developer laptop), run directly.
#
# `sudo -E` keeps the environment load_env exported (DATABASE_URL, SESSION_PEPPER,
# …) — the server's config schema validates ALL of it at boot, including for the
# one-shot entrypoints, so a whitelist here would rot the moment a variable is
# added. HOME/PATH are then pinned explicitly for pnpm's store and corepack.
run_as_app_user() {
	if [[ "${EUID}" -eq 0 ]] && id -u "${APP_USER}" >/dev/null 2>&1; then
		need_cmd sudo
		sudo -E -u "${APP_USER}" -H \
			env "HOME=${APP_ROOT}" "PATH=${PATH}" \
			"COREPACK_ENABLE_DOWNLOAD_PROMPT=0" \
			"${@}"
	else
		"${@}"
	fi
}

# reexec_as_app_user "$@"
# Called at the top of every ops script the docs say to run as the app user
# (UPDATE, BACKUP, SEED, SET_RANK). Under root it replaces this process with the
# same script running as APP_USER; otherwise it returns and the script proceeds.
#
# Why this exists: `sudo UPDATE.sh` and `sudo -u mistvale UPDATE.sh` look
# interchangeable, and the first one is what a person types. It even works —
# once. It leaves root-owned files behind in /var/log/mistvale and
# /var/backups/mistvale, and the *next* run as the app user then cannot write
# its own log or take the backup lock. Rather than document the distinction and
# hope, the scripts make it not matter. The app user has a sudoers entry for its
# own service, so nothing here needs the privileges being dropped.
#
# MISTVALE_REEXEC stops a loop if APP_USER somehow resolves back to root.
reexec_as_app_user() {
	[[ "${EUID}" -eq 0 ]] || return 0
	[[ -z "${MISTVALE_REEXEC:-}" ]] || return 0
	id -u "${APP_USER}" >/dev/null 2>&1 || return 0
	need_cmd sudo
	log "started as root — re-running as ${APP_USER} so this leaves nothing root-owned"
	exec sudo -E -u "${APP_USER}" -H \
		env "HOME=${APP_ROOT}" "PATH=${PATH}" "MISTVALE_REEXEC=1" \
		"COREPACK_ENABLE_DOWNLOAD_PROMPT=0" \
		"${SCRIPTS_DIR}/${SCRIPT_NAME}" "$@"
}

# run_server_entry <dist entry> <pnpm script> [args...]
# Runs one of the server's built one-shot entrypoints (apps/server/build.js):
#   dist/db/migrate.js · dist/db/seed.js · dist/scripts/set-rank.js
# Preference order:
#   1. ${MISTVALE_SERVER_DIR}/dist/<entry>  — the release being deployed
#   2. ${SERVER_LINK}/dist/<entry>          — the live release on the VPS
#   3. ${REPO_ROOT}/apps/server/dist/<entry>— a locally built checkout
#   4. pnpm --filter @mistvale/server run <script> — source checkout (tsx)
# Running the built bundle needs no devDependencies, which is what makes these
# usable on the box even when the toolchain is unavailable.
run_server_entry() {
	local entry="$1" script="$2"
	shift 2
	local base candidate=""
	for base in "${MISTVALE_SERVER_DIR:-}" "${SERVER_LINK}" "${REPO_ROOT}/apps/server"; do
		[[ -n "${base}" ]] || continue
		if [[ -f "${base}/dist/${entry}" ]]; then
			candidate="${base}/dist/${entry}"
			break
		fi
	done

	if [[ -n "${candidate}" ]]; then
		log "running ${candidate##*/dist/} from $(dirname -- "$(dirname -- "${candidate}")")"
		run_as_app_user node "${candidate}" "$@"
		return
	fi

	have_cmd pnpm || die "neither a built ${entry} nor pnpm is available — build the server first (pnpm --filter ${SERVER_PKG} build)"
	log "no built ${entry} — falling back to: pnpm --filter ${SERVER_PKG} run ${script}"
	run_as_app_user pnpm --dir "${REPO_ROOT}" --filter "${SERVER_PKG}" run "${script}" "$@"
}

# -----------------------------------------------------------------------------
# 10. HTTP health check
# -----------------------------------------------------------------------------
# health_check <url> [attempts] [delay-seconds] — prints the last body on
# success, returns non-zero when every attempt failed.
health_check() {
	local url="$1"
	local -i attempts="${2:-15}" delay="${3:-2}" n=1
	local body=""
	while ((n <= attempts)); do
		if body="$(curl -fsS --max-time 5 "${url}" 2>/dev/null)"; then
			printf '%s' "${body}"
			return 0
		fi
		((n < attempts)) && sleep "${delay}"
		n=$((n + 1))
	done
	return 1
}

# http_get <url> [extra curl args...] — quiet GET, empty output on failure.
http_get() {
	local url="$1"
	shift
	curl -fsS --max-time 8 "$@" "${url}" 2>/dev/null || true
}

# -----------------------------------------------------------------------------
# 11. Template rendering (deploy-assets/*.conf|*.service → /etc)
# -----------------------------------------------------------------------------
# render_template <src> <dst> — substitutes the __PLACEHOLDER__ tokens used by
# scripts/deploy-assets/*. Writes atomically; leaves <dst> untouched when the
# rendered content is identical (so nginx/systemd are not reloaded needlessly).
# Returns 0 when the file changed, 1 when it was already up to date.
render_template() {
	local src="$1" dst="$2" tmp
	[[ -f "${src}" ]] || die "template not found: ${src}"
	tmp="$(mktemp)"
	sed \
		-e "s|__DOMAIN__|${DOMAIN}|g" \
		-e "s|__APP_USER__|${APP_USER}|g" \
		-e "s|__APP_GROUP__|${APP_GROUP}|g" \
		-e "s|__APP_ROOT__|${APP_ROOT}|g" \
		-e "s|__ENV_FILE__|${ENV_FILE}|g" \
		-e "s|__LOG_DIR__|${LOG_DIR}|g" \
		-e "s|__UPLOADS__|${UPLOADS}|g" \
		-e "s|__UPLOADS_ROOT__|$(dirname -- "${UPLOADS}")|g" \
		-e "s|__SERVICE__|${SERVICE}|g" \
		-e "s|__HOST__|${HOST}|g" \
		-e "s|__PORT__|${PORT}|g" \
		-e "s|__NODE_BIN__|${NODE_BIN:-/usr/bin/node}|g" \
		"${src}" >"${tmp}"

	if [[ -f "${dst}" ]] && cmp -s "${tmp}" "${dst}"; then
		rm -f -- "${tmp}"
		return 1
	fi
	install -m 0644 -- "${tmp}" "${dst}"
	rm -f -- "${tmp}"
	return 0
}

# -----------------------------------------------------------------------------
# 12. Misc
# -----------------------------------------------------------------------------
# gen_secret [bytes] — URL/systemd/shell-safe random string (alphanumeric only,
# so it can be dropped into DATABASE_URL and an EnvironmentFile unquoted).
gen_secret() {
	local bytes="${1:-32}" want out=""
	need_cmd openssl
	want=$((bytes * 2)) # 2 chars per byte of entropy after filtering
	# No `head -c` here on purpose: closing the pipe early would SIGPIPE openssl
	# and, with `set -o pipefail` in the caller, turn a secret into a hard error.
	while ((${#out} < want)); do
		out+="$(openssl rand -base64 "$((bytes * 3))" | tr -dc 'A-Za-z0-9')"
	done
	printf '%s\n' "${out:0:want}"
}

# gen_hex [bytes] — hex secret (used for the DB password: always URL-safe).
gen_hex() {
	need_cmd openssl
	openssl rand -hex "${1:-24}"
}

# is_true <value> — accepts 1/true/yes/on (case-insensitive).
is_true() {
	case "${1,,}" in
	1 | true | yes | on) return 0 ;;
	*) return 1 ;;
	esac
}

# repo_sha <dir> — short git sha, "unknown" when the directory is not a repo.
repo_sha() {
	git -C "$1" rev-parse --short HEAD 2>/dev/null || printf 'unknown'
}

# repo_branch <dir> — current branch, "detached" when on a detached HEAD.
repo_branch() {
	local b
	b="$(git -C "$1" rev-parse --abbrev-ref HEAD 2>/dev/null || printf 'unknown')"
	[[ "${b}" == "HEAD" ]] && b="detached"
	printf '%s' "${b}"
}
