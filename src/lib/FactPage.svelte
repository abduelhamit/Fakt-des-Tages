<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { afterNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		excerpt,
		fromIsoDate,
		isIsoDate,
		MIN_QUERY_LENGTH,
		monthGrid,
		foldTerm,
		indexTerms,
		toIsoDate,
		words,
		type FactHtml
	} from '$lib/facts';
	import type MiniSearch from 'minisearch';

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
	// the arrows' reach — so a fact page is complete before it.
	let today = $state<string>();
	// The date in the address bar on the pages that have no fact of their own: undefined until
	// hydration, `null` if the path is not a date at all. Read from `location`, not `page.url`,
	// because the head script on `/` rewrites the address before SvelteKit starts.
	let urlDate = $state<string | null>();

	onMount(() => {
		today = toIsoDate(new Date());
		const last = location.pathname.split('/').at(-1) ?? '';
		urlDate = isIsoDate(last) ? last : null;
		// Shown only once the corrected month and message are in the DOM; see `hideUntilHydrated`.
		tick().then(() => (document.documentElement.hidden = false));

		// MiniSearch, fetched once everything else has — images included — so it never competes
		// with the page, yet sits in memory before anyone searches. Fetched on demand instead, it
		// failed for good: a browser that caches a failed import never asks again, and a deploy
		// deletes the chunk an open tab would ask for. A failure here surfaces on the next search.
		const preload = () => void import('minisearch').catch(() => {});
		if (document.readyState === 'complete') preload();
		else window.addEventListener('load', preload, { once: true });
		return () => window.removeEventListener('load', preload);
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

	const firstOfMonth = (iso: string) => {
		const day = fromIsoDate(iso);
		return new Date(day.getFullYear(), day.getMonth(), 1);
	};
	/**
	 * The first of the month on display: the selection's, or the latest fact's until there is one.
	 * The month arrows assign to it, which holds until the selection moves again. Only an empty
	 * archive falls through to the build's clock, and then there is nothing to show anyway.
	 */
	let month = $derived(firstOfMonth(selected ?? dates.at(-1) ?? toIsoDate(new Date())));

	/**
	 * Move the displayed month, if the archive reaches that far. The bound is enforced here and not
	 * only on the buttons, because they use `aria-disabled` rather than the native attribute: a
	 * button that goes natively `disabled` under the visitor who just pressed it drops keyboard
	 * focus to `<body>` with no announcement, which is exactly the moment they need it most.
	 */
	function shiftMonth(steps: number) {
		const target = new Date(month.getFullYear(), month.getMonth() + steps, 1);
		const targetMonth = toIsoDate(target).slice(0, 7);
		if (targetMonth >= bounds.from && targetMonth <= bounds.to) month = target;
	}

	// Both measured after a navigation: the bar for its height, the fact for where it sits in normal
	// flow. `factText` is bound in each branch of the `{#if}` rather than on a wrapper — verified
	// that the ref survives the swap. A wrapper round the *bar* would not work at all: it would
	// become sticky's containing block and cap the bar's travel at its own height.
	let bar = $state<HTMLElement>();
	let factText = $state<HTMLElement>();

	// Every link in `<main>` carries `data-sveltekit-noscroll`, so SvelteKit leaves the scroll
	// position alone and this decides instead. `enter` is the first load, and on `popstate`
	// SvelteKit restores the position the visitor left.
	afterNavigate(({ type }) => {
		query = '';
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

	// Never the fact already on screen: across an archive this size a repeat is common enough that
	// the button would look broken. See CLAUDE.md, under "The random fact".
	const otherFacts = $derived(dates.filter((date) => date !== selected));

	/** A button rather than a link, because its target is only drawn when it is pressed. Through
	 *  `afterNavigate` like every link, hence `noScroll`. */
	function randomFact() {
		const target = otherFacts[Math.floor(Math.random() * otherFacts.length)];
		if (target) goto(resolve('/[date]', { date: target }), { noScroll: true, keepFocus: true });
	}

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

	const monthName = $derived(month.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }));
	const longDate = (iso: string) =>
		fromIsoDate(iso).toLocaleDateString('de-DE', { dateStyle: 'long' });
	const selectedLongDate = $derived(selected && longDate(selected));
	const title = $derived(
		selectedLongDate ? `${selectedLongDate} – Fakt des Tages` : 'Fakt des Tages'
	);

	// What the page says where a fact would be. Before hydration only the route is known: `/404`
	// is served for a date, `/` has not been given one yet, and without JavaScript never will be.
	const message = $derived(
		selected
			? selected === today
				? 'Für heute gibt es keinen Fakt.'
				: 'Für diesen Tag gibt es keinen Fakt.'
			: urlDate === null
				? 'Diese Seite gibt es nicht.'
				: notFound
					? 'Für diesen Tag gibt es keinen Fakt.'
					: 'Wähle im Kalender einen Tag.'
	);

	// --- Search ---------------------------------------------------------------------------------

	type Doc = { date: string; text: string };

	/** How many hits the list shows. Beyond this the list is longer than the calendar under it, and
	 *  a query that vague is better narrowed than scrolled. */
	const MAX_HITS = 8;

	let query = $state('');
	let hits = $state<{ date: string; excerpt: string }[]>([]);
	// Until the index exists there is nothing to count, and „Keine Treffer“ would be announced
	// as an answer while the text is still on its way.
	let ready = $state(false);
	let unavailable = $state(false);

	/**
	 * The index, built once on first contact with the input, from `search.json`.
	 *
	 * The text is fetched only then, so a visitor who never searches never downloads it. MiniSearch
	 * — the only third-party code this page ships — is usually in memory already, see `onMount`,
	 * and the `import` here only covers a search that starts before the page has finished loading.
	 * A failed fetch forgets the promise, so the next keystroke tries again.
	 */
	let index: Promise<MiniSearch<Doc>> | undefined;

	function buildIndex() {
		return (index ??= (async () => {
			const [{ default: Mini }, texts] = await Promise.all([
				import('minisearch'),
				fetch(resolve('/search.json')).then((response) => {
					if (!response.ok) throw new Error(`search.json: ${response.status}`);
					return response.json() as Promise<Record<string, string>>;
				})
			]);
			const mini = new Mini<Doc>({
				fields: ['text'],
				storeFields: ['text'],
				idField: 'date',
				// Applied to the stored terms and the query alike, so both sides fold the same way.
				processTerm: foldTerm,
				// Indexing only — a query is tokenised with `words`. See `indexTerms`.
				tokenize: indexTerms
			});
			mini.addAll(Object.entries(texts).map(([date, text]) => ({ date, text })));
			ready = true;
			return mini;
		})().catch((cause: unknown) => {
			index = undefined;
			throw cause;
		}));
	}

	async function runSearch(input: string) {
		const trimmed = input.trim();
		if (trimmed.length < MIN_QUERY_LENGTH) {
			hits = [];
			return;
		}
		let mini;
		// A retry after a failure is loading again, not unavailable yet.
		unavailable = false;
		try {
			mini = await buildIndex();
		} catch {
			if (query.trim() === trimmed) unavailable = true;
			return;
		}
		// Loading is asynchronous, so an earlier keystroke can land after a later one. Reading
		// `query` here is deliberately outside the effect's tracking — it is a guard, not a
		// dependency: only the query still in the box may write the list.
		if (query.trim() !== trimmed) return;
		// Every hit, ranked by score and capped at `MAX_HITS`. Substring matching does let a short
		// query pick up unrelated tails — `turm` reaches `Kultur`, `Herzogtum` — but a real match
		// always scores several times a fuzzy tail, so they sort to the bottom rather than into the
		// way. Do not turn that into a relative cut: the gap is narrow enough at the bottom of the
		// real matches to take `Türmen` with it, which CLAUDE.md records as tried and reverted.
		hits = mini
			.search(trimmed, { fuzzy: 0.2, prefix: true, tokenize: words })
			.slice(0, MAX_HITS)
			.map((t) => ({ date: String(t.id), excerpt: excerpt(t.text, t.terms) }));
	}

	// Driven by an effect rather than `oninput`, so it cannot race `bind:value`: the effect runs
	// once the state has already moved.
	$effect(() => void runSearch(query));

	const hitSummary = $derived(
		query.trim().length < MIN_QUERY_LENGTH
			? ''
			: unavailable
				? 'Suche nicht verfügbar'
				: !ready
					? 'Suche wird geladen…'
					: hits.length === 0
						? 'Keine Treffer'
						: `${hits.length} Treffer`
	);
</script>

<svelte:head>
	<title>{title}</title>
	{#if !fact}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- a constant, see `hideUntilHydrated` -->
		{@html hideUntilHydrated}
	{/if}
	{#if fact}
		<meta name="description" content={fact.description} />
		<meta property="og:title" content={title} />
		<meta property="og:description" content={fact.description} />
		<meta property="og:type" content="article" />
	{/if}
</svelte:head>

<!-- `noscroll` and `keepfocus` reach every link in here: the scroll position is `afterNavigate`'s
     to decide, and a keyboard visitor stepping through the facts stays on the arrow they pressed.
     The footer is outside on purpose and navigates like any other page. -->
<main class="mx-auto max-w-2xl p-6" data-sveltekit-noscroll data-sveltekit-keepfocus>
	<!-- The way back to today. Once hydrated it links today's date itself, so a click on today's
	     page replaces the history entry instead of stacking an identical one. Before that it is `/`,
	     which needs a real page load like every link to `/`: the head script there is what picks
	     the day. Today without a fact has no page of its own, so that is a real load too. See
	     CLAUDE.md, under "The home page". -->
	<h1 class="text-3xl font-bold">
		<a
			href={today ? resolve('/[date]', { date: today }) : resolve('/')}
			data-sveltekit-reload={!today || !hasFact.has(today) || undefined}>Fakt des Tages</a
		>
	</h1>

	<!-- `disabled` until hydration: the search needs JavaScript, and a box that swallows what you
	     type without answering is worse than one that admits it is not ready. -->
	<search class="relative mt-6 block">
		<label class="block text-sm font-medium text-gray-700" for="query">Fakt suchen</label>
		<input
			id="query"
			type="search"
			bind:value={query}
			onfocus={() => buildIndex().catch(() => {})}
			onkeydown={(e) => {
				// The list covers the calendar, so it needs a way out that is not the mouse.
				if (e.key === 'Escape') query = '';
			}}
			disabled={!today}
			placeholder="z. B. Fernsehturm"
			class="mt-1 block w-full rounded border-gray-500 disabled:bg-gray-50"
		/>

		<!-- Out of sight but always in the DOM, or the count is not reliably announced; the visible
		     copy in the panel is `aria-hidden` so it is not read twice. See CLAUDE.md. -->
		<p role="status" class="sr-only">{hitSummary}</p>

		{#if hitSummary}
			<!-- Absolutely positioned, so nothing here moves the calendar: the panel is laid over the
			     page rather than wedged into it. `top-full` is the bottom edge of this `search`, which
			     is the input, because the only other children are out of flow. -->
			<div
				class="absolute inset-x-0 top-full z-10 mt-2 overflow-hidden rounded border border-gray-200 bg-white shadow-lg"
			>
				<p aria-hidden="true" class="px-3 py-2 text-sm text-gray-600">{hitSummary}</p>
				{#if hits.length > 0}
					<!-- `max-h-80` caps it and scrolls: a full `MAX_HITS` of hits is taller than a phone.
					     A hit closes the list by navigating, which empties the box in `afterNavigate`. -->
					<ul class="max-h-80 divide-y divide-gray-200 overflow-y-auto border-t border-gray-200">
						{#each hits as t (t.date)}
							<li>
								<a
									href={resolve('/[date]', { date: t.date })}
									class="block px-3 py-2 hover:bg-sky-50"
								>
									<span class="block text-sm font-medium text-sky-900">{longDate(t.date)}</span>
									<span class="block text-sm text-gray-600">{t.excerpt}</span>
								</a>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}
	</search>

	<!-- Outside the `search` element: this is not a search, and the landmark should not claim it.
	     `aria-disabled` until hydration, because it needs JavaScript to do anything. For the glyph,
	     see CLAUDE.md, under "The random fact". -->
	<div class="mt-2 flex justify-end">
		<button
			onclick={randomFact}
			aria-disabled={!today || otherFacts.length === 0}
			class="rounded px-2 py-1 text-sm text-sky-800 hover:bg-sky-50 aria-disabled:text-gray-400 aria-disabled:hover:bg-transparent"
		>
			<span aria-hidden="true">🔀</span> Zufälliger Fakt
		</button>
	</div>

	<section class="mt-6" aria-label="Kalender">
		<!-- `aria-disabled` until hydration, like the random fact: a button does nothing without
		     JavaScript, so it must not look as if it would. -->
		<div class="flex items-center justify-between">
			{@render arrow('‹', 'Vorheriger Monat', !today || shownMonth <= bounds.from, () =>
				shiftMonth(-1)
			)}
			<h2 class="font-semibold">{monthName}</h2>
			{@render arrow('›', 'Nächster Monat', !today || shownMonth >= bounds.to, () => shiftMonth(1))}
		</div>

		<!-- Six day rows are always in the template, not just the ones this month fills: a grid is
		     four to six rows deep depending on where the 1st lands, and letting that vary would
		     shove the fact below up and down as the visitor pages through the months. `1fr`
		     sizes the empty rows to match the filled ones without naming a pixel height. -->
		<div class="mt-3 grid grid-cols-7 grid-rows-[auto_repeat(6,1fr)] gap-1 text-center text-sm">
			{#each WEEKDAYS as day (day)}
				<!-- Decorative: every day carries its full date in `aria-label`, so a screen reader
				     never has to pair a bare number with a column heading. -->
				<div aria-hidden="true" class="pb-1 text-xs font-medium text-gray-500">{day}</div>
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
					     load of 404.html rather than a client-side step that would fail first. -->
					<a
						href={resolve('/[date]', { date })}
						data-sveltekit-reload={!hasFact.has(date) || undefined}
						aria-label={fromIsoDate(date).toLocaleDateString('de-DE', { dateStyle: 'full' }) +
							(date === selected ? ' (angezeigt)' : '')}
						aria-current={date === today ? 'date' : undefined}
						class={[
							'rounded py-1.5',
							date === selected
								? 'bg-sky-700 font-semibold text-white'
								: hasFact.has(date)
									? 'bg-sky-50 font-medium text-sky-900 hover:bg-sky-100'
									: 'text-gray-600 hover:bg-gray-100',
							date === today && 'ring-2 ring-sky-900 ring-inset'
						]}>{i + 1}</a
					>
				{:else}
					<!-- Hidden from assistive tech rather than just muted: a bare number carries no date
					     context of its own, and nothing here is actionable. What is left to hear is the
					     handful of days a visitor can open, each with its full date. -->
					<span aria-hidden="true" class="py-1.5 text-gray-600">{i + 1}</span>
				{/if}
			{/each}
		</div>
	</section>

	<!-- Sticky, so a fact longer than the screen keeps its date and its navigation on screen.
	     The gradient is why there is no border under it: the text fades as it passes behind the
	     bar rather than being clipped at an invisible edge. A border would also have to appear
	     only once pinned, which CSS alone cannot tell — a fade is honest at every offset.

	     `-mx-6 px-6` cancels `main`'s padding to make the bar full-bleed. It looks like a no-op
	     on a desktop and is the only reason the bar works on an iPhone — Safari fills the strip
	     behind the status bar with a colour sampled from the top row of the viewport, and only
	     samples when that row is uniform across the whole width. See CLAUDE.md, under "The bar
	     is full-bleed because of iOS", for the five alternatives already ruled out on-device. -->
	<div
		bind:this={bar}
		class="sticky top-0 -mx-6 mt-6 flex items-center justify-between bg-linear-to-b from-white from-60% to-transparent px-6 pt-2 pb-8"
	>
		{@render arrow('‹', 'Vorheriger Fakt', !neighbours.previous, neighbours.previous)}
		<p class="text-sm text-gray-600">{selectedLongDate}</p>
		{@render arrow('›', 'Nächster Fakt', !neighbours.next, neighbours.next)}
	</div>

	{#if fact}
		<!-- The YAML is a same-origin file in this repo, rendered at build time, so whoever can
		     author a fact can already author this app's JavaScript — it is not a trust boundary
		     and needs no sanitiser. Add one the moment facts come from anywhere but the repo. -->
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		<article bind:this={factText} class="prose hyphens-auto">{@html fact.html}</article>
	{:else}
		<p bind:this={factText} class="text-gray-600">{message}</p>
	{/if}
</main>

<!--
	Every arrow on the page: the two that page the calendar are buttons, the two beside the fact are
	links to the neighbouring fact, passed as its date. Both carry `aria-disabled` rather than going inert natively, for
	the reason spelled out on `shiftMonth`: a bounded fact arrow loses its `href` but keeps its role
	and its `tabindex`, so the visitor who just stepped onto the last fact keeps focus on it. That is
	also why each month arrow passes a handler that re-checks its own bound. `gray-400` is only
	acceptable on an *inactive* control, which WCAG exempts; readable text stays at `gray-600`.

	A snippet rather than a hoisted `const` for the class list: Prettier's Tailwind plugin sorts
	classes inside a `class="..."` attribute and silently skips a `const`. Verified both ways. The two
	branches repeat the list; keep them in step.
-->
{#snippet arrow(
	glyph: string,
	label: string,
	disabled: boolean,
	target: string | undefined | (() => void)
)}
	{#if typeof target === 'function'}
		<button
			onclick={target}
			aria-disabled={disabled}
			aria-label={label}
			class="rounded px-3 py-1 text-xl leading-none text-sky-800 hover:bg-sky-50 aria-disabled:cursor-default aria-disabled:text-gray-400 aria-disabled:hover:bg-transparent"
			>{glyph}</button
		>
	{:else}
		<a
			href={target ? resolve('/[date]', { date: target }) : undefined}
			role={disabled ? 'link' : undefined}
			tabindex={disabled ? 0 : undefined}
			aria-disabled={disabled}
			aria-label={label}
			class="rounded px-3 py-1 text-xl leading-none text-sky-800 hover:bg-sky-50 aria-disabled:cursor-default aria-disabled:text-gray-400 aria-disabled:hover:bg-transparent"
			>{glyph}</a
		>
	{/if}
{/snippet}
