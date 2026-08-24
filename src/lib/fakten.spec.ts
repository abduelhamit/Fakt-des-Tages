import { describe, expect, it } from 'vitest';
import { isIsoDate, monatsRaster, suchbegriff, suchterme, toIsoDate, worte } from './fakten';

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

describe('isIsoDate', () => {
	// A trust boundary: it is what decides whether a location hash a visitor can type by hand gets
	// used as a date key.
	it('rejects anything that is not an exact calendar day', () => {
		expect(isIsoDate('2026-08-22')).toBe(true);
		expect(isIsoDate('2026-8-22')).toBe(false);
		expect(isIsoDate('2026-02-30')).toBe(false);
		expect(isIsoDate('heute')).toBe(false);
	});
});

describe('monatsRaster', () => {
	it('indents the 1st to its weekday column, counting from Monday', () => {
		// 1 August 2026 is a Saturday: sixth column, so five blanks before it.
		expect(monatsRaster(2026, 7).versatz).toBe(5);
		// A month starting on Sunday is the case a bare `getDay()` gets wrong — it would say 0.
		expect(monatsRaster(2026, 1).versatz).toBe(6);
	});

	it('covers the whole month, leap February included', () => {
		expect(monatsRaster(2026, 1).tage).toHaveLength(28);
		expect(monatsRaster(2028, 1).tage).toHaveLength(29);

		const august = monatsRaster(2026, 7).tage;
		expect(august[0]).toBe('2026-08-01');
		expect(august.at(-1)).toBe('2026-08-31');
	});
});

describe('suchbegriff', () => {
	it('folds case', () => {
		expect(suchbegriff('Fernsehturm')).toBe('fernsehturm');
	});

	// The whole reason this function exists: no tokeniser splits on a soft hyphen, so a prefix query
	// cannot reach past one. The e2e test pins the search behaviour; this pins the folding itself.
	it('removes the soft hyphens the archive is full of', () => {
		expect(suchbegriff('Flug\u00adhafen')).toBe('flughafen');
		expect(suchbegriff('voll\u00adst\u00e4ndig')).toBe('vollstandig');
	});

	// To the bare vowel, not `ae`: that is what lets a keyboard without umlauts reach the word.
	it('folds umlauts and sharp s', () => {
		expect(suchbegriff('T\u00fcrmen')).toBe('turmen');
		expect(suchbegriff('M\u00fcnchen')).toBe('munchen');
		expect(suchbegriff('Gr\u00f6\u00dfe')).toBe('grosse');
	});

	// `NFKD` costs nothing over a hand-written umlaut map and covers the rest of the archive's
	// names too — these are all real entries.
	it('folds the other diacritics the archive is full of', () => {
		expect(suchbegriff('\u00c9douard')).toBe('edouard');
		expect(suchbegriff('Sm\u00e5l\u00e4nder')).toBe('smalander');
		expect(suchbegriff('Florian\u00f3polis')).toBe('florianopolis');
		expect(suchbegriff('Hy\u014dgo')).toBe('hyogo');
	});

	// MiniSearch drops a term that comes back empty, which is what a lone hyphen deserves.
	it('empties a term that was nothing but a soft hyphen', () => {
		expect(suchbegriff('\u00ad')).toBe('');
	});
});

describe('worte', () => {
	it('splits on everything that is neither letter nor digit', () => {
		expect(worte('Heute vor 70 Jahren — der Fernsehturm!')).toEqual([
			'Heute',
			'vor',
			'70',
			'Jahren',
			'der',
			'Fernsehturm'
		]);
	});
});

describe('suchterme', () => {
	// The whole point: `turm` has to reach `Fernsehturm`, which prefix matching alone cannot do.
	it('emits every suffix down to the shortest query', () => {
		expect(suchterme('Turm')).toEqual(['Turm', 'urm']);
		expect(suchterme('Eiffelturm')).toContain('turm');
	});

	it('leaves a word shorter than the shortest query alone', () => {
		expect(suchterme('am')).toEqual([]);
		expect(suchterme('und')).toEqual(['und']);
	});
});
