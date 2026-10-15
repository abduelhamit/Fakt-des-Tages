import { toIsoDate } from '#lib/facts.ts';

/**
 * Today on the visitor's clock, shared by the header and the calendar. Undefined until hydration —
 * the build cannot know the visitor's day — so it doubles as the sign that JavaScript is running.
 * Module state, which on a server would leak from one request into the next; here it is only ever
 * written in the browser, by `startClock`, so prerendering always reads it undefined.
 */
export const clock = $state<{ today?: string }>({});

let midnight: ReturnType<typeof setTimeout> | undefined;

/**
 * Reads today off the clock and comes back at the next local midnight. No browser event announces
 * a new day, so the timer covers a page watched across midnight, and the tab becoming visible or
 * regaining focus re-reads it as well: a timer is held back in a background tab and by sleep, and
 * the time zone may have changed since. Each read sets the timer anew from the time it finds, so
 * one that comes early or late corrects itself.
 */
function readToday() {
	const now = new Date();
	clock.today = toIsoDate(now);
	clearTimeout(midnight);
	const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
	midnight = setTimeout(readToday, next.getTime() - now.getTime());
}

let started = false;

/**
 * Starts the clock, once per page load however often it is called: from every component that needs
 * today in its own `onMount`, so none depends on the order in which they mount. It runs for as long
 * as the page does, so nothing ever stops it.
 */
export function startClock() {
	if (started) return;
	started = true;
	readToday();
	addEventListener('focus', readToday);
	document.addEventListener('visibilitychange', readToday);
}
