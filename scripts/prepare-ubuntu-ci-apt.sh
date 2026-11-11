#!/usr/bin/env bash
# GitHub's Ubuntu 24.04 x64 image routes Ubuntu through apt-mirrors.txt.
# Use the official HTTPS archive directly so a failed Azure mirror cannot
# delay/break Playwright's required --with-deps install. Keep suites, components
# and Signed-By unchanged. CI_APT_ROOT is only for isolated filesystem tests.
set -euo pipefail

root="${CI_APT_ROOT:-}"
if [[ "${GITHUB_ACTIONS:-}" != true || "${RUNNER_OS:-}" != Linux || "${RUNNER_ARCH:-}" != X64 ]]; then
  echo 'APT preparation requires a GitHub Ubuntu 24.04 X64 runner' >&2
  exit 1
fi
. "$root/etc/os-release"
if [[ "$ID" != ubuntu || "$VERSION_ID" != 24.04 ]]; then
  echo 'APT preparation refuses an unsupported distribution' >&2
  exit 1
fi

sources="$root/etc/apt/sources.list.d/ubuntu.sources"
if ! grep -Eq '^URIs: (mirror\+file:/etc/apt/apt-mirrors.txt|https?://(azure\.archive|archive|security)\.ubuntu\.com/ubuntu/?)$' "$sources"; then
  echo 'APT preparation refuses an unknown Ubuntu source layout' >&2
  exit 1
fi
sed -i -E \
  -e 's|^URIs: mirror\+file:/etc/apt/apt-mirrors.txt$|URIs: https://archive.ubuntu.com/ubuntu/|' \
  -e 's|^URIs: http(s)?://azure\.archive\.ubuntu\.com/ubuntu/?$|URIs: https://archive.ubuntu.com/ubuntu/|' \
  "$sources"

# These settings also apply to the apt-get calls made inside Playwright.
# A partial metadata refresh must fail, rather than silently use stale indexes.
cat > "$root/etc/apt/apt.conf.d/zzzz-pantheon-browser-ci" <<'APT'
Acquire::Retries "1";
Acquire::http::Timeout "15";
Acquire::https::Timeout "15";
APT::Update::Error-Mode "any";
APT
echo 'Ubuntu CI APT uses official archives with signature verification and bounded acquisition'
cat "$sources"
