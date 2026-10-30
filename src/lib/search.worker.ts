// The search's index, in a worker of its own: holding every substring of the archive, it takes
// several hundred milliseconds to build on a phone, which on the main thread would freeze the box
// mid-keystroke. Started by Header.svelte once the page has loaded; see "The search" in
// src/routes/CLAUDE.md. MiniSearch is the only third-party code the browser gets, and only here.
import MiniSearch, { type SearchResult } from 'minisearch';
import { foldTerm, indexTerms, words } from '#lib/facts.ts';

type Doc = { date: string; prose: string; picture: string };
/** What Header.svelte asks: build the index from `url` if there is none, then answer `query`. An
 *  empty `query` only builds, which is what focusing the box does. */
export type Question = { url: string; query: string };
export type Answer = { query: string; hits: SearchResult[] } | { query: string; failed: true };

/**
 * Each fact's text twice: `…Word` holds its words, for typos; `…Part` holds every substring of
 * them, for everything else (see `indexTerms`). Typos never reach a part, because there one edit
 * from `zahn` is `ahn` and `bahn`, stored for every `Straßenbahn`. And all of that twice again:
 * `prose…` for what the fact says, `picture…` for its alt texts and credit lines, which `search`
 * weighs lower. `text`, stored for the excerpt, is both.
 */
export function createIndex(texts: Record<string, [string, string]>): MiniSearch<Doc> {
	const mini = new MiniSearch<Doc>({
		fields: ['proseWord', 'prosePart', 'pictureWord', 'picturePart'],
		storeFields: ['text'],
		idField: 'date',
		extractField: (doc, field) =>
			field.startsWith('prose')
				? doc.prose
				: field.startsWith('picture')
					? doc.picture
					: field === 'text'
						? `${doc.prose} ${doc.picture}`
						: doc.date,
		// A query is tokenized without a field, so by `words`: typing `turm` never also asks for `urm`.
		tokenize: (text, field) => (field?.endsWith('Part') ? indexTerms(text) : words(text)),
		// Applied to the stored terms and the query alike, so both sides fold the same way.
		processTerm: foldTerm
	});
	mini.addAll(Object.entries(texts).map(([date, [prose, picture]]) => ({ date, prose, picture })));
	return mini;
}

/**
 * Every hit, ranked by score. A query word counts where it occurs in the fact, exactly; only a fact
 * where it occurs nowhere may count it as a typo instead, so a typo never adds to a real hit.
 *
 * A picture's words count half. Measured on the real archive in October 2026, that ranks a word in
 * the prose first, the same word in an alt text next and a typo last, and a quarter would put a
 * real `Zähne` in an alt text below the typo `zehn`.
 */
export function search(mini: MiniSearch<Doc>, query: string): SearchResult[] {
	const part = (word: string) => ({ queries: [word], fields: ['prosePart', 'picturePart'] });
	return mini.search({
		combineWith: 'OR',
		queries: words(query).map((word) => ({
			combineWith: 'OR',
			queries: [
				part(word),
				{
					combineWith: 'AND_NOT',
					queries: [
						{ queries: [word], fields: ['proseWord', 'pictureWord'], fuzzy: 0.2 },
						part(word)
					]
				}
			]
		})),
		boost: { pictureWord: 0.5, picturePart: 0.5 }
	});
}

// A failed fetch forgets the promise, so the next question tries again.
let index: Promise<MiniSearch<Doc>> | undefined;

async function load(url: string) {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`search.json: ${response.status}`);
	return createIndex(await response.json());
}

// `globalThis.` rather than bare, so the unit test can import this module under Node.
globalThis.onmessage = async ({ data: { url, query } }: MessageEvent<Question>) => {
	let answer: Answer;
	try {
		const mini = await (index ??= load(url));
		answer = { query, hits: query ? search(mini, query) : [] };
	} catch {
		index = undefined;
		answer = { query, failed: true };
	}
	postMessage(answer);
};
