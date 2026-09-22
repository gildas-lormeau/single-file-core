// The inline helper replaces an `@import` with the imported sheet as text, so every condition the
// import carried has to be written back around that text. `core/lib/processor-helper-inline.js`
// looked for a `LayerList` node to find the layer, and css-tree gives none for an `@import`: a named
// layer is `Function(layer)` holding `Layer(name)` and the bare keyword is a plain `Identifier`. The
// branch could therefore never run, and EVERY layer form came out unlayered — where it beats every
// layered rule in the page instead of losing to it.
//
// Measured in Chromium 151, Firefox 153 and WebKit 26.5 with `css-corpus/import-layer-cases.mjs`:
// for `@import url(x) layer(a);@layer b { p { color: blue } }` the live page renders blue and the
// saved page rendered red, in all three engines, and matches at blue with the wrapper written.
//
// The media wrap is pinned here beside it because it is the branch that did work, and because the
// two compose: the layer goes outside the media, which is the order the import declares them in.
import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";
const IMPORT_URL = "https://example.com/imported.css";
const IMPORTED = "p { color: rgb(1, 2, 3) }";
const INLINED = "p{color:rgb(1,2,3)}";

let failed = false;

// The control, and the shape everything else is measured against: an import with no condition at all
// is pasted in with no wrapper, so a stray wrapper shows up as a failure here first.
check("an import with no condition is pasted in unwrapped", await inline(""), INLINED);

// The case this exists for. A named layer, the bare keyword for an anonymous one, and a nested name,
// which is a single Layer node rather than a list however many dots it holds.
check("layer(a) wraps the sheet in that layer", await inline(" layer(a)"), "@layer a{" + INLINED + "}");
check("the bare layer keyword wraps it in an anonymous layer", await inline(" layer"), "@layer{" + INLINED + "}");
check("a dotted layer name is kept whole", await inline(" layer(a.b)"), "@layer a.b{" + INLINED + "}");

// CSS keywords are case-insensitive and the bare keyword is matched by name, so this is the one that
// a naive === "layer" comparison fails.
check("the keyword is matched whatever its case", await inline(" LAYER"), "@layer{" + INLINED + "}");

// The branch that already worked, pinned so a change to the layer code cannot take it out.
check("a media query still wraps the sheet", await inline(" screen"), "@media screen{" + INLINED + "}");

// Both at once, and the order matters. css-cascade-5 on the import's layer: "The layer is added to
// the layer order even if the import fails to load the stylesheet, but is subject to any import
// conditions (just as if declared by an @layer rule wrapped in the appropriate conditional group
// rules)" — so the condition is the outer wrapper and the layer the inner one. The two shapes differ
// only when the condition does not match, which is exactly when the layer must NOT take its place in
// the order. Measured with `@import url(x) layer(a) print` read on a screen, against a page that
// declares layer b and then layer a: Chromium 151, Firefox 153 and WebKit 26.5 all render the live
// page green, the layer-outside shape blue and the layer-inside shape green.
check("a media query wraps the layer, not the other way round", await inline(" layer(a) screen"), "@media screen{@layer a{" + INLINED + "}}");

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

async function inline(prelude) {
	const head = "<style>@import url(\"" + IMPORT_URL + "\")" + prelude + ";</style>";
	const page = html("<p>body</p>", head);
	const content = await capture({
		[PAGE_URL]: { body: page },
		[IMPORT_URL]: { body: IMPORTED, contentType: "text/css" }
	}, { url: PAGE_URL, content: page });
	return (content.match(/<style>([\s\S]*?)<\/style>/) || [])[1];
}

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}
