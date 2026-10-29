<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { navigating } from '$app/state';
	import { fromIsoDate, isIsoDate, monthGrid, toIsoDate, type FactHtml } from '#lib/facts.ts';
	import IconButton from '#lib/IconButton.svelte';
	import { clock, startClock } from '#lib/today.svelte.ts';

	/**
	 * The whole page, shared by `/[date]` (a fact), `/` (the calendar while the head script picks
	 * today) and `/404` and the error page (a date without a fact). `notFound` only decides what the
	 * page says before hydration has read the address bar. See CLAUDE.md, under "The home page".
	 */
	let {
		dates,
		fact,
		notFound = false
	}: {
		dates: readonly string[];
		fact?: { date: string; html: FactHtml; description: string };
		notFound?: boolean;
	} = $props();

	const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

	// The visitor's clock is unknowable at build time, so today is read only after hydration and
	// is undefined until then. It only adds things — the ring, a clickable today without a fact,
	// the arrows' reach — so a fact page is complete before it. Shared with the header, which links
	// it.
	const today = $derived(clock.today);
	// The date in the address bar on the pages that have no fact of their own: undefined until
	// hydration, `null` if the path is not a date at all. Read from `location`, not `page.url`,
	// because the head script on `/` rewrites the address before SvelteKit starts.
	let urlDate = $state<string | null>();

	onMount(() => {
		startClock();
		const last = location.pathname.split('/').at(-1) ?? '';
		urlDate = isIsoDate(last) ? last : null;
		// Shown only once the corrected month and message are in the DOM; see `hideUntilHydrated`.
		tick().then(() => (document.documentElement.hidden = false));
	});

	/**
	 * A page without a fact of its own is prerendered before anyone knows which day it is for, so it
	 * shows the latest month and a stand-in line until hydration corrects both — a visible jump. With
	 * JavaScript it stays hidden until then instead; without, this never runs and the prerendered
	 * page is all there is. Accepted limitation: a visitor whose JavaScript fails to load sees an
	 * empty page. The closing tag is split because a literal one would end this `<script>` block.
	 */
	const hideUntilHydrated = '<script>document.documentElement.hidden = true</' + 'script>';

	const selected = $derived(fact?.date ?? urlDate ?? undefined);

	/**
	 * The first of the month on display: the selection's, or the latest fact's until there is one.
	 * The month arrows assign to it, which holds until the selection moves again. Only an empty
	 * archive falls through to the build's clock, and then there is nothing to show anyway.
	 */
	let month = $derived(
		fromIsoDate(`${(selected ?? dates.at(-1) ?? toIsoDate(new Date())).slice(0, 7)}-01`)
	);

	// The bound is enforced by IconButton, which drops the handler of a disabled button.
	function shiftMonth(steps: number) {
		month = new Date(month.getFullYear(), month.getMonth() + steps, 1);
	}

	// Both measured after a navigation: the bar for its height, the fact for where it sits in normal
	// flow. `factText` is bound in each branch of the `{#if}` rather than on a wrapper — verified
	// that the ref survives the swap. A wrapper round the *bar* would not work at all: it would
	// become sticky's containing block and cap the bar's travel at its own height.
	let bar = $state<HTMLElement>();
	let factText = $state<HTMLElement>();

	// Every link in `<main>` and in the header carries `data-sveltekit-reset="false"`, and the
	// random fact asks for the same, so SvelteKit leaves the scroll position alone and this decides
	// instead. `enter` is the first load, and on `popstate` SvelteKit restores the position the
	// visitor left.
	afterNavigate(({ type }) => {
		if (type === 'enter' || type === 'popstate' || !bar || !factText) return;
		// Where the bar comes to rest. Asking the bar itself is useless: `offsetTop` on a *stuck*
		// sticky element reports where it is stuck — literally the scroll position — not where it
		// belongs, so the comparison below would always be false. The fact underneath it never
		// moves out of normal flow, so its top minus the bar's height is the honest answer.
		const restingTop = factText.offsetTop - bar.offsetHeight;
		// Upwards only. Scrolling unconditionally would shove the calendar off screen for a visitor
		// who was already at the top, which is the opposite of helpful.
		if (window.scrollY > restingTop) window.scrollTo(0, restingTop);
	});

	const hasFact = $derived(new Set(dates));
	const neighbours = $derived.by((): { previous?: string; next?: string } => {
		// The local `day` is not ceremony: TypeScript drops the narrowing inside the callbacks
		// without it.
		const day = selected;
		if (!day) return {};
		return {
			previous: dates.findLast((date) => date < day),
			next: dates.find((date) => date > day)
		};
	});

	// How far the month arrows reach. Today and the selection count alongside the facts, so a
	// visitor who lands on a month outside the archive — which is every month, once the entries are
	// all in the past — still has a way back rather than two dead arrows.
	const bounds = $derived.by(() => {
		// Only the outermost dates can decide the bounds, so four candidates settle it.
		const months = [dates[0], dates.at(-1), today, selected]
			.filter((date) => date !== undefined)
			.map((date) => date.slice(0, 7))
			.sort();
		// Empty strings disable both arrows, which is right for an empty archive.
		return { from: months[0] ?? '', to: months.at(-1) ?? '' };
	});

	const shownMonth = $derived(toIsoDate(month).slice(0, 7));
	const grid = $derived(monthGrid(month.getFullYear(), month.getMonth()));

	// Built once: `toLocaleDateString` with options builds a new formatter on every call, which the
	// day labels would otherwise pay for on each step.
	const monthFormat = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' });
	const longFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'long' });
	const fullFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'full' });
	const monthName = $derived(monthFormat.format(month));
	const selectedLongDate = $derived(selected && longFormat.format(fromIsoDate(selected)));
	const title = $derived(
		selectedLongDate ? `${selectedLongDate} – Fakt des Tages` : 'Fakt des Tages'
	);

	// What the page says where a fact would be. Before hydration only the route is known: `/404`
	// is served for a date, `/` has not been given one yet, and without JavaScript never will be.
	const message = $derived.by(() => {
		if (selected)
			return selected === today
				? 'Für heute gibt es keinen Fakt.'
				: 'Für diesen Tag gibt es keinen Fakt.';
		if (urlDate === null) return 'Diese Seite gibt es nicht.';
		return notFound ? 'Für diesen Tag gibt es keinen Fakt.' : 'Wähle im Kalender einen Tag.';
	});
