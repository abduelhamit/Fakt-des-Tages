// Imported by `FactPage.svelte`, `Header.svelte` and `today.svelte.ts`, so everything in here ships
// to the browser: keep it dependency-free and keep the functions pure. Build-time-only code belongs
// in `src/lib/server/facts.ts`, which the framework will fail the build over if it is ever pulled
// into client code — nothing enforces this side, so it has to be remembered.

/**
 * A fact rendered to HTML. Branded so it is not interchangeable with the CommonMark it came from:
 * without this, dropping the render step from the build-time load would still type-check and feed
 * raw Markdown into `{@html}`. The brand exists only at compile time — at runtime it is a string.
 */
export type FactHtml = string & { readonly __factHtml: true };

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
 * The inverse of {@link toIsoDate}: local midnight on that calendar day.
 *
 * The `T00:00` matters and is the whole reason this exists. `new Date('2026-08-22')` is parsed as
 * *UTC* midnight, which west of Greenwich lands on the 21st; adding a time with no `Z` makes the
 * parse local, so the day survives the round trip everywhere.
 */
export function fromIsoDate(iso: string): Date {
	return new Date(`${iso}T00:00`);
}

/**
 * Shape *and* calendar validity in one round-trip: anything malformed either fails to parse (and
 * formats as `NaN-NaN-NaN`) or normalises to a different string, so `2026-3-15`, `2026-02-31` and
 * `2026-02-29` are all rejected.
 */
export function isIsoDate(value: string): boolean {
	return toIsoDate(fromIsoDate(value)) === value;
}

/** Shortest query the search accepts, and so the shortest suffix worth indexing — one constant for
 *  both, since a query shorter than the shortest stored suffix could never match. */
export const MIN_QUERY_LENGTH = 3;

/** Words, split on any run of characters that is neither letter nor digit. The `filter` drops the
 *  empty pieces a leading or trailing separator splits off. */
export function words(text: string): string[] {
	return text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/**
 * What goes *into* the index: every word, plus every suffix of it down to {@link MIN_QUERY_LENGTH}.
 * That is what lets `turm` reach `Fernsehturm` — MiniSearch matches whole terms, never substrings,
 * and German welds the noun onto the end of the compound.
 *
 * Indexing only. A query must be tokenised with {@link words}, or typing `turm` also asks for `urm`.
 * The measured cost is in CLAUDE.md, under "The search".
 */
export function indexTerms(text: string): string[] {
	return words(text).flatMap((word) =>
		Array.from({ length: Math.max(0, word.length - MIN_QUERY_LENGTH + 1) }, (_, i) => word.slice(i))
	);
}

/**
 * One search term, folded to what the index stores: diacritics flattened, lower case.
 *
 * The archive carries names from half of Europe — Édouard, Småländer, Florianópolis, Pokémon,
 * Maracanã, Ålesund, Hyōgo — and `normalize('NFKD')` separates a letter from its accents so the
 * accents can be dropped; ß does not decompose that way and needs its own case. Folding is to the
 * bare vowel rather than the `ae` a dictionary would use, so `Muenchen` still does not reach
 * `München`. What that buys and what it cannot reach is in CLAUDE.md, under "The search".
 */
export function foldTerm(term: string): string {
	return term
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/\u00df/g, 'ss');
}

/**
 * The words in `text` that the search's matched terms come from, as sorted `[start, end)` ranges.
 *
 * A term is what the index stored: folded, and a suffix of a word (see {@link indexTerms}). So it
 * is looked for in the folded text, and only where it ends a word — `turm` comes from
 * `Fernsehturm`, not from `Turmspitze`, which matched as a term of its own if at all. The whole
 * word is marked rather than the term, because fuzzy matching makes the term unreliable at its
 * start: `turm` also matches the stored suffix `hturm` one edit away, which would mark
 * `Fernse|hturm|`. Folding can change a character's length (`ß` becomes `ss`), hence `origin`,
 * which maps each folded character back to the one it came from.
 */
export function matchRanges(text: string, terms: string[]): [number, number][] {
	let folded = '';
	const origin: number[] = [];
	let i = 0;
	for (const char of text) {
		const f = foldTerm(char);
		folded += f;
		for (let k = 0; k < f.length; k++) origin.push(i);
		i += char.length;
	}
	origin.push(text.length);
	const isWordChar = (at: number) => /[\p{L}\p{N}]/u.test(folded[at] ?? '');
	const ranges: [number, number][] = [];
	for (const term of terms) {
		for (let at = folded.indexOf(term); term && at >= 0; at = folded.indexOf(term, at + 1)) {
			const end = at + term.length;
			if (isWordChar(end)) continue;
			let start = at;
			while (isWordChar(start - 1)) start--;
			ranges.push([origin[start], origin[end]]);
		}
	}
	// Whole words either coincide or do not touch, so dropping repeats is all the merging needed.
	return ranges.sort((a, b) => a[0] - b[0]).filter((range, k) => range[0] !== ranges[k - 1]?.[0]);
}

/** `text` cut into pieces at the words the search matched, so the hit list can wrap them in `<mark>`. */
export function highlight(text: string, terms: string[]): { text: string; mark: boolean }[] {
	const pieces: { text: string; mark: boolean }[] = [];
	let from = 0;
	for (const [start, end] of matchRanges(text, terms)) {
		if (start > from) pieces.push({ text: text.slice(from, start), mark: false });
		pieces.push({ text: text.slice(start, end), mark: true });
		from = end;
	}
	if (from < text.length) pieces.push({ text: text.slice(from), mark: false });
	return pieces;
}

/**
 * A window around the first term that matched, so a hit is recognisable without opening it. Found
 * by {@link matchRanges}, so `Munchen` centres on `München` and the window holds what
 * {@link highlight} marks. With no terms at all it is simply the opening of the fact, which is
 * what the page description uses it for.
 */
export function excerpt(text: string, terms: string[]): string {
	const from = Math.max(0, (matchRanges(text, terms)[0]?.[0] ?? 0) - 30);
	const to = Math.min(text.length, from + 140);
	let piece = text.slice(from, to);
	// Both ends land mid-word otherwise, and the snippet reads as noise: „… berschrift, ebenfalls“.
	if (from > 0) piece = piece.replace(/^\S+\s*/, '');
	if (to < text.length) piece = piece.replace(/\s*\S+$/, '');
	return (from > 0 ? '… ' : '') + piece.trim() + (to < text.length ? ' …' : '');
}

/**
 * The cells of one calendar month, Monday first. `month` is zero-based, like `Date`.
 *
 * `offset` is how many columns the 1st is indented by. `getDay()` counts from Sunday, so the
 * `+ 6` rotates the week onto the German start; without it every month is off by a day. `days`
 * holds one ISO date per day — day 0 of the following month is the last of this one, which is
 * also where February gets its leap day from rather than from a rule of its own.
 */
export function monthGrid(
	year: number,
	month: number
): { offset: number; days: readonly string[] } {
	return {
		offset: (new Date(year, month, 1).getDay() + 6) % 7,
		days: Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, i) =>
			toIsoDate(new Date(year, month, i + 1))
		)
	};
}
