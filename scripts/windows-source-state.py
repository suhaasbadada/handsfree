#!/usr/bin/env python3
"""Guard clean build source and restore only Tauri's known platform feature rewrite.

The historical filename is retained for Windows packaging callers.
"""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tomllib

MANIFEST = "src-tauri/Cargo.toml"
MAC_TARGET = 'cfg(target_os = "macos")'
ROOT = Path(__file__).resolve().parent.parent


def git(root, *arguments):
    return subprocess.check_output(["git", *arguments], cwd=root)


def status(root):
    return git(root, "status", "--porcelain=v1", "-z", "--untracked-files=all")


def mac_features(document):
    return document["target"][MAC_TARGET]["dependencies"]["tauri"]["features"]


def snapshot(root, state, platform="windows"):
    if status(root):
        raise ValueError("Build requires a clean worktree, including untracked files.")
    original = (root / MANIFEST).read_bytes()
    document = tomllib.loads(original.decode("utf-8"))
    if mac_features(document) != ["macos-private-api"]:
        raise ValueError("Expected the protected Mac-only macos-private-api feature.")
    if "macos-private-api" in document["dependencies"]["tauri"].get("features", []):
        raise ValueError("macos-private-api must not be enabled in common dependencies.")
    receipt = {
        "platform": platform,
        "commit": git(root, "rev-parse", "HEAD").decode().strip(),
        "tree": git(root, "rev-parse", "HEAD^{tree}").decode().strip(),
        "manifest_base64": base64.b64encode(original).decode("ascii"),
        "manifest_sha256": hashlib.sha256(original).hexdigest(),
    }
    state.parent.mkdir(parents=True, exist_ok=True)
    with state.open("x", encoding="utf-8") as output:
        json.dump(receipt, output, indent=2)
    print(receipt["manifest_sha256"])


def restore(root, state, platform="windows"):
    receipt = json.loads(state.read_text(encoding="utf-8"))
    if receipt.get("platform", "windows") != platform:
        raise ValueError("Source snapshot platform mismatch.")
    original = base64.b64decode(receipt["manifest_base64"], validate=True)
    if hashlib.sha256(original).hexdigest() != receipt["manifest_sha256"]:
        raise ValueError("Source snapshot checksum mismatch; preserving all build evidence.")
    for key, revision in (("commit", "HEAD"), ("tree", "HEAD^{tree}")):
        if git(root, "rev-parse", revision).decode().strip() != receipt[key]:
            raise ValueError("Source revision changed during build; preserving all build evidence.")
    # Accept only an unstaged modification of this one file. Never reset, checkout,
    # or hide staged changes, untracked files, lockfile changes, or other edits.
    if status(root) not in (b"", b" M src-tauri/Cargo.toml\0"):
        raise ValueError("Unexpected build changes; preserving manifest and source snapshot.")
    manifest = root / MANIFEST
    current = manifest.read_bytes()
    note = "None (Cargo.toml unchanged)."
    if current != original:
        before = tomllib.loads(original.decode("utf-8"))
        after = tomllib.loads(current.decode("utf-8"))
        if platform == "macos":
            common = before["dependencies"]["tauri"]["features"]
            rewritten = after["dependencies"]["tauri"]["features"]
            if (mac_features(after) != ["macos-private-api"]
                    or rewritten.count("macos-private-api") != 1
                    or [feature for feature in rewritten if feature != "macos-private-api"] != common):
                raise ValueError("Unrecognized Tauri feature rewrite; preserving changed manifest.")
            after["dependencies"]["tauri"]["features"] = common
        else:
            if mac_features(before) != ["macos-private-api"] or mac_features(after) != []:
                raise ValueError("Unrecognized Tauri feature rewrite; preserving changed manifest.")
            after["target"][MAC_TARGET]["dependencies"]["tauri"]["features"] = ["macos-private-api"]
        if after != before:
            raise ValueError("Tauri changed additional manifest semantics; preserving changed manifest.")
        manifest.write_bytes(original)
        note = (
            "Tauri CLI added only common tauri macos-private-api, already enabled by cfg(macos); "
            "all other TOML fields were identical. Original Cargo.toml bytes restored after validation; "
            "Mac-resolved dependencies unchanged."
        ) if platform == "macos" else (
            "Tauri CLI removed only inactive cfg(macos) tauri macos-private-api; "
            "all other TOML fields (including common/Windows dependencies) were identical. "
            "Original Cargo.toml bytes restored after validation; Windows-resolved dependencies unchanged."
        )
    if manifest.read_bytes() != original or status(root):
        raise ValueError("Post-build source is not byte-restored and clean; candidate rejected.")
    print(note)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["snapshot", "restore"])
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--platform", choices=["windows", "macos"], default="windows")
    args = parser.parse_args()
    try:
        if args.operation == "snapshot":
            snapshot(args.root.resolve(), args.state.resolve(), args.platform)
        else:
            restore(args.root.resolve(), args.state.resolve(), args.platform)
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as error:
        print(f"{args.platform} source guard: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
