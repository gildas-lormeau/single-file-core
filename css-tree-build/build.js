import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const packagePath = require.resolve("css-tree/package.json");
const licensePath = packagePath.replace(/package\.json$/, "LICENSE");
const { name, version } = JSON.parse(readFileSync(packagePath));

const PATCHES = [
	{
		name: "large url() string allocations",
		file: /[/\\]css-tree[/\\].*[/\\]utils[/\\]url\.js$/,
		replacements: [
			[
				"            decoded += str[i];",
				"            // Data URLs can contain megabytes. Append the whole unescaped run:\n            // one concatenation per character otherwise retains a rope node per\n            // byte in the AST, far larger than the resource itself.\n            const nextEscape = str.indexOf('\\\\', i);\n            const runEnd = nextEscape === -1 ? end + 1 : Math.min(nextEscape, end + 1);\n            decoded += str.slice(i, runEnd);\n            i = runEnd - 1;",
				1
			],
			[
				"export function encode(str) {\n    let encoded = '';\n    let wsBeforeHexIsNeeded = false;\n\n    for (let i = 0; i < str.length; i++) {\n        const code = str.charCodeAt(i);\n\n        // If the character is NULL (U+0000), then the REPLACEMENT CHARACTER (U+FFFD).\n        if (code === 0x0000) {\n            encoded += '\\uFFFD';\n            continue;\n        }\n\n        // If the character is in the range [\\1-\\1f] (U+0001 to U+001F) or is U+007F,\n        // the character escaped as code point.\n        // Note: Do not compare with 0x0001 since 0x0000 is precessed before\n        if (code <= 0x001f || code === 0x007F) {\n            encoded += '\\\\' + code.toString(16);\n            wsBeforeHexIsNeeded = true;\n            continue;\n        }\n\n        if (code === SPACE ||\n            code === REVERSE_SOLIDUS ||\n            code === QUOTATION_MARK ||\n            code === APOSTROPHE ||\n            code === LEFTPARENTHESIS ||\n            code === RIGHTPARENTHESIS) {\n            encoded += '\\\\' + str.charAt(i);\n            wsBeforeHexIsNeeded = false;\n        } else {\n            if (wsBeforeHexIsNeeded && isHexDigit(code)) {\n                encoded += ' ';\n            }\n\n            encoded += str.charAt(i);\n            wsBeforeHexIsNeeded = false;\n        }\n    }\n\n    return 'url(' + encoded + ')';\n}\n",
				"export function encode(str) {\n    let wsBeforeHexIsNeeded = false;\n\n    // Keep ordinary runs together instead of allocating a concatenation node\n    // per character. Embedded font/image URLs can be several megabytes long,\n    // including after a prefix that needs escaping, so a whole-string fast\n    // path alone would still leave large allocations for those URLs.\n    const encoded = str.replace(/[^\\x00-\\x20\\x7f\"'()\\\\]+|[\\s\\S]/g, part => {\n        const code = part.charCodeAt(0);\n\n        if (code === 0x0000) {\n            return '\\uFFFD';\n        }\n\n        if (code <= 0x001f || code === 0x007F) {\n            wsBeforeHexIsNeeded = true;\n            return '\\\\' + code.toString(16);\n        }\n\n        if (code === SPACE ||\n            code === REVERSE_SOLIDUS ||\n            code === QUOTATION_MARK ||\n            code === APOSTROPHE ||\n            code === LEFTPARENTHESIS ||\n            code === RIGHTPARENTHESIS) {\n            wsBeforeHexIsNeeded = false;\n            return '\\\\' + part;\n        }\n\n        const prefix = wsBeforeHexIsNeeded && isHexDigit(code) ? ' ' : '';\n        wsBeforeHexIsNeeded = false;\n        return prefix + part;\n    });\n\n    return 'url(' + encoded + ')';\n}\n",
				1
			]
		]
	},
	{
		name: "16MB token offset",
		file: /[/\\]css-tree[/\\].*[/\\]tokenizer[/\\]TokenStream\.js$/,
		replacements: [
			["const OFFSET_MASK = 0x00FFFFFF;", "const OFFSET_MASK = 0x07FFFFFF;", 1],
			["const TYPE_SHIFT = 24;", "const TYPE_SHIFT = 27;", 1],
			[">> TYPE_SHIFT", ">>> TYPE_SHIFT", 9]
		]
	},
	{
		name: "balance buffer cleared beyond the source",
		file: /[/\\]css-tree[/\\].*[/\\]tokenizer[/\\]TokenStream\.js$/,
		replacements: [
			["balance.fill(0);", "balance.fill(0, 0, sourceLength + 1);", 1]
		]
	},
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
	"// with the token offset field widened from 24 to 27 bits so stylesheets larger",
	"// than 16MB do not corrupt the token stream (parsing never terminated on them),",
	"// with the tokenizer clearing only the part of its balance buffer it uses (the",
	"// buffer never shrinks, so every later parse was paying for the largest source),",
	"// and with url() decoding keeping an escaped whitespace at the end of the value",
	"// (the decoder trimmed it and lost everything before the escape), and with",
	"// URL encoding/decoding preserving whole runs to avoid per-character ropes",
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
