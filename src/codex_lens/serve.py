"""Codex Lens local browser preview."""

import asyncio
import json
import threading
import time
import sqlite3
from collections import defaultdict
from datetime import datetime, timezone
from functools import partial
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from . import __version__
from .cache import DEFAULT_BREAKS, PERIODS, observatory
from .calibration import calibrate
from .pricing import CATALOG, CREDIT_RATES, Pricing, load_overrides
from .quota import quota_cycles
from .telemetry import Rollouts, account_ref, analytics, bounds, day_detail, range_rows, session_response

WEB = Path(__file__).resolve().parent / "web"
CARDS = ["live-context", "cache-diagnostics", "quota-budget", "io-flow", "model-cost", "calendar-trends", "cache-observatory"]
HTML = "text/html; charset=utf-8"
FILES = {
    "/": ("index.html", HTML), "/styles.css": ("styles.css", "text/css"),
    "/app.js": ("app.js", "text/javascript"), "/logo.svg": ("logo.svg", "image/svg+xml"),
    "/preload.js": ("preload.js", "text/javascript"),
    "/analytics.js": ("analytics.js", "text/javascript"),
}


async def read_quota(socket_path, known_account=None):
    from websockets.asyncio.client import unix_connect

    async with unix_connect(socket_path, uri="ws://localhost/rpc", open_timeout=5, close_timeout=1) as rpc:
        async def request(number, method, params=None):
            message = {"id": number, "method": method}
            if params is not None:
                message["params"] = params
            await rpc.send(json.dumps(message))
            while True:
                reply = json.loads(await rpc.recv())
                if reply.get("id") == number and ("error" in reply or "result" in reply):
                    if "error" in reply:
                        raise RuntimeError(method)
                    return reply["result"]

        async with asyncio.timeout(20):
            await request(1, "initialize", {"clientInfo": {"name": "codex-lens", "version": __version__}})
            await rpc.send(json.dumps({"method": "initialized", "params": {}}))
            account = (await request(2, "account/read", {"refreshToken": False})).get("account") or {}
            if account.get("type") not in ("chatgpt", "chatgptAuthTokens"):
                raise RuntimeError("ChatGPT sign-in is unavailable")
            result = await request(3, "account/rateLimits/read")
            try:
                async with asyncio.timeout(4):
                    activity = await request(4, "account/usage/read")
            except (RuntimeError, TimeoutError):
                activity = None
    buckets = result.get("rateLimitsByLimitId") or {"codex": result["rateLimits"]}
    windows = []
    for key, bucket in buckets.items():
        for name in ("primary", "secondary"):
            if window := bucket.get(name):
                windows.append({
                    **window, "id": f"{key}/{name}",
                    "name": bucket.get("limitName") or key,
                })
    now = int(time.time() * 1000)
    account_key = account_ref(known_account) if known_account else account_ref("live:" + (account.get("email") or "unknown"))
    return {"sampledAt": now, "windows": windows, "plan": account.get("planType"),
            "account": account_key, "activity": activity}


