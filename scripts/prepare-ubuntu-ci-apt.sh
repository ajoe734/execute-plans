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

if [[ "${1:-}" == --diagnose ]]; then
  # Run before sudo changes the environment. Never print resolver answers,
  # proxy values, raw apt-config output, or subprocess error messages.
  python3 - <<'PY'
import re
import subprocess
import tempfile
from pathlib import Path

proxy_probe = '''
import os, re, subprocess
for key in ("http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY", "all_proxy", "ALL_PROXY", "no_proxy", "NO_PROXY", "APT_CONFIG"):
    print(f"env_key={key} present={int(key in os.environ)}")
try:
    result = subprocess.run(["apt-config", "dump"], capture_output=True, text=True, timeout=4)
    print(f"apt_config_exit={result.returncode}")
    for label, pattern in (("proxy", r"^Acquire::(?:http|https)::Proxy(?:\\s|::)"), ("proxy_auto_detect", r"^Acquire::(?:http|https)::Proxy-Auto-Detect\\s")):
        print(f"apt_config_key={label} present={int(bool(re.search(pattern, result.stdout, re.I | re.M)))}")
except subprocess.TimeoutExpired:
    print("apt_config_exit=124")
'''
for identity in ("runner", "root", "_apt"):
    prefix = [] if identity == "runner" else ["sudo", "-n", "-u", identity, "--"]
    for host in ("azure.archive.ubuntu.com", "archive.ubuntu.com", "security.ubuntu.com", "github.com", "mirrors.us.kernel.org", "mirror.math.princeton.edu"):
        try:
            result = subprocess.run(prefix + ["timeout", "--kill-after=1s", "4s", "getent", "ahostsv4", host], capture_output=True, text=True, timeout=6)
            code, answers = result.returncode, len(result.stdout.splitlines())
        except subprocess.TimeoutExpired:
            code, answers = 124, 0
        print(f"APT DNS identity={identity} host={host} exit={code} answer_lines={answers}", flush=True)
    try:
        result = subprocess.run(prefix + ["python3", "-c", proxy_probe], capture_output=True, text=True, timeout=5)
        print(f"APT proxy identity={identity} probe_exit={result.returncode}", flush=True)
        # Accept only the fixed diagnostic grammar, even if sudo emits output.
        for line in result.stdout.splitlines():
            if re.fullmatch(r"(?:env_key=(?:https?_proxy|HTTPS?_PROXY|all_proxy|ALL_PROXY|no_proxy|NO_PROXY|APT_CONFIG) present=[01]|apt_config_exit=\d+|apt_config_key=(?:proxy|proxy_auto_detect) present=[01])", line):
                print(f"APT proxy identity={identity} {line}", flush=True)
    except subprocess.TimeoutExpired:
        print(f"APT proxy identity={identity} probe_exit=124", flush=True)

# Listed at https://launchpad.net/ubuntu/+archivemirrors. Probe only;
# these results do not select a source or replace the required APT install.
for base in ("https://mirrors.us.kernel.org/ubuntu/", "https://mirror.math.princeton.edu/pub/ubuntu/"):
    with tempfile.TemporaryDirectory(prefix="ubuntu-inrelease-") as directory:
        release = Path(directory) / "InRelease"
        try:
            fetched = subprocess.run(["curl", "--fail", "--silent", "--show-error", "--proto", "=https", "--connect-timeout", "4", "--max-time", "10", "--output", str(release), base + "dists/noble/InRelease"], capture_output=True, timeout=12)
            print(f"APT mirror url={base} suite=noble fetch_exit={fetched.returncode}", flush=True)
            if fetched.returncode:
                continue
            verified = subprocess.run(["gpgv", "--keyring", "/usr/share/keyrings/ubuntu-archive-keyring.gpg", str(release)], capture_output=True, timeout=4)
            metadata = release.read_text()
            codename = bool(re.search(r"^Codename: noble$", metadata, re.M))
            origin = bool(re.search(r"^Origin: Ubuntu$", metadata, re.M))
            print(f"APT mirror url={base} suite=noble signature_exit={verified.returncode} codename_ok={int(codename)} origin_ok={int(origin)}", flush=True)
        except subprocess.TimeoutExpired:
            print(f"APT mirror url={base} suite=noble probe_exit=124", flush=True)
PY
  exit 0
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
