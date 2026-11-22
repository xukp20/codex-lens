import json
import tempfile
import threading
import unittest
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from codex_lens.cache import observatory, transitions
from codex_lens.demo import demo_home
from codex_lens.pricing import Pricing, PROMO_END
from codex_lens.quota import quota_cycles
from codex_lens.serve import Handler, Lens
from codex_lens.telemetry import Rollouts


class CoreTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.home = demo_home(self.root)

    def test_persistent_index_and_partial_appends(self):
        path = self.root / "index.sqlite"
        index = Rollouts(self.home, path)
        first = index.update()
        previous = first["demo-thread-1"]
        self.assertEqual(len(previous.rows), 90)
        self.assertEqual(len(previous.snapshots), 90)
        index.close()
        source = self.home / "sessions" / "rollout-demo-thread-1.jsonl"
        data = source.read_bytes().splitlines()
        original = json.loads(next(row for row in reversed(data) if b'"token_count"' in row))
        with source.open("ab") as f:
            f.write(json.dumps(original).encode()[:-3])
        again = Rollouts(self.home, path)
        self.addCleanup(again.close)
        self.assertEqual(len(again.update()["demo-thread-1"].rows), 90)
        with source.open("ab") as f:
            f.write(json.dumps(original).encode()[-3:] + b"\n")
        self.assertEqual(len(again.update()["demo-thread-1"].rows), 90)

    def test_archive_duplicate_does_not_double_count(self):
        archive = self.home / "archived_sessions"
        archive.mkdir()
        source = self.home / "sessions" / "rollout-demo-thread-1.jsonl"
        (archive / source.name).write_bytes(source.read_bytes())
        index = Rollouts(self.home)
        self.addCleanup(index.close)
        self.assertEqual(sum(len(x.rows) for x in index.update().values()), 270)

    def test_cost_threshold_and_speed_promotion(self):
        price = Pricing()
        row = {"source":"openai", "model":"gpt-6.2-sol", "completedAt":PROMO_END-1,
               "tier":"standard", "uncachedIn":10_000, "cacheRead":262_000, "totalOut":100, "cacheCreate":0}
        low = price.price(row)
        self.assertFalse(low["longContext"])
        self.assertTrue(price.price({**row, "uncachedIn":10_001})["longContext"])
        self.assertAlmostEqual(price.price({**row, "tier":"ultrafast"})["costUsd"], low["costUsd"]*3)
        self.assertAlmostEqual(price.price({**row, "tier":"ultrafast", "completedAt":PROMO_END})["costUsd"], low["costUsd"]*6)
        self.assertIsNone(price.price({**row, "source":"krill-code"})["costUsd"])
        self.assertTrue(price.price({**row, "cacheCreate":150})["unverifiedWrite"])

    def test_cache_transition_compaction_and_gap_types(self):
        index = Rollouts(self.home)
        self.addCleanup(index.close)
        data = index.update()
        events = transitions(data["demo-thread-1"].rows)
        self.assertTrue(any(row["recovered"] for row in events))
        self.assertTrue(any(row["idleMs"] is None for row in events))
        self.assertTrue(any(row["idleMs"] is not None for row in events))
        rows = [dict(row, epoch=i) for i,row in enumerate(data["demo-thread-1"].rows)]
        self.assertEqual(transitions(rows), [])
        start = min(row["time"] for row in events)
        end = max(row["time"] for row in events) + 1
        result = observatory(data, start, end, "openai", gap="recorded")
        self.assertEqual(len(result["matrix"]), 2)
        self.assertTrue(result["timeline"])
        self.assertEqual(len(result["compare"]), 4)

    def test_quota_windows_and_unattributed_usage(self):
        index = Rollouts(self.home)
        self.addCleanup(index.close)
        data = index.update()
        sample = data["demo-thread-1"]
        rows = [r for thread in data.values() for r in thread.rows]
        now = sample.snapshots[-1]["sampledAt"]
        window = quota_cycles(sample.snapshots, rows, now=now)[0]
        self.assertEqual(len(window["anchors"]), 30)
        e = window["estimate"]
        self.assertLess(e["low"], e["equivalentUsd"])
        self.assertGreater(e["high"], e["equivalentUsd"])
        missing = quota_cycles(sample.snapshots, [dict(r, account=None) for r in rows], now=now)[0]
        self.assertIsNone(missing["estimate"])

    def test_http_assets_and_primary_routes(self):
        lens = Lens(self.home, self.root/"none.sock", self.root/"state")
        self.addCleanup(lens.rollouts.close)
        self.addCleanup(lens.snapshots_db.close)
        with ThreadingHTTPServer(("127.0.0.1", 0), partial(Handler, lens)) as server:
            thread = threading.Thread(target=server.serve_forever)
            thread.start()
            try:
                base = "http://127.0.0.1:" + str(server.server_port)

                def get(path):
                    with urlopen(base+path, timeout=3) as response:
                        return response.read()

                self.assertIn(b"analytics.js", get("/"))
                self.assertIn(b"LensAnalytics", get("/analytics.js"))
                self.assertEqual(len(json.loads(get("/api/sessions"))["threads"]), 3)
                self.assertTrue(json.loads(get("/api/quota"))["cycles"][0]["estimate"])
                item = json.loads(get("/api/session?conversationId=demo-thread-1"))
                self.assertEqual(item["ioFlow"]["userTurns"], 30)
                self.assertEqual(item["ioFlow"]["turns"], 90)
                self.assertTrue(json.loads(get("/api/observatory?gap=recorded"))["summary"]["n"])
                with self.assertRaises(HTTPError) as exc:
                    urlopen(Request(base+"/api/sessions", headers={"Host":"external.invalid"}), timeout=2)
                self.assertEqual(exc.exception.code, 403)
            finally:
                server.shutdown()
                thread.join()
