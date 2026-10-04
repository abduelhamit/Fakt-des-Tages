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
 * Keep the type argument. It is what anchors the `FactHtml` brand: a bare `PageServerLoad` infers
 * whatever is returned, so dropping the `renderFact` call would then type-check and feed raw
 * Markdown to `{@html}`. It looks redundant and is not.
 */
export const load: PageServerLoad<{ date: string; html: FactHtml; description: string }> = ({
	params
}) => {
	const fact = facts().get(params.date);
	// Only `pnpm dev` asks for a date without a fact; the prerenderer asks for `entries` alone.
	if (fact === undefined) error(404);
	return {
		date: params.date,
		html: renderFact(fact),
		description: excerpt(factText(fact), [])
	};
};
