"""Read Codex rollout usage without storing conversation content."""

import json
from collections import defaultdict
from datetime import date, datetime, timedelta
from itertools import chain
import hashlib
import sqlite3
from pathlib import Path

from .pricing import CREDIT_RATES, Pricing
from .cache import transitions

DAYS = 120
USAGE_FIELDS = (
    "input_tokens", "cached_input_tokens", "output_tokens",
    "reasoning_output_tokens", "cache_write_input_tokens",
)


def usage(raw):
    return tuple(raw.get(field, 0) or 0 for field in USAGE_FIELDS)


def timestamp(raw):
    return int(datetime.fromisoformat(raw).timestamp() * 1000)


def account_ref(value):
    return hashlib.sha256(value.encode()).hexdigest() if value else None


class Rollout:
    def __init__(self):
        self.offset = 0
        self.meta = {}
        self.model = ""
        self.total = None
        self.context = None
        self.rows = []
        self.snapshots = []
        self.turn_stats = []
        self.epoch = 0
        self.turn = None
        self.started = None
        self.ended = None
        self.idle = None
        self.tier = None
        self.effort = None
        self.cache_retention = None

    def read(self, path):
        with path.open("rb") as stream:
            stream.seek(self.offset)
            while line := stream.readline():
                if not line.endswith(b"\n"):
                    break
                self.offset = stream.tell()
                if not any(key in line for key in (b'"session_meta"', b'"turn_context"', b'"token_count"', b'"compacted"', b'"task_started"', b'"task_complete"', b'"turn_aborted"', b'"thread_rolled_back"')):
                    continue
                try:
                    packet = json.loads(line)
                except ValueError:
                    continue
                self.accept(packet)

    def accept(self, packet):
        kind = packet.get("type")
        payload = packet.get("payload")
        if not isinstance(payload, dict):
            return
        event = payload.get("type")
        if kind == "session_meta" and not self.meta:
            self.meta = {key: payload.get(key) for key in ("id", "cwd", "model_provider")}
            self.meta["account"] = account_ref(payload.get("creator_account_id"))
            source = payload.get("source")
            self.meta["worker"] = isinstance(source, dict) and "subagent" in source
            parent = source.get("subagent") if isinstance(source, dict) else None
            spawn = parent.get("thread_spawn") if isinstance(parent, dict) else None
            self.meta["parent"] = spawn.get("parent_thread_id") if isinstance(spawn, dict) else None
        if kind == "compacted" or (kind == "event_msg" and event in ("thread_rolled_back", "turn_aborted")):
            self.epoch += 1
        if kind == "event_msg" and event in ("task_complete", "turn_aborted"):
            self.ended = timestamp(packet["timestamp"])
            if event == "task_complete" and isinstance(payload.get("turn_id"), str):
                durations = {label: payload.get(field) for label, field in (
                    ("duration", "duration_ms"), ("ttft", "time_to_first_token_ms")
                )}
                self.turn_stats.append({"turn": payload["turn_id"], "time": self.ended, **{
                    label: value if isinstance(value, (int, float)) and value >= 0 else None
                    for label, value in durations.items()
                }})
        if kind == "event_msg" and event == "task_started":
            self.turn = payload.get("turn_id")
            self.started = timestamp(packet["timestamp"])
            self.idle = max(0, self.started - self.ended) if self.ended is not None else None
        if kind == "turn_context":
            self.model = payload.get("model") or self.model
            self.turn = payload.get("turn_id") or self.turn
            self.tier = payload.get("service_tier")
            self.effort = payload.get("effort")
            self.cache_retention = payload.get("prompt_cache_retention")
        if kind != "event_msg" or event != "token_count":
            return
        account = self.meta.get("account")
        limits = payload.get("rate_limits")
        at = timestamp(packet["timestamp"])
        if account and self.meta.get("model_provider") == "openai" and isinstance(limits, dict):
            bucket = limits.get("limit_id") or "codex"
            for name in ("primary", "secondary"):
                win = limits.get(name)
                if isinstance(win, dict) and win.get("resets_at") and win.get("window_minutes") and isinstance(win.get("used_percent"), (int, float)):
                    self.snapshots.append({
                        "account": account, "id": f"{bucket}/{name}", "resetsAt": win["resets_at"],
                        "windowDurationMins": win["window_minutes"], "usedPercent": win["used_percent"],
                        "sampledAt": at, "source": "rollout",
                    })
        info = payload.get("info")
        if not info or not info.get("last_token_usage") or not info.get("total_token_usage"):
            return
        last = usage(info["last_token_usage"])
        total = usage(info["total_token_usage"])
        previous, self.total = self.total, total
        # The same snapshot can be emitted again with new quota metadata.
        if total == previous or last[0] + last[2] <= 0:
            return
        if previous is not None and tuple(a - b for a, b in zip(total, previous)) != last:
            # A reset, a fork baseline, or an aggregate update is not a model request.
            return
        if previous is None and total != last:
            # The first value may be a restored cumulative snapshot.
            return
        if not self.meta.get("id"):
            return
        model = self.model or "unknown"
        input_tokens, cached, output, reasoning, writes = last
        cached = min(input_tokens, cached)
        reasoning = min(output, reasoning)
        row = {
            "thread": self.meta["id"], "workspace": self.meta.get("cwd") or "",
            "source": self.meta.get("model_provider") or "unknown", "model": model,
            "completedAt": at, "cacheRead": cached, "turn": self.turn, "epoch": self.epoch,
            "turnIdleMs": self.idle, "account": account, "effort": self.effort, "tier": self.tier,
            "cacheRetention": self.cache_retention, "worker": self.meta.get("worker"),
            "uncachedIn": input_tokens - cached, "totalOut": output, "cacheCreate": writes,
            "thinkingOut": reasoning, "visibleOut": output - reasoning,
            "totalTokens": input_tokens + output,
            "hitRatio": cached / input_tokens if input_tokens else 0,
            "stepIdx": len(self.rows) + 1, "cold": not cached,
        }
        row["drop"] = bool(self.rows and cached and self.rows[-1]["hitRatio"] >= .4
                           and row["hitRatio"] < self.rows[-1]["hitRatio"] - .25)
        self.context = info.get("model_context_window")
        self.rows.append(row)


