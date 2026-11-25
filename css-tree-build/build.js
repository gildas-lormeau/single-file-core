import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const packagePath = require.resolve("css-tree/package.json");
const licensePath = packagePath.replace(/package\.json$/, "LICENSE");
const { name, version } = JSON.parse(readFileSync(packagePath));

const PATCHES = [
	{
		name: "escaped trailing whitespace in url()",
		file: /[/\\]css-tree[/\\].*[/\\]utils[/\\]url\.js$/,
		replacements: [
			[
				"    while (start < end && isWhiteSpace(str.charCodeAt(end))) {\n        end--;\n    }",
				"    while (start < end && isWhiteSpace(str.charCodeAt(end))) {\n        let backslashes = 0;\n        while (end - backslashes > start && str.charCodeAt(end - backslashes - 1) === REVERSE_SOLIDUS) {\n            backslashes++;\n        }\n        if (backslashes % 2 === 1) {\n            break;\n        }\n        end--;\n    }",
				1
			],
			["decoded = str.substr(i + 1);", "decoded += str.substr(i + 1);", 1]
		]
	}
];

function applyPatch(patch, source) {
	for (const [pattern, replacement, expectedCount] of patch.replacements) {
		const count = source.split(pattern).length - 1;
		if (count != expectedCount) {
			throw new Error(`css-tree update changed ${patch.file}: found ${count} occurrence(s) of ${JSON.stringify(pattern)}, expected ${expectedCount} — review the ${patch.name} patch`);
		}
		source = source.replaceAll(pattern, replacement);
	}
	return source;
}

const patchPlugin = {
	name: "patch-css-tree",
	setup(build) {
		const applied = new Set();
		const patchesByFile = new Map();
		for (const patch of PATCHES) {
			patchesByFile.set(patch.file.source, (patchesByFile.get(patch.file.source) || []).concat(patch));
		}
		for (const [source, patches] of patchesByFile) {
			build.onLoad({ filter: new RegExp(source) }, args => {
				let contents = readFileSync(args.path, "utf8");
				for (const patch of patches) {
					applied.add(patch);
					contents = applyPatch(patch, contents);
				}
				return { contents, loader: "js" };
			});
		}
		build.onEnd(() => {
			for (const patch of PATCHES) {
				if (!applied.has(patch)) {
					throw new Error(`${patch.file} was not loaded — the ${patch.name} patch was not applied`);
				}
			}
		});
	}
};

const banner = [
	`// ${name} ${version} (https://github.com/eslint/csstree), bundled by css-tree-build/build.js`,
	"// with url() decoding keeping an escaped whitespace at the end of the value",
	"// (the decoder trimmed it and lost everything before the escape)",
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
