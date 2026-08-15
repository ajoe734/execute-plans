#!/usr/bin/env python3
"""Reject build artifacts and audit outputs from entering the history.

execute-plans equivalent of pantheon's runtime-mirror guard
(scripts/check_staged_generated_files.py): these paths are regenerated
by builds / CI probes and must never be committed.

Usage: check_generated_files.py <path> [<path> ...]
Exits non-zero if any path is a generated artifact.
"""

from __future__ import annotations

import sys

FORBIDDEN_PREFIXES = (
    "dist/",
    "node_modules/",
    "coverage/",
    "playwright-report/",
    "test-results/",
    ".lovable/audits/",
    "pantheon-audits/",
    "pantheon-contract/",
)


def main(argv: list[str]) -> int:
    bad = [p for p in argv if p.startswith(FORBIDDEN_PREFIXES)]
    if bad:
        print("generated/build artifacts must not be committed:", file=sys.stderr)
        for p in bad:
            print(f"  - {p}", file=sys.stderr)
        print(
            "\nThese paths are produced by builds or CI probes and are "
            "regenerated on every run. Remove them from the diff. "
            "See docs/conventions/GIT_WORKFLOW.md §5.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
