"""View 1 — Mind map: the Tree as a horizontal map, branches either side of the core."""
from common import *

W, H = 1440, 843
CX, CY = 720, 404
ROW, GAP = 40, 24
D_BRANCH, D_LEAF, D_SUB = 150, 360, 560
SIDES = {1: ['backend', 'cloud', 'agents'], -1: ['identity', 'data', 'frontend']}

pos = {}  # id -> (x, y, side)
for side, ids in SIDES.items():
    slots = []
    for bi, bid in enumerate(ids):
        b = NODES[bid]
        for l in b['children']:
            if l['children']:
                for c in l['children']:
                    slots.append((bid, l['id'], c['id']))
            else:
                slots.append((bid, l['id'], None))
    groups = len(ids)
    total = len(slots) * ROW + (groups - 1) * GAP
    y = CY - total / 2 + ROW / 2
    prev = None
    ys = {}
    for bid, lid, cid in slots:
        if prev is not None and bid != prev:
            y += GAP
        prev = bid
        ys.setdefault(bid, []).append(y)
        ys.setdefault(lid, []).append(y)
        if cid:
            pos[cid] = (CX + side * D_SUB, y, side)
        y += ROW
    for bid in ids:
        pos[bid] = (CX + side * D_BRANCH, sum(ys[bid]) / len(ys[bid]), side)
        for l in NODES[bid]['children']:
            pos[l['id']] = (CX + side * D_LEAF, sum(ys[l['id']]) / len(ys[l['id']]), side)

def dot_r(n):
    return 3.2 + (n['words'] or 0) ** 0.5 / 18

def curve(x0, y0, x1, y1):
    dx = (x1 - x0) * 0.5
    return f'M{x0:.1f},{y0:.1f} C{x0 + dx:.1f},{y0:.1f} {x1 - dx:.1f},{y1:.1f} {x1:.1f},{y1:.1f}'

PILL_H = 26
def pill_w(n):
    return text_w(n['name'].upper(), 10.5, upper=True, spacing=0.14) + 26

edges, threads, nodes_svg = '', '', ''
ROOT_W = 196
# core -> branches
for side, ids in SIDES.items():
    for bid in ids:
        bx, by, _ = pos[bid]
        edges += f'<path d="{curve(CX + side * ROOT_W / 2, CY, bx, by)}" fill="none" stroke="var(--line)" stroke-opacity="0.24" stroke-width="2"></path>'

label_end = {}
for n in NODES.values():
    if n['depth'] == 0 or n['id'] not in pos:
        continue
    x, y, side = pos[n['id']]
    anchor = 'start' if side > 0 else 'end'
    if n['depth'] == 1:
        pw = pill_w(n)
        x0 = x if side > 0 else x - pw
        nodes_svg += (f'<g><rect x="{x0:.1f}" y="{y - PILL_H / 2:.1f}" width="{pw:.1f}" height="{PILL_H}" rx="13" fill="var(--bg)" '
                      f'stroke="var(--accent)" stroke-opacity="0.55"></rect>'
                      f'<text class="blbl a-mid" x="{x0 + pw / 2:.1f}" y="{y + 3.8:.1f}">{esc(n["name"].upper())}</text></g>')
        label_end[n['id']] = x + side * pw
        continue
    sel = n['id'] == SELECTED
    is_branch = n['kind'] == 'branch'
    r = 4.5 if is_branch else dot_r(n)
    size = 13 if n['depth'] == 2 else 12.5
    words = '' if is_branch else compact(n['words'])
    name = (n['emoji'] + ' ' if n['emoji'] else '') + n['name']
    lx = x + side * (r + 8)
    g = ''
    if sel:
        g += f'<circle cx="{x}" cy="{y:.1f}" r="{r + 7:.1f}" fill="none" stroke="var(--accent)" stroke-width="1"></circle>'
    if is_branch:
        g += f'<circle cx="{x}" cy="{y:.1f}" r="{r}" fill="var(--bg)" stroke="var(--accent)" stroke-width="1.4"></circle>'
    else:
        if n['children']:
            g += f'<circle class="ring" cx="{x}" cy="{y:.1f}" r="{r + 3.5:.1f}"></circle>'
        g += f'<circle cx="{x}" cy="{y:.1f}" r="{r:.1f}" fill="{"var(--accent)" if sel else "var(--node)"}"></circle>'
    cls = 'lbl lsel' if sel else 'lbl'
    fill = '' if n['depth'] == 2 else ' style="fill: var(--text-body)"'
    g += (f'<text class="{cls}" x="{lx:.1f}" y="{y + 4.5:.1f}" text-anchor="{anchor}" font-size="{size}"{fill}>{esc(name)}'
          + (f'<tspan class="mono" dx="7" font-size="10.5" style="fill: var(--faint); font-weight: 400">{words}</tspan>' if words else '')
          + '</text>')
    nodes_svg += f'<g class="n">{g}</g>'
    lw = text_w(name, size) + (7 + text_w(words, 10.5) if words else 0)
    label_end[n['id']] = lx + side * lw

