#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source_script="${script_dir}/templates/storage-report.sh"
destination='/usr/local/bin/storage-report'

bash -n "${source_script}"

installer=(install -o root -g root -m 0755)
if [ "${EUID}" -ne 0 ]; then
  installer=(sudo "${installer[@]}")
fi
"${installer[@]}" -- "${source_script}" "${destination}"

printf 'Installed %s. Run storage-report for diagnostics and cleanup suggestions.\n' \
  "${destination}"
