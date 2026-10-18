"""Phone chrome for the Tree views: 390×844, the same header as Mobile.dc.html, a scrolling view switcher
and the leaf peek sheet. Colours are theme tokens only."""
from common import *

PW, PH = 390, 844
TOP = 104                     # header 56 + view switcher 48
SHEET_H = 152


def m_header():
    return f'''
  <header style="position: absolute; left: 0; right: 0; top: 0; height: 56px; display: flex; align-items: center; gap: 4px; padding: 0 6px; box-sizing: border-box; border-bottom: 1px solid var(--hair); background: var(--top); z-index: 3">
    <button type="button" class="ibtn" aria-label="Open explorer" style="width: 44px; height: 44px; display: grid; place-items: center; border: 0; border-radius: 10px; background: transparent; color: var(--text); cursor: pointer"><svg class="ic" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10"></path></svg></button>
    <button type="button" class="ibtn" style="display: flex; align-items: center; gap: 6px; height: 44px; padding: 0 8px; border: 0; border-radius: 10px; background: transparent; color: var(--text); cursor: pointer">
      <span style="width: 9px; height: 9px; border-radius: 50%; box-sizing: border-box; border: 1.5px solid var(--accent)"></span>
      <span style="font-size: 16px; font-weight: 500">Engineering</span>
      <svg class="ic" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" style="color: var(--muted)"><path d="M6 9l6 6 6-6"></path></svg>
    </button>
    <button type="button" class="ibtn" aria-label="Search" style="margin-left: auto; width: 44px; height: 44px; display: grid; place-items: center; border: 0; border-radius: 10px; background: transparent; color: var(--text); cursor: pointer"><svg class="ic" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><path d="M16 16l4.5 4.5"></path></svg></button>
    <button type="button" aria-label="New leaf" style="width: 44px; height: 44px; display: grid; place-items: center; border: 0; border-radius: 12px; background: var(--accent); color: var(--on-accent); cursor: pointer"><svg class="ic" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg></button>
  </header>'''


def chip_w(label):
    return 8 + 15 + 6 + text_w(label, 12.5) + 10


def m_switcher(active):
    """The view tabs as a row you swipe sideways; it is scrolled so the current view sits near the left."""
    widths = [chip_w(label) for _, label, _ in VIEWS]
    i = [k for k, _, _ in VIEWS].index(active)
    before = sum(widths[:i]) + 4 * i
    total = sum(widths) + 4 * len(widths)
    shift = max(0, min(before - 64, total - PW + 24))
    tabs = ''
    for key, label, href in VIEWS:
        on = key == active
        mhref = 'Mobile.dc.html' if key == 'map' else href.replace('View', 'Phone')
        tabs += (f'<a href="{mhref}" role="tab" aria-selected="{"true" if on else "false"}" class="vtab{" on" if on else ""}" style="height: 32px; flex-shrink: 0">'
                 f'{icon(key, 15)}{label}</a>')
    return f'''
  <nav role="tablist" aria-label="View" style="position: absolute; left: 0; right: 0; top: 56px; height: 48px; overflow: hidden; border-bottom: 1px solid var(--hair); background: var(--bg); z-index: 3">
    <div style="position: absolute; left: {12 - shift:.0f}px; top: 8px; display: flex; gap: 4px">{tabs}</div>
    <span aria-hidden="true" style="position: absolute; right: 0; top: 0; bottom: 0; width: 36px; background: linear-gradient(90deg, transparent, var(--bg))"></span>
    {'<span aria-hidden="true" style="position: absolute; left: 0; top: 0; bottom: 0; width: 24px; background: linear-gradient(270deg, transparent, var(--bg))"></span>' if shift else ''}
  </nav>'''


def peek_sheet(extra='', meta='Identity · 2,600 words · 2 sub-leaves', h=SHEET_H):
    threads = ''.join(f'<span style="display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border: 1px solid var(--hair); border-radius: 14px; font-size: 12.5px; color: var(--text-body); white-space: nowrap">'
                      f'<span style="width: 10px; border-top: 1.5px dashed var(--accent)"></span>{t}</span>' for t in ['OAuth 2.0', 'Spring Security', 'IAM'])
    return f'''
  <section aria-label="Leaf preview" style="position: absolute; left: 0; right: 0; bottom: 0; height: {h}px; box-sizing: border-box; padding: 8px 16px 18px 20px; display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--hair-strong); border-radius: 20px 20px 0 0; background: var(--panel); box-shadow: 0 -18px 44px var(--shadow); z-index: 2">
    <span aria-hidden="true" style="align-self: center; width: 36px; height: 4px; border-radius: 2px; background: var(--hair-strong)"></span>
    <div style="display: flex; align-items: center; gap: 10px">
      <span aria-hidden="true" style="font-size: 22px; line-height: 1">🔐</span>
      <div style="display: flex; flex-direction: column; gap: 2px; min-width: 0">
        <strong style="font-size: 18px; font-weight: 600; letter-spacing: -0.01em">Keycloak</strong>
        <span class="mono" style="font-size: 10.5px; color: var(--muted); white-space: nowrap">{meta}</span>
      </div>
      <button type="button" class="ibtn" aria-label="Open leaf" style="margin-left: auto; width: 44px; height: 44px; display: grid; place-items: center; border: 0; border-radius: 12px; background: var(--raised); color: var(--text); cursor: pointer"><svg class="ic" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"></path></svg></button>
    </div>{extra or f'''
    <div style="display: flex; gap: 6px; overflow: hidden">{threads}</div>'''}
  </section>'''


def zoom_chip(text, top=12):
    return (f'<div class="mono" style="position: absolute; left: 12px; top: {top}px; display: inline-flex; align-items: center; height: 30px; padding: 0 10px; '
            f'border: 1px solid var(--hair); border-radius: 999px; background: var(--panel); font-size: 11px; color: var(--text-body); z-index: 1">{text}</div>')


PROPS_M = PROPS.replace('"$preview":{"width":1440,"height":900}', '"$preview":{"width":390,"height":844}')


def phone_board(name, title, active, body, css=''):
    html = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Yeraz — Phone · {title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@300..700&amp;family=Geist+Mono:wght@400;500&amp;family=Newsreader:opsz,wght@6..72,400..600&amp;display=swap">
<style>{BASE_CSS}{VIEW_CSS}{css}</style>
</helmet>
<div class="yz" data-base="{{{{base}}}}" data-mode="{{{{mode}}}}" data-accent="{{{{accentId}}}}" data-font="{{{{font}}}}" style="width: {PW}px; height: {PH}px; position: relative; overflow: hidden; background: var(--bg); color: var(--text); font-family: 'Geist', ui-sans-serif, system-ui, sans-serif; font-size: 14px">
{m_header()}
{m_switcher(active)}
  <main style="position: absolute; left: 0; right: 0; top: {TOP}px; bottom: 0; overflow: hidden">
{body}
  </main>
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{PROPS_M}'>
{SCRIPT}
</script>
</body>
</html>
'''
    (OUT / name).write_text(html)
    return OUT / name
