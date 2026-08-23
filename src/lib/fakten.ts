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
