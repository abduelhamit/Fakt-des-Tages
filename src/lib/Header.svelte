<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { afterNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import {
		excerpt,
		foldTerm,
		fromIsoDate,
		indexTerms,
		MIN_QUERY_LENGTH,
		words
	} from '#lib/facts.ts';
	import IconButton, { octicon } from '#lib/IconButton.svelte';
	import { clock, startClock } from '#lib/today.svelte.ts';
	import type MiniSearch from 'minisearch';

	/**
	 * The header along the top of every page, like github.com's: the way back to today, the search
	 * and the random fact. In the layout, so the legal pages and the error page have all three too.
	 * Below Primer's small breakpoint the search folds into a button that opens it over the header.
	 */

	// Missing on an error page whose layout data could not be loaded; see +error.svelte.
	const dates: readonly string[] = $derived(page.data.dates ?? []);

	onMount(() => {
		startClock();
		// MiniSearch, fetched once everything else has — images included — so it never competes
		// with the page, yet sits in memory before anyone searches. Fetched on demand instead, it
		// failed for good: a browser that caches a failed import never asks again, and a deploy
		// deletes the chunk an open tab would ask for. A failure here surfaces on the next search.
		const preload = () => void import('minisearch').catch(() => {});
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

	type Doc = { date: string; text: string };

	let query = $state('');
	// Raw: only ever replaced, never mutated, so a deep proxy per hit would buy nothing.
	let hits = $state.raw<{ date: string; excerpt: string }[]>([]);
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
		// Every hit, ranked by score. Substring matching does let a short query pick up unrelated
		// tails — `turm` reaches `Kultur`, `Herzogtum` — but a real match always scores several times
		// a fuzzy tail, so they sort to the bottom rather than into the way. Do not turn that into a
		// relative cut: the gap is narrow enough at the bottom of the real matches to take `Türmen`
		// with it, which CLAUDE.md records as tried and reverted.
		hits = mini
			.search(trimmed, { fuzzy: 0.2, prefix: true, tokenize: words })
			.map((t) => ({ date: String(t.id), excerpt: excerpt(t.text, t.terms) }));
	}

	// Driven by an effect rather than `oninput`, so it cannot race `bind:value`: the effect runs
	// once the state has already moved.
	$effect(() => void runSearch(query));

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
				onfocus={() => buildIndex().catch(() => {})}
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
										<span class="block text-xs text-(--fgColor-muted)">{t.excerpt}</span>
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
