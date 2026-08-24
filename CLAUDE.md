# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Fakt des Tages** — a German-language calendar web app. The home page shows today's fact (if one
exists for today's date) plus a calendar; clicking a day that has a fact swaps the displayed fact
client-side. Days without a fact are visually distinct and non-interactive. Static site on GitHub
Pages, German UI only (no i18n).

Product rules that are easy to get wrong:

- Entries are keyed to **exact ISO dates** (`2026-03-15`), not recurring year-agnostic `MM-DD`
  patterns.
- Past and future dates behave identically — nothing is hidden or special-cased. "Today" is the
  visitor's local `Date`, read in the browser: nothing runs at request time, so the build can never
  know what day it is for a visitor.

## Content pipeline — everything happens at build time

Facts live in **one YAML file**, [src/lib/fakten.yaml](src/lib/fakten.yaml), mapping ISO date to a
**CommonMark** string, so entries can be written and formatted by hand:

```yaml
2026-03-15: |
  Der **Buchdruck** wurde um 1450 von Johannes Gutenberg erfunden.

  Er ermöglichte die *massenhafte* Verbreitung von Wissen — siehe
  [Gutenberg-Museum](https://www.gutenberg-museum.de/).
2026-03-16: Ein kurzer Fakt passt auch einzeilig.
```

The site is fully static (SSG): [src/routes/+page.server.ts](src/routes/+page.server.ts) imports
that file with Vite's `?raw`, parses the YAML and renders the Markdown **during prerendering**. The
browser receives finished HTML strings as page data and fetches nothing at runtime.

**Do not move this to a runtime `fetch()` to avoid rebuilds.** Every push to `main`, including an
edit made in GitHub's web UI, already triggers a full rebuild and deploy via
[.github/workflows/deploy.yml](.github/workflows/deploy.yml), so there is nothing to buy.

Consequences worth knowing before changing any of this:

- **[src/lib/fakten.ts](src/lib/fakten.ts) must stay dependency-free.** It holds the
  `Fakten`/`FaktHtml` types and the pure date helpers (`toIsoDate`, `fromIsoDate`, `isIsoDate`,
  `monatsRaster`) and is imported by the page component, so anything added there ships to the
  client. `isIsoDate` lives here rather than in `$lib/server/` because the calendar validates the
  location hash with it — that _is_ a trust boundary, unlike the facts file.
- **`FaktHtml` is a branded string, and the brand needs an anchor.** `renderFakt` is the only place
  it is applied, so a load that returns `parseFakten`'s output unrendered fails to compile. That
  only works because [+page.server.ts](src/routes/+page.server.ts) pins the output type as
  `PageServerLoad<{ fakten: Fakten }>` — a bare `PageServerLoad` accepts any serialisable shape, and
  the page would simply infer whatever load returned. Do not drop that type argument.
- **A malformed facts file fails `pnpm build`,** so broken content never deploys and the previous
  version stays live. The UI has no runtime error state, and needs none.
- **All facts are embedded in the page.** Accepted limitation: the payload grows with the archive —
  re-measured at 34 KB gzipped (90 KB raw) for the 119 entries of Feb–Aug 2026, so roughly 65 KB
  gzipped per year of weekdays, on the document's critical path. If that ever bites, prerender one
  route per date and keep only the date keys on the home page for the calendar. The UI is not what
  costs: measured by removing each from the built HTML and re-gzipping, the search bar is 153 bytes
  gzipped and the loading mock's 42 cells are 113 (5.1 KB raw — repeated markup compresses away).
- **Images live in [static/fakten/](static/fakten/)** and are referenced relatively —
  `![…](fakten/2026-03-06-1.jpg)`. Relative and not `/Fakt-des-Tages/…` because the home page is the
  only route, so the path resolves against it and the base path stays in one place. They are exempt
  from the payload note above: only the selected day's `{@html}` is in the DOM, so a visitor
  downloads the images of the day they are looking at and no others.
