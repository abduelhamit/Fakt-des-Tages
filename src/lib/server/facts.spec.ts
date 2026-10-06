import { describe, expect, it } from 'vitest';
import { factText, facts, parseFacts, renderFact } from './facts';

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
		expect(facts().size).toBeGreaterThan(0);
	});

	// The images are in Git LFS, and a checkout without it substitutes a ~130-byte pointer file for
	// each one. `renderFact` measures every image and throws on a pointer or a mistyped path, naming
	// it, so rendering every entry here is what makes the gate notice before the build does.
	it('renders every entry, which measures every image', () => {
		for (const [date, fact] of facts()) expect(() => renderFact(fact), date).not.toThrow();
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

describe('factText', () => {
	const text = factText(
		'Ein **fetter** [Verweis](https://example.com "Titel") mit Golden\\_Gate & Co.\n\n' +
			'![Erstes Bild](fakten/a.avif)![Zweites Bild](fakten/b.avif)\n' +
			'_Foto: [Name](https://commons.wikimedia.org/wiki/File:A.avif), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)_\n\n' +
			'Vor 35\u00a0Jahren, 25\u202fMio.'
	);

	it('keeps the words and drops the markup and every link target', () => {
		expect(text).toContain('Ein fetter Verweis mit Golden_Gate & Co.');
		expect(text).not.toMatch(/strong|example|Titel|commons|creativecommons|\*|_Foto/);
		expect(text).toContain('Foto: Name, CC BY 4.0');
	});

	it('reads images as their alt text without welding neighbours together', () => {
		expect(text).toContain('Erstes Bild Zweites Bild Foto:');
	});

	it('separates paragraphs and keeps the no-break spaces', () => {
		expect(text).toContain('Co. Erstes');
		expect(text).toContain('Vor 35\u00a0Jahren, 25\u202fMio.');
	});
});
