import math
import random
import struct
import wave
from pathlib import Path

RATE = 48000
OUT = Path(__file__).resolve().parents[1] / "apps/web/public/audio-review/nexus-generated"

def env(t, length, attack=0.008, release=0.18):
    if t < attack:
        return t / attack
    remaining = length - t
    if remaining < release:
        return max(0.0, remaining / release)
    return 1.0

def write(name, length, sample):
    count = int(RATE * length)
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / name
    with wave.open(str(path), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(RATE)
        frames = bytearray()
        for i in range(count):
            t = i / RATE
            value = max(-1.0, min(1.0, sample(t, i)))
            frames.extend(struct.pack("<h", int(value * 28000)))
        f.writeframes(frames)

def tone(freq, t, phase=0.0):
    return math.sin(2 * math.pi * freq * t + phase)

def soft_press(t, i):
    e = env(t, 0.32, 0.004, 0.16)
    thump = tone(118 - 28 * t, t) * e * 0.62
    body = tone(238, t) * e * 0.16
    click = tone(920, t) * math.exp(-t * 42) * 0.12
    return thump + body + click

def bid_change(t, i):
    first = env(t, 0.22, 0.004, 0.11)
    second = env(t - 0.13, 0.34, 0.004, 0.15) if t >= 0.13 else 0
    return tone(150, t) * first * 0.42 + tone(192, t) * second * 0.43 + tone(480, t) * first * 0.08

def confirm_lock(t, i):
    e = env(t, 0.72, 0.012, 0.36)
    return (tone(92, t) * 0.42 + tone(184, t) * 0.26 + tone(276, t) * 0.12) * e

def hold_start(t, i):
    e = env(t, 0.58, 0.01, 0.26)
    freq = 110 + 95 * min(1.0, t / 0.48)
    return (tone(freq, t) * 0.38 + tone(freq * 2, t) * 0.12) * e

def drag_release(t, i):
    e = env(t, 0.42, 0.003, 0.2)
    return (tone(105, t) * 0.58 + tone(210, t) * 0.16 + tone(620, t) * math.exp(-t * 30) * 0.08) * e

def countdown_pulse(t, i):
    e = env(t, 0.5, 0.005, 0.28)
    return (tone(76, t) * 0.5 + tone(152, t) * 0.18) * e

def reroll_scan(t, i):
    e = env(t, 0.82, 0.02, 0.32)
    random.seed(i // 180)
    noise = (random.random() * 2 - 1) * 0.06 * e
    freq = 120 + 180 * (t / 0.82)
    return (tone(freq, t) * 0.23 + tone(60, t) * 0.22 + noise) * e

def event_reveal(t, i):
    e = env(t, 1.08, 0.008, 0.58)
    attack = math.exp(-t * 18) * tone(310, t) * 0.1
    return (tone(82, t) * 0.35 + tone(164, t) * 0.25 + tone(246, t) * 0.14 + attack) * e

SOUNDS = {
    "soft_press.wav": (0.32, soft_press),
    "bid_change.wav": (0.34, bid_change),
    "confirm_lock.wav": (0.72, confirm_lock),
    "hold_start.wav": (0.58, hold_start),
    "drag_release.wav": (0.42, drag_release),
    "countdown_pulse.wav": (0.50, countdown_pulse),
    "reroll_scan.wav": (0.82, reroll_scan),
    "event_reveal.wav": (1.08, event_reveal),
}

for filename, (length, fn) in SOUNDS.items():
    write(filename, length, fn)
