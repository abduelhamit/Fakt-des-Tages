import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
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
