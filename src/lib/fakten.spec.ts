import { describe, expect, it } from 'vitest';
import { isIsoDate, monatsRaster, toIsoDate } from './fakten';

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
	// Now a trust boundary: it is what decides whether a location hash a visitor can type by hand
	// gets used as a date key.
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
