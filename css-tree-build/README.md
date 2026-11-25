# Rebuilding `vendor/css-tree.js`

[`../vendor/css-tree.js`](../vendor/css-tree.js) is a custom build of
[@eslint/css-tree](https://www.npmjs.com/package/@eslint/css-tree), the ESLint
fork of [css-tree](https://www.npmjs.com/package/css-tree), with one patch
applied to the npm sources. The fork is installed under the `css-tree` alias in
`package.json`. It is maintained where upstream is not, and it parses nested
rules that upstream 3.2.1 kept as raw text.

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

Three earlier patches are gone since 4.1.4, which has them: the token offset
field widened from 24 to 27 bits (a stylesheet larger than 16MB never finished
parsing, see https://github.com/gildas-lormeau/SingleFile/issues/1962), the
`balance` buffer cleared only over the part in use (every parse paid for the
largest source ever parsed), both fixed by
https://github.com/eslint/csstree/pull/179, and `url()` encoding and decoding
that append whole runs instead of one character at a time. Since that
version, a source longer than 134,217,727 UTF-16 code units throws a
`RangeError` instead of corrupting the token stream.

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

A patch is applied to the readable npm sources by an esbuild plugin in
`build.js`, guarded by exact occurrence counts: if a css-tree update
changes a patched file, the build fails loudly instead of silently dropping
the patch. The plugin registers one `onLoad` per patched FILE and applies
every patch for that file in it, because esbuild stops at the first `onLoad`
whose filter matches: two handlers on one file would silently drop the second
patch. The same guard catches that too, and did when the second
`TokenStream.js` patch was added.

## Updating css-tree

1. Bump the version in the `css-tree` alias in `package.json`
   (`npm:@eslint/css-tree@<version>`) and run `npm install`.
2. Run `npm run build`. If the build fails because the patched file changed,
   review the patch in `build.js` against the new sources (or drop it once
   upstream has the `url()` decoding fix).
3. Commit the regenerated `../vendor/css-tree.js` together with the changes in
   this directory.
