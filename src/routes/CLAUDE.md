# CLAUDE.md — src/routes

How the pages themselves behave and why: the home page and the 404 page, the header along the top,
the calendar, the sticky date bar, the search, the random fact, and the legal pages. Read with the root [CLAUDE.md](../../CLAUDE.md),
which covers the content pipeline, adding a fact, the build and the tests.

Which text is German and which English is settled there, under "German and English". Two
consequences surface here more than anywhere else. The e2e titles are English while every locator
they use matches German page text (`getByRole('link', { name: 'Nächster Fakt' })`), so changing a
UI string breaks the tests that look it up, whatever language the titles are in. And the routes
`/impressum` and `/datenschutz` keep their German names: they are public URLs, not identifiers.

## The home page

Every fact is a prerendered page of its own, [[date]](%5Bdate%5D/+page.svelte), complete before any
JavaScript runs. What the build cannot know is _today_: `new Date()` during prerendering is the
build's clock, not the visitor's. So `/` decides in the browser, with an inline script in its head
that runs before the page paints:

- **Today has a fact:** `location.replace` to its page. Back then leaves the site rather than
  landing on `/` and being sent forward again — though a navigation that starts before the page has
  loaded replaces the entry whichever way it is written, which is why the e2e test pins the
  behaviour and not the call.
- **Today has none:** `history.replaceState` puts the date in the address bar and the page stays —
  `/` already _is_ the calendar, rendered with the latest month that has a fact, and hydration
  corrects it from the address bar. SvelteKit starts cleanly after the address has changed under
  it: it reports the route as `/[date]` while rendering `/`'s components, verified in a spike and
  on real Pages. That is also why the page reads the date from `location` and not `page.url`.

The script duplicates `toIsoDate`, because no module has loaded yet, and carries its own copy of
the date list. Two consequences:

- **Every link to `/` is a real page load** (`data-sveltekit-reload`), and there is one: the site's
  name in the header, before hydration, on every page. The legal pages and the error page had a
  „Zum Fakt des Tages“ link of their own until the header moved into the layout in October 2026.
  Routed client-side, the head script would not run and the visitor would land on a calendar with
  no day chosen. `reaches the home page only by a real page load` in
  [legal-pages.e2e.ts](legal-pages.e2e.ts) checks every such link on a fact page, a 404 page and
  both legal pages; verified by removing the attribute from the header's link.
