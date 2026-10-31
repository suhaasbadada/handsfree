"""Reproduce the exact approved Bright glass audition (Python 3 stdlib only).

One original synthetic grain, two equal-gain impulses 100 ms apart.
No system/third-party audio, second-strike accent, or separate chime layer.
"""
import argparse
import hashlib
import io
import math
from pathlib import Path
import random
import struct
import wave

SR = 48000
LEAD = TRAIL = 960
GAP = 4800
APPROVED_SHA256 = '909f8fe9f672f201f9040321a319e5a4351a105a70ead33a57b107a5cfe81462'


def grain():
    count = 7680  # 160 ms
    fundamental, brightness = 1174.659, 0.22
    rng = random.Random(805)
    smooth = 0.0
    values = []
    for i in range(count):
        t = i / SR
        attack = 1 - math.exp(-t / 0.0018)
        noise = rng.uniform(-1, 1)
        smooth += 0.28 * (noise - smooth)
        dry_tap = (noise - smooth) * math.exp(-t / 0.0045)
        body = math.sin(2 * math.pi * fundamental * t) * math.exp(-t / 0.026)
        upper = brightness * math.sin(2 * math.pi * 2 * fundamental * t) * math.exp(-t / 0.018)
        glint = 0.025 * math.sin(2 * math.pi * 3 * fundamental * t) * math.exp(-t / 0.012)
        tail = 0.13 * math.sin(2 * math.pi * fundamental * t) * math.exp(-t / 0.047)
        taper = 1.0
        if i >= count - 960:
            taper = 0.5 * (1 + math.cos(math.pi * (i - (count - 960)) / 959))
        values.append(attack * (0.68 * body + upper + glint + tail + 0.16 * dry_tap) * taper)
    values[0] = values[-1] = 0.0
    return values


def generate():
    source = grain()
    mixture = [0.0] * (LEAD + GAP + len(source) + TRAIL)
    for onset in (LEAD, LEAD + GAP):
        for i, value in enumerate(source):
            mixture[onset + i] += value
    gain = 10 ** (-8 / 20) / max(map(abs, mixture))
    unit = [v * gain for v in source]
    expected = [0.0] * len(mixture)
    for onset in (LEAD, LEAD + GAP):
        for i, value in enumerate(unit):
            expected[onset + i] += value
    # Independent convolution verifies identical grains and equal impulse gains.
    impulses = {LEAD: 1.0, LEAD + GAP: 1.0}
    rebuilt = [sum(unit[n - k] * a for k, a in impulses.items() if 0 <= n - k < len(unit))
               for n in range(len(expected))]
    assert rebuilt == expected
    assert hashlib.sha256(struct.pack('<' + 'd' * len(unit), *unit)).hexdigest() == \
        'fe520102459d301141083cfb04e43f81931cb8d9a2d0585cc1695564b140add4'
    assert all(math.isfinite(v) and abs(v) < 1 for v in expected)
    assert not any(expected[:LEAD]) and not any(expected[-TRAIL:])
    quantized = [round(v * 32767) for v in expected]
    payload = struct.pack('<' + 'h' * len(quantized), *quantized)
    buffer = io.BytesIO()
    with wave.open(buffer, 'wb') as wav:
        wav.setparams((1, 2, SR, 0, 'NONE', 'not compressed'))
        wav.writeframes(payload)
    result = buffer.getvalue()
    assert hashlib.sha256(result).hexdigest() == APPROVED_SHA256, 'Must match approved audition byte-for-byte'
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Verify committed asset without writing')
    args = parser.parse_args()
    path = Path(__file__).resolve().parents[1] / 'src-tauri/native/assets/sounds/listening.wav'
    result = generate()
    if args.check:
        assert path.read_bytes() == result, 'Bundled WAV differs from approved Bright glass audition'
    else:
        path.write_bytes(result)
    print(f'{path}: 300 ms, identical 160 ms grains, 100 ms onset spacing, peak -8.00 dBFS')
    print(f'SHA256 {APPROVED_SHA256}')
