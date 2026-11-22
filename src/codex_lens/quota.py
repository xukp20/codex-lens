"""Normalize quota snapshots and estimate a budget from observed same-window usage."""
from collections import defaultdict
from bisect import bisect_right
from datetime import datetime, timezone

from .pricing import Pricing


def key(item):
    return item["account"], item["id"], item["windowDurationMins"], item["resetsAt"]


def unique(snapshots):
    events = {}
    for item in snapshots:
        if not all(k in item for k in ("account", "id", "windowDurationMins", "resetsAt", "usedPercent", "sampledAt")):
            continue
        percent = item["usedPercent"]
        times = item["sampledAt"], item["resetsAt"], item["windowDurationMins"]
        if not isinstance(percent, (float, int)) or not 0 <= percent <= 100:
            continue
        if not item["account"] or any(not isinstance(value, (int, float)) or not 0 < value < 1e16 for value in times):
            continue
        events[key(item), item["sampledAt"], percent] = item
    return sorted(events.values(), key=lambda item: item["sampledAt"])


def standard_value(row):
    return Pricing().price({**row, "tier": "standard"})


def quota_cycles(snapshots, usage, *, now):
    groups = defaultdict(list)
    by_account = defaultdict(list)
    for item in unique(snapshots):
        groups[key(item)].append(item)
    for row in usage:
        if row["source"] == "openai" and row.get("account"):
            by_account[row["account"]].append(row)
    for rows in by_account.values():
        rows.sort(key=lambda row: row["completedAt"])

    cycles = []
    for (account, bucket, minutes, reset), items in groups.items():
        start, end = (reset - minutes * 60) * 1000, reset * 1000
        items = [item for item in items if start <= item["sampledAt"] <= end]
        if not items:
            continue
        requests = by_account[account]
        stamps = [row["completedAt"] for row in requests]
        anchors = [items[0]]
        segments = []
        first = anchors[0]
        for item in items[1:]:
            delta = item["usedPercent"] - first["usedPercent"]
            if delta == 0:
                continue
            anchors.append(item)
            if delta > 0:
                lo = bisect_right(stamps, first["sampledAt"])
                hi = bisect_right(stamps, item["sampledAt"])
                local = requests[lo:hi]
                prices = [standard_value(row) for row in local]
                values = [p["costUsd"] for p in prices]
                covered = bool(local and all(value is not None for value in values))
                by_model = defaultdict(float)
                categories = defaultdict(lambda: [0, 0, 0])
                components = defaultdict(lambda: [0., 0., 0.])
                for row, value, price in zip(local, values, prices):
                    if value is not None:
                        by_model[row["model"]] += value
                        for i, amount in enumerate(price["componentsUsd"]):
                            components[row["model"]][i] += amount
                    for i, field in enumerate(("uncachedIn", "cacheRead", "totalOut")):
                        categories[row["model"]][i] += row[field]
                segments.append({
                    "from": first["sampledAt"], "to": item["sampledAt"], "delta": delta,
                    "usd": sum(v for v in values if v is not None), "covered": covered,
                    "requests": len(local), "models": dict(by_model), "tokenMix": dict(categories), "components": dict(components),
                })
            first = item
        use = [segment for segment in segments if segment["covered"] and segment["usd"] > 0]
        points = sum(s["delta"] for s in use)
        dollars = sum(s["usd"] for s in use)
        # Count disjoint quantized differences; contiguous changes telescope.
        runs = sum(i == 0 or s["from"] != use[i - 1]["to"] for i, s in enumerate(use))
        value = None
        if len(use) >= 2 and points > max(2, runs):
            value = {"equivalentUsd": 100 * dollars / points, "low": 100 * dollars / (points + runs),
                     "high": 100 * dollars / (points - runs), "delta": points,
                     "gapCount": len(segments) - len(use), "segments": len(use)}
        cycles.append({
            "account": account[:12], "id": bucket, "minutes": minutes,
            "start": start, "reset": end, "active": start <= now < end,
            "usedPercent": items[-1]["usedPercent"], "sampledAt": items[-1]["sampledAt"],
            "samples": len(items), "anchors": [{"time": x["sampledAt"], "used": x["usedPercent"]} for x in anchors],
            "segments": segments, "estimate": value,
        })
    return sorted(cycles, key=lambda c: (c["active"], c["sampledAt"]), reverse=True)
