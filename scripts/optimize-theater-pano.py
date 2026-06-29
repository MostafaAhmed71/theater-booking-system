#!/usr/bin/env python3
"""
ضغط theater.JPG لنسخ مناسبة للجوال والكمبيوتر (نفس نسبة العرض — إحداثيات المعايرة panU/panV تبقى صالحة).

تشغيل من جذر المشروع:
  python scripts/optimize-theater-pano.py

المخرجات في assets/ — ارفعها مع الموقع؛ يمكن الإبقاء على theater.JPG محلياً فقط كمصدر.
"""
from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("يلزم Pillow: pip install pillow")
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "theater.JPG"
OUT = ROOT / "assets"

VARIANTS = (
    ("theater-mobile", 2560, 82, 85),
    ("theater", 5120, 84, 88),
)


def resize_keep_aspect(img: Image.Image, max_width: int) -> Image.Image:
    w, h = img.size
    if w <= max_width:
        return img.copy()
    nw = max_width
    nh = max(1, round(h * nw / w))
    return img.resize((nw, nh), Image.Resampling.LANCZOS)


def save_variant(base: str, img: Image.Image, webp_q: int, jpg_q: int) -> None:
    webp_path = OUT / f"{base}.webp"
    jpg_path = OUT / f"{base}.jpg"
    rgb = img.convert("RGB")
    rgb.save(webp_path, "WEBP", quality=webp_q, method=6)
    rgb.save(jpg_path, "JPEG", quality=jpg_q, optimize=True, progressive=True)
    print(f"  {webp_path.name}: {webp_path.stat().st_size / 1024:.0f} KB")
    print(f"  {jpg_path.name}: {jpg_path.stat().st_size / 1024:.0f} KB  ({img.size[0]}×{img.size[1]})")


def main() -> int:
    if not SRC.is_file():
        print(f"لم يُعثر على {SRC}")
        return 1

    OUT.mkdir(parents=True, exist_ok=True)
    src_mb = SRC.stat().st_size / (1024 * 1024)
    print(f"المصدر: {SRC.name} ({src_mb:.1f} MB)")

    with Image.open(SRC) as im:
        im.load()
        print(f"الأبعاد: {im.size[0]}×{im.size[1]}")
        for name, max_w, wq, jq in VARIANTS:
            print(f"\n{name} (عرض أقصى {max_w}px):")
            save_variant(name, resize_keep_aspect(im, max_w), wq, jq)

    print("\nتم. ارفع مجلد assets/ إلى الاستضافة مع index.html.")
    print("للنشر: لا حاجة لرفع theater.JPG (24MB) إن وُجدت النسخ في assets/.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
