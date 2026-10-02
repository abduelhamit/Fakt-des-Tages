import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseFacts, renderFact } from './facts';

describe('parseFacts', () => {
	it('reads single-line and block-scalar entries', () => {
		const facts = parseFacts(
			'2026-03-15: |\n  Ein **Fakt**.\n\n  Zweiter Absatz.\n2026-03-16: Kurz.\n'
		);
		expect([...facts.keys()]).toEqual(['2026-03-15', '2026-03-16']);
		expect(facts.get('2026-03-15')).toBe('Ein **Fakt**.\n\nZweiter Absatz.\n');
	});

	it('keeps date keys as strings under the default YAML 1.2 schema', () => {
		expect(parseFacts('2026-03-15: Ein Fakt.').has('2026-03-15')).toBe(true);
	});

	it('treats an empty file as no facts', () => {
		expect(parseFacts('').size).toBe(0);
	});

	it('accepts a real leap day', () => {
		expect(parseFacts('2024-02-29: Schalttag.').has('2024-02-29')).toBe(true);
	});

	it('rejects a document that is prose rather than a map of entries', () => {
		expect(() => parseFacts('Hier stehen noch keine Fakten.')).toThrow(/kein gültiges Format/);
	});

	it('rejects a duplicated date', () => {
		expect(() => parseFacts('2026-03-15: Erster\n2026-03-15: Zweiter\n')).toThrow(/fehlerhaft/);
	});

	it('names the offending key when a date is malformed', () => {
		expect(() => parseFacts('2026-3-15: Ein Fakt.')).toThrow(/2026-3-15/);
	});

	it('rejects a date that looks right but does not exist', () => {
		expect(() => parseFacts('2026-02-31: Ein Fakt.')).toThrow(/Ungültiges Datum/);
		expect(() => parseFacts('2026-02-29: Kein Schaltjahr.')).toThrow(/Ungültiges Datum/);
	});

	it('rejects an entry whose value is not text', () => {
		expect(() => parseFacts('2026-03-15:\n  fakt: verschachtelt\n')).toThrow(/kein Text/);
	});

	it('rejects an empty entry', () => {
		expect(() => parseFacts('2026-03-15: "   "')).toThrow(/leer/);
	});
});

describe('src/lib/facts.yaml', () => {
	// The real file, not a fixture. A bad entry would also fail `pnpm build`, but this fails first
	// and prints the German message naming the key, which is a far clearer signal in CI.
	it('parses and is not empty', () => {
		const file = new URL('../facts.yaml', import.meta.url);
		expect(parseFacts(readFileSync(file, 'utf8')).size).toBeGreaterThan(0);
	});

	// The images are in Git LFS, and a checkout without it substitutes a ~130-byte pointer file for
	// each one. That builds and deploys perfectly green, and the first sign of trouble is every
	// image on the site broken at once — so the gate has to be what notices. Covers a mistyped path
	// too.
	it('references images that exist and are real files, not LFS pointers', () => {
		// Over the parsed entries, not the raw file: the header comment carries an example path.
		const facts = [
			...parseFacts(readFileSync(new URL('../facts.yaml', import.meta.url), 'utf8')).values()
		];
		const paths = facts.flatMap((f) =>
			[...f.matchAll(/!\[[^\]]*\]\((fakten\/[^)]+)\)/g)].map((t) => t[1])
		);
		expect(paths.length).toBeGreaterThan(0);

		for (const path of new Set(paths)) {
			const file = new URL(`../../../static/${path}`, import.meta.url);
			const head = readFileSync(file).subarray(0, 42).toString('binary');
			expect(head, `${path} is an LFS pointer file`).not.toContain('git-lfs.github.com');
		}
	});
});

describe('renderFact', () => {
	it('renders CommonMark to HTML synchronously', () => {
		expect(renderFact('Ein **Fakt** mit [Link](https://example.com).')).toContain(
			'<strong>Fakt</strong>'
		);
	});

	it('links every image to its own file, which is how it opens at 100 %', () => {
		expect(renderFact('![Ein Bild](fakten/2026-03-06-1.avif)')).toContain(
			'<a href="fakten/2026-03-06-1.avif"><img src="fakten/2026-03-06-1.avif" alt="Ein Bild" width="1600" height="745"></a>'
		);
	});

	it('fails on an image it cannot measure, naming the path', () => {
		expect(() => renderFact('![Fehlt](fakten/1999-01-01-1.jpg)')).toThrow(
			/fakten\/1999-01-01-1\.jpg/
		);
	});
});
