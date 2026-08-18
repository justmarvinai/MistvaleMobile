#!/usr/bin/env bash
# =============================================================================
# CHECK_DEPLOY.sh — the deploy assets, checked without a server
# =============================================================================
# The operations scripts and the nginx site are the least-exercised code in the
# repository: nothing runs them until a deploy, and a deploy is exactly when a
# typo costs the most. This is the part of the drill that can be automated —
# every script parsed and linted, and the nginx site rendered and handed to
# nginx's own parser.
#
# What it deliberately does not do is deploy anything. It touches no service, no
# database and nothing outside a temporary directory, so it is safe to run on a
# laptop, in CI, or on the box itself before UPDATE.sh.
#
# Usage:  scripts/CHECK_DEPLOY.sh
# =============================================================================
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

FAILURES=0

fail() {
	warn "$*"
	FAILURES=$((FAILURES + 1))
}

# ── Every script parses ──────────────────────────────────────────────────────
step "Shell syntax"
for script in "${SCRIPT_DIR}"/*.sh "${SCRIPT_DIR}"/lib/*.sh; do
	if bash -n "${script}"; then
		ok "$(basename -- "${script}")"
	else
		fail "$(basename -- "${script}") does not parse"
	fi
done

# ── …and passes shellcheck ───────────────────────────────────────────────────
step "Shellcheck"
if have_cmd shellcheck; then
	# -x follows `source` directives. Without it every helper defined in
	# lib/common.sh reads as an unused variable at its assignment site, and a
	# lint with known noise is a lint nobody reads.
	if (cd "${SCRIPT_DIR}" && shellcheck -S warning -x ./*.sh lib/*.sh); then
		ok "no warnings"
	else
		fail "shellcheck reported problems"
	fi
else
	warn "shellcheck not installed — skipping (apt install shellcheck)"
fi

# ── The nginx site renders and parses ────────────────────────────────────────
step "nginx site"
if have_cmd nginx; then
	WORK="$(mktemp -d)"
	# shellcheck disable=SC2064  # expand WORK now: it is what we mean to remove
	trap "rm -rf -- '${WORK}'" EXIT
	mkdir -p "${WORK}"/{sites,logs,body,srv,uploads}

	# Rendered with plausible values rather than the real ones: what is being
	# checked is the shape of the file, not the box it will land on.
	sed \
		-e "s|__DOMAIN__|example.invalid|g" \
		-e "s|__APP_ROOT__|${WORK}/srv|g" \
		-e "s|__UPLOADS__|${WORK}/uploads|g" \
		-e "s|__HOST__|127.0.0.1|g" \
		-e "s|__PORT__|3001|g" \
		"${SCRIPT_DIR}/deploy-assets/nginx-mistvale.conf" \
		| grep -v 'listen \[::\]' >"${WORK}/sites/mistvale.conf"
	# The IPv6 listener is dropped for the check alone: a container without IPv6
	# fails to *bind* it, which nginx reports as a config error even though the
	# config is fine. Everything else is verbatim.

	cat >"${WORK}/main.conf" <<-CONF
		worker_processes 1;
		error_log ${WORK}/logs/error.log warn;
		pid ${WORK}/nginx.pid;
		events { worker_connections 64; }
		http {
		  include /etc/nginx/mime.types;
		  default_type application/octet-stream;
		  access_log ${WORK}/logs/access.log;
		  client_body_temp_path ${WORK}/body;
		  proxy_temp_path ${WORK}/body;
		  fastcgi_temp_path ${WORK}/body;
		  uwsgi_temp_path ${WORK}/body;
		  scgi_temp_path ${WORK}/body;
		  include ${WORK}/sites/*.conf;
		}
	CONF

	# Captured rather than piped: `grep -q` closes the pipe on its first match,
	# nginx takes SIGPIPE, and `pipefail` then reports a successful check as a
	# failure. The output is wanted in full anyway when something is wrong.
	NGINX_OUT="$(nginx -t -c "${WORK}/main.conf" 2>&1 || true)"
	if grep -q 'syntax is ok' <<<"${NGINX_OUT}"; then
		ok "nginx accepts the rendered site"
	else
		printf '%s\n' "${NGINX_OUT}"
		fail "the rendered nginx site does not parse"
	fi
else
	warn "nginx not installed — skipping (apt install nginx-light)"
fi

# ── Every placeholder the templates use is one render_template fills ─────────
step "Template placeholders"
KNOWN="$(grep -o -- '-e "s|__[A-Z_]*__|' "${SCRIPT_DIR}/lib/common.sh" | grep -o '__[A-Z_]*__' | sort -u)"
for template in "${SCRIPT_DIR}"/deploy-assets/*; do
	[[ -f "${template}" ]] || continue
	# Comments explain the mechanism using a literal `__TOKEN__`, which is not one.
	USED="$(grep -o '__[A-Z_]*__' "${template}" | sort -u | grep -v '^__TOKEN__$' || true)"
	for placeholder in ${USED}; do
		if ! grep -qx -- "${placeholder}" <<<"${KNOWN}"; then
			fail "$(basename -- "${template}") uses ${placeholder}, which render_template does not substitute"
		fi
	done
done
[[ "${FAILURES}" -eq 0 ]] && ok "every placeholder is substituted"

hr
if [[ "${FAILURES}" -eq 0 ]]; then
	ok "Deploy assets look sound."
	exit 0
fi
die "${FAILURES} problem(s) found in the deploy assets."
