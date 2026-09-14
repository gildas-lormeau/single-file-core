import { helper } from "./common.js";

// The loadDeferredImages* options were renamed to loadDeferredContent* because they never applied to
// images only: they govern every kind of deferred content, including frames and whole virtualized
// message lists. The old names stay accepted because they are public API in two ways core cannot
// see - a library caller passing them to getPageData, and another extension passing them through the
// external capture API - so this suite pins the compatibility shim rather than the rename.

const DEPRECATED_NAMES = {
	loadDeferredImages: "loadDeferredContent",
	loadDeferredImagesMaxIdleTime: "loadDeferredContentMaxIdleTime",
	loadDeferredImagesBlockCookies: "loadDeferredContentBlockCookies",
	loadDeferredImagesBlockStorage: "loadDeferredContentBlockStorage",
	loadDeferredImagesKeepZoomLevel: "loadDeferredContentKeepZoomLevel",
	loadDeferredImagesDispatchScrollEvent: "loadDeferredContentDispatchScrollEvent",
	loadDeferredImagesBeforeFrames: "loadDeferredContentBeforeFrames",
	loadDeferredImagesNativeTimeout: "loadDeferredContentNativeTimeout"
};

let failed = false;

{
	for (const deprecatedName of Object.keys(DEPRECATED_NAMES)) {
		const optionName = DEPRECATED_NAMES[deprecatedName];
		const value = deprecatedName.endsWith("MaxIdleTime") ? 3000 : true;
		const normalized = helper.normalizeOptions({ [deprecatedName]: value });
		check(`${deprecatedName} fills ${optionName}`, normalized[optionName], value);
	}
}

// A false or 0 must survive: testing the deprecated value for truthiness instead of for undefined
// would silently drop every option a user turned off, which is the half that matters most here.
{
	const normalized = helper.normalizeOptions({ loadDeferredImages: false, loadDeferredImagesMaxIdleTime: 0 });
	check("a deprecated false is carried over", normalized.loadDeferredContent, false);
	check("a deprecated 0 is carried over", normalized.loadDeferredContentMaxIdleTime, 0);
}

{
	const normalized = helper.normalizeOptions({ loadDeferredImages: false, loadDeferredContent: true });
	check("the new name wins when both are set", normalized.loadDeferredContent, true);
}

// getPageData is handed the caller's own object, so filling the new names in place would edit an
// object the caller still holds and may reuse for a second capture.
{
	const options = { loadDeferredImages: true };
	const normalized = helper.normalizeOptions(options);
	check("the caller's object is not mutated", options.loadDeferredContent, undefined);
	check("a copy is returned instead", normalized.loadDeferredContent, true);
}

{
	const options = { removeFrames: true };
	check("an options object without deprecated names is returned as is", helper.normalizeOptions(options), options);
}

{
	check("a missing options object is tolerated", helper.normalizeOptions(undefined), undefined);
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
