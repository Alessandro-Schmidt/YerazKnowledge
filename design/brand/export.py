"""Regenerate every raster icon in design/brand/png from the SVG masters in design/brand/svg.

Usage:  pip install cairosvg pillow
        python3 design/brand/export.py

Each size is rendered directly from the vector at its exact pixel size, so nothing is a
blurry downscale. 32 px and smaller use yeraz-icon-small.svg, the heavier drawing made
to stay crisp at those sizes.
"""
import io
from pathlib import Path

import cairosvg
from PIL import Image

HERE = Path(__file__).resolve().parent
SVG = HERE / 'svg'
OUT = HERE / 'png'
SMALL_MAX = 32  # sizes at or below this use the small drawing


def render(name: str, size: int) -> Image.Image:
    png = cairosvg.svg2png(url=str(SVG / name), output_width=size, output_height=size)
    return Image.open(io.BytesIO(png)).convert('RGBA')


def desktop(size: int) -> Image.Image:
    return render('yeraz-icon-small.svg' if size <= SMALL_MAX else 'yeraz-icon.svg', size)


def main() -> None:
    OUT.mkdir(exist_ok=True)
    written = []

    def save(img: Image.Image, name: str) -> None:
        img.save(OUT / name, optimize=True)
        written.append(name)

    # Desktop icon at every size the three desktop platforms ask for.
    for size in (1024, 512, 256, 128, 64, 48, 32, 24, 16):
        save(desktop(size), f'yeraz-icon-{size}.png')

    # PWA install icons ("any") and maskable icons (the OS cuts the shape).
    for size in (192, 512):
        save(render('yeraz-icon.svg', size), f'pwa-{size}.png')
        save(render('yeraz-icon-bleed.svg', size), f'pwa-maskable-{size}.png')

    # iPhone home screen: full-bleed square, iOS rounds the corners itself.
    save(render('yeraz-icon-bleed.svg', 180), 'apple-touch-icon.png')

    # Browser favicon: 16, 32 and 48 px in one file.
    fav = [desktop(s) for s in (16, 32, 48)]
    fav[-1].save(OUT / 'favicon.ico', format='ICO', sizes=[(16, 16), (32, 32), (48, 48)], append_images=fav[:-1])
    written.append('favicon.ico')

    # Windows app icon for Tauri (src-tauri/icons/icon.ico).
    win = [desktop(s) for s in (16, 24, 32, 48, 64, 128, 256)]
    win[-1].save(OUT / 'yeraz-app.ico', format='ICO', sizes=[im.size for im in win], append_images=win[:-1])
    written.append('yeraz-app.ico')

    # macOS app icon for Tauri (src-tauri/icons/icon.icns).
    mac = [desktop(s) for s in (16, 32, 64, 128, 256, 512, 1024)]
    mac[-1].save(OUT / 'yeraz-app.icns', format='ICNS', append_images=mac[:-1])
    written.append('yeraz-app.icns')

    print('\n'.join(written))


if __name__ == '__main__':
    main()
