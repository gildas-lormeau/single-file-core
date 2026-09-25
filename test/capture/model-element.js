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

// Servers often answer .glb and .usdz files with application/octet-stream, and the saved data URI
// carried that type. The bytes say what they are: a binary glTF starts with "glTF", and a USDZ is a
// zip whose first file is a USD layer. Another zip is left as the server described it.
{
	const page = html("<model id=\"m1\" src=\"a.glb\"></model><model id=\"m2\" src=\"b.usdz\"></model><model id=\"m3\" src=\"c.zip\"></model>");
	const glb = new Uint8Array([103, 108, 84, 70, 2, 0, 0, 0]);
	const content = await capture({
		[PAGE_URL]: { body: page },
		"https://example.com/a.glb": { body: glb, contentType: "application/octet-stream" },
		"https://example.com/b.usdz": { body: zip("scene.usdc"), contentType: "application/octet-stream" },
		"https://example.com/c.zip": { body: zip("readme.txt"), contentType: "application/octet-stream" }
	}, { url: PAGE_URL, content: page });
	check("a glb served as octet-stream is saved as model/gltf-binary", content.includes("data:model/gltf-binary;base64,"), true);
	check("a usdz served as octet-stream is saved as model/vnd.usdz+zip", content.includes("data:model/vnd.usdz+zip;base64,"), true);
	check("a zip holding no USD layer keeps its type", content.includes("data:application/octet-stream;base64,"), true);
}

// A missing model answered with an HTML page, a soft 404, is not saved as the model.
{
	const page = html("<model src=\"gone.usdz\"></model>");
	const errorPage = "<!DOCTYPE html><title>Not found</title>";
	const content = await capture({
		[PAGE_URL]: { body: page },
		"https://example.com/gone.usdz": { body: errorPage, contentType: "text/html" }
	}, { url: PAGE_URL, content: page });
	check("an HTML error page is not saved as a model", content.includes(btoa(errorPage)), false);
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

// the local file header of a zip whose first entry is `filename`, which is all the sniffing reads
function zip(filename) {
	const name = new globalThis.TextEncoder().encode(filename);
	const header = new Uint8Array(30 + name.length);
	header.set([80, 75, 3, 4]);
	header[26] = name.length;
	header.set(name, 30);
	return header;
}

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}
