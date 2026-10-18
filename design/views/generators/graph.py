"""View 5 — Graph: the leaves as a network of threads, branches as soft clusters around them."""
import numpy as np
from scipy.spatial import ConvexHull
from common import *

W, H = 1440, 843
AREA = (70, 80, 1250, 760)  # x0, y0, x1, y1 the graph is fitted into (room for the side card)
rng = np.random.default_rng(11)

leaves = [n for n in LEAVES]
idx = {n['id']: i for i, n in enumerate(leaves)}
top_branch = {}
for n in leaves:
    p = n
    while p['depth'] > 1:
        p = p['parent']
    top_branch[n['id']] = p['id']
branch_ids = [b['id'] for b in TREE['children']]

# Backend is the hub most threads run through: it sits in the middle, the other branches
# around it, in an order that keeps linked branches next to each other.
CENTRE = np.array([610.0, 430.0])
ring = {'identity': -90, 'data': 16, 'frontend': 74, 'agents': 128, 'cloud': 200}
centre = {'backend': CENTRE.copy()}
for bid, deg in ring.items():
    a = math.radians(deg)
    centre[bid] = CENTRE + np.array([math.cos(a) * 455, math.sin(a) * 262])

n = len(leaves)
P = np.zeros((n, 2))
struct = []
for l in leaves:
    p = l['parent']
    if p['kind'] == 'leaf':
        struct.append((idx[l['id']], idx[p['id']]))
threads = [(idx[a], idx[b]) for a, b in LINKS]
radius = np.array([5 + (l['words'] ** 0.5) / 9 for l in leaves])

# each branch laid out on its own, then placed: clusters never overlap
for bid in branch_ids:
    members = [i for i, l in enumerate(leaves) if top_branch[l['id']] == bid]
    Q = rng.normal(0, 30, (len(members), 2))
    local = {m: k for k, m in enumerate(members)}
    springs = [(local[i], local[j]) for i, j in struct if i in local and j in local]
    for step in range(600):
        cool = 1 - step / 600
        F = np.zeros_like(Q)
        d = Q[:, None, :] - Q[None, :, :]
        dist2 = (d ** 2).sum(-1) + 1e-3
        np.fill_diagonal(dist2, np.inf)
        F += (d / dist2[..., None] * 700).sum(1)
        for i, j in springs:
            v = Q[j] - Q[i]
            L_ = np.linalg.norm(v) + 1e-6
            f = 0.09 * (L_ - 64) * v / L_
            F[i] += f
            F[j] -= f
        F -= 0.06 * Q
        step_len = np.clip(np.linalg.norm(F, axis=1, keepdims=True), 1e-6, None)
        Q += F / step_len * np.minimum(step_len, 10 * cool + 0.3)
    Q -= Q.mean(0)
    # every cluster gets room for its size, whatever the simulation settled on
    reach = np.linalg.norm(Q, axis=1).max() or 1
    Q *= (34 * math.sqrt(len(members)) + 20) / reach
    # turn the cluster so its threaded leaves face the hub
    if bid != 'backend':
        to_hub = CENTRE - centre[bid]
        pull = np.zeros(2)
        for i, j in threads:
            for a, b in ((i, j), (j, i)):
                if a in local and b not in local:
                    pull += Q[local[a]]
        if np.linalg.norm(pull) > 1e-6:
            ang = math.atan2(to_hub[1], to_hub[0]) - math.atan2(pull[1], pull[0])
            c, s_ = math.cos(ang), math.sin(ang)
            Q = Q @ np.array([[c, s_], [-s_, c]])
    for m in members:
        P[m] = centre[bid] + Q[local[m]]

sel = idx[SELECTED]
near = {sel}
for i, j in threads + struct:
    if sel in (i, j):
        near |= {i, j}


def smooth_closed(pts):
    """Catmull-Rom through the hull points, as cubic Béziers."""
    k = len(pts)
    d = f'M{pts[0][0]:.1f},{pts[0][1]:.1f}'
    for i in range(k):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[(i + 1) % k], pts[(i + 2) % k]
        c1 = p1 + (p2 - p0) / 6
        c2 = p2 - (p3 - p1) / 6
        d += f' C{c1[0]:.1f},{c1[1]:.1f} {c2[0]:.1f},{c2[1]:.1f} {p2[0]:.1f},{p2[1]:.1f}'
    return d + 'Z'


