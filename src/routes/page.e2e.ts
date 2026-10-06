import { expect, test, type Page } from '@playwright/test';

// Shared by every pinned suite below, so they cannot drift apart: a Saturday the fixture gives a
// fact, sitting between its July and September entries, in a month that starts on a Saturday.
const TODAY = new Date('2026-08-22T10:00:00Z');
// A Friday the fixture has no fact for, between two that it has.
const FACTLESS_DAY = new Date('2026-08-21T10:00:00Z');

// Where the date bar comes to rest: the height of everything above it in one number. Always read it
// before scrolling — on a *stuck* sticky element `offsetTop` reports the scroll position instead.
const barRestingTop = (page: Page) =>
	page
		.getByRole('link', { name: 'Vorheriger Fakt' })
		.evaluate((el) => (el.parentElement as HTMLElement).offsetTop);

// Deliberately says nothing about *which* fact is shown: on a clock nobody chose, `/` may land on
// a fact or on a day without one, and both have to work.
test('shows today on the visitor’s own clock, without fetching the facts', async ({ page }) => {
	const requests: string[] = [];
	page.on('request', (req) => requests.push(req.url()));

	await page.goto('/Fakt-des-Tages/');

	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Fakt des Tages');
	// Whichever way the head script went, the address bar now names a day, and the date line
	// appears only once hydration has read the clock — so this is how we know both halves ran.
	await expect(page).toHaveURL(/\/Fakt-des-Tages\/\d{4}-\d\d-\d\d$/);
	await expect(page.getByText(/^\d{1,2}\. \p{L}+ \d{4}$/u)).toBeVisible();

	// The whole point of the build-time pipeline: the facts file never reaches the browser, and the
	// search text is fetched only by someone who searches.
	expect(requests.filter((url) => url.endsWith('.yaml'))).toEqual([]);
	expect(requests.filter((url) => url.includes('search.json'))).toEqual([]);
	await page.getByLabel('Fakt suchen').focus();
	await expect.poll(() => requests.filter((url) => url.includes('search.json'))).toHaveLength(1);
});

