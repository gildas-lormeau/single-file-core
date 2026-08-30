# SFZ format harness

Tests for the SingleFile archive writer in `processors/compression/`. They drive
`process()` directly with synthetic page data, so they need no browser and no network.
The format itself is specified in [`doc/singlefile-archive.md`](../../doc/singlefile-archive.md).

Run them with Deno, from the repository root:

```
npm test
```

or one at a time:

```
deno run --allow-read test/sfz-harness/format-rules.js
```

## The suites

CI runs these. Each prints one `PASS`/`FAIL` line per check and exits non-zero if
any check failed.

| Script | What it covers |
|---|---|
| `format-rules.js` | The rules of the format: charset round trip, the wrapper-tag ladder and its selection tests, the identifier, appended-data placement and declaration, password scope, the PDF and PNG faces. |
| `stored-trigger.js` | That a stored (uncompressed) entry whose bytes contain a rung's pattern moves the writer to the right rung. |
| `check-determinism.js` | That the same inputs produce the same bytes, and that the levers which should change the output do. |
| `option-wiring.js` | That every option `compression.js` reads is either declared as a caller option or classified as internal, and that `single-file.js` still builds its argument from that declaration. Guards the layer the other suites sit below. |
| `css-property-filter.js` | That the declaration filter keeps a property css-tree's dictionary does not know (`stop-color`, `flood-opacity`, anything newer than the pinned build) and still drops a genuinely invalid value. |
| `adopted-stylesheets-hook.js` | That the page-world hook answers the adopted-stylesheets request for a CLOSED shadow root, which its host does not expose. |
| `css-fonts-var.js` | That `removeUnusedFonts` resolves a `var()` font family from the values the document declares, not only from the ones the body inherits, and that it still keeps every font when the value is genuinely undetermined. |

## The tools

Not tests — they print, they do not assert, and CI does not run them.

| Script | Use |
|---|---|
| `smoke.js` | Build one archive and print its size, chosen rung and first 200 bytes. |
| `search-triggers.js` | Search seeds for page data that triggers a given condition. Its results are `trigger-seeds.json`. |
| `gen-e2e-page.js` | Write a page fixture to disk for end-to-end use. |

`common.js` builds the synthetic page data and options; `dom-stub.js` supplies the
minimum DOM the compression code touches, because Deno has no `DOMParser`. Import it
first — `compression.js` reads `globalThis.DOMParser` when it loads.

## Adding a test

Add checks to the suite that already covers the area, rather than creating a file per
rule. A check is one line:

```js
check("the label that appears in the output", actual, expected);
```

Two things are worth doing every time. Write the comment that says *why* the rule
exists, not what the code does — several rules here look arbitrary until you know which
tokenizer state or which reader made them necessary. And confirm the test can fail:
break the rule in `compression.js`, watch the check go red, then put it back. A check
that passes against a deliberately broken writer is protecting nothing, which is how
the case-insensitivity of the rung patterns went untested for as long as it did.
