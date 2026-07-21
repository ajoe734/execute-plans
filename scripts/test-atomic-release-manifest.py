#!/usr/bin/env python3
"""Focused unit tests for scripts/atomic-release-manifest.py."""

from __future__ import annotations

import importlib.util
import os
from pathlib import Path
import stat
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("atomic-release-manifest.py")
SPEC = importlib.util.spec_from_file_location("atomic_release_manifest", SCRIPT)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"cannot import {SCRIPT}")
MANIFEST = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MANIFEST
SPEC.loader.exec_module(MANIFEST)


class InjectedFailure(RuntimeError):
    """Test-only failure raised immediately before the atomic replace."""


class AtomicReleaseManifestTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory(
            prefix="atomic-release-manifest."
        )
        self.root = Path(self.temporary_directory.name).resolve()
        self.release_store = self.root / "releases"
        self.release_dir = self.release_store / "release-a"
        self.release_store.mkdir()
        self.release_dir.mkdir()
        self.source = self.root / "accepted-deployment.json"
        self.source.write_bytes(b'{"deploymentState":"accepted"}\n')
        self.destination = self.release_dir / "deployment.json"
        self.original_bytes = b'{"deploymentState":"candidate"}\n'
        self.destination.write_bytes(self.original_bytes)
        self.stage_name = ".deployment.json.test-stage"

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def publish(self, **overrides: object) -> dict[str, str | int]:
        arguments: dict[str, object] = {
            "source": os.fspath(self.source),
            "release_store": os.fspath(self.release_store),
            "release_dir": os.fspath(self.release_dir),
            "stage_name": self.stage_name,
        }
        arguments.update(overrides)
        return MANIFEST.publish_manifest(**arguments)

    def assert_no_stage(self, name: str | None = None) -> None:
        self.assertFalse(
            os.path.lexists(self.release_store / (name or self.stage_name))
        )

    def test_publish_replaces_manifest_with_durable_mode(self) -> None:
        result = self.publish()

        self.assertEqual(self.destination.read_bytes(), self.source.read_bytes())
        self.assertEqual(
            stat.S_IMODE(self.destination.stat().st_mode),
            0o664,
        )
        self.assertEqual(result["bytes"], len(self.source.read_bytes()))
        self.assertEqual(result["target"], os.fspath(self.destination))
        self.assert_no_stage()

    def test_injected_pre_replace_failure_preserves_bytes_and_cleans_stage(self) -> None:
        def fail_before_replace() -> None:
            raise InjectedFailure("stop before replace")

        with self.assertRaisesRegex(InjectedFailure, "stop before replace"):
            self.publish(before_replace=fail_before_replace)

        self.assertEqual(self.destination.read_bytes(), self.original_bytes)
        self.assert_no_stage()

    def test_rejects_source_and_destination_symlinks(self) -> None:
        real_source = self.root / "real-source.json"
        real_source.write_bytes(self.source.read_bytes())
        source_link = self.root / "source-link.json"
        source_link.symlink_to(real_source)
        with self.assertRaisesRegex(
            MANIFEST.ManifestPublishError, "source manifest"
        ):
            self.publish(source=os.fspath(source_link))
        self.assertEqual(self.destination.read_bytes(), self.original_bytes)
        self.assert_no_stage()

        external = self.root / "external.json"
        external.write_bytes(b"external\n")
        self.destination.unlink()
        self.destination.symlink_to(external)
        with self.assertRaisesRegex(
            MANIFEST.ManifestPublishError, "existing deployment.json"
        ):
            self.publish()
        self.assertTrue(self.destination.is_symlink())
        self.assertEqual(external.read_bytes(), b"external\n")
        self.assert_no_stage()

    def test_rejects_symlinked_and_out_of_store_release_directories(self) -> None:
        release_link = self.release_store / "release-link"
        release_link.symlink_to(self.release_dir, target_is_directory=True)
        with self.assertRaisesRegex(
            MANIFEST.ManifestPublishError, "real directory"
        ):
            self.publish(release_dir=os.fspath(release_link))
        self.assertEqual(self.destination.read_bytes(), self.original_bytes)
        self.assert_no_stage()

        outside = self.root / "outside-release"
        outside.mkdir()
        (outside / "deployment.json").write_bytes(self.original_bytes)
        with self.assertRaisesRegex(
            MANIFEST.ManifestPublishError, "immediate child"
        ):
            self.publish(release_dir=os.fspath(outside))
        self.assertEqual(
            (outside / "deployment.json").read_bytes(), self.original_bytes
        )
        self.assert_no_stage()

        nested = self.release_store / "group" / "nested-release"
        nested.mkdir(parents=True)
        (nested / "deployment.json").write_bytes(self.original_bytes)
        with self.assertRaisesRegex(
            MANIFEST.ManifestPublishError, "immediate child"
        ):
            self.publish(release_dir=os.fspath(nested))
        self.assertEqual(
            (nested / "deployment.json").read_bytes(), self.original_bytes
        )
        self.assert_no_stage()

    def test_exclusive_stage_collision_preserves_existing_files(self) -> None:
        stage = self.release_store / self.stage_name
        stage.write_bytes(b"unowned-stage\n")

        with self.assertRaisesRegex(
            MANIFEST.ManifestPublishError, "exclusive manifest stage"
        ):
            self.publish()

        self.assertEqual(stage.read_bytes(), b"unowned-stage\n")
        self.assertEqual(self.destination.read_bytes(), self.original_bytes)


if __name__ == "__main__":
    unittest.main(verbosity=2)
