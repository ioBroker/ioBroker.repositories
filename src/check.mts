import fs from 'node:fs';
import axios from 'axios';
import { addComment, addLabel, deleteLabel, getGithub, getUrl, getAllComments, deleteComment } from './common.mts';
import type * as Repochecker from '@iobroker/repochecker';
import { createRequire } from 'node:module';

// @iobroker/repochecker switches between library and CLI mode on `module.parent`, which is undefined
// when a CommonJS package is loaded through an ES module import - it would then run its CLI and
// exit with "No repository specified". Loading it through require() keeps it in library mode.
const require = createRequire(import.meta.url);
const checker: typeof Repochecker = require('@iobroker/repochecker');

const TEXT_RECHECK = 'RE-CHECK!';
const TEXT_COMMENT_TITLE = '## Automated adapter checker';
const TEXT_MULTIPLE_REPOSITORIES =
    'Please create seperate PRs for every adpater to add or update. This PR might be closed as it changes or adds more than one adapter.';
const ONE_DAY = 3600000 * 24;

/** One line of the aggregated "Automated adapter checker" comment. */
interface CommentLine {
    text: string;
    link?: string;
    owner?: string;
    adapter?: string;
    noDecorate?: boolean;
}

// GitHub users which are always allowed to add or update adapters.
// Each entry is an object:
//   { user: '<github-login>' }                          -> whitelisted for ALL repositories
//   { user: '<github-login>', repos: ['owner/repo'] }   -> whitelisted for the listed repositories only
// A repo may be given as full name 'owner/ioBroker.adapter' or just the adapter repo
// name 'ioBroker.adapter' (matched case-insensitively).
interface WhitelistEntry {
    user: string;
    repos?: string[];
}

const MAINTAINER_WHITELIST: WhitelistEntry[] = [
    { user: 'mcm1957' }, // whitelisted for all repositories
];

function getPullRequestNumber() {
    if (process.env.GITHUB_REF && process.env.GITHUB_REF.match(/refs\/pull\/\d+\/merge/)) {
        const result = /refs\/pull\/(\d+)\/merge/g.exec(process.env.GITHUB_REF);
        if (!result) {
            throw new Error('Reference not found.');
        }
        return result[1];
    }

    if (process.env.GITHUB_EVENT_PATH) {
        const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
        return event.pull_request ? event.pull_request.number : event.issue ? event.issue.number : '';
    }

    throw new Error('Reference not found. process.env.GITHUB_REF and process.env.GITHUB_EVENT_PATH are not set!');
}

/** One repochecker run, plus the badge flags the reporting step attaches afterwards. */
interface AdapterCheckResult {
    /** the GitHub URL the check was run against */
    adapter: string;
    context: Repochecker.RepocheckerResult;
    badgeLatest?: boolean;
    badgeStable?: boolean;
}

function executeOneAdapterCheck(adapter: string): Promise<AdapterCheckResult> {
    return new Promise((resolve, reject) => {
        checker.handler(
            {
                queryStringParameters: {
                    url: adapter,
                },
            },
            null,
            (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    // The checker answers with a bare `{ error }` body only when no url was given;
                    // one is always passed here, so the body is a full result.
                    const context = JSON.parse(data.body) as Repochecker.RepocheckerResult;
                    context.errors = context.errors.sort();
                    context.warnings = context.warnings.sort();
                    resolve({ adapter, context });
                }
            },
        );
    });
}

/**
 * Fetch the raw JSON content of a file at a specific ref using the GitHub Contents API.
 * Returns a parsed object or null on error.
 */
async function fetchJsonAtRef(filename: string, ref: string) {
    try {
        const url = `https://api.github.com/repos/ioBroker/ioBroker.repositories/contents/${filename}?ref=${ref}`;
        const meta = await getGithub(url);
        // The Contents API returns base64-encoded content
        const decoded = Buffer.from(meta.content, 'base64').toString('utf8');
        return JSON.parse(decoded);
    } catch (e) {
        console.error(`Cannot fetch ${filename} at ref ${ref}: ${e}`);
        return null;
    }
}

/**
 * Check whether a GitHub user is a public member of an organization.
 *
 * Uses "GET /orgs/{org}/public_members/{username}" which is readable without any
 * special access rights (it exposes publicly visible membership only):
 *   - 204 No Content -> the user is a public member
 *   - 404 Not Found  -> the user is not a public member (or membership is private)
 */
async function isPublicOrgMember(org: string, username: string) {
    try {
        // getGithub resolves on 2xx (204 -> empty body) and throws on 404.
        await getGithub(
            `https://api.github.com/orgs/${encodeURIComponent(org)}/public_members/${encodeURIComponent(username)}`,
        );
        return true;
    } catch {
        return false;
    }
}

/**
 * Check whether a user is whitelisted for a given repository.
 *
 * An entry without a (non-empty) `repos` list whitelists the user for ALL repositories.
 * Otherwise the user is only whitelisted for the listed repositories. A repo entry may
 * be the full name 'owner/ioBroker.adapter' or just the repo name 'ioBroker.adapter'.
 */
