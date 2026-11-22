"""Command-line entry points for Codex Lens."""
import argparse
import json
import os
from pathlib import Path
import tempfile

from . import __version__
from .demo import demo_home
from .mcp import serve_mcp
from .serve import Lens, run
from .updater import managed


def parser():
    home = Path(os.environ.get("CODEX_HOME", str(Path.home() / ".codex")))
    state = Path(os.environ.get("CODEX_LENS_STATE", str(Path.home() / ".local" / "state" / "codex-lens")))
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--version", action="version", version=__version__)
    commands = ap.add_subparsers(dest="command", required=True)
    mcp = commands.add_parser("mcp", help="Read-only MCP app over stdio")
    mcp.add_argument("--port", type=int, default=4318)
    for name in ("serve", "manage", "status", "doctor", "demo"):
        sub = commands.add_parser(name)
        sub.add_argument("--home", type=Path, default=home)
        sub.add_argument("--state", type=Path, default=state)
        sub.add_argument("--socket", type=Path)
        if name in ("serve", "manage", "demo"):
            sub.add_argument("--port", type=int, default=4318)
        if name in ("serve", "manage"):
            sub.add_argument("--update-mode", choices=("off", "notify", "auto"), default="notify")
            sub.add_argument("--no-collect", action="store_true")
            sub.add_argument("--workspace-account-id", help="Explicit rollout workspace mapping for RPC snapshots")
        if name == "status":
            sub.add_argument("--json", action="store_true")
            sub.add_argument("--provider", default="")
            sub.add_argument("--line", action="store_true", help="Compact line for terminal and tmux integration")
            sub.add_argument("--thread", default="")
            sub.add_argument("--range", default="7d")
    return ap


def main():
    args = parser().parse_args()
    os.umask(0o077)
    if args.command == "mcp":
        serve_mcp(args.port)
        return
    socket = args.socket or args.home / "app-server-control/app-server-control.sock"
    if args.command == "doctor":
        print(json.dumps({
            "version": __version__, "rollouts": (args.home / "sessions").is_dir(),
            "quotaSocket": socket.exists(), "stateExists": args.state.exists(),
            "platform": os.name, "mode": "local read-only source",
        }, indent=2))
    elif args.command == "demo":
        with tempfile.TemporaryDirectory(prefix="codex-lens-demo-") as path:
            root = Path(path)
            run(demo_home(root), root / "unused.sock", root / "lens", args.port, collect=False)
    elif args.command in ("serve", "manage"):
        kwargs = {
            "collect": not args.no_collect and os.name != "nt",
            "known_account": args.workspace_account_id or os.environ.get("CODEX_LENS_WORKSPACE_ACCOUNT_ID"),
        }
        if args.command == "manage":
            managed(args.home.resolve(), socket.absolute(), args.state.resolve(), args.port, mode=args.update_mode, **kwargs)
        else:
            run(args.home, socket, args.state, args.port, update_mode=args.update_mode, **kwargs)
    else:
        lens = Lens(args.home, socket, args.state)
        stats = lens.get_data("/api/analytics", {"range": args.range, "provider": args.provider})
        quota = lens.get_data("/api/quota", {})
        models = stats["modelCost"]
        if args.line:
            data = [f"Lens {models['totalTokens']:,} tok · {models['turns']:,} req"]
            if args.thread:
                session = lens.get_data("/api/session", {"conversationId": args.thread})
                if session.get("found"):
                    flow = session["liveContext"]
                    hit = session["cacheDiagnostics"]["session"]["hitRatio"]
                    data.insert(0, f"{flow['modelId']} cache {hit:.1%}")
            data.extend(f"{w['windowDurationMins']//60}h {100-w['usedPercent']}% left"
                        for w in quota["windows"] if w.get("windowDurationMins"))
            print(" · ".join(data))
        elif args.json:
            print(json.dumps({"version": __version__, "models": models["models"], "quota": quota,
                              "totalTokens": models["totalTokens"], "costUsd": models["totalCostUsd"]}))
        else:
            print(f"{args.range}: {models['totalTokens']:,} tokens · {models['turns']:,} requests · "
                  f"USD {models['totalCostUsd']:.2f} API-equivalent")
            for window in quota["windows"]:
                print(f"{window['name']} {window['windowDurationMins']}m: {window['usedPercent']}% used")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
