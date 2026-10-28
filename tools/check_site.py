#!/usr/bin/env python3
"""Проверка целостности статического сайта.

Проверяет локальные ссылки и анкоры, наличие файлов, alt у изображений,
совпадение FAQ в JSON-LD и в разметке, единообразие телефона и почты,
корректность canonical/og:url/sitemap и незаполненные плейсхолдеры.

Запуск из корня репозитория:
    python tools/check_site.py            ошибки → код возврата 1
    python tools/check_site.py --strict   предупреждения тоже считаются ошибками

Зависимостей нет: только стандартная библиотека Python 3.8+.
"""

import argparse
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent.parent
BASE_URL = "https://askuyr.github.io/Chigirin/"
SITE_PREFIX = "/Chigirin/"
PHONE_DIGITS = "79219746517"
EMAIL = "c.chigirin@yandex.ru"
PHONE_TEXT = re.compile(r"\+7[\s(]*921[\s)]*974[\s-]*65[\s-]*17")
PHONE_LOOSE = re.compile(r"\+7[0-9\s()\-]{9,20}")
EMAIL_TEXT = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
PLACEHOLDER_CLASS = re.compile(r"class=\"[^\"]*\bplaceholder\b[^\"]*\"")
PLACEHOLDER_TEXT = re.compile(r"\[\s*(?:\.\.\.|…)\s*\]")
CSS_URL = re.compile(r"url\(\s*['\"]?([^'\")]+)['\"]?\s*\)")
SKIP_SCHEMES = ("tel:", "mailto:", "data:", "javascript:", "sms:", "whatsapp:", "viber:")
MAX_DESCRIPTION = 160


def setup_console():
    """Кириллица в консоли Windows: UTF-8 вместо устаревшей кодовой страницы."""
    if sys.platform != "win32":
        return
    try:
        import ctypes

        ctypes.windll.kernel32.SetConsoleOutputCP(65001)
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


class Report:
    """Сбор ошибок и предупреждений."""

    def __init__(self):
        self.errors = []
        self.warnings = []

    def error(self, where, message):
        self.errors.append((where, message))

    def warn(self, where, message):
        self.warnings.append((where, message))

    def print(self):
        for where, message in self.errors:
            print(f"ОШИБКА   {where}: {message}")
        for where, message in self.warnings:
            print(f"ВНИМАНИЕ {where}: {message}")
        print(
            f"\nПроверено страниц: {len(PAGES)}; ошибок: {len(self.errors)}; "
            f"предупреждений: {len(self.warnings)}"
        )


