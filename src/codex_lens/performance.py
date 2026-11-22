"""Turn-level latency, output rate and worker attribution."""
from collections import defaultdict


def percentile(values, fraction):
    if not values:
        return None
    ordered = sorted(values)
    rank = (len(ordered) - 1) * fraction
    lo = int(rank)
    hi = min(len(ordered) - 1, lo + 1)
    return ordered[lo] + (ordered[hi] - ordered[lo]) * (rank - lo)


def performance(rollouts, lo, hi, provider="", thread=""):
    groups = defaultdict(list)
    attribution = {"primary": 0, "worker": 0}
    for thread_id, rollout in rollouts.items():
        parent = rollout.meta.get("parent")
        if thread and thread not in (thread_id, parent):
            continue
        if provider and rollout.meta.get("model_provider") != provider:
            continue
        by_turn = defaultdict(list)
        for row in rollout.rows:
            if row.get("turn"):
                by_turn[row["turn"]].append(row)
        worker = bool(rollout.meta.get("worker"))
        for item in rollout.turn_stats:
            if not lo <= item["time"] < hi:
                continue
            rows = by_turn[item["turn"]]
            if not rows:
                continue
            dimensions = {(r["model"], r.get("effort") or "") for r in rows}
            model, effort = next(iter(dimensions)) if len(dimensions) == 1 else ("mixed", "")
            total_out = sum(r["totalOut"] for r in rows)
            total_tokens = sum(r["totalTokens"] for r in rows)
            rate = total_out * 1000 / item["duration"] if item["duration"] else None
            groups[(rows[0]["source"], model, effort, worker)].append({
                **item, "tokens": total_tokens, "output": total_out, "turnRate": rate,
            })
            attribution["worker" if worker else "primary"] += total_tokens

    def summary(items, field):
        values = [r[field] for r in items if r.get(field) is not None]
        return {"n": len(values), "p50": percentile(values, .5), "p90": percentile(values, .9)}

    models = []
    for (source, model, effort, worker), items in groups.items():
        models.append({
            "provider": source, "model": model, "effort": effort, "worker": worker,
            "turns": len(items), "tokens": sum(r["tokens"] for r in items), "ttftMs": summary(items, "ttft"),
            "durationMs": summary(items, "duration"), "tokensPerTurnSecond": summary(items, "turnRate"),
        })
    return {"models": sorted(models, key=lambda m: m["tokens"], reverse=True), "attribution": attribution}
