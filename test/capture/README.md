# Capture harness

Tests that drive the real capture pipeline — `getPageData()`, `Processor`, `loadPage`, the batch
fetch layer — in Deno, with an injected fetch and a parser instead of a browser. Every resource a
capture asks for is served from a map declared in the suite, so there is no network and no page.

It exists because the [SFZ harness](../sfz-harness/README.md) next door covers the archive writer and
its neighbours, and nothing covered `core/index.js`. A defect in the capture pipeline could only be
caught by driving Chrome from `single-file-cli`, in another repository, against a published build.

Run them with Deno, from the repository root:

```
npm test
```

or this directory alone, through the same runner:

```
deno run --allow-read --allow-run test/run.js capture
```

or one suite at a time, which needs no runner:

```
deno run --allow-read test/capture/resource-cap.js
```

`common.js` and `dom.js` are named in the runner's `NOT_SUITES` list because they assert
nothing. Every other `.js` file here is run.

Unlike the SFZ harness, these download `@b-fuze/deno-dom` from JSR, so a cold cache needs network.
The version is pinned in `dom.js` and `deno.lock` carries its integrity hash, so a cold run fetches
that exact build or fails. `test/*` is ignored by `.gitignore` with one exception per directory, so a
new test directory needs its own `!` line or nothing in it is ever committed.

## The suites

| Script | What it covers |
|---|---|
| `resource-cap.js` | That `maxResourceSize` applies to what the capture fetches and never to the page document itself. A page supplied as content is untouched, a page fetched by `saveRawPage` is untouched, an image over the cap is still dropped, frame content supplied as data is untouched, and a frame fetched in raw mode is still dropped. The raw-page case is a regression test: the cap used to empty the document, so a 2.5 MB page was saved as 525 bytes with no body, exit code 0 and no warning. |

## How it works

`dom.js` installs the globals core reads when its modules are evaluated — `DOMParser`, `Document`,
`window`, `MutationObserver`. Import it before core, which is why `common.js` imports `single-file.js`
dynamically.

`common.js` exports `capture(resources, options)`, which returns the saved page as a string. Two
things about it are forced by core rather than chosen. `init()` builds the util instance once per
process and returns early ever after, so the injected fetch cannot be swapped per capture: one
dispatcher is installed and `capture()` points it at the map for the run in progress. And a capture
that passes no document never runs `preProcessDoc`, so the arrays it would have produced have to be
supplied empty — `processWorklets` and its neighbours read `.length` with no guard.

`frameData(windowId, baseURI, content)` builds the frame data a content script would have captured,
matched to a frame element carrying the same window id. `html(body, head)` wraps a fixture.

## What it cannot test

Anything that reads a live document: `preProcessDoc`, `removeHiddenElements` and its marked elements,
and the `getComputedStyle` callers in `core/infobar.js` and `modules/css-fonts-minifier.js`. Leave
those options off here. The browser rigs in `single-file-cli` and `single-file-tests` cover them.

deno-dom is not a browser parser. It materializes a whole `NodeList` when `children` is read, and
`buildTrackIdMap` walks the tree child by child, so a fixture with 100k siblings overflows the stack.
Size a fixture with long text in few elements.

## Adding a case

Same rule as the SFZ harness: add checks to the suite that already covers the area rather than making
a file per rule, write the comment that says *why* the rule exists, and confirm the check can fail.
For `resource-cap.js` that was done by reverting the `&& !this.options.rootDocument` conjunct in
`core/index.js`: exactly one check goes red, which is the check that names it.
