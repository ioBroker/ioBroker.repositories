# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

Two data files plus the automation that guards them. The data files *are* the product — they are
served to every ioBroker installation as the adapter repository:

- `sources-dist.json` — the **latest** (beta) repository, ~800 adapters.
- `sources-dist-stable.json` — the **stable** repository, a subset of latest pinned to a version.

Everything in `src/` exists to validate, mutate or publish those two files. Most of it runs as a
GitHub Action against a pull request, not on a developer machine.

The scripts are TypeScript (TS 6, CommonJS emit). `src/*.ts` compiles to `build/*.js`, and every
npm script and workflow step runs the **compiled** file: `node build/<x>.js`. `build/` is gitignored.

## Commands

```bash
npm i                 # also runs "prepare", which compiles src/ into build/
npm run build         # tsc -p tsconfig.json, if you need it separately
npm run lint          # eslint .

# Mutating the repo files — always go through these, never hand-edit the JSON
npm run addToLatest  -- --name <adapter> --type <type>      # discovers GitHub repo/branch/icon itself
npm run addToStable  -- --name <adapter> [--version x.y.z]  # must already be in latest + on npm
npm run updateStable -- --name <adapter> [--version x.y.z]  # bump an existing stable pin
npm run sort                                                # re-sort + re-normalize both files
npm run nodates                                             # strip versionTime/versionDate

# Tests - they run against build/, so build first
npm test                                                   # mocha over build/test/*.js — SLOW (see below)
npx mocha build/test/checkRepository.test.js --exit        # offline unit tests only, ~instant
npx mocha build/test/testRepo.js --exit --grep "reserved"  # one case from the network suite

# Structural validators — each is a standalone CLI that exits non-zero on failure
node build/checkRepository_checkJsonFormatting.js sources-dist.json
node build/checkRepository_checkLatestAttributes.js
node build/checkRepository_checkAdapterRepositoryFiles.js   # network; wants OWN_GITHUB_TOKEN
```

`npm test` loads `build/test/testRepo.js`, which fetches every `meta` URL in both files with a 1 s delay
between requests — it takes 15+ minutes and needs `OWN_GITHUB_TOKEN` to avoid rate limits. Prefer the
single-file / `--grep` forms while iterating.

`npm run check` only works inside a GitHub Action: it reads `GITHUB_REF` / `GITHUB_EVENT_PATH` to find
the PR number and posts comments back. Each such script has a commented-out block near the bottom
(`// process.env.GITHUB_REF = ...`, `event.json`) that is the intended way to run it locally; `event.json`
is gitignored for that purpose.

## TypeScript layout

- `tsconfig.json` is the single source of truth: `src/**/*.ts` → `build/`, `module`/`moduleResolution`
  `node16` (the TS 6 successor of the deprecated `node10`), CommonJS emit because package.json has no
  `"type": "module"`.
- `package.json` has a `prepare` script, so `npm i` compiles automatically. Every workflow already ran
  `npm i` before its script — except the nine `checkRepository.yml` jobs, which now run it too.
- Typing is deliberately pragmatic: `strict: false`, `noImplicitAny: true`. Third party payloads
  (GitHub API, npm registry, adapter io-package.json) are `any`; `src/types.ts` holds the shapes that
  are actually ours, `src/declarations.d.ts` declares the untyped dependencies.
- `src/scripts.ts` and `src/build.ts` used to switch behaviour on the deprecated `module.parent`. They
  now export statically and guard the CLI branch with `require.main === module` — same behaviour, and
  `require('./build/scripts')` still yields the identical export surface.
- `tools.appName` is derived from `__dirname` two levels up, so it still resolves to `ioBroker` from
  `build/` exactly as it did from `lib/`. Any change to the output directory depth would break the
  GitHub URLs built from it.
- ESLint passes with 0 errors. The migration left a **tightening backlog** configured as warnings in
  `eslint.config.mjs` (missing return types, lazy `require()`, floating promises). Raise them back to
  `error` one rule at a time; do not silently delete the block.

## Invariants of the two JSON files

Enforced by `checkRepository_*.js` jobs in `.github/workflows/checkRepository.yml`, so a violation is a
red CI, not a style nit:

- Exactly `JSON.stringify(obj, null, 2)` output — 2 spaces, double quotes, no tabs, keys sorted
  alphabetically. `src/scripts.ts` `repoToJsonSorted()` produces this; it also re-orders each entry's
  attributes into a fixed order and drops falsy ones.
- A latest entry has **exactly** `meta`, `icon`, `type` — no extra attributes. `type` must be one of the
  allowed types listed in `checkRepository_checkLatestAttributes.js`.
- A stable entry is the latest entry plus `version`. Every stable adapter must also exist in latest.
- Keys beginning with `_` (currently only `_repoInfo`, the localized repo name/`stable` flag) are metadata
  and are skipped by every check — `getRepositoryEntries()` in `checkRepository_common.ts` filters them.
- Reserved names (`config`, `system`, `alias`, `design`, `all`, `self`) must not appear.
- When updating a stable version by hand, delete any `versionTime` attribute.

## Code layout

