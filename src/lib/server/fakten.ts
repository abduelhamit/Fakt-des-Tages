import { marked } from 'marked';
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

/** CommonMark → HTML. `async: false` picks marked's synchronous overload, which returns `string`. */
export function renderFakt(markdown: string): FaktHtml {
	return marked.parse(markdown, { async: false }) as FaktHtml;
}
