<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import monaSans from '#lib/assets/fonts/mona-sans-latin.woff2';
	import Header from '#lib/Header.svelte';
	import { beforeNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { updated } from '$app/state';

	let { children } = $props();

	// After a deploy, the next step is a full page load, which brings the new date list that
	// +layout.ts otherwise keeps out. Canceled first, so the client-side step cannot race it. Back
	// is left alone: SvelteKit undoes a canceled one with `history.go`, and the step after it reloads.
	beforeNavigate(({ type, to, willUnload, cancel }) => {
		if (!updated.current || willUnload || !to || type === 'popstate') return;
		cancel();
		location.href = to.url.href;
	});
</script>

<!-- The font is preloaded because the stylesheet only names it, so the browser would otherwise find
     it late, after the CSS. The same hashed file as the `url()` in layout.css, so it is fetched
     once. -->
<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="preload" href={monaSans} as="font" type="font/woff2" crossorigin="anonymous" />
</svelte:head>
<Header />
{@render children()}

<!-- In the layout rather than the fact pages, so „leicht erkennbar, unmittelbar erreichbar“ holds
     on every route — including from one legal page to the other. Outside `<main>` on purpose: the
     fact pages' `<main>` keeps the scroll position and focus across a navigation, and the footer's
     links should not.

     `resolve()` and not a bare `/impressum`: the site is served under `/Fakt-des-Tages`, and only
     `resolve` knows that. `base` from '$app/paths' would work too and is deprecated. -->
<footer class="mx-auto max-w-2xl px-6 pb-6 text-center text-xs text-(--fgColor-muted)">
	<p>
		<a class="hover:text-(--fgColor-accent) hover:underline" href={resolve('/impressum')}
			>Impressum</a
		>
		<span aria-hidden="true"> · </span>
		<a class="hover:text-(--fgColor-accent) hover:underline" href={resolve('/datenschutz')}
			>Datenschutz</a
		>
	</p>
	<!-- CC BY-SA 4.0 requires the source, the license and a note that the text was changed. The
	     note sits here rather than under each fact because it applies to nearly all of them: one
	     per entry would be more precise, but it would have to be maintained per entry, and the
	     note nobody adds is the one that is missing. See CLAUDE.md. Underlined, unlike the two links
	     above, because these sit in running text in the text's own color. -->
	<p class="mt-2">
		Die Fakten beruhen überwiegend auf Artikeln der
		<a
			class="underline hover:text-(--fgColor-accent)"
			href="https://de.wikipedia.org/"
			aria-label="Deutschsprachige Wikipedia">deutsch-</a
		>
		und
		<a
			class="underline hover:text-(--fgColor-accent)"
			href="https://en.wikipedia.org/"
			aria-label="Englischsprachige Wikipedia">englischsprachigen</a
		>
		Wikipedia, teilweise bearbeitet, und stehen wie diese unter
		<a
			class="underline hover:text-(--fgColor-accent)"
			href="https://creativecommons.org/licenses/by-sa/4.0/deed.de">CC BY-SA 4.0</a
		>.
	</p>
</footer>
