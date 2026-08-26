from __future__ import annotations

import base64
import importlib.util
from pathlib import Path
import subprocess
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
    SETTINGS = {
        "main_branch": "main",
        "publish_branch_prefix": "publish/",
        "release_tag_prefix": "release/",
        "soak_days": 1,
        "regression_label_prefix": "regression/",
        "block_labels": ["hold-promote", "regression"],
        "promote_pr_label": "auto-promote",
    }

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

    def test_missing_required_promote_checks_uses_main_protection_names(self) -> None:
        missing = PROMOTE.missing_required_promote_checks(
            {
                "statusCheckRollup": [
                    {"name": "Commit trailers"},
                    {"name": "Generated files guard"},
                ]
            }
        )

        self.assertEqual(missing, ["Smoke acceptance"])

    def test_promote_ref_dispatch_contract_is_read_from_exact_head(self) -> None:
        workflow = (
            "on:\n  workflow_dispatch:\n    inputs:\n"
            "      expected_head_sha:\n      promote_pr_number:\n"
        )
        with mock.patch.object(
            PROMOTE,
            "_gh_api_object",
            return_value=(
                {"content": base64.b64encode(workflow.encode()).decode()},
                None,
            ),
        ) as api:
            supported, error = PROMOTE.promote_ref_supports_ci_dispatch("d" * 40)

        self.assertEqual((supported, error), (True, None))
        self.assertIn("?ref=" + "d" * 40, api.call_args.args[0])

    def test_reruns_only_exact_action_required_placeholder(self) -> None:
        row = {
            "id": 30451895166,
            "path": ".github/workflows/branch-ci.yml",
            "event": "pull_request",
            "status": "completed",
            "conclusion": "action_required",
            "head_sha": "d" * 40,
            "pull_requests": [{"number": 637}],
        }
        completed = subprocess.CompletedProcess(
            ["gh", "api"], returncode=0, stdout="{}", stderr=""
        )
        with (
            mock.patch.object(PROMOTE, "_gh_api_rows", return_value=([row], None)),
            mock.patch.object(
                PROMOTE.subprocess, "run", return_value=completed
            ) as run,
        ):
            run_id = PROMOTE.rerun_action_required_branch_ci(
                "d" * 40,
                637,
                discovery_attempts=1,
                discovery_interval=0,
            )

        self.assertEqual(run_id, 30451895166)
        self.assertEqual(
            run.call_args.args[0],
            [
                "gh",
                "api",
                "--method",
                "POST",
                "repos/{owner}/{repo}/actions/runs/30451895166/rerun",
            ],
        )

    def test_required_check_attachment_fails_closed(self) -> None:
        with mock.patch.object(PROMOTE, "_required_check_rollup", return_value=([], None)):
            with self.assertRaisesRegex(RuntimeError, "did not attach"):
                PROMOTE.wait_for_required_promote_checks(
                    "d" * 40,
                    discovery_attempts=1,
                    discovery_interval=0,
                )

    def test_verified_auto_merge_fails_when_rest_cannot_observe_it(self) -> None:
        completed = subprocess.CompletedProcess(
            ["gh", "pr", "merge"], returncode=0, stdout="", stderr=""
        )
        with (
            mock.patch.object(
                PROMOTE.subprocess, "run", return_value=completed
            ) as run,
            mock.patch.object(
                PROMOTE,
                "_gh_api_object",
                return_value=({"auto_merge": None, "merged_at": None}, None),
            ),
        ):
            with self.assertRaisesRegex(RuntimeError, "was not observable"):
                PROMOTE.request_verified_auto_merge("promote/v2026.08.26.1", 42)

        self.assertTrue(run.call_args.kwargs["check"])

    def test_open_candidate_dispatches_exact_head_before_auto_merge(self) -> None:
        candidate = _candidate("v2026.08.26.1")
        opened = {
            "number": 644,
            "headRefOid": "a" * 40,
            "statusCheckRollup": [],
        }
        with (
            mock.patch.object(PROMOTE, "run_git") as run_git,
            mock.patch.object(PROMOTE, "git_is_ancestor", return_value=True),
            mock.patch.object(
                PROMOTE,
                "find_open_promote_pr",
                side_effect=[(None, None), (opened, None)],
            ),
            mock.patch.object(
                PROMOTE, "promote_ref_supports_ci_dispatch", return_value=(True, None)
            ),
            mock.patch.object(
                PROMOTE, "rerun_action_required_branch_ci", return_value=1234
            ) as rerun,
            mock.patch.object(PROMOTE, "wait_for_required_promote_checks") as wait,
            mock.patch.object(
                PROMOTE,
                "request_verified_auto_merge",
                return_value={"auto_merge_enabled": True, "merged": False},
            ) as auto_merge,
            mock.patch.object(PROMOTE.subprocess, "run") as run,
        ):
            run_git.side_effect = (
                lambda *args: "a" * 40 if args == ("rev-parse", "HEAD") else ""
            )
            result = PROMOTE.open_candidate(candidate, self.SETTINGS)

        self.assertEqual(result["disposition"], "pr_opened")
        commands = [call.args[0] for call in run.call_args_list]
        self.assertIn(
            [
                "gh",
                "workflow",
                "run",
                "branch-ci.yml",
                "--ref",
                "promote/v2026.08.26.1",
                "-f",
                f"expected_head_sha={'a' * 40}",
                "-f",
                "promote_pr_number=644",
            ],
            commands,
        )
        rerun.assert_called_once_with("a" * 40, 644)
        wait.assert_called_once_with("a" * 40)
        auto_merge.assert_called_once_with("promote/v2026.08.26.1", 644)

    def test_existing_legacy_pr_waits_for_a_newer_release(self) -> None:
        candidate = _candidate("v2026.08.24.6")
        with (
            mock.patch.object(PROMOTE, "run_git"),
            mock.patch.object(
                PROMOTE,
                "find_open_promote_pr",
                return_value=(
                    {
                        "number": 643,
                        "headRefOid": "c" * 40,
                        "statusCheckRollup": [],
                    },
                    None,
                ),
            ),
            mock.patch.object(
                PROMOTE,
                "promote_ref_supports_ci_dispatch",
                return_value=(False, None),
            ),
            mock.patch.object(PROMOTE, "dispatch_promote_ci") as dispatch,
        ):
            result = PROMOTE.open_candidate(candidate, self.SETTINGS)

        self.assertEqual(result["disposition"], "legacy_ci_contract")
        self.assertFalse(dispatch.called)

    def test_workflows_expose_exact_head_dispatch_and_required_context(self) -> None:
        root = Path(__file__).resolve().parents[2]
        branch_workflow = (root / ".github/workflows/branch-ci.yml").read_text()
        publish_workflow = (
            root / ".github/workflows/publish-promote.yml"
        ).read_text()

        self.assertIn("workflow_dispatch:", branch_workflow)
        self.assertIn("expected_head_sha:", branch_workflow)
        self.assertIn("promote_pr_number:", branch_workflow)
        self.assertEqual(
            branch_workflow.count("Validate explicit promote dispatch"), 2
        )
        self.assertIn('[[ "$REF_NAME" != promote/* ]]', branch_workflow)
        self.assertIn('[[ "$HEAD_SHA" != "$EXPECTED_HEAD_SHA" ]]', branch_workflow)
        self.assertIn("name: Smoke acceptance", branch_workflow)
        self.assertIn("actions: write", publish_workflow)
        self.assertIn("checks: read", publish_workflow)


if __name__ == "__main__":
    unittest.main(verbosity=2)
