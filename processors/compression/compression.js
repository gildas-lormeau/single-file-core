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

/* global Node */

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

const { Blob, fetch, TextEncoder, TextDecoder, DOMParser } = globalThis;

// windows-1252 never decodes bytes >= 0x80 into the ASCII range, the scanned patterns are all ASCII
const TEXT_DECODER = new TextDecoder("windows-1252");

const NO_COMPRESSION_EXTENSIONS = [".jpg", ".jpeg", ".png", ".avi", ".apng", ".pdf", ".woff2", ".mp4", ".mp3", ".ogg", ".webp", ".webm", ".avi", ".mpeg", ".ts", ".ogv", ".heif", ".heic"];
const SCRIPT_PATH = "/lib/single-file-zip.min.js";
const EXTRA_DATA_TAGS = [
	["<noscript>", "</noscript>"],
	["<noframes>", "</noframes>"],
	["<noembed>", "</noembed>"],
	["<script type=sfz-data>", "</script>"],
	["<style type=sfz-data>", "</style>"],
	["<iframe>", "</iframe>"],
	["<xmp>", "</xmp>"],
	["<plaintext>", "</plaintext>"]
];
const EMBEDDED_DATA_TAGS = [
	["<!--", "-->"],
	...EXTRA_DATA_TAGS,
];
const EXTRA_DATA_REGEXPS = [
	[/<noscript/i, /<\/noscript[\t\n\f\r />]/i],
	[/<noframes/i, /<\/noframes[\t\n\f\r />]/i],
	[/<noembed/i, /<\/noembed[\t\n\f\r />]/i],
	[/<script/i, /<\/script[\t\n\f\r />]/i],
	[/<style/i, /<\/style[\t\n\f\r />]/i],
	[/<iframe/i, /<\/iframe[\t\n\f\r />]/i],
	[/<xmp/i, /<\/xmp[\t\n\f\r />]/i],
	[/<plaintext/i, /<\/plaintext[\t\n\f\r />]/i]
];
const EMBEDDED_DATA_REGEXPS = [
	[/<!--/i, /--!?>/i],
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
const PNG_SIGNATURE_LENGTH = 8;
const PNG_IHDR_LENGTH = 25;

const browser = globalThis.browser;

export {
	process
};

async function process(pageData, options, lastModDate = new Date()) {
	let script;
	if (options.zipScript) {
		script = options.zipScript;
	} else if (browser && browser.runtime && browser.runtime.getURL) {
		configure({ workerScripts: { deflate: ["/lib/single-file-z-worker.js"] } });
		script = await (await fetch(browser.runtime.getURL(SCRIPT_PATH))).text();
	}
	const zipDataWriter = new Uint8ArrayWriter();
	zipDataWriter.init();
	zipDataWriter.writable.size = 0;
	let extraDataOffset, extraData, embeddedImageDataOffset, endTag;
	if (options.embeddedImage) {
		options.embeddedImage = Array.from(options.embeddedImage);
		const embeddedImageData = options.embeddedImage.slice(PNG_SIGNATURE_LENGTH + PNG_IHDR_LENGTH, options.embeddedImage.length - PNG_IEND_LENGTH);
		await writeData(zipDataWriter.writable, options.embeddedImage.slice(0, PNG_SIGNATURE_LENGTH + PNG_IHDR_LENGTH));
		if (options.selfExtractingArchive) {
			const embeddedImageText = TEXT_DECODER.decode(new Uint8Array(embeddedImageData));
			const tagIndex = EMBEDDED_DATA_REGEXPS.slice(0, -1).findIndex(tests => !embeddedImageText.match(tests[1]));
			let startTag;
			[startTag, endTag] = tagIndex == -1 ? ["", ""] : EMBEDDED_DATA_TAGS[tagIndex];
			const htmlArray = getStartHTMLArray(pageData, options, startTag);
			const hmtlData = new Uint8Array([...getLength(htmlArray.length + 4), ...[0x74, 0x45, 0x58, 0x74, 0x50, 0x4e, 0x47, 0], ...htmlArray]);
			await writeData(zipDataWriter.writable, hmtlData);
			await writeData(zipDataWriter.writable, getCRC32(hmtlData, 4));
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
		extraDataOffset = await prependHTMLData(pageData, zipDataWriter, script, options);
	} else if (!options.embeddedImage && options.embeddedPdf) {
		await writeData(zipDataWriter.writable, new Uint8Array(options.embeddedPdf));
	}
	const zipWriter = new ZipWriter(zipDataWriter, { bufferedWrite: true, keepOrder: true, lastModDate, useCompressionStream: true });
	const startOffset = zipDataWriter.offset;
	pageData.url = options.url;
	pageData.archiveTime = (new Date()).toISOString();
	await addPageResources(zipWriter, pageData, { password: options.password, disableCompression: options.disableCompression }, options.createRootDirectory ? String(Date.now()) + "_" + (options.tabId || 0) + "/" : "", options.url);
	const data = await zipWriter.close(null, { preventClose: true });
	if (options.selfExtractingArchive) {
		const lfCodes = [];
		let crc32 = -1;
		if (options.extractDataFromPage) {
			if (!options.extractDataFromPageTags || options.extractDataFromPageTags[0] != "<plaintext>") {
				const textContent = TEXT_DECODER.decode(data.subarray(startOffset));
				if (options.extractDataFromPageTags) {
					const tagIndex = EXTRA_DATA_TAGS.indexOf(options.extractDataFromPageTags);
					const regExpsTag = EXTRA_DATA_REGEXPS[tagIndex];
					if (textContent.match(regExpsTag[0]) || textContent.match(regExpsTag[1])) {
						return findExtraDataTags(textContent, pageData, options, lastModDate, tagIndex + 1);
					}
				} else {
					const matchCommentTags = textContent.match(/<!--/i) || textContent.match(/--!?>/i);
					if (matchCommentTags) {
						return findExtraDataTags(textContent, pageData, options, lastModDate);
					}
				}
			}
			for (let index = startOffset; index < data.length; index++) {
				const byte = data[index];
				crc32 = (crc32 >>> 8) ^ CRC32_TABLE[(crc32 ^ byte) & 0xff];
				if (byte == 10) {
					lfCodes.push(0);
				} else if (byte == 13) {
					if (data[index + 1] == 10) {
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
			const payload = new Uint32Array(3 + Math.ceil(lfCodes.length / 16));
			payload[0] = crc32;
			payload[1] = data.length - startOffset;
			payload[2] = lfCodes.length;
			lfCodes.forEach((lfCode, indexLFCode) => payload[3 + (indexLFCode >> 4)] |= lfCode << ((indexLFCode & 15) * 2));
			extraData = "<sfz-extra-data>" + base64Encode(deflateRaw(new Uint8Array(payload.buffer))) + "</sfz-extra-data>";
			if (options.preventAppendedData || extraData.length > 65535 - endTags.length - (options.embeddedImage ? PNG_IEND_LENGTH : 0)) {
				if (!options.extraDataSize) {
					options.extraDataSize = Math.floor(extraData.length * 1.001);
					return process(pageData, options, lastModDate);
				}
			} else {
				if (options.extraDataSize) {
					options.extraDataSize = undefined;
					return process(pageData, options, lastModDate);
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
			options.extraDataSize = Math.floor(extraData.length * 1.001);
			return process(pageData, options, lastModDate);
		}
	}
	if (options.embeddedImage) {
		pageContent.set(getLength(zipDataWriter.offset - embeddedImageDataOffset - 4), embeddedImageDataOffset - 4);
		return new Blob([
			pageContent,
			getCRC32(pageContent, embeddedImageDataOffset),
			new Uint8Array(options.embeddedImage.slice(options.embeddedImage.length - PNG_IEND_LENGTH))
		], { type: "application/octet-stream" });
	} else {
		return new Blob([pageContent], { type: "application/octet-stream" });
	}
}

function getCRC32(data, indexData = 0) {
	const crcArray = new Uint8Array(4);
	let crc = -1;
	for (; indexData < data.length; indexData++) {
		crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ data[indexData]) & 0xff];
	}
	crc ^= -1;
	setUint32(crcArray, crc);
	return crcArray;
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

async function prependHTMLData(pageData, zipDataWriter, script, options) {
	let pageContent = "";
	if (!options.embeddedImage) {
		await writeData(zipDataWriter.writable, getStartHTMLArray(pageData, options));
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
	if (options.insertTextBody) {
		const doc = (new DOMParser()).parseFromString(pageData.content, "text/html");
		doc.body.querySelectorAll("style, script, noscript").forEach(element => element.remove());
		let textBody = "";
		if (options.extractDataFromPage) {
			textBody += getPageTitle(pageData) + "\n\n";
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
	script = "<script>" +
		script +
		"document.currentScript.remove();" +
		"globalThis.bootstrap=(()=>{let bootstrapStarted;return async content=>{if (bootstrapStarted) return bootstrapStarted; bootstrapStarted = (" +
		extract.toString().replace(/\n|\t/g, "") + ")(content,{prompt}).then(({docContent}) => " +
		display.toString().replace(/\n|\t/g, "") + "(document,docContent," + JSON.stringify(displayOptions) + "));return bootstrapStarted;}})();(" +
		getContent.toString().replace(/\n|\t/g, "") + ")().then(globalThis.bootstrap).then(() => document.dispatchEvent(new CustomEvent(\"single-file-display-infobar\"))).catch(error => {" +
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
	const startTag = options.extractDataFromPageTags ? options.extractDataFromPageTags[0] : "<!--";
	// the space guarantees a text node between <sfz-extra-data> and the start tag
	pageContent += (extraData ? " " : "") + startTag;
	const extraDataOffset = startTag.length + extraData.length + (extraData ? 1 : 0);
	await writeData(zipDataWriter.writable, (new TextEncoder()).encode(pageContent));
	return extraDataOffset;
}

function getStartHTMLArray(pageData, options, startTag = "") {
	let html = "";
	if (options.includeBOM && !options.extractDataFromPage && !options.embeddedImage) {
		html += "\ufeff";
	}
	html += options.embeddedImage ? "" : pageData.doctype;
	html += "<html data-sfz>";
	html += pageData.comment && !options.embeddedImage ? "<!--" + pageData.comment + "-->" : "";
	const charset = options.extractDataFromPage ? "windows-1252" : "utf-8";
	html += "<meta charset=" + charset + ">";
	const htmlHeadData = getHTMLHeadData(pageData, options);
	let htmlArray;
	if (options.embeddedPdf) {
		const embeddedPdfText = TEXT_DECODER.decode(new Uint8Array(options.embeddedPdf));
		const pdfTagIndex = EMBEDDED_DATA_REGEXPS.slice(0, -1).findIndex(tests => !embeddedPdfText.match(tests[1]));
		const [pdfStartTag, pdfEndTag] = pdfTagIndex == -1 ? ["", ""] : EMBEDDED_DATA_TAGS[pdfTagIndex];
		const htmlArray1 = new TextEncoder().encode(html + pdfStartTag);
		const htmlArray2 = new TextEncoder().encode(pdfEndTag + htmlHeadData + startTag);
		htmlArray = new Uint8Array(htmlArray1.length + htmlArray2.length + options.embeddedPdf.length);
		htmlArray.set(htmlArray1);
		htmlArray.set(options.embeddedPdf, htmlArray1.length);
		htmlArray.set(htmlArray2, htmlArray1.length + options.embeddedPdf.length);
	} else {
		htmlArray = new TextEncoder().encode(html + htmlHeadData + startTag);
	}
	return htmlArray;
}

function getHTMLHeadData(pageData, options) {
	let pageContent = "";
	const title = options.extractDataFromPage ? "" : getPageTitle(pageData);
	pageContent += "<title>" + title + "</title>";
	if (options.insertCanonicalLink) {
		pageContent += "<link rel=canonical href=\"" + options.url + "\">";
	}
	if (options.insertMetaNoIndex) {
		pageContent += "<meta name=robots content=noindex>";
	}
	if (pageData.viewport) {
		pageContent += "<meta name=viewport content=" + JSON.stringify(pageData.viewport) + ">";
	}
	if (options.insertMetaCSP) {
		const cspContent = "default-src 'none';connect-src 'self' data: blob:;font-src 'self' data: blob:;img-src 'self' data: blob:;style-src 'self' 'unsafe-inline' data: blob:;frame-src 'self' data: blob:;media-src 'self' data: blob:;script-src 'self' 'unsafe-inline' data: blob:;object-src 'self' data: blob:";
		pageContent += `<meta http-equiv=content-security-policy content=${JSON.stringify(cspContent)}>`;
	}
	pageContent += "<style>@keyframes display-wait-message{0%{opacity:0}100%{opacity:1}};body{color:transparent};div{color:initial}body>:not(#sfz-wait-message,#sfz-error-message){display:none}</style>";
	pageContent += "<body hidden>";
	return pageContent;
}

function getPageTitle(pageData) {
	return pageData.title.replace(/</g, "&lt;").replace(/>/g, "&gt;") || "";
}

function findExtraDataTags(textContent, pageData, options, lastModDate, indexExtractDataFromPageTags = 0) {
	const regExpsTag = EXTRA_DATA_REGEXPS[indexExtractDataFromPageTags];
	const plaintextTag = EXTRA_DATA_TAGS[indexExtractDataFromPageTags][0] == "<plaintext>";
	const matchTag = !plaintextTag && (textContent.match(regExpsTag[0]) || textContent.match(regExpsTag[1]));
	if (matchTag) {
		if (indexExtractDataFromPageTags < EXTRA_DATA_TAGS.length - 1) {
			return findExtraDataTags(textContent, pageData, options, lastModDate, indexExtractDataFromPageTags + 1);
		} else {
			options.extractDataFromPage = false;
			return process(pageData, options, lastModDate);
		}
	} else {
		options.extractDataFromPageTags = EXTRA_DATA_TAGS[indexExtractDataFromPageTags];
		if (options.extractDataFromPageTags[0] == "<plaintext>") {
			// <plaintext> cannot be closed, the file must end with the zip data
			options.preventAppendedData = true;
		}
		return process(pageData, options, lastModDate);
	}
}

async function writeData(writable, array) {
	const streamWriter = writable.getWriter();
	await streamWriter.ready;
	writable.size += array.length;
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

async function addFile(zipWriter, prefixName, data, disableCompresson) {
	const dataReader = typeof data.content == "string" ? new TextReader(data.content) : new BlobReader(new Blob([new Uint8Array(data.content)]));
	const options = { comment: data.url && data.url.startsWith("data:") ? "data:" : data.url, password: data.password, bufferedWrite: true };
	if (NO_COMPRESSION_EXTENSIONS.includes(data.extension) || disableCompresson) {
		options.level = 0;
	}
	await zipWriter.add(prefixName + data.name, dataReader, options);
}

async function getContent() {
	const BASE64_TABLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
	const { Blob, XMLHttpRequest, document, zip, location } = globalThis;
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
				console.error(error);
				displayMessage("sfz-error-message", 2);
				reject(error);
			}
		}

		function getPageData() {
			const xhr = new XMLHttpRequest();
			xhr.responseType = "blob";
			xhr.open("GET", "");
			xhr.onerror = () => {
				if (aborted) {
					displayMessage("sfz-error-message", 2);
					reject();
				} else {
					extractDataFromDocument();
				}
			};
			xhr.send();
			xhr.onreadystatechange = () => {
				if (xhr.readyState === 2 && xhr.status === 200 && !aborted) {
					aborted = true;
					const httpRangeSupport = xhr.getResponseHeader("Accept-Ranges") === "bytes";
					xhr.abort();
					displayMessage("sfz-wait-message", 2);
					if (httpRangeSupport) {
						resolve(new zip.HttpRangeReader(location.href, {
							useXHR: true,
							combineSizeEocd: true
						}));
					} else {
						getPageData();
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

	function displayMessage(elementId, delay = 0) {
		const element = document.getElementById(elementId);
		if (element) {
			Array.from(document.body.childNodes).forEach(node => {
				if (node.id != elementId) {
					if (node.id == "sfz-wait-message" || node.id == "sfz-error-message") {
						node.hidden = true;
					} else {
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
			let dataNode = zipDataElement.nextSibling;
			if (dataNode) {
				if (dataNode.nodeType == Node.TEXT_NODE && dataNode.nextSibling) {
					dataNode = dataNode.nextSibling;
				} else {
					dataNode = zipDataElement.previousSibling;
				}
			} else {
				dataNode = zipDataElement.previousSibling;
			}
			const inflatedPayload = zip.inflateRaw(base64Decode(zipDataElement.textContent));
			const payload = new Uint32Array(inflatedPayload.buffer, inflatedPayload.byteOffset, inflatedPayload.length >> 2);
			const expectedCRC32 = payload[0];
			const zipDataLength = payload[1];
			const lfCodesLength = payload[2];
			const zipData = new Uint8Array(zipDataLength);
			const { textContent } = dataNode;
			let offset = 0;
			let indexLFCode = 0;
			let crc32 = -1;
			for (let index = 0; index < textContent.length; index++) {
				const charCode = textContent.charCodeAt(index);
				if (charCode == 10) {
					const lfCode = (payload[3 + (indexLFCode >> 4)] >>> ((indexLFCode & 15) * 2)) & 3;
					indexLFCode++;
					if (lfCode == 0) {
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
		throw new Error("Extra zip data data not found");
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
