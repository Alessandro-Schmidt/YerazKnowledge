"""View 6 — Growth rings: the Tree cut across its trunk. One ring per month of writing, wider when you
wrote more; each leaf sits in the ring it was planted in, branches are separated by wood rays."""
import math
import random
from common import *

MONTHS = ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct']
YEARS = [2025, 2025] + [2026] * 10
LONG = ['November', 'December', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October']
NOW = 11
# The month each leaf was planted (0 = November 2025).
PLANTED = {
    'java': 0, 'spring': 0, 'angular': 0, 'oracle': 0,
    'streams': 1, 'rest': 1, 'jenkins': 1,
    'records': 2, 'springdata': 2, 'docker': 2,
    'springsec': 3, 'circleci': 3, 'postgres': 3,
    'react': 4, 'indexes': 4,
    'vthreads': 5, 'tx': 5,
    'hooks': 6, 'schema': 6,
    'oauth': 8, 'prompting': 9,
    'keycloak': 10, 'realms': 10, 'oidc': 10, 'gcp': 10, 'cloudrun': 10, 'claudecode': 10,
    'tokens': 11, 'iam': 11, 'evals': 11,
}
# Words land mostly in the month a leaf is planted, then trickle in after.
DECAY = 0.33
grown = {n['id']: [0.0] * 12 for n in LEAVES}
for n in LEAVES:
    c = PLANTED[n['id']]
    ws = [DECAY ** (k - c) for k in range(c, 12)]
    for k, w in zip(range(c, 12), ws):
        grown[n['id']][k] = n['words'] * w / sum(ws)
per_month = [sum(g[k] for g in grown.values()) for k in range(12)]
planted_in = [[n for n in LEAVES if PLANTED[n['id']] == k] for k in range(12)]
BUSIEST = max(range(12), key=lambda k: per_month[k])
QUIETEST = min(range(12), key=lambda k: per_month[k])

W, H = 1076, 843
CX, CY = 538, 424
PITH, R = 15, 322
MIN_W = 9
k = (R - PITH - MIN_W * 12) / sum(per_month)
bounds = [PITH]
for m in range(12):
    bounds.append(bounds[-1] + MIN_W + per_month[m] * k)

rnd = random.Random(11)
SHAPE = [(2, 0.022, 0.7), (3, 0.016, 2.1), (5, 0.007, 4.0)]
NOISE = [[(h, rnd.uniform(0.35, 1.1), rnd.uniform(0, 6.28)) for h in (6, 9, 13)] for _ in bounds]


def radius(i, th):
    """Boundary i (0 = pith edge) at angle th: a shared lopsided shape plus a little noise per ring."""
    r = bounds[i]
    f = 1 + sum(a * math.sin(h * th + p) for h, a, p in SHAPE) * min(1, r / 120)
    return r * f + sum(a * math.sin(h * th + p) for h, a, p in NOISE[i]) * min(1, r / 80)


def at(rr, th):
    return CX + rr * math.cos(th), CY + rr * math.sin(th)


def loop(fn, steps=240):
    pts = [at(fn(2 * math.pi * s / steps), 2 * math.pi * s / steps) for s in range(steps)]
    return 'M' + ' L'.join(f'{x:.1f},{y:.1f}' for x, y in pts) + 'Z'


def mid_radius(m, th):
    return (radius(m, th) + radius(m + 1, th)) / 2


# Branch sectors, clockwise from the top, sized by how many leaves they hold.
branches = TREE['children']
counts = [sum(1 for n in LEAVES if n['parent'] is b or n['parent']['parent'] is b) for b in branches]
GAP = math.radians(7)
span_total = 2 * math.pi - GAP
unit = span_total / (sum(counts) + 0.6 * len(branches))
sectors = {}
a = -math.pi / 2 + GAP / 2
for b, c in zip(branches, counts):
    sectors[b['id']] = (a, a + unit * (c + 0.6))
    a += unit * (c + 0.6)


def flat(b):
    out = []
    for c in b['children']:
        if c['kind'] == 'leaf':
            out.append(c)
        out.extend(c['children'])
    return out


pos = {}
for b in branches:
    a0, a1 = sectors[b['id']]
    items = flat(b)
    for i, n in enumerate(items):
        th = a0 + unit * (0.3 + i + 0.5)
        m = PLANTED[n['id']]
        pos[n['id']] = at(mid_radius(m, th), th) + (th,)


def dot_r(n):
    return 2.6 + n['words'] ** 0.5 / 17


# ---- wood -----------------------------------------------------------------------------------
wood = ''
for m in range(12):
    t = 3 + 19 * (m / 11) ** 1.4   # heartwood is plain, the sapwood takes the accent
    band = loop(lambda th, m=m: radius(m + 1, th)) + ' ' + loop(lambda th, m=m: radius(m, th))
    wood += f'<path d="{band}" fill-rule="evenodd" fill="color-mix(in srgb, var(--accent) {t:.0f}%, var(--raised))"></path>'
    wdt = bounds[m + 1] - bounds[m]
    # latewood: the dense, darker end of each year's growth
    wood += (f'<path d="{loop(lambda th, m=m, wdt=wdt: radius(m + 1, th) - wdt * 0.13)}" fill="none" stroke="var(--line)" '
             f'stroke-opacity="0.09" stroke-width="{wdt * 0.26:.1f}"></path>')
    # grain inside the ring
    for f in (0.38, 0.62):
        wood += (f'<path d="{loop(lambda th, m=m, f=f: radius(m, th) + (radius(m + 1, th) - radius(m, th)) * f)}" fill="none" '
                 f'stroke="var(--line)" stroke-opacity="0.05" stroke-width="0.8"></path>')
for i in range(1, 13):
    wood += (f'<path d="{loop(lambda th, i=i: radius(i, th))}" fill="none" stroke="var(--line)" '
             f'stroke-opacity="{0.42 if i < 12 else 0.6}" stroke-width="{1 if i < 12 else 1.4}"></path>')
wood += f'<circle cx="{CX}" cy="{CY}" r="{PITH}" fill="color-mix(in srgb, var(--line) 22%, var(--raised))"></circle>'
wood += f'<circle cx="{CX}" cy="{CY}" r="3" fill="var(--line)" fill-opacity="0.55"></circle>'

# fine medullary rays, and the bold rays between branches
rays = ''
for s in range(0, 360, 3):
    th = math.radians(s + rnd.uniform(-1, 1))
    r0 = rnd.uniform(PITH + 6, R * 0.6)
    x0, y0 = at(r0, th)
    x1, y1 = at(radius(12, th) - 2, th)
    rays += f'<path d="M{x0:.1f},{y0:.1f} L{x1:.1f},{y1:.1f}" stroke="var(--line)" stroke-opacity="0.07" stroke-width="0.7"></path>'
for b in branches:
    th = sectors[b['id']][0]
    x0, y0 = at(PITH + 2, th)
    x1, y1 = at(radius(12, th), th)
    rays += (f'<path d="M{x0:.1f},{y0:.1f} L{x1:.1f},{y1:.1f}" stroke="var(--bg)" stroke-opacity="0.55" stroke-width="3"></path>'
             f'<path d="M{x0:.1f},{y0:.1f} L{x1:.1f},{y1:.1f}" stroke="var(--line)" stroke-opacity="0.3" stroke-width="0.8"></path>')
# the borer hole: where the core sample on the right was taken
th = -math.pi / 2
bx0, by0 = at(PITH + 3, th)
bx1, by1 = at(radius(12, th) + 22, th)
rays += (f'<path d="M{bx0:.1f},{by0:.1f} L{bx1:.1f},{by1:.1f}" stroke="var(--bg)" stroke-width="5" stroke-linecap="round"></path>'
         f'<path d="M{bx0:.1f},{by0:.1f} L{bx1:.1f},{by1:.1f}" stroke="var(--line)" stroke-opacity="0.35" stroke-width="1" stroke-dasharray="2 3"></path>')

# bark: a rough outer band with fissures
BARK = 17
outer = loop(lambda th: radius(12, th) + 3 + BARK + 2.2 * math.sin(23 * th) + 1.6 * math.sin(37 * th + 1) + 1.1 * math.sin(61 * th + 2), 480)
inner = loop(lambda th: radius(12, th) + 2, 240)
bark = f'<path d="{outer} {inner}" fill-rule="evenodd" fill="color-mix(in srgb, var(--text) 14%, var(--raised))" stroke="var(--hair-strong)"></path>'
for s in range(0, 360, 2):
    thd = math.radians(s + rnd.uniform(-0.8, 0.8))
    if abs(thd + math.pi / 2) < 0.06 or abs(thd - 3 * math.pi / 2) < 0.06:
        continue
    r0 = radius(12, thd) + 4 + rnd.uniform(0, 4)
    r1 = r0 + rnd.uniform(6, BARK - 1)
    x0, y0 = at(r0, thd)
    x1, y1 = at(r1, thd + rnd.uniform(-0.01, 0.01))
    bark += f'<path d="M{x0:.1f},{y0:.1f} L{x1:.1f},{y1:.1f}" stroke="var(--line)" stroke-opacity="0.22" stroke-width="{rnd.uniform(0.6, 1.4):.1f}" stroke-linecap="round"></path>'
# the cambium: this month's growth, still alive
cambium = (f'<path d="{loop(lambda th: radius(12, th))}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-opacity="0.85"></path>'
           f'<path d="{loop(lambda th: radius(11, th))}" fill="none" stroke="var(--accent)" stroke-width="1" stroke-opacity="0.35" stroke-dasharray="1 3"></path>')

# branch names, set around the bark
labels_out = ''
defs = ''
LR = R + 44
for b in branches:
    a0, a1 = sectors[b['id']]
    mid = (a0 + a1) / 2
    bottom = math.sin(mid) > 0.15
    r_txt = LR + (8 if bottom else 0)
    p0, p1 = (at(r_txt, a1), at(r_txt, a0)) if bottom else (at(r_txt, a0), at(r_txt, a1))
    sweep = 0 if bottom else 1
    defs += f'<path id="arc-{b["id"]}" d="M{p0[0]:.1f},{p0[1]:.1f} A{r_txt},{r_txt} 0 0 {sweep} {p1[0]:.1f},{p1[1]:.1f}"></path>'
    labels_out += (f'<text font-size="10.5" font-weight="500" letter-spacing="2.2" style="fill: var(--accent)">'
                   f'<textPath href="#arc-{b["id"]}" startOffset="50%" text-anchor="middle">{esc(b["name"].upper())}</textPath></text>')
    # tick where the branch's ray meets the bark
    tx0, ty0 = at(R + 30, a0)
    tx1, ty1 = at(R + 40, a0)
    labels_out += f'<path d="M{tx0:.1f},{ty0:.1f} L{tx1:.1f},{ty1:.1f}" stroke="var(--hair-strong)" stroke-width="1"></path>'

# ---- threads, knots, leaves ----------------------------------------------------------------------
threads = ''
for a_, b_ in LINKS:
    x0, y0, _ = pos[a_]
    x1, y1, _ = pos[b_]
    mx, my = (x0 + x1) / 2, (y0 + y1) / 2
    qx, qy = CX + (mx - CX) * 0.3, CY + (my - CY) * 0.3
    sel = SELECTED in (a_, b_)
    if sel:
        threads += (f'<path d="M{x0:.1f},{y0:.1f} Q{qx:.1f},{qy:.1f} {x1:.1f},{y1:.1f}" fill="none" stroke="var(--accent)" '
                    f'stroke-width="1.5" stroke-opacity="0.9" stroke-dasharray="4 4"></path>')
    else:
        threads += (f'<path d="M{x0:.1f},{y0:.1f} Q{qx:.1f},{qy:.1f} {x1:.1f},{y1:.1f}" fill="none" stroke="var(--line)" '
                    f'stroke-width="1" stroke-opacity="0.2"></path>')

knots = ''
for n in LEAVES:
    p = n['parent']
    if p['kind'] == 'leaf':
        x0, y0, _ = pos[p['id']]
        x1, y1, _ = pos[n['id']]
        knots += f'<path d="M{x0:.1f},{y0:.1f} L{x1:.1f},{y1:.1f}" stroke="var(--line)" stroke-opacity="0.4" stroke-width="1.6" stroke-linecap="round"></path>'

dots = ''
for n in LEAVES:
    x, y, _ = pos[n['id']]
    r = dot_r(n)
    sel = n['id'] == SELECTED
    if sel:
        dots += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r + 7:.1f}" fill="none" stroke="var(--accent)" stroke-width="1.2"></circle>'
    if n['children']:
        dots += f'<circle class="ring" cx="{x:.1f}" cy="{y:.1f}" r="{r + 3.2:.1f}"></circle>'
    fresh = PLANTED[n['id']] == NOW
    dots += (f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="{"var(--accent)" if sel else "var(--node)"}" '
             f'stroke="var(--bg)" stroke-width="1.2"></circle>')
    if fresh:
        dots += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r + 3:.1f}" fill="none" stroke="var(--accent)" stroke-width="1" stroke-dasharray="2 2"></circle>'

