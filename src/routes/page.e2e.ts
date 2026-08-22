import { expect, test } from '@playwright/test';

// Deliberately says nothing about *which* fact is shown: static/fakten.yaml has gaps, so asserting
// today's text would start failing on the first day without an entry.
test('lädt die Fakten über den Basispfad und rendert ohne Fehler', async ({ page }) => {
	const faktenAntwort = page.waitForResponse((res) => res.url().endsWith('/fakten.yaml'));

	await page.goto('/Fakt-des-Tages/');

	// The fetch has to go through the project subpath — this is what `asset()` buys us, and the
	// unit tests cannot see it because the base path is empty under vitest.
	const antwort = await faktenAntwort;
	expect(antwort.url()).toContain('/Fakt-des-Tages/fakten.yaml');
	expect(antwort.status()).toBe(200);

	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Fakt des Tages');

	// A bad path or unparsable YAML would leave the German error state on screen instead.
	await expect(page.getByText('Fakten werden geladen …')).toHaveCount(0);
	await expect(page.getByRole('alert')).toHaveCount(0);
});
