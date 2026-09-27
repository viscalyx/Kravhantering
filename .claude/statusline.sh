#!/usr/bin/env bash
# Claude Code status line:
# Opus 5.5 (high) · fast · ctx 70k/1M · 5h/7d 23%/3% · /workspace (fix/issue-121) → PR #152

input=$(cat)

# Show reset times in Swedish local time
export TZ=Europe/Stockholm

dim=$'\e[2m'
reset=$'\e[0m'
cyan=$'\e[36m'
magenta=$'\e[35m'
green=$'\e[32m'
red=$'\e[31m'
amber=$'\e[38;5;214m'
grey=$'\e[90m'
sep="${dim} · ${reset}"

fields=(model effort fast_mode ctx_used ctx_size five_h five_h_reset seven_d seven_d_reset project_dir current_dir wt_branch pr_number)
IFS=$'\t' read -r "${fields[@]}" <<<"$(
  jq -r '
    def num: if . == null then "" else (. | round | tostring) end;
    def epoch: if . == null then "" else (. | floor | tostring) end;
    [
      (.model.display_name // .model.id // ""),
      (.effort.level // ""),
      (if .fast_mode == true then "on" else "" end),
      (.context_window.total_input_tokens // "" | tostring),
      (.context_window.context_window_size // "" | tostring),
      (.rate_limits.five_hour.used_percentage | num),
      (.rate_limits.five_hour.resets_at | epoch),
      (.rate_limits.seven_day.used_percentage | num),
      (.rate_limits.seven_day.resets_at | epoch),
      (.workspace.project_dir // .cwd // ""),
      (.workspace.current_dir // .cwd // ""),
      (.worktree.branch // ""),
      (.pr.number // "" | tostring)
    ] | map(if . == "" then "-" else . end) | @tsv
  ' <<<"$input"
)"

# read collapses empty tab-separated fields, so jq emits "-" for missing values.
for var in "${fields[@]}"; do
  [[ ${!var} == "-" ]] && printf -v "$var" '%s' ""
done

# 70000 -> 70k, 1000000 -> 1M
human() {
  local n=$1
  [[ -z $n ]] && return
  if ((n >= 1000000)); then
    awk -v n="$n" 'BEGIN { v = n / 1000000; printf (v == int(v) ? "%dM" : "%.1fM"), v }'
  elif ((n >= 1000)); then
    printf '%dk' $(((n + 500) / 1000))
  else
    printf '%d' "$n"
  fi
}

segments=()

# Model and effort
if [[ -n $model ]]; then
  segment="$model"
  [[ -n $effort ]] && segment+=" ${dim}(${effort})${reset}"
  segments+=("$segment")
fi

# Fast mode, only when on
[[ -n $fast_mode ]] && segments+=("${red}fast${reset}")

# Context window: green below 250k tokens, amber from 250k
if [[ -n $ctx_size ]]; then
  ctx_used=${ctx_used:-0}
  if ((ctx_used >= 250000)); then colour=$amber; else colour=$green; fi
  segments+=("ctx ${colour}$(human "$ctx_used")${reset}${grey}/$(human "$ctx_size")${reset}")
fi

# Usage limits
if [[ -n $five_h || -n $seven_d ]]; then
  segment="5h/7d ${five_h:-–}%/${seven_d:-–}%"
  # Reset times only appear when a limit is nearly used up: 5-hour from 85% in red, weekly from 95% in amber.
  resets=()
  if [[ -n $five_h && -n $five_h_reset ]] && ((five_h >= 85)); then
    resets+=("${red}5h resets $(date -d "@$five_h_reset" '+%H:%M')${reset}")
  fi
  if [[ -n $seven_d && -n $seven_d_reset ]] && ((seven_d >= 95)); then
    resets+=("${amber}7d resets $(date -d "@$seven_d_reset" '+%a %-d %b %H:%M')${reset}")
  fi
  if ((${#resets[@]} == 1)); then
    segment+=" (${resets[0]})"
  elif ((${#resets[@]} == 2)); then
    segment+=" (${resets[0]}, ${resets[1]})"
  fi
  segments+=("$segment")
fi

# Project, current directory, branch and PR
if [[ -n $project_dir ]]; then
  segment="${cyan}${project_dir}${reset}"

  # The current directory differs from the project directory after entering a
  # worktree or changing into a subfolder.
  if [[ -n $current_dir && $current_dir != "$project_dir" ]]; then
    segment+=" ${dim}›${reset} ${magenta}${current_dir}${reset}"
  fi

  branch=$wt_branch
  if [[ -z $branch ]]; then
    branch=$(git -C "${current_dir:-$project_dir}" --no-optional-locks branch --show-current 2>/dev/null)
  fi
  [[ -n $branch ]] && segment+=" (${branch})"

  [[ -n $pr_number ]] && segment+=" ${dim}→${reset} ${green}PR #${pr_number}${reset}"
  segments+=("$segment")
fi

line=""
for segment in "${segments[@]}"; do
  [[ -n $line ]] && line+=$sep
  line+=$segment
done
printf '%s' "$line"
