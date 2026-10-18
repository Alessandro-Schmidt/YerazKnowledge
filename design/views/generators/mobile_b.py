"""Phone versions of Graph, Growth rings and Atlas, built from the desktop boards' own geometry."""
import contextlib
import io
import math
import re
import runpy
from pathlib import Path
from mobile_common import *

MH = PH - TOP


def load(script):
    with contextlib.redirect_stdout(io.StringIO()):
        return runpy.run_path(str(Path(__file__).resolve().parent / script))


def recrop(svg, vx, vy, vw, vh, w, h):
    """Point a desktop board's SVG at a window of itself, sized for the phone."""
    head = svg[:svg.index('>') + 1]
    new = re.sub(r'viewBox="[^"]*"', f'viewBox="{vx:.1f} {vy:.1f} {vw:.1f} {vh:.1f}"', head, count=1)
    new = re.sub(r' width="\d+" height="\d+"', f' width="{w}" height="{h}"', new, count=1)
    assert new != head
    return new + svg[len(head):]


def edge_chip(x, y, text, side='left'):
    pos = f'left: 8px' if side == 'left' else 'right: 8px'
    arrow = '<path d="M15 6l-6 6 6 6"></path>' if side == 'left' else '<path d="M9 6l6 6-6 6"></path>'
    return (f'<div style="position: absolute; {pos}; top: {y - 14:.0f}px; display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 10px 0 6px; '
            f'border: 1px solid var(--accent); border-radius: 14px; background: var(--panel); font-size: 12px; color: var(--text); z-index: 1">'
            f'<svg class="ic" width="13" height="13" viewBox="0 0 24 24" aria-hidden="true" style="color: var(--accent)">{arrow}</svg>{text}</div>')


# ---- Graph: the desktop graph, zoomed onto the selection's cluster -----------------------------------
def graph():
    g = load('graph.py')
    P, idx = g['P'], g['idx']
    s = 0.86
    cx, cy = g['centre']['identity']
    vw, vh = PW / s, MH / s
    vx, vy = cx - vw / 2 + 20, cy - 172
    svg = recrop(g['svg'], vx, vy, vw, vh, PW, MH)
    chips = ''
    for a, b in LINKS:
        if SELECTED not in (a, b):
            continue
        other = b if a == SELECTED else a
        ox, oy = P[idx[other]]
        if vx < ox < vx + vw:
            continue
        kx, ky = P[idx[SELECTED]]
        side = 'left' if ox < vx else 'right'
        ex = vx if side == 'left' else vx + vw
        t = (ex - kx) / (ox - kx)
        y_scr = (ky + (oy - ky) * t - vy) * s
        chips += edge_chip(0, min(MH - SHEET_H - 30, max(70, y_scr)), f'{NODES[other]["name"]} · {NODES[other]["parent"]["name"]}', side)
    body = (f'<div style="position: absolute; inset: 0">{svg}</div>' + zoom_chip('86% · Identity').replace('left: 12px', 'right: 12px')
            + chips + peek_sheet())
    return phone_board('PhoneGraph.dc.html', 'Graph', 'graph', body)


