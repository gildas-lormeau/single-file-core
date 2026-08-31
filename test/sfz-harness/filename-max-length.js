// formatFilename truncates an over-long filename to filenameMaxLength and then appends an ellipsis
// and the extension, but the budget it truncated to only ever subtracted the extension. The
// ellipsis was never counted, so every truncated filename came out over the limit — by one
// character in "char" mode, by the 3 bytes of U+2026 in "bytes" mode. Harmless at the default 192,
// but a user who sets the limit to the filesystem maximum of 255 gets 258 and the download is
// refused, which sends the save down the download-util.js retry ladder for no reason.
//
// The negative budget was worse than an overrun. truncateText slices a Blob, and Blob.slice reads a
// negative start as an offset from the END, so a limit smaller than the extension returned nearly
// the whole 800-byte filename instead of nothing.

// template-formatter.js reaches core/helper.js, which pulls in the frame hooks, and those install
// themselves against window and document as they are evaluated: the stubs go in before the import
globalThis.window = globalThis;
globalThis.document = {};
globalThis.Document = class Document { };
globalThis.MutationObserver = class MutationObserver { observe() { } };
const { formatFilename } = await import("../../modules/template-formatter.js");

const LONG_TITLE = "a".repeat(400);
const MULTIBYTE_TITLE = "é".repeat(400);

let failed = false;

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}

async function getFilename(title, filenameMaxLengthUnit, filenameMaxLength) {
	return formatFilename("", null, {
		url: "https://example.com/page",
		filenameTemplate: title + ".html",
		filenameReplacementCharacter: "_",
		filenameReplacedCharacters: [],
		filenameReplacementCharacters: [],
		backgroundSave: true,
		filenameMaxLengthUnit,
		filenameMaxLength
	});
}

async function getSize(title, unit, maxLength) {
	const filename = await getFilename(title, unit, maxLength);
	return unit == "bytes" ? new Blob([filename]).size : filename.length;
}

for (const maxLength of [192, 255]) {
	check(`ascii title, ${maxLength} bytes`, await getSize(LONG_TITLE, "bytes", maxLength) <= maxLength, true);
	check(`multibyte title, ${maxLength} bytes`, await getSize(MULTIBYTE_TITLE, "bytes", maxLength) <= maxLength, true);
	check(`ascii title, ${maxLength} chars`, await getSize(LONG_TITLE, "char", maxLength) <= maxLength, true);
	check(`multibyte title, ${maxLength} chars`, await getSize(MULTIBYTE_TITLE, "char", maxLength) <= maxLength, true);
}

// the extension and the ellipsis alone are longer than the limit, so the result cannot fit. What it
// must not do is grow: before the fix the byte case returned 812 bytes for a limit of 4
check("limit shorter than the extension keeps only the suffix", await getFilename(LONG_TITLE, "bytes", 4), "….html");
check("limit shorter than the extension, chars", await getFilename(LONG_TITLE, "char", 3), "….html");

// nothing above the limit is truncated at all, ellipsis included
check("a filename at the limit is left alone", await getFilename("a".repeat(187), "bytes", 192), "a".repeat(187) + ".html");

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
} else {
	console.log("PASSED");
}
