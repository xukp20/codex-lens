import io
import json
import tempfile
import threading
import unittest
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path

from codex_lens.demo import demo_home
from codex_lens.mcp import MIME, URI, dispatch, serve_mcp
from codex_lens.performance import percentile
from codex_lens.serve import Handler, Lens


class IntegrationTests(unittest.TestCase):
    def test_resource_and_stdio_negotiation(self):
        calls = [
            {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25"}},
            {"jsonrpc":"2.0","method":"notifications/initialized"},
            {"jsonrpc":"2.0","id":2,"method":"tools/list"},
            {"jsonrpc":"2.0","id":3,"method":"resources/read","params":{"uri":URI}},
        ]
        inp = io.StringIO("\n".join(map(json.dumps,calls)))
        out = io.StringIO()
        serve_mcp(4318, inp, out)
        first, tools, resource = [json.loads(line)["result"] for line in out.getvalue().splitlines()]
        self.assertIn("resources", first["capabilities"])
        self.assertEqual(tools["tools"][0]["_meta"]["openai/ui"]["entrypoints"], [{"type":"thread"}])
        self.assertEqual(resource["contents"][0]["mimeType"], MIME)
        text = resource["contents"][0]["text"]
        self.assertIn("ui/initialize", text)
        self.assertIn("window.sidecar", text)
        self.assertNotIn('src="/app.js"',text)

    def test_performance_and_read_only_mcp(self):
        with tempfile.TemporaryDirectory() as root:
            directory = Path(root)
            home = demo_home(directory)
            worker = home/"sessions"/"rollout-demo-thread-3.jsonl"
            lines = worker.read_text(encoding="utf-8").splitlines()
            row = json.loads(lines[0])
            row["payload"]["source"] = {"subagent":{"thread_spawn":{"parent_thread_id":"demo-thread-1"}}}
            lines[0] = json.dumps(row)
            worker.write_text("\n".join(lines) + "\n", encoding="utf-8")
            lens = Lens(home,directory/"unused.sock",directory/"state")
            try:
                with ThreadingHTTPServer(("127.0.0.1",0), partial(Handler,lens)) as server:
                    runner = threading.Thread(target=server.serve_forever)
                    runner.start()
                    try:
                        call = lambda path: dispatch(server.server_port,"tools/call",{
                            "name":"codex_lens_read","arguments":{"path":path}})
                        data = call("/api/performance?thread=demo-thread-1")["structuredContent"]
                        self.assertGreater(data["attribution"]["worker"],0)
                        self.assertEqual(len(data["models"]),2)
                        self.assertTrue(all(row["ttftMs"]["n"] == 30 for row in data["models"]))
                        self.assertTrue(call("/api/update/apply")["isError"])
                        self.assertTrue(call("https://example.com/api/quota")["isError"])
                    finally:
                        server.shutdown()
                        runner.join()
            finally:
                lens.rollouts.close()
                lens.snapshots_db.close()
        self.assertEqual(percentile([0,10,20],.9),18)
