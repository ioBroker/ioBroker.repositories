# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

Two data files plus the automation that guards them. The data files *are* the product — they are
served to every ioBroker installation as the adapter repository:

- `sources-dist.json` — the **latest** (beta) repository, ~800 adapters.
- `sources-dist-stable.json` — the **stable** repository, a subset of latest pinned to a version.

Everything in `lib/` exists to validate, mutate or publish those two files. Most of it runs as a
GitHub Action against a pull request, not on a developer machine.

## Commands

```bash
npm i

# Mutating the repo files — always go through these, never hand-edit the JSON
npm run addToLatest  -- --name <adapter> --type <type>      # discovers GitHub repo/branch/icon itself
npm run addToStable  -- --name <adapter> [--version x.y.z]  # must already be in latest + on npm
npm run updateStable -- --name <adapter> [--version x.y.z]  # bump an existing stable pin
npm run sort                                                # re-sort + re-normalize both files
npm run nodates                                             # strip versionTime/versionDate

# Tests
npm test                                   # mocha over test/*.js — SLOW (see below)
npx mocha test/checkRepository.test.js --exit          # offline unit tests only, ~instant
npx mocha test/testRepo.js --exit --grep "reserved"    # one case from the network suite

# Structural validators — each is a standalone CLI that exits non-zero on failure
node lib/checkRepository_checkJsonFormatting.js sources-dist.json
node lib/checkRepository_checkLatestAttributes.js
node lib/checkRepository_checkAdapterRepositoryFiles.js   # network; wants OWN_GITHUB_TOKEN

npx eslint .          # there is no `npm run lint` script - and it currently fails, see below
```

`npm test` loads `test/testRepo.js`, which fetches every `meta` URL in both files with a 1 s delay
between requests — it takes 15+ minutes and needs `OWN_GITHUB_TOKEN` to avoid rate limits. Prefer the
single-file / `--grep` forms while iterating.

`npm run check` only works inside a GitHub Action: it reads `GITHUB_REF` / `GITHUB_EVENT_PATH` to find
the PR number and posts comments back. Each such script has a commented-out block near the bottom
(`// process.env.GITHUB_REF = ...`, `event.json`) that is the intended way to run it locally; `event.json`
is gitignored for that purpose.

## Invariants of the two JSON files

Enforced by `checkRepository_*.js` jobs in `.github/workflows/checkRepository.yml`, so a violation is a
red CI, not a style nit:

- Exactly `JSON.stringify(obj, null, 2)` output — 2 spaces, double quotes, no tabs, keys sorted
  alphabetically. `lib/scripts.js` `repoToJsonSorted()` produces this; it also re-orders each entry's
  attributes into a fixed order and drops falsy ones.
- A latest entry has **exactly** `meta`, `icon`, `type` — no extra attributes. `type` must be one of the
  allowed types listed in `checkRepository_checkLatestAttributes.js`.
- A stable entry is the latest entry plus `version`. Every stable adapter must also exist in latest.
- Keys beginning with `_` (currently only `_repoInfo`, the localized repo name/`stable` flag) are metadata
  and are skipped by every check — `getRepositoryEntries()` in `checkRepository_common.js` filters them.
- Reserved names (`config`, `system`, `alias`, `design`, `all`, `self`) must not appear.
- When updating a stable version by hand, delete any `versionTime` attribute.

## Code layout

- `lib/common.js` — thin axios wrappers over the GitHub REST API (comments, labels, issues, lock, close,
  workflow dispatch). Every URL is hardcoded to `ioBroker/ioBroker.repositories`; auth comes from
  `OWN_GITHUB_TOKEN` and falls back to unauthenticated.
- `lib/tools.js`, `lib/build.js` — the publishing side: fetch every `io-package.json`, merge download stats
  from `iobroker.live`, generate npm shield images. Run on the download server (`npm run repos`), not in CI.
