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

# ── …and routes the way the comments at its top say it does ──────────────────
# "It parses" is a much weaker claim than anybody reads it as. The SPA fallback
# answered every missing file with index.html and a 200 for ten phases, through a
# config that parsed perfectly every time: a sprite dropped by a half-finished
# asset sync came back as an HTML document, and nothing anywhere said "missing".
# So the site is actually started here, against a tree of fixture files, and
# asked. Nothing outside the temporary directory is touched and nothing listens
# on a privileged port.
step "nginx routing"
if have_cmd nginx && have_cmd curl; then
	mkdir -p "${WORK}"/srv/client/{assets,sprites/champions/known/idle,icons} "${WORK}"/srv/admin/assets

	printf '<!doctype html><title>game</title>' >"${WORK}/srv/client/index.html"
	printf '<!doctype html><title>admin</title>' >"${WORK}/srv/admin/index.html"
	printf 'export const a = 1;' >"${WORK}/srv/client/assets/index-abc123.js"
	printf 'export const b = 2;' >"${WORK}/srv/admin/assets/admin-def456.js"
	printf '{"champions":{}}' >"${WORK}/srv/client/sprites/manifest.json"
	printf 'PNG' >"${WORK}/srv/client/sprites/champions/known/idle/frame_000.png"
	printf '<svg xmlns="http://www.w3.org/2000/svg"></svg>' >"${WORK}/srv/client/icons/icons.svg"
	printf 'self.addEventListener("fetch", () => {});' >"${WORK}/srv/client/sw.js"
	printf '{"name":"Mistvale"}' >"${WORK}/srv/client/manifest.webmanifest"
	printf 'PNG' >"${WORK}/srv/client/icon-192.png"
	# The one file that must never be served, however it is asked for.
	printf 'DATABASE_URL=postgres://secret' >"${WORK}/srv/client/.env"

	# A free loopback port, so the check never needs root and never collides with
	# a real nginx on the same machine.
	PROBE_PORT=""
	for candidate in 18080 18081 18082 18083 18084; do
		# A refused connection is a free port. The probe runs in a subshell so the
		# descriptor it opens on a *busy* one closes with it.
		if ! (exec 3<>"/dev/tcp/127.0.0.1/${candidate}") 2>/dev/null; then
			PROBE_PORT="${candidate}"
			break
		fi
	done

	if [[ -z "${PROBE_PORT}" ]]; then
		warn "no free loopback port in 18080-18084 — skipping the routing probe"
	else
		sed -e "s|^    listen 80;|    listen 127.0.0.1:${PROBE_PORT};|" \
			"${WORK}/sites/mistvale.conf" >"${WORK}/sites/mistvale.conf.probe"
		mv "${WORK}/sites/mistvale.conf.probe" "${WORK}/sites/mistvale.conf"

		# nginx drops its workers to the `user` directive's account when it starts
		# as root, and that account cannot read a 0700 mktemp directory — every
		# probe would come back 403 and read as a routing failure. Only meaningful
		# as root; nginx ignores it (with a warning) otherwise, which is why it is
		# only written when it applies.
		if [[ "${EUID}" -eq 0 ]]; then
			sed -i '1i user root;' "${WORK}/main.conf"
		fi

		if nginx -c "${WORK}/main.conf" -p "${WORK}" 2>>"${WORK}/logs/start.log"; then
			# `-s quit` drains rather than kills, so the run leaves no listener behind
			# even when a probe below fails and the script exits early.
			# shellcheck disable=SC2064  # expand now: this WORK is the one to stop
			trap "nginx -c '${WORK}/main.conf' -p '${WORK}' -s quit 2>/dev/null || true; rm -rf -- '${WORK}'" EXIT

			probe() { # path, expected status, what it proves
				local path="$1" want="$2" why="$3" got
				got="$(curl -sS -o /dev/null -w '%{http_code}' \
					"http://127.0.0.1:${PROBE_PORT}${path}" 2>/dev/null || echo 000)"
				if [[ "${got}" == "${want}" ]]; then
					ok "${path} → ${got}  (${why})"
				else
					fail "${path} → ${got}, expected ${want}  (${why})"
				fi
			}

			# A route is anything a player could have in the address bar. The game
			# client has no URL routing at all, so this is really just "/" — but the
			# fallback has to survive a bookmark of anything.
			probe /                       200 "the game"
			probe /some/deep/route        200 "a route still falls back to the shell"
			probe /admin/                 200 "the admin SPA"
			probe /admin/anything         200 "the admin SPA falls back too"

			# Files that exist.
			probe /assets/index-abc123.js 200 "a hashed bundle"
			probe /admin/assets/admin-def456.js 200 "a hashed admin bundle"
			probe /sprites/manifest.json  200 "the sprite manifest"
			probe /sprites/champions/known/idle/frame_000.png 200 "a frame that is there"
			probe /icons/icons.svg        200 "the icon sheet"
			probe /sw.js                  200 "the service worker"
			probe /manifest.webmanifest   200 "the PWA manifest"
			probe /icon-192.png           200 "a home-screen icon"

			# …and the whole point: files that do not.
			probe /assets/missing.js      404 "a hashed bundle that is gone"
			probe /sprites/champions/nobody/idle/frame_000.png 404 "a missing frame is missing"
			probe /icons/missing.json     404 "a missing icon manifest"
			probe /uploads/missing.png    404 "a missing upload"
			probe /fonts/missing.woff2    404 "a missing font"
			probe /whatever.png           404 "anything naming a file is a file"
			probe /deep/path/data.json    404 "…at any depth"
			probe /admin/assets/missing.js 404 "and under the admin SPA"

			# Never, under any rule above.
			probe /.env                   403 "a dotfile is refused, not served"
		else
			printf '%s\n' "$(cat "${WORK}/logs/start.log" 2>/dev/null)"
			fail "nginx would not start against the rendered site"
		fi
	fi
else
	warn "nginx or curl not installed — skipping the routing probe"
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
