#!/usr/bin/env python3
"""Single-origin web and read-only API server for the HK-ELE deployment candidate."""

from __future__ import annotations

import argparse
from collections import defaultdict, deque
import json
import mimetypes
import os
from pathlib import Path
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

from api.service import API_VERSION, PAGE_SIZES, SCOPES, SORTS, Service
from api.teacher_export import teacher_list_xlsx


ROOT = Path(__file__).resolve().parent
FRONTEND = ROOT / "frontend"
DEFAULT_DATABASE = Path("/var/data/hkele.sqlite")
MAX_REQUEST_TARGET = 4096
MAX_REQUEST_BODY = 2_000_000
MAX_SEARCH_LENGTH = 200
MAX_FAMILY_KEY_LENGTH = 512
MAX_EXPORT_ROWS = 5_000
STATIC_FILES = {
    "/": "index.html",
    "/index.html": "index.html",
    "/app.js": "app.js",
    "/styles.css": "styles.css",
    "/tokenizer.js": "tokenizer.js",
    "/contractions.js": "contractions.js",
}


def env_int(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError as error:
        raise SystemExit(f"{name} must be an integer") from error
    if not minimum <= value <= maximum:
        raise SystemExit(f"{name} must be between {minimum} and {maximum}")
    return value


def env_flag(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().casefold() in {"1", "true", "yes", "on"}


def validate_export_size(payload: dict) -> None:
    items = payload.get("items")
    if not isinstance(items, list):
        raise ValueError("items must be a list")
    rows = 0
    for item in items:
        if not isinstance(item, dict):
            raise ValueError("every item must be an object")
        forms = item.get("selected_forms") or [""]
        if not isinstance(forms, list):
            raise ValueError("selected_forms must be a list")
        rows += len(forms)
        if rows > MAX_EXPORT_ROWS:
            raise ValueError("teaching-list export is too large")


class SlidingWindowRateLimiter:
    """Small in-process per-client limiter suitable for a single Render instance."""

    def __init__(self, limit: int, window_seconds: int = 60):
        self.limit = limit
        self.window_seconds = window_seconds
        self.events: dict[str, deque[float]] = defaultdict(deque)
        self.lock = threading.Lock()
        self.last_cleanup = 0.0

    def allow(self, key: str) -> tuple[bool, int]:
        now = time.monotonic()
        cutoff = now - self.window_seconds
        with self.lock:
            queue = self.events[key]
            while queue and queue[0] <= cutoff:
                queue.popleft()
            if len(queue) >= self.limit:
                retry_after = max(1, int(self.window_seconds - (now - queue[0])) + 1)
                return False, retry_after
            queue.append(now)
            if now - self.last_cleanup > self.window_seconds:
                stale = [client for client, values in self.events.items() if not values or values[-1] <= cutoff]
                for client in stale:
                    self.events.pop(client, None)
                self.last_cleanup = now
        return True, 0


class DatabaseNotReady(RuntimeError):
    """Raised while the deployment disk has not yet received the database."""


class ServiceProvider:
    """Open the external database lazily so a new persistent disk can be populated after deploy."""

    def __init__(self, database: Path):
        self.database = database.resolve()
        self._service: Service | None = None
        self.lock = threading.Lock()

    def get(self) -> Service:
        if self._service is not None:
            return self._service
        with self.lock:
            if self._service is None:
                try:
                    service = Service(self.database)
                    service.health()
                except Exception as error:
                    raise DatabaseNotReady("database is not ready") from error
                self._service = service
        return self._service

    def status(self) -> dict:
        try:
            service = self.get()
            health = service.health()
            health["database_ready"] = True
            return health
        except Exception:
            return {
                "status": "ok",
                "api_version": API_VERSION,
                "database_mode": "read-only",
                "database_ready": False,
            }


class DeploymentServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 64

    def get_request(self):
        request, address = super().get_request()
        request.settimeout(30)
        return request, address


def handler_factory(
    provider: ServiceProvider,
    get_limiter: SlidingWindowRateLimiter,
    post_limiter: SlidingWindowRateLimiter,
    allow_indexing: bool,
):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"
        server_version = "HK-ELE"
        sys_version = ""

        def _client_key(self) -> str:
            forwarded = self.headers.get("X-Forwarded-For", "").split(",", 1)[0].strip()
            return forwarded or self.client_address[0]

        def _security_headers(self) -> None:
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
            self.send_header("Cross-Origin-Opener-Policy", "same-origin")
            self.send_header("Cross-Origin-Resource-Policy", "same-origin")
            self.send_header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
            self.send_header(
                "Content-Security-Policy",
                "default-src 'self'; connect-src 'self'; img-src 'self' data:; "
                "style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; "
                "frame-ancestors 'none'; form-action 'self'",
            )
            if not allow_indexing:
                self.send_header("X-Robots-Tag", "noindex, nofollow")

        def _send_bytes(
            self,
            status: int,
            content_type: str,
            body: bytes = b"",
            *,
            cache_control: str = "no-store",
            extra_headers: dict[str, str] | None = None,
        ) -> None:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", cache_control)
            self._security_headers()
            for name, value in (extra_headers or {}).items():
                self.send_header(name, value)
            self.end_headers()
            if not getattr(self, "_head_only", False) and body:
                self.wfile.write(body)

        def _json(self, value: dict, status: int = 200, extra_headers: dict[str, str] | None = None) -> None:
            body = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            self._send_bytes(status, "application/json; charset=utf-8", body, extra_headers=extra_headers)

        def _error_page(self, status: int, title: str, message: str) -> None:
            body = (
                "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">"
                "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
                f"<title>{status} {title}</title><link rel=\"stylesheet\" href=\"/styles.css?v=73\"></head>"
                "<body><main><section class=\"page-heading\"><p class=\"eyebrow\">HK-ELE Teacher Database</p>"
                f"<h1>{title}</h1><p>{message}</p><p><a href=\"/\">Return to the database</a></p>"
                "</section></main></body></html>"
            ).encode("utf-8")
            self._send_bytes(status, "text/html; charset=utf-8", body)

        def _payload(self) -> dict:
            transfer_encoding = self.headers.get("Transfer-Encoding")
            if transfer_encoding:
                raise ValueError("transfer encoding is not supported")
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError as error:
                raise ValueError("invalid content length") from error
            if length < 0 or length > MAX_REQUEST_BODY:
                raise ValueError("request body is too large")
            value = json.loads(self.rfile.read(length) or b"{}")
            if not isinstance(value, dict):
                raise ValueError("request body must be an object")
            return value

        def _rate_limit(self, limiter: SlidingWindowRateLimiter) -> bool:
            allowed, retry_after = limiter.allow(self._client_key())
            if allowed:
                return True
            self._json(
                {"error": "Too many requests. Please wait briefly and try again."},
                429,
                {"Retry-After": str(retry_after)},
            )
            return False

        def _static(self, path: str) -> None:
            filename = STATIC_FILES.get(path)
            if filename is None:
                self._error_page(404, "Page not found", "The requested page is not available.")
                return
            file_path = FRONTEND / filename
            content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
            if content_type.startswith("text/") or content_type in {"application/javascript", "text/javascript"}:
                content_type += "; charset=utf-8"
            cache = "no-cache" if filename == "index.html" else "public, max-age=3600"
            self._send_bytes(200, content_type, file_path.read_bytes(), cache_control=cache)

        def _api_get(self, parsed) -> None:
            if parsed.path == "/api/v1/health":
                self._json(provider.status())
                return
            if parsed.path == "/api/v1/ready":
                status = provider.status()
                self._json(status, 200 if status["database_ready"] else 503)
                return
            if not self._rate_limit(get_limiter):
                return
            service = provider.get()
            query = parse_qs(parsed.query, keep_blank_values=True, max_num_fields=20)
            if parsed.path == "/api/v1/meta":
                self._json(service.meta())
            elif parsed.path == "/api/v1/sources":
                self._json(service.sources())
            elif parsed.path == "/api/v1/filters":
                self._json(service.filters())
            elif parsed.path == "/api/v1/families":
                scope = query.get("scope", ["core"])[0]
                sort = query.get("sort", ["overall"])[0]
                page = int(query.get("page", ["1"])[0])
                page_size = int(query.get("page_size", ["25"])[0])
                if scope not in SCOPES or sort not in SORTS or page_size not in PAGE_SIZES:
                    raise ValueError("unsupported scope, sort, or page size")
                if not 1 <= page <= 100_000:
                    raise ValueError("page is outside the supported range")
                self._json(service.families(scope, sort, page, page_size))
            elif parsed.path == "/api/v1/search":
                submitted = query.get("q", [""])[0]
                if len(submitted) > MAX_SEARCH_LENGTH:
                    raise ValueError("search query is too long")
                self._json(service.search(submitted))
            elif parsed.path.startswith("/api/v1/families/"):
                key = unquote(parsed.path.removeprefix("/api/v1/families/"))
                if len(key) > MAX_FAMILY_KEY_LENGTH:
                    raise ValueError("family key is too long")
                value = service.family(key)
                self._json(value if value else {"error": "family not available"}, 200 if value else 404)
            else:
                self._json({"error": "not found"}, 404)

        def do_GET(self) -> None:
            try:
                if len(self.path) > MAX_REQUEST_TARGET:
                    self._json({"error": "request target is too long"}, 414)
                    return
                parsed = urlparse(self.path)
                if parsed.path.startswith("/api/"):
                    self._api_get(parsed)
                elif parsed.path == "/robots.txt":
                    rule = "User-agent: *\nAllow: /\n" if allow_indexing else "User-agent: *\nDisallow: /\n"
                    self._send_bytes(200, "text/plain; charset=utf-8", rule.encode("utf-8"), cache_control="public, max-age=3600")
                elif parsed.path == "/favicon.ico":
                    self._send_bytes(204, "image/x-icon")
                else:
                    self._static(parsed.path)
            except DatabaseNotReady:
                self._json({"error": "database is not ready"}, 503, {"Retry-After": "30"})
            except (ValueError, json.JSONDecodeError) as error:
                if self.path.startswith("/api/"):
                    self._json({"error": str(error)}, 400)
                else:
                    self._error_page(400, "Invalid request", "The request could not be processed.")
            except (BrokenPipeError, ConnectionResetError):
                return
            except Exception:
                if self.path.startswith("/api/"):
                    self._json({"error": "internal request failure"}, 500)
                else:
                    self._error_page(500, "Service problem", "Please try again in a moment.")

        def do_HEAD(self) -> None:
            self._head_only = True
            self.do_GET()

        def do_POST(self) -> None:
            try:
                if len(self.path) > MAX_REQUEST_TARGET:
                    self._json({"error": "request target is too long"}, 414)
                    return
                parsed = urlparse(self.path)
                if not parsed.path.startswith("/api/"):
                    self._json({"error": "method not allowed"}, 405, {"Allow": "GET, HEAD"})
                    return
                if not self._rate_limit(post_limiter):
                    return
                service = provider.get()
                if parsed.path in {"/api/v1/occurrences/resolve", "/api/v1/resolve-text"}:
                    self._json(service.resolve_occurrences(self._payload()))
                elif parsed.path == "/api/v1/teacher-list.xlsx":
                    payload = self._payload()
                    validate_export_size(payload)
                    data = teacher_list_xlsx(payload)
                    self._send_bytes(
                        200,
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        data,
                        extra_headers={"Content-Disposition": 'attachment; filename="HK-ELE_Teaching_List.xlsx"'},
                    )
                else:
                    self._json({"error": "method not allowed"}, 405, {"Allow": "GET, HEAD"})
            except DatabaseNotReady:
                self._json({"error": "database is not ready"}, 503, {"Retry-After": "30"})
            except (ValueError, json.JSONDecodeError) as error:
                self._json({"error": str(error)}, 400)
            except (BrokenPipeError, ConnectionResetError):
                return
            except Exception:
                self._json({"error": "internal request failure"}, 500)

        def _reject_write_method(self) -> None:
            self._json({"error": "method not allowed"}, 405, {"Allow": "GET, HEAD, POST"})

        do_PUT = _reject_write_method
        do_PATCH = _reject_write_method
        do_DELETE = _reject_write_method

        def do_OPTIONS(self) -> None:
            self._send_bytes(204, "text/plain; charset=utf-8", extra_headers={"Allow": "GET, HEAD, POST, OPTIONS"})

        def log_message(self, format, *args) -> None:
            # Do not log teacher-entered search terms or text payloads.
            return

    return Handler


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve the HK-ELE teacher website and read-only API on one origin.")
    parser.add_argument("--database", type=Path, default=Path(os.environ.get("DATABASE_PATH", DEFAULT_DATABASE)))
    parser.add_argument("--host", default=os.environ.get("HOST", "0.0.0.0"))
    parser.add_argument("--port", type=int, default=env_int("PORT", 10000, 1, 65535))
    parser.add_argument(
        "--get-rate-per-minute",
        type=int,
        default=env_int("PUBLIC_API_GET_RATE_PER_MINUTE", 300, 10, 10_000),
    )
    parser.add_argument(
        "--post-rate-per-minute",
        type=int,
        default=env_int("PUBLIC_API_POST_RATE_PER_MINUTE", 60, 5, 1_000),
    )
    parser.add_argument("--allow-indexing", action="store_true", default=env_flag("ALLOW_INDEXING"))
    args = parser.parse_args()

    provider = ServiceProvider(args.database)
    handler = handler_factory(
        provider,
        SlidingWindowRateLimiter(args.get_rate_per_minute),
        SlidingWindowRateLimiter(args.post_rate_per_minute),
        args.allow_indexing,
    )
    server = DeploymentServer((args.host, args.port), handler)
    print(
        f"HK-ELE deployment candidate listening on {args.host}:{args.port}; "
        f"database={provider.database.name}; mode=read-only",
        flush=True,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
