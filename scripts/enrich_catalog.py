from __future__ import annotations

import json
import re
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from pypdf import PdfReader


APP_DIR = Path(__file__).resolve().parents[1]
DATA_FILE = APP_DIR / "assets" / "std-data.js"
OUT_FILE = APP_DIR / "assets" / "std-extra.js"
IMAGE_DIR = APP_DIR / "assets" / "product-images"
STD_DIR = Path("/Users/michele/Desktop/STD")
PRICE_LIST = Path(
    "/Users/michele/Library/CloudStorage/Dropbox/TOVER/2026/LISTINO 26/TOVER listino prezzi 2026-rev MAG 26.pdf"
)

PRICE_RE = re.compile(r"(\d{1,5},\d{2}|All'?ordine)", re.I)
UNIT_RE = re.compile(r"^(kg|l|L|pz|m2|m²)$", re.I)
CATEGORY_RE = re.compile(r"^[A-ZÀ-Ý0-9 '&/().-]{6,}$")


def load_std_data() -> dict:
    text = DATA_FILE.read_text(encoding="utf-8")
    payload = text.split("=", 1)[1].strip().rstrip(";")
    return json.loads(payload)


def norm_text(value: str) -> str:
    value = value.lower()
    value = value.replace("’", "'").replace("–", "-")
    value = re.sub(r"[^a-z0-9à-ÿ]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def compact(value: str) -> str:
    return re.sub(r"[^a-z0-9à-ÿ]+", "", value.lower())


def product_variants(product: dict) -> list[str]:
    name = product["name"]
    source_title = re.sub(r"[_ -]*(it|IT)[_ -]*(rev|REV).*$", "", Path(product["source"]).stem, flags=re.I)
    variants = {name, source_title.replace("_", " ")}
    replacements = {
        "Verde": "Green",
        "Nano-fix": "Nano-Fix",
        "Fullgap": "Full Gap",
        "Make-Up": "Make Up",
        "SportFloor": "Sportfloor",
        "Protect LED": "Protect LED",
        "Acqua UV – LED": "Acqua UV LED",
        "Acqua UV-LED": "Acqua UV LED",
        "Diluente RMD/91": "Diluente RMD/91",
        "Diluente RMD91": "Diluente RMD/91",
        "Primer PU 100": "Primer PU100",
        "Primer PU-FIX 60": "Primer PU-Fix 60",
        "Idrofondo H20": "Idrofondo H20",
        "Sanipro": "Sani Pro",
    }
    for old, new in replacements.items():
        for item in list(variants):
            if old.lower() in item.lower():
                variants.add(re.sub(re.escape(old), new, item, flags=re.I))
    return sorted({v.strip() for v in variants if len(v.strip()) > 2}, key=len, reverse=True)


def likely_packaging_token(token: str) -> bool:
    token = token.lower().strip()
    return (
        bool(re.match(r"^\d", token))
        or token in {"all'ordine", "ordine", "in", "semilucida", "opaca", "lucida", "neutro", "natur", "colorato"}
        or token.startswith("(")
    )


def line_matches_product(line: str, variant: str) -> bool:
    line_tokens = norm_text(line).split()
    variant_tokens = norm_text(variant).split()
    if not variant_tokens or len(line_tokens) < len(variant_tokens):
        return False
    if line_tokens[: len(variant_tokens)] != variant_tokens:
        return False
    if len(line_tokens) == len(variant_tokens):
        return True
    return likely_packaging_token(line_tokens[len(variant_tokens)])


def load_price_lines() -> list[dict]:
    reader = PdfReader(str(PRICE_LIST))
    items: list[dict] = []
    for page_index, page in enumerate(reader.pages):
        if page_index < 4:
            continue
        text = page.extract_text() or ""
        for raw in text.splitlines():
            line = re.sub(r"\s+", " ", raw.replace("\xa0", " ")).strip()
            if line:
                items.append({"page": page_index + 1, "line": line})
    return items


def is_table_noise(line: str) -> bool:
    upper = line.upper()
    return upper in {"LISTINO PREZZI", "2026", "PRODOTTI CONFEZIONI PREZZO EURO", "NEW"}


def is_category(line: str) -> bool:
    if is_table_noise(line):
        return True
    if PRICE_RE.search(line):
        return False
    if any(ch.islower() for ch in line):
        return False
    return bool(CATEGORY_RE.match(line)) and len(line.split()) <= 8


def block_for_match(lines: list[dict], index: int, all_variants: list[str]) -> list[dict]:
    block = [lines[index]]
    has_price = bool(PRICE_RE.search(lines[index]["line"]))
    has_unit = bool(re.search(r"\s(kg|L|l|pz|m2|m²)$", lines[index]["line"], flags=re.I))
    for next_item in lines[index + 1 : index + 14]:
        line = next_item["line"]
        if is_category(line):
            break
        if any(line_matches_product(line, variant) for variant in all_variants):
            break
        if has_price and has_unit and re.match(r"^[A-ZÀ-Ý][A-Za-zÀ-ÿ'.&/ -]{2,}\s", line) and PRICE_RE.search(line):
            break
        block.append(next_item)
        if PRICE_RE.search(line):
            has_price = True
        if UNIT_RE.fullmatch(line) or re.search(r"\s(kg|L|l|pz|m2|m²)$", line, flags=re.I):
            has_unit = True
    return block


def parse_rows(product_name: str, block_lines: list[str]) -> list[dict]:
    rows: list[dict] = []
    first = block_lines[0] if block_lines else ""
    variants = [product_name]
    remainder = first
    for variant in variants:
        if compact(first).startswith(compact(variant)):
            remainder = first[len(variant) :].strip(" -|")
            break

    one_line = re.search(r"(.+?)\s+(\d{1,5},\d{2}|All'?ordine)\s+(kg|L|l|pz|m2|m²)$", remainder, flags=re.I)
    if one_line:
        rows.append(
            {
                "confezione": one_line.group(1).strip(),
                "prezzo": one_line.group(2).replace(".", ","),
                "unita": one_line.group(3).replace("l", "L"),
            }
        )

    if rows:
        return rows

    lines = [remainder] + block_lines[1:]
    packages: list[str] = []
    prices: list[str] = []
    units: list[str] = []
    mode = "packages"
    for line in lines:
        if not line:
            continue
        if re.fullmatch(r"\d{1,5},\d{2}|All'?ordine", line, flags=re.I):
            prices.append(line.replace(".", ","))
            mode = "prices"
            continue
        if UNIT_RE.fullmatch(line):
            units.append(line.replace("l", "L"))
            mode = "units"
            continue
        if PRICE_RE.search(line) and re.search(r"\s(kg|L|l|pz|m2|m²)$", line, flags=re.I):
            match = re.search(r"(.+?)\s+(\d{1,5},\d{2}|All'?ordine)\s+(kg|L|l|pz|m2|m²)$", line, flags=re.I)
            if match:
                rows.append(
                    {
                        "confezione": match.group(1).strip(),
                        "prezzo": match.group(2),
                        "unita": match.group(3).replace("l", "L"),
                    }
                )
            continue
        if mode == "packages" and len(line) < 80:
            packages.append(line)

    if not rows and prices:
        for idx, price in enumerate(prices):
            rows.append(
                {
                    "confezione": packages[idx] if idx < len(packages) else "",
                    "prezzo": price,
                    "unita": units[idx] if idx < len(units) else "",
                }
            )
    return rows


def extract_prices(products: list[dict]) -> dict:
    price_lines = load_price_lines()
    all_variants = []
    variants_by_id = {}
    for product in products:
        variants = product_variants(product)
        variants_by_id[product["id"]] = variants
        all_variants.extend(variants)

    result = {}
    used_blocks: set[tuple[int, str]] = set()
    for product in products:
        matches = []
        for idx, item in enumerate(price_lines):
            line = item["line"]
            matched_variant = next((variant for variant in variants_by_id[product["id"]] if line_matches_product(line, variant)), None)
            if not matched_variant:
                continue
            block = block_for_match(price_lines, idx, all_variants)
            key = (item["page"], " ".join(row["line"] for row in block[:4]))
            if key in used_blocks:
                continue
            used_blocks.add(key)
            excerpt = [row["line"] for row in block]
            rows = parse_rows(matched_variant, excerpt)
            matches.append(
                {
                    "page": item["page"],
                    "listinoName": matched_variant,
                    "rows": rows,
                    "excerpt": excerpt[:10],
                }
            )
        if matches:
            result[product["id"]] = {"prices": matches[:4]}
    return result


def placeholder(product: dict, out_path: Path) -> None:
    image = Image.new("RGB", (420, 420), "#eef3ef")
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((24, 36, 396, 360), radius=20, fill="#ffffff", outline="#ced9d2", width=3)
    draw.rectangle((72, 112, 348, 270), fill="#10231f")
    draw.text((112, 174), "TOVER", fill="#ffffff")
    words = product["name"].split()
    text = " ".join(words[:3])
    draw.text((48, 372), text[:32], fill="#23352f")
    image.save(out_path, "WEBP", quality=82)


def extract_image(product: dict) -> str | None:
    pdf_path = STD_DIR / product.get("relativeFolder", ".") / product["source"]
    out_path = IMAGE_DIR / f"{product['id']}.webp"
    if out_path.exists() and out_path.stat().st_size > 1000:
        return f"assets/product-images/{out_path.name}"
    try:
        reader = PdfReader(str(pdf_path))
        pdf_image = reader.pages[0].images[0]
        image = Image.open(BytesIO(pdf_image.data)).convert("RGBA")
        image.thumbnail((420, 420), Image.LANCZOS)
        canvas = Image.new("RGBA", (420, 420), (255, 255, 255, 0))
        x = (420 - image.width) // 2
        y = (420 - image.height) // 2
        canvas.alpha_composite(image, (x, y))
        canvas.save(out_path, "WEBP", quality=84, method=6)
    except Exception:
        placeholder(product, out_path)
    return f"assets/product-images/{out_path.name}"


def build() -> dict:
    data = load_std_data()
    products = data["products"]
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    extras = extract_prices(products)
    for product in products:
        info = extras.setdefault(product["id"], {})
        info["image"] = extract_image(product)
    priced = sum(1 for item in extras.values() if item.get("prices"))
    return {
        "priceList": {
            "name": "TOVER listino prezzi 2026 - rev. MAG 26",
            "source": str(PRICE_LIST),
            "validFrom": "2026-05-01",
        },
        "productCount": len(products),
        "pricedProductCount": priced,
        "products": extras,
    }


def main() -> None:
    payload = build()
    OUT_FILE.write_text("window.STD_EXTRA = " + json.dumps(payload, ensure_ascii=False, indent=2) + ";\n", encoding="utf-8")
    print(f"Wrote {OUT_FILE}")
    print(f"Products: {payload['productCount']}, with prices: {payload['pricedProductCount']}")


if __name__ == "__main__":
    main()
