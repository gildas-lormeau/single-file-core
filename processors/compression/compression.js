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

/* global globalThis, FileReader, TextDecoder */

import {
	configure,
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

const { Blob, fetch, TextEncoder, DOMParser } = globalThis;

const NO_COMPRESSION_EXTENSIONS = [".jpg", ".jpeg", ".png", ".pdf", ".woff2", ".mp4", ".mp3", ".ogg", ".webp", ".webm"];
const SCRIPT_PATH = "/lib/single-file-zip.min.js";

const browser = globalThis.browser;

export {
	process
};

async function process(pageData, options) {
	let script;
	if (options.zipScript) {
		script = options.zipScript;
	} else if (browser && browser.runtime && browser.runtime.getURL) {
		configure({ workerScripts: { deflate: ["/lib/single-file-z-worker.js"] } });
		script = await (await fetch(browser.runtime.getURL(SCRIPT_PATH))).text();
	}
	const zipDataWriter = new Uint8ArrayWriter();
	zipDataWriter.init();
	if (options.selfExtractingArchive) {
		let pageContent = "";
		if (options.includeBOM && !options.extractDataFromPage) {
			pageContent += "\ufeff";
		}
		const charset = options.extractDataFromPage ? "windows-1252" : "utf-8";
		const pageDataTitle = pageData.title.replace(/</g, "&lt;").replace(/>/g, "&gt;") || "";
		const title = options.extractDataFromPage ? "" : pageDataTitle;
		pageContent += pageData.doctype + "<html data-sfz><meta charset=" + charset + "><title>" + title + "</title>";
		if (options.insertCanonicalLink) {
			pageContent += "<link rel=canonical href=\"" + options.url + "\">";
		}
		if (options.insertMetaNoIndex) {
			pageContent += "<meta name=robots content=noindex>";
		}
		if (pageData.viewport) {
			pageContent += "<meta name=\"viewport\" content=" + JSON.stringify(pageData.viewport) + ">";
		}
		pageContent += "<body hidden>";
		pageContent += "<div id='sfz-wait-message'>Please wait...</div>";
		pageContent += "<div id='sfz-error-message'><strong>Error</strong>: Cannot open the page from the filesystem.";
		pageContent += "<ul style='line-height:20px;'>";
		pageContent += "<li style='margin-bottom:10px'><strong>Chrome</strong>: Install <a href='https://chrome.google.com/webstore/detail/singlefile/mpiodijhokgodhhofbcjdecpffjipkle'>SingleFile</a> and enable the option \"Allow access to file URLs\" in the details page of the extension (chrome://extensions/?id=offkdfbbigofcgdokjemgjpdockaafjg).</li>";
		pageContent += "<li style='margin-bottom:10px'><strong>Microsoft Edge</strong>: Install <a href='https://microsoftedge.microsoft.com/addons/detail/singlefile/efnbkdcfmcmnhlkaijjjmhjjgladedno'>SingleFile</a> and enable the option \"Allow access to file URLs\" in the details page of the extension (edge://extensions/?id=gofneaifncimeglaecpnanbnmnpfjekk).</li>";
		pageContent += "<li><strong>Safari</strong>: Select \"Security > Disable Local File Restrictions\" in the \"Develop > Developer settings\" menu.</li></ul></div>";
		if (options.insertTextBody) {
			const doc = (new DOMParser()).parseFromString(pageData.content, "text/html");
			doc.body.querySelectorAll("style, script, noscript").forEach(element => element.remove());
			let textBody = "";
			if (options.extractDataFromPage) {
				textBody += pageDataTitle + "\n\n";
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
		if (options.extractDataFromPageTags) {
			pageContent += options.extractDataFromPageTags[0];
		} else {
			pageContent += "<xmp>";
		}
		await writeData(zipDataWriter.writable, (new TextEncoder()).encode(pageContent));
	}
	const zipWriter = new ZipWriter(zipDataWriter, { bufferedWrite: true, keepOrder: false });
	let startOffset = zipDataWriter.offset;
	pageData.url = options.url;
	pageData.archiveTime = (new Date()).toISOString();
	await addPageResources(zipWriter, pageData, { password: options.password }, options.createRootDirectory ? String(Date.now()) + "_" + (options.tabId || 0) + "/" : "", options.url);
	const data = await zipWriter.close(null, { preventClose: true });
	if (options.selfExtractingArchive) {
		const insertionsCRLF = [];
		const substitutionsLF = [];
		if (options.extractDataFromPage) {
			if (!options.extractDataFromPageTags) {
				const textContent = new TextDecoder().decode(data);
				const matchEndTagXMP = textContent.match(/<\/\s*xmp>/i);
				if (matchEndTagXMP) {
					const matchEndTagComment = textContent.match(/-->/i);
					if (matchEndTagComment) {
						const matchTextAreaTagComment = textContent.match(/<\/\s*textarea>/i);
						if (matchTextAreaTagComment) {
							options.extractDataFromPage = false;
							return process(pageData, options);
						} else {
							options.extractDataFromPageTags = ["<textarea>", "</textarea>"];
							return process(pageData, options);
						}
					} else {
						options.extractDataFromPageTags = ["<!--", "-->"];
						return process(pageData, options);
					}
				}
			}
			for (let index = 0; index < data.length; index++) {
				if (data[index] == 13) {
					if (data[index + 1] == 10) {
						insertionsCRLF.push(index - startOffset);
					} else {
						substitutionsLF.push(index - startOffset);
					}
				}
			}
		}
		let pageContent = "";
		if (options.extractDataFromPageTags) {
			pageContent += options.extractDataFromPageTags[1];
		} else {
			pageContent += "</xmp>";
		}
		if (insertionsCRLF.length || substitutionsLF.length) {
			const extraData =
				await arrayToBase64(insertionsCRLF) + "," +
				await arrayToBase64(substitutionsLF) + "," +
				await arrayToBase64([startOffset]);
			pageContent += "<sfz-extra-data>" + extraData + "</sfz-extra-data>";
		}
		script += "document.currentScript.remove();globalThis.bootstrap=(()=>{let bootstrapStarted;return async content=>{if (bootstrapStarted) return bootstrapStarted;bootstrapStarted = (" +
			extract.toString().replace(/\n|\t/g, "") + ")(content,{prompt}).then(({docContent}) => " +
			display.toString().replace(/\n|\t/g, "") + "(document,docContent));return bootstrapStarted;}})();(" +
			getContent.toString().replace(/\n|\t/g, "") + ")().then(globalThis.bootstrap).catch(()=>{});";
		pageContent += "<script>" + script + "</script></body></html>";
		await writeData(zipDataWriter.writable, (new TextEncoder()).encode(pageContent));
	}
	await zipDataWriter.writable.close();
	return new Blob([zipDataWriter.getData()], { type: "application/octet-stream" });
}

async function arrayToBase64(data) {
	const fileReader = new FileReader();
	return await new Promise(resolve => {
		fileReader.onload = event => resolve(event.target.result.substring(37));
		fileReader.readAsDataURL(new Blob([new Uint32Array(data)], { type: "application/octet-stream" }));
	});
}

async function writeData(writable, array) {
	const streamWriter = writable.getWriter();
	await streamWriter.ready;
	writable.size = array.length;
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
			addFile(zipWriter, prefixName, { name: "index.html", extension: ".html", content: pageData.content, url, password: options.password }),
			addFile(zipWriter, prefixName, { name: "manifest.json", extension: ".json", content: jsonContent, password: options.password })
		]),
		Promise.all(Object.keys(pageData.resources).map(async resourceType =>
			Promise.all(pageData.resources[resourceType].map(data => {
				if (resourceType == "frames") {
					return addPageResources(zipWriter, data, options, prefixName + data.name, data.url);
				} else {
					return addFile(zipWriter, prefixName, data, true);
				}
			}))
		))
	]);
}