hulls = ''
for bid in branch_ids:
    members = [i for i, l in enumerate(leaves) if top_branch[l['id']] == bid]
    ring = []
    for i in members:
        for a in np.linspace(0, 2 * math.pi, 24, endpoint=False):
            ring.append(P[i] + (radius[i] + 30) * np.array([math.cos(a), math.sin(a)]))
    ring = np.array(ring)
    hull = ring[ConvexHull(ring).vertices]
    # thin out points that sit close together, so the curve stays round
    keep = [hull[0]]
    for p in hull[1:]:
        if np.linalg.norm(p - keep[-1]) > 16:
            keep.append(p)
    hull = np.array(keep)
    hot = sel in members
    hulls += (f'<path d="{smooth_closed(hull)}" fill="var(--accent)" fill-opacity="{0.07 if hot else 0.035}" stroke="var(--accent)" '
              f'stroke-opacity="{0.4 if hot else 0.16}" stroke-dasharray="3 5"></path>')
    top = hull[np.argmin(hull[:, 1])]
    cx = hull[:, 0].mean()
    hulls += f'<text class="blbl a-mid" x="{cx:.1f}" y="{hull[:, 1].min() + 18:.1f}">{esc(NODES[bid]["name"].upper())}</text>'

edges = ''
for i, j in struct:
    hot = sel in (i, j)
    edges += (f'<line x1="{P[i][0]:.1f}" y1="{P[i][1]:.1f}" x2="{P[j][0]:.1f}" y2="{P[j][1]:.1f}" stroke="var(--line)" '
              f'stroke-opacity="{0.42 if hot else 0.16}" stroke-width="1"></line>')
for i, j in threads:
    hot = sel in (i, j)
    a, b = P[i], P[j]
    mid = (a + b) / 2
    nvec = np.array([-(b - a)[1], (b - a)[0]]) * 0.12
    c = mid + nvec
    edges += (f'<path d="M{a[0]:.1f},{a[1]:.1f} Q{c[0]:.1f},{c[1]:.1f} {b[0]:.1f},{b[1]:.1f}" fill="none" stroke="var(--accent)" '
              f'stroke-width="{2 if hot else 1.1}" stroke-opacity="{0.95 if hot else 0.3}"></path>')

# labels: each takes the first side (right, left, below, above) that touches no dot or label
boxes = [(P[i][0] - radius[i] - 2, P[i][1] - radius[i] - 2, P[i][0] + radius[i] + 2, P[i][1] + radius[i] + 2) for i in range(len(leaves))]
placed = {}
def hits(b):
    return any(not (b[2] < o[0] or b[0] > o[2] or b[3] < o[1] or b[1] > o[3]) for o in boxes)
for i in sorted(range(len(leaves)), key=lambda i: -radius[i]):
    l = leaves[i]
    name = (l['emoji'] + ' ' if l['emoji'] else '') + l['name']
    w = text_w(name, 12.5) + 4
    x, y, r = P[i][0], P[i][1], radius[i]
    options = [
        ('start', x + r + 7, y + 4.5, (x + r + 5, y - 8, x + r + 9 + w, y + 8)),
        ('end', x - r - 7, y + 4.5, (x - r - 9 - w, y - 8, x - r - 5, y + 8)),
        ('middle', x, y + r + 16, (x - w / 2, y + r + 4, x + w / 2, y + r + 20)),
        ('middle', x, y - r - 8, (x - w / 2, y - r - 20, x + w / 2, y - r - 4)),
    ]
    pick = next((o for o in options if not hits(o[3])), options[0])
    boxes.append(pick[3])
    placed[i] = (pick, name)

