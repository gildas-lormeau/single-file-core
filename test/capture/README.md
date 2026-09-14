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

Unlike the SFZ harness, these need `happy-dom`, which is a devDependency, so `npm install` has to
have been run before `npm test`. The version is pinned in `dom.js` as well as in `package.json`. The
runner grants each suite `--allow-env` on top of `--allow-read`, for one reason only: happy-dom pulls
`ws`, whose `buffer-util.js` reads `process.env` at module scope. Nothing in a suite needs it.

`test/*` is ignored by `.gitignore` with one exception per directory, so a new test directory needs
its own `!` line or nothing in it is ever committed.

## The suites

| Script | What it covers |
|---|---|
| `resource-cap.js` | That `maxResourceSize` applies to what the capture fetches and never to the page document itself. A page supplied as content is untouched, a page fetched by `saveRawPage` is untouched, an image over the cap is still dropped, frame content supplied as data is untouched, and a frame fetched in raw mode is still dropped. The raw-page case is a regression test: the cap used to empty the document, so a 2.5 MB page was saved as 525 bytes with no body, exit code 0 and no warning. |
| `stylesheet-dedup.js` | `replaceStylesheets` in `core/lib/processor-helper.js`, the archive-side duplicate-`<style>` path: repeated content becomes one `stylesheet_N.css` referenced by a `<link>` per copy, a sheet with no duplicate stays inline, grouping is by text so differing `media` still shares one file, and `LINK_OWN_ATTRIBUTE_NAMES` keeps a style's own `href` off the link. It uses `captureArchive()` rather than `capture()`, because the helper is selected by `compressContent`. Written to close a coverage hole where 141 of 141 checks passed with the behaviour deliberately changed. |

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

happy-dom is not a browser. `buildTrackIdMap` walks the tree child by child, so a fixture with 100k
siblings overflows the stack — size a fixture with long text in few elements.

It has no layout, so everything in the paragraph above about `getComputedStyle` still holds. And what
it does implement of CSSOM ignores media queries: a rule inside `<style media="print">` computes as
applied on the screen medium, measured in happy-dom and jsdom alike. A test asserting that a
print-only rule does *not* apply would pass for the wrong reason.

XML is not usable either. happy-dom accepts `"text/xml"` where deno-dom threw, but it matches neither
`RDF > Description > originalurl` by local name nor an RDF prefix through `getAttributeNS`, which is
why `maff-metadata.js` still stubs `DOMParser` for that one mime type.

No DOM available under Deno exposes `on*` IDL properties — zero enumerable keys in both happy-dom and
deno-dom — so `removeEmbedScripts` sees an empty handler-attribute set here and a handler fixture
would pass whatever the code did. `script-uri-sanitization.js` says so where it checks the other
half.

## Adding a case

Same rule as the SFZ harness: add checks to the suite that already covers the area rather than making
a file per rule, write the comment that says *why* the rule exists, and confirm the check can fail.
For `resource-cap.js` that was done by reverting the `&& !this.options.rootDocument` conjunct in
`core/index.js`: exactly one check goes red, which is the check that names it.
