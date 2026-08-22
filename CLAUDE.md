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
  visitor's local `Date`; there is no server, so no server-side date logic exists.

## Content pipeline — the central constraint

Facts live in **one YAML file** under `static/` (`static/fakten.yaml`), mapping ISO date to a
**CommonMark** string, so entries can be written and formatted by hand:

```yaml
2026-03-15: |
  Der **Buchdruck** wurde um 1450 von Johannes Gutenberg erfunden.

  Er ermöglichte die *massenhafte* Verbreitung von Wissen — siehe
  [Gutenberg-Museum](https://www.gutenberg-museum.de/).
2026-03-16: Ein kurzer Fakt passt auch einzeilig.
```

The file is **fetched at runtime** with `fetch()` in the browser, then parsed and rendered in the
browser. Never `import` it, never read it in a `load` function that runs at prerender time, never
inline it into the bundle, and never pre-render the Markdown to HTML at build time. The whole point
is that editing the YAML through GitHub's web UI and pushing publishes the change without a rebuild
— a build-time import silently breaks that, and the breakage is invisible until content stops
updating.

Because both parsers therefore have to run client-side, they are runtime `dependencies` (not dev),
both zero-dependency themselves:

- **`yaml`** v2 — `YAML.parse(text)`. Not `js-yaml`, and not the `yaml@1` that pnpm has in its store
  transitively; that one is not resolvable from app code.
- **`marked`** — call it as `marked.parse(md, { async: false })`. Without the option the return type
  is `string | Promise<string>`, which will not go into `{@html}` under `strict`. Chosen over
  `markdown-it` purely on size (~470 KB unpacked vs ~2 MB); swap it if strict 100% CommonMark
  conformance ever matters more than bundle weight.

All of this lives in [src/lib/fakten.ts](src/lib/fakten.ts) — `loadFakten` (fetch + parse),
`parseFakten` (pure, and therefore where the tests aim), `toIsoDate`, `renderFakt`. Use
`await res.text()`, not `res.json()` — GitHub Pages' `Content-Type` for `.yaml` is not something
to depend on. Handle a non-`res.ok` response too; a 404 on Pages returns an HTML error page that
would otherwise parse as garbage YAML rather than throw. The fetch needs a loading state and a
visible failure path, both in German.

Rendering goes through `{@html marked.parse(text)}`, wrapped in Tailwind's `prose` class (the
`@tailwindcss/typography` plugin is already loaded) so headings, lists and links get styling. No
sanitiser is warranted: the YAML is a same-origin asset in this repo, so anyone who can write a fact
can already write the app's JavaScript — it is not a trust boundary. That reasoning stops holding
the moment facts come from anywhere but the repo; add sanitising then.

### YAML gotchas that bite silently

- **Never add a `%YAML 1.1` directive.** Under 1.2 core (the `yaml` package default) a bare
  `2026-03-15` key stays the string `"2026-03-15"`. Under 1.1 it becomes a `Date`, which JS then
  stringifies as an object key to `"Sun Mar 15 2026 01:00:00 GMT+0100 (…)"` — every date lookup
  misses and nothing throws. Verified, not theoretical. Quoting keys also works, but the default
  schema already makes quoting unnecessary.
- **An HTML error page parses as valid YAML, it does not throw.** `YAML.parse('<!DOCTYPE html>…')`
  returns that markup as a plain _string_. So checking `res.ok` is not enough on its own — the
  parsed result has to be type-checked as an object, or a 404 turns into a silently empty app.
- A duplicated date key _does_ throw (`Map keys must be unique`), so that hand-editing mistake is
  caught for free.
- **Malformed entries fail the whole file, by decision.** An entry that parses but has a bad date
  key or a non-string value throws rather than being skipped, so one typo takes the site down until
  it is fixed; in exchange the German error always names the offending key. Do not quietly switch
  this to skip-and-continue.
- Multi-line facts need a `|` block scalar with consistent indentation. This is the main hand-editing
  hazard in the GitHub web editor, so a parse failure should surface a clear German error rather than
  an empty calendar.

