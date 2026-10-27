"""Regenerate every raster icon in design/brand/png from the SVG masters in design/brand/svg.

Usage:  pip install cairosvg pillow
        python3 design/brand/export.py

Each size is rendered directly from the vector at its exact pixel size, so nothing is a
blurry downscale. 32 px and smaller use the -small masters, the heavier drawing made to
stay crisp at those sizes. The desktop icon is the leaf alone, no tile (owner's decision);
phones, the PWA and the favicon keep the black tile.
"""
import io
from pathlib import Path

import cairosvg
from PIL import Image, ImageChops, ImageFilter

HERE = Path(__file__).resolve().parent
SVG = HERE / 'svg'
OUT = HERE / 'png'
SMALL_MAX = 32  # sizes at or below this use the small drawing


def render(name: str, size: int) -> Image.Image:
    png = cairosvg.svg2png(url=str(SVG / name), output_width=size, output_height=size)
    return Image.open(io.BytesIO(png)).convert('RGBA')


def shadowed(img: Image.Image, size: int) -> Image.Image:
    """A soft shadow under the leaf: with no tile to carry it, this keeps it readable on a
    light desktop; on a dark one the shadow is invisible."""
    shadow = Image.new('RGBA', img.size, (0, 0, 0, 0))
    shadow.putalpha(img.getchannel('A').point(lambda a: int(a * 0.45)))
    shadow = shadow.filter(ImageFilter.GaussianBlur(max(0.6, size / 40)))
    shadow = ImageChops.offset(shadow, 0, max(1, size // 64))
    out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    out.alpha_composite(shadow)
    out.alpha_composite(img)
    return out


def desktop(size: int) -> Image.Image:
    leaf = render('yeraz-icon-desktop-small.svg' if size <= SMALL_MAX else 'yeraz-icon-desktop.svg', size)
    return shadowed(leaf, size)


def tiled(size: int) -> Image.Image:
    return render('yeraz-icon-small.svg' if size <= SMALL_MAX else 'yeraz-icon.svg', size)


def main() -> None:
    OUT.mkdir(exist_ok=True)
    written = []

    def save(img: Image.Image, name: str) -> None:
        img.save(OUT / name, optimize=True)
        written.append(name)

    # Desktop icon (the leaf alone) at every size the three desktop platforms ask for.
    for size in (1024, 512, 256, 128, 64, 48, 32, 24, 16):
        save(desktop(size), f'yeraz-icon-{size}.png')

    # PWA install icons ("any") and maskable icons (the OS cuts the shape).
    for size in (192, 512):
        save(render('yeraz-icon.svg', size), f'pwa-{size}.png')
        save(render('yeraz-icon-bleed.svg', size), f'pwa-maskable-{size}.png')

    # iPhone home screen: full-bleed square, iOS rounds the corners itself.
    save(render('yeraz-icon-bleed.svg', 180), 'apple-touch-icon.png')

    # Browser favicon: 16, 32 and 48 px in one file, on the tile.
    fav = [tiled(s) for s in (16, 32, 48)]
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
