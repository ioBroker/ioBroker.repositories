'use strict';
const fs = require('fs');
const {
    addComment,
    addLabel,
    getGithub,
    getUrl,
    getAllComments,
    deleteComment
} = require('./common');
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
    } else if (process.env.GITHUB_EVENT_PATH) {
        const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
        return event.pull_request ? event.pull_request.number : (event.issue ? event.issue.number : '');
    } else {
        throw new Error('Reference not found. process.env.GITHUB_REF and process.env.GITHUB_EVENT_PATH are not set!');
    }
}

function executeOneAdapterCheck(adapter) {
    checker = checker || require('@iobroker/repochecker');

    return new Promise((resolve, reject) => {
        checker.handler(
            {
                queryStringParameters: {
                    url: adapter,
                }
            },
            null,
            (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    const context = JSON.parse(data.body);
                    /*if (context.errors.length) {
                        console.error(JSON.stringify(context.errors, null, 2));
                    }
                    console.log(JSON.stringify(data, null, 2));*/
                    context.errors = context.errors.sort();
                    context.warnings = context.warnings.sort();

                    resolve({adapter, context});
                }
            });
    });
}

async function detectChanges(commit) {
    /*
    {
      "sha": "8057d13625f724f0cd126ce5c3920da580429e0b",
      "filename": "sources-dist.json",
      "status": "modified",
      "additions": 5,
      "deletions": 0,
      "changes": 5,
      "blob_url": "https://github.com/ioBroker/ioBroker.repositories/blob/024bd5ccecc3c37dc6faf672fbfbd9f072f0189f/sources-dist.json",
      "raw_url": "https://github.com/ioBroker/ioBroker.repositories/raw/024bd5ccecc3c37dc6faf672fbfbd9f072f0189f/sources-dist.json",
      "contents_url": "https://api.github.com/repos/ioBroker/ioBroker.repositories/contents/sources-dist.json?ref=024bd5ccecc3c37dc6faf672fbfbd9f072f0189f",
      "patch": "@@ -1436,6 +1436,11 @@\n     \"icon\": \"https://raw.githubusercontent.com/ioBroker/ioBroker.vis-hqwidgets/master/admin/hqwidgets.png\",\n     \"type\": \"visualization-widgets\"\n   },\n+  \"vis-inventwo\": {\n+    \"meta\": \"https://raw.githubusercontent.com/inventwo/ioBroker.vis-inventwo/master/io-package.json\",\n+    \"icon\": \"https://raw.githubusercontent.com/inventwo/ioBroker.vis-inventwo/master/admin/i_150.png\",\n+    \"type\": \"visualisation-widgets\"\n+  },\n   \"vis-jqui-mfd\": {\n     \"meta\": \"https://raw.githubusercontent.com/ioBroker/ioBroker.vis-jqui-mfd/master/io-package.json\",\n     \"icon\": \"https://raw.githubusercontent.com/ioBroker/ioBroker.vis-jqui-mfd/master/admin/jqui-mfd.png\","
    }
     */
    let json = await getGithub(commit.raw_url, true);
    const patch = commit.patch.split('@@').map(t => t.trim()).filter(t => t);
    if (commit.changes > 75) { /* Mcm1957: limit changed from 25 to 75. Resorting might create a bigger number of changed lines */
        console.log('Too many changes in this commit. Stop analysis.');
        console.log(`Check commit\n${JSON.stringify(commit)}`);
        return [];
    }

    json = json.split('\n');
    let adapters = [];
    const deleteds = [];
    let totalOffset = 0;
    for (let i = 0; i < patch.length; i += 2) {
        const changes = patch[i];
        const lines = patch[i + 1].split('\n');
        const added = lines
            .filter(line => line.match(/^\+\s*"[-_a-z\d]+"\s*:\s*{$/))
            .map(line => line.match(/^\+\s*"([-_a-z\d]+)"\s*:\s*{$/)[1]);
        const deleted = lines
            .filter(line => line.match(/^\-\s*"[-_a-z\d]+"\s*:\s*{$/))
            .map(line => line.match(/^\-\s*"([-_a-z\d]+)"\s*:\s*{$/)[1]);

        let found = false;
        let offset = 0;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('-')) {
                totalOffset--;
                !found && offset--;
            } else if (lines[i].startsWith('+')) {
                totalOffset++;
                !found && offset++;
                found = true;
            } else {
                !found && offset++;
            }
        }
        if (!added.length && found) {
            const start = parseInt(changes.replace(/-/g, '')) + offset + totalOffset - 1;
            let lastAdapter = '';
            if (Math.abs(json.length - start) > 2) {
                // it is not end line that must be ignored
                for (let k = 0; k < json.length; k++) {
                    const m = json[k].match(/^\s*"([-_a-z\d]+)"\s*:\s*{$/);
                    if (m) {
                        lastAdapter = m[1];
                    }
                    if (k >= start) {
                        if (!added.includes(lastAdapter)) {
                            added.push(lastAdapter);
                        }
                        break;
                    }
                }
            }
        }

        added.forEach(a => !adapters.includes(a) && adapters.push(a));
        deleted.forEach(a => !deleteds.includes(a) && deleteds.push(a));

    }

    //console.log('adapters before filtering:');
    //adapters.forEach(a => console.log(a));
    //console.log('---');

    adapters = adapters.filter(a => !deleteds.includes(a));

    console.log('adapters filtered:');
    adapters.forEach(a => console.log(a));
    console.log('---');

    const repo = JSON.parse(json.join('\n'));

    return adapters.map(a => repo[a].meta.replace(/\/master\/io-package.json$/, '').replace(/\/main\/io-package.json$/, ''));
}

async function detectAffectedAdapter(prID) {
    const body = await getGithub(`https://api.github.com/repos/ioBroker/ioBroker.repositories/pulls/${prID}`);
    // https://api.github.com/repos/ioBroker/ioBroker.repositories/pulls/632/commits => [0].sha
    const commits = await getGithub(body.commits_url);
    const adapters = [];

    for (let i = 0; i < commits.length; i++) {
        const commit = await getGithub(`https://api.github.com/repos/ioBroker/ioBroker.repositories/commits/${commits[i].sha}`);
        const files = commit.files && commit.files.filter(item => item.filename.startsWith('sources-dist'));
        for (let f = 0; f < files.length; f++) {
            const changes = await detectChanges(files[f]);
            changes && changes.length && changes.forEach(c => !adapters.includes(c) && adapters.push(c));
        }

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
        line.text = line.text.replace(`"npm owner add bluefox iobroker.${m[1]}"`, '`npm owner add bluefox iobroker.' + m[1] + '`');
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
        line.text = line.text.replace(`Travis-ci.org`, `[Travis-ci.com](https://travis-ci.com/${line.owner}/${line.adapter})`);
    }

    m = line.text.match(/ README.md/);
    if (m) {
        line.text = line.text.replace(/ README.md/g, ` [README.md](${line.link}/blob/master/README.md)`);
    }

    m = line.text.match(/ io-package\.json/);
    if (m) {
        line.text = line.text.replace(/ io-package.json/g, ` [io-package.json](${line.link}/blob/master/io-package.json)`);
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

    // line.adapter = 'ioBroker.adapter'
    if (line.adapter) {
        const shortName = line.adapter.replace('ioBroker.', '');
        if (line.text.includes(` ${shortName}.js`)) {
            line.text = line.text.replace(` ${shortName}.js`, ` [${shortName}.js](${line.link}/blob/master/${shortName}.js)`);
        }
    }

    return line.text;
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
    let fileNames = [];
    files.forEach( f=>{fileNames.push(f.filename)});

    console.log('Files changed:');
    fileNames.forEach( f=>{console.log(`    ${f}`)});

    const isLatest = fileNames.includes('sources-dist.json');
    const isStable = fileNames.includes('sources-dist-stable.json')

    const links = await detectAffectedAdapter(prID);
    const comments = [{text: TEXT_COMMENT_TITLE}];
    let someChecked = false;
    let errorsFound = false;
    for (let i = 0; i < links.length; i++) {
        const data = await executeOneAdapterCheck(links[i]);
        const parts = data.adapter.split('/');
        const adapter = parts.pop().replace('iobroker.', 'ioBroker.');
        const adapterName = adapter.split('.')[1];

        try {
            const latestSVG = await getUrl(`http://iobroker.live/badges/${adapter.replace('ioBroker.', '')}-installed.svg`);
            data.badgeLatest = (latestSVG || '').toString().startsWith('<svg ');
        } catch (e) {
            data.badgeLatest = false;
            console.error(`Cannot get latest badge for ${adapter}: ${e}`);
        }
        try {
            const stableSVG = await getUrl(`http://iobroker.live/badges/${adapter.replace('ioBroker.', '')}-stable.svg`);
            data.badgeStable = (stableSVG || '').toString().startsWith('<svg ');
        } catch (e) {
            data.badgeStable = false;
            console.error(`Cannot get stable badge for ${adapter}: ${e}`);
        }
        const owner = parts.pop();
        const link = `https://github.com/${owner}/${adapter}`;

        comments.push({text: `\n### [${adapter}](${link})`, link, owner, adapter, noDecorate: true});

        let badges = `[![Downloads](https://img.shields.io/npm/dm/${adapter.toLowerCase()}.svg)](https://www.npmjs.com/package/${adapter.toLowerCase()}) `;
        if (data.badgeLatest) {
            badges += `![Number of Installations (latest)](http://iobroker.live/badges/${adapter.replace('ioBroker.', '')}-installed.svg) `;
        }
        if (data.badgeStable) {
            badges += `![Number of Installations (stable)](http://iobroker.live/badges/${adapter.replace('ioBroker.', '')}-stable.svg)`;
        }

        badges += ` - [![Test and Release](https://github.com/${owner}/${adapter}/actions/workflows/test-and-release.yml/badge.svg)](https://github.com/${owner}/${adapter}/actions/workflows/test-and-release.yml)`;

        comments.push({text: badges, noDecorate: true});
        comments.push({text: `[![NPM](https://nodei.co/npm/${adapter.toLowerCase()}.png?downloads=true)](https://nodei.co/npm/${adapter.toLowerCase()}/)\n`, noDecorate: true});

        if (data.context) {
            someChecked = true;

            if (data.context.errors && data.context.errors.length) {
                errorsFound = true;
                data.context.errors.forEach(err => comments.push({text: `- [ ] :heavy_exclamation_mark: ${err}`, link, owner, adapter}));
            } else {
                comments.push({text: ':thumbsup: No errors found', link, owner, adapter, noDecorate: true});
            }

            if (data.context.warnings && data.context.warnings.length) {
                data.context.warnings.forEach(warn => comments.push({text: `- [ ] :eyes: ${warn}`, link, owner, adapter}));
            }
        }

        if (isStable) {
            const latest = await getUrl('http://repo.iobroker.live/sources-dist-latest.json');
            const stable = await getUrl('http://repo.iobroker.live/sources-dist.json');
            const statistic = await getUrl('https://www.iobroker.net/data/statistics.json');
            
            comments.push({text:`\n`, noDecorate: true});
            comments.push({text:`Adapter releases:  https://www.iobroker.dev/adapter/${adapterName}/releases`, noDecorate: true});
            comments.push({text:`Adapter statistic: https://www.iobroker.dev/adapter/${adapterName}/statistics`, noDecorate: true});

            const now = new Date();
            const totalUser = statistic['adapters'][adapterName];

            const latestRelease = latest[adapterName].version;
            const latestTime = new Date(latest[adapterName].versionDate);
            const latestTimeStr = latestTime.getDate() +'.'+ (latestTime.getMonth()+1) +'.'+ latestTime.getFullYear();
            const latestDaysOld = Math.floor((now.getTime() - latestTime.getTime()) / ONE_DAY);
            const latestUser = statistic['versions'][adapterName][latestRelease];
            const latestUserPercent = (latestUser/totalUser * 100).toFixed(2);

            comments.push({text:``, noDecorate: true});
            comments.push({text:`**History and usage information for release ${latestRelease}:**`, noDecorate: true});

            comments.push({text:``, noDecorate: true});
            comments.push({text:`${latestRelease} created ${latestTimeStr} (${latestDaysOld} days old)`, noDecorate: true});
            comments.push({text:`${latestUser} users (${latestUserPercent}%)`, noDecorate: true});

            if (stable[adapterName]) {

                const stableRelease = latest[adapterName].stable;
                const stableTime = new Date(stable[adapterName].versionDate);
                const stableTimeStr = stableTime.getDate() +'.'+ (stableTime.getMonth()+1) +'.'+ stableTime.getFullYear();
                const stableDaysOld = Math.floor((now.getTime() - stableTime.getTime()) / ONE_DAY);
                const stableUser = statistic['versions'][adapterName][stableRelease];
                const stableUserPercent = (stableUser/totalUser * 100).toFixed(2);

                comments.push({text:``, noDecorate: true});
                comments.push({text:`${stableRelease} (stable) created ${stableTimeStr} (${stableDaysOld} days old)`, noDecorate: true});
                comments.push({text:`${stableUser} users (stable) (${stableUserPercent}%)`, noDecorate: true});

            } else {
                
                comments.push({text:``, noDecorate: true});
                comments.push({text:`stable release not yet available`, noDecorate: true});

            }


            comments.push({text:``, noDecorate: true});
            comments.push({text:`**Please verify that this PR really tries to update to release ${latestRelease}!**\n`, noDecorate: true});
        }
    }
    if (!someChecked) {
        comments.push({text: 'No changed adapters found', noDecorate: true});
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

    // decorate
    let comment = comments.map(line => decorateLine(line)).join('\n');

    comment += `\n\n\n*Add comment "${TEXT_RECHECK}" to start check anew*`;

    console.log('ADD PULL REQUEST COMMENT:');
    console.log(comment);

    try {
        // remove previous comment
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
//process.env.OWN_GITHUB_TOKEN = 'add-token-here';
// process.env.GITHUB_EVENT_PATH = __dirname + '/../event.json';

console.log(`process.env.GITHUB_REF        = ${process.env.GITHUB_REF}`);
console.log(`process.env.GITHUB_EVENT_PATH = ${process.env.GITHUB_EVENT_PATH}`);
console.log(`process.env.OWN_GITHUB_TOKEN  = ${(process.env.OWN_GITHUB_TOKEN || '').length}`);

doIt()
    .then(result => console.log(result))
    .catch(e => console.error(e));
