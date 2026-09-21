#!/usr/bin/env python3
"""Validate Package73 without modifying the Package72 or Package67 sources."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import zipfile
import io


ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parents[1]
PACKAGE72 = PROJECT / "06_Web_App_And_AI_Product" / "72_teacher_readability_hierarchy_20260920_v1"
PACKAGE67 = PROJECT / "06_Web_App_And_AI_Product" / "67_general_source_identity_correction_candidate_local_product_20260914_v1"
DATABASE = PACKAGE67 / "data" / "hkele_general_source_corrected_candidate_local_product_20260914_v1.sqlite"
DATABASE_SHA256 = "A603BB318F0B14CB8AD9195E0F4A2DF9605750F3CECE0F8E064F467B31818472"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def free_port() -> int:
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])


def request(url: str, method: str = "GET", payload: dict | None = None) -> tuple[int, dict, bytes]:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json"} if payload is not None else {}
    req = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(req, timeout=20) as response:
            return response.status, dict(response.headers.items()), response.read()
    except HTTPError as error:
        return error.code, dict(error.headers.items()), error.read()


def wait_for_health(base: str, expected_ready: bool, timeout: float = 20.0) -> dict:
    deadline = time.monotonic() + timeout
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            status, _, body = request(f"{base}/api/v1/health")
            value = json.loads(body)
            if status == 200 and value.get("database_ready") is expected_ready:
                return value
        except (URLError, OSError, json.JSONDecodeError) as error:
            last_error = error
        time.sleep(0.15)
    raise AssertionError(f"server did not become healthy: {last_error}")


def start_server(database: Path, get_rate: int = 1000, post_rate: int = 1000) -> tuple[subprocess.Popen, str]:
    port = free_port()
    command = [
        sys.executable,
        str(ROOT / "server.py"),
        "--host", "127.0.0.1",
        "--port", str(port),
        "--database", str(database),
        "--get-rate-per-minute", str(get_rate),
        "--post-rate-per-minute", str(post_rate),
    ]
    process = subprocess.Popen(
        command,
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    return process, f"http://127.0.0.1:{port}"


def start_server_from_environment(database: Path) -> tuple[subprocess.Popen, str]:
    port = free_port()
    environment = os.environ.copy()
    environment.update({
        "DATABASE_PATH": str(database),
        "HOST": "127.0.0.1",
        "PORT": str(port),
        "PUBLIC_API_GET_RATE_PER_MINUTE": "1000",
        "PUBLIC_API_POST_RATE_PER_MINUTE": "1000",
        "ALLOW_INDEXING": "false",
    })
    process = subprocess.Popen(
        [sys.executable, str(ROOT / "server.py")],
        cwd=ROOT,
        env=environment,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    return process, f"http://127.0.0.1:{port}"


def stop_server(process: subprocess.Popen) -> None:
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)
    if process.returncode not in {0, -15, 1}:
        stdout, stderr = process.communicate()
        raise AssertionError(f"server exited unexpectedly ({process.returncode})\n{stdout}\n{stderr}")


def assert_json(status: int, body: bytes, expected_status: int = 200) -> dict:
    assert status == expected_status, (status, body[:500])
    return json.loads(body)


def validate_static_contract() -> dict:
    app = (ROOT / "frontend" / "app.js").read_text(encoding="utf-8")
    html = (ROOT / "frontend" / "index.html").read_text(encoding="utf-8")
    server = (ROOT / "server.py").read_text(encoding="utf-8")
    blueprint = (ROOT / "render.yaml").read_text(encoding="utf-8")

    assert 'const API = "/api/v1";' in app
    assert "127.0.0.1:18776" not in app
    assert "api_port" not in app
    assert "mode=ro" in (ROOT / "api" / "service.py").read_text(encoding="utf-8")
    assert "PRAGMA query_only=ON" in (ROOT / "api" / "service.py").read_text(encoding="utf-8")
    assert "DATABASE_PATH" in server and 'env_int("PORT"' in server
    assert "STATIC_FILES" in server and "Content-Security-Policy" in server
    assert "healthCheckPath: /api/v1/health" in blueprint
    assert "mountPath: /var/data" in blueprint and "sizeGB: 2" in blueprint
    assert 'content="noindex,nofollow"' in html

    for name in ("styles.css", "tokenizer.js", "contractions.js"):
        assert sha256(ROOT / "frontend" / name) == sha256(PACKAGE72 / "frontend" / name)
    source_app = (PACKAGE72 / "frontend" / "app.js").read_text(encoding="utf-8")
    expected_app = source_app.replace(
        '  const API_PORT = new URLSearchParams(location.search).get("api_port") || "18776";\n'
        '  const API = `http://127.0.0.1:${API_PORT}/api/v1`;\n',
        '  const API = "/api/v1";\n',
        1,
    )
    assert app == expected_app

    bundled_forbidden = [
        path for path in ROOT.rglob("*")
        if path.is_file() and path.suffix.casefold() in {".sqlite", ".db", ".xlsx", ".xls"}
    ]
    assert not bundled_forbidden, bundled_forbidden
    assert sha256(DATABASE) == DATABASE_SHA256
    return {
        "frontend_api_is_same_origin": True,
        "package72_display_assets_preserved": True,
        "database_not_bundled": True,
        "registered_database_hash_verified": True,
        "render_blueprint_present": True,
    }


def validate_runtime() -> dict:
    process, base = start_server(DATABASE)
    try:
        health = wait_for_health(base, True)
        assert health["database_mode"] == "read-only"

        status, headers, body = request(f"{base}/")
        assert status == 200 and b"HK-ELE Teacher Database" in body
        normalized_headers = {key.casefold(): value for key, value in headers.items()}
        assert "default-src 'self'" in normalized_headers["content-security-policy"]
        assert normalized_headers["x-frame-options"] == "DENY"
        assert normalized_headers["x-content-type-options"] == "nosniff"
        assert "noindex" in normalized_headers["x-robots-tag"]
        assert "access-control-allow-origin" not in normalized_headers

        status, _, body = request(f"{base}/api/v1/ready")
        readiness = assert_json(status, body)
        assert readiness["database_ready"] is True

        status, _, body = request(f"{base}/api/v1/families?scope=core&sort=overall&page=1&page_size=10")
        browse = assert_json(status, body)
        assert browse["total_items"] == 3185 and len(browse["families"]) == 10
        assert browse["families"][0]["display_family"] == "the"

        status, _, body = request(f"{base}/api/v1/search?q=happiness")
        search = assert_json(status, body)
        assert search["status"] == "RESOLVED" and search["owners"]
        family_key = search["owners"][0]["baseword_key"]

        status, _, body = request(f"{base}/api/v1/families/{family_key}")
        detail = assert_json(status, body)
        assert detail["family"]["baseword_key"] == family_key and detail["forms"]

        occurrence = {
            "occurrence_id": "qa-1",
            "surface": "happiness",
            "normalized_token": "happiness",
            "start_offset": 0,
            "end_offset": 9,
            "occurrence_order": 1,
            "token_status": "LEXICAL",
            "failure_reason": None,
        }
        status, _, body = request(
            f"{base}/api/v1/occurrences/resolve",
            "POST",
            {"occurrences": [occurrence]},
        )
        checked = assert_json(status, body)
        assert checked["occurrence_count"] == 1 and checked["occurrences"][0]["status"] == "RESOLVED"

        export_payload = {
            "context": "Package73 validation",
            "items": [{
                "teacher_order": 1,
                "word_family": detail["family"]["display_family"],
                "selected_forms": ["happiness"],
                "status": "Candidate",
                "overall_frequency_rank": detail["family"]["overall_frequency_order"],
                "teaching_depth": "Notice",
                "teacher_notes": "QA note",
                "semantic_notes": "QA connection",
            }],
        }
        status, headers, body = request(f"{base}/api/v1/teacher-list.xlsx", "POST", export_payload)
        assert status == 200 and body.startswith(b"PK")
        assert "attachment" in headers.get("Content-Disposition", "")
        with zipfile.ZipFile(io.BytesIO(body)) as archive:
            assert "xl/worksheets/sheet1.xml" in archive.namelist()
            assert b"happiness" in archive.read("xl/worksheets/sheet1.xml")

        oversized_items = [
            {"word_family": f"qa-{index}", "selected_forms": ["x"] * 250}
            for index in range(21)
        ]
        status, _, body = request(
            f"{base}/api/v1/teacher-list.xlsx",
            "POST",
            {"items": oversized_items},
        )
        assert status == 400 and json.loads(body)["error"] == "teaching-list export is too large"

        for path in ("/data/hkele.sqlite", "/hkele.sqlite", "/../api/service.py", "/missing-page"):
            status, _, _ = request(f"{base}{path}")
            assert status == 404, path
        status, _, body = request(f"{base}/api/v1/meta", "PUT", {})
        assert status == 405 and json.loads(body)["error"] == "method not allowed"
        status, _, _ = request(f"{base}/", "POST", {})
        assert status == 405

        frontend_app = (ROOT / "frontend" / "app.js").read_text(encoding="utf-8")
        assert "function exportCsv()" in frontend_app
        assert "function exportMarkdown()" in frontend_app
        assert "async function exportExcel()" in frontend_app
        return {
            "single_origin_frontend_and_api": True,
            "health_and_readiness": True,
            "browse_flow": True,
            "search_and_family_detail_flow": True,
            "check_text_flow": True,
            "teaching_list_xlsx_download": True,
            "oversized_export_blocked": True,
            "client_csv_and_markdown_download_handlers": True,
            "security_headers": True,
            "database_download_blocked": True,
            "write_methods_blocked": True,
            "friendly_error_page": True,
        }
    finally:
        stop_server(process)


def validate_empty_disk_bootstrap() -> dict:
    missing = ROOT / "validation_missing_database.sqlite"
    assert not missing.exists()
    process, base = start_server(missing)
    try:
        health = wait_for_health(base, False)
        assert health["status"] == "ok"
        status, _, body = request(f"{base}/api/v1/ready")
        assert status == 503 and json.loads(body)["database_ready"] is False
        status, _, body = request(f"{base}/api/v1/families?scope=core&sort=overall&page=1&page_size=10")
        assert status == 503 and json.loads(body)["error"] == "database is not ready"
        status, _, body = request(f"{base}/")
        assert status == 200 and b"HK-ELE Teacher Database" in body
        return {"empty_persistent_disk_bootstrap_supported": True}
    finally:
        stop_server(process)


def validate_rate_limit() -> dict:
    process, base = start_server(DATABASE, get_rate=2, post_rate=2)
    try:
        wait_for_health(base, True)
        assert request(f"{base}/api/v1/meta")[0] == 200
        assert request(f"{base}/api/v1/filters")[0] == 200
        status, headers, body = request(f"{base}/api/v1/sources")
        assert status == 429 and "Retry-After" in headers
        assert "Too many requests" in json.loads(body)["error"]
        return {"per_client_rate_limit": True}
    finally:
        stop_server(process)


def validate_environment_configuration() -> dict:
    process, base = start_server_from_environment(DATABASE)
    try:
        health = wait_for_health(base, True)
        assert health["database_mode"] == "read-only"
        assert request(f"{base}/")[0] == 200
        return {
            "render_port_environment_used": True,
            "database_path_environment_used": True,
        }
    finally:
        stop_server(process)


def main() -> int:
    report = {
        "status": "PASS",
        "package": "73_public_teacher_deployment_candidate",
        "validated_at_local_date": time.strftime("%Y-%m-%d"),
        **validate_static_contract(),
        **validate_runtime(),
        **validate_empty_disk_bootstrap(),
        **validate_rate_limit(),
        **validate_environment_configuration(),
        "source_packages_modified": False,
        "public_deployment_performed": False,
    }
    (ROOT / "VALIDATION.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