class Lens:
    def __init__(self, home, socket, state_dir, known_account=None):
        self.home = home
        self.socket = socket
        self.state_dir = state_dir
        self.state_dir.mkdir(parents=True, mode=0o700, exist_ok=True)
        self.known_account = known_account
        rates_path = state_dir / "prices.json"
        self.pricing = load_overrides(rates_path) if rates_path.is_file() else Pricing()
        self.rollouts = Rollouts(home, state_dir / "telemetry.sqlite3", self.pricing)
        self.snapshots_db = sqlite3.connect(state_dir / "quota.sqlite3", check_same_thread=False)
        self.snapshots_db.execute("CREATE TABLE IF NOT EXISTS snapshots (sampled INTEGER PRIMARY KEY, data TEXT NOT NULL)")
        self.index_lock = threading.Lock()
        self.state_lock = threading.Lock()
        self.index = ({}, {}, [])
        self.last_scan = 0
        self.quota = {"windows": [], "collected": 0}
        self.config = {
            "moduleOrder": CARDS, "modules": {card: True for card in CARDS},
            "expanded": {"live-context": True, "quota-budget": False},
            "lang": "zh-CN", "defaultRange": "7d", "refreshSec": 30,
        }
        try:
            self.config.update(json.loads(self.config_path.read_text()))
        except (OSError, ValueError):
            pass

    @property
    def config_path(self):
        return self.state_dir / "preview-settings.json"

    def update_index(self):
        if time.monotonic() - self.last_scan < 10:
            return self.index
        with self.index_lock:
            if time.monotonic() - self.last_scan < 10:
                return self.index
            rollouts = self.rollouts.update()
            rows = [row for rollout in rollouts.values() for row in rollout.rows]
            names = {}
            path = self.home / "session_index.jsonl"
            if path.is_file():
                with path.open(encoding="utf-8") as stream:
                    for line in stream:
                        try:
                            value = json.loads(line)
                            if value.get("id") in rollouts and isinstance(value.get("thread_name"), str):
                                names[value["id"]] = value["thread_name"]
                        except ValueError:
                            continue
            self.index = rollouts, names, rows
            self.last_scan = time.monotonic()
            return self.index

    def collect(self):
        from websockets.exceptions import WebSocketException

        while True:
            try:
                snapshot = asyncio.run(read_quota(self.socket, self.known_account))
                with self.state_lock, self.snapshots_db:
                    self.snapshots_db.execute("INSERT OR REPLACE INTO snapshots VALUES (?, ?)",
                                              (snapshot["sampledAt"], json.dumps(snapshot)))
                    self.quota = snapshot
            except (OSError, TimeoutError, WebSocketException, RuntimeError, ValueError, KeyError):
                with self.state_lock:
                    self.quota = {**self.quota, "stale": True}
            time.sleep(300)

    def quota_data(self, rollouts, usage, fit=None):
        events = [s for rollout in rollouts.values() for s in rollout.snapshots]
        with self.state_lock:
            now = int(time.time() * 1000)
            points = self.snapshots_db.execute(
                "SELECT data FROM snapshots WHERE sampled>=? ORDER BY sampled", (now - 120 * 86_400_000,),
            ).fetchall()
            live = self.quota.copy()
        for (packed,) in points:
            point = json.loads(packed)
            for w in point["windows"]:
                events.append({**w, "sampledAt": point["sampledAt"], "account": point["account"], "source": "rpc"})
        if not live.get("sampledAt") and points:
            live = {**json.loads(points[-1][0]), "stale": True}
        cycles = quota_cycles(events, usage, now=now)
        if fit is not None:
            for cycle in cycles:
                if (fit.get("account"), fit.get("bucket"), fit.get("reset")) == (
                    cycle["account"], cycle["id"], str(cycle["reset"])
                ):
                    return calibrate(cycle["segments"])
            raise LookupError("quota window")

        if not live.get("windows"):
            recent = [cycle for cycle in cycles if cycle["active"]]
            live["windows"] = [{
                "id": item["id"], "name": item["id"].split("/")[0], "windowDurationMins": item["minutes"],
                "resetsAt": item["reset"] // 1000, "usedPercent": item["usedPercent"], "samples": item["samples"],
            } for item in recent]
            live["stale"] = True
            live["sampledAt"] = max((item["sampledAt"] for item in recent), default=None)
        for w in live["windows"]:
            w["samples"] = next((c["samples"] for c in cycles if c["id"] == w["id"]
                                 and c["reset"] == (w.get("resetsAt") or 0) * 1000
                                 and c["account"] == (live.get("account") or "")[:12]), w.get("samples", 0))
        output = {k: v for k, v in live.items() if k != "account"}
        if isinstance(live.get("activity"), dict):
            linked = bool(self.known_account)
            local_daily = defaultdict(int)
            if linked:
                for row in usage:
                    if row["source"] == "openai" and row.get("account") == live.get("account"):
                        day = datetime.fromtimestamp(row["completedAt"] / 1000, timezone.utc).date().isoformat()
                        local_daily[day] += row["totalTokens"]
            output["dailyComparison"] = [{
                "date": item["startDate"], "accountTokens": item["tokens"],
                "localTokens": local_daily[item["startDate"]] if linked else None,
            } for item in (live["activity"].get("dailyUsageBuckets") or [])[-14:]
                if isinstance(item.get("startDate"), str) and isinstance(item.get("tokens"), int)]

        return {**output, "cycles": [{k: v for k, v in c.items() if k != "segments"} for c in cycles[:24]]}

    def config_payload(self):
        return {"version": __version__, "config": self.config, "indexStatus": {}}

    def patch_config(self, patch):
        with self.state_lock:
            for key in ("lang", "refreshSec", "quotaDisplayMode", "defaultRange"):
                if key in patch:
                    self.config[key] = patch[key]
            for key in ("modules", "expanded"):
                if isinstance(patch.get(key), dict):
                    self.config[key].update({card: bool(value) for card, value in patch[key].items() if card in CARDS})
            if isinstance(patch.get("moduleOrder"), list):
                order = [card for card in patch["moduleOrder"] if card in CARDS]
                self.config["moduleOrder"] = list(dict.fromkeys(order + CARDS))
            replacement = self.config_path.with_suffix(".tmp")
            replacement.write_text(json.dumps(self.config))
            replacement.replace(self.config_path)
            return self.config_payload()

    def get_data(self, path, params):
        if path == "/api/config":
            return self.config_payload()
        if path == "/api/health":
            return {"ok": True, "version": __version__}
        if path == "/api/pricing":
            return {"models": [], "reference": CATALOG, "credits": CREDIT_RATES}
        if path not in ("/api/sessions", "/api/session", "/api/analytics", "/api/day", "/api/quota", "/api/observatory", "/api/calibration"):
            raise LookupError(path)
        rollouts, names, rows = self.update_index()
        if path in ("/api/quota", "/api/calibration"):
            return self.quota_data(rollouts, rows, params if path == "/api/calibration" else None)
        if path == "/api/observatory":
            period = params.get("period", "1d")
            if period not in PERIODS:
                raise ValueError("invalid period")
            limits = params.get("breaks")
            breaks = sorted(set(int(s) for s in limits.split(","))) if limits else DEFAULT_BREAKS
            if not 1 <= len(breaks) <= 10 or not 1 <= breaks[0] <= breaks[-1] <= 86400:
                raise ValueError("invalid cache interval")
            lo, hi = bounds(params.get("range"), params.get("from"), params.get("to"))
            return observatory(rollouts, lo, hi, params.get("provider", ""), params.get("model", ""),
                               params.get("gap", "idle"), params.get("active") == "1", breaks, period)
        if path == "/api/sessions":
            recent = sorted(rollouts.items(), key=lambda item: item[1].rows[-1]["completedAt"], reverse=True)
            return {"threads": [{
                "id": thread, "title": names.get(thread) or thread[:8],
                "provider": rollout.rows[-1]["source"],
            } for thread, rollout in recent[:60]]}
        if path == "/api/session":
            return session_response(rollouts.get(params.get("conversationId")), names)
        if provider := params.get("provider"):
            rows = [row for row in rows if row["source"] == provider]
        if path == "/api/day":
            return day_detail(rows, params.get("date"), names)
        current = range_rows(rows, params.get("range"), params.get("from"), params.get("to"))
        return analytics(range_rows(rows, "all", None, None), current)


