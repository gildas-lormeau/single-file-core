# CSS-tree build and TokenStream changes

This directory builds SingleFile's existing `vendor/css-tree.js` from
`@eslint/css-tree` **4.1.1**, using the dependency versions in `package-lock.json`.
It adds one copied dependency source file: `TokenStream.js`.

## Copied source and unchanged code

`TokenStream.js` is based on
[`lib/tokenizer/TokenStream.js` at CSS-tree commit 15634490](https://github.com/eslint/csstree/blob/15634490fc7a514f908b7d2733301e15e308c61c/lib/tokenizer/TokenStream.js)
(the `css-tree-v4.1.1` tag). `TokenStream.LICENSE` retains its MIT license.
Indentation and quotes follow this repository's ESLint configuration; two unused
variable initializers were removed for lint compatibility.

The changes below concern token storage and the reads of that storage. The
original token-stream traversal and lookup algorithms otherwise remain in place.
`cmpStr`, token names/types, the tokenizer, parser, grammar, lexer and generator
still come from the installed CSS-tree package. They are not copied or changed
by this fix.

`vendor/css-tree.js` is the generated browser bundle already used by SingleFile,
not a second newly introduced dependency. The manual regression files are new
tests, not copied library code.

## Changes to TokenStream

1. Store `type * 2**32 + endOffset` in a `Float64Array`, with arithmetic reads of
   the type and offset. This replaces the original 24-bit offsets and the
   previous build-time widening to 27 bits. The combined integer fits exactly
   in Float64, preserving full 32-bit offsets.
2. Grow the token and balance buffers by token count, including an EOF slot,
   instead of allocating from the number of source characters. A large comment
   or embedded data URL can occupy one token without proportional token storage.
3. Initialize used balance entries during tokenization instead of clearing the
   entire retained buffer. When unwinding to the root sentinel, set its closing
   type to zero rather than reading a stale token from a reused buffer.

The readable file replaces the existing `16MB token offset` and
`balance buffer cleared beyond the source` string-replacement patches in
`build.js`. It is substituted only during the bundle build; installed package
files are not rewritten.

The pre-existing patches for large URL string allocations and escaped trailing
whitespace in `url()` remain unchanged. They modify `lib/utils/url.js` during
bundling and are separate from this TokenStream fix.

## Why carry this change here?

Large font/image data URLs can make a stylesheet exceed the current 128 MiB
offset limit. The existing representation then wraps token positions; sizing
buffers by source length also amplifies memory use for sparse input. This fix
allows SingleFile to process those stylesheets while the dependency issue is
being resolved in [CSS-tree #174](https://github.com/eslint/csstree/issues/174).
Once a CSS-tree release provides the needed behavior, update the dependency and
remove the copied implementation and build substitution.

Dense input has a cost: 12 bytes per capacity entry instead of 8, plus temporary
old/new allocations during growth.
