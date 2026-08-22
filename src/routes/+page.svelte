<script lang="ts">
	import { onMount } from 'svelte';
	import { loadFakten, renderFakt, toIsoDate, type Fakten } from '$lib/fakten';

	let fakten = $state<Fakten>();
	let fehler = $state<string>();

	const jetzt = new Date();
	const heute = toIsoDate(jetzt);
	const heuteLang = new Intl.DateTimeFormat('de-DE', { dateStyle: 'long' }).format(jetzt);
	const fakt = $derived(fakten?.get(heute));

	// Client-only on purpose: fetching at prerender time would bake the facts into the build and
	// break publishing content by editing the YAML on GitHub.
	onMount(async () => {
		try {
			fakten = await loadFakten();
		} catch (e) {
			fehler = e instanceof Error ? e.message : 'Die Fakten konnten nicht geladen werden.';
		}
	});
</script>

<svelte:head><title>Fakt des Tages</title></svelte:head>

<main class="mx-auto max-w-2xl p-6">
	<h1 class="text-3xl font-bold">Fakt des Tages</h1>
	<p class="mt-1 text-sm text-gray-600">{heuteLang}</p>

	<div class="mt-6">
		{#if fehler}
			<p role="alert" class="rounded border border-red-300 bg-red-50 p-4 text-red-800">{fehler}</p>
		{:else if !fakten}
			<p aria-busy="true" class="text-gray-600">Fakten werden geladen …</p>
		{:else if fakt}
			<!-- The YAML is a same-origin asset in this repo, so whoever can author a fact can
			     already author this app's JavaScript — it is not a trust boundary and needs no
			     sanitiser. Add one the moment facts come from anywhere but the repo. -->
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			<article class="prose">{@html renderFakt(fakt)}</article>
		{:else}
			<p class="text-gray-600">Für heute gibt es keinen Fakt.</p>
		{/if}
	</div>
</main>