# ---- Growth rings: the disc on top, the core sample and the leaf underneath --------------------------
def rings():
    r = load('rings.py')
    CX, CY, R = r['CX'], r['CY'], r['R']
    at, radius, sectors, pos = r['at'], r['radius'], r['sectors'], r['pos']
    S_ = 152 / R                       # wood radius on the phone
    DX, DY = PW / 2, 196               # disc centre on screen
    DH = 392

    def scr(x, y):
        return DX + (x - CX) * S_, DY + (y - CY) * S_

    wood = f'<g transform="translate({DX - CX * S_:.2f} {DY - CY * S_:.2f}) scale({S_:.4f})">{r["bark"]}{r["wood"]}{r["rays"]}{r["cambium"]}{r["knots"]}</g>'
    # threads and leaves drawn again at phone size
    thr, dots, labels = '', '', ''
    for a, b in LINKS:
        x0, y0 = scr(*pos[a][:2])
        x1, y1 = scr(*pos[b][:2])
        mx, my = (x0 + x1) / 2, (y0 + y1) / 2
        qx, qy = DX + (mx - DX) * 0.3, DY + (my - DY) * 0.3
        hot = SELECTED in (a, b)
        thr += (f'<path d="M{x0:.1f},{y0:.1f} Q{qx:.1f},{qy:.1f} {x1:.1f},{y1:.1f}" fill="none" stroke="{"var(--accent)" if hot else "var(--line)"}" '
                f'stroke-width="{1.4 if hot else 0.8}" stroke-opacity="{0.95 if hot else 0.18}"{" stroke-dasharray=\"3 3\"" if hot else ""}></path>')
    near = {SELECTED} | {(b if a == SELECTED else a) for a, b in LINKS if SELECTED in (a, b)}
    for n in LEAVES:
        x, y = scr(*pos[n['id']][:2])
        rr = 1.8 + n['words'] ** 0.5 / 26
        sel = n['id'] == SELECTED
        if sel:
            dots += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{rr + 5:.1f}" fill="none" stroke="var(--accent)" stroke-width="1.2"></circle>'
        dots += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{rr:.1f}" fill="{"var(--accent)" if sel else "var(--node)"}" stroke="var(--bg)" stroke-width="0.8"></circle>'
        if n['id'] in near:
            name = (n['emoji'] + ' ' if n['emoji'] else '') + n['name']
            name_w = text_w(name, 12 if sel else 11) + (6 if n['emoji'] else 0)
            right = x >= DX - 20 and x + rr + 6 + name_w < PW - 6
            labels += (f'<text x="{x + (rr + 6 if right else -rr - 6):.1f}" y="{y + 4:.1f}" text-anchor="{"start" if right else "end"}" font-size="{12 if sel else 11}" '
                       f'style="fill: {"var(--accent)" if sel else "var(--text)"}; font-weight: {600 if sel else 500}; paint-order: stroke; stroke: var(--bg); stroke-width: 3px; stroke-linejoin: round">{esc(name)}</text>')
    # branch names around the bark
    arcs, names = '', ''
    LR = 152 + 22
    for b in TREE['children']:
        a0, a1 = sectors[b['id']]
        mid = (a0 + a1) / 2
        bottom = math.sin(mid) > 0.15
        rt = LR + (7 if bottom else 0)
        p0 = (DX + rt * math.cos(a1 if bottom else a0), DY + rt * math.sin(a1 if bottom else a0))
        p1 = (DX + rt * math.cos(a0 if bottom else a1), DY + rt * math.sin(a0 if bottom else a1))
        arcs += f'<path id="marc-{b["id"]}" d="M{p0[0]:.1f},{p0[1]:.1f} A{rt},{rt} 0 0 {0 if bottom else 1} {p1[0]:.1f},{p1[1]:.1f}"></path>'
        names += (f'<text font-size="9" font-weight="500" letter-spacing="1.6" style="fill: var(--accent)">'
                  f'<textPath href="#marc-{b["id"]}" startOffset="50%" text-anchor="middle">{esc(b["name"].upper())}</textPath></text>')
    disc = (f'<svg width="{PW}" height="{DH}" viewBox="0 0 {PW} {DH}" role="img" aria-label="Growth rings of Engineering" '
            f'style="position: absolute; left: 0; top: 0; display: block; font-family: \'Geist\', ui-sans-serif, system-ui, sans-serif">'
            f'<defs>{arcs}</defs>{grid_bg(PW, DH, "mr")}{wood}{thr}{dots}{labels}{names}</svg>')

    # the core sample, full width under the disc
    bounds, per_month, MONTHS, BUSIEST = r['bounds'], r['per_month'], r['MONTHS'], r['BUSIEST']
    CW = PW - 40 - 10
    segs, initials = '', ''
    x = 0.0
    for m in range(12):
        wdt = (bounds[m + 1] - bounds[m]) / (bounds[12] - bounds[0]) * CW
        t = 3 + 19 * (m / 11) ** 1.4
        segs += f'<rect x="{x:.1f}" y="0" width="{wdt:.1f}" height="30" fill="color-mix(in srgb, var(--accent) {t:.0f}%, var(--raised))"></rect>'
        segs += f'<rect x="{x + wdt * 0.74:.1f}" y="0" width="{wdt * 0.26:.1f}" height="30" fill="var(--line)" fill-opacity="0.09"></rect>'
        if m:
            segs += f'<path d="M{x:.1f},0 V30" stroke="var(--line)" stroke-opacity="0.42"></path>'
        hot = m == BUSIEST
        if hot:
            segs += f'<rect x="{x + 0.5:.1f}" y="0.5" width="{wdt - 1:.1f}" height="29" fill="none" stroke="var(--accent)" stroke-width="1.2"></rect>'
        initials += (f'<text class="mono" x="{x + wdt / 2:.1f}" y="46" text-anchor="middle" font-size="9.5" '
                     f'style="fill: {"var(--accent)" if hot else "var(--muted)"}; font-weight: {600 if hot else 400}">{MONTHS[m][0]}</text>')
        x += wdt
    core = f'''
        <svg width="{CW + 12}" height="52" viewBox="-6 -2 {CW + 12} 52" aria-hidden="true" style="display: block; overflow: visible">
          <defs><clipPath id="mcore"><rect x="0" y="0" width="{CW}" height="30" rx="15"></rect></clipPath></defs>
          <g clip-path="url(#mcore)">{segs}</g>
          <rect x="0" y="0" width="{CW}" height="30" rx="15" fill="none" stroke="var(--hair-strong)"></rect>
          <circle cx="{CW - 11}" cy="15" r="9" fill="var(--panel)" stroke="var(--accent)" stroke-width="2"></circle>
          <circle cx="{CW - 11}" cy="15" r="2.6" fill="var(--accent)"></circle>{initials}
        </svg>'''
    sheet = f'''
  <section aria-label="A year of Engineering" style="position: absolute; left: 0; right: 0; top: {DH - 6}px; bottom: 0; box-sizing: border-box; padding: 8px 20px 18px; display: flex; flex-direction: column; gap: 12px; border-top: 1px solid var(--hair-strong); border-radius: 20px 20px 0 0; background: var(--panel); box-shadow: 0 -18px 44px var(--shadow); z-index: 2">
    <span aria-hidden="true" style="align-self: center; width: 36px; height: 4px; border-radius: 2px; background: var(--hair-strong)"></span>
    <div style="display: flex; align-items: baseline; justify-content: space-between">
      <span class="eyebrow">Core sample</span>
      <span class="mono" style="font-size: 10.5px; color: var(--muted)">busiest: {r['LONG'][BUSIEST]} · {per_month[BUSIEST] / 1000:.1f}k</span>
    </div>
    {core}
    <div style="display: flex; align-items: center; gap: 8px; margin-top: -4px; font-size: 13px; color: var(--text-body)">
      <span style="white-space: nowrap">As it was in</span>
      <button type="button" class="ghost" style="display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 8px 0 10px; border: 1px solid var(--hair-strong); border-radius: 9px; background: transparent; font-size: 13px; white-space: nowrap; cursor: pointer">October 2026<svg class="ic" width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg></button>
      <button type="button" class="ibtn" aria-label="Grow the year" style="margin-left: auto; width: 36px; height: 36px; display: grid; place-items: center; border: 0; border-radius: 10px; background: var(--raised); color: var(--accent); cursor: pointer"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.5v9l7.5-4.5z" fill="currentColor"></path></svg></button>
    </div>
    <div style="display: flex; align-items: center; gap: 10px; padding-top: 12px; border-top: 1px solid var(--hair)">
      <span aria-hidden="true" style="font-size: 22px; line-height: 1">🔐</span>
      <div style="display: flex; flex-direction: column; gap: 3px">
        <strong style="font-size: 17px; font-weight: 600">Keycloak</strong>
        <span class="mono" style="font-size: 10.5px; color: var(--accent)">Planted September 2026 · 2,600 words</span>
      </div>
      <button type="button" class="ibtn" aria-label="Open leaf" style="margin-left: auto; width: 44px; height: 44px; display: grid; place-items: center; border: 0; border-radius: 12px; background: var(--raised); color: var(--text); cursor: pointer"><svg class="ic" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"></path></svg></button>
    </div>
    <span style="font-size: 12.5px; line-height: 1.45; color: var(--muted)">Threads reach back to Spring Security (ring of Feb) and OAuth 2.0 (Jul), and out to IAM, planted this month.</span>
  </section>'''
    body = disc + sheet
    return phone_board('PhoneRings.dc.html', 'Growth rings', 'rings', body)