// Everything below runs against src/lib/facts.probe.yaml, not the site's real content — see the
// `FACTS_PROBE` note in vite.config.ts. Dates may therefore be named outright, and the clock is
// pinned to `TODAY`.
test.describe('home page', () => {
	test.use({ timezoneId: 'Europe/Berlin' });

	test('sends a day with a fact to its own page, replacing itself', async ({ page }) => {
		await page.clock.setFixedTime(TODAY);
		await page.goto('/Fakt-des-Tages/');

		await expect(page).toHaveURL(/\/Fakt-des-Tages\/2026-08-22$/);
		await expect(page.getByText('22. August 2026', { exact: true })).toBeVisible();
		await expect(page.getByRole('heading', { level: 2 })).toHaveText('August 2026');
		await expect(page.getByRole('article')).toContainText('fetter');

		// Back must leave the site, not land on `/` and be sent straight forward again. This pins the
		// behaviour rather than the call: a navigation that starts before the page has finished
		// loading replaces the entry whichever way it is written, so `location.assign` passes too.
		await page.goBack();
		expect(page.url()).toBe('about:blank');
	});

	// The accepted limitation, asserted so the hiding cannot quietly go: with the app's JavaScript
	// failing to load, a page without a fact of its own stays empty rather than show a stand-in month.
	// The clock names a day without a fact, because on a day with one `/` never gets this far: the
	// browser stops parsing at the head script's redirect. A fact page is complete as prerendered,
	// so it does not hide.
	test('stays hidden until hydration on a page without a fact', async ({ page }) => {
		await page.clock.setFixedTime(FACTLESS_DAY);
		await page.route('**/_app/immutable/**/*.js', (route) => route.abort());

		for (const path of ['', '2026-08-21']) {
			await page.goto(`/Fakt-des-Tages/${path}`);
			await expect(page.locator('html')).toBeHidden();
		}

		await page.goto('/Fakt-des-Tages/2026-08-20');
		await expect(page.getByRole('article')).toContainText('kurzer Fakt, einzeilig');
	});

	test('names a day without a fact in the address bar, without loading anything', async ({
		page
	}) => {
		const documents: string[] = [];
		page.on('request', (req) => req.resourceType() === 'document' && documents.push(req.url()));
		await page.clock.setFixedTime(FACTLESS_DAY);
		await page.goto('/Fakt-des-Tages/');

		await expect(page.getByText('Für heute gibt es keinen Fakt.')).toBeVisible();
		await expect(page.getByText('21. August 2026', { exact: true })).toBeVisible();
		await expect(page).toHaveURL(/\/Fakt-des-Tages\/2026-08-21$/);
		expect(documents).toHaveLength(1);
	});

	// The day of `history.replaceState` has no page of its own, so going back to it is a client-side
	// step to a `__data.json` that does not exist — which is what `+error.svelte` turns into a reload.
	test('comes back to a day without a fact', async ({ page }) => {
		await page.clock.setFixedTime(FACTLESS_DAY);
		await page.goto('/Fakt-des-Tages/');
		await expect(page.getByText('Für heute gibt es keinen Fakt.')).toBeVisible();

		await page.getByRole('link', { name: 'Sonntag, 23. August 2026' }).click();
		await expect(page.getByText('23. August 2026', { exact: true })).toBeVisible();

		await page.goBack();
		await expect(page.getByText('Für heute gibt es keinen Fakt.')).toBeVisible();
		await expect(page).toHaveURL(/\/Fakt-des-Tages\/2026-08-21$/);
	});

	test('is a calendar without JavaScript', async ({ browser, baseURL }) => {
		const noJs = await browser.newContext({ javaScriptEnabled: false, baseURL });
		const page = await noJs.newPage();
		await page.goto('/Fakt-des-Tages/');

		// No clock, so no day is claimed: the latest month with a fact, and an invitation.
		await expect(page.getByText('Wähle im Kalender einen Tag.')).toBeVisible();
		await expect(page.getByRole('heading', { level: 2 })).toHaveText('September 2026');
		await page.getByRole('link', { name: 'Mittwoch, 2. September 2026' }).click();
		await expect(page.getByRole('article')).toContainText('Testdaten');

		// 404.html cannot read the address bar either, but it knows it was served for a missing page.
		await page.goto('/Fakt-des-Tages/2026-08-21');
		await expect(page.getByText('Für diesen Tag gibt es keinen Fakt.')).toBeVisible();
		await noJs.close();
	});
});

