"""
K-LEAN Shared Utilities

Shared helpers used by klean-utility-update.py and klean-consolidate.py.
Centralizes path resolution, file locking, and backup rotation to prevent
duplication and ensure consistent behavior across both scripts.
"""

import glob
import os
import time
from pathlib import Path


def get_kb_path():
    """Find the knowledge database.

    Checks project-local .knowledge-db/entries.jsonl first, then falls
    back to the canonical LocalAgent location.

    Returns a Path if found, None otherwise.
    """
    local = Path(".knowledge-db/entries.jsonl")
    if local.exists():
        return local
    fallback = Path("C:/LocalAgent/.knowledge-db/entries.jsonl")
    if fallback.exists():
        return fallback
    return None


def acquire_lock(lock_path, timeout=10):
    """Acquire a file lock using a sentinel file.

    Uses O_CREAT | O_EXCL for atomic creation — only one process succeeds.
    Polls every 100ms until the lock is acquired or timeout expires.

    Args:
        lock_path: Path or str to the lock sentinel file.
        timeout: Seconds to wait before giving up.

    Returns:
        True if lock acquired, False if timeout elapsed.
    """
    start = time.time()
    while time.time() - start < timeout:
        try:
            fd = os.open(str(lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, str(os.getpid()).encode())
            os.close(fd)
            return True
        except FileExistsError:
            time.sleep(0.1)
    return False


def release_lock(lock_path):
    """Release a file lock by removing the sentinel file.

    Silently ignores errors — if the lock file is already gone, that is
    not a problem (another process may have cleaned it up after a crash).

    Args:
        lock_path: Path or str to the lock sentinel file.
    """
    try:
        os.unlink(str(lock_path))
    except OSError:
        pass


def rotate_backups(kb_path, max_backups=5):
    """Keep only the N most recent backup files, deleting older ones.

    Prevents unbounded accumulation of backup files when save_entries()
    is called repeatedly (e.g., during --decay or --batch runs).

    Args:
        kb_path: Path to the entries.jsonl file (not the backup itself).
        max_backups: Maximum number of backup files to retain.
    """
    pattern = str(kb_path) + ".backup-*"
    backups = sorted(glob.glob(pattern), key=os.path.getmtime, reverse=True)
    for old in backups[max_backups:]:
        try:
            os.unlink(old)
        except OSError:
            pass