class Rollouts:
    """Index append-only rollouts while keeping a durable cursor per file."""

    def __init__(self, home: Path, index_path=None, pricing=None):
        self.home = home
        self.pricing = pricing or Pricing()
        self.files = {}
        self.db = sqlite3.connect(index_path or ":memory:", check_same_thread=False)
        self.db.executescript("""
            PRAGMA journal_mode=WAL;
            PRAGMA foreign_keys=ON;
            CREATE TABLE IF NOT EXISTS files (
                file_key TEXT PRIMARY KEY, state TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS records (
                file_key TEXT NOT NULL REFERENCES files(file_key) ON DELETE CASCADE,
                kind TEXT NOT NULL, seq INTEGER NOT NULL, data TEXT NOT NULL,
                PRIMARY KEY (file_key,kind,seq)
            );
        """)

    def _restore(self, key):
        target = Rollout()
        row = self.db.execute("SELECT state FROM files WHERE file_key=?", (key,)).fetchone()
        if row is None:
            return target
        target.__dict__.update(json.loads(row[0]))
        if target.total is not None:
            target.total = tuple(target.total)
        for kind, data in self.db.execute("SELECT kind,data FROM records WHERE file_key=? ORDER BY seq", (key,)):
            getattr(target, kind).append(json.loads(data))
        return target

    def _save(self, key, target, offsets, reset):
        state = {k: v for k, v in vars(target).items() if k not in ("rows", "snapshots", "turn_stats")}
        with self.db:
            if reset:
                self.db.execute("DELETE FROM files WHERE file_key=?", (key,))
            self.db.execute(
                "INSERT INTO files VALUES (?, ?) ON CONFLICT(file_key) DO UPDATE SET state=excluded.state",
                (key, json.dumps(state)),
            )
            for kind, offset in offsets.items():
                records = getattr(target, kind)
                self.db.executemany("INSERT INTO records VALUES (?, ?, ?, ?)", (
                    (key, kind, i, json.dumps(records[i])) for i in range(offset, len(records))
                ))

    def update(self):
        cutoff = (datetime.now() - timedelta(days=DAYS)).timestamp()
        paths = (self.home / "archived_sessions").glob("rollout-*.jsonl")
        active = (self.home / "sessions").rglob("rollout-*.jsonl")
        kept = {}
        by_id = {}
        for path in chain(active, paths):
            try:
                info = path.stat()
                if info.st_mtime < cutoff:
                    continue
                # Include the stable file name so a reused inode cannot pick up a different rollout.
                key = f"{info.st_dev}:{info.st_ino}:{path.name}"
                target = self.files.get(key) or self._restore(key)
                reset = target.offset > info.st_size
                if reset:
                    target = Rollout()
                old_offset = target.offset
                offsets = {"rows": len(target.rows), "snapshots": len(target.snapshots), "turn_stats": len(target.turn_stats)}
                if info.st_size > old_offset:
                    target.read(path)
                if reset or target.offset != old_offset:
                    self._save(key, target, offsets, reset)
                for row in target.rows[offsets["rows"]:] if key in self.files and not reset else target.rows:
                    row.update(self.pricing.price(row))
            except (OSError, ValueError, KeyError):
                continue
            kept[key] = target
            thread_id = target.meta.get("id")
            existing = by_id.get(thread_id)
            if thread_id and target.rows and (
                existing is None or (target.rows[-1]["completedAt"], len(target.rows))
                > (existing.rows[-1]["completedAt"], len(existing.rows))
            ):
                by_id[thread_id] = target
        self.files = kept
        return by_id

    def close(self):
        self.db.close()


