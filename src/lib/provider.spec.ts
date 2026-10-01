import { describe, expect, it } from 'vitest';
import { PROVIDER } from './provider';

describe('PROVIDER', () => {
	// This runs in the deploy gate, so an Impressum with a placeholder address cannot reach the
	// live site. A missing Impressum is a legal problem; a fake one is a worse one, and neither
	// `pnpm build` nor `pnpm lint` would notice either.
	it('carries no unfilled placeholder', () => {
		const unfilled = Object.values(PROVIDER)
			.flat()
			.filter((value) => value.includes('AUSFÜLLEN'));
		expect(unfilled, `still to fill in: ${unfilled.join(', ')}`).toEqual([]);
	});

	// § 5 DDG asks for „schnelle elektronische Kontaktaufnahme“, which a bouncing address is not.
	// Cheap to assert, and the kind of thing a copy-paste slip breaks silently.
	it('has a plausible contact address', () => {
		expect(PROVIDER.email).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i);
		expect(PROVIDER.email).not.toContain('noreply');
	});
});
