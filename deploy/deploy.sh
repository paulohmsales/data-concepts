#!/usr/bin/env bash
# Build locally and sync dist/ to the VPS.
#   DEPLOY_HOST=my-vps ./deploy/deploy.sh            (an ssh host or alias)
#   DEPLOY_PATH=/srv/data-concepts                     (optional, default shown)
set -euo pipefail

: "${DEPLOY_HOST:?set DEPLOY_HOST to the VPS ssh host or alias}"
DEPLOY_PATH="${DEPLOY_PATH:-/srv/data-concepts}"

cd "$(dirname "$0")/.."
npm ci
npm test
npm run build

rsync -az --delete dist/ "$DEPLOY_HOST:$DEPLOY_PATH/"
echo "Deployed to $DEPLOY_HOST:$DEPLOY_PATH"