dots = ''
for i, l in enumerate(leaves):
    x, y = P[i]
    r = radius[i]
    is_sel = i == sel
    dim = '' if i in near else ' style="opacity: .38"'
    g = ''
    if is_sel:
        g += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r + 8:.1f}" fill="none" stroke="var(--accent)"></circle>'
    if l['children']:
        g += f'<circle class="ring" cx="{x:.1f}" cy="{y:.1f}" r="{r + 3.5:.1f}"></circle>'
    g += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="{"var(--accent)" if is_sel else "var(--node)"}"></circle>'
    (anchor, lx, ly, _), name = placed[i]
    cls = 'lbl lsel' if is_sel else 'lbl'
    g += f'<text class="{cls}" x="{lx:.1f}" y="{ly:.1f}" text-anchor="{anchor}" font-size="12.5">{esc(name)}</text>'
    dots += f'<g class="n"{dim}>{g}</g>'

svg = (f'<svg viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-label="Graph of leaves and threads" '
       f'style="position: absolute; inset: 0; display: block; font-family: \'Geist\', ui-sans-serif, system-ui, sans-serif">'
       f'{grid_bg(W, H)}{hulls}{edges}{dots}</svg>')

# side card for the selection: what it connects to
links = [(b if a == SELECTED else a) for a, b in LINKS if SELECTED in (a, b)]
rows = ''.join(f'''
          <div class="row" style="display: flex; align-items: center; gap: 10px; padding: 7px 8px; border-radius: 8px">
            <svg width="18" height="10" viewBox="0 0 18 10" aria-hidden="true"><path d="M1 9C6 9 7 1 17 1" fill="none" stroke="var(--accent)" stroke-width="1.4"></path></svg>
            <span style="font-size: 13px">{esc(NODES[t]['name'])}</span>
            <span class="mono" style="margin-left: auto; font-size: 10.5px; color: var(--muted)">{esc(NODES[top_branch[t]]['name'])}</span>
          </div>''' for t in links)
card = f'''
    <div style="position: absolute; right: 16px; top: 16px; width: 272px; display: flex; flex-direction: column; gap: 10px; padding: 16px; border: 1px solid var(--hair); border-radius: 12px; background: var(--panel)">
      <span class="eyebrow" style="color: var(--accent)">Selected leaf</span>
      <div style="display: flex; align-items: center; gap: 10px"><span aria-hidden="true" style="font-size: 22px; line-height: 1">🔐</span><strong style="font-size: 17px; font-weight: 600">Keycloak</strong></div>
      <span class="mono" style="font-size: 11px; color: var(--text-body)">Identity · 2,600 words</span>
      <div style="display: flex; flex-direction: column; gap: 2px; margin-top: 4px; padding-top: 10px; border-top: 1px solid var(--hair)">
        <span class="eyebrow" style="margin: 0 0 4px 8px">Threads · {len(links)}</span>{rows}
      </div>
      <button type="button" class="ghost" style="display: flex; align-items: center; justify-content: center; gap: 8px; height: 36px; margin-top: 4px; border: 1px solid var(--hair-strong); border-radius: 9px; background: transparent; font-size: 12.5px; cursor: pointer">Open leaf<svg class="ic" width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"></path></svg></button>
    </div>'''

chips = '''
    <div style="position: absolute; left: 16px; top: 16px; display: flex; gap: 6px">
      <button type="button" class="chip" aria-pressed="true" style="display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 12px; border: 1px solid var(--hair); border-radius: 17px; background: var(--panel); font-size: 12.5px; cursor: pointer"><span style="width: 14px; height: 2px; background: var(--accent); border-radius: 1px"></span>Threads</button>
      <button type="button" class="chip" aria-pressed="true" style="display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 12px; border: 1px solid var(--hair); border-radius: 17px; background: var(--panel); font-size: 12.5px; cursor: pointer"><span style="width: 14px; height: 1px; background: var(--line); opacity: .5"></span>Sub-leaves</button>
      <button type="button" class="chip" aria-pressed="true" style="display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 12px; border: 1px solid var(--hair); border-radius: 17px; background: var(--panel); font-size: 12.5px; cursor: pointer"><span style="width: 14px; height: 10px; border-radius: 5px; border: 1px dashed var(--accent)"></span>Branches</button>
    </div>'''

body = svg + chips + card + zoom_panel(legend([('leaf', 'Leaf'), ('sprout', 'With sub-leaves'), ('thread', 'Thread'), ('hull', 'Branch'), ('', 'Size = words')]))
print(board('ViewGraph.dc.html', 'Graph', 'graph', body))
