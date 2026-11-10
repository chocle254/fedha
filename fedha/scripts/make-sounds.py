"""Makes Luxe's notification sounds (public/sounds/x-*.wav). Run: python3 scripts/make-sounds.py

Every sound is built from struck-bell and plucked tones (a fundamental plus a few overtones that die away at
different speeds), played as short musical figures in one key (E major) so they sound like one family, then
given a small room echo. No samples, nothing downloaded. Mono, 44.1 kHz, 16-bit.
"""
import math, struct, wave, os

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'sounds')

# Notes (Hz), E major.
N = {'E4': 329.63, 'B4': 493.88, 'C#5': 554.37, 'E5': 659.26, 'F#5': 739.99, 'G#5': 830.61, 'A5': 880.0, 'B5': 987.77,
     'C#6': 1108.73, 'E6': 1318.51, 'F#6': 1479.98, 'G#6': 1661.22, 'B6': 1975.53, 'E7': 2637.02, 'C5': 523.25, 'A4': 440.0, 'G4': 392.0, 'D5': 587.33}

# Timbres: (overtone ratio, loudness, how fast it dies: bigger = shorter)
BELL = [(1, 1.0, 3.2), (2.0, 0.5, 4.5), (3.01, 0.28, 6.5), (4.2, 0.16, 9), (5.43, 0.09, 12)]
GLASS = [(1, 1.0, 4.5), (2.76, 0.32, 8), (5.4, 0.12, 14)]
PLUCK = [(1, 1.0, 7), (2.0, 0.35, 11), (3.0, 0.15, 16)]
WARM = [(1, 1.0, 2.6), (2.0, 0.22, 4), (0.5, 0.35, 3)]
DEEP = [(1, 1.0, 5), (2.0, 0.3, 9), (2.98, 0.12, 14)]

def tone(buf, freq, start, length, loud, timbre, attack=0.004):
    a = int(start * SR); n = int(length * SR)
    for i in range(n):
        if a + i >= len(buf): break
        t = i / SR
        env = min(1.0, t / attack)
        s = 0.0
        for ratio, amp, decay in timbre:
            s += amp * math.exp(-decay * t) * math.sin(2 * math.pi * freq * ratio * t)
        buf[a + i] += loud * env * s

def shimmer(buf, start, length, loud, base=5200.0):
    """A soft sparkle: a few very high, quickly fading tones."""
    for k, f in enumerate([base, base * 1.26, base * 1.5, base * 1.89]):
        tone(buf, f, start + k * 0.035, length, loud * (0.9 - k * 0.15), [(1, 1.0, 9 + k * 2)], attack=0.002)

def thump(buf, start, loud, f0=110.0):
    a = int(start * SR)
    for i in range(int(0.16 * SR)):
        if a + i >= len(buf): break
        t = i / SR
        buf[a + i] += loud * math.exp(-26 * t) * math.sin(2 * math.pi * (f0 * math.exp(-9 * t) + 42) * t)

def room(buf, mix=0.2):
    """A small room: four echoes fed back on themselves."""
    out = buf[:]
    for delay, fb in [(0.0297, 0.72), (0.0371, 0.70), (0.0411, 0.68), (0.0437, 0.66)]:
        d = int(delay * SR); line = [0.0] * len(buf)
        for i in range(len(buf)):
            line[i] = buf[i] + (fb * line[i - d] if i >= d else 0.0)
            out[i] += mix * 0.25 * (line[i - d] if i >= d else 0.0)
    return out

def save(name, buf, peak=0.82):
    buf = room(buf)
    fade = int(0.05 * SR)
    for i in range(fade): buf[-1 - i] *= i / fade
    top = max(1e-9, max(abs(x) for x in buf))
    data = b''.join(struct.pack('<h', int(max(-1.0, min(1.0, x / top * peak)) * 32767)) for x in buf)
    path = os.path.join(OUT, name + '.wav')
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(data)
    print(f'{name}.wav  {len(buf) / SR:.2f}s  {os.path.getsize(path) // 1024} KB')

def new(seconds): return [0.0] * int(seconds * SR)

# Luxe: the signature. Three bells opening like a hand of cards, left to ring.
b = new(2.3)
for k, n in enumerate(['E5', 'B5', 'F#6']): tone(b, N[n], k * 0.07, 2.1, 0.8 - k * 0.12, BELL)
tone(b, N['E4'], 0, 2.0, 0.35, WARM)
save('x-luxe', b)

# Money in: a soft weight landing, then a bright rising fifth and octave with a sparkle on top.
b = new(2.2)
thump(b, 0, 0.6)
for k, n in enumerate(['E6', 'B6', 'E7']): tone(b, N[n], 0.03 + k * 0.085, 1.8, 0.8 - k * 0.1, BELL)
tone(b, N['E5'], 0.03, 1.6, 0.3, WARM)
shimmer(b, 0.26, 1.2, 0.16)
save('x-money', b)

# Trade opened: two quick clean notes going up. Crisp, like a switch.
b = new(1.2)
tone(b, N['B5'], 0, 0.5, 0.8, PLUCK); tone(b, N['F#6'], 0.09, 0.9, 0.9, GLASS)
save('x-trade', b)

# Target hit: a fast climb up the chord, ending high with a sparkle.
b = new(2.1)
for k, n in enumerate(['E5', 'G#5', 'B5', 'E6', 'G#6']): tone(b, N[n], k * 0.062, 1.5, 0.6 + k * 0.07, PLUCK if k < 4 else BELL)
shimmer(b, 0.3, 1.2, 0.2)
save('x-win', b)

# Stopped out: two soft notes stepping down. Honest, not harsh.
b = new(1.6)
tone(b, N['C#5'], 0, 1.0, 0.75, DEEP); tone(b, N['A4'], 0.16, 1.3, 0.8, DEEP)
save('x-loss', b)

# Alert: a firm double knock, twice. Low and close together so it cannot be mistaken for good news.
b = new(1.5)
for rep in (0, 0.42):
    for k, n in enumerate(['G4', 'G4']):
        tone(b, N[n], rep + k * 0.13, 0.35, 0.9, DEEP); tone(b, N[n] * 1.06, rep + k * 0.13, 0.3, 0.45, DEEP)
    thump(b, rep, 0.5, 90)
save('x-alert', b)

# Planner: two warm wooden notes, a gentle nudge.
b = new(1.7)
tone(b, N['B4'], 0, 1.2, 0.85, WARM); tone(b, N['B4'], 0, 0.5, 0.5, PLUCK)
tone(b, N['E5'], 0.17, 1.4, 0.85, WARM); tone(b, N['E5'], 0.17, 0.5, 0.5, PLUCK)
save('x-planner', b)

# Study: one glass tap with its octave under it.
b = new(1.5)
tone(b, N['G#6'], 0, 1.3, 0.85, GLASS); tone(b, N['G#5'], 0.004, 1.2, 0.35, WARM)
save('x-study', b)

# A new tier: the full climb over two octaves into a held chord, with a long sparkle. The big one.
b = new(3.4)
thump(b, 0, 0.55)
run = ['E4', 'B4', 'E5', 'G#5', 'B5', 'E6', 'G#6', 'B6']
for k, n in enumerate(run): tone(b, N[n], k * 0.075, 1.4, 0.5 + k * 0.05, PLUCK)
for n in ['E5', 'B5', 'G#6', 'E7']: tone(b, N[n], 0.66, 2.6, 0.55, BELL)
shimmer(b, 0.7, 1.6, 0.22); shimmer(b, 1.1, 1.6, 0.14, base=6600.0)
save('x-tier', b)
