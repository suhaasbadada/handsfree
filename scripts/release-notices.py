#!/usr/bin/env python3
"""Create an offline, conservative dependency notice/source inventory."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tarfile
import tomllib

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("output", type=Path)
parser.add_argument("--target", choices=["aarch64-apple-darwin", "x86_64-pc-windows-msvc"],
                    default="aarch64-apple-darwin")
args = parser.parse_args()
OUTPUT = args.output.resolve()
NOTICES = OUTPUT / "THIRD_PARTY_NOTICES"
NOTICES.mkdir(parents=True, exist_ok=False)


def command(*args):
    return subprocess.check_output(args, cwd=ROOT, text=True, encoding="utf-8")


def copy_notice(source, destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)


metadata = json.loads(command(
    "cargo", "metadata", "--manifest-path", "src-tauri/Cargo.toml", "--locked",
    "--offline", "--filter-platform", args.target, "--format-version", "1",
))
inventory = []
missing = []
locked_packages = tomllib.loads((ROOT / "src-tauri/Cargo.lock").read_text(encoding="utf-8"))["package"]
checksums = {(p["name"], p["version"], p.get("source")): p.get("checksum")
             for p in locked_packages}
with tarfile.open(OUTPUT / "THIRD_PARTY_SOURCES.tar.gz", "w:gz") as archive:
    for package in sorted(metadata["packages"], key=lambda p: (p["name"], p["version"])):
        if package["source"] is None:
            if package["name"] != "handsfree":
                raise RuntimeError("Unexpected local dependency: " + package["name"])
            continue
        if not package["source"].startswith("registry+"):
            raise RuntimeError("Non-registry dependency requires review: " + package["id"])
        source = Path(package["manifest_path"]).parent
        name = f'{package["name"]}-{package["version"]}'
        # Only registry sources: never repository, HOME, model, keychain, or app data.
        checksum = checksums[(package["name"], package["version"], package["source"])]
        crate = source.parents[2] / "cache" / source.parent.name / f"{name}.crate"
        if not checksum or hashlib.sha256(crate.read_bytes()).hexdigest() != checksum:
            raise RuntimeError("Registry archive differs from Cargo.lock: " + str(crate))
        # Read only verified original registry bytes, not local source additions.
        # Public upstream test fixtures are not the user's credentials.
        original = tarfile.open(crate)
        notices = []
        for member in original.getmembers():
            parts = Path(member.name).parts
            if (not parts or parts[0] != name or '..' in parts
                    or not (member.isfile() or member.isdir())):
                raise RuntimeError("Unexpected registry archive path: " + member.name)
            member.name = "cargo/" + member.name
            archive.addfile(member, original.extractfile(member) if member.isfile() else None)
            relative = Path(*parts[1:])
            if member.isfile() and any(word in relative.name.lower() for word in (
                "license", "licence", "copying", "copyright", "notice",
            )):
                destination = NOTICES / "cargo" / name / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(original.extractfile(member).read())
                notices.append(str(relative))
        if not package["license"]:
            raise RuntimeError("Missing license declaration: " + name)
        if not notices:
            missing.append(name)
        original.close()
        inventory.append({key: package[key] for key in (
            "name", "version", "id", "license", "authors", "repository", "source",
        )} | {"cargo_checksum": checksum, "notice_files": notices,
             "corresponding_source": f"cargo/{name}"})

    api = ROOT / "node_modules/@tauri-apps/api"
    info = json.loads((api / "package.json").read_text())
    lock = json.loads((ROOT / "package-lock.json").read_text())
    locked = lock["packages"]["node_modules/@tauri-apps/api"]
    if info["version"] != locked["version"]:
        raise RuntimeError("Installed frontend API differs from package-lock.json")
    archive.add(api, arcname=f'frontend/tauri-api-{info["version"]}')
    api_notices = list(api.glob("LICENSE*"))
    if not api_notices:
        raise RuntimeError("Frontend API has no license files")
    for file in api_notices:
        copy_notice(file, NOTICES / "frontend" / file.name)
    inventory.append({"name": info["name"], "version": info["version"],
                      "license": info["license"], "repository": info["repository"],
                      "npm_integrity": locked["integrity"]})

supplements = ROOT / "docs/licenses"
shutil.copytree(supplements, NOTICES / "upstream-supplements")
rustdoc = Path(command("rustc", "--print", "sysroot").strip()) / "share/doc/rust"
copy_notice(rustdoc / "COPYRIGHT-library.html", NOTICES / "rust/COPYRIGHT-library.html")
shutil.copytree(rustdoc / "licenses", NOTICES / "rust/licenses")
(NOTICES / "rust/VERSION.txt").write_text(command("rustc", "--version", "--verbose"), encoding="utf-8")
(NOTICES / "inventory.json").write_text(json.dumps(inventory, indent=2) + "\n", encoding="utf-8")
copy_notice(ROOT / "docs/RELEASING.md", NOTICES / "LICENSING-AND-DISTRIBUTION.md")
if args.target == "x86_64-pc-windows-msvc":
    copy_notice(ROOT / "docs/WINDOWS.md", NOTICES / "WINDOWS-BETA.md")
    shutil.copytree(ROOT / "scripts/windows-licenses", NOTICES / "windows-supplements")
(NOTICES / "README.txt").write_text(
    "HandsFree third-party inventory\n\n"
    "This is an over-inclusive platform dependency set, including build tools.\n"
    "inventory.json contains exact versions, declared licenses and provenance.\n"
    "Original notice files are under cargo/, frontend/, rust/, upstream-supplements/.\n"
    "All Cargo and frontend API sources are in ../THIRD_PARTY_SOURCES.tar.gz,\n"
    "including inline notices, whisper.cpp/ggml, and MPL corresponding source.\n"
    "MPL source is unmodified, available here under its original MPL-2.0 terms.\n"
    "HandsFree's own code is MIT licensed; see ../LICENSE.\n"
    "That grant does not relicense these dependencies. No model is included.\n\n"
    + ("Experimental Windows beta; unsigned, not Microsoft approved.\n"
       if args.target == "x86_64-pc-windows-msvc" else
       "Experimental beta; self-signed, not Developer ID signed or notarized.\n") +
    "Upstream license texts and historical SDK-derived-bindings caveat are\n"
    "preserved. Notice completeness is not legally certified. See\n"
    "LICENSING-AND-DISTRIBUTION.md and upstream-supplements/README.md.\n\n"
    "Crates without standalone license files (source notices and/or supplements\n"
    "are provided; declarations alone do not resolve upstream uncertainty):\n"
    + "\n".join(missing) + "\n", encoding="utf-8"
)
print(f"Inventoried {len(inventory)} third-party packages; full source copies included.")
print("Experimental beta notices: see THIRD_PARTY_NOTICES/README.txt")
