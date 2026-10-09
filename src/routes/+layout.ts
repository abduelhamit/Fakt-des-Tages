import { browser } from '$app/env';
import type { LayoutLoad } from './$types';

export const prerender = true;

let dates: string[] | undefined;

/**
 * The date list the page was loaded with, kept for every client-side step. Each step's
 * `__data.json` carries a list of its own, and after a deploy the browser serves the ones it
 * fetched before from its cache (Pages sends `max-age=600`), so taking each step's list made a new
 * fact appear and vanish from step to step. A new list comes with a full page load, which the
 * layout starts once SvelteKit has seen a new `version.json`. Browser only: on the server this
 * module outlives a `pnpm dev` edit of the facts file.
 */
export const load: LayoutLoad = ({ data }) => ({
	dates: browser ? (dates ??= data.dates) : data.dates
});
