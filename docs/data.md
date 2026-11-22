# Data sources and units

| Source | Scope |
|---|---|
| Codex rollout JSONL | Per-request token counts, context, model, effort, visible lifecycle markers and locally observed rate-limit snapshots. |
| `account/rateLimits/read` | Live ChatGPT allowance windows for the connected account. |
| `account/usage/read` | Account-wide daily buckets and lifetime activity. |
| Local price catalog | API text equivalents and published Standard credits. |

SQLite stores file cursors and typed derived records separately from the Codex data directory. Anomalies are inferred from comparable successive requests on the same model and provider. Compaction, rollbacks, turn aborts and model changes break the comparison. The default cross-turn idle view uses observed turn end/start timestamps. Completion intervals use recorded timestamps and include model execution time.

API equivalents include cached and uncached input, output including reasoning, and model-specific context pricing. An unobserved service tier is shown as Standard reference. Cached writes need both a token count and an observable retention contract. Published credits stay at Standard reference prices. Provider overrides go in the separate state directory's `prices.json`:

    {"krill-code/gpt-6.2-sol":[{"effectiveFrom":"2026-11-01","api":[2,0.1,10]}]}

Each row is a per-million rate in USD for uncached input, cached input and output. For first-party rates and Credit cards, see [OpenAI API pricing](https://developers.openai.com/api/docs/pricing) and [Codex pricing](https://learn.chatgpt.com/docs/pricing).

Quota windows are independent for each account, bucket, duration and reset. Positive differences are matched to local OpenAI requests from the same identifiable workspace. Repeated integer readings are coalesced. The base estimate reports the observed mix with a quantization interval. Account-wide activity can include work from other clients, so local attribution is partial whenever the dataset misses those clients. The live RPC's account label and rollout workspace stay separate until an explicit verified workspace match is available via `--workspace-account-id`.

State is local and can be rebuilt from original rollouts. Back up the separate Lens state directory if you want to retain RPC samples or preferences.
