"""Check that every base x accent combination in themes.json meets WCAG contrast.

Usage: python3 design/themes/check.py   (exit code 1 if any pair fails)
The app's own test suite runs the same rules (development-plan.md §7.2).
"""
import json
import sys
from pathlib import Path

THEMES = json.loads((Path(__file__).resolve().parent / 'themes.json').read_text())

# (foreground token, background token, minimum ratio, what it is)
RULES = [
    ('text', 'bg', 7.0, 'body text on the page'),
    ('text', 'panel', 7.0, 'body text on panels'),
    ('text-body', 'panel', 4.5, 'leaf text in the Peek'),
    ('muted', 'bg', 4.5, 'secondary text on the page'),
    ('muted', 'panel', 4.5, 'secondary text on panels'),
    ('faint', 'panel', 4.5, 'word counts in the Explorer'),
    ('accent', 'bg', 4.5, 'accent text and threads on the page'),
    ('accent', 'panel', 4.5, 'headings and @mentions in the Peek'),
    ('on-accent', 'accent', 4.5, 'text on accent buttons'),
    ('node', 'bg', 3.0, 'leaf dots on the map'),
]


def lum(hex_colour: str) -> float:
    h = hex_colour.lstrip('#')
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    lin = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


def ratio(a: str, b: str) -> float:
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def resolve(base_id: str, accent_id: str) -> dict:
    base = THEMES['bases'][base_id]
    tokens = dict(base['tokens'])
    tokens['accent'] = THEMES['accents'][accent_id][base['mode']]
    tokens['on-accent'] = THEMES['onAccent'][base['mode']]
    return tokens


def main() -> int:
    failures = 0
    for base_id in THEMES['bases']:
        for accent_id in THEMES['accents']:
            t = resolve(base_id, accent_id)
            worst = min((ratio(t[fg], t[bg]) / need, fg, bg, need) for fg, bg, need, _ in RULES)
            for fg, bg, need, what in RULES:
                r = ratio(t[fg], t[bg])
                if r < need:
                    failures += 1
                    print(f'FAIL {base_id}+{accent_id}: {fg} on {bg} = {r:.2f}:1 (needs {need}) — {what}')
            print(f'ok   {base_id:9}+{accent_id:7} tightest: {worst[1]} on {worst[2]} at {worst[0] * worst[3]:.2f}:1')
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())
