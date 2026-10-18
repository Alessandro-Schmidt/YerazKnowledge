"""View 3 — Columns: walk the Tree a level at a time, like Finder, with the leaf open beside it."""
from common import *

PATH = ['identity', 'keycloak']           # what is selected in each column
CHEV_R = '<svg class="ic" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" style="color: var(--faint)"><path d="M9 6l6 6-6 6"></path></svg>'
THREAD_IC = '<svg class="ic" width="13" height="13" viewBox="0 0 24 24" aria-hidden="true" style="color: var(--accent)"><path d="M3.5 18c7 0 6-12 17-12"></path></svg>'


def glyph(n):
    if n['kind'] == 'branch':
        return '<span class="gl gl-branch"></span>'
    return f'<span class="gl {"gl-sprout" if n["children"] else "gl-leaf"}"></span>'


def item(n, selected, rich):
    on = n['id'] in selected
    cls = 'row on' if on else 'row'
    emoji = f'<span aria-hidden="true" style="font-size: 14px; line-height: 1">{n["emoji"]}</span>' if n['emoji'] else ''
    count = compact(n['words']) if n['words'] else f'{len(n["children"])}'
    right = CHEV_R if n['children'] else ''
    name_style = 'font-weight: 600; color: var(--text)' if on else ''
    second = ''
    if rich and n['sum']:
        second = f'<span class="reading" style="display: block; margin-top: 3px; font-size: 12px; line-height: 1.4; color: var(--muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden">{esc(n["sum"])}</span>'
    return f'''
          <div class="{cls}" style="display: flex; align-items: {'flex-start' if second else 'center'}; gap: 10px; padding: {'10px' if second else '0'} 10px {'10px' if second else '0'} 12px; {'' if second else 'height: 38px;'} border-radius: 8px; cursor: pointer">
            <span style="display: flex; align-items: center; gap: 8px; {'margin-top: 5px;' if second else ''}">{glyph(n)}</span>
            <span style="flex: 1; min-width: 0">
              <span style="display: flex; align-items: center; gap: 7px; font-size: 13.5px; {name_style}">{emoji}<span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{esc(n['name'])}</span></span>{second}
            </span>
            <span class="mono" style="{'margin-top: 2px;' if second else ''} font-size: 10.5px; color: var(--faint)">{count}</span>{right}
          </div>'''


def column(title, sub, nodes, selected, width, rich=False, add=None):
    items = ''.join(item(n, selected, rich) for n in nodes)
    add_row = ''
    if add:
        add_row = f'''
          <button type="button" class="ghost" style="display: flex; align-items: center; gap: 8px; height: 36px; margin-top: 6px; padding: 0 12px; border: 1px dashed var(--hair-strong); border-radius: 8px; background: transparent; font-size: 12.5px; color: var(--muted); cursor: pointer">
            <svg class="ic" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>{add}</button>'''
    return f'''
      <section style="flex: 0 0 {width}px; display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--hair); background: var(--panel)">
        <div style="display: flex; align-items: baseline; gap: 8px; padding: 16px 16px 10px 20px">
          <h2 class="eyebrow" style="margin: 0">{esc(title)}</h2>
          <span class="mono" style="font-size: 10.5px; color: var(--faint)">{sub}</span>
        </div>
        <div style="flex: 1; min-height: 0; overflow: hidden; padding: 0 8px 12px; display: flex; flex-direction: column; gap: 2px">{items}{add_row}
        </div>
      </section>'''


identity = NODES['identity']
keycloak = NODES['keycloak']
cols = column('Engineering', f'{len(TREE["children"])} branches', TREE['children'], PATH, 236)
cols += column('Identity', f'{len(identity["children"])} leaves', identity['children'], PATH, 270, rich=True, add='New leaf in Identity')
cols += column('Keycloak', f'{len(keycloak["children"])} sub-leaves', keycloak['children'], PATH, 270, rich=True, add='New sub-leaf')

