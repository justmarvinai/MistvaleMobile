#!/usr/bin/env bash
# =============================================================================
# UPDATE.sh — pull, build, migrate, swap, restart — with automatic rollback
# =============================================================================
# The documented release flow (DEPLOYMENT_OPERATIONS.md §5) is:
#     ssh vps → sudo -u mistvale /srv/mistvale/repo/scripts/UPDATE.sh
#
# What happens, in order:
#   1. back up the database (BACKUP.sh) — always first, before anything moves
#   2. git fetch/pull both repos onto the target branch (retry 2s/4s/8s/16s)
#   3. pnpm install --frozen-lockfile in both repos
#   4. build server + client + admin SEQUENTIALLY into releases/<UTC ts>/
#      under nice/ionice with NODE_OPTIONS=--max-old-space-size=1536
#      (1 core / 4 GB: parallel Vite builds would swap the box)
#   5. run drizzle migrations (destructive ones are refused without a flag)
#   6. atomically swap the client/admin/server symlinks
#   7. restart mistvale-server (≈2–5 s downtime) and health-check it
#   8. on any failure after the swap: roll the symlinks back, restart, report
#
# Release layout:
#   /srv/mistvale/releases/<ts>/{client,admin,server,RELEASE}
#   /srv/mistvale/{client,admin,server,current} → symlinks into the release
#
# The server's node_modules are a symlink into /srv/mistvale/repo (pnpm keeps
# the real store there), so a rollback whose lockfile differs also restores the
# repo checkouts to the recorded SHAs and reinstalls — see rollback_to().
# -----------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
enable_error_trap

# Running this as root would leave root-owned files the app user cannot rewrite.
reexec_as_app_user "$@"

usage() {
	cat <<EOF
${C_BOLD}UPDATE.sh${C_RESET} — deploy the current branch, with automatic rollback

  Usage: UPDATE.sh [options]

  Options:
    --branch <name>       branch to deploy in BOTH repos
                          (default: \$DEPLOY_BRANCH, else the checked-out branch,
                           else '${DEPLOY_BRANCH}')
    --content-only        no rebuild: pull, re-seed content definitions from the
                          git seeds, restart (player data untouched)
    --rollback            switch back to the previous release and restart
    --skip-backup         do not run BACKUP.sh first (not recommended)
    --allow-destructive   permit migrations containing DROP/TRUNCATE statements
    --initial             first deployment on a fresh box: no pull, no backup,
                          seeds the database, enables the service
                          (used by DEPLOY.sh — you rarely want this by hand)
    --yes                 answer typed confirmations automatically
    -q, --quiet           less output
    -h, --help            show this help

  Examples:
    sudo -u ${APP_USER} ${SCRIPTS_DIR}/UPDATE.sh
    sudo -u ${APP_USER} ${SCRIPTS_DIR}/UPDATE.sh --branch ea-0.1
    sudo -u ${APP_USER} ${SCRIPTS_DIR}/UPDATE.sh --content-only
    sudo -u ${APP_USER} ${SCRIPTS_DIR}/UPDATE.sh --rollback
EOF
}

BRANCH=""
CONTENT_ONLY=0
DO_ROLLBACK=0
SKIP_BACKUP=0
ALLOW_DESTRUCTIVE=0
INITIAL=0

while (($# > 0)); do
	case "$1" in
	-h | --help)
		usage
		exit 0
		;;
	--branch)
		BRANCH="${2:-}"
		[[ -n "${BRANCH}" ]] || die "--branch needs a value"
		shift 2
		;;
	--content-only)
		CONTENT_ONLY=1
		shift
		;;
	--rollback)
		DO_ROLLBACK=1
		shift
		;;
	--skip-backup)
		SKIP_BACKUP=1
		shift
		;;
	--allow-destructive)
		ALLOW_DESTRUCTIVE=1
		shift
		;;
	--initial)
		INITIAL=1
		SKIP_BACKUP=1
		shift
		;;
	--yes)
		MISTVALE_ASSUME_YES=1
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
need_cmd git pnpm curl

# Low-priority wrapper: the live game keeps the core while builds run.
LOWPRI=(nice -n 10)
if have_cmd ionice; then
	LOWPRI=(ionice -c 3 nice -n 10)