test.describe('calendar', () => {
	test.use({ timezoneId: 'Europe/Berlin' });

	test.beforeEach(async ({ page }) => {
		await page.clock.setFixedTime(TODAY);
	});

	test('a click swaps the fact and puts it in the address bar', async ({ page }) => {
		await page.goto('/Fakt-des-Tages/2026-08-22');
		const documents: string[] = [];
		page.on('request', (req) => req.resourceType() === 'document' && documents.push(req.url()));

		await page.getByRole('link', { name: 'Donnerstag, 20. August 2026' }).click();

		await expect(page.getByText('20. August 2026', { exact: true })).toBeVisible();
		await expect(page.getByRole('article')).toContainText('kurzer Fakt, einzeilig');
		await expect(page).toHaveURL(/\/Fakt-des-Tages\/2026-08-20$/);
		// A client-side step: a full load would show the same page, so only the request tells.
		expect(documents).toEqual([]);
		// The selection is named in the accessible name, since a link has no ARIA state that fits a
		// single-select set — `aria-pressed` would claim toggle semantics this does not have.
		await expect(
			page.getByRole('link', { name: 'Donnerstag, 20. August 2026 (angezeigt)' })
		).toBeVisible();

		await page.goBack();
		await expect(page.getByText('22. August 2026', { exact: true })).toBeVisible();
	});

	test('follows a shared link to another month', async ({ page }) => {
		await page.goto('/Fakt-des-Tages/2026-07-30');

		await expect(page.getByText('30. Juli 2026', { exact: true })).toBeVisible();
		await expect(page.getByRole('heading', { level: 2 })).toHaveText('Juli 2026');
	});

	// GitHub Pages answers every address it has no file for with 404.html; the preview plugin in
	// vite.config.ts does the same. The page reads the date back out of the address bar.
	test('answers a day without a fact with the calendar for it', async ({ page }) => {
		const response = await page.goto('/Fakt-des-Tages/2026-08-21');

		expect(response?.status()).toBe(404);
		await expect(page.getByText('Für diesen Tag gibt es keinen Fakt.')).toBeVisible();
		await expect(page.getByText('21. August 2026', { exact: true })).toBeVisible();
		await expect(page.getByRole('heading', { level: 2 })).toHaveText('August 2026');
	});

	// `2026-02-30` is shaped like a date and is not one.
	for (const path of ['broken', '2026-02-30']) {
		test(`does not claim „${path}“ is a day`, async ({ page }) => {
			const response = await page.goto(`/Fakt-des-Tages/${path}`);

			expect(response?.status()).toBe(404);
			await expect(page.getByText('Diese Seite gibt es nicht.')).toBeVisible();
		});
	}

	test('makes days without a fact unclickable', async ({ page }) => {
		await page.goto('/Fakt-des-Tages/2026-08-22');

		// 21 August 2026 has no entry and is not today, so it renders as plain text.
		await expect(page.getByRole('link', { name: 'Freitag, 21. August 2026' })).toHaveCount(0);
		await expect(page.getByRole('link', { name: 'Samstag, 22. August 2026' })).toBeVisible();
	});

	// The one place the rule "no fact, no interaction" is broken on purpose: today is the cell a
	// visitor navigates back to, so it stays pressable even on a day the archive skips.
	test('keeps today clickable, even without a fact of its own', async ({ page }) => {
		await page.clock.setFixedTime(FACTLESS_DAY);
		await page.goto('/Fakt-des-Tages/2026-08-23');

		await page.getByRole('link', { name: 'Freitag, 21. August 2026' }).click();
		await expect(page.getByText('Für heute gibt es keinen Fakt.')).toBeVisible();
		await expect(page).toHaveURL(/\/Fakt-des-Tages\/2026-08-21$/);
	});

	// Pins the six reserved rows on the calendar grid in FactPage.svelte: without them everything
	// below the calendar shifts as the visitor pages through the months.
	test('keeps the content below the calendar in place', async ({ page }) => {
		const tops: number[] = [];
		// Four rows (February 2027 starts on a Monday and is exactly four weeks), five, and six —
		// the full range a month can take. None has a fact, so this goes through 404.html too.
		for (const day of ['2027-02-01', '2026-07-01', '2026-08-01']) {
			await page.goto(`/Fakt-des-Tages/${day}`);
			const dateLine = page.getByText(/^\d{1,2}\. \p{L}+ \d{4}$/u);
			await expect(dateLine).toBeVisible();
			tops.push((await dateLine.boundingBox())!.y);
		}
		expect(new Set(tops).size, `tops: ${tops.join(', ')}`).toBe(1);
	});

	test('bounds the arrows to the months with facts', async ({ page }) => {
		await page.goto('/Fakt-des-Tages/2026-08-22');

		const forward = page.getByRole('button', { name: 'Nächster Monat' });
		const back = page.getByRole('button', { name: 'Vorheriger Monat' });

		const monthName = page.getByRole('heading', { level: 2 });

		await forward.click();
		await expect(monthName).toHaveText('September 2026');
		// September holds the last entry, so there is nothing further forward to reach.
		await expect(forward).toHaveAttribute('aria-disabled', 'true');
		// Still focused, which is what `aria-disabled` buys over the native attribute — see `shiftMonth`.
		await expect(forward).toBeFocused();
		// Focusable but inert. `force` is needed because Playwright honours `aria-disabled` in its
		// actionability check and would otherwise refuse the click — which is itself the assertion
		// that the attribute reaches tooling. What is under test here is the guard in `shiftMonth`.
		await forward.click({ force: true });
		await expect(monthName).toHaveText('September 2026');

		await back.click();
		await back.click();
		await expect(monthName).toHaveText('Juli 2026');
		await expect(back).toHaveAttribute('aria-disabled', 'true');
		await expect(back).toBeFocused();

		// Moving the month must not move the selection — the fact still belongs to the 22nd.
		await expect(page.getByText('22. August 2026', { exact: true })).toBeVisible();
	});
});