- `src/common.ts` — thin axios wrappers over the GitHub REST API (comments, labels, issues, lock, close,
  workflow dispatch). Every URL is hardcoded to `ioBroker/ioBroker.repositories`; auth comes from
  `OWN_GITHUB_TOKEN` and falls back to unauthenticated.
- `src/tools.ts`, `src/build.ts` — the publishing side: fetch every `io-package.json`, merge download stats
  from `iobroker.live`, generate npm shield images. Run on the download server (`npm run repos`), not in CI.
- `list/template.html` + `createList()` in `src/scripts.ts` — the public adapter list published as
  `https://download.iobroker.net/list.html` (linked from `README.md`). The template is a standalone
  vanilla-JS page; `createList()` fills it by plain string replacement of two markers, so both must survive
  edits and must each appear exactly once:
  - `//-- INSERT HERE --` inside the `<head>` script → `var adapters = {...}; var types = {...}`
  - `<!-- INSERT HERE -->` in the body → the generation timestamp
  In the injected JSON every `<` is replaced by its unicode escape, because a literal `</script>` in an
  adapter description would otherwise close the block early and break the whole page. Adapter-supplied strings are
  third party input: `formatMaintainer()` escapes the HTML it builds, and the template escapes everything
  else it renders. Opening the template directly (unfilled) shows an empty state instead of throwing.
- `src/scripts.ts` — the maintainer CLI behind `addToLatest`/`addToStable`/`updateStable`/`sort`/`init`.
  The CLI branch is guarded by `require.main === module`; requiring the module only yields the exports.
- `src/checkRepository_*.ts` — fast structural validators. One file per CI job, sharing
  `checkRepository_common.ts` (`loadRepository`, `getRepositoryEntries`, `logCheck`). Debug logging is off
  unless `--debug`/`--log` or `CHECK_REPOSITORY_DEBUG`/`CHECK_REPOSITORY_LOG` is set. Only the helpers
  exported from these files are unit-tested (`src/test/checkRepository.test.ts`); keep logic exported and
  injectable (e.g. `getJson`, `concurrency` params) rather than inlined at module scope.
- `src/check.ts` — the PR-time adapter check. Diffs the PR against the base to find which adapters changed,
  runs `@iobroker/repochecker` on each GitHub repo, verifies the PR author is a maintainer, and writes one
  aggregated comment.
- The remaining `src/*.ts` are one workflow each (label management, PR info comments, reminders, npm/archived
  scans). They all follow the same shape: `doIt()` invoked at module load, `console.log` the env vars first.
- `localNpmRepo/` is an unrelated side project (a local npm mirror) with its own `package.json`.

## PR bot conventions

- A comment whose body is exactly `RE-CHECK!` re-runs `src/check.ts`; anything else in a comment is ignored.
  `src/doReCheck.ts` posts that comment in bulk to open LATEST/STABLE PRs.
- The bot's own comment is identified by the marker `## Automated adapter checker` and replaced, not appended.
- `src/setLabels.ts` derives labels purely from *which files* the PR touches: stable file only → adds `Stable`,
  both files → `CHANGES-BOTH-REPOSITORIES`, anything else → clears those labels.
- Author legitimacy is checked from public data only (`verifyAuthorLegitimacy`), with an explicit
  `MAINTAINER_WHITELIST` at the top of `src/check.ts`.
- **Never post code-review remarks on a PR that only changes `sources-dist.json` and/or
  `sources-dist-stable.json`.** These are data-only adapter add/update PRs; `src/check.ts` deliberately skips
  review for them (`.github/copilot-instructions.md`).
- Workflows that comment on PRs use `pull_request_target` to get secrets — do not execute PR-supplied code there.

## Stale entries to be aware of

- `npm run repos` cannot work as written: `src/build.ts` pulls `require('./scripts').updatePublishes`,
  but `src/scripts.ts` never exports that name, so the call hits a TypeError. It survived the TypeScript
  migration untouched (it is a raw `require`, so the compiler does not see it). Fix the export before
  relying on this path.
- `src/manualAction.ts` ignores the `ACTION` / `REPOSITORY` / `ISSUE` inputs that `manualAction.yml` passes
  and instead closes one hardcoded foreign issue. Do not run that workflow until the script reads its env.
- Of the 18 symbols `src/tools.ts` exports, only `appName` and `getRepositoryFile` are used anywhere.
  The other 16 are dead code carried over from js-controller's tools.js (~800 of its 1000 lines).
- `unzipper` and `image-size` are devDependencies that nothing imports.
- No workflow runs `npm run lint`; linting is a local step only.
- `package.json` declares `node >= 12` but every workflow runs Node 22.
- `.archive/` holds deliberately kept obsolete copies (`*--obsolete`); nothing loads them.

## Reviewing adapters

`REVIEW_CHECKLIST.md` is the human reviewer checklist; `ai-review/adapterReview.txt` is the prompt/checklist
for an AI-driven adapter review. The adapter requirements themselves (naming, io-package fields, best
practices for adapter authors) live in `README.md` — that section is the authoritative answer when a PR asks
"why was my adapter rejected".
