"""View 7 — Atlas: every branch is an island and every leaf a mountain as high as the words written in
it. Contours, hachures and hypsometric tints come from one elevation field; threads are sea routes."""
import math
import random
import numpy as np
from scipy import ndimage
from skimage import measure
from common import *

W, H = 1440, 843
S = 2                                  # field resolution: one cell = 2 px
GW, GH = W // S, H // S
SEA = 150                              # sea level, in words
LEVELS = [SEA, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000]
SERIF = "'Newsreader', Georgia, serif"

ISLANDS = {
    'backend': (414, 452, {'java': (-78, -38), 'streams': (-162, -78), 'records': (-150, 32), 'vthreads': (-40, -128),
                           'spring': (92, 18), 'springsec': (170, -34), 'springdata': (118, 86), 'rest': (-14, 106)}),
    'identity': (846, 338, {'keycloak': (-14, 4), 'realms': (-86, 46), 'tokens': (52, 70), 'oauth': (74, -46), 'oidc': (-56, -72)}),
    'cloud': (1150, 446, {'gcp': (-8, -26), 'cloudrun': (66, -78), 'iam': (-58, -86), 'docker': (70, 50),
                          'jenkins': (-66, 62), 'circleci': (-26, 118)}),
    'data': (796, 690, {'postgres': (0, 0), 'indexes': (-74, 40), 'tx': (78, 26), 'oracle': (-128, 4), 'schema': (40, -60)}),
    'frontend': (566, 150, {'react': (0, 0), 'hooks': (74, 26), 'angular': (-84, 18)}),
    'agents': (1074, 156, {'claudecode': (0, 8), 'prompting': (-86, -12), 'evals': (74, 40)}),
}
PEAK = {}
for bid, (cx, cy, ls) in ISLANDS.items():
    for lid, (dx, dy) in ls.items():
        PEAK[lid] = (cx + dx, cy + dy, bid)


def sigma(w):
    return 11 + w ** 0.5 * 0.5


# ---- elevation ----------------------------------------------------------------------------
yy, xx = np.mgrid[0:GH, 0:GW].astype(float) * S + S / 2
rng = np.random.default_rng(5)
coarse = ndimage.gaussian_filter(rng.standard_normal((GH, GW)), 7)
fine = ndimage.gaussian_filter(rng.standard_normal((GH, GW)), 2)
medium = ndimage.gaussian_filter(rng.standard_normal((GH, GW)), 4)
medium /= np.abs(medium).max()
coarse /= np.abs(coarse).max()
fine /= np.abs(fine).max()
field = np.zeros((GH, GW))
for bid, (cx, cy, ls) in ISLANDS.items():
    h = np.zeros((GH, GW))
    for lid in ls:
        x, y, _ = PEAK[lid]
        w = NODES[lid]['words']
        s = sigma(w)
        d2 = (xx - x) ** 2 + (yy - y) ** 2
        h += w * np.exp(-d2 / (2 * s * s)) + 300 * np.exp(-d2 / (2 * (s * 1.55) ** 2))
    field = np.maximum(field, h)
land_hint = np.clip(field / 220, 0, 1)
field = field + (coarse * 130 + medium * 90 + fine * 40) * land_hint
field[:4, :] = field[-4:, :] = 0
field[:, :4] = field[:, -4:] = 0
# no lakes: sea enclosed by land becomes lowland
lakes = ndimage.binary_fill_holes(field >= SEA) & (field < SEA)
field[lakes] = SEA + 20
comp, ncomp = ndimage.label(field >= SEA)
sizes = ndimage.sum(np.ones_like(field), comp, range(1, ncomp + 1))
print('islands', ncomp, sorted((int(z) for z in sizes), reverse=True)[:9], 'land', round((field >= SEA).mean(), 3))


def path_of(contours, step=1):
    out = ''
    for c in contours:
        pts = c[::step]
        if len(pts) < 4:
            continue
        out += 'M' + ' L'.join(f'{p[1] * S + S / 2:.1f},{p[0] * S + S / 2:.1f}' for p in pts) + 'Z'
    return out


