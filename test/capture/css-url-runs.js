// Embedded resource URLs are often much larger than the rest of a stylesheet.
// Keep their bytes intact through parsing/generation, including safe runs after
// escaped characters: optimizing only entirely safe strings misses that case.
import { parse, generate, url } from "../../vendor/css-tree.js";

let failed = false;
const payload = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".repeat(16384);
const dataURL = "data:font/woff2;base64," + payload;
const prefixURL = "https://example.org/a(b)/" + payload;

check("large data URL encoding", url.encode(dataURL), "url(" + dataURL + ")");
check("large data URL decoding", url.decode("url(" + dataURL + ")"), dataURL);
check("large run after escaped parentheses", url.encode(prefixURL), "url(https://example.org/a\\(b\\)/" + payload + ")");
check("large run after a decoded escape", url.decode("url(https://example.org/a\\(b\\)/" + payload + ")"), prefixURL);
check("hex escape separator before a safe run", url.encode("\x01ABC"), "url(\\1 ABC)");
check("non-hex safe run needs no separator", url.encode("\x01XYZ"), "url(\\1XYZ)");
check("NUL preserves the existing pending hex separator", url.encode("\x01\0ABC"), "url(\\1\ufffd ABC)");
check("escaped whitespace ends a safe run", url.encode("a b"), "url(a\\ b)");
check("escaped trailing whitespace remains intact", url.decode("url(a\\ )"), "a ");
check("escaped closing parenthesis preserves its prefix", url.decode("url(a\\)"), "a)");
check("Unicode stays byte-equivalent", url.encode("Ω🧭"), "url(Ω🧭)");
const stylesheet = "@font-face{font-family:archive;src:url(" + dataURL + ")}a{background:url(https://example.org/a\\(b\\)/" + payload + ")}";
check("large URLs survive the real parser and generator", generate(parse(stylesheet)), stylesheet);

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

function check(label, actual, expected) {
	const pass = actual === expected;
	// Do not print megabyte-long URLs into CI logs on failure.
	console.log((pass ? "PASS " : "FAIL ") + label);
	if (!pass) {
		console.log("     actual/expected lengths: " + actual.length + "/" + expected.length);
		failed = true;
	}
}