fi

# -----------------------------------------------------------------------------
# Release metadata helpers
# -----------------------------------------------------------------------------
meta_get() { # meta_get <RELEASE file> <key>
	[[ -f "$1" ]] || return 0
	sed -n "s/^$2=//p" "$1" | head -n1
}

lock_hash() { # lock_hash <repo dir>
	local f="$1/pnpm-lock.yaml"
	[[ -f "${f}" ]] || {
		printf 'none'
		return 0
	}
	sha256sum "${f}" | cut -d' ' -f1
}

releases_sorted() { # newest last
	find "${RELEASES_DIR}" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' 2>/dev/null | sort
}

current_release() { link_target "${CURRENT_LINK}"; }

previous_release() { # the newest release that is not the current one
	local cur prev="" r
	cur="$(basename -- "$(current_release)" 2>/dev/null || true)"
	while IFS= read -r r; do
		[[ -n "${r}" ]] || continue
		[[ "${r}" == "${cur}" ]] && continue
		prev="${r}"
	done < <(releases_sorted)
	[[ -n "${prev}" ]] || return 1
	printf '%s/%s' "${RELEASES_DIR}" "${prev}"
}

# activate <release dir> — point every serving symlink at one release.
activate() {
	local rel="$1"
	[[ -d "${rel}/client" ]] || die "release ${rel} has no client build"
	[[ -d "${rel}/admin" ]] || die "release ${rel} has no admin build"
	[[ -d "${rel}/server" ]] || die "release ${rel} has no server build"
	swap_symlink "${rel}/client" "${CLIENT_LINK}"
	swap_symlink "${rel}/admin" "${ADMIN_LINK}"
	swap_symlink "${rel}/server" "${SERVER_LINK}"
	swap_symlink "${rel}" "${CURRENT_LINK}"
}

restart_and_check() { # restart_and_check [attempts]
	local attempts="${1:-20}"
	# The restart's own exit status must be checked explicitly: `set -e` is
	# disabled inside a function called as an `if` condition, so a failing
	# systemctl would otherwise fall through to a health check that the OLD
	# process happily answers.
	if ! systemctl_do restart "${SERVICE}"; then
		err "systemctl restart ${SERVICE} failed"
		return 1
	fi
	if health_check "${HEALTH_LITE_URL}" "${attempts}" 2 >/dev/null; then
		return 0
	fi
	return 1
}

# rollback_to <release dir> <reason>
rollback_to() {
	local rel="$1" reason="$2"
	warn "ROLLBACK: ${reason}"
	log "switching back to release $(basename -- "${rel}")"

	# When the previous release was built from a different lockfile, its code
	# needs the matching node_modules (they live in the repo checkout, shared by
	# all releases). Restore the recorded SHAs and reinstall in that case.
	# Both hashes must be known — an unknown one is no evidence of a difference.
	local meta="${rel}/RELEASE" want_lock have_lock game_sha admin_sha
	want_lock="$(meta_get "${meta}" game_lock_hash)"
	have_lock="$(lock_hash "${REPO_DIR}")"
	if [[ -n "${want_lock}" && "${want_lock}" != "none" &&
		"${have_lock}" != "none" && "${want_lock}" != "${have_lock}" ]]; then
		game_sha="$(meta_get "${meta}" game_sha)"
		admin_sha="$(meta_get "${meta}" admin_sha)"
		warn "the previous release used different dependencies — restoring checkouts (${game_sha}, ${admin_sha}) and reinstalling"
		if [[ -n "${game_sha}" ]]; then
			run_as_app_user git -C "${REPO_DIR}" checkout --quiet --detach "${game_sha}" ||
				warn "could not check out ${game_sha} in ${REPO_DIR}"
			run_in_dir "${REPO_DIR}" "${LOWPRI[@]}" pnpm install --frozen-lockfile --prod=false ||
				warn "pnpm install for the rolled-back tree failed"
		fi
		if [[ -n "${admin_sha}" && -d "${ADMIN_REPO_DIR}/.git" ]]; then
			run_as_app_user git -C "${ADMIN_REPO_DIR}" checkout --quiet --detach "${admin_sha}" ||
				warn "could not check out ${admin_sha} in ${ADMIN_REPO_DIR}"
		fi
	fi

	activate "${rel}"
	if restart_and_check 20; then
		ok "rolled back to $(basename -- "${rel}") and healthy again"
		warn "the deployment did NOT complete — investigate before retrying: ${SCRIPTS_DIR}/LOGS.sh -e"
		return 0
	fi
	err "the rollback could not bring ${SERVICE} back to a healthy state"
	err "manual recovery: ${SCRIPTS_DIR}/LOGS.sh -e  ·  systemctl status ${SERVICE}"
	err "if a migration broke the schema, restore the pre-update backup: ${SCRIPTS_DIR}/RESTORE.sh"
	return 1
}

