import { describe, expect, it } from 'vitest';
import { createIndex, search } from './search.worker';

describe('search', () => {
	// The reason for the substring index: `zahn` once ranked every `…bahn` above `Zahnarzt`. The
	// first two facts are the same length, so BM25 cannot tell them apart by that.
	const mini = createIndex({
		'2026-01-01': ['Ein Zahnarzt kam.', ''],
		'2026-01-02': ['Ein Blauzahn kam.', ''],
		'2026-01-03': ['Eine Bahn kam.', ''],
		'2026-01-04': ['Eine Straßenbahn kam.', '']
	});
	const scores = (query: string, texts?: Record<string, [string, string]>) =>
		Object.fromEntries(
			search(texts ? createIndex(texts) : mini, query).map((hit) => [hit.id, hit.score])
		);

	it('scores a part the same wherever it sits in the word, and above a typo', () => {
		const zahn = scores('Zahn');
		expect(zahn['2026-01-01']).toBe(zahn['2026-01-02']);
		expect(zahn['2026-01-03']).toBeLessThan(zahn['2026-01-01']);
		expect(zahn['2026-01-04'] ?? 0).toBeLessThan(zahn['2026-01-01']);
	});

	// `Zahne` holds `zahn` and is also one typo from it; `Zahnes` only holds it. Both facts have the
	// same number of *distinct* words and stored parts, which is what MiniSearch counts as length,
	// so a typo adding to the real hit is all that could set them apart.
	it('never adds a typo to a part found in the same fact', () => {
		const zahn = scores('Zahn', {
			'2026-01-01': ['Zahne ein und mit vom', ''],
			'2026-01-02': ['Zahnes am im um an', '']
		});
		expect(zahn['2026-01-01']).toBe(zahn['2026-01-02']);
	});

	// The same fact twice over, with the word and its neighbour swapped between the prose and the
	// picture: everything BM25 counts is the same, so only the picture's weight can tell them apart.
	it('weighs a word in a picture below the same word in the prose', () => {
		const zahn = scores('Zahn', {
			'2026-01-01': ['Ein Zahnarzt.', 'Ein Mann.'],
			'2026-01-02': ['Ein Mann.', 'Ein Zahnarzt.']
		});
		expect(zahn['2026-01-02']).toBeLessThan(zahn['2026-01-01']);
	});
});