## Commands

Package manager is **pnpm** (`engine-strict=true`, `pnpm-workspace.yaml`).

```sh
pnpm dev                  # vite dev server
pnpm build                # production build into build/
pnpm preview              # serve the built output
pnpm check                # svelte-kit sync + svelte-check (type errors in .svelte too)
pnpm lint                 # prettier --check . && eslint .
pnpm format               # prettier --write .
pnpm test                 # both vitest projects, single run
```

Single test / focused runs:

```sh
pnpm vitest run --project=server                       # node tests only
pnpm vitest run --project=client                       # browser tests only
pnpm vitest run src/lib/foo.spec.ts                    # one file
pnpm vitest run --project=server -t 'returns a greeting'   # one test by name
```

`--project=client` requires browsers: `pnpm exec playwright install chromium` (fails with
"Executable doesn't exist" otherwise).

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
  the base path is what the browser bundle uses at runtime, so any runtime `fetch()` of a static
  asset must be resolved through `asset()` from `$app/paths` or it 404s in production while working
  locally. Note `base` and `assets` are **deprecated** — `asset(file)` for things in `static/`,
  `resolve(pathname)` for routes. `asset()` only autocompletes the filenames, it does not enforce
  them, so a rename fails at runtime rather than in `pnpm check`.
- [static/.nojekyll](static/.nojekyll) — insurance, not load-bearing today: an artifact deployed by
  `actions/deploy-pages` is served as-is and never sees Jekyll. It matters only if Pages is ever
  switched back to deploy-from-a-branch, where Jekyll would drop the `_app/` directory. Nothing in
  the toolchain writes one, so it is checked in (0 bytes).
- `packageManager` in [package.json](package.json) — pins pnpm so `pnpm/action-setup` resolves a
  version in CI.

`pnpm dev` and `pnpm preview` also serve under `/Fakt-des-Tages/`; a request to the bare root 404s.
That is the base path working, not a bug.

[.github/workflows/deploy.yml](.github/workflows/deploy.yml) builds on push to `main`: check → lint
→ build → upload `build/`, then a separate job deploys. Browser tests are deliberately not in the
gate — they would need `playwright install chromium` on every run. `actions/configure-pages` runs
with `enablement: true`, so the first successful run switches Pages on by itself; Pages was still
disabled on the repo when this was written, and that step is what flips it.

## Testing setup

Vitest runs as two projects, selected purely by filename:

| Files                                             | Project  | Environment                                                                                                           |
| ------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------- |
| `src/**/*.svelte.{test,spec}.{js,ts}`             | `client` | real chromium via `@vitest/browser-playwright`, `render` from `vitest-browser-svelte`, locators from `vitest/browser` |
| everything else in `src/**/*.{test,spec}.{js,ts}` | `server` | node                                                                                                                  |

So a component test **must** be named `Foo.svelte.spec.ts` — name it `Foo.spec.ts` and it runs in
node and fails. `expect.requireAssertions` is on: a test with no assertion is an error.

`src/lib/vitest-examples/` is scaffold sample code demonstrating both project types. Delete it once
real tests exist rather than building around it.

## Misc

- Tailwind v4 — configured via CSS (`@import`/`@plugin` in [src/routes/layout.css](src/routes/layout.css)),
  no `tailwind.config.js`. `typography` and `forms` plugins are loaded. Prettier sorts classes and
  is pointed at that stylesheet, so run `pnpm format` after touching class lists.
- `/static/` is prettier-ignored, so the facts file is not reformatted.
- [README.md](README.md) is **in German** and aimed at whoever maintains the facts: how to add an
  entry, the YAML rules, the commands. Architecture and rationale belong here in CLAUDE.md, not
  there — keep the two from drifting into duplicates.
- `.claude/settings.json` enables the official `svelte@svelte` plugin (Svelte 5 / SvelteKit docs and
  skills) — prefer its guidance over recalled Svelte 4 patterns.
- Per the user's global instructions, `.vscode/settings.json` holds local environment tweaks — never
  stage it without asking first.