class Handler(BaseHTTPRequestHandler):
    def __init__(self, lens, *args):
        self.lens = lens
        super().__init__(*args)

    def log_message(self, *_):
        pass

    def respond(self, code, content_type, body):
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def json_response(self, code, value):
        self.respond(code, "application/json", json.dumps(value, ensure_ascii=False).encode())

    def is_loopback_host(self):
        return self.headers.get("Host", "").split(":", 1)[0] in ("127.0.0.1", "localhost")

    def do_GET(self):
        if not self.is_loopback_host():
            return self.json_response(403, {"error": "Loopback preview only"})
        url = urlsplit(self.path)
        if url.path in FILES:
            filename, content_type = FILES[url.path]
            return self.respond(200, content_type, (WEB / filename).read_bytes())
        params = {k: values[-1] for k, values in parse_qs(url.query).items()}
        try:
            self.json_response(200, self.lens.get_data(url.path, params))
        except LookupError:
            self.json_response(404, {"error": "Unknown route"})
        except ValueError:
            self.json_response(400, {"error": "Invalid dates or filters"})

    def do_POST(self):
        origin = self.headers.get("Origin")
        cross_site = self.headers.get("Sec-Fetch-Site") not in (None, "same-origin", "none")
        if cross_site or not self.is_loopback_host() or (origin and origin != f"http://{self.headers['Host']}"):
            return self.json_response(403, {"error": "Loopback preview only"})
        if self.path != "/api/config":
            return self.json_response(404, {"error": "Unknown route"})
        try:
            length = int(self.headers.get("Content-Length", 0))
            if not 0 < length <= 4096:
                raise ValueError()
            body = json.loads(self.rfile.read(length))
            if not isinstance(body, dict):
                raise ValueError()
            self.json_response(200, self.lens.patch_config(body))
        except ValueError:
            self.json_response(400, {"error": "Invalid panel settings"})


def run(home, socket_path, state, port, *, collect=True, known_account=None):
    lens = Lens(home, socket_path, state, known_account)
    with ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, lens)) as server:
        if collect:
            threading.Thread(target=lens.collect, daemon=True).start()
        print(f"Codex Lens at http://127.0.0.1:{server.server_port}", flush=True)
        server.serve_forever()
