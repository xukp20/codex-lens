"""Verified GitHub releases for the optional managed Lens process."""
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener, urlopen

from . import __version__

REPO = "xukp20/codex-lens"
METADATA = f"https://api.github.com/repos/{REPO}/releases/latest"
HOSTS = {"api.github.com", "github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"}
TAG = re.compile(r"v([0-9]+)\.([0-9]+)\.([0-9]+)\Z")
CHECK_SECONDS = 6 * 3600
IO_LIMIT = 32 * 1024 * 1024


def version(tag):
    match = TAG.fullmatch(tag)
    return tuple(map(int, match.groups())) if match else None


def allowed(url):
    parts = urlsplit(url)
    return parts.scheme == "https" and parts.hostname in HOSTS and parts.port in (None, 443) and not parts.username


class Redirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not allowed(newurl):
            raise ValueError("Untrusted release download redirect")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def read_json(path, fallback=None):
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else dict(fallback or {})
    except (OSError, ValueError):
        return dict(fallback or {})


def atomic_json(path, value):
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as stream:
        tmp = Path(stream.name)
        json.dump(value, stream)
        stream.flush()
        os.fsync(stream.fileno())
    try:
        tmp.replace(path)
    finally:
        tmp.unlink(missing_ok=True)


def _download(url, path, limit):
    if not allowed(url):
        raise ValueError("Untrusted release download URL")
    opener = build_opener(Redirects())
    request = Request(url, headers={"User-Agent": "codex-lens/" + __version__})
    with opener.open(request, timeout=15) as response, path.open("wb") as out:
        left = limit
        while block := response.read(1 << 16):
            left -= len(block)
            if left < 0:
                raise ValueError("Release asset exceeds size limit")
            out.write(block)


def bounded_download(url, path, *, timeout=60, limit=IO_LIMIT, attempts=2):
    cmd = [sys.executable, "-m", "codex_lens.updater", "download", url, str(path), str(limit)]
    for _ in range(attempts):
        try:
            # The parent controls the whole operation, including a stalled body read.
            subprocess.run(cmd, timeout=timeout, check=True, capture_output=True)
            return
        except (subprocess.TimeoutExpired, subprocess.CalledProcessError) as err:
            path.unlink(missing_ok=True)
            failure = err
    if isinstance(failure, subprocess.TimeoutExpired):
        raise RuntimeError(f"Release download exceeded {timeout}s") from failure
    raise RuntimeError("Release download failed") from failure


def wheel_digest(sums, wheel):
    for line in sums.splitlines():
        parts = line.split(maxsplit=1)
        if len(parts) == 2 and parts[1].removeprefix("*").removeprefix("./") == wheel:
            if re.fullmatch("[0-9a-fA-F]{64}", parts[0]):
                return parts[0].lower()
    raise ValueError("Missing wheel SHA-256 in release manifest")


def child_env(path):
    env = os.environ.copy()
    if path is not None:
        old = env.get("PYTHONPATH")
        env["PYTHONPATH"] = str(path) + (os.pathsep + old if old else "")
    return env


def unused_port():
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


def healthy(port, expected, process, timeout=15):
    end = time.monotonic() + timeout
    while time.monotonic() < end and process.poll() is None:
        try:
            with urlopen(f"http://127.0.0.1:{port}/api/health", timeout=1) as reply:
                result = json.load(reply)
                if result["ok"] and result["version"] == expected:
                    return True
        except (OSError, ValueError, KeyError):
            pass
        time.sleep(.15)
    return False


def stop(process):
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(4)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()


