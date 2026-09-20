import { capture, html } from "./common.js";

const PAGE_URL = "https://example.com/page.html";
const PAGE = html("<h1>page</h1>");

const resources = {
	[PAGE_URL]: { body: PAGE }
};

let failed = false;

// The infobar flashes orange and draws an expanding ring when a saved page is opened. Both are
// attention-getters a reader cannot turn off from the page, so they are one option. The keyframes
// are the discriminator rather than the animation-name declarations: a page saved with the option
// off must not carry the animation at all, not merely fail to reference it.
{
	const content = await capture(resources, { url: PAGE_URL, content: PAGE, includeInfobar: true, animateInfobar: true });
	check("the infobar is in the saved page", content.includes("single-file-infobar"), true);
	check("animateInfobar true keeps the flash", content.includes("@keyframes flash"), true);
	check("animateInfobar true keeps the ripple", content.includes("@keyframes ripple"), true);
	check("animateInfobar true keeps the reduced-motion opt-out", content.includes("prefers-reduced-motion"), true);
	// The ring must live on a pseudo-element that exists in both states. Scoping it to the collapsed
	// state re-creates it on every collapse, and a re-created pseudo-element replays its animation,
	// so the ripple showed again each time the infobar was folded back. The flash never had this
	// problem because it animates the infobar itself. Hiding with visibility keeps the animation
	// clock running; display: none would cancel it and start it over on the next collapse.
	// The transition is a latch: expanding hides the ring at once, and the collapsed rule brings
	// visible back only after a delay long enough to count as never, so an infobar opened and
	// folded back during the ripple window does not resume the ripple either.
	check("the ripple ring is not scoped to the collapsed state", content.includes(":not(.infobar-focus)::after"), false);
	check("the ripple ring exists in both states", content.includes(".infobar::after {"), true);
	check("the expanded infobar hides the ring at once", content.includes(".infobar:focus-within::after,.infobar.infobar-focus::after {visibility:hidden;transition-delay:0s;}"), true);
	check("the ring stays hidden once the infobar has been expanded", content.includes("transition:visibility 0s 999999s;"), true);
}

{
	const content = await capture(resources, { url: PAGE_URL, content: PAGE, includeInfobar: true, animateInfobar: false });
	check("the infobar is still in the saved page", content.includes("single-file-infobar"), true);
	check("animateInfobar false drops the flash", content.includes("@keyframes flash"), false);
	check("animateInfobar false drops the ripple", content.includes("@keyframes ripple"), false);
	check("animateInfobar false leaves no animation declaration", content.includes("animation-name"), false);
	check("animateInfobar false leaves no ripple ring", content.includes("#dd6a00"), false);
}

// An option nobody passed used to mean animations, because they were unconditional. The extensions
// and the CLI both send the key, so the undefined case is only reached by an embedder, and it is
// the quiet reading that wins: no key, no animation.
{
	const content = await capture(resources, { url: PAGE_URL, content: PAGE, includeInfobar: true });
	check("an unset animateInfobar animates nothing", content.includes("@keyframes"), false);
}

if (failed) {
	console.log("FAILED");
	Deno.exit(1);
}
console.log("OK");

function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
	failed ||= !ok;
}