def summary(rows):
    totals = {key: sum(row[key] for row in rows) for key in (
        "uncachedIn", "cacheRead", "cacheCreate", "totalOut", "thinkingOut", "visibleOut", "totalTokens"
    )}
    input_tokens = totals["uncachedIn"] + totals["cacheRead"]
    totals.update(
        turns=len(rows),
        userTurns=len({(row["thread"], row["turn"]) for row in rows if row.get("turn")}),
        credits=sum(row.get("credits") or 0 for row in rows) if any(row.get("credits") is not None for row in rows) else None,
        unknownTierTurns=sum(bool(row.get("unknownTier")) for row in rows),
        unverifiedWriteTurns=sum(bool(row.get("unverifiedWrite")) for row in rows),
        cacheHitRatio=totals["cacheRead"] / input_tokens if input_tokens else None,
        longContextTurns=sum(row["longContext"] for row in rows),
        unpricedTurns=sum(row["costUsd"] is None for row in rows),
        costUsd=sum(row["costUsd"] or 0 for row in rows),
        cacheSavedUsd=sum(row["cacheSavedUsd"] or 0 for row in rows),
    )
    return totals


def session_response(rollout, names):
    if not rollout:
        return {"found": False}
    rows = rollout.rows
    last = rows[-1]
    anomalies = {e["index"]: e for e in transitions(rows) if e["kind"] != "normal"}
    trajectory = []
    for i in range(max(0, len(rows) - 15), len(rows)):
        row = rows[i]
        boundary = i == 0 or any(row.get(field) != rows[i - 1].get(field) for field in ("epoch", "model", "source"))
        event = anomalies.get(i)
        trajectory.append({**row, "cold": boundary and row["cacheRead"] == 0, "drop": bool(event),
                           "cacheEvent": event["kind"] if event else None,
                           "recovered": bool(event and event["recovered"])})
    window = rollout.context
    effective = max(window - 12_000, 0) if window else 0
    taken = max(last["totalTokens"] - 12_000, 0)
    totals = summary(rows)
    input_total = totals["cacheRead"] + totals["uncachedIn"]
    return {
        "found": True, "conversationId": last["thread"], "workspace": last["workspace"],
        "title": names.get(last["thread"]) or last["thread"][:8], "source": last["source"],
        "liveContext": {
            "modelId": last["model"], "contextUsed": last["totalTokens"], "compactLimit": window,
            "ratio": min(1, taken / effective) if effective else None,
            "turnCount": len(rows), "sessionDurationMs": last["completedAt"] - rows[0]["completedAt"],
        },
        "cacheDiagnostics": {
            "lastTurn": trajectory[-1], "turns": trajectory, "anomalies": list(anomalies.values())[-15:],
            "session": {
                "hitRatio": totals["cacheRead"] / input_total if input_total else 0,
                "totalCacheRead": totals["cacheRead"], "totalUncachedIn": totals["uncachedIn"],
                "cacheSavedUsd": totals["cacheSavedUsd"] if totals["unpricedTurns"] < len(rows) else None,
            },
        },
        "ioFlow": totals,
    }


