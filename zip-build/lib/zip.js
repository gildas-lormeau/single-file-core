import { configure, setDefaultConfiguration } from "../node_modules/@zip.js/zip.js/lib/core/configuration.js";
import { DecompressionStreamFallback } from "./fflate-streams.js";

setDefaultConfiguration({
	workerURI: null,
	wasmURI: null,
	DecompressionStreamFallback
});

export {
	ZipReader
} from "../node_modules/@zip.js/zip.js/lib/core/zip-reader.js";
export {
	HttpRangeReader,
	BlobReader,
	BlobWriter,
	TextWriter,
	Data64URIWriter
} from "../node_modules/@zip.js/zip.js/lib/core/io.js";
export {
	configure
};
export {
	inflateSync as inflateRaw
} from "./fflate.js";