# ---- Atlas: a window onto the chart, with a small overview of the whole archipelago ----------------------
def atlas():
    a = load('atlas.py')
    s = 0.84
    vw, vh = PW / s, MH / s
    kx, ky, _ = a['PEAK'][SELECTED]
    vx, vy = kx - vw / 2 + 10, ky - 312
    svg = recrop(a['svg'], vx, vy, vw, vh, PW, MH)
    W_, H_ = a['W'], a['H']
    IW = 104
    k = IW / W_
    inset = f'''
    <div style="position: absolute; right: 10px; top: 10px; padding: 4px; border: 1px solid var(--hair-strong); border-radius: 8px; background: var(--panel); z-index: 1">
      <svg width="{IW}" height="{H_ * k:.0f}" viewBox="0 0 {W_} {H_}" aria-label="The whole archipelago" style="display: block">
        <rect width="{W_}" height="{H_}" fill="var(--bg)"></rect>
        <path d="{a['coast']}" fill-rule="evenodd" fill="color-mix(in srgb, var(--accent) 30%, var(--raised))" stroke="var(--line)" stroke-width="5"></path>
        <rect x="{vx:.0f}" y="{vy:.0f}" width="{vw:.0f}" height="{min(vh, H_ - vy):.0f}" fill="none" stroke="var(--accent)" stroke-width="14"></rect>
      </svg>
    </div>'''
    title = f'''
    <div style="position: absolute; left: 10px; top: 10px; padding: 3px; border: 1px solid var(--hair-strong); background: var(--panel); z-index: 1">
      <div style="display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 10px; border: 1px solid var(--hair-strong)">
        <span style="font-family: 'Newsreader', Georgia, serif; font-size: 14px; letter-spacing: .18em">ENGINEERING</span>
        <span class="mono" style="font-size: 8.5px; color: var(--muted)">1 word = 1 m</span>
      </div>
    </div>'''
    trips = []
    for x_, y_ in LINKS:
        if SELECTED in (x_, y_):
            o = y_ if x_ == SELECTED else x_
            by_sea = a['PEAK'][o][2] != a['PEAK'][SELECTED][2]
            trips.append(f'<span style="display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border: 1px solid var(--hair); border-radius: 14px; '
                         f'font-size: 12.5px; color: var(--text-body); white-space: nowrap"><span style="width: 10px; border-top: 1.5px {"dashed" if by_sea else "dotted"} var(--accent)"></span>'
                         f'{esc(NODES[o]["name"])}</span>')
    extra = f'''
    <div style="display: flex; gap: 6px; overflow: hidden">{''.join(trips)}</div>'''
    body = (f'<div style="position: absolute; inset: 0">{svg}</div>' + title + inset
            + peek_sheet(extra, meta='▲ 2,600 m · highest peak of Identity'))
    return phone_board('PhoneAtlas.dc.html', 'Atlas', 'atlas', body)


for f in (graph, rings, atlas):
    print(f())
