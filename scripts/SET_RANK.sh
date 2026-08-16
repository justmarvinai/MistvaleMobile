#!/usr/bin/env bash
# =============================================================================
# SET_RANK.sh — change an account's rank from the CLI (audited)
# =============================================================================
# Mistvale has ONE account system with three ranks (DATA_MODEL §4 `accounts`):
#
#   player      the game
#   gamemaster  reserved moderation rank — no Admin Panel access at EA
#   admin       full Admin Panel access (/admin, /admin/api)
#
# This script is:
#   • how DEPLOY.sh bootstraps the very first admin account, and
#   • the recovery path when every admin has locked themselves out.
#
# It talks to PostgreSQL directly (the only script that writes game data),
# because by definition it must work when no admin can log in. Every change
# writes an `audit_log` row with action='rank_change' and source='admin:cli'
# so CLI changes are as visible as Admin Panel ones (ARCHITECTURE §5.6).
# -----------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
enable_error_trap

usage() {
	cat <<EOF
${C_BOLD}SET_RANK.sh${C_RESET} — set an account's rank (audited as admin:cli)

  Usage: SET_RANK.sh [options] <accountName> <player|gamemaster|admin>

  Options:
    --yes            skip the typed confirmation for dangerous changes
                     (removing the last admin)
    -q, --quiet      only print the final result line
    -h, --help       show this help

  Examples:
    sudo -u ${APP_USER} ${SCRIPTS_DIR}/SET_RANK.sh marvin admin
    sudo -u ${APP_USER} ${SCRIPTS_DIR}/SET_RANK.sh troublemaker player

  Notes:
    • The account must already exist — this script promotes/demotes, it never
      creates accounts (registration goes through the game, POST /api/auth/register).
    • Reads DATABASE_URL from ${ENV_FILE} (falling back to the repo .env).
    • Rank changes take effect on the next request; existing sessions are NOT
      invalidated (the admin guard re-reads the rank per request).
EOF
}

ACCOUNT_NAME=""
NEW_RANK=""
POSITIONAL=()

while (($# > 0)); do
	case "$1" in
	-h | --help)
		usage
		exit 0
		;;
	--yes)
		MISTVALE_ASSUME_YES=1
		shift
		;;
	-q | --quiet)
		QUIET=1
		shift
		;;
	--)
		shift
		while (($# > 0)); do
			POSITIONAL+=("$1")
			shift
		done
		;;
	-*)
		usage >&2
		die "unknown option: $1"
		;;
	*)
		POSITIONAL+=("$1")
		shift
		;;
	esac
done

if ((${#POSITIONAL[@]} != 2)); then
	usage >&2
	die "expected exactly two arguments: <accountName> <player|gamemaster|admin>"
fi
ACCOUNT_NAME="${POSITIONAL[0]}"
NEW_RANK="${POSITIONAL[1]}"

case "${NEW_RANK}" in
player | gamemaster | admin) ;;
*) die "invalid rank '${NEW_RANK}' — expected player, gamemaster or admin" ;;
esac

[[ -n "${ACCOUNT_NAME}" ]] || die "account name must not be empty"

need_cmd psql
load_env --required
require_env DATABASE_URL

# -----------------------------------------------------------------------------
# 1. Verify the account exists and read its current rank.
#    account_name is citext, so the lookup is case-insensitive by construction.
#    NOTE: psql only interpolates :'var' for input read from stdin or -f — never
#    for -c — so every parameterised query in these scripts uses a heredoc.
# -----------------------------------------------------------------------------
CURRENT_RANK="$(
	psql -X -tA -v ON_ERROR_STOP=1 --no-psqlrc -d "${DATABASE_URL}" \
		-v account_name="${ACCOUNT_NAME}" 2>/dev/null <<'SQL' || true
SELECT rank FROM accounts WHERE account_name = :'account_name';
SQL
)"

if [[ -z "${CURRENT_RANK}" ]]; then
	# Distinguish "no such account" from "database/schema not reachable" so the
	# operator is not sent hunting in the wrong direction.
	if ! db_reachable; then
		die "cannot reach the database ($(mask_db_url "${DATABASE_URL}")) — is PostgreSQL running?"
	fi
	if [[ -z "$(db_scalar "SELECT to_regclass('public.accounts')")" ]]; then
		die "the 'accounts' table does not exist yet — run migrations first (UPDATE.sh or DEPLOY.sh)"
	fi
	die "no account named '${ACCOUNT_NAME}' — register it in the game first (${DOMAIN}), then re-run this script"
fi

log "account '${ACCOUNT_NAME}' currently has rank '${CURRENT_RANK}'"