# =============================================================================
# Mode: --rollback
# =============================================================================
if ((DO_ROLLBACK == 1)); then
	step "Rollback"
	PREV="$(previous_release || true)"
	[[ -n "${PREV}" ]] || die "no previous release found in ${RELEASES_DIR} — nothing to roll back to"
	log "current : $(current_release)"
	log "target  : ${PREV}"
	confirm "ROLLBACK" "The running release is replaced by the previous one and ${SERVICE} is restarted. Database migrations are NOT reverted — if the last update ran a destructive migration, restore a backup instead (RESTORE.sh)."
	if rollback_to "${PREV}" "requested by operator"; then
		"${SCRIPTS_DIR}/STATUS.sh" --short || true
		exit 0
	fi
	exit 1
fi

# =============================================================================
# Branch resolution (both repos track the same branch name)
# =============================================================================
if [[ -z "${BRANCH}" ]]; then
	BRANCH="${DEPLOY_BRANCH:-}"
fi
if [[ -z "${BRANCH}" ]]; then
	BRANCH="$(repo_branch "${REPO_DIR}")"
	[[ "${BRANCH}" == "detached" || "${BRANCH}" == "unknown" ]] && BRANCH="main"
fi

# --- 2. Pull -----------------------------------------------------------------

# assert_owned <dir> <label>
#
# Every file in a checkout must belong to the app user, and one that does not
# will wedge the next update in a way that reads like something else entirely.
#
# This is not hypothetical. A deploy that once ran git as root left five
# root-owned files behind; months later `git checkout` wrote most of a release,
# hit them, could not unlink them, and stopped — leaving a half-applied tree
# that the retried `git pull` then reported as eighty files of "local changes"
# and a hundred untracked ones. Two hundred lines of git output for a chown.
#
# So it is checked first, and it says the one command that fixes it.
assert_owned() {
	local dir="$1" label="$2" strays count
	# -xdev keeps this out of a bind mount; `head` bounds the report to something
	# a person can read when every file is wrong.
	strays="$(find "${dir}" -xdev ! -user "${APP_USER}" -printf '%u %p\n' 2>/dev/null | head -10 || true)"
	[[ -n "${strays}" ]] || return 0

	count="$(find "${dir}" -xdev ! -user "${APP_USER}" 2>/dev/null | wc -l || echo '?')"
	warn "${count} file(s) in ${dir} are not owned by ${APP_USER}:"
	printf '%s\n' "${strays}" >&2
	[[ "${count}" -gt 10 ]] 2>/dev/null && printf '    …\n' >&2
	die "fix the ownership and re-run:  sudo chown -R ${APP_USER}:${APP_GROUP} ${dir}"
}

