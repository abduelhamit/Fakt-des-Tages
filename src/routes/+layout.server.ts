import { facts } from '$lib/server/facts';
import type { LayoutServerLoad } from './$types';

/**
 * Every date with a fact, in order: the calendar, the arrows and the random fact need all of them
 * on every page. Layout data rather than page data, so a client-side step from one fact to the next
 * fetches only the new fact — SvelteKit does not reload a layout whose inputs have not changed.
 * ISO dates sort lexicographically, so this one `sort` is all the ordering the pages need.
 */
export const load: LayoutServerLoad = () => ({ dates: [...facts().keys()].sort() });
