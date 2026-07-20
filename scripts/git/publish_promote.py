#!/usr/bin/env python3
"""Discover publish snapshots ready for promotion to main and open PRs.

Reads policy from .orchestrator/config.json `branch_workflow.promote`
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
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONFIG_FILE = ROOT / ".github" / "branch-workflow.json"

# Accept the current YYYY.WW.P format and historical YYYY.MM.DD.N tags.
RELEASE_TAG_RE = re.compile(r"^refs/tags/release/(v\d{4}\.\d{2}(?:\.\d+){1,2})$")


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
        # Skip if a promote PR already exists.
        existing = subprocess.run(
            ["gh", "pr", "list", "--head", f"promote/{version}", "--state", "open", "--json", "number"],
            capture_output=True,
            text=True,
            cwd=ROOT,
        )
        if existing.returncode == 0 and existing.stdout.strip() not in ("", "[]"):
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
    for cand in candidates:
        version = cand["version"]
        publish_branch = cand["publish_branch"]
        promote_branch = cand["promote_branch"]
        main_branch = settings["main_branch"]
        promote_label = settings["promote_pr_label"]

        run_git("fetch", "origin", main_branch, publish_branch, "--tags")
        # The immutable publish snapshot is the promotion source of truth.
        # Start from that exact tree, then join current main's history using the
        # snapshot-authoritative `ours` strategy. This makes main an ancestor of
        # the promote branch without trying to text-merge months of divergent
        # main/dev work and without changing a byte of the vetted snapshot.
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

        body = (
            f"Auto-generated promotion of `{publish_branch}` "
            f"(release tag `release/{version}`) into `{main_branch}`.\n\n"
            f"- soak age: {cand['age_days']} days\n"
            f"- blockers: {cand['blockers'] or 'none'}\n\n"
            "Merging this PR will trigger `main-release.yml` to tag "
            f"`prod/{version}` on main."
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
        if promote_label:
            subprocess.run(
                [
                    "gh",
                    "pr",
                    "edit",
                    promote_branch,
                    "--add-label",
                    promote_label,
                ],
                check=False,
                cwd=ROOT,
            )
        # Enable auto-merge so the PR auto-completes once branch-protection
        # status checks (Commit trailers / Runtime mirror guard / Smoke
        # acceptance) come back green. Non-fatal if auto-merge is unavailable.
        subprocess.run(
            [
                "gh",
                "pr",
                "merge",
                promote_branch,
                "--auto",
                "--merge",
            ],
            check=False,
            cwd=ROOT,
        )
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
