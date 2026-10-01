<script lang="ts">
	import { onMount } from 'svelte';
	import {
		fromIsoDate,
		isIsoDate,
		MIN_QUERY_LENGTH,
		monthGrid,
		foldTerm,
		indexTerms,
		toIsoDate,
		words
	} from '$lib/facts';
	import type MiniSearch from 'minisearch';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

	// The visitor's clock is unknowable at build time, so it is read only after hydration. Until
	// then all three are undefined and nothing date-specific renders — that is what stops the build
	// day's fact from flashing on screen before being corrected.
	let today = $state<string>();
	let selected = $state<string>();
	/** The first of the month on display. The arrows move it without changing the selection. */
	let month = $state<Date>();

	/**
	 * The hash is the single source of truth for the selection, so a click, a shared link and the
	 * back button all arrive here by the same path — clicking a day only writes `location.hash` and
	 * waits for the `hashchange` to come back. An absent or malformed hash means today.
	 *
	 * Does nothing before hydration has read the clock, since today is the fallback.
	 */
	function readHash() {
		if (!today) return;
		let hash = location.hash.slice(1);
		try {
			// We never write an encoded hash ourselves, but a link can be percent-encoded in transit,
			// and `%2D` still has to find its day.
			hash = decodeURIComponent(hash);
		} catch {
			// Not valid percent-encoding — a hand-typed `#%` throws here. Keep the raw text and let
			// `isIsoDate` turn it down; an uncaught throw would strand the page on the placeholder.
		}
		selected = isIsoDate(hash) ? hash : today;
		const day = fromIsoDate(selected);
		month = new Date(day.getFullYear(), day.getMonth(), 1);
	}

	onMount(() => {
		today = toIsoDate(new Date());
		readHash();
	});

	/**
	 * Back to today by dropping the hash, which is what an absent hash already means. `readHash` is
	 * called by hand because `pushState` fires no `hashchange` — see CLAUDE.md, under "The location
	 * hash is the single source of truth", for that and for the two alternatives that do not work.
	 * `location.search` is carried over because assigning `location.hash` elsewhere preserves it,
	 * and dropping a query string only here would be a quiet inconsistency.
	 */
	function backToToday() {
		if (!location.hash) return;
		history.pushState(null, '', location.pathname + location.search);
		readHash();
	}

	/**
	 * Move the displayed month, if the archive reaches that far. The bound is enforced here and not
	 * only on the buttons, because they use `aria-disabled` rather than the native attribute: a
	 * button that goes natively `disabled` under the visitor who just pressed it drops keyboard
	 * focus to `<body>` with no announcement, which is exactly the moment they need it most.
	 */
	function shiftMonth(steps: number) {
		if (!month) return;
		const target = new Date(month.getFullYear(), month.getMonth() + steps, 1);
		const targetMonth = toIsoDate(target).slice(0, 7);
		if (targetMonth >= bounds.from && targetMonth <= bounds.to) month = target;
	}

	// Both measured by `jump`: the bar for its height, the fact for where it sits in normal flow.
	// `factText` is bound in each branch of the `{#if}` rather than on a wrapper — verified that the
	// ref survives the swap. A wrapper round the *bar* would not work at all: it would become
	// sticky's containing block and cap the bar's travel at its own height.
	let bar = $state<HTMLElement>();
	let factText = $state<HTMLElement>();

	/** Jump to another day. Guarded here for the same reason `shiftMonth` is: the button is only
	 * `aria-disabled`, so it stays clickable. */
	function jump(target: string | undefined) {
		if (!target) return;
		location.hash = target;
		if (!bar || !factText) return;
		// Where the bar comes to rest. Asking the bar itself is useless: `offsetTop` on a *stuck*
		// sticky element reports where it is stuck — literally the scroll position — not where it
		// belongs, so the comparison below would always be false. The fact underneath it never
		// moves out of normal flow, so its top minus the bar's height is the honest answer.
		const restingTop = factText.offsetTop - bar.offsetHeight;
		// Upwards only. Scrolling unconditionally would shove the calendar off screen for a visitor
		// who was already at the top, which is the opposite of helpful.
		if (window.scrollY > restingTop) window.scrollTo(0, restingTop);
	}

	// The archive in date order. The YAML is in whatever order it was written in, and ISO dates sort
	// lexicographically, so this one `sort` is all the ordering the page needs.
	const chronological = $derived([...data.facts.keys()].sort());
	// Both neighbours in one pass. The local `day` is not ceremony: `selected` is reassignable, so
	// TypeScript drops the narrowing inside the callbacks without it.
	const neighbours = $derived.by((): { previous?: string; next?: string } => {
		const day = selected;
		if (!day) return {};
		return {
			previous: chronological.findLast((date) => date < day),
			next: chronological.find((date) => date > day)
		};
	});

	// Never the fact already on screen: across an archive this size a repeat is common enough that
	// the button would look broken. See CLAUDE.md, under "The random fact".
	const otherFacts = $derived(chronological.filter((date) => date !== selected));

	/** Jump somewhere else in the archive, through `jump` like the arrows do. No length check:
	 *  an empty list indexes to `undefined`, which `jump` already turns down. */
	function randomFact() {
		jump(otherFacts[Math.floor(Math.random() * otherFacts.length)]);
	}

	// How far the month arrows reach. Today and the selection count alongside the facts, so a
	// visitor who lands on a month outside the archive — which is every month, once the entries are
	// all in the past — still has a way back rather than two dead arrows.
	const bounds = $derived.by(() => {
		// Only the outermost dates can decide the bounds, so four candidates settle it.
		const months = [chronological[0], chronological.at(-1), today, selected]
			.filter((date) => date !== undefined)
			.map((date) => date.slice(0, 7))
			.sort();
		// Empty strings disable both arrows, which is right for an empty archive.
		return { from: months[0] ?? '', to: months.at(-1) ?? '' };
	});

	const shownMonth = $derived(month ? toIsoDate(month).slice(0, 7) : '');
	const grid = $derived(month && monthGrid(month.getFullYear(), month.getMonth()));
	const fact = $derived(selected && data.facts.get(selected));

	const monthName = $derived(
		month?.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
	);
	const longDate = (iso: string) =>
		fromIsoDate(iso).toLocaleDateString('de-DE', { dateStyle: 'long' });
	const selectedLongDate = $derived(selected && longDate(selected));

	// --- Search ---------------------------------------------------------------------------------

	type Doc = { date: string; text: string };

	/** How many hits the list shows. Beyond this the list is longer than the calendar under it, and
	 *  a query that vague is better narrowed than scrolled. */
	const MAX_HITS = 8;

	let query = $state('');
	let hits = $state<{ date: string; excerpt: string }[]>([]);

	/**
	 * The index, built once on first contact with the input.
	 *
	 * MiniSearch is the only third-party code this page ships, so it stays behind a dynamic import:
	 * a visitor who never searches never downloads it, and it stays off the critical path. The text
	 * is recovered from the rendered HTML rather than shipped a second time — `DOMParser` gets
	 * entities and nested tags right, and searching the HTML itself would match `strong` and every
	 * `href` in the archive.
	 */
	let index: Promise<MiniSearch<Doc>> | undefined;

	function buildIndex() {
		return (index ??= (async () => {
			const { default: Mini } = await import('minisearch');
			const mini = new Mini<Doc>({
				fields: ['text'],
				storeFields: ['text'],
				idField: 'date',
				// Applied to the stored terms and the query alike, so both sides fold the same way.
				processTerm: foldTerm,
				// Indexing only — a query is tokenised with `words`. See `indexTerms`.
				tokenize: indexTerms
			});
			mini.addAll([...data.facts].map(([date, html]) => ({ date, text: plainText(html) })));
			return mini;
		})());
	}

	// `parseFromString` is stateless, so one parser serves the whole archive. Built on first use, not
	// here at the top: this script runs during prerendering too, where `DOMParser` does not exist —
	// an eager `new DOMParser()` fails the build outright with `DOMParser is not defined`.
	let parser: DOMParser | undefined;

	/**
	 * The readable text of one fact.
	 *
	 * The images are replaced by their `alt` text rather than dropped: `textContent` ignores
	 * attributes, so several thousand characters of German description — written for screen readers —
	 * never reached the index, and `Bühnenturm` and `Hauptturm` could not be found at all.
	 * `doc.images` is a live collection, hence the copy before mutating it. The padding spaces are
	 * not cosmetic: the archive has runs of images sitting back to back, and without them the last
	 * word of one description welds onto the first word of the next.
	 */
	function plainText(html: string) {
		parser ??= new DOMParser();
		const doc = parser.parseFromString(html, 'text/html');
		for (const img of [...doc.images]) img.replaceWith(` ${img.alt} `);
		return doc.body.textContent ?? '';
	}

	/**
	 * A window around the first term that matched, so a hit is recognisable without opening it.
	 * Falls back to the start of the fact when no term can be located — a fuzzy hit, or a soft
	 * hyphen inside the word, means the text does not always contain the query verbatim.
	 */
	function excerpt(text: string, terms: string[]) {
		const lower = text.toLowerCase();
		const positions = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0);
		const from = Math.max(0, (positions.length ? Math.min(...positions) : 0) - 30);
		const to = Math.min(text.length, from + 140);
		let piece = text.slice(from, to);
		// Both ends land mid-word otherwise, and the snippet reads as noise: „… berschrift, ebenfalls“.
		if (from > 0) piece = piece.replace(/^\S+\s*/, '');
		if (to < text.length) piece = piece.replace(/\s*\S+$/, '');
		return (from > 0 ? '… ' : '') + piece.trim() + (to < text.length ? ' …' : '');
	}

	async function runSearch(input: string) {
		const trimmed = input.trim();
		if (trimmed.length < MIN_QUERY_LENGTH) {
			hits = [];
			return;
		}
		const mini = await buildIndex();
		// Loading the module is asynchronous, so an earlier keystroke can land after a later one.
		// Reading `query` here is deliberately outside the effect's tracking — it is a guard, not a
		// dependency: only the query still in the box may write the list.
		if (query.trim() !== trimmed) return;
		// Every hit, ranked by score and capped at `MAX_HITS`. Substring matching does let a short
		// query pick up unrelated tails — `turm` reaches `Kultur`, `Herzogtum` — but a real match always
		// scores several times a fuzzy tail, so they sort to the bottom rather than into the way. Do not
		// turn that into a relative cut: the gap is narrow enough at the bottom of the real matches to
		// take `Türmen` with it, which CLAUDE.md records as tried and reverted.
		hits = mini
			.search(trimmed, { fuzzy: 0.2, prefix: true, tokenize: words })
			.slice(0, MAX_HITS)
			.map((t) => ({ date: String(t.id), excerpt: excerpt(t.text, t.terms) }));
	}

	// Driven by an effect rather than `oninput`, so it cannot race `bind:value`: the effect runs
	// once the state has already moved.
	$effect(() => void runSearch(query));

	/** Emptying the box is what closes the list — the hash stays the only selection state. */
	function pick(date: string) {
		location.hash = date;
		query = '';
	}

	const hitSummary = $derived(
		query.trim().length < MIN_QUERY_LENGTH
			? ''
			: hits.length === 0
				? 'Keine Treffer'
				: `${hits.length} Treffer`
	);
