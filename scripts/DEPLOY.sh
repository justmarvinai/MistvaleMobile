#!/usr/bin/env bash
# =============================================================================
# DEPLOY.sh — fresh Ubuntu 24.04 VPS → running Mistvale
# =============================================================================
# One command turns a bare box into the production topology described in
# docs/DEPLOYMENT_OPERATIONS.md §1:
#
#   nginx (TLS, static, proxy) ── 127.0.0.1:3001 mistvale-server.service
#                              └─ postgresql@16 (localhost only)
#   /srv/mistvale/{repo,admin-repo,releases,client,admin,server,.env}
#   /var/lib/mistvale/uploads · /var/backups/mistvale · /var/log/mistvale
#
# Every step checks the real system state first, so re-running DEPLOY.sh is
# safe and cheap: finished steps are skipped, changed templates are re-applied.
#
#   sudo ./DEPLOY.sh                       # full bootstrap, prompts for details
#   sudo ./DEPLOY.sh --branch ea-0.1       # deploy a specific branch
#   sudo ./DEPLOY.sh --skip-certbot        # no TLS yet (DNS not pointed here)
#   sudo ./DEPLOY.sh --non-interactive     # unattended (no first-admin prompt)
#
# The build/migrate/seed/activate/restart part is delegated to UPDATE.sh
# --initial so that "first deploy" and "every later deploy" cannot drift apart.
# -----------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
enable_error_trap

usage() {
	cat <<EOF
${C_BOLD}DEPLOY.sh${C_RESET} — bootstrap a fresh Ubuntu 24.04 VPS for Mistvale

  Usage: sudo DEPLOY.sh [options]

  Options:
    --branch <name>      branch to deploy in both repos (default: ${DEPLOY_BRANCH})
    --domain <fqdn>      public domain (default: ${DOMAIN})
    --skip-certbot       do not request/renew a TLS certificate
    --force-nginx        overwrite the nginx site even if certbot has edited it
                         (certbot is re-run afterwards unless --skip-certbot)
    --non-interactive    never prompt: keeps defaults, skips the first-admin
                         bootstrap (run SET_RANK.sh yourself afterwards)
    --yes                auto-accept typed confirmations
    -h, --help           show this help

  What it installs:
    nginx · PostgreSQL ${PG_MAJOR} · Node ${NODE_MAJOR} (NodeSource) · pnpm ${PNPM_VERSION} (corepack)
    certbot · ufw (22/80/443) · fail2ban · git/curl/jq/build tools

  Safe to re-run at any time. It never deletes data.
EOF
}

BRANCH="${DEPLOY_BRANCH}"
CLI_BRANCH=""
CLI_DOMAIN=""
SKIP_CERTBOT=0
FORCE_NGINX=0
INTERACTIVE=1

while (($# > 0)); do
	case "$1" in
	-h | --help)
		usage
		exit 0
		;;
	--branch)
		CLI_BRANCH="${2:-}"
		[[ -n "${CLI_BRANCH}" ]] || die "--branch needs a value"
		BRANCH="${CLI_BRANCH}"
		shift 2
		;;
	--domain)
		CLI_DOMAIN="${2:-}"
		[[ -n "${CLI_DOMAIN}" ]] || die "--domain needs a value"
		DOMAIN="${CLI_DOMAIN}"
		shift 2
		;;
	--skip-certbot)
		SKIP_CERTBOT=1
		shift
		;;
	--force-nginx)
		FORCE_NGINX=1
		shift
		;;
	--non-interactive)
		INTERACTIVE=0
		MISTVALE_ASSUME_YES=1
		shift
		;;
	--yes)
		MISTVALE_ASSUME_YES=1
		shift
		;;
	*)
		usage >&2
		die "unknown argument: $1"
		;;
	esac
done

require_root
export DEBIAN_FRONTEND=noninteractive

# The ops log directory has to exist before the first log line is written.
mkdir -p "${LOG_DIR}"

step "Mistvale deployment — ${DOMAIN} (branch ${BRANCH})"
if [[ -r /etc/os-release ]]; then
	# shellcheck disable=SC1091  # os-release is a plain KEY=value file
	. /etc/os-release
	log "host: ${PRETTY_NAME:-unknown} · $(uname -m) · $(nproc) core(s) · $(free -m | awk 'NR==2{print $2}') MB RAM"
	if [[ "${ID:-}" != "ubuntu" ]]; then
		warn "this script targets Ubuntu 24.04 LTS — continuing on ${ID:-unknown} at your own risk"
	fi
fi

