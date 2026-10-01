# CLAUDE.md — src/routes

How the page itself behaves and why: the loading placeholder, the calendar, the sticky bar, the
search, the random fact, and the legal pages. Read with the root [CLAUDE.md](../../CLAUDE.md),
which covers the content pipeline, adding a fact, the build and the tests.

Which text is German and which English is settled there, under "German and English". Two
consequences surface here more than anywhere else. The e2e titles are English while every locator
they use matches German page text (`getByRole('button', { name: 'Nächster Fakt' })`), so changing a
UI string breaks the tests that look it up, whatever language the titles are in. And the routes
`/impressum` and `/datenschutz` keep their German names: they are public URLs, not identifiers.

## The visitor's clock cannot be known at build time

This is the one thing SSG genuinely costs here. `new Date()` during prerendering is the _build_ date,
so [src/routes/+page.svelte](+page.svelte) deliberately reads the clock in `onMount`, and
renders a placeholder rather than anything date-specific until then. Computing it at component init
instead would bake the build day into the HTML and visibly flash the wrong fact before hydration
corrected it. That placeholder is the point — do not "fix" it by moving the date out of `onMount`.

That placeholder is a mock of the finished page rather than a bare line of text. The calendar and the
date bar sit _outside_ the `{#if}`s that need a selection, so before hydration they render themselves:
every arrow bounded, both text slots a grey bar, six full rows of stand-in days in the archive's own
rhythm — Mo–Fr shaped like a day with a fact, Sa/So like one without. This is why the month arrows
test `!month` as well as their month bound: `shownMonth` is `''` before hydration, which happens to
fall below `bounds.from` but not above `bounds.to`, so the forward arrow would otherwise come up
looking live. Both arrows carry it rather than only that one: it mirrors `shiftMonth`'s own `!month`
return instead of leaning on the accident that `''` sorts below every date, and it short-circuits
before `bounds`, so the archive is never sorted during prerendering. The stand-in cells are `h-8`, a
day cell's height to the pixel, so the page arrives at its final size — the e2e test compares the
date bar's resting offset with JavaScript switched off against the same offset once hydrated, and a
one-step change to that height fails it. `aria-busy` belongs on `<main>` and not on the
"Fakten werden geladen …" line, because the calendar and the bar are provisional too and a screen
reader reaches them first; both states are asserted.

**Keep the mock in step when you restyle the calendar.** Most of that is free — the mock _is_ the
real section, grid and sticky bar with different leaves, so anything changed on those elements
applies to both. Four things are not shared, and the test only half-covers the first:

- **The day cell's height** — `h-8` in the mock, against `py-1.5` plus the grid's `text-sm` on the
  real day button _and_ on the `<span>` that a day without a fact renders as. 32 px all round. The
  e2e test fails on any change to the mock's `h-8`, but on the real side only if button and span
  move together: `1fr` sizes each row to its tallest cell, and every month in the archive has a
  factless day left holding the old height. Verified by mutation both ways — changing only the
  button passes green.
- **The six-row count**, written twice: `repeat(6,1fr)` on the grid, `6 * WEEKDAYS.length` in the
  mock's loop.
- **The colours.** A day with a fact is `bg-sky-50`, and the mock's weekday cell repeats that literal.
  Nothing tests it, so a restyled calendar leaves the placeholder on the old palette.
- **The two grey bars** (`h-4 w-28`), duplicated on purpose: nothing couples the size of the month
  heading's placeholder to the date line's, so changing one is a decision about the other rather than
  a bug. Do not fold them into a `{#snippet}` — unlike `arrow` below, both are already literal
  `class="..."` attributes that Prettier sorts, so the snippet would be pure overhead.

To look at the thing, switch JavaScript off and reload; hydration is far too quick to catch it
otherwise. That is exactly what the `loading state` e2e test does, in a second browser context.

## The calendar

[src/routes/+page.svelte](+page.svelte) holds the whole thing; there is no separate
component. The search lives there too and shares almost nothing with the calendar, so a component
would be a clean cut — but with no vitest browser project it buys nothing testable. Split it when a
second reader disagrees, not before. These decisions in it are not obvious from the code:

