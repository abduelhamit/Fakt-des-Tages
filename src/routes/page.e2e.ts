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

// The calendar is a pure function of the visitor's clock, so these pin the clock instead of hedging
// around it. Everything asserted below is stated relative to Saturday 22 August 2026 — a day that
// has a fact, sits between the July and September entries, and starts its month on a Saturday.
test.describe('Kalender', () => {
	test.use({ timezoneId: 'Europe/Berlin' });

	test.beforeEach(async ({ page }) => {
		await page.clock.setFixedTime(new Date('2026-08-22T10:00:00Z'));
	});

	test('öffnet auf heute', async ({ page }) => {
		await page.goto('/Fakt-des-Tages/');

		await expect(page.getByText('22. August 2026', { exact: true })).toBeVisible();
		await expect(page.getByRole('heading', { level: 2 })).toHaveText('August 2026');
		await expect(page.getByRole('article')).toContainText('fetter');
	});

	test('ein Klick tauscht den Fakt und legt ihn in die Adresszeile', async ({ page }) => {
		await page.goto('/Fakt-des-Tages/');

		await page.getByRole('button', { name: 'Donnerstag, 20. August 2026' }).click();

		await expect(page.getByText('20. August 2026', { exact: true })).toBeVisible();
		await expect(page.getByRole('article')).toContainText('kurzer Fakt, einzeilig');
		expect(page.url()).toContain('#2026-08-20');
		// The selection is named in the accessible name, since a plain button has no ARIA state that
		// fits a single-select set — `aria-pressed` would claim toggle semantics this does not have.
		await expect(
			page.getByRole('button', { name: 'Donnerstag, 20. August 2026 (angezeigt)' })
		).toBeVisible();

		// The hash is the only selection state, so the back button has to undo the click.
		await page.goBack();
		await expect(page.getByText('22. August 2026', { exact: true })).toBeVisible();
	});

	test('folgt einem geteilten Link auf einen anderen Monat', async ({ page }) => {
		await page.goto('/Fakt-des-Tages/#2026-07-30');

		await expect(page.getByText('30. Juli 2026', { exact: true })).toBeVisible();
		await expect(page.getByRole('heading', { level: 2 })).toHaveText('Juli 2026');
	});

	test('versteht einen unterwegs kodierten Link', async ({ page }) => {
		// Nothing here writes `%2D`, but a link can pick it up on its way through a chat client.
		await page.goto('/Fakt-des-Tages/#2026%2D07%2D30');

		await expect(page.getByText('30. Juli 2026', { exact: true })).toBeVisible();
	});

	// One test per hash rather than a loop in one: changing only the fragment of a page already open
	// is a same-document navigation, so a handler that throws leaves the previous selection standing
	// and the assertion still passes. Only a first load has nothing to fall back on. `#%` is the
	// interesting case — it is what `decodeURIComponent` chokes on.
	for (const hash of ['#kaputt', '#2026-02-30', '#%']) {
		test(`fällt bei „${hash}“ in der Adresszeile auf heute zurück`, async ({ page }) => {
			await page.goto(`/Fakt-des-Tages/${hash}`);
			await expect(page.getByText('22. August 2026', { exact: true })).toBeVisible();
		});
	}

	test('macht Tage ohne Fakt nicht anklickbar', async ({ page }) => {
		await page.goto('/Fakt-des-Tages/');

		// 21 August 2026 has no entry and is not today, so it renders as plain text.
		await expect(page.getByRole('button', { name: 'Freitag, 21. August 2026' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Samstag, 22. August 2026' })).toBeVisible();
	});

	// The one place the rule "no fact, no interaction" is broken on purpose: today is the cell a
	// visitor navigates back to, so it stays pressable even on a day the archive skips.
	test('lässt heute anklickbar, auch ohne eigenen Fakt', async ({ page }) => {
		await page.clock.setFixedTime(new Date('2026-08-21T10:00:00Z'));
		await page.goto('/Fakt-des-Tages/');

		await expect(page.getByText('Für heute gibt es keinen Fakt.')).toBeVisible();

		await page.getByRole('button', { name: 'Sonntag, 23. August 2026' }).click();
		await page.getByRole('button', { name: 'Freitag, 21. August 2026' }).click();
		await expect(page.getByText('21. August 2026', { exact: true })).toBeVisible();
	});

	// A month grid is four to six rows deep depending on where the 1st falls, so without a reserved
	// height everything under the calendar shifts as the visitor pages through months.
	test('lässt den Inhalt unter dem Kalender an seinem Platz', async ({ page }) => {
		const kanten: number[] = [];
		// Four rows (February 2027 starts on a Monday and is exactly four weeks), five, and six —
		// the full range a month can take.
		for (const hash of ['#2027-02-01', '#2026-07-01', '#2026-08-01']) {
			await page.goto(`/Fakt-des-Tages/${hash}`);
			const datumszeile = page.getByText(/^\d{1,2}\. \p{L}+ \d{4}$/u);
			await expect(datumszeile).toBeVisible();
			kanten.push((await datumszeile.boundingBox())!.y);
		}
		expect(new Set(kanten).size, `Oberkanten: ${kanten.join(', ')}`).toBe(1);
	});

	test('begrenzt die Pfeile auf die Monate mit Fakten', async ({ page }) => {
		await page.goto('/Fakt-des-Tages/');

		const vor = page.getByRole('button', { name: 'Nächster Monat' });
		const zurueck = page.getByRole('button', { name: 'Vorheriger Monat' });

		const monatsName = page.getByRole('heading', { level: 2 });

		await vor.click();
		await expect(monatsName).toHaveText('September 2026');
		// September holds the last entry, so there is nothing further forward to reach.
		await expect(vor).toHaveAttribute('aria-disabled', 'true');
		// `aria-disabled` and not the native attribute: a natively disabled button loses focus the
		// moment it is disabled, which strands the keyboard user who just pressed it.
		await expect(vor).toBeFocused();
		// Focusable but inert. `force` is needed because Playwright honours `aria-disabled` in its
		// actionability check and would otherwise refuse the click — which is itself the assertion
		// that the attribute reaches tooling. What is under test here is the guard in `verschiebe`.
		await vor.click({ force: true });
		await expect(monatsName).toHaveText('September 2026');

		await zurueck.click();
		await zurueck.click();
		await expect(monatsName).toHaveText('Juli 2026');
		await expect(zurueck).toHaveAttribute('aria-disabled', 'true');
		await expect(zurueck).toBeFocused();

		// Moving the month must not move the selection — the fact still belongs to today.
		await expect(page.getByText('22. August 2026', { exact: true })).toBeVisible();
	});
});
