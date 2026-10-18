"""View 2 — Outline: the Tree read like a table of contents, every leaf with its first line."""
from common import *

OPEN = {'identity', 'keycloak', 'backend', 'java'}
THREAD_IC = '<svg class="ic" width="13" height="13" viewBox="0 0 24 24" aria-hidden="true" style="color: var(--accent)"><path d="M3.5 18c7 0 6-12 17-12"></path></svg>'
CHEV = '<svg class="ic" width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>'
MAX_BRANCH = max(b['total'] for b in TREE['children'])


def chevron(n):
    if not n['children']:
        return '<span style="flex-shrink: 0; width: 22px"></span>'
    cls = 'chev open' if n['id'] in OPEN else 'chev'
    return (f'<button type="button" class="{cls}" aria-label="Expand or collapse {esc(n["name"])}" style="flex-shrink: 0; width: 22px; height: 28px; '
            f'display: grid; place-items: center; border: 0; background: transparent; color: var(--faint); cursor: pointer; padding: 0">{CHEV}</button>')


def leaves_in(n):
    return sum(1 for d in NODES.values() if d['kind'] == 'leaf' and _under(d, n))


def _under(d, n):
    p = d['parent']
    while p is not None:
        if p is n:
            return True
        p = p['parent']
    return False


rows = ''
def emit(n):
    global rows
    depth = n['depth']
    sel = n['id'] == SELECTED
    cls = 'row on' if sel else 'row'
    if depth == 1:
        share = n['total'] / MAX_BRANCH * 100
        rows += f'''
          <div class="{cls}" role="treeitem" aria-expanded="{'true' if n['id'] in OPEN else 'false'}" style="display: flex; align-items: center; gap: 8px; height: 48px; padding: 0 12px 0 6px; margin-top: 6px; border-radius: 9px">
            {chevron(n)}<span class="gl gl-branch"></span>
            <span style="font-size: 15px; font-weight: 600">{esc(n['name'])}</span>
            <span class="mono" style="font-size: 11px; color: var(--muted)">{leaves_in(n)} leaves</span>
            <span style="flex: 1"></span>
            <span style="width: 120px; height: 4px; border-radius: 2px; background: var(--hair)"><span style="display: block; width: {share:.0f}%; height: 100%; border-radius: 2px; background: var(--accent); opacity: .75"></span></span>
            <span class="mono" style="width: 44px; text-align: right; font-size: 11px; color: var(--text-body)">{compact(n['total'])}</span>
          </div>'''
    else:
        pad = 30 if depth == 2 else 60
        if n['kind'] == 'branch':
            glyph = '<span class="gl gl-branch"></span>'
        else:
            glyph = f'<span class="gl {"gl-sprout" if n["children"] else "gl-leaf"}"></span>'
        emoji = f'<span aria-hidden="true" style="font-size: 15px; line-height: 1">{n["emoji"]}</span>' if n['emoji'] else ''
        deg = DEGREE[n['id']]
        threads = (f'<span class="mono" style="display: inline-flex; align-items: center; gap: 4px; width: 38px; font-size: 11px; color: var(--muted)">{THREAD_IC}{deg}</span>'
                   if deg else '<span style="width: 38px"></span>')
        words = compact(n['words']) if n['words'] else ''
        title_style = 'font-weight: 600; color: var(--accent)' if sel else 'font-weight: 500'
        size = 14.5 if depth == 2 else 14
        rows += f'''
          <div class="{cls}" role="treeitem" style="display: flex; align-items: center; gap: 9px; height: 40px; padding: 0 12px 0 {pad}px; border-radius: 9px">
            {chevron(n)}{glyph}{emoji}
            <span style="flex-shrink: 0; font-size: {size}px; {title_style}">{esc(n['name'])}</span>
            <span class="reading" style="flex: 1; min-width: 0; font-size: 13px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{esc(n['sum'])}</span>
            {threads}
            <span class="mono" style="width: 44px; text-align: right; font-size: 11px; color: var(--faint)">{words}</span>
          </div>'''
    if n['id'] in OPEN:
        for c in n['children']:
            emit(c)


for b in TREE['children']:
    emit(b)

chips = ''.join(f'<span class="mono" style="padding: 3px 8px; border: 1px solid var(--hair); border-radius: 6px; font-size: 11px; color: var(--text-body)">{c}</span>'
                for c in [f'{len(LEAVES)} leaves', f'{len(TREE["children"])} branches', f'{len(LINKS)} threads', f'{compact(TREE["total"])} words'])