if [[ "${CURRENT_RANK}" == "${NEW_RANK}" ]]; then
	ok "'${ACCOUNT_NAME}' is already '${NEW_RANK}' — nothing to do"
	exit 0
fi

# -----------------------------------------------------------------------------
# 2. Guard: never silently remove the last admin (that is exactly the lockout
#    this script exists to repair).
# -----------------------------------------------------------------------------
if [[ "${CURRENT_RANK}" == "admin" && "${NEW_RANK}" != "admin" ]]; then
	ADMIN_COUNT="$(db_scalar "SELECT count(*) FROM accounts WHERE rank = 'admin'")"
	if [[ "${ADMIN_COUNT}" == "1" ]]; then
		confirm "REMOVE-LAST-ADMIN" \
			"'${ACCOUNT_NAME}' is the ONLY admin account. Demoting it locks everyone out of ${DOMAIN}/admin; recovery would need this script again on the VPS."
	fi
fi

# -----------------------------------------------------------------------------
# 3. Apply the change.
#
#    Preferred path: the server's own set-rank entrypoint
#    (apps/server/src/scripts/set-rank.ts → dist/scripts/set-rank.js). It owns the
#    schema, writes the audit_log row inside the same transaction, and is the one
#    implementation the Admin API shares — no second source of truth.
#
#    Fallback: raw SQL, for the genuine disaster case where the bundle is missing
#    or broken and an admin still has to be restored. Same transaction shape,
#    same audit row. psql's :'var' interpolation quotes safely, so an account name
#    can never inject SQL.
# -----------------------------------------------------------------------------
ACTOR_HOST="$(id -un)@$(hostname -s 2>/dev/null || echo unknown)"

set_rank_via_sql() {
	local result
	if ! result="$(
		psql -X -tA -v ON_ERROR_STOP=1 --no-psqlrc -d "${DATABASE_URL}" \
			-v account_name="${ACCOUNT_NAME}" \
			-v new_rank="${NEW_RANK}" \
			-v actor_host="${ACTOR_HOST}" <<'SQL'
BEGIN;

WITH target AS (
    SELECT id, account_name, rank AS old_rank
      FROM accounts
     WHERE account_name = :'account_name'
     FOR UPDATE
), updated AS (
    UPDATE accounts a
       SET rank = :'new_rank', updated_at = now()
      FROM target t
     WHERE a.id = t.id
    RETURNING a.id, a.account_name, t.old_rank, a.rank AS new_rank
), audited AS (
    INSERT INTO audit_log (account_id, actor, action, entity, entity_id, before, after)
    SELECT u.id,
           'admin:cli',
           'rank_change',
           'account',
           u.id,
           jsonb_build_object('rank', u.old_rank),
           jsonb_build_object('rank', u.new_rank, 'host', :'actor_host')
      FROM updated u
    RETURNING 1
)
SELECT u.account_name || '|' || u.old_rank || '|' || u.new_rank || '|' || (SELECT count(*) FROM audited)
  FROM updated u;

COMMIT;
SQL
	)"; then
		die "rank change failed — the transaction was rolled back, '${ACCOUNT_NAME}' is still '${CURRENT_RANK}' (see the psql error above)"
	fi

	[[ -n "${result}" ]] || die "rank change did not apply (no rows updated) — nothing was committed"

	local r_name r_old r_new r_audit
	IFS='|' read -r r_name r_old r_new r_audit <<<"${result}"
	if [[ "${r_audit}" != "1" ]]; then
		warn "rank changed but no audit_log row was written (got '${r_audit}') — check the audit_log schema"
	fi
	ok "rank changed: ${r_name}  ${r_old} → ${C_BOLD}${r_new}${C_RESET}"
}

# The subshell matters: run_server_entry aborts (die) when neither a built bundle
# nor pnpm exists, and that must degrade into the SQL fallback rather than end the
# script — this is the lockout-recovery tool.
if (run_server_entry "${ENTRY_SET_RANK}" "${SCRIPT_SET_RANK}" "${ACCOUNT_NAME}" "${NEW_RANK}"); then
	ok "rank changed: ${ACCOUNT_NAME}  ${CURRENT_RANK} → ${C_BOLD}${NEW_RANK}${C_RESET}"
else
	warn "the server's set-rank entrypoint was unavailable or failed — falling back to direct SQL"
	set_rank_via_sql
fi
log "audited as actor 'admin:cli' (run from ${ACTOR_HOST})"

if [[ "${NEW_RANK}" == "admin" ]]; then
	log "'${ACCOUNT_NAME}' can now sign in at https://${DOMAIN}/admin"
fi
