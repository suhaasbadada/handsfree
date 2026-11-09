import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('updater archive safely extracts app-only paths and refuses traversal, links and special files', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'handsfree-archive-test-'));
  try {
    const result = spawnSync('python3', ['-B', '-c', `
import importlib.util, io, pathlib, sys, tarfile
spec = importlib.util.spec_from_file_location('audit', sys.argv[1])
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)
root = pathlib.Path(sys.argv[2])
cases = [
 [('HandsFree.app/', 'dir', ''), ('HandsFree.app/Contents/test', 'file', ''), ('HandsFree.app/link', 'link', 'Contents/test')],
 [('/HandsFree.app/bad', 'file', '')],
 [('HandsFree.app/../bad', 'file', '')],
 [('other/file', 'file', '')],
 [('HandsFree.app/link', 'link', '../../outside')],
 [('HandsFree.app/link', 'link', '/absolute')],
 [('HandsFree.app/a', 'link', '.'), ('HandsFree.app/b', 'link', 'a/../outside')],
 [('HandsFree.app/link', 'link', 'Contents'), ('HandsFree.app/link/test', 'file', '')],
 [('HandsFree.app/fifo', 'fifo', '')],
 [('HandsFree.app/file', 'file', ''), ('HandsFree.app/file', 'file', '')],
 [('HandsFree.app/file', 'hardlink', 'HandsFree.app/other')],
]
for index, members in enumerate(cases):
 archive = root / f'{index}.tar.gz'
 with tarfile.open(archive, 'w:gz') as tar:
  for name, kind, target in members:
   member = tarfile.TarInfo(name)
   member.mode = 0o755 if kind == 'dir' else 0o644
   member.type = {'dir': tarfile.DIRTYPE, 'file': tarfile.REGTYPE, 'link': tarfile.SYMTYPE, 'fifo': tarfile.FIFOTYPE, 'hardlink': tarfile.LNKTYPE}[kind]
   member.linkname = target
   member.size = 4 if kind == 'file' else 0
   tar.addfile(member, io.BytesIO(b'test') if kind == 'file' else None)
 destination = root / f'extract-{index}'
 try:
  audit.extract(archive, destination)
 except ValueError:
  assert index != 0, 'valid app archive rejected'
  assert not list(destination.iterdir()), 'unsafe archive wrote before validation'
 else:
  assert index == 0, f'unsafe case accepted: {index}'
  assert (destination / 'HandsFree.app/Contents/test').read_bytes() == b'test'
  assert (destination / 'HandsFree.app/link').read_bytes() == b'test'
print('archive validation cases passed')
`, fileURLToPath(new URL('../scripts/check-updater-archive.py', import.meta.url)), temporary], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /archive validation cases passed/);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});