async function addFile(zipWriter, prefixName, data) {
	const dataReader = typeof data.content == "string" ? new TextReader(data.content) : new BlobReader(new Blob([new Uint8Array(data.content)]));
	const options = { comment: data.url && data.url.startsWith("data:") ? "data:" : data.url, password: data.password, bufferedWrite: true };
	if (NO_COMPRESSION_EXTENSIONS.includes(data.extension)) {
		options.level = 0;
	}
	await zipWriter.add(prefixName + data.name, dataReader, options);
}

async function getContent() {
	const { Blob, XMLHttpRequest, fetch, document, setTimeout, clearTimeout, stop } = globalThis;
	const characterMap = new Map([
		[65533, 0], [8364, 128], [8218, 130], [402, 131], [8222, 132], [8230, 133], [8224, 134], [8225, 135], [710, 136], [8240, 137],
		[352, 138], [8249, 139], [338, 140], [381, 142], [8216, 145], [8217, 146], [8220, 147], [8221, 148], [8226, 149], [8211, 150],
		[8212, 151], [732, 152], [8482, 153], [353, 154], [8250, 155], [339, 156], [382, 158], [376, 159]
	]);
	const xhr = new XMLHttpRequest();
	let displayTimeout;
	Array.from(document.documentElement.childNodes).forEach(node => {
		if (node != document.body && node != document.head) {
			node.remove();
		}
	});
	xhr.responseType = "blob";
	xhr.open("GET", "");
	return new Promise((resolve, reject) => {
		xhr.onerror = () => {
			extractPageData().then(resolve).catch(() => {
				displayTimeout = displayMessage("sfz-error-message");
				reject();
			});
		};
		xhr.send();
		xhr.onload = () => {
			displayTimeout = displayMessage("sfz-wait-message");
			stop();
			if (displayTimeout) {
				clearTimeout(displayTimeout);
			}
			resolve(xhr.response);
		};
	});

	function displayMessage(elementId) {
		return setTimeout(() => {
			if (document.getElementById(elementId)) {
				Array.from(document.body.childNodes).forEach(node => {
					if (node.id != elementId) {
						node.remove();
					}
				});
				document.body.hidden = false;
			}
		}, 1500);
	}

	async function extractPageData() {
		const zipDataElement = document.querySelector("sfz-extra-data");
		if (zipDataElement) {
			const dataNode = zipDataElement.previousSibling;
			const zipData = [];
			let { textContent } = dataNode;
			for (let index = 0; index < textContent.length; index++) {
				const charCode = textContent.charCodeAt(index);
				zipData.push(charCode > 255 ? characterMap.get(charCode) : charCode);
			}
			const [insertionsCRLFData, substitutionsLFData, startOffsetData] = zipDataElement.textContent.split(",");
			const insertionsCRLF = await base64ToUint32Array(insertionsCRLFData);
			const substitutionsLF = await base64ToUint32Array(substitutionsLFData);
			const [startOffset] = await base64ToUint32Array(startOffsetData);
			insertionsCRLF.forEach(index => zipData.splice(index, 1, 13, 10));
			substitutionsLF.forEach(index => zipData[index] = 13);
			return new Blob([new Uint8Array(startOffset), new Uint8Array(zipData)], { type: "application/octet-stream" });
		}
		throw new Error("Extra zip data data not found");
	}

	async function base64ToUint32Array(data) {
		return new Uint32Array(await (await fetch("data:application/octet-stream;base64," + data)).arrayBuffer());
	}
}
