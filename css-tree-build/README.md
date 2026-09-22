# Rebuilding `vendor/css-tree.js`

[`../vendor/css-tree.js`](../vendor/css-tree.js) is a custom build of
[css-tree](https://www.npmjs.com/package/css-tree) with three patches applied
to the npm sources.

`lib/tokenizer/TokenStream.js`: the token offset field is widened from 24 to
27 bits (`OFFSET_MASK`/`TYPE_SHIFT`, with unsigned shifts for the token type).
Upstream css-tree packs each token as `type << 24 | offset`, so any stylesheet
larger than 16MB (2^24 bytes) silently corrupts the token stream and parsing
never terminates. Real pages ship such stylesheets (see
https://github.com/gildas-lormeau/SingleFile/issues/1962, a 23.5MB stylesheet
on brookings.edu). With 27 bits the limit becomes 128MB. Reported upstream as
https://github.com/csstree/csstree/issues/372.

`lib/tokenizer/TokenStream.js`, second patch: `setSource()` clears only the
part of its `balance` buffer it is about to use, `balance.fill(0, 0,
sourceLength + 1)` instead of `balance.fill(0)`. `adoptBuffer` grows that
buffer to fit the largest source ever parsed and never shrinks it, so once a
23.5MB stylesheet has gone through, every later parse zero-fills 94MB whatever
its own size. Measured on the same brookings.edu page: a 60-character selector
took 0.0038ms in a fresh process and 0.96ms after that stylesheet, 255 times
slower, and the unused-styles pass parses one selector at a time — 163,881 of
them on that page. The used range is `[0, sourceLength]`, since there is at
most one token per character and `sourceLength` is the initial balance
sentinel, so the bounded fill covers exactly what the tokenizer reads. The
pass went from 180s to 12s on that page with byte-identical output. Reported upstream as
https://github.com/csstree/csstree/issues/379.

`lib/utils/url.js`: `decode()` trims the whitespace at the end of an unquoted
`url()` before decoding the escapes, so a value ending in an escaped space,
`url(data:x\ )`, is trimmed onto its backslash and a special case for a
backslash in last position then replaced everything decoded so far with what
follows the backslash: the value came out as `" )"`. GitHub's Primer ships
such a value (`--brand-Prose-unorderedList-imageUrl`, an SVG bullet), which
SingleFile then fetched as a relative URL and replaced with an empty
resource. The patch stops the trim at an escaped whitespace, an odd number
of backslashes before it, and appends in the special case instead of
replacing. Reported upstream as https://github.com/csstree/csstree/issues/380.

This directory rebuilds the file deterministically. All dependencies are
pinned to exact versions by `package.json` and `package-lock.json`:

```sh
cd css-tree-build
npm ci
npm run build
git diff --exit-code ../vendor/css-tree.js
```

An empty diff means the checked-in file matches what the sources produce. The
GitHub Actions workflow `.github/workflows/vendor.yml` runs the same steps on
every push.

The patches are applied to the readable npm sources by an esbuild plugin in
`build.js`, each guarded by exact occurrence counts: if a css-tree update
changes a patched file, the build fails loudly instead of silently dropping
the patch. The plugin registers one `onLoad` per patched FILE and applies
every patch for that file in it, because esbuild stops at the first `onLoad`
whose filter matches: two handlers on one file would silently drop the second
patch. The same guard catches that too, and did when the second
`TokenStream.js` patch was added.

## Updating css-tree

1. Bump `css-tree` in `package.json` and run `npm install`.
2. Run `npm run build`. If the build fails because a patched file changed,
   review that patch in `build.js` against the new sources (or drop it once
   upstream has the fix: wider token offsets, the bounded balance fill, or
   the `url()` decoding).
3. Commit the regenerated `../vendor/css-tree.js` together with the changes in
   this directory.
