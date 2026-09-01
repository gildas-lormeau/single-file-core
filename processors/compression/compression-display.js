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

/* global DOMParser, setTimeout */

export {
	display
};

async function display(document, docContent, { disableFramePointerEvents, inPlace } = {}) {
	function getDoctypeString(doc) {
		const docType = doc.doctype;
		let docTypeString = "";
		if (docType) {
			docTypeString = "<!DOCTYPE " + docType.nodeName;
			if (docType.publicId) {
				docTypeString += " PUBLIC \"" + docType.publicId + "\"";
				if (docType.systemId) {
					docTypeString += " \"" + docType.systemId + "\"";
				}
			} else if (docType.systemId) {
				docTypeString += " SYSTEM \"" + docType.systemId + "\"";
			}
			if (docType.internalSubset) {
				docTypeString += " [" + docType.internalSubset + "]";
			}
			docTypeString += ">";
		}
		return docTypeString;
	}
	docContent = docContent.replace(/<noscript/gi, "<template disabled-noscript");
	docContent = docContent.replace(/<\/noscript/gi, "</template");
	const doc = (new DOMParser()).parseFromString(docContent, "text/html");
	if (disableFramePointerEvents) {
		doc.querySelectorAll("iframe").forEach(element => {
			const pointerEvents = "pointer-events";
			element.style.setProperty("-sf-" + pointerEvents, element.style.getPropertyValue(pointerEvents), element.style.getPropertyPriority(pointerEvents));
			element.style.setProperty(pointerEvents, "none", "important");
		});
	}
	if (inPlace && doc.compatMode == document.compatMode && !doc.querySelector("script")) {
		await Promise.all(Array.from(doc.querySelectorAll("link[rel~=stylesheet][href]")).map(linkElement => new Promise(resolve => {
			const preloadElement = document.createElement("link");
			preloadElement.rel = "preload";
			preloadElement.as = "style";
			preloadElement.href = linkElement.getAttribute("href");
			preloadElement.onload = resolve;
			preloadElement.onerror = resolve;
			document.head.appendChild(preloadElement);
			setTimeout(resolve, 500);
		})));
		const documentElement = document.documentElement;
		const newDocumentElement = document.adoptNode(doc.documentElement);
		while (documentElement.attributes.length) {
			documentElement.removeAttribute(documentElement.attributes[0].name);
		}
		Array.from(newDocumentElement.attributes).forEach(attribute => documentElement.setAttribute(attribute.name, attribute.value));
		documentElement.replaceChildren(...newDocumentElement.childNodes);
		if (document.querySelector("link[rel~=stylesheet][href]")) {
			const hideStyleElement = document.createElement("style");
			hideStyleElement.textContent = "html{visibility:hidden}";
			document.head.appendChild(hideStyleElement);
			const start = Date.now();
			while (Date.now() - start < 500 && Array.from(document.querySelectorAll("link[rel~=stylesheet][href]")).some(linkElement => !linkElement.sheet)) {
				await new Promise(resolve => setTimeout(resolve, 10));
			}
			hideStyleElement.remove();
		}
	} else {
		document.open();
		document.write(getDoctypeString(doc));
		document.write(doc.documentElement.outerHTML);
		document.close();
	}
	document.querySelectorAll("template[disabled-noscript]").forEach(element => {
		const noscriptElement = document.createElement("noscript");
		element.removeAttribute("disabled-noscript");
		Array.from(element.attributes).forEach(attribute => noscriptElement.setAttribute(attribute.name, attribute.value));
		noscriptElement.textContent = element.innerHTML;
		element.parentElement.replaceChild(noscriptElement, element);
	});
	document.documentElement.setAttribute("data-sfz", "");
	document.querySelectorAll("link[rel*=icon]").forEach(element => element.replaceWith(element.cloneNode(true)));
}