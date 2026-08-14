#!/usr/bin/env python3
"""Fail-closed atomic compare-and-swap operations for managed symlinks.

Linux does not expose a single syscall that compares a symlink target and
replaces it.  ``RENAME_EXCHANGE`` gives us the next-best safe primitive: swap
the live and staged names atomically, then verify the symlink that was swapped
out.  If it was not the expected predecessor, swap the names back atomically
before reporting failure.  Bootstrap uses ``RENAME_NOREPLACE`` so an existing
live name can never be overwritten.
"""

from __future__ import annotations

import argparse
import ctypes
import errno
import json
import os
import stat
import sys
from dataclasses import dataclass


RENAME_NOREPLACE = 1
RENAME_EXCHANGE = 2


class CasError(RuntimeError):
    """The requested symlink transition was not safe to commit."""


class KernelPrimitiveError(CasError):
    """The kernel cannot provide the required atomic rename primitive."""


_LIBC = ctypes.CDLL(None, use_errno=True)
_LIBC_RENAMEAT2 = getattr(_LIBC, "renameat2", None)
if _LIBC_RENAMEAT2 is not None:
    _LIBC_RENAMEAT2.argtypes = [
        ctypes.c_int,
        ctypes.c_char_p,
        ctypes.c_int,
        ctypes.c_char_p,
        ctypes.c_uint,
    ]
    _LIBC_RENAMEAT2.restype = ctypes.c_int


def _renameat2(
    old_dir_fd: int,
    old_name: str,
    new_dir_fd: int,
    new_name: str,
    flags: int,
) -> None:
    """Call Linux renameat2 without silently falling back to a weaker rename."""

    if sys.platform != "linux" or _LIBC_RENAMEAT2 is None:
        raise KernelPrimitiveError("Linux renameat2 is required for symlink CAS")
    result = _LIBC_RENAMEAT2(
        old_dir_fd,
        os.fsencode(old_name),
        new_dir_fd,
        os.fsencode(new_name),
        flags,
    )
    if result != 0:
        error_number = ctypes.get_errno()
        if error_number in (errno.ENOSYS, errno.EINVAL, errno.EOPNOTSUPP):
            raise KernelPrimitiveError(
                "the filesystem/kernel does not support the required atomic rename"
            )
        raise OSError(error_number, os.strerror(error_number))


def _canonical_absolute_path(value: str, label: str) -> str:
    if not value or not os.path.isabs(value) or os.path.normpath(value) != value:
        raise CasError(f"{label} must be a canonical absolute path")
    return value


def _canonical_target(value: str, label: str) -> str:
    value = _canonical_absolute_path(value, label)
    if os.path.realpath(value) != value:
        raise CasError(f"{label} must not traverse a symlink")
    try:
        target_stat = os.stat(value, follow_symlinks=False)
    except FileNotFoundError as error:
        raise CasError(f"{label} does not exist") from error
    if not stat.S_ISDIR(target_stat.st_mode):
        raise CasError(f"{label} must identify a directory")
    return value


@dataclass(frozen=True)
class LinkPair:
    parent: str
    live_name: str
    staged_name: str


def _link_pair(live_link: str, staged_link: str) -> LinkPair:
    live_link = _canonical_absolute_path(live_link, "live link")
    staged_link = _canonical_absolute_path(staged_link, "staged link")
    live_parent, live_name = os.path.split(live_link)
    staged_parent, staged_name = os.path.split(staged_link)
    if not live_name or not staged_name or live_link == staged_link:
        raise CasError("live and staged links must be distinct named paths")
    if live_parent != staged_parent:
        raise CasError("live and staged links must share one directory")
    if os.path.realpath(live_parent) != live_parent:
        raise CasError("link parent must not traverse a symlink")
    return LinkPair(live_parent, live_name, staged_name)


def _open_parent(parent: str) -> int:
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        return os.open(parent, flags)
    except OSError as error:
        raise CasError(f"cannot open managed link directory: {error.strerror}") from error


def _lstat_at(directory_fd: int, name: str) -> os.stat_result | None:
    try:
        return os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
    except FileNotFoundError:
        return None


