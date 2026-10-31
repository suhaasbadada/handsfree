"""Reproduce only the approved Clean pair; derive finish from its exact PCM.

Stdlib translation of external audition generate.py (Clean only). Pinned full
file SHA proves equivalence to 01-clean-pair.wav. No playback or dependencies.
"""
import argparse
import hashlib
import io
import math
from pathlib import Path
import struct
import wave

SR = 48000
APPROVED_SHA256 = 'a1eb8aeadfc425a5a217e3d35732762571c16d7e03969a5f3b0bfe41dbde6856'


def wav(samples):
    buffer = io.BytesIO()
    with wave.open(buffer, 'wb') as output:
        output.setparams((1, 2, SR, 0, 'NONE', 'not compressed'))
        output.writeframes(struct.pack('<' + 'h' * len(samples), *samples))
    return buffer.getvalue()


def generate():
    grain = []
    for i in range(3840):
        t = i / SR
        attack = math.sin(min(t / .006, 1) * math.pi / 2) ** 2
        release = math.cos(max(t - .060, 0) / (.020 - 1 / SR) * math.pi / 2) ** 2
        if i == 3839:
            release = 0

        def envelope(decay):
            return attack * math.exp(-(max(t - .006, 0) / decay) ** 2) * release

        grain.append((.82 * math.sin(2 * math.pi * 820 * t)
                      + .13 * math.sin(2 * math.pi * 1230 * t)) * envelope(.017)
                     + .12 * math.sin(2 * math.pi * 1550 * t) * envelope(.006))
    grain[0] = grain[-1] = 0
    peak = max(map(abs, grain))
    unit = [round(value / peak * 10 ** (-10 / 20) * 32767) for value in grain]
    start = [0] * 11520
    for onset in (960, 5760):
        start[onset:onset + 3840] = unit
    result = wav(start)
    assert hashlib.sha256(result).hexdigest() == APPROVED_SHA256, 'Approved audition must be byte-exact'
    # Slice approved start PCM; never independently synthesize or boost finish.
    finish = wav([0] * 960 + start[960:4800] + [0] * 960)
    return result, finish


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1] / 'src-tauri/native/assets/sounds'
    for name, data in zip(('listening.wav', 'ending.wav'), generate()):
        path = root / name
        if args.check:
            assert path.read_bytes() == data, f'{name} differs from approved PCM'
        else:
            path.write_bytes(data)
        print(f'{name}: SHA256 {hashlib.sha256(data).hexdigest()}')
