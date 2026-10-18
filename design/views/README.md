# Tree views — a proposal

Seven other ways to see a Tree, next to today's radial map, on desktop and on a phone.

**Status: built** (all seven, at the owner's request; `development-plan.md`, After launch; ARCHITECTURE.md §6.1). In the app a Family's Trees play the part these boards give a Tree's branches. Growth rings uses each leaf's planted month from git blame (ring width = words planted that month); Atlas places its islands by packing instead of by hand.

`yeraz-tree-views.pdf` has everything on 12 pages: an overview, one page per desktop screen with what it shows, then the phones.

## Screens — `screens/`

Rendered with the real fonts, desktop at 2× (2880 × 1800) and phone at 3× (1170 × 2532), like `../screens/`. All use the design's Engineering Tree (6 branches, 30 leaves, 17 threads) with **Keycloak selected**, in Vanta · Green unless the name says otherwise.

| File | View | What it shows |
|---|---|---|
| `01-mindmap.png` | Mind map | Branches either side of the core, leaves and sub-leaves in rows; the selection's threads arc over the map |
| `02-outline.png` | Outline | The Tree as a table of contents: each leaf with its first line, thread count and words; rail with the most connected leaves and words per branch |
| `03-columns.png` | Columns | Finder-style columns, one level each, with the selected leaf open beside them (cover, body, sub-leaves, threads) |
| `04-treemap.png` | Treemap | Each leaf is a tile, area = words, grouped by branch; tile tint = number of threads (0–3) |
| `05-graph.png` | Graph | Leaves as a network of threads; each branch a soft dashed hull; dot size = words |
| `06-growth-rings.png` | Growth rings | The Tree cut across like a trunk: one ring per month (oldest at the centre), ring width = words that month; each leaf sits in the ring of the month it was created |
| `07-atlas.png` | Atlas | Each branch an island, each leaf a peak as high as its words (1 word = 1 m); threads are sea routes |
| `08-growth-rings-paper-amber.png` | Growth rings | The same in Paper · Amber |
| `09-atlas-paper-violet.png` | Atlas | The same in Paper · Violet |
| `10-phone-mindmap.png` … `16-phone-atlas.png` | All seven | The phone versions, same order as 01–07 |
| `17-phone-atlas-paper-violet.png` | Atlas | Phone, Paper · Violet |

## Rules every view keeps

- **Same data as the map.** Everything except Growth rings uses what `src/model/` already computes: titles, words, totals, sub-leaves, threads. The selection is shared: a leaf selected in one view stays selected when you switch.
- **Theme tokens only** (CLAUDE.md). Tints in the mockups are `color-mix(in srgb, var(--accent) N%, var(--raised))`, which `src/` already uses; no other colour values.
- **The map rule applies to every drawn view** (Mind map, Treemap, Graph, Rings, Atlas): geometry is drawn once per layout; selection, hover and zoom are data attributes or a selection layer, never a React re-render. The budgets in ARCHITECTURE.md §11 (select < 50 ms, pan/zoom 60 fps at 2k nodes) hold for each view.
- **Desktop:** the view switcher is a segmented control in the Tree top bar (icons in `generators/common.py`, `ICONS`). **Phone:** the header stays as on `../screens/07-phone.png`; under it the views are a row of tabs that scrolls sideways, and tapping a leaf opens the same peek sheet as on the map.

## Per view: what it needs, and the phone version

**Mind map.** Horizontal tidy tree with branches on both sides (in the mockup the sides are picked by hand: right Backend, Cloud, AI Agents; left Identity, Data, Frontend). Dot radius `3.2 + √words / 18`. *Phone:* one-sided and vertical: the core is a card on top, branches are pills on a spine down the left, leaves and sub-leaves in two columns, scrolled with the thumb.

**Outline.** Rows: chevron, glyph, emoji, title, first line (ellipsis), thread count, words. Branch rows show a bar of their share of the largest branch. *Phone:* full-width rows with the first line under the title.

**Columns.** Miller columns: Tree → branch → leaf → sub-leaves, then the leaf preview. *Phone:* parent columns fold into 40 px spines down the left edge (vertical label: column title and the item picked in it); tapping a spine goes back a level.

**Treemap.** Two-level squarified treemap (Bruls et al.), branches by total, leaves by words, each leaf followed by its sub-leaves. *Phone:* the same layout in portrait, with the peek sheet below.

**Graph.** Each branch is laid out on its own (force layout), scaled to `34·√n + 20`, then placed around Backend, the branch most threads run through, and turned so its threaded leaves face the hub. Hulls are smoothed convex hulls (Catmull-Rom). *Phone:* the graph zoomed onto the selection's cluster; a thread whose other end is off screen gets a chip at the edge (`← IAM · Google Cloud`).

**Growth rings — needs new data.** Ring m's width is `9 px + words written in month m × k`; boundaries wobble with a shared low-frequency shape plus a little noise per ring. Branches are sectors sized by leaf count, separated by rays; leaves sit mid-ring at the month they were created; threads curve through the inside (the curve's control point is pulled 70 % of the way from the chord's midpoint to the centre). The outer ring (this month) is outlined in the accent. Side panel: a "core sample" strip (the rings laid out as a timeline) with a "Show the Tree as it was in…" picker, a month-by-month grid per branch, and the selected leaf.
*Data:* **the creation dates in the mockup are invented.** The real dates come from git history (the first commit that touched each file). Words written per month would need each file's size at every commit, which is far more requests. A cheaper version: ring width = words of the leaves created that month. Decide this before building, and check it against the "1 request per commit" budget.
*Phone:* the disc on top, labelling only the selection and its threads; the sheet holds the core sample, the date picker and the leaf.

**Atlas — needs a layout.** One elevation field on a 2 px grid: for each leaf a Gaussian bump with height = words and σ = `11 + 0.5·√words`, plus a lower, wider base (300, 1.55σ) that joins an island's peaks into one landmass, plus smoothed noise near land for a ragged coast; islands combine with max(), and lakes are filled. Then:
- the coastline is the contour at 150;
- contour lines every 500 words (every 1,000 drawn heavier), filled bands for the height colours;
- hillside shading: short strokes hanging downhill from each contour line, darker on the side away from the light (north-west);
- the "water lines" around each coast are contours of the distance from land (5, 10, 16, 23, 31 px).

Threads are dashed over sea and dotted over land: the same path, split with a clip path and a mask made from the coastline.
*Layout:* in the mockup, island centres and peak positions are placed by hand (`generators/atlas.py`, `ISLANDS`). The app needs an algorithm for them, for example packing each branch's leaves, then placing the packed islands apart from each other. Contours could use `d3-contour` (a new dependency, so it needs its one-line reason).
*Phone:* a window onto the chart, with a small overview of the whole archipelago in the corner; the peek sheet lists the routes from the peak.

## Sources — `source/`

The canvas files behind the screens (`View*.dc.html` desktop, `Phone*.dc.html` phone). As in `../screens/source/`, they are plain HTML written only with theme tokens. They hold exact sizes, spacing and copy, and they open on the design canvas. Outside the canvas, use the PNGs.

## Generators — `generators/`

The Python that wrote every file in `source/`. They hold the exact layout maths, which is the part that matters for Growth rings and Atlas. Each file reproduces its board byte for byte:

```
pip install numpy scipy scikit-image
python3 design/views/generators/rings.py      # writes design/views/source/ViewRings.dc.html
```

`common.py` is the shared data (the Engineering Tree), text measuring, header and board wrapper. Then one file per view (`mindmap`, `outline`, `columns`, `treemap`, `graph`, `rings`, `atlas`). `mobile_common.py`, `mobile_a.py` and `mobile_b.py` are the phone versions; `mobile_b.py` reuses the desktop geometry of Graph, Rings and Atlas.