pull_repo() { # pull_repo <dir> <label>
	local dir="$1" label="$2"
	[[ -d "${dir}/.git" ]] || die "${label} checkout missing at ${dir} — run DEPLOY.sh first"

	assert_owned "${dir}" "${label}"

	# Refuse to blow away uncommitted work silently (hand-edits on the box happen).
	if ! run_as_app_user git -C "${dir}" diff --quiet --ignore-submodules HEAD 2>/dev/null; then
		warn "${label} has uncommitted local changes in ${dir}:"
		run_as_app_user git -C "${dir}" status --short | head -20 >&2
		confirm "DISCARD-LOCAL" "They will be discarded — this checkout is deployment state, not a workspace."
	fi

	log "${label}: fetching origin"
	retry 5 run_as_app_user git -C "${dir}" fetch --prune --quiet origin ||
		die "${label}: git fetch failed after 5 attempts"

	if ! run_as_app_user git -C "${dir}" rev-parse --verify --quiet "origin/${BRANCH}" >/dev/null; then
		die "${label}: branch '${BRANCH}' does not exist on origin"
	fi

	# Reset rather than merge. This checkout is *deployment state*: nothing is
	# ever authored in it, and every build is copied into releases/ — so the only
	# correct outcome is "exactly what origin says", and a merge is the wrong verb
	# for that. `pull --ff-only` failed on any drift at all, which meant a single
	# partially-applied checkout could leave the box unable to update itself until
	# somebody reset it by hand.
	#
	# Not retried: a reset that fails once fails five times, and the retry only
	# ever buried the reason under four more copies of it.
	log "${label}: resetting to origin/${BRANCH}"
	run_as_app_user git -C "${dir}" checkout --quiet -B "${BRANCH}" "origin/${BRANCH}" ||
		die "${label}: could not check out ${BRANCH}"
	run_as_app_user git -C "${dir}" reset --hard --quiet "origin/${BRANCH}" ||
		die "${label}: could not reset to origin/${BRANCH}"
	# `-fd` without `-x`: build outputs and node_modules are ignored files and must
	# survive, or every update pays for a cold install.
	run_as_app_user git -C "${dir}" clean -fdq ||
		die "${label}: could not clean the checkout"

	ok "${label}: $(repo_branch "${dir}") @ $(repo_sha "${dir}")"
}

# =============================================================================
# Mode: --content-only (no rebuild)
# =============================================================================
if ((CONTENT_ONLY == 1)); then
	step "Content-only update (branch ${BRANCH})"

	if ((SKIP_BACKUP == 0)); then
		"${SCRIPTS_DIR}/BACKUP.sh" --label pre-content || die "backup failed — aborting"
	fi

	# The same pull the full update uses — ownership checked, reset rather than
	# merged. This was a second copy of the fragile version until P10, which meant
	# a checkout one mode could not recover from was one the other mode could.
	pull_repo "${REPO_DIR}" "game repo"

	# SEED.sh takes its own backup + confirmation and restarts the service so the
	# in-memory ContentCache reloads.
	SEED_ARGS=(--force-content --skip-backup --restart)
	if [[ "${MISTVALE_ASSUME_YES:-0}" == "1" ]]; then
		SEED_ARGS+=(--yes)
	fi
	"${SCRIPTS_DIR}/SEED.sh" "${SEED_ARGS[@]}"

	ok "content updated — content revision $(db_scalar "SELECT max(rev) FROM content_revisions")"
	exit 0
fi

# =============================================================================
# Normal deployment
# =============================================================================
step "Mistvale update — branch ${BRANCH}"
# The release that is live right now: this is what an automatic rollback must
# return to if the new one fails its health check.
CUR_RELEASE="$(current_release || true)"
OLD_GAME_SHA="$(repo_sha "${REPO_DIR}")"
log "current release : ${CUR_RELEASE:-none}"
log "game repo       : $(repo_branch "${REPO_DIR}") @ ${OLD_GAME_SHA}"
log "admin repo      : $(repo_branch "${ADMIN_REPO_DIR}") @ $(repo_sha "${ADMIN_REPO_DIR}")"

# --- 1. Backup ---------------------------------------------------------------
if ((SKIP_BACKUP == 0)); then
	step "1/7 Database backup"
	"${SCRIPTS_DIR}/BACKUP.sh" --label pre-update --no-prune ||
		die "backup failed — refusing to update (override with --skip-backup, at your own risk)"
else
	((INITIAL == 1)) || warn "--skip-backup: deploying without a fresh database backup"
fi

if ((INITIAL == 0)); then
	step "2/7 Pulling both repositories"
	pull_repo "${REPO_DIR}" "game repo"
	pull_repo "${ADMIN_REPO_DIR}" "admin repo"
else
	step "2/7 Initial deployment — repositories already at ${BRANCH}"
fi

NEW_GAME_SHA="$(repo_sha "${REPO_DIR}")"
NEW_ADMIN_SHA="$(repo_sha "${ADMIN_REPO_DIR}")"

