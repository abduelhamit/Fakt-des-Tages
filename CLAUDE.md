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

Because both parsers therefore have to run client-side, this needs two runtime dependencies (both
zero-dependency themselves, neither installed yet):

- **`yaml`** (v2) — `YAML.parse(text)`. Not `js-yaml`, and not the `yaml@1` that pnpm has in its
  store transitively; that one is not resolvable from app code.
- **`marked`** — `marked.parse(md)`. Chosen over `markdown-it` purely on size (~470 KB unpacked vs
  ~2 MB) for what is a handful of short paragraphs; swap it if strict 100% CommonMark conformance
  ever matters more than bundle weight.

Use `await res.text()`, not `res.json()` — GitHub Pages' `Content-Type` for `.yaml` is not something
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

`pnpm build` **currently fails** on a clean checkout: adapter-static rejects `src/routes/` as a
dynamic route. Fix by adding `export const prerender = true` to a root `src/routes/+layout.ts` (or
setting the adapter's `fallback` for SPA mode). This is expected to be resolved by the first real
implementation work, not a broken environment.

Two more things GitHub Pages needs that nothing sets up yet:

- `paths.base = '/Fakt-des-Tages'` in the `sveltekit({...})` options — the remote is
  `abduelhamit/Fakt-des-Tages`, so it deploys to a project subpath unless a custom domain is added.
  With a base path set, the runtime `fetch()` of the facts file must go through `base` from
  `$app/paths`, or it will 404 in production while working locally.
- `static/.nojekyll` — neither the adapter nor SvelteKit writes one, and Jekyll drops the `_app/`
  directory.

There is no deploy workflow in the repo (`.github/` does not exist).

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
- `README.md` is the untouched `sv` scaffold template and describes nothing project-specific.
- `.claude/settings.json` enables the official `svelte@svelte` plugin (Svelte 5 / SvelteKit docs and
  skills) — prefer its guidance over recalled Svelte 4 patterns.
- Per the user's global instructions, `.vscode/settings.json` holds local environment tweaks — never
  stage it without asking first.