level_paths = [path_of(measure.find_contours(field, lv), 2) for lv in LEVELS]
coast = level_paths[0]

# sea water-lines: offsets of the coast, fading out to sea
land = field >= SEA
dist = ndimage.distance_transform_edt(~land) * S
water = ''
for i, d in enumerate([5, 10, 16, 23, 31]):
    water += (f'<path d="{path_of(measure.find_contours(dist, d), 2)}" fill="none" stroke="var(--line)" '
              f'stroke-opacity="{0.34 - i * 0.055:.2f}" stroke-width="0.8"></path>')

# hypsometric tints and contour lines
tints, lines = '', ''
for i, (lv, d) in enumerate(zip(LEVELS, level_paths)):
    t = 7 + i * 5.5
    tints += f'<path d="{d}" fill-rule="evenodd" fill="color-mix(in srgb, var(--accent) {t:.0f}%, var(--raised))"></path>'
    if i == 0:
        continue
    index = lv % 1000 == 0
    lines += (f'<path d="{d}" fill="none" stroke="var(--line)" stroke-opacity="{0.5 if index else 0.3}" '
              f'stroke-width="{1 if index else 0.7}"></path>')
coastline = f'<path d="{coast}" fill="none" stroke="var(--text)" stroke-opacity="0.75" stroke-width="1.3"></path>'

# hachures: rows of short strokes hanging from each contour, down the slope, heavier on the side away
# from the light (north-west), as on a nineteenth-century survey map
smooth = ndimage.gaussian_filter(field, 1.5)
gy, gx = np.gradient(smooth, S)
hach = []
for lv in LEVELS:
    for c in measure.find_contours(field, lv):
        pts = c[:, ::-1] * S + S / 2
        seg = np.hypot(*np.diff(pts, axis=0).T)
        arc = np.concatenate([[0], np.cumsum(seg)])
        if arc[-1] < 30:
            continue
        for d_ in np.arange(0, arc[-1], 3.6):
            x, y = np.interp(d_, arc, pts[:, 0]), np.interp(d_, arc, pts[:, 1])
            i, j = min(GH - 1, int(y / S)), min(GW - 1, int(x / S))
            sx, sy = gx[i, j], gy[i, j]
            slope = math.hypot(sx, sy)
            if slope < 4:
                continue
            ux, uy = -sx / slope, -sy / slope       # downhill
            shade = 0.5 + 0.5 * (ux * 0.6 + uy * 0.8)
            if lv == SEA and shade < 0.72:
                continue
            ln = min(11, max(2.5, 500 / slope * 0.55)) if lv > SEA else min(4, max(2, 300 / slope * 0.4))
            op = 0.05 + 0.5 * shade ** 1.6
            if op < 0.09:
                continue
            hach.append(f'<path d="M{x:.1f},{y:.1f} l{ux * ln:.1f},{uy * ln:.1f}" stroke-opacity="{op:.2f}"></path>')
hachures = f'<g stroke="var(--line)" stroke-width="0.8" stroke-linecap="round">{"".join(hach)}</g>'

# graticule and neatline
grat = ''
for gx_ in range(160, W, 180):
    grat += f'<path d="M{gx_},14 V{H - 14}" stroke="var(--line)" stroke-opacity="0.09" stroke-dasharray="2 6"></path>'
for gy_ in range(120, H, 180):
    grat += f'<path d="M14,{gy_} H{W - 14}" stroke="var(--line)" stroke-opacity="0.09" stroke-dasharray="2 6"></path>'
neat = (f'<rect x="10" y="10" width="{W - 20}" height="{H - 20}" fill="none" stroke="var(--hair-strong)"></rect>'
        f'<rect x="14" y="14" width="{W - 28}" height="{H - 28}" fill="none" stroke="var(--hair)"></rect>')
