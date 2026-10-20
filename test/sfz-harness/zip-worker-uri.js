// Inside an extension, the zip worker was loaded from a path hard-coded in two places,
// `/lib/single-file-z-worker.js`, so another extension embedding core had to ship the worker at that
// exact path or every archive silently fell back to the main thread once the worker startup timed
// out: 2 s in the multi-page packager, zip.js's 5 s default on the single-page path. The path is now
// the `zipWorkerURI` option, read by both paths through configureZipWorker, with the same default
// and the same 2 s timeout, and no worker at all outside an extension, as before.

import "./dom-stub.js";

globalThis.browser = { runtime: { getURL: path => path } };
const { configureZipWorker, DEFAULT_ZIP_WORKER_URI } = await import("./../../processors/compression/compression.js");

let failed = false;

check("the default worker path is the one the extensions ship", DEFAULT_ZIP_WORKER_URI, "/lib/single-file-z-worker.js");
check("an extension without the option gets the default path",
	configureZipWorker({}), { workerURI: "/lib/single-file-z-worker.js", workerStartupTimeout: 2000 });
check("an extension passing zipWorkerURI gets its own path",
	configureZipWorker({ zipWorkerURI: "/vendor/sf/z-worker.js" }), { workerURI: "/vendor/sf/z-worker.js", workerStartupTimeout: 2000 });
check("an empty zipWorkerURI falls back to the default path",
	configureZipWorker({ zipWorkerURI: "" }).workerURI, "/lib/single-file-z-worker.js");
globalThis.browser.runtime = undefined;
check("control: outside an extension no worker is used, whatever the option",
	configureZipWorker({ zipWorkerURI: "/vendor/sf/z-worker.js" }), { useWebWorkers: false });

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