- **The location hash is the single source of truth for the selection.** Clicking a day only writes
  `location.hash`; the `hashchange` handler is what actually moves the state, and `onMount` calls the
  same function. Back/forward and shared links therefore work without a second code path. Do not
  "simplify" it by also setting the state in the click handler — that is how the two get out of sync.
  The heading is the one control that cannot take that path: _removing_ the hash needs
  `history.pushState`, which fires no `hashchange`, so `backToToday` calls `readHash` itself — the
  same call `onMount` makes. One function still decides the selection; what the rule forbids is two
  functions writing it. `location.hash = ''` is not an alternative, because it leaves a bare `#`
  behind, and neither is a link to `/`: SvelteKit routes that click client-side, so the hash goes
  without a `hashchange` and the URL says today while the page still shows the old fact. Measured,
  not assumed. Nothing is pushed when there is no hash, or Back lands on an identical URL and looks
  dead. Watch the assertion when testing this: `new URL(url).hash` reports `''` for a trailing bare
  `#` as well, so it cannot tell the two apart — the e2e test checks the raw URL string, after the
  weaker version was verified to pass against `location.hash = ''`.
- **A fact may link to another fact, as `[…](#2026-08-24)`, and that is safe where a link to `/` is
  not.** The two look alike and behave oppositely. SvelteKit's click handler special-cases a
  same-page link whose hash _differs_: it sets `hash_navigating`, deliberately does **not**
  `preventDefault`, and lets the browser navigate natively, precisely so `hashchange` fires
  (`client.js`, "use the browser default behavior in that case"). `readHash` then runs like any
  other selection. Removing the hash is the case that has no native path, which is the whole
  reason `backToToday` exists. Verified in a browser against the real archive, not just read:
  the fact swaps, the URL ends `#2026-08-24`, and Back returns to the previous fact. 2026-09-23 is
  the first entry doing this. Two caveats. Such a link bypasses `jump`, so it does not pull the
  next fact's top back under the sticky bar — tolerable because the link sits in the fact the
  reader is already at. And `never links the home page to itself` in
  [legal-pages.e2e.ts](legal-pages.e2e.ts) compares **pathnames**, so it would read a
  hash-only link as a self-link; it stays green only because the e2e suite builds against
  `facts.probe.yaml`, which has none. Put one in that fixture and the test needs to exclude
  hash-only hrefs first.
- **The arrows are bounded by the content, and the bounds include today and the selection.** Bounding
  on the fact keys alone strands a visitor: once the whole archive is in the past, both arrows go
  dead in the current month. Comparison is on `YYYY-MM` strings, which sort chronologically, so no
  date arithmetic is involved.
- **Today stays clickable even with no fact of its own.** A deliberate exception to the "days without
  a fact are non-interactive" rule, because today is the cell you navigate back to. It has its own
  e2e test, since the ordinary "not clickable" test cannot catch it.
- **Monday is column one.** `getDay()` counts from Sunday, so `monthGrid` rotates it with
  `(getDay() + 6) % 7`. Verified against a month that starts on a Sunday, which is the case a bare
  `getDay()` gets wrong.

- **Accessibility is carried by the day buttons, not by grid semantics.** This is a CSS grid, not
  an ARIA `grid`, so each button's `aria-label` is its full German date; the `Mo Di Mi …` row is
  `aria-hidden`, and so are the days without a fact, since a bare number carries no date context of
  its own. Two details there are deliberate and easy to undo by accident. The month arrows use
  `aria-disabled` rather than the native attribute — a natively disabled button drops keyboard focus
  to `<body>` the instant it is disabled, stranding the visitor who just pressed it — which is why
  `shiftMonth` enforces the bound itself rather than trusting the attribute. The cursor rule in
  [layout.css](layout.css) matches on that same attribute (see Misc in the root CLAUDE.md), so swapping the
  mechanism here quietly makes a bounded arrow look clickable again. And the selected day is
  named in its `aria-label` (`… (angezeigt)`) instead of carrying `aria-pressed`, which would claim
  toggle semantics that a single-select set does not have. Both have e2e tests, both verified to
  fail when reverted. Note Playwright honours `aria-disabled` in its actionability checks, so a test
  that clicks a bounded arrow on purpose needs `{ force: true }`.

Watch the muted greys: Tailwind's `gray-300` is 1.47:1 against white and `gray-400` is 2.6:1, both
far below the 4.5:1 that WCAG AA wants for text. The day numbers use `gray-600` (7.6:1). Only the
inactive arrows are allowed to stay faint, because inactive controls are exempt.

The facts run weekdays only, with gaps for holidays, so the calendar is mostly non-interactive days
by design — and the arrows, which skip to the next _entry_, are the primary way through the archive
rather than a convenience.

