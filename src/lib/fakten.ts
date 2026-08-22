import { asset } from '$app/paths';
import { marked } from 'marked';
import YAML from 'yaml';

/** ISO date (`2026-08-22`) → the CommonMark source of that day's fact. */
export type Fakten = Map<string, string>;

/**
 * A `Date` as `YYYY-MM-DD` in the *visitor's* timezone.
 *
 * Deliberately not `toISOString().slice(0, 10)`, which is UTC: at 00:30 in Berlin that still
 * reads as yesterday, so the visitor would be shown the previous day's fact until 02:00.
 */
export function toIsoDate(date: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Shape *and* calendar validity. The round-trip rejects `2026-02-31` and `2026-02-29`, which a
 * regex alone would wave through — `T00:00` (no `Z`) so the parse is local and matches
 * `toIsoDate`.
 */
function isIsoDate(key: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
	const date = new Date(`${key}T00:00`);
	return !Number.isNaN(date.getTime()) && toIsoDate(date) === key;
}

/**
 * Parse the facts file. Throws a German `Error` on anything malformed: per the project's chosen
 * policy a single bad entry fails the whole load, so the message always names what to fix.
 */
export function parseFakten(text: string): Fakten {
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

	// A 404 on GitHub Pages serves an HTML error page, and HTML happens to parse as a valid YAML
	// *string* rather than throwing — so the type has to be checked, not just the parse.
	if (typeof data !== 'object' || Array.isArray(data)) {
		throw new Error('Die Faktendatei hat kein gültiges Format.');
	}

	const fakten: Fakten = new Map();
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
 * Fetch and parse the facts at runtime. Never call this during prerendering — the whole point of
 * the file is that editing it on GitHub publishes without a rebuild.
 */
export async function loadFakten(fetcher: typeof fetch = fetch): Promise<Fakten> {
	// `asset()` rather than the deprecated `base`. Its `Asset` type only *autocompletes* the files
	// in static/ (the union ends in `string & {}`), so a rename still fails at runtime, not in
	// `pnpm check` — the spec below is what actually pins this path.
	const res = await fetcher(asset('/fakten.yaml'));
	if (!res.ok) {
		throw new Error(`Die Faktendatei konnte nicht geladen werden (HTTP ${res.status}).`);
	}
	// `.text()`, not `.json()`: the Content-Type GitHub Pages serves for .yaml is not dependable.
	return parseFakten(await res.text());
}

/** CommonMark → HTML. `async: false` picks marked's synchronous overload, which returns `string`. */
export function renderFakt(markdown: string): string {
	return marked.parse(markdown, { async: false });
}
