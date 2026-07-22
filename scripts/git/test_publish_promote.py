from __future__ import annotations

import importlib.util
from pathlib import Path
import unittest
from unittest import mock


SCRIPT = Path(__file__).with_name("publish_promote.py")
SPEC = importlib.util.spec_from_file_location("publish_promote", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
PROMOTE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PROMOTE)


def _candidate(version: str) -> dict:
    return {
        "version": version,
        "publish_branch": f"publish/{version}",
        "age_days": 2,
        "blockers": [],
        "promote_branch": f"promote/{version}",
    }


class PublishPromoteTest(unittest.TestCase):
    def test_promotion_frontier_collapses_linear_snapshots_to_newest(self) -> None:
        candidates = [
            _candidate("v2026.07.18.1"),
            _candidate("v2026.07.13.10"),
            _candidate("v2026.07.18.0"),
        ]

        with mock.patch.object(PROMOTE, "git_is_ancestor", return_value=True):
            frontier = PROMOTE.promotion_frontier(candidates)

        self.assertEqual(
            [item["version"] for item in frontier], ["v2026.07.18.1"]
        )

    def test_promotion_frontier_preserves_non_linear_snapshot(self) -> None:
        older = _candidate("v2026.07.17.1")
        newest = _candidate("v2026.07.18.1")

        with mock.patch.object(PROMOTE, "git_is_ancestor", return_value=False):
            frontier = PROMOTE.promotion_frontier([newest, older])

        self.assertEqual(
            [item["version"] for item in frontier],
            ["v2026.07.17.1", "v2026.07.18.1"],
        )

    def test_promotion_frontier_carries_ancestor_blockers_forward(self) -> None:
        older = _candidate("v2026.07.17.1")
        older["blockers"] = ["#42 regression in soaked snapshot"]
        newest = _candidate("v2026.07.18.1")

        with mock.patch.object(PROMOTE, "git_is_ancestor", return_value=True):
            frontier = PROMOTE.promotion_frontier([newest, older])

        self.assertEqual(len(frontier), 1)
        self.assertEqual(frontier[0]["version"], "v2026.07.18.1")
        self.assertEqual(frontier[0]["blockers"], older["blockers"])

    def test_version_key_orders_double_digit_snapshot_numerically(self) -> None:
        versions = ["v2026.07.13.9", "v2026.07.13.10", "v2026.07.14.0"]

        self.assertEqual(
            sorted(versions, key=PROMOTE.version_key),
            ["v2026.07.13.9", "v2026.07.13.10", "v2026.07.14.0"],
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
