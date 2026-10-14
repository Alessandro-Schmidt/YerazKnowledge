# Design

Everything Yeraz should look like lives in this folder. It is the source of truth for the build: `development-plan.md` §3 and the visual tests point here.

![Tree view](screens/03-tree-view.png)

## Links (private to the owner)

- **Design canvas,** where the screens can be explored and clicked through: https://claude.ai/artifact/UWV7RLc2iLsYxB5Sde26c5
- **The conversation** where the design, `ARCHITECTURE.md` and `development-plan.md` were made: https://claude.ai/code/session_01LA2iepBJ3k2JUEstrXEcTD

Both need the owner's login. Everything needed to build the app is copied into this folder.

The canvas also keeps three boards of logo explorations (15 directions). The steel Y, option K, was chosen; the others are there for reference only.

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
| `58e365d56077f4d7ada6dbf63fcdda98` | `brand/svg/yeraz-icon.svg` |
| `0b690d8ab893706a468c873d393ed3b4` | `brand/svg/yeraz-icon-small.svg` |
| `130b9f674901f0c84ad5e0776338fd7f` | `brand/svg/yeraz-icon-bleed.svg` |
| `f67842db732c929ea5aca88c45614a41` | `brand/svg/yeraz-mark.svg` |
| `9eb031a2a7df1838aeed8eae0bfb6f06` | `brand/svg/yeraz-mark-mono.svg` |
| `1a7446438282a48a692a6027a51c74ee` | `brand/svg/yeraz-mark-light.svg` |

## Brand — `brand/`

The logo is a capital Y cut into six flat faces of brushed steel, lit from the upper left, on a pure black tile. It has no colour of its own, so it sits with every theme and accent. Never tint it or recolour it with CSS; use the files as they are.

| Face | On dark (`yeraz-mark`, icons) | On light (`yeraz-mark-light`) |
|---|---|---|
| Left arm, facing the light | `#F4F4F2` | `#7A7A76` |
| Stem, left | `#D9D9D6` | `#62625F` |
| Left arm, turned away | `#BEBEBB` | `#4E4E4B` |
| Right arm, inner | `#A9A9A6` | `#3F3F3C` |
| Stem, right | `#8C8C88` | `#2C2C2A` |
| Right arm, in shadow | `#74746F` | `#1C1C1B` |

Every face keeps at least 3.6:1 contrast with the top bar it sits on, in every base. The tile is `#000000` with a white hairline edge at 12 % opacity, so it separates from dark wallpapers.

### Vector masters — `brand/svg/`

| File | Use |
|---|---|
| `yeraz-icon.svg` | Desktop app icon master: a 1024 px canvas holding an 824 px rounded tile with a 185 px corner radius |
| `yeraz-icon-small.svg` | The same letter drawn thicker, with brighter faces, for 32 px and smaller |
| `yeraz-icon-bleed.svg` | Full-bleed black square for phones and PWA maskable icons. The OS cuts the shape, and the letter stays inside the safe zone. |
| `yeraz-mark.svg` | The letter without a tile, for the app's top bar (22 px tall) and the README |
| `yeraz-mark-light.svg` | The letter for light backgrounds (the Paper base): the same six faces in dark gunmetal |
| `yeraz-mark-mono.svg` | One-colour white silhouette for the macOS menu bar, the Windows tray and one-colour print |
| `favicon.svg` | Browser favicon (the small drawing) |

All of these are generated by `brand/draw.py`, which holds the letter's geometry and the shades above. To change the logo, edit `draw.py`, run it, then run `export.py`.

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

**To regenerate after changing the logo:**

```
pip install cairosvg pillow
python3 design/brand/draw.py     # the SVG masters
python3 design/brand/export.py   # every PNG, ICO and ICNS file
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