// The fixture holds 2026-07-30, -08-20, -08-22, -08-23, -08-26, -08-31 and 2026-09-02. The gaps
// between them are the point: these arrows step from fact to fact, not from day to day.
test.describe('fact arrows', () => {
	test.use({ timezoneId: 'Europe/Berlin' });

	test.beforeEach(async ({ page }) => {
		await page.clock.setFixedTime(TODAY);
	});

	test('skips the days without a fact', async ({ page }) => {
		await page.goto('/Fakt-des-Tages/2026-08-23');

		await page.getByRole('link', { name: 'Nächster Fakt' }).click();

		// The 24th and 25th are empty in the fixture, so the next fact is the 26th.
		await expect(page.getByText('26. August 2026', { exact: true })).toBeVisible();
		await expect(page.getByRole('article')).toContainText('Zwischenüberschrift');
	});

	test('takes the calendar along into the neighbouring month', async ({ page }) => {
		await page.goto('/Fakt-des-Tages/2026-08-20');

		await page.getByRole('link', { name: 'Vorheriger Fakt' }).click();

		await expect(page.getByText('30. Juli 2026', { exact: true })).toBeVisible();
		await expect(page.getByRole('heading', { level: 2 })).toHaveText('Juli 2026');
	});

	test('also moves on from a day without a fact', async ({ page }) => {
		await page.goto('/Fakt-des-Tages/2026-08-21');
		await expect(page.getByText('Für diesen Tag gibt es keinen Fakt.')).toBeVisible();

		await page.getByRole('link', { name: 'Nächster Fakt' }).click();
		await expect(page.getByText('22. August 2026', { exact: true })).toBeVisible();

		await page.goBack();
		await expect(page.getByText('Für diesen Tag gibt es keinen Fakt.')).toBeVisible();
		await page.getByRole('link', { name: 'Vorheriger Fakt' }).click();
		await expect(page.getByText('20. August 2026', { exact: true })).toBeVisible();
	});

	for (const [day, name, date] of [
		['2026-07-30', 'Vorheriger Fakt', '30. Juli 2026'],
		['2026-09-02', 'Nächster Fakt', '2. September 2026']
	]) {
		test(`bounds „${name}“ at the edge of the archive`, async ({ page }) => {
			await page.goto(`/Fakt-des-Tages/${day}`);

			const arrow = page.getByRole('link', { name });
			await expect(arrow).toHaveAttribute('aria-disabled', 'true');
			await expect(arrow).not.toHaveAttribute('href');

			// Inert but still focusable, like the month arrows.
			await arrow.click({ force: true });
			await expect(page.getByText(date, { exact: true })).toBeVisible();
		});
	}

	// The arrow loses its `href` under the visitor who just pressed it. Keeping the element, its role
	// and a `tabindex`, plus `reset="false"` on the navigation, is what leaves focus where it was.
	test('keeps focus on the arrow that reached the edge', async ({ page }) => {
		await page.goto('/Fakt-des-Tages/2026-08-31');

		const arrow = page.getByRole('link', { name: 'Nächster Fakt' });
		await arrow.focus();
		await page.keyboard.press('Enter');

		await expect(page.getByText('2. September 2026', { exact: true })).toBeVisible();
		await expect(arrow).toHaveAttribute('aria-disabled', 'true');
		await expect(arrow).toBeFocused();
	});

	// The step fetches `__data.json` before the address changes, which the browser shows nothing for.
	// Every box in the bar is compared while the spinner is up, because it must not move a thing.
	test('shows a spinner beside the date while the next fact loads', async ({ page }) => {
		const { promise: held, resolve: release } = Promise.withResolvers<void>();
		await page.route('**/2026-08-26/__data.json*', async (route) => {
			await held;
			await route.continue();
		});
		await page.goto('/Fakt-des-Tages/2026-08-23');

		const spinner = page.getByRole('img', { name: 'Fakt wird geladen' });
		const boxes = () =>
			page.getByRole('link', { name: 'Vorheriger Fakt' }).evaluate((el) => {
				const bar = el.parentElement!;
				return [bar, ...bar.children].map((box) => box.getBoundingClientRect().toJSON());
			});
		await expect(spinner).toBeHidden();
		const before = await boxes();

		await page.getByRole('link', { name: 'Nächster Fakt' }).click();
		await expect(spinner).toBeVisible();
		expect(await boxes()).toEqual(before);

		release();
		await expect(page.getByText('26. August 2026', { exact: true })).toBeVisible();
		await expect(spinner).toBeHidden();
	});

	// Both halves matter: it must move up when the bar has pinned, and stay put when it has not.
	// An unconditional scroll would shove the calendar off screen for someone reading from the top.
	test('brings back the start of the fact when the bar is pinned', async ({ page }) => {
		await page.goto('/Fakt-des-Tages/2026-08-23');
		await expect(page.getByText('23. August 2026', { exact: true })).toBeVisible();

		// Read at rest: measured after scrolling it would compare a number with itself and pass no
		// matter what the code does.
		const stickPoint = await barRestingTop(page);
		expect(stickPoint).toBeGreaterThan(0);

		await page.evaluate(() => window.scrollTo(0, 99999));
		expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(stickPoint);

		await page.getByRole('link', { name: 'Nächster Fakt' }).click();
		await expect(page.getByText('26. August 2026', { exact: true })).toBeVisible();

		await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(stickPoint);
	});

	test('leaves the page alone while nothing is pinned yet', async ({ page }) => {
		await page.goto('/Fakt-des-Tages/2026-08-23');
		await expect(page.getByText('23. August 2026', { exact: true })).toBeVisible();

		await page.getByRole('link', { name: 'Nächster Fakt' }).click();
		await expect(page.getByText('26. August 2026', { exact: true })).toBeVisible();

		// Still at the top, with the calendar in view — not pushed down to the bar's offset.
		expect(await page.evaluate(() => window.scrollY)).toBe(0);
	});

	// The bar has to reach the edges of the viewport, not just the text column — see the iOS section
	// in CLAUDE.md. Chromium cannot see the Safari behaviour that depends on it, so this pins the
	// geometry instead: the bar's `-mx-6` cancels `main`'s `p-6`, making it exactly as wide as
	// `main`'s border box. Drop `-mx-6` and it comes out 48px narrower.
	test('stretches the date bar across the full width', async ({ page }) => {
		await page.goto('/Fakt-des-Tages/2026-08-23');

		const widths = await page.getByRole('link', { name: 'Vorheriger Fakt' }).evaluate((el) => ({
			bar: (el.parentElement as HTMLElement).getBoundingClientRect().width,
			main: el.closest('main')!.getBoundingClientRect().width
		}));
		expect(widths.bar).toBe(widths.main);
	});

	// `2026-07-30` is the fixture's first entry, so back is bounded and on is not. The day link is
	// along to show the hand is there on every live link, not only on the arrows.
	test('shows the hand only over what actually does something', async ({ page }) => {
		await page.goto('/Fakt-des-Tages/2026-07-30');

		const cursor = (name: string) =>
			page.getByRole('link', { name }).evaluate((el) => getComputedStyle(el).cursor);

		expect(await cursor('Nächster Fakt')).toBe('pointer');
		expect(await cursor('30. Juli 2026')).toBe('pointer');
		expect(await cursor('Vorheriger Fakt')).toBe('default');
	});

	// Runs at the default viewport, which only works because the fixture's 2026-08-23 is deliberately
	// long. Shorten that entry and this test keeps passing while proving nothing.
	test('keeps the date bar in view while scrolling', async ({ page }) => {
		await page.goto('/Fakt-des-Tages/2026-08-23');

		await page.evaluate(() => window.scrollTo(0, 99999));
		expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

		// `locator.evaluate` and not `boundingBox()`: the latter scrolls the element into view before
		// measuring, which is the very effect under test — it made an earlier version of this test
		// pass with `sticky` removed. Pinned, the bar's contents sit at its `pt-2`; without `sticky`
		// they ride up with the text and measure negative.
		const top = await page
			.getByRole('link', { name: 'Vorheriger Fakt' })
			.evaluate((el) => el.getBoundingClientRect().top);
		expect(top).toBe(8);
	});
});

