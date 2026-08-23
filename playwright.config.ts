import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: {
		command: 'pnpm run build && pnpm run preview',
		port: 4173,
		// Builds against src/lib/fakten.probe.yaml instead of the real facts — see vite.config.ts.
		// Without this the whole suite would break every time someone edits the site's content.
		env: { FAKTEN_PROBE: '1' }
	},
	testMatch: '**/*.e2e.{ts,js}'
});
