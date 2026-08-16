"""Single entry point for refreshing the site's data.

    python pipeline/update.py               # fetch, rebuild, validate
    python pipeline/update.py --commit      # ... and commit + push if changed
    python pipeline/update.py --offline     # skip the OGD cross-check

Runs the same way locally and inside the scheduled GitHub Action. Validation is
not optional: a build that fails its checks is never committed, because a silent
upstream change is exactly the failure mode worth guarding against.
"""

from __future__ import annotations

import pathlib
import subprocess
import sys

import build_data
import validate

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data"


def run(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, cwd=ROOT, capture_output=True, text=True)


def changed_files() -> list[str]:
    result = run("git", "status", "--porcelain", "--", str(DATA.relative_to(ROOT)))
    return [line[3:].strip() for line in result.stdout.splitlines() if line.strip()]


def commit_and_push(vintage: str | None) -> int:
    files = changed_files()
    if not files:
        print("\nNo data changes - nothing to commit.")
        return 0

    print(f"\n{len(files)} changed file(s):")
    for path in files:
        print(f"  {path}")

    message = f"data: refresh from Statistik Austria ({vintage or 'unknown vintage'})"
    for command in (
        ("git", "add", "--", str(DATA.relative_to(ROOT))),
        ("git", "commit", "-m", message),
        ("git", "push"),
    ):
        result = run(*command)
        if result.returncode != 0:
            print(f"\nFAILED: {' '.join(command)}\n{result.stderr.strip()}")
            return result.returncode
        print(f"  ok: {' '.join(command[:2])}")

    return 0


def main() -> int:
    offline = "--offline" in sys.argv
    force = "--force" in sys.argv

    print("=" * 62)
    print("Building data")
    print("=" * 62)
    if build_data.main(force=force) != 0:
        return 1

    print("\n" + "=" * 62)
    print("Validating")
    print("=" * 62)
    argv = list(sys.argv)
    sys.argv = ["validate.py"] + (["--offline"] if offline else [])
    try:
        if validate.main() != 0:
            print("\nValidation failed - refusing to publish this build.")
            return 1
    finally:
        sys.argv = argv

    if "--commit" in sys.argv:
        manifest = build_data.json.loads((DATA / "manifest.json").read_text(encoding="utf-8"))
        return commit_and_push(manifest.get("source_vintage"))

    print("\nDone. Re-run with --commit to publish.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