function isWhitelisted(owner: string, adapter: string, username: string) {
    const fullName = `${owner}/${adapter}`.toLowerCase();
    const repoName = adapter.toLowerCase();

    return MAINTAINER_WHITELIST.some(entry => {
        if (!entry?.user || entry.user.toLowerCase() !== username.toLowerCase()) {
            return false;
        }
        if (!entry.repos?.length) {
            // No repo restriction -> whitelisted for all repositories.
            return true;
        }
        return entry.repos.some((repo: string) => {
            const r = String(repo).toLowerCase();
            return r === fullName || r === repoName;
        });
    });
}

/**
 * Check whether the user has merged at least one of the last 25 pull requests of the
 * repository that were not created by dependabot. Only users with write (push) access
 * can merge pull requests, so this is a reliable - and publicly readable - indication
 * that the user is a maintainer.
 *
 * Dependabot pull requests are excluded because they are frequently merged automatically
 * and would otherwise dominate the recent history. The pull request list endpoint does
 * not include the `merged_by` field, so the merged pull requests among the scanned 25
 * are inspected individually (short-circuiting as soon as a match is found). This runs
 * only as a fallback after the cheaper checks failed.
 */
const RECENT_PR_SCAN_LIMIT = 25;

function isDependabotPr(pr: any) {
    const login = pr?.user?.login || '';
    return login.toLowerCase().startsWith('dependabot');
}

async function hasMergedRecentPr(owner: string, adapter: string, username: string) {
    try {
        const prs = await getGithub(
            `https://api.github.com/repos/${owner}/${adapter}/pulls?state=closed&per_page=100&sort=updated&direction=desc`,
        );
        const merged = (prs || [])
            .filter((pr: any) => pr?.merged_at && !isDependabotPr(pr))
            .slice(0, RECENT_PR_SCAN_LIMIT);
        for (const pr of merged) {
            try {
                const detail = await getGithub(`https://api.github.com/repos/${owner}/${adapter}/pulls/${pr.number}`);
                if (detail?.merged_by && detail.merged_by.login.toLowerCase() === username.toLowerCase()) {
                    return true;
                }
            } catch (e) {
                console.error(`Cannot read PR ${owner}/${adapter}#${pr.number}: ${e}`);
            }
        }
    } catch (e) {
        console.error(`Cannot list pull requests of ${owner}/${adapter}: ${e}`);
    }
    return false;
}

/**
 * Determine whether the PR author is a legitimate maintainer of the adapter repository
 * WITHOUT requiring write (push) access to that repository for the checking token.
 *
 * The GitHub "collaborator permission" API requires the caller itself to have push
 * access to the target repo, so it cannot be used here - the check must work with a
 * token that only has public/read access to third-party adapter repositories.
 *
 * Legitimacy is inferred from publicly readable facts, in order:
 *   1. The author is whitelisted (globally or for this repository).
 *   2. The author owns the repository (`owner === author`) -> always has write access.
 *   3. The repository is owned by an organization, and the author is a *public* member
 *      of that organization.
 *   4. The author has merged at least one of the last 100 pull requests of the repo
 *      (only users with write access can merge).
 *
 * Returns a short human-readable reason string if the author is considered legitimate,
 * otherwise `null`.
 *
 * This intentionally errs on the side of caution: private org members or collaborators
 * that leave no publicly visible trace are not detected and will cause the PR to be
 * flagged with 'maintainer ?' for a manual review. The label is a review hint, not a
 * hard block, so failing "closed" (towards a manual check) is the safe direction.
 */
async function verifyAuthorLegitimacy(owner: string, adapter: string, username: string) {
    if (!owner || !adapter || !username) {
        return null;
    }

    // 1. Whitelisted (globally or for this repository).
    if (isWhitelisted(owner, adapter, username)) {
        return 'is listed on the maintainer whitelist';
    }

    // 2. Author owns the repository.
    if (owner.toLowerCase() === username.toLowerCase()) {
        return 'is the owner of the repository';
    }

    // 3. Repository owned by an organization the author publicly belongs to.
    try {
        const ownerInfo = await getGithub(`https://api.github.com/users/${encodeURIComponent(owner)}`);
        if (ownerInfo && ownerInfo.type === 'Organization' && (await isPublicOrgMember(owner, username))) {
            return 'is a public member of the owning organization';
        }
    } catch (e) {
        console.error(`Cannot determine owner type of ${owner}: ${e}`);
    }

    // 4. Author has merged a recent pull request of the repository.
    if (await hasMergedRecentPr(owner, adapter, username)) {
        return 'has merged a recent pull request of the repository';
    }

    return null;
}

