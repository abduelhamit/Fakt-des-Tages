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

- **`yaml` and `marked` are `devDependencies`.** They must never reach the browser. That is enforced
  structurally, not by convention: they are imported only from
  [src/lib/server/fakten.ts](src/lib/server/fakten.ts), and SvelteKit fails the build outright on
  `Cannot import $lib/server/… into code that runs in the browser`. Verified, not assumed. Note the
  guard is on that _module_, not on the packages: adding a fresh `import { marked }` straight into
  client code still builds, and ships ~42 KB. Keep parser imports confined to `$lib/server/`.
- **[src/lib/fakten.ts](src/lib/fakten.ts) must stay dependency-free.** It holds `toIsoDate` and the
  `Fakten` type and is imported by the page component, so anything added there ships to the client.
- **A malformed facts file fails `pnpm build`,** so broken content never deploys and the previous
  version stays live. The UI has no runtime error state, and needs none.
- **All facts are embedded in the page.** Accepted limitation: the payload grows with the archive —
  measured at roughly 65 KB gzipped (150 KB raw) per year of daily entries, on the document's
  critical path. If that ever bites, prerender one route per date and keep only the date keys on the
  home page for the calendar.

### The visitor's clock cannot be known at build time

This is the one thing SSG genuinely costs here. `new Date()` during prerendering is the _build_ date,
so [src/routes/+page.svelte](src/routes/+page.svelte) deliberately reads the clock in `onMount`, and
renders a placeholder rather than anything date-specific until then. Computing it at component init
instead would bake the build day into the HTML and visibly flash the wrong fact before hydration
corrected it. That placeholder is the point — do not "fix" it by moving the date out of `onMount`.

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

[src/routes/page.e2e.ts](src/routes/page.e2e.ts) is what pins the SSG guarantees end to end: that
hydration fills the date in, and that **no `.yaml` request happens at runtime**. That second
assertion is the regression guard for the whole build-time pipeline, so do not drop it.

[src/lib/server/fakten.spec.ts](src/lib/server/fakten.spec.ts) parses the **real** facts file, not just
fixtures, and that test runs in the gate. It is what stops a typo pushed from GitHub's web editor
from deploying green and taking the site down; verified to fail, naming the bad key. Do not weaken
it to a fixture.

## Misc

- Tailwind v4 — configured via CSS (`@import`/`@plugin` in [src/routes/layout.css](src/routes/layout.css)),
  no `tailwind.config.js`. `typography` and `forms` plugins are loaded. Prettier sorts classes and
  is pointed at that stylesheet, so run `pnpm format` after touching class lists.
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
- Per the user's global instructions, `.vscode/settings.json` holds local environment tweaks — never
  stage it without asking first.
