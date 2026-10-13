#!/usr/bin/env sh
# Run a command with a stage env file exported, the way lesgo-scripts does:
# config/environments/.env.<stage>.local when it exists, else .env.<stage>.
#
#   scripts/withStageEnv.sh <stage> <command...>
#   scripts/withStageEnv.sh prod npx osls package --stage prod
set -eu

if [ "$#" -lt 2 ]; then
  echo "usage: $0 <stage> <command...>" >&2
  exit 64
fi

stage="$1"
shift

dir="$(cd "$(dirname "$0")/.." && pwd)/config/environments"
file="$dir/.env.$stage.local"
[ -f "$file" ] || file="$dir/.env.$stage"

if [ ! -f "$file" ]; then
  echo "missing $dir/.env.$stage (or .env.$stage.local)" >&2
  exit 66
fi

set -a
# shellcheck disable=SC1090
. "$file"
set +a

exec "$@"