# =============================================================================
# 1. Base packages
# =============================================================================
step "1/16 System packages"
APT_PACKAGES=(
	ca-certificates curl gnupg git jq openssl rsync
	nginx
	ufw fail2ban
	certbot python3-certbot-nginx
	build-essential python3 # native module fallback (argon2)
	acl unzip zstd
)
log "apt-get update"
apt-get update -qq
log "installing: ${APT_PACKAGES[*]}"
apt-get install -y -qq --no-install-recommends "${APT_PACKAGES[@]}"
ok "base packages present"

# =============================================================================
# 2. PostgreSQL 16
# =============================================================================
step "2/16 PostgreSQL ${PG_MAJOR}"
if have_cmd psql && psql --version | grep -qE "\s${PG_MAJOR}\."; then
	skip "PostgreSQL ${PG_MAJOR} already installed"
else
	if apt-cache show "postgresql-${PG_MAJOR}" >/dev/null 2>&1; then
		apt-get install -y -qq --no-install-recommends "postgresql-${PG_MAJOR}" "postgresql-client-${PG_MAJOR}"
	else
		# Ubuntu 24.04 ships PG16 in its own archive; this is the escape hatch
		# for other releases.
		log "postgresql-${PG_MAJOR} not in the distro archive — adding the PGDG repository"
		install -d -m 0755 /usr/share/postgresql-common/pgdg
		curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc |
			gpg --dearmor -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg
		echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg] https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo "${VERSION_CODENAME}")-pgdg main" \
			>/etc/apt/sources.list.d/pgdg.list
		apt-get update -qq
		apt-get install -y -qq --no-install-recommends "postgresql-${PG_MAJOR}" "postgresql-client-${PG_MAJOR}"
	fi
	ok "PostgreSQL ${PG_MAJOR} installed"
fi

PG_CONF_DIR="/etc/postgresql/${PG_MAJOR}/main"
PG_DROPIN="${PG_CONF_DIR}/conf.d/mistvale.conf"
if [[ -d "${PG_CONF_DIR}" ]]; then
	ensure_dir "${PG_CONF_DIR}/conf.d" "postgres:postgres" 0755
	# Debian/Ubuntu enables conf.d by default; make sure of it before relying on it.
	if ! grep -qE "^\s*include_dir\s*=\s*'conf\.d'" "${PG_CONF_DIR}/postgresql.conf"; then
		log "enabling include_dir = 'conf.d' in postgresql.conf"
		printf "\n# added by Mistvale DEPLOY.sh\ninclude_dir = 'conf.d'\n" >>"${PG_CONF_DIR}/postgresql.conf"
	fi
	if render_template "${DEPLOY_ASSETS_DIR}/postgres-mistvale.conf" "${PG_DROPIN}"; then
		chown postgres:postgres "${PG_DROPIN}"
		log "tuning drop-in updated → ${PG_DROPIN}"
		systemctl restart postgresql
		ok "PostgreSQL restarted with the Mistvale tuning"
	else
		skip "PostgreSQL tuning already current"
	fi
else
	warn "expected ${PG_CONF_DIR} — tuning drop-in not installed"
fi
systemctl enable --now postgresql >/dev/null 2>&1 || true

# =============================================================================
# 3. Node.js 22 (NodeSource) + pnpm (corepack)
# =============================================================================
step "3/16 Node.js ${NODE_MAJOR} + pnpm"
NODE_OK=0
if have_cmd node && [[ "$(node -v | sed -E 's/^v([0-9]+).*/\1/')" == "${NODE_MAJOR}" ]]; then
	NODE_OK=1
fi
if ((NODE_OK == 1)); then
	skip "Node $(node -v) already installed"
else
	log "adding the NodeSource repository (node_${NODE_MAJOR}.x)"
	install -d -m 0755 /usr/share/keyrings
	curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key |
		gpg --dearmor --yes -o /usr/share/keyrings/nodesource.gpg
	chmod 0644 /usr/share/keyrings/nodesource.gpg
	echo "deb [signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
		>/etc/apt/sources.list.d/nodesource.list
	apt-get update -qq
	apt-get install -y -qq nodejs
	ok "Node $(node -v) installed"
fi
NODE_BIN="$(command -v node)"
export NODE_BIN

if have_cmd pnpm; then
	skip "pnpm $(pnpm --version 2>/dev/null || echo '?') already available"
else
	log "activating pnpm ${PNPM_VERSION} through corepack"
	corepack enable
	COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack prepare "pnpm@${PNPM_VERSION}" --activate
	ok "pnpm $(pnpm --version) ready"
fi

# =============================================================================
# 4. Swap + kernel tuning (build headroom on a 4 GB box)
# =============================================================================
step "4/16 Swap + sysctl"
if [[ -n "$(swapon --show --noheadings 2>/dev/null || true)" ]]; then
	skip "swap already active ($(swapon --show --noheadings | awk '{print $3}' | tr '\n' ' '))"
