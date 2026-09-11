# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

Two data files plus the automation that guards them. The data files *are* the product — they are
served to every ioBroker installation as the adapter repository:

- `sources-dist.json` — the **latest** (beta) repository, ~800 adapters.
- `sources-dist-stable.json` — the **stable** repository, a subset of latest pinned to a version.

Everything in `src/` and `lib/` exists to validate, mutate or publish those two files. Most of it runs
as a GitHub Action against a pull request, not on a developer machine.

The code is split **by author**, on purpose - do not migrate one side into the other:

- `src/*.mts` - Bluefox's scripts (`scripts`, `tools`, `build`, `common`, `check`, `test/testRepo`).
  TypeScript, executed **directly** by Node's built-in type stripping: `node src/<x>.mts`. Nothing is
  ever compiled - there is no `build/`, no `prepare` step, and `tsc` is only the type checker
  (`npm run typecheck`). This needs Node >= 22.19 (`engines` in package.json).
- `lib/*.js` + `test/checkRepository.test.js` - Martin's (mcm1957) workflow scripts. Plain CommonJS
  JavaScript, run directly (`node lib/<x>.js`), kept in their original style: not type-checked, not
  linted. Their only link to the TypeScript side is `require('../src/common.mts')` for the GitHub API
  wrappers - Node loads that ES module through `require()`, so the same Node >= 22.19 applies to them.

## Commands

```bash
npm i                 # dependencies only - there is no build step
npm run typecheck     # tsc -p tsconfig.json (noEmit); run it before committing changes to src/
npm run lint          # eslint . - covers src/ only, lib/ and test/ are ignored on purpose

# Mutating the repo files — always go through these, never hand-edit the JSON
npm run addToLatest  -- --name <adapter> --type <type>      # discovers GitHub repo/branch/icon itself
npm run addToStable  -- --name <adapter> [--version x.y.z]  # must already be in latest + on npm
npm run updateStable -- --name <adapter> [--version x.y.z]  # bump an existing stable pin
npm run sort                                                # re-sort + re-normalize both files
npm run nodates                                             # strip versionTime/versionDate

# Tests
npm test                                                   # mocha over src/test/*.mts + test/*.js — SLOW (see below)
npx mocha test/checkRepository.test.js --exit              # offline unit tests only, ~instant
npx mocha src/test/testRepo.mts --exit --grep "reserved"   # one case from the network suite

# Structural validators — each is a standalone CLI that exits non-zero on failure (plain JS, no dependencies)
node lib/checkRepository_checkJsonFormatting.js sources-dist.json
node lib/checkRepository_checkLatestAttributes.js
node lib/checkRepository_checkAdapterRepositoryFiles.js   # network; wants OWN_GITHUB_TOKEN
```

`npm test` loads `src/test/testRepo.mts`, which fetches every `meta` URL in both files with a 1 s delay
between requests — it takes 15+ minutes and needs `OWN_GITHUB_TOKEN` to avoid rate limits. Prefer the
single-file / `--grep` forms while iterating.

`npm run check` only works inside a GitHub Action: it reads `GITHUB_REF` / `GITHUB_EVENT_PATH` to find
the PR number and posts comments back. Each such script has a commented-out block near the bottom
(`// process.env.GITHUB_REF = ...`, `event.json`) that is the intended way to run it locally; `event.json`
is gitignored for that purpose. Without those variables the scripts abort with "Reference not found"
before touching the network, which makes `node src/check.mts` a safe smoke test.

## TypeScript layout

- `tsconfig.json` is the single source of truth and is **type-check only** (`noEmit`). `module`/
  `moduleResolution` are `nodenext`, `allowImportingTsExtensions` permits the `.mts` extensions Node
  needs in relative imports, `erasableSyntaxOnly` rejects anything type stripping cannot erase (`enum`,
  `namespace`, parameter properties), and `verbatimModuleSyntax` forces explicit `import type` so no
  stripped import ends up referencing a type-only export at runtime.