// A fact's page is complete as prerendered: hydration only adds the today ring and what needs
// JavaScript — the search and the buttons.
test.describe('without JavaScript', () => {
	test.use({ timezoneId: 'Europe/Berlin' });

	test('a fact is readable and the archive navigable', async ({ page, browser, baseURL }) => {
		await page.clock.setFixedTime(TODAY);
		await page.goto('/Fakt-des-Tages/2026-08-23');
		await expect(page.getByLabel('Fakt suchen')).toBeEnabled();
		const hydrated = await barRestingTop(page);

		const noJs = await browser.newContext({ javaScriptEnabled: false, baseURL });
		const prerendered = await noJs.newPage();
		await prerendered.goto('/Fakt-des-Tages/2026-08-23');

		await expect(prerendered.getByText('23. August 2026', { exact: true })).toBeVisible();
		await expect(prerendered.getByRole('article')).toContainText('Bildschirmhöhe');
		// What a shared link previews: the day, and the opening of its fact as plain text.
		await expect(prerendered).toHaveTitle('23. August 2026 – Fakt des Tages');
		await expect(prerendered.locator('meta[name="description"]')).toHaveAttribute(
			'content',
			/^Testdaten — bewusst lang, damit die Seite .* …$/
		);
		// Hydration must not move anything: the page arrives at the size it keeps.
		expect(await barRestingTop(prerendered)).toBe(hydrated);
		// Only what needs JavaScript admits it: the search box is disabled, every button bounded.
		await expect(prerendered.getByLabel('Fakt suchen')).toBeDisabled();
		for (const name of ['Zufälliger Fakt', 'Vorheriger Monat', 'Nächster Monat']) {
			await expect(prerendered.getByRole('button', { name })).toHaveAttribute(
				'aria-disabled',
				'true'
			);
		}

		await prerendered.getByRole('link', { name: 'Nächster Fakt' }).click();
		await expect(prerendered.getByText('26. August 2026', { exact: true })).toBeVisible();
		await noJs.close();
	});
});

