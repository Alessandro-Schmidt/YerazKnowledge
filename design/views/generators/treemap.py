"""View 4 — Treemap: every leaf as a tile sized by the words written in it, grouped by branch."""
from common import *

X0, Y0, X1, Y1 = 16, 16, 1424, 843 - 74


def squarify(values, x, y, w, h):
    """Squarified treemap (Bruls et al.), keeping the given order. Returns (x, y, w, h) per value."""
    total = sum(values)
    areas = [v * w * h / total for v in values]
    rects = []

    def worst(row, side):
        s = sum(row)
        return max(max(side * side * r / (s * s), (s * s) / (side * side * r)) for r in row)

    i = 0
    while i < len(areas):
        side = min(w, h)
        row = [areas[i]]
        i += 1
        while i < len(areas) and worst(row + [areas[i]], side) <= worst(row, side):
            row.append(areas[i])
            i += 1
        s = sum(row)
        if w >= h:  # lay the row down the left side
            rw = s / h
            yy = y
            for a in row:
                rects.append((x, yy, rw, a / rw))
                yy += a / rw
            x += rw
            w -= rw
        else:       # along the top
            rh = s / w
            xx = x
            for a in row:
                rects.append((xx, y, a / rh, rh))
                xx += a / rh
            y += rh
            h -= rh
    return rects


def leaves_of(branch):
    """A branch's leaves, each top-level leaf followed by its sub-leaves (largest first)."""
    out = []
    groups = sorted(branch['children'], key=lambda n: -n['total'])
    for g in groups:
        if g['kind'] == 'leaf':
            out.append(g)
        out.extend(sorted(g['children'], key=lambda n: -n['total']))
    return out


branches = sorted(TREE['children'], key=lambda b: -b['total'])
brects = squarify([b['total'] for b in branches], X0, Y0, X1 - X0, Y1 - Y0)
HEAD = 34
html = ''
sel_rect = None
for b, (bx, by, bw, bh) in zip(branches, brects):
    bx, by, bw, bh = bx + 4, by + 4, bw - 8, bh - 8
    count = sum(1 for n in NODES.values() if n['kind'] == 'leaf' and n['parent'] and (n['parent'] is b or n['parent']['parent'] is b))
    html += f'''
    <section aria-label="{esc(b['name'])}" style="position: absolute; left: {bx:.1f}px; top: {by:.1f}px; width: {bw:.1f}px; height: {bh:.1f}px; box-sizing: border-box; border: 1px solid var(--hair); border-radius: 12px; background: var(--panel)">
      <div style="display: flex; align-items: center; gap: 8px; height: {HEAD}px; padding: 0 12px">
        <span class="gl gl-branch"></span>
        <h2 class="eyebrow" style="margin: 0; color: var(--accent); white-space: nowrap">{esc(b['name'])}</h2>
        <span class="mono" style="margin-left: auto; font-size: 10.5px; color: var(--muted); white-space: nowrap">{f'{count} leaves · ' if bw > 260 else ''}{compact(b['total'])}</span>
      </div>
    </section>'''
    items = leaves_of(b)
    ix, iy, iw, ih = bx + 6, by + HEAD, bw - 12, bh - HEAD - 6
    for n, (tx, ty, tw, th) in zip(items, squarify([n['words'] for n in items], ix, iy, iw, ih)):
        tx, ty, tw, th = tx + 2, ty + 2, tw - 4, th - 4
        deg = DEGREE[n['id']]
        sel = n['id'] == SELECTED
        glow = 3 + deg * 7
        sub = n['parent']['kind'] == 'leaf'
        emoji = f'{n["emoji"]} ' if n['emoji'] else ''
        title_style = 'color: var(--accent); font-weight: 600' if sel else 'font-weight: 500'
        caption = f'<span class="mono" style="font-size: 10px; color: var(--muted)">in {esc(n["parent"]["name"])}</span>' if sub else ''
        show_sum = th > 92 and tw > 170
        summary = (f'<span class="reading" style="font-size: 12px; line-height: 1.4; color: var(--text-body); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden">{esc(n["sum"])}</span>'
                   if show_sum else '')
        small = th < 46 or tw < 70
        ring = 'box-shadow: inset 0 0 0 1.5px var(--accent);' if sel else ''
        html += f'''
    <div class="tile" style="position: absolute; left: {tx:.1f}px; top: {ty:.1f}px; width: {tw:.1f}px; height: {th:.1f}px; box-sizing: border-box; display: flex; flex-direction: column; gap: 4px; padding: {'6px 8px' if small else '10px 12px'}; border-radius: 8px; overflow: hidden; background: color-mix(in srgb, var(--accent) {glow}%, var(--raised)); {ring} cursor: pointer">
      <span style="font-size: {12 if small else 13.5}px; {title_style}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{emoji}{esc(n['name'])}</span>
      <span class="mono" style="font-size: 10.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{compact(n['words'])}{(' · in ' + esc(n['parent']['name'])) if sub and tw > 110 else ''}</span>{summary}
    </div>'''
        if sel:
            sel_rect = (tx, ty, tw, th)

