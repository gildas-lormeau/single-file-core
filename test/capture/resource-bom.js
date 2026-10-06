import "./dom.js";

// A text resource used to lose every U+FEFF it held, not only the byte-order mark at its start:
// the strip was a global replace. A stylesheet using the character as a zero-width no-break space
// in `content` was altered on save. Only a leading mark is removed now; the decoder already drops
// the one carried by the bytes. Scripts never went through that path: they are embedded as data
// URIs of their bytes, and the check below pins that down so the two paths cannot drift apart.
import { capture, html } from "./common.js";

const atob = globalThis.atob;

const PAGE_URL = "https://example.com/page.html";
const SCRIPT_URL = "https://example.com/s.js";
const STYLESHEET_URL = "https://example.com/s.css";
const SCRIPT = "var marker = 'a﻿b'; var width = '﻿'.length;";
const STYLESHEET = "﻿h2::after { content: 'x﻿y'; }";
const PAGE = html("<h2>x</h2>", "<link rel=\"stylesheet\" href=\"" + STYLESHEET_URL + "\"><script src=\"" + SCRIPT_URL + "\"></script>");

let failed = false;

const content = await capture({
	[PAGE_URL]: { body: PAGE },
	[STYLESHEET_URL]: { body: STYLESHEET, contentType: "text/css" },
	[SCRIPT_URL]: { body: SCRIPT, contentType: "text/javascript" }
}, { url: PAGE_URL, content: PAGE, blockScripts: false, removeUnusedStyles: false, compressCSS: false });
const scriptDataURI = (content.match(/<script src="data:text\/javascript;base64,([^"]+)"/) || [])[1];
const script = scriptDataURI ? new TextDecoder().decode(Uint8Array.from(atob(scriptDataURI), character => character.charCodeAt(0))) : "";
check("the script is embedded as its bytes", Boolean(scriptDataURI), true);
check("a U+FEFF inside a script string is kept", script.includes("a﻿b"), true);
check("a string made of the character alone keeps it", script.includes("'﻿'.length"), true);
check("a U+FEFF inside a CSS content value is kept", content.includes("x﻿y"), true);
check("the mark at the start of the stylesheet is not", content.includes(">" + "﻿"), false);

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

function check(label, actual, expected) {
	const pass = JSON.stringify(actual) == JSON.stringify(expected);
	console.log((pass ? "PASS " : "FAIL ") + label + ": " + JSON.stringify(actual));
	if (!pass) {
		console.log("     expected: " + JSON.stringify(expected));
		failed = true;
	}
}
