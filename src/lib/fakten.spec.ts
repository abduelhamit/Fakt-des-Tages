import { describe, expect, it, vi } from 'vitest';
import { loadFakten, parseFakten, renderFakt, toIsoDate } from './fakten';

/** A `fetch` stand-in that always answers with the given body/status. */
const stubFetch = (body: string, init?: ResponseInit) =>
	vi.fn<typeof fetch>(async () => new Response(body, init));

describe('toIsoDate', () => {
	it('uses the local calendar day, not UTC', () => {
		// Checking both ends of the day catches a `toISOString()` implementation in *any* timezone:
		// east of UTC the 00:30 case slips to the previous day, west of it the 23:30 case slips to
		// the next one. In UTC itself both hold, and there is no bug to catch.
		expect(toIsoDate(new Date(2026, 7, 22, 0, 30))).toBe('2026-08-22');
		expect(toIsoDate(new Date(2026, 7, 22, 23, 30))).toBe('2026-08-22');
	});

	it('zero-pads single-digit months and days', () => {
		expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
	});
});

describe('parseFakten', () => {
	it('reads single-line and block-scalar entries', () => {
		const fakten = parseFakten(
			'2026-03-15: |\n  Ein **Fakt**.\n\n  Zweiter Absatz.\n2026-03-16: Kurz.\n'
		);
		expect([...fakten.keys()]).toEqual(['2026-03-15', '2026-03-16']);
		expect(fakten.get('2026-03-15')).toBe('Ein **Fakt**.\n\nZweiter Absatz.\n');
	});

	it('keeps date keys as strings under the default YAML 1.2 schema', () => {
		expect(parseFakten('2026-03-15: Ein Fakt.').has('2026-03-15')).toBe(true);
	});

	it('treats an empty file as no facts', () => {
		expect(parseFakten('').size).toBe(0);
	});

	it('accepts a real leap day', () => {
		expect(parseFakten('2024-02-29: Schalttag.').has('2024-02-29')).toBe(true);
	});

	it('rejects an HTML error page, which parses as a valid YAML string', () => {
		// The failure mode this guards: a 404 on GitHub Pages returns HTML, and YAML happily reads
		// it as a scalar instead of throwing, so a type check is the only thing that catches it.
		expect(() => parseFakten('<!DOCTYPE html><html><body>404</body></html>')).toThrow(
			/kein gültiges Format/
		);
	});

	it('rejects a duplicated date', () => {
		expect(() => parseFakten('2026-03-15: Erster\n2026-03-15: Zweiter\n')).toThrow(/fehlerhaft/);
	});

	it('names the offending key when a date is malformed', () => {
		expect(() => parseFakten('2026-3-15: Ein Fakt.')).toThrow(/2026-3-15/);
	});

	it('rejects a date that looks right but does not exist', () => {
		expect(() => parseFakten('2026-02-31: Ein Fakt.')).toThrow(/Ungültiges Datum/);
		expect(() => parseFakten('2026-02-29: Kein Schaltjahr.')).toThrow(/Ungültiges Datum/);
	});

	it('rejects an entry whose value is not text', () => {
		expect(() => parseFakten('2026-03-15:\n  fakt: verschachtelt\n')).toThrow(/kein Text/);
	});

	it('rejects an empty entry', () => {
		expect(() => parseFakten('2026-03-15: "   "')).toThrow(/leer/);
	});
});

describe('loadFakten', () => {
	it('requests the facts file resolved through $app/paths', async () => {
		const fetcher = stubFetch('2026-03-15: Ein Fakt.');
		await loadFakten(fetcher);
		// The base prefix is deliberately empty under vitest (see vite.config.ts), so this pins the
		// filename only; that the production URL carries the base is asserted in page.e2e.ts.
		expect(fetcher).toHaveBeenCalledExactlyOnceWith('/fakten.yaml');
	});

	it('surfaces a failed request in German with the status code', async () => {
		const fetcher = stubFetch('Not found', { status: 404 });
		await expect(loadFakten(fetcher)).rejects.toThrow(/nicht geladen werden \(HTTP 404\)/);
	});
});

describe('renderFakt', () => {
	it('renders CommonMark to HTML synchronously', () => {
		expect(renderFakt('Ein **Fakt** mit [Link](https://example.com).')).toContain(
			'<strong>Fakt</strong>'
		);
	});
});