def _link_target_at(directory_fd: int, name: str, label: str) -> str:
    link_stat = _lstat_at(directory_fd, name)
    if link_stat is None:
        raise CasError(f"{label} is missing")
    if not stat.S_ISLNK(link_stat.st_mode):
        raise CasError(f"{label} is not a symlink")
    target = os.readlink(name, dir_fd=directory_fd)
    if not os.path.isabs(target) or os.path.normpath(target) != target:
        raise CasError(f"{label} has a relative or non-canonical target")
    return target


def _require_target_at(
    directory_fd: int, name: str, expected_target: str, label: str
) -> None:
    observed = _link_target_at(directory_fd, name, label)
    if observed != expected_target:
        raise CasError(
            f"{label} target mismatch: expected {expected_target}, observed {observed}"
        )


def _unlink_exact_at(directory_fd: int, name: str, expected_target: str) -> bool:
    """Remove only the exact managed symlink; never unlink an unknown object."""

    try:
        _require_target_at(directory_fd, name, expected_target, "cleanup link")
    except CasError:
        return False
    os.unlink(name, dir_fd=directory_fd)
    return True


def _sync_directory(directory_fd: int) -> None:
    os.fsync(directory_fd)


def exchange(
    live_link: str,
    staged_link: str,
    expected_live_target: str,
    expected_staged_target: str,
) -> dict[str, str]:
    """Atomically replace one managed symlink and verify its predecessor."""

    pair = _link_pair(live_link, staged_link)
    expected_live_target = _canonical_target(
        expected_live_target, "expected live target"
    )
    expected_staged_target = _canonical_target(
        expected_staged_target, "expected staged target"
    )
    if expected_live_target == expected_staged_target:
        raise CasError("exchange targets must be different")

    directory_fd = _open_parent(pair.parent)
    try:
        _require_target_at(
            directory_fd, pair.live_name, expected_live_target, "live link"
        )
        _require_target_at(
            directory_fd, pair.staged_name, expected_staged_target, "staged link"
        )
        _renameat2(
            directory_fd,
            pair.staged_name,
            directory_fd,
            pair.live_name,
            RENAME_EXCHANGE,
        )

        try:
            _require_target_at(
                directory_fd,
                pair.live_name,
                expected_staged_target,
                "committed live link",
            )
            _require_target_at(
                directory_fd,
                pair.staged_name,
                expected_live_target,
                "exchanged predecessor",
            )
        except CasError as verification_error:
            try:
                _renameat2(
                    directory_fd,
                    pair.staged_name,
                    directory_fd,
                    pair.live_name,
                    RENAME_EXCHANGE,
                )
            except (CasError, OSError) as restore_error:
                raise CasError(
                    "atomic exchange verification failed and atomic restoration failed: "
                    f"{restore_error}"
                ) from verification_error

            candidate_still_live = False
            try:
                candidate_still_live = (
                    _link_target_at(
                        directory_fd, pair.live_name, "restored live link"
                    )
                    == expected_staged_target
                )
            except CasError:
                pass
            if candidate_still_live:
                raise CasError(
                    "atomic exchange restoration left the candidate live"
                ) from verification_error
            _unlink_exact_at(
                directory_fd, pair.staged_name, expected_staged_target
            )
            _sync_directory(directory_fd)
            raise CasError(
                "atomic exchange rejected because the exchanged predecessor did not "
                "match the expected live target"
            ) from verification_error

        if not _unlink_exact_at(
            directory_fd, pair.staged_name, expected_live_target
        ):
            raise CasError(
                "exchanged predecessor changed before managed-link cleanup"
            )
        _sync_directory(directory_fd)
    finally:
        os.close(directory_fd)

    return {
        "operation": "exchange",
        "liveTarget": expected_staged_target,
        "exchangedOutTarget": expected_live_target,
    }


