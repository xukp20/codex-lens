"""Cache transitions and period comparisons over locally observed requests."""
from bisect import bisect_left
from collections import defaultdict

from .pricing import Pricing

DEFAULT_BREAKS = [10, 60, 300, 600, 3600]
PERIODS = {"1h": 3_600_000, "5h": 18_000_000, "1d": 86_400_000, "7d": 604_800_000}


def prompt(row):
    return row["cacheRead"] + row["uncachedIn"]


def similar(previous, current):
    size = prompt(previous)
    return (
        previous["model"] != "unknown" and previous["model"] == current["model"]
        and previous["source"] == current["source"] and previous["epoch"] == current["epoch"]
        and previous.get("tier") == current.get("tier")
        and size >= 20_000 and size * .8 <= prompt(current) <= size * 1.25
    )


def transitions(rows):
    events = []
    for i, current in enumerate(rows):
        if not i:
            continue
        previous = rows[i - 1]
        if not similar(previous, current) or previous["hitRatio"] < .7:
            continue
        change = "full" if current["cacheRead"] == 0 else "partial" if current["hitRatio"] < .4 else "normal"
        recorded_gap = max(0, current["completedAt"] - previous["completedAt"])
        idle = current.get("turnIdleMs") if current["turn"] and previous["turn"] and current["turn"] != previous["turn"] else None
        next_row = rows[i + 1] if i + 1 < len(rows) else None
        recovered = bool(change != "normal" and next_row and similar(current, next_row)
                         and next_row["hitRatio"] >= .7
                         and 0 <= next_row["completedAt"] - current["completedAt"] <= 300_000)
        lost = max(0, min(previous["cacheRead"], prompt(current)) - current["cacheRead"]) if change != "normal" else 0
        return_delta = None
        if lost:
            price = Pricing().price({**current, "tier": "standard"})["costUsd"]
            reused = Pricing().price({
                **current, "tier": "standard", "cacheRead": current["cacheRead"] + lost,
                "uncachedIn": current["uncachedIn"] - lost,
            })["costUsd"]
            if price is not None and reused is not None:
                return_delta = price - reused
        events.append({
            "model": current["model"], "provider": current["source"],
            "time": current["completedAt"], "idleMs": idle, "recordedMs": recorded_gap,
            "input": prompt(current), "cached": current["cacheRead"], "kind": change,
            "previous": previous["hitRatio"], "hit": current["hitRatio"],
            "next": next_row["hitRatio"] if next_row and similar(current, next_row) else None,
            "recovered": recovered, "referenceLostTokens": lost, "referenceCost": return_delta,
            "index": i, "thread": current["thread"],
        })
    return events


def metrics(events):
    count = len(events)
    tokens = sum(e["input"] for e in events)
    return {
        "n": count,
        "weighted": sum(e["cached"] for e in events) / tokens if tokens else None,
        "keep": sum(e["hit"] >= .7 for e in events) / count if count else None,
        "full": sum(e["kind"] == "full" for e in events),
        "partial": sum(e["kind"] == "partial" for e in events),
        "recovered": sum(e["recovered"] for e in events),
        "lost": sum(e["referenceLostTokens"] for e in events),
        "referenceCost": sum(e["referenceCost"] for e in events if e["referenceCost"] is not None)
        if any(e["referenceCost"] is not None for e in events) else None,
    }


def observatory(rollouts, lo, hi, provider="", model="", gap="idle", active=False,
                breaks=None, period="1d"):
    breaks = breaks or DEFAULT_BREAKS
    events = []
    for rollout in rollouts.values():
        if not rollout.rows or rollout.rows[-1]["completedAt"] < lo:
            continue
        for e in transitions(rollout.rows):
            if not lo <= e["time"] < hi or (provider and e["provider"] != provider):
                continue
            if model and e["model"] != model:
                continue
            chosen = e["idleMs"] if gap == "idle" else e["recordedMs"]
            if chosen is None or (active and chosen > 300_000):
                continue
            e["gapMs"] = chosen
            events.append(e)
    grouped = defaultdict(list)
    series = defaultdict(list)
    periods = defaultdict(list)
    duration = PERIODS[period]
    for e in events:
        label = (e["provider"], e["model"])
        grouped[label].append(e)
        series[e["time"] // duration * duration].append(e)
        periods[(hi - 1 - e["time"]) // duration].append(e)

    def buckets(items):
        cells = [[] for _ in range(len(breaks) + 1)]
        for e in items:
            cells[bisect_left(breaks, e["gapMs"] / 1000)].append(e)
        return [metrics(items) for items in cells]

    detail = sorted((e for e in events if e["kind"] != "normal"),
                    key=lambda e: e["referenceLostTokens"], reverse=True)[:20]
    # Export views omit thread identifiers and other workspace-specific metadata.
    return {
        "summary": metrics(events), "breaks": breaks,
        "matrix": [{"provider": key[0], "model": key[1], "total": metrics(items), "buckets": buckets(items)}
                   for key, items in sorted(grouped.items())],
        "timeline": [{"start": start, **metrics(items)} for start, items in sorted(series.items())][-168:],
        "compare": [{"end": hi - i * duration, "start": hi - (i + 1) * duration,
                     "summary": metrics(periods[i]), "buckets": buckets(periods[i])} for i in range(4)],
        "events": detail,
    }
