"""Phone versions of Mind map, Outline, Columns and Treemap."""
from mobile_common import *

MH = PH - TOP   # 740: the main area under the header and the view switcher
THREAD_IC = '<svg class="ic" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" style="color: var(--accent)"><path d="M3.5 18c7 0 6-12 17-12"></path></svg>'
CHEV = '<svg class="ic" width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>'


# ---- Mind map: one-sided and vertical, the core on top, scrolled with the thumb ------------------
def mindmap():
    ROW, GAP = 34, 16
    BX, LX, SX = 22, 150, 272
    y = 96
    pos = {}
    for b in TREE['children']:
        ys = []
        for l in b['children']:
            ly = []
            for c in (l['children'] or [None]):
                if c:
                    pos[c['id']] = (SX, y)
                ly.append(y)
                ys.append(y)
                y += ROW
            pos[l['id']] = (LX, sum(ly) / len(ly))
        pos[b['id']] = (BX, sum(ys) / len(ys))
        y += GAP
    svg = ''
    # spine from the core through every branch
    last_b = pos[TREE['children'][-1]['id']][1]
    svg += f'<path d="M{BX + 12},62 V{last_b:.0f}" stroke="var(--line)" stroke-opacity="0.24" stroke-width="2"></path>'
    pill_end = {}
    for b in TREE['children']:
        x, yb = pos[b['id']]
        pw = text_w(b['name'].upper(), 10, upper=True, spacing=0.14) + 22
        pill_end[b['id']] = x + pw
        svg += (f'<rect x="{x}" y="{yb - 12:.1f}" width="{pw:.1f}" height="24" rx="12" fill="var(--bg)" stroke="var(--accent)" stroke-opacity="0.55"></rect>'
                f'<text class="blbl a-mid" x="{x + pw / 2:.1f}" y="{yb + 3.6:.1f}" style="font-size: 10px">{esc(b["name"].upper())}</text>')
    edges, nodes, threads = '', '', ''
    label_end = {}
    for n in NODES.values():
        if n['depth'] < 2:
            continue
        x, yn = pos[n['id']]
        p = n['parent']
        x0 = pill_end[p['id']] if p['depth'] == 1 else label_end[p['id']] + 6
        y0 = pos[p['id']][1]
        is_branch = n['kind'] == 'branch'
        r = 4 if is_branch else 3 + (n['words'] or 0) ** 0.5 / 22
        dx = (x - r - x0) * 0.5
        edges += (f'<path d="M{x0:.1f},{y0:.1f} C{x0 + dx:.1f},{y0:.1f} {x - r - dx:.1f},{yn:.1f} {x - r - 1:.1f},{yn:.1f}" fill="none" '
                  f'stroke="var(--line)" stroke-opacity="{0.2 if n["depth"] == 2 else 0.15}" stroke-width="1.2"></path>')
        sel = n['id'] == SELECTED
        g = ''
        if sel:
            g += f'<circle cx="{x}" cy="{yn:.1f}" r="{r + 6:.1f}" fill="none" stroke="var(--accent)"></circle>'
        if is_branch:
            g += f'<circle cx="{x}" cy="{yn:.1f}" r="{r}" fill="var(--bg)" stroke="var(--accent)" stroke-width="1.3"></circle>'
        else:
            if n['children']:
                g += f'<circle class="ring" cx="{x}" cy="{yn:.1f}" r="{r + 3.2:.1f}"></circle>'
            g += f'<circle cx="{x}" cy="{yn:.1f}" r="{r:.1f}" fill="{"var(--accent)" if sel else "var(--node)"}"></circle>'
        name = (n['emoji'] + ' ' if n['emoji'] else '') + n['name']
        size = 13.5 if n['depth'] == 2 else 12.5
        cls = 'lbl lsel' if sel else 'lbl'
        fill = '' if n['depth'] == 2 else ' style="fill: var(--text-body)"'
        lx = x + r + 7
        g += f'<text class="{cls}" x="{lx:.1f}" y="{yn + 4.5:.1f}" font-size="{size}" style="stroke-width: 3.5px"{fill if not sel else ""}>{esc(name)}</text>'
        label_end[n['id']] = lx + text_w(name, size) + (5 if n['emoji'] else 0)
        nodes += f'<g class="n">{g}</g>'
    for a, b in LINKS:
        if SELECTED not in (a, b):
            continue
        other = b if a == SELECTED else a
        x0, y0 = pos[SELECTED]
        x1, y1 = pos[other]
        bend = 118 if abs(y1 - y0) > 60 else 128
        threads += (f'<path d="M{x0},{y0:.1f} C{bend},{y0 + (y1 - y0) * 0.3:.1f} {bend},{y0 + (y1 - y0) * 0.7:.1f} {x1 - 1},{y1:.1f}" fill="none" stroke="var(--accent)" '
                    f'stroke-width="1.4" stroke-dasharray="4 4" stroke-opacity="0.85"></path>'
                    f'<circle cx="{x1}" cy="{y1:.1f}" r="{3 + NODES[other]["words"] ** 0.5 / 22 + 4:.1f}" fill="none" stroke="var(--accent)" stroke-opacity="0.6"></circle>')
    core = (f'<rect x="12" y="14" width="{PW - 24}" height="48" rx="14" fill="var(--panel)" stroke="var(--hair-strong)"></rect>'
            f'<text x="28" y="43" font-size="16" font-weight="600" style="fill: var(--text)">Engineering</text>'
            f'<text class="mono" x="{PW - 28}" y="42" text-anchor="end" font-size="10.5" style="fill: var(--muted)">{compact(TREE["total"])} words · {len(LEAVES)} leaves</text>')
    body = (f'<svg width="{PW}" height="{MH}" viewBox="0 0 {PW} {MH}" role="img" aria-label="Mind map of Engineering" '
            f'style="position: absolute; inset: 0; display: block; font-family: \'Geist\', ui-sans-serif, system-ui, sans-serif">{grid_bg(PW, MH, "mg")}'
            f'{svg}{edges}{threads}{nodes}{core}</svg>'
            '<div style="position: absolute; right: 4px; top: 80px; width: 3px; height: 150px; border-radius: 2px; background: var(--hair-strong)"></div>'
            + peek_sheet())
    return phone_board('PhoneMindmap.dc.html', 'Mind map', 'mind', body)


