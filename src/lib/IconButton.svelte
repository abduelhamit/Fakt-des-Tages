<script module lang="ts">
	// Octicons by GitHub, MIT license: the 16 px paths from @primer/octicons 19.40.0, copied rather
	// than installed — five icons do not need a dependency. The dice's two paths are joined into one.
	const ICONS = {
		'chevron-left':
			'M9.78 12.78a.75.75 0 0 1-1.06 0L4.47 8.53a.75.75 0 0 1 0-1.06l4.25-4.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042L6.06 8l3.72 3.72a.75.75 0 0 1 0 1.06Z',
		'chevron-right':
			'M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z',
		search:
			'M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z',
		x: 'M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z',
		dice: 'M13.25 1c.966 0 1.75.784 1.75 1.75v10.5c0 .464-.184.909-.513 1.237A1.746 1.746 0 0 1 13.25 15H2.75c-.464 0-.909-.184-1.237-.513A1.746 1.746 0 0 1 1 13.25V2.75C1 1.784 1.784 1 2.75 1h10.5ZM2.75 2.5a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25V2.75a.25.25 0 0 0-.25-.25H2.75ZM5 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm6-6a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM8 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z'
	};
	type Icon = keyof typeof ICONS;
	export { octicon };
</script>

<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import type { ClassValue } from 'svelte/elements';
	import { clock } from '#lib/today.svelte.ts';

	/**
	 * Primer's invisible IconButton, for every icon-only control on the site: the calendar's month
	 * arrows, the fact arrows and the header's buttons. `action` decides the element — a function
	 * makes a button, a path a link, and no path a link at the edge of the archive. Both go inert
	 * through `aria-disabled` rather than natively: a control that goes natively `disabled` under the
	 * visitor who just pressed it drops keyboard focus to `<body>` with no announcement, which is
	 * exactly the moment they need it most. So a bounded link loses its `href` but keeps its role and
	 * its `tabindex`, and a bounded button keeps its focus but loses its handler. A button is also
	 * inert until hydration: it does nothing without JavaScript, so it must not look as if it would.
	 * `fgColor-disabled` is only acceptable on an *inactive* control, which WCAG exempts.
	 */
	let {
		icon,
		label,
		action,
		disabled = false,
		element = $bindable(),
		class: className
	}: {
		icon: Icon;
		label: string;
		action: ResolvedPathname | undefined | (() => void);
		/** Buttons only: a link is bounded by having no `action`. */
		disabled?: boolean;
		element?: HTMLElement;
		class?: ClassValue;
	} = $props();

	/**
	 * Primer's tooltip: the control's name on hover and on keyboard focus, in a `hint` popover
	 * anchored to the control by `source`. A hint popover leaves an open `auto` one alone and closes
	 * on Escape by itself; where `hint` is unknown it falls back to `manual`, which does not — hence
	 * the `keydown`. Listening on the wrapper rather than the control keeps a pointer that moves onto
	 * the tooltip inside, so it stays up (WCAG 1.4.13), while a click on it does not press the
	 * control. Mouse only: after a tap there is no `pointerleave` to take it down again.
	 */
	let tip = $state<HTMLElement>();
	const show = () => tip?.togglePopover({ force: true, source: element });
	const hide = () => tip?.togglePopover(false);
</script>

{#snippet octicon(icon: Icon)}
	<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
		<path d={ICONS[icon]} />
	</svg>
{/snippet}

<svelte:window onkeydown={(e) => e.key === 'Escape' && hide()} />

<!-- The two branches repeat the class list; keep them in step. The wrapper's pointer handlers only
     raise the tooltip, which keyboard focus raises too, so the span needs no role of its own. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<span
	class={['inline-flex', className]}
	onpointerenter={(e) => e.pointerType === 'mouse' && show()}
	onpointerleave={hide}
	onfocusin={() => element?.matches(':focus-visible') && show()}
	onfocusout={hide}
>
	{#if typeof action !== 'function'}
		<a
			bind:this={element}
			href={action}
			role={action ? undefined : 'link'}
			tabindex={action ? undefined : 0}
			aria-disabled={!action}
			aria-label={label}
			class="flex size-8 items-center justify-center rounded-md text-(--fgColor-muted) not-aria-disabled:hover:bg-(--control-transparent-bgColor-hover) not-aria-disabled:active:bg-(--control-transparent-bgColor-active) aria-disabled:cursor-default aria-disabled:text-(--fgColor-disabled)"
			>{@render octicon(icon)}</a
		>
	{:else}
		{@const inert = disabled || !clock.today}
		<button
			bind:this={element}
			type="button"
			onclick={inert ? undefined : action}
			aria-disabled={inert}
			aria-label={label}
			class="flex size-8 items-center justify-center rounded-md text-(--fgColor-muted) not-aria-disabled:hover:bg-(--control-transparent-bgColor-hover) not-aria-disabled:active:bg-(--control-transparent-bgColor-active) aria-disabled:cursor-default aria-disabled:text-(--fgColor-disabled)"
			>{@render octicon(icon)}</button
		>
	{/if}
	<span bind:this={tip} popover="hint" aria-hidden="true" class="tooltip">{label}</span>
</span>
