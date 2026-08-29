import { makePageData, makeOptions, runProcess } from "./common.js";

const outPath = Deno.args[0];
const seed = Number(Deno.args[1] ?? 1);
const contentLength = Number(Deno.args[2] ?? 256 * 1024);
const zipScript = await Deno.readTextFile(new URL("../../vendor/zip/zip.min.js", import.meta.url));
if (zipScript.includes("</script>")) {
	throw new Error("zip.min.js contains </script>, cannot embed raw");
}
const options = makeOptions({ zipScript });
const pageData = makePageData(seed, contentLength);
const result = await runProcess(pageData, options);
await Deno.writeFile(outPath, result.bytes);
console.log(`wrote ${outPath} (${result.bytes.length} bytes), fallback tag: ${result.fallbackTag}, extraction disabled: ${result.extractionDisabled}`);
