"""Capture real static files with Chrome and the ordinary SingleFile toolbar action."""
import argparse
import base64
import functools
import json
from pathlib import Path
import subprocess
import threading
from html.parser import HTMLParser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote_to_bytes
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--extension", required=True, type=Path)
parser.add_argument("--output", required=True, type=Path)
parser.add_argument("--mode", required=True, choices=("inline", "archive"))
args = parser.parse_args()
root = args.output.resolve()
root.mkdir()  # A fresh evidence directory prevents results from an earlier capture passing.
for name in ("page", "assets"):
    (root / name).mkdir()
requests = []
lock = threading.Lock()


class StaticFiles(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def log_request(self, code="-", size="-"):
        with lock:
            requests.append({"path": self.path, "status": code})


servers = []
for name in ("page", "assets"):
    server = ThreadingHTTPServer(
        ("127.0.0.1", 0),
        functools.partial(StaticFiles, directory=str(root / name)),
    )
    servers.append(server)
    threading.Thread(target=server.serve_forever, daemon=True).start()
svg = b'<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="red"/></svg>'
(root / "assets/present.svg").write_bytes(svg)
asset = f"http://127.0.0.1:{servers[1].server_port}"
(root / "page/index.html").write_text(f'''<!doctype html><title>Image original URL fallback</title>
<h1>Original available content retained</h1>
<img width="96" height="96" src="{asset}/present.svg">
<img id="same-absolute" width="96" height="96" src="{asset}/absent.png">
<img id="same-relative" width="96" height="96" src="relative-absent.png">
<img id="different" width="96" height="96" src="{asset}/present.svg" srcset="{asset}/selected-absent.png 1x">''')
url = f"http://127.0.0.1:{servers[0].server_port}/index.html"


class Images(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images = {}

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "img" and "id" in attrs:
            self.images[attrs["id"]] = attrs


try:
    with (root / "browser.log").open("w") as log:
        result = subprocess.run(
            ["node", str(Path(__file__).with_suffix(".cjs")), url,
             str(args.extension.resolve()), str(root / "downloads"), args.mode],
            stdout=log, stderr=subprocess.STDOUT, timeout=60,
        )
    assert result.returncode == 0, (result.returncode, root / "browser.log")
    data = json.loads((root / "downloads/result.json").read_text())
    output = Path(data["filename"])
    if args.mode == "archive":
        archive = zipfile.ZipFile(output)
        assert archive.testzip() is None
        content = archive.read("index.html").decode()
    else:
        content = output.read_text()
    assert "Original available content retained" in content
    parsed = Images()
    parsed.feed(content)
    assert parsed.images["same-absolute"]["src"] == "data:,"
    assert parsed.images["same-relative"]["src"] == "data:,"
    source = parsed.images["different"]["src"]
    if args.mode == "archive":
        assert archive.read(source) == svg
    else:
        assert source.startswith("data:image/svg+xml")
        payload = source.split(",", 1)[1]
        assert (base64.b64decode(payload) if ";base64," in source else unquote_to_bytes(payload)) == svg
    absolute = [r for r in requests if r["path"] == "/absent.png"]
    # Chrome can replay the same-origin 404 from memory. Count real CDP requests
    # here: server hits alone hide the repeated original-src fallback.
    relative = [r for r in data["events"] if r["url"].endswith("/relative-absent.png")]
    summary = {"mode": args.mode, "absolute_http_requests": len(absolute),
               "relative_cdp_requests": len(relative), "distinct_src_svg_exact": True,
               "original_text": True, "browser": data["browser"], "extension": data["version"]}
    (root / "requests.json").write_text(json.dumps(requests, indent=2))
    print(json.dumps(summary), flush=True)
    # Initial browser request plus one unchanged fallback chain. Cross-origin:
    # page/referrer, page/no-referrer, extension; same-origin: two page attempts.
    assert len(absolute) == 4, summary
    assert len(relative) == 3, summary
finally:
    for server in servers:
        server.shutdown()
        server.server_close()
