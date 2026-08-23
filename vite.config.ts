import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';

/**
 * Swaps the facts file for a fixture, so the Playwright suite does not depend on the site's actual
 * content — [playwright.config.ts](playwright.config.ts) is what sets the variable. Editing
 * `src/lib/fakten.yaml` can then break the build, but never a test.
 *
 * Two things this deliberately is *not*. It is not keyed on `--mode`, because SvelteKit runs a
 * second build pass for prerendering that comes back as mode `production`, and that is the pass
 * which actually reads the YAML. And it is not a `resolve.alias`, because by the time an alias
 * could fire, `$lib` is already an absolute path and no `$lib/fakten.yaml` pattern matches.
 */
const faktenFixture = process.env.FAKTEN_PROBE === '1' && {
	name: 'fakten-fixture',
	enforce: 'pre' as const,
	resolveId(id: string) {
		return id.includes('/src/lib/fakten.yaml')
			? id.replace('fakten.yaml', 'fakten.probe.yaml')
			: null;
	}
};

export default defineConfig({
	plugins: [
		faktenFixture,
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			// Deployed as a GitHub Pages *project* site, so everything lives under a subpath.
			// Runtime fetches must be resolved through `asset()` from '$app/paths'.
			paths: { base: '/Fakt-des-Tages' }
		})
	],
	test: {
		expect: { requireAssertions: true },
		environment: 'node',
		// Node only. Browser behaviour is covered by the Playwright e2e layer instead. A vitest
		// browser project would force `paths.base` to be blanked here, because SvelteKit mirrors it
		// onto Vite's `base`, which then 404s the runner's own /__vitest__/ assets.
		include: ['src/**/*.{test,spec}.{js,ts}']
	}
});
