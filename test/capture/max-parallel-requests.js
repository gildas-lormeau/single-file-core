import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";
const FIRST_HOST = "https://first.example.com/";
const SECOND_HOST = "https://second.example.com/";
const IMAGES_PER_HOST = 12;
// long enough for a request that waits for a slot to start visibly after the ones holding the slots
const DELAY = 80;
const SLACK = 30;
const IMAGE = new Uint8Array(16).fill(0x21);

let failed = false;

// Every image answers DELAY ms after it is requested, and records when it was requested: with a cap of
// six, the seventh request of a host cannot start before the first one has answered.
{
	const { starts, content } = await captureImages({});
	check("the first six requests of a host leave together", spread(starts.first.slice(0, 6)) < SLACK, true);
	check("the seventh waits for an answer", starts.first[6] - starts.first[0] >= DELAY - 10, true);
	check("the other host is not held back by the first", starts.second[0] - starts.first[0] < SLACK, true);
	check("every image is still embedded", count(content, "data:image/png;base64"), IMAGES_PER_HOST * 2);
}

// The option sets the cap.
{
	const { starts } = await captureImages({ maxParallelRequestsPerHost: 2 });
	check("two requests leave together with a cap of two", spread(starts.first.slice(0, 2)) < SLACK, true);
	check("the third waits", starts.first[2] - starts.first[0] >= DELAY - 10, true);
}

// Zero lifts the cap: the browser's behaviour before it existed, every request at once.
{
	const { starts, content } = await captureImages({ maxParallelRequestsPerHost: 0 });
	check("every request of a host leaves together with the cap off", spread(starts.first) < SLACK, true);
	check("every image is embedded with the cap off", count(content, "data:image/png;base64"), IMAGES_PER_HOST * 2);
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

async function captureImages(options) {
	const starts = { first: [], second: [] };
	const resources = {};
	let page = "<h1>Images</h1>";
	for (const [name, host] of [["first", FIRST_HOST], ["second", SECOND_HOST]]) {
		for (let index = 0; index < IMAGES_PER_HOST; index++) {
			const url = host + "image-" + index + ".png";
			resources[url] = { body: IMAGE, contentType: "image/png", delay: DELAY, onRequest: () => starts[name].push(Date.now()) };
			page += "<img src=\"" + url + "\">";
		}
	}
	const content = await capture(resources, { url: PAGE_URL, content: html(page), ...options });
	starts.first.sort((a, b) => a - b);
	starts.second.sort((a, b) => a - b);
	return { starts, content };
}

function spread(times) {
	return times[times.length - 1] - times[0];
}

function count(text, needle) {
	return text.split(needle).length - 1;
}

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}
