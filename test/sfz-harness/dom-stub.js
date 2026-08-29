// compression.js captures DOMParser from globalThis when the module is evaluated and Deno has
// none, so this module is imported before it. The stub is enough to tell whether the text body
// is written at all; it does not reproduce what a real DOM extraction produces.
globalThis.DOMParser = class {
	parseFromString(content) {
		return {
			body: {
				innerText: content.replace(/<[^>]*>/g, " "),
				querySelectorAll: () => []
			}
		};
	}
};
