# Design

Everything Yeraz should look like lives in this folder. It is the source of truth for the build: `development-plan.md` §3 and the visual tests point here.

![Tree view](screens/03-tree-view.png)

## Links (private to the owner)

- **Design canvas,** where the screens can be explored and clicked through: https://claude.ai/artifact/UWV7RLc2iLsYxB5Sde26c5
- **The conversation** where the design, `ARCHITECTURE.md` and `development-plan.md` were made: https://claude.ai/code/session_01LA2iepBJ3k2JUEstrXEcTD

Both need the owner's login. Everything needed to build the app is copied into this folder.

## Screens — `screens/`

Every screenshot is rendered with the real fonts at 2× pixel density (the phone at 3×), so details stay sharp when zoomed.

| File | Shows | Pixels |
|---|---|---|
| `01-home.png` | Home: every Tree on one map, nothing selected | 2880 × 1800 |
| `02-home-tree-selected.png` | Home with a Tree selected: the others dim, a card shows its numbers | 2880 × 1800 |
| `03-tree-view.png` | Tree view: Explorer, map with a leaf selected, Peek panel | 2880 × 1800 |
| `04-leaf-full-page.png` | The Peek expanded into a full page | 2880 × 1800 |
| `05-tree-zoomed-out.png` | Explorer and Peek dismissed, zoomed out to 70 %: leaf labels hidden | 2880 × 1800 |
| `06-map-only.png` | Map only, hovering a leaf, with "Where you write most" | 2880 × 1800 |
| `07-phone.png` | Phone: map zoomed in, Peek as a bottom sheet | 1170 × 2532 |
| `08-app-icon.png` | App icon and logo board: sizes and desktop contexts | 3200 × 3440 |
| `09-appearance.png` | Settings › Appearance in the default theme: base, accent, reading font, custom themes, live preview | 2880 × 1800 |
| `10-appearance-paper-violet.png` | The same screen after picking Paper, violet and the serif font: the whole app re-themes | 2880 × 1800 |
| `11-tree-graphite-blue.png` | Tree view in the Graphite base with the blue accent | 2880 × 1800 |
| `12-tree-paper-green-serif.png` | Tree view in the Paper base with green and the Newsreader reading font | 2880 × 1800 |

Screens 01–08 use the default theme: Vanta base, green accent, Geist.

### Screen sources — `screens/source/`

The canvas file behind each screen (`Main` = Home, `Tree`, `Focus` = map only, `Mobile`, `Logo`, `Themes` = Appearance, `TreeGraphite`, `TreePaper`). Each file is plain HTML plus a small JavaScript class, holding the exact colours, sizes, spacing and copy.

- **`Tree.dc.html` is written entirely with the theme tokens.** It contains no colour values outside its theme block, and switches theme through the same `data-base` / `data-accent` / `data-font` attributes the app will use. `TreeGraphite` and `TreePaper` are the same file with different defaults.

- `Tree.dc.html` holds working reference code for the map: `layoutTree()` (radial layout, bundled threads, the donut around the core) and the selection and dimming rules in `renderVals()`. The real app builds this with d3 (ARCHITECTURE.md §6); use the file to check behaviour and values, not as code to copy.
- Images in these files are referenced as `/_blob/<id>`, the canvas's asset store. They map to the brand files like this:

| `/_blob/` id | File |
|---|---|
| `a0bd681e679e0828db275961959519f9` | `brand/svg/yeraz-icon.svg` |
| `0078415247ddfb392d4a540e75a2783f` | `brand/svg/yeraz-icon-small.svg` |
| `94801c44ae41477d6dd3c48f95e77a66` | `brand/svg/yeraz-icon-bleed.svg` |
| `217475af72b3e6ce501c325e380321f0` | `brand/svg/yeraz-mark.svg` |
| `d5529123bf724ae25be9d893e054fd3e` | `brand/svg/yeraz-mark-mono.svg` |
| `382c0d6e2588263dc1d7a3cd0483fe9c` | `brand/svg/yeraz-mark-light.svg` |

## Brand — `brand/`

The logo is a Y drawn in the map's own language: the white stem and arm are structure, the green arm is a thread, and the two dots are leaves.

### Vector masters — `brand/svg/`

| File | Use |
|---|---|
| `yeraz-icon.svg` | Desktop app icon master: a 1024 px canvas holding an 824 px rounded tile with a 185 px corner radius |
| `yeraz-icon-small.svg` | The same icon redrawn heavier, for 32 px and smaller |
| `yeraz-icon-bleed.svg` | Full-bleed square for phones and PWA maskable icons. The OS cuts the shape, and the mark stays inside the safe zone. |
| `yeraz-mark.svg` | The mark without a tile, for the app's top bar (22 px tall) and the README |
| `yeraz-mark-light.svg` | The mark for light backgrounds (the Paper base): dark arm, deeper green. The cut where the arms cross is an SVG mask, so it works on any background. Used as SVG only. |
| `yeraz-mark-mono.svg` | One-colour white mark for the macOS menu bar, the Windows tray and one-colour print |
| `favicon.svg` | Browser favicon (the small drawing) |

### Raster exports — `brand/png/`

Each file is rendered straight from the vector at its exact pixel size, never scaled from another bitmap. 32 px and smaller use the small drawing.

| File | Goes to |
|---|---|
| `yeraz-icon-{1024…16}.png` | Every desktop size |
| `yeraz-app.icns` | `src-tauri/icons/icon.icns` (macOS) |
| `yeraz-app.ico` | `src-tauri/icons/icon.ico` (Windows); 16–256 px, small drawing up to 32 px |
| `pwa-192.png`, `pwa-512.png` | Web app manifest, `"purpose": "any"` |
| `pwa-maskable-192.png`, `pwa-maskable-512.png` | Web app manifest, `"purpose": "maskable"` |
| `apple-touch-icon.png` | iPhone home screen (180 px; iOS rounds the corners) |
| `favicon.ico` | Browser favicon fallback (16, 32, 48 px) |

**To regenerate after changing an SVG:**

```
pip install cairosvg pillow
python3 design/brand/export.py
```

Never resize these PNGs by hand, and don't let a tool generate small icon sizes by downscaling the 1024 px file. That is how icons go blurry.

## Themes — `themes/`

| File | What it is |
|---|---|
| `themes.json` | Every colour of every theme: three bases (Vanta, Graphite, Paper), four accents with a dark and a light value each, and the two reading fonts. The app generates its CSS from this file; nothing else in the code may contain a colour. |
| `check.py` | Checks every base and accent combination against the contrast rules: body text 7:1, secondary text, headings and buttons 4.5:1, map dots 3:1. Run it after changing `themes.json`. |

```
python3 design/themes/check.py
```

How themes work, including named colours for leaves and Trees, is described in ARCHITECTURE.md §13.
