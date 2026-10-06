import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';

const base = '/Fakt-des-Tages';

/**
 * Makes `vite preview` answer a miss the way GitHub Pages does: with `build/404.html` and status
 * 404, whatever was asked for — a date without a fact, its `__data.json`, a typo. Left alone,
 * SvelteKit's preview renders the route on its own server instead, so the e2e suite would never
 * see the page or the reload that visitors get. A hit falls through to SvelteKit's preview as
 * before. Registered directly rather than returned, so it runs ahead of SvelteKit's middleware.
 */
const pagesPreview: Plugin = {
	name: 'pages-preview',
	configurePreviewServer(server) {
		const build = resolve('build');
		const isFile = (path: string) => statSync(path, { throwIfNoEntry: false })?.isFile();
		server.middlewares.use((req, res, next) => {
			const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
			// The bare root keeps SvelteKit's redirect to the base path.
			if (!path.startsWith(`${base}/`)) return next();
			const file = join(build, path.slice(base.length));
			const found = [file, `${file}.html`, join(file, 'index.html')].some(
				(candidate) => candidate.startsWith(build) && isFile(candidate)
			);
			if (found) return next();
			res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
			res.end(readFileSync(join(build, '404.html')));
		});
	}
};

export default defineConfig({
	plugins: [
		pagesPreview,
		tailwindcss(),
		// SvelteKit's own options go here, at the top level of this object. Because this argument is
		// present, a `svelte.config.js` is ignored entirely (it only logs a warning) — do not add one.
		sveltekit({
			compilerOptions: {
				// Runes everywhere except libraries. Can be removed in Svelte 6, where it is the only mode.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			// Deployed as a GitHub Pages *project* site, so everything lives under a subpath.
			// Runtime fetches must be resolved through `asset()` or `resolve()` from '$app/paths'.
			// Absolute asset paths, because 404.html is served at whatever depth was asked for, and
			// a relative `./_app/…` from `/Fakt-des-Tages/a/b` points nowhere.
			paths: { base, relative: false },
			// No hourly `version.json` request from a tab left open: nothing here reads `updated`.
			// The check on focus and on a tab becoming visible cannot be switched off, which is why
			// the Datenschutz page names that request.
			version: { pollInterval: 0 }
		})
	],
	test: {
		expect: { requireAssertions: true },
		// Node only. Browser behaviour is covered by the Playwright e2e layer instead. A vitest
		// browser project would force `paths.base` to be blanked here, because SvelteKit mirrors it
		// onto Vite's `base`, which then 404s the runner's own /__vitest__/ assets.
		include: ['src/**/*.{test,spec}.{js,ts}']
	}
});
