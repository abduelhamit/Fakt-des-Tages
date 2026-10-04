<script lang="ts">
	import FactPage from '$lib/FactPage.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<!-- Prerendered as `404.html`, which GitHub Pages serves for every address it has no file for —
     which includes every date without a fact. See CLAUDE.md, under "The home page". -->
<FactPage dates={data.dates} notFound />