# labels, placed greedily so none overlaps another label or a dot
boxes = [(x - dot_r(NODES[i]) - 2, y - dot_r(NODES[i]) - 2, x + dot_r(NODES[i]) + 2, y + dot_r(NODES[i]) + 2) for i, (x, y, _) in pos.items()]
placed = []


def free(b):
    for o in placed:
        if b[0] < o[2] and b[2] > o[0] and b[1] < o[3] and b[3] > o[1]:
            return False
    for o in boxes:
        if b[0] < o[2] and b[2] > o[0] and b[1] < o[3] and b[3] > o[1]:
            return False
    return True


texts = ''
order = sorted(LEAVES, key=lambda n: (n['id'] != SELECTED, -n['words']))
for n in order:
    x, y, th = pos[n['id']]
    r = dot_r(n)
    size = 11.5 if n['depth'] == 2 else 10.5
    name = (n['emoji'] + ' ' if n['emoji'] else '') + n['name']
    tw = text_w(name, size) + (6 if n['emoji'] else 0)
    hh = size + 2
    out_right = math.cos(th) >= 0
    cands = []
    for dx_side in ([1, -1] if out_right else [-1, 1]):
        for dy in (0, -9, 9, -16, 16):
            if dx_side > 0:
                cands.append((x + r + 5, y + dy, 'start', (x + r + 4, y + dy - hh / 2 - 1, x + r + 6 + tw, y + dy + hh / 2)))
            else:
                cands.append((x - r - 5, y + dy, 'end', (x - r - 6 - tw, y + dy - hh / 2 - 1, x - r - 4, y + dy + hh / 2)))
    cands.append((x, y - r - 6, 'middle', (x - tw / 2 - 1, y - r - 6 - hh, x + tw / 2 + 1, y - r - 4)))
    cands.append((x, y + r + 6 + size * 0.8, 'middle', (x - tw / 2 - 1, y + r + 4, x + tw / 2 + 1, y + r + 6 + hh)))
    for tx, ty, anchor, box in cands:
        if free(box):
            break
    else:
        tx, ty, anchor, box = cands[0]
    placed.append(box)
    baseline = ty + size * 0.36 if anchor != 'middle' or ty > y else ty
    sel = n['id'] == SELECTED
    style = ('fill: var(--accent); font-weight: 600' if sel else
             ('fill: var(--text); font-weight: 500' if n['depth'] == 2 else 'fill: var(--text-body)'))
    texts += (f'<text x="{tx:.1f}" y="{baseline:.1f}" text-anchor="{anchor}" font-size="{size}" '
              f'style="{style}; paint-order: stroke; stroke: var(--bg); stroke-width: 3px; stroke-linejoin: round; stroke-opacity: 0.85">{esc(name)}</text>')