# --- 3. Install dependencies -------------------------------------------------
step "3/7 Installing dependencies"
# --prod=false is explicit: pnpm skips devDependencies when NODE_ENV=production,
# and the build toolchain (esbuild, vite, tsc, drizzle-kit) lives there.
log "game repo: pnpm install --frozen-lockfile"
run_in_dir "${REPO_DIR}" "${LOWPRI[@]}" pnpm install --frozen-lockfile --prod=false ||
	die "pnpm install failed in ${REPO_DIR}"

# The Admin SPA is scaffolded in Phase A0 (admin repo). Until its package.json
# exists there is nothing to install or build, and /admin simply serves nothing.
ADMIN_BUILDABLE=0
if [[ -f "${ADMIN_REPO_DIR}/package.json" ]]; then
	ADMIN_BUILDABLE=1
	log "admin repo: pnpm install --frozen-lockfile"
	run_in_dir "${ADMIN_REPO_DIR}" "${LOWPRI[@]}" pnpm install --frozen-lockfile --prod=false ||
		die "pnpm install failed in ${ADMIN_REPO_DIR}"
else
	warn "admin repo has no package.json yet (Phase A0 not reached) — /admin will 404 until it does"
fi
ok "dependencies up to date"

# --- 4. Build ----------------------------------------------------------------
RELEASE_TS="$(ts_utc)"
NEW_RELEASE="${RELEASES_DIR}/${RELEASE_TS}"
step "4/7 Building release ${RELEASE_TS}"

ensure_dir "${RELEASES_DIR}" "${APP_USER}:${APP_GROUP}" 0755
ensure_dir "${NEW_RELEASE}" "${APP_USER}:${APP_GROUP}" 0755
ensure_dir "${NEW_RELEASE}/server/dist" "${APP_USER}:${APP_GROUP}" 0755
ensure_dir "${NEW_RELEASE}/client" "${APP_USER}:${APP_GROUP}" 0755
ensure_dir "${NEW_RELEASE}/admin" "${APP_USER}:${APP_GROUP}" 0755

# 1536 MB heap: verified to fit alongside the running game on the 4 GB box
# (DEPLOYMENT_OPERATIONS §3). Builds are strictly sequential for the same reason.
export NODE_OPTIONS="--max-old-space-size=1536"

# The trailing "..." in the filter means "this package and its dependencies", so
# packages/shared and packages/engine are built first, in topological order.
log "building server (${SERVER_PKG})"
run_in_dir "${REPO_DIR}" "${LOWPRI[@]}" pnpm --filter "${SERVER_PKG}..." build ||
	die "server build failed — nothing was swapped, the live release is untouched"

log "building game client (${CLIENT_PKG})"
run_in_dir "${REPO_DIR}" "${LOWPRI[@]}" pnpm --filter "${CLIENT_PKG}..." build ||
	die "client build failed — nothing was swapped, the live release is untouched"

if ((ADMIN_BUILDABLE == 1)); then
	log "building admin SPA"
	run_in_dir "${ADMIN_REPO_DIR}" "${LOWPRI[@]}" pnpm build ||
		die "admin build failed — nothing was swapped, the live release is untouched"
fi

unset NODE_OPTIONS

# --- Collect the build outputs into the release ------------------------------
[[ -d "${REPO_DIR}/${SERVER_DIST_REL}" ]] || die "server build output missing: ${REPO_DIR}/${SERVER_DIST_REL}"
[[ -f "${REPO_DIR}/${SERVER_DIST_REL}/index.js" ]] || die "server bundle missing: ${SERVER_DIST_REL}/index.js"
[[ -d "${REPO_DIR}/${CLIENT_DIST_REL}" ]] || die "client build output missing: ${REPO_DIR}/${CLIENT_DIST_REL}"

log "collecting build output"
cp -a "${REPO_DIR}/${SERVER_DIST_REL}/." "${NEW_RELEASE}/server/dist/"
cp -a "${REPO_DIR}/apps/server/package.json" "${NEW_RELEASE}/server/package.json"
# The built migrator resolves its SQL folder as <server dir>/drizzle, so the
# release has to carry the migrations next to dist/ (apps/server/build.js).
if [[ -d "${REPO_DIR}/${DRIZZLE_DIR_REL}" ]]; then
	ensure_dir "${NEW_RELEASE}/server/drizzle" "" 0755
	cp -a "${REPO_DIR}/${DRIZZLE_DIR_REL}/." "${NEW_RELEASE}/server/drizzle/"
