"""Optional read-only MCP App connector for an existing Lens server."""
import base64
import json
import re
import sys
from urllib.parse import urlencode, urlsplit
from urllib.request import urlopen

from . import __version__
from .serve import WEB

URI = "ui://codex-lens/dashboard"
MIME = "text/html;profile=mcp-app"
APIS = {"/api/config", "/api/sessions", "/api/session", "/api/analytics", "/api/observatory",
        "/api/day", "/api/quota", "/api/pricing", "/api/calibration", "/api/performance"}
META = {"ui": {"resourceUri": URI}, "openai/ui": {"entrypoints": [{"type": "thread"}]}}
TOOLS = [
    {"name": "codex_lens_dashboard", "description": "Open the read-only local Codex Lens dashboard.",
     "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False}, "_meta": META},
    {"name": "codex_lens_read", "description": "Read dashboard data directly from the Lens server.",
     "inputSchema": {"type": "object", "properties": {"path": {"type": "string"}},
                     "required": ["path"], "additionalProperties": False},
     "_meta": {"ui": {"resourceUri": URI, "visibility": ["app"]}}},
]


def endpoint(port, path):
    parts = urlsplit(path)
    if len(path) > 4096 or parts.scheme or parts.netloc or parts.path not in APIS:
        raise ValueError("Unsupported dashboard route")
    with urlopen(f"http://127.0.0.1:{port}" + parts.path + ("?" + parts.query if parts.query else ""), timeout=12) as response:
        content = response.read(12 * 1024 * 1024 + 1)
        if len(content) > 12 * 1024 * 1024:
            raise ValueError("Dashboard response is too large")
        return json.loads(content)


def html():
    template = (WEB / "index.html").read_text(encoding="utf-8")
    style = (WEB / "styles.css").read_text(encoding="utf-8")
    logo = base64.b64encode((WEB / "logo.svg").read_bytes()).decode()
    template = template.replace('<link rel="stylesheet" href="/styles.css">', "<style>" + style + "</style>")
    template = template.replace('src="/logo.svg"', 'src="data:image/svg+xml;base64,' + logo + '"')
    bridge = (WEB / "mcp-bridge.js").read_text(encoding="utf-8")
    template = template.replace("<body>", "<body><script>" + bridge + "</script>")
    for script in ("preload.js", "analytics.js", "app.js"):
        source = (WEB / script).read_text(encoding="utf-8")
        template = template.replace(f'<script src="/{script}"></script>', "<script>" + source + "</script>")
    return re.sub(r'<script src="/[^"]+"></script>', "", template)


def call(port, name, args):
    if name == "codex_lens_dashboard":
        data = endpoint(port, "/api/analytics?" + urlencode({"range": "7d"}))["modelCost"]
        msg = f"Local usage in the last 7 days: {data['totalTokens']:,} tokens in {data['turns']:,} requests."
        return {"content": [{"type": "text", "text": msg}],
                "structuredContent": {"tokens": data["totalTokens"], "requests": data["turns"]}}
    if name == "codex_lens_read":
        return {"content": [{"type": "text", "text": "Dashboard data loaded."}],
                "structuredContent": endpoint(port, args["path"])}
    raise ValueError("Unknown Codex Lens tool")


def dispatch(port, method, params):
    if method == "initialize":
        offered = params.get("protocolVersion")
        selected = offered if offered in ("2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25") else "2025-11-25"
        return {"protocolVersion": selected, "capabilities": {"tools": {}, "resources": {}},
                "serverInfo": {"name": "codex-lens", "version": __version__}}
    if method == "ping":
        return {}
    if method == "tools/list":
        return {"tools": TOOLS}
    if method == "resources/list":
        return {"resources": [{"uri": URI, "name": "Codex Lens", "mimeType": MIME}]}
    if method == "resources/templates/list":
        return {"resourceTemplates": []}
    if method == "resources/read" and params.get("uri") == URI:
        return {"contents": [{"uri": URI, "mimeType": MIME, "text": html(), "_meta": {"ui": {"csp": {}}}}]}
    if method == "tools/call":
        try:
            return call(port, params["name"], params.get("arguments") or {})
        except (OSError, ValueError, KeyError, TypeError):
            return {"isError": True, "content": [{"type": "text",
                     "text": "Lens is unavailable. Check that the local server is running and the route is supported."}]}
    raise LookupError(method)


def serve_mcp(port, incoming=None, outgoing=None):
    incoming = sys.stdin if incoming is None else incoming
    outgoing = sys.stdout if outgoing is None else outgoing
    for line in incoming:
        try:
            message = json.loads(line)
        except ValueError:
            outgoing.write(json.dumps({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}}) + "\n")
            outgoing.flush()
            continue
        if not isinstance(message, dict) or "id" not in message:
            continue
        ident = message.get("id")
        try:
            result = dispatch(port, message["method"], message.get("params") or {})
            payload = {"result": result}
        except LookupError:
            payload = {"error": {"code": -32601, "message": "Method or resource not found"}}
        except (KeyError, TypeError, ValueError):
            payload = {"error": {"code": -32602, "message": "Invalid parameters"}}
        outgoing.write(json.dumps({"jsonrpc": "2.0", "id": ident, **payload}) + "\n")
        outgoing.flush()
