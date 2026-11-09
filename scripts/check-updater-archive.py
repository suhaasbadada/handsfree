"""Validate and extract a signed updater payload into an empty audit directory."""
import pathlib
import posixpath
import sys
import tarfile


def extract(archive, destination):
    destination = pathlib.Path(destination)
    destination.mkdir()  # Never extract over existing files or links.
    with tarfile.open(archive, 'r:gz') as tar:
        members = tar.getmembers()
        seen, links = set(), set()
        for member in members:
            path = pathlib.PurePosixPath(member.name)
            if (path.is_absolute() or '..' in path.parts or '\\' in member.name
                    or not path.parts or path.parts[0] != 'HandsFree.app'
                    or path in seen or not (member.isdir() or member.isfile() or member.issym())):
                raise ValueError(f'Unsafe updater archive member: {member.name}')
            seen.add(path)
            if member.issym():
                target = pathlib.PurePosixPath(member.linkname)
                resolved = pathlib.PurePosixPath(posixpath.normpath(str(path.parent / target)))
                # Reject parent components even if lexical normalization appears
                # internal: traversing another symlink before '..' can escape.
                if (target.is_absolute() or '..' in target.parts or '\\' in member.linkname or not resolved.parts
                        or resolved.parts[0] != 'HandsFree.app' or '..' in resolved.parts):
                    raise ValueError(f'Unsafe updater archive link: {member.name}')
                links.add(path)
        if any(parent in links for path in seen for parent in path.parents):
            raise ValueError('Updater archive writes beneath a symlink')
        # All paths, link targets and member types were checked before any write.
        tar.extractall(destination, members=members)


if __name__ == '__main__':
    extract(*sys.argv[1:])