else
	warn "no ${DRIZZLE_DIR_REL} folder — the release carries no migrations"
fi
cp -a "${REPO_DIR}/${CLIENT_DIST_REL}/." "${NEW_RELEASE}/client/"

if ((ADMIN_BUILDABLE == 1)); then
	[[ -d "${ADMIN_REPO_DIR}/${ADMIN_DIST_REL}" ]] || die "admin build output missing: ${ADMIN_REPO_DIR}/${ADMIN_DIST_REL}"
	cp -a "${ADMIN_REPO_DIR}/${ADMIN_DIST_REL}/." "${NEW_RELEASE}/admin/"
else
	# Empty but present: the release layout stays uniform and nginx answers 404
	# instead of failing its config test.
	log "admin build skipped — ${NEW_RELEASE}/admin stays empty for now"
fi

# The runtime dependency tree stays in the repo checkout: pnpm's store lives
# there and copying a symlink farm would break it. Node resolves through this
# link (symlinks are followed by default).
ln -sfn "${REPO_DIR}/apps/server/node_modules" "${NEW_RELEASE}/server/node_modules"

cat >"${NEW_RELEASE}/RELEASE" <<EOF
release_ts=${RELEASE_TS}
built_at=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
built_by=$(id -un)
branch=${BRANCH}
game_sha=${NEW_GAME_SHA}
admin_sha=${NEW_ADMIN_SHA}
game_lock_hash=$(lock_hash "${REPO_DIR}")
admin_lock_hash=$(lock_hash "${ADMIN_REPO_DIR}")
node_version=$(node --version 2>/dev/null || echo unknown)
previous_release=$(basename -- "${CUR_RELEASE:-none}")
EOF

if [[ "${EUID}" -eq 0 ]] && id -u "${APP_USER}" >/dev/null 2>&1; then
	chown -R "${APP_USER}:${APP_GROUP}" "${NEW_RELEASE}"
fi
ok "release built: ${NEW_RELEASE} (client $(human_size "${NEW_RELEASE}/client"), admin $(human_size "${NEW_RELEASE}/admin"))"

# --- 5. Migrations -----------------------------------------------------------
step "5/7 Database migrations"

# Destructive-migration guard (DATA_MODEL §5): DROP/TRUNCATE statements in
# migrations added since the running release require an explicit flag AND a
# fresh backup.
if ((INITIAL == 0)) && [[ -n "${OLD_GAME_SHA}" && "${OLD_GAME_SHA}" != "unknown" ]]; then
	DESTRUCTIVE=""
	if [[ -d "${REPO_DIR}/${DRIZZLE_DIR_REL}" ]]; then
		while IFS= read -r f; do
			[[ -n "${f}" && -f "${REPO_DIR}/${f}" ]] || continue
			[[ "${f}" == *.sql ]] || continue
			if grep -Eiq 'drop[[:space:]]+(table|column|schema|database)|truncate[[:space:]]+table' "${REPO_DIR}/${f}"; then
				DESTRUCTIVE+="    ${f}"$'\n'
			fi
		done < <(git -C "${REPO_DIR}" diff --name-only "${OLD_GAME_SHA}" HEAD -- "${DRIZZLE_DIR_REL}" 2>/dev/null || true)
	fi
	if [[ -n "${DESTRUCTIVE}" ]]; then
		warn "these new migrations contain destructive statements:"
		printf '%s' "${DESTRUCTIVE}" >&2
		if ((ALLOW_DESTRUCTIVE == 0)); then
			die "refusing to apply destructive migrations — re-run with --allow-destructive (a fresh backup is already in ${BACKUP_DIR})"
		fi
		if ((SKIP_BACKUP == 1)); then
			die "destructive migrations require a fresh backup — drop --skip-backup"
		fi
		confirm "MIGRATE-DESTRUCTIVE" "Data will be dropped. The pre-update backup is your only way back."
	fi
fi