- **Those images are in Git LFS** ([.gitattributes](.gitattributes) tracks `static/fakten/*.jpg` and
  `*.gif`), so the repo carries ~3 KB of pointers instead of 8.7 MB of binaries. Two consequences,
  both load-bearing:
  - `actions/checkout` in [deploy.yml](.github/workflows/deploy.yml) needs **`lfs: true`**. Without
    it the build gets 130-byte pointer files, copies them into `build/fakten/` and deploys 25 broken
    images — with every check green. That is why the gate test below reads the file headers.
  - Adding or replacing an image needs a local clone with `git lfs install`. Editing the _text_ of
    a fact in GitHub's web editor is unaffected.

### The visitor's clock cannot be known at build time

This is the one thing SSG genuinely costs here. `new Date()` during prerendering is the _build_ date,
so [src/routes/+page.svelte](src/routes/+page.svelte) deliberately reads the clock in `onMount`, and
renders a placeholder rather than anything date-specific until then. Computing it at component init
instead would bake the build day into the HTML and visibly flash the wrong fact before hydration
corrected it. That placeholder is the point — do not "fix" it by moving the date out of `onMount`.

That placeholder is a mock of the finished page rather than a bare line of text. The calendar and the
date bar sit _outside_ the `{#if}`s that need a selection, so before hydration they render themselves:
every arrow bounded, both text slots a grey bar, six full rows of stand-in days in the archive's own
rhythm — Mo–Fr shaped like a day with a fact, Sa/So like one without. This is why the month arrows
test `!monat` as well as their month bound: `angezeigt` is `''` before hydration, which happens to
fall below `grenzen.von` but not above `grenzen.bis`, so the forward arrow would otherwise come up
looking live. Both arrows carry it rather than only that one: it mirrors `verschiebe`'s own `!monat`
return instead of leaning on the accident that `''` sorts below every date, and it short-circuits
before `grenzen`, so the archive is never sorted during prerendering. The stand-in cells are `h-8`, a
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
- **The six-row count**, written twice: `repeat(6,1fr)` on the grid, `6 * WOCHENTAGE.length` in the
  mock's loop.
- **The colours.** A day with a fact is `bg-sky-50`, and the mock's weekday cell repeats that literal.
  Nothing tests it, so a restyled calendar leaves the placeholder on the old palette.
- **The two grey bars** (`h-4 w-28`), duplicated on purpose: nothing couples the size of the month
  heading's placeholder to the date line's, so changing one is a decision about the other rather than
  a bug. Do not fold them into a `{#snippet}` — unlike `pfeil` below, both are already literal
  `class="..."` attributes that Prettier sorts, so the snippet would be pure overhead.

To look at the thing, switch JavaScript off and reload; hydration is far too quick to catch it
otherwise. That is exactly what the `Ladezustand` e2e test does, in a second browser context.

### The calendar

[src/routes/+page.svelte](src/routes/+page.svelte) holds the whole thing; there is no separate
component. The search added about 150 lines to that file and shares almost nothing with the calendar
— only `data.fakten`, one readiness flag and the `location.hash` idiom — so the "it needs none at
this size" claim was re-checked rather than assumed: a component would be a clean cut, but with no
vitest browser project it buys nothing testable, and the file is still one screenful per feature.
Split it when a second reader disagrees, not before. Five decisions in it are not obvious from the
code:

- **The location hash is the single source of truth for the selection.** Clicking a day only writes
  `location.hash`; the `hashchange` handler is what actually moves the state, and `onMount` calls the
  same function. Back/forward and shared links therefore work without a second code path. Do not
  "simplify" it by also setting the state in the click handler — that is how the two get out of sync.
- **The arrows are bounded by the content, and the bounds include today and the selection.** Bounding
  on the fact keys alone strands a visitor: once the whole archive is in the past, both arrows go
  dead in the current month. Comparison is on `YYYY-MM` strings, which sort chronologically, so no
  date arithmetic is involved.
