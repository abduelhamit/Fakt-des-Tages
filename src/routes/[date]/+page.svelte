<script lang="ts">
	import FactPage from '#lib/FactPage.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<FactPage dates={data.dates} fact={data} />
