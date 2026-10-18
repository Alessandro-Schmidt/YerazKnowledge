"""Shared pieces for the Tree view boards: data, chrome, text metrics, board wrapper."""
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent          # design/views/generators
OUT = HERE.parent / 'source'                    # design/views/source
OUT.mkdir(parents=True, exist_ok=True)
TREE_SRC = (HERE.parent.parent / 'screens/source/Tree.dc.html').read_text()   # the theme block comes from the Tree screen
BASE_CSS = TREE_SRC[TREE_SRC.index('<style>') + len('<style>'):TREE_SRC.index('</style>')]

MARK_DARK = '/_blob/f67842db732c929ea5aca88c45614a41'
MARK_LIGHT = '/_blob/1a7446438282a48a692a6027a51c74ee'

# The design's Engineering Tree (Tree.dc.html engData / engLinks).
def L(id, name, words=None, sum='', children=None, emoji=None):
    return {'id': id, 'name': name, 'words': words, 'sum': sum, 'children': children or [], 'emoji': emoji}

TREE = L('root', 'Engineering', children=[
    L('backend', 'Backend', children=[
        L('java', 'Java', 4200, 'Language notes from Java 8 to 21: what changed, what to use, what to avoid.', [
            L('streams', 'Streams', 900, 'Collectors, grouping, and when a plain loop is clearer.'),
            L('records', 'Records', 600, 'Immutable data carriers, compact constructors and pattern matching.'),
            L('vthreads', 'Virtual Threads', 1300, 'Project Loom in practice: thread-per-request without pool tuning.')]),
        L('spring', 'Spring Boot', 3100, 'Auto-configuration, profiles, and how a Boot app actually starts.', [
            L('springsec', 'Spring Security', 1500, 'The filter chain, resource servers, and mapping JWT claims to authorities.'),
            L('springdata', 'Spring Data', 1100, 'Repositories, derived queries, and the N+1 traps to watch for.')]),
        L('rest', 'REST Design', 1400, 'Resource naming, status codes, pagination and versioning rules.')]),
    L('identity', 'Identity', children=[
        L('keycloak', 'Keycloak', 2600, 'Realms, clients and roles; our apps sign in through OpenID Connect.', [
            L('realms', 'Realms', 700, 'One realm per environment; clients, roles and users live inside it.'),
            L('tokens', 'Tokens', 1200, 'Access, refresh and ID tokens: lifetimes, claims and validation.')], emoji='🔐'),
        L('oauth', 'OAuth 2.0', 2000, 'Authorization code with PKCE, client credentials, and scopes.'),
        L('oidc', 'OpenID Connect', 1300, 'The identity layer on top of OAuth 2.0: ID tokens and discovery.')]),
    L('cloud', 'Cloud', children=[
        L('gcp', 'Google Cloud', 1800, 'Projects, regions, and the services worth learning first.', [
            L('cloudrun', 'Cloud Run', 900, 'Containers that scale to zero; cold starts and concurrency.'),
            L('iam', 'IAM', 800, 'Service accounts, roles and least privilege across projects.')]),
        L('docker', 'Docker', 1500, 'Layered images, multi-stage builds and small runtime images.'),
        L('cicd', 'CI/CD', None, '', [
            L('jenkins', 'Jenkins', 700, 'Declarative pipelines, shared libraries and agents.'),
            L('circleci', 'CircleCI', 400, 'Orbs, caching and parallel test splitting.')])]),
    L('data', 'Data', children=[
        L('postgres', 'PostgreSQL', 2200, 'Everyday PostgreSQL: types, constraints and reading query plans.', [
            L('indexes', 'Indexes', 1000, 'B-tree vs GIN, composite index order, and when not to index.'),
            L('tx', 'Transactions', 1100, 'Isolation levels, locking, and what @Transactional really does.')]),
        L('oracle', 'Oracle DB', 600, 'Differences that bite when moving from Oracle to PostgreSQL.'),
        L('schema', 'Schema Design', 900, 'Naming, normalisation, and migrations that never lose data.')]),
    L('frontend', 'Frontend', children=[
        L('react', 'React', 1700, 'Components, rendering, and keeping state where it belongs.', [
            L('hooks', 'Hooks', 800, 'Effect dependencies, custom hooks and memoisation.')]),
        L('angular', 'Angular', 1000, 'Modules, RxJS and change detection in large apps.')]),
    L('agents', 'AI Agents', children=[
        L('prompting', 'Prompting', 1100, 'Writing instructions an agent can follow: context, constraints, examples.'),
        L('claudecode', 'Claude Code', 1600, 'Working with an agent on a real codebase: plans, reviews, CLAUDE.md.'),
        L('evals', 'Evaluations', 500, 'Checking agent output with tests instead of impressions.')]),
])
LINKS = [('springsec', 'oauth'), ('springsec', 'keycloak'), ('tokens', 'oidc'), ('keycloak', 'oauth'), ('oidc', 'oauth'),
         ('iam', 'keycloak'), ('cloudrun', 'docker'), ('jenkins', 'docker'), ('springdata', 'tx'), ('hooks', 'rest'),
         ('angular', 'rest'), ('claudecode', 'java'), ('vthreads', 'cloudrun'), ('schema', 'springdata'),
         ('evals', 'circleci'), ('prompting', 'claudecode'), ('indexes', 'schema')]

