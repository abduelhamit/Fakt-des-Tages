import { Marked, Renderer } from 'marked';
import YAML from 'yaml';
import { isIsoDate, type FaktHtml } from '$lib/fakten';

// Everything here runs at build time only. It lives under `$lib/server/` so that SvelteKit *fails
// the build* if it is ever imported from client code — which is what keeps `yaml` and `marked` out
// of the browser bundle, rather than relying on tree-shaking to notice.

/**
 * Parse the facts file. Throws a German `Error` on anything malformed: per the project's chosen
 * policy a single bad entry fails the whole load, so the message always names what to fix. Since
 * this runs during prerendering, that failure stops the build instead of reaching a visitor.
 */
export function parseFakten(text: string): Map<string, string> {
	let data: unknown;
	try {
		data = YAML.parse(text);
	} catch (cause) {
		// The library's line/column detail is the useful part, so keep it after the German prefix.
		const detail = cause instanceof Error ? cause.message : String(cause);
		throw new Error(`Die Faktendatei ist fehlerhaft: ${detail}`, { cause });
	}

	// An empty file is a legitimate "no facts yet", not an error.
	if (data == null) return new Map();

	if (typeof data !== 'object' || Array.isArray(data)) {
		throw new Error('Die Faktendatei hat kein gültiges Format.');
	}

	const fakten = new Map<string, string>();
	for (const [datum, fakt] of Object.entries(data)) {
		if (!isIsoDate(datum)) {
			throw new Error(`Ungültiges Datum in der Faktendatei: „${datum}“ (erwartet: JJJJ-MM-TT).`);
		}
		if (typeof fakt !== 'string' || fakt.trim() === '') {
			throw new Error(`Der Fakt für ${datum} ist leer oder kein Text.`);
		}
		fakten.set(datum, fakt);
	}
	return fakten;
}

/**
 * Every image links to its own file, which is the whole zoom feature: the browser's image viewer
 * already toggles between fit-to-window and 100 % on click, pinches on a phone and zooms with the
 * keyboard, and it works without JavaScript. The `href` is read back out of marked's own `<img>`
 * so it carries exactly the encoded URL the image does; for a URL it cannot encode marked returns
 * the bare alt text instead, and there is then nothing to link. A private instance, so the global
 * `marked` stays stock for anything else that imports it.
 */
const markdown = new Marked({
	renderer: {
		image(token) {
			const bild = Renderer.prototype.image.call(this, token);
			const quelle = /^<img src="([^"]*)"/.exec(bild)?.[1];
			return quelle ? `<a href="${quelle}">${bild}</a>` : bild;
		}
	}
});

/** CommonMark → HTML. `async: false` picks marked's synchronous overload, which returns `string`. */
export function renderFakt(text: string): FaktHtml {
	return markdown.parse(text, { async: false }) as FaktHtml;
}
