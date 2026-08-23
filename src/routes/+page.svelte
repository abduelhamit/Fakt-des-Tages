<script lang="ts">
	import { onMount } from 'svelte';
	import { fromIsoDate, isIsoDate, monatsRaster, toIsoDate } from '$lib/fakten';
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
	const langesDatum = $derived(
		gewaehlt && fromIsoDate(gewaehlt).toLocaleDateString('de-DE', { dateStyle: 'long' })
	);
</script>

<svelte:head><title>Fakt des Tages</title></svelte:head>
<svelte:window onhashchange={ausHash} />

<main class="mx-auto max-w-2xl p-6">
	<h1 class="text-3xl font-bold">Fakt des Tages</h1>

	{#if gewaehlt && raster}
		<section class="mt-6" aria-label="Kalender">
			<div class="flex items-center justify-between">
				{@render pfeil('‹', 'Vorheriger Monat', angezeigt <= grenzen.von, () => verschiebe(-1))}
				<h2 class="font-semibold">{monatsName}</h2>
				{@render pfeil('›', 'Nächster Monat', angezeigt >= grenzen.bis, () => verschiebe(1))}
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
				<!-- Leading blanks push the 1st into its weekday column. Cheaper to read than a
				     `grid-column-start` on the first day, and there are at most six of them. -->
				{#each { length: raster.versatz }}
					<div></div>
				{/each}
				{#each raster.tage as datum, i (datum)}
					{@const hatFakt = data.fakten.has(datum)}
					{#if hatFakt || datum === heute}
						<!-- Today stays clickable even with no fact of its own: it is the ring the visitor
						     navigates back to, so it has to be pressable. -->
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
			</div>
		</section>

		<!-- Sticky, so a fact longer than the screen keeps its date and its navigation on screen.
		     The gradient is why there is no border under it: the text fades as it passes behind the
		     bar rather than being clipped at an invisible edge. A border would also have to appear
		     only once pinned, which CSS alone cannot tell — a fade is honest at every offset. -->
		<div
			bind:this={leiste}
			class="sticky top-0 -mx-6 mt-6 flex items-center justify-between bg-linear-to-b from-white from-60% to-transparent px-6 pt-2 pb-8"
		>
			{@render pfeil('‹', 'Vorheriger Fakt', !nachbarn.vorheriger, () =>
				springe(nachbarn.vorheriger)
			)}
			<p class="text-sm text-gray-600">{langesDatum}</p>
			{@render pfeil('›', 'Nächster Fakt', !nachbarn.naechster, () => springe(nachbarn.naechster))}
		</div>

		{#if fakt}
			<!-- The YAML is a same-origin file in this repo, rendered at build time, so whoever can
				     author a fact can already author this app's JavaScript — it is not a trust boundary
				     and needs no sanitiser. Add one the moment facts come from anywhere but the repo. -->
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			<article bind:this={fakttext} class="prose">{@html fakt}</article>
		{:else}
			<p bind:this={fakttext} class="text-gray-600">
				{gewaehlt === heute
					? 'Für heute gibt es keinen Fakt.'
					: 'Für diesen Tag gibt es keinen Fakt.'}
			</p>
		{/if}
	{:else}
		<!-- Shown from first paint until hydration reads the clock. Nothing is actually being
		     fetched; only the visitor's date is unknown before then. -->
		<p aria-busy="true" class="mt-6 text-gray-600">Fakten werden geladen …</p>
	{/if}
</main>

<!--
	Every arrow on the page: the two that page the calendar and the two beside the fact. They carry
	`aria-disabled` rather than the native attribute for the reason spelled out on `verschiebe`,
	which is why each caller passes a handler that re-checks its own bound.
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
