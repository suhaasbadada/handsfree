#!/usr/bin/env python3
"""Separate public release asset checksums from the complete CI artifact audit."""
import argparse
import hashlib
import sys
from pathlib import Path


PUBLIC_FILES = (
    'HandsFree-0.1.1-windows-x64-setup.exe',
    'APP-DEPENDENCIES.json',
    'PROVENANCE.txt',
    'THIRD_PARTY_SOURCES.tar.gz',
    'LICENSE',
)
PUBLIC_MANIFEST = 'SHA256SUMS'
BUILD_MANIFEST = 'BUILD-SHA256SUMS'


def checksum(root, relative):
    digest = hashlib.sha256((root / relative).read_bytes()).hexdigest()
    return f'{digest}  {relative}\n'


def generate(root):
    if root.is_symlink() or not root.is_dir():
        raise ValueError('Expected a real candidate directory')
    for name in (PUBLIC_MANIFEST, BUILD_MANIFEST):
        if (root / name).exists() or (root / name).is_symlink():
            raise ValueError(f'Refusing to overwrite {name}')
    files = []
    for path in root.rglob('*'):
        relative = path.relative_to(root).as_posix()
        if path.is_symlink():
            raise ValueError(f'Symlinks forbidden: {relative}')
        if any(char in relative for char in '\r\n\t\\:') or any(part in ('.', '..') for part in relative.split('/')):
            raise ValueError(f'Unsafe checksum path: {relative!r}')
        if path.is_file():
            files.append(relative)
        elif not path.is_dir():
            raise ValueError(f'Non-regular artifact entry: {relative}')
    missing = set(PUBLIC_FILES) - set(files)
    if missing:
        raise ValueError('Missing public assets: ' + ', '.join(sorted(missing)))
    (root / PUBLIC_MANIFEST).write_text(''.join(checksum(root, name) for name in PUBLIC_FILES), encoding='utf-8', newline='\n')
    # Includes the public manifest and hidden/nested notices, but not itself.
    (root / BUILD_MANIFEST).write_text(''.join(checksum(root, name) for name in sorted(files + [PUBLIC_MANIFEST])), encoding='utf-8', newline='\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    args = parser.parse_args()
    try:
        generate(args.directory)
    except (OSError, ValueError) as error:
        print(f'Windows artifact checksum generation failed: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
