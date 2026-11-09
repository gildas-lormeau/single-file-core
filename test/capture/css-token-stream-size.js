// Large embedded resources occupy few tokens. Neither their offsets nor their buffers should
// depend on packing an offset into 27 bits or reserving one token slot per source character.
import * as cssTree from "../../vendor/css-tree.js";

let failed = false;
const prefix = "/*" + "x".repeat(2 ** 27 - 4) + "*/";
const tail = "a{color:red;--x:[foo(1px,2%,3)];background:url(foo\\ bar)}@media screen{b:is(.x,#y){display:block}}";
const source = prefix + tail;
const expected = [];
cssTree.tokenize(source, (type, start, end) => expected.push([type, start, end]));
const stream = new cssTree.TokenStream(source, cssTree.tokenize);
const actual = [];
stream.forEachToken((type, start, end) => actual.push([type, start, end]));
check("token offsets and types survive the 128 MiB boundary", actual, expected);
check("the first token ends exactly at the old offset boundary", actual[0][2], 2 ** 27);
// A corrupt stream can make parsing unbounded; fail before handing it to the parser.
if (failed) Deno.exit(1);
check("parsing after a giant comment retains the complete stylesheet", cssTree.generate(cssTree.parse(source)), cssTree.generate(cssTree.parse(tail)));
check("buffers track tokens rather than giant source length", stream.offsetAndType.byteLength + stream.balance.byteLength < 1024 * 1024, true);
stream.setSource("a{b:c}", cssTree.tokenize);
check("a small parse after a giant input has no stale balance state", stream.dump(), new cssTree.TokenStream("a{b:c}", cssTree.tokenize).dump());
if (failed) Deno.exit(1);
console.log("OK");

function check(label, actual, expected) {
	const pass = JSON.stringify(actual) == JSON.stringify(expected);
	console.log((pass ? "PASS " : "FAIL ") + label);
	if (!pass) failed = true;
}
