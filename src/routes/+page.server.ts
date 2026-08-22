import quelle from '$lib/fakten.yaml?raw';
import { parseFakten, renderFakt } from '$lib/server/fakten';
import type { PageServerLoad } from './$types';

/**
 * Runs at build time only (the whole site is prerendered), so the Markdown is already HTML by the
 * time it reaches the browser and neither parser ships to the client. A malformed facts file
 * therefore fails `pnpm build` rather than the running site.
 */
export const load: PageServerLoad = () => {
	const fakten = parseFakten(quelle);
	for (const [datum, markdown] of fakten) fakten.set(datum, renderFakt(markdown));
	return { fakten };
};
