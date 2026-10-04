<script lang="ts">
	import { resolve } from '$app/paths';
	import FactPage from '$lib/FactPage.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Today is the visitor's, so only the browser knows it. This runs in the head, before the page
	// paints: a day with a fact is a page of its own, so go there; a day without one has none, so
	// put the date in the address bar and let this page — the calendar — show it. Duplicates
	// `toIsoDate`, because it runs before any module has loaded. The dates are ISO strings checked
	// by `parseFacts`, so the JSON cannot close the script tag. The closing tag is split in two
	// because a literal one would end this component's own `<script>` block.
	const root = resolve('/').replace(/\/?$/, '/');
	const script = $derived(
		`<script>{
		const p = (n) => String(n).padStart(2, '0'), d = new Date();
		const today = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
		if (${JSON.stringify(data.dates)}.includes(today)) location.replace('${root}' + today);
		else history.replaceState(null, '', '${root}' + today);
	}</` + 'script>'
	);
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags -- built from the facts file, see above -->
<svelte:head>{@html script}</svelte:head>
<FactPage dates={data.dates} />
