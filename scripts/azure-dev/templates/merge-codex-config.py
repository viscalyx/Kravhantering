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
CODEX_SKILLS_PATH = "~/.codex/skills"
AZURE_WORKTREE_PATH = "/mnt/krav-azure-dev-data/.worktrees"
MANAGED_PROFILE_NAMES = (
    "permissions.kravhantering-development",
    "permissions.kravhantering-azure-dev",
    "permissions.kravhantering-devcontainer",
)
SECTION_PATTERN = re.compile(r"^\s*\[([^][]+)]\s*(?:#.*)?$")
ARRAY_SECTION_PATTERN = re.compile(r"^\s*\[\[([^][]+)]]\s*(?:#.*)?$")
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


def is_managed_plugin_section(
    section: str | None,
    managed_plugin_names: list[str],
) -> bool:
    if section is None:
        return False
    return any(
        section == f"plugins.{name}"
        or section.startswith(f"plugins.{name}.")
        or section == f"plugins.{toml_string(name)}"
        or section.startswith(f"plugins.{toml_string(name)}.")
        for name in managed_plugin_names
    )


def without_managed_skill_configs(
    lines: list[str],
    managed_skill_paths: list[str],
) -> list[str]:
    result: list[str] = []
    skill_config: list[str] | None = None

    def flush_skill_config() -> None:
        nonlocal skill_config
        if skill_config is None:
            return
        parsed = tomllib.loads("\n".join(skill_config))
        entries = parsed.get("skills", {}).get("config", [])
        path = entries[0].get("path") if entries else None
        if path not in managed_skill_paths:
            result.extend(skill_config)
        skill_config = None

    for line in lines:
        array_match = ARRAY_SECTION_PATTERN.match(line)
        section_match = SECTION_PATTERN.match(line)
        section = (array_match or section_match)
        section_name = section.group(1).strip() if section else None

        if skill_config is not None:
            if section_name is None or section_name.startswith("skills.config."):
                skill_config.append(line)
                continue
            flush_skill_config()

        if array_match and section_name == "skills.config":
            skill_config = [line]
        else:
            result.append(line)

    flush_skill_config()
    return result


def clean_existing_config(
    content: str,
    trust_level: str,
    managed_plugin_names: list[str],
    managed_skill_paths: list[str],
) -> tuple[list[str], bool]:
    result: list[str] = []
    section: str | None = None
    workspace_found = False

    existing_lines = without_managed_skill_configs(
        without_marked_blocks(content),
        managed_skill_paths,
    )
    for line in existing_lines:
        match = SECTION_PATTERN.match(line) or ARRAY_SECTION_PATTERN.match(line)
        if match:
            section = match.group(1).strip()
            if is_managed_profile_section(section) or is_managed_plugin_section(
                section,
                managed_plugin_names,
            ):
                continue
            result.append(line)
            if section == WORKSPACE_SECTION:
                workspace_found = True
                result.append(f"trust_level = {toml_string(trust_level)}")
            continue

        if is_managed_profile_section(section) or is_managed_plugin_section(
            section,
            managed_plugin_names,
        ):
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


def require_disabled_plugins(managed: dict[str, Any]) -> list[str]:
    plugins = require_table(managed.get("plugins"), "plugins")
    if not plugins:
        raise ValueError("plugins must be a non-empty table")

    names: list[str] = []
    for name, value in plugins.items():
        plugin_name = require_string(name, "plugin name")
        plugin = require_table(value, f"plugins.{plugin_name}")
        if plugin.get("enabled") is not False:
            raise ValueError(f"plugins.{plugin_name}.enabled must be false")
        names.append(plugin_name)
    return names


