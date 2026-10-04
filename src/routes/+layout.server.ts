import { facts } from '$lib/server/facts';
import type { LayoutServerLoad } from './$types';

/**
 * Every date with a fact, in order: the calendar, the arrows and the random fact need all of them
 * on every page. A client-side step still downloads the whole list again, because the prerenderer
 * writes it into every `__data.json` and Pages ignores the query by which SvelteKit would ask for
 * the fact alone. ISO dates sort lexicographically, so this one `sort` is all the ordering the pages
 * need — the facts file is in whatever order its entries were added.
 */
export const load: LayoutServerLoad = () => ({ dates: [...facts().keys()].sort() });
