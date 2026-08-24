/* global TransformStream */

import { Deflate, Inflate } from "./fflate.js";

const FORMAT_DEFLATE_RAW = "deflate-raw";

class FflateStream extends TransformStream {
	constructor(codec) {
		super({
			start(controller) {
				codec.ondata = chunk => {
					if (chunk.length) {
						controller.enqueue(chunk);
					}
				};
			},
			transform(chunk) {
				codec.push(chunk);
			},
			flush() {
				codec.push(new Uint8Array(0), true);
			}
		});
	}
}

class CompressionStreamFallback extends FflateStream {
	constructor(format, { level } = {}) {
		checkFormat(format);
		super(new Deflate(level === undefined ? {} : { level }));
	}
}

class DecompressionStreamFallback extends FflateStream {
	constructor(format) {
		checkFormat(format);
		super(new Inflate());
	}
}

function checkFormat(format) {
	if (format != FORMAT_DEFLATE_RAW) {
		throw new TypeError("Unsupported compression format: " + format);
	}
}

export { CompressionStreamFallback, DecompressionStreamFallback };
