from __future__ import annotations

import json
import re
from pathlib import Path

from pypdf import PdfReader


SOURCE_DIR = Path("/Users/michele/Desktop/STD")
OUT_DIR = Path(__file__).resolve().parents[1] / "assets"
OUT_FILE = OUT_DIR / "std-data.js"


CATEGORY_RULES = (
    ("ADESIVI &", "SIGILLANTI", "Adesivi & Sigillanti"),
    ("VERNICI &", "FINITURE", "Vernici & Finiture"),
    ("DETERGENZA &", "MANUTENZIONE", "Detergenza & Manutenzione"),
    ("PRIMER &", "SOTTOFONDI", "Primer & Sottofondi"),
    ("PRIMERS", "& SUB-FLOORS", "Primers & Sub-Floors"),
    ("DILUENTI &", "ADDITIVI", "Diluenti & Additivi"),
)

FIELD_PATTERNS = {
    "resa_consumo": r"\b(resa|consumo|consumi)\b",
    "uso_impiego": r"\b(modalità d.?uso|modalità di applicazione|istruzioni per l.?uso|modo d.?uso|applicazione|impiego|utilizzo|pronta all.?uso|pronto all.?uso)\b",
    "posa": r"\b(posa|incollaggio|parquet|paviment|lvt|pvc|resilienti|sottofondo|massetto|supporto)\b",
    "preparazione": r"\b(preparazione|carteggiare|aspirare|pulire|sottofondo|supporto|massetti)\b",
    "tempi": r"\b(tempo|fuori polvere|secco|sovraverniciatura|pedonabilità|levigatura|messa in esercizio|indurimento)\b",
    "temperatura": r"\b(temperatura|gelo|umidità|u\.r\.|°c)\b",
    "pulizia": r"\b(pulizia|pulire|lavaggio|attrezzi|residui)\b",
    "note_limiti": r"\b(note|non usare|non applicare|non idoneo|evitare|attenzione|avvertenze)\b",
}


def clean_text(text: str) -> str:
    replacements = {
        "/f_i": "fi",
        "/f_": "f",
        "two.superior": "²",
        "one.superior": "¹",
        "\u00ad": "",
        "\ufb01": "fi",
        "\ufb02": "fl",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    text = text.replace("/²", "²")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def detect_category(lines: list[str]) -> str:
    candidates: list[str] = []
    for idx, line in enumerate(lines):
        upper = line.upper()
        next_upper = lines[idx + 1].upper().strip() if idx + 1 < len(lines) else ""
        for first, second, category in CATEGORY_RULES:
            if first not in upper:
                continue
            if second in upper or second in next_upper:
                candidates.append(category)
        compact = upper.strip()
        if compact == "ADESIVI":
            candidates.append("Adesivi & Sigillanti")
        if compact == "PRIMER E" and "SOTTOFONDI" in next_upper:
            candidates.append("Primer & Sottofondi")
        if compact == "DETERGENZA E" and "MANUTENZIONE" in next_upper:
            candidates.append("Detergenza & Manutenzione")
        if compact == "PAVIMENTI IN" and "RESINA" in next_upper:
            candidates.append("Pavimenti in resina")
        if compact == "TECNOLOGIE" and "CHIMICHE" in next_upper:
            candidates.append("Tecnologie chimiche")
    if candidates:
        return max(set(candidates), key=candidates.count)
    return "Non classificato"


def filename_title(path: Path) -> str:
    title = path.stem
    title = re.sub(r"[_ -]*(it|IT)[_ -]*(rev|REV).*$", "", title, flags=re.I)
    title = re.sub(r"[_ -]*(rev|REV).*$", "", title, flags=re.I)
    title = title.replace("_", " ")
    return re.sub(r"\s+", " ", title).strip()


def product_header(path: Path, lines: list[str]) -> tuple[str, int]:
    fallback = filename_title(path)
    generic = ("certificazioni", "certifications")
    generic_prefixes = ("rev.", "la presente annulla", "altra precedente", "i consigli tecnici")
    for idx, raw in enumerate(lines[:6]):
        line = raw.strip()
        compact = line.lower()
        if not line or compact in generic or compact.startswith(generic_prefixes):
            continue
        if len(line) > 90:
            continue
        if fallback and normalize_for_match(line).startswith(normalize_for_match(fallback)):
            if len(line) > len(fallback) + 8:
                return fallback, idx
        if 2 <= len(line) <= 80:
            return line, idx
    return fallback, 0


def normalize_for_match(value: str) -> str:
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "", value)
    return value