# Run the migrator from the release that is about to go live, so the schema and
# the code that will use it come from the same commit.
MISTVALE_SERVER_DIR="${NEW_RELEASE}/server" run_server_entry "${ENTRY_MIGRATE}" "${SCRIPT_MIGRATE}" ||
	die "migrations failed — the live release is still running the previous build"
ok "migrations applied"

# --- Seeds (bootstrap only; never overwrites authored content) ---------------
# SEED.sh's default mode fills content tables that are EMPTY and does nothing
# otherwise, so running it on every update is safe and is what makes a release
# that introduces a new content family arrive populated. Restricting it to
# --initial used to mean such a release migrated the tables in and then left
# them empty, with no champions in game and nothing to edit in Admin.
# Replacing authored content still requires an explicit SEED.sh --force-content.
if ((INITIAL == 1)); then
	step "5b/7 Seeding content (first deployment)"
else
	step "5b/7 Bootstrapping any empty content tables"
fi
# Seed with the bundle from the release being deployed, exactly like the
# migration above — on a fresh box the live symlink does not exist yet, and on
# an update the new seeds are the ones that match the new schema.
MISTVALE_SERVER_DIR="${NEW_RELEASE}/server" "${SCRIPTS_DIR}/SEED.sh" || die "seeding failed"

# --- 6. Swap -----------------------------------------------------------------
step "6/7 Activating the new release"
activate "${NEW_RELEASE}"
ok "symlinks now point at ${RELEASE_TS}"

# --- 7. Restart + health -----------------------------------------------------
step "7/7 Restarting ${SERVICE}"
if ((INITIAL == 1)); then
	systemctl_do enable "${SERVICE}" >/dev/null 2>&1 || warn "could not enable ${SERVICE}"
fi

if restart_and_check 20; then
	ok "${SERVICE} is healthy on release ${RELEASE_TS}"
else
	if [[ -n "${CUR_RELEASE}" && "${CUR_RELEASE}" != "${NEW_RELEASE}" && -d "${CUR_RELEASE}" ]]; then
		rollback_to "${CUR_RELEASE}" "the new release failed its health check (${HEALTH_LITE_URL})"
		exit 1
	fi
	err "health check failed and there is no previous release to roll back to"
	err "check: ${SCRIPTS_DIR}/LOGS.sh -e  ·  systemctl status ${SERVICE}"
	exit 1
fi

# --- Prune old releases ------------------------------------------------------
: "${KEEP_RELEASES:=5}"
mapfile -t ALL_RELEASES < <(releases_sorted)
if ((${#ALL_RELEASES[@]} > KEEP_RELEASES)); then
	PRUNE_COUNT=$((${#ALL_RELEASES[@]} - KEEP_RELEASES))
	KEEP_CURRENT="$(basename -- "$(current_release)")"
	# The release we just replaced is what `--rollback` would return to.
	KEEP_PREV="$(basename -- "${CUR_RELEASE:-none}")"
	for r in "${ALL_RELEASES[@]:0:${PRUNE_COUNT}}"; do
		# Never remove what is running, nor the one rollback would use.
		[[ "${r}" == "${KEEP_CURRENT}" || "${r}" == "${KEEP_PREV}" ]] && continue
		log "pruning old release ${r}"
		safe_rm_rf "${RELEASES_DIR}/${r}"
	done
fi

# --- Report ------------------------------------------------------------------
hr
CONTENT_REV="$(db_scalar "SELECT max(rev) FROM content_revisions")"
printf '  %-18s %s\n' "release" "${RELEASE_TS}"
printf '  %-18s %s @ %s\n' "game repo" "${BRANCH}" "${NEW_GAME_SHA}"
printf '  %-18s %s @ %s\n' "admin repo" "${BRANCH}" "${NEW_ADMIN_SHA}"
printf '  %-18s %s\n' "content revision" "${CONTENT_REV:-unknown}"
printf '  %-18s https://%s\n' "game" "${DOMAIN}"
printf '  %-18s https://%s/admin\n' "admin panel" "${DOMAIN}"
hr
ok "update complete"
log "smoke-test: log in · run one battle · do one summon (DEPLOYMENT_OPERATIONS §5)"
log "reminder: tag the release (ea-0.1.x) and add the CHANGELOG entry if this was a player-visible change"
log "rollback if needed: ${SCRIPTS_DIR}/UPDATE.sh --rollback"
