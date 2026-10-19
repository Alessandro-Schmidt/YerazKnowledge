"""Draw the Yeraz logo: a leaf whose veins are its git history, in brushed steel.

A leaf is a note. Its midrib is the note's history, the dots along it are commits, and the
veins are branches. Lit from the upper left: the left face bright, the right face in shade.

Usage:  pip install shapely cairosvg pillow
        python3 design/brand/draw.py      # writes every SVG master in design/brand/svg
        python3 design/brand/export.py    # then renders the PNG, ICO and ICNS files

The shape and the shades live here, so a change is made once and every file follows. The
cut-outs are computed (shapely), so every file is plain filled paths: no masks or clips,
which every renderer, icon tool and README draws the same way.
"""
import math
from pathlib import Path

from shapely import affinity
from shapely.geometry import Point, Polygon, box
from shapely.ops import unary_union

OUT = Path(__file__).resolve().parent / 'svg'

# The leaf is drawn upright in its own frame (base at +H, tip at -H), then turned 45° so the
# tip points up and to the right.
H, WD = 180.0, 114.0
ANGLE = 45.0

STEEL = dict(lit='#F4F4F2', shade='#8C8C88', stem='#A9A9A6', commit='#BEBEBB')          # on black
STEEL_SMALL = dict(lit='#F7F7F5', shade='#A3A39F', stem='#B8B8B4', commit='#CFCFCB')    # brighter for 32 px and below
GUNMETAL = dict(lit='#7A7A76', shade='#2C2C2A', stem='#4E4E4B', commit='#62625F')       # on light backgrounds
WHITE = dict(lit='#FFFFFF', shade='#FFFFFF', stem='#FFFFFF', commit='#FFFFFF')           # one colour

# Two drawings: the full one, and a bolder one for 32 px and below (two veins, two commits).
FULL = dict(commits=[0.54, 0.20, -0.14, -0.46], sides=[1, -1, 1, -1], midrib=13, ring=16, dot=7.5, vein=12, stem=(13, 9))
SMALL = dict(commits=[0.36, -0.30], sides=[1, -1], midrib=18, ring=22, dot=9.5, vein=16, stem=(17, 12))


def cubic(t, a, b, c, d):
    u = 1 - t
    return u ** 3 * a + 3 * u * u * t * b + 3 * u * t * t * c + t ** 3 * d


def edge(t):
    """A point on the right edge, t = 0 at the base and 1 at the tip."""
    return cubic(t, 0, WD * 1.14, WD * 0.98, 0), cubic(t, H, H * 0.40, -H * 0.60, -H)


def leaf_outline(n=240):
    right = [edge(k / n) for k in range(n + 1)]
    return Polygon(right + [(-x, y) for x, y in reversed(right[1:-1])])


def half_width(y):
    best = 0.0
    for k in range(600):
        x, yy = edge(k / 599)
        if abs(yy - y) < 2:
            best = max(best, x)
    return best


def quad(p0, p1, p2, n=40):
    return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
             (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]) for t in (k / (n - 1) for k in range(n))]


def tapered(points, w0, w1):
    """A stroke along points whose width runs from w0 to w1."""
    left, right = [], []
    n = len(points)
    for i, (x, y) in enumerate(points):
        x2, y2 = points[min(i + 1, n - 1)]
        x1, y1 = points[max(i - 1, 0)]
        L = math.hypot(x2 - x1, y2 - y1) or 1
        nx, ny = -(y2 - y1) / L, (x2 - x1) / L
        w = (w0 + (w1 - w0) * i / (n - 1)) / 2
        left.append((x + nx * w, y + ny * w))
        right.append((x - nx * w, y - ny * w))
    return Polygon(left + right[::-1]).buffer(0)


def drawing(d):
    """Faces, stem and commit dots of one drawing, in the leaf's own frame."""
    cuts = []
    # the midrib grows out of a solid base (which joins both faces to the stem) and thins to the tip
    start, full, top = H - 22, H - 72, -H * 0.80
    cuts.append(tapered([(0, start + k * (full - start) / 12) for k in range(13)], 1.0, d['midrib']))
    cuts.append(tapered([(0, full + 1 - k * (full + 1 - top) / 40) for k in range(41)], d['midrib'], d['midrib'] * 0.5))
    for f, side in zip(d['commits'], d['sides']):
        y = H * f
        # walk out from the midrib towards the tip until 80 % of the way to the edge
        dx, dy = side * math.sin(math.radians(48)), -math.cos(math.radians(48))
        L = 0.0
        while True:
            L += 1
            ex, ey = dx * L, y + dy * L
            if abs(ex) >= 0.80 * half_width(ey) or ey < -H * 0.85:
                break
        ctrl = (dx * L * 0.5 + side * L * 0.10, y + dy * L * 0.5 + L * 0.06)   # nearly straight, bowed outwards
        cuts.append(tapered(quad((0, y), ctrl, (ex, ey)), d['vein'], d['vein'] * 0.45))
    for f in d['commits']:
        cuts.append(Point(0, H * f).buffer(d['ring'], quad_segs=32))
    cut = unary_union(cuts)
    leaf = leaf_outline()
    lit = leaf.intersection(box(-400, -400, 0, 400)).difference(cut)
    shade = leaf.intersection(box(0, -400, 400, 400)).difference(cut)
    stem = tapered(quad((0, H - 2), (6, H + 44), (-16, H + 80)), *d['stem'])
    dots = [Point(0, H * f).buffer(d['dot'], quad_segs=24) for f in d['commits']]
    return lit, shade, stem, dots