- **Once hydrated, the header's name links today's date directly,** not `/`. A click on today's own page
  is then a link to the current address, which SvelteKit turns into a replace (since SvelteKit 3
  one that fetches the day's `__data.json` again). Linking `/` there
  stacked two identical entries, and Back looked dead. `adds no history entry on today’s own page`
  waits for each click's history update before pressing Back: SvelteKit finishes that navigation
  after `click()` returns, and a Back that overtakes it gets rewritten to the page it left. No
  hand is that quick, but the test was.

### The 404 page and the error page

A day without a fact has no page. GitHub Pages answers it with `404.html`, which is the
prerendered [/404](404/+page.svelte) route: the same `FactPage` as `/`, told only that it was
served for a miss, so without JavaScript it says „Für diesen Tag gibt es keinen Fakt.“ where `/`
says „Wähle im Kalender einen Tag.“ — `/` never learns a date then, so it claims none. Hydration
reads the last path segment with `isIsoDate`: a date gets its month, its date line
and arrows to its neighbours, anything else „Diese Seite gibt es nicht.“ Accepted limitation:
without JavaScript a mistyped address reads as a day without a fact.

Stepping to such a day client-side — Back to the address `/` rewrote, or today's cell — asks for a
`__data.json` that does not exist, and SvelteKit's root error page then lacks the layout's data as
well ([sveltejs/kit#6124](https://github.com/sveltejs/kit/discussions/6124)), so it cannot draw the
calendar. [+error.svelte](+error.svelte) reloads instead, and Pages answers with `404.html`. Only
after a client-side navigation, never on a first load, which would load the error page again
forever; `afterNavigate`'s `type` tells the two apart without storage, which the Datenschutz page
promises is never used. An earlier version keyed on `performance`'s navigation type, which
describes the document rather than the step, and would have stranded anyone who had pressed F5
earlier. Where the layout's data _is_ there — `pnpm dev` renders a missing date through the error
page on its server — it shows the no-fact page itself, but only for a 404. Every other status reads
„Diese Seite konnte nicht geladen werden.“, because the layout's data does not mean `pnpm dev`: a
visitor gone offline who follows a link to a page whose code was never fetched gets a 500 there
too, with the data still in hand. `admits a page that could not be loaded` in
[legal-pages.e2e.ts](legal-pages.e2e.ts) goes offline and follows the footer link to the Impressum.
Today's cell skips the failing attempt altogether: it knows it has no page, so it is a real load
from the start.

The header is on the error page too, since the layout draws it, so its name is the way back from
there. Where the layout's data is missing, its random fact stays bounded: it has no dates to draw
from.

The first step from `/` or `/404` to a fact swaps route components, so `FactPage` mounts afresh
and the displayed month starts over once. Steps between facts keep it.

### What waits for hydration

**A page without a fact of its own stays hidden until then.** `/` and `404.html` are prerendered
before anyone knows which day they are for, so they hold the latest month and a stand-in line, and
hydration swapped both under the visitor's eyes. With JavaScript, a script in the head of every
fact-less `FactPage` now sets `hidden` on `<html>`, and `onMount` clears it once the corrected
month and message are in the DOM. Without JavaScript the script never runs and the prerendered
page is what there is. Accepted limitation, chosen knowingly: a visitor whose JavaScript fails to
load sees an empty page. `stays hidden until hydration on a page without a fact` blocks the app's
scripts and asserts exactly that, which is what keeps the hiding from quietly going; dropping the
script fails it, and dropping the unhide fails every test of such a page.

**`/` on a day with a fact shows nothing at all before it leaves, and needs no hiding for it.**
The browser stops parsing at the head script's `location.replace`, so `/` never gets a `<body>`,
its hiding script never runs and nothing hydrates. Measured in October 2026 in Chromium, Firefox
and WebKit, with a cold and a warm cache, by holding back the response for today's fact page: the
document stayed at its head while WebKit cancelled every app chunk. So `onMount` there never reads
the bare root as „Diese Seite gibt es nicht.“, a flash a review predicted from the code.

On a fact page only what depends on today or needs JavaScript waits: the today ring and today's
cell, the month arrows' reach (which includes today), the search box, which is `disabled` until
then, and the buttons — the random fact, the narrow screen's search button and both month arrows,
`aria-disabled` until then because a button does nothing without JavaScript. Nothing changes size. `a fact is readable and the
archive navigable` compares the date bar's resting offset with JavaScript off against the hydrated
page, and walks to the next fact without JavaScript.

## The calendar

[FactPage.svelte](../lib/FactPage.svelte) holds the calendar, the date bar and the fact, and four
route files render it: `/`, `/404`, `/[date]` and the error page. The header above it is
[Header.svelte](../lib/Header.svelte), drawn by the layout on every page. The search lived in
FactPage until the header went into the layout, which made it the second reader an earlier version
of this note said to wait for before splitting it out. These decisions in it are not obvious from
the code:

- **The address is the selection.** Every day with a fact is a page, and every day cell, fact arrow
  and search hit is a link to one, so Back, Forward and shared links are the router's and need no
  code here. The displayed month is a writable `$derived`: it follows the selection, the month
  arrows assign to it, and the next selection takes over again.
- **A fact may link to another fact, as `[…](2026-08-24)`.** Relative, so it resolves like the
  images do — date pages sit one segment below the base — and SvelteKit routes it like any other
  link. The prerender crawler follows it, and a link to a date without a page fails `pnpm build`
  naming the page it came from; a leftover `#2026-08-24` fails it too, because the crawler checks
  fragment targets. Both verified. 2026-09-23 is the first entry doing this.
- **The arrows are bounded by the content, and the bounds include today and the selection.** Bounding
  on the fact keys alone strands a visitor: once the whole archive is in the past, both arrows go
  dead in the current month. Comparison is on `YYYY-MM` strings, which sort chronologically, so no
  date arithmetic is involved.
- **Today stays clickable even with no fact of its own.** A deliberate exception to the "days without
  a fact are non-interactive" rule, because today is the cell you navigate back to. It has no page,
  so its link is a real load of `404.html` (see "The home page"). It has its own e2e test, since
  the ordinary "not clickable" test cannot catch it.
- **Today moves on with the date, on a page left open.** No browser event announces a new day —
  checked in October 2026: the one proposal near it, `timezonechange`, would cover only a change of
  time zone, and Chrome lists it as in development, Firefox as deferred. So `readToday` in
  [today.svelte.ts](../lib/today.svelte.ts) sets a timeout
  to the next local midnight for a page watched across it, and re-reads the clock when the tab becomes
  visible or regains focus, because a background tab and a sleeping machine hold the timer back.
  Each read sets the timer anew from the time it finds. The address stays put: a visitor on
  yesterday's fact stays there, and only the ring, today's cell and the header's link move. Today
  lives in a module of its own because the header needs it as much as the calendar: `startClock`
  starts it once per page load, called from both components' `onMount` so that neither depends on
  the order in which they mount. `moves
on with the date on a page left open` drives a fake clock across midnight and then a day ahead
  without running timers; verified to fail with the timer or the `visibilitychange` handler
  removed. The `focus` handler is the same call and has no test of its own.
- **Monday is column one.** `getDay()` counts from Sunday, so `monthGrid` rotates it with
  `(getDay() + 6) % 7`. Verified against a month that starts on a Sunday, which is the case a bare
  `getDay()` gets wrong.

- **Accessibility is carried by the day links, not by grid semantics.** This is a CSS grid, not
  an ARIA `grid`, so each link's `aria-label` is its full German date; the `Mo Di Mi …` row is
  `aria-hidden`, and so are the days without a fact, since a bare number carries no date context of
  its own. Two details there are deliberate and easy to undo by accident. The month arrows use
  `aria-disabled` rather than the native attribute — a natively disabled button drops keyboard focus
  to `<body>` the instant it is disabled, stranding the visitor who just pressed it — which is why
  IconButton drops a bounded button's click handler rather than trusting the attribute. The cursor rule in
  [layout.css](layout.css) matches on that same attribute (see Misc in the root CLAUDE.md), so swapping the
  mechanism here quietly makes a bounded arrow look clickable again. The fact arrows are links, and
  the one that reaches the edge of the archive loses its `href` under the visitor who just pressed
  it — so it keeps its element, takes `role="link"` and `tabindex="0"`, and `reset="false"` on
  the navigation leaves focus on it. Dropping either the `tabindex` or the attribute fails `keeps focus on
the arrow that reached the edge`. And the selected day is named in its `aria-label`
  (`… (angezeigt)`) instead of carrying `aria-pressed`, which would claim toggle semantics that a
  single-select set does not have. Both have e2e tests, both verified to fail when reverted. Note Playwright honours `aria-disabled` in its actionability checks, so a test
  that clicks a bounded arrow on purpose needs `{ force: true }`.

Watch the muted colours: WCAG AA wants 4.5:1 for text. Primer's `--fgColor-muted` clears it in both
themes — 6.11:1 on white and 5.74:1 on the header's `bgColor-inset`, 6.50:1 and 7.05:1 in dark —
and the days with a fact, `--fgColor-accent` on `--bgColor-accent-muted`, only just: 4.56:1 in
light, 5.47:1 in dark. Only the inactive arrows are allowed to go fainter, in `--fgColor-disabled`
(3.45:1 and 3.57:1), because inactive controls are exempt.

The facts run weekdays only, with gaps for holidays, so the calendar is mostly non-interactive days
by design — and the arrows, which skip to the next _entry_, are the primary way through the archive
rather than a convenience.

## Moving between facts

The arrows either side of the date step to the next and previous **entry**, skipping the days that
have none. They are links like everything else, so the calendar follows them into another month
for free — there is no second navigation path to keep in sync.

The date and its two arrows are one `sticky top-0` bar, so a fact longer than the screen keeps both
in view. The bar is a `<nav aria-label="Durch die Fakten blättern">`, a landmark beside the search and
the calendar, and the e2e tests reach it by that name rather than through an arrow's parent. It ends in a downward fade (`bg-linear-to-b from-(--bgColor-default) from-60% to-transparent` over a
`pb-8` tail) rather than a border, because a border only looks right once the bar is pinned and CSS
alone cannot tell whether it is. Tailwind interpolates the gradient `in oklab`, which is what stops the
fade greying in the middle, in either theme.

Stepping to another fact from below the point where the bar pins scrolls back up to it, so the next
fact opens at its top instead of somewhere in its middle. Upwards only: scrolling unconditionally
would shove the calendar off screen for a visitor who was already at the top. `<main>` carries
`data-sveltekit-reset="false"`, so SvelteKit leaves the position and the focus alone for every link
inside it, and an
`afterNavigate` in `FactPage` does this instead — measuring the new fact, since it runs once the
page has changed. It skips `popstate`, where SvelteKit restores the position the visitor left. A
link inside a fact gets the same treatment, and the footer, outside `<main>`, scrolls to the top
like any page change.

**A step shows a spinner beside the date until the next fact is in.** SvelteKit fetches the target's
`__data.json` first and changes the address only afterwards, so the browser itself shows no load —
and its own indicator cannot be borrowed, because the router does not use the Navigation API, and
faking a navigation through it would risk the history state SvelteKit keeps its scroll positions
in. `navigating.to` from `$app/state` drives it, so every client-side step gets it — arrows, day
cells, search hits, the random fact, Back — while real page loads keep the browser's. It is
absolutely positioned off the date's right edge, so nothing in the bar moves: `shows a spinner
beside the date while the next fact loads` holds the data back and compares every box in the bar,
and fails with `absolute` removed. It fades in only after 100 ms (`starting:opacity-0` with a
delayed transition), because on a fast connection a step keeps it mounted for 2–7 ms, preloaded by
the hover or not — measured in Chromium, Firefox and WebKit in October 2026 — which is less than a frame but
painted for exactly one whenever it straddles a frame boundary. Nothing tests the delay:
`toBeVisible()` ignores opacity, and a regression only brings the flicker back. A browser without
`@starting-style` shows the spinner at once. Keep `{#if}` on the date's own line, because a line break
before it puts a trailing space into the date line's text, and two tests match that text with an
anchored regex.

**Do not compute that offset from the bar.** `offsetTop` on a _stuck_ sticky element reports where it
is stuck — literally the scroll position — not where it belongs: scroll to 500 and it reports 500,
whatever it read at rest. Any `scrollY > bar.offsetTop` test is therefore never true while pinned, and the
jump silently never happens; that shipped once and two tests missed it. The fact underneath stays in
normal flow, so `factText.offsetTop - bar.offsetHeight` is the honest answer. The e2e test has to
read the resting offset _before_ scrolling for the same reason — measured afterwards it compares a
number with itself and passes with the feature deleted. Wrapping the bar in a static box to measure
does not work either: the wrapper becomes sticky's containing block and caps its travel at its own
height.

### A deploy changes the calendar only with a full page load

Every `__data.json` carries the whole date list (see the root CLAUDE.md), and Pages serves them
with `max-age=600`. For ten minutes after a deploy, then, the browser answers every step to a day
visited before it from its cache, with the old list, and every other step with the new one — and
SvelteKit took each step's list, so a new fact appeared and vanished from step to step. The
problem is inconsistency, not staleness.

So [+layout.ts](+layout.ts) keeps the list the page was loaded with and ignores every later one.
A cached step can then bring back an old version of its own fact's text, never of the calendar.
The new list arrives with the next full page load. [+layout.svelte](+layout.svelte) makes the next
step one once `updated.current` turns true: SvelteKit sets it when the `version.json` it fetches on
focus, on becoming visible or after a failed step names another build, and every deploy is another
build. The step is cancelled before `location.href` is set, so the client-side step cannot race the
load. Back is left client-side, because SvelteKit undoes a cancelled Back with `history.go`.
Reloading at once instead was weighed and passed over: it interrupts a visitor just returning to
the tab, for no gain in consistency. Accepted limitation: that full load can itself come from the
browser's cache, and then shows the old calendar — consistently — until a check after that copy
has expired.
`keeps its date list until a new version is out, then loads afresh` fakes both a stale `__data.json`
and a new `version.json`. Verified to fail with either half removed.

### The bar is full-bleed because of iOS, and that is load-bearing

`-mx-6 px-6` on the bar cancels `main`'s `p-6`, so its background reaches both edges of the screen
while the date and arrows stay exactly where the padding put them. It looks like a no-op on a desktop
— the page's colour on itself — and it is the only reason the bar works on an iPhone. There is an e2e test on it,
because the behaviour it buys cannot be tested here.

Without it, scrolling on iOS puts one or two lines of the fact _above_ the pinned bar, dimmed, behind
the status bar, splitting a sentence in half. The cause is not a safe-area inset. Measured on the
device: `bar.getBoundingClientRect().top` is `0` while the bar renders ~67 px down the screen, and
the article reports a negative `top` and paints anyway. The viewport origin simply sits below the
status bar, and Safari 26 paints page content into the strip above it.

What fixes it is that Safari will instead fill that strip with a **flat colour sampled from the top
row of the viewport** — but only when that row is uniform across the _whole width_. Inside `main`'s
padding the row is 24 px of canvas, then bar, then 24 px of canvas, so no sample is taken and the
live pixels show through. Full-bleed, the sample succeeds and the strip goes solid in the page's
colour — white, or `#0d1117` in the dark theme, both seen on an iPhone in October 2026. The
gradient is fine as it is; a solid `background-color` on the bar is _not_ required — both were tried.

Two things the same iPhone showed in October 2026, both accepted:

- **At the very top of a page the strip does not take the header's colour.** It stays the page's —
  white over the header's `#f6f8fa`, `#0d1117` over its `#010409` — a thin band above the header.
  Until Safari has taken its first sample from the top row it paints the strip, the
  pull-to-refresh area and the strip behind its bottom toolbar in the `body`'s background colour —
  not `html`'s, which changed nothing — and once it has sampled, the sample sticks for the life of
  the page, back at the top included. A `body` in the header's colour, with the page on a layer of
  its own, showed both on the device in October 2026: the top matched the header until the date bar
  first pinned and stayed white from then on, while the strip behind the URL bar went grey under
  white content without any overscroll. A band at the top beats one at the bottom, so the body
  keeps the page's colour.
- **On the legal pages scrolled text shows behind the status bar,** exactly as the facts did before
  the bar went full-bleed: they have no pinned row at all, so the top row is a line of text. It
  predates the Primer header. The fix would be the date bar's — a full-width row in one colour,
  pinned at the top while the page scrolls, such as the title in a sticky full-bleed bar — and was
  passed over for two pages read rarely and straight through.

Tried, and observed on-device to do nothing. Do not spend an evening on these again:

- `env(safe-area-inset-*)` is `0px` in every toolbar state, with _and_ without `viewport-fit=cover`.
  Nothing keyed on `env()` can see this strip.
- `<meta name="theme-color">`, which Safari 26 ignores for Liquid Glass tinting.
- An explicit `background-color` on `html` and `body` — the sample comes from the top row, not the
  root. Tried twice more in October 2026 for the band above the header: `html` in the header's
  colour changed nothing, and `body` in it traded the band for one behind the URL bar (see above).
- A `fixed` mask at a negative `top`. Safari clips fixed subtrees to the inner viewport even at a
  negative offset; sticky subtrees are _not_ clipped, which is why the bar itself can be seen up
  there. Same bug as [react-spectrum#8888](https://github.com/adobe/react-spectrum/pull/8888).
- A 1 px sticky strip carrying the colour. The sample needs area; at 1 px it only lands if you scroll
  through the moment slowly enough, and then it sticks until reload.

Accepted limitation: on a viewport wider than `max-w-2xl` plus its padding — an iPad in portrait —
`main` no longer reaches the edges, the row stops being uniform, and the strip shows content again.
Only phones are covered, which is where the bar is pinned often enough to matter.

All four arrows on the page, and the header's two buttons, are
[IconButton.svelte](../lib/IconButton.svelte): a button when given a function, a link when given a
path. Its class list sits in a `class="..."` attribute, where Prettier's Tailwind plugin still sorts
it — a hoisted `const` is silently skipped by the sorter, verified both ways while the arrows were
still a snippet here. The two branches repeat the list, so keep them in step.

## The search

In the header on every page, matching on every keystroke, with the hits in a panel — Primer's Overlay
holding an ActionList — laid over the page below. A hit is a link to its day like everything else,
so it is not a second way to navigate; the navigation empties the box in `afterNavigate`, which is
what closes the list. The header carries `data-sveltekit-reset="false"` like the fact pages'
`<main>`, so a hit leaves the scroll position to FactPage's `afterNavigate`, as an arrow does.

**The label is for screen readers, the placeholder for the eye.** The header has no room for a visible
label, so „Fakt suchen“ is an `sr-only` `<label>` and the placeholder repeats it beside Primer's
search icon, which is github.com's own arrangement. The old placeholder, „z. B. Fernsehturm“, went
with the visible label.

**The box is 16 px below Primer's medium breakpoint, 768 px, and 14 px above it.** Safari on an
iPhone zooms into any input set smaller once it gets the focus, and stays zoomed after the box has
folded away: seen on the device in October 2026, with the calendar cut off and the dice and the `x`
pushed off screen. Primer's own form control does the same, for that reason, if only on iOS — its
feature test cannot be exercised here, a breakpoint can. Before Primer, `@tailwindcss/forms` set
inputs to 16 px everywhere. `keeps the box large enough that an iPhone does not zoom into it`
asserts the size at 390 px; verified to fail at 14 px.

**Below Primer's small breakpoint, 544 px, the search folds into a button.** A phone's header cannot
hold the name, a usable box and the dice in one row, so there it shows a search icon that unfolds the
box over the header, hiding the name and the dice, and hands it the focus. The same button, now an
`x`, folds it away again; so does picking a hit; and so does a second Escape once the first has
emptied the box, which hands the focus back to the button rather than dropping it with the box. The
open state changes nothing on a wide screen, where the button does not exist. Open, the input's own
clear button and the `x` sit side by side: two ways out that do different things. `folds away on
Escape, giving the focus back` and `folds away once a hit is picked` run at 390 px; verified to fail
without the focus hand-back and without the fold in `afterNavigate`.

**MiniSearch, and it is the only third-party code the browser gets.** Everything else here —
`marked`, `yaml` — is build-time. The alternatives were measured against the real archive rather
than picked by reputation, minified as Vite would and gzipped: uFuzzy is smallest at 4.2 KB but out
of the box missed both the transposition `Fernsehtrum` and the two-word `nintendo switch`; Fuse.js
(9.2 KB) found everything but Bitap-scans every full document per keystroke and is built for short
strings, not prose; MiniSearch (5.9 KB) is a real inverted index with per-term edit distance and
prefix matching, and found everything. Do not switch to Fuse without re-running that comparison.

It loads behind a **dynamic `import()`, started once the page has finished loading** — on every page,
since the header is on every page — at the
`load` event, so after every image — or on focusing the box, if that comes first. Its chunk is not
named anywhere in the built HTML, not even as a `modulepreload`, so it never competes with the page.
It is not left until someone searches, as it once was, because a dynamic import fetched on demand
could fail for good. Measured in Chromium, Firefox and WebKit in October 2026: after one failed
import, every later `import()` of the same URL fails without a request, until the page is reloaded.
The HTML spec dropped that caching in July 2026
([whatwg/html#10327](https://github.com/whatwg/html/pull/10327)) and all three engines committed
the change in August and September 2026, but a deploy cannot be fixed by any browser: it deletes
the hashed chunk an open tab would ask for. Loaded early, the module is in memory before either can bite. `loads
MiniSearch after the images, and keeps it` holds the fixture's image back to show nothing is
fetched meanwhile, then blocks every chunk and searches; verified by mutation both for loading it
at once and for not loading it early at all. A static import was weighed and passed over: it would
have put its 5.7 KB gzipped on every page's critical path, ahead of the images. Accepted
limitation: if that one early fetch fails, a browser without the spec change stays at „Suche nicht
verfügbar“ until the page is reloaded, which the status asks for.

`search.json` is different: the text of the whole archive, fetched only on focusing the box or the
first keystroke, so a visitor who never searches never downloads it — the first test in
[page.e2e.ts](page.e2e.ts) asserts that. It is a plain `fetch`, which a browser does retry.

- **The text is taken from the Markdown at build time,** by `factText` in
  [src/lib/server/facts.ts](../lib/server/facts.ts), and `search.json` maps each date to it. The same
  text gives each fact page its `description` and `og:description`. It used to be recovered in the
  browser from the HTML every page carried, with `DOMParser` — but a page carries one fact now, and
  a separate download of HTML would cost more than text for nothing. A walk over marked's tokens
  rather than its `TextRenderer`: that one returns an emphasis as raw Markdown, so the credit line
  `_Foto: [Name](https://…)_` came out with its URL. Links contribute their text, never their target
  or title, which two e2e tests pin by asserting `strong` and `example` find nothing; the unit test
  pins it again in the gate.
- **The images contribute their `alt` text, and it is not a nicety.** Several thousand characters of
  German description sit in the illustrated entries: `Bühnenturm` and `Hauptturm` live only in an
  alt text, and before alt texts were indexed they could not be found at all. The padding spaces
  around each matter too — the archive has runs of images sitting back to back, and without them
  the last word of one description welds onto the first of the next. Both verified by mutation in
  the unit test. The probe fixture carries one image for this, whose alt text is the only place the
  word `Wasserspeier` appears.
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
- **Every hit is kept, ranked by score.** Substring matching does let a short query
  pick up unrelated tails — `turm` reaches `Kultur`, `Herzogtum` and `Absturz` through short fuzzy
  suffixes — but those score around 3 against 15–17 for the real matches, so they sort below the
  answer instead of into it. A relative score cut was tried and taken back out: it removed the tail,
  but it also dropped `Türmen` on 2026-07-07, which is a genuine hit and only reachable at all
  because of the umlaut folding. Measured on the real archive, `turm` returns all four `Turm`
  compounds first, then the tail. The list scrolls inside `max-h-80`, and a common word such as
  `der` lists every fact in the archive, in a few milliseconds.
- **`foldTerm` flattens diacritics, with `normalize('NFKD')` rather than a hand-written umlaut
  map.** The same one line that lets `Munchen` reach `München` also covers `Édouard`, `Småländer`,
  `Florianópolis`, `Pokémon`, `Maracanã`, `Ålesund` and `Hyōgo`, all of which are in the archive and
  none of which an ä/ö/ü table would have touched. `ß` does not decompose under NFKD and keeps its
  own case. Folding is to the bare vowel, not the `ae` a dictionary would use, so `Muenchen` still
  does not reach `München` — that half is given up knowingly.
  `finds a half-typed word` types a half-finished word on purpose, because the search runs on
  every keystroke and a part-word is the state a visitor is in for all but the last one.
- **Three characters minimum.** `MIN_QUERY_LENGTH` is one constant for both the query minimum and
  the shortest indexed suffix, because a query shorter than the shortest suffix could never match.
- **The search is driven by an `$effect`, not `oninput`.** With `bind:value` the two would race on
  listener order; the effect runs once the state has already moved.
- **Re-read `query` after the `await`.** Loading is asynchronous, so an earlier keystroke
  can resolve after a later one and write a stale list. That read is deliberately outside the
  effect's tracking — it is a guard, not a dependency.
- **The input is `disabled` until hydration.** The search needs no clock, but it does need
  JavaScript, and a box that swallows what you type without answering is worse than one that admits
  it is not ready. It keeps its size either way, so the page still arrives at its final height.
- **The download is visible, and so is its failure.** The search could not wait or fail while its
  text was part of the page; now `search.json` can do both — and MiniSearch, once — and „Keine
  Treffer“ would be a lie either way. Until the index exists the status reads „Suche wird
  geladen…“; if the download fails it reads „Suche nicht verfügbar — bitte die Seite neu laden“,
  and the failed promise is forgotten so the next keystroke tries again. The status asks for the
  reload because only that fixes every cause: a failed `search.json` recovers on the next
  keystroke, a failed MiniSearch import may not (see how MiniSearch is loaded, above).
  `says so while its text is loading` and `says so when its text cannot be loaded` cover them.
- **The panel is absolutely positioned, and that is a requirement rather than a look.** In normal
  flow it shoved the calendar 200 px down the moment a query matched. Since the search moved into
  the header's fixed-height row, a static panel would push the box itself up out of line instead,
  so the e2e test measures the month heading's top and the box's before and after typing; mutate
  the panel back to `static` and it fails. `top-full` resolves to the bottom of the `search` element, which is the
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

A dice IconButton at the end of the header, right of the search: searching is "I want something
specific", the dice is "surprise me", so the two belong together. It sits _outside_ the `search`
element, because it is not a search and the landmark should not claim it. On a narrow screen it
steps aside while the search is unfolded.

- **A button calling `goto`, not a link,** because its target is drawn only when it is pressed.
  With `reset: false`, so `afterNavigate` pulls the fact back under a pinned bar exactly
  as it does for the arrows, and there is no second navigation path to keep in step.
- **It never returns the fact already on screen.** A repeat, however rare, makes the button look
  broken. The e2e test stubs `Math.random` so the pick is deterministic, and
  is built so the stub would land on the current fact if the filter were gone — remove the filter
  and it fails rather than passing on a coincidence. The header is outside the page, so the fact on
  screen is the router's `page.params.date`; on `/` and `404.html` that is a day without a fact or
  nothing, and nothing is left out.
- **`aria-disabled`, not the native attribute,** like every other button here, and bounded until
  hydration, which IconButton does for every button (`!clock.today`). `otherFacts` comes from the
  date list, which is there at prerender time, so without that the button would ship claiming
  `aria-disabled="false"` while no listener exists — enabled-looking and inert, and permanently so
  for a visitor without JavaScript. `a fact is readable and the archive navigable` asserts it from a
  page with JavaScript off.
- **The `dice` Octicon, because Primer has no shuffle icon.** Before Primer the button carried `🔀`,
  chosen over U+2684 `⚄` because at 14 px the Unicode die's five pips each fell under a pixel and it
  read as an empty box. The Octicon is drawn for 16 px and reads; it also renders in the current
  colour, so the emoji's exception to that is gone.

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
  API appears anywhere in the source, nothing is fetched from anywhere but this site, the font is
  self-hosted Mona Sans, and every `img`/`script`/`link` in the built HTML is same-origin. The page says so in those terms,
  which means **the code can turn the page into a false statement** — one external web font, one embedded
  video, one counter. `loads nothing from third-party servers` in
  [legal-pages.e2e.ts](legal-pages.e2e.ts) is the guard: it watches every request
  origin across the home page, a search (so MiniSearch's chunk and `search.json` are inside the
  window), a client-side step to a fact, a day without one and both legal pages. Verified by adding a `fonts.googleapis.com` stylesheet to
  [app.html](../app.html), which turns it red and names the host.
- **There is no test that the footer links carry the base path.** One was written and then deleted:
  mutating `resolve('/impressum')` to a bare `/impressum` never reaches a browser, because the
  prerender crawler refuses it and `pnpm build` dies with "does not begin with `base`". The build is
  the harder gate, and a test that cannot fail reads like cover for something that is not covered.
- **`<main>` stays in each page rather than moving into the layout.** The fact pages' carries
  `data-sveltekit-reset="false"`, which reaches every link inside it; the footer sits _outside_
  `<main>` so that its links navigate like any page change. The header is outside too, and carries
  the attribute itself for its hits.
- **The way back to the facts is the header's name,** the same real page load as on every page —
  see "The home page". The legal pages carried a „Zum Fakt des Tages“ link of their own until the
  header moved into the layout in October 2026.
- **The header's name is a link, not a heading, and every page carries its own `<h1>`:** FactPage
  a visually hidden „Fakt des Tages“, the legal pages their title, the error page its message. A
  header that turned its name into the `<h1>` everywhere but the legal pages was tried and failed
  at `/impressum/` with a trailing slash: Pages serves 404.html there, calendar and all, but
  404.html hands SvelteKit only its components and data, so the route id and `page.url` both come
  from matching the address — the Impressum's, slash dropped — and the page ended up with no
  heading at all. Nothing in the header can see which page was really rendered, so the heading
  moved into the pages. `is reachable from the footer` and the first test in
  [page.e2e.ts](page.e2e.ts) each find exactly one `<h1>`, which Playwright's strict mode would
  refuse were there two.
- **Trailing slashes are not served.** Checked on a real Pages deployment for the date pages:
  `/2026-08-23/` gets `404.html`, which then says „Diese Seite gibt es nicht.“ The legal pages were
  not part of that check but are written the same way. Every link the site generates omits the
  slash, so it only bites a hand-typed URL. `trailingSlash: 'always'` is no longer the way out: it
  would move every date page one directory deeper and break every `fakten/…` image path (see the
  root CLAUDE.md).
- **Only the `Datenschutzerklärung` heading hyphenates.** The pages followed the facts in dropping
  `hyphens-auto` (see the root CLAUDE.md), but that one word is 349 px wide in Primer's 2rem title,
  and without a break it gives a phone narrower than 350 px a horizontal scrollbar; it breaks at
  `Datenschutzerklä-rung`. The class sits on that `<h1>` alone, so the name, address and email
  need no `hyphens-none` any more. That exception existed because `hyphens: auto` once broke the
  address at `…gmail.c|om` on a 320 px screen. `fits a 320 px screen` in
  [legal-pages.e2e.ts](legal-pages.e2e.ts) fails with the class removed, at 372 px. Hyphenation is purely presentational: `textContent` and
  what a selection copies stay byte-identical to the source, so it raises no § 5 DDG or Art. 12
  DSGVO question either way.
- Both pages are asserted readable with **JavaScript switched off**. Prerendering gives that for
  free today, which is exactly why it is worth pinning: a legal page that needs JS is a legal page
  some visitors cannot read, and nothing else would announce the change.
