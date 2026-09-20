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
| `stylesheet-dedup.js` | `replaceStylesheets` in `core/lib/processor-helper.js`, the archive-side duplicate-`<style>` path: repeated content becomes one `stylesheet_N.css` referenced by a `<link>` per copy, a sheet with no duplicate stays inline, grouping is by text so differing `media` still shares one file, and `LINK_OWN_ATTRIBUTE_NAMES` keeps a style's own `href` off the link. It uses `captureArchive()` rather than `capture()`, because the helper is selected by `compressContent`. Written to close a coverage hole where 141 of 141 checks passed with the behaviour deliberately changed. Also which copy is the master: the last one, because identical copies are decided by the last and the minifier computes the cascade at the master's position only, so a same-specificity rule between two copies used to strip the shared file; a block declaring a layer or an import keeps its first copy as master, since the first occurrence sets the layer order. The two `capture()` cases pin the same on the inline helper, whose refs are filled after the master is generated. |
| `font-weight-merge.js` | `groupDuplicateFonts` in `core/lib/processor-helper-inline.js`, which is the only dedup a self-contained file can express for fonts: `var()` is not substituted in an `@font-face` descriptor, so two rules naming the same bytes at two weights each carry a full base64 copy, and merging them into one rule with a weight range is the only way to drop one. Most of the cases are the guards, because CSS Fonts 4 §4.4 makes the declared range clamp the `wght` axis: a weight the page uses strictly inside the interval, another face of the family inside it, an empty `usedFonts`, and a differing `unicode-range` each block the merge, while two subsets of one family merge in lockstep because they are a composite face. |
| `progress-listener.js` | That an embedder's `options.onprogress` cannot stop a capture. The batch queue is armed in two steps — `Runner.initialize` starts the REPLACE_DATA stage without awaiting it, `Runner.run` snapshots the queue a few microtask turns later — and what used to order them was a race between two progress events, so a listener one microtask turn slower on `STAGE_STARTED` than on `RESOURCES_INITIALIZED` left the snapshot empty and the capture hung for ever with no error. `executeStage` now awaits that event at the end of the stage instead of the beginning. Every check races the capture against a timer, because the failure under test is a hang and a suite that hangs stops the runner rather than failing it. |
| `cancel.js` | That cancelling a capture stays quiet. `Runner.initialize` creates the REPLACE_DATA promise and `Runner.run` only awaits it after the whole batch fetch, so between those two points it has no handler: a cancel landing in that window rejects every outstanding request and the engine reports an unhandled rejection for a promise `run()` is about to await. Cancel is the only thing that reaches the window — a listener throwing on `RESOURCE_LOADED` leaves the requests unsettled instead, and a failing fetch never rejects a request at all. The cases cover the window, an early cancel, which skips every task and completes, and a capture nobody cancels. Each counts `unhandledrejection` events, because one let through stops the Deno process rather than failing the suite. |
| `video-posters.js` | `insertVideoPosters`, which writes the frame the content script snapshotted onto `<video poster>`. A snapshot that came out as `data:,` — what `toDataURL` returns for the 0x0 canvas of a video with no decoded frame — is dropped rather than written, a real snapshot is written, and a poster the page declares is never replaced. The first case is a regression test: `poster=data:,` reached saved pages, and because `insertMissingVideoPosters` skips an element that already has a poster, it also blocked the retry that would have produced a real one. |
| `canonical-link.js` | That `insertCanonicalLink` is an option rather than a constant. It was forced to true in `single-file.js` after the options were merged, so it read as an option in three places and could be set from none: the CLI flag was written, measured doing nothing, and removed rather than shipped. It now defaults to true, which is what makes the flag and the extension key mean anything. The href guard is what makes the default safe: a page saved from disk has no canonical URL to point at, and the element is skipped rather than written with a `file:` href. |
| `script-uri-sanitization.js` | The `javascript:` URLs that used to survive `blockScripts`, the option every save turns on to promise that the saved page holds no script. The sanitizer read the resolved IDL property, `element.href` and `element.src`, and rewrote the attribute only when that was a string starting with `javascript:`, so every SVG link escaped (`SVGAElement.href` is an `SVGAnimatedString`) and form submission targets were never looked at. The obfuscations the URL parser folds away are folded here too: leading whitespace, a tab inside the scheme, and the scheme's case. Handler attributes are the half it cannot test, see below. |
| `deferred-content-options.js` | The compatibility shim for the `loadDeferredImages*` option names, renamed `loadDeferredContent*` because they never applied to images only. The old names are public API in two ways core cannot see, a library caller passing them to `getPageData` and another extension passing them through the external capture API, so the suite pins the shim rather than the rename. A `false` or `0` has to survive: testing the deprecated value for truthiness instead of for `undefined` would silently drop every option a user turned off. |
| `maff-metadata.js` | `readMAFFMetaData`, and only what core does with what the XML parser hands back: an attribute that came back null, and which of two almost-identical option fields is written out. It stubs `DOMParser` for `text/xml`, installed before `common.js` imports core, because no DOM available under Deno parses the RDF usefully. The parse itself, matching `RDF > Description > originalurl` by local name and resolving the RDF prefix through `getAttributeNS`, is a property of a real XML DOM that only a browser suite can confirm. |
| `infobar-animations.js` | That the infobar's orange flash and expanding ring are one option, and that a page saved with it off does not carry the animation at all rather than merely failing to reference it: the keyframes are the discriminator. The undefined case is reached only by an embedder, since the extensions and the CLI both send the key, and the quiet reading wins: no key, no animation. |
| `font-payload-sharing.js` | `groupDuplicateFonts` from the resource side. Two `@font-face` rules naming two URLs that serve the same bytes cost one copy inline, where the src is the base64 and `removeAlternativeFonts` sees an identical src, and two in an archive, where `fonts/0.woff2` and `fonts/3.woff2` never match however equal the payloads. Every font whose bytes repeat an earlier one is dropped and its name rewritten to the earlier one's, which is also what makes the second rule's src match the first. The earlier one is the lowest `indexResource`, not the first to arrive, because the map fills in completion order. Measured on nats.io: two byte-identical Roboto subsets under two names. |
| `frame-order.js` | That frames are numbered in document order. A frame used to be named from `resources.frames.size` when its own capture finished, under `Promise.all`, so the frame that finished first took `frames/0/`, and the name goes into the iframe's `src`, so two captures of one unchanged page could disagree about which frame is which. The captures are collected and `processFrame` called in document order afterwards. Both directions are run, because either alone passes whenever the first frame happens to finish first. Also that the frame resource carries the frame's title, which `compression.js` writes into the frame's `manifest.json`; it used to carry name, content, resources and url only. |
| `import-order.js` | That `@import`ed stylesheets are named in document order. The entry used to be inserted into the stylesheets map after its own fetch, under `Promise.all`, so `stylesheet_<n>.css` followed completion order and the `url()` the page reads could swap between two captures of one unchanged page. The entry is now inserted before the fetch, as a top-level `<style>` or `<link>` already was, and a nested import lands after its parent. The checks assert the contents each `url()` resolves to rather than the numbers, and run both directions. |
| `frame-progress.js` | That the `max` reported in RESOURCES_INITIALIZED counts the resources inside frames. `initializeProcessor` used to read the count off the parent's batch request, at a moment in stage 0 when it holds nothing, so a frame contributed zero and the toolbar badge filled early on any page with an iframe. The count now comes from each frame's own `Runner`, read when the root `Processor` initializes. Cases: one frame, a nested frame, and a frame whose resources are registered through its stylesheet rather than its elements; each pairs the reported maximum with the number of RESOURCE_LOADED events that follow. |

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
