import { readFileSync } from 'node:fs';
import { imageMeta } from 'image-meta';
import { Marked, Renderer, type Token } from 'marked';
import YAML from 'yaml';
import source from '#lib/facts.yaml?raw';
import probe from '#lib/facts.probe.yaml?raw';
import { isIsoDate, type FactHtml } from '#lib/facts.ts';

// Everything here runs at build time only. It lives under `src/lib/server/` so that SvelteKit *fails
// the build* if it is ever imported from client code — which is what keeps `yaml` and `marked` out
// of the browser bundle, rather than relying on tree-shaking to notice.

/**
 * Parse the facts file. Throws a German `Error` on anything malformed: per the project's chosen
 * policy a single bad entry fails the whole load, so the message always names what to fix. Since
 * this runs during prerendering, that failure stops the build instead of reaching a visitor.
 */
export function parseFacts(text: string): Map<string, string> {
	let data: unknown;
	try {
		data = YAML.parse(text);
	} catch (cause) {
		// The library's line/column detail is the useful part, so keep it after the German prefix.
		const detail = cause instanceof Error ? cause.message : String(cause);
		throw new Error(`Die Faktendatei ist fehlerhaft: ${detail}`, { cause });
	}

	// An empty file is a legitimate "no facts yet", not an error.
	if (data == null) return new Map();

	if (typeof data !== 'object' || Array.isArray(data)) {
		throw new Error('Die Faktendatei hat kein gültiges Format.');
	}

	const facts = new Map<string, string>();
	for (const [date, fact] of Object.entries(data)) {
		if (!isIsoDate(date)) {
			throw new Error(`Ungültiges Datum in der Faktendatei: „${date}“ (erwartet: JJJJ-MM-TT).`);
		}
		if (typeof fact !== 'string' || fact.trim() === '') {
			throw new Error(`Der Fakt für ${date} ist leer oder kein Text.`);
		}
		facts.set(date, fact);
	}
	return facts;
}

let archive: Map<string, string> | undefined;

/**
 * The site's facts file, parsed once per build. The layout, every date page and the search file
 * all read it, and prerendering calls each of their loads separately, so without the cache the
 * whole file would be parsed again for every page. Lazy rather than at import, so the unit tests
 * of the functions in this file do not depend on the real file being valid.
 *
 * `FACTS_PROBE=1`, set by [playwright.config.ts](../../../playwright.config.ts), swaps in the
 * fixture, so the e2e suite does not depend on the site's content: editing `facts.yaml` can then
 * break the build, but never a test. Read here, during prerendering, rather than in a Vite plugin.
 */
export function facts(): Map<string, string> {
	return (archive ??= parseFacts(process.env.FACTS_PROBE === '1' ? probe : source));
}

const THEME = /#(light|dark)-mode-only$/;

/**
 * Every image links to its own file, which is the whole zoom feature: the browser's image viewer
 * already toggles between fit-to-window and 100 % on click, pinches on a phone and zooms with the
 * keyboard, and it works without JavaScript. The `href` is read back out of marked's own `<img>`
 * so it carries exactly the encoded URL the image does; for a URL it cannot encode marked returns
 * the bare alt text instead, and there is then nothing to link. A private instance, so the global
 * `marked` stays stock for anything else that imports it.
 *
 * Each image also gets its file's own `width` and `height`, so the browser reserves its box before
 * the bytes arrive and the text below it does not jump. Preflight's `height: auto` keeps the
 * displayed size exactly what it was. The path is read against `static/` from the working
 * directory, which is the project root under both `vite build` and vitest. An image that cannot be
 * measured — a mistyped path, an LFS pointer, a remote URL, a header declaring an impossible size
 * — fails the build, naming the path.
 *
 * The fragments `#light-mode-only` and `#dark-mode-only` mark an image pair of which only the one
 * for the visitor's color scheme shows. The fragment is the entry's way of saying so, not part of
 * the file's URL, so it is cut off before rendering and measuring, and the link carries a
 * `data-theme-only` for layout.css instead: a class would drop it out of `a:not([class])` and move
 * its focus ring. Lazy, because a lazy image under `display: none` is never fetched.
 */
