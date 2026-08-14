#!/usr/bin/env python3
"""Focused unit tests for scripts/atomic-symlink-cas.py."""

from __future__ import annotations

import importlib.util
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock


SCRIPT = Path(__file__).with_name("atomic-symlink-cas.py")
SPEC = importlib.util.spec_from_file_location("atomic_symlink_cas", SCRIPT)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"cannot import {SCRIPT}")
CAS = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = CAS
SPEC.loader.exec_module(CAS)


class AtomicSymlinkCasTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory(
            prefix="atomic-symlink-cas."
        )
        self.root = Path(self.temporary_directory.name).resolve()
        self.previous = self.root / "previous"
        self.candidate = self.root / "candidate"
        self.external = self.root / "external"
        self.live = self.root / "live"
        self.staged = self.root / "live.staged"
        for directory in (self.previous, self.candidate, self.external):
            directory.mkdir()

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def symlink(self, target: Path | str, link: Path) -> None:
        os.symlink(os.fspath(target), os.fspath(link))

    def test_exchange_commits_candidate_and_verifies_exchanged_predecessor(self) -> None:
        self.symlink(self.previous, self.live)
        self.symlink(self.candidate, self.staged)

        result = CAS.exchange(
            os.fspath(self.live),
            os.fspath(self.staged),
            os.fspath(self.previous),
            os.fspath(self.candidate),
        )

        self.assertEqual(result["liveTarget"], os.fspath(self.candidate))
        self.assertEqual(os.readlink(self.live), os.fspath(self.candidate))
        self.assertFalse(os.path.lexists(self.staged))

    def test_exchange_race_is_atomically_reversed_without_candidate_live(self) -> None:
        self.symlink(self.previous, self.live)
        self.symlink(self.candidate, self.staged)
        original_renameat2 = CAS._renameat2
        exchange_calls = 0

        def race_before_first_exchange(
            old_dir_fd: int,
            old_name: str,
            new_dir_fd: int,
            new_name: str,
            flags: int,
        ) -> None:
            nonlocal exchange_calls
            if flags == CAS.RENAME_EXCHANGE:
                exchange_calls += 1
                if exchange_calls == 1:
                    self.live.unlink()
                    self.symlink(self.external, self.live)
            original_renameat2(
                old_dir_fd, old_name, new_dir_fd, new_name, flags
            )

        with mock.patch.object(CAS, "_renameat2", race_before_first_exchange):
            with self.assertRaisesRegex(CAS.CasError, "exchanged predecessor"):
                CAS.exchange(
                    os.fspath(self.live),
                    os.fspath(self.staged),
                    os.fspath(self.previous),
                    os.fspath(self.candidate),
                )

        self.assertEqual(exchange_calls, 2)
        self.assertEqual(os.readlink(self.live), os.fspath(self.external))
        self.assertNotEqual(os.readlink(self.live), os.fspath(self.candidate))
        self.assertFalse(os.path.lexists(self.staged))

    def test_bootstrap_is_noreplace_and_preserves_any_existing_live_path(self) -> None:
        self.symlink(self.candidate, self.staged)
        result = CAS.install_if_absent(
            os.fspath(self.live),
            os.fspath(self.staged),
            os.fspath(self.candidate),
        )
        self.assertEqual(result["operation"], "install-if-absent")
        self.assertEqual(os.readlink(self.live), os.fspath(self.candidate))
        self.assertFalse(os.path.lexists(self.staged))

        self.live.unlink()
        self.symlink(self.external, self.live)
        self.symlink(self.candidate, self.staged)
        with self.assertRaisesRegex(CAS.CasError, "already exists"):
            CAS.install_if_absent(
                os.fspath(self.live),
                os.fspath(self.staged),
                os.fspath(self.candidate),
            )
        self.assertEqual(os.readlink(self.live), os.fspath(self.external))
        self.assertEqual(os.readlink(self.staged), os.fspath(self.candidate))

    def test_bootstrap_staged_target_race_is_moved_back_out_of_live(self) -> None:
        self.symlink(self.candidate, self.staged)
        original_renameat2 = CAS._renameat2
        noreplace_calls = 0

        def race_before_first_move(
            old_dir_fd: int,
            old_name: str,
            new_dir_fd: int,
            new_name: str,
            flags: int,
        ) -> None:
            nonlocal noreplace_calls
            if flags == CAS.RENAME_NOREPLACE:
                noreplace_calls += 1
                if noreplace_calls == 1:
                    self.staged.unlink()
                    self.symlink(self.external, self.staged)
            original_renameat2(
                old_dir_fd, old_name, new_dir_fd, new_name, flags
            )

        with mock.patch.object(CAS, "_renameat2", race_before_first_move):
            with self.assertRaisesRegex(CAS.CasError, "staged target changed"):
                CAS.install_if_absent(
                    os.fspath(self.live),
                    os.fspath(self.staged),
                    os.fspath(self.candidate),
                )

        self.assertEqual(noreplace_calls, 2)
        self.assertFalse(os.path.lexists(self.live))
        self.assertEqual(os.readlink(self.staged), os.fspath(self.external))

    def test_remove_is_atomic_and_restores_a_raced_target(self) -> None:
        self.symlink(self.candidate, self.live)
        CAS.remove_if_target(
            os.fspath(self.live),
            os.fspath(self.staged),
            os.fspath(self.candidate),
        )
        self.assertFalse(os.path.lexists(self.live))
        self.assertFalse(os.path.lexists(self.staged))

        self.symlink(self.candidate, self.live)
        original_renameat2 = CAS._renameat2
        noreplace_calls = 0

        def race_before_first_move(
            old_dir_fd: int,
            old_name: str,
            new_dir_fd: int,
            new_name: str,
            flags: int,
        ) -> None:
            nonlocal noreplace_calls
            if flags == CAS.RENAME_NOREPLACE:
                noreplace_calls += 1
                if noreplace_calls == 1:
                    self.live.unlink()
                    self.symlink(self.external, self.live)
            original_renameat2(
                old_dir_fd, old_name, new_dir_fd, new_name, flags
            )

        with mock.patch.object(CAS, "_renameat2", race_before_first_move):
            with self.assertRaisesRegex(CAS.CasError, "moved link target changed"):
                CAS.remove_if_target(
                    os.fspath(self.live),
                    os.fspath(self.staged),
                    os.fspath(self.candidate),
                )

        self.assertEqual(noreplace_calls, 2)
        self.assertEqual(os.readlink(self.live), os.fspath(self.external))
        self.assertFalse(os.path.lexists(self.staged))

    def test_rejects_non_symlink_relative_and_mismatched_targets(self) -> None:
        self.live.write_text("not a link", encoding="utf8")
        self.symlink(self.candidate, self.staged)
        with self.assertRaisesRegex(CAS.CasError, "not a symlink"):
            CAS.exchange(
                os.fspath(self.live),
                os.fspath(self.staged),
                os.fspath(self.previous),
                os.fspath(self.candidate),
            )

        self.live.unlink()
        self.symlink(self.previous, self.live)
        self.staged.unlink()
        self.symlink("candidate", self.staged)
        with self.assertRaisesRegex(CAS.CasError, "relative"):
            CAS.exchange(
                os.fspath(self.live),
                os.fspath(self.staged),
                os.fspath(self.previous),
                os.fspath(self.candidate),
            )

        self.staged.unlink()
        self.symlink(self.external, self.staged)
        with self.assertRaisesRegex(CAS.CasError, "target mismatch"):
            CAS.exchange(
                os.fspath(self.live),
                os.fspath(self.staged),
                os.fspath(self.previous),
                os.fspath(self.candidate),
            )
        self.assertEqual(os.readlink(self.live), os.fspath(self.previous))

        with self.assertRaisesRegex(CAS.CasError, "canonical absolute"):
            CAS.exchange(
                "relative-live",
                os.fspath(self.staged),
                os.fspath(self.previous),
                os.fspath(self.candidate),
            )

    def test_missing_kernel_primitive_fails_without_mutation(self) -> None:
        self.symlink(self.previous, self.live)
        self.symlink(self.candidate, self.staged)
        with mock.patch.object(CAS, "_LIBC_RENAMEAT2", None):
            with self.assertRaisesRegex(CAS.KernelPrimitiveError, "renameat2"):
                CAS.exchange(
                    os.fspath(self.live),
                    os.fspath(self.staged),
                    os.fspath(self.previous),
                    os.fspath(self.candidate),
                )
        self.assertEqual(os.readlink(self.live), os.fspath(self.previous))
        self.assertEqual(os.readlink(self.staged), os.fspath(self.candidate))


if __name__ == "__main__":
    unittest.main(verbosity=2)