def toggle(label, on):
    mark = ('<span style="width: 14px; height: 14px; display: grid; place-items: center; border-radius: 4px; background: var(--accent); color: var(--on-accent)">'
            '<svg class="ic" width="11" height="11" viewBox="0 0 24 24" aria-hidden="true" style="stroke-width: 3px"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg></span>'
            if on else '<span style="width: 14px; height: 14px; border-radius: 4px; border: 1.5px solid var(--hair-strong); box-sizing: border-box"></span>')
    return f'<label style="display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--text-body); cursor: pointer">{mark}{label}</label>'


most = sorted([n for n in LEAVES if DEGREE[n['id']]], key=lambda n: (-DEGREE[n['id']], n['name']))[:6]
def crumb(n):
    p, parts = n['parent'], []
    while p is not None and p['depth'] > 0:
        parts.append(p['name'])
        p = p['parent']
    return ' / '.join(reversed(parts))

most_rows = ''.join(f'''
            <div class="row{' on' if n['id'] == SELECTED else ''}" style="display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px">
              <span class="gl {'gl-sprout' if n['children'] else 'gl-leaf'}"></span>
              <span style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px">
                <span style="font-size: 13.5px">{esc(n['name'])}</span>
                <span class="mono" style="font-size: 10.5px; color: var(--muted)">{esc(crumb(n))}</span>
              </span>
              <span class="mono" style="display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--text-body)">{THREAD_IC}{DEGREE[n['id']]}</span>
            </div>''' for n in most)

branches = sorted(TREE['children'], key=lambda b: -b['total'])
bars = ''.join(f'''
            <div style="display: flex; flex-direction: column; gap: 6px">
              <div style="display: flex; justify-content: space-between; font-size: 13px"><span>{esc(b['name'])}</span><span class="mono" style="font-size: 11px; color: var(--muted)">{compact(b['total'])}</span></div>
              <div style="height: 4px; border-radius: 2px; background: var(--hair)"><div style="width: {b['total'] / MAX_BRANCH * 100:.0f}%; height: 100%; border-radius: 2px; background: var(--accent)"></div></div>
            </div>''' for b in branches)

body = f'''
    <div style="position: absolute; inset: 0; display: flex">
      <div style="flex: 1; min-width: 0; overflow: hidden; padding: 34px 56px 0 88px">
        <div style="max-width: 880px; display: flex; flex-direction: column; gap: 14px">
          <div style="display: flex; align-items: center; gap: 10px">
            <span class="eyebrow" style="color: var(--accent)">Tree</span>
            <span class="mono" style="font-size: 11px; color: var(--muted)">github.com/[user]/engineering · main</span>
          </div>
          <h1 style="margin: 0; font-size: 34px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.1">Engineering</h1>
          <div style="display: flex; flex-wrap: wrap; gap: 6px">{chips}</div>
          <div style="display: flex; align-items: center; gap: 8px; margin-top: 6px; padding-bottom: 12px; border-bottom: 1px solid var(--hair)">
            <button type="button" class="ghost" style="height: 32px; padding: 0 12px; border: 1px solid var(--hair-strong); border-radius: 8px; background: transparent; font-size: 12.5px; cursor: pointer">Expand all</button>
            <button type="button" class="ghost" style="height: 32px; padding: 0 12px; border: 1px solid var(--hair-strong); border-radius: 8px; background: transparent; font-size: 12.5px; cursor: pointer">Collapse all</button>
            <span style="flex: 1"></span>
            {toggle('First lines', True)}
            {toggle('Word counts', True)}
            <span style="width: 1px; height: 20px; margin: 0 4px; background: var(--hair)"></span>
            <button type="button" class="ghost" style="display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 10px; border: 0; border-radius: 8px; background: transparent; font-size: 12.5px; color: var(--text-body); cursor: pointer">Tree order<svg class="ic" width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg></button>
          </div>
          <div role="tree" aria-label="Engineering outline" style="display: flex; flex-direction: column; gap: 1px">{rows}
          </div>
        </div>
      </div>
      <aside style="flex: 0 0 340px; display: flex; flex-direction: column; gap: 26px; padding: 30px 22px; border-left: 1px solid var(--hair); background: var(--panel)">
        <section style="display: flex; flex-direction: column; gap: 6px">
          <h2 class="eyebrow" style="margin: 0 0 6px 10px">Most connected</h2>{most_rows}
        </section>
        <section style="display: flex; flex-direction: column; gap: 14px; padding: 0 10px">
          <h2 class="eyebrow" style="margin: 0">Where you write most</h2>{bars}
        </section>
      </aside>
    </div>'''

print(board('ViewOutline.dc.html', 'Outline', 'outline', body))