def require_disabled_skills(managed: dict[str, Any]) -> list[str]:
    skills = require_table(managed.get("skills"), "skills")
    config = skills.get("config")
    if not isinstance(config, list) or not config:
        raise ValueError("skills.config must be a non-empty array")
    skill_config = cast(list[Any], config)

    paths: list[str] = []
    for index, entry in enumerate(skill_config):
        skill = require_table(entry, f"skills.config.{index}")
        path = require_string(skill.get("path"), f"skills.config.{index}.path")
        if skill.get("enabled") is not False:
            raise ValueError(f"skills.config.{index}.enabled must be false")
        if path in paths:
            raise ValueError(f"duplicate disabled skill path: {path}")
        paths.append(path)
    return paths


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
    filesystem = require_table(profile.get("filesystem"), "permission filesystem")
    codex_skills_access = require_string(
        filesystem.get(CODEX_SKILLS_PATH),
        f"permission {CODEX_SKILLS_PATH} access",
    )
    if codex_skills_access != "write":
        raise ValueError(f"permission {CODEX_SKILLS_PATH} access must be write")
    filesystem_access = {CODEX_SKILLS_PATH: codex_skills_access}
    if AZURE_WORKTREE_PATH in filesystem:
        if filesystem[AZURE_WORKTREE_PATH] != "write":
            raise ValueError(f"permission {AZURE_WORKTREE_PATH} access must be write")
        filesystem_access[AZURE_WORKTREE_PATH] = "write"
    workspace_roots = require_table(
        filesystem.get(":workspace_roots"),
        "permission filesystem workspace roots",
    )
    workspace_root_access = {
        path: require_string(
            workspace_roots.get(path),
            f"permission {path} access",
        )
        for path in (".codex", ".git")
    }
    for path, access in workspace_root_access.items():
        if access != "write":
            raise ValueError(f"permission {path} access must be write")
    network = require_table(profile.get("network"), "permission network")
    enabled = network.get("enabled")
    allow_local_binding = network.get("allow_local_binding")
    if not isinstance(enabled, bool) or not isinstance(allow_local_binding, bool):
        raise ValueError("network flags must be booleans")
    domains = require_table(network.get("domains"), "permission network domains")
    if not domains:
        raise ValueError("permission network domains must be a non-empty table")
    disabled_plugin_names = require_disabled_plugins(managed)
    disabled_skill_paths = require_disabled_skills(managed)

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
        f"[permissions.{default_permissions}.filesystem]",
        *(
            f"{toml_string(path)} = {toml_string(access)}"
            for path, access in filesystem_access.items()
        ),
        "",
        f'[permissions.{default_permissions}.filesystem.":workspace_roots"]',
        *(
            f"{toml_string(path)} = {toml_string(access)}"
            for path, access in workspace_root_access.items()
        ),
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
    for plugin_name in disabled_plugin_names:
        profile_lines.extend(
            [
                "",
                f"[plugins.{toml_string(plugin_name)}]",
                "enabled = false",
            ],
        )
    for path in disabled_skill_paths:
        profile_lines.extend(
            [
                "",
                "[[skills.config]]",
                f"path = {toml_string(path)}",
                "enabled = false",
            ],
        )
    profile_lines.append(PROFILE_END)
    return root + [""], trust_level, profile_lines


def merge_config(existing_content: str, managed_content: str) -> str:
    managed = tomllib.loads(managed_content)
    managed_plugin_names = require_disabled_plugins(managed)
    managed_skill_paths = require_disabled_skills(managed)
    root_lines, trust_level, profile_lines = render_profile(managed)
    existing_lines, workspace_found = clean_existing_config(
        existing_content,
        trust_level,
        managed_plugin_names,
        managed_skill_paths,
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

    validate_merged_config(merged_content, managed)
    return merged_content


def validate_merged_config(
    merged_content: str,
    managed: dict[str, Any],
) -> None:
    parsed = tomllib.loads(merged_content)
    default_permissions = managed["default_permissions"]
    trust_level = managed["projects"]["/workspace"]["trust_level"]
    managed_plugin_names = require_disabled_plugins(managed)
    if parsed.get("default_permissions") != default_permissions:
        raise ValueError("merged default permission profile is incorrect")
    if parsed["projects"]["/workspace"].get("trust_level") != trust_level:
        raise ValueError("merged workspace trust level is incorrect")
    if (
        parsed["permissions"][default_permissions]["filesystem"]
        != managed["permissions"][default_permissions]["filesystem"]
    ):
        raise ValueError("merged filesystem permissions are incorrect")
    parsed_plugins = parsed.get("plugins", {})
    if not all(
        isinstance(parsed_plugins.get(name), dict)
        and parsed_plugins[name].get("enabled") is False
        for name in managed_plugin_names
    ):
        raise ValueError("merged disabled plugin configuration is incorrect")
    merged_skills_value = parsed.get("skills", {}).get("config", [])
    if not isinstance(merged_skills_value, list):
        raise ValueError("merged skills.config must be an array")
    merged_skills = [
        require_table(entry, f"merged skills.config.{index}")
        for index, entry in enumerate(cast(list[Any], merged_skills_value))
    ]
    for path in require_disabled_skills(managed):
        matching_skills = [
            entry
            for entry in merged_skills
            if entry.get("path") == path
        ]
        if len(matching_skills) != 1 or matching_skills[0].get("enabled") is not False:
            raise ValueError(
                f"merged disabled skill configuration is incorrect for {path}",
            )


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
