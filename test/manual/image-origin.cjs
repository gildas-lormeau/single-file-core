/* global require, process, chrome, setTimeout, clearTimeout */
/* eslint no-console: "off" */
// Real Chrome + the ordinary SingleFile toolbar action; no intercepted requests.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const puppeteer = require("puppeteer");
const [url, extensionPath, outputDirectory, mode] = process.argv.slice(2);
fs.mkdirSync(outputDirectory, { recursive: true });
(async () => {
	const browser = await puppeteer.launch({
		executablePath: process.env.CHROME_BINARY, headless: true,
		enableExtensions: true, dumpio: true,
		args: ["--no-sandbox", "--enable-unsafe-extension-debugging"],
		downloadBehavior: { policy: "allow", downloadPath: outputDirectory },
	});
	const events = [];
	try {
		await browser.installExtension(extensionPath);
		const extensions = await browser.extensions();
		const extension = [...extensions.values()].find(e => e.name === "SingleFile");
		assert(extension, "SingleFile installed");
		const root = await browser.target().createCDPSession();
		const ready = browser.waitForTarget(t => t.url() === `chrome-extension://${extension.id}/src/ui/pages/offscreen-document.html`);
		await root.send("Target.createTarget", { url: `chrome-extension://${extension.id}/src/ui/pages/offscreen-document.html` });
		const helper = await (await ready).page();
		await helper.waitForFunction(() => globalThis.chrome?.runtime?.id);
		async function observe(target) {
			if (!["page", "service_worker"].includes(target.type())) return;
			const client = await target.createCDPSession();
			client.on("Network.requestWillBeSent", e => events.push({ url: e.request.url, type: e.type, frameId: e.frameId, targetType: target.type() }));
			await client.send("Network.enable");
		}
		browser.on("targetcreated", target => observe(target).catch(() => {}));
		await Promise.all(browser.targets().map(observe));
		const page = await browser.newPage();
		await page.goto(url, { waitUntil: "networkidle0" });
		const options = await helper.evaluate(async ({ url, compressed }) => {
			const [tab] = await chrome.tabs.query({ url });
			const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => chrome.runtime.sendMessage({ method: "bootstrap.init" }) });
			const options = result.result.options;
			await chrome.runtime.sendMessage({ method: "config.updateProfile", profileName: options.profileName, profile: {
				compressContent: compressed, selfExtractingArchive: false, createRootDirectory: false,
				removeHiddenElements: false, removeAlternativeImages: false,
				removeUnusedStyles: false, removeAlternativeMedias: false, removeUnusedFonts: false,
			} });
			return { version: chrome.runtime.getManifest().version, tabId: tab.id };
		}, { url, compressed: mode === "archive" });
		const done = helper.evaluate(() => new Promise((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error("Real SingleFile download did not complete")), 30000);
			chrome.downloads.onChanged.addListener(async change => {
				if (change.state?.current !== "complete") return;
				clearTimeout(timer);
				const [item] = await chrome.downloads.search({ id: change.id });
				resolve(item.filename);
			});
		}));
		await page.bringToFront();
		await page.triggerExtensionAction(extension);
		const filename = await done;
		fs.writeFileSync(path.join(outputDirectory, "result.json"), JSON.stringify({ filename, mode, ...options, browser: await browser.version(), events }, null, 2));
	} finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