else
	log "creating a 2 GB swapfile (/swapfile)"
	if fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none; then
		chmod 0600 /swapfile
		mkswap -q /swapfile
		swapon /swapfile
		grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
		ok "2 GB swap active"
	else
		warn "could not create /swapfile — continuing without swap"
	fi
fi
SYSCTL_FILE=/etc/sysctl.d/60-mistvale.conf
cat >"${SYSCTL_FILE}" <<'EOF'
# Mistvale — 1 core / 4 GB VPS (DEPLOYMENT_OPERATIONS §3)
vm.swappiness = 10
vm.overcommit_memory = 0
net.core.somaxconn = 1024
EOF
sysctl -q --system >/dev/null 2>&1 || true
ok "sysctl applied (vm.swappiness=10)"

# =============================================================================
# 5. System user + directory layout
# =============================================================================
step "5/16 User + directories"
if id -u "${APP_USER}" >/dev/null 2>&1; then
	skip "user ${APP_USER} exists"
else
	useradd --system --create-home --home-dir "${APP_ROOT}" --shell /usr/sbin/nologin "${APP_USER}"
	ok "created system user ${APP_USER} (home ${APP_ROOT})"
fi

ensure_dir "${APP_ROOT}" "${APP_USER}:${APP_GROUP}" 0755
ensure_dir "${RELEASES_DIR}" "${APP_USER}:${APP_GROUP}" 0755
ensure_dir "$(dirname -- "${UPLOADS}")" "${APP_USER}:${APP_GROUP}" 0755
ensure_dir "${UPLOADS}" "${APP_USER}:${APP_GROUP}" 0755
ensure_dir "${LOG_DIR}" "${APP_USER}:${APP_GROUP}" 0755
ensure_dir "${BACKUP_DIR}" "${APP_USER}:${APP_GROUP}" 0750
ok "directory layout ready"

