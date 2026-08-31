/*
 * Copyright 2010-2022 Gildas Lormeau
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

import {
	configure,
	deflateRaw,
	BlobReader,
	TextReader,
	ZipWriter,
	Uint8ArrayWriter
} from "./../../vendor/zip/zip.js";
import {
	extract
} from "./compression-extract.js";
import {
	display
} from "./compression-display.js";
import {
	router
} from "./compression-router.js";

const { Blob, fetch, TextEncoder, TextDecoder, DOMParser } = globalThis;

// windows-1252 never decodes bytes >= 0x80 into the ASCII range, the scanned patterns are all ASCII
const TEXT_DECODER = new TextDecoder("windows-1252");

// the extension is only a guess when it comes from the URL, and a wrong one costs the whole
// gain: a script served as text/javascript from a ".ts" URL was stored uncompressed at 2260
// bytes where the same bytes named ".js" deflate to 70. A textual content type is authoritative
// when the server sent one, the extension list decides everything else
const COMPRESSIBLE_CONTENT_TYPES = ["application/javascript", "application/x-javascript", "application/ecmascript", "application/json", "application/ld+json", "application/manifest+json", "application/xml", "application/xhtml+xml", "application/rss+xml", "application/atom+xml", "image/svg+xml"];
const TEXT_CONTENT_TYPE_PREFIX = "text/";
const NO_COMPRESSION_EXTENSIONS = [".jpg", ".jpeg", ".png", ".apng", ".gif", ".webp", ".avif", ".heif", ".heic", ".jxl", ".pdf", ".woff", ".woff2", ".mp4", ".webm", ".avi", ".mpeg", ".mov", ".ts", ".ogv", ".mp3", ".ogg", ".oga", ".weba", ".m4a", ".aac", ".opus", ".flac"];
const SCRIPT_PATH = "/lib/single-file-zip.min.js";
// <noscript> is excluded: it is the only tag whose content is raw text when scripting is
// enabled and markup when it is not, so the archive bytes would be parsed on a page opened
// without scripting
// the script and style rungs come first because text extractors drop their content the way
// they drop a comment: macOS Spotlight indexes the content of every other rung, and textutil
// also reads the last two. Neither is applied nor executed, the type is neither CSS nor
// JavaScript. <plaintext> stays last, it is the only rung that cannot be closed
// the CDATA section sits second to last, and it is the one rung a payload is unlikely to hold
// the terminator of: every other rung ends on a sequence that real documents carry, which is
// also why each level of self-nesting burns one. It is low in the ladder only because text
// extractors read its content; nothing about the parse is weaker. A CDATA section is only a
// CDATA section in foreign content, hence the <svg> element around it
const EXTRA_DATA_TAGS = [
	["<script type=sfz-data>", "</script>"],
	["<style type=sfz-data>", "</style>"],
	["<noframes>", "</noframes>"],
	["<noembed>", "</noembed>"],
	["<iframe>", "</iframe>"],
	["<xmp>", "</xmp>"],
	["<svg><![CDATA[", "]]></svg>"],
	["<plaintext>", "</plaintext>"]
];
const EMBEDDED_DATA_TAGS = [
	["<!--", "-->"],
	...EXTRA_DATA_TAGS,
];
// the identifier the extractor addresses the zip data with; the faces hidden by the same
// wrapper ladder must never carry it, they are located by byte structure instead
const DATA_IDENTIFIER = "sfz-data";
const EXTRA_DATA_REGEXPS = [
	[/<script/i, /<\/script[\t\n\f\r />]/i],
	[/<style/i, /<\/style[\t\n\f\r />]/i],
	[/<noframes/i, /<\/noframes[\t\n\f\r />]/i],
	[/<noembed/i, /<\/noembed[\t\n\f\r />]/i],
	[/<iframe/i, /<\/iframe[\t\n\f\r />]/i],
	[/<xmp/i, /<\/xmp[\t\n\f\r />]/i],
	// a CDATA section ends on "]]>" and nothing else, so the terminator is the whole test; the
	// start pattern is the same conservatism the raw text rungs get, since a nested "<![CDATA["
	// is text like any other. Trailing brackets are safe: a payload ending "]]" against the
	// writer's "]]>" gives "]]]]>", and the tokenizer emits the payload's own two before closing
	[/<!\[CDATA\[/i, /\]\]>/],
	[/<plaintext/i, /<\/plaintext[\t\n\f\r />]/i]
];
// a comment must also not end with "<!-", the last of the restrictions HTML puts on comment
// text. The remaining one, that it must not start with ">" or "->", is not a matter of what
// the payload contains: the zip data starts with the identifier and the PDF with a signature,
// while the image data starts with a checksum, tested where that checksum is computed
const EMBEDDED_DATA_REGEXPS = [
	[/<!--/i, /--!?>|<!-$/i],
	...EXTRA_DATA_REGEXPS,
];
const CRC32_TABLE = new Uint32Array(256).map((_, indexTable) => {
	let crc = indexTable;
	for (let indexBits = 0; indexBits < 8; indexBits++) {
		crc = crc & 1 ? 0xEDB88320 ^ (crc >>> 1) : crc >>> 1;
	}
	return crc;
});
const PNG_IEND_LENGTH = 12;
const PNG_CHUNK_CRC_LENGTH = 4;
const PNG_SIGNATURE_LENGTH = 8;
const PNG_IHDR_LENGTH = 25;
const COMMENT_LENGTH_FIELD_LENGTH = 2;
const MAX_APPENDED_DATA_LENGTH = 65535;
const PDF_ENTRY_FILENAME = "page.pdf";
const PDF_HEADER_MAX_OFFSET = 1024;
const MINIMAL_DOCTYPE = "<!DOCTYPE html>";
const UNHIDDEN_FACE_WARNING_MESSAGE = "SingleFile: the page data contains every HTML tag that could hide an embedded file, the archive was written without its";
const EMBEDDED_IMAGE_LABEL = "PNG image";
const EMBEDDED_PDF_LABEL = "PDF document";
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_FILE_HEADER_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIR_SIGNATURE = 0x06054b50;
const ZIP64_END_OF_CENTRAL_DIR_SIGNATURE = 0x06064b50;
const ZIP64_END_OF_CENTRAL_DIR_LOCATOR_SIGNATURE = 0x07064b50;
const LANGUAGE_ENCODING_FLAG = 0x0800;

const browser = globalThis.browser;

// the options process() accepts from its caller. single-file.js builds its argument from this
// list instead of a literal, because an option added here and forgotten there is undefined at
// every call site and the feature silently does nothing: that is how declareAppendedData and
// includeBOM both shipped inert. Options the module sets on itself between passes, and options
// the packager supplies, are deliberately absent
const PROCESS_OPTION_NAMES = [
	"createRootDirectory",
	"declareAppendedData",
	"disableCompression",
	"embeddedImage",
	"embeddedPdf",
	"extractDataFromPage",
	"includeBOM",
	"insertCanonicalLink",
	"insertMetaCSP",
	"insertMetaNoIndex",
	"insertTextBody",
	"password",
	"preventAppendedData",
	"selfExtractingArchive",
	"url",
	"zipScript"
];

export {
	process,
	createArchive,
	escapeHTML,
	PROCESS_OPTION_NAMES
};

async function process(pageData, options, lastModDate = new Date()) {
	let script;
	// The worker is configured before anything else, and outside the extension it is turned off
	// rather than left alone. Given no address, zip.js resolves its default one against the page
	// being saved, so the browser asks the CAPTURED SITE for a file that site has never heard of:
	// three 404s in the user's own server logs for every archive, and then a fallback to the main
	// thread anyway, which is where the work was always going to happen. Choosing the fallback
	// costs nothing that was ever gained and asks the site for nothing.
	const extensionContext = Boolean(browser && browser.runtime && browser.runtime.getURL);
	if (extensionContext) {
		configure({ workerURI: "/lib/single-file-z-worker.js" });
	} else {
		configure({ useWebWorkers: false });
	}
	if (options.zipScript) {
		script = options.zipScript;
	} else if (extensionContext) {
		script = await (await fetch(browser.runtime.getURL(SCRIPT_PATH))).text();
	}
	return createArchive(pageData, options, script, zipWriter => {
		pageData.url = options.url;
		pageData.archiveTime = (new Date()).toISOString();
		return addPageResources(zipWriter, pageData, { password: options.password, disableCompression: options.disableCompression }, options.createRootDirectory ? String(Date.now()) + "_" + (options.tabId || 0) + "/" : "", options.url);
	}, lastModDate);
}

async function createArchive(pageData, options, script, writeEntries, lastModDate = new Date()) {
	const zipDataWriter = new Uint8ArrayWriter();
	zipDataWriter.init();
	let extraDataOffset, extraData, embeddedImageDataOffset, endTag, pdfEntry;
	if (options.embeddedImage) {
		options.embeddedImage = new Uint8Array(options.embeddedImage);
	}
	// the whole chunk is built before the first byte of the image is written, because building it
	// is what settles the rung, and the search can end with no rung at all: the image is then left
	// out altogether rather than written unwrapped
	let imageChunk;
	if (options.embeddedImage && options.selfExtractingArchive) {
		imageChunk = getImageHTMLChunk(pageData, options, lastModDate);
		if (!imageChunk) {
			dropUnhiddenFace(options, "embeddedImage", EMBEDDED_IMAGE_LABEL);
		}
	}
	if (options.embeddedImage) {
		const embeddedImageData = getEmbeddedImageData(options.embeddedImage);
		await writeData(zipDataWriter.writable, options.embeddedImage.slice(0, PNG_SIGNATURE_LENGTH + PNG_IHDR_LENGTH));
		if (options.selfExtractingArchive) {
			endTag = imageChunk.endTag;
			if (imageChunk.startHTMLData.pdfEntry) {
				pdfEntry = imageChunk.startHTMLData.pdfEntry;
				// the htmlArray starts after the 4-byte length and the 8-byte type of the tEXt chunk
				pdfEntry.offset += zipDataWriter.offset + 12;
			}
			await writeData(zipDataWriter.writable, imageChunk.htmlData);
			await writeData(zipDataWriter.writable, imageChunk.htmlDataCRC);
		} else if (options.embeddedPdf) {
			const data = new Uint8Array([...getLength(options.embeddedPdf.length + 4), ...[0x74, 0x45, 0x58, 0x74, 0x50, 0x44, 0x46, 0], ...new Uint8Array(options.embeddedPdf)]);
			await writeData(zipDataWriter.writable, data);
			await writeData(zipDataWriter.writable, getCRC32(data, 4));
		}
		await writeData(zipDataWriter.writable, embeddedImageData);
		await writeData(zipDataWriter.writable, new Uint8Array(4));
		embeddedImageDataOffset = zipDataWriter.offset;
		await writeData(zipDataWriter.writable, new Uint8Array([0x74, 0x45, 0x58, 0x74, 0x5a, 0x49, 0x50, 0]));
		if (options.selfExtractingArchive) {
			await writeData(zipDataWriter.writable, new TextEncoder().encode(endTag));
		}
	}
	if (options.selfExtractingArchive) {
		const prependedData = await prependHTMLData(pageData, zipDataWriter, script, options, lastModDate);
		extraDataOffset = prependedData.extraDataOffset;
		pdfEntry = pdfEntry || prependedData.pdfEntry;
	} else if (!options.embeddedImage && options.embeddedPdf) {
		await writeData(zipDataWriter.writable, new Uint8Array(options.embeddedPdf));
	}
	// a WritableWriter object is passed instead of the writer so that the ZipWriter
	// never takes ownership of the stream: preventClose is only honored when the
	// caller owns the writable, and the HTML suffix still gets written after it;
	// its size property tells the ZipWriter the offset of the data written so far
	const startOffset = zipDataWriter.offset;
	const zipWriter = new ZipWriter({ writable: zipDataWriter.writable, size: startOffset }, { bufferedWrite: true, keepOrder: true, lastModDate, useCompressionStream: true });
	await writeEntries(zipWriter);
	if (pdfEntry) {
		// the record is written where the central directory will start so that the PDF is listed
		// first; the ZipWriter is unaware of these bytes, so the central directory offset it
		// stores in the end of central directory record points here
		new DataView(pdfEntry.centralRecord.buffer).setUint32(42, pdfEntry.offset, true);
		await writeData(zipDataWriter.writable, pdfEntry.centralRecord);
	}
	await zipWriter.close(undefined, { preventClose: true });
	if (pdfEntry && !patchEndOfCentralDirectory(zipDataWriter, pdfEntry.centralRecord.length)) {
		// the record cannot be declared in the end of central directory record: rebuild the
		// archive without it rather than leave a record the directory does not count
		options.preventEmbeddedPdfEntry = true;
		return createArchive(pageData, options, script, writeEntries, lastModDate);
	}
	const data = zipDataWriter.getData();
	// the last two bytes of the archive are the comment length field of the end of central
	// directory record: they are left out of the data the extraction payload describes, so that
	// declaring the appended data as the archive comment cannot invalidate a payload computed
	// before that length is known
	const zipDataEnd = data.length - COMMENT_LENGTH_FIELD_LENGTH;
	if (options.selfExtractingArchive) {
		const lfCodes = [];
		let crc32 = -1;
		// the wrapper must not be closed by the zip data itself, whether or not the page
		// carries the data: a premature closer parses the rest of the archive as markup
		if (!options.extractDataFromPageTags || options.extractDataFromPageTags[0] != "<plaintext>") {
			const textContent = TEXT_DECODER.decode(data.subarray(startOffset));
			if (options.extractDataFromPageTags) {
				// the rung is matched on its start tag, not on the identity of the array holding it:
				// the option is set from EXTRA_DATA_TAGS internally, but a caller passing an equal
				// pair of its own would otherwise index the regexps with -1
				const tagIndex = getExtraDataTagIndex(options.extractDataFromPageTags);
				const regExpsTag = EXTRA_DATA_REGEXPS[tagIndex];
				if (textContent.match(regExpsTag[0]) || textContent.match(regExpsTag[1])) {
					return findExtraDataTags(textContent, pageData, options, script, writeEntries, lastModDate, tagIndex + 1);
				}
			} else {
				const [startRegExp, endRegExp] = EMBEDDED_DATA_REGEXPS[0];
				if (textContent.match(startRegExp) || textContent.match(endRegExp)) {
					return findExtraDataTags(textContent, pageData, options, script, writeEntries, lastModDate);
				}
			}
		}
		if (options.extractDataFromPage) {
			for (let index = startOffset; index < zipDataEnd; index++) {
				const byte = data[index];
				crc32 = (crc32 >>> 8) ^ CRC32_TABLE[(crc32 ^ byte) & 0xff];
				if (byte == 10) {
					lfCodes.push(0);
				} else if (byte == 13) {
					if (index + 1 < zipDataEnd && data[index + 1] == 10) {
						index++;
						crc32 = (crc32 >>> 8) ^ CRC32_TABLE[(crc32 ^ 10) & 0xff];
						lfCodes.push(2);
					} else {
						lfCodes.push(1);
					}
				}
			}
			crc32 = (crc32 ^ -1) >>> 0;
		}
		let pageContent = "";
		if (!options.preventAppendedData) {
			if (options.extractDataFromPageTags) {
				pageContent += options.extractDataFromPageTags[1];
			} else {
				pageContent += "-->";
			}
		}
		const endTags = options.preventAppendedData || options.embeddedImage ? "" : "</body></html>";
		if (options.extractDataFromPage) {
			// payload layout: [crc32, zip data length, LF codes count, 2-bit codes (0=LF, 1=CR, 2=CRLF) packed LSB-first]
			const words = new Uint32Array(3 + Math.ceil(lfCodes.length / 16));
			words[0] = crc32;
			words[1] = zipDataEnd - startOffset;
			words[2] = lfCodes.length;
			lfCodes.forEach((lfCode, indexLFCode) => words[3 + (indexLFCode >> 4)] |= lfCode << ((indexLFCode & 15) * 2));
			// the words are serialized little-endian rather than in host order: the format fixes
			// the byte order, so a big-endian host writing the view of the array directly would
			// emit a payload no conforming reader can decode, while still round-tripping against
			// its own extractor
			const payload = new Uint8Array(words.length * 4);
			const payloadView = new DataView(payload.buffer);
			words.forEach((word, indexWord) => payloadView.setUint32(indexWord * 4, word, true));
			extraData = "<sfz-extra-data>" + base64Encode(deflateRaw(payload)) + "</sfz-extra-data>";
			// the bytes appended after the EOCD record (wrapper end tag, extra data, end tags
			// and, with an embedded image, the tEXt CRC and IEND chunk) must fit the 65535-byte
			// window readers scan backward to find the EOCD record
			if (options.preventAppendedData || extraData.length > MAX_APPENDED_DATA_LENGTH - pageContent.length - endTags.length - (options.embeddedImage ? PNG_IEND_LENGTH + PNG_CHUNK_CRC_LENGTH : 0)) {
				if (!options.extraDataSize) {
					options.extraDataSize = getReservationSize(extraData.length);
					return createArchive(pageData, options, script, writeEntries, lastModDate);
				}
			} else {
				if (options.extraDataSize) {
					// dropping the reservation moves the archive back, which changes the payload
					// that made it necessary: a payload sitting on the boundary would be too large
					// appended and small enough relocated, forever. The reservation is dropped at
					// most once, so the build cannot oscillate between the two placements
					if (!options.extraDataSizeDropped) {
						options.extraDataSizeDropped = true;
						options.extraDataSize = undefined;
						return createArchive(pageData, options, script, writeEntries, lastModDate);
					}
				} else {
					pageContent += extraData;
				}
			}
		}
		pageContent += endTags;
		await writeData(zipDataWriter.writable, (new TextEncoder()).encode(pageContent));
	}
	await zipDataWriter.writable.close();
	const pageContent = await zipDataWriter.getData();
	if (options.extractDataFromPage && options.extraDataSize !== undefined) {
		if (options.extraDataSize >= extraData.length) {
			pageContent.set(new TextEncoder().encode(extraData), startOffset - extraDataOffset);
		} else {
			options.extraData = extraData;
			options.extraDataSize = getReservationSize(extraData.length);
			return createArchive(pageData, options, script, writeEntries, lastModDate);
		}
	}
	if (options.declareAppendedData) {
		// readers that reject undeclared bytes after the end of central directory record, notably
		// java.util.zip, accept the file when the same bytes are declared as the archive comment
		const appendedDataLength = pageContent.length - data.length +
			(options.embeddedImage ? PNG_CHUNK_CRC_LENGTH + PNG_IEND_LENGTH : 0);
		if (appendedDataLength && appendedDataLength <= MAX_APPENDED_DATA_LENGTH) {
			new DataView(pageContent.buffer, pageContent.byteOffset).setUint16(zipDataEnd, appendedDataLength, true);
		}
	}
	if (options.embeddedImage) {
		pageContent.set(getLength(zipDataWriter.offset - embeddedImageDataOffset - 4), embeddedImageDataOffset - 4);
		return new Blob([
			pageContent,
			getCRC32(pageContent, embeddedImageDataOffset),
			options.embeddedImage.slice(options.embeddedImage.length - PNG_IEND_LENGTH)
		], { type: "application/octet-stream" });
	} else {
		return new Blob([pageContent], { type: "application/octet-stream" });
	}
}

function getCRC32(data, indexData = 0) {
	const crcArray = new Uint8Array(4);
	setUint32(crcArray, getCRC32Value(data, indexData));
	return crcArray;
}

function getCRC32Value(data, indexData = 0) {
	let crc = -1;
	for (; indexData < data.length; indexData++) {
		crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ data[indexData]) & 0xff];
	}
	return (crc ^ -1) >>> 0;
}

function getPDFEntry(embeddedPdf, lastModDate = new Date()) {
	const filename = new TextEncoder().encode(PDF_ENTRY_FILENAME);
	const crc32 = getCRC32Value(embeddedPdf);
	const dosTime = (lastModDate.getHours() << 11) | (lastModDate.getMinutes() << 5) | (lastModDate.getSeconds() >> 1);
	const dosDate = (Math.max(0, lastModDate.getFullYear() - 1980) << 9) | ((lastModDate.getMonth() + 1) << 5) | lastModDate.getDate();
	const localHeader = new Uint8Array(30 + filename.length);
	const localHeaderView = new DataView(localHeader.buffer);
	localHeaderView.setUint32(0, LOCAL_FILE_HEADER_SIGNATURE, true);
	localHeaderView.setUint16(4, 20, true);
	// every other entry is written by the ZIP writer, which sets this flag on all of them: without
	// it here this record would be the only name in the archive a reader decodes through CP437.
	// the name is ASCII, where the two encodings agree, so nothing about the decoded name depends
	// on it, but the legacy path is then never taken at all
	localHeaderView.setUint16(6, LANGUAGE_ENCODING_FLAG, true);
	localHeaderView.setUint16(10, dosTime, true);
	localHeaderView.setUint16(12, dosDate, true);
	localHeaderView.setUint32(14, crc32, true);
	localHeaderView.setUint32(18, embeddedPdf.length, true);
	localHeaderView.setUint32(22, embeddedPdf.length, true);
	localHeaderView.setUint16(26, filename.length, true);
	localHeader.set(filename, 30);
	const centralRecord = new Uint8Array(46 + filename.length);
	const centralRecordView = new DataView(centralRecord.buffer);
	centralRecordView.setUint32(0, CENTRAL_FILE_HEADER_SIGNATURE, true);
	centralRecordView.setUint16(4, 0x0300, true);
	centralRecordView.setUint16(6, 20, true);
	centralRecordView.setUint16(8, LANGUAGE_ENCODING_FLAG, true);
	centralRecordView.setUint16(12, dosTime, true);
	centralRecordView.setUint16(14, dosDate, true);
	centralRecordView.setUint32(16, crc32, true);
	centralRecordView.setUint32(20, embeddedPdf.length, true);
	centralRecordView.setUint32(24, embeddedPdf.length, true);
	centralRecordView.setUint16(28, filename.length, true);
	centralRecordView.setUint32(38, 0o100644 << 16, true);
	centralRecord.set(filename, 46);
	return { localHeader, centralRecord };
}

function patchEndOfCentralDirectory(zipDataWriter, centralRecordLength) {
	const view = new DataView(zipDataWriter.array.buffer);
	const offsetEOCD = zipDataWriter.offset - 22;
	if (view.getUint32(offsetEOCD, true) != END_OF_CENTRAL_DIR_SIGNATURE) {
		return false;
	}
	const entriesOnDisk = view.getUint16(offsetEOCD + 8, true);
	const totalEntries = view.getUint16(offsetEOCD + 10, true);
	const centralDirectorySize = view.getUint32(offsetEOCD + 12, true);
	const offsetLocator = offsetEOCD - 20;
	let offsetZip64EOCD;
	if (offsetLocator >= 0 && view.getUint32(offsetLocator, true) == ZIP64_END_OF_CENTRAL_DIR_LOCATOR_SIGNATURE) {
		// the offset stored in the locator does not account for the PDF record either
		offsetZip64EOCD = Number(view.getBigUint64(offsetLocator + 8, true)) + centralRecordLength;
		if (view.getUint32(offsetZip64EOCD, true) != ZIP64_END_OF_CENTRAL_DIR_SIGNATURE) {
			return false;
		}
	} else if (entriesOnDisk + 1 >= 0xFFFF || totalEntries + 1 >= 0xFFFF || centralDirectorySize + centralRecordLength >= 0xFFFFFFFF) {
		return false;
	}
	if (entriesOnDisk != 0xFFFF) {
		view.setUint16(offsetEOCD + 8, entriesOnDisk + 1, true);
	}
	if (totalEntries != 0xFFFF) {
		view.setUint16(offsetEOCD + 10, totalEntries + 1, true);
	}
	if (centralDirectorySize != 0xFFFFFFFF) {
		view.setUint32(offsetEOCD + 12, centralDirectorySize + centralRecordLength, true);
	}
	if (offsetZip64EOCD !== undefined) {
		view.setBigUint64(offsetLocator + 8, BigInt(offsetZip64EOCD), true);
		view.setBigUint64(offsetZip64EOCD + 24, view.getBigUint64(offsetZip64EOCD + 24, true) + 1n, true);
		view.setBigUint64(offsetZip64EOCD + 32, view.getBigUint64(offsetZip64EOCD + 32, true) + 1n, true);
		view.setBigUint64(offsetZip64EOCD + 40, view.getBigUint64(offsetZip64EOCD + 40, true) + BigInt(centralRecordLength), true);
	}
	return true;
}

// the functions inlined in the archive lose their newlines, so a line comment would swallow
// the rest of the script: whole-line comments are removed before the newlines are
function inlineFunction(bootstrapFunction) {
	return bootstrapFunction.toString().replace(/^[ \t]*\/\/.*$/gm, "").replace(/\n|\t/g, "");
}

// the reservation must be strictly larger than the payload it was computed from, otherwise
// the retry loop can be handed the same size again and oscillate instead of converging
function getReservationSize(length) {
	return Math.max(length + 1, Math.floor(length * 1.001));
}

function getLength(length) {
	const lengthArray = new Uint8Array(4);
	setUint32(lengthArray, length);
	return lengthArray;
}

function setUint32(data, value) {
	data[0] = value >> 24;
	data[1] = value >> 16;
	data[2] = value >> 8;
	data[3] = value;
}

async function prependHTMLData(pageData, zipDataWriter, script, options, lastModDate) {
	let pageContent = "";
	let pdfEntry;
	if (!options.embeddedImage) {
		const startHTMLData = getStartHTMLArray(pageData, options, lastModDate);
		if (startHTMLData.pdfEntry) {
			pdfEntry = startHTMLData.pdfEntry;
			pdfEntry.offset += zipDataWriter.offset;
		}
		await writeData(zipDataWriter.writable, startHTMLData.htmlArray);
	}
	pageContent += "<div id=sfz-wait-message>Please wait...</div>";
	if (options.extractDataFromPage) {
		pageContent += "<div id=sfz-error-message><strong>Error</strong>: Cannot extract the data of the page.";
		pageContent += " The file is still a valid ZIP file, you can rename it with a \"zip\" extension and unzip it to display the page and its resources.</div>";
	} else {
		pageContent += "<div id=sfz-error-message><strong>Error</strong>: Cannot open the page from the filesystem.";
		pageContent += "<ul style='line-height:20px;'>";
		pageContent += "<li style='margin-bottom:10px'><strong>Chrome/Edge/Brave</strong>: Install <a href='https://www.getsinglefile.com'>SingleFile</a> and enable the option \"Allow access to file URLs\" in the details page of the extension.</li>";
		pageContent += "<li><strong>Safari</strong>: Select \"Security > Disable Local File Restrictions\" in the \"Develop > Developer settings\" menu.</li></ul></div>";
	}
	if (pageData.tocContent) {
		pageContent += pageData.tocContent;
	}
	// the text body repeats the page content outside the archive, where no password reaches it
	if (options.insertTextBody && !options.password) {
		const doc = (new DOMParser()).parseFromString(pageData.content, "text/html");
		doc.body.querySelectorAll("style, script, noscript").forEach(element => element.remove());
		let textBody = "";
		if (options.extractDataFromPage) {
			// the text body is read as raw bytes by text tools, so the title goes in unencoded;
			// the < and > escaping below covers it
			textBody += (pageData.title || "") + "\n\n";
		}
		textBody += doc.body.innerText;
		doc.body.querySelectorAll("single-file-note").forEach(node => {
			const template = node.querySelector("template");
			if (template) {
				const docTemplate = (new DOMParser()).parseFromString(template.innerHTML, "text/html");
				textBody += "\n" + docTemplate.body.querySelector("textarea").value;
			}
		});
		textBody = textBody.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n +/g, "\n").replace(/\n\n\n+/g, "\n\n").trim();
		pageContent += "\n<main hidden>\n" + textBody + "\n</main>\n";
	}
	const displayOptions = {
		insertEmbeddedImage: Boolean(options.embeddedImage),
		insertEmbeddedScreenshotImage: Boolean(options.embeddedScreenshotImage)
	};
	const bootstrapBody = options.multiPageArchive ?
		"(" + inlineFunction(router) + ")(content,{extract:" +
		inlineFunction(extract) + ",display:" +
		inlineFunction(display) + "})" :
		"(" + inlineFunction(extract) + ")(content,{prompt}).then(({docContent}) => " +
		inlineFunction(display) + "(document,docContent," + JSON.stringify(displayOptions) + "))";
	script = "<script>" +
		script +
		"document.currentScript.remove();" +
		"globalThis.bootstrap=(()=>{let bootstrapStarted;return async content=>{if (bootstrapStarted) return bootstrapStarted; bootstrapStarted = " +
		bootstrapBody + ";return bootstrapStarted;}})();(" +
		inlineFunction(getContent) + ")().then(globalThis.bootstrap).then(() => document.dispatchEvent(new CustomEvent(\"single-file-display-infobar\"))).catch(error => {" +
		"console.error(error);" +
		"const waitMessage = document.getElementById(\"sfz-wait-message\");" +
		"if (waitMessage) { waitMessage.remove(); }" +
		"const errorMessage = document.getElementById(\"sfz-error-message\");" +
		"if (errorMessage) { errorMessage.hidden = false; document.body.hidden = false; }" +
		"});" +
		"</script>";
	pageContent += script;
	let extraData = "";
	if (options.extractDataFromPage && options.extraDataSize) {
		const extraTags = "<sfz-extra-data></sfz-extra-data>";
		extraData += extraTags + new Array(options.extraDataSize - extraTags.length).fill(" ").join("");
	}
	pageContent += extraData;
	const startTag = getDataStartTag(options.extractDataFromPageTags || EMBEDDED_DATA_TAGS[0]);
	pageContent += startTag;
	const extraDataOffset = startTag.length + extraData.length;
	await writeData(zipDataWriter.writable, (new TextEncoder()).encode(pageContent));
	return { extraDataOffset, pdfEntry };
}

// the extractor finds the zip data by identifier instead of by its position in the tree: an
// element carries it as an attribute, a comment as the first characters of its data
function getDataStartTag([startTag]) {
	if (startTag == "<!--") {
		return startTag + DATA_IDENTIFIER;
	}
	// the attribute belongs to the element that opens the wrapper, which is not always the whole
	// start tag: the CDATA rung opens with an <svg> and then a markup declaration that takes none
	const tagEnd = startTag.indexOf(">");
	return startTag.slice(0, tagEnd) + " id=" + DATA_IDENTIFIER + startTag.slice(tagEnd);
}

function getStartHTMLArray(pageData, options, lastModDate, startTag = "") {
	let bom = "";
	if (options.includeBOM && !options.extractDataFromPage && !options.embeddedImage) {
		bom = "\ufeff";
	}
	const doctype = options.embeddedImage ? "" : pageData.doctype;
	const charset = options.extractDataFromPage ? "windows-1252" : "utf-8";
	const documentStart = "<html data-sfz><meta charset=" + charset + ">";
	const html = bom + doctype + documentStart;
	// the comment carries the page URL, whose length is unbounded: it is emitted after the
	// declaration of the character encoding, and after the embedded PDF when there is one, so
	// that neither the encoding declaration nor the PDF header leaves the first 1024 bytes.
	// it is left out of a password-protected archive, like the title below: the same URL is
	// in manifest.json, which is encrypted, so emitting it here would publish what the
	// password is meant to cover
	const comment = pageData.comment && !options.embeddedImage && !options.password ? "<!--" + pageData.comment + "-->" : "";
	const htmlHeadData = getHTMLHeadData(pageData, options);
	let htmlArray, pdfEntry;
	if (options.embeddedPdf) {
		const embeddedPdf = new Uint8Array(options.embeddedPdf);
		pdfEntry = options.preventEmbeddedPdfEntry ? undefined : getPDFEntry(embeddedPdf, lastModDate);
		const localHeader = pdfEntry ? pdfEntry.localHeader : new Uint8Array(0);
		const embeddedPdfText = TEXT_DECODER.decode(localHeader) + TEXT_DECODER.decode(embeddedPdf);
		const pdfTagIndex = findEmbeddedDataTagIndex(embeddedPdfText);
		if (pdfTagIndex == -1) {
			dropUnhiddenFace(options, "embeddedPdf", EMBEDDED_PDF_LABEL);
			pdfEntry = undefined;
		} else {
			const [pdfStartTag, pdfEndTag] = EMBEDDED_DATA_TAGS[pdfTagIndex];
			let htmlArray1 = new TextEncoder().encode(html + pdfStartTag);
			if (htmlArray1.length + localHeader.length > PDF_HEADER_MAX_OFFSET) {
				// PDF readers only scan the start of the file for the %PDF- header, and the page
				// doctype is copied verbatim: it is the one part of the prefix with no bound, so a
				// long one is replaced rather than pushing the header out of the scan window
				htmlArray1 = new TextEncoder().encode(bom + MINIMAL_DOCTYPE + documentStart + pdfStartTag);
			}
			const htmlArray2 = new TextEncoder().encode(pdfEndTag + comment + htmlHeadData + startTag);
			htmlArray = new Uint8Array(htmlArray1.length + localHeader.length + embeddedPdf.length + htmlArray2.length);
			htmlArray.set(htmlArray1);
			htmlArray.set(localHeader, htmlArray1.length);
			htmlArray.set(embeddedPdf, htmlArray1.length + localHeader.length);
			htmlArray.set(htmlArray2, htmlArray1.length + localHeader.length + embeddedPdf.length);
			if (pdfEntry) {
				pdfEntry.offset = htmlArray1.length;
			}
		}
	}
	if (!options.embeddedPdf) {
		htmlArray = new TextEncoder().encode(html + comment + htmlHeadData + startTag);
	}
	return { htmlArray, pdfEntry };
}

function getHTMLHeadData(pageData, options) {
	let pageContent = "";
	// the title is left out of a password-protected archive: manifest.json carries it too and
	// is encrypted, so emitting it here would publish what the password is meant to cover
	const title = options.password ? "" : escapeHTML(pageData.title || "");
	pageContent += "<title>" + title + "</title>";
	// the canonical link publishes the URL the archive was saved from, for the same reason
	// the title above is left out of a password-protected archive
	if (options.insertCanonicalLink && !options.password) {
		pageContent += "<link rel=canonical href=\"" + escapeHTML(options.url) + "\">";
	}
	if (options.insertMetaNoIndex) {
		pageContent += "<meta name=robots content=noindex>";
	}
	if (pageData.viewport) {
		pageContent += "<meta name=viewport content=\"" + escapeHTML(pageData.viewport) + "\">";
	}
	if (options.insertMetaCSP) {
		const cspContent = "default-src 'none';connect-src 'self' data: blob:;font-src 'self' data: blob:;img-src 'self' data: blob:;style-src 'self' 'unsafe-inline' data: blob:;frame-src 'self' data: blob:;media-src 'self' data: blob:;script-src 'self' 'unsafe-inline' data: blob:;object-src 'self' data: blob:";
		pageContent += `<meta http-equiv=content-security-policy content=${JSON.stringify(cspContent)}>`;
	}
	pageContent += "<style>@keyframes display-wait-message{0%{opacity:0}100%{opacity:1}}body{color:transparent}div{color:initial}body>:not(#sfz-wait-message,#sfz-error-message){display:none}</style>";
	pageContent += "<body hidden>";
	return pageContent;
}

// the text the writer assembles for the prelude goes through this, wherever it is assembled:
// the prelude declares a single-byte charset, and numeric character references are ASCII
// bytes, so they survive it and any parser decodes them back to the original text. The text
// body is the exception and stays raw UTF-8, for the byte-reading audience it exists for
function escapeHTML(value) {
	return Array.from(value).map(character => {
		const codePoint = character.codePointAt(0);
		return codePoint < 32 || codePoint > 126 || character == "&" || character == "<" || character == ">" || character == "\"" ?
			"&#" + codePoint + ";" : character;
	}).join("");
}

function getExtraDataTagIndex(extractDataFromPageTags) {
	const tagIndex = EXTRA_DATA_TAGS.findIndex(([startTag]) => startTag == extractDataFromPageTags[0]);
	if (tagIndex == -1) {
		throw new Error("Unknown data tags: " + extractDataFromPageTags[0]);
	}
	return tagIndex;
}

function findExtraDataTags(textContent, pageData, options, script, writeEntries, lastModDate, indexExtractDataFromPageTags = 0) {
	const regExpsTag = EXTRA_DATA_REGEXPS[indexExtractDataFromPageTags];
	const plaintextTag = EXTRA_DATA_TAGS[indexExtractDataFromPageTags][0] == "<plaintext>";
	const matchTag = !plaintextTag && (textContent.match(regExpsTag[0]) || textContent.match(regExpsTag[1]));
	if (matchTag) {
		if (indexExtractDataFromPageTags < EXTRA_DATA_TAGS.length - 1) {
			return findExtraDataTags(textContent, pageData, options, script, writeEntries, lastModDate, indexExtractDataFromPageTags + 1);
		} else {
			options.extractDataFromPage = false;
			return createArchive(pageData, options, script, writeEntries, lastModDate);
		}
	} else {
		options.extractDataFromPageTags = EXTRA_DATA_TAGS[indexExtractDataFromPageTags];
		if (options.extractDataFromPageTags[0] == "<plaintext>") {
			// <plaintext> cannot be closed, the file must end with the zip data
			options.preventAppendedData = true;
		}
		return createArchive(pageData, options, script, writeEntries, lastModDate);
	}
}

// a rung is rejected on its end pattern, which terminates the wrapper, and on its start
// pattern: script data has escape states the raw text rungs do not have, where "<!--"
// followed by "<script" leaves "</script>" unable to close the element at all
function findEmbeddedDataTagIndex(text, fromIndex = 0) {
	const tagIndex = EMBEDDED_DATA_REGEXPS.slice(fromIndex, -1).findIndex(([startRegExp, endRegExp]) => !text.match(startRegExp) && !text.match(endRegExp));
	return tagIndex == -1 ? -1 : tagIndex + fromIndex;
}

// a face exists only while a rung can hide it. When the payload names every rung, the older
// fallback emitted it unwrapped, on the grounds that the page still rendered: but the payload's
// markup then joins the document, and a payload that is itself an archive contributes an
// sfz-data node ahead of this file's own. A reader takes that one and extracts it, checksum and
// all, with nothing to say the archive it returned is not the archive the file was built around.
// Dropping the face costs a picture; keeping it costs the archive
// what follows the start tag is the checksum of the chunk carrying it, four bytes only known once
// the tag is chosen: a comment they open with ">" or "->" is closed by the parser there and then,
// leaving the image data to be read as markup. Stepping past the comment rung means searching from
// the next one, not taking it — a rung qualifies on the payload, and the payload had no say in
// which rung the checksum sent the writer to
function getImageHTMLChunk(pageData, options, lastModDate) {
	const embeddedImageText = TEXT_DECODER.decode(getEmbeddedImageData(options.embeddedImage));
	let tagIndex = findEmbeddedDataTagIndex(embeddedImageText);
	while (tagIndex != -1) {
		const [startTag, endTag] = EMBEDDED_DATA_TAGS[tagIndex];
		const startHTMLData = getStartHTMLArray(pageData, options, lastModDate, startTag);
		const htmlData = new Uint8Array([...getLength(startHTMLData.htmlArray.length + 4), ...[0x74, 0x45, 0x58, 0x74, 0x50, 0x4e, 0x47, 0], ...startHTMLData.htmlArray]);
		const htmlDataCRC = getCRC32(htmlData, 4);
		if (tagIndex == 0 && (htmlDataCRC[0] == 0x3e || (htmlDataCRC[0] == 0x2d && htmlDataCRC[1] == 0x3e))) {
			tagIndex = findEmbeddedDataTagIndex(embeddedImageText, tagIndex + 1);
		} else {
			return { endTag, startHTMLData, htmlData, htmlDataCRC };
		}
	}
}

function getEmbeddedImageData(embeddedImage) {
	return embeddedImage.slice(PNG_SIGNATURE_LENGTH + PNG_IHDR_LENGTH, embeddedImage.length - PNG_IEND_LENGTH);
}

function dropUnhiddenFace(options, name, label) {
	delete options[name];
	console.warn(UNHIDDEN_FACE_WARNING_MESSAGE, label); // eslint-disable-line no-console
}

async function writeData(writable, array) {
	const streamWriter = writable.getWriter();
	await streamWriter.ready;
	await streamWriter.write(array);
	streamWriter.releaseLock();
}

async function addPageResources(zipWriter, pageData, options, prefixName, url) {
	const resources = {};
	for (const resourceType of Object.keys(pageData.resources)) {
		for (const data of pageData.resources[resourceType]) {
			data.password = options.password;
			if (data.url && !data.url.startsWith("data:")) {
				resources[data.name] = data.url;
			}
		}
	}
	const jsonContent = JSON.stringify({
		originalUrl: pageData.url,
		title: pageData.title,
		archiveTime: pageData.archiveTime,
		indexFilename: "index.html",
		resources
	}, null, 2);
	await Promise.all([
		Promise.all([
			addFile(zipWriter, prefixName, { name: "index.html", extension: ".html", content: pageData.content, url, password: options.password }, options.disableCompression),
			addFile(zipWriter, prefixName, { name: "manifest.json", extension: ".json", content: jsonContent, password: options.password }, options.disableCompression)
		]),
		Promise.all(Object.keys(pageData.resources).map(async resourceType =>
			Promise.all(pageData.resources[resourceType].map(data => {
				if (resourceType == "frames") {
					return addPageResources(zipWriter, data, options, prefixName + data.name, data.url);
				} else {
					return addFile(zipWriter, prefixName, data, options.disableCompression);
				}
			}))
		))
	]);
}

async function addFile(zipWriter, prefixName, data, disableCompression) {
	const dataReader = typeof data.content == "string" ? new TextReader(data.content) : new BlobReader(new Blob([new Uint8Array(data.content)]));
	const options = { password: data.password, bufferedWrite: true };
	if (!data.password) {
		// entry comments are stored in the central directory, which is never encrypted: with a
		// password the resource URLs would be readable while the same map in manifest.json is not
		options.comment = data.url && data.url.startsWith("data:") ? "data:" : data.url;
	}
	if (disableCompression || (!isCompressibleContentType(data.contentType) && NO_COMPRESSION_EXTENSIONS.includes(data.extension))) {
		options.level = 0;
	}
	await zipWriter.add(prefixName + data.name, dataReader, options);
}

function isCompressibleContentType(contentType) {
	return Boolean(contentType) && (contentType.startsWith(TEXT_CONTENT_TYPE_PREFIX) || COMPRESSIBLE_CONTENT_TYPES.includes(contentType));
}

async function getContent() {
	const BASE64_TABLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
	// the function is inlined in the archive as source, it cannot close over the module scope
	const DATA_IDENTIFIER = "sfz-data";
	const { Blob, XMLHttpRequest, NodeFilter, document, zip, location } = globalThis;
	const characterMap = new Map([
		[65533, 0], [8364, 128], [8218, 130], [402, 131], [8222, 132], [8230, 133], [8224, 134], [8225, 135], [710, 136], [8240, 137],
		[352, 138], [8249, 139], [338, 140], [381, 142], [8216, 145], [8217, 146], [8220, 147], [8221, 148], [8226, 149], [8211, 150],
		[8212, 151], [732, 152], [8482, 153], [353, 154], [8250, 155], [339, 156], [382, 158], [376, 159]
	]);
	const crc32Table = new Uint32Array(256).map((_, indexTable) => {
		let crc = indexTable;
		for (let indexBits = 0; indexBits < 8; indexBits++) {
			crc = crc & 1 ? 0xEDB88320 ^ (crc >>> 1) : crc >>> 1;
		}
		return crc;
	});
	return new Promise((resolve, reject) => {
		let aborted = false;
		if (location.protocol == "file:") {
			extractDataFromDocument();
		} else {
			getPageData();
		}

		async function extractDataFromDocument() {
			try {
				await waitForDocumentReady(document);
				document.body.querySelectorAll("meta, style").forEach(element => document.head.appendChild(element));
				const pageData = extractPageData();
				displayMessage("sfz-wait-message", 2);
				resolve(pageData);
			} catch (error) {
				// eslint-disable-next-line no-console
				console.error(error);
				displayMessage("sfz-error-message", 2);
				reject(error);
			}
		}

		function getPageData() {
			const xhr = new XMLHttpRequest();
			xhr.responseType = "blob";
			xhr.open("GET", "");
			// a failure of the full download is recoverable when the page carries the data:
			// the wait message left the document intact, so the page text can still be read
			xhr.onerror = () => extractDataFromDocument();
			xhr.send();
			xhr.onreadystatechange = () => {
				if (xhr.readyState === 2 && !aborted) {
					if (xhr.status === 200) {
						aborted = true;
						const httpRangeSupport = xhr.getResponseHeader("Accept-Ranges") === "bytes";
						xhr.abort();
						displayMessage("sfz-wait-message", 2, true);
						if (httpRangeSupport) {
							resolve(new zip.HttpRangeReader(location.href, {
								useXHR: true,
								combineSizeEocd: true
							}));
						} else {
							getPageData();
						}
					} else {
						// an HTTP error status fires no error event; fall back like a network failure
						xhr.abort();
						extractDataFromDocument();
					}
				}
			};
			if (aborted) {
				xhr.onload = () => resolve(xhr.response);
			}
		}
	});

	function waitForDocumentReady(document) {
		return new Promise(resolve => {
			if (document.readyState === "complete" || document.readyState === "interactive") {
				resolve();
			} else {
				document.addEventListener("DOMContentLoaded", () => resolve());
			}
		});
	}

	function displayMessage(elementId, delay = 0, keepContent) {
		const element = document.getElementById(elementId);
		if (element) {
			Array.from(document.body.childNodes).forEach(node => {
				if (node.id != elementId) {
					if (node.id == "sfz-wait-message" || node.id == "sfz-error-message") {
						node.hidden = true;
					} else if (!keepContent) {
						node.remove();
					}
				}
			});
			element.hidden = false;
			document.body.hidden = false;
			element.style = "opacity: 0; animation: 0s linear " + delay + "s display-wait-message 1 normal forwards";
		}
	}

	function extractPageData() {
		const zipDataElement = document.querySelector("sfz-extra-data");
		if (zipDataElement) {
			const inflatedPayload = zip.inflateRaw(base64Decode(zipDataElement.textContent));
			// a DataView reads the words little-endian whatever the host is, and unlike a typed
			// array view it needs no 4-byte alignment of the inflated buffer
			const payload = new DataView(inflatedPayload.buffer, inflatedPayload.byteOffset, inflatedPayload.length & -4);
			// the zip data is identified, not located: its node can be moved before this runs
			const dataElement = document.getElementById(DATA_IDENTIFIER);
			if (dataElement) {
				return decodeZipData(dataElement, payload, 0);
			}
			const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT);
			while (walker.nextNode()) {
				if (walker.currentNode.data.startsWith(DATA_IDENTIFIER)) {
					return decodeZipData(walker.currentNode, payload, DATA_IDENTIFIER.length);
				}
			}
		}
		throw new Error("Extra zip data not found");
	}

	function decodeZipData(dataNode, payload, startIndex) {
		const expectedCRC32 = payload.getUint32(0, true);
		const zipDataLength = payload.getUint32(4, true);
		const lfCodesLength = payload.getUint32(8, true);
		// the two extra bytes are the comment length field of the end of central directory
		// record, which the payload does not describe: left at zero they declare no comment,
		// which is what the recovered data holds
		const zipData = new Uint8Array(zipDataLength + 2);
		const { textContent } = dataNode;
		let offset = 0;
		let indexLFCode = 0;
		let crc32 = -1;
		for (let index = startIndex; index < textContent.length && offset < zipDataLength; index++) {
			const charCode = textContent.charCodeAt(index);
			if (charCode == 10) {
				const lfCode = (payload.getUint32(12 + (indexLFCode >> 4) * 4, true) >>> ((indexLFCode & 15) * 2)) & 3;
				indexLFCode++;
				if (lfCode == 3) {
					// the fourth code is unassigned: a payload using it was written against a
					// later revision of the format, and decoding it as a lone CR would corrupt
					// the archive silently instead of naming the reason
					throw new Error("Unsupported newline code in the extracted zip data");
				} else if (lfCode == 0) {
					writeByte(10);
				} else {
					writeByte(13);
					if (lfCode == 2) {
						writeByte(10);
					}
				}
			} else {
				writeByte(charCode > 255 ? characterMap.get(charCode) : charCode);
			}
		}
		crc32 = (crc32 ^ -1) >>> 0;
		if (offset != zipDataLength || indexLFCode != lfCodesLength || crc32 != expectedCRC32) {
			throw new Error("Invalid checksum of the extracted zip data");
		}
		return new Blob([zipData], { type: "application/octet-stream" });

		function writeByte(byte) {
			zipData[offset] = byte;
			crc32 = (crc32 >>> 8) ^ crc32Table[(crc32 ^ byte) & 0xff];
			offset++;
		}
	}

	function base64Decode(b64) {
		b64 = String(b64).replace(/[^A-Za-z0-9+/=]/g, "");
		const len = b64.length;
		const out = [];
		for (let i = 0; i < len; i += 4) {
			const a = BASE64_TABLE.indexOf(b64[i]);
			const b = BASE64_TABLE.indexOf(b64[i + 1]);
			const c = BASE64_TABLE.indexOf(b64[i + 2]);
			const d = BASE64_TABLE.indexOf(b64[i + 3]);
			const n = (a << 18) | (b << 12) | ((c & 63) << 6) | (d & 63);
			out.push((n >> 16) & 0xff);
			if (b64[i + 2] !== "=") {
				out.push((n >> 8) & 0xff);
			}
			if (b64[i + 3] !== "=") {
				out.push(n & 0xff);
			}
		}
		return new Uint8Array(out);
	}
}

const BASE64_TABLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64Encode(bytes) {
	let out = "";
	const len = bytes.length;
	let i = 0;
	for (; i + 2 < len; i += 3) {
		const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
		out += BASE64_TABLE[(n >> 18) & 63] + BASE64_TABLE[(n >> 12) & 63] + BASE64_TABLE[(n >> 6) & 63] + BASE64_TABLE[n & 63];
	}
	const rem = len - i;
	if (rem === 1) {
		const n = bytes[i] << 16;
		out += BASE64_TABLE[(n >> 18) & 63] + BASE64_TABLE[(n >> 12) & 63] + "==";
	} else if (rem === 2) {
		const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
		out += BASE64_TABLE[(n >> 18) & 63] + BASE64_TABLE[(n >> 12) & 63] + BASE64_TABLE[(n >> 6) & 63] + "=";
	}
	return out;
}
