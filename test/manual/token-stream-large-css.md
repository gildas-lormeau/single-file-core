# Large CSS token storage regression

Run from the repository root with Node.js. Preserve the unmodified vendor bundle
before building the candidate:

```sh
cp vendor/css-tree.js /tmp/singlefile-css-tree-original.mjs
(cd css-tree-build && npm ci && node build.js)
node test/manual/token-stream-large-css.mjs /tmp/singlefile-css-tree-original.mjs vendor/css-tree.js
```

Passing the original bundle as both arguments reproduces the offset failure.
The regression creates CSS crossing 128 MiB, compares parser output and token
offsets with the tokenizer, exercises lookup APIs and buffer reuse against the
original bundle, and checks sparse and dense storage. It uses no captured pages,
credentials, or mocked tokenizer. Allow enough memory for the original parser's
per-character buffers (about 1 GiB at this boundary).

The new storage uses 12 bytes per capacity entry instead of 8 for dense streams;
buffer growth temporarily retains both old and new arrays. Sparse data URLs and
comments avoid allocating an entry for every source character. This is not a
universal memory-reduction claim.