# ---- Outline -----------------------------------------------------------------------------------
def outline():
    OPEN = {'identity', 'keycloak'}
    MAXB = max(b['total'] for b in TREE['children'])
    rows = ''

    def emit(n):
        nonlocal rows
        sel = n['id'] == SELECTED
        cls = 'row on' if sel else 'row'
        chev = ''
        if n['children']:
            rot = 'transform: rotate(90deg);' if n['id'] in OPEN else ''
            chev = f'<span style="flex-shrink: 0; width: 22px; height: 22px; display: grid; place-items: center; color: var(--faint); {rot}">{CHEV}</span>'
        else:
            chev = '<span style="flex-shrink: 0; width: 22px"></span>'
        if n['depth'] == 1:
            share = n['total'] / MAXB * 100
            count = sum(1 for d in LEAVES if d['parent'] is n or d['parent']['parent'] is n)
            rows += f'''
          <div class="{cls}" style="display: flex; align-items: center; gap: 8px; height: 50px; padding: 0 14px 0 8px; border-bottom: 1px solid var(--hair)">
            {chev}<span class="gl gl-branch"></span>
            <span style="font-size: 15.5px; font-weight: 600">{esc(n['name'])}</span>
            <span class="mono" style="font-size: 10.5px; color: var(--muted)">{count}</span>
            <span style="flex: 1"></span>
            <span style="width: 54px; height: 4px; border-radius: 2px; background: var(--hair)"><span style="display: block; width: {share:.0f}%; height: 100%; border-radius: 2px; background: var(--accent); opacity: .75"></span></span>
            <span class="mono" style="width: 34px; text-align: right; font-size: 10.5px; color: var(--text-body)">{compact(n['total'])}</span>
          </div>'''
        else:
            pad = 22 if n['depth'] == 2 else 44
            glyph = '<span class="gl gl-branch"></span>' if n['kind'] == 'branch' else f'<span class="gl {"gl-sprout" if n["children"] else "gl-leaf"}"></span>'
            emoji = f'<span aria-hidden="true" style="font-size: 15px; line-height: 1">{n["emoji"]}</span>' if n['emoji'] else ''
            deg = DEGREE[n['id']]
            meta = (f'<span class="mono" style="display: inline-flex; align-items: center; gap: 3px; font-size: 10.5px; color: var(--muted)">{THREAD_IC}{deg}</span>' if deg else '')
            words = f'<span class="mono" style="font-size: 10.5px; color: var(--faint)">{compact(n["words"])}</span>' if n['words'] else ''
            title_style = 'font-weight: 600; color: var(--accent)' if sel else 'font-weight: 500'
            first = (f'<span class="reading" style="display: block; margin-top: 3px; padding-left: {22 + 18}px; font-size: 13px; line-height: 1.4; color: var(--muted); '
                     f'white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{esc(n["sum"])}</span>' if n['sum'] else '')
            rows += f'''
          <div class="{cls}" style="padding: 10px 14px 10px {pad - 14 + 8}px; border-bottom: 1px solid var(--hair)">
            <div style="display: flex; align-items: center; gap: 8px">
              {chev}{glyph}{emoji}
              <span style="font-size: {15 if n['depth'] == 2 else 14.5}px; {title_style}">{esc(n['name'])}</span>
              <span style="flex: 1"></span>{meta}{words}
            </div>{first}
          </div>'''
        if n['id'] in OPEN:
            for c in n['children']:
                emit(c)

    for b in TREE['children']:
        emit(b)
    body = f'''
    <div style="position: absolute; inset: 0; overflow: hidden">
      <div style="padding: 18px 16px 12px; display: flex; flex-direction: column; gap: 10px">
        <div style="display: flex; align-items: baseline; justify-content: space-between">
          <h1 style="margin: 0; font-size: 26px; font-weight: 600; letter-spacing: -0.01em">Engineering</h1>
          <span class="mono" style="font-size: 10.5px; color: var(--muted)">{compact(TREE['total'])} words</span>
        </div>
        <div style="display: flex; gap: 6px">
          <button type="button" class="ghost" style="height: 32px; padding: 0 12px; border: 1px solid var(--hair-strong); border-radius: 16px; background: var(--raised); font-size: 12.5px; cursor: pointer">First lines</button>
          <button type="button" class="ghost" style="height: 32px; padding: 0 12px; border: 1px solid var(--hair); border-radius: 16px; background: transparent; font-size: 12.5px; color: var(--muted); cursor: pointer">Expand all</button>
          <button type="button" class="ghost" style="display: inline-flex; align-items: center; gap: 5px; margin-left: auto; height: 32px; padding: 0 10px; border: 0; background: transparent; font-size: 12.5px; color: var(--text-body); cursor: pointer">Tree order<svg class="ic" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg></button>
        </div>
      </div>
      <div role="tree" aria-label="Engineering outline" style="border-top: 1px solid var(--hair)">{rows}
      </div>
    </div>'''
    return phone_board('PhoneOutline.dc.html', 'Outline', 'outline', body)


