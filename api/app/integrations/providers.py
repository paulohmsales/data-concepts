"""Provider adapters: run one SQL statement against a real service and return a uniform result.

Credentials come from a JSON config file per provider (see content/integrations.yaml for the
fields). Everything uses plain HTTPS APIs except Athena, which uses boto3 (imported lazily).
"""

from __future__ import annotations

import base64
import hashlib
import time
from dataclasses import dataclass, field
from typing import Any, Callable

import httpx


class ProviderError(Exception):
    """A failure to show the user (bad SQL, permission denied, limit exceeded)."""


@dataclass
class Result:
    columns: list[str]
    rows: list[list[Any]]
    ms: int = 0
    bytes_scanned: int | None = None
    cost_usd: float | None = None
    query_id: str | None = None
    truncated: bool = False
    stats: dict[str, Any] = field(default_factory=dict)


Runner = Callable[[dict, str, "RunOptions"], Result]


@dataclass
class RunOptions:
    timeout_s: int = 60
    max_rows: int = 500
    dry_run: bool = False


def _clip(rows: list[list[Any]], max_rows: int) -> tuple[list[list[Any]], bool]:
    return (rows[:max_rows], len(rows) > max_rows)


def _jwt(claims: dict, private_key_pem: str, headers: dict | None = None) -> str:
    import jwt  # PyJWT

    return jwt.encode(claims, private_key_pem, algorithm="RS256", headers=headers)


def _http_error(r: httpx.Response) -> ProviderError:
    try:
        body = r.json()
    except ValueError:
        text = r.text.strip()
        if text.startswith("<"):  # an HTML error page: say what it usually means instead of dumping it
            hint = {404: "not found (check the account identifier or host)", 401: "unauthorised (check the key)", 403: "forbidden (check grants)"}
            return ProviderError(f"HTTP {r.status_code}: {hint.get(r.status_code, r.reason_phrase)}")
        return ProviderError(f"HTTP {r.status_code}: {text[:300]}")
    err = body.get("error") if isinstance(body, dict) else None
    msg = (body.get("message") if isinstance(body, dict) else None) or (err.get("message") if isinstance(err, dict) else err)
    return ProviderError(f"HTTP {r.status_code}: {msg or str(body)[:300]}")


# ---------------------------------------------------------------- BigQuery


def run_bigquery(cfg: dict, sql: str, opt: RunOptions) -> Result:
    sa = cfg["service_account"]
    now = int(time.time())
    assertion = _jwt(
        {
            "iss": sa["client_email"],
            "scope": "https://www.googleapis.com/auth/bigquery",
            "aud": "https://oauth2.googleapis.com/token",
            "iat": now,
            "exp": now + 3600,
        },
        sa["private_key"],
        {"kid": sa.get("private_key_id")},
    )
    with httpx.Client(timeout=opt.timeout_s + 10) as http:
        tok = http.post(
            "https://oauth2.googleapis.com/token",
            data={"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": assertion},
        )
        if tok.status_code != 200:
            raise _http_error(tok)
        auth = {"Authorization": f"Bearer {tok.json()['access_token']}"}
        project = cfg.get("project") or sa["project_id"]
        body = {
            "query": sql,
            "useLegacySql": False,
            "maximumBytesBilled": str(int(cfg.get("max_bytes_billed", 1_000_000_000))),
            "timeoutMs": opt.timeout_s * 1000,
            "maxResults": opt.max_rows + 1,
            "dryRun": opt.dry_run,
        }
        if cfg.get("location"):
            body["location"] = cfg["location"]
        t0 = time.monotonic()
        r = http.post(f"https://bigquery.googleapis.com/bigquery/v2/projects/{project}/queries", headers=auth, json=body)
        if r.status_code != 200:
            raise _http_error(r)
        j = r.json()
        job = j.get("jobReference", {})
        while not opt.dry_run and not j.get("jobComplete", False):
            if time.monotonic() - t0 > opt.timeout_s:
                raise ProviderError(f"Timed out after {opt.timeout_s} s")
            r = http.get(
                f"https://bigquery.googleapis.com/bigquery/v2/projects/{project}/queries/{job['jobId']}",
                headers=auth,
                params={"timeoutMs": 10_000, "maxResults": opt.max_rows + 1, "location": job.get("location")},
            )
            if r.status_code != 200:
                raise _http_error(r)
            j = r.json()
        ms = int((time.monotonic() - t0) * 1000)
        processed = int(j.get("totalBytesProcessed", 0) or 0)
        billed = int(j.get("totalBytesBilled", processed) or 0)
        price = float(cfg.get("usd_per_tib", 6.25))
        if opt.dry_run:
            return Result(
                columns=["estimate"],
                rows=[[f"Would process {processed:,} bytes"]],
                ms=ms,
                bytes_scanned=processed,
                cost_usd=max(processed, 10 * 2**20) / 2**40 * price,
                stats={"dry_run": True},
            )
        cols = [f["name"] for f in j.get("schema", {}).get("fields", [])]
        rows = [[c.get("v") for c in row.get("f", [])] for row in j.get("rows", [])]
        rows, more = _clip(rows, opt.max_rows)
        total = int(j.get("totalRows", len(rows)) or 0)
        return Result(
            columns=cols,
            rows=rows,
            ms=ms,
            bytes_scanned=billed,
            cost_usd=billed / 2**40 * price,
            query_id=job.get("jobId"),
            truncated=more or total > len(rows),
            stats={"bytes_processed": processed, "cache_hit": j.get("cacheHit", False), "total_rows": total},
        )


