/**
 * Who runs this site. One module because the details are needed twice and must not drift: § 5 DDG
 * wants them in the Impressum, and Art. 13 Abs. 1 lit. a DSGVO wants the same person named as
 * `Verantwortlicher` in the Datenschutzerklärung. Two hand-kept copies of a postal address are two
 * copies that eventually disagree, and the one that disagrees is the one nobody notices.
 *
 * This ships to the client, which is fine — every word of it is meant to be read by strangers.
 *
 * `address` has to stay a ladungsfähige Anschrift, a real street address that a court could
 * deliver post to; a Postfach does not satisfy the case law.
 * [provider.spec.ts](provider.spec.ts) fails on an `AUSFÜLLEN` marker, so a half-finished edit
 * cannot reach the live site — the same trick [server/facts.spec.ts](server/facts.spec.ts) plays
 * on a malformed facts file.
 */
export const PROVIDER = {
	name: 'Abdülhamit Yilmaz',
	address: ['Birkenstr. 79', '40233 Düsseldorf'],
	email: 'abduelhamit.yilmaz@gmail.com'
} as const;