# Log rotation for the ops logs written by these scripts (the server rotates its
# own pino log through pino-roll).
cat >/etc/logrotate.d/mistvale <<EOF
${LOG_DIR}/*.log {
    weekly
    rotate 8
    missingok
    notifempty
    compress
    delaycompress
    copytruncate
    su ${APP_USER} ${APP_GROUP}
    create 0640 ${APP_USER} ${APP_GROUP}
}
EOF

# =============================================================================
# 6. Environment file
# =============================================================================
step "6/16 ${ENV_FILE}"
if [[ -f "${ENV_FILE}" ]]; then
	skip "env file exists — keeping the existing secrets"
else
	if ((INTERACTIVE == 1)); then
		DOMAIN="$(ask "Public domain" "${DOMAIN}")"
	fi
	DB_PASSWORD="$(gen_hex 24)" # hex → always URL-safe inside DATABASE_URL
	PEPPER="$(gen_secret 32)"   # alphanumeric → safe unquoted for systemd
	# Create with the final permissions BEFORE any secret is written to it.
	install -m 0640 -o root -g root /dev/null "${ENV_FILE}"
	# Without TLS the site is served over plain HTTP, and a Secure cookie would
	# be dropped by the browser — so PUBLIC_ORIGIN follows the actual scheme and
	# is upgraded to https:// after certbot succeeds (step 15).
	INITIAL_ORIGIN="https://${DOMAIN}"
	((SKIP_CERTBOT == 1)) && INITIAL_ORIGIN="http://${DOMAIN}"
	cat >"${ENV_FILE}" <<EOF
# Mistvale runtime environment — generated by DEPLOY.sh on $(date -u +'%Y-%m-%dT%H:%M:%SZ')
# Every variable is documented in the repo's .env.example. Plain KEY=value only:
# this file is read by systemd (EnvironmentFile=), by bash (scripts/lib/common.sh)
# and by the server (apps/server/src/lib/config.ts).

# --- server runtime ---------------------------------------------------------
NODE_ENV=production
HOST=${HOST}
PORT=${PORT}
PUBLIC_ORIGIN=${INITIAL_ORIGIN}
TZ=UTC

DATABASE_URL=postgres://${DB_USER}:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME}
DATABASE_POOL_MAX=10

SESSION_PEPPER=${PEPPER}
SESSION_TTL_DAYS=30

LOG_LEVEL=info
LOG_PRETTY=false
UPLOADS_DIR=${UPLOADS}

RESET_TIMEZONE=Europe/Berlin
RESET_HOUR=4
RATE_LIMIT_ENABLED=true

# --- ops / deployment (scripts only) ----------------------------------------
DOMAIN=${DOMAIN}
LOG_DIR=${LOG_DIR}
# Optional admin session token for STATUS.sh's full health payload.
OPS_SESSION_TOKEN=
# Optional nginx allowlist for /admin — space separated IPs/CIDRs.
ADMIN_ALLOWLIST=
CERTBOT_EMAIL=${CERTBOT_EMAIL:-}

REPO_URL=${REPO_URL}
ADMIN_REPO_URL=${ADMIN_REPO_URL}
DEPLOY_BRANCH=${BRANCH}
KEEP_RELEASES=${KEEP_RELEASES}

BACKUP_DIR=${BACKUP_DIR}
BACKUP_RETAIN_DAILY=14
BACKUP_RETAIN_WEEKLY=8
BACKUP_WEEKLY_DOW=7
RCLONE_REMOTE=
RCLONE_CONFIG=
EOF
	chown "${APP_USER}:${APP_GROUP}" "${ENV_FILE}"
	chmod 0640 "${ENV_FILE}"
	ok "generated ${ENV_FILE} (db password + session pepper created with openssl)"
fi

# Load what we just wrote (or what was already there). Command-line flags win
# over the env file, otherwise the file's DEPLOY_BRANCH is authoritative.
load_env --required
[[ -n "${CLI_DOMAIN}" ]] && DOMAIN="${CLI_DOMAIN}"
if [[ -n "${CLI_BRANCH}" ]]; then
	BRANCH="${CLI_BRANCH}"
elif [[ -n "${DEPLOY_BRANCH:-}" ]]; then
	BRANCH="${DEPLOY_BRANCH}"
fi
require_env DATABASE_URL SESSION_PEPPER
DB_PASSWORD="$(printf '%s' "${DATABASE_URL}" | sed -E 's#^[a-z]+://[^:]+:([^@]*)@.*$#\1#')"
[[ -n "${DB_PASSWORD}" && "${DB_PASSWORD}" != "${DATABASE_URL}" ]] ||
	die "could not read the database password out of DATABASE_URL — fix ${ENV_FILE}"

# =============================================================================
# 7. Database role + database
# =============================================================================
step "7/16 PostgreSQL role + database"
psql_super() { (cd / && sudo -u postgres psql -X -v ON_ERROR_STOP=1 -q --no-psqlrc -d postgres "$@"); }

# psql's :"ident" quotes an identifier and :'literal' quotes a string, so the
# generated password never has to be escaped by hand.
if [[ "$(psql_super -tAc "SELECT 1 FROM pg_roles WHERE rolname = '${DB_USER}'")" == "1" ]]; then
	skip "role ${DB_USER} exists — syncing its password with ${ENV_FILE}"
	psql_super -v role="${DB_USER}" -v pw="${DB_PASSWORD}" <<'SQL'
ALTER ROLE :"role" WITH LOGIN PASSWORD :'pw';
SQL
else
	psql_super -v role="${DB_USER}" -v pw="${DB_PASSWORD}" <<'SQL'
CREATE ROLE :"role" WITH LOGIN PASSWORD :'pw';
SQL
	ok "created role ${DB_USER}"
fi

if [[ "$(psql_super -tAc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'")" == "1" ]]; then
	skip "database ${DB_NAME} exists"
else
	psql_super -v db="${DB_NAME}" -v owner="${DB_USER}" <<'SQL'
CREATE DATABASE :"db" OWNER :"owner";
SQL
	ok "created database ${DB_NAME} (owner ${DB_USER})"
fi

# pg_stat_statements is preloaded by the tuning drop-in but is not a trusted
# extension, so only a superuser can create it. citext (trusted) is left to the
# migrations, where it belongs.
(cd / && sudo -u postgres psql -X -q --no-psqlrc -d "${DB_NAME}" \
	-c 'CREATE EXTENSION IF NOT EXISTS pg_stat_statements' >/dev/null 2>&1) ||
	warn "could not create pg_stat_statements (non-fatal)"

db_reachable || die "cannot connect as ${DB_USER} — check ${ENV_FILE} and pg_hba.conf"
ok "database reachable as ${DB_USER}"

# =============================================================================
# 8. Repositories
# =============================================================================
step "8/16 Repositories"
clone_or_report() { # clone_or_report <url> <dir> <label>
	local url="$1" dir="$2" label="$3"
	if [[ -d "${dir}/.git" ]]; then
		skip "${label} already cloned at ${dir}"
		return 0
	fi
	log "cloning ${label} (${BRANCH}) → ${dir}"
	# git must own the result; clone as the app user, not as root.
	retry 5 run_as_app_user git clone --quiet --branch "${BRANCH}" "${url}" "${dir}" ||
		die "could not clone ${label} from ${url} (branch ${BRANCH})"
	ok "${label} cloned @ $(repo_sha "${dir}")"
}
clone_or_report "${REPO_URL}" "${REPO_DIR}" "game repo"
clone_or_report "${ADMIN_REPO_URL}" "${ADMIN_REPO_DIR}" "admin repo"

# From here on prefer the freshly deployed copies of the scripts, so a re-run of
# an old DEPLOY.sh still drives the current tooling.
DEPLOYED_SCRIPTS="${SCRIPTS_DIR}"
[[ -x "${REPO_DIR}/scripts/UPDATE.sh" ]] && DEPLOYED_SCRIPTS="${REPO_DIR}/scripts"
log "using ops scripts from ${DEPLOYED_SCRIPTS}"

# =============================================================================
# 9. sudoers: let the app user manage its own service
# =============================================================================
step "9/16 sudoers drop-in"
SUDOERS_FILE="/etc/sudoers.d/${APP_USER}"
SYSTEMCTL_BIN="$(command -v systemctl)"
cat >"${SUDOERS_FILE}.tmp" <<EOF
# Mistvale: the documented release flow is
#   sudo -u ${APP_USER} ${REPO_DIR}/scripts/UPDATE.sh
# which has to be able to restart its own service (and nothing else).
${APP_USER} ALL=(root) NOPASSWD: ${SYSTEMCTL_BIN} restart ${SERVICE}, \\
    ${SYSTEMCTL_BIN} start ${SERVICE}, \\
    ${SYSTEMCTL_BIN} stop ${SERVICE}, \\
    ${SYSTEMCTL_BIN} enable ${SERVICE}, \\
    ${SYSTEMCTL_BIN} reload-or-restart ${SERVICE}
EOF
chmod 0440 "${SUDOERS_FILE}.tmp"
if visudo -cqf "${SUDOERS_FILE}.tmp"; then
	mv -f "${SUDOERS_FILE}.tmp" "${SUDOERS_FILE}"
	ok "sudoers entry installed (${SUDOERS_FILE})"
else
	rm -f "${SUDOERS_FILE}.tmp"
	warn "generated sudoers entry was rejected by visudo — UPDATE.sh will need sudo/root"
fi

# =============================================================================
# 10. systemd unit
# =============================================================================
step "10/16 systemd unit"
UNIT_PATH="/etc/systemd/system/${SERVICE}.service"
if render_template "${DEPLOY_ASSETS_DIR}/mistvale-server.service" "${UNIT_PATH}"; then
	systemctl daemon-reload
	ok "installed ${UNIT_PATH}"
else
	skip "systemd unit already current"
fi
systemctl enable "${SERVICE}" >/dev/null 2>&1 || warn "could not enable ${SERVICE} yet"

# =============================================================================
# 11. nginx site
# =============================================================================
step "11/16 nginx"
NGINX_AVAILABLE="/etc/nginx/sites-available/mistvale"
NGINX_ENABLED="/etc/nginx/sites-enabled/mistvale"
ensure_dir /etc/nginx/snippets "" 0755

# Brotli is optional; its directives only parse when the module is loaded.
if apt-get install -y -qq --no-install-recommends libnginx-mod-http-brotli >/dev/null 2>&1; then
	log "brotli module installed"
fi
if compgen -G "/etc/nginx/modules-enabled/*brotli*" >/dev/null || nginx -V 2>&1 | grep -q brotli; then
	cat >/etc/nginx/snippets/mistvale-brotli.conf <<'EOF'
# Generated by DEPLOY.sh — only present when the brotli module is available.
brotli on;
brotli_comp_level 5;
brotli_min_length 512;
brotli_static on;
brotli_types application/javascript application/json application/manifest+json
             application/wasm application/xml image/svg+xml
             text/css text/javascript text/plain text/xml;
EOF
	ok "brotli enabled"
else
	rm -f /etc/nginx/snippets/mistvale-brotli.conf
	log "brotli module unavailable — gzip only"
fi

# HTTP/2: `http2 on;` exists from nginx 1.25.1 only. Ubuntu 24.04 ships 1.24,
# where HTTP/2 is a `listen` parameter instead — that case is handled after
# certbot has written the TLS listen line (see enable_http2_legacy below).
NGINX_VERSION="$(nginx -v 2>&1 | sed -E 's#^.*/([0-9.]+).*$#\1#')"
nginx_at_least_1251() {
	local major minor patch
	IFS='.' read -r major minor patch <<<"${NGINX_VERSION:-0.0.0}"
	((major > 1)) && return 0
	((major == 1 && minor > 25)) && return 0
	((major == 1 && minor == 25 && ${patch:-0} >= 1)) && return 0
	return 1
}
if nginx_at_least_1251; then
	printf '# Generated by DEPLOY.sh — nginx %s supports the http2 directive.\nhttp2 on;\n' \
		"${NGINX_VERSION}" >/etc/nginx/snippets/mistvale-http2.conf
	log "HTTP/2 enabled via snippet (nginx ${NGINX_VERSION})"