# ---- Columns: the parent columns fold into spines down the left edge --------------------------------
def columns():
    def spine(title, picked, left):
        return f'''
      <button type="button" aria-label="Back to {esc(title)}" style="position: absolute; left: {left}px; top: 0; bottom: 0; width: 40px; padding: 0; border: 0; border-right: 1px solid var(--hair); background: var(--panel); color: var(--muted); cursor: pointer">
        <svg class="ic" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" style="position: absolute; left: 13px; top: 14px"><path d="M15 6l-6 6 6 6"></path></svg>
        <span style="position: absolute; left: 20px; top: 46px; transform-origin: 0 0; transform: rotate(90deg) translateY(-50%); white-space: nowrap; display: flex; gap: 10px; align-items: baseline">
          <span class="eyebrow" style="font-size: 10px">{esc(title)}</span>
          <span style="font-size: 12.5px; color: var(--text); font-weight: 500">{esc(picked)}</span>
        </span>
      </button>'''

    kc = NODES[SELECTED]
    subs = ''.join(f'''
            <div class="row" style="display: flex; align-items: center; gap: 10px; height: 44px; padding: 0 8px 0 10px; border-radius: 8px">
              <span class="gl gl-leaf"></span>
              <span style="flex: 1; font-size: 14px">{esc(c['name'])}</span>
              <span class="mono" style="font-size: 10.5px; color: var(--faint)">{compact(c['words'])}</span>
              <span style="color: var(--faint)">{CHEV}</span>
            </div>''' for c in kc['children'])
    threads = [(b if a == SELECTED else a) for a, b in LINKS if SELECTED in (a, b)]
    trows = ''.join(f'''
            <div class="row" style="display: flex; align-items: center; gap: 10px; height: 40px; padding: 0 8px 0 10px; border-radius: 8px">
              <svg width="18" height="10" viewBox="0 0 18 10" aria-hidden="true"><path d="M1 9C6 9 7 1 17 1" fill="none" stroke="var(--accent)" stroke-width="1.4"></path></svg>
              <span style="font-size: 14px">{esc(NODES[t]['name'])}</span>
              <span class="mono" style="margin-left: auto; font-size: 10.5px; color: var(--muted)">{esc(NODES[t]['parent']['name'])}</span>
            </div>''' for t in threads)
    body = f'''
    <div style="position: absolute; inset: 0">
      {spine('Engineering', 'Identity', 0)}
      {spine('Identity', 'Keycloak', 40)}
      <section aria-label="Keycloak" style="position: absolute; left: 80px; right: 0; top: 0; bottom: 0; overflow: hidden; background: var(--bg)">
        <div style="position: relative; height: 84px; background: var(--raised); border-bottom: 1px solid var(--hair)">
          <span class="mono" style="position: absolute; right: 10px; bottom: 8px; font-size: 10px; color: var(--faint)">[Cover image]</span>
        </div>
        <div style="padding: 16px 16px 0 18px; display: flex; flex-direction: column; gap: 10px">
          <div style="display: flex; align-items: center; gap: 10px">
            <span aria-hidden="true" style="font-size: 24px; line-height: 1">🔐</span>
            <h2 style="margin: 0; font-size: 23px; font-weight: 600; letter-spacing: -0.01em">Keycloak</h2>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px">
            <span class="mono" style="padding: 3px 8px; border: 1px solid var(--hair); border-radius: 6px; font-size: 10.5px; color: var(--text-body)">2,600 words</span>
            <span class="mono" style="padding: 3px 8px; border: 1px solid var(--hair); border-radius: 6px; font-size: 10.5px; color: var(--text-body)">3 threads</span>
          </div>
          <p class="reading" style="margin: 0; font-size: 14px; line-height: 1.6; color: var(--text-body)">Open-source identity provider. Each realm keeps its own users, clients and roles, and our apps sign in through <button type="button" class="mention">@ OpenID Connect</button> to receive signed JWTs.</p>
          <button type="button" class="ghost" style="align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 12px; border: 1px solid var(--hair-strong); border-radius: 9px; background: transparent; font-size: 13px; cursor: pointer">Read the leaf<svg class="ic" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"></path></svg></button>
          <div style="display: flex; flex-direction: column; gap: 2px; margin-top: 8px">
            <h3 class="eyebrow" style="margin: 0 0 4px 10px">Sub-leaves · {len(kc['children'])}</h3>{subs}
            <button type="button" class="ghost" style="display: flex; align-items: center; gap: 8px; height: 38px; margin-top: 2px; padding: 0 12px; border: 1px dashed var(--hair-strong); border-radius: 8px; background: transparent; font-size: 12.5px; color: var(--muted); cursor: pointer"><svg class="ic" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>New sub-leaf</button>
          </div>
          <div style="display: flex; flex-direction: column; gap: 2px; margin-top: 10px">
            <h3 class="eyebrow" style="margin: 0 0 4px 10px">Threads · {len(threads)}</h3>{trows}
          </div>
        </div>
      </section>
    </div>'''
    return phone_board('PhoneColumns.dc.html', 'Columns', 'columns', body)


