<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { afterNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { excerpt, fromIsoDate, highlight, MIN_QUERY_LENGTH } from '#lib/facts.ts';
	import IconButton, { octicon } from '#lib/IconButton.svelte';
	import type { Answer, Question } from '#lib/search.worker.ts';
	import { clock, startClock } from '#lib/today.svelte.ts';

	/**
	 * The header along the top of every page, like github.com's: the way back to today, the search
	 * and the random fact. In the layout, so the legal pages and the error page have all three too.
	 * Below Primer's small breakpoint the search folds into a button that opens it over the header.
	 */

	// Missing on an error page whose layout data could not be loaded; see +error.svelte.
	const dates: readonly string[] = $derived(page.data.dates ?? []);

	onMount(() => {
		startClock();
		// The search's worker, started once everything else has loaded — images included — so it
		// never competes with the page, yet sits in memory before anyone searches. Fetched on
		// demand instead, its code failed for good: a deploy deletes the file an open tab would ask
		// for. It builds nothing until asked, see `ask`.
		const preload = () => void searcher();
		if (document.readyState === 'complete') preload();
		else window.addEventListener('load', preload, { once: true });
		return () => window.removeEventListener('load', preload);
	});

	// Never the fact already on screen: across an archive this size a repeat is common enough that
	// the button would look broken. See CLAUDE.md, under "The random fact".
	const otherFacts = $derived(dates.filter((date) => date !== page.params.date));

	/** A button rather than a link, because its target is only drawn when it is pressed. Through
	 *  `afterNavigate` like every link, hence `reset: false`. */
	function randomFact() {
		const target = otherFacts[Math.floor(Math.random() * otherFacts.length)];
		if (target) goto(resolve('/[date]', { date: target }), { reset: false });
	}

	// --- Search ---------------------------------------------------------------------------------

	let query = $state('');
	// Raw: only ever replaced, never mutated, so a deep proxy per hit would buy nothing.
	let hits = $state.raw<{ date: string; excerpt: ReturnType<typeof highlight> }[]>([]);
	// Until the index exists there is nothing to count, and „Keine Treffer“ would be announced
	// as an answer while the text is still on its way.
	let ready = $state(false);
	let unavailable = $state(false);

	// Whether the search is unfolded over the header on a narrow screen. Only the button that sets it
	// exists there, so on a wide screen it stays false and changes nothing.
	let open = $state(false);
	let input = $state<HTMLInputElement>();
	let toggle = $state<HTMLElement>();

	// A navigation empties the box, which is what closes the list, and folds the search away again.
	afterNavigate(() => {
		query = '';
		open = false;
	});

	async function toggleSearch() {
		open = !open;
		await tick();
		if (open) input?.focus();
	}

	/**
	 * The worker holding the index, see search.worker.ts. It is asked on first contact with the
	 * input, and only then fetches `search.json`, so a visitor who never searches never downloads
	 * it. A worker whose code failed to load is forgotten, so the next keystroke starts another.
	 */
	let worker: Worker | undefined;

	function searcher() {
		if (worker) return worker;
		worker = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' });
		worker.onmessage = ({ data }: MessageEvent<Answer>) => {
			if (!('failed' in data)) ready = true;
			// Answers come in the order asked, so an earlier keystroke's can still arrive after a
			// later one: only the query still in the box may write the list.
			if (data.query !== query.trim()) return;
			if ('failed' in data) unavailable = true;
			else
				hits = data.hits.map((t) => ({
					date: String(t.id),
					excerpt: highlight(excerpt(t.text, t.terms), t.terms)
				}));
		};
		worker.onerror = () => {
			worker?.terminate();
			worker = undefined;
			if (query.trim().length >= MIN_QUERY_LENGTH) unavailable = true;
		};
		return worker;
	}

	/** An empty `text` only builds the index. */
	function ask(text: string) {
		searcher().postMessage({ url: resolve('/search.json'), query: text } satisfies Question);
	}

	function runSearch(input: string) {
		const trimmed = input.trim();
		if (trimmed.length < MIN_QUERY_LENGTH) {
			hits = [];
			return;
		}
		// A retry after a failure is loading again, not unavailable yet.
		unavailable = false;
		ask(trimmed);
	}

	// Driven by an effect rather than `oninput`, so it cannot race `bind:value`: the effect runs
	// once the state has already moved.
	$effect(() => runSearch(query));

	const hitSummary = $derived.by(() => {
		if (query.trim().length < MIN_QUERY_LENGTH) return '';
		if (unavailable) return 'Suche nicht verfügbar — bitte die Seite neu laden';
		if (!ready) return 'Suche wird geladen…';
		return hits.length === 0 ? 'Keine Treffer' : `${hits.length} Treffer`;
	});

	// Built once: `toLocaleDateString` with options builds a new formatter on every call, which the
	// hits would otherwise pay for on each keystroke.
	const longFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'long' });
</script>

<!-- `reset="false"` for the hits, as for every link in the fact pages' `<main>`: the scroll
     position is `afterNavigate`'s in FactPage to decide. -->
<header
	class="border-b border-(--borderColor-default) bg-(--bgColor-inset)"
	data-sveltekit-reset="false"
