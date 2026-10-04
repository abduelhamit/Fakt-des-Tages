<script lang="ts">
	import { PROVIDER } from '$lib/provider';
	import { resolve } from '$app/paths';
</script>

<svelte:head><title>Impressum — Fakt des Tages</title></svelte:head>

<!-- The address block twice, because § 5 DDG and § 18 Abs. 2 MStV each want it in their own
     section and a reader is entitled to find it under either heading. One snippet rather than two
     copies, for the same reason `provider.ts` exists at all. -->
{#snippet address()}
	<p class="hyphens-none">
		{PROVIDER.name}<br />
		{#each PROVIDER.address as line, i (i)}{line}<br />{/each}
	</p>
{/snippet}

<main class="mx-auto max-w-2xl p-6 hyphens-auto">
	<h1 class="text-3xl font-bold">Impressum</h1>

	<div class="prose mt-6">
		<h2>Angaben gemäß § 5 DDG</h2>
		{@render address()}

		<h2>Kontakt</h2>
		<p class="hyphens-none">
			E-Mail: <a href="mailto:{PROVIDER.email}">{PROVIDER.email}</a>
		</p>

		<!-- A fact published every weekday, written and edited rather than merely collected, reads as
		     a „journalistisch-redaktionell gestaltetes Angebot“. Whether it really is one is arguable;
		     naming the responsible person costs a line and settles the question either way. -->
		<h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
		{@render address()}

		<!-- `data-sveltekit-reload`, like every link to `/`: today's date is picked by an inline script
		     in that page's head, and only a real page load runs it. Routed client-side, the link would
		     land on the calendar with no day chosen. See CLAUDE.md, under "The home page". -->
		<p><a href={resolve('/')} data-sveltekit-reload>Zum Fakt des Tages</a></p>
	</div>
</main>
