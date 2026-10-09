<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { beforeNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { updated } from '$app/state';

	let { children } = $props();

	// After a deploy, the next step is a full page load, which brings the new date list that
	// +layout.ts otherwise keeps out. Cancelled first, so the client-side step cannot race it. Back
	// is left alone: SvelteKit undoes a cancelled one with `history.go`, and the step after it reloads.
	beforeNavigate(({ type, to, willUnload, cancel }) => {
		if (!updated.current || willUnload || !to || type === 'popstate') return;
		cancel();
		location.href = to.url.href;
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}

<!-- In the layout rather than the fact pages, so „leicht erkennbar, unmittelbar erreichbar“ holds
     on every route — including from one legal page to the other. Outside `<main>` on purpose: the
     fact pages' `<main>` keeps the scroll position and focus across a navigation, and the footer's
     links should not.

     `resolve()` and not a bare `/impressum`: the site is served under `/Fakt-des-Tages`, and only
     `resolve` knows that. `base` from '$app/paths' would work too and is deprecated. -->
<footer class="mx-auto max-w-2xl px-6 pb-6 text-center text-sm text-gray-600">
	<p>
		<a class="text-sky-800 hover:underline" href={resolve('/impressum')}>Impressum</a>
		<span aria-hidden="true"> · </span>
		<a class="text-sky-800 hover:underline" href={resolve('/datenschutz')}>Datenschutz</a>
	</p>
	<!-- CC BY-SA 4.0 requires the source, the licence and a note that the text was changed. The
	     note sits here rather than under each fact because it applies to nearly all of them: one
	     per entry would be more precise, but it would have to be maintained per entry, and the
	     note nobody adds is the one that is missing. See CLAUDE.md. -->
	<p class="mt-2">
		Die Fakten beruhen überwiegend auf Artikeln der
		<a
			class="text-sky-800 hover:underline"
			href="https://de.wikipedia.org/"
			aria-label="Deutschsprachige Wikipedia">deutsch-</a
		>
		und
		<a
			class="text-sky-800 hover:underline"
			href="https://en.wikipedia.org/"
			aria-label="Englischsprachige Wikipedia">englischsprachigen</a
		>
		Wikipedia, teilweise bearbeitet, und stehen wie diese unter
		<a
			class="text-sky-800 hover:underline"
			href="https://creativecommons.org/licenses/by-sa/4.0/deed.de">CC BY-SA 4.0</a
		>.
	</p>
</footer>