## Moving between facts

The arrows either side of the date step to the next and previous **entry**, skipping the days that
have none. They write the hash like everything else, so the calendar follows them into another month
for free — there is no second navigation path to keep in sync.

The date and its two arrows are one `sticky top-0` bar, so a fact longer than the screen keeps both
in view. It ends in a downward fade (`bg-linear-to-b from-white from-60% to-transparent` over a
`pb-8` tail) rather than a border, because a border only looks right once the bar is pinned and CSS
alone cannot tell whether it is. Tailwind interpolates the gradient `in oklab`, which is what stops a
white-to-transparent fade greying in the middle.

Stepping to another fact from below the point where the bar pins scrolls back up to it, so the next
fact opens at its top instead of somewhere in its middle. Upwards only: scrolling unconditionally
would shove the calendar off screen for a visitor who was already at the top.

**Do not compute that offset from the bar.** `offsetTop` on a _stuck_ sticky element reports where it
is stuck — literally the scroll position — not where it belongs: scroll to 500 and it reports 500,
whatever it read at rest. Any `scrollY > bar.offsetTop` test is therefore never true while pinned, and the
jump silently never happens; that shipped once and two tests missed it. The fact underneath stays in
normal flow, so `factText.offsetTop - bar.offsetHeight` is the honest answer. The e2e test has to
read the resting offset _before_ scrolling for the same reason — measured afterwards it compares a
number with itself and passes with the feature deleted. Wrapping the bar in a static box to measure
does not work either: the wrapper becomes sticky's containing block and caps its travel at its own
height.

### The bar is full-bleed because of iOS, and that is load-bearing

`-mx-6 px-6` on the bar cancels `main`'s `p-6`, so its background reaches both edges of the screen
while the date and arrows stay exactly where the padding put them. It looks like a no-op on a desktop
— white on white — and it is the only reason the bar works on an iPhone. There is an e2e test on it,
because the behaviour it buys cannot be tested here.

Without it, scrolling on iOS puts one or two lines of the fact _above_ the pinned bar, dimmed, behind
the status bar, splitting a sentence in half. The cause is not a safe-area inset. Measured on the
device: `bar.getBoundingClientRect().top` is `0` while the bar renders ~67 px down the screen, and
the article reports a negative `top` and paints anyway. The viewport origin simply sits below the
status bar, and Safari 26 paints page content into the strip above it.

What fixes it is that Safari will instead fill that strip with a **flat colour sampled from the top
row of the viewport** — but only when that row is uniform across the _whole width_. Inside `main`'s
padding the row is 24 px of canvas, then bar, then 24 px of canvas, so no sample is taken and the
live pixels show through. Full-bleed, the sample succeeds and the strip goes solid white. The
gradient is fine as it is; a solid `background-color` on the bar is _not_ required — both were tried.

Tried, and observed on-device to do nothing. Do not spend an evening on these again:

- `env(safe-area-inset-*)` is `0px` in every toolbar state, with _and_ without `viewport-fit=cover`.
  Nothing keyed on `env()` can see this strip.