def install_if_absent(
    live_link: str, staged_link: str, expected_staged_target: str
) -> dict[str, str]:
    """Atomically bootstrap a managed symlink only when the live name is absent."""

    pair = _link_pair(live_link, staged_link)
    expected_staged_target = _canonical_target(
        expected_staged_target, "expected staged target"
    )
    directory_fd = _open_parent(pair.parent)
    try:
        _require_target_at(
            directory_fd, pair.staged_name, expected_staged_target, "staged link"
        )
        if _lstat_at(directory_fd, pair.live_name) is not None:
            raise CasError("bootstrap live path already exists")
        try:
            _renameat2(
                directory_fd,
                pair.staged_name,
                directory_fd,
                pair.live_name,
                RENAME_NOREPLACE,
            )
        except FileExistsError as error:
            raise CasError("bootstrap live path appeared before commit") from error
        try:
            _require_target_at(
                directory_fd,
                pair.live_name,
                expected_staged_target,
                "bootstrap live link",
            )
        except CasError as verification_error:
            try:
                _renameat2(
                    directory_fd,
                    pair.live_name,
                    directory_fd,
                    pair.staged_name,
                    RENAME_NOREPLACE,
                )
            except (CasError, OSError) as restore_error:
                raise CasError(
                    "atomic bootstrap verification failed and restoration failed: "
                    f"{restore_error}"
                ) from verification_error
            if _lstat_at(directory_fd, pair.live_name) is not None:
                raise CasError(
                    "atomic bootstrap restoration left an unexpected live path"
                ) from verification_error
            _sync_directory(directory_fd)
            raise CasError(
                "atomic bootstrap rejected because the staged target changed before commit"
            ) from verification_error
        if _lstat_at(directory_fd, pair.staged_name) is not None:
            raise CasError("bootstrap staged link still exists after commit")
        _sync_directory(directory_fd)
    finally:
        os.close(directory_fd)

    return {"operation": "install-if-absent", "liveTarget": expected_staged_target}


def remove_if_target(
    live_link: str, staged_link: str, expected_live_target: str
) -> dict[str, str]:
    """Atomically remove a managed link, restoring it if its target raced."""

    pair = _link_pair(live_link, staged_link)
    expected_live_target = _canonical_target(
        expected_live_target, "expected live target"
    )
    directory_fd = _open_parent(pair.parent)
    try:
        _require_target_at(
            directory_fd, pair.live_name, expected_live_target, "live link"
        )
        if _lstat_at(directory_fd, pair.staged_name) is not None:
            raise CasError("remove staging path already exists")
        try:
            _renameat2(
                directory_fd,
                pair.live_name,
                directory_fd,
                pair.staged_name,
                RENAME_NOREPLACE,
            )
        except FileExistsError as error:
            raise CasError("remove staging path appeared before commit") from error

        try:
            _require_target_at(
                directory_fd,
                pair.staged_name,
                expected_live_target,
                "removed live link",
            )
        except CasError as verification_error:
            try:
                _renameat2(
                    directory_fd,
                    pair.staged_name,
                    directory_fd,
                    pair.live_name,
                    RENAME_NOREPLACE,
                )
            except (CasError, OSError) as restore_error:
                raise CasError(
                    "atomic remove verification failed and restoration failed: "
                    f"{restore_error}"
                ) from verification_error
            raise CasError(
                "atomic remove rejected because the moved link target changed"
            ) from verification_error

        if not _unlink_exact_at(
            directory_fd, pair.staged_name, expected_live_target
        ):
            raise CasError("removed live link changed before managed-link cleanup")
        _sync_directory(directory_fd)
    finally:
        os.close(directory_fd)

    return {"operation": "remove-if-target", "removedTarget": expected_live_target}


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    exchange_parser = subparsers.add_parser("exchange")
    exchange_parser.add_argument("--live-link", required=True)
    exchange_parser.add_argument("--staged-link", required=True)
    exchange_parser.add_argument("--expected-live-target", required=True)
    exchange_parser.add_argument("--expected-staged-target", required=True)

    install_parser = subparsers.add_parser("install-if-absent")
    install_parser.add_argument("--live-link", required=True)
    install_parser.add_argument("--staged-link", required=True)
    install_parser.add_argument("--expected-staged-target", required=True)

    remove_parser = subparsers.add_parser("remove-if-target")
    remove_parser.add_argument("--live-link", required=True)
    remove_parser.add_argument("--staged-link", required=True)
    remove_parser.add_argument("--expected-live-target", required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    arguments = _parser().parse_args(argv)
    try:
        if arguments.command == "exchange":
            result = exchange(
                arguments.live_link,
                arguments.staged_link,
                arguments.expected_live_target,
                arguments.expected_staged_target,
            )
        elif arguments.command == "install-if-absent":
            result = install_if_absent(
                arguments.live_link,
                arguments.staged_link,
                arguments.expected_staged_target,
            )
        else:
            result = remove_if_target(
                arguments.live_link,
                arguments.staged_link,
                arguments.expected_live_target,
            )
    except (CasError, OSError) as error:
        print(f"atomic symlink CAS rejected: {error}", file=sys.stderr)
        return 2
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
