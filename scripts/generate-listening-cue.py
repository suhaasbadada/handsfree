"""Reproduce approved Clean/Warm end pairs; derive start from exact first PCM.

Stdlib translation of external audition generate.py (both profiles). Pinned full
file SHAs prove equivalence to the external auditions. No playback or dependencies.
"""
import argparse
import hashlib
import io
import math
from pathlib import Path
import struct
import wave

SR = 48000
APPROVED_SHA256 = {
    'clean': 'a1eb8aeadfc425a5a217e3d35732762571c16d7e03969a5f3b0bfe41dbde6856',
    'warm': '0e59d9fd1a43491f6193760ce55eb96807c6b6b08e7549f1e8d3b760eff416b8',
}


def wav(samples):
    buffer = io.BytesIO()
    with wave.open(buffer, 'wb') as output:
        output.setparams((1, 2, SR, 0, 'NONE', 'not compressed'))
        output.writeframes(struct.pack('<' + 'h' * len(samples), *samples))
    return buffer.getvalue()


def generate(profile):
    fundamental, harmonic, transient, a, b, c = ((820, 1230, 1550, .82, .13, .12)
        if profile == 'clean' else (620, 930, 1240, .86, .16, .10))
    grain = []
    for i in range(3840):
        t = i / SR
        attack = math.sin(min(t / .006, 1) * math.pi / 2) ** 2
        release = math.cos(max(t - .060, 0) / (.020 - 1 / SR) * math.pi / 2) ** 2
        if i == 3839:
            release = 0

        def envelope(decay):
            return attack * math.exp(-(max(t - .006, 0) / decay) ** 2) * release

        grain.append((a * math.sin(2 * math.pi * fundamental * t)
                      + b * math.sin(2 * math.pi * harmonic * t)) * envelope(.017)
                     + c * math.sin(2 * math.pi * transient * t) * envelope(.006))
    grain[0] = grain[-1] = 0
    peak = max(map(abs, grain))
    unit = [round(value / peak * 10 ** (-10 / 20) * 32767) for value in grain]
    start = [0] * 11520
    for onset in (960, 5760):
        start[onset:onset + 3840] = unit
    result = wav(start)
    assert hashlib.sha256(result).hexdigest() == APPROVED_SHA256[profile], 'Approved audition must be byte-exact'
    # Slice approved pair PCM; never independently synthesize or boost start.
    finish = wav([0] * 960 + start[960:4800] + [0] * 960)
    return finish, result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1] / 'src-tauri/native/assets/sounds'
    for profile in APPROVED_SHA256:
        for role, data in zip(('start', 'end'), generate(profile)):
            name = f'{profile}-{role}.wav'
            path = root / name
            if args.check:
                assert path.read_bytes() == data, f'{name} differs from approved PCM'
            else:
                path.write_bytes(data)
            print(f'{name}: SHA256 {hashlib.sha256(data).hexdigest()}')
