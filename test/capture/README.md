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
| `font-weight-merge.js` | `groupDuplicateFonts` in `core/lib/processor-helper-inline.js`, which is the only dedup a self-contained file can express for fonts: `var()` is not substituted in an `@font-face` descriptor, so two rules naming the same bytes at two weights each carry a full base64 copy, and merging them into one rule with a weight range is the only way to drop one. Most of the cases are the guards, because CSS Fonts 4 §4.4 makes the declared range clamp the `wght` axis: a weight the page uses strictly inside the interval, another face of the family inside it, an empty `usedFonts`, and a differing `unicode-range` each block the merge, while two subsets of one family merge in lockstep because they are a composite face. |
| `progress-listener.js` | That an embedder's `options.onprogress` cannot stop a capture. The batch queue is armed in two steps — `Runner.initialize` starts the REPLACE_DATA stage without awaiting it, `Runner.run` snapshots the queue a few microtask turns later — and what used to order them was a race between two progress events, so a listener one microtask turn slower on `STAGE_STARTED` than on `RESOURCES_INITIALIZED` left the snapshot empty and the capture hung for ever with no error. `executeStage` now awaits that event at the end of the stage instead of the beginning. Every check races the capture against a timer, because the failure under test is a hang and a suite that hangs stops the runner rather than failing it. |
| `cancel.js` | That cancelling a capture stays quiet. `Runner.initialize` creates the REPLACE_DATA promise and `Runner.run` only awaits it after the whole batch fetch, so between those two points it has no handler: a cancel landing in that window rejects every outstanding request and the engine reports an unhandled rejection for a promise `run()` is about to await. Cancel is the only thing that reaches the window — a listener throwing on `RESOURCE_LOADED` leaves the requests unsettled instead, and a failing fetch never rejects a request at all. The cases cover the window, an early cancel, which skips every task and completes, and a capture nobody cancels. Each counts `unhandledrejection` events, because one let through stops the Deno process rather than failing the suite. |
| `video-posters.js` | `insertVideoPosters`, which writes the frame the content script snapshotted onto `<video poster>`. A snapshot that came out as `data:,` — what `toDataURL` returns for the 0x0 canvas of a video with no decoded frame — is dropped rather than written, a real snapshot is written, and a poster the page declares is never replaced. The first case is a regression test: `poster=data:,` reached saved pages, and because `insertMissingVideoPosters` skips an element that already has a poster, it also blocked the retry that would have produced a real one. |

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
