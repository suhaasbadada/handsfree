#!/usr/bin/env python3
"""Fail-closed direct/delay PE import gate for the Windows x64 app (stdlib only)."""
import argparse
import hashlib
import json
import re
import struct
import sys
from pathlib import Path


# Explicit Windows 10/11 system components, not a general DLL search-path policy.
# API sets below are OS loader contracts. No vendor/app-local DLL is allowed.
OS_DLLS = frozenset("""
advapi32.dll bcrypt.dll bcryptprimitives.dll combase.dll comctl32.dll comdlg32.dll
crypt32.dll dbghelp.dll dwmapi.dll gdi32.dll hid.dll imm32.dll iphlpapi.dll
kernel32.dll msimg32.dll msvcrt.dll normaliz.dll ntdll.dll ole32.dll oleaut32.dll
powrprof.dll propsys.dll rpcrt4.dll secur32.dll setupapi.dll shell32.dll shlwapi.dll
ucrtbase.dll uiautomationcore.dll user32.dll version.dll windows.storage.dll
winhttp.dll winmm.dll ws2_32.dll
""".split())


class InvalidPE(ValueError):
    pass


class PE:
    def __init__(self, data):
        self.data = data
        if self.take(0, 2) != b'MZ':
            raise InvalidPE('Missing MZ signature')
        pe = self.unpack('<I', 0x3c)[0]
        if pe < 64 or self.take(pe, 4) != b'PE\0\0':
            raise InvalidPE('Invalid PE signature/offset')
        machine, count = self.unpack('<HH', pe + 4)
        optional_size = self.unpack('<H', pe + 20)[0]
        opt = pe + 24
        self.take(opt, optional_size)
        if machine != 0x8664 or self.unpack('<H', opt)[0] != 0x20b:
            raise InvalidPE('Expected AMD64 PE32+ executable')
        if optional_size < 112 or not 1 <= count <= 96:
            raise InvalidPE('Invalid optional header/section count')
        self.headers = self.unpack('<I', opt + 60)[0]
        if self.headers > len(data) or self.headers < opt + optional_size + count * 40:
            raise InvalidPE('Invalid SizeOfHeaders')
        directories = self.unpack('<I', opt + 108)[0]
        if directories > (optional_size - 112) // 8:
            raise InvalidPE('Data directories exceed optional header')
        self.directories = [self.unpack('<II', opt + 112 + i * 8) for i in range(directories)]
        self.sections = []
        for i in range(count):
            section = opt + optional_size + i * 40
            virtual_size, rva, raw_size, raw = self.unpack('<IIII', section + 8)
            self.take(raw, raw_size)
            end = rva + max(virtual_size, raw_size)
            if rva < self.headers or end > 0x100000000:
                raise InvalidPE('Invalid section virtual bounds')
            if any(rva < other_end and other_start < end for other_start, other_end, _, _ in self.sections):
                raise InvalidPE('Overlapping virtual sections')
            self.sections.append((rva, end, raw, raw_size))

    def take(self, offset, size):
        if offset < 0 or size < 0 or offset + size > len(self.data):
            raise InvalidPE('File bounds exceeded')
        return self.data[offset:offset + size]

    def unpack(self, fmt, offset):
        return struct.unpack(fmt, self.take(offset, struct.calcsize(fmt)))

    def mapped(self, rva, size):
        if rva <= 0 or size <= 0 or rva + size > 0x100000000:
            raise InvalidPE('Invalid RVA range')
        if rva < self.headers and rva + size <= self.headers:
            return rva, self.headers - rva
        for start, _, raw, raw_size in self.sections:
            if start <= rva and rva + size <= start + raw_size:
                return raw + rva - start, raw_size - (rva - start)
        raise InvalidPE('RVA is not backed by file bytes')

    def dll_name(self, rva):
        offset, available = self.mapped(rva, 1)
        value = self.take(offset, min(available, 261)).split(b'\0', 1)
        if len(value) != 2:
            raise InvalidPE('Unterminated DLL name')
        try:
            name = value[0].decode('ascii').lower()
        except UnicodeDecodeError as error:
            raise InvalidPE('Non-ASCII DLL name') from error
        if not re.fullmatch(r'[a-z0-9_][a-z0-9_.-]*\.(dll|drv)', name):
            raise InvalidPE('Invalid DLL basename (paths are forbidden)')
        return name

    def imports(self, index, delay=False):
        if index >= len(self.directories):
            return []
        rva, size = self.directories[index]
        if rva == size == 0:
            return []
        width = 32 if delay else 20
        if size < width:
            raise InvalidPE('Truncated import directory')
        offset, _ = self.mapped(rva, size)
        names = set()
        for cursor in range(0, size - width + 1, width):
            fields = self.unpack('<' + 'I' * (width // 4), offset + cursor)
            if not any(fields):
                return sorted(names)
            if delay and fields[0] != 1:
                raise InvalidPE('Delay imports must use RVA addressing')
            names.add(self.dll_name(fields[1] if delay else fields[3]))
        raise InvalidPE('Unterminated import directory')


def inspect(path):
    data = path.read_bytes()
    pe = PE(data)
    normal, delay = pe.imports(1), pe.imports(13, delay=True)
    if not normal:
        raise InvalidPE('Expected a nonempty app import directory')
    imports = sorted(set(normal + delay))
    forbidden = [name for name in imports if re.match(r'(msvcp\d|msvcr\d|vcruntime\d|concrt\d|vcomp\d)', name)]
    if forbidden:
        raise InvalidPE('Redistributable CRT imports forbidden: ' + ', '.join(forbidden))
    unknown = [name for name in imports if name not in OS_DLLS and not re.fullmatch(r'(api-ms-win|ext-ms-win)-[a-z0-9_-]+\.dll', name)]
    if unknown:
        raise InvalidPE('Non-allowlisted imports: ' + ', '.join(unknown))
    return {
        'schema': 1, 'file': path.name, 'sha256': hashlib.sha256(data).hexdigest(),
        'architecture': 'AMD64', 'format': 'PE32+', 'normal_imports': normal,
        'delay_imports': delay, 'policy': 'Windows 10/11 OS DLLs/API sets only; no redistributable CRT',
        'result': 'pass',
        'limitations': 'Direct and delay imports only; not a runtime/load-library or installer acceptance test.',
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('exe', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    try:
        report = inspect(args.exe)
        args.output.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    except (OSError, InvalidPE, struct.error) as error:
        print(f'Windows PE dependency gate failed: {error}', file=sys.stderr)
        return 1
    print(f'Windows PE dependency gate passed: {args.exe} ({len(report["normal_imports"])} normal, {len(report["delay_imports"])} delay)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