def extract_snippets(lines: list[str], pattern: str, window: int = 2, limit: int = 8) -> list[str]:
    rx = re.compile(pattern, flags=re.I)
    snippets: list[str] = []
    seen: set[str] = set()
    for idx, line in enumerate(lines):
        if not rx.search(line):
            continue
        start = max(0, idx - window)
        end = min(len(lines), idx + window + 1)
        snippet = " ".join(lines[start:end])
        snippet = re.sub(r"\s+", " ", snippet).strip()
        if snippet and snippet not in seen:
            seen.add(snippet)
            snippets.append(snippet[:900])
        if len(snippets) >= limit:
            break
    return snippets


def make_fragments(lines: list[str]) -> list[str]:
    fragments: list[str] = []
    buf: list[str] = []
    for line in lines:
        if not line:
            continue
        buf.append(line)
        if len(" ".join(buf)) > 650:
            fragments.append(" ".join(buf))
            buf = []
    if buf:
        fragments.append(" ".join(buf))
    return [re.sub(r"\s+", " ", f).strip()[:1200] for f in fragments if len(f) > 30]


def read_pdf(path: Path) -> str:
    reader = PdfReader(str(path))
    pages = []
    for page in reader.pages:
        pages.append(page.extract_text() or "")
    return clean_text("\n".join(pages))


def build_dataset() -> dict:
    products = []
    errors = []
    pdfs = sorted(p for p in SOURCE_DIR.rglob("*.pdf") if p.is_file())
    for path in pdfs:
        try:
            text = read_pdf(path)
            lines = [line.strip() for line in text.splitlines() if line.strip()]
            name, title_idx = product_header(path, lines)
            subtitle_idx = title_idx + 1
            subtitle = lines[subtitle_idx].strip() if len(lines) > subtitle_idx else ""
            category = detect_category(lines)
            fields = {
                key: extract_snippets(lines, pattern)
                for key, pattern in FIELD_PATTERNS.items()
            }
            products.append(
                {
                    "id": re.sub(r"[^a-z0-9]+", "-", path.stem.lower()).strip("-"),
                    "name": name,
                    "subtitle": subtitle,
                    "category": category,
                    "source": path.name,
                    "relativeFolder": str(path.parent.relative_to(SOURCE_DIR)),
                    "fuoriListino": "Fuori listino" in path.parts,
                    "text": text[:18000],
                    "fragments": make_fragments(lines),
                    "fields": fields,
                }
            )
        except Exception as exc:  # Keep the app usable even if one PDF is damaged.
            errors.append({"source": path.name, "error": str(exc)})

    categories = sorted({p["category"] for p in products})
    return {
        "sourceDir": str(SOURCE_DIR),
        "generatedAt": "2026-06-04",
        "productCount": len(products),
        "categories": categories,
        "products": products,
        "errors": errors,
    }


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    data = build_dataset()
    payload = json.dumps(data, ensure_ascii=False, indent=2)
    OUT_FILE.write_text(f"window.STD_DATA = {payload};\n", encoding="utf-8")
    print(f"Wrote {OUT_FILE}")
    print(f"Products: {data['productCount']}, categories: {len(data['categories'])}, errors: {len(data['errors'])}")
    for category in data["categories"]:
        count = sum(1 for p in data["products"] if p["category"] == category)
        print(f"- {category}: {count}")


if __name__ == "__main__":
    main()
