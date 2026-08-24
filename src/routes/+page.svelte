<script lang="ts">
	import { onMount } from 'svelte';
	import {
		fromIsoDate,
		isIsoDate,
		KUERZESTE_SUCHE,
		monatsRaster,
		suchbegriff,
		suchterme,
		toIsoDate,
		worte
	} from '$lib/fakten';
	import type MiniSearch from 'minisearch';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

	// The visitor's clock is unknowable at build time, so it is read only after hydration. Until
	// then all three are undefined and nothing date-specific renders — that is what stops the build
	// day's fact from flashing on screen before being corrected.
	let heute = $state<string>();
	let gewaehlt = $state<string>();
	/** The first of the month on display. The arrows move it without changing the selection. */
	let monat = $state<Date>();

	/**
	 * The hash is the single source of truth for the selection, so a click, a shared link and the
	 * back button all arrive here by the same path — clicking a day only writes `location.hash` and
	 * waits for the `hashchange` to come back. An absent or malformed hash means today.
	 *
	 * Does nothing before hydration has read the clock, since today is the fallback.
	 */
	function ausHash() {
		if (!heute) return;
		let hash = location.hash.slice(1);
		try {
			// We never write an encoded hash ourselves, but a link can be percent-encoded in transit,
			// and `%2D` still has to find its day.
			hash = decodeURIComponent(hash);
		} catch {
			// Not valid percent-encoding — a hand-typed `#%` throws here. Keep the raw text and let
			// `isIsoDate` turn it down; an uncaught throw would strand the page on the placeholder.
		}
		gewaehlt = isIsoDate(hash) ? hash : heute;
		const tag = fromIsoDate(gewaehlt);
		monat = new Date(tag.getFullYear(), tag.getMonth(), 1);
	}

	onMount(() => {
		heute = toIsoDate(new Date());
		ausHash();
	});

	/**
	 * Back to today by dropping the hash, which is what an absent hash already means. `ausHash` is
	 * called by hand because `pushState` fires no `hashchange` — see CLAUDE.md, under "The location
	 * hash is the single source of truth", for that and for the two alternatives that do not work.
	 * `location.search` is carried over because assigning `location.hash` elsewhere preserves it,
	 * and dropping a query string only here would be a quiet inconsistency.
	 */
	function zurueckZuHeute() {
		if (!location.hash) return;
		history.pushState(null, '', location.pathname + location.search);
		ausHash();
	}

	/**
	 * Move the displayed month, if the archive reaches that far. The bound is enforced here and not
	 * only on the buttons, because they use `aria-disabled` rather than the native attribute: a
	 * button that goes natively `disabled` under the visitor who just pressed it drops keyboard
	 * focus to `<body>` with no announcement, which is exactly the moment they need it most.
	 */
	function verschiebe(schritte: number) {
		if (!monat) return;
		const ziel = new Date(monat.getFullYear(), monat.getMonth() + schritte, 1);
		const zielMonat = toIsoDate(ziel).slice(0, 7);
		if (zielMonat >= grenzen.von && zielMonat <= grenzen.bis) monat = ziel;
	}

	// Both measured by `springe`: the bar for its height, the fact for where it sits in normal flow.
	// `fakttext` is bound in each branch of the `{#if}` rather than on a wrapper — verified that the
	// ref survives the swap. A wrapper round the *bar* would not work at all: it would become
	// sticky's containing block and cap the bar's travel at its own height.
	let leiste = $state<HTMLElement>();
	let fakttext = $state<HTMLElement>();

	/** Jump to another day. Guarded here for the same reason `verschiebe` is: the button is only
	 * `aria-disabled`, so it stays clickable. */
	function springe(ziel: string | undefined) {
		if (!ziel) return;
		location.hash = ziel;
		if (!leiste || !fakttext) return;
		// Where the bar comes to rest. Asking the bar itself is useless: `offsetTop` on a *stuck*
		// sticky element reports where it is stuck — literally the scroll position — not where it
		// belongs, so the comparison below would always be false. The fact underneath it never
		// moves out of normal flow, so its top minus the bar's height is the honest answer.
		const anfang = fakttext.offsetTop - leiste.offsetHeight;
		// Upwards only. Scrolling unconditionally would shove the calendar off screen for a visitor
		// who was already at the top, which is the opposite of helpful.
		if (window.scrollY > anfang) window.scrollTo(0, anfang);
	}

	// The archive in date order. The YAML is in whatever order it was written in, and ISO dates sort
	// lexicographically, so this one `sort` is all the ordering the page needs.
	const chronologisch = $derived([...data.fakten.keys()].sort());
	// Both neighbours in one pass. The local `tag` is not ceremony: `gewaehlt` is reassignable, so
	// TypeScript drops the narrowing inside the callbacks without it.
	const nachbarn = $derived.by((): { vorheriger?: string; naechster?: string } => {
		const tag = gewaehlt;
		if (!tag) return {};
		return {
			vorheriger: chronologisch.findLast((datum) => datum < tag),
			naechster: chronologisch.find((datum) => datum > tag)
		};
	});

	// Never the fact already on screen: across an archive this size a repeat is common enough that
	// the button would look broken. See CLAUDE.md, under "The random fact".
	const andereFakten = $derived(chronologisch.filter((datum) => datum !== gewaehlt));

	/** Jump somewhere else in the archive, through `springe` like the arrows do. No length check:
	 *  an empty list indexes to `undefined`, which `springe` already turns down. */
	function zufall() {
		springe(andereFakten[Math.floor(Math.random() * andereFakten.length)]);
	}

	// How far the month arrows reach. Today and the selection count alongside the facts, so a
	// visitor who lands on a month outside the archive — which is every month, once the entries are
	// all in the past — still has a way back rather than two dead arrows.
	const grenzen = $derived.by(() => {
		// Only the outermost dates can decide the bounds, so four candidates settle it.
		const monate = [chronologisch[0], chronologisch.at(-1), heute, gewaehlt]
			.filter((datum) => datum !== undefined)
			.map((datum) => datum.slice(0, 7))
			.sort();
		// Empty strings disable both arrows, which is right for an empty archive.
		return { von: monate[0] ?? '', bis: monate.at(-1) ?? '' };
	});

	const angezeigt = $derived(monat ? toIsoDate(monat).slice(0, 7) : '');
	const raster = $derived(monat && monatsRaster(monat.getFullYear(), monat.getMonth()));
	const fakt = $derived(gewaehlt && data.fakten.get(gewaehlt));

	const monatsName = $derived(
		monat?.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
	);
	const langDatum = (iso: string) =>
		fromIsoDate(iso).toLocaleDateString('de-DE', { dateStyle: 'long' });
	const langesDatum = $derived(gewaehlt && langDatum(gewaehlt));

	// --- Suche ---------------------------------------------------------------------------------

	type Dokument = { datum: string; text: string };

	/** How many hits the list shows. Beyond this the list is longer than the calendar under it, and
	 *  a query that vague is better narrowed than scrolled. */
	const TREFFERGRENZE = 8;

	let suche = $state('');
	let treffer = $state<{ datum: string; ausschnitt: string }[]>([]);

	/**
	 * The index, built once on first contact with the input.
	 *
	 * MiniSearch is the only third-party code this page ships, so it stays behind a dynamic import:
	 * a visitor who never searches never downloads it, and it stays off the critical path. The text
	 * is recovered from the rendered HTML rather than shipped a second time — `DOMParser` gets
	 * entities and nested tags right, and searching the HTML itself would match `strong` and every
	 * `href` in the archive.
	 */
	let index: Promise<MiniSearch<Dokument>> | undefined;

	function baueIndex() {
		return (index ??= (async () => {
			const { default: Mini } = await import('minisearch');
			const mini = new Mini<Dokument>({
				fields: ['text'],
				storeFields: ['text'],
				idField: 'datum',
				// Applied to the stored terms and the query alike, so both sides fold the same way.
				processTerm: suchbegriff,
				// Indexing only — a query is tokenised with `worte`. See `suchterme`.
				tokenize: suchterme
			});
			mini.addAll([...data.fakten].map(([datum, html]) => ({ datum, text: nurText(html) })));
			return mini;
		})());
	}

	// `parseFromString` is stateless, so one parser serves the whole archive. Built on first use, not
	// here at the top: this script runs during prerendering too, where `DOMParser` does not exist —
	// an eager `new DOMParser()` fails the build outright with `DOMParser is not defined`.
	let leser: DOMParser | undefined;

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
	function nurText(html: string) {
		leser ??= new DOMParser();
		const doc = leser.parseFromString(html, 'text/html');
		for (const bild of [...doc.images]) bild.replaceWith(` ${bild.alt} `);
		return doc.body.textContent ?? '';
	}

	/**
	 * A window around the first term that matched, so a hit is recognisable without opening it.
	 * Falls back to the start of the fact when no term can be located — a fuzzy hit, or a soft
	 * hyphen inside the word, means the text does not always contain the query verbatim.
	 */
	function ausschnitt(text: string, terme: string[]) {
		const klein = text.toLowerCase();
		const stellen = terme.map((t) => klein.indexOf(t)).filter((i) => i >= 0);
		const von = Math.max(0, (stellen.length ? Math.min(...stellen) : 0) - 30);
		const bis = Math.min(text.length, von + 140);
		let stueck = text.slice(von, bis);
		// Both ends land mid-word otherwise, and the snippet reads as noise: „… berschrift, ebenfalls“.
		if (von > 0) stueck = stueck.replace(/^\S+\s*/, '');
		if (bis < text.length) stueck = stueck.replace(/\s*\S+$/, '');
		return (von > 0 ? '… ' : '') + stueck.trim() + (bis < text.length ? ' …' : '');
	}

	async function suchen(frage: string) {
		const gesucht = frage.trim();
		if (gesucht.length < KUERZESTE_SUCHE) {
			treffer = [];
			return;
		}
		const mini = await baueIndex();
		// Loading the module is asynchronous, so an earlier keystroke can land after a later one.
		// Reading `suche` here is deliberately outside the effect's tracking — it is a guard, not a
		// dependency: only the query still in the box may write the list.
		if (suche.trim() !== gesucht) return;
		// Every hit, ranked by score and capped at `TREFFERGRENZE`. Substring matching does let a short
		// query pick up unrelated tails — `turm` reaches `Kultur`, `Herzogtum` — but a real match always
		// scores several times a fuzzy tail, so they sort to the bottom rather than into the way. Do not
		// turn that into a relative cut: the gap is narrow enough at the bottom of the real matches to
		// take `Türmen` with it, which CLAUDE.md records as tried and reverted.
		treffer = mini
			.search(gesucht, { fuzzy: 0.2, prefix: true, tokenize: worte })
			.slice(0, TREFFERGRENZE)
			.map((t) => ({ datum: String(t.id), ausschnitt: ausschnitt(t.text, t.terms) }));
	}

	// Driven by an effect rather than `oninput`, so it cannot race `bind:value`: the effect runs
	// once the state has already moved.
	$effect(() => void suchen(suche));

	/** Emptying the box is what closes the list — the hash stays the only selection state. */
	function waehle(datum: string) {
		location.hash = datum;
		suche = '';
	}

	const meldung = $derived(
		suche.trim().length < KUERZESTE_SUCHE
			? ''
			: treffer.length === 0
				? 'Keine Treffer'
				: `${treffer.length} Treffer`
	);
