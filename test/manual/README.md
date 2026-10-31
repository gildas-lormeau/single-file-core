# Image original-URL fallback in real Chrome

This standalone regression uses Chrome, an unpacked SingleFile extension and its
ordinary toolbar action. Python's standard static-file server serves a real SVG;
the missing images do not exist on disk. It does not intercept requests or replace
fetch, DOM, extension, or protocol APIs. It is intentionally outside the Deno test
runner: the extension and Chrome are explicit local prerequisites.

Prerequisites: Python 3, Node, Puppeteer 25.16.0 (or a compatible version supporting
`browser.installExtension` and `page.triggerExtensionAction`), Chrome for Testing
156, and an unpacked SingleFile extension. Tests were run with SingleFile 1.33.0.
Install Puppeteer in a disposable tools directory, then point `NODE_PATH` at its
`node_modules` and `CHROME_BINARY` at Chrome's executable.

From the single-file-core source directory:

```sh
uv run --no-project python test/manual/image-origin.py \
  --extension /absolute/path/to/unpacked-singlefile \
  --output /absolute/path/to/fresh-inline-evidence --mode inline
uv run --no-project python test/manual/image-origin.py \
  --extension /absolute/path/to/unpacked-singlefile \
  --output /absolute/path/to/fresh-archive-evidence --mode archive
```

Each output directory must not exist before the command. The script uses an
isolated temporary Chrome profile and closes its browser and HTTP servers. The
saved HTML/ZIP, browser log, HTTP request list, and passive CDP request list remain
in the evidence directory. No existing browser profile is used.

To test changed core source, build it into a disposable copy of the unpacked
extension using SingleFile's normal Rollup recipe for `lib/single-file.js`:
`single-file.js` input, `@rollup/plugin-node-resolve`, UMD output named `singlefile`,
and `@rollup/plugin-terser`. The unchanged extension code and other bundles remain
in place. Run both modes against the original extension and rebuilt copy. Do not
modify the extension installed in your normal browser.

Expected regression results (Chrome 156 / SingleFile 1.33):

| Build | Absolute missing image HTTP requests | Equivalent relative URL CDP requests |
| --- | ---: | ---: |
| Original | 7 (fails) | 5 |
| Fixed | 4 | 3 |

The initial browser image request is included. The cross-origin fallback chain
still tries the page with its referrer, the page without it, and the extension
background. The same-origin case still tries both page contexts. Its 404 can be
served from browser memory, so server hits alone cannot measure duplicate fetch
attempts; the test counts passive CDP requests for that case.

Both modes also require original page text and exact SVG bytes through a genuinely
different `currentSrc` (failed srcset candidate) -> original `src` fallback. Missing
images remain empty, not fabricated successes. Archive mode additionally checks
ZIP CRCs and resolves the saved image reference to its exact archived bytes.
