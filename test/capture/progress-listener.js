import { capture, html } from "./common.js";

// The batch fetch layer is armed in two steps that nothing joined up. Runner.initialize starts the
// REPLACE_DATA stage WITHOUT awaiting it, and Runner.run snapshots the queue a few microtask turns
// later with `const resourceURLs = [...this.requests.keys()]`. Everything the stage asks for has to be
// registered before that snapshot, because a request arriving after it is handed a promise nobody
// ever settles: run() iterates the snapshot, addURL keeps accepting, and the processor task awaiting
// the resource stops for ever with no error, no timeout and no log.
//
// What used to decide the order was a race between two progress events, so the EMBEDDER's listener
// was load-bearing. executeStage awaited onprogress(STAGE_STARTED) before running any task of the
// stage, while run() awaited onprogress(RESOURCES_INITIALIZED) before the snapshot. A listener one
// microtask turn slower on STAGE_STARTED than on RESOURCES_INITIALIZED lost the race, the snapshot
// came out empty and the capture hung: measured at exactly two `await Promise.resolve()`, or one
// setTimeout, with nothing else changed. The shipped extensions escaped it only because their
// STAGE_STARTED branch is synchronous while their RESOURCES_INITIALIZED branch awaits a message to
// the background page — the slow side was the harmless one, by luck.
//
// executeStage now starts that event and awaits it at the end of the stage instead, so the task
// fan-out can no longer be overtaken. Every check below races the capture against a timer, because
// the failure being tested for is a hang: without the timer a regression stops the suite instead of
// failing it.

const PAGE_URL = "https://example.com/page.html";
const STYLE_URL = "https://example.com/style.css";
const FONT_URL = "https://example.com/font.woff2";
const BACKGROUND_URL = "https://example.com/bg.png";
const IMAGE_URL = "https://example.com/photo.png";
const TIMEOUT = 5000;

const PAGE = html("<img src=\"" + IMAGE_URL + "\"><p>text</p>", "<link rel=\"stylesheet\" href=\"" + STYLE_URL + "\">");

const resources = {
	[PAGE_URL]: { body: PAGE },
	[STYLE_URL]: { body: "@font-face{font-family:F;src:url(" + FONT_URL + ")}body{background:url(" + BACKGROUND_URL + ")}", contentType: "text/css" },
	[FONT_URL]: { body: "FONTDATA", contentType: "font/woff2" },
	[BACKGROUND_URL]: { body: "BGDATA", contentType: "image/png" },
	[IMAGE_URL]: { body: "PHOTODATA", contentType: "image/png" }
};

let failed = false;

// The control. A listener that awaits nothing has always worked, and it has to keep working: a fix
// that armed the batch some other way would pass the cases below and break this one.
{
	const { content } = await captureWith(null);
	check("a listener awaiting nothing captures every resource", embedded(content), 3);
}

// The regression. One macrotask on STAGE_STARTED is what any listener doing real work there costs —
// a message to a background page, a screenshot, an await on a UI update — and it used to hang.
{
	const { content } = await captureWith(async event => {
		if (event.type == event.STAGE_STARTED) {
			await new Promise(resolve => setTimeout(resolve, 0));
		}
	});
	check("a listener yielding a macrotask on STAGE_STARTED captures every resource", embedded(content), 3);
}

// The exact boundary that used to break. One await of an already-resolved promise passed, two hung,
// so a fix that only widened the window rather than removing the race would show up here.
{
	const { content } = await captureWith(async event => {
		if (event.type == event.STAGE_STARTED) {
			await Promise.resolve();
			await Promise.resolve();
		}
	});
	check("a listener awaiting two resolved promises on STAGE_STARTED captures every resource", embedded(content), 3);
}

// Delay on the other side of the race is harmless and always was: it gives the stage more time, not
// less. Kept as the negative half of the pair, so the asymmetry is on the record.
{
	const { content } = await captureWith(async event => {
		if (event.type == event.RESOURCES_INITIALIZED) {
			await new Promise(resolve => setTimeout(resolve, 0));
		}
	});
	check("a listener yielding on RESOURCES_INITIALIZED captures every resource", embedded(content), 3);
}

// The event contract the fix had to preserve. STAGE_STARTED is still dispatched before the stage's
// tasks and before STAGE_ENDED, and the listener's own work for it still finishes before STAGE_ENDED
// is delivered — it is awaited at the end of the stage rather than at the beginning, not dropped.
{
	const order = [];
	const { content } = await captureWith(async event => {
		if (event.type == event.STAGE_STARTED) {
			order.push("started-" + event.detail.step);
			await new Promise(resolve => setTimeout(resolve, 0));
			order.push("started-done-" + event.detail.step);
		}
		if (event.type == event.STAGE_ENDED) {
			order.push("ended-" + event.detail.step);
		}
	});
	const firstStage = order.filter(entry => entry.endsWith("-0"));
	check("the capture still completes while the listener records the order", embedded(content), 3);
	check("STAGE_STARTED is dispatched before STAGE_ENDED", firstStage.indexOf("started-0") < firstStage.indexOf("ended-0"), true);
	check("the listener finishes STAGE_STARTED before STAGE_ENDED arrives", firstStage.indexOf("started-done-0") < firstStage.indexOf("ended-0"), true);
	check("every stage that started also ended", order.filter(entry => entry.startsWith("started-done-")).length, order.filter(entry => entry.startsWith("ended-")).length);
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

// A hang is the failure under test, so the capture races a timer and a timeout is reported as a
// failed check rather than left to stop the runner.
async function captureWith(onprogress) {
	const content = await Promise.race([
		capture(resources, { url: PAGE_URL, onprogress: onprogress || undefined }),
		new Promise(resolve => setTimeout(() => resolve(null), TIMEOUT))
	]);
	if (content === null) {
		console.log("FAIL capture hung, no result after " + TIMEOUT + " ms");
		failed = true;
	}
	return { content };
}

function embedded(content) {
	if (!content) {
		return -1;
	}
	return ["FONTDATA", "BGDATA", "PHOTODATA"].filter(payload => content.includes(btoa(payload))).length;
}

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}
