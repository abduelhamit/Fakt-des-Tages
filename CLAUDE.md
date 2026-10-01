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

How the page itself behaves (the loading placeholder, calendar, sticky bar, search, random fact and
legal pages) is in [src/routes/CLAUDE.md](src/routes/CLAUDE.md). It loads once a file there is
read; if it is not in context yet, read it before answering about or changing anything there.

## Adding a fact

A fact arrives as German prose in the chat, usually with an image URL, and every step below applies
to it. The rules themselves are under the content pipeline below; this is the order they are
applied in and what is checked, so nothing depends on remembering a past session.

1. **The entry.** Append `YYYY-MM-DD: |-` at the end of [fakten.yaml](src/lib/fakten.yaml),
   two-space indent, image as its last paragraph. The prose stays the user's: change only what the
   checks below flag, and report each change _and_ each thing deliberately left alone. Paragraph
   breaks are the user's call.
2. **Language.** Grammar and spelling first — case agreement (an apposition takes its head's case),
   gender, genitive after `mithilfe`/`wegen`, idiom. Fix clear errors; offer stylistic ones as
   suggestions without applying them. Check the `Heute vor N Jahren` arithmetic, and leave N as a
   numeral.
3. **Facts.** The prose comes from Wikipedia already, so do not re-verify it wholesale. Check
   what looks wrong, and the places where copying and rewording most easily introduce a mistake:
   figures, dates and names, superlatives like `der einzige` or `zum ersten Mal`, and any sentence
   whose meaning may have drifted from its source. Check against `de.wikipedia.org` or
   `en.wikipedia.org` (`action=query&prop=extracts&explaintext=1`), and confirm against the source
   before calling something wrong — a figure that only looks implausible is not an error.
4. **Typography.** No-break spaces per the rules under the content pipeline: cardinals, ordinals,
   units, spaced abbreviations, and never a number that ends a sentence. No soft hyphens; strip any
   that arrived. Count the characters in the entry rather than trusting the eye.
5. **The image.**
   - **Licence.** `curl -s -G --data-urlencode` against the API
     (`action=query&prop=imageinfo&iiprop=url|size|mime|extmetadata&titles=File:…`) with a
     User-Agent naming the site and the Impressum address. Query `commons.wikimedia.org`, except
     for non-free files: Commons accepts free licences only, so a fair-use cover or poster lives on
     `en.wikipedia.org` and has to be asked there, as the Nevermind cover was. Not on
     `de.wikipedia.org`, which hosts no non-free files at all — German law has no fair use. Read
     `LicenseShortName`, `AttributionRequired`, `NonFree`, `Restrictions` and `Credit`. A
     plain-text body means a 429, not a parse failure.
   - **Download** the original from `upload.wikimedia.org`. `thumb.wikimedia.org` returns HTML, and
     a non-standard thumbnail width 404s.
   - **Non-free images:** look for a rights holder's own permission first — press kits, legal FAQs;
     those pages are often JavaScript-walled and answer a plain fetch with a bare title or a 403,
     which means "read it with Playwright", not "not there" — and fall back to a
     § 51 UrhG quotation at the smallest useful size. **Flag two German-law caveats whenever they
     apply**, because Commons reasons from US law: a `PD-textlogo` may still reach the ordinary
     threshold for applied art since BGH _Geburtstagszug_ (2013), and a photograph of a
     public-domain two-dimensional work carries its own § 72 UrhG protection under BGH
     _Reiss-Engelhorn_ (2018), whatever the Commons tag says.
   - **Credit line:** CC → credit, PD/CC0 → none, rights-holder declaration → verbatim, per the
     credit rules under the content pipeline.
   - **Format and size, measured at the 624 px the column displays.** 1000–1280 px wide covers 2×
     screens. Photographs progressive JPEG at 4:4:4, line art Adam7-interlaced PNG (an undithered
     palette usually wins; dithering inflates the file), alpha per the transparency rule — see the
     interlacing rule for when a PNG stays non-interlaced. Always `-strip`; if the source is already
     a high-quality JPEG at the target size, `jpegtran -copy none -optimize -progressive` instead of
     re-encoding. Most images land under 250 KB — say the size, and why when it is more.
   - **File** `static/fakten/YYYY-MM-DD-N.ext`.
   - **Alt text in German**, describing what is visible — subject, colours, layout, any lettering
     quoted in „…“. It is the only description a screen reader gets and it feeds the search. It
     must not claim what the file lacks: a transparent PNG has no `weißer Grund`.
6. **The gate.** `git check-attr filter -- static/fakten/<file>` must say `lfs`; then `pnpm lint`,
   `pnpm vitest run`, `pnpm build`. Then read the entry back out of `build/index.html`: the
   invisible characters literal, no `&nbsp;`, `&#8239;` or `&shy;` anywhere, and the image in
   `build/fakten/` a real file according to `file`, not a pointer.
7. **Report:** what changed, what was left and why, the licence verdict and its caveats, and the
   image's format, size and reasoning.
8. **Commit only when asked.** Stage explicit paths rather than everything. Subject
   `Add <subject> as the fact for YYYY-MM-DD`; the body records the decisions. A later correction
   to the same day is amended into that commit when the user asks, message unchanged.

**Measuring traps**, each of which produced a wrong reading at least once:

- `pnpm test:e2e` leaves `build/` built from `fakten.probe.yaml`. Rebuild before checking real
  content.
- `pnpm preview` moves silently to the next free port when 4173 is taken, so a forgotten server
  goes on answering with an old build. Run measurement servers with `--port N --strictPort`, stop
  them by port (`lsof -ti tcp:N`), and assert that the served page carries the new markup before
  reading anything off it.
- `.prose p` exists before the right fact does. Wait for the fact's own text before measuring or
  taking a screenshot.
- Rebuilding lines from character rects cannot see an automatic hyphen, so it reads one character
  short. Take a screenshot to judge a break.
- Resizing two files to the same _width_ can leave their heights a pixel apart, and
  `magick compare` then reports a meaningless number instead of complaining. Pin both dimensions
  with a `!` geometry.
- Playwright scripts outside the test runner must run from the project directory, as
  `node --input-type=module -e "…"`, or `@playwright/test` does not resolve.

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
  all of it on the document's critical path, so measure it (`gzip -c build/index.html | wc -c`)
  rather than trusting a remembered figure. If that ever bites, prerender one route per date and
  keep only the date keys on the home page for the calendar. The UI is not what
  costs: measured by removing each from the built HTML and re-gzipping, the search bar is 153 bytes
  gzipped and the loading mock's 42 cells are 113 (5.1 KB raw — repeated markup compresses away).
- **`Heute vor N Jahren …` opens nearly every entry, and N is a numeral — always.** Not one entry
  spells it out. Do not "correct" a small number to a word there. German style
  does prefer words below twelve, but that is a rule for running prose and the opener is a fixed
  formula, so the two live side by side quite happily: 2026-09-22 has `knapp zehn Jahre später`
  mid-sentence, spelled out, and 2026-09-28 has `Heute vor 6 Jahren`, in digits. Both are correct.
  The same goes for a `Vor N Jahren` that opens a clause further in. The entries starting
  otherwise are the ones no anniversary fits — `Heute ist Rosenmontag!`,
  `Heute ist Freitag, der 13.`
- **A number and what it belongs to are joined by a no-break space, and which one depends on what
  follows.** `25 Mio. $` takes **U+202F**, the narrow no-break space, in both gaps; `vor 35 Jahren`
  takes **U+00A0**, the normal-width one. The boundary is Duden's: narrow before an abbreviation,
  unit or symbol (`25 Mio.`, `1,1–1,3 Mrd.`, `70 %`, `20 °C`, `10 km`, `§ 5`) and inside a spaced
  abbreviation (`z. B.`, `u. a.`, `d. h.`); normal width before a spelled-out word the number
  counts (`vor 35 Jahren`, `90 Minuten`). Do not collapse the two onto one character, tempting as
  it is — DIN 5008 would allow a full space throughout, but measured in the page's own font at
  16 px U+202F is 1.94 px against U+00A0's 4.19 px, which is right for `25 Mio. $` and visibly
  wrong for `vor 35 Jahren`, where it jams the words together. A plain space in either position is
  a defect, not a matter of taste. Only numerals count: `zehn Jahre` and `in den 1990er Jahren`
  keep an ordinary space, because an orphaned `Jahre` reads perfectly well where an orphaned
  `Mio.` does not. The examples above are written with ordinary spaces on purpose:
  the two characters are indistinguishable on the page, so embedding them here would teach nothing.
- **Both are invisible and differ only in width, so the wrong one is silent.** Retyping a figure by
  hand drops the character altogether and nothing in the gate notices. Everything here was checked for
  both characters rather than assumed: the YAML parser preserves them, `marked` emits them literally with no `&nbsp;` or
  `&#8239;` reaching the built HTML, Prettier round-trips them inside a block scalar, and the
  search index is unaffected because `worte` splits on `[^\p{L}\p{N}]+` — neither is a letter or a
  digit, so both separate tokens exactly like an ordinary space. U+202F is a real glyph in the
  site's font stack, not a fallback: 1.94 px against 15.69 px for a tofu box. The archive was
  swept once to match, so a plain space beside a numeral is now a defect to fix rather than a
  backlog item.
- **An ordinal binds to the word it labels, and that is the same rule seen from the other side.**
  `1. Januar`, `19. Jahrhundert`, `9. Sinfonie`, `26. Präsident` and `100.000. Artikel` all take
  **U+00A0**. With a cardinal the thing at risk is the orphaned noun — `vor 35 Jahren` must not
  leave `Jahren` stranded on the next line. With an ordinal it is the reverse: a line ending in a
  bare `9.` reads as a sentence that has finished. Duden and DIN 5008 ask for this in dates
  explicitly.
- **A number that ends a sentence is indistinguishable from an ordinal, and binding one is worse
  than missing one.** `Heute ist Freitag, der 13.` before `Ich könnte …`, the score `2–1.` before
  `Vor 200.000 Cariocas`, and `… aus dem Jahr 1995.` before `Heutzutage …` are the cases in the
  archive, and a no-break space in any of them welds two sentences together. No pattern over digits
  and capitals can separate the two cases, so classify on the following word — a month name,
  `Jahrhundert`, a counted noun — and leave whatever you cannot place alone rather than guessing. Name plus number is a
  different construction and deliberately untouched: `Area 51`, `Nintendo 64`, `Platz 1` and
  `Artikel 1` keep ordinary spaces, because this rule is about a numeral standing before its own
  word.
- **Hyphenation is the browser's job, and a soft hyphen is never to be typed into a fact.** The
  fact column is `prose hyphens-auto` on the `<article>` in
  [+page.svelte](src/routes/+page.svelte), which together with the `lang="de"` already on `<html>`
  in [app.html](src/app.html) hands the whole problem to the browser's German dictionary. Measured
  at a 375 px viewport on the 2026-10-01 entry: the median gap at the right margin falls from 28 px
  to 12 px and the lines ending more than 30 px short go from 9 to 1, breaking correctly at
  `ange-brachter`, `er-laubte`, `überprü-fen` and `Län-gengrad`. One utility class, every entry
  covered including the ones not written yet, and the stored text stays plain.
- **Do not reintroduce soft hyphens: they broke the search.** `worte` splits on `[^\p{L}\p{N}]+`,
  and U+00AD is a format character — neither letter nor digit — so a soft-hyphenated `Flughafen`
  entered the index as `flug` and `hafen`, and typing `Flughafen` matched nothing. Nothing in the
  gate would notice one coming back, and the character is invisible in every editor.
- **Images live in [static/fakten/](static/fakten/)** and are referenced relatively —
  `![…](fakten/2026-03-06-1.jpg)`, so the path resolves against the page and the base path stays in
  one place. **That works because facts are only ever rendered on `/`** — not because `/` is the
  only route. Render a fact on any other route
  and every image on it 404s, because `fakten/…` would resolve against _that_ route's directory.
  They are exempt from the payload note above: only the selected day's `{@html}` is in the DOM, so a
  visitor downloads the images of the day they are looking at and no others.
- **Clicking an image opens its file, and that link is the whole zoom feature.** `renderFakt` wraps
  every `<img>` in `<a href>` to its own `src`, at build time, so nothing is written per entry. The
  browser's image viewer then toggles fit-to-window and 100 % on click, pinches on a phone and
  zooms with the keyboard, and Back returns to the same fact with its hash. It needs no JavaScript.
  An in-page `<dialog>` with on-screen −/100 %/+ buttons was weighed and passed over as roughly
  50 lines doing what the browser already does. The wrapper changes no layout: every image and
  credit across every illustrated entry measured identically at 375 and 1024 px, before and
  after. Two things depend on it: the credit selector below, and the `zoom-in` cursor in
  [layout.css](src/routes/layout.css). A fact that puts an image inside its own link would nest
  one `<a>` in another, which is invalid HTML, so no entry does.
- **`renderFakt` also writes each image's own `width` and `height`,** read from the file under
  `static/` with `image-meta`, so the browser reserves the box before the bytes arrive and the text
  below does not jump when a day is picked. Preflight's `height: auto` keeps the displayed size what
  it was: measured on every image in the archive at 375 and 1024 px, every position and height
  identical to the hundredth of a pixel, and with image requests blocked every box still held its
  full height. An image it cannot measure — a mistyped path, an LFS pointer, a remote URL, a format
  the library does not know, a header declaring an impossible size — fails `pnpm build`, naming the
  path. Remote images are therefore not possible without changing this, which is fine: every image
  is downloaded into `static/fakten/`. **Do not swap it for the more popular `image-size`.** Both
  read every image in the archive identically, but `image-size` returns `0 x 0` for a header
  declaring an empty surface — tested against 2.0.4 with a GIF and a PNG header, and its GIF parser
  returns the two size fields unchecked — which would ship as `width="0"` and hide the image without
  failing anything, while `image-meta` throws. `@carboneio/image-size`, a security fork that also
  throws, was passed over for its tiny user base, and `sharp` because it is async-only, which the
  synchronous renderer cannot use, and ships native binaries to read a header.
- **A CC-licensed image carries its credit in the entry**, on the line after it, as
  `_Foto: Name, [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)_`. Same paragraph as
  the image, and **no hard break** between them: Preflight makes `img` a block, so the credit starts
  on its own line regardless, and a `<br>` there buys nothing but an extra empty line — measured, it
  left the credit 37 px from both pictures, belonging to neither.
  [layout.css](src/routes/layout.css) closes the first gap to 8 px, and the selector is the load-
  bearing part: `.prose p > a:has(+ em) > img` matches only an image with a credit after it — the
  sibling is the image's zoom link, not the image (see the point above) — so the
  single images and the back-to-back pairs elsewhere in the archive keep their 32 px. Verified by
  measuring all four cases in a browser rather than reasoning about the cascade. It has to live in
  `@layer utilities`, because that is where the typography plugin puts `.prose :where(img)` and a
  later layer beats any specificity — in `components` the rule ships, matches, and does nothing.
  Public-domain and CC0 images get no line, since none is owed. Note the credit is rendered text, so
  the photographer's name joins the search index like any other word in the fact.
- **That same line also carries a rights-holder's _required declaration_, which is a third case
  and not a credit.** 2026-09-28 is the first: Genshin Impact screenshots exist under no free
  licence at all, but HoYoverse's
  [Legal FAQ](https://www.hoyolab.com/article/143107) (item 2) says of posting game imagery on a
  personal or any other website that "We do not prohibit non-commercial personal use" — while
  stating outright that this is not a transfer of rights and "nor should it be regarded as an
  approval in the legal sense". It attaches one condition, and meeting it is what the line is for:
  "it is required to place the COGNOSPHERE legal declaration on such works". So the entry carries
  `_© All rights reserved by COGNOSPHERE. Other properties belong to their respective owners._`
  **verbatim** — do not translate it, shorten it or fold it into a German credit, because the
  wording is the condition rather than a courtesy. It sits in the same slot as a CC credit, so the
  `:has(+ em)` spacing rule picks it up for free. Note what this does _not_ do: the permission is
  non-commercial only and revocable, so it would lapse if this site ever took money. The other
  non-free images here (the Hobbit and Naruto covers, Crash, the Lego box, the Nevermind cover)
  rest on a § 51 UrhG quotation argument instead and carry no line, because no rights holder has
  asked for one.
- **The fact texts are reworked Wikipedia prose, and one sentence in the footer carries what that
  licence requires.** Nearly every entry leans on the German or English Wikipedia; 2026-10-01 is the
  extreme, where both of the last two paragraphs are word for word from `Zeitball` and
  `Zeitball (Bremerhaven)`. Wikipedia is
  CC BY-SA 4.0, which unlike the public-domain images here genuinely obliges: name the source, name
  the licence, disclose that something was changed, and licence the result alike.
  [+layout.svelte](src/routes/+layout.svelte) does that in the footer rather than under each fact on
  purpose — a per-entry credit would be the stricter reading, but it would need maintaining per
  entry, and the credit nobody remembers to add is the one that is missing. Accepted limitation: the
  notice names Wikipedia rather than the individual article behind each fact.
  `nennt Herkunft und Lizenz der Fakten in der Fußzeile` in
  [rechtsseiten.e2e.ts](src/routes/rechtsseiten.e2e.ts) asserts all three, and pins each
  language edition to its own host, after being verified to
  fail with the sentence deleted; without it the notice is static markup whose removal nothing would
  announce. It is also why the no-JavaScript test names the two legal links rather than counting the
  footer's links.
- **Those images are in Git LFS** ([.gitattributes](.gitattributes) tracks `static/fakten/*.jpg`,
  `*.gif` and `*.png`), so the repo carries pointers instead of binaries. Add the
  pattern before the first file of a new format, or it lands in the repo as a real binary and no
  check notices. Photographs are JPEG; PNG is there for line art, where JPEG rings around the edges
  — the tughra on 2026-08-31 is half the size as a 16-colour PNG8 and sharp, against a JPEG at the
  same width. Two consequences, both load-bearing:
  - `actions/checkout` in [deploy.yml](.github/workflows/deploy.yml) needs **`lfs: true`**. Without
    it the build gets 130-byte pointer files, copies them into `build/fakten/` and deploys every
    image on the site broken. The gate test below reads the file headers to catch that, and since
    `renderFakt` measures every image, `pnpm build` itself fails on a pointer too.
  - Adding or replacing an image needs a local clone with `git lfs install`. Editing the _text_ of
    a fact in GitHub's web editor is unaffected.
- **Decide JPEG against PNG at the size the image is shown, not at full size — the two disagree.**
  The 1876 engraving on 2026-10-01 is the case that proves it. Hatching looks like line art, and as
  a 256-colour PNG it did score better than JPEG at full width: RMSE 0.016 against 0.032. At the
  624 px the prose column actually gives it, the order reverses — 0.019 for the PNG against 0.012
  for the JPEG. Palette error is per pixel and survives downsampling, while the high-frequency
  hatching JPEG discards averages out of existence on the way down. So it is a photograph for this
  purpose and ships as one. Chroma subsampling lost as well, which is worth knowing because it
  normally wins on anything photographic: 4:2:0 saved 23 % of the file and tripled the display-size
  error, because the hand-colouring has hard edges in the flags, figures and foliage. Everything
  here stays 4:4:4.
- **Images load coarse-to-fine: JPEGs progressive, PNGs Adam7-interlaced.** On a slow connection
  the picture appears whole and blurry and then sharpens, instead of filling in from the top. For
  JPEG it is free: `jpegtran -progressive` is lossless — verified pixel-identical with
  `magick compare -metric AE` — and usually makes the file slightly smaller. For PNG it is not:
  Adam7 compresses worse, and on small palette line art it can cost a third of the file. Encode a
  new PNG both ways with the same encoder, interlace it unless that clearly grows the file, and say
  which way it went; a non-interlaced PNG in the archive is one where it did. The animated GIFs are
  not interlaced either: their weight is the frame count, which interlacing does nothing about.
- **Transparency is a consequence of choosing PNG, never a reason to choose it.** Settle the format
  on the ringing question alone — photographs JPEG, line art PNG, as above. Only once PNG has won on
  its own merits is the background a question at all, and then the default is to keep the alpha
  channel rather than flatten it onto white. The Cheers wordmark on 2026-09-30 is the first one that
  does: it looks identical on today's white page and is the smaller file, 52,762 bytes against
  54,055 flattened. Two questions decide it, and the two older PNGs each answer no to one, which is
  why both are flattened:
  - **Is the white part of the picture, or just where the picture stops?** The Malaysian flag on
    2026-09-16 is a rectangle whose white stripes _are_ the artwork — there is no
    outside-the-subject to remove, and a flag with holes in it is a mistake rather than an option.
  - **Does the mark still read on a ground that is not white?** The tughra on 2026-08-31 is solid
    black calligraphy, so transparent it would survive only as long as whatever sits behind it
    stays pale and would vanish against anything dark. The white there is doing real work and stays
    baked in. `Cheers` passes because its letters carry their own gold and only the keyline is
    black.

  Check the interior holes before shipping one. The counters inside the Cheers letters are genuine
  gaps in the SVG, so a coloured ground shows through them — correct for a wordmark, wrong for a
  logo meant to sit on its own white tile. Nothing tests any of this: alpha is invisible against a
  white page, so a wrong call here looks right until the day something is put behind it.

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
that reason. Read `getBoundingClientRect()` through `page.evaluate` instead.

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
  the page looking clickable, so `button:not([aria-disabled='true']):not(:disabled)` puts the hand
  back. Both exclusions are the point, and they are not interchangeable — a bounded arrow is only
  `aria-disabled` and stays focusable, while the heading is natively `disabled` before hydration.
  Leave either one out and an inert control offers the hand; the `:disabled` half was missing at
  first and the heading button caught it. Each has an e2e test, verified to fail when reverted.
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