NODES = {}
def _walk(n, depth, parent):
    n['depth'] = depth
    n['parent'] = parent
    n['kind'] = 'root' if depth == 0 else ('leaf' if n['words'] else 'branch')
    NODES[n['id']] = n
    for c in n['children']:
        _walk(c, depth + 1, n)
    n['total'] = (n['words'] or 0) + sum(c['total'] for c in n['children'])
_walk(TREE, 0, None)
DEGREE = {k: 0 for k in NODES}
for a, b in LINKS:
    DEGREE[a] += 1
    DEGREE[b] += 1
LEAVES = [n for n in NODES.values() if n['kind'] == 'leaf']
SELECTED = 'keycloak'


def compact(w):
    return f'{w / 1000:.1f}k' if w >= 1000 else str(w)


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


def text_w(s, size, upper=False, spacing=0.0):
    """Rough Geist advance width: good enough to anchor curves and avoid overlaps."""
    w = 0.0
    for ch in s:
        if ch == ' ':
            w += 0.27
        elif ch in 'il.,:;|!\'1':
            w += 0.28
        elif ch in 'mwMW':
            w += 0.82
        elif ch.isupper() or upper:
            w += 0.66
        else:
            w += 0.54
    return w * size + spacing * size * len(s)


# 24-unit stroke icons for the view switcher.
ICONS = {
    'map': '<circle cx="12" cy="12" r="2.2"></circle><circle cx="12" cy="12" r="8.5"></circle><path d="M12 9.8V3.5M14 13l5 3.5M10 13l-5 3.5"></path>',
    'mind': '<circle cx="5" cy="12" r="2"></circle><path d="M7 12h2.5c3 0 3-6 7-6M9.5 12c3 0 3 6 7 6"></path><circle cx="18.5" cy="6" r="1.6"></circle><circle cx="18.5" cy="18" r="1.6"></circle>',
    'outline': '<path d="M4.5 6h2M9.5 6h10M7.5 12h2M12.5 12h7M7.5 18h2M12.5 18h7"></path>',
    'columns': '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"></rect><path d="M9.2 4.5v15M14.8 4.5v15"></path>',
    'treemap': '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"></rect><path d="M11 4.5v15M11 11.5h9.5M3.5 14h7.5"></path>',
    'rings': '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 6.6c3.2 0 5.3 2.3 5.3 5.4s-2.4 5.3-5.3 5.3-5.4-2.3-5.4-5.3 2.3-5.4 5.4-5.4z"></path><circle cx="12" cy="12" r="2"></circle>',
    'atlas': '<path d="M2.5 18.5l6-9 3.6 5.2 2.6-3.4 6.8 7.2z"></path><path d="M7.2 11.4l1.3 1 1.2-1"></path>',
    'graph': '<circle cx="6" cy="7.5" r="2"></circle><circle cx="18" cy="6" r="2"></circle><circle cx="13" cy="18" r="2"></circle><path d="M8 7.3l8-1M7.1 9.2l4.8 7M17.3 7.9l-3.6 8.2"></path>',
}
VIEWS = [('map', 'Map', 'Tree.dc.html'), ('mind', 'Mind map', 'ViewMindmap.dc.html'),
         ('outline', 'Outline', 'ViewOutline.dc.html'), ('columns', 'Columns', 'ViewColumns.dc.html'),
         ('treemap', 'Treemap', 'ViewTreemap.dc.html'), ('graph', 'Graph', 'ViewGraph.dc.html'),
         ('rings', 'Rings', 'ViewRings.dc.html'), ('atlas', 'Atlas', 'ViewAtlas.dc.html')]


