'use strict';

/*
 *
 * This script scans all adapters listed at latest and stable repository and verifies that
 *   - all adapters are available at npm
 *   - all adapters are at npm have granted access to bluefox
 *
 *   - If any of those checks fails, an issue is created/updated at ioBroker.repositories repository listing the problems
 *   (*)If any of those checks fails an issue is created at adapters repository requesting a fix
 *
 * (*) planned for future
 *
 * Note:
 *   Running this script locally requires environment variable OWN_GITHUB_TOKEN to be set to avoid hitting rate limits
 *
 */

const axios = require('axios');

const {
    addComment,
    addLabel,
    getGithub,
    getUrl,
    createIssue,
    deleteComment,
    getAllComments
} = require('./common');

async function getLatestRepo() {
    return await getUrl('http://repo.iobroker.live/sources-dist-latest.json');
}

async function getStableRepo() {
    return await getUrl('http://repo.iobroker.live/sources-dist.json');
}

async function getStats() {
    return await getUrl('https://www.iobroker.net/data/statistics.json');
}

async function checkNpm(adapter) {
    // console.log (`checking ${adapter}`);

    let response;
    try {
        response = await axios(`https://registry.npmjs.org/iobroker.${adapter}`)
    } catch (e) {
        console.log (`${e}`);
	    console.log (`https://registry.npmjs.org/iobroker.${adapter}`);
    }

    // bug in NPM some modules could be accessed via normal web page, but not by API
    if (!response?.data) {
        try {
            response = await axios(`https://www.npmjs.com/package/iobroker.${adapter}`);
        } catch (e) {
            console.log(`${e}`);
            console.log(`https://www.npmjs.com/package/iobroker.${adapter}`);
            return 'Not found on npm. Please publish';
        }

        if (!response.data) {
            return 'Adapter not found on npm. Please publish';
        }

        const body = response.data;
        if (!body.includes('href="/~bluefox"') && body.includes('href="/~iobluefox"')) {
            return `Bluefox was not found in the collaborators on NPM!. Please execute in adapter directory: "npm owner add bluefox iobroker.${adapter}"`;
        }

        return ''; // OK
    }

    const body = response.data;
    if (!body.maintainers ||
        !body.maintainers.length
    ) {
        return `Bluefox was not found in the collaborators on NPM!.\nPlease execute in adapter directory: "npm owner add bluefox iobroker.${adapter}"`;
	}

	let ret ='';
	if (!body.maintainers.find(user => user.name === 'bluefox' || user.name === 'iobluefox')) {
	    ret = `Bluefox was not found in the collaborators on NPM!.\nPlease execute in adapter directory: "npm owner add bluefox iobroker.${adapter}"\n\nCurrent maintainers are \n`;

	    for (const user of body.maintainers) {
	        ret += `    ${user.name} <${user.email}>\n`;
        }
	    ret += '\n';
    }

    return ret;
}

async function mergeRepos(latest, stable, stats) {
    const adapters = [];

    console.log('');
    console.log('reading STABLE repository');
    for (const adapter in stable) {
        if (adapter.startsWith('_')) {
            console.log(`SKIPPING ${adapter}`);
        } else {
            const parts = stable[adapter].meta.split('/');
            const owner = parts[3];
            const item = {
                adapter,
                owner
            };
            console.log(`adding ${adapter}`);
            adapters.push(item);
        }
    }

    console.log('reading LATEST repository');
    for (const adapter in latest) {
        if (adapter.startsWith('_')) {
            console.log(`SKIPPING ${adapter}`);
        } else {
            const parts = latest[adapter].meta.split('/');
            const owner = parts[3];
            if (!adapters.find(e => e.adapter === adapter)) {
                const item = {
                    adapter,
                    owner
                };
                console.log(`adding ${adapter}`);
                adapters.push(item);
            }
        }
    }
    return adapters;
}

async function checkRepos(adapters) {
    const result = [];
    let count;
    let idx;

    count = Object.keys(adapters).length;
    idx = 0;
    console.log('');
    console.log('processing adapter list ...');
    for (const adapter of adapters) {
        idx = idx + 1;
        console.log(`checking ${adapter.adapter} (${idx}/${count})`);
        const error = await checkNpm(adapter.adapter);
        if (error !== '') {
            console.log(error);
            const ret = {
                adapter: adapter.adapter,
                owner: adapter.owner,
                error
            };
            result.push(ret);
        }
    }
    ;
    return result;
}

