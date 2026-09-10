<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { resolve } from '$app/paths';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}

<!-- In the layout rather than the home page, so „leicht erkennbar, unmittelbar erreichbar“ holds
     on every route — including from one legal page to the other. Outside `<main>` on purpose: the
     home page's `<main>` carries `aria-busy` until hydration, and a footer that is never
     provisional has no business inside something that is.

     `resolve()` and not a bare `/impressum`: the site is served under `/Fakt-des-Tages`, and only
     `resolve` knows that. `base` from '$app/paths' would work too and is deprecated. -->
<footer class="mx-auto max-w-2xl px-6 pb-6 text-center text-sm text-gray-600">
	<a class="text-sky-800 hover:underline" href={resolve('/impressum')}>Impressum</a>
	<span aria-hidden="true"> · </span>
	<a class="text-sky-800 hover:underline" href={resolve('/datenschutz')}>Datenschutz</a>
</footer>