# callouts: the first leaf, the busiest month, the living edge
callouts = ''


def callout(th, rr, lx, ly, title, sub, anchor='start'):
    x0, y0 = at(rr, th)
    tw = text_w(title, 12) + 4
    left, right = (lx, lx + tw) if anchor == 'start' else (lx - tw, lx)
    near_left = abs(x0 - left) < abs(x0 - right)
    ex = left - 6 if near_left else right + 6
    out = (f'<circle cx="{x0:.1f}" cy="{y0:.1f}" r="2.6" fill="var(--text)"></circle>'
           f'<path d="M{x0:.1f},{y0:.1f} L{ex:.1f},{ly - 4:.1f} L{ex + (6 if near_left else -6):.1f},{ly - 4:.1f}" fill="none" stroke="var(--text)" stroke-opacity="0.55" stroke-width="1"></path>'
           f'<text x="{lx}" y="{ly}" text-anchor="{anchor}" font-size="12" font-weight="600" style="fill: var(--text)">{title}</text>'
           f'<text class="mono" x="{lx}" y="{ly + 16}" text-anchor="{anchor}" font-size="10.5" style="fill: var(--muted)">{sub}</text>')
    return out


th_b = math.radians(-19)
callouts += callout(th_b, mid_radius(BUSIEST, th_b), 908, 300, f'Busiest month · {LONG[BUSIEST]}',
                    f'{per_month[BUSIEST] / 1000:.1f}k words · {len(planted_in[BUSIEST])} planted')