for k_, gx_ in enumerate(range(160, W - 40, 180)):
    neat += (f'<path d="M{gx_},10 V14 M{gx_},{H - 14} V{H - 10}" stroke="var(--hair-strong)"></path>'
             f'<text class="mono" x="{gx_ + 4}" y="24" font-size="8.5" style="fill: var(--faint)">{k_ * 10}°</text>')

# ---- sea routes and trails -------------------------------------------------------------------
routes_sea, routes_land = '', ''
for a, b in LINKS:
    x0, y0, i0 = PEAK[a]
    x1, y1, i1 = PEAK[b]
    sel = SELECTED in (a, b)
    mx, my = (x0 + x1) / 2, (y0 + y1) / 2
    dx, dy = x1 - x0, y1 - y0
    ln = math.hypot(dx, dy)
    bend = 0.18 if i0 != i1 else 0.1
    qx, qy = mx - dy / ln * ln * bend, my + dx / ln * ln * bend
    d = f'M{x0:.1f},{y0:.1f} Q{qx:.1f},{qy:.1f} {x1:.1f},{y1:.1f}'
    col, op, wd = ('var(--accent)', 0.95, 1.6) if sel else ('var(--text)', 0.4, 1)
    routes_sea += f'<path d="{d}" fill="none" stroke="{col}" stroke-opacity="{op}" stroke-width="{wd}" stroke-dasharray="6 5"></path>'
    routes_land += f'<path d="{d}" fill="none" stroke="{col}" stroke-opacity="{op}" stroke-width="{wd}" stroke-dasharray="1 3.5" stroke-linecap="round"></path>'
routes = (f'<defs><clipPath id="land"><path d="{coast}" clip-rule="evenodd"></path></clipPath>'
          f'<mask id="sea" maskUnits="userSpaceOnUse" x="0" y="0" width="{W}" height="{H}"><rect width="{W}" height="{H}" fill="white"></rect>'
          f'<path d="{coast}" fill="black" fill-rule="evenodd"></path></mask></defs>'
          f'<g mask="url(#sea)">{routes_sea}</g><g clip-path="url(#land)">{routes_land}</g>')

# ---- peaks and labels ----------------------------------------------------------------------
marks, texts = '', ''
boxes = []
for lid, (x, y, _) in PEAK.items():
    n = NODES[lid]
    big = n['depth'] == 2
    s_ = 6 if big else 4.5
    boxes.append((x - s_ - 1, y - s_ - 1, x + s_ + 1, y + s_ + 1))
placed = []


def free(b):
    for o in placed + boxes:
        if b[0] < o[2] and b[2] > o[0] and b[1] < o[3] and b[3] > o[1]:
            return False
    return b[0] > 20 and b[2] < W - 20 and b[1] > 20