/**
 * Determine which adapter names were genuinely changed (added or modified) between
 * the base and head of the PR for a given sources file.
 *
 * Strategy: compare the parsed JSON objects of the file at base vs head.
 * - An adapter is "changed" if it is present in head but absent from base (new adapter),
 *   OR if it is present in both but its content differs (modified adapter).
 * - Deleted adapters (present in base, absent in head) are NOT checked.
 *
 * This mirrors exactly what GitHub shows in the "Files" tab: structural changes
 * to the JSON objects, not whitespace/formatting/sort-order noise.
 */
async function detectChangedAdaptersInFile(filename: string, baseRef: string, headRef: string) {
    console.log(`Comparing ${filename}: base=${baseRef} head=${headRef}`);

    const [baseJson, headJson] = await Promise.all([
        fetchJsonAtRef(filename, baseRef),
        fetchJsonAtRef(filename, headRef),
    ]);

    if (!headJson) {
        console.error(`Cannot read head version of ${filename}, skipping.`);
        return [];
    }

    const changedAdapters = [];

    for (const adapterName of Object.keys(headJson)) {
        const headEntry = headJson[adapterName];
        const baseEntry = baseJson ? baseJson[adapterName] : undefined;

        if (!baseEntry) {
            // New adapter
            console.log(`  [new]      ${adapterName}`);
            changedAdapters.push(adapterName);
        } else if (JSON.stringify(headEntry) !== JSON.stringify(baseEntry)) {
            // Modified adapter entry
            console.log(`  [modified] ${adapterName}`);
            console.log(`      head: ${JSON.stringify(headEntry)}`);
            console.log(`      base: ${JSON.stringify(baseEntry)}`);
            changedAdapters.push(adapterName);
        }
    }

    return changedAdapters
        .map(name => {
            const meta = headJson[name]?.meta;
            if (!meta) {
                return null;
            }
            return {
                url: meta.replace(/\/master\/io-package\.json$/, '').replace(/\/main\/io-package\.json$/, ''),
                // The version pinned by the entry. Only sources-dist-stable.json entries
                // carry one - for sources-dist.json entries that stay undefined.
                version: headJson[name].version,
            };
        })
        .filter(Boolean);
}

/**
 * Main detection function.
 *
 * Uses the PR Files API (same data as the GitHub "Files" tab) to find which
 * sources-dist*.json files were touched, then compares the before/after JSON
 * to find exactly which adapter entries changed.
 *
 * This replaces the old commit-by-commit patch parsing that caused false positives.
 */
async function detectAffectedAdapter(prID: string) {
    // Get PR metadata for base/head refs
    const pr = await getGithub(`https://api.github.com/repos/ioBroker/ioBroker.repositories/pulls/${prID}`);
    const baseRef = pr.base.sha;
    const headRef = pr.head.sha;

    console.log(`PR #${prID}: base=${baseRef} head=${headRef}`);

    // Use the merge base (common ancestor of base branch and PR head) for comparison.
    // Using pr.base.sha directly causes false positives when other PRs have been merged
    // into the base branch after this PR was created, because the PR head no longer
    // contains those later changes. GitHub's PR diff uses the merge base, so we do too.
    const compare = await getGithub(
        `https://api.github.com/repos/ioBroker/ioBroker.repositories/compare/${baseRef}...${headRef}`,
    );
    const mergeBase = compare.merge_base_commit.sha;
    if (mergeBase !== baseRef) {
        console.log(`Using merge base: ${mergeBase} (base branch tip: ${baseRef})`);
    }

    // Get the list of changed files in this PR (same as GitHub "Files" tab)
    const prFiles = await getGithub(`https://api.github.com/repos/ioBroker/ioBroker.repositories/pulls/${prID}/files`);

    const sourceFiles = prFiles.filter((f: any) => f.filename.startsWith('sources-dist')).map((f: any) => f.filename);

    if (!sourceFiles.length) {
        console.log('No sources-dist files changed in this PR.');
        return [];
    }

    console.log(`Changed sources files: ${sourceFiles.join(', ')}`);

    const adapters: { url: string; isStable?: boolean; version?: string }[] = [];

    for (const filename of sourceFiles) {
        const changed = await detectChangedAdaptersInFile(filename, mergeBase, headRef);
        changed.forEach(c => {
            const existing = adapters.find(a => a.url === c.url);
            if (!existing) {
                adapters.push(c);
            } else if (!existing.version && c.version) {
                // The same adapter changed in latest AND stable - keep the pinned stable version.
                existing.version = c.version;
            }
        });
    }

    console.log(
        `Detected changed adapters: ${adapters.map(a => a.url + (a.version ? `@${a.version}` : '')).join(', ')}`,
    );
    return adapters;
}