th_n = math.radians(52)
callouts += callout(th_n, radius(12, th_n) + 1, 1040, 790, 'Growing now · October', f'{per_month[NOW] / 1000:.1f}k words so far', 'end')
last_backend = max(PLANTED[n['id']] for n in flat(NODES['backend']))
qa = math.radians(-40)
qx, qy = at(262, qa)
halo = 'paint-order: stroke; stroke: var(--bg); stroke-width: 3px; stroke-linejoin: round; stroke-opacity: 0.7'
callouts += (f'<text x="{qx:.1f}" y="{qy:.1f}" text-anchor="middle" font-size="13" font-style="italic" '
             f'style="font-family: \'Newsreader\', Georgia, serif; fill: var(--text-body); {halo}">Backend has planted nothing</text>'
             f'<text x="{qx:.1f}" y="{qy + 17:.1f}" text-anchor="middle" font-size="13" font-style="italic" '
             f'style="font-family: \'Newsreader\', Georgia, serif; fill: var(--text-body); {halo}">since {LONG[last_backend]}</text>')

svg = (f'<svg viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-label="Growth rings of Engineering" '
       f'style="position: absolute; left: 0; top: 0; display: block; font-family: \'Geist\', ui-sans-serif, system-ui, sans-serif">'
       f'<defs>{defs}</defs>{grid_bg(W, H, "gr")}'
       f'<g>{bark}{wood}{rays}{cambium}{knots}{threads}{dots}{texts}{labels_out}{callouts}</g></svg>')

