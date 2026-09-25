import { capture, captureArchive, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";
const USDZ_URL = "https://example.com/teapot.usdz";
const GLB_URL = "https://example.com/teapot.glb";
const ENVIRONMENT_URL = "https://example.com/studio.hdr";
const OTHER_URL = "https://example.com/other.usdz";
const RESOURCES = {
	[USDZ_URL]: { body: "USDZ", contentType: "model/vnd.usdz+zip" },
	[GLB_URL]: { body: "GLB", contentType: "model/gltf-binary" },
	[ENVIRONMENT_URL]: { body: "HDR", contentType: "image/vnd.radiance" },
	[OTHER_URL]: { body: "OTHER", contentType: "model/vnd.usdz+zip" }
};

let failed = false;

// The <model> element takes its file from src, or from one <source> per format like <video>, and
// WebKit reads an image-based lighting file from environmentmap. Only src used to be embedded, so
// a model declared with sources, the form the explainer shows, and every environment map stayed
// remote in the saved page and disappeared once the site did.
{
	const page = html("<model id=\"m1\" src=\"other.usdz\"></model><model id=\"m2\" environmentmap=\"studio.hdr\"><source src=\"teapot.usdz\" type=\"model/vnd.usdz+zip\"><source src=\"teapot.glb\" type=\"model/gltf-binary\"></model>");
	const content = await capture({ [PAGE_URL]: { body: page }, ...RESOURCES }, { url: PAGE_URL, content: page });
	check("a model src is embedded", content.includes("data:model/vnd.usdz+zip;base64," + btoa("OTHER")), true);
	check("a model source is embedded", content.includes("data:model/vnd.usdz+zip;base64," + btoa("USDZ")), true);
	check("every source of a model is embedded", content.includes("data:model/gltf-binary;base64," + btoa("GLB")), true);
	check("an environment map is embedded", content.includes("data:image/vnd.radiance;base64," + btoa("HDR")), true);
	check("the type of a source is kept", content.includes("type=model/gltf-binary") || content.includes("type=\"model/gltf-binary\""), true);
	check("no remote model URL is left", /teapot\.(usdz|glb)|studio\.hdr|other\.usdz/.test(content), false);
}

// A <source> outside a <model> is not a model file, and is left to the rules of its own parent.
{
	const page = html("<div><source src=\"teapot.usdz\"></div>");
	const content = await capture({ [PAGE_URL]: { body: page }, ...RESOURCES }, { url: PAGE_URL, content: page });
	check("a source outside a model is not fetched as one", content.includes(btoa("USDZ")), false);
}

// In an archive the files are stored beside the page rather than inlined.
{
	const page = html("<model environmentmap=\"studio.hdr\"><source src=\"teapot.usdz\" type=\"model/vnd.usdz+zip\"></model>");
	const { content, resources } = await captureArchive({ [PAGE_URL]: { body: page }, ...RESOURCES }, { url: PAGE_URL, content: page });
	check("an archive stores the model source", /<source src="?[^\s">]+"? type/.test(content) && !content.includes("teapot.usdz"), true);
	check("an archive stores the environment map", /environmentmap="?[^\s">]+/.test(content) && !content.includes("studio.hdr"), true);
	const names = Object.values(resources).filter(Array.isArray).flat().map(resource => resource.name).sort().join(",");
	check("an archive holds both files", names, "images/0.usdz,images/1.hdr");
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
