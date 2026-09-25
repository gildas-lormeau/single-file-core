import { capture, html, helper } from "./common.js";

const PAGE_URL = "https://example.com/page.html";
const SHADOW_ROOT = helper.SHADOW_ROOT_ATTRIBUTE_NAME;
const SLOT = helper.SLOT_ATTRIBUTE_NAME;
const ASSIGNED_SLOT = helper.ASSIGNED_SLOT_ATTRIBUTE_NAME;

let failed = false;

// A shadow root attached with slotAssignment "manual" places its children with slot.assign(), which
// has no HTML form: a declarative root is always named, and shadowrootslotassignment="manual" alone
// gives a root with nothing assigned, which hides every child. The capture marks each slot and each
// assigned child with the slot's index, and the saved page names them, so named assignment places the
// children where assign() did. A child assigned nowhere gets a name no slot carries, so it stays hidden.
// The slot names are written inside the template, which happy-dom routes to template.content where no
// query looks (see nesting-repair.js), so only the host side is checked here; the whole path is checked
// in Chrome through the CLI.
{
	const page = html(`<span id="host" ${SHADOW_ROOT}="0"><i id="a">A</i><i id="b" ${ASSIGNED_SLOT}="1">B</i><i id="c" ${ASSIGNED_SLOT}="0" slot="x">C</i></span>`);
	const content = await capture({ [PAGE_URL]: { body: page } }, {
		url: PAGE_URL,
		content: page,
		shadowRoots: [{ mode: "open", slotAssignment: "manual", content: `<slot ${SLOT}="0"></slot><slot ${SLOT}="1"></slot>` }]
	});
	check("an assigned child is named after its slot", /<i id="?b"? slot="?single-file-slot-1"?>/.test(content), true);
	check("a slot attribute the manual root ignored is replaced", /<i id="?c"? slot="?single-file-slot-0"?>/.test(content), true);
	check("a child assigned nowhere gets a name no slot carries", /<i id="?a"? slot="?single-file-slot-unassigned"?>/.test(content), true);
	check("no assigned-slot marker is left in the page", content.includes(ASSIGNED_SLOT), false);
}

{
	const page = html(`<span id="host" ${SHADOW_ROOT}="0"><i id="a">A</i><i id="b" slot="x">B</i></span>`);
	const content = await capture({ [PAGE_URL]: { body: page } }, {
		url: PAGE_URL,
		content: page,
		shadowRoots: [{ mode: "open", content: "<slot></slot><slot name=\"x\"></slot>" }]
	});
	check("a named root leaves its children as they are", /<i id="?a"?>A<\/i><i id="?b"? slot="?x"?>B<\/i>/.test(content), true);
	check("and names no slot", content.includes("single-file-slot-"), false);
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}
