#!/usr/bin/env bash
# Test and build locally, then build the image and roll out the stack on the VPS.
#   ./deploy/deploy.sh
#   DEPLOY_HOST=jobz-vps  DOMAIN=data-concepts.srv1294517.hstgr.cloud  (defaults shown)
# The first run creates a basic-auth login on the server and prints the password once.
set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-jobz-vps}"
DOMAIN="${DOMAIN:-data-concepts.srv1294517.hstgr.cloud}"
REMOTE=/opt/data-concepts

cd "$(dirname "$0")/.."
npm ci
npm test
(cd api && uv run pytest -q)
npm run build

TAG="$(git rev-parse --short HEAD)$(git diff --quiet HEAD || echo -dirty)"

ssh "$DEPLOY_HOST" "mkdir -p $REMOTE/build"
rsync -az --delete --exclude .venv --exclude content.db --exclude __pycache__ --exclude .pytest_cache dist deploy api content "$DEPLOY_HOST:$REMOTE/build/"

ssh "$DEPLOY_HOST" bash -s -- "$REMOTE" "$TAG" "$DOMAIN" <<'REMOTE_SCRIPT'
set -euo pipefail
REMOTE="$1" TAG="$2" DOMAIN="$3"
cd "$REMOTE"
if [ ! -f .env ]; then
  pass="$(openssl rand -base64 18)"
  printf "BASIC_AUTH_USERS='paulo:%s'\n" "$(openssl passwd -apr1 "$pass")" > .env
  chmod 600 .env
  echo ">>> Created login  user: paulo  password: $pass  (shown once; hash kept in $REMOTE/.env)"
fi
set -a; . ./.env; set +a
docker build -q -t "data-concepts:$TAG" -f build/deploy/Dockerfile build
docker build -q -t "data-concepts-api:$TAG" -f build/deploy/api.Dockerfile build
IMAGE="data-concepts:$TAG" API_IMAGE="data-concepts-api:$TAG" DOMAIN="$DOMAIN" docker stack deploy -c build/deploy/stack.yml data-concepts
REMOTE_SCRIPT

echo "Deployed data-concepts:$TAG → https://$DOMAIN"
