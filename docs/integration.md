# Codex integration

## Terminal

Run `codex-lens status --line` to produce a compact summary for shell or tmux status scripts. To show an observed session's cache hit rate, add `--thread THREAD_ID`. For Codex's built-in footer, use its `/statusline` picker and select model, context, quota and token counters. The built-in footer exposes its own fields.

The expanded Token Flow card also shows turn-level TTFT, duration and output-per-wall-second p50/p90. Its counts include only completed turns with attributable usage. The measured wall rate includes tools and waiting. Worker attribution comes from the rollout's source and parent links, and mixed-model turns get their own bucket.

## Experimental MCP dashboard

Keep `codex-lens serve` running on the machine that hosts the MCP command. Register the read-only stdio server:

    codex mcp add codex-lens -- codex-lens mcp --port 4318

Alternatively add this checkout's local marketplace and install Codex Lens from the desktop Plugins Directory. The included plugin assumes the launcher is on that host's PATH and the server listens on port 4318.

The `codex_lens_dashboard` tool declares an MCP App resource with an OpenAI thread-panel entrypoint. The HTML runs through the MCP Apps message bridge and can read the same local dashboard views. Select a session in the embedded picker. Its settings live inside the panel session.

The automated checks cover the stdio discovery/resource/tool contract and a simulated MCP host. Rendering a native panel depends on the installed desktop client, particularly for an SSH workspace. Browser split view is the supported fallback for that deployment.

- [OpenAI plugin extensions](https://developers.openai.com/plugins/build/extensions)
- [Codex CLI commands](https://learn.chatgpt.com/docs/developer-commands)