</script>

<svelte:head>
	<title>{title}</title>
	{#if fact}
		<meta name="description" content={fact.description} />
		<meta property="og:title" content={title} />
		<meta property="og:description" content={fact.description} />
		<meta property="og:type" content="article" />
	{:else}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- a constant, see `hideUntilHydrated` -->
		{@html hideUntilHydrated}
	{/if}
</svelte:head>

<!-- `reset="false"` reaches every link in here, keeping both scroll position and focus: the scroll
     position is `afterNavigate`'s to decide, and a keyboard visitor stepping through the facts stays
     on the arrow they pressed. The footer is outside on purpose and navigates like any other page. -->
<main class="mx-auto max-w-2xl p-6" data-sveltekit-reset="false">
	<!-- The page's heading, for screen readers: the header's name is a link, not a heading, because
	     the legal pages carry their own `<h1>` and no switch in the header can tell them apart from
	     the 404.html that Pages serves at `/impressum/`. See CLAUDE.md, under the legal pages. -->
	<h1 class="sr-only">Fakt des Tages</h1>
	<section aria-label="Kalender">
		<div class="flex items-center justify-between">
			<IconButton
				icon="chevron-left"
				label="Vorheriger Monat"
				action={() => shiftMonth(-1)}
				disabled={shownMonth <= bounds.from}
			/>
			<h2 class="font-semibold">{monthName}</h2>
			<IconButton
				icon="chevron-right"
				label="Nächster Monat"
				action={() => shiftMonth(1)}
				disabled={shownMonth >= bounds.to}
			/>
		</div>

		<!-- Six day rows are always in the template, not just the ones this month fills: a grid is
		     four to six rows deep depending on where the 1st lands, and letting that vary would
		     shove the fact below up and down as the visitor pages through the months. `1fr`
		     sizes the empty rows to match the filled ones without naming a pixel height. -->
		<div class="mt-3 grid grid-cols-7 grid-rows-[auto_repeat(6,1fr)] gap-1 text-center text-sm">
			{#each WEEKDAYS as day (day)}
				<!-- Decorative: every day carries its full date in `aria-label`, so a screen reader
				     never has to pair a bare number with a column heading. -->
				<div aria-hidden="true" class="pb-1 text-xs font-medium text-(--fgColor-muted)">{day}</div>
			{/each}
			<!-- Leading blanks push the 1st into its weekday column. Cheaper to read than a
			     `grid-column-start` on the first day, and there are at most six of them. -->
			{#each { length: grid.offset }}
				<div></div>
			{/each}
			{#each grid.days as date, i (date)}
				{#if hasFact.has(date) || date === today}
					<!-- Today stays clickable even with no fact of its own: it is the ring the visitor
					     navigates back to, so it has to be pressable. It has no page, so it is a real
					     load of 404.html rather than a client-side step that would fail first. Today's
					     ring and the selected day's fill are both in the focus colour, so the focus ring
					     sits outside the cell, in the grid's gap, where it shows against the page. On the
					     selected day a second, inner ring in the page's colour keeps today's visible. -->
					<a
						href={resolve('/[date]', { date })}
						data-sveltekit-reload={!hasFact.has(date) || undefined}
						aria-label={fullFormat.format(fromIsoDate(date)) +
							(date === selected ? ' (angezeigt)' : '')}
						aria-current={date === today ? 'date' : undefined}
						class={[
							'rounded-md leading-8 focus-visible:outline-offset-2',
							date === selected
								? 'bg-(--bgColor-accent-emphasis) font-semibold text-(--fgColor-onEmphasis)'
								: hasFact.has(date)
									? 'bg-(--bgColor-accent-muted) font-medium text-(--fgColor-accent) hover:shadow-[inset_0_0_0_1px_var(--borderColor-accent-muted)]'
									: 'text-(--fgColor-muted) hover:bg-(--control-transparent-bgColor-hover)',
							date === today && 'inset-ring-2 inset-ring-(--borderColor-accent-emphasis)',
							date === today && date === selected && 'ring-4 ring-(--bgColor-default) ring-inset'
						]}>{i + 1}</a
					>
				{:else}
					<!-- Hidden from assistive tech rather than just muted: a bare number carries no date
					     context of its own, and nothing here is actionable. What is left to hear is the
					     handful of days a visitor can open, each with its full date. -->
					<span aria-hidden="true" class="leading-8 text-(--fgColor-muted)">{i + 1}</span>
				{/if}
			{/each}
		</div>
	</section>

	<!-- Sticky, so a fact longer than the screen keeps its date and its navigation on screen. A
	     `<nav>`, so a screen reader can jump to it like to the search and the calendar.
	     The gradient is why there is no border under it: the text fades as it passes behind the
	     bar rather than being clipped at an invisible edge. A border would also have to appear
	     only once pinned, which CSS alone cannot tell — a fade is honest at every offset.

	     `-mx-6 px-6` cancels `main`'s padding to make the bar full-bleed. It looks like a no-op
	     on a desktop and is the only reason the bar works on an iPhone — Safari fills the strip
	     behind the status bar with a colour sampled from the top row of the viewport, and only
	     samples when that row is uniform across the whole width. See CLAUDE.md, under "The bar
	     is full-bleed because of iOS", for the five alternatives already ruled out on-device. -->
	<nav
		bind:this={bar}
		aria-label="Durch die Fakten blättern"
		class="sticky top-0 -mx-6 mt-6 flex items-center justify-between bg-linear-to-b from-(--bgColor-default) from-60% to-transparent px-6 pt-2 pb-8"
	>
		<IconButton
			icon="chevron-left"
			label="Vorheriger Fakt"
			action={neighbours.previous ? resolve('/[date]', { date: neighbours.previous }) : undefined}
		/>
		<!-- A client-side step fetches the next fact before the address changes, and the browser shows
		     no load for it. Primer's Spinner says so beside the date, out of flow so nothing moves, and
		     fades in only after 100 ms, so a step that finishes quickly does not flash it for a frame.
		     No line break before `{#if}`: it would leave a trailing space in the date line's text. -->
		<p class="relative text-sm text-(--fgColor-muted)">
			{selectedLongDate}{#if navigating.to}
				<svg
					role="img"
					aria-label="Fakt wird geladen"
					viewBox="0 0 16 16"
					fill="none"
					class="absolute top-1/2 left-full ml-2 size-4 -translate-y-1/2 animate-spin transition-opacity delay-100 duration-500 starting:opacity-0"
				>
					<circle
						cx="8"
						cy="8"
						r="7"
						stroke="currentColor"
						stroke-opacity="0.25"
						stroke-width="2"
					/>
					<path
						d="M15 8a7 7 0 0 0-7-7"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
					/>
				</svg>
			{/if}
		</p>
		<IconButton
			icon="chevron-right"
			label="Nächster Fakt"
			action={neighbours.next ? resolve('/[date]', { date: neighbours.next }) : undefined}
		/>
	</nav>

	{#if fact}
		<!-- The YAML is a same-origin file in this repo, rendered at build time, so whoever can
		     author a fact can already author this app's JavaScript — it is not a trust boundary
		     and needs no sanitiser. Add one the moment facts come from anywhere but the repo. -->
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		<article bind:this={factText} class="markdown-body">{@html fact.html}</article>
	{:else}
		<p bind:this={factText} class="text-(--fgColor-muted)">{message}</p>
	{/if}
</main>
