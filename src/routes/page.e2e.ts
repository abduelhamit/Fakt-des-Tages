import { expect, test, type Page } from '@playwright/test';

// Shared by every pinned suite below, so they cannot drift apart: a Saturday the fixture gives a
// fact, sitting between its July and September entries, in a month that starts on a Saturday.
const HEUTE = new Date('2026-08-22T10:00:00Z');

// Where the date bar comes to rest: the height of everything above it in one number. Always read it
// before scrolling — on a *stuck* sticky element `offsetTop` reports the scroll position instead.
const leistenkante = (seite: Page) =>
	seite
		.getByRole('button', { name: 'Vorheriger Fakt' })
		.evaluate((el) => (el.parentElement as HTMLElement).offsetTop);

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

	await expect(page.getByText('Fakten werden geladen …')).toHaveCount(0);

	// The whole point of the SSG rewrite: the facts are baked into the page.
	expect(anfragen.filter((url) => url.endsWith('.yaml'))).toEqual([]);
});

// Everything below runs against src/lib/fakten.probe.yaml, not the site's real content — see the
// `FAKTEN_PROBE` note in vite.config.ts. Dates may therefore be named outright, and the clock is
// pinned to `HEUTE`.
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

	// Pins the six reserved rows on the calendar grid in +page.svelte: without them everything below
	// the calendar shifts as the visitor pages through the months.
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
		// Still focused, which is what `aria-disabled` buys over the native attribute — see `verschiebe`.
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

		// Read at rest: measured after scrolling it would compare a number with itself and pass no
		// matter what the code does.
		const klebepunkt = await leistenkante(page);
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

	// The bar has to reach the edges of the viewport, not just the text column — see the iOS section
	// in CLAUDE.md. Chromium cannot see the Safari behaviour that depends on it, so this pins the
	// geometry instead: the bar's `-mx-6` cancels `main`'s `p-6`, making it exactly as wide as
	// `main`'s border box. Drop `-mx-6` and it comes out 48px narrower.
	test('zieht die Datumsleiste über die volle Breite', async ({ page }) => {
		await page.goto('/Fakt-des-Tages/#2026-08-23');
		await expect(page.getByText('23. August 2026', { exact: true })).toBeVisible();

		const breiten = await page.getByRole('button', { name: 'Vorheriger Fakt' }).evaluate((el) => ({
			leiste: (el.parentElement as HTMLElement).getBoundingClientRect().width,
			main: el.closest('main')!.getBoundingClientRect().width
		}));
		expect(breiten.leiste).toBe(breiten.main);
	});

	// `#2026-07-30` is the fixture's first entry, so back is bounded and on is not. The day button is
	// not along for the ride: it is the only one of the three that fails if the rule is ever narrowed
	// to the bar, verified by mutation — put the cursor on `pfeil` alone and both arrows still pass.
	test('zeigt die Hand nur über dem, was auch etwas tut', async ({ page }) => {
		await page.goto('/Fakt-des-Tages/#2026-07-30');
		await expect(page.getByText('30. Juli 2026', { exact: true })).toBeVisible();

		const zeiger = (name: string) =>
			page.getByRole('button', { name }).evaluate((el) => getComputedStyle(el).cursor);

		expect(await zeiger('Nächster Fakt')).toBe('pointer');
		expect(await zeiger('30. Juli 2026')).toBe('pointer');
		expect(await zeiger('Vorheriger Fakt')).toBe('default');
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

// The prerendered page: what every visitor sees for the moment before hydration, and what someone
// browsing without JavaScript keeps for good. It stands in for the finished page without naming a
// single date, because the build's clock is not the visitor's.
test.describe('Ladezustand', () => {
	test.use({ timezoneId: 'Europe/Berlin' });

	test('steht schon vor der Hydration in seiner endgültigen Größe da', async ({
		page,
		browser,
		baseURL
	}) => {
		await page.clock.setFixedTime(HEUTE);
		await page.goto('/Fakt-des-Tages/');
		await expect(page.getByText('22. August 2026', { exact: true })).toBeVisible();
		await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
		const fertig = await leistenkante(page);

		// Hydration is far too quick to catch mid-flight, so the placeholder is held still by taking
		// JavaScript away entirely.
		const ohneJs = await browser.newContext({ javaScriptEnabled: false, baseURL });
		const platzhalter = await ohneJs.newPage();
		await platzhalter.goto('/Fakt-des-Tages/');

		await expect(platzhalter.getByText('Fakten werden geladen …')).toBeVisible();
		// The whole of `main` is provisional here, not just the line that says so.
		await expect(platzhalter.locator('main')).toHaveAttribute('aria-busy', 'true');
		// Nothing may look actionable yet: with no month and no selection there is nowhere to go, which
		// is why the month arrows test `!monat` and not only their month bound. Either mechanism
		// counts — the heading uses native `disabled`, since its bound only flips at hydration.
		await expect(
			platzhalter.locator('button:not([aria-disabled="true"]):not(:disabled)')
		).toHaveCount(0);
		// And nothing may offer the hand either. The heading is bounded the native way, which the
		// cursor rule has to exclude as well as the aria one.
		expect(
			await platzhalter.locator('h1 button').evaluate((el) => getComputedStyle(el).cursor)
		).toBe('default');
		// Not one digit inside `main`: no date, no day number, nothing carried over from the build's
		// clock — which is the whole reason the clock is only read in `onMount`.
		await expect(platzhalter.locator('main').getByText(/\d/)).toHaveCount(0);
		// Six full rows of stand-in days, sized like real ones, so the calendar cannot change height
		// under the visitor the moment the actual month arrives.
		expect(await leistenkante(platzhalter)).toBe(fertig);

		await ohneJs.close();
	});
});

// The fixture's entries all begin "Testdaten", so these queries deliberately name the words that
// tell them apart. The 26th carries a soft hyphen inside "Hintergrund" — see the note in
// fakten.probe.yaml — which is the case the whole `suchbegriff` helper exists for.
test.describe('Suche', () => {
	test.use({ timezoneId: 'Europe/Berlin' });

	test.beforeEach(async ({ page }) => {
		await page.clock.setFixedTime(HEUTE);
		await page.goto('/Fakt-des-Tages/');
		await expect(page.getByText('22. August 2026', { exact: true })).toBeVisible();
	});

	test('findet einen Fakt trotz Tippfehler und öffnet ihn', async ({ page }) => {
		// "einzeilig" with the second i missing: one edit away, which is what fuzzy has to absorb.
		await page.getByLabel('Fakt suchen').fill('einzeilg');

		await expect(page.getByRole('status')).toHaveText('1 Treffer');
		// Scoped to the `search` landmark: the calendar has a button for that date too, and its
		// `aria-label` carries the same words.
		const treffer = page.getByRole('search').getByRole('button', { name: /20\. August 2026/ });
		await expect(treffer).toContainText('einzeilig');

		await treffer.click();
		expect(page.url()).toContain('#2026-08-20');
		await expect(page.getByRole('article')).toContainText('kurzer Fakt, einzeilig');
		// Picking a hit empties the box, which is what closes the list.
		await expect(page.getByRole('status')).toHaveText('');
	});

	// Deliberately a *part* of the word. The whole word would pass even without `suchbegriff`, since
	// fuzzy matching swallows the hidden character as one insertion — verified, that mutation went
	// green. Prefix matching cannot cross it, and mid-word is where every keystroke but the last is.
	test('sieht durch die weichen Trennzeichen hindurch', async ({ page }) => {
		await page.getByLabel('Fakt suchen').fill('Hinterg');

		await expect(page.getByRole('status')).toHaveText('1 Treffer');
		await expect(
			page.getByRole('search').getByRole('button', { name: /26\. August 2026/ })
		).toBeVisible();
	});

	// The index is built from the rendered HTML, so the tags and the hrefs must not be in it. Search
	// the HTML instead of its text and both of these come back with a hit.
	for (const wort of ['strong', 'example']) {
		test(`findet „${wort}“ nicht, weil nur der Text im Index steht`, async ({ page }) => {
			await page.getByLabel('Fakt suchen').fill(wort);
			await expect(page.getByRole('status')).toHaveText('Keine Treffer');
		});
	}

	// The suffix index in `suchterme`, end to end. „Bildschirmhöhe“ is in the 23rd and the bare word
	// is nowhere in the fixture: without the suffix index this query finds nothing at all.
	test('findet ein Wort mitten in einem zusammengesetzten Wort', async ({ page }) => {
		await page.getByLabel('Fakt suchen').fill('schirm');

		await expect(page.getByRole('status')).toHaveText('1 Treffer');
		await expect(
			page.getByRole('search').getByRole('button', { name: /23\. August 2026/ })
		).toBeVisible();
	});

	// `textContent` drops `alt` attributes — see `nurText` for what that quietly cost the real
	// archive. The fixture's only image carries this word and nothing else does.
	test('durchsucht auch die Alt-Texte der Bilder', async ({ page }) => {
		await page.getByLabel('Fakt suchen').fill('Wasserspeier');

		await expect(page.getByRole('status')).toHaveText('1 Treffer');
		await expect(
			page.getByRole('search').getByRole('button', { name: /31\. August 2026/ })
		).toBeVisible();
	});

	test('hält sich zurück, solange die Eingabe zu kurz ist', async ({ page }) => {
		await page.getByLabel('Fakt suchen').fill('ei');
		await expect(page.getByRole('status')).toHaveText('');
	});

	// The whole reason the hit list is laid over the page instead of pushed into it.
	test('schiebt den Kalender nicht weg', async ({ page }) => {
		const kalender = page.getByRole('heading', { level: 2 });
		// `evaluate` and not `boundingBox()`, which scrolls the element into view before measuring.
		const oben = () => kalender.evaluate((el) => el.getBoundingClientRect().top);
		const vorher = await oben();

		await page.getByLabel('Fakt suchen').fill('lang');
		await expect(page.getByRole('status')).toHaveText('2 Treffer');
		expect(await oben()).toBe(vorher);

		// Escape puts the calendar back, since the panel is now sitting on top of it.
		await page.getByLabel('Fakt suchen').press('Escape');
		await expect(page.getByRole('status')).toHaveText('');
		expect(await oben()).toBe(vorher);
	});
});

// The die is stubbed so the pick is deterministic. Pinned to 2026-08-22, the fixture's other six
// facts are the candidates and 0.3 lands on the second of them. Without the "never the fact already
// on screen" filter the same 0.3 would land on 2026-08-22 itself, so this pins the filter as much as
// the jump.
test.describe('Zufälliger Fakt', () => {
	test.use({ timezoneId: 'Europe/Berlin' });

	test('springt auf einen anderen Fakt', async ({ page }) => {
		await page.clock.setFixedTime(HEUTE);
		await page.addInitScript(() => {
			Math.random = () => 0.3;
		});
		await page.goto('/Fakt-des-Tages/');
		await expect(page.getByText('22. August 2026', { exact: true })).toBeVisible();

		await page.getByRole('button', { name: 'Zufälliger Fakt' }).click();

		await expect(page.getByText('20. August 2026', { exact: true })).toBeVisible();
		expect(page.url()).toContain('#2026-08-20');
		await expect(page.getByRole('article')).toContainText('kurzer Fakt, einzeilig');
	});
});

// An absent hash already means today, so the title is the way back to both at once.
test.describe('Überschrift', () => {
	test.use({ timezoneId: 'Europe/Berlin' });

	test.beforeEach(async ({ page }) => {
		await page.clock.setFixedTime(HEUTE);
	});

	test('entfernt den Hash und zeigt wieder heute', async ({ page }) => {
		await page.goto('/Fakt-des-Tages/#2026-07-30');
		await expect(page.getByText('30. Juli 2026', { exact: true })).toBeVisible();

		await page.getByRole('button', { name: 'Fakt des Tages' }).click();

		// Both halves matter: a plain link cleans the URL but leaves the page on the old fact, since
		// SvelteKit routes the click without firing `hashchange`. Measured — that is why this is a
		// button and not an anchor.
		// On the raw URL, not `new URL(...).hash`: that reports `''` for a trailing bare `#` too, so
		// it cannot tell `pushState` from `location.hash = ''`. Verified — the weaker assertion
		// passed with the mutation in place.
		expect(page.url()).not.toContain('#');
		await expect(page.getByText('22. August 2026', { exact: true })).toBeVisible();

		// Pushed, not replaced, so the way back is the same as after clicking a day in the calendar.
		// Both directions are checked: `pushState` fires no event of its own, but traversing into or
		// out of that entry always changes the fragment, so the existing `hashchange` listener sees
		// it. Measured — two events, one per direction — rather than assumed.
		await page.goBack();
		await expect(page.getByText('30. Juli 2026', { exact: true })).toBeVisible();
		await page.goForward();
		await expect(page.getByText('22. August 2026', { exact: true })).toBeVisible();
		expect(page.url()).not.toContain('#');
	});

	// Without the early return this would stack a history entry pointing at the identical URL, and
	// the back button would look dead.
	test('legt ohne Hash keinen Verlaufseintrag an', async ({ page }) => {
		await page.goto('/Fakt-des-Tages/#2026-07-30');
		await page.getByRole('button', { name: 'Fakt des Tages' }).click();
		await expect(page.getByText('22. August 2026', { exact: true })).toBeVisible();

		await page.getByRole('button', { name: 'Fakt des Tages' }).click();
		await page.getByRole('button', { name: 'Fakt des Tages' }).click();

		await page.goBack();
		await expect(page.getByText('30. Juli 2026', { exact: true })).toBeVisible();
	});
});
