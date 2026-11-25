import { createProcessor, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";
const ORIGINAL_URL = "https://example.com/original.html";
const SAVE_TIME = 946684800000;
const OPTIONS_ELEMENT = /<script type="?application\/json"? data-single-file-options(?:="")?>(.*?)<\/script>/;

let failed = false;

// A page saved with its filename template data carries a JSON element, which the next save of that
// page reads back so that the file keeps the name it was given first. Any web page can carry such an
// element, so what is read from it is what a page is allowed to decide for its own save: the keys
// were all copied into the options, and a page could name the server its saved copy was uploaded to,
// with no file written on the disk of the user. Only the data of the filename is read now.

// a page cannot choose where it is saved, how, or under which password
{
	const { options } = await run(pageWith({
		saveUrl: ORIGINAL_URL,
		saveDate: SAVE_TIME,
		visitDate: SAVE_TIME,
		filenameTemplate: "from-the-page",
		saveToRestFormApi: true,
		saveToRestFormApiUrl: "https://attacker.example/upload",
		saveToGitHub: true,
		githubToken: "token-of-the-page",
		openEditor: true,
		password: "password-of-the-page",
		backgroundSave: false
	}), { filenameTemplate: "from-the-profile", password: "", backgroundSave: true });
	check("the upload destination is not set by the page", options.saveToRestFormApi, undefined);
	check("the upload URL is not set by the page", options.saveToRestFormApiUrl, undefined);
	check("the GitHub destination is not set by the page", options.saveToGitHub, undefined);
	check("the GitHub token is not set by the page", options.githubToken, undefined);
	check("the editor is not opened by the page", options.openEditor, undefined);
	check("the password is not set by the page", options.password, "");
	check("the way the file is written is not set by the page", options.backgroundSave, true);
}

// the data of the filename is still read: a page saved again keeps its name, its URL and its date
{
	const { options, pageData } = await run(pageWith({
		saveUrl: ORIGINAL_URL,
		saveDate: SAVE_TIME,
		visitDate: SAVE_TIME,
		filenameTemplate: "first-name {page-title}",
		title: "first title"
	}), { filenameTemplate: "second-name" });
	check("the first template names the file", pageData.filename, "first-name first title");
	check("the first URL is kept", options.saveUrl, ORIGINAL_URL);
	check("the first date is kept", options.saveDate.getTime(), SAVE_TIME);
}

// the format is the one of the profile, whatever format the page was first saved in: a page saved as
// HTML and saved again with tabs in one archive was written beside the archive (#2062)
{
	const { options } = await run(pageWith({
		saveUrl: ORIGINAL_URL,
		saveDate: SAVE_TIME,
		visitDate: SAVE_TIME,
		compressContent: false,
		selfExtractingArchive: false,
		extractDataFromPage: false,
		disableCompression: true
	}), { compressContent: true, selfExtractingArchive: true, extractDataFromPage: true, disableCompression: false });
	check("the page is compressed as the profile says", options.compressContent, true);
	check("the archive is self-extracting as the profile says", options.selfExtractingArchive, true);
	check("the data is read from the page as the profile says", options.extractDataFromPage, true);
	check("the compression is the one of the profile", options.disableCompression, false);
}

// the element of a page saved again says which format the file has now: the editor names the file
// it saves from it
{
	const { pageData } = await run(pageWith({
		saveUrl: ORIGINAL_URL,
		saveDate: SAVE_TIME,
		visitDate: SAVE_TIME,
		filenameTemplate: "name",
		compressContent: true,
		selfExtractingArchive: true
	}), { saveFilenameTemplateData: true, compressContent: false, selfExtractingArchive: false });
	const element = OPTIONS_ELEMENT.exec(pageData.content);
	const data = element ? JSON.parse(element[1]) : {};
	check("the element is kept in the page saved again", Boolean(element), true);
	check("it states the format of the new file", data.compressContent, false);
	check("it keeps the template of the first save", data.filenameTemplate, "name");
}

// an element that does not hold JSON does not prevent the page from being saved
{
	const { options, pageData } = await run(html("<script type=\"application/json\" data-single-file-options>{not json</script><p>page</p>"), { filenameTemplate: "from-the-profile" });
	check("the page is saved", pageData.content.includes("<p>page</p>"), true);
	check("the template of the profile names the file", options.filenameTemplate, "from-the-profile");
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

function pageWith(data) {
	return html("<script type=\"application/json\" data-single-file-options>" + JSON.stringify(data) + "</script><p>page</p>");
}

async function run(content, options) {
	const processor = createProcessor({ [PAGE_URL]: { body: content } }, { url: PAGE_URL, content, ...options });
	await processor.run();
	const pageData = await processor.getPageData();
	return { options: processor.options, pageData };
}

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}