</script>

<svelte:head><title>Fakt des Tages</title></svelte:head>
<svelte:window onhashchange={readHash} />

<!-- `aria-busy` sits here and not on the paragraph below: until hydration reads the clock the
     calendar and the date bar are stand-ins too, and a visitor hears them long before they
     reach the line that says so. -->
<main class="mx-auto max-w-2xl p-6" aria-busy={!selected}>
	<!-- The title is the way back to today and to the canonical URL. Why a button and not a link,
	     and why `readHash` is called by hand, is in CLAUDE.md. `disabled` and not `aria-disabled`:
	     this only ever flips once, at hydration, exactly like the search box below — the aria form
	     is for controls the visitor's own click can disable, where losing focus would strand them. -->
	<h1 class="text-3xl font-bold">
		<button onclick={backToToday} disabled={!selected}>Fakt des Tages</button>
	</h1>

	<!-- `disabled` until hydration, unlike the calendar below it: the search needs no clock, but it
	     does need JavaScript. See CLAUDE.md, under "The search". -->
	<search class="relative mt-6 block">
		<label class="block text-sm font-medium text-gray-700" for="query">Fakt suchen</label>
		<input
			id="query"
			type="search"
			bind:value={query}
			onfocus={buildIndex}
			onkeydown={(e) => {
				// The list covers the calendar, so it needs a way out that is not the mouse.
				if (e.key === 'Escape') query = '';
			}}
			disabled={!selected}
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
					<!-- `max-h-80` caps it and scrolls: a full `MAX_HITS` of hits is taller than a phone. -->
					<ul class="max-h-80 divide-y divide-gray-200 overflow-y-auto border-t border-gray-200">
						{#each hits as t (t.date)}
							<li>
								<button
									onclick={() => pick(t.date)}
									class="block w-full px-3 py-2 text-left hover:bg-sky-50"
								>
									<span class="block text-sm font-medium text-sky-900">{longDate(t.date)}</span>
									<span class="block text-sm text-gray-600">{t.excerpt}</span>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}
	</search>

	<!-- Outside the `search` element: this is not a search, and the landmark should not claim it.
	     For the `aria-disabled` bound and for why the glyph is not a die, see CLAUDE.md, under
	     "The random fact". -->
	<div class="mt-2 flex justify-end">
		<button
			onclick={randomFact}
			aria-disabled={!selected || otherFacts.length === 0}
			class="rounded px-2 py-1 text-sm text-sky-800 hover:bg-sky-50 aria-disabled:text-gray-400 aria-disabled:hover:bg-transparent"
		>
			<span aria-hidden="true">🔀</span> Zufälliger Fakt
		</button>
	</div>

	<!-- The calendar and the date bar sit outside the `{#if}`s below on purpose. Until hydration has
	     read the clock there is no month and no selection, so both render as their own placeholder —
	     every arrow bounded, every text slot a grey bar — and the page comes up at the size it will
	     keep, instead of growing under the visitor a moment later. -->
	<section class="mt-6" aria-label="Kalender">
		<div class="flex items-center justify-between">
			{@render arrow('‹', 'Vorheriger Monat', !month || shownMonth <= bounds.from, () =>
				shiftMonth(-1)
			)}
			{#if monthName}
				<h2 class="font-semibold">{monthName}</h2>
			{:else}
				<div class="h-4 w-28 rounded bg-gray-200"></div>
			{/if}
			{@render arrow('›', 'Nächster Monat', !month || shownMonth >= bounds.to, () => shiftMonth(1))}
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
			{#if grid}
				<!-- Leading blanks push the 1st into its weekday column. Cheaper to read than a
				     `grid-column-start` on the first day, and there are at most six of them. -->
				{#each { length: grid.offset }}
					<div></div>
				{/each}
				{#each grid.days as date, i (date)}
					{@const hasFact = data.facts.has(date)}
					{#if hasFact || date === today}
						<!-- Today stays clickable even with no fact of its own: it is the ring the visitor
						     navigates back to, so it has to be pressable.

						     The loading mock below copies this cell's height (`py-1.5` plus the grid's
						     `text-sm`, 32 px) as `h-8` and its `bg-sky-50` outright. Change either here and
						     change it there. The e2e test only half-covers this: `1fr` sizes each row to its
						     tallest cell, so moving the button without the factless `<span>` passes green,
						     and nothing tests the colour at all. -->
						<button
							onclick={() => (location.hash = date)}
							aria-label={fromIsoDate(date).toLocaleDateString('de-DE', { dateStyle: 'full' }) +
								(date === selected ? ' (angezeigt)' : '')}
							aria-current={date === today ? 'date' : undefined}
							class={[
								'rounded py-1.5',
								date === selected
									? 'bg-sky-700 font-semibold text-white'
									: hasFact
										? 'bg-sky-50 font-medium text-sky-900 hover:bg-sky-100'
										: 'text-gray-600 hover:bg-gray-100',
								date === today && 'ring-2 ring-sky-900 ring-inset'
							]}>{i + 1}</button
						>
					{:else}
						<!-- Hidden from assistive tech rather than just muted: a bare number carries no date
						     context of its own, and nothing here is actionable. What is left to hear is the
						     handful of days a visitor can open, each with its full date. -->
						<span aria-hidden="true" class="py-1.5 text-gray-600">{i + 1}</span>
					{/if}
				{/each}
			{:else}
				<!-- The stand-in month: every row full, no leading blanks — there is no 1st to indent
				     for — in the archive's own rhythm of weekdays that carry a fact and weekends that
				     do not. `h-8` is a day cell's height to the pixel, so the grid below the heading
				     is the same size before and after hydration. -->
				{#each { length: 6 * WEEKDAYS.length }, i}
					{@const workday = i % WEEKDAYS.length < 5}
					<div class={['flex h-8 items-center justify-center rounded', workday && 'bg-sky-50']}>
						<div class={['h-2 w-4 rounded-full', workday ? 'bg-sky-200' : 'bg-gray-200']}></div>
					</div>
				{/each}
			{/if}
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
		{@render arrow('‹', 'Vorheriger Fakt', !neighbours.previous, () => jump(neighbours.previous))}
		{#if selectedLongDate}
			<p class="text-sm text-gray-600">{selectedLongDate}</p>
		{:else}
			<div class="h-4 w-28 rounded bg-gray-200"></div>
		{/if}
		{@render arrow('›', 'Nächster Fakt', !neighbours.next, () => jump(neighbours.next))}
	</div>

	{#if fact}
		<!-- The YAML is a same-origin file in this repo, rendered at build time, so whoever can
		     author a fact can already author this app's JavaScript — it is not a trust boundary
		     and needs no sanitiser. Add one the moment facts come from anywhere but the repo. -->
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		<article bind:this={factText} class="prose hyphens-auto">{@html fact}</article>
	{:else if selected}
		<p bind:this={factText} class="text-gray-600">
			{selected === today
				? 'Für heute gibt es keinen Fakt.'
				: 'Für diesen Tag gibt es keinen Fakt.'}
		</p>
	{:else}
		<!-- Shown from first paint until hydration reads the clock. Nothing is actually being
		     fetched; only the visitor's date is unknown before then. -->
		<p class="text-gray-600">Fakten werden geladen …</p>
	{/if}
</main>

<!--
	Every arrow on the page: the two that page the calendar and the two beside the fact. They carry
	`aria-disabled` rather than the native attribute for the reason spelled out on `shiftMonth`,
	which is why each caller passes a handler that re-checks its own bound. `gray-400` is only
	acceptable on an *inactive* control, which WCAG exempts; readable text stays at `gray-600`.

	A snippet rather than a hoisted `const` for the class list: Prettier's Tailwind plugin sorts
	classes inside a `class="..."` attribute and silently skips a `const`. Verified both ways.
-->
{#snippet arrow(glyph: string, label: string, disabled: boolean, activate: () => void)}
	<button
		onclick={activate}
		aria-disabled={disabled}
		aria-label={label}
		class="rounded px-3 py-1 text-xl leading-none text-sky-800 hover:bg-sky-50 aria-disabled:text-gray-400 aria-disabled:hover:bg-transparent"
		>{glyph}</button
	>
{/snippet}
