import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseFakten, renderFakt } from './fakten';

describe('parseFakten', () => {
	it('reads single-line and block-scalar entries', () => {
		const fakten = parseFakten(
			'2026-03-15: |\n  Ein **Fakt**.\n\n  Zweiter Absatz.\n2026-03-16: Kurz.\n'
		);
		expect([...fakten.keys()]).toEqual(['2026-03-15', '2026-03-16']);
		expect(fakten.get('2026-03-15')).toBe('Ein **Fakt**.\n\nZweiter Absatz.\n');
	});

	it('keeps date keys as strings under the default YAML 1.2 schema', () => {
		expect(parseFakten('2026-03-15: Ein Fakt.').has('2026-03-15')).toBe(true);
	});

	it('treats an empty file as no facts', () => {
		expect(parseFakten('').size).toBe(0);
	});

	it('accepts a real leap day', () => {
		expect(parseFakten('2024-02-29: Schalttag.').has('2024-02-29')).toBe(true);
	});

	it('rejects a document that is prose rather than a map of entries', () => {
		expect(() => parseFakten('Hier stehen noch keine Fakten.')).toThrow(/kein gültiges Format/);
	});

	it('rejects a duplicated date', () => {
		expect(() => parseFakten('2026-03-15: Erster\n2026-03-15: Zweiter\n')).toThrow(/fehlerhaft/);
	});

	it('names the offending key when a date is malformed', () => {
		expect(() => parseFakten('2026-3-15: Ein Fakt.')).toThrow(/2026-3-15/);
	});

	it('rejects a date that looks right but does not exist', () => {
		expect(() => parseFakten('2026-02-31: Ein Fakt.')).toThrow(/Ungültiges Datum/);
		expect(() => parseFakten('2026-02-29: Kein Schaltjahr.')).toThrow(/Ungültiges Datum/);
	});

	it('rejects an entry whose value is not text', () => {
		expect(() => parseFakten('2026-03-15:\n  fakt: verschachtelt\n')).toThrow(/kein Text/);
	});

	it('rejects an empty entry', () => {
		expect(() => parseFakten('2026-03-15: "   "')).toThrow(/leer/);
	});
});

describe('src/lib/fakten.yaml', () => {
	// The real file, not a fixture. A bad entry would also fail `pnpm build`, but this fails first
	// and prints the German message naming the key, which is a far clearer signal in CI.
	it('parses and is not empty', () => {
		const pfad = new URL('../fakten.yaml', import.meta.url);
		expect(parseFakten(readFileSync(pfad, 'utf8')).size).toBeGreaterThan(0);
	});

	// The images are in Git LFS, and a checkout without it substitutes a ~130-byte pointer file for
	// each one. That builds and deploys perfectly green, and the first sign of trouble is every
	// image on the site broken at once — so the gate has to be what notices. Covers a mistyped path
	// too.
	it('references images that exist and are real files, not LFS pointers', () => {
		// Over the parsed entries, not the raw file: the header comment carries an example path.
		const fakten = [
			...parseFakten(readFileSync(new URL('../fakten.yaml', import.meta.url), 'utf8')).values()
		];
		const pfade = fakten.flatMap((f) =>
			[...f.matchAll(/!\[[^\]]*\]\((fakten\/[^)]+)\)/g)].map((t) => t[1])
		);
		expect(pfade.length).toBeGreaterThan(0);

		for (const pfad of new Set(pfade)) {
			const datei = new URL(`../../../static/${pfad}`, import.meta.url);
			const kopf = readFileSync(datei).subarray(0, 42).toString('binary');
			expect(kopf, `${pfad} ist eine LFS-Zeigerdatei`).not.toContain('git-lfs.github.com');
		}
	});
});

describe('renderFakt', () => {
	it('renders CommonMark to HTML synchronously', () => {
		expect(renderFakt('Ein **Fakt** mit [Link](https://example.com).')).toContain(
			'<strong>Fakt</strong>'
		);
	});
});
