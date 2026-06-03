#!/bin/sh
set -e

ENV_FILE="$(dirname "$0")/../.dev.vars"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: .dev.vars not found at $ENV_FILE"
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

if [ -z "$NOTIFY_SECRET" ]; then
  echo "Error: NOTIFY_SECRET is not set in .dev.vars"
  exit 1
fi

URL="${NOTIFY_URL:-http://localhost:8787}/api/notify"
echo "Sending test notification to $URL ..."

curl -sL -X POST "$URL" \
  -H "Authorization: Bearer $NOTIFY_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}' | cat

echo
