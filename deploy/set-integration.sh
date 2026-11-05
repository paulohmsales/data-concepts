#!/usr/bin/env bash
# Put an integration's credentials on the server and check them.
#
#   ./deploy/set-integration.sh bigquery  ~/Downloads/key.json        # the service-account key as downloaded
#   ./deploy/set-integration.sh snowflake snowflake.json rsa_key.p8   # config + private key
#   ./deploy/set-integration.sh athena    athena.json
#   ./deploy/set-integration.sh databricks databricks.json
#   ./deploy/set-integration.sh athena --remove
#
# The file goes to /opt/data-concepts/secrets/<provider>.json on the server (root only, mode 600),
# which the API container mounts read-only. Nothing is written to the repository.
set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-jobz-vps}"
DIR=/opt/data-concepts/secrets
provider="${1:-}"
case "$provider" in bigquery|snowflake|athena|databricks) ;; *)
  echo "usage: $0 bigquery|snowflake|athena|databricks <config.json> [private-key.p8] | --remove" >&2; exit 2 ;;
esac

if [ "${2:-}" = "--remove" ]; then
  ssh "$DEPLOY_HOST" "rm -f $DIR/$provider.json"
  echo "Removed $provider."
  exit 0
fi

config="${2:?config file required}"
key="${3:-}"
[ -f "$config" ] || { echo "no such file: $config" >&2; exit 1; }

# Build the final JSON locally (stdin → stdout, nothing written to disk).
json="$(python3 - "$provider" "$config" "$key" <<'PY'
import json, sys
provider, config, key = sys.argv[1], sys.argv[2], sys.argv[3]
data = json.load(open(config))
if provider == "bigquery" and data.get("type") == "service_account":
    data = {"service_account": data, "location": "US", "max_bytes_billed": 1_000_000_000}
if provider == "snowflake" and key:
    data["private_key"] = open(key).read()
required = {
    "bigquery": ["service_account"],
    "snowflake": ["account", "user", "private_key", "warehouse"],
    "athena": ["access_key_id", "secret_access_key", "region", "workgroup"],
    "databricks": ["host", "warehouse_id"],
}[provider]
missing = [k for k in required if not data.get(k) or str(data.get(k)).startswith("←")]
if provider == "databricks" and not (data.get("token") or (data.get("client_id") and data.get("client_secret"))):
    missing.append("token (or client_id + client_secret)")
if missing:
    sys.exit(f"missing fields: {', '.join(missing)}")
print(json.dumps(data))
PY
)"

printf '%s' "$json" | ssh "$DEPLOY_HOST" "umask 077 && mkdir -p $DIR && chmod 700 $DIR && cat > $DIR/$provider.json && chmod 600 $DIR/$provider.json"
echo "Saved $provider credentials on $DEPLOY_HOST:$DIR/$provider.json"

# Check from inside the API container: is it configured, and does a trivial query work?
probe='select 1 as ok'
[ "$provider" = "snowflake" ] && probe='select current_version() as version, current_role() as role'
ssh "$DEPLOY_HOST" "docker exec \$(docker ps -q -f name=data-concepts_api | head -1) python -c '
import json, sys, urllib.request
base = \"http://127.0.0.1:8000/api/integrations\"
s = json.load(urllib.request.urlopen(base + \"/status\"))[\"$provider\"]
print(\"status:\", \"configured\" if s[\"configured\"] else s[\"problem\"])
if not s[\"configured\"]: sys.exit(1)
req = urllib.request.Request(base + \"/$provider/run\", data=json.dumps({\"sql\": \"$probe\"}).encode(),
                             headers={\"Content-Type\": \"application/json\"})
try:
    r = json.load(urllib.request.urlopen(req, timeout=120))
    print(\"test query ok:\", r[\"columns\"], r[\"rows\"][:1], f\"{r[\"ms\"]} ms\")
except urllib.error.HTTPError as e:
    print(\"test query failed:\", e.read().decode()[:500]); sys.exit(1)
'"
