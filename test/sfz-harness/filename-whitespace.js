// #2042: 3ea174d collapsed every whitespace run of the filename to one space, so the spaces a user
// writes in the template on purpose ("{page-title}   [[ {url-hostname} ]]") were lost too. The
// collapse existed for two gaps SingleFile creates itself: a substitution rule that removes a
// character leaves the spaces around it ("John 🔥 Doe" -> "John  Doe", #2025), and the "replace
// emojis with text" option wrapped every name in spaces. Both are now fixed where the gap is made,
// and the template is left alone.
//
// Also the path rules of getValidFilename: "docs./file" lost its separator ("docs._file"), "../"
// was removed wherever the three characters met ("a.../b" -> "a.b"), and only one trailing dot of
// the whole name was dropped. A ".." segment is now removed as a segment, and the trailing dots and
// spaces of every segment go, which Windows refuses in a folder name anyway.

// core/filename.js imports nothing and is imported before the stubs, as in filename-characters.js
const { getValidFilename } = await import("./../../core/filename.js");

globalThis.window = globalThis;
globalThis.document = {};
globalThis.Document = class Document { };
globalThis.MutationObserver = class MutationObserver { observe() { } };
const { formatFilename } = await import("../../modules/template-formatter.js");

let failed = false;

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${JSON.stringify(actual)}${ok ? "" : " (expected " + JSON.stringify(expected) + ")"}`);
	failed ||= !ok;
}

async function format(filenameTemplate, title, options = {}) {
	return formatFilename("", null, Object.assign({
		url: "https://example.com/page",
		title,
		info: {},
		filenameTemplate,
		filenameReplacementCharacter: "_",
		filenameReplacedCharacters: [],
		filenameReplacementCharacters: [],
		backgroundSave: true,
		filenameMaxLengthUnit: "chars",
		filenameMaxLength: 1024
	}, options));
}

const REMOVE_EMOJIS = { filenameReplacedCharacters: ["\\p{Extended_Pictographic}\\p{Emoji_Modifier}\\u200D\\uFE0F"], filenameReplacementCharacters: [""], filenameReplacementCharacter: "" };

check("the spaces of the template survive", await format("{page-title}   [[ {url-hostname} ]].{filename-extension}", "Title"), "Title   [[ example.com ]].html");
check("a run of spaces in the title survives too", await format("{page-title}.{filename-extension}", "two  spaces"), "two  spaces.html");
check("other whitespace becomes a space, one for one", await format("{page-title}.{filename-extension}", "tab\there\nand nbsp"), "tab here and nbsp.html");
check("a removal rule leaves one space between the words", await format("{page-title}.{filename-extension}", "John 🔥 Doe", REMOVE_EMOJIS), "John Doe.html");
check("a removal rule inside a word adds no space", await format("{page-title}.{filename-extension}", "John🔥Doe", REMOVE_EMOJIS), "JohnDoe.html");
check("a removal rule at the end leaves no trailing space", await format("{page-title}.{filename-extension}", "John Doe 🔥", REMOVE_EMOJIS), "John Doe.html");
check("a removal rule keeps the template spaces", await format("{page-title}   {url-hostname}.{filename-extension}", "John 🔥 Doe", REMOVE_EMOJIS), "John Doe   example.com.html");
check("emoji names are spaced once", await format("{page-title}.{filename-extension}", "John 🔥 Doe", { replaceEmojisInFilename: true }), "John _fire_ Doe.html");
check("emoji names are spaced once inside a word", await format("{page-title}.{filename-extension}", "John🔥Doe", { replaceEmojisInFilename: true }), "John _fire_ Doe.html");
check("emoji names keep the template spaces", await format("{page-title}   {url-hostname}.{filename-extension}", "John 🔥 Doe", { replaceEmojisInFilename: true }), "John _fire_ Doe   example.com.html");
check("an emoji name at the end is trimmed", await format("{page-title}.{filename-extension}", "Hot 🔥", { replaceEmojisInFilename: true }), "Hot _fire_.html");

check("a folder ending with a dot keeps its separator", getValidFilename("docs./file.html"), "docs/file.html");
check("an ellipsis before a separator is not a parent reference", getValidFilename("Loading.../page.html"), "Loading/page.html");
check("four dots before a separator either", getValidFilename("..../page.html"), "page.html");
check("a parent segment is removed", getValidFilename("a/../b.html"), "a/b.html");
check("a leading parent segment is removed", getValidFilename("../b.html"), "b.html");
check("every trailing dot goes", getValidFilename("name.."), "name");
check("a trailing space goes with the dot", getValidFilename("name. "), "name");
check("a folder ending with a space is trimmed", getValidFilename("folder /file.html"), "folder/file.html");
check("a hidden file in a folder is still renamed", getValidFilename("a/.b"), "a/_b");
check("an ellipsis inside the name is kept", getValidFilename("Wait... what?"), "Wait... what？");

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
} else {
	console.log("PASSED");
}