# ---- the panel ----------------------------------------------------------------------------
CW = 316
core_total = bounds[12] - bounds[0]
segs = ''
x = 0.0
initials = ''
for m in range(12):
    wdt = (bounds[m + 1] - bounds[m]) / core_total * CW
    t = 3 + 19 * (m / 11) ** 1.4
    hot = m == BUSIEST
    segs += f'<rect x="{x:.1f}" y="0" width="{wdt:.1f}" height="34" fill="color-mix(in srgb, var(--accent) {t:.0f}%, var(--raised))"></rect>'
    segs += f'<rect x="{x + wdt * 0.74:.1f}" y="0" width="{wdt * 0.26:.1f}" height="34" fill="var(--line)" fill-opacity="0.09"></rect>'
    if m:
        segs += f'<path d="M{x:.1f},0 V34" stroke="var(--line)" stroke-opacity="0.42"></path>'
    style = 'fill: var(--accent); font-weight: 600' if hot else 'fill: var(--muted)'
    initials += f'<text class="mono" x="{x + wdt / 2:.1f}" y="52" text-anchor="middle" font-size="10" style="{style}">{MONTHS[m][0]}</text>'
    if hot:
        segs += f'<rect x="{x + 0.5:.1f}" y="0.5" width="{wdt - 1:.1f}" height="33" fill="none" stroke="var(--accent)" stroke-width="1.2"></rect>'
    x += wdt
