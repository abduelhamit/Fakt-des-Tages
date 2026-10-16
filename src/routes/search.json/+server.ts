import { facts, factText } from '#lib/server/facts.ts';

export const prerender = true;

/**
 * The text of every fact, for the search, as one file fetched the first time the search box is
 * focused — so a visitor who never searches never downloads it, and no page carries it. Each fact
 * is `[text, picture]`: what it says, then its alt texts and credit lines, which the search weighs
 * lower.
 */
export const GET = () =>
	Response.json(
		Object.fromEntries(
			[...facts()].map(([date, fact]) => {
				const aside: string[] = [];
				return [date, [factText(fact, aside), aside.join(' ')]];
			})
		)
	);