function decorateLine(line: CommentLine) {
    if (line.noDecorate) {
        return line.text;
    }

    let m = line.text.match(/"npm owner add bluefox iobroker\.([-_a-z\d]+)"/);
    if (m) {
        line.text = line.text.replace(
            `"npm owner add bluefox iobroker.${m[1]}"`,
            `\`npm owner add bluefox iobroker.${m[1]}\``,
        );
    }

    m = line.text.match(/"Manage topics"/);
    if (m) {
        line.text = line.text.replace(`"Manage topics"`, '`Manage topics`');
    }

    m = line.text.match(/"## License"/);
    if (m) {
        line.text = line.text.replace(`"## License"`, '`## License`');
    }

    m = line.text.match(/travis/);
    if (m) {
        line.text = line.text.replace(/travis/g, `[travis](https://travis-ci.com/)`);
    }

    m = line.text.match(/Travis-ci\.org/);
    if (m) {
        line.text = line.text.replace(
            `Travis-ci.org`,
            `[Travis-ci.com](https://travis-ci.com/${line.owner}/${line.adapter})`,
        );
    }

    m = line.text.match(/ README.md/);
    if (m) {
        line.text = line.text.replace(/ README.md/g, ` [README.md](${line.link}/blob/master/README.md)`);
    }

    m = line.text.match(/ io-package\.json/);
    if (m) {
        line.text = line.text.replace(
            / io-package.json/g,
            ` [io-package.json](${line.link}/blob/master/io-package.json)`,
        );
    }

    m = line.text.match(/ package\.json/);
    if (m) {
        line.text = line.text.replace(/ package.json/g, ` [package.json](${line.link}/blob/master/package.json)`);
    }

    m = line.text.match(/ node_modules/);
    if (m) {
        line.text = line.text.replace(/ node_modules/g, ` [node_modules](${line.link}/tree/master/node_modules)`);
    }

    m = line.text.match(/ NPM/);
    if (m) {
        line.text = line.text.replace(/ NPM/g, ` [NPM](https://www.npmjs.com/package/${line.adapter.toLowerCase()})`);
    }

    m = line.text.match(/"iob_npm.done"/);
    if (m) {
        line.text = line.text.replace(`"iob_npm.done"`, `"[iob_npm.done](${line.link}/blob/master/iob_npm.done)"`);
    }

    m = line.text.match(/ admin\/words\.js/);
    if (m) {
        line.text = line.text.replace(` admin/words.js`, ` [admin/words.js](${line.link}/blob/master/admin/words.js)`);
    }

    m = line.text.match(/ main\.js/);
    if (m) {
        line.text = line.text.replace(` main.js`, ` [main.js](${line.link}/blob/master/main.js)`);
    }

    if (line.adapter) {
        const shortName = line.adapter.replace('ioBroker.', '');
        if (line.text.includes(` ${shortName}.js`)) {
            line.text = line.text.replace(
                ` ${shortName}.js`,
                ` [${shortName}.js](${line.link}/blob/master/${shortName}.js)`,
            );
        }
    }

    return line.text;
}

function triggerRepoCheck(owner: string, adapter: string) {
    const url = `${owner}/${adapter}`;
    console.log(`trigger repo checker for ${url}`);

    // console.log(`${process.env.IOBBOT_GITHUB_TOKEN.substring(0,3)}--${process.env.IOBBOT_GITHUB_TOKEN.substring(4)}`);

    // curl -L -X POST -H "Accept: application/vnd.github+json" -H "Authorization: Bearer ghp_xxxxxxxx" https://api.github.com/repos/iobroker-bot-orga/check-tasks/dispatches -d "{\"event_type\": \"check-repository\", \"client_payload\": {\"url\": \"mcm1957/iobroker.weblate-test\"}}"
    const axiosInstance = axios.create(); // create a clean instance to avoid injection from other packages
    return axiosInstance
        .post(
            `https://api.github.com/repos/iobroker-bot-orga/check-tasks/dispatches`,
            { event_type: 'check-repository', client_payload: { url: url } },
            {
                headers: {
                    Authorization: `Bearer ${process.env.IOBBOT_GITHUB_TOKEN}`,
                    Accept: 'application/vnd.github+json',
                    'user-agent': 'Action script',
                },
            },
        )
        .then(response => response.data)
        .catch(e => console.error(e));
}

