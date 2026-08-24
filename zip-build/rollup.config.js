/* global URL */

import { readFileSync } from "node:fs";
import terser from "@rollup/plugin-terser";

const reservedPropertyNames = [...JSON.parse(readFileSync(new URL("./reserved-property-names.json", import.meta.url))), "inflateRaw"];

const bundledTerserOptions = {
	compress: {
		unsafe: true,
		unsafe_arrows: true,
		unsafe_comps: true,
		unsafe_symbols: true,
		unsafe_proto: true,
		keep_fargs: false,
		passes: 3,
		ecma: 2019
	},
	mangle: {
		properties: {
			keep_quoted: "strict",
			reserved: reservedPropertyNames
		}
	}
};

const GLOBALS = "const { Array, Object, String, Number, BigInt, Math, Date, Map, Set, Response, URL, Error, Uint8Array, Uint16Array, Uint32Array, DataView, Blob, Promise, TextEncoder, TextDecoder, crypto, btoa, TransformStream, ReadableStream, WritableStream, CompressionStream, DecompressionStream, navigator, Worker, setTimeout, clearTimeout } = typeof globalThis !== 'undefined' ? globalThis : this || self;";
const GLOBALS_WORKER = "const { Array, Object, Number, Math, Error, Uint8Array, Uint16Array, Uint32Array, Int32Array, Map, DataView, Promise, TextEncoder, crypto, postMessage, TransformStream, ReadableStream, WritableStream, CompressionStream, DecompressionStream } = self;";

export default [{
	input: "lib/zip.js",
	output: [{
		intro: GLOBALS,
		file: "../vendor/zip/zip.min.js",
		format: "umd",
		name: "zip",
		plugins: [terser(bundledTerserOptions)]
	}]
}, {
	input: "lib/zip-vendor.js",
	output: [{
		intro: GLOBALS,
		file: "../vendor/zip/zip.js",
		format: "es"
	}]
}, {
	input: "lib/zip-vendor-worker.js",
	output: [{
		intro: GLOBALS_WORKER,
		file: "../vendor/zip/z-worker.js",
		format: "iife",
		plugins: [terser(bundledTerserOptions)]
	}]
}];