def place(geoms, cx, cy, size):
    """Turn the drawing 45° and fit its bounding box, larger side = size, centred on cx, cy."""
    turned = [affinity.rotate(g, ANGLE, origin=(0, 0)) for g in geoms]
    x0, y0, x1, y1 = unary_union(turned).bounds
    s = size / max(x1 - x0, y1 - y0)
    return [affinity.translate(affinity.scale(g, s, s, origin=((x0 + x1) / 2, (y0 + y1) / 2)),
                               cx - (x0 + x1) / 2, cy - (y0 + y1) / 2) for g in turned]


def path(g):
    g = g.simplify(0.2, preserve_topology=True)      # drop points closer than 0.2 px to the curve
    polys = list(g.geoms) if hasattr(g, 'geoms') else [g]
    d = ''
    for p in polys:
        for ring in [p.exterior, *p.interiors]:
            pts = list(ring.coords)[:-1]
            d += 'M' + ' L'.join(f'{x:.1f},{y:.1f}' for x, y in pts) + 'Z'
    return d


def leaf(cx, cy, size, shades, d=FULL):
    lit, shade, stem, dots = drawing(d)
    placed = place([lit, shade, stem, *dots], cx, cy, size)
    lit, shade, stem, dots = placed[0], placed[1], placed[2], placed[3:]
    out = (f'<path d="{path(lit)}" fill="{shades["lit"]}" fill-rule="evenodd"/>'
           f'<path d="{path(shade)}" fill="{shades["shade"]}" fill-rule="evenodd"/>'
           f'<path d="{path(stem)}" fill="{shades["stem"]}"/>')
    out += ''.join(f'<path d="{path(p)}" fill="{shades["commit"]}"/>' for p in dots)
    return out


def bounds(size, d=FULL):
    lit, shade, stem, dots = drawing(d)
    return unary_union(place([lit, shade, stem, *dots], 0, 0, size)).bounds


def svg(w, h, body, view=None):
    view = view or f'0 0 {w} {h}'
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="{view}">{body}</svg>\n'


TILE = '<rect x="100" y="100" width="824" height="824" rx="185" fill="#000000"/>'
EDGE = ('<rect x="101.5" y="101.5" width="821" height="821" rx="183.5" fill="none" stroke="#FFFFFF" '
        'stroke-opacity="0.12" stroke-width="3"/>')


def mark_file(shades, d=FULL, size=560):
    """The leaf alone, on a canvas fitted to it with 2 px to spare."""
    x0, y0, x1, y1 = bounds(size, d)
    w, h = math.ceil(x1 - x0 + 4), math.ceil(y1 - y0 + 4)
    return svg(w, h, leaf(w / 2, h / 2, size, shades, d))


files = {
    # desktop icon: 1024 canvas, 824 tile, 185 corner radius, the leaf at 600 px
    'yeraz-icon.svg': svg(1024, 1024, TILE + leaf(512, 512, 600, STEEL) + EDGE),
    # 32 px and below: the bolder drawing, brighter steel, a little larger in the tile
    'yeraz-icon-small.svg': svg(1024, 1024, TILE + leaf(512, 512, 650, STEEL_SMALL, SMALL) + EDGE),
    'favicon.svg': svg(1024, 1024, TILE + leaf(512, 512, 650, STEEL_SMALL, SMALL) + EDGE),
    # phones and maskable PWA icons: full bleed; tip and stem stay inside the 80 % safe circle
    'yeraz-icon-bleed.svg': svg(1024, 1024, '<rect width="1024" height="1024" fill="#000000"/>' + leaf(512, 512, 540, STEEL)),
    # the leaf alone: README and large uses; the small drawing for the 22 px top bar
    'yeraz-mark.svg': mark_file(STEEL),
    'yeraz-mark-light.svg': mark_file(GUNMETAL),
    'yeraz-mark-mono.svg': mark_file(WHITE),
    'yeraz-mark-small.svg': mark_file(STEEL_SMALL, SMALL),
    'yeraz-mark-small-light.svg': mark_file(GUNMETAL, SMALL),
}

if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    for name, body in files.items():
        (OUT / name).write_text(body)
        print(f'{name}  {len(body) // 1024} KB')