async function doIt() {
    const prID = getPullRequestNumber();
    console.log(`Process PR ${prID}`);

    if (process.env.GITHUB_EVENT_PATH) {
        const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
        console.log(`EVENT ${JSON.stringify(event, null, 2)}`);
        if (event.action === 'created' && event.comment) {
            if (!event.comment.body || event.comment.body.trim() !== TEXT_RECHECK) {
                return Promise.resolve('No check required');
            }
        }
    }

    if (!prID) {
        console.error('Cannot find PR');
        return Promise.reject('Cannot find PR');
    }

    const files = await getGithub(`https://api.github.com/repos/ioBroker/ioBroker.repositories/pulls/${prID}/files`);
    const fileNames = files.map((f: any) => f.filename);

    console.log('Files changed:');
    fileNames.forEach((f: string) => console.log(` ${f}`));

    const isStable = fileNames.includes('sources-dist-stable.json');

    const links = await detectAffectedAdapter(prID);

    // Determine the creator (author) of this PR - required to validate maintainer access.
    let prAuthor = '';
    try {
        const pr = await getGithub(`https://api.github.com/repos/ioBroker/ioBroker.repositories/pulls/${prID}`);
        prAuthor = pr.user?.login || '';
        console.log(`PR ${prID} created by ${prAuthor}`);
    } catch (e) {
        console.error(`Cannot determine author of PR ${prID}: ${e}`);
    }

    // A PR should only add or update a single adapter. If more than one adapter is
    // changed, flag the PR and ask the author to split it into separate PRs.
    if (links.length > 1) {
        console.log(`PR ${prID} changes ${links.length} adapters - flagging as 'multiple repositories'`);
        try {
            await addLabel(prID, ['multiple repositories']);
        } catch (e) {
            console.error(`Cannot add label 'multiple repositories': ${e}`);
        }

        try {
            const gitComments = await getAllComments(prID);
            const exists = gitComments.find((comment: any) => comment.body.includes(TEXT_MULTIPLE_REPOSITORIES));
            if (!exists) {
                await addComment(prID, TEXT_MULTIPLE_REPOSITORIES);
            }
        } catch (e) {
            console.error(`Cannot add 'multiple repositories' comment: ${e}`);
        }
    }

    const comments: CommentLine[] = [{ text: TEXT_COMMENT_TITLE }];
    // Verification result lines appended at the very end of the check result comment.
    const verificationLines = [];
    let someChecked = false;
    let errorsFound = false;
    let maintainerMissing = false;

    for (let i = 0; i < links.length; i++) {
        const data = await executeOneAdapterCheck(links[i].url);
        const parts = data.adapter.split('/');
        const adapter = parts.pop().replace('iobroker.', 'ioBroker.');
        const adapterName = adapter.split('.')[1];
        const owner = parts.pop();
        const link = `https://github.com/${owner}/${adapter}`;

        console.log(``);
        console.log(`checking ${owner}/${adapter}`);
        triggerRepoCheck(owner, adapter);

        // Validate that the creator of the PR is a legitimate maintainer of the adapter
        // repository which is added / updated by this PR. The validation only relies on
        // publicly readable information (see verifyAuthorLegitimacy).
        const legitimacyReason = await verifyAuthorLegitimacy(owner, adapter, prAuthor);
        if (legitimacyReason) {
            console.log(
                `PR author ${prAuthor} verified as legitimate maintainer of ${owner}/${adapter}: ${legitimacyReason}`,
            );
            verificationLines.push(
                `:white_check_mark: PR creator @${prAuthor} has been verified as legitimate maintainer of [${adapter}](${link}) because the user **${legitimacyReason}**.`,
            );
        } else {
            console.log(
                `PR author ${prAuthor} could not be verified as maintainer of ${owner}/${adapter} - flagging 'maintainer ?'`,
            );
            maintainerMissing = true;
            verificationLines.push(
                `:warning: PR creator @${prAuthor} could **not** be verified as legitimate maintainer of [${adapter}](${link}). The user needs to be validated manually.`,
            );
        }

        try {
            const latestSVG = await getUrl(
                `http://iobroker.live/badges/${adapter.replace('ioBroker.', '')}-installed.svg`,
            );
            data.badgeLatest = (latestSVG || '').toString().startsWith('<svg ');
        } catch (e) {
            data.badgeLatest = false;
            console.error(`Cannot get latest badge for ${adapter}: ${e}`);
        }

        try {
            const stableSVG = await getUrl(
                `http://iobroker.live/badges/${adapter.replace('ioBroker.', '')}-stable.svg`,
            );
            data.badgeStable = (stableSVG || '').toString().startsWith('<svg ');
        } catch (e) {
            data.badgeStable = false;
            console.error(`Cannot get stable badge for ${adapter}: ${e}`);
        }

        comments.push({ text: `\n### [${adapter}](${link})`, link, owner, adapter, noDecorate: true });

        let badges = `[![Downloads](https://img.shields.io/npm/dm/${adapter.toLowerCase()}.svg)](https://www.npmjs.com/package/${adapter.toLowerCase()}) `;
        if (data.badgeLatest) {
            badges += `![Number of Installations (latest)](http://iobroker.live/badges/${adapter.replace('ioBroker.', '')}-installed.svg) `;
        }
        if (data.badgeStable) {
            badges += `![Number of Installations (stable)](http://iobroker.live/badges/${adapter.replace('ioBroker.', '')}-stable.svg)`;
        }
        badges += ` - [![Test and Release](https://github.com/${owner}/${adapter}/actions/workflows/test-and-release.yml/badge.svg)](https://github.com/${owner}/${adapter}/actions/workflows/test-and-release.yml)`;
        comments.push({ text: badges, noDecorate: true });

        comments.push({
            text: `[![NPM](https://nodei.co/npm/${adapter.toLowerCase()}.png?downloads=true)](https://nodei.co/npm/${adapter.toLowerCase()}/)\n`,
            noDecorate: true,
        });

        if (data.context) {
            someChecked = true;

            if (data.context.errors?.length) {
                errorsFound = true;
                comments.push({ text: `**ERRORS:**`, link, owner, adapter });
                data.context.errors.forEach((err: string) =>
                    comments.push({ text: `- [ ] :heavy_exclamation_mark: ${err}`, link, owner, adapter }),
                );
            } else {
                comments.push({ text: ':thumbsup: No errors found', link, owner, adapter, noDecorate: true });
            }

            comments.push({ text: ` `, link, owner, adapter });

            if (data.context.warnings?.filter((warn: string) => warn.startsWith('[W')).length) {
                comments.push({ text: `**WARNINGS:**`, link, owner, adapter });
                data.context.warnings
                    .filter((warn: string) => warn.startsWith('[W'))
                    .forEach((warn: string) => comments.push({ text: `- [ ] :eyes: ${warn}`, link, owner, adapter }));
                comments.push({ text: ` `, link, owner, adapter });
            }

            if (data.context.warnings?.filter((warn: string) => warn.startsWith('[S')).length) {
                comments.push({ text: `**SUGGESTIONS:**`, link, owner, adapter });
                data.context.warnings
                    .filter((warn: string) => warn.startsWith('[S'))
                    .forEach((warn: string) =>
                        comments.push({ text: `- [ ] :pushpin: ${warn}`, link, owner, adapter }),
                    );
                comments.push({ text: ` `, link, owner, adapter });
            }
        }

        if (isStable) {
            const latest = await getUrl('https://download.iobroker.net/sources-dist-latest.json');
            const stable = await getUrl('https://download.iobroker.net/sources-dist.json');
            const statistic = await getUrl('https://www.iobroker.net/data/statistics.json');

            comments.push({ text: `\n`, noDecorate: true });
            comments.push({
                text: `Adapter releases: https://www.iobroker.dev/adapter/${owner}/${adapter}/releases`,
                noDecorate: true,
            });
            comments.push({
                text: `Adapter statistic: https://www.iobroker.dev/adapter/${owner}/${adapter}/statistics`,
                noDecorate: true,
            });

            const now = new Date();
            const totalUser = statistic.adapters[adapterName];
            const latestRelease = latest[adapterName].version;
            // The release this PR actually pins in sources-dist-stable.json. Falls back
            // to the current latest release when the changed entry could not be parsed.
            const submittedRelease = links[i].version || latestRelease;
            const latestTime = new Date(latest[adapterName].versionDate);
            const latestTimeStr = `${latestTime.getDate()}.${latestTime.getMonth() + 1}.${latestTime.getFullYear()}`;
            const latestDaysOld = Math.floor((now.getTime() - latestTime.getTime()) / ONE_DAY);
            const latestUser = statistic.versions[adapterName] ? statistic.versions[adapterName][latestRelease] : 0;
            const latestUserPercent = ((latestUser / totalUser) * 100).toFixed(2);

            comments.push({ text: ``, noDecorate: true });
            comments.push({
                text: `**History and usage information for submitted release ${submittedRelease}:**`,
                noDecorate: true,
            });
            comments.push({ text: ``, noDecorate: true });
            if (submittedRelease === latestRelease) {
                comments.push({
                    text: `${latestRelease} created ${latestTimeStr} (${latestDaysOld} days old)`,
                    noDecorate: true,
                });
                comments.push({ text: `${latestUser} users (${latestUserPercent}%)`, noDecorate: true });
            } else {
                const submittedUser = statistic.versions[adapterName]
                    ? statistic.versions[adapterName][submittedRelease] || 0
                    : 0;
                const submittedUserPercent = ((submittedUser / totalUser) * 100).toFixed(2);

                // The submitted release is older than latest, so its creation date is not
                // part of sources-dist-latest.json - fetch it from the npm registry metadata.
                let submittedCreatedStr = ` created _unknown_ (_unknown_ days old)`;
                try {
                    const npmInfo = await getUrl(`https://registry.npmjs.org/iobroker.${adapterName.toLowerCase()}`);
                    const submittedVersionDate = npmInfo?.time?.[submittedRelease];
                    if (submittedVersionDate) {
                        const submittedTime = new Date(submittedVersionDate);
                        const submittedTimeStr = `${submittedTime.getDate()}.${submittedTime.getMonth() + 1}.${submittedTime.getFullYear()}`;
                        const submittedDaysOld = Math.floor((now.getTime() - submittedTime.getTime()) / ONE_DAY);
                        submittedCreatedStr = ` created ${submittedTimeStr} (${submittedDaysOld} days old)`;
                    }
                } catch (e) {
                    console.log(`Cannot read npm creation date for ${adapterName}@${submittedRelease}: ${e}`);
                }

                comments.push({
                    text: `${submittedRelease} (submitted)${submittedCreatedStr} - ${submittedUser} users (${submittedUserPercent}%)`,
                    noDecorate: true,
                });
                comments.push({
                    text: `${latestRelease} (latest) created ${latestTimeStr} (${latestDaysOld} days old) - ${latestUser} users (${latestUserPercent}%)`,
                    noDecorate: true,
                });
            }

            if (stable[adapterName]) {
                const stableRelease = latest[adapterName].stable;
                const stableTime = new Date(stable[adapterName].versionDate);
                const stableTimeStr = `${stableTime.getDate()}.${stableTime.getMonth() + 1}.${stableTime.getFullYear()}`;
                const stableDaysOld = Math.floor((now.getTime() - stableTime.getTime()) / ONE_DAY);
                const stableUser = statistic.versions[adapterName] ? statistic.versions[adapterName][stableRelease] : 0;
                const stableUserPercent = ((stableUser / totalUser) * 100).toFixed(2);

                comments.push({ text: ``, noDecorate: true });
                comments.push({
                    text: `${stableRelease} (stable) created ${stableTimeStr} (${stableDaysOld} days old)`,
                    noDecorate: true,
                });
                comments.push({ text: `${stableUser} users (stable) (${stableUserPercent}%)`, noDecorate: true });
            } else {
                comments.push({ text: ``, noDecorate: true });
                comments.push({ text: `stable release not yet available`, noDecorate: true });
                await addLabel(prID, ['new at STABLE']);
            }

            comments.push({ text: ``, noDecorate: true });
            if (submittedRelease !== latestRelease) {
                comments.push({
                    text:
                        `:warning: This PR does **not** submit the current latest release (${latestRelease}) ` +
                        `but the older release **${submittedRelease}**. ` +
                        `Note that the repository check results above always describe the default branch ` +
                        `of the repository and the npm latest release - they do not necessarily apply ` +
                        `to the submitted release.`,
                    noDecorate: true,
                });
                comments.push({ text: ``, noDecorate: true });
            }
            comments.push({
                text: `**Please verify that this PR really tries to update to release ${submittedRelease}!**\n`,
                noDecorate: true,
            });
        } else {
            const latest = await getUrl('https://download.iobroker.net/sources-dist-latest.json');

            if (!latest[adapterName]) {
                await addLabel(prID, ['new at LATEST']);

                const gitComments = await getAllComments(prID);
                const exists = gitComments.find((comment: any) =>
                    comment.body.includes('## ioBroker repository information about New at LATEST tagging'),
                );

                console.log(`informational comment ${exists ? 'exists' : 'does NOT exist.'}`);

                if (!exists) {
                    let body = `This PR comment contains information in English and German. / Dieser PR-Kommentar enthält Informationen auf Englisch und Deutsch.\n`;
                    body += `The German translation is provided below. / Die deutsche Übersetzung ist weiter unten zu finden.\n\n`;
                    body += `## ioBroker repository information about New at LATEST tagging\n\n`;
                    body += `Thanks for spending your time and providing a new adapter for ioBroker.\n\n`;
                    body += `Your adapter will get a manual review as soon as possible. Please stand by - this might last one or two weeks. `;
                    body += `Feel free to continue your work and create new releases. `;
                    body += `You do NOT need to close or update this PR in case of new releases.\n\n`;
                    body += `In the meantime please check any feedback issues logged by automatic adapter checker and try to fix them. `;
                    body += `And please check the following information if not yet done:\n`;
                    body += `- https://github.com/ioBroker/ioBroker.repositories?tab=readme-ov-file#requirements-for-adapter-to-get-added-to-the-latest-repository\n`;
                    body += `- https://github.com/ioBroker/ioBroker.repositories?tab=readme-ov-file#development-and-coding-best-practices\n`;
                    body += `- https://github.com/iobroker-community-adapters/responsive-design-initiative/tree/main#responsive-design-initiative\n`;
                    body += `\n\n`;
                    body += `>[!IMPORTANT]\n`;
                    body += `>To verify the object structure of this adapter during REVIEW please export the object structure of a working installation `;
                    body += `and attach the file to this PR. You find a guide how to export the object struture here: `;
                    body += `https://github.com/ioBroker/ioBroker.repochecker/blob/master/OBJECTDUMP.md\n`;
                    body += `\n\n`;
                    body += `You will find the results of the review and eventually issues / suggestions as a comment to this PR. `;
                    body += `So please keep this PR watched.\n\n`;
                    body += `If you have any urgent questions feel free to ask.\n`;
                    body += `mcm1957\n\n`;
                    body += `---\n\n`;
                    body += `## ioBroker Repository-Information zum "New at LATEST"-Tagging\n\n`;
                    body += `Vielen Dank, dass du dir die Zeit genommen hast, einen neuen Adapter für ioBroker bereitzustellen.\n\n`;
                    body += `Dein Adapter wird so bald wie möglich manuell überprüft. Bitte habe etwas Geduld - dies kann ein bis zwei Wochen dauern. `;
                    body += `Du kannst weiterhin an deinem Adapter arbeiten und neue Versionen veröffentlichen. `;
                    body += `Du musst diesen PR NICHT schließen oder aktualisieren, wenn neue Versionen erscheinen.\n\n`;
                    body += `Bitte überprüfe in der Zwischenzeit alle von der automatischen Adapterprüfung gemeldeten Probleme und versuche, diese zu beheben. `;
                    body += `Bitte überprüfe auch die folgenden Informationen, falls noch nicht geschehen:\n`;
                    body += `- https://github.com/ioBroker/ioBroker.repositories?tab=readme-ov-file#requirements-for-adapter-to-get-added-to-the-latest-repository\n`;
                    body += `- https://github.com/ioBroker/ioBroker.repositories?tab=readme-ov-file#development-and-coding-best-practices\n`;
                    body += `- https://github.com/iobroker-community-adapters/responsive-design-initiative/tree/main#responsive-design-initiative\n`;
                    body += `\n\n`;
                    body += `>[!IMPORTANT]\n`;
                    body += `>Um die Objektstruktur dieses Adapters während des REVIEWs zu überprüfen, exportiere bitte die Objektstruktur einer funktionierenden Installation `;
                    body += `und füge die Datei diesem PR bei. Eine Anleitung zum Exportieren der Objektstruktur findest du hier: `;
                    body += `https://github.com/ioBroker/ioBroker.repochecker/blob/master/OBJECTDUMP.md\n`;
                    body += `\n\n`;
                    body += `Du wirst die Ergebnisse des Reviews sowie eventuelle Probleme / Vorschläge als Kommentar zu diesem PR finden. `;
                    body += `Bitte behalte diesen PR daher im Blick.\n\n`;
                    body += `Bei dringenden Fragen kannst du dich gerne melden.\n`;
                    body += `mcm1957\n\n`;

                    try {
                        console.log(`adding information comment to PR ${prID}`);
                        await addComment(prID, body);
                    } catch (e) {
                        console.error(`warning: cannot add comment to PR ${prID}:`);
                        console.log(` ${e}`);
                    }
                }
            }
        }
    }

    if (!someChecked) {
        comments.push({ text: 'No changed adapters found', noDecorate: true });
    } else {
        try {
            await deleteLabel(prID, 'auto-checked ✔');
            await deleteLabel(prID, 'auto-checked ❌');
        } catch {
            // the labels may not be present on the PR - nothing to clean up then
        }
        try {
            if (errorsFound) {
                console.log(`setting labels for PR ${prID} - errors detected`);
                await addLabel(prID, ['must be fixed', 'auto-checked ❌']);
            } else {
                console.log(`setting labels for PR ${prID} - no errors detected`);
                await addLabel(prID, ['auto-checked ✔']);
            }
        } catch (e) {
            console.error(`Cannot add label: ${e}`);
        }

        if (maintainerMissing) {
            try {
                console.log(`setting label 'maintainer ?' for PR ${prID}`);
                await addLabel(prID, ['maintainer ?']);
            } catch (e) {
                console.error(`Cannot add label 'maintainer ?': ${e}`);
            }
        }
    }

    let comment = comments.map(line => decorateLine(line)).join('\n');

    if (verificationLines.length) {
        comment += `\n\n---\n`;
        comment += verificationLines.map(line => `\n${line}`).join('');
    }

    comment += `\n\n\n*Add comment "${TEXT_RECHECK}" to start check anew*`;

    console.log('ADD PULL REQUEST COMMENT:');
    console.log(comment);

    try {
        const gitComments = await getAllComments(prID);
        let exists = gitComments.find((comment: any) => comment.body.includes(TEXT_COMMENT_TITLE));
        if (exists) {
            await deleteComment(prID, exists.id);
        }

        exists = gitComments.find((comment: any) => comment.body === TEXT_RECHECK);
        if (exists) {
            await deleteComment(prID, exists.id);
        }

        await addComment(prID, comment);
    } catch (e) {
        console.error(`Cannot add or remove comment: ${e}`);
    }

    return 'done';
}

// activate for debugging purposes
// process.env.GITHUB_REF = 'refs/pull/3305/merge';
// process.env.OWN_GITHUB_TOKEN = 'add-token-here';
// process.env.GITHUB_EVENT_PATH = import.meta.dirname + '/../event.json';

console.log(`process.env.GITHUB_REF = ${process.env.GITHUB_REF}`);
console.log(`process.env.GITHUB_EVENT_PATH = ${process.env.GITHUB_EVENT_PATH}`);
console.log(`process.env.OWN_GITHUB_TOKEN = ${(process.env.OWN_GITHUB_TOKEN || '').length}`);

doIt()
    .then(result => console.log(result))
    .catch(e => console.error(e));
