"""Builds Thock's switch sounds from the recordings in kbsim.

    python tools/build-sounds.py <path to a checkout of github.com/tplai/kbsim>

kbsim (MIT, Thomas Lai) ships one short recording per key row for thirteen
real switches, plus separate ones for space, enter, backspace and for letting
go. This script turns each switch into a single uncompressed WAV with the
clips back to back, and writes the table of where each clip starts.

Why not ship the MP3s as they are: one file per switch is one request instead
of twelve, PCM needs no decoding, and MP3 can add silence in front of a sound,
which on a keyboard is heard as lag. Needs ffmpeg on the PATH.
"""

import json
import os
import struct
import subprocess
import sys
import wave

RATE = 44100
TARGET_PEAK = 0.62        # loudest key press of every switch lands here
FADE = int(RATE * 0.003)  # fade the cut end so it cannot click

# id -> (name, short description, stem colour for the settings card)
SWITCHES = {
    'blackink': ('Gateron Black Ink', 'linear, deep', '#7a7a80'),
    'cream': ('NovelKeys Cream', 'linear, soft', '#efe6d0'),
    'alpaca': ('Alpaca', 'linear, smooth', '#f2a7c0'),
    'redink': ('Gateron Red Ink', 'linear, light', '#d9433f'),
    'turquoise': ('Turquoise Tealios', 'linear, crisp', '#3fc1b5'),
    'mxblack': ('Cherry MX Black', 'linear, classic', '#8a8a8a'),
    'mxbrown': ('Cherry MX Brown', 'tactile', '#9a6a48'),
    'holypanda': ('Holy Panda', 'tactile, rounded', '#f08b52'),
    'topre': ('Topre', 'rubber dome, muted', '#8d7ad6'),
    'mxblue': ('Cherry MX Blue', 'clicky', '#2f8fe0'),
    'boxnavy': ('Kailh Box Navy', 'clicky, heavy', '#3a5fb0'),
    'bluealps': ('Alps Blue', 'clicky, vintage', '#4f8fe6'),
    'buckling': ('Buckling Spring', 'Model M', '#c9c2ae'),
}

# clip name in Thock -> file in kbsim, and what to use when a switch lacks it
CLIPS = [
    ('p0', 'press/GENERIC_R0.mp3', None),
    ('p1', 'press/GENERIC_R1.mp3', None),
    ('p2', 'press/GENERIC_R2.mp3', None),
    ('p3', 'press/GENERIC_R3.mp3', None),
    ('p4', 'press/GENERIC_R4.mp3', None),
    ('space', 'press/SPACE.mp3', 'p4'),
    ('enter', 'press/ENTER.mp3', 'p2'),
    ('back', 'press/BACKSPACE.mp3', 'p0'),
    ('r', 'release/GENERIC.mp3', None),
    ('rspace', 'release/SPACE.mp3', 'r'),
    ('renter', 'release/ENTER.mp3', 'r'),
    ('rback', 'release/BACKSPACE.mp3', 'r'),
]


def decode(path):
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', path, '-f', 's16le', '-ac', '1', '-ar', str(RATE), '-'],
        check=True, capture_output=True).stdout
    count = len(raw) // 2
    return [v / 32768 for v in struct.unpack('<%dh' % count, raw[:count * 2])]


def trim(samples):
    """Cut the silence before the sound and the tail after it has died away."""
    peak = max(abs(v) for v in samples) or 1
    first = next(i for i, v in enumerate(samples) if abs(v) > peak * 0.02)
    last = max(i for i, v in enumerate(samples) if abs(v) > peak * 0.01)
    start = max(0, first - int(RATE * 0.0005))
    end = min(len(samples), last + int(RATE * 0.006))
    out = samples[start:end]
    for i in range(min(FADE, len(out))):
        out[-1 - i] *= i / FADE
    return out


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    source = os.path.join(sys.argv[1], 'src', 'assets', 'audio')
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_dir = os.path.join(root, 'public', 'sounds')
    os.makedirs(out_dir, exist_ok=True)

    packs = []
    for switch, (name, note, stem) in SWITCHES.items():
        clips = {}
        for clip, file, fallback in CLIPS:
            path = os.path.join(source, switch, file)
            if os.path.exists(path):
                clips[clip] = trim(decode(path))
            elif fallback is None:
                sys.exit('missing %s' % path)

        # One gain for the whole switch: evens out loudness between switches
        # while keeping each one's own balance of press against release.
        presses = sorted(max(abs(v) for v in clips['p%d' % row]) for row in range(5))
        gain = TARGET_PEAK / presses[2]

        table, data = {}, []
        for clip, _, fallback in CLIPS:
            if clip in clips:
                samples = clips[clip]
                table[clip] = [len(data), len(samples)]
                data.extend(max(-1.0, min(1.0, v * gain)) for v in samples)
            else:
                table[clip] = fallback  # resolved by the player
        for clip, value in table.items():
            if isinstance(value, str):
                table[clip] = table[value]

        with wave.open(os.path.join(out_dir, switch + '.wav'), 'wb') as out:
            out.setnchannels(1)
            out.setsampwidth(2)
            out.setframerate(RATE)
            out.writeframes(struct.pack('<%dh' % len(data), *(round(v * 32767) for v in data)))

        packs.append({'id': switch, 'name': name, 'note': note, 'stem': stem, 'clips': table})
        print('%-10s %5.0f ms of audio, gain x%.1f' % (switch, len(data) / RATE * 1000, gain))

    with open(os.path.join(root, 'public', 'js', 'sound-packs.js'), 'w', encoding='utf-8', newline='\n') as out:
        out.write('// Generated by tools/build-sounds.py. Do not edit by hand.\n')
        out.write('// clips: name -> [first sample, length] inside sounds/<id>.wav (44.1 kHz mono).\n')
        out.write('export const SAMPLE_RATE = %d;\n' % RATE)
        out.write('export const SWITCHES = [\n')
        for pack in packs:
            out.write('  ' + json.dumps(pack, ensure_ascii=False) + ',\n')
        out.write('];\n')


if __name__ == '__main__':
    main()
