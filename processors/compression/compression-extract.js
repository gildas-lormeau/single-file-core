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

/* global zip, Blob, FileReader, URL */

export {
	extract
};

async function extract(content, { password, prompt = () => { }, shadowRootScriptURL, zipOptions = { useWebWorkers: false }, noBlobURL } = {}) {
	const KNOWN_MIMETYPES = {
		"gif": "image/gif",
		"jpg": "image/jpeg",
		"png": "image/png",
		"tif": "image/tiff",
		"tiff": "image/tiff",
		"bmp": "image/bmp",
		"ico": "image/vnd.microsoft.icon",
		"webp": "image/webp",
		"svg": "image/svg+xml",
		"avi": "video/x-msvideo",
		"ogv": "video/ogg",
		"mp4": "video/mp4",
		"mpeg": "video/mpeg",
		"ts": "video/mp2t",
		"webm": "video/webm",
		"3gp": "video/3gpp",
		"3g2": "video/3gpp",
		"mp3": "audio/mpeg",
		"oga": "audio/ogg",
		"mid": "audio/midi",
		"midi": "audio/midi",
		"opus": "audio/opus",
		"wav": "audio/wav",
		"weba": "audio/webm"
	};
	const REGEXP_MATCH_STYLESHEET = /stylesheet_[0-9]+\.css/;
	const REGEXP_MATCH_SCRIPT = /scripts\/[0-9]+\.js/;
	const REGEXP_ROOT_INDEX = /^([0-9_]+\/)?index\.html$/;
	const REGEXP_INDEX = /index\.html$/;
	const REGEXP_ESCAPE = /([{}()^$&.*?/+|[\\\\]|\]|-)/g;
	const CHARSET_UTF8 = ";charset=utf-8";
	if (Array.isArray(content)) {
		content = new Blob([new Uint8Array(content)]);
	}
	zip.configure(zipOptions);
	const blobReader = new zip.BlobReader(content);
	let resources = [];
	const zipReader = new zip.ZipReader(blobReader);
	const entries = await zipReader.getEntries();
	const options = { password };
	await Promise.all(entries.map(async entry => {
		const { filename } = entry;
		let dataWriter, content, textContent, name, blob;
		if (!options.password && entry.encrypted) {
			options.password = prompt("Please enter the password to view the page");
		}
		name = filename.match(/^([0-9_]+\/)?(.*)$/)[2];
		let mimeType;
		if (filename.match(REGEXP_INDEX) || filename.match(REGEXP_MATCH_STYLESHEET) || filename.match(REGEXP_MATCH_SCRIPT)) {
			dataWriter = new zip.TextWriter();
			textContent = await entry.getData(dataWriter, options);
			if (filename.match(REGEXP_INDEX)) {
				mimeType = "text/html" + CHARSET_UTF8;
			} else {
				if (filename.match(REGEXP_MATCH_STYLESHEET)) {
					mimeType = "text/css" + CHARSET_UTF8;
				} else if (filename.match(REGEXP_MATCH_SCRIPT)) {
					mimeType = "text/javascript" + CHARSET_UTF8;
				}
				if (textContent !== undefined) {
					content = noBlobURL ? await getDataURI(textContent, mimeType) : URL.createObjectURL(new Blob([textContent], { type: mimeType }));
				} else {
					content = "data:text/plain,";
				}
			}
		} else {
			const extension = filename.match(/\.([^.]+)/);
			if (extension && extension[1] && KNOWN_MIMETYPES[extension[1]]) {
				mimeType = KNOWN_MIMETYPES[extension[1]];
			} else {
				mimeType = "application/octet-stream";
			}
			if (filename.match(/frames\//) || noBlobURL) {
				content = await entry.getData(new zip.Data64URIWriter(mimeType), options);
			} else {
				blob = await entry.getData(new zip.BlobWriter(mimeType), options);
				content = URL.createObjectURL(blob);
			}
		}
		resources.push({ filename: entry.filename, name, url: entry.comment, content, mimeType, blob, textContent, parentResources: [] });
	}));
	await zipReader.close();
	let docContent, origDocContent, url;
	resources = resources.sort((resourceLeft, resourceRight) => resourceRight.filename.length - resourceLeft.filename.length);
	for (const resource of resources) {
		let { textContent, mimeType, filename } = resource;
		if (textContent !== undefined) {
			let prefixPath = "";
			const prefixPathMatch = filename.match(/(.*\/)[^/]+$/);
			if (prefixPathMatch && prefixPathMatch[1]) {
				prefixPath = prefixPathMatch[1];
			}
			if (filename.match(REGEXP_ROOT_INDEX)) {
				origDocContent = textContent;
			}
			const isScript = filename.match(REGEXP_MATCH_SCRIPT);
			if (!isScript) {
				const resourceFilename = filename;
				await Promise.all(resources.map(async innerResource => {
					const { filename, parentResources, content } = innerResource;
					if (filename.startsWith(prefixPath) && filename != resourceFilename) {
						const relativeFilename = filename.substring(prefixPath.length);
						if (!relativeFilename.match(/manifest\.json$/)) {
							const searchRegExp = new RegExp(relativeFilename.replace(REGEXP_ESCAPE, "\\$1"), "g");
							const position = textContent.search(searchRegExp);
							if (position != -1) {
								parentResources.push(resourceFilename);
								textContent = textContent.replace(searchRegExp, content);
							}
						}
					}
				}));
				resource.content = noBlobURL ? await getDataURI(textContent, mimeType) : URL.createObjectURL(new Blob([textContent], { type: mimeType }));
				resource.textContent = textContent;
			}
			if (filename.match(REGEXP_INDEX)) {
				if (shadowRootScriptURL) {
					resource.textContent = textContent.replace(/<script data-template-shadow-root.*<\/script>/g, "<script data-template-shadow-root src=" + shadowRootScriptURL + "></" + "script>");
				}
			}
			if (filename.match(REGEXP_ROOT_INDEX)) {
				docContent = textContent;
				url = resource.url;
			}
		}
	}
	return { docContent, origDocContent, resources, url };

	async function getDataURI(textContent, mimeType) {
		const reader = new FileReader();
		reader.readAsDataURL(new Blob([textContent], { type: mimeType }));
		return new Promise((resolve, reject) => {
			reader.onload = () => resolve(reader.result);
			reader.onerror = reject;
		});
	}
}