# ---------------------------------------------------------------- Snowflake


def _snowflake_token(cfg: dict) -> str:
    from cryptography.hazmat.primitives import serialization

    key = serialization.load_pem_private_key(cfg["private_key"].encode(), password=(cfg.get("private_key_passphrase") or "").encode() or None)
    pub = key.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    fp = "SHA256:" + base64.b64encode(hashlib.sha256(pub).digest()).decode()
    account = cfg["account"].split(".")[0].upper()
    user = cfg["user"].upper()
    pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
    now = int(time.time())
    return _jwt({"iss": f"{account}.{user}.{fp}", "sub": f"{account}.{user}", "iat": now, "exp": now + 3600}, pem)


def run_snowflake(cfg: dict, sql: str, opt: RunOptions) -> Result:
    base = f"https://{cfg['account']}.snowflakecomputing.com/api/v2/statements"
    headers = {
        "Authorization": f"Bearer {_snowflake_token(cfg)}",
        "X-Snowflake-Authorization-Token-Type": "KEYPAIR_JWT",
        "Accept": "application/json",
        "User-Agent": "data-concepts-lab/1.0",
    }
    body: dict[str, Any] = {"statement": sql, "timeout": opt.timeout_s, "parameters": {"QUERY_TAG": "data-concepts-lab"}}
    for k in ("warehouse", "role", "database", "schema"):
        if cfg.get(k):
            body[k] = cfg[k]
    t0 = time.monotonic()
    with httpx.Client(timeout=opt.timeout_s + 10) as http:
        r = http.post(base, headers=headers, json=body)
        while r.status_code == 202:
            if time.monotonic() - t0 > opt.timeout_s:
                raise ProviderError(f"Timed out after {opt.timeout_s} s")
            time.sleep(0.5)
            r = http.get(f"{base}/{r.json()['statementHandle']}", headers=headers)
        if r.status_code != 200:
            raise _http_error(r)
        j = r.json()
        ms = int((time.monotonic() - t0) * 1000)
        meta = j.get("resultSetMetaData", {})
        cols = [c["name"] for c in meta.get("rowType", [])]
        rows, more = _clip(j.get("data", []) or [], opt.max_rows)
        handle = j.get("statementHandle")
        stats: dict[str, Any] = {"total_rows": meta.get("numRows")}
        scanned = None
        # best effort: pruning stats from query history (needs no extra privileges for your own queries)
        if handle:
            try:
                h = http.post(
                    base,
                    headers=headers,
                    json={
                        **{k: v for k, v in body.items() if k != "statement"},
                        "statement": "select bytes_scanned, partitions_scanned, partitions_total, percentage_scanned_from_cache, "
                        "execution_time from table(information_schema.query_history_by_user(result_limit => 50)) "
                        f"where query_id = '{handle}'",
                    },
                )
                if h.status_code == 200 and h.json().get("data"):
                    b, ps, pt, cache, exe = h.json()["data"][0]
                    scanned = int(b) if b is not None else None
                    stats.update(partitions_scanned=ps, partitions_total=pt, from_cache=cache, execution_ms=exe)
            except (httpx.HTTPError, ValueError, KeyError):
                pass
        return Result(columns=cols, rows=rows, ms=ms, bytes_scanned=scanned, query_id=handle, truncated=more, stats=stats)


# ---------------------------------------------------------------- Databricks


def _databricks_token(cfg: dict, host: str) -> str:
    """A personal access token, or an OAuth machine-to-machine token for a service principal."""
    if cfg.get("token"):
        return cfg["token"]
    if not (cfg.get("client_id") and cfg.get("client_secret")):
        raise ProviderError("databricks config needs either token or client_id + client_secret")
    r = httpx.post(
        f"{host}/oidc/v1/token",
        auth=(cfg["client_id"], cfg["client_secret"]),
        data={"grant_type": "client_credentials", "scope": "all-apis"},
        timeout=20,
    )
    if r.status_code != 200:
        raise _http_error(r)
    return r.json()["access_token"]


