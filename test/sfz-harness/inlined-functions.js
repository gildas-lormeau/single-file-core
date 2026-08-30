/*
 * Copyright 2010-2026 Gildas Lormeau
 * contact : gildas.lormeau <at> gmail.com
 *
 * This file is part of SingleFile.
 *
 *   The code in this file is free software: you can redistribute it and/or
 *   modify it under the terms of the GNU Affero General Public License
 *   (GNU AGPL) as published by the Free Software Foundation, either version 3
 *   of the License, or (at your option) any later version.
 *
 *   The code in this file is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero
 *   General Public License for more details.
 *
 *   As additional permission under GNU AGPL version 3 section 7, you may
 *   distribute UNMODIFIED VERSIONS OF THIS file without the copy of the GNU
 *   AGPL normally required by section 4, provided you include this license
 *   notice and a URL through which recipients can access the Corresponding
 *   Source.
 */

// `createArchive` builds the script of a self-extracting archive by serializing functions with
// toString() and pasting the text into the generated page. That page has no module scope, so
// anything such a function names has to be declared inside it. An import is the trap: it survives
// bundling, the call still reads correctly in the source, and the archive then fails at runtime
// with a bare ReferenceError while the page stays blank.
//
// It is worse than it looks, because a minifier can hide it. `display` called an imported
// `getDoctypeString`, and terser inlined that helper into the release bundle, so released
// archives worked while every unminified build produced archives that threw
// `ReferenceError: getDoctypeString is not defined` and rendered nothing.
//
// The invariant below is what makes that impossible to reintroduce: a module holding an inlined
// function declares that function and nothing else, so there is no module scope to close over.

const MODULES = [
	{ path: "../../processors/compression/compression-display.js", functions: ["display"] },
	{ path: "../../processors/compression/compression-extract.js", functions: ["extract"] },
	{ path: "../../processors/compression/compression-router.js", functions: ["router"] }
];
const TOP_LEVEL_DECLARATION = /^(?:export\s+)?(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/;

let failures = 0;

for (const { path, functions } of MODULES) {
	const source = await Deno.readTextFile(new URL(path, import.meta.url));
	const name = path.split("/").pop();
	const lines = source.split("\n");
	const imports = lines.filter(line => /^import[\s{]/.test(line) || /^\s*import\s*\(/.test(line));
	check(name + " imports nothing", imports.length === 0, imports.join(" | "));
	const declared = [];
	lines.forEach(line => {
		if (line === line.trimStart()) {
			const match = line.match(TOP_LEVEL_DECLARATION);
			if (match) {
				declared.push(match[1]);
			}
		}
	});
	const unexpected = declared.filter(identifier => !functions.includes(identifier));
	check(name + " declares nothing at module scope but " + functions.join(", "),
		unexpected.length === 0, unexpected.join(", "));
}

// the one inlined function that does live beside module scope, in compression.js, states the rule
// in a comment and binds every global it uses itself; assert that binding is still there
const compression = await Deno.readTextFile(new URL("../../processors/compression/compression.js", import.meta.url));
const getContentBody = compression.slice(compression.indexOf("async function getContent()"));
check("getContent binds its globals locally",
	/const \{[^}]*\} = globalThis;/.test(getContentBody.slice(0, 2000)));

console.log(failures ? `\n${failures} check(s) FAILED` : "\nall checks passed");
Deno.exit(failures ? 1 : 0);

function check(label, condition, detail) {
	if (!condition) {
		failures++;
	}
	console.log((condition ? "PASS" : "FAIL") + " " + label + (condition || !detail ? "" : ": " + detail));
}
