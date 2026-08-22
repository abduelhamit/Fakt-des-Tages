import quelle from '$lib/fakten.yaml?raw';
import { parseFakten, renderFakt } from '$lib/server/fakten';
import type { Fakten } from '$lib/fakten';

/**
 * Runs at build time only (the whole site is prerendered), so the Markdown is already HTML by the
 * time it reaches the browser and neither parser ships to the client. A malformed facts file
 * therefore fails `pnpm build` rather than the running site.
 */
export function load(): { fakten: Fakten } {
	const fakten = parseFakten(quelle);
	return { fakten: new Map([...fakten].map(([datum, md]) => [datum, renderFakt(md)])) };
}
