/**
 * A fact rendered to HTML. Branded so it is not interchangeable with the CommonMark it came from:
 * without this, dropping the render step from the build-time load would still type-check and feed
 * raw Markdown into `{@html}`. The brand exists only at compile time — at runtime it is a string.
 */
export type FaktHtml = string & { readonly __faktHtml: true };

/** ISO date (`2026-08-22`) → that day's fact, rendered. */
export type Fakten = Map<string, FaktHtml>;

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
export function isIsoDate(wert: string): boolean {
	return toIsoDate(fromIsoDate(wert)) === wert;
}

/**
 * The cells of one calendar month, Monday first. `monat` is zero-based, like `Date`.
 *
 * `versatz` is how many columns the 1st is indented by. `getDay()` counts from Sunday, so the
 * `+ 6` rotates the week onto the German start; without it every month is off by a day. `tage`
 * holds one ISO date per day — day 0 of the following month is the last of this one, which is
 * also where February gets its leap day from rather than from a rule of its own.
 */
export function monatsRaster(
	jahr: number,
	monat: number
): { versatz: number; tage: readonly string[] } {
	return {
		versatz: (new Date(jahr, monat, 1).getDay() + 6) % 7,
		tage: Array.from({ length: new Date(jahr, monat + 1, 0).getDate() }, (_, i) =>
			toIsoDate(new Date(jahr, monat, i + 1))
		)
	};
}