- `list/template.html` + `createList()` in `lib/scripts.js` — the public adapter list published as
  `https://download.iobroker.net/list.html` (linked from `README.md`). The template is a standalone
  vanilla-JS page; `createList()` fills it by plain string replacement of two markers, so both must survive
  edits and must each appear exactly once:
  - `//-- INSERT HERE --` inside the `<head>` script → `var adapters = {...}; var types = {...}`
  - `<!-- INSERT HERE -->` in the body → the generation timestamp
  In the injected JSON every `<` is replaced by its unicode escape, because a literal `</script>` in an
  adapter description would otherwise close the block early and break the whole page. Adapter-supplied strings are
  third party input: `formatMaintainer()` escapes the HTML it builds, and the template escapes everything
  else it renders. Opening the template directly (unfilled) shows an empty state instead of throwing.
- `lib/scripts.js` — the maintainer CLI behind `addToLatest`/`addToStable`/`updateStable`/`sort`/`init`.
  Note the `module.parent` guard at the bottom: requiring it exports functions, running it parses argv.
- `lib/checkRepository_*.js` — fast structural validators. One file per CI job, sharing
  `checkRepository_common.js` (`loadRepository`, `getRepositoryEntries`, `logCheck`). Debug logging is off
  unless `--debug`/`--log` or `CHECK_REPOSITORY_DEBUG`/`CHECK_REPOSITORY_LOG` is set. Only the helpers
  exported from these files are unit-tested (`test/checkRepository.test.js`); keep logic exported and
  injectable (e.g. `getJson`, `concurrency` params) rather than inlined at module scope.
- `lib/check.js` — the PR-time adapter check. Diffs the PR against the base to find which adapters changed,
  runs `@iobroker/repochecker` on each GitHub repo, verifies the PR author is a maintainer, and writes one
  aggregated comment.
- The remaining `lib/*.js` are one workflow each (label management, PR info comments, reminders, npm/archived
  scans). They all follow the same shape: `doIt()` invoked at module load, `console.log` the env vars first.
- `localNpmRepo/` is an unrelated side project (a local npm mirror) with its own `package.json`.

## PR bot conventions

- A comment whose body is exactly `RE-CHECK!` re-runs `lib/check.js`; anything else in a comment is ignored.
  `lib/doReCheck.js` posts that comment in bulk to open LATEST/STABLE PRs.
- The bot's own comment is identified by the marker `## Automated adapter checker` and replaced, not appended.
- `lib/setLabels.js` derives labels purely from *which files* the PR touches: stable file only → adds `Stable`,
  both files → `CHANGES-BOTH-REPOSITORIES`, anything else → clears those labels.
- Author legitimacy is checked from public data only (`verifyAuthorLegitimacy`), with an explicit
  `MAINTAINER_WHITELIST` at the top of `lib/check.js`.
- **Never post code-review remarks on a PR that only changes `sources-dist.json` and/or
  `sources-dist-stable.json`.** These are data-only adapter add/update PRs; `lib/check.js` deliberately skips
  review for them (`.github/copilot-instructions.md`).
- Workflows that comment on PRs use `pull_request_target` to get secrets — do not execute PR-supplied code there.

## Stale entries to be aware of

- `npm run repos` cannot work as written: `lib/build.js:234` pulls `require('./scripts').updatePublishes`,
  but `lib/scripts.js` never exports that name, so the call at `lib/build.js:329` hits a TypeError. Fix the
  export before relying on this path.
- `lib/manualAction.js` ignores the `ACTION` / `REPOSITORY` / `ISSUE` inputs that `manualAction.yml` passes
  and instead closes one hardcoded foreign issue. Do not run that workflow until the script reads its env.
- `npx eslint .` currently fails on every file with `Parsing error: error TS18003: No inputs were found in
  config file .../tsconfig.json`. `eslint.config.mjs` points the TS parser at `tsconfig.json`, whose
  `include` resolves to nothing. No workflow runs eslint, so this breaks only local linting.
- `package.json` declares `node >= 12` but every workflow runs Node 22.
- `.archive/` holds deliberately kept obsolete copies (`*--obsolete`); nothing loads them.

## Reviewing adapters

`REVIEW_CHECKLIST.md` is the human reviewer checklist; `ai-review/adapterReview.txt` is the prompt/checklist
for an AI-driven adapter review. The adapter requirements themselves (naming, io-package fields, best
practices for adapter authors) live in `README.md` — that section is the authoritative answer when a PR asks
"why was my adapter rejected".