- The sources are `.mts`, not `.ts`, on purpose: package.json must not get `"type": "module"` (Martin's
  `lib/*.js` are CommonJS), and a plain `.ts` with `import`/`export` is then parsed twice by Node with a
  `MODULE_TYPELESS_PACKAGE_JSON` warning. `.mts` is unconditionally an ES module. Consequences inside
  `src/`: `import.meta.dirname` / `import.meta.filename` instead of `__dirname`, no bare `require`
  (`createRequire(import.meta.url)` where a CommonJS package must be loaded that way), and relative
  imports carry the `.mts` extension.
- Every workflow runs `npm i` before its script, for dependencies only. The nine `checkRepository.yml`
  jobs skip even that — those scripts have no dependencies at all. `node-version: 22` in the workflows
  resolves to the newest 22.x, which satisfies the >= 22.19 requirement.
- `@iobroker/eslint-config` only targets `**/*.ts`; `eslint.config.mjs` widens every such block to
  `**/*.mts`. Keep that mapping when touching the config, or the TypeScript sources silently stop
  being linted.
- Typing is deliberately pragmatic: `strict: false`, `noImplicitAny: true`. Third party payloads
  (GitHub API, npm registry, adapter io-package.json) are `any`; `src/types.mts` holds the shapes that
  are actually ours, `src/declarations.d.ts` declares the untyped dependencies.
- `src/scripts.mts` and `src/build.mts` guard their CLI branch with
  `path.resolve(process.argv[1]) === import.meta.filename` (the ESM stand-in for `require.main === module`),
  so importing either module only yields its exports.
- ESLint passes with 0 errors. The migration left a **tightening backlog** configured as warnings in
  `eslint.config.mjs` (missing return types, lazy `require()`, floating promises). Raise them back to
  `error` one rule at a time; do not silently delete the block.

## Invariants of the two JSON files

Enforced by `checkRepository_*.js` jobs in `.github/workflows/checkRepository.yml`, so a violation is a
red CI, not a style nit:

- Exactly `JSON.stringify(obj, null, 2)` output — 2 spaces, double quotes, no tabs, keys sorted
  alphabetically. `src/scripts.mts` `repoToJsonSorted()` produces this; it also re-orders each entry's
  attributes into a fixed order and drops falsy ones.
- A latest entry has **exactly** `meta`, `icon`, `type` — no extra attributes. `type` must be one of the
  allowed types listed in `checkRepository_checkLatestAttributes.js`.
- A stable entry is the latest entry plus `version`. Every stable adapter must also exist in latest.
- Keys beginning with `_` (currently only `_repoInfo`, the localized repo name/`stable` flag) are metadata
  and are skipped by every check — `getRepositoryEntries()` in `lib/checkRepository_common.js` filters them.
- Reserved names (`config`, `system`, `alias`, `design`, `all`, `self`) must not appear.
- When updating a stable version by hand, delete any `versionTime` attribute.

## Code layout

- `src/common.mts` — thin axios wrappers over the GitHub REST API (comments, labels, issues, lock, close,
  workflow dispatch). Every URL is hardcoded to `ioBroker/ioBroker.repositories`; auth comes from
  `OWN_GITHUB_TOKEN` and falls back to unauthenticated. It is the only module shared with `lib/`: Martin's
  scripts load it as `require('../src/common.mts')`, so its 14 export names and their signatures are a
  contract — renaming or retyping one breaks the JS side at runtime, not at type-check time.
- `src/tools.mts`, `src/build.mts` — the publishing side: fetch every `io-package.json`, merge download stats
  from `iobroker.live`, generate npm shield images. Run on the download server (`npm run repos`), not in CI.
  `tools.mts` exports only `getRepositoryFile`; its unexported helpers exist solely to serve it.
