"""Генерация служебных ассетов сайта: OG-картинка, иконка и vCard.

Скрипт пересобирает файлы, которые нельзя править руками:
  assets/og-chigirin.jpg      — картинка для соцсетей 1200×630
  assets/apple-touch-icon.png — иконка 180×180
  assets/chigirin.vcf         — контакт для добавления в телефон

Запуск из корня репозитория:
    python tools/gen_assets.py

Требования: Python 3.8+ и Pillow (`pip install pillow`).
Шрифты Georgia и Arial берутся из системной папки Windows, поэтому
скрипт рассчитан на Windows; на других системах укажите свои пути.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"

W, H = 1200, 630
img = Image.new("RGB", (W, H), (22, 19, 14))
draw = ImageDraw.Draw(img)

top = (28, 23, 17)
bottom = (18, 14, 10)
for y in range(H):
    t = y / (H - 1)
    color = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    draw.line([(0, y), (W, y)], fill=color)

glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
gd.ellipse((760, -140, 1180, 280), fill=(232, 137, 47, 105))
gd.ellipse((980, 260, 1330, 620), fill=(159, 46, 16, 120))
gd.ellipse((-220, 380, 260, 760), fill=(232, 137, 47, 45))
glow = glow.filter(ImageFilter.GaussianBlur(110))
img = Image.alpha_composite(img.convert("RGBA"), glow).convert("RGB")

grid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gdr = ImageDraw.Draw(grid)
for x in range(0, W, 42):
    gdr.line([(x, 0), (x, H)], fill=(255, 255, 255, 4))
for y in range(0, H, 42):
    gdr.line([(0, y), (W, y)], fill=(255, 255, 255, 4))
img = Image.alpha_composite(img.convert("RGBA"), grid).convert("RGB")
draw = ImageDraw.Draw(img)

fonts = Path("C:/Windows/Fonts")
georgia_bold = ImageFont.truetype(str(fonts / "georgiab.ttf"), 46)
georgia = ImageFont.truetype(str(fonts / "georgia.ttf"), 27)
arial = ImageFont.truetype(str(fonts / "arial.ttf"), 20)
arial_bold = ImageFont.truetype(str(fonts / "arialbd.ttf"), 18)

gold = (232, 137, 47)
gold_soft = (241, 185, 120)
text = (246, 232, 214)
muted = (201, 183, 157)


def spaced_text(d, xy, s, font, fill, spacing=3):
    x, y = xy
    for ch in s:
        d.text((x, y), ch, font=font, fill=fill)
        x += d.textlength(ch, font=font) + spacing
    return x


draw.rounded_rectangle((80, 62, 138, 124), radius=13, outline=(241, 185, 120), width=2,
                       fill=(232, 137, 47, 26))
mono_font = ImageFont.truetype(str(fonts / "georgia.ttf"), 37)
mono_bbox = draw.textbbox((0, 0), "Ч", font=mono_font)
draw.text((109 - (mono_bbox[2] - mono_bbox[0]) / 2, 93 - (mono_bbox[3] - mono_bbox[1]) / 2 - 4),
          "Ч", font=mono_font, fill=gold_soft)

spaced_text(draw, (158, 72), "КИРИЛЛ ЧИГИРИН", arial_bold, text, 4.5)
draw.text((160, 101), "ЮРИДИЧЕСКАЯ ПРАКТИКА", font=arial, fill=muted)

draw.line([(80, 168), (150, 168)], fill=gold, width=3)

draw.text((80, 200), "Юридическая защита", font=georgia_bold, fill=text)
draw.text((80, 258), "и правовое", font=georgia_bold, fill=text)
draw.text((80, 316), "сопровождение", font=georgia_bold, fill=gold_soft)

draw.text((80, 424), "Санкт-Петербург · консультации, документы,", font=georgia, fill=muted)
draw.text((80, 460), "представительство в суде", font=georgia, fill=muted)

draw.line([(80, 536), (640, 536)], fill=(241, 185, 120), width=1)
draw.text((80, 556), "+7 (921) 974-65-17", font=arial, fill=text)
draw.text((330, 556), "c.chigirin@yandex.ru", font=arial, fill=text)
draw.text((80, 590), "askuyr.github.io/Chigirin", font=arial, fill=muted)

photo = Image.open(ASSETS / "kirill-chigirin.jpg").convert("RGB")
source = photo.copy()
target_w, target_h = 430, 538
ratio = target_w / target_h
sw, sh = photo.size
crop_h = int(sw / ratio)
if crop_h <= sh:
    top_off = int((sh - crop_h) * 0.22)
    photo = photo.crop((0, top_off, sw, top_off + crop_h))
else:
    crop_w = int(sh * ratio)
    left_off = (sw - crop_w) // 2
    photo = photo.crop((left_off, 0, left_off + crop_w, sh))
photo = photo.resize((target_w, target_h), Image.LANCZOS)

mask = Image.new("L", (target_w, target_h), 0)
md = ImageDraw.Draw(mask)
md.rounded_rectangle((0, 0, target_w, target_h), radius=30, fill=255)
framed = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
framed.paste(photo, (0, 0), mask)
img.paste(framed, (680, 46), framed)

draw.rounded_rectangle((668, 34, 1122, 596), radius=38, outline=(241, 185, 120), width=2)

fade_alpha = Image.new("L", (target_w, target_h), 0)
fd = ImageDraw.Draw(fade_alpha)
for y in range(350, target_h):
    alpha = int(205 * ((y - 350) / (target_h - 350)) ** 1.35)
    fd.line([(0, y), (target_w, y)], fill=alpha)
fade_alpha = Image.composite(fade_alpha, Image.new("L", fade_alpha.size, 0), mask)
fade_layer = Image.new("RGBA", (target_w, target_h), (11, 10, 8, 0))
fade_layer.putalpha(fade_alpha)
img.paste(fade_layer, (680, 46), fade_layer)

caption_font = ImageFont.truetype(str(fonts / "georgiab.ttf"), 31)
draw.text((714, 498), "Кирилл Чигирин", font=caption_font, fill=(255, 248, 238))
draw.text((714, 540), "ЮРИСТ", font=arial_bold, fill=gold_soft)

img.convert("RGB").save(ASSETS / "og-chigirin.jpg", quality=90, optimize=True, progressive=True)

# Кадры портрета для srcset: кадрирование 4:5, отступ сверху 18% — совпадает
# с object-position в styles.css.
src_w, src_h = source.size
crop_h = int(src_w / 0.8)
crop_top = int((src_h - crop_h) * 0.18)
frame = source.crop((0, crop_top, src_w, crop_top + crop_h))
for width in (480, 640, 800):
    frame.resize((width, int(width * 1.25)), Image.LANCZOS).save(
        ASSETS / f"kirill-chigirin-{width}.webp", "WEBP", quality=75, method=4
    )

icon = Image.new("RGB", (180, 180), (22, 19, 14))
idraw = ImageDraw.Draw(icon)
for y in range(180):
    t = y / 179
    idraw.line([(0, y), (180, y)], fill=(int(34 - 8 * t), int(27 - 8 * t), int(21 - 7 * t)))
idraw.rounded_rectangle((10, 10, 170, 170), radius=38, outline=(241, 185, 120), width=3)
idraw.rounded_rectangle((18, 18, 162, 162), radius=32, outline=(232, 137, 47), width=1)
ic_font = ImageFont.truetype(str(fonts / "georgia.ttf"), 104)
bbox = idraw.textbbox((0, 0), "Ч", font=ic_font)
idraw.text((90 - (bbox[2] - bbox[0]) / 2, 82 - (bbox[3] - bbox[1]) / 2), "Ч", font=ic_font, fill=(241, 185, 120))
icon.save(ASSETS / "apple-touch-icon.png", optimize=True)

vcf = "\r\n".join([
    "BEGIN:VCARD",
    "VERSION:3.0",
    "N:Чигирин;Кирилл;;;",
    "FN:Кирилл Чигирин",
    "ORG:Юридическая практика",
    "TITLE:Юрист",
    "TEL;TYPE=CELL:+79219746517",
    "EMAIL:c.chigirin@yandex.ru",
    "URL:https://askuyr.github.io/Chigirin/",
    "NOTE:Заместитель Главы МО «Морские ворота». Санкт-Петербург.",
    "END:VCARD",
    "",
])
(ASSETS / "chigirin.vcf").write_text(vcf, encoding="utf-8", newline="")

print("ok")
