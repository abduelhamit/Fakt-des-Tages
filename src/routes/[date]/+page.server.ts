import { error } from '@sveltejs/kit';
import { excerpt, type FactHtml } from '$lib/facts';
import { facts, factText, renderFact } from '$lib/server/facts';
import type { EntryGenerator, PageServerLoad } from './$types';

/** One page per fact. Nothing links to all of them, so the prerenderer is told outright. */
export const entries: EntryGenerator = () => [...facts().keys()].map((date) => ({ date }));

/**
 * Runs at build time only (the whole site is prerendered), so the Markdown is already HTML by the
 * time it reaches the browser and neither parser ships to the client. A malformed facts file
 * therefore fails `pnpm build` rather than the running site.
 *
 * Keep the type argument. It is one of two anchors for the `FactHtml` brand, the other being the
 * `fact` prop of `FactPage`: drop the `renderFact` call and both fail to compile. This one fails
 * here, where the mistake is, and still holds should a page ever render `{@html data.html}` itself.
 */
export const load: PageServerLoad<{ date: string; html: FactHtml; description: string }> = ({
	params
}) => {
	const fact = facts().get(params.date);
	// Asked for by `pnpm dev`, and by the prerenderer when it follows a fact's link to another day,
	// `[…](2026-08-24)`: this throw is what fails the build when that day has no fact.
	if (fact === undefined) error(404);
	return {
		date: params.date,
		html: renderFact(fact),
		description: excerpt(factText(fact), [])
	};
};
