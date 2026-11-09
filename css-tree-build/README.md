# Rebuilding `vendor/css-tree.js`

[`../vendor/css-tree.js`](../vendor/css-tree.js) is a custom build of
[@eslint/css-tree](https://www.npmjs.com/package/@eslint/css-tree), the ESLint
fork of [css-tree](https://www.npmjs.com/package/css-tree), with a token-stream
overlay and URL patches applied to the npm sources. The fork is installed under
the `css-tree` alias in `package.json` and supports nested rules.

`TokenStream.js` replaces the dependency's token stream at build time. Packed
27-bit offsets wrap at 128 MiB, corrupting token types and offsets in large
stylesheets containing embedded resources. The overlay keeps a full 32-bit
offset and token type in an exact Float64 integer, and grows token and balance
buffers by token count rather than source length. Large URLs and comments then
need storage for their tokens, not every character. The root balance sentinel
is handled explicitly so reused buffers cannot introduce stale bracket state.
The dependency source hash is checked before applying the overlay; review it
when upgrading. Its MIT notice is preserved in `TokenStream.LICENSE`.

Token storage uses 12 rather than 8 bytes per allocated slot, a 50% premium
for dense input at equal capacity. Buffers grow geometrically and retain their
capacity for reuse. This trades dense-token memory for correct large offsets
and much smaller allocations on sparse, resource-heavy stylesheets. Regression
suites cover the 128 MiB boundary, dense input, malformed brackets and reuse.
Font loading, timeout and fallback behavior remain unchanged.

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

`lib/utils/url.js`, fourth patch: encoding and decoding append whole unescaped
runs, rather than concatenating every character. A long embedded font/image URL
otherwise creates a rope node per byte. Decoded URLs stay in the AST, and font
processing may serialize them repeatedly, multiplying the live heap and garbage
collection cost. CSS escapes, control characters, and hex separators retain their
existing behavior. The optimization also covers a long safe run after an escaped
prefix, not just entirely safe URLs.

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

1. Bump the version in the `css-tree` alias in `package.json`
   (`npm:@eslint/css-tree@<version>`) and run `npm install`.
2. Run `npm run build`. If the build fails because a patched file changed,
   review that patch in `build.js` against the new sources (or drop it once
   upstream has the fix: wider token offsets, the bounded balance fill, or
   the `url()` decoding).
3. Commit the regenerated `../vendor/css-tree.js` together with the changes in
   this directory.
