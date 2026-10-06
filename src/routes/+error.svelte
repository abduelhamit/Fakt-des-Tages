<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import FactPage from '#lib/FactPage.svelte';

	const dates: readonly string[] | undefined = page.data.dates;
	let stuck = $state(false);

	// A client-side step to a date without a fact asks for a `__data.json` that does not exist, and
	// SvelteKit's root error page then lacks the layout's data too (sveltejs/kit#6124). Reloading
	// lets GitHub Pages answer with 404.html, which is the calendar for that day. Only after a
	// client-side step, never on a first load: that would just load this page again, forever. No
	// storage is needed to tell the two apart, which the Datenschutz page promises is never used.
	afterNavigate(({ type }) => {
		if (dates) return;
		if (type === 'enter') stuck = true;
		else location.reload();
	});
</script>

{#if dates && page.status === 404}
	<!-- `pnpm dev` renders a missing date here, with the layout's data intact. -->
	<FactPage {dates} notFound />
{:else if dates || stuck}
	<!-- Anything but a 404 says only that the page did not load, because that is all it knows: the
	     same 500 is a page whose code could not be fetched (a visitor gone offline after the page
	     loaded) and, in `pnpm dev`, a fact whose load threw, whose German error stays in the
	     terminal. Neither is a day without a fact. -->
	<main class="mx-auto max-w-2xl p-6">
		<p class="text-gray-600">Diese Seite konnte nicht geladen werden.</p>
		<p class="mt-2">
			<a class="text-sky-800 hover:underline" href={resolve('/')} data-sveltekit-reload
				>Zum Fakt des Tages</a
			>
		</p>
	</main>
{/if}
