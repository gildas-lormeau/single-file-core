# Rebuilding `vendor/css-tree.js`

[`../vendor/css-tree.js`](../vendor/css-tree.js) is a custom build of
[css-tree](https://www.npmjs.com/package/css-tree) with two patches applied to
the npm sources.

`lib/tokenizer/TokenStream.js`: the token offset field is widened from 24 to
27 bits (`OFFSET_MASK`/`TYPE_SHIFT`, with unsigned shifts for the token type).
Upstream css-tree packs each token as `type << 24 | offset`, so any stylesheet
larger than 16MB (2^24 bytes) silently corrupts the token stream and parsing
never terminates. Real pages ship such stylesheets (see
https://github.com/gildas-lormeau/SingleFile/issues/1962, a 23.5MB stylesheet
on brookings.edu). With 27 bits the limit becomes 128MB. Reported upstream as
https://github.com/csstree/csstree/issues/372.

`lib/utils/url.js`: `decode()` trims the whitespace at the end of an unquoted
`url()` before decoding the escapes, so a value ending in an escaped space,
`url(data:x\ )`, is trimmed onto its backslash and a special case for a
backslash in last position then replaced everything decoded so far with what
follows the backslash: the value came out as `" )"`. GitHub's Primer ships
such a value (`--brand-Prose-unorderedList-imageUrl`, an SVG bullet), which
SingleFile then fetched as a relative URL and replaced with an empty
resource. The patch stops the trim at an escaped whitespace, an odd number
of backslashes before it, and appends in the special case instead of
replacing.

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
the patch.

## Updating css-tree

1. Bump `css-tree` in `package.json` and run `npm install`.
2. Run `npm run build`. If the build fails because a patched file changed,
   review that patch in `build.js` against the new sources (or drop it once
   upstream has the fix: wider token offsets, or the `url()` decoding).
3. Commit the regenerated `../vendor/css-tree.js` together with the changes in
   this directory.
