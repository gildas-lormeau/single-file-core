// getValidFilename replaced each character class with "[X]+", so a RUN collapsed to one character:
// "C++" was saved as "C＋" and "Really???" as "Really？". The quantifier was inherited rather than
// chosen — before a842fe1 (issue #1614) there was a single loop mapping every invalid character to
// one "_", where collapsing a run is the point. The full-width lookalike loop was written by
// copying that line, and a lookalike maps one for one, so the run must survive.
//
// The fallback loop keeps its "+": a run of control characters still becomes a single "_", which
// also matches the download retry ladder in the extensions, where the lookalike rung replaces per
// character (LOOKALIKE_CHARACTERS) and the non-ASCII rung collapses ("[^\x00-\x7F]+").

globalThis.window = globalThis;
globalThis.document = {};
globalThis.Document = class Document { };
globalThis.MutationObserver = class MutationObserver { observe() { } };
const { getValidFilename } = await import("./../../core/helper.js");

// [input, expected]
const CASES = [
	["C++ vs C++", "C＋＋ vs C＋＋"],
	["Really???", "Really？？？"],
	["Why?? 50%%", "Why？？ 50％％"],
	["**bold** and ~~strike~~", "＊＊bold＊＊ and ～～strike～～"],
	["a:b::c", "a：b：：c"],
	["<<x>>", "＜＜x＞＞"],
	["one ? here", "one ？ here"],
	["normal title", "normal title"],
	["Wait... what?", "Wait... what？"]
];

let failed = false;

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}

for (const [input, expected] of CASES) {
	check(JSON.stringify(input), getValidFilename(input), expected);
}

// the characters with no lookalike take the fallback, and there a run is still collapsed
check("a run of control characters collapses to one replacement", getValidFilename("a\x00\x01\x02b"), "a_b");
check("a control character run is collapsed, lookalikes next to it are not", getValidFilename("a\x00\x01b??"), "a_b？？");

// a custom mapping keeps both behaviours: one for one when a replacement is given, collapsed when not
check("custom lookalike replaces per character", getValidFilename("a##b", ["#"], "_", ["＃"]), "a＃＃b");
check("custom class without a lookalike collapses", getValidFilename("a##b", ["#"], "_", []), "a_b");

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
} else {
	console.log("PASSED");
}
