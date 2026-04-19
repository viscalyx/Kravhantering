#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import logging
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import TypeAlias, cast

CODE_EXTENSIONS = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}
DEFAULT_SOURCE_DIRS = ("app", "components", "lib", "scripts", "tests")
EXCLUDED_DIRS = {
    ".git",
    ".next",
    "coverage",
    "dist",
    "build",
    "node_modules",
    "out",
}
NEXT_ENTRY_NAMES = {
    "default",
    "error",
    "layout",
    "loading",
    "not-found",
    "page",
    "route",
    "template",
}
ROOT_ENTRY_FILES = {
    "instrumentation.js",
    "instrumentation.ts",
    "middleware.js",
    "middleware.ts",
    "proxy.js",
    "proxy.ts",
}
TEST_FILE_RE = re.compile(r"\.(test|spec)\.[cm]?[jt]sx?$")
IMPORT_RE = re.compile(
    r"""
    (?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]
    |import\s*\(\s*['"]([^'"]+)['"]\s*\)
    |require\s*\(\s*['"]([^'"]+)['"]\s*\)
    """,
    re.VERBOSE,
)
PACKAGE_ENTRY_RE = re.compile(r"(?:^|\s)(?:node|bash)\s+((?:[./]|[A-Za-z0-9_-]+/)[^\s|;&]+)")
logger = logging.getLogger(__name__)

JsonPrimitive: TypeAlias = None | bool | int | float | str
JsonValue: TypeAlias = JsonPrimitive | list["JsonValue"] | dict[str, "JsonValue"]
JsonObject: TypeAlias = dict[str, JsonValue]


@dataclass
class Candidate:
    path: str
    lines: int
    inbound_references: int
    referenced_by: list[str]
    why_flagged: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Find likely dead-code file candidates using a static "
            "import graph."
        )
    )
    parser.add_argument(
        "--root",
        default=".",
        help="Repository root to scan. Defaults to the current directory.",
    )
    parser.add_argument(
        "--include-dir",
        action="append",
        dest="include_dirs",
        help=(
            "Source directory to scan. Repeat for multiple roots. "
            "Defaults to common app roots when present."
        ),
    )
    parser.add_argument(
        "--format",
        choices=("markdown", "json"),
        default="markdown",
        help="Output format. Defaults to markdown.",
    )
    parser.add_argument(
        "--min-lines",
        type=int,
        default=1,
        help="Only report candidates with at least this many lines.",
    )
    return parser.parse_args()


def load_json(path: Path) -> JsonObject:
    try:
        data: object = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Failed to parse {path}: {exc}") from exc

    if not isinstance(data, dict):
        raise SystemExit(
            f"Expected {path} to contain a JSON object at the top level."
        )

    return cast(JsonObject, data)


def normalize(relative_path: Path) -> str:
    path = relative_path.as_posix()
    if path.startswith("./"):
        return path[2:]
    return path


def get_json_object(value: JsonValue | None) -> JsonObject:
    if isinstance(value, dict):
        return cast(JsonObject, value)
    return {}


def discover_roots(root: Path, requested: list[str] | None) -> list[Path]:
    if requested:
        return [root / entry for entry in requested]

    discovered = [
        root / entry for entry in DEFAULT_SOURCE_DIRS if (root / entry).is_dir()
    ]
    return discovered or [root]


def iter_source_files(root: Path, scan_roots: list[Path]) -> list[str]:
    files: list[str] = []
    for scan_root in scan_roots:
        if not scan_root.exists():
            continue
        for path in scan_root.rglob("*"):
            if not path.is_file() or path.suffix not in CODE_EXTENSIONS:
                continue
            relative = path.relative_to(root)
            if any(part in EXCLUDED_DIRS for part in relative.parts):
                continue
            files.append(normalize(relative))
    return sorted(set(files))


def collect_root_next_entry_files(root: Path) -> list[str]:
    files: list[str] = []
    for entry in sorted(ROOT_ENTRY_FILES):
        path = root / entry
        if path.is_file():
            files.append(entry)
    return files


def load_aliases(root: Path) -> list[tuple[str, str]]:
    tsconfig = root / "tsconfig.json"
    # `extends` is not resolved here, so aliases from extended configs are ignored.
    config = load_json(tsconfig)
    paths = get_json_object(get_json_object(config.get("compilerOptions")).get("paths"))
    aliases: list[tuple[str, str]] = []
    for alias, targets_value in paths.items():
        if not isinstance(targets_value, list) or not targets_value:
            continue
        first_target = targets_value[0]
        if not isinstance(first_target, str):
            continue
        alias_prefix = alias[:-1] if alias.endswith("*") else alias
        target_prefix = first_target[:-1] if first_target.endswith("*") else first_target
        target_prefix = normalize(Path(target_prefix))
        aliases.append((alias_prefix, target_prefix))
    return aliases


def file_module_keys(relative_path: str) -> list[str]:
    path = Path(relative_path)
    base = normalize(path.with_suffix(""))
    keys = [relative_path, base]
    if path.stem == "index" and str(path.parent) != ".":
        keys.append(normalize(path.parent))
    return keys


def build_module_index(files: list[str]) -> dict[str, list[str]]:
    index: dict[str, list[str]] = {}
    for relative_path in files:
        for key in file_module_keys(relative_path):
            index.setdefault(key, []).append(relative_path)
    return index


def extract_specs(text: str) -> list[str]:
    specs: list[str] = []
    for match in IMPORT_RE.finditer(text):
        for group in match.groups():
            if group is not None:
                specs.append(group)
                break
    return specs


