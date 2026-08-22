import { expect, test } from '@playwright/test';

// Deliberately says nothing about *which* fact is shown: src/lib/fakten.yaml has gaps, so asserting
// today's text would start failing on the first day without an entry.
test('rendert den Fakt ohne Laufzeit-Fetch', async ({ page }) => {
	const anfragen: string[] = [];
	page.on('request', (req) => anfragen.push(req.url()));

	await page.goto('/Fakt-des-Tages/');

	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Fakt des Tages');

	// The date line appears only once hydration has read the visitor's clock, so waiting for it is
	// how we know the client-side half ran at all.
	await expect(page.getByText(/^\d{1,2}\. \p{L}+ \d{4}$/u)).toBeVisible();

	// The prerendered placeholder must be gone once hydration has run.
	await expect(page.getByText('Fakten werden geladen …')).toHaveCount(0);

	// The whole point of the SSG rewrite: the facts are baked into the page.
	expect(anfragen.filter((url) => url.endsWith('.yaml'))).toEqual([]);
});
