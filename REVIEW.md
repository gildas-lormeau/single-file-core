# Review checklist

Each item below starts with a trigger that can be read from a diff. When reviewing a change, check
only the items whose trigger matches. An item says what to check and why it exists. "CI" marks the
checks a workflow already enforces, the others rely on the reviewer.

## What a saved page must keep

- **A pass removes or rewrites something because the saving browser does not support it** (a
  `CSS.supports` test, the font or image format the browser picked, a selector it cannot parse).
  A page is saved in one browser and opened in others, and in later versions of the same one. What
  the saving browser finds dead is kept, unless it is dead in every browser. Size comes second.
- **A change in the pass removing unused styles.** Whole rules only, and a rule the pass cannot
  decide on is kept. A rule that looks unused may be the fallback another browser needs.

## Code written for browsers, tested elsewhere

- **Core code works around the behaviour of the test DOM.** The unit tests run on happy-dom. When it
  differs from browsers, the browser behaviour is measured, core uses the real DOM API, and the
  difference is shimmed in `test/capture/dom.js` with the measurement in a comment.
- **A fix that only a browser can show** (the content of a `template`, shadow roots, layout, fonts
  actually drawn). The unit tests cannot observe it: the test goes into the end-to-end suite of
  single-file-cli, and is committed there with the core update that makes it pass.
- **`Buffer` or another Node.js-only API in library code.** Core runs in browsers, in Deno and in
  Node.js. Use `Uint8Array` and the web APIs.
- **A timer or a wait added to make something work.** No `setTimeout`, no "wait until idle" in
  library code, unless correctness itself needs it, and then the reason is stated.

## Options and consumers

- **A new option, or an option whose meaning changes.** Core is used by the two extensions and by
  the command line tool. Each needs its own plumbing (a default, a control or a switch, a label, the
  help text), and an option without it is unreachable.
- **A change in what is written into saved pages** (attribute names, marker classes, the scripts
  embedded in pages). The annotation editor of the extensions and the pages already saved read them.

## Generated and vendored files

- **A file under `vendor/` changes.** It is build output: the change is made in the sources and the
  file is regenerated with `npm run build`. CI ("Vendor").
- **`package.json` changes the version.** A version bump is its own commit ("bump up version"), made
  at release time and not before.

## Tests

- **A new file under `test/capture/` or `test/sfz-harness/`.** It gets a row in the `README.md` of
  its directory, saying what it covers.
- **A test passes on the first run.** Run it against the code without the fix as well. A test that
  cannot fail proves nothing.
- **A test fails now and then.** It is not retried, skipped or given a delay. The cause is found.

## Code style

- **Any code change.** Tabs, double quotes, semicolons, `npx eslint .` clean. CI ("Lint").
- **A comment is added outside `test/`.** The code is written without comments. The exceptions are
  `// ignored` in an empty `catch` and the eslint directives. Test files do carry comments, which say
  what a case covers and why it exists.
