from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path("/home/yann/save-as-m3")
OUT = ROOT / "public" / "icon"
OUT.mkdir(parents=True, exist_ok=True)

SIZES = [16, 32, 48, 96, 128]
SCALE = 8

BG_TOP = (37, 99, 235, 255)
BG_BOTTOM = (14, 116, 144, 255)
FOLDER = (255, 255, 255, 245)
FOLDER_SHADE = (219, 234, 254, 255)
ARROW = (37, 99, 235, 255)
SHADOW = (15, 23, 42, 60)


def rounded_rect_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def vertical_gradient(
    size: int, top: tuple[int, int, int, int], bottom: tuple[int, int, int, int]
) -> Image.Image:
    image = Image.new("RGBA", (size, size))
    pixels = image.load()
    for y in range(size):
        t = y / max(size - 1, 1)
        color = tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(4))
        for x in range(size):
            pixels[x, y] = color
    return image


def draw_icon(size: int) -> Image.Image:
    canvas_size = size * SCALE
    image = vertical_gradient(canvas_size, BG_TOP, BG_BOTTOM)
    mask = rounded_rect_mask(canvas_size, int(canvas_size * 0.22))
    image.putalpha(mask)

    shadow = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle(
        (
            int(canvas_size * 0.16),
            int(canvas_size * 0.28),
            int(canvas_size * 0.84),
            int(canvas_size * 0.72),
        ),
        radius=int(canvas_size * 0.08),
        fill=SHADOW,
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=max(2, canvas_size // 32)))
    image.alpha_composite(shadow, (0, int(canvas_size * 0.02)))

    draw = ImageDraw.Draw(image)

    tab = [
        (int(canvas_size * 0.22), int(canvas_size * 0.29)),
        (int(canvas_size * 0.42), int(canvas_size * 0.29)),
        (int(canvas_size * 0.49), int(canvas_size * 0.39)),
        (int(canvas_size * 0.22), int(canvas_size * 0.39)),
    ]
    draw.rounded_rectangle(
        (
            int(canvas_size * 0.20),
            int(canvas_size * 0.27),
            int(canvas_size * 0.48),
            int(canvas_size * 0.43),
        ),
        radius=int(canvas_size * 0.05),
        fill=FOLDER_SHADE,
    )
    draw.polygon(tab, fill=FOLDER_SHADE)

    draw.rounded_rectangle(
        (
            int(canvas_size * 0.17),
            int(canvas_size * 0.36),
            int(canvas_size * 0.83),
            int(canvas_size * 0.72),
        ),
        radius=int(canvas_size * 0.08),
        fill=FOLDER,
    )

    arrow_shaft_width = max(10, int(canvas_size * 0.085))
    shaft_x = int(canvas_size * 0.50)
    shaft_top = int(canvas_size * 0.19)
    shaft_bottom = int(canvas_size * 0.50)
    draw.rounded_rectangle(
        (
            shaft_x - arrow_shaft_width // 2,
            shaft_top,
            shaft_x + arrow_shaft_width // 2,
            shaft_bottom,
        ),
        radius=arrow_shaft_width // 2,
        fill=ARROW,
    )

    head_half = int(canvas_size * 0.13)
    head_top = int(canvas_size * 0.43)
    head_bottom = int(canvas_size * 0.62)
    draw.polygon(
        [
            (shaft_x - head_half, head_top),
            (shaft_x + head_half, head_top),
            (shaft_x, head_bottom),
        ],
        fill=ARROW,
    )

    highlight = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    highlight_draw = ImageDraw.Draw(highlight)
    highlight_draw.ellipse(
        (
            int(canvas_size * 0.08),
            int(canvas_size * 0.06),
            int(canvas_size * 0.62),
            int(canvas_size * 0.42),
        ),
        fill=(255, 255, 255, 42),
    )
    highlight = highlight.filter(
        ImageFilter.GaussianBlur(radius=max(2, canvas_size // 24))
    )
    image.alpha_composite(highlight)

    return image.resize((size, size), Image.Resampling.LANCZOS)


for size in SIZES:
    draw_icon(size).save(OUT / f"{size}.png")

print("generated", ", ".join(str(size) for size in SIZES))
