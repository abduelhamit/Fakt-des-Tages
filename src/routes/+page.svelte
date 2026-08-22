<script lang="ts">
	import { onMount } from 'svelte';
	import { toIsoDate } from '$lib/fakten';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// The visitor's clock is unknowable at build time, so it is read only after hydration. Until
	// then `jetzt` is undefined and nothing date-specific renders — that is what stops the build
	// day's fact from flashing on screen before being corrected.
	let jetzt = $state<Date>();
	onMount(() => {
		jetzt = new Date();
	});

	const heuteLang = $derived(jetzt?.toLocaleDateString('de-DE', { dateStyle: 'long' }));
	const fakt = $derived(jetzt && data.fakten.get(toIsoDate(jetzt)));
</script>

<svelte:head><title>Fakt des Tages</title></svelte:head>

<main class="mx-auto max-w-2xl p-6">
	<h1 class="text-3xl font-bold">Fakt des Tages</h1>

	{#if jetzt}
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
		<!-- Shown from first paint until hydration reads the clock. Nothing is actually being
		     fetched; only the visitor's date is unknown before then. -->
		<p aria-busy="true" class="mt-6 text-gray-600">Fakten werden geladen …</p>
	{/if}
</main>
