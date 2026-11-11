// Compare real original and rebuilt CSS-tree bundles using generated CSS.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const original = await import(pathToFileURL(resolve(process.argv[2])));
const candidate = await import(pathToFileURL(resolve(process.argv[3])));

const tested = candidate;
const prefix = '/*' + 'x'.repeat(134217724) + '*/';
const tail = 'a{color:red;--x:[foo(1px,2%,3)];background:url(foo\\ bar)}@media screen{b:is(.x,#y){display:block}}';
const source = prefix + tail;
const stream = new tested.TokenStream(source, tested.tokenize);
assert.equal(stream.getTokenEnd(stream.tokenCount), source.length, '32-bit token offsets must not wrap');
const expected = [], actual = [];
original.tokenize(source, (type, start, end) => expected.push([type, start, end]));
stream.forEachToken((type, start, end) => actual.push([type, start, end]));
assert.deepEqual(actual, expected);
assert.equal(tested.generate(tested.parse(source)), original.generate(original.parse(tail)));
const sparseBytes = stream.offsetAndType.byteLength + stream.balance.byteLength;
assert.ok(sparseBytes < 200_000, 'Sparse tokens must not allocate per source character');
stream.setSource('a{b:c}', tested.tokenize);
assert.deepEqual(stream.dump(), new original.TokenStream('a{b:c}', original.tokenize).dump());

let apiAssertions = 0;
const eq = (a, b, message) => { assert.deepEqual(a, b, message); apiAssertions++; };
const samples = ['', '\ufeff a{b:c}', 'a{b:url(x);c:var(--x,[a(b)])} /*hello*/ @media x{p{a:1px!important}}', 'a{b:url(x)}'.repeat(10000), '[({]}', 'a{b:c', 'a{b:c}];', '/*x*/'];
const a = new original.TokenStream(), b = new candidate.TokenStream();
for (const css of samples) {
    a.setSource(css, original.tokenize); b.setSource(css, candidate.tokenize);
    eq(b.dump(), a.dump(), 'dump');
    for (let index = 0; index <= a.tokenCount; index += Math.max(1, Math.floor(a.tokenCount / 1000))) {
        a.reset(); b.reset(); a.next(); b.next(); a.skip(index); b.skip(index);
        eq([b.tokenIndex, b.tokenStart, b.tokenEnd, b.tokenType, b.eof], [a.tokenIndex, a.tokenStart, a.tokenEnd, a.tokenType, a.eof], 'state');
        for (const offset of [-1, 0, 1, 2, a.tokenCount]) {
            for (const method of ['lookupType', 'lookupTypeNonSC', 'lookupOffset', 'lookupOffsetNonSC', 'getTokenStart', 'getTokenEnd', 'getTokenType', 'getBlockTokenPairIndex', 'isBalanceEdge']) eq(b[method](offset), a[method](offset), method);
        }
        eq(b.lookupValue(0, 'a'), a.lookupValue(0, 'a'), 'value'); eq(b.isDelim(59), a.isDelim(59), 'delim');
        a.skipSC(); b.skipSC(); eq([b.tokenIndex, b.tokenType], [a.tokenIndex, a.tokenType], 'skipSC');
        a.skipUntilBalanced(index, c => c === 59 ? 2 : 0); b.skipUntilBalanced(index, c => c === 59 ? 2 : 0);
        eq([b.tokenIndex, b.tokenStart, b.tokenEnd, b.tokenType, b.eof], [a.tokenIndex, a.tokenStart, a.tokenEnd, a.tokenType, a.eof], 'skipUntilBalanced');
    }
}
let state = 42;
const chars = 'ab0123 {}[]():;,!@#\n\t/\\"\'%.-+*';
const random = n => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % n; };
const reused = new candidate.TokenStream();
let reuseTokens = 0;
for (let i = 0; i < 3000; i++) {
    let css = ''; const length = random(400);
    for (let j = 0; j < length; j++) css += chars[random(chars.length)];
    const fresh = new original.TokenStream(css, original.tokenize);
    reused.setSource(css, candidate.tokenize);
    assert.deepEqual(reused.dump(), fresh.dump(), `reuse ${i}`); reuseTokens += reused.tokenCount;
}
const dense = new candidate.TokenStream(';'.repeat(300000), candidate.tokenize);
assert.equal(dense.tokenCount, 300000);
const denseBytes = dense.offsetAndType.byteLength + dense.balance.byteLength;
assert.equal(denseBytes, 3600012, 'Documented 12-byte dense storage with EOF sentinel');
console.log(JSON.stringify({apiAssertions, reuseCases: 3000, reuseTokens, boundaryTokens: actual.length, sparseBytes, denseBytes}));
