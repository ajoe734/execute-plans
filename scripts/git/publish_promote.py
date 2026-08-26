#!/usr/bin/env python3
"""Discover publish snapshots ready for promotion to main and open PRs.

Reads policy from .github/branch-workflow.json `branch_workflow.promote`
(falls back to legacy `wave_workflow.promote` if a migration hasn't run):

  soak_days                 — minimum days since the release/<VER> tag
  regression_label_prefix   — any open issue with this label prefix blocks promote
  block_labels              — additional explicit block labels on issues
  promote_pr_label          — label applied to the opened PR

Subcommands:
  discover  --github-output <path>   write candidate list to a GITHUB_OUTPUT file
  open-prs                            read PROMOTE_CANDIDATES env var and open PRs

The PR shape is `promote/<VER>` with the exact immutable `publish/<VER>` tree
and a history-only merge of current main. `main-release.yml` reacts on merge.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[2]
CONFIG_FILE = ROOT / ".github" / "branch-workflow.json"

# Accept the current YYYY.WW.P format and historical YYYY.MM.DD.N tags.
RELEASE_TAG_RE = re.compile(r"^refs/tags/release/(v\d{4}\.\d{2}(?:\.\d+){1,2})$")
BRANCH_CI_WORKFLOW = "branch-ci.yml"
BRANCH_CI_WORKFLOW_PATH = ".github/workflows/branch-ci.yml"
REQUIRED_PROMOTE_CHECKS = frozenset(
    {
        "Commit trailers",
        "Generated files guard",
        "Smoke acceptance",
    }
)


def load_promote_settings() -> dict:
    cfg: dict = {}
    if CONFIG_FILE.exists():
        try:
            cfg = json.loads(CONFIG_FILE.read_text())
        except json.JSONDecodeError:
            cfg = {}
    # Prefer new key, fall back to legacy for transition window.
    wf = cfg.get("branch_workflow") or cfg.get("wave_workflow") or {}
    promote = wf.get("promote") or {}
    return {
        "main_branch": wf.get("main_branch", "main"),
        "publish_branch_prefix": wf.get("publish_branch_prefix", "publish/"),
        "release_tag_prefix": wf.get("release_tag_prefix", "release/"),
        "soak_days": int(promote.get("soak_days", 1)),
        "regression_label_prefix": promote.get("regression_label_prefix", "regression/"),
        "block_labels": list(promote.get("block_labels") or []),
        "promote_pr_label": promote.get("promote_pr_label", "auto-promote"),
    }


def run_git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], check=True, capture_output=True, text=True, cwd=ROOT
    ).stdout.strip()


def git_is_ancestor(older_ref: str, newer_ref: str) -> bool:
    return (
        subprocess.run(
            ["git", "merge-base", "--is-ancestor", older_ref, newer_ref],
            capture_output=True,
            cwd=ROOT,
        ).returncode
        == 0
    )


def _result_detail(proc: subprocess.CompletedProcess[str]) -> str:
    detail = (proc.stderr or proc.stdout or "").strip().splitlines()
    return detail[0] if detail else f"command exited {proc.returncode}"


def _gh_api_rows(endpoint: str, jq_filter: str) -> tuple[list[dict], str | None]:
    """Return paginated REST rows without relying on GitHub GraphQL."""

    proc = subprocess.run(
        [
            "gh",
            "api",
            "--paginate",
            "--method",
            "GET",
            endpoint,
            "--jq",
            jq_filter,
        ],
        capture_output=True,
        text=True,
        cwd=ROOT,
    )
    if proc.returncode != 0:
        return [], _result_detail(proc)
    rows: list[dict] = []
    try:
        for line in proc.stdout.splitlines():
            if line.strip():
                row = json.loads(line)
                if isinstance(row, dict):
                    rows.append(row)
    except json.JSONDecodeError:
        return [], "GitHub REST API returned invalid JSON"
    return rows, None


def _gh_api_object(endpoint: str) -> tuple[dict | None, str | None]:
    """Return one REST object without routing through GitHub GraphQL."""

    proc = subprocess.run(
        ["gh", "api", "--method", "GET", endpoint],
        capture_output=True,
        text=True,
        cwd=ROOT,
    )
    if proc.returncode != 0:
        return None, _result_detail(proc)
    try:
        row = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return None, "GitHub REST API returned invalid JSON"
    if not isinstance(row, dict):
        return None, "GitHub REST API did not return an object"
    return row, None


def _required_check_rollup(head_sha: str) -> tuple[list[dict], str | None]:
    return _gh_api_rows(
        f"repos/{{owner}}/{{repo}}/commits/{head_sha}/check-runs?per_page=100",
        ".check_runs[] | {name,status,conclusion} | @json",
    )


def find_open_promote_pr(
    promote_branch: str, main_branch: str
) -> tuple[dict | None, str | None]:
    """Return the open PR for one promote branch, including exact-head checks."""

    rows, error = _gh_api_rows(
        (
            "repos/{owner}/{repo}/pulls?state=open&per_page=100&base="
            f"{quote(main_branch, safe='')}"
        ),
        ".[] | {number,html_url,head:{ref:.head.ref,sha:.head.sha}} | @json",
    )
    if error:
        return None, error
    for row in rows:
        head = row.get("head") or {}
        if head.get("ref") != promote_branch:
            continue
        head_sha = str(head.get("sha") or "")
        if not re.fullmatch(r"[0-9a-f]{40}", head_sha):
            return None, "existing promote PR did not expose an exact head SHA"
        checks, check_error = _required_check_rollup(head_sha)
        if check_error:
            return None, check_error
        return (
            {
                "number": row.get("number"),
                "url": row.get("html_url"),
                "headRefName": head.get("ref"),
                "headRefOid": head_sha,
                "statusCheckRollup": checks,
            },
            None,
        )
    return None, None


def missing_required_promote_checks(pr: dict) -> list[str]:
    """Return required main-protection contexts absent from the exact PR head."""

    present = {
        str(check.get("name", "")).strip()
        for check in pr.get("statusCheckRollup") or []
        if isinstance(check, dict)
    }
    return sorted(REQUIRED_PROMOTE_CHECKS - present)


def promote_ref_supports_ci_dispatch(head_sha: str) -> tuple[bool, str | None]:
    """Prove the exact promote ref contains the guarded dispatch contract."""

    if not re.fullmatch(r"[0-9a-f]{40}", head_sha):
        return False, "promote PR head must be a full lowercase commit SHA"
    payload, error = _gh_api_object(
        "repos/{owner}/{repo}/contents/.github/workflows/branch-ci.yml"
        f"?ref={quote(head_sha, safe='')}"
    )
    if error:
        return False, error
    encoded = str((payload or {}).get("content") or "").replace("\n", "")
    try:
        workflow = base64.b64decode(encoded, validate=True).decode()
    except (ValueError, UnicodeDecodeError):
        return False, "branch-ci workflow content was not valid base64 text"
    required_markers = (
        "workflow_dispatch:",
        "expected_head_sha:",
        "promote_pr_number:",
    )
    return all(marker in workflow for marker in required_markers), None


def dispatch_promote_ci(
    promote_branch: str, expected_head_sha: str, pr_number: int | str
) -> None:
    """Dispatch Branch CI on the immutable promote head."""

    if not promote_branch.startswith("promote/"):
        raise RuntimeError("Branch CI dispatch is restricted to promote/* refs")
    if not re.fullmatch(r"[0-9a-f]{40}", expected_head_sha):
        raise RuntimeError("promote PR head must be a full lowercase commit SHA")
    subprocess.run(
        [
            "gh",
            "workflow",
            "run",
            BRANCH_CI_WORKFLOW,
            "--ref",
            promote_branch,
            "-f",
            f"expected_head_sha={expected_head_sha}",
            "-f",
            f"promote_pr_number={pr_number}",
        ],
        check=True,
        cwd=ROOT,
    )


def rerun_action_required_branch_ci(
    expected_head_sha: str,
    pr_number: int | str,
    *,
    discovery_attempts: int = 6,
    discovery_interval: float = 1.0,
) -> int | None:
    """Materialize an inert pull_request suite on the exact promote PR head."""

    if not re.fullmatch(r"[0-9a-f]{40}", expected_head_sha):
        raise RuntimeError("promote PR head must be a full lowercase commit SHA")
    try:
        expected_pr_number = int(pr_number)
    except (TypeError, ValueError) as exc:
        raise RuntimeError("promote PR number must be an integer") from exc
    if discovery_attempts < 1:
        raise RuntimeError("Branch CI placeholder discovery requires at least one attempt")

    endpoint = (
        "repos/{owner}/{repo}/actions/runs"
        f"?event=pull_request&head_sha={quote(expected_head_sha, safe='')}"
        "&per_page=100"
    )
    for attempt in range(discovery_attempts):
        rows, error = _gh_api_rows(
            endpoint,
            (
                ".workflow_runs[] | "
                "{id,path,event,status,conclusion,head_sha,pull_requests} | @json"
            ),
        )
        if error:
            raise RuntimeError(f"Branch CI placeholder lookup failed: {error}")
        for row in sorted(rows, key=lambda item: int(item.get("id") or 0), reverse=True):
            path = str(row.get("path") or "").split("@", 1)[0]
            pull_numbers = {
                int(pull.get("number"))
                for pull in row.get("pull_requests") or []
                if str(pull.get("number") or "").isdigit()
            }
            if (
                path != BRANCH_CI_WORKFLOW_PATH
                or row.get("event") != "pull_request"
                or row.get("conclusion") != "action_required"
                or row.get("head_sha") != expected_head_sha
                or expected_pr_number not in pull_numbers
            ):
                continue
            run_id = int(row["id"])
            proc = subprocess.run(
                [
                    "gh",
                    "api",
                    "--method",
                    "POST",
                    f"repos/{{owner}}/{{repo}}/actions/runs/{run_id}/rerun",
                ],
                capture_output=True,
                text=True,
                cwd=ROOT,
            )
            if proc.returncode != 0:
                raise RuntimeError(
                    f"Branch CI placeholder rerun failed: {_result_detail(proc)}"
                )
            return run_id
        if attempt + 1 < discovery_attempts:
            time.sleep(discovery_interval)
    return None


def wait_for_required_promote_checks(
    expected_head_sha: str,
    *,
    discovery_attempts: int = 36,
    discovery_interval: float = 5.0,
) -> list[dict]:
    """Fail unless all protected check contexts attach to the exact PR head."""

    if not re.fullmatch(r"[0-9a-f]{40}", expected_head_sha):
        raise RuntimeError("promote PR head must be a full lowercase commit SHA")
    missing = sorted(REQUIRED_PROMOTE_CHECKS)
    last_error: str | None = None
    for attempt in range(discovery_attempts):
        checks, error = _required_check_rollup(expected_head_sha)
        if error:
            last_error = error
        else:
            last_error = None
            present = {
                str(check.get("name", "")).strip()
                for check in checks
                if isinstance(check, dict)
            }
            missing = sorted(REQUIRED_PROMOTE_CHECKS - present)
            if not missing:
                return checks
        if attempt + 1 < discovery_attempts:
            time.sleep(discovery_interval)
    if last_error:
        raise RuntimeError(f"required Branch CI lookup failed: {last_error}")
    raise RuntimeError(
        "required Branch CI checks did not attach to the exact promote head: "
        + ", ".join(missing)
    )


def request_verified_auto_merge(
    promote_branch: str, pr_number: int | str
) -> dict[str, bool]:
    """Request protected auto-merge and verify GitHub recorded the request."""

    subprocess.run(
        ["gh", "pr", "merge", promote_branch, "--auto", "--merge"],
        check=True,
        cwd=ROOT,
    )
    payload, error = _gh_api_object(f"repos/{{owner}}/{{repo}}/pulls/{pr_number}")
    if error:
        raise RuntimeError(f"auto-merge verification failed: {error}")
    auto_merge_enabled = bool((payload or {}).get("auto_merge"))
    merged = bool((payload or {}).get("merged_at"))
    if not auto_merge_enabled and not merged:
        raise RuntimeError(
            f"auto-merge request for PR #{pr_number} was not observable through REST"
        )
    return {"auto_merge_enabled": auto_merge_enabled, "merged": merged}


def version_key(version: str) -> tuple[int, ...]:
    return tuple(int(part) for part in version.removeprefix("v").split("."))


def promotion_frontier(candidates: list[dict]) -> list[dict]:
    """Return only candidates not superseded by a newer linear snapshot.

    Hourly publish snapshots are immutable points on the dev history. Promoting
    the newest snapshot also promotes every older snapshot that is its ancestor,
    so opening one PR per historical tag is both redundant and brittle. Keep a
    candidate only when no newer eligible release tag contains it; non-linear
    snapshots remain separate candidates and are never discarded silently.
    """
    frontier: list[dict] = []
    for candidate in sorted(
        candidates, key=lambda item: version_key(item["version"]), reverse=True
    ):
        current = {**candidate, "blockers": list(candidate.get("blockers") or [])}
        candidate_ref = f"refs/tags/release/{current['version']}"
        superseding = next(
            (
                newer
                for newer in frontier
                if git_is_ancestor(
                    candidate_ref, f"refs/tags/release/{newer['version']}"
                )
            ),
            None,
        )
        if superseding is not None:
            superseding["blockers"] = list(
                dict.fromkeys([*superseding["blockers"], *current["blockers"]])
            )
            continue
        frontier.append(current)
    return list(reversed(frontier))


def ensure_git_identity() -> None:
    """Configure a committer identity if the checkout has none.

    The promote flow creates a `git merge --no-ff` merge commit. GitHub's
    actions/checkout does NOT set user.name/user.email, so the merge aborts with
    exit 128 ("Committer identity unknown") -- which silently broke every
    scheduled publish-promote run and stalled dev->main promotion. Set the
    github-actions bot identity, but only when unset so local runs keep theirs.
    """
    for key, value in (
        ("user.email", "github-actions[bot]@users.noreply.github.com"),
        ("user.name", "github-actions[bot]"),
    ):
        existing = subprocess.run(
            ["git", "config", key], capture_output=True, text=True, cwd=ROOT
        )
        if existing.returncode != 0 or not existing.stdout.strip():
            subprocess.run(["git", "config", key, value], check=False, cwd=ROOT)


def list_release_tags() -> list[tuple[str, datetime]]:
    """Return [(version, tagged_at)] for every release/v*.*.* tag on origin."""
    out = run_git(
        "for-each-ref",
        "--format=%(refname) %(creatordate:iso-strict)",
        "refs/tags/release/",
    )
    items: list[tuple[str, datetime]] = []
    for line in out.splitlines():
        if not line.strip():
            continue
        ref, _, ts = line.partition(" ")
        m = RELEASE_TAG_RE.match(ref)
        if not m:
            continue
        when = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        items.append((m.group(1), when))
    return items


def fetch_blocking_labels(version: str, prefix: str, block_labels: list[str]) -> list[str]:
    """Use gh CLI to find any open issues with regression labels for this version."""
    if not os.environ.get("GH_TOKEN"):
        return []
    labels_query = f"{prefix}{version}"
    cmd = [
        "gh",
        "issue",
        "list",
        "--state",
        "open",
        "--label",
        labels_query,
        "--json",
        "number,title,labels",
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, cwd=ROOT)
    blockers: list[str] = []
    if proc.returncode == 0:
        try:
            data = json.loads(proc.stdout)
            blockers.extend(f"#{i['number']} {i['title']}" for i in data)
        except json.JSONDecodeError:
            pass
    for label in block_labels:
        cmd_extra = [
            "gh",
            "issue",
            "list",
            "--state",
            "open",
            "--label",
            label,
            "--json",
            "number,title",
        ]
        proc = subprocess.run(cmd_extra, capture_output=True, text=True, cwd=ROOT)
        if proc.returncode == 0:
            try:
                for i in json.loads(proc.stdout):
                    blockers.append(f"#{i['number']} {i['title']} (label: {label})")
            except json.JSONDecodeError:
                pass
    return blockers


def discover(input_version: str | None, soak_days: int, prefix: str, block_labels: list[str], publish_prefix: str) -> list[dict]:
    now = datetime.now(timezone.utc)
    candidates: list[dict] = []

    # Ensure origin/main and all release tags are fetched. Without this
    # the `is-ancestor` check below silently fails on the CI runner (which
    # only fetches the workflow's checkout ref) and every already-merged
    # publish gets re-proposed for promote — observed after the main
    # bootstrap of 2026-05-17.
    subprocess.run(
        ["git", "fetch", "origin", "main", "--tags", "--quiet"],
        capture_output=True,
        cwd=ROOT,
        check=False,
    )

    tags = list_release_tags()
    if input_version:
        tags = [t for t in tags if t[0] == input_version.lstrip("v") or t[0] == input_version]

    for version, tagged_at in tags:
        age_days = (now - tagged_at).total_seconds() / 86400.0
        if age_days < soak_days and not input_version:
            continue
        # Skip if the publish branch is already merged into main.
        merged_check = subprocess.run(
            ["git", "merge-base", "--is-ancestor", f"refs/tags/release/{version}", "origin/main"],
            capture_output=True,
            cwd=ROOT,
        )
        if merged_check.returncode == 0:
            continue
        # Defensive second check on the publish branch tip itself (covers
        # the case where main moved past the release tag via hotfix).
        publish_merged = subprocess.run(
            ["git", "merge-base", "--is-ancestor", f"origin/{publish_prefix}{version}", "origin/main"],
            capture_output=True,
            cwd=ROOT,
        )
        if publish_merged.returncode == 0:
            continue
        blockers = fetch_blocking_labels(version, prefix, block_labels)
        candidates.append(
            {
                "version": version,
                "publish_branch": f"{publish_prefix}{version}",
                "age_days": round(age_days, 2),
                "blockers": blockers,
                "promote_branch": f"promote/{version}",
            }
        )
    return candidates


def cmd_discover(args: argparse.Namespace) -> int:
    settings = load_promote_settings()
    candidates = discover(
        args.version,
        settings["soak_days"],
        settings["regression_label_prefix"],
        settings["block_labels"],
        settings["publish_branch_prefix"],
    )
    frontier = promotion_frontier(candidates)
    eligible = [c for c in frontier if not c["blockers"]]
    if args.github_output:
        with open(args.github_output, "a") as fh:
            fh.write(f"candidate_count={len(eligible)}\n")
            fh.write("candidates<<__EOC__\n")
            fh.write(json.dumps(eligible))
            fh.write("\n__EOC__\n")
    print(json.dumps({"all": candidates, "eligible": eligible}, indent=2))
    return 0


def open_candidate(cand: dict, settings: dict) -> dict:
    version = cand["version"]
    publish_branch = cand["publish_branch"]
    promote_branch = cand["promote_branch"]
    main_branch = settings["main_branch"]
    promote_label = settings["promote_pr_label"]

    run_git("fetch", "origin", main_branch, publish_branch, "--tags")
    existing_pr, lookup_error = find_open_promote_pr(promote_branch, main_branch)
    if lookup_error:
        raise RuntimeError(f"existing PR lookup failed: {lookup_error}")
    if existing_pr:
        promote_head = str(existing_pr.get("headRefOid") or "")
        missing = missing_required_promote_checks(existing_pr)
        if missing:
            supports_dispatch, contract_error = promote_ref_supports_ci_dispatch(
                promote_head
            )
            if contract_error:
                raise RuntimeError(
                    f"existing promote CI contract lookup failed: {contract_error}"
                )
            if not supports_dispatch:
                return {
                    "version": version,
                    "disposition": "legacy_ci_contract",
                    "missing_required_checks": missing,
                    "head_sha": promote_head,
                    "detail": (
                        f"existing PR #{existing_pr['number']} predates the exact-head "
                        "Branch CI dispatch contract; a newer release must supersede it"
                    ),
                }
            dispatch_promote_ci(
                promote_branch, promote_head, existing_pr["number"]
            )
            pull_request_ci_rerun = rerun_action_required_branch_ci(
                promote_head, existing_pr["number"]
            )
            wait_for_required_promote_checks(promote_head)
        else:
            pull_request_ci_rerun = None
        auto_merge = request_verified_auto_merge(
            promote_branch, existing_pr["number"]
        )
        return {
            "version": version,
            "disposition": "ci_dispatched" if missing else "existing_pr",
            "missing_required_checks": missing,
            "head_sha": promote_head,
            "pull_request_ci_rerun": pull_request_ci_rerun,
            **auto_merge,
            "detail": (
                f"verified required Branch CI and protected auto-merge for "
                f"existing PR #{existing_pr['number']}"
            ),
        }

    # The immutable publish snapshot is the promotion source of truth. Start
    # from that exact tree, then join current main's history using the
    # snapshot-authoritative `ours` strategy.
    run_git("checkout", "-B", promote_branch, f"origin/{publish_branch}")
    run_git(
        "merge",
        "--no-ff",
        "--no-edit",
        "-s",
        "ours",
        "-m",
        f"promote: {version}",
        f"origin/{main_branch}",
    )
    run_git("diff", "--quiet", f"origin/{publish_branch}", "HEAD")
    if not git_is_ancestor(f"origin/{main_branch}", "HEAD"):
        raise RuntimeError(
            f"promotion branch {promote_branch} does not contain {main_branch}"
        )
    run_git("push", "--force-with-lease", "-u", "origin", promote_branch)
    promote_head = run_git("rev-parse", "HEAD")

    body = (
        f"Auto-generated promotion of `{publish_branch}` "
        f"(release tag `release/{version}`) into `{main_branch}`.\n\n"
        f"- soak age: {cand['age_days']} days\n"
        f"- blockers: {cand['blockers'] or 'none'}\n\n"
        "Merging this PR will trigger `main-release.yml` to tag "
        f"`prod/{version}` on main. The PR remains subject to all required "
        "branch-protection checks."
    )
    subprocess.run(
        [
            "gh",
            "pr",
            "create",
            "--base",
            main_branch,
            "--head",
            promote_branch,
            "--title",
            f"Promote {version} to {main_branch}",
            "--body",
            body,
        ],
        check=True,
        cwd=ROOT,
    )
    opened_pr, lookup_error = find_open_promote_pr(promote_branch, main_branch)
    if lookup_error:
        raise RuntimeError(f"created PR lookup failed: {lookup_error}")
    if not opened_pr:
        raise RuntimeError("created promote PR was not visible to exact-head CI dispatch")
    if str(opened_pr.get("headRefOid") or "") != promote_head:
        raise RuntimeError("created promote PR head changed before required CI dispatch")
    supports_dispatch, contract_error = promote_ref_supports_ci_dispatch(promote_head)
    if contract_error:
        raise RuntimeError(f"created promote CI contract lookup failed: {contract_error}")
    if not supports_dispatch:
        raise RuntimeError(
            "created promote PR head does not contain the exact-head Branch CI "
            "dispatch contract"
        )
    if promote_label:
        subprocess.run(
            ["gh", "pr", "edit", promote_branch, "--add-label", promote_label],
            check=False,
            cwd=ROOT,
        )
    dispatch_promote_ci(promote_branch, promote_head, opened_pr["number"])
    pull_request_ci_rerun = rerun_action_required_branch_ci(
        promote_head, opened_pr["number"]
    )
    wait_for_required_promote_checks(promote_head)
    auto_merge = request_verified_auto_merge(promote_branch, opened_pr["number"])
    return {
        "version": version,
        "disposition": "pr_opened",
        "head_sha": promote_head,
        "pull_request_ci_rerun": pull_request_ci_rerun,
        **auto_merge,
        "detail": (
            f"opened {promote_branch}, attached required Branch CI to the exact "
            "head, and verified protected auto-merge"
        ),
    }


def cmd_open_prs(_args: argparse.Namespace) -> int:
    settings = load_promote_settings()
    ensure_git_identity()
    raw = os.environ.get("PROMOTE_CANDIDATES", "[]")
    try:
        candidates = json.loads(raw)
    except json.JSONDecodeError:
        print(f"PROMOTE_CANDIDATES is not valid JSON: {raw[:80]}", file=sys.stderr)
        return 2
    if not isinstance(candidates, list):
        return 0
    results = [open_candidate(cand, settings) for cand in candidates]
    print(json.dumps({"results": results}, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("discover")
    d.add_argument("--github-output")
    d.add_argument("--version", default=None)
    d.set_defaults(func=cmd_discover)
    o = sub.add_parser("open-prs")
    o.set_defaults(func=cmd_open_prs)
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
