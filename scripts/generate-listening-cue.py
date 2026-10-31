"""Reproduce the approved double-tap with a short original harmonic chime trail.

Requires Python 3 + NumPy (generation only, not an app dependency).
Original synthesis by HandsFree; no system or third-party audio assets.
"""
import argparse
import copy
import hashlib
from pathlib import Path
import wave

import numpy as np

SR = 48000
RNG = np.random.default_rng(20261030)


def noise(length, cutoff):
    n = round(length * SR)
    x = RNG.standard_normal(n)
    f = np.fft.rfftfreq(n, 1 / SR)
    response = (1 - np.exp(-(f / 180) ** 4)) * np.exp(-(f / cutoff) ** 4)
    x = np.fft.irfft(np.fft.rfft(x) * response, n=n)
    return x / np.sqrt(np.mean(x * x))


def impact(brightness):
    length = .065
    t = np.arange(round(length * SR)) / SR
    x = np.zeros_like(t)
    # Exactly the approved audition's short, overdamped inharmonic body.
    for frequency, gain, lifetime in [(710, .9, .006), (1640, .3, .0035)]:
        x += gain * np.sin(2 * np.pi * frequency * t) * np.exp(-t / lifetime)
    x += .22 * noise(length, brightness) * np.exp(-t / .004)
    x *= 1 - np.exp(-(t / .0016) ** 2)
    x *= np.minimum(1, (length - t) / .009) ** 2
    return x


def render(first, second, accent):
    out = np.zeros(round(.200 * SR))
    for start, sample, gain in [(.020, first, .78), (.085, second, accent)]:
        i = round(start * SR)
        out[i:i + len(sample)] += gain * sample
    active = np.flatnonzero(out)
    a, b = active[0], active[-1] + 1
    window = np.sin(np.linspace(0, np.pi, b - a)) ** 2
    out[a:b] -= out[a:b].sum() / window.sum() * window
    return out


def generate(reference=None):
    global RNG
    RNG = np.random.default_rng(20261030)
    # The audition generator consumed these three excitations before double-tap.
    # Preserve that RNG position, not a new seed or unrelated noise texture.
    for length in [.100, .047, .088]:
        RNG.standard_normal(round(length * SR))
    state = copy.deepcopy(RNG.bit_generator.state)
    double = impact(3200)
    base = render(double, double, 1)
    gain = 10 ** (-8 / 20) / np.max(np.abs(base))
    if reference:
        with wave.open(str(reference), 'rb') as wav:
            assert wav.getparams()[:3] == (1, 2, SR)
            expected = wav.readframes(wav.getnframes())
        assert np.rint(base * gain * 32767).astype('<i2').tobytes() == expected, \
            'Base synthesis must exactly match approved 03-double-tap.wav'
    RNG.bit_generator.state = state
    # Same excitation/body; second texture cutoff +9.4% and level +1 dB only.
    # Keep original gain instead of normalizing away the accent (~7 dB headroom).
    brighter = impact(3500)
    body = render(double, brighter, 10 ** (1 / 20)) * gain
    assert hashlib.sha256(np.rint(body * 32767).astype('<i2').tobytes()).hexdigest() == \
        'a06aa064ba508173cc75ec560b3ccdc1db7db761d8fcc3d1eb5dd42fbfdd7a8e', \
        'Preserve the complete approved 200 ms accented percussive body byte-for-byte'
    out = np.zeros(round(.320 * SR))
    out[:len(body)] = body
    # One glassy harmonic bloom attached to the second impact, not a third tap.
    # Leave both impact peaks intact; the soft bloom begins 10 ms after tap two.
    t = np.arange(round(.205 * SR)) / SR
    envelope = (1 - np.exp(-(t / .012) ** 2)) * np.exp(-t / .070)
    envelope *= np.clip((.205 - t) / .035, 0, 1) ** 2
    d6 = 1174.65907166963
    shimmer = sum(level * np.sin(2 * np.pi * d6 * ratio * t)
                  for ratio, level in [(1, 1), (1.5, .32), (2, .18)])
    start = round(.095 * SR)
    out[start:start + len(t)] += .115 * envelope * shimmer
    pcm = np.rint(out * 32767).astype('<i2')
    assert np.max(np.abs(out)) < 10 ** (-6 / 20)
    assert np.all(pcm[:960] == 0) and np.all(pcm[-960:] == 0)
    return pcm


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reference', type=Path, help='Verify base against approved audition WAV')
    parser.add_argument('--check', action='store_true', help='Verify committed asset without writing')
    args = parser.parse_args()
    path = Path(__file__).resolve().parents[1] / 'src-tauri/native/assets/sounds/listening.wav'
    pcm = generate(args.reference)
    if args.check:
        with wave.open(str(path), 'rb') as wav:
            assert wav.getparams()[:3] == (1, 2, SR)
            assert wav.readframes(wav.getnframes()) == pcm.tobytes()
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(path), 'wb') as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(SR)
            wav.writeframes(pcm.tobytes())
    print(f'{path}: 320 ms, 65 ms impact spacing, 205 ms chime trail, peak {20*np.log10(np.max(np.abs(pcm.astype(float)))/32768):.2f} dBFS')
    print(f'SHA256 {hashlib.sha256(path.read_bytes()).hexdigest()}')
