#!/usr/bin/env python3
"""Publish a release manifest with a durable, fail-closed atomic replace."""

from __future__ import annotations

import argparse
from collections.abc import Callable
import json
import os
import stat
import sys


MANIFEST_NAME = "deployment.json"
COPY_CHUNK_BYTES = 1024 * 1024


class ManifestPublishError(RuntimeError):
    """The requested manifest publication did not satisfy its safety contract."""


def _canonical_absolute_path(value: str, label: str) -> str:
    if not value or not os.path.isabs(value) or os.path.normpath(value) != value:
        raise ManifestPublishError(f"{label} must be a canonical absolute path")
    return value


def _require_nofollow() -> int:
    nofollow = getattr(os, "O_NOFOLLOW", 0)
    if not nofollow:
        raise ManifestPublishError("O_NOFOLLOW is required to publish a manifest")
    return nofollow


def _directory_flags() -> int:
    return (
        os.O_RDONLY
        | os.O_DIRECTORY
        | os.O_CLOEXEC
        | _require_nofollow()
    )


def _open_managed_directories(
    release_store: str, release_dir: str
) -> tuple[int, int, str, os.stat_result]:
    release_store = _canonical_absolute_path(release_store, "release store")
    release_dir = _canonical_absolute_path(release_dir, "release directory")
    release_name = os.path.basename(release_dir)
    if (
        not release_name
        or os.path.dirname(release_dir) != release_store
        or release_name in (".", "..")
    ):
        raise ManifestPublishError(
            "release directory must be an immediate child of the release store"
        )
    if os.path.realpath(release_store) != release_store:
        raise ManifestPublishError("release store must be a real directory")
    if os.path.realpath(release_dir) != release_dir:
        raise ManifestPublishError("release directory must be a real directory")

    try:
        store_fd = os.open(release_store, _directory_flags())
    except OSError as error:
        raise ManifestPublishError(
            f"cannot open release store as a real directory: {error.strerror}"
        ) from error

    release_fd = -1
    try:
        release_entry = os.stat(
            release_name, dir_fd=store_fd, follow_symlinks=False
        )
        if not stat.S_ISDIR(release_entry.st_mode):
            raise ManifestPublishError("release directory must be a real directory")
        release_fd = os.open(release_name, _directory_flags(), dir_fd=store_fd)
        opened_release = os.fstat(release_fd)
        if (
            opened_release.st_dev != release_entry.st_dev
            or opened_release.st_ino != release_entry.st_ino
        ):
            os.close(release_fd)
            raise ManifestPublishError("release directory changed while opening")
    except BaseException:
        if release_fd >= 0:
            os.close(release_fd)
        os.close(store_fd)
        raise

    return store_fd, release_fd, release_name, opened_release


def _require_pinned_release_directory(
    store_fd: int,
    release_name: str,
    opened_release: os.stat_result,
) -> None:
    try:
        current = os.stat(
            release_name, dir_fd=store_fd, follow_symlinks=False
        )
    except FileNotFoundError as error:
        raise ManifestPublishError(
            "release directory left the release store before publication"
        ) from error
    if (
        not stat.S_ISDIR(current.st_mode)
        or current.st_dev != opened_release.st_dev
        or current.st_ino != opened_release.st_ino
    ):
        raise ManifestPublishError(
            "release directory changed before manifest publication"
        )


def _destination_identity(release_fd: int) -> os.stat_result:
    try:
        destination = os.stat(
            MANIFEST_NAME, dir_fd=release_fd, follow_symlinks=False
        )
    except FileNotFoundError as error:
        raise ManifestPublishError(
            "existing deployment.json must be a regular non-symlink file"
        ) from error
    if not stat.S_ISREG(destination.st_mode):
        raise ManifestPublishError(
            "existing deployment.json must be a regular non-symlink file"
        )
    return destination


def _require_same_destination(
    release_fd: int, expected: os.stat_result
) -> None:
    current = _destination_identity(release_fd)
    if current.st_dev != expected.st_dev or current.st_ino != expected.st_ino:
        raise ManifestPublishError(
            "existing deployment.json changed before manifest publication"
        )


def _open_source(source: str) -> int:
    source = _canonical_absolute_path(source, "source manifest")
    try:
        source_fd = os.open(
            source,
            os.O_RDONLY | os.O_CLOEXEC | _require_nofollow(),
        )
    except OSError as error:
        raise ManifestPublishError(
            "source manifest must be a readable regular non-symlink file"
        ) from error
    source_stat = os.fstat(source_fd)
    if not stat.S_ISREG(source_stat.st_mode):
        os.close(source_fd)
        raise ManifestPublishError(
            "source manifest must be a readable regular non-symlink file"
        )
    return source_fd


def _stage_name(value: str, release_name: str) -> str:
    if (
        not value
        or value in (".", "..", release_name)
        or os.path.basename(value) != value
        or "/" in value
        or "\x00" in value
    ):
        raise ManifestPublishError(
            "stage name must be one distinct release-store filename"
        )
    return value