- **Today stays clickable even with no fact of its own.** A deliberate exception to the "days without
  a fact are non-interactive" rule, because today is the cell you navigate back to. It has its own
  e2e test, since the ordinary "not clickable" test cannot catch it.
- **Monday is column one.** `getDay()` counts from Sunday, so `monatsRaster` rotates it with
  `(getDay() + 6) % 7`. Verified against a month that starts on a Sunday, which is the case a bare
  `getDay()` gets wrong.

- **Accessibility is carried by the day buttons, not by grid semantics.** This is a CSS grid, not
  an ARIA `grid`, so each button's `aria-label` is its full German date; the `Mo Di Mi …` row is
  `aria-hidden`, and so are the days without a fact, since a bare number carries no date context of
  its own. Two details there are deliberate and easy to undo by accident. The month arrows use
  `aria-disabled` rather than the native attribute — a natively disabled button drops keyboard focus
  to `<body>` the instant it is disabled, stranding the visitor who just pressed it — which is why
  `verschiebe` enforces the bound itself rather than trusting the attribute. The cursor rule in
  [layout.css](src/routes/layout.css) matches on that same attribute (see Misc), so swapping the
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

### Moving between facts

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
normal flow, so `fakttext.offsetTop - leiste.offsetHeight` is the honest answer. The e2e test has to
read the resting offset _before_ scrolling for the same reason — measured afterwards it compares a
number with itself and passes with the feature deleted. Wrapping the bar in a static box to measure
does not work either: the wrapper becomes sticky's containing block and caps its travel at its own
height.

#### The bar is full-bleed because of iOS, and that is load-bearing

`-mx-6 px-6` on the bar cancels `main`'s `p-6`, so its background reaches both edges of the screen
while the date and arrows stay exactly where the padding put them. It looks like a no-op on a desktop
— white on white — and it is the only reason the bar works on an iPhone. There is an e2e test on it,
because the behaviour it buys cannot be tested here.

Without it, scrolling on iOS puts one or two lines of the fact _above_ the pinned bar, dimmed, behind
the status bar, splitting a sentence in half. The cause is not a safe-area inset. Measured on the
device: `leiste.getBoundingClientRect().top` is `0` while the bar renders ~67 px down the screen, and
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

All four arrows on the page come from one `{#snippet pfeil(...)}`. The snippet is what keeps the
shared class list inside a `class="..."` attribute, where Prettier's Tailwind plugin still sorts it —
a hoisted `const` is silently skipped by the sorter. Verified both ways.

### The search

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
  `textContent` ignores attributes, so the 3,656 characters of German description across 16 entries
  were simply not in the index: `Bühnenturm` and `Hauptturm` live only in an alt text and could not
  be found at all. The padding spaces around the substitution matter too — the archive has seven
  places where two images sit back to back, and without them the last word of one description welds
  onto the first of the next. `doc.images` is live, hence the copy before mutating it. The probe
  fixture carries one image for this, whose alt text is the only place the word `Wasserspeier`
  appears.
- **Every suffix of every word is indexed, which is what makes `turm` find `Fernsehturm`.**
  MiniSearch matches whole terms — by prefix or by edit distance — never substrings, and German
  welds the noun onto the end of the compound. `turm` therefore used to return exactly one entry,
  the only one using the bare word, while missing `Fernsehturm`, `Eiffelturm`, `Hauptturm` and
  `Bühnenturm`. `suchterme` in [fakten.ts](src/lib/fakten.ts) emits each word plus every suffix down
  to `KUERZESTE_SUCHE`, turning prefix matching into substring matching. Measured on the real
  archive: 3,531 terms become 14,400, the build goes 11 ms → 28 ms once in the browser, queries stay
  under a millisecond. **A query must be tokenised with `worte`, not `suchterme`** — the `tokenize`
  passed to `search()` is there for exactly that, and without it typing `turm` also asks for `urm`.
