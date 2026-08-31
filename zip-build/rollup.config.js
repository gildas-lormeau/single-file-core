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
	},
	// zip.min.js is inlined into self-extracting pages, which declare windows-1252: a literal
	// non-ASCII character in the source is re-decoded there, and the CP437 table it belongs to
	// then maps every legacy entry name to garbage. terser prints the shortest form and turns
	// an escape back into the character, so the escaping has to be asked for here
	format: {
		ascii_only: true
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