threads = [(b if a == SELECTED else a) for a, b in LINKS if SELECTED in (a, b)]
thread_rows = ''.join(f'''
                <div class="row" style="display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; cursor: pointer">
                  <svg width="18" height="10" viewBox="0 0 18 10" aria-hidden="true"><path d="M1 9C6 9 7 1 17 1" fill="none" stroke="var(--accent)" stroke-width="1.4"></path></svg>
                  <span style="font-size: 13.5px">{esc(NODES[t]['name'])}</span>
                  <span class="mono" style="margin-left: auto; font-size: 10.5px; color: var(--muted)">{esc(NODES[t]['parent']['name'] if NODES[t]['parent']['depth'] else '')}</span>
                </div>''' for t in threads)

preview = f'''
      <section aria-label="Leaf" style="flex: 1; min-width: 0; display: flex; flex-direction: column; background: var(--bg)">
        <div style="display: flex; align-items: center; gap: 10px; padding: 8px 10px 8px 22px; border-bottom: 1px solid var(--hair)">
          <span class="eyebrow" style="color: var(--accent)">Leaf</span>
          <span class="mono" style="flex: 1; font-size: 11px; color: var(--muted)">Engineering / Identity / Keycloak</span>
          <button type="button" class="ghost" style="display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 12px; border: 1px solid var(--hair-strong); border-radius: 8px; background: transparent; font-size: 12.5px; cursor: pointer"><svg class="ic" width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"></path></svg>Edit</button>
          <button type="button" class="ghost" style="display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 12px; border: 0; border-radius: 8px; background: transparent; font-size: 12.5px; cursor: pointer">Open full page<svg class="ic" width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"></path></svg></button>
        </div>
        <div style="flex: 1; min-height: 0; overflow: hidden">
          <div style="position: relative; height: 128px; background: var(--raised); border-bottom: 1px solid var(--hair)">
            <span class="mono" style="position: absolute; right: 14px; bottom: 10px; font-size: 10.5px; color: var(--faint)">[Cover image · Unsplash]</span>
          </div>
          <article style="max-width: 660px; padding: 22px 34px 28px; display: flex; flex-direction: column; gap: 14px">
            <div style="display: flex; align-items: center; gap: 12px">
              <span aria-hidden="true" style="font-size: 30px; line-height: 1">🔐</span>
              <h2 style="margin: 0; font-size: 28px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.15">Keycloak</h2>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 6px">
              <span class="mono" style="padding: 3px 8px; border: 1px solid var(--hair); border-radius: 6px; font-size: 11px; color: var(--text-body)">2,600 words</span>
              <span class="mono" style="padding: 3px 8px; border: 1px solid var(--hair); border-radius: 6px; font-size: 11px; color: var(--text-body)">2 sub-leaves</span>
              <span class="mono" style="padding: 3px 8px; border: 1px solid var(--hair); border-radius: 6px; font-size: 11px; color: var(--text-body)">3 threads</span>
            </div>
            <div class="reading" style="display: flex; flex-direction: column; gap: 12px; font-size: 14.5px; line-height: 1.65; color: var(--text-body)">
              <p style="margin: 0">Open-source identity provider. Each realm keeps its own users, clients and roles, and our apps sign in through <button type="button" class="mention">@ OpenID Connect</button> to receive signed JWTs.</p>
              <h3 style="margin: 6px 0 0; font-family: 'Geist', ui-sans-serif, system-ui, sans-serif; font-size: 15px; font-weight: 600; color: var(--accent)">How our services use it</h3>
              <p style="margin: 0">Every Spring service is an OAuth 2.0 resource server: it checks each token against the realm keys. The setup lives in <button type="button" class="mention">@ Spring Security</button>.</p>
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 4px">
              <h3 class="eyebrow" style="margin: 0 0 4px">Threads · {len(threads)}</h3>{thread_rows}
            </div>
          </article>
        </div>
      </section>'''

body = f'''
    <div style="position: absolute; inset: 0; display: flex">{cols}{preview}
    </div>'''

print(board('ViewColumns.dc.html', 'Columns', 'columns', body))