def model_rows(rows):
    groups = defaultdict(list)
    for row in rows:
        groups[row["source"], row["model"], row.get("effort")].append(row)
    result = []
    for (provider, model, effort), items in groups.items():
        data = summary(items)
        credits = CREDIT_RATES.get(model) if provider == "openai" else None
        baseline = CREDIT_RATES["gpt-6.2-sol"]
        ratios = {rate / base for rate, base in zip(credits or (), baseline)}
        result.append({
            **data, "canonicalId": model,
            "displayName": " · ".join(filter(None, (model, effort, provider))),
            "provider": provider, "effort": effort,
            "pricingSource": next((row["pricingSource"] for row in items if row["pricingSource"] != "unpriced"), "unpriced"),
            "creditRate": credits, "creditMultiple": ratios.pop() if len(ratios) == 1 else None,
        })
    return sorted(result, key=lambda x: x["totalTokens"], reverse=True)


def day_key(row):
    return datetime.fromtimestamp(row["completedAt"] / 1000).date().isoformat()


def bounds(range_key, start=None, end=None):
    now = datetime.now()
    floor = datetime.combine(now.date() - timedelta(days=DAYS - 1), datetime.min.time())
    if range_key == "today":
        start = datetime.combine(now.date(), datetime.min.time())
    elif range_key == "custom" and start and end:
        start = datetime.combine(date.fromisoformat(start), datetime.min.time())
        now = datetime.combine(date.fromisoformat(end) + timedelta(days=1), datetime.min.time())
    else:
        span = {"5h": timedelta(hours=5), "7d": timedelta(days=7), "30d": timedelta(days=30), "90d": timedelta(days=90), "all": timedelta(days=DAYS)}
        start = now - span.get(range_key, timedelta(days=DAYS))
    return int(max(start, floor).timestamp() * 1000), int(now.timestamp() * 1000)


def range_rows(rows, range_key, start, end):
    low, high = bounds(range_key, start, end)
    return [row for row in rows if low <= row["completedAt"] < high]


def analytics(rows, selected):
    data = summary(selected)
    active_hours = 0
    if selected:
        times = [row["completedAt"] for row in selected]
        active_hours = (max(times) - min(times)) / 3_600_000
    workspaces = defaultdict(list)
    by_day = defaultdict(list)
    for row in selected:
        workspaces[row["workspace"]].append(row)
    for row in rows:
        by_day[day_key(row)].append(row)
    days = {key: {"date": key, **summary(items)} for key, items in by_day.items()}
    today = date.today()
    current = days.get(today.isoformat(), {}).get("totalTokens", 0)
    week = sum(days.get((today - timedelta(days=age)).isoformat(), {}).get("totalTokens", 0)
               for age in range(1, 8)) / 7
    streak = 0
    while (today - timedelta(days=streak)).isoformat() in days:
        streak += 1
    return {
        "ioFlow": {
            **data, "burnTokensPerHr": data["totalTokens"] / active_hours if active_hours else 0,
            "burnUsdPerHr": data["costUsd"] / active_hours if active_hours else 0,
        },
        "modelCost": {
            **data, "totalCostUsd": data["costUsd"], "models": model_rows(selected),
            "workspaces": [{"workspace": key, **summary(items)} for key, items in workspaces.items()],
        },
        "calendarTrends": {
            "days": list(days.values()), "streakDays": streak, "todayTokens": current,
            "avg7dTokens": week, "deltaVs7dPct": (current / week - 1) * 100 if week else None,
        },
    }


def day_detail(rows, day, names):
    items = [row for row in rows if day_key(row) == day]
    threads = defaultdict(list)
    for row in items:
        threads[row["thread"]].append(row)
    return {
        "date": day, "totals": summary(items), "models": model_rows(items),
        "conversations": [{
            **summary(calls), "title": names.get(thread) or thread[:8], "source": calls[0]["source"],
            "workspace": calls[0]["workspace"],
        } for thread, calls in threads.items()],
    }