// The fixture's entries all begin "Testdaten", so these queries deliberately name the words that
// tell them apart.
test.describe('search', () => {
	test.use({ timezoneId: 'Europe/Berlin' });

	test.beforeEach(async ({ page }) => {
		await page.clock.setFixedTime(TODAY);
		await page.goto('/Fakt-des-Tages/2026-08-22');
	});

	test('finds a fact despite a typo and opens it', async ({ page }) => {
		// "einzeilig" with the second i missing: one edit away, which is what fuzzy has to absorb.
		await page.getByLabel('Fakt suchen').fill('einzeilg');

		await expect(page.getByRole('status')).toHaveText('1 Treffer');
		// Scoped to the `search` landmark: the calendar has a link for that date too, and its
		// `aria-label` carries the same words.
		const hit = page.getByRole('search').getByRole('link', { name: /20\. August 2026/ });
		await expect(hit).toContainText('einzeilig');

		const documents: string[] = [];
		page.on('request', (req) => req.resourceType() === 'document' && documents.push(req.url()));
		await hit.click();
		await expect(page).toHaveURL(/\/Fakt-des-Tages\/2026-08-20$/);
		await expect(page.getByRole('article')).toContainText('kurzer Fakt, einzeilig');
		expect(documents).toEqual([]);
		// Picking a hit empties the box, which is what closes the list.
		await expect(page.getByRole('status')).toHaveText('');
	});

	// Deliberately a *part* of the word: the search runs on every keystroke, so a half-typed word is
	// the state the visitor is actually in for all but the last one. This is the only test on plain
	// prefix matching — the others cover fuzziness, the suffix index and the alt texts.
	test('finds a half-typed word', async ({ page }) => {
		await page.getByLabel('Fakt suchen').fill('Hinterg');

		await expect(page.getByRole('status')).toHaveText('1 Treffer');
		await expect(
			page.getByRole('search').getByRole('link', { name: /26\. August 2026/ })
		).toBeVisible();
	});

	// The search text is the Markdown's words, so neither its markup nor its link targets may be in
	// it. `factText` has a unit test for the same; this one holds it end to end.
	for (const word of ['strong', 'example']) {
		test(`does not find „${word}“, because only the text is indexed`, async ({ page }) => {
			await page.getByLabel('Fakt suchen').fill(word);
			await expect(page.getByRole('status')).toHaveText('Keine Treffer');
		});
	}

	// The suffix index in `indexTerms`, end to end. „Bildschirmhöhe“ is in the 23rd and the bare word
	// is nowhere in the fixture: without the suffix index this query finds nothing at all.
	test('finds a word inside a compound', async ({ page }) => {
		await page.getByLabel('Fakt suchen').fill('schirm');

		await expect(page.getByRole('status')).toHaveText('1 Treffer');
		await expect(
			page.getByRole('search').getByRole('link', { name: /23\. August 2026/ })
		).toBeVisible();
	});

	// An image is only an alt text to the search — see `factText`. The fixture's only image carries
	// this word and nothing else does.
	test("searches the images' alt texts too", async ({ page }) => {
		await page.getByLabel('Fakt suchen').fill('Wasserspeier');

		await expect(page.getByRole('status')).toHaveText('1 Treffer');
		await expect(
			page.getByRole('search').getByRole('link', { name: /31\. August 2026/ })
		).toBeVisible();
	});

	test('holds back while the input is too short', async ({ page }) => {
		await page.getByLabel('Fakt suchen').fill('ei');
		await expect(page.getByRole('status')).toHaveText('');
	});

	// The whole reason the hit list is laid over the page instead of pushed into it.
	test('does not push the calendar away', async ({ page }) => {
		const calendar = page.getByRole('heading', { level: 2 });
		// `evaluate` and not `boundingBox()`, which scrolls the element into view before measuring.
		const top = () => calendar.evaluate((el) => el.getBoundingClientRect().top);
		const before = await top();

		await page.getByLabel('Fakt suchen').fill('lang');
		await expect(page.getByRole('status')).toHaveText('2 Treffer');
		expect(await top()).toBe(before);

		// Escape puts the calendar back, since the panel is now sitting on top of it.
		await page.getByLabel('Fakt suchen').press('Escape');
		await expect(page.getByRole('status')).toHaveText('');
		expect(await top()).toBe(before);
	});

	// MiniSearch arrives after everything else on the page, images included, and from then on is
	// in memory: a deploy that deletes its chunk, or the network going away, no longer matters.
	// Fetched on demand it could fail for good — see `onMount` in FactPage.svelte.
	test('loads MiniSearch after the images, and keeps it', async ({ page }) => {
		const { promise: held, resolve: release } = Promise.withResolvers<void>();
		await page.route('**/fakten/**', async (route) => {
			await held;
			await route.continue();
		});
		const chunks: string[] = [];
		page.on(
			'request',
			(req) => req.url().includes('/_app/immutable/chunks/') && chunks.push(req.url())
		);

		await page.goto('/Fakt-des-Tages/2026-08-31', { waitUntil: 'domcontentloaded' });
		await expect(page.getByLabel('Fakt suchen')).toBeEnabled();
		const hydration = chunks.length;
		// A negative needs a window to look in: nothing new while the image is still on its way.
		await page.waitForTimeout(500);
		expect(chunks).toHaveLength(hydration);

		release();
		await expect.poll(() => chunks.length).toBe(hydration + 1);
		await page.waitForLoadState('networkidle');

		await page.route('**/_app/immutable/chunks/**', (route) => route.abort());
		await page.getByLabel('Fakt suchen').fill('Wasserspeier');
		await expect(page.getByRole('status')).toHaveText('1 Treffer');
	});

	// Without this the first query would announce „Keine Treffer“ while the text is still on its way.
	test('says so while its text is loading', async ({ page }) => {
		const { promise: held, resolve: release } = Promise.withResolvers<void>();
		await page.route('**/search.json', async (route) => {
			await held;
			await route.continue();
		});

		await page.getByLabel('Fakt suchen').fill('einzeilg');
		await expect(page.getByRole('status')).toHaveText('Suche wird geladen…');

		release();
		await expect(page.getByRole('status')).toHaveText('1 Treffer');
	});

	test('says so when its text cannot be loaded', async ({ page }) => {
		await page.route('**/search.json', (route) => route.abort());
		await page.getByLabel('Fakt suchen').fill('lang');
		await expect(page.getByRole('status')).toHaveText(
			'Suche nicht verfügbar — bitte die Seite neu laden'
		);

		// Not for good: the next keystroke tries again, even one that leaves the query as it was.
		await page.unroute('**/search.json');
		await page.getByLabel('Fakt suchen').fill('lang ');
		await expect(page.getByRole('status')).toHaveText('2 Treffer');
	});
});

