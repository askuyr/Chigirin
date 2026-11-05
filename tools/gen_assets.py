"""Генерация служебных ассетов сайта: OG-картинка, иконка, vCard и кадры портрета.

Скрипт пересобирает файлы, которые нельзя править руками:
  assets/og-chigirin.jpg               — картинка для соцсетей 1200×630
  assets/apple-touch-icon.png          — иконка 180×180
  assets/chigirin.vcf                  — контакт для добавления в телефон
  assets/kirill-chigirin-{640,960,1280,1600}.webp — портрет для srcset

Запуск из корня репозитория:
    python tools/gen_assets.py

Требования: Python 3.8+ и Pillow (`pip install pillow`).
Шрифты Georgia и Arial берутся из системной папки Windows, поэтому скрипт
рассчитан на Windows; на других системах укажите свои пути.
Исходник портрета — assets/kirill-chigirin.jpg (3:4).
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
FONTS = Path("C:/Windows/Fonts")

PAPER = (248, 250, 252)
PAPER_TEXT = (248, 250, 252)
BLUE = (30, 58, 138)
INK = (15, 23, 42)
MUTED = (203, 213, 225)

src = Image.open(ASSETS / "kirill-chigirin.jpg").convert("RGB")

# --- Кадры портрета для srcset (3:4, как в styles.css) ------------------------
for width in (640, 960, 1280, 1600):
    src.resize((width, int(width * 4 / 3)), Image.LANCZOS).save(
        ASSETS / f"kirill-chigirin-{width}.webp", "WEBP", quality=78, method=5
    )

# --- OG 1200x630: синее поле слева, портрет справа ---------------------------
W, H = 1200, 630
img = Image.new("RGB", (W, H), PAPER)
d = ImageDraw.Draw(img)
d.rectangle((0, 0, 470, H), fill=BLUE)
img.paste(ImageOps.fit(src, (730, 630), Image.LANCZOS, centering=(0.5, 0.32)), (470, 0))

serif = ImageFont.truetype(str(FONTS / "georgiab.ttf"), 52)
sans = ImageFont.truetype(str(FONTS / "arial.ttf"), 22)
sans_b = ImageFont.truetype(str(FONTS / "arialbd.ttf"), 20)

d.text((62, 60), "КИРИЛЛ", font=serif, fill=PAPER_TEXT)
d.text((62, 122), "ЧИГИРИН", font=serif, fill=PAPER_TEXT)
d.text((62, 196), "Юрист по гражданским спорам", font=sans, fill=MUTED)
d.text((62, 268), "Санкт-Петербург", font=sans, fill=MUTED)
d.text((62, 470), "+7 921 974-65-17", font=sans_b, fill=PAPER_TEXT)
d.text((62, 506), "c.chigirin@yandex.ru", font=sans, fill=MUTED)

img.save(ASSETS / "og-chigirin.jpg", quality=90, optimize=True, progressive=True)

# --- Иконка -----------------------------------------------------------------
icon = Image.new("RGB", (180, 180), PAPER)
idr = ImageDraw.Draw(icon)
idr.rectangle((10, 10, 170, 170), fill=BLUE)
f = ImageFont.truetype(str(FONTS / "georgiab.ttf"), 104)
bbox = idr.textbbox((0, 0), "Ч", font=f)
idr.text((90 - (bbox[2] - bbox[0]) / 2 - bbox[0], 86 - (bbox[3] - bbox[1]) / 2 - bbox[1]),
         "Ч", font=f, fill=PAPER_TEXT)
icon.save(ASSETS / "apple-touch-icon.png", optimize=True)

# --- vCard ------------------------------------------------------------------
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