core = f'''
        <svg width="{CW + 20}" height="60" viewBox="-6 -6 {CW + 20} 60" aria-hidden="true" style="display: block; overflow: visible">
          <defs><clipPath id="core-clip"><rect x="0" y="0" width="{CW}" height="34" rx="17"></rect></clipPath></defs>
          <g clip-path="url(#core-clip)">{segs}</g>
          <rect x="0" y="0" width="{CW}" height="34" rx="17" fill="none" stroke="var(--hair-strong)"></rect>
          <circle cx="{CW - 12}" cy="17" r="10" fill="var(--panel)" stroke="var(--accent)" stroke-width="2"></circle>
          <circle cx="{CW - 12}" cy="17" r="3" fill="var(--accent)"></circle>
          {initials}
        </svg>'''

bars = ''
mx = max(per_month)
for m in range(12):
    hgt = 4 + per_month[m] / mx * 44
    hot = m == BUSIEST
    bars += (f'<div title="{LONG[m]} {YEARS[m]}" style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 5px; height: 66px">'
             f'<span style="width: 100%; height: {hgt:.0f}px; border-radius: 3px; background: {"var(--accent)" if hot else "color-mix(in srgb, var(--accent) 22%, var(--raised))"}"></span>'
             f'<span class="mono" style="font-size: 9.5px; color: {"var(--accent)" if hot else "var(--faint)"}">{MONTHS[m][0]}</span></div>')

heat = ''
for b in branches:
    months = [sum(grown[n['id']][m] for n in flat(b)) for m in range(12)]
    cells = ''.join(f'<span title="{LONG[m]}" style="flex: 1; height: 12px; border-radius: 2px; background: '
                    f'color-mix(in srgb, var(--accent) {min(100, 6 + v / 2600 * 94):.0f}%, var(--raised))"></span>' for m, v in enumerate(months))
    heat += (f'<div style="display: flex; align-items: center; gap: 10px"><span style="width: 74px; font-size: 12px; color: var(--text-body)">{esc(b["name"])}</span>'
             f'<span style="flex: 1; display: flex; gap: 3px">{cells}</span>'
             f'<span class="mono" style="width: 34px; text-align: right; font-size: 10.5px; color: var(--muted)">{compact(b["total"])}</span></div>')

kc = NODES[SELECTED]
kc_threads = [(b if a == SELECTED else a) for a, b in LINKS if SELECTED in (a, b)]
thread_rows = ''.join(f'''
            <div style="display: flex; align-items: center; gap: 8px; font-size: 12.5px">
              <svg width="16" height="9" viewBox="0 0 16 9" aria-hidden="true"><path d="M1 8C5 8 6 1 15 1" fill="none" stroke="var(--accent)" stroke-width="1.4" stroke-dasharray="3 2"></path></svg>
              <span>{esc(NODES[t]['name'])}</span>
              <span class="mono" style="margin-left: auto; font-size: 10.5px; color: var(--muted)">ring of {MONTHS[PLANTED[t]]} {str(YEARS[PLANTED[t]])[2:]}</span>
            </div>''' for t in kc_threads)

