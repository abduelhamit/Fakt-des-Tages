/**
 * ISO date (`2026-08-22`) → that day's fact.
 *
 * The value is CommonMark as authored, and HTML once the build-time load in
 * `src/routes/+page.server.ts` has rendered it.
 */
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
