// Runs every suite under test/, so that adding one means adding a file rather than editing a chain
// of shell commands. Two failure modes are worth naming, because this exists to remove the first
// without introducing the second: a suite nobody added to a hand-written list is never run and
// nobody notices, and a runner that takes every file it finds runs a scratch file that was never a
// test — single-file-tests did exactly that inside a release gate. So the files that are NOT suites
// are named below and anything else in these directories is run, which fails loudly rather than
// quietly. Keep this list in step when a helper or a tool is added.
//
// Unlike the chain it replaces, one red suite no longer hides the nineteen behind it: everything
// runs, and the summary says what failed.
//
//   deno run --allow-read --allow-run test/run.js            every suite
//   deno run --allow-read --allow-run test/run.js cap font   suites whose path matches an argument
//   deno run --allow-read --allow-run test/run.js --verbose  with the output of the suites that pass

const SUITE_DIRECTORIES = ["sfz-harness", "capture"];
const NOT_SUITES = [
	"sfz-harness/common.js",
	"sfz-harness/dom-stub.js",
	"sfz-harness/gen-e2e-page.js",
	"sfz-harness/search-triggers.js",
	"sfz-harness/smoke.js",
	"capture/common.js",
	"capture/dom.js"
];

const verbose = Deno.args.includes("--verbose");
const filters = Deno.args.filter(argument => !argument.startsWith("--"));
const suites = await findSuites();
const selected = filters.length ? suites.filter(suite => filters.some(filter => suite.includes(filter))) : suites;

if (!selected.length) {
	console.log(filters.length ? `no suite matches ${filters.join(", ")}` : "no suite found");
	Deno.exit(1);
}

let checksPassed = 0, checksFailed = 0;
const failures = [];
for (const suite of selected) {
	const result = await runSuite(suite);
	checksPassed += result.passed;
	checksFailed += result.failed;
	if (result.ok) {
		console.log(`PASS ${suite}${result.passed ? ` (${result.passed} checks)` : ""}`);
		if (verbose) {
			console.log(indent(result.output));
		}
	} else {
		failures.push(suite);
		console.log(`FAIL ${suite}${result.failed ? ` (${result.failed} of ${result.passed + result.failed} checks)` : ` (exit ${result.code})`}`);
		// a suite that fails a check has already said which one; a suite that crashed has not, and
		// its output is the only thing that explains the exit code
		console.log(indent(result.failed ? result.failedLines : result.output));
	}
}

const skipped = NOT_SUITES.length;
console.log(`\n${selected.length} suites, ${checksPassed + checksFailed} checks, ${skipped} files skipped as tools or helpers`);
if (failures.length) {
	console.log(`FAILED: ${failures.join(", ")}`);
	Deno.exit(1);
}
console.log("all suites passed");

async function findSuites() {
	const found = [];
	for (const directory of SUITE_DIRECTORIES) {
		const names = [];
		for await (const entry of Deno.readDir(new URL(directory + "/", import.meta.url))) {
			if (entry.isFile && entry.name.endsWith(".js")) {
				names.push(entry.name);
			}
		}
		names.sort();
		for (const name of names) {
			const path = directory + "/" + name;
			if (!NOT_SUITES.includes(path)) {
				found.push(path);
			}
		}
	}
	return found;
}

async function runSuite(suite) {
	const command = new Deno.Command(Deno.execPath(), {
		args: ["run", "--allow-read", new URL(suite, import.meta.url).pathname],
		stdout: "piped",
		stderr: "piped"
	});
	const { code, stdout, stderr } = await command.output();
	const decoder = new TextDecoder();
	const output = (decoder.decode(stdout) + decoder.decode(stderr)).trimEnd();
	// the space matters: a suite ends on a bare "FAILED" line, which is a verdict and not a check
	const lines = output.split("\n");
	const failedLines = lines.filter(line => line.startsWith("FAIL ")).join("\n");
	return {
		code,
		ok: code === 0,
		output,
		failedLines,
		passed: lines.filter(line => line.startsWith("PASS ")).length,
		failed: lines.filter(line => line.startsWith("FAIL ")).length
	};
}

function indent(text) {
	return text.split("\n").map(line => "  " + line).join("\n");
}