- `<meta name="theme-color">`, which Safari 26 ignores for Liquid Glass tinting.
- An explicit `background-color` on `html` and `body` — the sample comes from the top row, not the root.
- A `fixed` mask at a negative `top`. Safari clips fixed subtrees to the inner viewport even at a
  negative offset; sticky subtrees are _not_ clipped, which is why the bar itself can be seen up
  there. Same bug as [react-spectrum#8888](https://github.com/adobe/react-spectrum/pull/8888).
- A 1 px sticky strip carrying the colour. The sample needs area; at 1 px it only lands if you scroll
  through the moment slowly enough, and then it sticks until reload.

Accepted limitation: on a viewport wider than `max-w-2xl` plus its padding — an iPad in portrait —
`main` no longer reaches the edges, the row stops being uniform, and the strip shows content again.
Only phones are covered, which is where the bar is pinned often enough to matter.

All four arrows on the page come from one `{#snippet arrow(...)}`. The snippet is what keeps the
shared class list inside a `class="..."` attribute, where Prettier's Tailwind plugin still sorts it —
a hoisted `const` is silently skipped by the sorter. Verified both ways.

## The search

Between the heading and the calendar, matching on every keystroke, with the hits in a panel laid
over the calendar. Picking one writes `location.hash` like everything else, so it is not a second
way to navigate.

**MiniSearch, and it is the only third-party code the browser gets.** Everything else here —
`marked`, `yaml` — is build-time. The alternatives were measured against the real archive rather
than picked by reputation, minified as Vite would and gzipped: uFuzzy is smallest at 4.2 KB but out
of the box missed both the transposition `Fernsehtrum` and the two-word `nintendo switch`; Fuse.js
(9.2 KB) found everything but Bitap-scans every full document per keystroke and is built for short
strings, not prose; MiniSearch (5.9 KB) is a real inverted index with per-term edit distance and
prefix matching, and found everything. Do not switch to Fuse without re-running that comparison.

It loads behind a **dynamic `import()`**, triggered by focusing the box or the first keystroke,
whichever comes first. Verified in the build: its chunk is not named anywhere in `index.html`, not
even as a `modulepreload`, so a visitor who never searches never fetches it.

- **The index is built in the browser from the rendered HTML,** with `DOMParser` for the text. Do
  not ship a plain-text copy of every fact alongside the HTML to save that one pass — it would
  double the part of the payload that actually costs something. And do not skip the parse and index
  the HTML itself: `strong` and every `href` in the archive become searchable, which two e2e tests
  pin by asserting `strong` and `example` find nothing. Verified by mutation: index `html` directly
  and both go red.
- **The images are swapped for their `alt` text before that, and it is not a nicety.**
  `textContent` ignores attributes, so the several thousand characters of German description across
  the illustrated entries were simply not in the index: `Bühnenturm` and `Hauptturm` live only in an
  alt text and could not be found at all. The padding spaces around the substitution matter too —
  the archive has runs of images sitting back to back, and without them the last word of one
  description welds onto the first of the next. `doc.images` is live, hence the copy before
  mutating it. The probe
  fixture carries one image for this, whose alt text is the only place the word `Wasserspeier`
  appears.
- **Every suffix of every word is indexed, which is what makes `turm` find `Fernsehturm`.**
  MiniSearch matches whole terms — by prefix or by edit distance — never substrings, and German
  welds the noun onto the end of the compound. `turm` therefore used to return exactly one entry,
  the only one using the bare word, while missing `Fernsehturm`, `Eiffelturm`, `Hauptturm` and
  `Bühnenturm`. `indexTerms` in [facts.ts](../lib/facts.ts) emits each word plus every suffix down
  to `MIN_QUERY_LENGTH`, turning prefix matching into substring matching. Measured on the real
  archive: the term count goes up about fourfold (roughly 3,700 to 14,900), the build costs tens of
  milliseconds once in the browser, and queries stay under a millisecond. Re-measure rather than
  trusting those figures — they move with the archive. **A query must be tokenised with `words`, not
  `indexTerms`** — the `tokenize`
  passed to `search()` is there for exactly that, and without it typing `turm` also asks for `urm`.
- **Every hit is kept, ranked by score, capped at eight.** Substring matching does let a short query
  pick up unrelated tails — `turm` reaches `Kultur`, `Herzogtum` and `Absturz` through short fuzzy
  suffixes — but those score around 3 against 15–17 for the real matches, so they sort below the
  answer instead of into it. A relative score cut was tried and taken back out: it removed the tail,
  but it also dropped `Türmen` on 2026-07-07, which is a genuine hit and only reachable at all
  because of the umlaut folding. Measured on the real archive, `turm` returns all four `Turm`
  compounds first, then the tail, with `Türmen` last — eight in total, which is the cap rather than
  the end of the list.
- **`foldTerm` flattens diacritics, with `normalize('NFKD')` rather than a hand-written umlaut
  map.** The same one line that lets `Munchen` reach `München` also covers `Édouard`, `Småländer`,
  `Florianópolis`, `Pokémon`, `Maracanã`, `Ålesund` and `Hyōgo`, all of which are in the archive and
  none of which an ä/ö/ü table would have touched. `ß` does not decompose under NFKD and keeps its
  own case. Folding is to the bare vowel, not the `ae` a dictionary would use, so `Muenchen` still
  does not reach `München` — that half is given up knowingly.
  `finds a half-typed word` types a half-finished word on purpose, because the search runs on
  every keystroke and a part-word is the state a visitor is in for all but the last one.
- **Three characters minimum, eight hits shown.** `MIN_QUERY_LENGTH` is one constant for both the
  query minimum and the shortest indexed suffix, because a query shorter than the shortest suffix
  could never match. Above eight hits the list is taller than the calendar under it.
- **The search is driven by an `$effect`, not `oninput`.** With `bind:value` the two would race on
  listener order; the effect runs once the state has already moved.
- **Re-read `query` after the `await`.** Loading the module is asynchronous, so an earlier keystroke
  can resolve after a later one and write a stale list. That read is deliberately outside the
  effect's tracking — it is a guard, not a dependency.
- **The input is `disabled` until hydration,** unlike the calendar beside it, which renders a mock.
  The search needs no clock, but it does need JavaScript, and a box that swallows what you type
  without answering is worse than one that admits it is not ready. It keeps its size either way, so
  the page still arrives at its final height.
- **The panel is absolutely positioned, and that is a requirement rather than a look.** In normal
  flow it shoved the calendar 200 px down the moment a query matched. An e2e test measures the
  month heading's top before and after typing; mutate the panel back to `static` and it fails by
  exactly that 200 px. `top-full` resolves to the bottom of the `search` element, which is the
  input, because every other child of it is out of flow. Since the panel now covers the calendar,
  Escape empties the box — that and the input's own `type="search"` clear button are the ways back.
  Closing it on `blur` would be the obvious third, and is a trap: `blur` fires before `click`, so
  the panel unmounts before the hit the visitor aimed at receives its event.
- **The count is in the DOM twice, deliberately.** `role="status"` on an always-present `sr-only`
  paragraph, because a live region that appears at the same moment as its text is not reliably
  announced, and `sr-only` keeps it in the accessibility tree where `display: none` would drop it.
  The visible copy inside the panel is `aria-hidden`, or a screen reader reads the count twice. The
  e2e tests assert on `getByRole('status')` for the same reason — `getByText('1 Treffer')` now
  matches both copies and trips strict mode.

## The random fact

A button under the search box, right-aligned: searching is "I want something specific", the shuffle
is "surprise me", so the two belong together. It sits _outside_ the `search` element, because it is not
a search and the landmark should not claim it — which also means the hit panel covers it while a
query is running, exactly as the panel covers the calendar.

- **It goes through `jump`.** Writing the hash and pulling the top of the fact back when the bar
  has pinned both come for free that way, and there is no second navigation path to keep in step.
- **It never returns the fact already on screen.** A repeat, however rare, makes the button look
  broken. The e2e test stubs `Math.random` so the pick is deterministic, and
  is built so the stub would land on the current fact if the filter were gone — remove the filter
  and it fails rather than passing on a coincidence.
- **`aria-disabled`, not the native attribute,** like every other button here, and bounded before
  hydration as well. That second half needs its own reason, because unlike the arrows it does not
  come for free: `month` and `neighbours` are `undefined` before hydration, but `otherFacts` comes
  from `data.facts`, which is already there at prerender time. Without `!selected` the button ships
  in the HTML claiming `aria-disabled="false"` while no listener exists — enabled-looking and inert,
  and permanently so for a visitor without JavaScript. The loading-state test happens to catch it
  too, since it asserts that no button in the placeholder is pressable by either mechanism.
- **`🔀` and not the die `⚄`.** U+2684 is a real glyph rather than tofu — checked by advance width
  against U+FFFF — but at 14 px its five pips each fall under a pixel and it reads as an empty box.
  The shuffle emoji is legible at that size and was chosen for it, at the price of being the only
  glyph on the page that renders in colour rather than in the current text colour.

## Impressum and Datenschutz

Two prerendered routes, `/impressum` and `/datenschutz`, reached from a footer in
[+layout.svelte](+layout.svelte). German law is the reason they exist: the site is not
"ausschließlich persönlichen oder familiären Zwecken", so § 18 Abs. 1 MStV wants a name and a
ladungsfähige Anschrift even though nothing here is commercial.

- **[src/lib/provider.ts](../lib/provider.ts) is the single source for name, address and email,**
  because both pages need them — § 5 DDG in the Impressum, Art. 13 Abs. 1 lit. a DSGVO for the
  `Verantwortlicher` in the Datenschutzerklärung. Two hand-kept copies of a postal address drift,
  and the copy that drifts is the one nobody re-reads. It ships to the client, which is the point.
- **An unfilled address fails the deploy gate.** `address` carries an `AUSFÜLLEN` marker and
  [provider.spec.ts](../lib/provider.spec.ts) asserts no marker survives; `pnpm vitest run` is in
  [deploy.yml](../../.github/workflows/deploy.yml), so a placeholder Impressum cannot go live. Same trick
  as the facts-file parse test, and for the same reason: a fake Impressum is a worse problem than a
  missing one, and neither `pnpm build` nor `pnpm lint` would say a word about it.
- **Every claim on the Datenschutz page was read off the build, not off a generator.** No storage
  API appears anywhere in the source, nothing fetches at runtime, the font stack is system fonts,
  and every `img`/`script`/`link` in the built HTML is same-origin. The page says so in those terms,
  which means **the code can turn the page into a false statement** — one web font, one embedded
  video, one counter. `loads nothing from third-party servers` in
  [legal-pages.e2e.ts](legal-pages.e2e.ts) is the guard: it watches every request
  origin across the home page, a search (so the lazily imported MiniSearch chunk is inside the
  window) and both legal pages. Verified by adding a `fonts.googleapis.com` stylesheet to
  [app.html](../app.html), which turns it red and names the host.
- **There is no test that the footer links carry the base path.** One was written and then deleted:
  mutating `resolve('/impressum')` to a bare `/impressum` never reaches a browser, because the
  prerender crawler refuses it and `pnpm build` dies with "does not begin with `base`". The build is
  the harder gate, and a test that cannot fail reads like cover for something that is not covered.
- **`<main>` stays in each page rather than moving into the layout.** The home page's carries
  `aria-busy={!selected}`, which is page state; hoisting it would mean plumbing that state upward to
  serve two pages that are never busy. The footer sits _outside_ `<main>` for the mirror-image
  reason — it is never provisional, so it has no business inside something that is.
- **The way back to the facts lives in the two legal pages, not in the footer,** and that is not
  tidiness. A link to `/` is the trap recorded above under the location hash: clicked _on_ the home
  page SvelteKit routes it client-side, the component never remounts, no `hashchange` fires, and
  the URL says today while the previously chosen fact stays on screen. Clicked from a legal page it
  is a real route change — the home component mounts and `onMount` resolves the date — so the link
  is correct exactly where it sits. Putting it in the page bodies is what keeps it off the home
  page **structurally**: the files it lives in are only rendered on those two routes, so there is
  no condition to get wrong. A footer version gated on `page.route.id` worked, but enforced at
  runtime what file layout enforces for free. The footer therefore stays two links on
  every route. `never links the home page to itself` in
  [legal-pages.e2e.ts](legal-pages.e2e.ts) guards it by collecting every `a[href]` on
  the home page rather than counting footer links, so it also catches a self-link re-added to the
  layout; verified by doing exactly that, and it fails alone.
- **Unverified: what GitHub Pages does with a trailing slash.** adapter-static writes
  `impressum.html`, not `impressum/index.html`, so `/impressum` works and `/impressum/` probably
  404s on Pages — `pnpm preview` answers 307 there, but Pages is a different server and this cannot
  be tested from here. Every link the site generates omits the slash, so it only bites a hand-typed
  or externally-published URL. Check it after the first deploy; if it does 404, `trailingSlash:
'always'` in [vite.config.ts](../../vite.config.ts) emits directories instead and fixes it.
- **Both pages hyphenate, and the identity blocks deliberately do not.** `hyphens-auto` sits on
  `<main>` rather than on the inner `.prose`, because the `<h1>` is outside that div: at 320 px
  `Datenschutzerklärung` ran 16 px past the viewport and gave the page a horizontal scrollbar, which
  moving the class up fixes by breaking it at `Datenschutzerklä-rung`. The name,
  address and email carry `hyphens-none` instead, because they are data a reader transcribes onto an
  envelope rather than prose to be read, and `hyphens: auto` really did break the address at
  `…gmail.c|om` on a 320 px screen before the exception went in. Nothing tests either class; the
  failure is at least visible on the page rather than silent. **Hyphenation raises no § 5 DDG or
  Art. 12 DSGVO problem, and that was checked rather than assumed:** it is purely presentational, so
  `textContent`, `innerText` and what a selection copies are byte-identical to the source with no
  hyphen character anywhere — copying the block still yields
  `Abdülhamit Yilmaz Birkenstr. 79 40233 Düsseldorf`.
- Both pages are asserted readable with **JavaScript switched off**. Prerendering gives that for
  free today, which is exactly why it is worth pinning: a legal page that needs JS is a legal page
  some visitors cannot read, and nothing else would announce the change.
