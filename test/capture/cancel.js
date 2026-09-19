import { createProcessor, html } from "./common.js";

// Runner.initialize creates pendingPromises for the REPLACE_DATA stage and Runner.run only awaits it
// after the whole batch fetch has finished, so between those two points the promise has no handler.
// Cancelling in that window rejects every outstanding request, REPLACE_DATA rejects with them, and
// the engine reports an unhandled rejection for a promise run() is about to await a moment later.
// Attaching a catch at creation silences that report without swallowing anything: the await in run()
// still rejects, which is how content.js learns the capture ended.
//
// Cancel is the only thing that reaches the window. A listener throwing on RESOURCE_LOADED leaves the
// requests unsettled instead, and a failing fetch never rejects a request at all, getContent turns it
// into empty content. So the cases below all cancel.
//
// A suite that lets an unhandled rejection through stops the Deno process rather than failing, so the
// handler counts them and calls preventDefault.

const PAGE_URL = "https://example.com/page.html";
const FAST_URL = "https://example.com/fast.png";
const SLOW_URL = "https://example.com/slow.png";
const SETTLE_DELAY = 200;

const PAGE = html("<img src=\"" + FAST_URL + "\"><img src=\"" + SLOW_URL + "\"><p>text</p>");

const resources = {
	[PAGE_URL]: { body: PAGE },
	[FAST_URL]: { body: "FASTDATA", contentType: "image/png" },
	[SLOW_URL]: { body: "SLOWDATA", contentType: "image/png", delay: 300 }
};

let failed = false;
let unhandled = 0;

globalThis.addEventListener("unhandledrejection", event => {
	unhandled++;
	event.preventDefault();
});

// The regression. Cancelling on the first RESOURCE_LOADED puts the cancel inside the window by
// construction rather than by timing: one resource has answered, the other is still 300 ms away, so
// run() is parked on the batch while REPLACE_DATA rejects. Without the catch this reports one
// unhandled rejection per cancel, and a user cancelling a save gets it in the page console.
{
	const { outcome, unhandledCount } = await captureAndCancel("resource-loaded");
	check("a capture cancelled while the batch is fetching reports no unhandled rejection", unhandledCount, 0);
	check("a capture cancelled while the batch is fetching still rejects", outcome, "rejected");
}

// The other half of the fix: the catch must not swallow the outcome. run() still awaits the same
// promise, so the rejection reaches the caller, which is what tells content.js the capture is over.
// It rejects with undefined because cancel() rejects with no argument, and content.js never reads the
// value: it tests processor.cancelled first.
{
	const { reason } = await captureAndCancel("resource-loaded");
	check("the rejection still carries what cancel() threw", reason, undefined);
}

// Cancelling before the resource burst is a different path and not an error: executeStage skips every
// task once cancelled, so nothing is ever requested and the capture completes on an empty page. Kept
// so a future change to the guard cannot turn a clean early cancel into a rejection unnoticed.
{
	const { outcome, unhandledCount } = await captureAndCancel("immediate");
	check("a capture cancelled before the batch starts completes", outcome, "completed");
	check("a capture cancelled before the batch starts reports no unhandled rejection", unhandledCount, 0);
}

// The control. A capture nobody cancels has always been quiet, and a fix that silenced rejections
// some other way would pass the cases above and break this one.
{
	const { outcome, unhandledCount } = await captureAndCancel("never");
	check("a capture nobody cancels completes", outcome, "completed");
	check("a capture nobody cancels reports no unhandled rejection", unhandledCount, 0);
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

async function captureAndCancel(when) {
	unhandled = 0;
	let processor;
	const options = { url: PAGE_URL };
	if (when == "resource-loaded") {
		options.onprogress = event => {
			if (event.type == event.RESOURCE_LOADED) {
				processor.cancel();
			}
		};
	}
	processor = createProcessor(resources, options);
	const running = processor.run().then(() => ({ outcome: "completed" }), error => ({ outcome: "rejected", reason: error }));
	if (when == "immediate") {
		processor.cancel();
	}
	const result = await running;
	// an unhandled rejection is reported once the microtask queue has drained and the loop has turned,
	// so the count is only trustworthy after the capture has settled and the loop has been given back
	await new Promise(resolve => setTimeout(resolve, SETTLE_DELAY));
	return { ...result, unhandledCount: unhandled };
}

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}
