// §5.2 of doc/singlefile-archive.md quantifies what relocating the extra-data element costs. The
// figures it carried until 2026-09-12 came from two live captures and one fixture, and two of the
// three did not reconstruct: the paragraph subtracted the 17 bytes of terminator and end tags from
// the reservation without subtracting the element, which the appended placement also carries, so
// it over-counted by the whole element. This pins the corrected arithmetic. The cost is the
// reservation margin alone, it is positive on every rung whenever an element exists, and the only
// way to make relocation save bytes is to have no element to relocate.
import { makePageData, makeOptions, runProcess, freezeDate } from "./common.js";

const DECODER = new TextDecoder("windows-1252");
const OPEN_TAG = "<sfz-extra-data>";
const CLOSE_TAG = "</sfz-extra-data>";
const END_TAGS_LENGTH = "</body></html>".length;

let failed = false;

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}

function reservationSize(length) {
	return Math.ceil(length * 1.01) + 32;
}

function inspect(bytes) {
	const text = DECODER.decode(bytes);
	const open = text.indexOf(OPEN_TAG);
	const firstHeader = text.indexOf("PK\x03\x04");
	return {
		total: bytes.length,
		element: open == -1 ? 0 : text.indexOf(CLOSE_TAG, open) + CLOSE_TAG.length - open,
		relocated: open != -1 && open < firstHeader
	};
}

async function build(seed, targetLength, overrides) {
	const restoreDate = freezeDate();
	const appended = inspect((await runProcess(makePageData(seed, targetLength), makeOptions(overrides))).bytes);
	const relocated = inspect((await runProcess(makePageData(seed, targetLength), makeOptions({ ...overrides, preventAppendedData: true }))).bytes);
	restoreDate();
	return { appended, relocated, cost: relocated.total - appended.total };
}

// the element changes length between the two passes once the reservation is large enough to move
// the central-directory offsets it encodes, and then the reservation comes from the first pass
// while the element written into it comes from the second. These fixtures stay below that, which
// is what lets the identity be asserted exactly rather than within a tolerance.
for (const [label, seed, targetLength, closeTagLength] of [
	["comment rung", 1, 64 * 1024, "-->".length],
	["comment rung, larger", 2, 147 * 1024, "-->".length]
]) {
	const { appended, relocated, cost } = await build(seed, targetLength, {});
	check(`${label}: the element keeps its length`, relocated.element, appended.element);
	check(`${label}: relocates`, relocated.relocated, true);
	check(`${label}: cost`, cost,
		reservationSize(appended.element) - appended.element - closeTagLength - END_TAGS_LENGTH);
	check(`${label}: cost is positive`, cost > 0, true);
}

// the rung sets the constant, because it is the closing tag the relocated placement stops emitting
for (const [label, closeTag] of [
	["script rung", "</script>"],
	["svg CDATA rung", "]]></svg>"],
	["plaintext rung", "</plaintext>"]
]) {
	const startTag = { "</script>": "<script type=sfz-data>", "]]></svg>": "<svg><![CDATA[", "</plaintext>": "<plaintext>" }[closeTag];
	const { appended, cost } = await build(3, 64 * 1024, { extractDataFromPageTags: [startTag, closeTag] });
	check(`${label}: cost`, cost,
		reservationSize(appended.element) - appended.element - closeTag.length - END_TAGS_LENGTH);
	check(`${label}: cost is positive`, cost > 0, true);
}

// with no element there is nothing to reserve, so the appended run is dropped and nothing replaces
// it. This is the only case in which suppressing the run makes the file smaller.
{
	const { appended, cost } = await build(4, 64 * 1024, { extractDataFromPage: false });
	check("extraction disabled: no element", appended.element, 0);
	check("extraction disabled: cost", cost, -("-->".length + END_TAGS_LENGTH));
}

// the budget triggers relocation once the element no longer fits beside the terminator and the end
// tags, so the boundary is exactly maxAppendedDataLength - 3 - 14
{
	const { appended } = await build(5, 64 * 1024, {});
	const fits = appended.element + "-->".length + END_TAGS_LENGTH;
	const atBoundary = await build(5, 64 * 1024, { maxAppendedDataLength: fits });
	const belowBoundary = await build(5, 64 * 1024, { maxAppendedDataLength: fits - 1 });
	check("an element that exactly fits the budget stays appended", atBoundary.appended.relocated, false);
	check("one byte less of budget relocates it", belowBoundary.appended.relocated, true);
}

Deno.exit(failed ? 1 : 0);