# ---- Treemap -----------------------------------------------------------------------------------
def squarify(values, x, y, w, h):
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
        if w >= h:
            rw = s / h
            yy = y
            for a in row:
                rects.append((x, yy, rw, a / rw))
                yy += a / rw
            x += rw
            w -= rw
        else:
            rh = s / w
            xx = x
            for a in row:
                rects.append((xx, y, a / rh, rh))
                xx += a / rh
            y += rh
            h -= rh
    return rects


def leaves_of(branch):
    out = []
    for g in sorted(branch['children'], key=lambda n: -n['total']):
        if g['kind'] == 'leaf':
            out.append(g)
        out.extend(sorted(g['children'], key=lambda n: -n['total']))
    return out


def treemap():
    X0, Y0, X1, Y1 = 8, 8, PW - 8, MH - SHEET_H - 6
    branches = sorted(TREE['children'], key=lambda b: -b['total'])
    HEAD = 24
    html = ''
    for b, (bx, by, bw, bh) in zip(branches, squarify([b['total'] for b in branches], X0, Y0, X1 - X0, Y1 - Y0)):
        bx, by, bw, bh = bx + 3, by + 3, bw - 6, bh - 6
        html += f'''
      <section style="position: absolute; left: {bx:.1f}px; top: {by:.1f}px; width: {bw:.1f}px; height: {bh:.1f}px; box-sizing: border-box; border: 1px solid var(--hair); border-radius: 10px; background: var(--panel)">
        <div style="display: flex; align-items: center; gap: 6px; height: {HEAD}px; padding: 0 8px">
          <h2 class="eyebrow" style="margin: 0; font-size: 9.5px; color: var(--accent); white-space: nowrap">{esc(b['name'])}</h2>
          <span class="mono" style="margin-left: auto; font-size: 9.5px; color: var(--muted)">{compact(b['total'])}</span>
        </div>
      </section>'''
        items = leaves_of(b)
        for n, (tx, ty, tw, th) in zip(items, squarify([n['words'] for n in items], bx + 4, by + HEAD, bw - 8, bh - HEAD - 4)):
            tx, ty, tw, th = tx + 1.5, ty + 1.5, tw - 3, th - 3
            sel = n['id'] == SELECTED
            glow = 3 + DEGREE[n['id']] * 7
            ring = 'box-shadow: inset 0 0 0 1.5px var(--accent);' if sel else ''
            tiny = tw < 52 or th < 34
            emoji = f'{n["emoji"]} ' if n['emoji'] else ''
            words = '' if tiny or th < 44 else f'<span class="mono" style="font-size: 9.5px; color: var(--muted)">{compact(n["words"])}</span>'
            html += f'''
      <div class="tile" style="position: absolute; left: {tx:.1f}px; top: {ty:.1f}px; width: {tw:.1f}px; height: {th:.1f}px; box-sizing: border-box; display: flex; flex-direction: column; gap: 2px; padding: {'4px 5px' if tiny else '7px 8px'}; border-radius: 6px; overflow: hidden; background: color-mix(in srgb, var(--accent) {glow}%, var(--raised)); {ring}">
        <span style="font-size: {10.5 if tiny else 12}px; {'color: var(--accent); font-weight: 600' if sel else 'font-weight: 500'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{emoji}{esc(n['name'])}</span>{words}
      </div>'''
    sw = ''.join(f'<span style="width: 14px; height: 9px; border-radius: 2px; background: color-mix(in srgb, var(--accent) {3 + d * 7}%, var(--raised))"></span>' for d in range(4))
    extra = f'''
    <div style="display: flex; align-items: center; gap: 12px; font-size: 11.5px; color: var(--text-body)">
      <span>Area = words</span><span style="display: inline-flex; gap: 3px; align-items: center">{sw}<span style="margin-left: 4px">Glow = threads</span></span>
    </div>'''
    body = f'<div style="position: absolute; inset: 0">{html}</div>' + peek_sheet(extra)
    return phone_board('PhoneTreemap.dc.html', 'Treemap', 'treemap', body)


for f in (mindmap, outline, columns, treemap):
    print(f())