panel = f'''
    <aside style="position: absolute; right: 0; top: 0; bottom: 0; width: {1440 - W}px; box-sizing: border-box; display: flex; flex-direction: column; gap: 20px; padding: 24px 24px 20px; border-left: 1px solid var(--hair); background: var(--panel); overflow: hidden">
      <div style="display: flex; flex-direction: column; gap: 6px">
        <span class="eyebrow" style="color: var(--accent)">Growth rings</span>
        <h2 style="margin: 0; font-size: 20px; font-weight: 600; letter-spacing: -0.01em">A year of Engineering</h2>
        <p style="margin: 0; font-size: 12.5px; line-height: 1.5; color: var(--text-body)">One ring for every month since your first leaf. Wide rings are months you wrote a lot; every leaf sits in the ring it was planted in.</p>
      </div>
      <section style="display: flex; flex-direction: column; gap: 10px">
        <div style="display: flex; align-items: baseline; justify-content: space-between">
          <h3 class="eyebrow" style="margin: 0">Core sample</h3>
          <span class="mono" style="font-size: 10.5px; color: var(--faint)">Nov 2025 → today</span>
        </div>
        {core}
        <div style="display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--text-body)">
          <span style="white-space: nowrap">Show the Tree as it was in</span>
          <button type="button" class="ghost" style="display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 8px 0 10px; border: 1px solid var(--hair-strong); border-radius: 8px; background: transparent; font-size: 12.5px; white-space: nowrap; cursor: pointer">Oct 2026<svg class="ic" width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg></button>
          <button type="button" class="ibtn" aria-label="Grow the year" style="margin-left: auto; width: 30px; height: 30px; display: grid; place-items: center; border: 0; border-radius: 8px; background: var(--raised); color: var(--accent); cursor: pointer"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.5v9l7.5-4.5z" fill="currentColor"></path></svg></button>
        </div>
      </section>
      <section style="display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; border: 1px solid var(--hair-strong); border-radius: 12px; background: var(--bg)">
        <div style="display: flex; align-items: center; gap: 10px">
          <span aria-hidden="true" style="font-size: 20px; line-height: 1">🔐</span>
          <strong style="font-size: 15px; font-weight: 600">Keycloak</strong>
          <span class="mono" style="margin-left: auto; font-size: 10.5px; color: var(--muted)">Identity</span>
        </div>
        <div style="display: flex; gap: 6px; flex-wrap: wrap">
          <span class="mono" style="padding: 3px 8px; border-radius: 6px; background: var(--accent-soft); font-size: 11px; color: var(--accent)">Planted September 2026</span>
          <span class="mono" style="padding: 3px 8px; border: 1px solid var(--hair); border-radius: 6px; font-size: 11px; color: var(--text-body)">{kc['words']:,} words</span>
        </div>
        <span style="font-size: 12px; line-height: 1.45; color: var(--muted)">Grew fast: {grown[SELECTED][10] / kc['words'] * 100:.0f}% of it in its first month. Its two sub-leaves sprouted in the rings after.</span>
        <div style="display: flex; flex-direction: column; gap: 7px; padding-top: 10px; border-top: 1px solid var(--hair)">{thread_rows}
        </div>
      </section>
      <section style="display: flex; flex-direction: column; gap: 7px">
        <h3 class="eyebrow" style="margin: 0 0 3px">Each branch, month by month</h3>{heat}
      </section>
      <div style="margin-top: auto; display: flex; flex-wrap: wrap; gap: 8px 16px; font-size: 11.5px; color: var(--text-body)">
        <span style="display: inline-flex; align-items: center; gap: 7px"><svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true"><path d="M1 11C1 5 5 1 17 1" fill="none" stroke="var(--line)" stroke-opacity="0.6"></path><path d="M1 11C1 8 4 5 17 5" fill="none" stroke="var(--line)" stroke-opacity="0.6"></path></svg>Ring: a month</span>
        <span style="display: inline-flex; align-items: center; gap: 7px"><span class="gl gl-leaf"></span>Leaf, sized by words</span>
        <span style="display: inline-flex; align-items: center; gap: 7px"><span style="width: 2px; height: 14px; background: var(--line); opacity: .5"></span>Ray: between branches</span>
        <span style="display: inline-flex; align-items: center; gap: 7px"><span style="width: 16px; height: 0; border-top: 1.5px dashed var(--accent)"></span>Thread</span>
      </div>
    </aside>'''

body = svg + panel + zoom_panel()
print(board('ViewRings.dc.html', 'Growth rings', 'rings', body))
print([round(p) for p in per_month], BUSIEST, QUIETEST, [round(b) for b in bounds])
