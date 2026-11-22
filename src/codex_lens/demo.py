"""Deterministic synthetic usage for the public interactive demo."""
import json
from datetime import datetime, timezone, timedelta


def demo_home(root):
    now = datetime.now(timezone.utc)
    home = root / "codex"
    folder = home / "sessions"
    folder.mkdir(parents=True, exist_ok=True)
    account = "synthetic-demo-account"
    reset = int((now + timedelta(days=1)).timestamp())
    names = []
    for i, (model, provider, title) in enumerate([
        ("gpt-6.2-sol", "openai", "Refactor the query engine"),
        ("gpt-6.2-astra", "openai", "Design a validation suite"),
        ("gpt-6.2-sol", "krill-code", "Review a test plan"),
    ]):
        thread = f"demo-thread-{i + 1}"
        names.append({"id": thread, "thread_name": title})
        rows = []

        def add(kind, payload, when):
            rows.append({"type": kind, "timestamp": when.isoformat(), "payload": payload})

        add("session_meta", {"id": thread, "cwd": "/demo/project", "model_provider": provider,
                             "creator_account_id": account}, now - timedelta(days=6))
        total = dict(input_tokens=0, cached_input_tokens=0, output_tokens=0, reasoning_output_tokens=0)
        for n in range(30):
            end = now - timedelta(hours=120 - n * 4, minutes=(2 - i) * 13)
            turn = f"turn-{i}-{n}"
            started = end - timedelta(seconds=8)
            add("event_msg", {"type": "task_started", "turn_id": turn}, started)
            add("turn_context", {"model": model, "turn_id": turn, "effort": "medium", "service_tier": "default"}, started)
            for step in range(3):
                tokens = 98_000 + (n % 5) * 21_000 + step * 600
                rate = .978 if step or n % 8 else 0
                if n % 9 == 4 and step == 1:
                    rate = .32
                last = dict(input_tokens=tokens, cached_input_tokens=int(tokens * rate),
                            output_tokens=150 + 25 * step, reasoning_output_tokens=80 + 10 * step)
                for key, value in last.items():
                    total[key] += value
                event = {"type": "token_count", "info": {
                    "total_token_usage": dict(total), "last_token_usage": last, "model_context_window": 272_000,
                }}
                if i == 0:
                    event["rate_limits"] = {"limit_id": "codex", "secondary": {
                        "used_percent": n + 1, "window_minutes": 10_080, "resets_at": reset,
                    }}
                add("event_msg", event, started + timedelta(seconds=2 + step * 2))
            add("event_msg", {"type": "task_complete", "turn_id": turn, "duration_ms": 8000,
                             "time_to_first_token_ms": 450 + 20 * (n % 8)}, end)
        with (folder / f"rollout-{thread}.jsonl").open("w", encoding="utf-8") as stream:
            stream.writelines(json.dumps(item) + "\n" for item in rows)
    (home / "session_index.jsonl").write_text(
        "".join(json.dumps(item) + "\n" for item in names), encoding="utf-8"
    )
    return home