def icon(name, size=16, extra=''):
    return f'<svg class="ic" width="{size}" height="{size}" viewBox="0 0 24 24" aria-hidden="true"{extra}>{ICONS[name]}</svg>'


VIEW_CSS = """
.yz .vtab{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 8px;border-radius:7px;color:var(--muted);font-size:12.5px;text-decoration:none;white-space:nowrap}
.yz .vtab:hover{background:var(--hover);color:var(--text)}
.yz .vtab.on{background:var(--raised);color:var(--text);box-shadow:inset 0 0 0 1px var(--hair-strong)}
.yz .vtab.on svg{color:var(--accent)}
.mono{font-family:'Geist Mono',ui-monospace,monospace}
.eyebrow{font-size:10.5px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.row{transition:background .15s}
.row:hover{background:var(--hover)}
.row.on{background:var(--raised);box-shadow:inset 2px 0 0 var(--accent)}
.tile{transition:box-shadow .15s}
.tile:hover{box-shadow:inset 0 0 0 1px var(--hair-strong)}
"""


def header(active):
    tabs = ''
    for key, label, href in VIEWS:
        on = key == active
        tabs += (f'<a href="{href}" role="tab" aria-selected="{"true" if on else "false"}" class="vtab{" on" if on else ""}">'
                 f'{icon(key, 15)}{label}</a>')
    return f'''
  <header style="display: flex; align-items: center; gap: 14px; padding: 10px 16px; border-bottom: 1px solid var(--hair); background: var(--top)">
    <div style="display: flex; align-items: center; gap: 10px">
      <sc-if value="{{{{isDark}}}}" hint-placeholder-val="{{{{ true }}}}"><img src="{MARK_DARK}" alt="" style="height: 22px; width: auto; display: block"></sc-if>
      <sc-if value="{{{{isLight}}}}" hint-placeholder-val="{{{{ false }}}}"><img src="{MARK_LIGHT}" alt="" style="height: 22px; width: auto; display: block"></sc-if>
      <span style="font-weight: 600; font-size: 15px; letter-spacing: 0.01em">Yeraz</span>
    </div>
    <span style="width: 1px; height: 20px; background: var(--hair)"></span>
    <nav aria-label="Breadcrumb" style="display: flex; align-items: center; gap: 8px; font-size: 14px">
      <a href="Main.dc.html" style="color: var(--muted); text-decoration: none">All trees</a>
      <svg class="ic" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" style="color: var(--faint)"><path d="M9 6l6 6-6 6"></path></svg>
      <span style="font-weight: 500">Engineering</span>
    </nav>
    <div role="tablist" aria-label="View" style="display: flex; align-items: center; gap: 2px; margin-left: 6px; padding: 3px; border: 1px solid var(--hair); border-radius: 10px; background: var(--panel)">{tabs}</div>
    <div style="flex: 1 1 160px; display: flex; justify-content: flex-end; min-width: 0">
      <label style="display: flex; align-items: center; gap: 8px; width: 100%; max-width: 220px; height: 36px; padding: 0 10px; border: 1px solid var(--hair); border-radius: 9px; background: var(--panel); color: var(--muted); box-sizing: border-box">
        <svg class="ic" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><path d="M16 16l4.5 4.5"></path></svg>
        <input type="search" aria-label="Search this tree" placeholder="Search this tree" style="flex: 1; min-width: 0; height: 100%; border: 0; outline: none; background: transparent; color: var(--text); font: inherit; font-size: 13px">
        <span class="mono" style="font-size: 11px; color: var(--muted); border: 1px solid var(--hair); border-radius: 5px; padding: 2px 6px">⌘K</span>
      </label>
    </div>
    <span style="display: inline-flex; align-items: center; gap: 7px; color: var(--muted); font-size: 12px; white-space: nowrap"><span style="width: 7px; height: 7px; border-radius: 50%; background: var(--accent)"></span>Synced</span>
    <button type="button" class="primary" style="display: inline-flex; align-items: center; gap: 7px; height: 36px; padding: 0 14px; border: 0; border-radius: 9px; background: var(--accent); color: var(--on-accent); font-weight: 600; font-size: 13px; cursor: pointer; white-space: nowrap">
      <svg class="ic" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>New leaf
    </button>
  </header>'''


PROPS = ('{"base":{"editor":"enum","options":["vanta","graphite","paper"],"default":"vanta","section":"Theme"},'
         '"accent":{"editor":"enum","options":["green","amber","blue","violet"],"default":"green","section":"Theme"},'
         '"font":{"editor":"enum","options":["geist","serif"],"default":"geist","section":"Theme"},'
         '"$preview":{"width":1440,"height":900}}')

