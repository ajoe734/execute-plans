#!/usr/bin/env python3
"""Small stdlib-only GitHub Actions API client for self-hosted runners."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import time
import urllib.parse
import urllib.request


def _request(method: str, path: str, payload: dict | None = None) -> dict:
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if not token:
        raise SystemExit("GH_TOKEN is required")
    base = os.environ.get("GITHUB_API_URL", "https://api.github.com")
    req = urllib.request.Request(
        f"{base}{path}",
        method=method,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
        },
        data=json.dumps(payload).encode() if payload is not None else None,
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            body = response.read()
    except Exception as exc:  # pragma: no cover - exercised on runner only
        raise SystemExit(f"GitHub API request failed: {exc}") from exc
    return json.loads(body) if body else {}


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    dispatch = sub.add_parser("dispatch")
    dispatch.add_argument("workflow")
    dispatch.add_argument("ref")
    dispatch.add_argument("inputs_json")
    runs = sub.add_parser("list")
    runs.add_argument("workflow")
    runs.add_argument("since")
    runs.add_argument("title")
    runs.add_argument("--branch", default=None)
    view = sub.add_parser("view")
    view.add_argument("run_id")
    jobs = sub.add_parser("jobs")
    jobs.add_argument("run_id")
    wait = sub.add_parser("wait")
    wait.add_argument("run_id")
    wait.add_argument("--interval", type=int, default=15)
    args = parser.parse_args()
    repo = os.environ.get("GITHUB_REPOSITORY")
    if not repo:
        raise SystemExit("GITHUB_REPOSITORY is required")

    if args.command == "dispatch":
        payload = {"ref": args.ref, "inputs": json.loads(args.inputs_json)}
        _request("POST", f"/repos/{repo}/actions/workflows/{urllib.parse.quote(args.workflow, safe='')}/dispatches", payload)
        return
    if args.command == "view":
        print(json.dumps(_request("GET", f"/repos/{repo}/actions/runs/{args.run_id}"), separators=(",", ":")))
        return
    if args.command == "jobs":
        print(json.dumps(_request("GET", f"/repos/{repo}/actions/runs/{args.run_id}/jobs?per_page=100"), separators=(",", ":")))
        return
    if args.command == "wait":
        while True:
            run = _request("GET", f"/repos/{repo}/actions/runs/{args.run_id}")
            status = run.get("status")
            conclusion = run.get("conclusion")
            if status == "completed":
                if conclusion != "success":
                    raise SystemExit(f"GitHub Actions run {args.run_id} concluded {conclusion}")
                return
            time.sleep(max(1, args.interval))
    query = {"event": "workflow_dispatch", "per_page": "100"}
    if args.branch:
        query["branch"] = args.branch
    data = _request(
        "GET",
        f"/repos/{repo}/actions/workflows/{urllib.parse.quote(args.workflow, safe='')}/runs?{urllib.parse.urlencode(query)}",
    )
    since = dt.datetime.fromisoformat(args.since.replace("Z", "+00:00"))
    matches = [
        run
        for run in data.get("workflow_runs", [])
        if run.get("display_title") == args.title
        and dt.datetime.fromisoformat(run["created_at"].replace("Z", "+00:00")) >= since
    ]
    print(json.dumps(matches, separators=(",", ":")))


if __name__ == "__main__":
    main()
