import { setDefaultConfiguration } from "../node_modules/@zip.js/zip.js/lib/core/configuration.js";

setDefaultConfiguration({
	workerURI: null
});

export * from "../node_modules/@zip.js/zip.js/lib/zip-core.js";
export { initStream, readUint8Array } from "../node_modules/@zip.js/zip.js/lib/core/io.js";
export { deflateSync as deflateRaw, inflateSync as inflateRaw } from "./fflate.js";
