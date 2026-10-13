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

# Clean slate for the runtime keys: any shell value, even an empty one,
# would otherwise win over the file in serverless-dotenv-plugin.
unset APP_DEBUG SHORT_URL_DOMAIN BYPASS_URL_EXISTS_DOMAINS

set -a
# shellcheck disable=SC1090
. "$file"
set +a

exec "$@"