tx, ty, tw, th = sel_rect
tip = f'''
    <div style="position: absolute; left: {tx + 18:.0f}px; top: {ty + th - 104:.0f}px; width: 250px; display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; border: 1px solid var(--hair-strong); border-radius: 10px; background: var(--panel); box-shadow: 0 12px 32px var(--shadow); z-index: 2">
      <strong style="font-size: 14px; font-weight: 600">🔐 Keycloak</strong>
      <span class="mono" style="font-size: 10.5px; color: var(--text-body)">2,600 words · 3 threads · 2 sub-leaves</span>
      <span style="font-size: 11px; color: var(--muted)">Click to peek · double-click to open</span>
    </div>'''

swatches = ''.join(f'<span style="width: 18px; height: 12px; border-radius: 3px; background: color-mix(in srgb, var(--accent) {3 + d * 7}%, var(--raised))"></span>' for d in range(4))
bottom = f'''
    <div style="position: absolute; left: 16px; right: 16px; bottom: 16px; display: flex; align-items: center; gap: 10px">
      <div style="display: flex; align-items: center; gap: 18px; height: 42px; padding: 0 14px; border: 1px solid var(--hair); border-radius: 10px; background: var(--panel); font-size: 12px; color: var(--text-body); white-space: nowrap">
        <span style="display: inline-flex; align-items: center; gap: 8px"><span style="width: 18px; height: 12px; border-radius: 3px; border: 1px solid var(--hair-strong)"></span><span style="width: 10px; height: 8px; border-radius: 2px; border: 1px solid var(--hair-strong)"></span>Area: words written</span>
        <span style="display: inline-flex; align-items: center; gap: 4px">{swatches}<span style="margin-left: 4px">Glow: threads, 0 to 3</span></span>
      </div>
      <span style="flex: 1"></span>
      <div style="display: flex; align-items: center; gap: 4px; height: 42px; padding: 0 6px; border: 1px solid var(--hair); border-radius: 10px; background: var(--panel); font-size: 12.5px">
        <span style="padding: 0 6px; color: var(--muted)">Size by</span>
        <button type="button" class="ghost" style="display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; border: 0; border-radius: 7px; background: var(--raised); cursor: pointer">Words<svg class="ic" width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg></button>
        <span style="padding: 0 6px 0 10px; color: var(--muted)">Glow by</span>
        <button type="button" class="ghost" style="display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; border: 0; border-radius: 7px; background: var(--raised); cursor: pointer">Threads<svg class="ic" width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg></button>
      </div>
    </div>'''

body = f'''
    <div style="position: absolute; inset: 0">{html}{tip}{bottom}
    </div>'''
print(board('ViewTreemap.dc.html', 'Treemap', 'treemap', body))
