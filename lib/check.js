'use strict';

const fs = require('fs');
const axios = require('axios');
const { addComment, addLabel, getGithub, getUrl, getAllComments, deleteComment } = require('./common');

let checker;

const TEXT_RECHECK = 'RE-CHECK!';
const TEXT_COMMENT_TITLE = '## Automated adapter checker';
const ONE_DAY = 3600000 * 24;

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

function executeOneAdapterCheck(adapter) {
    checker = checker || require('@iobroker/repochecker');

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
                    const context = JSON.parse(data.body);
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
async function fetchJsonAtRef(filename, ref) {
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
async function detectChangedAdaptersInFile(filename, baseRef, headRef) {
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

    return changedAdapters.map(name => {
        const meta = headJson[name] && headJson[name].meta;
        if (!meta) {
            return null;
        }
        return meta
            .replace(/\/master\/io-package\.json$/, '')
            .replace(/\/main\/io-package\.json$/, '');
    }).filter(Boolean);
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
async function detectAffectedAdapter(prID) {
    // Get PR metadata for base/head refs
    const pr = await getGithub(`https://api.github.com/repos/ioBroker/ioBroker.repositories/pulls/${prID}`);
    const baseRef = pr.base.sha;
    const headRef = pr.head.sha;

    console.log(`PR #${prID}: base=${baseRef} head=${headRef}`);

    // Get the list of changed files in this PR (same as GitHub "Files" tab)
    const prFiles = await getGithub(`https://api.github.com/repos/ioBroker/ioBroker.repositories/pulls/${prID}/files`);

    const sourceFiles = prFiles
        .filter(f => f.filename.startsWith('sources-dist'))
        .map(f => f.filename);

    if (!sourceFiles.length) {
        console.log('No sources-dist files changed in this PR.');
        return [];
    }

    console.log(`Changed sources files: ${sourceFiles.join(', ')}`);

    const adapters = [];

    for (const filename of sourceFiles) {
        const changed = await detectChangedAdaptersInFile(filename, baseRef, headRef);
        changed.forEach(c => !adapters.includes(c) && adapters.push(c));
    }

    console.log(`Detected changed adapters: ${adapters.join(', ')}`);
    return adapters;
}

function decorateLine(line) {
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

function triggerRepoCheck(owner, adapter) {
    const url = `${owner}/${adapter}`;
    console.log(`trigger repo checker for ${url}`);

    return axios
        .post(
            `https://api.github.com/repos/iobroker-bot-orga/check-tasks/dispatches`,
            { event_type: 'check-repository', client_payload: { url: url } },
            {
                headers: {
                    Authorization: `bearer ${process.env.IOBBOT_GITHUB_TOKEN}`,
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
    const fileNames = files.map(f => f.filename);

    console.log('Files changed:');
    fileNames.forEach(f => console.log(` ${f}`));

    const isStable = fileNames.includes('sources-dist-stable.json');

    const links = await detectAffectedAdapter(prID);

    const comments = [{ text: TEXT_COMMENT_TITLE }];
    let someChecked = false;
    let errorsFound = false;

    for (let i = 0; i < links.length; i++) {
        const data = await executeOneAdapterCheck(links[i]);
        const parts = data.adapter.split('/');
        const adapter = parts.pop().replace('iobroker.', 'ioBroker.');
        const adapterName = adapter.split('.')[1];
        const owner = parts.pop();
        const link = `https://github.com/${owner}/${adapter}`;

        console.log(``);
        console.log(`checking ${owner}/${adapter}`);
        triggerRepoCheck(owner, adapter);

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

            if (data.context.errors && data.context.errors.length) {
                errorsFound = true;
                comments.push({ text: `**ERRORS:**`, link, owner, adapter });
                data.context.errors.forEach(err =>
                    comments.push({ text: `- [ ] :heavy_exclamation_mark: ${err}`, link, owner, adapter }),
                );
            } else {
                comments.push({ text: ':thumbsup: No errors found', link, owner, adapter, noDecorate: true });
            }

            comments.push({ text: ` `, link, owner, adapter });

            if (data.context.warnings && data.context.warnings.filter(warn => warn.startsWith('[W')).length) {
                comments.push({ text: `**WARNINGS:**`, link, owner, adapter });
                data.context.warnings
                    .filter(warn => warn.startsWith('[W'))
                    .forEach(warn => comments.push({ text: `- [ ] :eyes: ${warn}`, link, owner, adapter }));
                comments.push({ text: ` `, link, owner, adapter });
            }

            if (data.context.warnings && data.context.warnings.filter(warn => warn.startsWith('[S')).length) {
                comments.push({ text: `**SUGGESTIONS:**`, link, owner, adapter });
                data.context.warnings
                    .filter(warn => warn.startsWith('[S'))
                    .forEach(warn => comments.push({ text: `- [ ] :pushpin: ${warn}`, link, owner, adapter }));
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
            const totalUser = statistic['adapters'][adapterName];
            const latestRelease = latest[adapterName].version;
            const latestTime = new Date(latest[adapterName].versionDate);
            const latestTimeStr = `${latestTime.getDate()}.${latestTime.getMonth() + 1}.${latestTime.getFullYear()}`;
            const latestDaysOld = Math.floor((now.getTime() - latestTime.getTime()) / ONE_DAY);
            const latestUser = statistic['versions'][adapterName]
                ? statistic['versions'][adapterName][latestRelease]
                : 0;
            const latestUserPercent = ((latestUser / totalUser) * 100).toFixed(2);

            comments.push({ text: ``, noDecorate: true });
            comments.push({
                text: `**History and usage information for release ${latestRelease}:**`,
                noDecorate: true,
            });
            comments.push({ text: ``, noDecorate: true });
            comments.push({
                text: `${latestRelease} created ${latestTimeStr} (${latestDaysOld} days old)`,
                noDecorate: true,
            });
            comments.push({ text: `${latestUser} users (${latestUserPercent}%)`, noDecorate: true });

            if (stable[adapterName]) {
                const stableRelease = latest[adapterName].stable;
                const stableTime = new Date(stable[adapterName].versionDate);
                const stableTimeStr = `${stableTime.getDate()}.${stableTime.getMonth() + 1}.${stableTime.getFullYear()}`;
                const stableDaysOld = Math.floor((now.getTime() - stableTime.getTime()) / ONE_DAY);
                const stableUser = statistic['versions'][adapterName]
                    ? statistic['versions'][adapterName][stableRelease]
                    : 0;
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
            comments.push({
                text: `**Please verify that this PR really tries to update to release ${latestRelease}!**\n`,
                noDecorate: true,
            });
        } else {
            const latest = await getUrl('https://download.iobroker.net/sources-dist-latest.json');

            if (!latest[adapterName]) {
                await addLabel(prID, ['new at LATEST']);

                const gitComments = await getAllComments(prID);
                let exists = gitComments.find(comment =>
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
            if (errorsFound) {
                await addLabel(prID, ['must be fixed', 'auto-checked']);
            } else {
                await addLabel(prID, ['auto-checked']);
            }
        } catch (e) {
            console.error(`Cannot add label: ${e}`);
        }
    }

    let comment = comments.map(line => decorateLine(line)).join('\n');
    comment += `\n\n\n*Add comment "${TEXT_RECHECK}" to start check anew*`;

    console.log('ADD PULL REQUEST COMMENT:');
    console.log(comment);

    try {
        const gitComments = await getAllComments(prID);
        let exists = gitComments.find(comment => comment.body.includes(TEXT_COMMENT_TITLE));
        if (exists) {
            await deleteComment(prID, exists.id);
        }

        exists = gitComments.find(comment => comment.body === TEXT_RECHECK);
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
// process.env.GITHUB_EVENT_PATH = __dirname + '/../event.json';

console.log(`process.env.GITHUB_REF = ${process.env.GITHUB_REF}`);
console.log(`process.env.GITHUB_EVENT_PATH = ${process.env.GITHUB_EVENT_PATH}`);
console.log(`process.env.OWN_GITHUB_TOKEN = ${(process.env.OWN_GITHUB_TOKEN || '').length}`);

doIt()
    .then(result => console.log(result))
    .catch(e => console.error(e));
