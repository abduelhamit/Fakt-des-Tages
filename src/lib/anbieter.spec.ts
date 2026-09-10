import { describe, expect, it } from 'vitest';
import { ANBIETER } from './anbieter';

describe('ANBIETER', () => {
	// This runs in the deploy gate, so an Impressum with a placeholder address cannot reach the
	// live site. A missing Impressum is a legal problem; a fake one is a worse one, and neither
	// `pnpm build` nor `pnpm lint` would notice either.
	it('carries no unfilled placeholder', () => {
		const offen = Object.values(ANBIETER)
			.flat()
			.filter((wert) => wert.includes('AUSFÜLLEN'));
		expect(offen, `noch auszufüllen: ${offen.join(', ')}`).toEqual([]);
	});

	// § 5 DDG asks for „schnelle elektronische Kontaktaufnahme“, which a bouncing address is not.
	// Cheap to assert, and the kind of thing a copy-paste slip breaks silently.
	it('has a plausible contact address', () => {
		expect(ANBIETER.email).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i);
		expect(ANBIETER.email).not.toContain('noreply');
	});
});
