"""Make GenVM linter bundles available to the direct test runner.

The direct runner still requests the old ``genvm-universal.tar.xz`` release
asset name. The linter understands the renamed bundle and has already fetched
it, so mirror its cached bundle instead of making the direct runner download it
again.
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source",
        type=Path,
        default=Path.home() / ".cache" / "genvm-linter",
        help="genvm-linter artifact cache",
    )
    parser.add_argument(
        "--destination",
        type=Path,
        default=Path.home() / ".cache" / "gltest-direct",
        help="genlayer-test direct runner cache",
    )
    args = parser.parse_args()

    bundles = sorted(args.source.glob("genvm-universal-*.tar.xz"))
    if not bundles:
        parser.error(f"No cached GenVM bundles found in {args.source}; run genvm-lint check first")

    args.destination.mkdir(parents=True, exist_ok=True)
    copied = 0
    for bundle in bundles:
        target = args.destination / bundle.name
        if target.exists() and target.stat().st_size == bundle.stat().st_size:
            continue
        shutil.copy2(bundle, target)
        copied += 1

    print(f"GenVM test cache ready ({len(bundles)} bundle(s), {copied} copied).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