// The die is stubbed so the pick is deterministic. On 2026-08-22, the fixture's other six facts are
// the candidates and 0.3 lands on the second of them. Without the "never the fact already on screen"
// filter the same 0.3 would land on 2026-08-22 itself, so this pins the filter as much as the step.
test.describe('random fact', () => {
	test.use({ timezoneId: 'Europe/Berlin' });

	test('jumps to another fact', async ({ page }) => {
		await page.clock.setFixedTime(TODAY);
		await page.addInitScript(() => {
			Math.random = () => 0.3;
		});
		await page.goto('/Fakt-des-Tages/2026-08-22');

		await page.getByRole('button', { name: 'Zufälliger Fakt' }).click();

		await expect(page.getByText('20. August 2026', { exact: true })).toBeVisible();
		await expect(page).toHaveURL(/\/Fakt-des-Tages\/2026-08-20$/);
		await expect(page.getByRole('article')).toContainText('kurzer Fakt, einzeilig');
	});
});

test.describe('heading', () => {
	test.use({ timezoneId: 'Europe/Berlin' });

	test.beforeEach(async ({ page }) => {
		await page.clock.setFixedTime(TODAY);
	});

	test('leads back to today', async ({ page }) => {
		await page.goto('/Fakt-des-Tages/2026-07-30');

		await page.getByRole('link', { name: 'Fakt des Tages' }).click();

		await expect(page).toHaveURL(/\/Fakt-des-Tages\/2026-08-22$/);
		await expect(page.getByText('22. August 2026', { exact: true })).toBeVisible();

		await page.goBack();
		await expect(page.getByText('30. Juli 2026', { exact: true })).toBeVisible();
		await page.goForward();
		await expect(page.getByText('22. August 2026', { exact: true })).toBeVisible();
	});

	// Linking `/` from today's page would push `/`, which the head script then replaces with the
	// same date: two identical entries, and a back button that looks dead.
	test('adds no history entry on today’s own page', async ({ page }) => {
		await page.goto('/Fakt-des-Tages/2026-07-30');
		await page.getByRole('link', { name: 'Fakt des Tages' }).click();
		await expect(page.getByText('22. August 2026', { exact: true })).toBeVisible();
		// Hydrated, so the heading points at today's date rather than at `/`.
		await expect(page.getByLabel('Fakt suchen')).toBeEnabled();

		// Each click is a client-side navigation that finishes after `click()` returns. Waiting for
		// its history update keeps Back from overtaking it, which no visitor's hand is quick enough
		// to do.
		for (let i = 0; i < 2; i++) {
			await Promise.all([
				page.waitForEvent('framenavigated'),
				page.getByRole('link', { name: 'Fakt des Tages' }).click()
			]);
		}

		await page.goBack();
		await expect(page.getByText('30. Juli 2026', { exact: true })).toBeVisible();
	});
});

