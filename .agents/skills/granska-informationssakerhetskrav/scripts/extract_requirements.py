#!/usr/bin/env python3
"""Extract requirement rows from CSV-like security requirement sources."""

from __future__ import annotations

import argparse
import csv
import json
import sys
import unicodedata
from pathlib import Path
from typing import Iterable


ID_HEADERS = (
    "id",
    "kravid",
    "krav id",
    "kravnummer",
    "nummer",
    "nr",
    "requirement id",
    "requirement number",
    "security requirement id",
    "information security requirement id",
    "number",
    "no",
)

TITLE_HEADERS = (
    "informationssakerhetskrav",
    "sakerhetskrav",
    "informationssäkerhetskrav",
    "säkerhetskrav",
    "krav",
    "kravrubrik",
    "rubrik",
    "titel",
    "title",
    "requirement",
    "security requirement",
    "information security requirement",
)

DESCRIPTION_HEADERS = (
    "beskrivning",
    "kravtext",
    "text",
    "description",
    "details",
    "detaljer",
)


def normalize_header(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    ascii_text = "".join(char for char in decomposed if not unicodedata.combining(char))
    return " ".join(ascii_text.casefold().strip().replace("_", " ").split())


def compact(value: str | None) -> str:
    return " ".join((value or "").replace("\ufeff", "").split())


def read_text(path: Path) -> str:
    for encoding in ("utf-8-sig", "utf-8", "cp1252"):
        try:
            return path.read_text(encoding=encoding)
        except UnicodeDecodeError:
            continue
    return path.read_text()


def detect_dialect(sample: str) -> csv.Dialect:
    try:
        return csv.Sniffer().sniff(sample, delimiters=";,\t")
    except csv.Error:
        delimiter = max((";", ",", "\t"), key=sample.count)
        class FallbackDialect(csv.excel):
            pass

        FallbackDialect.delimiter = delimiter
        return FallbackDialect


def choose_header(headers: Iterable[str], candidates: tuple[str, ...]) -> str | None:
    normalized = {normalize_header(header): header for header in headers}
    for candidate in candidates:
        if candidate in normalized:
            return normalized[candidate]
    for normalized_header, original in normalized.items():
        if any(candidate in normalized_header for candidate in candidates):
            return original
    return None


def parse_requirements(path: Path) -> list[dict[str, object]]:
    text = read_text(path)
    dialect = detect_dialect(text[:4096])
    reader = csv.DictReader(text.splitlines(), dialect=dialect)

    if not reader.fieldnames:
        raise ValueError(f"No header row found in {path}")

    headers = [compact(header) for header in reader.fieldnames]
    id_header = choose_header(headers, ID_HEADERS)
    title_header = choose_header(headers, TITLE_HEADERS)
    description_header = choose_header(headers, DESCRIPTION_HEADERS)

    rows: list[dict[str, object]] = []
    for index, row in enumerate(reader, start=2):
        cleaned = {compact(key): compact(value) for key, value in row.items() if key}
        title = cleaned.get(title_header or "", "")
        description = cleaned.get(description_header or "", "")

        if not title and not description:
            text_cells = [value for value in cleaned.values() if value]
            if text_cells:
                title = text_cells[0]
                description = " ".join(text_cells[1:])

        if not title and not description:
            continue

        rows.append(
            {
                "source_row": index,
                "id": cleaned.get(id_header or "", ""),
                "title": title,
                "description": description,
                "source_columns": cleaned,
            }
        )

    return rows


def escape_markdown(value: object) -> str:
    return str(value or "").replace("|", "\\|")


def print_markdown(rows: list[dict[str, object]]) -> None:
    print("| Källrad | Id | Krav | Beskrivning |")
    print("| --- | --- | --- | --- |")
    for row in rows:
        print(
            "| "
            + " | ".join(
                [
                    escape_markdown(row["source_row"]),
                    escape_markdown(row["id"]),
                    escape_markdown(row["title"]),
                    escape_markdown(row["description"]),
                ]
            )
            + " |"
        )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Extract normalized requirement rows from a CSV-like file."
    )
    parser.add_argument("source", type=Path, help="Requirement source file")
    parser.add_argument(
        "--format",
        choices=("json", "markdown"),
        default="json",
        help="Output format",
    )
    args = parser.parse_args()

    try:
        rows = parse_requirements(args.source)
    except (OSError, ValueError, csv.Error) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1

    if args.format == "markdown":
        print_markdown(rows)
    else:
        print(json.dumps(rows, ensure_ascii=False, indent=2))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
