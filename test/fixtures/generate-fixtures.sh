#!/bin/sh
# Regenerates the frozen SFZ fixtures from the sites in site/.
# Requires single-file-cli in PATH (or set SINGLE_FILE) and python3.
# Fixtures are intentionally frozen: when the archive format evolves,
# add NEW fixtures instead of regenerating these, so older archives
# keep being covered.
set -e
cd "$(dirname "$0")"
SINGLE_FILE="${SINGLE_FILE:-single-file}"
PORT=8934
serve() {
	(cd "site/$1" && python3 -m http.server $PORT > /dev/null 2>&1 & echo $! > /tmp/sf-fixture-server.pid)
	sleep 1
}
stop() {
	kill "$(cat /tmp/sf-fixture-server.pid)" 2>/dev/null || true
}
serve multi-page
"$SINGLE_FILE" "http://localhost:$PORT/" multi-page.zip.html \
	--crawl-links --crawl-max-depth 2 --compress-content --self-extracting-archive \
	--crawl-save-archive --crawl-save-archive-dedup --crawl-save-archive-toc \
	--crawl-save-archive-mark-unarchived-links
"$SINGLE_FILE" "http://localhost:$PORT/alpha.html" single-page.zip.html \
	--compress-content --self-extracting-archive
stop
serve multi-page-dedup
"$SINGLE_FILE" "http://localhost:$PORT/" multi-page-dedup.zip.html \
	--crawl-links --crawl-max-depth 2 --compress-content --self-extracting-archive \
	--crawl-save-archive --crawl-save-archive-dedup --crawl-save-archive-toc \
	--crawl-save-archive-mark-unarchived-links
stop