halo = 'paint-order: stroke; stroke: var(--raised); stroke-width: 3.2px; stroke-linejoin: round; stroke-opacity: 0.9'
for lid in sorted(PEAK, key=lambda l: (l != SELECTED, -NODES[l]['words'])):
    x, y, _ = PEAK[lid]
    n = NODES[lid]
    big = n['depth'] == 2
    sel = lid == SELECTED
    s_ = 6 if big else 4.5
    fill = 'var(--accent)' if sel else 'var(--text)'
    marks += (f'<path d="M{x:.1f},{y - s_:.1f} L{x + s_ * 0.95:.1f},{y + s_ * 0.7:.1f} L{x - s_ * 0.95:.1f},{y + s_ * 0.7:.1f}Z" '
              f'fill="{fill}" stroke="var(--raised)" stroke-width="1"></path>')
    if sel:
        marks += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="13" fill="none" stroke="var(--accent)" stroke-width="1.3"></circle>'
    name = (n['emoji'] + ' ' if n['emoji'] else '') + n['name']
    size = 14 if big else 12
    nw = text_w(name, size) * 0.93 + (6 if n['emoji'] else 0)
    ew = text_w(f"{n['words']:,}", 9.5) * 1.05
    tw = max(nw, ew)
    hh = size + 12
    cands = [(x + s_ + 5, y - 2, 'start'), (x - s_ - 5, y - 2, 'end'), (x, y - s_ - 16, 'middle'), (x, y + s_ + size + 2, 'middle'),
             (x + s_ + 5, y + 10, 'start'), (x - s_ - 5, y + 10, 'end')]
    for tx, ty, anchor in cands:
        x0 = tx if anchor == 'start' else (tx - tw if anchor == 'end' else tx - tw / 2)
        box = (x0 - 1, ty - size * 0.8, x0 + tw + 1, ty - size * 0.8 + hh)
        if free(box):
            break
    else:
        tx, ty, anchor = cands[0]
        x0 = tx
        box = (x0, ty - size * 0.8, x0 + tw, ty - size * 0.8 + hh)
    placed.append(box)
    style = (f'font-family: {SERIF}; fill: {"var(--accent)" if sel else "var(--text)"}; font-weight: {600 if big or sel else 500}; '
             f'{"" if big else "font-style: italic;"} {halo}')
    texts += (f'<text x="{tx:.1f}" y="{ty:.1f}" text-anchor="{anchor}" font-size="{size}" style="{style}">{esc(name)}</text>'
              f'<text class="mono" x="{tx:.1f}" y="{ty + 11:.1f}" text-anchor="{anchor}" font-size="9.5" style="fill: var(--muted); {halo}">{n["words"]:,}</text>')

# island names, set in open sea beside each island (above, then below, right, left)
near_land = ndimage.binary_dilation(field >= SEA, iterations=5)
KEEP_OUT = [(20, 20, 320, 232), (1290, 50, 1420, 180), (1100, 640, 1420, 833), (20, 770, 870, 833)]  # cartouche, rose, card, legend
taken = []


def open_sea(b):
    x0, y0, x1, y1 = b
    if x0 < 22 or y0 < 30 or x1 > W - 22 or y1 > H - 22:
        return False
    if near_land[int(y0 / S):int(y1 / S) + 1, int(x0 / S):int(x1 / S) + 1].any():
        return False
    return not any(b[0] < o[2] and b[2] > o[0] and b[1] < o[3] and b[3] > o[1] for o in KEEP_OUT + taken)


names = ''
for bid in ISLANDS:
    b = NODES[bid]
    size = 21 if bid == 'backend' else 15
    label = b['name'].upper()
    tw = len(label) * size * (0.62 + 0.32) + 4
    sub = f"{compact(b['total'])} words · {sum(1 for l in PEAK.values() if l[2] == bid)} peaks"
    bw = max(tw, len(sub) * 6.4)
    ys, xs = np.nonzero(comp == comp[int(PEAK[list(ISLANDS[bid][2])[0]][1] / S), int(PEAK[list(ISLANDS[bid][2])[0]][0] / S)])
    lx0, lx1, ly0, ly1 = xs.min() * S, xs.max() * S, ys.min() * S, ys.max() * S
    mxc = (lx0 + lx1) / 2
    sides = {
        'above': [(mxc + dx, ly0 - 22 - off) for off in range(0, 90, 6) for dx in (0, -40, 40, -80, 80)],
        'below': [(mxc + dx, ly1 + 24 + off) for off in range(0, 90, 6) for dx in (0, -40, 40, -80, 80)],
        'right': [(lx1 + 14 + bw / 2 + off, (ly0 + ly1) / 2 + dy) for off in range(0, 90, 6) for dy in (0, -40, 40)],
        'left': [(lx0 - 14 - bw / 2 - off, (ly0 + ly1) / 2 + dy) for off in range(0, 90, 6) for dy in (0, -40, 40, 80)],
    }
    prefer = {'backend': 'left', 'data': 'left', 'cloud': 'above', 'identity': 'above'}.get(bid, 'above')
    cands = sides[prefer] + [c for k_, v in sides.items() if k_ != prefer for c in v]
    for nx, ny in cands:
        box = (nx - bw / 2 - 4, ny - size * 0.85, nx + bw / 2 + 4, ny + 20)
        if open_sea(box):
            break
    else:
        nx, ny = mxc, ly0 - 26
        box = (nx - bw / 2, ny - size, nx + bw / 2, ny + 20)
        print('no room for', bid)
    taken.append(box)
    names += (f'<text x="{nx:.0f}" y="{ny:.0f}" text-anchor="middle" font-size="{size}" letter-spacing="{size * 0.32:.1f}" '
              f'style="font-family: {SERIF}; font-style: italic; fill: var(--text-body)">{esc(label)}</text>'
              f'<text class="mono" x="{nx:.0f}" y="{ny + 15:.0f}" text-anchor="middle" font-size="9.5" letter-spacing="1" style="fill: var(--muted)">{sub}</text>')
