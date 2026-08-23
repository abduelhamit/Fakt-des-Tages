import { expect, test } from '@playwright/test';

// Shared by both pinned suites below, so the two cannot drift apart: a Saturday the fixture gives a
// fact, sitting between its July and September entries, in a month that starts on a Saturday.
const HEUTE = new Date('2026-08-22T10:00:00Z');

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

// Everything below runs against src/lib/fakten.probe.yaml, not the site's real content — see the
// `FAKTEN_PROBE` note in vite.config.ts. Dates may therefore be named outright. The clock is pinned
// to Saturday 22 August 2026: a day the fixture gives a fact, sitting between its July and
// September entries, in a month that starts on a Saturday.
test.describe('Kalender', () => {
	test.use({ timezoneId: 'Europe/Berlin' });

	test.beforeEach(async ({ page }) => {
		await page.clock.setFixedTime(HEUTE);
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

// The fixture holds 2026-07-30, -08-20, -08-22, -08-23, -08-26, -08-31 and 2026-09-02. The gaps
// between them are the point: these arrows step from fact to fact, not from day to day.
test.describe('Faktenpfeile', () => {
	test.use({ timezoneId: 'Europe/Berlin' });

	test.beforeEach(async ({ page }) => {
		await page.clock.setFixedTime(HEUTE);
	});

	test('überspringt die Tage ohne Fakt', async ({ page }) => {
		await page.goto('/Fakt-des-Tages/#2026-08-23');

		await page.getByRole('button', { name: 'Nächster Fakt' }).click();

		// The 24th and 25th are empty in the fixture, so the next fact is the 26th.
		await expect(page.getByText('26. August 2026', { exact: true })).toBeVisible();
		await expect(page.getByRole('article')).toContainText('Zwischenüberschrift');
	});

	test('nimmt den Kalender in den Nachbarmonat mit', async ({ page }) => {
		await page.goto('/Fakt-des-Tages/#2026-08-20');

		await page.getByRole('button', { name: 'Vorheriger Fakt' }).click();

		await expect(page.getByText('30. Juli 2026', { exact: true })).toBeVisible();
		await expect(page.getByRole('heading', { level: 2 })).toHaveText('Juli 2026');
	});

	test('führt auch von einem Tag ohne Fakt weiter', async ({ page }) => {
		await page.goto('/Fakt-des-Tages/#2026-08-21');
		await expect(page.getByText('Für diesen Tag gibt es keinen Fakt.')).toBeVisible();

		await page.getByRole('button', { name: 'Nächster Fakt' }).click();
		await expect(page.getByText('22. August 2026', { exact: true })).toBeVisible();

		await page.goBack();
		await page.getByRole('button', { name: 'Vorheriger Fakt' }).click();
		await expect(page.getByText('20. August 2026', { exact: true })).toBeVisible();
	});

	for (const [hash, name, datum] of [
		['#2026-07-30', 'Vorheriger Fakt', '30. Juli 2026'],
		['#2026-09-02', 'Nächster Fakt', '2. September 2026']
	]) {
		test(`sperrt „${name}“ am Rand des Archivs`, async ({ page }) => {
			await page.goto(`/Fakt-des-Tages/${hash}`);

			const pfeil = page.getByRole('button', { name });
			await expect(pfeil).toHaveAttribute('aria-disabled', 'true');

			// Inert but still focusable, like the month arrows — see the guard in `springe`.
			await pfeil.click({ force: true });
			await expect(page.getByText(datum, { exact: true })).toBeVisible();
		});
	}

	// Both halves matter: it must move up when the bar has pinned, and stay put when it has not.
	// An unconditional scroll would shove the calendar off screen for someone reading from the top.
	test('holt den Anfang des Fakts zurück, wenn die Leiste klebt', async ({ page }) => {
		await page.goto('/Fakt-des-Tages/#2026-08-23');
		await expect(page.getByText('23. August 2026', { exact: true })).toBeVisible();

		// Read at rest, and that is the whole trick: `offsetTop` on a stuck sticky element returns
		// the scroll position, so measuring after scrolling would compare a number with itself and
		// pass no matter what the code does.
		const klebepunkt = await page
			.getByRole('button', { name: 'Vorheriger Fakt' })
			.evaluate((el) => (el.parentElement as HTMLElement).offsetTop);
		expect(klebepunkt).toBeGreaterThan(0);

		await page.evaluate(() => window.scrollTo(0, 99999));
		expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(klebepunkt);

		await page.getByRole('button', { name: 'Nächster Fakt' }).click();
		await expect(page.getByText('26. August 2026', { exact: true })).toBeVisible();

		expect(await page.evaluate(() => window.scrollY)).toBe(klebepunkt);
	});

	test('lässt die Seite in Ruhe, wenn noch nichts klebt', async ({ page }) => {
		await page.goto('/Fakt-des-Tages/#2026-08-23');
		await expect(page.getByText('23. August 2026', { exact: true })).toBeVisible();

		await page.getByRole('button', { name: 'Nächster Fakt' }).click();
		await expect(page.getByText('26. August 2026', { exact: true })).toBeVisible();

		// Still at the top, with the calendar in view — not pushed down to the bar's offset.
		expect(await page.evaluate(() => window.scrollY)).toBe(0);
	});

	// Runs at the default viewport, which only works because the fixture's 2026-08-23 is deliberately
	// long. Shorten that entry and this test keeps passing while proving nothing.
	test('hält die Datumsleiste beim Scrollen in Sichtweite', async ({ page }) => {
		await page.goto('/Fakt-des-Tages/#2026-08-23');
		// Wait for hydration before scrolling: the calendar only renders then, and measuring against
		// a page that is still growing underneath makes this test flaky rather than wrong.
		await expect(page.getByText('23. August 2026', { exact: true })).toBeVisible();

		await page.evaluate(() => window.scrollTo(0, 99999));
		expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

		// `locator.evaluate` and not `boundingBox()`: the latter scrolls the element into view before
		// measuring, which is the very effect under test — it made an earlier version of this test
		// pass with `sticky` removed. Pinned, the bar's contents sit at its `pt-2`; without `sticky`
		// they ride up with the text and measure negative.
		const oben = await page
			.getByRole('button', { name: 'Vorheriger Fakt' })
			.evaluate((el) => el.getBoundingClientRect().top);
		expect(oben).toBe(8);
	});
});
