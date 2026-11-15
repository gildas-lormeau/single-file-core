// process() in processors/lazy/content/content-lazy-loader.js decides whether the deferred-content
// pass runs at all. It used to compare the document to the window only, so a page that keeps the
// document at the size of the window and scrolls an inner element never got the pass: the first
// rows were saved and every thumbnail below them was missing (tv.free.fr, music.apple.com). The
// pass now also starts when a large enough element of the page is scrollable.
//
// The decision reads layout: clientHeight, scrollHeight and the computed overflow. happy-dom has
// no layout and answers 0 for all of them, so this suite does not use dom.js. It hands the module
// a tree of plain objects carrying exactly the properties the code reads, with the numbers a
// browser would give, and watches for the event that opens the pass.

const WINDOW_WIDTH = 1280;
const WINDOW_HEIGHT = 720;
const START_EVENT = "single-file-load-deferred-content-start";
const OPTIONS = { loadDeferredContentMaxIdleTime: 0 };

const events = [];
const fakeDocument = {
	documentElement: undefined,
	body: undefined,
	addEventListener() { },
	removeEventListener() { },
	dispatchEvent(event) {
		events.push(event.type);
	}
};

globalThis.window = globalThis;
globalThis.document = fakeDocument;
globalThis.Document = class { };
globalThis.MutationObserver = class {
	observe() { }
	disconnect() { }
};
globalThis.getComputedStyle = element => element.style;
globalThis.innerWidth = WINDOW_WIDTH;
globalThis.innerHeight = WINDOW_HEIGHT;
globalThis.scrollX = 0;
globalThis.scrollY = 0;

const { process } = await import("./../../processors/lazy/content/content-lazy-loader.js");

let failed = false;

// The control: a document taller than the window started the pass before the change and still does.
check("a document taller than the window starts the pass",
	await passStarts(page({ documentHeight: 5000 })), true);

check("a page that fits the window and scrolls nothing does not start the pass",
	await passStarts(page({ children: [box({ height: 656 })] })), false);

// The Free TV shape: a fixed header, then a container that takes the rest of the window and scrolls.
check("a scrollable element filling the window starts the pass",
	await passStarts(page({ children: [box({ height: 64 }), box({ height: 656, scrollHeight: 10366, overflowY: "auto" })] })), true);

check("overflow: scroll is accepted like overflow: auto",
	await passStarts(page({ children: [box({ height: 656, scrollHeight: 10366, overflowY: "scroll" })] })), true);

// Clipped content cannot be scrolled to by the reader, so it is not deferred content of the page.
check("an element that clips its content does not start the pass",
	await passStarts(page({ children: [box({ height: 656, scrollHeight: 10366, overflowY: "hidden" })] })), false);

check("a scroll container whose content fits does not start the pass",
	await passStarts(page({ children: [box({ height: 656, scrollHeight: 656, overflowY: "auto" })] })), false);

// The scroll container of an application sits under several wrappers of the size of the window.
check("a scrollable element under full-size wrappers starts the pass",
	await passStarts(page({ children: [box({ height: 720, children: [box({ height: 720, children: [box({ height: 656, scrollHeight: 4072, overflowY: "auto" })] })] })] })), true);

// Twitch: a header and a banner leave the scroll container 313px of a 633px window, under half of
// it. A threshold of half the window missed it by 3px, which is why the threshold is a third.
check("a scrollable element under half the window height starts the pass",
	await passStarts(page({ children: [box({ height: 400 }), box({ height: 320, scrollHeight: 2708, overflowY: "auto" })] })), true);

// A carousel or a side list scrolls too, and neither is the content of the page.
check("a scrollable element under a third of the window height does not start the pass",
	await passStarts(page({ children: [box({ height: 200, scrollHeight: 2000, overflowY: "auto" })] })), false);

check("a scrollable element under a third of the window width does not start the pass",
	await passStarts(page({ children: [box({ width: 240, height: 656, scrollHeight: 2000, overflowY: "auto" })] })), false);

// The walk does not go below an element that is too small, so a scroll container cannot be larger
// than what holds it and be found there.
check("a scrollable element inside a small element does not start the pass",
	await passStarts(page({ children: [box({ height: 200, children: [box({ height: 656, scrollHeight: 2000, overflowY: "auto" })] })] })), false);

check("a horizontally scrollable element filling the window starts the pass",
	await passStarts(page({ children: [box({ height: 656, scrollWidth: 6000, overflowX: "auto" })] })), true);

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

async function passStarts(documentElement) {
	events.length = 0;
	fakeDocument.documentElement = documentElement;
	fakeDocument.body = documentElement.children[0];
	await process(OPTIONS);
	return events.includes(START_EVENT);
}

function page({ documentHeight = WINDOW_HEIGHT, children = [] }) {
	const body = box({ height: WINDOW_HEIGHT, scrollHeight: documentHeight, children });
	return box({ height: WINDOW_HEIGHT, scrollHeight: documentHeight, children: [body] });
}

function box({ width = WINDOW_WIDTH, height, scrollWidth = width, scrollHeight = height, overflowX = "visible", overflowY = "visible", children = [] }) {
	return {
		clientWidth: width,
		clientHeight: height,
		scrollWidth,
		scrollHeight,
		style: { overflowX, overflowY },
		children
	};
}

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}
