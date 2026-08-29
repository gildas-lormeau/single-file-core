import { makePageData, makeOptions, runProcess } from "./common.js";

const options = makeOptions();
const pageData = makePageData(1, 256 * 1024);
const result = await runProcess(pageData, options);
console.log("page size:", result.bytes.length);
console.log("fallback tag:", result.fallbackTag);
console.log("extraction disabled:", result.extractionDisabled);
const head = new TextDecoder().decode(result.bytes.subarray(0, 200));
console.log("head:", JSON.stringify(head));
