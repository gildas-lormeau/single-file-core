import "./dom.js";

// The serializer dispatched on text, comment and element nodes only, and the children loop
// concatenated whatever serialize() returned for anything else: a processing instruction or a CDATA
// section child wrote the literal word "undefined" into the saved page. Nothing in the capture
// pipeline produced such nodes, because the page is reparsed as text/html and the HTML parser turned
// <?...?> into a bogus comment, but the HTML out-of-order patching proposal (<?marker name="x">,
// <?start>...<?end>, patched by <template for="x">) makes processing instructions real nodes of an
// HTML document, so they must come out as the instructions they are. A CDATA section is written as
// text, which is what it means wherever an HTML parser reads it back. The test DOM cannot create a
// CDATA section, so a text node is given its node type; the serializer reads nothing else from it.
import * as serializer from "../../modules/html-serializer.js";

const XHTML = "<html xmlns=\"http://www.w3.org/1999/xhtml\"><head></head><body><p>a</p></body></html>";

let failed = false;

{
	const doc = new globalThis.DOMParser().parseFromString(XHTML, "application/xhtml+xml");
	doc.body.appendChild(doc.createProcessingInstruction("marker", "name=\"placeholder\""));
	doc.body.appendChild(doc.createProcessingInstruction("end", ""));
	const content = serializer.process(doc, true);
	check("a processing instruction keeps its target and data", content.includes("<p>a</p><?marker name=\"placeholder\"?>"), true);
	check("an instruction without data has no trailing space", content.includes("<?end?>"), true);
	check("nothing writes the word undefined", content.includes("undefined"), false);
}
{
	const doc = new globalThis.DOMParser().parseFromString(XHTML, "application/xhtml+xml");
	const cdataNode = doc.createTextNode("1 < 2 & 3");
	Object.defineProperty(cdataNode, "nodeType", { value: 4 });
	doc.body.appendChild(cdataNode);
	const content = serializer.process(doc, true);
	check("a CDATA section is written as escaped text", content.includes("<p>a</p>1 &lt; 2 &amp; 3"), true);
	check("and not as a CDATA block", content.includes("<![CDATA["), false);
}
{
	const doc = new globalThis.DOMParser().parseFromString(XHTML, "application/xhtml+xml");
	const html = serializer.process(doc, true);
	check("control: an XHTML document without such nodes serializes as before", html.includes("<body><p>a</p>"), true);
}

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