>
	<div class="mx-auto flex h-16 max-w-2xl items-center gap-3 px-6">
		<!-- The way back to today. Once hydrated it links today's date itself, so a click on today's
		     page replaces the history entry instead of stacking an identical one. Before that it is
		     `/`, which needs a real page load like every link to `/`: the head script there is what
		     picks the day. Today without a fact has no page of its own, so that is a real load too.
		     See CLAUDE.md, under "The home page". A link and not a heading, like github.com's logo:
		     every page carries its own `<h1>`. -->
		<a
			href={clock.today ? resolve('/[date]', { date: clock.today }) : resolve('/')}
			data-sveltekit-reload={!clock.today || !dates.includes(clock.today) || undefined}
			class={[
				'mr-auto flex shrink-0 items-center gap-3 rounded-md font-semibold',
				open && 'max-sm:hidden'
			]}
		>
			<!-- The favicon, drawn in the theme's colours. -->
			<svg
				viewBox="0 0 32 32"
				aria-hidden="true"
				class="size-8 shrink-0 fill-(--bgColor-accent-emphasis)"
			>
				<rect x="2" y="4" width="28" height="26" rx="4" />
				<rect x="4" y="12" width="24" height="16" rx="2" class="fill-(--bgColor-default)" />
				<rect x="8.5" y="1.5" width="3" height="6" rx="1.5" />
				<rect x="20.5" y="1.5" width="3" height="6" rx="1.5" />
				<rect x="14.5" y="14" width="3" height="8" rx="1.5" />
				<circle cx="16" cy="25" r="1.75" />
			</svg>
			Fakt des Tages
		</a>

		<!-- `disabled` until hydration: the search needs JavaScript, and a box that swallows what you
		     type without answering is worse than one that admits it is not ready. -->
		<search class={['relative flex-1', !open && 'max-sm:hidden']}>
			<label class="sr-only" for="query">Fakt suchen</label>
			<span class="pointer-events-none absolute top-2 left-3 text-(--fgColor-muted)">
				{@render octicon('search')}
			</span>
			<!-- The emphasis border, not Primer's default `#d1d9e0`: that one is 1.4:1 against the page,
			     and WCAG wants 3:1 for the edge of a control. 16 px below Primer's medium breakpoint, as
			     Primer's own form control does there: Safari on an iPhone zooms into any input set
			     smaller, and stays zoomed once the box is closed. -->
			<input
				bind:this={input}
				id="query"
				type="search"
				bind:value={query}
				onfocus={() => ask('')}
				onkeydown={async (e) => {
					if (e.key !== 'Escape') return;
					// The list covers the page, so it needs a way out that is not the mouse. Once it is
					// empty, Escape folds the search away again on a narrow screen.
					if (query) query = '';
					else if (open) {
						open = false;
						await tick();
						toggle?.focus();
					}
				}}
				disabled={!clock.today}
				placeholder="Fakt suchen"
				class="block h-8 w-full rounded-md border border-(--borderColor-emphasis) bg-(--bgColor-default) pr-3 pl-9 text-base placeholder:text-(--fgColor-muted) focus-visible:border-(--borderColor-accent-emphasis) focus-visible:outline-offset-[-1px] disabled:bg-(--bgColor-disabled) md:text-sm"
			/>

			<!-- Out of sight but always in the DOM, or the count is not reliably announced; the visible
			     copy in the panel is `aria-hidden` so it is not read twice. See CLAUDE.md. -->
			<p role="status" class="sr-only">{hitSummary}</p>

			{#if hitSummary}
				<!-- Primer's Overlay with an ActionList in it. Absolutely positioned, so nothing here moves
				     the page: the panel is laid over it rather than wedged into it. `top-full` is the
				     bottom edge of this `search`, which is the input, because the other children are
				     out of flow. -->
				<div
					class="absolute inset-x-0 top-full z-10 mt-2 overflow-hidden rounded-md bg-(--overlay-bgColor) shadow-(--shadow-floating-small)"
				>
					<p aria-hidden="true" class="px-4 py-2 text-xs text-(--fgColor-muted)">{hitSummary}</p>
					{#if hits.length > 0}
						<!-- `max-h-80` caps it and scrolls: a common word matches every fact.
						     A hit closes the list by navigating, which empties the box in `afterNavigate`. -->
						<ul class="max-h-80 overflow-y-auto border-t border-(--borderColor-muted) p-2">
							{#each hits as t (t.date)}
								<li>
									<a
										href={resolve('/[date]', { date: t.date })}
										class="block rounded-md px-2 py-1.5 hover:bg-(--control-transparent-bgColor-hover)"
									>
										<span class="block text-sm">{longFormat.format(fromIsoDate(t.date))}</span>
										<!-- The default text colour on the highlight: the muted one is 3.4:1 on it in
										     dark mode, short of WCAG's 4.5:1. -->
										<span class="block text-xs text-(--fgColor-muted)"
											>{#each t.excerpt as piece, i (i)}{#if piece.mark}<mark
														class="bg-(--highlight-neutral-bgColor) text-(--fgColor-default)"
														>{piece.text}</mark
													>{:else}{piece.text}{/if}{/each}</span
										>
									</a>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/if}
		</search>

		<IconButton
			bind:element={toggle}
			icon={open ? 'x' : 'search'}
			label={open ? 'Suche schließen' : 'Suche öffnen'}
			action={toggleSearch}
			class="sm:hidden"
		/>
		<!-- Outside the `search` element: this is not a search, and the landmark should not claim
		     it. -->
		<IconButton
			icon="dice"
			label="Zufälliger Fakt"
			action={randomFact}
			disabled={otherFacts.length === 0}
			class={[open && 'max-sm:hidden']}
		/>
	</div>
</header>
