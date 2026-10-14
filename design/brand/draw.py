"""Draw the Yeraz logo: a capital Y cut into six flat faces of brushed steel.

Usage:  python3 design/brand/draw.py      # writes every SVG master in design/brand/svg
        python3 design/brand/export.py    # then renders the PNG, ICO and ICNS files

The shape and the shades live here, so a change is made once and every file follows.
"""
from pathlib import Path

OUT = Path(__file__).resolve().parent / 'svg'
SLOPE = 0.5458  # dx/dy of the arms


def geometry(outer=224, w=114, top=246, bottom=806, cx=512):
    """Corner points of the faceted Y. outer: centre to outer top corner; w: arm and stem width."""
    C = (cx, top + (outer - w) / SLOPE)                 # inner V
    S = top + (outer - w / 2) / SLOPE                   # where the arms meet the stem
    M = (cx, (C[1] + S) / 2 + 24)                       # where the creases meet
    p = {
        'L1': (cx - outer, top), 'L2': (cx - outer + w, top),
        'R1': (cx + outer - w, top), 'R2': (cx + outer, top),
        'C': C, 'M': M,
        'S1': (cx - w / 2, S), 'S2': (cx + w / 2, S),
        'B1': (cx - w / 2, bottom), 'B2': (cx + w / 2, bottom), 'BM': (cx, bottom),
    }
    return p


# the six faces, lit from the upper left: (points, shade rank 0 = brightest)
FACES = [
    (('L1', 'L2', 'C', 'M'), 0),    # left arm, facing the light
    (('S1', 'M', 'BM', 'B1'), 1),   # stem, left
    (('L1', 'M', 'S1'), 2),         # left arm, turned away
    (('R1', 'R2', 'M', 'C'), 3),    # right arm, inner
    (('M', 'S2', 'B2', 'BM'), 4),   # stem, right
    (('R2', 'S2', 'M'), 5),         # right arm, in shadow
]
STEEL = ['#F4F4F2', '#D9D9D6', '#BEBEBB', '#A9A9A6', '#8C8C88', '#74746F']         # on black
STEEL_SMALL = ['#F7F7F5', '#E2E2DF', '#CFCFCB', '#B8B8B4', '#A3A39F', '#8E8E8A']   # brighter for 32 px and below
GUNMETAL = ['#7A7A76', '#62625F', '#4E4E4B', '#3F3F3C', '#2C2C2A', '#1C1C1B']      # on light backgrounds


def faces(p, shades, scale=1.0, origin=(512, 512)):
    ox, oy = origin
    out = ''
    for names, rank in FACES:
        pts = ' '.join(f'{ox + (p[n][0] - ox) * scale:.1f},{oy + (p[n][1] - oy) * scale:.1f}' for n in names)
        out += f'<polygon points="{pts}" fill="{shades[rank]}"/>'
    return out


def silhouette(p, fill):
    pts = ' '.join(f'{p[n][0]:.1f},{p[n][1]:.1f}' for n in ('L1', 'L2', 'C', 'R1', 'R2', 'S2', 'B2', 'B1', 'S1'))
    return f'<polygon points="{pts}" fill="{fill}"/>'


def svg(w, h, body, view=None):
    view = view or f'0 0 {w} {h}'
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="{view}">{body}</svg>\n'


TILE = ('<rect x="100" y="100" width="824" height="824" rx="185" fill="#000000"/>')
EDGE = ('<rect x="101.5" y="101.5" width="821" height="821" rx="183.5" fill="none" stroke="#FFFFFF" stroke-opacity="0.12" stroke-width="3"/>')

big = geometry()
small = geometry(outer=250, w=150, top=236, bottom=820)

files = {
    # desktop icon: 1024 canvas, 824 tile, 185 corner radius
    'yeraz-icon.svg': svg(1024, 1024, TILE + faces(big, STEEL) + EDGE),
    # 32 px and below: thicker letter, brighter faces
    'yeraz-icon-small.svg': svg(1024, 1024, TILE + faces(small, STEEL_SMALL) + EDGE),
    'favicon.svg': svg(1024, 1024, TILE + faces(small, STEEL_SMALL) + EDGE),
    # phones and maskable PWA icons: full bleed, the letter well inside the 80 % safe circle
    'yeraz-icon-bleed.svg': svg(1024, 1024, '<rect width="1024" height="1024" fill="#000000"/>'
                                + f'<g transform="translate(0,-14)">{faces(big, STEEL, scale=1.06, origin=(512, 526))}</g>'),
}
view = '286 244 452 564'  # the letter's bounds plus 2 px
files['yeraz-mark.svg'] = svg(452, 564, faces(big, STEEL), view)
files['yeraz-mark-light.svg'] = svg(452, 564, faces(big, GUNMETAL), view)
files['yeraz-mark-mono.svg'] = svg(452, 564, silhouette(big, '#FFFFFF'), view)

OUT.mkdir(parents=True, exist_ok=True)
for name, body in files.items():
    (OUT / name).write_text(body)
    print(name)