def _copy_bytes(source_fd: int, destination_fd: int) -> int:
    total = 0
    while True:
        chunk = os.read(source_fd, COPY_CHUNK_BYTES)
        if not chunk:
            return total
        view = memoryview(chunk)
        while view:
            written = os.write(destination_fd, view)
            if written <= 0:
                raise OSError("manifest staging write made no progress")
            total += written
            view = view[written:]


def _same_file(left: os.stat_result, right: os.stat_result) -> bool:
    return left.st_dev == right.st_dev and left.st_ino == right.st_ino


def _require_owned_stage(
    store_fd: int, stage_name: str, expected: os.stat_result
) -> None:
    try:
        current = os.stat(stage_name, dir_fd=store_fd, follow_symlinks=False)
    except FileNotFoundError as error:
        raise ManifestPublishError(
            "staged manifest disappeared before publication"
        ) from error
    if not stat.S_ISREG(current.st_mode) or not _same_file(current, expected):
        raise ManifestPublishError(
            "staged manifest changed before publication"
        )


def _cleanup_owned_stage(
    store_fd: int, stage_name: str, expected: os.stat_result
) -> None:
    try:
        current = os.stat(stage_name, dir_fd=store_fd, follow_symlinks=False)
    except FileNotFoundError:
        return
    if not stat.S_ISREG(current.st_mode) or not _same_file(current, expected):
        raise ManifestPublishError(
            "refusing to remove a stage path that is no longer the created file"
        )
    os.unlink(stage_name, dir_fd=store_fd)
    os.fsync(store_fd)


def publish_manifest(
    source: str,
    release_store: str,
    release_dir: str,
    stage_name: str,
    before_replace: Callable[[], None] | None = None,
) -> dict[str, str | int]:
    """Durably replace one release's existing ``deployment.json``.

    ``before_replace`` is an import-only test seam. The CLI intentionally does
    not expose a corresponding failure option.
    """

    store_fd, release_fd, release_name, opened_release = (
        _open_managed_directories(release_store, release_dir)
    )
    source_fd = -1
    stage_fd = -1
    staged_identity: os.stat_result | None = None
    byte_count = 0
    try:
        stage_name = _stage_name(stage_name, release_name)
        destination = _destination_identity(release_fd)
        source_fd = _open_source(source)
        stage_flags = (
            os.O_WRONLY
            | os.O_CREAT
            | os.O_EXCL
            | os.O_CLOEXEC
            | _require_nofollow()
        )
        try:
            stage_fd = os.open(
                stage_name,
                stage_flags,
                0o600,
                dir_fd=store_fd,
            )
        except OSError as error:
            raise ManifestPublishError(
                f"cannot create exclusive manifest stage: {error.strerror}"
            ) from error

        staged_identity = os.fstat(stage_fd)
        if not stat.S_ISREG(staged_identity.st_mode):
            raise ManifestPublishError("manifest stage must be a regular file")
        byte_count = _copy_bytes(source_fd, stage_fd)
        os.fchmod(stage_fd, 0o664)
        os.fsync(stage_fd)

        _require_pinned_release_directory(
            store_fd, release_name, opened_release
        )
        _require_same_destination(release_fd, destination)
        _require_owned_stage(store_fd, stage_name, staged_identity)
        if before_replace is not None:
            before_replace()
        os.replace(
            stage_name,
            MANIFEST_NAME,
            src_dir_fd=store_fd,
            dst_dir_fd=release_fd,
        )
        staged_identity = None
        os.fsync(release_fd)
        os.fsync(store_fd)
    except BaseException as error:
        cleanup_error: BaseException | None = None
        if staged_identity is not None:
            try:
                _cleanup_owned_stage(store_fd, stage_name, staged_identity)
            except BaseException as observed_cleanup_error:
                cleanup_error = observed_cleanup_error
        if cleanup_error is not None:
            raise ManifestPublishError(
                f"manifest publication failed and stage cleanup failed: {cleanup_error}"
            ) from error
        raise
    finally:
        if stage_fd >= 0:
            os.close(stage_fd)
        if source_fd >= 0:
            os.close(source_fd)
        os.close(release_fd)
        os.close(store_fd)

    return {
        "operation": "publish",
        "bytes": byte_count,
        "releaseDir": release_dir,
        "target": os.path.join(release_dir, MANIFEST_NAME),
        "mode": "0664",
    }


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    publish_parser = subparsers.add_parser("publish")
    publish_parser.add_argument("--source", required=True)
    publish_parser.add_argument("--release-store", required=True)
    publish_parser.add_argument("--release-dir", required=True)
    publish_parser.add_argument("--stage-name", required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    arguments = _parser().parse_args(argv)
    try:
        result = publish_manifest(
            arguments.source,
            arguments.release_store,
            arguments.release_dir,
            arguments.stage_name,
        )
    except (ManifestPublishError, OSError) as error:
        print(f"atomic release manifest rejected: {error}", file=sys.stderr)
        return 2
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