- **Every hit is kept, ranked by score, capped at eight.** Substring matching does let a short query
  pick up unrelated tails — `turm` reaches `Kultur`, `Herzogtum` and `Absturz` through short fuzzy
  suffixes — but those score around 3 against 15–17 for the real matches, so they sort below the
  answer instead of into it. A relative score cut was tried and taken back out: it removed the tail,
  but it also dropped `Türmen` on 2026-07-07, which is a genuine hit and only reachable at all
  because of the umlaut folding. Measured on the real archive, `turm` returns all four `Turm`
  compounds first, then the tail, with `Türmen` last — eight in total, which is the cap rather than
  the end of the list.
- **`suchbegriff` folds the soft hyphens out, and that is load-bearing in a narrower way than it
  first looks.** The archive carries 75 of them inside words (`Flug­hafen`). Typing the _whole_
  word finds it either way — fuzzy matching absorbs the hidden character as one insertion — so a
  test on the full word passes with the folding removed, and one did until the mutation caught it.
  What breaks without it is the _prefix_ half: `hinterg` cannot reach past the hyphen and finds
  nothing, and since this searches on every keystroke that is the state the visitor is in for all
  but the last one. Measured: with the folding `Hintergrund` scores 0.4, without it 0.2. The e2e
  test therefore types a partial word on purpose. It also flattens diacritics, with
  `normalize('NFKD')` rather than a hand-written umlaut map: the same one line that lets `Munchen`
  reach `München` also covers `Édouard`, `Småländer`, `Florianópolis`, `Pokémon`, `Maracanã`,
  `Ålesund` and `Hyōgo`, all of which are in the archive and none of which an ä/ö/ü table would have
  touched. `ß` does not decompose under NFKD and keeps its own case. Folding is to the bare vowel,
  not the `ae` a dictionary would use, so `Muenchen` still does not reach `München` — that half is
  given up knowingly.
- **Three characters minimum, eight hits shown.** `KUERZESTE_SUCHE` is one constant for both the
  query minimum and the shortest indexed suffix, because a query shorter than the shortest suffix
  could never match. Above eight hits the list is taller than the calendar under it.
- **The search is driven by an `$effect`, not `oninput`.** With `bind:value` the two would race on
  listener order; the effect runs once the state has already moved.
- **Re-read `suche` after the `await`.** Loading the module is asynchronous, so an earlier keystroke
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

`fakten.probe.yaml` carries one soft hyphen inside `Hintergrund` purely so the e2e suite can cover
this. It is invisible; do not tidy it away.

### The random fact

A button under the search box, right-aligned: searching is "I want something specific", the shuffle
is "surprise me", so the two belong together. It sits _outside_ the `search` element, because it is not
a search and the landmark should not claim it — which also means the hit panel covers it while a
query is running, exactly as the panel covers the calendar.

- **It goes through `springe`.** Writing the hash and pulling the top of the fact back when the bar
  has pinned both come for free that way, and there is no second navigation path to keep in step.
- **It never returns the fact already on screen.** With 119 entries a repeat is common enough that
  the button would look broken. The e2e test stubs `Math.random` so the pick is deterministic, and
  is built so the stub would land on the current fact if the filter were gone — remove the filter
  and it fails rather than passing on a coincidence.
- **`aria-disabled`, not the native attribute,** like every other button here, and bounded before
  hydration as well. That second half needs its own reason, because unlike the arrows it does not
  come for free: `monat` and `nachbarn` are `undefined` before hydration, but `andereFakten` comes
  from `data.fakten`, which is already there at prerender time. Without `!gewaehlt` the button ships
  in the HTML claiming `aria-disabled="false"` while no listener exists — enabled-looking and inert,
  and permanently so for a visitor without JavaScript. The loading-state test happens to catch it
  too, since it asserts no button in the placeholder is missing `aria-disabled="true"`.
- **`🔀` and not the die `⚄`.** U+2684 is a real glyph rather than tofu — checked by advance width
  against U+FFFF — but at 14 px its five pips each fall under a pixel and it reads as an empty box.
  The shuffle emoji is legible at that size and was chosen for it, at the price of being the only
  glyph on the page that renders in colour rather than in the current text colour.