const markdown = new Marked({
	renderer: {
		image(token) {
			const theme = THEME.exec(token.href);
			const href = token.href.replace(THEME, '');
			const img = Renderer.prototype.image.call(this, { ...token, href });
			const src = /^<img src="([^"]*)"/.exec(img)?.[1];
			if (!src) return img;
			let size;
			try {
				size = imageMeta(readFileSync(`static/${href}`));
			} catch (cause) {
				const detail = cause instanceof Error ? cause.message : String(cause);
				throw new Error(`Das Bild „${href}“ lässt sich nicht vermessen: ${detail}`, {
					cause
				});
			}
			const lazy = theme ? ' loading="lazy"' : '';
			const only = theme ? ` data-theme-only="${theme[1]}"` : '';
			const dimensions = `${lazy} width="${size.width}" height="${size.height}">`;
			return `<a href="${src}"${only}>${img.replace(/>$/, dimensions)}</a>`;
		}
	}
});

/**
 * CommonMark → HTML. `async: false` picks marked's synchronous overload, which returns `string`.
 * An unpaired theme image would leave the other color scheme with no picture at all, so it fails
 * the build; `walkTokens` reaches images inside links and list items too.
 */
export function renderFact(text: string): FactHtml {
	const themed: string[] = [];
	markdown.walkTokens(markdown.lexer(text), (t) => {
		if (t.type === 'image' && THEME.test(t.href)) themed.push(t.href);
	});
	if (themed.filter((href) => href.endsWith('#light-mode-only')).length * 2 !== themed.length) {
		const paths = themed.map((href) => `„${href}“`).join(', ');
		throw new Error(
			`Bilder für das helle und das dunkle Farbschema kommen nur paarweise vor: ${paths}`
		);
	}
	return markdown.parse(text, { async: false }) as FactHtml;
}

/** Tokens that end a run of text, so what comes after them must not weld onto it. */
const BLOCKS = new Set(['paragraph', 'heading', 'list_item', 'blockquote', 'code', 'br']);

/**
 * The readable text of one fact, for the search and the page description, straight from the
 * Markdown. A walk over marked's tokens rather than its `TextRenderer`: that one hands back an
 * emphasis as raw Markdown, so the credit line `_Foto: [Name](https://…)_` came out with its URL.
 * Links contribute their text and never their target or title, which is what keeps `example` and
 * every `commons.wikimedia.org` out of the index.
 *
 * An image contributes its alt text, padded, because runs of images sit back to back and their
 * descriptions would otherwise weld into one word. Block-level tokens are padded for the same
 * reason. Only ordinary whitespace is collapsed: U+00A0 and U+202F stay, since the description is
 * read by people and the search splits on them anyway.
 *
 * Given `aside`, the alt texts and credit lines go there instead, so the search can weigh what
 * describes a picture below what the fact says. A credit is an emphasis straight after an image,
 * the structure the credit spacing in layout.css matches too, so it is found by its place rather
 * than its wording.
 */
export function factText(text: string, aside?: string[]): string {
	const tidy = (read: string) => read.replace(/[\t\n\r ]+/g, ' ').trim();
	const walk = (tokens: Token[]): string =>
		tokens
			.map((t, i) => {
				let before = i - 1;
				while (tokens[before]?.type === 'text' && !tokens[before].raw.trim()) before--;
				const about =
					t.type === 'image'
						? t.text
						: t.type === 'em' && tokens[before]?.type === 'image'
							? walk(t.tokens ?? [])
							: undefined;
				if (about !== undefined) {
					aside?.push(tidy(about));
					return aside ? ' ' : ` ${about} `;
				}
				if (t.type === 'html') return '';
				if (t.type === 'list') return walk(t.items);
				const inner =
					'tokens' in t && t.tokens ? walk(t.tokens) : 'text' in t ? String(t.text) : '';
				return BLOCKS.has(t.type) ? ` ${inner} ` : inner;
			})
			.join('');
	return tidy(walk(markdown.lexer(text)));
}