def run_databricks(cfg: dict, sql: str, opt: RunOptions) -> Result:
    host = cfg["host"].rstrip("/")
    if not host.startswith("http"):
        host = "https://" + host
    headers = {"Authorization": f"Bearer {_databricks_token(cfg, host)}"}
    body: dict[str, Any] = {
        "statement": sql,
        "warehouse_id": cfg["warehouse_id"],
        "wait_timeout": "30s",
        "on_wait_timeout": "CONTINUE",
        "format": "JSON_ARRAY",
        "disposition": "INLINE",
        "row_limit": opt.max_rows + 1,
    }
    for k in ("catalog", "schema"):
        if cfg.get(k):
            body[k] = cfg[k]
    t0 = time.monotonic()
    with httpx.Client(timeout=opt.timeout_s + 40) as http:
        r = http.post(f"{host}/api/2.0/sql/statements", headers=headers, json=body)
        if r.status_code != 200:
            raise _http_error(r)
        j = r.json()
        sid = j.get("statement_id")
        while j.get("status", {}).get("state") in ("PENDING", "RUNNING"):
            if time.monotonic() - t0 > opt.timeout_s:
                http.post(f"{host}/api/2.0/sql/statements/{sid}/cancel", headers=headers)
                raise ProviderError(f"Timed out after {opt.timeout_s} s (cancelled)")
            time.sleep(1)
            r = http.get(f"{host}/api/2.0/sql/statements/{sid}", headers=headers)
            if r.status_code != 200:
                raise _http_error(r)
            j = r.json()
        state = j.get("status", {})
        if state.get("state") != "SUCCEEDED":
            raise ProviderError(state.get("error", {}).get("message") or f"Statement {state.get('state')}")
        ms = int((time.monotonic() - t0) * 1000)
        cols = [c["name"] for c in j.get("manifest", {}).get("schema", {}).get("columns", [])]
        rows, more = _clip(j.get("result", {}).get("data_array", []) or [], opt.max_rows)
        return Result(columns=cols, rows=rows, ms=ms, query_id=sid, truncated=more or bool(j.get("manifest", {}).get("truncated")), stats={"total_rows": j.get("manifest", {}).get("total_row_count")})


# ---------------------------------------------------------------- Athena


def run_athena(cfg: dict, sql: str, opt: RunOptions) -> Result:
    import boto3  # heavy; only loaded when Athena is used
    from botocore.exceptions import BotoCoreError, ClientError

    client = boto3.client(
        "athena",
        region_name=cfg.get("region", "us-east-1"),
        aws_access_key_id=cfg["access_key_id"],
        aws_secret_access_key=cfg["secret_access_key"],
    )
    t0 = time.monotonic()
    try:
        params: dict[str, Any] = {"QueryString": sql, "WorkGroup": cfg.get("workgroup", "primary")}
        if cfg.get("database"):
            params["QueryExecutionContext"] = {"Database": cfg["database"]}
        qid = client.start_query_execution(**params)["QueryExecutionId"]
        while True:
            ex = client.get_query_execution(QueryExecutionId=qid)["QueryExecution"]
            state = ex["Status"]["State"]
            if state in ("SUCCEEDED", "FAILED", "CANCELLED"):
                break
            if time.monotonic() - t0 > opt.timeout_s:
                client.stop_query_execution(QueryExecutionId=qid)
                raise ProviderError(f"Timed out after {opt.timeout_s} s (cancelled)")
            time.sleep(0.7)
        st = ex.get("Statistics", {})
        scanned = int(st.get("DataScannedInBytes", 0))
        cost = max(scanned, 10 * 2**20) / 2**40 * float(cfg.get("usd_per_tib", 5)) if scanned else 0.0
        if state != "SUCCEEDED":
            reason = ex["Status"].get("StateChangeReason", state)
            raise ProviderError(f"{reason} (scanned {scanned:,} bytes)")
        page = client.get_query_results(QueryExecutionId=qid, MaxResults=min(1000, opt.max_rows + 2))
    except (BotoCoreError, ClientError) as e:
        raise ProviderError(str(e)) from e
    meta = page["ResultSet"]["ResultSetMetadata"]["ColumnInfo"]
    cols = [c["Name"] for c in meta]
    raw = [[d.get("VarCharValue") for d in r["Data"]] for r in page["ResultSet"]["Rows"]]
    if raw and raw[0] == cols:  # SELECT results repeat the header as the first row
        raw = raw[1:]
    rows, more = _clip(raw, opt.max_rows)
    return Result(
        columns=cols,
        rows=rows,
        ms=int((time.monotonic() - t0) * 1000),
        bytes_scanned=scanned,
        cost_usd=cost,
        query_id=qid,
        truncated=more or "NextToken" in page,
        stats={"engine_ms": st.get("EngineExecutionTimeInMillis"), "queue_ms": st.get("QueryQueueTimeInMillis")},
    )


RUNNERS: dict[str, Runner] = {
    "bigquery": run_bigquery,
    "snowflake": run_snowflake,
    "databricks": run_databricks,
    "athena": run_athena,
}

REQUIRED: dict[str, list[str]] = {
    "bigquery": ["service_account"],
    "snowflake": ["account", "user", "private_key", "warehouse"],
    "databricks": ["host", "warehouse_id"],
    "athena": ["access_key_id", "secret_access_key", "region", "workgroup"],
}
