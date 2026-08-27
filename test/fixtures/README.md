# SFZ test fixtures

Frozen sample archives used by the test suites of the projects consuming
`single-file-core` (single-file-mv3 editor e2e tests, single-file-cli tests).

- `multi-page.zip.html` — 5-page crawl with TOC, unarchived-link markers, no
  duplicate resources (saved with single-file-cli 2.3.1)
- `multi-page-dedup.zip.html` — 4-page crawl where every page shares a
  stylesheet and an image: the manifest has an `aliases` map and the
  `pages/N/` copies are symlink entries
- `single-page.zip.html` — regular single-page self-extracting archive

The fixtures are intentionally frozen. When the archive format evolves, add
new fixtures (see `generate-fixtures.sh`) instead of regenerating these ones,
so that archives produced by older versions stay covered.