seas = (f'<text x="112" y="560" text-anchor="middle" font-size="13" letter-spacing="5" transform="rotate(-90 112 560)" style="font-family: {SERIF}; font-style: italic; fill: var(--muted); opacity: .8">The Unwritten Sea</text>'
        f'<text x="676" y="452" text-anchor="middle" font-size="11" letter-spacing="3" transform="rotate(-62 676 452)" style="font-family: {SERIF}; font-style: italic; fill: var(--muted); opacity: .8">Auth Strait</text>'
        f'<text x="964" y="560" text-anchor="middle" font-size="11" letter-spacing="3" style="font-family: {SERIF}; font-style: italic; fill: var(--muted); opacity: .8">Bay of Containers</text>')

# compass rose
CRX, CRY = 1350, 118
rose = f'<g transform="translate({CRX} {CRY})">'
rose += '<circle r="34" fill="none" stroke="var(--hair-strong)"></circle><circle r="28" fill="none" stroke="var(--hair)"></circle>'
for k_ in range(8):
    a_ = k_ * math.pi / 4
    long_ = k_ % 2 == 0
    rr = 44 if long_ else 26
    wdt = 6 if long_ else 4
    tip = (math.sin(a_) * rr, -math.cos(a_) * rr)
    l_ = (math.sin(a_ - math.pi / 2) * wdt, -math.cos(a_ - math.pi / 2) * wdt)
    r_ = (math.sin(a_ + math.pi / 2) * wdt, -math.cos(a_ + math.pi / 2) * wdt)
    rose += (f'<path d="M0,0 L{l_[0]:.1f},{l_[1]:.1f} L{tip[0]:.1f},{tip[1]:.1f}Z" fill="var(--text)" fill-opacity="{0.85 if long_ else 0.5}"></path>'
             f'<path d="M0,0 L{r_[0]:.1f},{r_[1]:.1f} L{tip[0]:.1f},{tip[1]:.1f}Z" fill="var(--raised)" stroke="var(--text)" stroke-opacity="0.5" stroke-width="0.8"></path>')
rose += (f'<text y="-50" text-anchor="middle" font-size="13" font-weight="600" style="font-family: {SERIF}; fill: var(--accent)">N</text>'
         '<circle r="2.5" fill="var(--accent)"></circle></g>')

svg = (f'<svg viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-label="Atlas of Engineering" '
       f'style="position: absolute; inset: 0; display: block; font-family: \'Geist\', ui-sans-serif, system-ui, sans-serif">'
       f'{grat}{water}{tints}{hachures}{lines}{coastline}{routes}{seas}{names}{marks}{texts}{rose}{neat}</svg>')

# ---- cartouche, legend, selection ------------------------------------------------------------
cartouche = f'''
    <div style="position: absolute; left: 30px; top: 30px; width: 268px; padding: 5px; border: 1px solid var(--hair-strong); background: var(--panel)">
      <div style="display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 14px 16px 13px; border: 1px solid var(--hair-strong); text-align: center">
        <span class="eyebrow" style="font-size: 9.5px; letter-spacing: .3em">An atlas of the Tree</span>
        <span style="font-family: {SERIF}; font-size: 25px; font-weight: 500; letter-spacing: .2em; line-height: 1.1">ENGINEERING</span>
        <span style="width: 120px; height: 1px; margin: 3px 0; background: var(--hair-strong)"></span>
        <span style="font-family: {SERIF}; font-style: italic; font-size: 13px; color: var(--text-body)">Six islands, thirty peaks, {TREE['total']:,} words</span>
        <span class="mono" style="font-size: 9.5px; color: var(--muted)">Charted 18 October 2026 · 1 word = 1 m</span>
      </div>
    </div>'''