</script>

<svelte:head><title>Fakt des Tages</title></svelte:head>
<svelte:window onhashchange={ausHash} />

<!-- `aria-busy` sits here and not on the paragraph below: until hydration reads the clock the
     calendar and the date bar are stand-ins too, and a visitor hears them long before they
     reach the line that says so. -->
<main class="mx-auto max-w-2xl p-6" aria-busy={!gewaehlt}>
	<!-- The title is the way back to today and to the canonical URL. Why a button and not a link,
	     and why `ausHash` is called by hand, is in CLAUDE.md. `disabled` and not `aria-disabled`:
	     this only ever flips once, at hydration, exactly like the search box below — the aria form
	     is for controls the visitor's own click can disable, where losing focus would strand them. -->
	<h1 class="text-3xl font-bold">
		<button onclick={zurueckZuHeute} disabled={!gewaehlt}>Fakt des Tages</button>
	</h1>

	<!-- `disabled` until hydration, unlike the calendar below it: the search needs no clock, but it
	     does need JavaScript. See CLAUDE.md, under "The search". -->
	<search class="relative mt-6 block">
		<label class="block text-sm font-medium text-gray-700" for="suche">Fakt suchen</label>
		<input
			id="suche"
			type="search"
			bind:value={suche}
			onfocus={baueIndex}
			onkeydown={(e) => {
				// The list covers the calendar, so it needs a way out that is not the mouse.
				if (e.key === 'Escape') suche = '';
			}}
			disabled={!gewaehlt}
			placeholder="z. B. Fernsehturm"
			class="mt-1 block w-full rounded border-gray-500 disabled:bg-gray-50"
		/>

		<!-- Out of sight but always in the DOM, or the count is not reliably announced; the visible
		     copy in the panel is `aria-hidden` so it is not read twice. See CLAUDE.md. -->
		<p role="status" class="sr-only">{meldung}</p>

		{#if meldung}
			<!-- Absolutely positioned, so nothing here moves the calendar: the panel is laid over the
			     page rather than wedged into it. `top-full` is the bottom edge of this `search`, which
			     is the input, because the only other children are out of flow. -->
			<div
				class="absolute inset-x-0 top-full z-10 mt-2 overflow-hidden rounded border border-gray-200 bg-white shadow-lg"
			>
				<p aria-hidden="true" class="px-3 py-2 text-sm text-gray-600">{meldung}</p>
				{#if treffer.length > 0}
					<!-- `max-h-80` caps it and scrolls: a full `TREFFERGRENZE` of hits is taller than a phone. -->
					<ul class="max-h-80 divide-y divide-gray-200 overflow-y-auto border-t border-gray-200">
						{#each treffer as t (t.datum)}
							<li>
								<button
									onclick={() => waehle(t.datum)}
									class="block w-full px-3 py-2 text-left hover:bg-sky-50"
								>
									<span class="block text-sm font-medium text-sky-900">{langDatum(t.datum)}</span>
									<span class="block text-sm text-gray-600">{t.ausschnitt}</span>
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
			onclick={zufall}
			aria-disabled={!gewaehlt || andereFakten.length === 0}
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
			{@render pfeil('‹', 'Vorheriger Monat', !monat || angezeigt <= grenzen.von, () =>
				verschiebe(-1)
			)}
			{#if monatsName}
				<h2 class="font-semibold">{monatsName}</h2>
			{:else}
				<div class="h-4 w-28 rounded bg-gray-200"></div>
			{/if}
			{@render pfeil('›', 'Nächster Monat', !monat || angezeigt >= grenzen.bis, () =>
				verschiebe(1)
			)}
		</div>

		<!-- Six day rows are always in the template, not just the ones this month fills: a grid is
		     four to six rows deep depending on where the 1st lands, and letting that vary would
		     shove the fact below up and down as the visitor pages through the months. `1fr`
		     sizes the empty rows to match the filled ones without naming a pixel height. -->
		<div class="mt-3 grid grid-cols-7 grid-rows-[auto_repeat(6,1fr)] gap-1 text-center text-sm">
			{#each WOCHENTAGE as tag (tag)}
				<!-- Decorative: every day carries its full date in `aria-label`, so a screen reader
				     never has to pair a bare number with a column heading. -->
				<div aria-hidden="true" class="pb-1 text-xs font-medium text-gray-500">{tag}</div>
			{/each}
			{#if raster}
				<!-- Leading blanks push the 1st into its weekday column. Cheaper to read than a
				     `grid-column-start` on the first day, and there are at most six of them. -->
				{#each { length: raster.versatz }}
					<div></div>
				{/each}
				{#each raster.tage as datum, i (datum)}
					{@const hatFakt = data.fakten.has(datum)}
					{#if hatFakt || datum === heute}
						<!-- Today stays clickable even with no fact of its own: it is the ring the visitor
						     navigates back to, so it has to be pressable.

						     The loading mock below copies this cell's height (`py-1.5` plus the grid's
						     `text-sm`, 32 px) as `h-8` and its `bg-sky-50` outright. Change either here and
						     change it there. The e2e test only half-covers this: `1fr` sizes each row to its
						     tallest cell, so moving the button without the factless `<span>` passes green,
						     and nothing tests the colour at all. -->
						<button
							onclick={() => (location.hash = datum)}
							aria-label={fromIsoDate(datum).toLocaleDateString('de-DE', { dateStyle: 'full' }) +
								(datum === gewaehlt ? ' (angezeigt)' : '')}
							aria-current={datum === heute ? 'date' : undefined}
							class={[
								'rounded py-1.5',
								datum === gewaehlt
									? 'bg-sky-700 font-semibold text-white'
									: hatFakt
										? 'bg-sky-50 font-medium text-sky-900 hover:bg-sky-100'
										: 'text-gray-600 hover:bg-gray-100',
								datum === heute && 'ring-2 ring-sky-900 ring-inset'
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
				{#each { length: 6 * WOCHENTAGE.length }, i}
					{@const werktag = i % WOCHENTAGE.length < 5}
					<div class={['flex h-8 items-center justify-center rounded', werktag && 'bg-sky-50']}>
						<div class={['h-2 w-4 rounded-full', werktag ? 'bg-sky-200' : 'bg-gray-200']}></div>
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
		bind:this={leiste}
		class="sticky top-0 -mx-6 mt-6 flex items-center justify-between bg-linear-to-b from-white from-60% to-transparent px-6 pt-2 pb-8"
	>
		{@render pfeil('‹', 'Vorheriger Fakt', !nachbarn.vorheriger, () =>
			springe(nachbarn.vorheriger)
		)}
		{#if langesDatum}
			<p class="text-sm text-gray-600">{langesDatum}</p>
		{:else}
			<div class="h-4 w-28 rounded bg-gray-200"></div>
		{/if}
		{@render pfeil('›', 'Nächster Fakt', !nachbarn.naechster, () => springe(nachbarn.naechster))}
	</div>

	{#if fakt}
		<!-- The YAML is a same-origin file in this repo, rendered at build time, so whoever can
		     author a fact can already author this app's JavaScript — it is not a trust boundary
		     and needs no sanitiser. Add one the moment facts come from anywhere but the repo. -->
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		<article bind:this={fakttext} class="prose">{@html fakt}</article>
	{:else if gewaehlt}
		<p bind:this={fakttext} class="text-gray-600">
			{gewaehlt === heute
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
	`aria-disabled` rather than the native attribute for the reason spelled out on `verschiebe`,
	which is why each caller passes a handler that re-checks its own bound. `gray-400` is only
	acceptable on an *inactive* control, which WCAG exempts; readable text stays at `gray-600`.

	A snippet rather than a hoisted `const` for the class list: Prettier's Tailwind plugin sorts
	classes inside a `class="..."` attribute and silently skips a `const`. Verified both ways.
-->
{#snippet pfeil(zeichen: string, beschriftung: string, gesperrt: boolean, betaetige: () => void)}
	<button
		onclick={betaetige}
		aria-disabled={gesperrt}
		aria-label={beschriftung}
		class="rounded px-3 py-1 text-xl leading-none text-sky-800 hover:bg-sky-50 aria-disabled:text-gray-400 aria-disabled:hover:bg-transparent"
		>{zeichen}</button
	>
{/snippet}