### YAML gotchas that bite silently

- **Never add a `%YAML 1.1` directive.** Under 1.2 core (the `yaml` package default) a bare
  `2026-03-15` key stays the string `"2026-03-15"`. Under 1.1 it becomes a `Date`, which JS then
  stringifies as an object key to `"Sun Mar 15 2026 01:00:00 GMT+0100 (…)"` — every date lookup
  misses and nothing throws. Verified, not theoretical.
- A duplicated date key _does_ throw (`Map keys must be unique`), so that hand-editing mistake is
  caught for free.
- **Malformed entries fail the whole file, by decision.** An entry that parses but has a bad date
  key or a non-string value throws rather than being skipped; in exchange the German error always
  names the offending key. Do not quietly switch this to skip-and-continue.
- Multi-line facts need a `|` block scalar with consistent indentation. This is the main hand-editing
  hazard in the GitHub web editor.
- `parseFakten` rejects a document that parses to a plain string rather than a map — a file
  containing prose instead of entries, for instance.

Rendering goes through `{@html}` on the already-rendered HTML, wrapped in Tailwind's `prose` class
(the `@tailwindcss/typography` plugin is loaded). No sanitiser is warranted: the YAML is a file in
this repo compiled into the build, so anyone who can write a fact can already write the app's
JavaScript — it is not a trust boundary. That reasoning stops holding the moment facts come from
anywhere but the repo; add sanitising then.

## Commands

Package manager is **pnpm**, pinned by `packageManager` in [package.json](package.json).
`engines.node` is `>=24` and `engineStrict: true` in
[pnpm-workspace.yaml](pnpm-workspace.yaml) makes that a **hard install failure**, not a warning —
`pnpm install` on an older Node exits with `Expected version: >=24`. Note pnpm 10+ reads its own
settings from `pnpm-workspace.yaml`; the same key in a `.npmrc` is silently ignored, which is why
there is no `.npmrc` here. Use `nvm use --lts` before running anything.

```sh
pnpm dev                  # vite dev server
pnpm build                # production build into build/
pnpm preview              # serve the built output
pnpm check                # svelte-kit sync + svelte-check (type errors in .svelte too)
pnpm lint                 # prettier --check . && eslint .
pnpm format               # prettier --write .
pnpm test                 # node tests, then e2e
pnpm test:unit --run      # node tests only
pnpm test:e2e             # Playwright only (builds and previews first)
```

Single test / focused runs:

```sh
pnpm vitest run src/lib/fakten.spec.ts                 # one file
pnpm vitest run -t 'parses and is not empty'           # one test by name
pnpm exec playwright test src/routes/page.e2e.ts       # one e2e file
```

Anything Playwright needs browsers: `pnpm exec playwright install chromium` (fails with
"Executable doesn't exist" otherwise). `pnpm test` therefore needs them too, since it chains e2e.

## Config lives in vite.config.ts, not svelte.config.js

There is **no `svelte.config.js`, and adding one will not work**. SvelteKit options are passed
directly to `sveltekit({ ... })` in [vite.config.ts](vite.config.ts); when that argument is present
SvelteKit ignores `svelte.config.js` entirely (it only logs a warning). `KitConfig` keys go at the
**top level** of that object — `adapter`, `paths`, `prerender`, … — alongside `compilerOptions`.

Two things are configured there today:

- `adapter: adapter()` — `@sveltejs/adapter-static`.
- `compilerOptions.runes: true` for everything outside `node_modules`. **Runes are mandatory**:
  `$props`, `$state`, `$derived`, `$effect`. `export let` and legacy reactive `$:` will not compile.

## Static build / GitHub Pages

Deployed as a GitHub Pages **project** site, so everything lives under `/Fakt-des-Tages/`. Four
pieces make that work; none is optional:

- [src/routes/+layout.ts](src/routes/+layout.ts) — `export const prerender = true`. Without it
  adapter-static rejects `src/routes/` as a dynamic route and `pnpm build` fails outright.
- `paths.base = '/Fakt-des-Tages'` in [vite.config.ts](vite.config.ts). Prerendered HTML happens to
  use _relative_ asset paths (`paths.relative` defaults to true), so assets survive without it — but
  the base path is what the browser bundle uses at runtime, which today means only links and
  client-referenced assets. Should you add a runtime asset request, resolve it through `asset()`
  from `$app/paths` — `base` and `assets` are **deprecated** (`asset(file)` for `static/`,
  `resolve(pathname)` for routes), and `asset()` only autocompletes filenames rather than enforcing
  them.
- [static/.nojekyll](static/.nojekyll) — insurance, not load-bearing today: an artifact deployed by
  `actions/deploy-pages` is served as-is and never sees Jekyll. It matters only if Pages is ever
  switched back to deploy-from-a-branch, where Jekyll would drop the `_app/` directory. Nothing in
  the toolchain writes one, so it is checked in (0 bytes).
- `packageManager` in [package.json](package.json) — pins pnpm so `pnpm/action-setup` resolves a
  version in CI.

`pnpm dev` and `pnpm preview` also serve under `/Fakt-des-Tages/`. A browser hitting the bare root
is redirected there (dev answers 302, preview 307), but that redirect is conditional on an
`Accept: text/html` header — `curl` without one gets a 404 and a hint string instead. Do not read
that 404 as a broken base path.

[.github/workflows/deploy.yml](.github/workflows/deploy.yml) builds on push to `main`: check → lint
→ node tests → build → upload `build/`, then a separate job deploys. Only the **node** vitest
project is in the gate; the browser and e2e layers are deliberately left out because both need a
chromium download on every run. `actions/configure-pages` runs with
`enablement: true`, so it switches Pages on by itself rather than needing a manual repo setting.

## Testing setup

Two layers:

- **Node unit tests** — `src/**/*.{test,spec}.{js,ts}`, a single vitest project, no browser.
  `expect.requireAssertions` is on: a test with no assertion is an error. This is the layer the
  deploy gate runs.
- **Playwright end-to-end** — `*.e2e.ts`, run by `pnpm test:e2e` via
  [playwright.config.ts](playwright.config.ts), which builds and previews the site first. Not in the
  gate, because it needs `pnpm exec playwright install chromium`.

There is **no vitest browser project**, and re-adding one is not free. SvelteKit mirrors
`paths.base` onto Vite's `base`, which also prefixes vitest's own `/__vitest__/` runner assets — the
browser project then 404s, hangs for about a minute and errors. The only workaround is blanking
`paths.base` under `process.env.VITEST`, which in turn blinds _every_ vitest test to the real base
path. That trade was not worth it for component tests, so component and interaction behaviour is
covered by the Playwright layer instead. If you do re-add a browser project, expect to pay that cost
again.

**The e2e suite builds against a fixture, not the real facts.**
[playwright.config.ts](playwright.config.ts) sets `FAKTEN_PROBE=1`, and the small `fakten-fixture`
plugin in [vite.config.ts](vite.config.ts) swaps `src/lib/fakten.yaml` for
[src/lib/fakten.probe.yaml](src/lib/fakten.probe.yaml). That file is content-shaped on purpose —
three months, gaps inside August, two deliberately long entries — and the tests name its dates
outright. Two long ones, because the jump test steps between them: land on a fact shorter than the
viewport and the browser clamps the scroll, so the test measures the clamping instead of the jump. The point is that **editing the site's content can break the build but never a test**:
verified by swapping the real file for two entries in 2030 with no gaps and no long entry, after
which every test still passed. The real file's validity is covered instead by the node test below,
and by `pnpm build` itself.

