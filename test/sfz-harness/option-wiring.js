// The compression processor is reached through a whitelist in single-file.js. An option this
// module reads but the whitelist omits is undefined at every call site, so the feature works on
// the multi-page path (which calls createArchive directly) and silently does nothing on every
// single-page capture. That is how --declare-appended-data and --include-BOM both shipped inert,
// and no test caught either: the other suites call compression.process() directly, one layer
// below the wiring they would have to see.
import { PROCESS_OPTION_NAMES } from "../../processors/compression/compression.js";

// names matched by the source scan that are NOT caller options. Keeping them listed here rather
// than filtering them out silently is the point of this test: a new name must be classified as
// one thing or the other before the suite goes green again
const INTERNAL_OPTION_NAMES = [
	// state the module sets on itself between build passes
	"extraDataSize",
	"extraDataSizeDropped",
	"extractDataFromPageTags",
	"preventEmbeddedPdfEntry",
	// supplied by compression-packager.js, which calls createArchive directly
	"multiPageArchive",
	// read for the root directory name, but no caller has ever passed it
	"tabId",
	// a different `options` object: the per-entry zip options built inside addFile()
	"comment",
	"level"
];

let failed = false;

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}

const compressionSource = await Deno.readTextFile(new URL("../../processors/compression/compression.js", import.meta.url));
const singleFileSource = await Deno.readTextFile(new URL("../../single-file.js", import.meta.url));
const readNames = [...new Set([...compressionSource.matchAll(/options\.([A-Za-z0-9_]+)/g)].map(match => match[1]))].sort();

const unclassified = readNames.filter(name => !PROCESS_OPTION_NAMES.includes(name) && !INTERNAL_OPTION_NAMES.includes(name));
check("every option compression.js reads is classified", unclassified.join(", "), "");

const unread = PROCESS_OPTION_NAMES.filter(name => !readNames.includes(name));
check("no declared caller option is dead", unread.join(", "), "");

const misclassified = INTERNAL_OPTION_NAMES.filter(name => PROCESS_OPTION_NAMES.includes(name));
check("no option is both a caller option and internal", misclassified.join(", "), "");

check("the declared list is sorted", PROCESS_OPTION_NAMES.join(), [...PROCESS_OPTION_NAMES].sort().join());

// the guard is only worth anything while single-file.js builds its argument from the list; a
// literal object there would drift again, which is exactly the bug this file exists to prevent
check("single-file.js builds its argument from the list", singleFileSource.includes("PROCESS_OPTION_NAMES"), true);
check("single-file.js keeps no literal option whitelist", /insertTextBody:\s*options\.insertTextBody/.test(singleFileSource), false);

check("includeBOM reaches the compressed path", PROCESS_OPTION_NAMES.includes("includeBOM"), true);

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");
