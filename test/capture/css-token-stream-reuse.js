// Buffer reuse must never make a previous input's token or bracket state visible to the next one.
// The tokenizer callback is an independent source of offsets/types; fresh streams check balances.
import * as cssTree from "../../vendor/css-tree.js";

let failed = false;
const stream = new cssTree.TokenStream();
const fixtures = ["", "\ufeff a{b:c}", "a{b:url(x);c:var(--x,[a(b)])} /*hello*/ @media x{p{a:1px!important}}", "a{b:url(x)}".repeat(10000), "[({]}", "a{b:c", "a{b:c}];", "/*x*/", ""];
for (const [index, source] of fixtures.entries()) {
	const expected = [];
	cssTree.tokenize(source, (type, start, end) => expected.push([type, start, end]));
	stream.setSource(source, cssTree.tokenize);
	const actual = [];
	stream.forEachToken((type, start, end) => actual.push([type, start, end]));
	check("fixture " + index + " keeps tokenizer offsets and types", actual, expected);
	check("fixture " + index + " reuses only current balance state", stream.dump(), new cssTree.TokenStream(source, cssTree.tokenize).dump());
}
let state = 42;
const chars = "ab0123 {}[]():;,!@#\n\t/\\\"'%.-+*";
const random = n => {
	state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
	return state % n;
};
let reuseEqual = true;
for (let index = 0; index < 3000; index++) {
	let source = "";
	for (let length = random(400); length; length--) source += chars[random(chars.length)];
	stream.setSource(source, cssTree.tokenize);
	const fresh = new cssTree.TokenStream(source, cssTree.tokenize);
	if (JSON.stringify(stream.dump()) != JSON.stringify(fresh.dump())) reuseEqual = false;
}
check("3000 varied malformed inputs have the same state as fresh streams", reuseEqual, true);
const dense = new cssTree.TokenStream(";".repeat(300000), cssTree.tokenize);
check("dense input retains every token and its EOF sentinel", [dense.tokenCount, dense.getTokenEnd(dense.tokenCount)], [300000, 300000]);
check("dense buffer capacity stays within one slot per character plus EOF", dense.offsetAndType.length <= 300001, true);
if (failed) Deno.exit(1);
console.log("OK");

function check(label, actual, expected) {
	const pass = JSON.stringify(actual) == JSON.stringify(expected);
	console.log((pass ? "PASS " : "FAIL ") + label);
	if (!pass) failed = true;
}
