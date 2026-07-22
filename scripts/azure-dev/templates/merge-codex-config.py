#!/usr/bin/env python3
"""Merge Azure-managed settings into an existing Codex user configuration."""

from __future__ import annotations

import json
import os
from pathlib import Path
import re
import sys
import tempfile
import tomllib
from typing import Any, cast


ROOT_START = "# >>> kravhantering azure dev managed root"
ROOT_END = "# <<< kravhantering azure dev managed root"
PROFILE_START = "# >>> kravhantering azure dev managed profile"
PROFILE_END = "# <<< kravhantering azure dev managed profile"
WORKSPACE_SECTION = 'projects."/workspace"'
MANAGED_PROFILE_NAMES = (
    "permissions.kravhantering-azure-dev",
    "permissions.kravhantering-devcontainer",
)
SECTION_PATTERN = re.compile(r"^\s*\[([^][]+)]\s*(?:#.*)?$")
ROOT_SETTING_PATTERN = re.compile(
    r"^\s*(approval_policy|default_permissions)\s*=",
)
TRUST_SETTING_PATTERN = re.compile(r"^\s*trust_level\s*=")


def toml_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def without_marked_blocks(content: str) -> list[str]:
    lines = content.splitlines()
    result: list[str] = []
    active_end: str | None = None
    block_ends = {
        ROOT_START: ROOT_END,
        PROFILE_START: PROFILE_END,
    }

    for line in lines:
        stripped = line.strip()
        if active_end is not None:
            if stripped == active_end:
                active_end = None
            continue
        if stripped in block_ends:
            active_end = block_ends[stripped]
            continue
        result.append(line)

    if active_end is not None:
        raise ValueError(f"unterminated managed block; expected {active_end}")
    return result


def is_managed_profile_section(section: str | None) -> bool:
    if section is None:
        return False
    return any(
        section == profile or section.startswith(f"{profile}.")
        for profile in MANAGED_PROFILE_NAMES
    )


def clean_existing_config(content: str, trust_level: str) -> tuple[list[str], bool]:
    result: list[str] = []
    section: str | None = None
    workspace_found = False

    for line in without_marked_blocks(content):
        match = SECTION_PATTERN.match(line)
        if match:
            section = match.group(1)
            if is_managed_profile_section(section):
                continue
            result.append(line)
            if section == WORKSPACE_SECTION:
                workspace_found = True
                result.append(f"trust_level = {toml_string(trust_level)}")
            continue

        if is_managed_profile_section(section):
            continue
        if section is None and ROOT_SETTING_PATTERN.match(line):
            continue
        if section == WORKSPACE_SECTION and TRUST_SETTING_PATTERN.match(line):
            continue
        result.append(line)

    while result and not result[0].strip():
        result.pop(0)
    while result and not result[-1].strip():
        result.pop()
    return result, workspace_found


def require_string(value: Any, name: str) -> str:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{name} must be a non-empty string")
    return value


def require_table(value: Any, name: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{name} must be a table")
    return cast(dict[str, Any], value)


def render_profile(managed: dict[str, Any]) -> tuple[list[str], str, list[str]]:
    approval_policy = require_string(managed.get("approval_policy"), "approval_policy")
    default_permissions = require_string(
        managed.get("default_permissions"),
        "default_permissions",
    )
    projects = require_table(managed.get("projects"), "projects")
    workspace = require_table(
        projects.get("/workspace"),
        'projects."/workspace"',
    )
    trust_level = require_string(
        workspace.get("trust_level"),
        'projects."/workspace".trust_level',
    )
    permissions = require_table(managed.get("permissions"), "permissions")
    profile = require_table(
        permissions.get(default_permissions),
        f"permissions.{default_permissions}",
    )
    description = require_string(profile.get("description"), "permission description")
    extends = require_string(profile.get("extends"), "permission extends")
    network = require_table(profile.get("network"), "permission network")
    enabled = network.get("enabled")
    allow_local_binding = network.get("allow_local_binding")
    if not isinstance(enabled, bool) or not isinstance(allow_local_binding, bool):
        raise ValueError("network flags must be booleans")
    domains = require_table(network.get("domains"), "permission network domains")
    if not domains:
        raise ValueError("permission network domains must be a non-empty table")

    root = [
        ROOT_START,
        f"approval_policy = {toml_string(approval_policy)}",
        f"default_permissions = {toml_string(default_permissions)}",
        ROOT_END,
    ]
    profile_lines = [
        PROFILE_START,
        f"[permissions.{default_permissions}]",
        f"description = {toml_string(description)}",
        f"extends = {toml_string(extends)}",
        "",
        f"[permissions.{default_permissions}.network]",
        f"enabled = {str(enabled).lower()}",
        f"allow_local_binding = {str(allow_local_binding).lower()}",
        "",
        f"[permissions.{default_permissions}.network.domains]",
    ]
    for domain, decision in domains.items():
        profile_lines.append(
            f"{toml_string(require_string(domain, 'domain'))} = "
            f"{toml_string(require_string(decision, f'domain {domain} decision'))}",
        )
    profile_lines.append(PROFILE_END)
    return root + [""], trust_level, profile_lines


def merge_config(existing_content: str, managed_content: str) -> str:
    managed = tomllib.loads(managed_content)
    root_lines, trust_level, profile_lines = render_profile(managed)
    existing_lines, workspace_found = clean_existing_config(
        existing_content,
        trust_level,
    )

    merged = list(root_lines)
    merged.extend(existing_lines)
    if merged and merged[-1].strip():
        merged.append("")
    if not workspace_found:
        merged.extend(
            [
                f"[{WORKSPACE_SECTION}]",
                f"trust_level = {toml_string(trust_level)}",
                "",
            ],
        )
    merged.extend(profile_lines)
    merged_content = "\n".join(merged).rstrip() + "\n"

    parsed = tomllib.loads(merged_content)
    default_permissions = managed["default_permissions"]
    if parsed.get("default_permissions") != default_permissions:
        raise ValueError("merged default permission profile is incorrect")
    if parsed["projects"]["/workspace"].get("trust_level") != trust_level:
        raise ValueError("merged workspace trust level is incorrect")
    return merged_content


def write_atomic(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    mode = path.stat().st_mode & 0o777 if path.exists() else 0o600
    with tempfile.NamedTemporaryFile(
        "w",
        encoding="utf-8",
        dir=path.parent,
        prefix=f".{path.name}.",
        delete=False,
    ) as handle:
        handle.write(content)
        temporary_path = Path(handle.name)
    try:
        os.chmod(temporary_path, mode)
        os.replace(temporary_path, path)
    finally:
        temporary_path.unlink(missing_ok=True)


def main() -> int:
    if len(sys.argv) != 3:
        print(
            "usage: merge-codex-config.py MANAGED_CONFIG USER_CONFIG",
            file=sys.stderr,
        )
        return 2

    managed_path = Path(sys.argv[1])
    user_path = Path(sys.argv[2])
    existing_content = user_path.read_text(encoding="utf-8") if user_path.exists() else ""
    managed_content = managed_path.read_text(encoding="utf-8")
    write_atomic(user_path, merge_config(existing_content, managed_content))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
