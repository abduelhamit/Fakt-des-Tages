import { expect, test } from '@playwright/test';

// The two legal pages, and the one claim on them that the code can invalidate on its own.
//
// There is deliberately no test that the footer links carry the `/Fakt-des-Tages` base path. That
// was written, then removed after mutating `resolve('/impressum')` to a bare `/impressum`: the
// prerender crawler refuses the link and `pnpm build` dies with "does not begin with `base`", so
// the broken version cannot reach a browser for a test to inspect. A test that can never fail is
// worse than no test, because it reads like cover.
//
// Nothing here pins the clock: neither page shows a date, so they are the only routes on the site
// that behave identically whatever day it is.

test.describe('legal pages', () => {
	// The footer link and the <h1> differ on the Datenschutz page, so both are named rather than
	// derived from one another.
	for (const { path, link, heading } of [
		{ path: 'impressum', link: 'Impressum', heading: 'Impressum' },
		{ path: 'datenschutz', link: 'Datenschutz', heading: 'Datenschutzerklärung' }
	]) {
		test(`${path} is reachable from the footer`, async ({ page }) => {
			await page.goto('/Fakt-des-Tages/');

			await page.getByRole('contentinfo').getByRole('link', { name: link }).click();

			await expect(page).toHaveURL(new RegExp(`/Fakt-des-Tages/${path}`));
			await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
		});

		// Legal pages that need JavaScript to be readable are legal pages some visitors cannot read.
		// Everything here is prerendered, so this should hold for free — which is exactly why it is
		// worth a test: nothing would announce it if a future change made the text client-rendered.
		test(`${path} is readable without JavaScript`, async ({ browser, baseURL }) => {
			const noJs = await browser.newContext({ javaScriptEnabled: false, baseURL });
			const noJsPage = await noJs.newPage();
			await noJsPage.goto(`/Fakt-des-Tages/${path}`);

			await expect(noJsPage.getByRole('heading', { level: 1 })).toHaveText(heading);
			// The footer is in the layout, so each legal page also reaches the other one — and the
			// way back to the facts sits in the page itself. None of the three needs JavaScript.
			// Named rather than counted: the footer also carries the Wikipedia and licence links of
			// the attribution notice, so a count would fail on an unrelated edit to that sentence.
			await expect(
				noJsPage.getByRole('contentinfo').getByRole('link', { name: 'Impressum' })
			).toBeVisible();
			await expect(
				noJsPage.getByRole('contentinfo').getByRole('link', { name: 'Datenschutz' })
			).toBeVisible();
			await expect(
				noJsPage.getByRole('main').getByRole('link', { name: 'Zum Fakt des Tages' })
			).toBeVisible();
			await noJs.close();
		});

		test(`${path} leads back to the facts`, async ({ page }) => {
			await page.goto(`/Fakt-des-Tages/${path}`);

			await page.getByRole('main').getByRole('link', { name: 'Zum Fakt des Tages' }).click();

			// Today, whichever way the home page's head script sent it: this suite runs on the real
			// clock, and whether the fixture has an entry for today depends on when it runs. Either
			// way the address names the day and the calendar is there.
			await expect(page).toHaveURL(/\/Fakt-des-Tages\/\d{4}-\d\d-\d\d$/);
			await expect(page.getByRole('region', { name: 'Kalender' })).toBeVisible();
		});
	}

	// Today's date is picked by the head script on `/`, which only a real page load runs: routed
	// client-side, a link to `/` lands on the calendar with no day chosen. So every link to `/` has
	// to opt out of the router — checked on every kind of page that has one, so it also catches such a
	// link added to the layout. Before hydration, which is when the fact pages' heading points at `/`.
	test('reaches the home page only by a real page load', async ({ browser, baseURL }) => {
		const noJs = await browser.newContext({ javaScriptEnabled: false, baseURL });
		const page = await noJs.newPage();
		for (const path of ['2026-07-30', '2026-08-21', 'impressum', 'datenschutz']) {
			await page.goto(`/Fakt-des-Tages/${path}`);
			const links = await page
				.locator('a[href]')
				.evaluateAll((as) =>
					as
						.filter((a) => new URL((a as HTMLAnchorElement).href).pathname === '/Fakt-des-Tages/')
						.map((a) => a.getAttribute('data-sveltekit-reload'))
				);
			expect(links.length, path).toBeGreaterThan(0);
			expect(links, path).not.toContain(null);
		}
		await noJs.close();
	});
});

// Nearly every fact is reworked Wikipedia prose, and Wikipedia is CC BY-SA 4.0 — which wants the
// source named, the licence named and the fact that something was changed disclosed. All three live
// in one static sentence in the layout, so deleting it breaks a licence condition while every other
// check stays green. Same shape as the `AUSFÜLLEN` guard on the Impressum: assert the obligation.
test("names the facts' source and licence in the footer", async ({ page }) => {
	await page.goto('/Fakt-des-Tages/');
	const footer = page.getByRole('contentinfo');

	// One link per language edition, each pinned to its own host: the accessible names come from
	// `aria-label`, because the visible `deutsch-` would otherwise be a link named after a fragment.
	await expect(footer.getByRole('link', { name: 'Deutschsprachige Wikipedia' })).toHaveAttribute(
		'href',
		'https://de.wikipedia.org/'
	);
	await expect(footer.getByRole('link', { name: 'Englischsprachige Wikipedia' })).toHaveAttribute(
		'href',
		'https://en.wikipedia.org/'
	);
	await expect(footer.getByRole('link', { name: 'CC BY-SA 4.0' })).toHaveAttribute(
		'href',
		/creativecommons\.org\/licenses\/by-sa\/4\.0/
	);
	await expect(footer).toContainText('bearbeitet');
});

// The Datenschutz page states that the site loads no external fonts, maps, videos or scripts. That
// is a claim about the build, not about the page, and the build is what can quietly stop honouring
// it — one web font or one embedded video and the page becomes a false statement with every check
// still green. So assert the property itself rather than the sentence describing it.
test('loads nothing from third-party servers', async ({ page, baseURL }) => {
	const foreign = new Set<string>();
	const own = new URL(baseURL!).origin;
	page.on('request', (req) => {
		const origin = new URL(req.url()).origin;
		if (origin !== own) foreign.add(origin);
	});

	await page.goto('/Fakt-des-Tages/');
	// Exercise what loads later too, so it is inside the window being watched: the search's chunk
	// and text, a client-side step to another fact, and the page for a day without one.
	await page.getByLabel('Fakt suchen').fill('lang');
	await expect(page.getByRole('status')).not.toBeEmpty();
	await page.getByRole('search').getByRole('link').first().click();
	await expect(page.getByRole('article')).toBeVisible();
	await page.goto('/Fakt-des-Tages/2026-08-21');
	await page.goto('/Fakt-des-Tages/datenschutz');
	await page.goto('/Fakt-des-Tages/impressum');

	expect([...foreign]).toEqual([]);
});