else
	rm -f /etc/nginx/snippets/mistvale-http2.conf
	log "nginx ${NGINX_VERSION}: HTTP/2 will be set on the TLS listen line"
fi

# enable_http2_legacy — nginx < 1.25.1 only: add the `http2` parameter to every
# TLS listen line certbot wrote. The sed skips lines that already carry it, so
# repeated DEPLOY.sh runs cannot produce `http2 http2;`. No-op without TLS.
enable_http2_legacy() {
	nginx_at_least_1251 && return 0
	[[ -f "${NGINX_AVAILABLE}" ]] || return 0
	grep -qE '^[[:space:]]*listen[[:space:]]+.*443 ssl' "${NGINX_AVAILABLE}" || return 0
	grep -qE '^[[:space:]]*listen[[:space:]]+.*443 ssl.*http2' "${NGINX_AVAILABLE}" && return 0

	sed -i -E '/443 ssl/{/http2/!s/^([[:space:]]*listen[[:space:]]+[^;]*);/\1 http2;/}' "${NGINX_AVAILABLE}"
	if nginx -t >/dev/null 2>&1; then
		systemctl reload nginx
		ok "HTTP/2 enabled on the TLS listeners (nginx ${NGINX_VERSION})"
	else
		warn "adding http2 to the listen lines broke the config — reverting"
		sed -i -E 's/^([[:space:]]*listen[[:space:]]+[^;]*) http2;/\1;/' "${NGINX_AVAILABLE}"
		nginx -t >/dev/null 2>&1 || warn "nginx config is still invalid — check ${NGINX_AVAILABLE}"
	fi
}