class PageParser(HTMLParser):
    """Собирает ссылки, id, изображения, JSON-LD и текст FAQ."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids = []
        self.refs = []          # (kind, value): kind — 'href' | 'src' | 'srcset'
        self.images = []
        self.jsonld = []
        self.meta = {}
        self.canonical = None
        self.lang = None
        self.text = []
        self.details = []
        self._details_stack = []
        self.anchors_without_href = 0
        self._in_jsonld = False
        self._jsonld_parts = []
        self._in_title = False
        self._title_parts = []

    # --- разбор разметки ----------------------------------------------
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)

        if attrs.get("id"):
            self.ids.append(attrs["id"])

        if tag == "html":
            self.lang = attrs.get("lang")
        elif tag == "title":
            self._in_title = True
        elif tag == "meta":
            key = attrs.get("name") or attrs.get("property")
            if key:
                self.meta[key] = attrs.get("content", "")
        elif tag == "link":
            href = attrs.get("href")
            if href:
                self.refs.append(("href", href))
            if attrs.get("rel") == "canonical":
                self.canonical = href
        elif tag == "a":
            href = attrs.get("href")
            if href is None:
                self.anchors_without_href += 1
            else:
                self.refs.append(("href", href))
        elif tag in ("img", "source"):
            if attrs.get("src"):
                self.refs.append(("src", attrs["src"]))
            if attrs.get("srcset"):
                self.refs.append(("srcset", attrs["srcset"]))
            if tag == "img":
                self.images.append(
                    {"src": attrs.get("src", ""), "alt": attrs.get("alt"), "has_alt": "alt" in attrs}
                )
        elif tag == "script":
            if attrs.get("type") == "application/ld+json":
                self._in_jsonld = True
                self._jsonld_parts = []
        elif tag == "details":
            self._details_stack.append({"summary": [], "answer": [], "in_summary": False})
        elif tag == "summary":
            if self._details_stack:
                self._details_stack[-1]["in_summary"] = True

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        elif tag == "script" and self._in_jsonld:
            self.jsonld.append("".join(self._jsonld_parts))
            self._jsonld_parts = []
            self._in_jsonld = False
        elif tag == "summary":
            if self._details_stack:
                self._details_stack[-1]["in_summary"] = False
        elif tag == "details":
            if self._details_stack:
                self.details.append(self._details_stack.pop())

    def handle_data(self, data):
        if self._in_jsonld:
            self._jsonld_parts.append(data)
            return
        self.text.append(data)
        if self._in_title:
            self._title_parts.append(data)
        if self._details_stack:
            item = self._details_stack[-1]
            if item["in_summary"]:
                item["summary"].append(data)
            else:
                item["answer"].append(data)

    # --- готовые значения ---------------------------------------------
    @property
    def title_text(self):
        return " ".join("".join(self._title_parts).split())

    @property
    def page_text(self):
        return " ".join("".join(self.text).split())

    def faq_pairs(self):
        pairs = []
        for item in self.details:
            question = " ".join("".join(item["summary"]).split())
            answer = " ".join("".join(item["answer"]).split())
            if question:
                pairs.append((question, answer))
        return pairs


PAGES = {}


def parse_page(path):
    parser = PageParser()
    parser.feed(path.read_text(encoding="utf-8"))
    return parser


def site_target(url_path):
    """Путь внутри сайта по абсолютному адресу: /Chigirin/privacy.html → privacy.html."""
    if url_path.startswith(SITE_PREFIX):
        url_path = url_path[len(SITE_PREFIX):]
    return unquote(url_path).lstrip("/")


def relative_target(url_path):
    """Путь относительно корня сайта для относительных ссылок."""
    return unquote(url_path).lstrip("/")


def ids_of(target, pages):
    """Идентификаторы другой страницы (с ленивым разбором)."""
    if target not in pages:
        path = ROOT / target
        if path.suffix == ".html" and path.exists():
            pages[target] = parse_page(path)
        else:
            pages[target] = None
    page = pages[target]
    return page.ids if page else []


def check_refs(page_path, page, report, pages):
    """Проверяет ссылки, srcset и якоря на одной странице."""
    for kind, value in page.refs:
        where = f"{page_path.relative_to(ROOT)}: {kind}={value}"

        if kind == "srcset":
            for candidate in value.split(","):
                candidate = candidate.strip()
                if not candidate:
                    continue
                url = candidate.split()[0]
                if not (ROOT / relative_target(url)).exists():
                    report.error(where, "файл не найден")
            continue

        if value.startswith(SKIP_SCHEMES):
            continue

        parsed = urlparse(value)

        if parsed.scheme in ("http", "https"):
            if parsed.netloc == urlparse(BASE_URL).netloc:
                target = site_target(parsed.path) or "index.html"
                if not (ROOT / target).exists():
                    report.error(where, f"внутренний адрес не найден ({target})")
                elif parsed.fragment and parsed.fragment not in ids_of(target, pages):
                    report.error(where, f"нет якоря #{parsed.fragment} в {target}")
            continue

        if parsed.scheme or parsed.netloc:
            continue

        target = relative_target(parsed.path)
        fragment = parsed.fragment

        if not target:
            if fragment and fragment not in page.ids:
                report.error(where, f"нет якоря #{fragment}")
            continue

        if not (ROOT / target).exists():
            report.error(where, f"файл не найден ({target})")
            continue

        if fragment and fragment not in ids_of(target, pages):
            report.error(where, f"нет якоря #{fragment} в {target}")


def check_page(page_path, page, report):
    """Проверки структуры одной страницы."""
    where = str(page_path.relative_to(ROOT))

    for dup in sorted({i for i in page.ids if page.ids.count(i) > 1}):
        report.error(where, f"дублируется id=\"{dup}\"")

    if not page.lang:
        report.error(where, "нет lang на <html>")
    if not page.title_text:
        report.error(where, "пустой <title>")

    description = page.meta.get("description", "")
    if not description:
        report.error(where, "нет meta description")
    elif len(description) > MAX_DESCRIPTION:
        report.warn(where, f"meta description длиннее {MAX_DESCRIPTION} символов ({len(description)})")

    if page.anchors_without_href:
        report.error(where, f"<a> без href: {page.anchors_without_href}")

    for image in page.images:
        if not image["has_alt"]:
            report.error(where, f"у <img src=\"{image['src']}\"> нет атрибута alt")
        elif not (image["alt"] or "").strip():
            report.warn(where, f"пустой alt у <img src=\"{image['src']}\">")

    if page.canonical and not page.canonical.startswith(BASE_URL):
        report.error(where, f"canonical указывает на другой адрес: {page.canonical}")

    for key in ("og:url", "twitter:url"):
        value = page.meta.get(key)
        if value and not value.startswith(BASE_URL):
            report.error(where, f"{key} указывает на другой адрес: {value}")


def load_jsonld(page, report, where):
    """Разбирает блоки JSON-LD, возвращает список объектов."""
    blocks = []
    for raw in page.jsonld:
        raw = raw.strip()
        if not raw:
            continue
        try:
            blocks.append(json.loads(raw))
        except json.JSONDecodeError as exc:
            report.error(where, f"невалидный JSON-LD: {exc}")
    return blocks


def check_jsonld(page_path, page, report):
    """Проверяет содержимое JSON-LD."""
    where = str(page_path.relative_to(ROOT))

    for data in load_jsonld(page, report, where):
        if data.get("@type") != "LegalService":
            continue
        phone = re.sub(r"\D", "", data.get("telephone", ""))
        if phone != PHONE_DIGITS:
            report.error(where, f"телефон в JSON-LD: {data.get('telephone')!r}")
        image = data.get("image", "")
        if image.startswith(BASE_URL):
            target = site_target(urlparse(image).path)
            if not (ROOT / target).exists():
                report.error(where, f"картинка из JSON-LD не найдена: {target}")


def check_faq_consistency(page_path, page, report):
    """FAQ в JSON-LD должен совпадать с раскрытыми вопросами на странице."""
    where = str(page_path.relative_to(ROOT))
    html_faq = page.faq_pairs()
    if not html_faq:
        return

    ld_faq = []
    for data in load_jsonld(page, report, where):
        if data.get("@type") != "FAQPage":
            continue
        for item in data.get("mainEntity", []):
            question = " ".join(item.get("name", "").split())
            answer = " ".join(item.get("acceptedAnswer", {}).get("text", "").split())
            ld_faq.append((question, answer))

    if not ld_faq:
        report.error(where, "в разметке есть FAQ, но нет JSON-LD FAQPage")
        return

    if len(ld_faq) != len(html_faq):
        report.error(where, f"вопросов в HTML {len(html_faq)}, в JSON-LD {len(ld_faq)}")

    for index, (question, answer) in enumerate(html_faq):
        if index >= len(ld_faq):
            break
        ld_question, ld_answer = ld_faq[index]
        if question != ld_question:
            report.error(where, f"вопрос №{index + 1} в JSON-LD: {ld_question!r} != {question!r}")
        if answer != ld_answer:
            report.error(where, f"ответ на вопрос №{index + 1} в JSON-LD различается с разметкой")


def check_contacts(page_path, page, report):
    """Телефон и почта должны быть едиными по всему сайту."""
    where = str(page_path.relative_to(ROOT))

    for kind, value in page.refs:
        if kind != "href":
            continue
        if value.startswith("tel:"):
            if re.sub(r"\D", "", value) != PHONE_DIGITS:
                report.error(where, f"ссылка tel: указывает на другой номер: {value}")
        elif value.startswith("mailto:"):
            if value[len("mailto:"):].split("?")[0] != EMAIL:
                report.error(where, f"ссылка mailto: указывает на другой адрес: {value}")

    for match in PHONE_LOOSE.finditer(page.page_text):
        if not PHONE_TEXT.fullmatch(match.group(0).strip()):
            report.warn(where, f"текстовый номер в нестандартном формате: {match.group(0).strip()!r}")

    for match in EMAIL_TEXT.finditer(page.page_text):
        if match.group(0) != EMAIL:
            report.warn(where, f"почта в тексте в другом формате: {match.group(0)}")


def check_assets(report):
    """Файлы, на которые ссылаются CSS."""
    for css in sorted(ROOT.glob("assets/*.css")):
        for match in CSS_URL.finditer(css.read_text(encoding="utf-8")):
            url = match.group(1).strip()
            if url.startswith(("data:", "http://", "https://", "#")):
                continue
            if not (css.parent / unquote(url)).exists():
                report.error(str(css.relative_to(ROOT)), f"url({url}) — файл не найден")


def check_sitemap(report):
    """Карта сайта: адреса должны соответствовать файлам, lastmod — дата."""
    sitemap = ROOT / "sitemap.xml"
    if not sitemap.exists():
        report.error("sitemap.xml", "файл не найден")
        return

    content = sitemap.read_text(encoding="utf-8")
    locs = re.findall(r"<loc>(.*?)</loc>", content)
    if not locs:
        report.error("sitemap.xml", "нет ни одного <loc>")

    for loc in locs:
        parsed = urlparse(loc)
        if parsed.netloc != urlparse(BASE_URL).netloc:
            report.error("sitemap.xml", f"адрес с чужого домена: {loc}")
            continue
        target = site_target(parsed.path) or "index.html"
        if not (ROOT / target).exists():
            report.error("sitemap.xml", f"страница не найдена: {target}")

    for lastmod in re.findall(r"<lastmod>(.*?)</lastmod>", content):
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", lastmod):
            report.error("sitemap.xml", f"lastmod в неверном формате: {lastmod}")


def check_robots(report):
    """robots.txt: ссылка на sitemap и актуальность правил."""
    robots = ROOT / "robots.txt"
    if not robots.exists():
        report.error("robots.txt", "файл не найден")
        return

    content = robots.read_text(encoding="utf-8")
    for line in content.splitlines():
        stripped = line.strip()
        if stripped.lower().startswith("sitemap:"):
            url = stripped.split(":", 1)[1].strip()
            target = site_target(urlparse(url).path)
            if not (ROOT / target).exists():
                report.error("robots.txt", f"карта сайта не найдена: {target}")
        elif stripped.lower().startswith("disallow:") and stripped.lower() != "disallow: /":
            path = stripped.split(":", 1)[1].strip()
            if not (ROOT / relative_target(path)).exists():
                report.warn("robots.txt", f"правило Disallow ссылается на несуществующий путь: {path}")


def check_placeholders(report):
    """Незаполненные реквизиты: класс placeholder и текст вида [ ... ]."""
    for path in sorted(ROOT.glob("*.html")):
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if PLACEHOLDER_CLASS.search(line) or PLACEHOLDER_TEXT.search(line):
                report.warn(f"{path.relative_to(ROOT)}:{number}", "незаполненный реквизит [ ... ]")


def main():
    parser = argparse.ArgumentParser(description="Проверка целостности сайта")
    parser.add_argument("--strict", action="store_true", help="считать предупреждения ошибками")
    args = parser.parse_args()

    setup_console()
    report = Report()

    for path in sorted(ROOT.glob("*.html")):
        PAGES[path.name] = parse_page(path)

    for path in sorted(ROOT.glob("*.html")):
        page = PAGES[path.name]
        check_page(path, page, report)
        check_refs(path, page, report, PAGES)
        check_jsonld(path, page, report)
        check_faq_consistency(path, page, report)
        check_contacts(path, page, report)

    check_assets(report)
    check_sitemap(report)
    check_robots(report)
    check_placeholders(report)

    report.print()

    if report.errors or (args.strict and report.warnings):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