# branch -> leaf, leaf -> sub-leaf
for n in NODES.values():
    if n['depth'] < 2 or n['id'] not in pos:
        continue
    p = n['parent']
    x0 = label_end[p['id']] + pos[p['id']][2] * 8
    x, y, side = pos[n['id']]
    r = 4.5 if n['kind'] == 'branch' else dot_r(n)
    op, sw = (0.18, 1.4) if n['depth'] == 2 else (0.14, 1.1)
    edges += f'<path d="{curve(x0, pos[p["id"]][1], x - side * (r + 1), y)}" fill="none" stroke="var(--line)" stroke-opacity="{op}" stroke-width="{sw}"></path>'

# the selected leaf's threads, bowing over the core
for a, b in LINKS:
    if SELECTED not in (a, b):
        continue
    other = b if a == SELECTED else a
    x0, y0, _ = pos[SELECTED]
    x1, y1, _ = pos[other]
    if abs(x1 - x0) > 300:
        # long threads travel above the map and drop onto their leaf, clear of the labels between
        top = max(40, min(y0, y1) - 170)
        d = f'M{x0},{y0:.1f} C{x0 + 120:.1f},{top:.1f} {x1 - 40:.1f},{top:.1f} {x1},{y1:.1f}'
    else:
        d = f'M{x0},{y0:.1f} Q{x0 + 34:.1f},{(y0 + y1) / 2:.1f} {x1},{y1:.1f}'
    threads += (f'<path d="{d}" fill="none" stroke="var(--accent)" stroke-width="1.3" '
                f'stroke-opacity="0.7" stroke-dasharray="4 5"></path>')
    nodes_svg += f'<circle cx="{x1}" cy="{y1:.1f}" r="{dot_r(NODES[other]) + 4:.1f}" fill="none" stroke="var(--accent)" stroke-opacity="0.6"></circle>'

core = (f'<g class="coreg sel"><rect x="{CX - ROOT_W / 2}" y="{CY - 34}" width="{ROOT_W}" height="68" rx="16" fill="var(--panel)" stroke="var(--hair-strong)"></rect>'
        f'<text x="{CX}" y="{CY - 3}" text-anchor="middle" font-size="17" font-weight="600" style="fill: var(--text)">Engineering</text>'
        f'<text class="mono" x="{CX}" y="{CY + 17}" text-anchor="middle" font-size="10.5" style="fill: var(--muted)">{compact(TREE["total"])} words · {len(LEAVES)} leaves</text></g>')

svg = (f'<svg viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-label="Mind map of Engineering" '
       f'style="position: absolute; inset: 0; display: block; font-family: \'Geist\', ui-sans-serif, system-ui, sans-serif">'
       f'{grid_bg(W, H)}<g>{edges}{threads}{nodes_svg}{core}</g></svg>')

tip = f'''
    <div style="position: absolute; left: 40px; top: {pos[SELECTED][1] - 196}px; width: 268px; display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; border: 1px solid var(--hair-strong); border-radius: 10px; background: var(--panel); box-shadow: 0 12px 32px var(--shadow)">
      <strong style="font-size: 14px; font-weight: 600">🔐 Keycloak</strong>
      <span class="mono" style="font-size: 10.5px; color: var(--text-body)">2,600 words · 2 sub-leaves · 3 threads</span>
      <span style="font-size: 11px; color: var(--muted)">Click to peek · double-click to open</span>
    </div>'''

controls = '''
    <div style="position: absolute; right: 16px; top: 16px; display: flex; gap: 6px">
      <button type="button" class="chip" style="display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 12px; border: 1px solid var(--hair); border-radius: 17px; background: var(--panel); font-size: 12.5px; cursor: pointer"><span style="width: 14px; height: 2px; background: var(--accent); border-radius: 1px"></span>Threads of the selection</button>
      <button type="button" class="chip" style="display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 12px; border: 1px solid var(--hair); border-radius: 17px; background: var(--panel); font-size: 12.5px; cursor: pointer">Expand all</button>
    </div>'''

body = svg + tip + controls + zoom_panel(legend([('leaf', 'Leaf'), ('sprout', 'With sub-leaves'), ('branch', 'Branch'), ('thread', 'Thread')]))
print(board('ViewMindmap.dc.html', 'Mind map', 'mind', body))