Two traps if you ever touch that swap. It cannot be keyed on `vite --mode`: SvelteKit runs a second
build pass for prerendering that reports mode `production`, and that is the pass which reads the
YAML. And it cannot be a `resolve.alias`: by the time an alias could fire, `$lib` has already become
an absolute path, so no `$lib/fakten.yaml` pattern ever matches. Both were tried and observed to
silently do nothing.

Changing `fakten.probe.yaml` _does_ change the tests. Shortening its 2026-08-23 or 2026-08-26 entry
in particular leaves the sticky-bar and jump tests passing while proving nothing, because the page
stops scrolling far enough for `sticky` to engage.

[src/routes/page.e2e.ts](src/routes/page.e2e.ts) is what pins the SSG guarantees end to end: that
hydration fills the date in, and that **no `.yaml` request happens at runtime**. That second
assertion is the regression guard for the whole build-time pipeline, so do not drop it.

Playwright's `boundingBox()` **scrolls the element into view before measuring**, so it cannot test
sticky positioning — an earlier version of the sticky test passed with `sticky` removed for exactly
that reason. Read `getBoundingClientRect()` through `page.evaluate` instead. The same test also needs
a fact taller than the viewport, which is what the long placeholder on 2026-08-23 is for — shorten
that entry and the page stops scrolling far enough for `sticky` to engage, and the test proves
nothing while still passing.

The first test runs on the real clock and deliberately asserts nothing about _which_ fact is shown.
Everything calendar-related instead pins the clock with `page.clock.setFixedTime` under
`timezoneId: 'Europe/Berlin'`, which is what lets those tests name concrete dates. Keep the two
apart: the unpinned test is the only one that proves the page works on a clock nobody chose.

[src/lib/server/fakten.spec.ts](src/lib/server/fakten.spec.ts) parses the **real** facts file, not just
fixtures, and that test runs in the gate. It is what stops a typo pushed from GitHub's web editor
from deploying green and taking the site down; verified to fail, naming the bad key. Do not weaken
it to a fixture. It also walks every `fakten/…` path a fact references and reads the first bytes of
each file, which catches both a mistyped path and an LFS pointer left behind by a checkout without
`lfs: true` — the one failure mode that is otherwise completely silent. Both verified by mutation.
Note it scans the _parsed_ entries rather than the raw YAML, because the file's header comment
contains an example image path that any regex over the raw text will happily match.

## Misc

- Tailwind v4 — configured via CSS (`@import`/`@plugin` in [src/routes/layout.css](src/routes/layout.css)),
  no `tailwind.config.js`. `typography` and `forms` plugins are loaded. Prettier sorts classes and
  is pointed at that stylesheet, so run `pnpm format` after touching class lists. One base rule lives
  in that file as well: v4's Preflight dropped v3's `cursor: pointer` on buttons, leaving nothing on
  the page looking clickable, so `button:not([aria-disabled='true'])` puts the hand back. The
  exception is the point — a bounded arrow is only `aria-disabled` and stays focusable, so the plain
  arrow cursor is one of the few things left saying it does nothing. Both halves have an e2e test,
  each verified to fail when reverted.
- The facts file is **deliberately not** prettier-ignored (only `/static/` is). Prettier has to parse
  YAML to format it, so `pnpm lint` rejects a facts file that is syntactically broken — one step
  earlier than the parse test, and a second independent signal. Prettier is silent on duplicate or
  mis-typed date keys; those are the parse test's job. Reformatting is purely cosmetic — verified
  that block scalars, quote styles and escape sequences all round-trip to identical parsed values.
  The cost accepted for this: a web-editor edit whose whitespace differs from Prettier's preference
  fails the gate and blocks the deploy until someone runs `pnpm format`.
- [README.md](README.md) is **in German** and aimed at whoever maintains the facts: how to add an
  entry, the YAML rules, the commands. Architecture and rationale belong here in CLAUDE.md, not
  there — keep the two from drifting into duplicates.
- `.claude/settings.json` enables the official `svelte@svelte` plugin (Svelte 5 / SvelteKit docs and
  skills) — prefer its guidance over recalled Svelte 4 patterns.