// A credit belongs to the picture above it, which is a claim about two distances rather than about
// any one of them. Prose gives an image 2em below it and 2em between paragraphs, so the untouched
// markup put the credit exactly as far from its own image as from the next element. The rule in
// layout.css breaks that tie, and it is easy to lose silently: written into `@layer components` it
// ships, matches, and is overruled by the typography plugin's own layer — which is what happened on
// the first attempt. Comparing distances rather than asserting pixel counts, so the test survives a
// change of font metrics.
test.describe('image credit', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/Fakt-des-Tages/2026-08-31');
	});

	test('sits closer to its own image than to the next element', async ({ page }) => {
		const gaps = await page.locator('article').evaluate((article) => {
			const credit = article.querySelector('em')!;
			const img = credit.closest('p')!.querySelector('img')!;
			const next = credit.closest('p')!.nextElementSibling!;
			return {
				toImage: credit.getBoundingClientRect().top - img.getBoundingClientRect().bottom,
				toNext: next.getBoundingClientRect().top - credit.getBoundingClientRect().bottom
			};
		});

		expect(gaps.toImage).toBeLessThan(gaps.toNext);
	});

	// The rule keys on `:has(+ em)` rather than a class, so it has to leave every uncredited image
	// alone — the archive is full of them, including pairs sitting side by side in one paragraph.
	// The fixture carries the same file twice for exactly this comparison.
	test('leaves an image without a credit untouched', async ({ page }) => {
		const gap = (n: number) =>
			page
				.locator('article img')
				.nth(n)
				.evaluate((img) => parseFloat(getComputedStyle(img).marginBottom));

		expect(await gap(0)).toBeLessThan(await gap(1));
	});
});
