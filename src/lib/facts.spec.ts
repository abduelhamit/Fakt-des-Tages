import { describe, expect, it } from 'vitest';
import { foldTerm, indexTerms, isIsoDate, monthGrid, toIsoDate, words } from './facts';

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
	// A trust boundary: on the pages served for a day without a fact, it is what decides whether an
	// address a visitor can type by hand gets read as a date.
	it('rejects anything that is not an exact calendar day', () => {
		expect(isIsoDate('2026-08-22')).toBe(true);
		expect(isIsoDate('2026-8-22')).toBe(false);
		expect(isIsoDate('2026-02-30')).toBe(false);
		expect(isIsoDate('heute')).toBe(false);
	});
});

describe('monthGrid', () => {
	it('indents the 1st to its weekday column, counting from Monday', () => {
		// 1 August 2026 is a Saturday: sixth column, so five blanks before it.
		expect(monthGrid(2026, 7).offset).toBe(5);
		// A month starting on Sunday is the case a bare `getDay()` gets wrong — it would say 0.
		expect(monthGrid(2026, 1).offset).toBe(6);
	});

	it('covers the whole month, leap February included', () => {
		expect(monthGrid(2026, 1).days).toHaveLength(28);
		expect(monthGrid(2028, 1).days).toHaveLength(29);

		const august = monthGrid(2026, 7).days;
		expect(august[0]).toBe('2026-08-01');
		expect(august.at(-1)).toBe('2026-08-31');
	});
});

describe('foldTerm', () => {
	it('folds case', () => {
		expect(foldTerm('Fernsehturm')).toBe('fernsehturm');
	});

	// To the bare vowel, not `ae`: that is what lets a keyboard without umlauts reach the word.
	it('folds umlauts and sharp s', () => {
		expect(foldTerm('T\u00fcrmen')).toBe('turmen');
		expect(foldTerm('M\u00fcnchen')).toBe('munchen');
		expect(foldTerm('Gr\u00f6\u00dfe')).toBe('grosse');
	});

	// `NFKD` costs nothing over a hand-written umlaut map and covers the rest of the archive's
	// names too — these are all real entries.
	it('folds the other diacritics the archive is full of', () => {
		expect(foldTerm('\u00c9douard')).toBe('edouard');
		expect(foldTerm('Sm\u00e5l\u00e4nder')).toBe('smalander');
		expect(foldTerm('Florian\u00f3polis')).toBe('florianopolis');
		expect(foldTerm('Hy\u014dgo')).toBe('hyogo');
	});
});

describe('words', () => {
	it('splits on everything that is neither letter nor digit', () => {
		expect(words('Heute vor 70 Jahren — der Fernsehturm!')).toEqual([
			'Heute',
			'vor',
			'70',
			'Jahren',
			'der',
			'Fernsehturm'
		]);
	});
});

describe('indexTerms', () => {
	// The whole point: `turm` has to reach `Fernsehturm`, which prefix matching alone cannot do.
	it('emits every suffix down to the shortest query', () => {
		expect(indexTerms('Turm')).toEqual(['Turm', 'urm']);
		expect(indexTerms('Eiffelturm')).toContain('turm');
	});

	it('leaves a word shorter than the shortest query alone', () => {
		expect(indexTerms('am')).toEqual([]);
		expect(indexTerms('und')).toEqual(['und']);
	});
});
