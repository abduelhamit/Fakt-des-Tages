import source from '$lib/facts.yaml?raw';
import { parseFacts, renderFact } from '$lib/server/facts';
import type { Facts } from '$lib/facts';
import type { PageServerLoad } from './$types';

/**
 * Runs at build time only (the whole site is prerendered), so the Markdown is already HTML by the
 * time it reaches the browser and neither parser ships to the client. A malformed facts file
 * therefore fails `pnpm build` rather than the running site.
 *
 * Keep the `<{ facts: Facts }>` type argument. It is what anchors the `FactHtml` brand: a bare
 * `PageServerLoad` infers whatever is returned, so dropping the `renderFact` call would then
 * type-check and feed raw Markdown to `{@html}`. It looks redundant and is not.
 */
export const load: PageServerLoad<{ facts: Facts }> = () => ({
	facts: new Map(Array.from(parseFacts(source), ([date, md]) => [date, renderFact(md)]))
});
