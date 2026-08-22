import { describe, expect, it } from 'vitest';
import { toIsoDate } from './fakten';

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