def smoke(candidate, expected):
    port = unused_port()
    with tempfile.TemporaryDirectory(prefix="lens-update-smoke-") as cwd:
        process = subprocess.Popen(
            [sys.executable, "-m", "codex_lens", "demo", "--port", str(port)],
            cwd=cwd, env=child_env(candidate), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        try:
            if not healthy(port, expected, process):
                raise RuntimeError("Candidate failed to start")
            with urlopen(f"http://127.0.0.1:{port}/api/sessions", timeout=5) as reply:
                if len(json.load(reply).get("threads", ())) != 3:
                    raise RuntimeError("Candidate failed the synthetic sessions check")
            with urlopen(f"http://127.0.0.1:{port}/", timeout=3) as reply:
                if b"Codex Lens" not in reply.read():
                    raise RuntimeError("Candidate failed the dashboard check")
        finally:
            stop(process)


class Updates:
    def __init__(self, directory, enabled):
        self.directory = directory
        self.enabled = enabled
        self.lock = threading.RLock()

    @property
    def journal(self):
        return self.directory / "updates.json"

    @property
    def deployment(self):
        return self.directory / "deployment.json"

    def status(self):
        stored = read_json(self.journal)
        deployment = read_json(self.deployment)
        return {k: v for k, v in stored.items() if k != "assets"} | {
            "version": __version__, "managed": self.enabled,
            "previous": deployment.get("previous"), "blocked": deployment.get("blocked"),
        }

    def check(self):
        with self.lock, tempfile.TemporaryDirectory(prefix="lens-check-") as working:
            path = Path(working) / "release.json"
            bounded_download(METADATA, path, timeout=20, limit=1 << 20)
            raw = read_json(path)
            candidate = raw.get("tag_name", "")
            if raw.get("draft") or raw.get("prerelease") or not version(candidate):
                raise ValueError("No stable release metadata")
            newest = version(candidate) > (version("v" + __version__) or (0, 0, 0))
            old = read_json(self.journal)
            info = {
                "latest": candidate if newest else None, "checkedAt": int(time.time()),
                "notes": str(raw.get("body") or "")[:12000],
                "url": f"https://github.com/{REPO}/releases/tag/{candidate}",
                "assets": {item["name"]: item["browser_download_url"] for item in raw.get("assets", [])},
                "staged": old.get("staged") if old.get("staged") == candidate else None,
            }
            atomic_json(self.journal, info)
            return self.status()

    def stage(self):
        if not self.enabled:
            raise ValueError("Start the managed Lens to stage an update")
        with self.lock:
            info = read_json(self.journal)
            tag = info.get("latest")
            if not tag or not version(tag) or version(tag) <= (version("v" + __version__) or (0, 0, 0)):
                raise ValueError("Check for a newer stable release first")
            name = f"codex_lens-{tag[1:]}-py3-none-any.whl"
            assets = info.get("assets", {})
            if name not in assets or "SHA256SUMS" not in assets:
                raise ValueError("Release wheel or checksum manifest is unavailable")
            releases = self.directory / "releases"
            releases.mkdir(exist_ok=True)
            candidate = releases / tag
            if not candidate.is_dir():
                with tempfile.TemporaryDirectory(dir=releases, prefix="stage-") as working:
                    work = Path(working)
                    manifest = work / "SHA256SUMS"
                    wheel = work / name
                    bounded_download(assets["SHA256SUMS"], manifest, limit=1 << 16)
                    bounded_download(assets[name], wheel)
                    checksum = wheel_digest(manifest.read_text(encoding="utf-8"), name)
                    if hashlib.sha256(wheel.read_bytes()).hexdigest() != checksum:
                        raise ValueError("Release wheel checksum mismatch")
                    install = work / "candidate"
                    subprocess.run([sys.executable, "-m", "pip", "install", "--no-deps", "--no-index",
                                    "--target", str(install), str(wheel)],
                                   capture_output=True, check=True, timeout=60)
                    smoke(install, tag[1:])
                    install.replace(candidate)
            info["staged"] = tag
            atomic_json(self.journal, info)
            return self.status()

    def request(self, operation):
        if not self.enabled:
            raise ValueError("Start the managed Lens to apply updates")
        with self.lock:
            deployment = read_json(self.deployment)
            current = deployment.get("active", "bundled")
            wanted = read_json(self.journal).get("staged") if operation == "apply" else deployment.get("previous")
            if not wanted or wanted == current:
                raise ValueError("No alternate release is prepared")
            atomic_json(self.directory / "update-action.json", {"operation": operation, "target": wanted})
            return {"pending": wanted}


def deployment_value(state, target, *, rollback=False, healthy_candidate=True):
    active = state.get("active", "bundled")
    if not healthy_candidate:
        return {**state, "blocked": target}
    return {"active": target, "previous": active, "blocked": active if rollback else None}


def managed(home, socket_path, state, port, *, collect=True, mode="notify", known_account=None):
    state.mkdir(parents=True, exist_ok=True)
    journal = state / "deployment.json"
    action = state / "update-action.json"
    deployment = read_json(journal, {"active": "bundled"})
    base_version = __version__

    def launch(tag):
        folder = None if tag == "bundled" else state / "releases" / tag
        if folder is not None and (not version(tag) or not folder.is_dir()):
            raise RuntimeError("Managed release directory is missing")
        env = child_env(folder)
        env["CODEX_LENS_MANAGED_CHILD"] = "1"
        cmd = [sys.executable, "-m", "codex_lens", "serve", "--home", str(home), "--socket", str(socket_path),
               "--state", str(state), "--port", str(port), "--update-mode", mode]
        if not collect:
            cmd.append("--no-collect")
        if known_account:
            env["CODEX_LENS_WORKSPACE_ACCOUNT_ID"] = known_account
        child = subprocess.Popen(cmd, env=env)
        if not healthy(port, base_version if tag == "bundled" else tag[1:], child):
            stop(child)
            raise RuntimeError(f"Managed release {tag} did not become healthy")
        return child

    child = None
    locksock = socket.socket()
    # Refuse an occupied app port before launching the first worker.
    try:
        locksock.bind(("127.0.0.1", port))
    finally:
        locksock.close()

    def terminate(_signum, _frame):
        raise KeyboardInterrupt

    sigterm = signal.signal(signal.SIGTERM, terminate)
    saved = read_json(state / "preview-settings.json").get("updateMode", mode)
    staged = read_json(state / "updates.json").get("staged")
    if (saved == "auto" and staged and version(staged)
            and staged not in (deployment.get("active"), deployment.get("blocked"))
            and (deployment.get("active", "bundled") == "bundled" or version(staged) > version(deployment["active"]))):
        atomic_json(action, {"operation": "apply", "target": staged})
    try:
        try:
            child = launch(deployment.get("active", "bundled"))
        except RuntimeError:
            active = deployment.get("active", "bundled")
            restore = deployment.get("previous")
            if not restore or restore == active:
                raise
            child = launch(restore)
            deployment = deployment_value(deployment, restore, rollback=True)
            atomic_json(journal, deployment)
        while child.poll() is None:
            time.sleep(.5)
            request = read_json(action)
            if not request:
                continue
            action.unlink(missing_ok=True)
            target = request.get("target", "")
            previous = deployment.get("active", "bundled")
            if target == previous or (target != "bundled" and not version(target)):
                continue
            if target not in (read_json(state / "updates.json").get("staged"), deployment.get("previous")):
                continue
            stop(child)
            try:
                child = launch(target)
                deployment = deployment_value(deployment, target, rollback=request["operation"] == "rollback")
            except RuntimeError:
                child = launch(previous)
                deployment = deployment_value(deployment, target, healthy_candidate=False)
            atomic_json(journal, deployment)
    finally:
        signal.signal(signal.SIGTERM, sigterm)
        if child is not None:
            stop(child)


if __name__ == "__main__":
    command, url, name, limit = sys.argv[1:]
    if command != "download":
        raise SystemExit(2)
    _download(url, Path(name), int(limit))