def resolve_alias(
    spec: str,
    aliases: list[tuple[str, str]],
    module_index: dict[str, list[str]],
) -> list[str]:
    for alias_prefix, target_prefix in aliases:
        if spec.startswith(alias_prefix):
            target = f"{target_prefix}{spec[len(alias_prefix):]}"
            return module_index.get(target.rstrip("/"), [])
    return []


def resolve_spec(
    spec: str,
    source: str,
    root: Path,
    aliases: list[tuple[str, str]],
    module_index: dict[str, list[str]],
) -> list[str]:
    if spec.startswith("."):
        source_path = root / source
        target = (source_path.parent / spec).resolve()
        try:
            relative = normalize(target.relative_to(root.resolve()))
        except ValueError:
            return []
        if Path(relative).suffix in CODE_EXTENSIONS:
            return module_index.get(relative, [])
        return module_index.get(relative.rstrip("/"), [])

    return resolve_alias(spec, aliases, module_index)


def collect_package_entrypoints(root: Path) -> set[str]:
    package_json = load_json(root / "package.json")
    scripts = get_json_object(package_json.get("scripts"))
    entrypoints: set[str] = set()
    for command in scripts.values():
        if not isinstance(command, str):
            continue
        for match in PACKAGE_ENTRY_RE.finditer(command):
            raw_path = match.group(1).strip("'\"")
            file_path = normalize(Path(raw_path))
            if file_path:
                entrypoints.add(file_path)
    return entrypoints


def is_next_entry(relative_path: str) -> bool:
    path = Path(relative_path)
    if path.parts and path.parts[0] == "app" and path.stem in NEXT_ENTRY_NAMES:
        return True
    return relative_path in ROOT_ENTRY_FILES


def is_test_entry(relative_path: str) -> bool:
    return relative_path.startswith("tests/") or bool(
        TEST_FILE_RE.search(relative_path)
    )


def is_entry_file(relative_path: str, package_entries: set[str]) -> bool:
    return (
        relative_path in package_entries
        or is_next_entry(relative_path)
        or is_test_entry(relative_path)
    )


def line_count(root: Path, relative_path: str) -> int:
    try:
        text = (root / relative_path).read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError) as exc:
        logger.warning("Skipping line count for %s: %s", relative_path, exc)
        return 0
    return len(text.splitlines())


def build_reference_graph(
    root: Path,
    files: list[str],
    aliases: list[tuple[str, str]],
    module_index: dict[str, list[str]],
) -> dict[str, set[str]]:
    inbound: dict[str, set[str]] = {relative_path: set() for relative_path in files}
    for relative_path in files:
        try:
            text = (root / relative_path).read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError) as exc:
            logger.warning(
                "Skipping %s while building the reference graph: %s",
                relative_path,
                exc,
            )
            continue
        for spec in extract_specs(text):
            for resolved in resolve_spec(
                spec,
                relative_path,
                root,
                aliases,
                module_index,
            ):
                if resolved != relative_path:
                    inbound[resolved].add(relative_path)
    return inbound


def collect_candidates(
    root: Path,
    files: list[str],
    inbound: dict[str, set[str]],
    package_entries: set[str],
    min_lines: int,
) -> list[Candidate]:
    candidates: list[Candidate] = []
    for relative_path in files:
        if is_entry_file(relative_path, package_entries):
            continue
        referrers = sorted(inbound.get(relative_path, set()))
        if referrers:
            continue
        lines = line_count(root, relative_path)
        if lines < min_lines:
            continue
        candidates.append(
            Candidate(
                path=relative_path,
                lines=lines,
                inbound_references=0,
                referenced_by=[],
                why_flagged=(
                    "No static imports, re-exports, or package.json script "
                    "entrypoints reference this file."
                ),
            )
        )
    return sorted(
        candidates,
        key=lambda candidate: (-candidate.lines, candidate.path),
    )


def print_markdown(candidates: list[Candidate]) -> None:
    print("# Dead Code Candidates")
    print()
    print(
        "Validate every candidate manually before removal. Static import "
        "analysis can miss runtime-only entrypoints."
    )
    print()

    if not candidates:
        print("No unreferenced file candidates were found.")
        return

    print(
        "| Id | File | Lines | Inbound refs | Why flagged |\n"
        "| -- | ---- | ----- | ------------ | ----------- |"
    )
    for index, candidate in enumerate(candidates, start=1):
        print(
            f"| {index} | `{candidate.path}` | {candidate.lines} | "
            f"{candidate.inbound_references} | {candidate.why_flagged} |"
        )


def main() -> None:
    args = parse_args()
    root = Path(args.root).resolve()
    scan_roots = discover_roots(root, args.include_dirs)
    files = iter_source_files(root, scan_roots)
    if not args.include_dirs:
        # Root-level Next entry files are live by convention and can keep imported
        # modules reachable even when the rest of the repo root is out of scan scope.
        files = sorted(set(files) | set(collect_root_next_entry_files(root)))
    aliases = load_aliases(root)
    module_index = build_module_index(files)
    package_entries = collect_package_entrypoints(root)
    inbound = build_reference_graph(root, files, aliases, module_index)
    candidates = collect_candidates(
        root,
        files,
        inbound,
        package_entries,
        args.min_lines,
    )

    if args.format == "json":
        json.dump([asdict(candidate) for candidate in candidates], sys.stdout, indent=2)
        print()
        return

    print_markdown(candidates)


if __name__ == "__main__":
    main()
