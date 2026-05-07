#!/usr/bin/env python3
"""
Normalize retro team logos so the visible logo artwork is consistent in the app.

What it does:
- Uses public/retro_images_original as the source when available. This is useful
  if your current public/retro_images folder was already processed and some
  logos still look too small.
- Backs up the current public/retro_images before writing anything.
- Removes white/near-white backgrounds connected to the outside edge.
- Trims extra transparent padding around the actual logo.
- Places each logo on the same 256x256 transparent canvas.
- Makes the logo fill almost the whole canvas by default.

Install if needed:
  python3 -m pip install pillow

Run from project root:
  python3 scripts/normalize_retro_logos.py

Tune visible logo size:
  python3 scripts/normalize_retro_logos.py --fill 1.0
  python3 scripts/normalize_retro_logos.py --fill 0.96

Use current folder as source instead of originals:
  python3 scripts/normalize_retro_logos.py --use-current
"""

from __future__ import annotations

import argparse
import shutil
from collections import deque
from datetime import datetime
from pathlib import Path
from typing import Iterable, Tuple

try:
    from PIL import Image
except ImportError as exc:
    raise SystemExit(
        "Pillow is required. Run this first:\n\n"
        "  python3 -m pip install pillow\n\n"
        "Then rerun:\n\n"
        "  python3 scripts/normalize_retro_logos.py\n"
    ) from exc

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp"}


def project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def iter_images(folder: Path) -> Iterable[Path]:
    for path in sorted(folder.iterdir()):
        if path.is_file() and path.suffix.lower() in IMAGE_EXTS:
            yield path


def is_near_white(pixel: Tuple[int, int, int, int], threshold: int) -> bool:
    r, g, b, a = pixel
    return a >= 16 and r >= threshold and g >= threshold and b >= threshold


def remove_edge_connected_white(img: Image.Image, threshold: int) -> Image.Image:
    rgba = img.convert("RGBA")
    px = rgba.load()
    width, height = rgba.size
    visited: set[tuple[int, int]] = set()
    queue: deque[tuple[int, int]] = deque()

    def add(x: int, y: int) -> None:
        key = (x, y)
        if key in visited:
            return
        if is_near_white(px[x, y], threshold):
            visited.add(key)
            queue.append(key)

    for x in range(width):
        add(x, 0)
        add(x, height - 1)
    for y in range(height):
        add(0, y)
        add(width - 1, y)

    while queue:
        x, y = queue.popleft()
        r, g, b, _a = px[x, y]
        px[x, y] = (r, g, b, 0)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < width and 0 <= ny < height:
                add(nx, ny)

    return rgba


def trim_transparent_padding(img: Image.Image, alpha_threshold: int) -> Image.Image:
    rgba = img.convert("RGBA")
    alpha = rgba.getchannel("A")
    mask = alpha.point(lambda a: 255 if a > alpha_threshold else 0)
    bbox = mask.getbbox()
    if not bbox:
        return rgba
    return rgba.crop(bbox)


def normalize_logo(
    img: Image.Image,
    canvas: int,
    fill_ratio: float,
    white_threshold: int,
    alpha_threshold: int,
) -> Image.Image:
    img = remove_edge_connected_white(img, threshold=white_threshold)
    img = trim_transparent_padding(img, alpha_threshold=alpha_threshold)

    w, h = img.size
    if w <= 0 or h <= 0:
        return Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))

    target = max(1, min(canvas, int(round(canvas * fill_ratio))))
    scale = min(target / w, target / h)
    new_w = max(1, int(round(w * scale)))
    new_h = max(1, int(round(h * scale)))
    img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)

    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    out.alpha_composite(img, ((canvas - new_w) // 2, (canvas - new_h) // 2))
    return out


def replace_folder(src: Path, dst: Path) -> None:
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst)


def main() -> None:
    parser = argparse.ArgumentParser(description="Normalize public/retro_images logos.")
    parser.add_argument("--folder", default="public/retro_images", help="Output/current logo folder relative to project root.")
    parser.add_argument("--source", default=None, help="Optional source folder relative to project root.")
    parser.add_argument("--use-current", action="store_true", help="Use current public/retro_images as source even when public/retro_images_original exists.")
    parser.add_argument("--canvas", type=int, default=256, help="Final square canvas size in pixels.")
    parser.add_argument("--fill", type=float, default=0.985, help="Logo fill ratio inside canvas, 0.5 to 1.0. Try 1.0 for larger logos.")
    parser.add_argument("--white-threshold", type=int, default=246, help="RGB threshold for edge-connected white background removal.")
    parser.add_argument("--alpha-threshold", type=int, default=6, help="Alpha threshold used when trimming transparent padding.")
    args = parser.parse_args()

    if not 0.5 <= args.fill <= 1.0:
        raise SystemExit("--fill must be between 0.5 and 1.0")

    root = project_root()
    out_folder = root / args.folder
    originals = root / "public" / "retro_images_original"

    if args.source:
        source = root / args.source
    elif originals.exists() and not args.use_current:
        source = originals
    else:
        source = out_folder

    if not source.exists():
        raise SystemExit(f"Could not find source folder: {source}")
    if not out_folder.exists():
        raise SystemExit(f"Could not find output folder: {out_folder}")

    backup = root / "public" / f"retro_images_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    shutil.copytree(out_folder, backup)
    print(f"Backup created: {backup.relative_to(root)}")
    print(f"Source used: {source.relative_to(root)}")

    temp_out = root / "public" / "retro_images_normalized_tmp"
    if temp_out.exists():
        shutil.rmtree(temp_out)
    temp_out.mkdir(parents=True)

    count = 0
    skipped = 0
    for path in iter_images(source):
        try:
            with Image.open(path) as im:
                normalized = normalize_logo(
                    im,
                    canvas=args.canvas,
                    fill_ratio=args.fill,
                    white_threshold=args.white_threshold,
                    alpha_threshold=args.alpha_threshold,
                )
            normalized.save(temp_out / f"{path.stem}.png", "PNG", optimize=True)
            count += 1
        except Exception as exc:
            skipped += 1
            print(f"Skipped {path.name}: {exc}")

    replace_folder(temp_out, out_folder)
    shutil.rmtree(temp_out)

    print(f"Normalized {count} logo(s). Skipped {skipped}.")
    print("Run npm run dev and refresh the app to check the logo sizing.")
    print("Still too small? Try: python3 scripts/normalize_retro_logos.py --fill 1.0")


if __name__ == "__main__":
    main()
