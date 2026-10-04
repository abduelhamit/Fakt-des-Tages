import { json } from '@sveltejs/kit';
import { facts, factText } from '$lib/server/facts';

export const prerender = true;

/**
 * The text of every fact, for the search, as one file fetched the first time the search box is
 * focused — so a visitor who never searches never downloads it, and no page carries it.
 */
export const GET = () =>
	json(Object.fromEntries([...facts()].map(([date, fact]) => [date, factText(fact)])));
