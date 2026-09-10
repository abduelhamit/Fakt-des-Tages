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

test.describe('Rechtsseiten', () => {
	// The footer link and the <h1> differ on the Datenschutz page, so both are named rather than
	// derived from one another.
	for (const { pfad, link, ueberschrift } of [
		{ pfad: 'impressum', link: 'Impressum', ueberschrift: 'Impressum' },
		{ pfad: 'datenschutz', link: 'Datenschutz', ueberschrift: 'Datenschutzerklärung' }
	]) {
		test(`${pfad} ist über die Fußzeile erreichbar`, async ({ page }) => {
			await page.goto('/Fakt-des-Tages/');

			await page.getByRole('contentinfo').getByRole('link', { name: link }).click();

			await expect(page).toHaveURL(new RegExp(`/Fakt-des-Tages/${pfad}`));
			await expect(page.getByRole('heading', { level: 1 })).toHaveText(ueberschrift);
		});

		// Legal pages that need JavaScript to be readable are legal pages some visitors cannot read.
		// Everything here is prerendered, so this should hold for free — which is exactly why it is
		// worth a test: nothing would announce it if a future change made the text client-rendered.
		test(`${pfad} ist ohne JavaScript lesbar`, async ({ browser, baseURL }) => {
			const ohneJs = await browser.newContext({ javaScriptEnabled: false, baseURL });
			const seite = await ohneJs.newPage();
			await seite.goto(`/Fakt-des-Tages/${pfad}`);

			await expect(seite.getByRole('heading', { level: 1 })).toHaveText(ueberschrift);
			// The footer is in the layout, so each legal page also reaches the other one — and the
			// way back to the facts sits in the page itself. None of the three needs JavaScript.
			await expect(seite.getByRole('contentinfo').getByRole('link')).toHaveCount(2);
			await expect(
				seite.getByRole('main').getByRole('link', { name: 'Zum Fakt des Tages' })
			).toBeVisible();
			await ohneJs.close();
		});

		test(`${pfad} führt zurück zu den Fakten`, async ({ page }) => {
			await page.goto(`/Fakt-des-Tages/${pfad}`);

			await page.getByRole('main').getByRole('link', { name: 'Zum Fakt des Tages' }).click();

			await expect(page).toHaveURL(/\/Fakt-des-Tages\/?$/);
			// The heading, not the fact: this suite runs on the real clock, and whether the fixture
			// has an entry for today depends on the date the suite happens to run. The heading is a
			// button only on the home page, so it identifies the destination without pinning time.
			await expect(page.getByRole('button', { name: 'Fakt des Tages' })).toBeVisible();
		});
	}

	// A link to `/` on the home page is the trap CLAUDE.md records under the location hash:
	// SvelteKit routes the click client-side, the home component never remounts, so no
	// `hashchange` fires and the URL would claim today while the previously chosen fact stayed on
	// screen. Keeping the back link inside the two legal pages is what prevents that — this
	// asserts the property itself, so it also catches someone re-adding such a link to the layout.
	test('verlinkt auf der Startseite nirgends auf sich selbst', async ({ page }) => {
		await page.goto('/Fakt-des-Tages/#2026-07-30');
		await expect(page.getByText('30. Juli 2026', { exact: true })).toBeVisible();

		const ziele = await page
			.locator('a[href]')
			.evaluateAll((as) =>
				as.map((a) => new URL((a as HTMLAnchorElement).href).pathname.replace(/\/$/, ''))
			);
		expect(ziele).not.toContain('/Fakt-des-Tages');
	});
});

// The Datenschutz page states that the site loads no external fonts, maps, videos or scripts. That
// is a claim about the build, not about the page, and the build is what can quietly stop honouring
// it — one web font or one embedded video and the page becomes a false statement with every check
// still green. So assert the property itself rather than the sentence describing it.
test('lädt nichts von fremden Servern', async ({ page, baseURL }) => {
	const fremd = new Set<string>();
	const eigen = new URL(baseURL!).origin;
	page.on('request', (req) => {
		const origin = new URL(req.url()).origin;
		if (origin !== eigen) fremd.add(origin);
	});

	await page.goto('/Fakt-des-Tages/');
	// Exercise the one lazily loaded chunk too, so its fetch is inside the window being watched.
	await page.getByLabel('Fakt suchen').fill('lang');
	await expect(page.getByRole('status')).not.toBeEmpty();
	await page.goto('/Fakt-des-Tages/datenschutz');
	await page.goto('/Fakt-des-Tages/impressum');

	expect([...fremd]).toEqual([]);
});
