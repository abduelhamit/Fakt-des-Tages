<script lang="ts">
	import { onMount } from 'svelte';
	import { toIsoDate } from '$lib/fakten';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// The visitor's clock is unknowable at build time, so it is read only after hydration. Until
	// then `jetzt` is undefined and nothing date-specific renders — that is what stops the build
	// day's fact from flashing on screen before being corrected. No network is involved: the facts
	// are already in the page.
	let jetzt = $state<Date>();
	onMount(() => {
		jetzt = new Date();
	});

	const heute = $derived(jetzt && toIsoDate(jetzt));
	const heuteLang = $derived(
		jetzt && new Intl.DateTimeFormat('de-DE', { dateStyle: 'long' }).format(jetzt)
	);
	const fakt = $derived(heute && data.fakten.get(heute));
</script>

<svelte:head><title>Fakt des Tages</title></svelte:head>

<main class="mx-auto max-w-2xl p-6">
	<h1 class="text-3xl font-bold">Fakt des Tages</h1>

	{#if heute}
		<p class="mt-1 text-sm text-gray-600">{heuteLang}</p>

		<div class="mt-6">
			{#if fakt}
				<!-- The YAML is a same-origin file in this repo, rendered at build time, so whoever can
				     author a fact can already author this app's JavaScript — it is not a trust boundary
				     and needs no sanitiser. Add one the moment facts come from anywhere but the repo. -->
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				<article class="prose">{@html fakt}</article>
			{:else}
				<p class="text-gray-600">Für heute gibt es keinen Fakt.</p>
			{/if}
		</div>
	{:else}
		<!-- Shown from first paint until hydration reads the clock. Nothing is being fetched — the
		     facts are already in the page — but the visitor's date is not knowable before then. -->
		<p aria-busy="true" class="mt-6 text-gray-600">Fakten werden geladen …</p>
	{/if}
</main>
