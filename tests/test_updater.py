import hashlib
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from codex_lens.updater import allowed, atomic_json, bounded_download, deployment_value, read_json, wheel_digest


class UpdateTests(unittest.TestCase):
    def test_authentic_scheme_hosts_and_exact_manifest_name(self):
        self.assertTrue(allowed("https://github.com/xukp20/codex-lens"))
        self.assertFalse(allowed("http://github.com/xukp20/codex-lens"))
        self.assertFalse(allowed("https://github.com@elsewhere.invalid/release"))
        sha = hashlib.sha256(b"sample").hexdigest()
        self.assertEqual(wheel_digest(f"{sha}  ./lens.whl\n", "lens.whl"), sha)
        with self.assertRaises(ValueError):
            wheel_digest(f"{sha}  ./lens.whl\n", "lens-two.whl")

    def test_entire_transfer_timeout_removes_partial_file(self):
        with tempfile.TemporaryDirectory() as data:
            path = Path(data) / "candidate"
            path.write_bytes(b"headers completed, body stalled")
            with patch("codex_lens.updater.subprocess.run", side_effect=subprocess.TimeoutExpired("read", 60)) as download:
                with self.assertRaisesRegex(RuntimeError, "exceeded 60s"):
                    bounded_download("https://github.com/xukp20/codex-lens", path)
            self.assertEqual(download.call_count, 2)
            self.assertEqual(download.call_args.kwargs["timeout"], 60)
            self.assertFalse(path.exists())

    def test_atomic_pointer_and_rollback_block(self):
        first = {"active":"bundled"}
        second = deployment_value(first,"v1.3.0")
        self.assertEqual(second["previous"], "bundled")
        rejected = deployment_value(first,"v1.3.0", healthy_candidate=False)
        self.assertEqual(rejected["active"], "bundled")
        self.assertEqual(rejected["blocked"], "v1.3.0")
        rolled_back = deployment_value(second,"bundled", rollback=True)
        self.assertEqual(rolled_back["active"], "bundled")
        self.assertEqual(rolled_back["blocked"], "v1.3.0")
        with tempfile.TemporaryDirectory() as data:
            path = Path(data) / "deployment.json"
            atomic_json(path, rolled_back)
            self.assertEqual(read_json(path), rolled_back)
