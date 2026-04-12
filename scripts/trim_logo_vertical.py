from pathlib import Path
from PIL import Image, ImageFilter

PADDING = 18
THRESHOLD = 8
IMAGES = [
    Path("docs/_media/crumbs-logo-light.png"),
    Path("docs/_media/crumbs-logo-dark.png"),
]


def find_vertical_bounds(image: Image.Image, threshold: float, padding: int) -> tuple[int, int]:
    rgb = image.convert("RGB")
    blurred = rgb.filter(ImageFilter.GaussianBlur(12))
    width, height = rgb.size
    row_scores: list[float] = []

    for y in range(height):
        total = 0
        for x in range(width):
            r1, g1, b1 = rgb.getpixel((x, y))
            r2, g2, b2 = blurred.getpixel((x, y))
            total += abs(r1 - r2) + abs(g1 - g2) + abs(b1 - b2)
        row_scores.append(total / width)

    top = next((y for y, score in enumerate(row_scores) if score > threshold), 0)
    bottom = next((height - 1 - y for y, score in enumerate(reversed(row_scores)) if score > threshold), height - 1)

    top = max(0, top - padding)
    bottom = min(height, bottom + padding + 1)
    return top, bottom


for path in IMAGES:
    image = Image.open(path)
    top, bottom = find_vertical_bounds(image, THRESHOLD, PADDING)
    cropped = image.crop((0, top, image.width, bottom))
    cropped.save(path)
    print(f"trimmed {path} -> top={top}, bottom={bottom}, size={cropped.size}")
