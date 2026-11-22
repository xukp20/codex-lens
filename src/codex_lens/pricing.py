"""Date-effective API references and credit rate cards."""
import json
from datetime import datetime, timezone
from pathlib import Path

CATALOG = json.loads(Path(__file__).with_name("prices.json").read_text(encoding="utf-8"))["models"]
CREDIT_RATES = {name: rate["credits"] for name, rate in CATALOG.items()}
PROMO_END = datetime(2027, 3, 1, 8, tzinfo=timezone.utc).timestamp() * 1000


class Pricing:
    def __init__(self, overrides=None):
        self.overrides = overrides or {}

    def rate(self, provider, model, at):
        entries = self.overrides.get(f"{provider}/{model}", [])
        valid = [item for item in entries if item["effectiveFrom"] <= at]
        if valid:
            return max(valid, key=lambda item: item["effectiveFrom"]), "override"
        if provider == "openai" and model in CATALOG:
            return CATALOG[model], "builtin"
        return None, "unpriced"

    def price(self, row):
        source, model, at = row["source"], row["model"], row["completedAt"]
        rate, origin = self.rate(source, model, at)
        if not rate:
            return {"costUsd": None, "cacheSavedUsd": None, "credits": None, "longContext": False,
                    "pricingSource": origin, "unknownTier": False, "unverifiedWrite": False}
        tier = row.get("tier") or "unknown"
        fast = tier in ("fast", "priority")
        ultra = tier == "ultrafast"
        unknown_tier = tier not in ("default", "standard", "fast", "priority", "ultrafast", "flex", "batch")
        multiplier = 1
        if fast:
            multiplier = rate.get("fast")
        if ultra:
            multiplier = (3 if at < PROMO_END else 6) if rate.get("ultrafastPromo") else rate.get("ultrafast")
        if tier in ("flex", "batch") and source == "openai":
            multiplier = .5
        unknown_tier = unknown_tier or multiplier is None
        uncached, cached, output = rate["api"]
        prompt = row["uncachedIn"] + row["cacheRead"]
        long = prompt > rate.get("longContextThreshold", 272_000 if origin == "builtin" else float("inf"))
        r_input, r_output = (2, 1.5) if long else (1, 1)
        writes = min(row["cacheCreate"], row["uncachedIn"])
        retention = row.get("cacheRetention")
        unverified_write = writes > 0 and (not rate.get("write") or retention not in ("30m", "12h"))
        write_cost = 0
        if writes and not unverified_write:
            write_rate = rate["write"][retention == "12h"]
            write_cost = writes * (write_rate - uncached) * r_input
        api = (row["uncachedIn"] * uncached + row["cacheRead"] * cached) * r_input
        api += row["totalOut"] * output * r_output + write_cost
        credit = None
        if origin == "builtin":
            ci, cc, co = rate["credits"]
            credit = (row["uncachedIn"] * ci + row["cacheRead"] * cc + row["totalOut"] * co) / 1e6
        return {
            "costUsd": api * (multiplier or 1) / 1e6,
            "cacheSavedUsd": (row["cacheRead"] * (uncached - cached) * r_input - write_cost) * (multiplier or 1) / 1e6,
            "credits": credit, "longContext": long, "pricingSource": origin,
            "unknownTier": unknown_tier, "unverifiedWrite": unverified_write,
        }


def load_overrides(path):
    value = json.loads(path.read_text(encoding="utf-8"))
    for key, entries in value.items():
        if "/" not in key or not isinstance(entries, list):
            raise ValueError("invalid price override key")
        for entry in entries:
            if len(entry["api"]) != 3 or not all(type(x) in (int, float) and 0 <= x < float("inf") for x in entry["api"]):
                raise ValueError("three finite token rates are required")
            entry["effectiveFrom"] = datetime.fromisoformat(entry["effectiveFrom"]).replace(tzinfo=timezone.utc).timestamp() * 1000
    return Pricing(value)