- `list/template.html` + `createList()` in `src/scripts.mts` — the public adapter list published as
  `https://download.iobroker.net/list.html` (linked from `README.md`). The template is a standalone
  vanilla-JS page; `createList()` fills it by plain string replacement of two markers, so both must survive
  edits and must each appear exactly once:
  - `//-- INSERT HERE --` inside the `<head>` script → `var adapters = {...}; var types = {...}`
  - `<!-- INSERT HERE -->` in the body → the generation timestamp
  In the injected JSON every `<` is replaced by its unicode escape, because a literal `</script>` in an
  adapter description would otherwise close the block early and break the whole page. Adapter-supplied strings are
  third party input: `formatMaintainer()` escapes the HTML it builds, and the template escapes everything
  else it renders. Opening the template directly (unfilled) shows an empty state instead of throwing.
  The commit dates it shows come from the GitHub API, which allows 60 requests per hour without `OWN_GITHUB_TOKEN`.
  `commitDates.json` (repo root, gitignored) caches them between runs: every run asks for the longest-unchecked
  adapters first, stops asking at the first 403/429 and falls back to the cached date for the rest.
- `src/scripts.mts` — the maintainer CLI behind `addToLatest`/`addToStable`/`updateStable`/`sort`/`init`.
- `src/check.mts` — the PR-time adapter check. Diffs the PR against the base to find which adapters changed,
  runs `@iobroker/repochecker` on each GitHub repo, verifies the PR author is a maintainer, and writes one
  aggregated comment. `@iobroker/repochecker` is loaded through `createRequire`, not `import`: the package
  decides between library and CLI mode on `module.parent`, which is undefined under an ESM import — it
  would then run its CLI and exit with "No repository specified".
- `lib/checkRepository_*.js` — fast structural validators. One file per CI job, sharing
  `lib/checkRepository_common.js` (`loadRepository`, `getRepositoryEntries`, `logCheck`). Debug logging is off
  unless `--debug`/`--log` or `CHECK_REPOSITORY_DEBUG`/`CHECK_REPOSITORY_LOG` is set. Only the helpers
  exported from these files are unit-tested (`test/checkRepository.test.js`); keep logic exported and
  injectable (e.g. `getJson`, `concurrency` params) rather than inlined at module scope.
- The remaining `lib/*.js` are one workflow each (label management, PR info comments, reminders, npm/archived
  scans). They all follow the same shape: `doIt()` invoked at module load, `console.log` the env vars first.

## PR bot conventions

- A comment whose body is exactly `RE-CHECK!` re-runs `src/check.mts`; anything else in a comment is ignored.
  `lib/doReCheck.js` posts that comment in bulk to open LATEST/STABLE PRs.
- The bot's own comment is identified by the marker `## Automated adapter checker` and replaced, not appended.
- `lib/setLabels.js` derives labels purely from *which files* the PR touches: stable file only → adds `Stable`,
  both files → `CHANGES-BOTH-REPOSITORIES`, anything else → clears those labels.
- Author legitimacy is checked from public data only (`verifyAuthorLegitimacy`), with an explicit
  `MAINTAINER_WHITELIST` at the top of `src/check.mts`.
- **Never post code-review remarks on a PR that only changes `sources-dist.json` and/or
  `sources-dist-stable.json`.** These are data-only adapter add/update PRs; `src/check.mts` deliberately skips
  review for them (`.github/copilot-instructions.md`).
- Workflows that comment on PRs use `pull_request_target` to get secrets — do not execute PR-supplied code there.

## Stale entries to be aware of

- `lib/manualAction.js` ignores the `ACTION` / `REPOSITORY` / `ISSUE` inputs that `manualAction.yml` passes
  and instead closes one hardcoded foreign issue. Do not run that workflow until the script reads its env.
- `npm run repos` (`src/build.mts`) runs only on the download server and is not exercised by any test or
  workflow; the dead `updatePublishes` call it used to make was removed during the migration.
- `package.json` still lists `setTag` and `stable` scripts pointing at `lib/setTag.js` / `lib/readyForStable.js`,
  which do not exist (same as on master).
- `unzipper` and `image-size` are devDependencies that nothing imports.
- No workflow runs `npm run lint` or `npm run typecheck`; both are local steps only.