async function generateIssue(adapter) {
    let issues;
    try {
        issues = await getGithub(`https://api.github.com/repos/${adapter.owner}/ioBroker.${adapter.adapter}/issues`);
    } catch (e) {
        console.log(`warning: error retrieving issue info for ${adapter.owner}/ioBroker.${adapter.adapter}`);
        console.log(`         ${e}`);
        return;
    }

    const title = `Please correct npm maintainers configuration.`;
    issues = issues.filter(i => i.state === 'open' && i.title.includes(title));
    if (!issues.length) {
        let body = `## ioBroker adapter checker for npm access\n\n`;
        body += `Access right check for adapter ${adapter.adapter} returned the following issue:\n\n`;

        body += adapter.error;

        body += `\nPlease fix the above error as soon as possible.\n`;
        body += `All adapters listed at ioBroker repositories must have 'bluefox' added as maintainer.\n\n`;
        body += `Future version updates at the repositories will be suspended until this problem is fixed.\n`;
        body += `\nIf you sent an npm invite to bluefox some time ago, please send a new one as it might have expired.\n`;
        body += `\nWhen adding a comment to this issue, please note @apollon77 and @mcm1957 explicitly.\n`;

        //console.log(`\n`);
        //console.log(`CREATE ISSUE for ioBroker.${adapter.adapter}:\n ${title}\n`);
        //console.log(`${body}`);

        console.log(`create issue for ioBroker.${adapter.adapter}`);

        try {
            await createIssue(adapter.owner, `iobroker.${adapter.adapter}`, {title, body});
        } catch (e) {
            console.log(`error: Cannot create issue for adapter ${adapter.adapter}:`);
            console.log(`       ${e}`);
        }

    } else {
        console.log(`issue for ioBroker.${adapter.adapter} already exists`);
    }
}

async function updateSummaryIssue(adapters) {
    console.log(`\nupdating summary issue...\n`);

    let issues;
    const title = `[CHECK] npm maintainers check results evidence report`;

    issues = await getGithub(`https://api.github.com/repos/ioBroker/ioBroker.repositories/issues?state=open&page=1&per_page=100`);
    issues = issues.filter(i => i.state === 'open' && i.title.includes(title));
    if (!issues.length) {
        console.log('warning: Could not locate base issue "${title}", will create one');
        let body = `# ioBroker adapter checker for npm access\n\n`;
        body += `Please see following comments for a list of adapters which do not have access granted for 'bluefox'\n`;
        try {
            await createIssue('iobroker', 'iobroker.repositories', {title, body});
        } catch (e) {
            console.log(`error: Cannot create base issue "${title}"`);
            console.log(`       ${e}`);
        }
    }

    issues = await getGithub(`https://api.github.com/repos/ioBroker/ioBroker.repositories/issues?state=open&page=1&per_page=100`);
    issues = issues.filter(i => i.state === 'open' && i.title.includes(title));
    if (!issues.length) {
        console.log(`error: Could not create or locate base issue "${title}"`);
        return;
    }
    if (issues.length !== 1) {
        console.log(`warning: multiple issues match title "${title}"`);
//        for ( let ii=1; ii < issues.length; ii++) {
//
//        }
    }

    const issueId = issues[0].number;
    console.log(`updating issue ${issueId}`);

    // remove previous comment
    let oldList = [];
    let newList = [];
    try {
        let done = false;
        while (!done) {
            const gitComments = await getAllComments(issueId);
            let exists = gitComments.find(comment => comment.body.includes('## ioBroker adapter checker'));
            if (exists) {

                let body = exists.body.split('\n');
                body = body.filter(l => l.startsWith('- [ ]'));
                body.forEach(a => !oldList.includes(a) && oldList.push(a));

                console.log(`deleting comment ${exists.id} from issue ${issueId}`);
                await deleteComment(issueId, exists.id);
            } else {
                done = true;
            }
        }
    } catch (e) {
        console.error(`warning: cannot remove comment from issue ${issueId}:`);
        console.error(`         ${e}`);
    }

    newList = [];
    for (const old of oldList) {
        for (const adapter of adapters) {
            if (old.startsWith(`- [ ] [${adapter.adapter} (`)) {
                newList.push(old);
                adapter.old = true;
            }
        }
    }
    ;

    // add new comment
    const date = new Date();
    let body = `## ioBroker adapter checker\nStatus from ${date}\n\n`;
    body += `The following adapters do not have access granted for 'bluefox':\n`;

    if (newList.length) {
        body += '\nAdapter repositories already registered as faulty:\n';
        for (const n of newList) {
            body += `${n}\n`;
        }
    }

    body += '\nAdapter repositories detected as faulty at this run:\n';
    for (const adapter of adapters) {
        if (!adapter.old) {
            body += `- [ ] [${adapter.adapter} (${adapter.owner})](https://github.com/${adapter.owner}/ioBroker.${adapter.adapter}) since ${date.toLocaleString('de-DE').split(',')[0]}\n`;
        }
    }

    console.log(`adding new comment:`);
    console.log(`${body}`);

    try {
        await addComment(issueId, body);
    } catch (e) {
        console.error(`warning: cannot add comment to issue ${issueId}:`);
        console.log(`           ${e}`);
    }
}


async function doIt() {
    const latest = await getLatestRepo();
    const stable = await getStableRepo();
    const stats  = await getStats();
    const adapters = await mergeRepos(latest, stable);
    const result = await checkRepos(adapters);
//    const result = [
//	{'owner':'hugo', 'adapter':'tester'},
//        {'owner':'iobroker-community-adapters','adapter':'nsclient'}
//	];

    console.log (`\nThe following adapters should be checked:`);
    for (const adapter of result) {
        console.log (`    ${adapter.owner}/ioBroker.${adapter.adapter}`);
    }

    await updateSummaryIssue(result);

    for (const adapter of result) {
        await generateIssue(adapter);
    }
    return 'done';
}

doIt()
    .then(result => console.log(result))
    .catch(e => console.error(e));
