import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const packagePath = require.resolve("css-tree/package.json");
const tokenStreamPath = packagePath.replace(/package\.json$/, "lib/tokenizer/TokenStream.js");
const licensePath = packagePath.replace(/package\.json$/, "LICENSE");
const { version } = JSON.parse(readFileSync(packagePath));

const PATCHES = [
	["const OFFSET_MASK = 0x00FFFFFF;", "const OFFSET_MASK = 0x07FFFFFF;", 1],
	["const TYPE_SHIFT = 24;", "const TYPE_SHIFT = 27;", 1],
	[">> TYPE_SHIFT", ">>> TYPE_SHIFT", 8]
];

function patchTokenStream(source) {
	for (const [pattern, replacement, expectedCount] of PATCHES) {
		const count = source.split(pattern).length - 1;
		if (count != expectedCount) {
			throw new Error(`css-tree update changed TokenStream.js: found ${count} occurrence(s) of ${JSON.stringify(pattern)}, expected ${expectedCount} — review the 16MB token-offset patch`);
		}
		source = source.replaceAll(pattern, replacement);
	}
	return source;
}

const patchPlugin = {
	name: "patch-token-stream",
	setup(build) {
		let patched = false;
		build.onLoad({ filter: /[/\\]css-tree[/\\].*[/\\]TokenStream\.js$/ }, args => {
			patched = true;
			return { contents: patchTokenStream(readFileSync(args.path, "utf8")), loader: "js" };
		});
		build.onEnd(() => {
			if (!patched) {
				throw new Error("TokenStream.js was not loaded — the 16MB token-offset patch was not applied");
			}
		});
	}
};

const banner = [
	`// css-tree ${version} (https://github.com/csstree/csstree), bundled by css-tree-build/build.js`,
	"// with the token offset field widened from 24 to 27 bits so stylesheets larger",
	"// than 16MB do not corrupt the token stream (parsing never terminated on them)",
	"",
	"/*",
	readFileSync(licensePath, "utf8").trim().split("\n").map(line => (" * " + line).trimEnd()).join("\n"),
	" */"
].join("\n");

await build({
	stdin: {
		contents: "export * from \"css-tree\";",
		resolveDir: import.meta.dirname
	},
	bundle: true,
	minify: true,
	format: "esm",
	platform: "browser",
	legalComments: "none",
	banner: { js: banner },
	plugins: [patchPlugin],
	outfile: "../vendor/css-tree.js"
});