# Optional /admin IP allowlist (USER_QUESTIONS O1).
ALLOWLIST_SNIPPET=/etc/nginx/snippets/mistvale-admin-allowlist.conf
if [[ -n "${ADMIN_ALLOWLIST:-}" ]]; then
	{
		echo "# Generated by DEPLOY.sh from ADMIN_ALLOWLIST in ${ENV_FILE}"
		for cidr in ${ADMIN_ALLOWLIST//,/ }; do
			echo "allow ${cidr};"
		done
		echo "deny all;"
	} >"${ALLOWLIST_SNIPPET}"
	ok "/admin restricted to: ${ADMIN_ALLOWLIST}"
else
	rm -f "${ALLOWLIST_SNIPPET}"
	log "/admin has no IP allowlist (set ADMIN_ALLOWLIST in ${ENV_FILE} to add one)"
fi

CERTBOT_MANAGED=0
if [[ -f "${NGINX_AVAILABLE}" ]] && grep -q "managed by Certbot" "${NGINX_AVAILABLE}"; then
	CERTBOT_MANAGED=1
fi

INSTALL_SITE=1
if ((CERTBOT_MANAGED == 1)) && ((FORCE_NGINX == 0)); then
	INSTALL_SITE=0
	skip "nginx site is certbot-managed — left untouched (use --force-nginx to re-render, certbot then re-applies TLS)"
fi

if ((INSTALL_SITE == 1)); then
	if [[ -f "${NGINX_AVAILABLE}" ]]; then
		cp -a "${NGINX_AVAILABLE}" "${NGINX_AVAILABLE}.bak.$(ts_utc)"
	fi
	if render_template "${DEPLOY_ASSETS_DIR}/nginx-mistvale.conf" "${NGINX_AVAILABLE}"; then
		ok "rendered ${NGINX_AVAILABLE} (domain ${DOMAIN})"
	else
		skip "nginx site already current"
	fi
fi

ln -sfn "${NGINX_AVAILABLE}" "${NGINX_ENABLED}"
if [[ -L /etc/nginx/sites-enabled/default ]]; then
	rm -f /etc/nginx/sites-enabled/default
	log "disabled the default nginx site"
fi

# The client/admin roots do not exist until UPDATE.sh --initial creates the
# first release; nginx starts happily without them (requests just 404 until
# step 14 lands the build), so nothing is pre-created here — a placeholder
# directory would only get in the way of the release symlink swap.
NGINX_TEST_LOG="$(mktemp)"
if ! nginx -t >"${NGINX_TEST_LOG}" 2>&1; then
	# Not every VPS has IPv6. The template listens on both stacks; drop the v6
	# listener when the kernel/host cannot provide it, rather than failing.
	if grep -qiE 'Address family not supported|socket\(\) \[::\]' "${NGINX_TEST_LOG}"; then
		warn "this host has no IPv6 — disabling the IPv6 listener in ${NGINX_AVAILABLE}"
		sed -i -E 's|^(\s*)(listen \[::\]:80;)|\1# \2 # disabled by DEPLOY.sh: no IPv6 on this host|' \
			"${NGINX_AVAILABLE}"
		nginx -t >"${NGINX_TEST_LOG}" 2>&1 || {
			cat "${NGINX_TEST_LOG}" >&2
			rm -f "${NGINX_TEST_LOG}"
			die "nginx configuration test failed — see the output above"
		}
	else
		cat "${NGINX_TEST_LOG}" >&2
		rm -f "${NGINX_TEST_LOG}"
		die "nginx configuration test failed — see the output above"
	fi
fi
rm -f "${NGINX_TEST_LOG}"
systemctl enable nginx >/dev/null 2>&1 || true
systemctl reload-or-restart nginx
ok "nginx configuration valid and loaded"

# =============================================================================
# 12. Firewall + fail2ban
# =============================================================================
step "12/16 Firewall + fail2ban"
if have_cmd ufw; then
	ufw allow 22/tcp >/dev/null
	ufw allow 80/tcp >/dev/null
	ufw allow 443/tcp >/dev/null
	if ufw status | head -n1 | grep -q inactive; then
		# --force skips the "this may disrupt ssh" prompt; 22 is already allowed.
		ufw --force enable >/dev/null
		ok "ufw enabled (22/80/443 only)"
	else
		skip "ufw already active (22/80/443 allowed)"
	fi
fi

cat >/etc/fail2ban/jail.d/mistvale.local <<'EOF'
# Mistvale — generated by DEPLOY.sh (DEPLOYMENT_OPERATIONS §1)
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5

# Ubuntu 24.04 logs sshd to the journal only — the systemd backend is required.
[sshd]
enabled = true
backend = systemd

# Bans clients that keep tripping the nginx rate-limit zones on /api/auth/*.
[nginx-limit-req]
enabled  = true
backend  = auto
port     = http,https
logpath  = /var/log/nginx/mistvale.error.log
maxretry = 20
findtime = 5m
bantime  = 1h
EOF
systemctl enable fail2ban >/dev/null 2>&1 || true
systemctl restart fail2ban || warn "fail2ban did not restart cleanly"
ok "fail2ban configured (sshd + nginx-limit-req)"

# =============================================================================
# 13. Backup cron (03:30, before the 04:00 daily reset)
# =============================================================================
step "13/16 Backup cron"
cat >/etc/cron.d/mistvale-backup <<EOF
# Mistvale nightly backup — DEPLOYMENT_OPERATIONS §2
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
MAILTO=""
30 3 * * * ${APP_USER} ${REPO_DIR}/scripts/BACKUP.sh --quiet
EOF
chmod 0644 /etc/cron.d/mistvale-backup
ok "nightly backup scheduled at 03:30 (runs as ${APP_USER})"

# =============================================================================
# 14. Build, migrate, seed, activate, start  →  UPDATE.sh --initial
# =============================================================================
step "14/16 First build + database migration + seed"
if [[ -L "${CURRENT_LINK}" ]]; then
	log "a release already exists ($(basename -- "$(link_target "${CURRENT_LINK}")")) — running a normal update"
	"${DEPLOYED_SCRIPTS}/UPDATE.sh" --branch "${BRANCH}" ||
		die "update failed — see the output above"
else
	"${DEPLOYED_SCRIPTS}/UPDATE.sh" --initial --branch "${BRANCH}" ||
		die "initial build failed — fix the cause and re-run DEPLOY.sh (it will resume here)"
fi
ok "server built, migrated, seeded and running"

# =============================================================================
# 15. TLS
# =============================================================================
step "15/16 TLS certificate"

# Session cookies only get the Secure flag when PUBLIC_ORIGIN is an https:// URL
# (apps/server/src/lib/config.ts). Once TLS is live the value must follow, and
# the server has to be restarted to pick it up.
promote_public_origin_to_https() {
	local current
	current="$(sed -n 's/^PUBLIC_ORIGIN=//p' "${ENV_FILE}" | head -n1)"
	[[ "${current}" == "http://"* ]] || return 0
	log "TLS is live — switching PUBLIC_ORIGIN to https:// (Secure cookies)"
	sed -i -E "s|^PUBLIC_ORIGIN=http://|PUBLIC_ORIGIN=https://|" "${ENV_FILE}"
	if svc_active "${SERVICE}"; then
		systemctl restart "${SERVICE}"
		health_check "${HEALTH_LITE_URL}" 15 2 >/dev/null ||
			warn "${SERVICE} did not answer after the PUBLIC_ORIGIN change — check LOGS.sh -e"
	fi
}

if ((SKIP_CERTBOT == 1)); then
	skip "--skip-certbot: no certificate requested (the site is HTTP-only for now)"
elif [[ -d "/etc/letsencrypt/live/${DOMAIN}" ]]; then
	skip "certificate for ${DOMAIN} already exists (certbot's timer renews it)"
	systemctl enable --now certbot.timer >/dev/null 2>&1 || true
	enable_http2_legacy
	promote_public_origin_to_https
else
	CERTBOT_ARGS=(--nginx -d "${DOMAIN}" --non-interactive --agree-tos --redirect)
	if [[ -n "${CERTBOT_EMAIL:-}" ]]; then
		CERTBOT_ARGS+=(--email "${CERTBOT_EMAIL}")
	else
		# The project keeps no e-mail addresses (CLAUDE.md); expiry notices are
		# covered by STATUS.sh reporting the days left instead.
		CERTBOT_ARGS+=(--register-unsafely-without-email)
	fi
	log "requesting a certificate for ${DOMAIN}"
	if certbot "${CERTBOT_ARGS[@]}"; then
		systemctl enable --now certbot.timer >/dev/null 2>&1 || true
		enable_http2_legacy
		promote_public_origin_to_https
		ok "TLS active for https://${DOMAIN}"
	else
		warn "certbot failed — the site stays on HTTP."
		warn "usual cause: DNS for ${DOMAIN} does not point at this box yet."
		warn "retry later with: sudo certbot --nginx -d ${DOMAIN}"
	fi
fi

# =============================================================================
# 16. First admin account
# =============================================================================
step "16/16 First admin account"
ADMIN_COUNT="$(db_scalar "SELECT count(*) FROM accounts WHERE rank = 'admin'")"
if [[ "${ADMIN_COUNT}" =~ ^[1-9][0-9]*$ ]]; then
	skip "${ADMIN_COUNT} admin account(s) already exist"
elif ((INTERACTIVE == 0)); then
	warn "--non-interactive: no admin account created."
	warn "register an account in the game, then run: sudo -u ${APP_USER} ${REPO_DIR}/scripts/SET_RANK.sh <accountName> admin"
else
	log "the Admin Panel (https://${DOMAIN}/admin) needs one account with rank 'admin'."
	ACCOUNT_NAME="$(ask "Admin account name (3-16 chars, letters/digits/_-)" "")"
	if [[ -z "${ACCOUNT_NAME}" ]]; then
		warn "skipped — run SET_RANK.sh later"
	else
		# :'n' is quoted by psql itself — no hand-rolled escaping of the name.
		# (Interpolation only works for stdin/-f input, hence the heredoc.)
		EXISTS="$(
			psql -X -tA --no-psqlrc -d "${DATABASE_URL}" \
				-v n="${ACCOUNT_NAME}" 2>/dev/null <<'SQL' || true
SELECT 1 FROM accounts WHERE account_name = :'n';
SQL
		)"
		if [[ "${EXISTS}" != "1" ]]; then
			log "no such account yet — creating it through the game's register endpoint"
			PROFILE_NAME="$(ask "Profile name (in-game display name)" "${ACCOUNT_NAME}")"
			PW1="$(ask_secret "Password")"
			PW2="$(ask_secret "Password (again)")"
			if [[ -z "${PW1}" || "${PW1}" != "${PW2}" ]]; then
				die "passwords did not match — nothing created; re-run DEPLOY.sh or register in the game and use SET_RANK.sh"
			fi
			REG_BODY="$(jq -n --arg a "${ACCOUNT_NAME}" --arg p "${PROFILE_NAME}" --arg w "${PW1}" \
				'{accountName:$a, profileName:$p, password:$w}')"
			REG_OUT="$(curl -fsS -X POST -H 'Content-Type: application/json' \
				--data "${REG_BODY}" "http://${HOST}:${PORT}/api/auth/register" 2>&1 || true)"
			unset PW1 PW2 REG_BODY
			if [[ -z "${REG_OUT}" ]] || ! printf '%s' "${REG_OUT}" | jq -e '.ok == true' >/dev/null 2>&1; then
				err "registration through /api/auth/register did not succeed:"
				printf '  %s\n' "${REG_OUT:-<no response>}" >&2
				die "register the account at https://${DOMAIN} and then run: sudo -u ${APP_USER} ${REPO_DIR}/scripts/SET_RANK.sh ${ACCOUNT_NAME} admin"
			fi
			ok "account '${ACCOUNT_NAME}' created"
		fi
		"${DEPLOYED_SCRIPTS}/SET_RANK.sh" --yes "${ACCOUNT_NAME}" admin ||
			die "could not set rank — run SET_RANK.sh manually"
	fi
fi

# =============================================================================
# Done
# =============================================================================
hr
ok "Mistvale is deployed"
printf '  game        : https://%s\n' "${DOMAIN}"
printf '  admin panel : https://%s/admin\n' "${DOMAIN}"
printf '  env file    : %s\n' "${ENV_FILE}"
printf '  update with : sudo -u %s %s/scripts/UPDATE.sh\n' "${APP_USER}" "${REPO_DIR}"
printf '  status      : %s/scripts/STATUS.sh\n' "${REPO_DIR}"
hr

"${DEPLOYED_SCRIPTS}/STATUS.sh" || true