SCRIPT = """class Component extends DCLogic {
  renderVals() {
    const base = ['vanta', 'graphite', 'paper'].indexOf(this.props.base) >= 0 ? this.props.base : 'vanta';
    const mode = base === 'paper' ? 'light' : 'dark';
    const accentId = ['green', 'amber', 'blue', 'violet'].indexOf(this.props.accent) >= 0 ? this.props.accent : 'green';
    const font = this.props.font === 'serif' ? 'serif' : 'geist';
    return { base, mode, accentId, font, isDark: mode === 'dark', isLight: mode === 'light' };
  }
}"""


def board(name, title, active, body, css=''):
    html = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Yeraz — {title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@300..700&amp;family=Geist+Mono:wght@400;500&amp;family=Newsreader:opsz,wght@6..72,400..600&amp;display=swap">
<style>{BASE_CSS}{VIEW_CSS}{css}</style>
</helmet>
<div class="yz" data-base="{{{{base}}}}" data-mode="{{{{mode}}}}" data-accent="{{{{accentId}}}}" data-font="{{{{font}}}}" style="height: 100vh; min-height: 640px; display: flex; flex-direction: column; background: var(--bg); color: var(--text); font-family: 'Geist', ui-sans-serif, system-ui, sans-serif; font-size: 14px; overflow: hidden">
{header(active)}
  <main style="position: relative; flex: 1; min-height: 0; overflow: hidden">
{body}
  </main>
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{PROPS}'>
{SCRIPT}
</script>
</body>
</html>
'''
    (OUT / name).write_text(html)
    return OUT / name


def zoom_panel(extra=''):
    """The map's bottom-left zoom controls and legend, as in Tree.dc.html."""
    return f'''
    <div style="position: absolute; left: 16px; bottom: 16px; display: flex; align-items: center; gap: 10px">
      <div style="display: flex; align-items: center; gap: 2px; padding: 4px; border: 1px solid var(--hair); border-radius: 10px; background: var(--panel)">
        <button type="button" class="ibtn" aria-label="Zoom out" style="width: 32px; height: 32px; display: grid; place-items: center; border: 0; border-radius: 7px; background: transparent; color: var(--text); cursor: pointer"><svg class="ic" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12"></path></svg></button>
        <span class="mono" style="min-width: 46px; text-align: center; font-size: 12px; color: var(--text-body)">100%</span>
        <button type="button" class="ibtn" aria-label="Zoom in" style="width: 32px; height: 32px; display: grid; place-items: center; border: 0; border-radius: 7px; background: transparent; color: var(--text); cursor: pointer"><svg class="ic" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12"></path></svg></button>
        <span style="width: 1px; height: 20px; margin: 0 2px; background: var(--hair)"></span>
        <button type="button" class="ibtn" aria-label="Fit" style="width: 32px; height: 32px; display: grid; place-items: center; border: 0; border-radius: 7px; background: transparent; color: var(--text); cursor: pointer"><svg class="ic" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"></path></svg></button>
      </div>
      {extra}
    </div>'''


def legend(items):
    out = ''
    for kind, label in items:
        if kind == 'leaf':
            g = '<span class="gl gl-leaf"></span>'
        elif kind == 'sprout':
            g = '<span class="gl gl-sprout"></span>'
        elif kind == 'branch':
            g = '<span class="gl gl-branch"></span>'
        elif kind == 'thread':
            g = '<span style="width: 16px; height: 2px; border-radius: 1px; background: var(--accent)"></span>'
        elif kind == 'hull':
            g = '<span style="width: 14px; height: 10px; border-radius: 5px; border: 1px dashed var(--accent); background: var(--accent-soft)"></span>'
        else:
            g = ''
        out += f'<span style="display: inline-flex; align-items: center; gap: 7px">{g}{label}</span>'
    return (f'<div style="display: flex; align-items: center; gap: 16px; height: 42px; padding: 0 14px; border: 1px solid var(--hair); '
            f'border-radius: 10px; background: var(--panel); font-size: 12px; color: var(--text-body); white-space: nowrap">{out}</div>')


def grid_bg(w, h, pid='g'):
    return (f'<defs><pattern id="{pid}" width="28" height="28" patternUnits="userSpaceOnUse"><circle class="griddot" cx="1.5" cy="1.5" r="1"></circle></pattern></defs>'
            f'<rect width="{w}" height="{h}" fill="url(#{pid})"></rect>')