ramp = ''.join(f'<span style="width: 22px; height: 10px; background: color-mix(in srgb, var(--accent) {7 + i * 5.5:.0f}%, var(--raised)); '
               f'border-right: 1px solid var(--hair)"></span>' for i in range(len(LEVELS)))
legend_html = f'''
      <div style="display: flex; align-items: center; gap: 18px; height: 42px; padding: 0 14px; border: 1px solid var(--hair); border-radius: 10px; background: var(--panel); font-size: 12px; color: var(--text-body); white-space: nowrap">
        <span style="display: inline-flex; align-items: center; gap: 8px"><span class="mono" style="font-size: 9.5px; color: var(--muted)">0</span><span style="display: flex; border: 1px solid var(--hair-strong)">{ramp}</span><span class="mono" style="font-size: 9.5px; color: var(--muted)">4k</span>Height: words written</span>
        <span style="display: inline-flex; align-items: center; gap: 7px"><svg width="12" height="11" viewBox="0 0 12 11" aria-hidden="true"><path d="M6 1l5 9H1z" fill="var(--text)"></path></svg>Peak: a leaf</span>
        <span style="display: inline-flex; align-items: center; gap: 7px"><span style="width: 18px; border-top: 1.5px dashed var(--text); opacity: .7"></span>Sea route: a thread</span>
      </div>'''

kc_threads = [(b if a == SELECTED else a) for a, b in LINKS if SELECTED in (a, b)]
trip_rows = ''
for t in kc_threads:
    other = PEAK[t][2]
    by_sea = other != PEAK[SELECTED][2]
    trip_rows += f'''
          <div style="display: flex; align-items: center; gap: 9px; font-size: 12.5px">
            <span style="width: 16px; border-top: 1.5px {'dashed' if by_sea else 'dotted'} var(--accent)"></span>
            <span>{esc(NODES[t]['name'])}</span>
            <span class="mono" style="margin-left: auto; font-size: 10.5px; color: var(--muted)">{'by sea · ' + esc(NODES[other]['name']) if by_sea else 'on foot'}</span>
          </div>'''
card = f'''
    <div style="position: absolute; right: 30px; bottom: 30px; width: 292px; display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; border: 1px solid var(--hair-strong); border-radius: 12px; background: var(--panel); box-shadow: 0 12px 32px var(--shadow)">
      <div style="display: flex; align-items: center; gap: 10px">
        <span aria-hidden="true" style="font-size: 20px; line-height: 1">🔐</span>
        <strong style="font-size: 15px; font-weight: 600">Keycloak</strong>
        <span class="mono" style="margin-left: auto; font-size: 10.5px; color: var(--accent)">▲ 2,600 m</span>
      </div>
      <span style="font-family: {SERIF}; font-style: italic; font-size: 13px; line-height: 1.45; color: var(--text-body)">Highest peak of Identity, with two foothills: Realms and Tokens.</span>
      <div style="display: flex; flex-direction: column; gap: 7px; padding-top: 10px; border-top: 1px solid var(--hair)">
        <span class="eyebrow" style="font-size: 9.5px">Routes from here</span>{trip_rows}
      </div>
    </div>'''

body = svg + cartouche + card + zoom_panel(legend_html).replace('left: 16px; bottom: 16px', 'left: 30px; bottom: 30px')
print(board('ViewAtlas.dc.html', 'Atlas', 'atlas', body))
print(len(body) // 1024, 'KB', len(hach), 'hachures')
