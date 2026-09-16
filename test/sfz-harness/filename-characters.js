// getValidFilename replaced each character class with "[X]+", so a RUN collapsed to one character:
// "C++" was saved as "C＋" and "Really???" as "Really？". The quantifier was inherited rather than
// chosen — before a842fe1 (issue #1614) there was a single loop mapping every invalid character to
// one "_", where collapsing a run is the point. The full-width lookalike loop was written by
// copying that line, and a lookalike maps one for one, so the run must survive.
//
// The fallback loop keeps its "+": a run of control characters still becomes a single "_", which
// also matches the download retry ladder in the extensions, where the lookalike rung replaces per
// character (LOOKALIKE_CHARACTERS) and the non-ASCII rung collapses ("[^\x00-\x7F]+").

// core/filename.js imports nothing, which is the whole point of it: single-file-cli and the
// extensions' unit tests read the tables from it without stubbing a DOM first. It is imported here
// BEFORE the stubs go in, so an import added to it fails this suite instead of a host's startup.
const { getValidFilename, DEFAULT_REPLACED_CHARACTERS, DEFAULT_REPLACEMENT_CHARACTER, DEFAULT_REPLACEMENT_CHARACTERS } = await import("./../../core/filename.js");

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

// the two arrays are positional, and "no lookalike for this one" used to be sayable only by the
// index not existing, which truncation gives you at the TAIL and nothing gives you in the middle:
// a hole does not survive JSON, and an explicit null or undefined was stringified into the name
// ("a#b@c" came out "anullb＠c"). Any falsy entry now means the fallback, wherever it sits.
check("a null lookalike in the middle takes the fallback", getValidFilename("a#b@c", ["#", "@"], "_", [null, "＠"]), "a_b＠c");
check("an undefined lookalike in the middle takes the fallback", getValidFilename("a#b@c", ["#", "@"], "_", [undefined, "＠"]), "a_b＠c");
check("an empty lookalike takes the fallback", getValidFilename("a##b", ["#"], "_", [""]), "a_b");
check("a lookalike after a fallback entry is not shifted", getValidFilename("a#b@c", ["#", "@"], "_", ["", "＠"]), "a_b＠c");

// the extensions keep their own copies of these tables, so they are exported to be pinned there
// rather than compared by eye. Exporting the wrong constant would be invisible without this: the
// three of them together must reproduce what the no-argument call does.
for (const [input, expected] of CASES) {
	check("the exported defaults reproduce " + JSON.stringify(input), getValidFilename(input, DEFAULT_REPLACED_CHARACTERS, DEFAULT_REPLACEMENT_CHARACTER, DEFAULT_REPLACEMENT_CHARACTERS), expected);
}
check("the exported fallback is the one a missing lookalike takes", getValidFilename("a\x00b"), "a" + DEFAULT_REPLACEMENT_CHARACTER + "b");

// every consumer reads these from core/helper.js, which re-exports them from the leaf. That module
// pulls in the frame hooks, and they install themselves against window and document as they are
// evaluated, so the stubs go in before this import and not before the one above
globalThis.window = globalThis;
globalThis.document = {};
globalThis.Document = class Document { };
globalThis.MutationObserver = class MutationObserver { observe() { } };
const helper = await import("./../../core/helper.js");
check("core/helper.js re-exports the same function", helper.getValidFilename === getValidFilename, true);
check("core/helper.js re-exports the same tables",
	helper.DEFAULT_REPLACED_CHARACTERS === DEFAULT_REPLACED_CHARACTERS &&
	helper.DEFAULT_REPLACEMENT_CHARACTER === DEFAULT_REPLACEMENT_CHARACTER &&
	helper.DEFAULT_REPLACEMENT_CHARACTERS === DEFAULT_REPLACEMENT_CHARACTERS, true);

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
} else {
	console.log("PASSED");
}
